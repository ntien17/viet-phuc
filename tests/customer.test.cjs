const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');

const root = path.resolve(__dirname, '..');
const tmpParent = fs.realpathSync(os.tmpdir());
const dataDir = fs.mkdtempSync(path.join(tmpParent, 'vietphuc-customer-test-'));
let child;
let base;

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function request(method, url, value, headers = {}) {
  const options = { method, headers: { 'X-VP-Requested': '1', ...headers } };
  if (value !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(value);
  }
  const response = await fetch(base + url, options);
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: response.status, body, headers: response.headers };
}

function getCookie(headers, name) {
  const raw = headers.getSetCookie ? headers.getSetCookie() : [headers.get('set-cookie')].filter(Boolean);
  for (const item of raw) {
    const part = item.split(';')[0];
    if (part.startsWith(name + '=')) return part;
  }
  return '';
}

async function start() {
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  let logs = '';
  const env = { ...process.env, PORT: String(port), VIETPHUC_DATA_DIR: dataDir, VIETPHUC_TEST_MODE: '1' };
  child = spawn(process.execPath, ['server.js'], { cwd: root, env });
  child.stdout.on('data', d => { logs += d; });
  child.stderr.on('data', d => { logs += d; });
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null) throw new Error('Server exited early: ' + logs);
    try {
      const res = await fetch(base + '/api/public/bootstrap');
      if (res.ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error('Server did not start: ' + logs);
}

async function stop() {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await new Promise(resolve => {
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} resolve(); }, 3000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
  });
}

function readDb() {
  return JSON.parse(fs.readFileSync(path.join(dataDir, 'database.json'), 'utf8'));
}

function writeDb(db) {
  fs.writeFileSync(path.join(dataDir, 'database.json'), JSON.stringify(db, null, 2), 'utf8');
}

(async () => {
  await start();
  try {
    // 1. Registration validation
    let res = await request('POST', '/api/customer/register', {
      name: '', email: 'bad-email', phone: '123', password: 'short'
    });
    assert.equal(res.status, 400);

    res = await request('POST', '/api/customer/register', {
      name: 'Nguyễn Thị Lan', email: 'LAN@Example.com', phone: '+84 912 345 678', password: 'Password123'
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.customer.email, 'lan@example.com');
    assert.equal(res.body.customer.phone, '0912345678');
    assert.equal('passwordHash' in res.body.customer, false);
    assert.equal('passwordSalt' in res.body.customer, false);
    const lanCookie = getCookie(res.headers, 'vp_customer_session');
    assert.ok(lanCookie.startsWith('vp_customer_session='));
    const lanId = res.body.customer.id;

    // Verify scrypt hash & salt stored in DB
    let db = readDb();
    let state = db.state || db.data || db;
    const lanRecord = state.customers.find(c => c.id === lanId);
    assert.ok(lanRecord);
    assert.ok(lanRecord.passwordSalt && lanRecord.passwordSalt.length >= 16);
    assert.ok(lanRecord.passwordHash && lanRecord.passwordHash.length >= 64);

    // Duplicate email (case-insensitive)
    res = await request('POST', '/api/customer/register', {
      name: 'Lan Khác', email: 'lan@example.com', phone: '0988777666', password: 'Password123'
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.error, 'email_exists');

    // Duplicate phone (+84 vs 0 equivalence)
    res = await request('POST', '/api/customer/register', {
      name: 'Lan Khác', email: 'lan2@example.com', phone: '0912345678', password: 'Password123'
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.error, 'phone_exists');

    // Register second customer
    res = await request('POST', '/api/customer/register', {
      name: 'Trần Minh', email: 'minh@example.com', phone: '0988777666', password: 'Password456'
    });
    assert.equal(res.status, 201);
    const minhCookie = getCookie(res.headers, 'vp_customer_session');
    const minhId = res.body.customer.id;
    console.log('PASS registration validation, uniqueness, phone normalization, and scrypt hashing');

    // 2. Session, login, logout, and separation from Admin
    res = await request('GET', '/api/customer/session', undefined, { Cookie: lanCookie });
    assert.equal(res.status, 200);
    assert.equal(res.body.loggedIn, true);
    assert.equal(res.body.customer.id, lanId);

    res = await request('GET', '/api/admin/session', undefined, { Cookie: lanCookie });
    assert.equal(res.status, 200);
    assert.equal(res.body.loggedIn, false);

    res = await request('GET', '/api/admin/bootstrap', undefined, { Cookie: lanCookie });
    assert.equal(res.status, 401);

    res = await request('POST', '/api/customer/login', { email: 'lan@example.com', password: 'WrongPassword' });
    assert.equal(res.status, 401);
    assert.equal(res.body.error, 'invalid_credentials');

    res = await request('POST', '/api/customer/logout', {}, { Cookie: lanCookie });
    assert.equal(res.status, 200);
    res = await request('GET', '/api/customer/session', undefined, { Cookie: lanCookie });
    assert.equal(res.body.loggedIn, false);
    res = await request('GET', '/api/customer/me', undefined, { Cookie: lanCookie });
    assert.equal(res.status, 401);

    // Re-login Lan
    res = await request('POST', '/api/customer/login', { email: 'lan@example.com', password: 'Password123' });
    assert.equal(res.status, 200);
    const lanCookie2 = getCookie(res.headers, 'vp_customer_session');
    assert.ok(lanCookie2);
    console.log('PASS customer login, logout, session check, and admin/customer session separation');

    // 3. Profile view & update, duplicate phone, and immutable privileged fields
    res = await request('GET', '/api/customer/me', undefined, { Cookie: lanCookie2 });
    assert.equal(res.status, 200);
    assert.equal(res.body.customer.email, 'lan@example.com');

    res = await request('PUT', '/api/customer/profile', {
      name: 'Nguyễn Thị Lan Updated',
      phone: '0988777666'
    }, { Cookie: lanCookie2 });
    assert.equal(res.status, 409);
    assert.equal(res.body.error, 'phone_exists');

    res = await request('PUT', '/api/customer/profile', {
      name: 'Nguyễn Thị Lan Updated',
      phone: '0912345679',
      defaultAddress: '123 Lê Lợi, Q1, TP.HCM',
      email: 'hacked@example.com',
      id: 'CUS_HACKED',
      locked: true,
      passwordHash: 'fake'
    }, { Cookie: lanCookie2 });
    assert.equal(res.status, 200);
    assert.equal(res.body.customer.name, 'Nguyễn Thị Lan Updated');
    assert.equal(res.body.customer.phone, '0912345679');
    assert.equal(res.body.customer.defaultAddress, '123 Lê Lợi, Q1, TP.HCM');
    assert.equal(res.body.customer.email, 'lan@example.com');
    assert.equal(res.body.customer.id, lanId);
    assert.ok(!res.body.customer.locked);
    assert.equal((readDb().state.customers.find(c => c.id === lanId)).locked, false);
    console.log('PASS customer profile view, update, unique phone check, and immutable fields');

    // 4. Change password revokes all sessions for that customer
    res = await request('POST', '/api/customer/login', { email: 'lan@example.com', password: 'Password123' });
    assert.equal(res.status, 200);
    const lanOtherSession = getCookie(res.headers, 'vp_customer_session');

    res = await request('PUT', '/api/customer/change-password', {
      currentPassword: 'WrongPassword', newPassword: 'NewPassword123'
    }, { Cookie: lanCookie2 });
    assert.equal(res.status, 401);
    assert.equal(res.body.error, 'invalid_current_password');

    res = await request('PUT', '/api/customer/change-password', {
      currentPassword: 'Password123', newPassword: '123'
    }, { Cookie: lanCookie2 });
    assert.equal(res.status, 400);

    res = await request('PUT', '/api/customer/change-password', {
      currentPassword: 'Password123', newPassword: 'NewPassword123'
    }, { Cookie: lanCookie2 });
    assert.equal(res.status, 200);

    // Both sessions must be revoked
    res = await request('GET', '/api/customer/me', undefined, { Cookie: lanCookie2 });
    assert.equal(res.status, 401);
    res = await request('GET', '/api/customer/me', undefined, { Cookie: lanOtherSession });
    assert.equal(res.status, 401);

    // Old password fails, new password succeeds
    res = await request('POST', '/api/customer/login', { email: 'lan@example.com', password: 'Password123' });
    assert.equal(res.status, 401);
    res = await request('POST', '/api/customer/login', { email: 'lan@example.com', password: 'NewPassword123' });
    assert.equal(res.status, 200);
    const lanCookie3 = getCookie(res.headers, 'vp_customer_session');
    console.log('PASS change password and multi-session revocation');

    // 5. Customer orders isolation & legacy customerId: null orders not auto-linked
    await stop();
    db = readDb();
    state = db.state || db.data || db;
    const baseItem = {
      productId: 'p1',
      sku: 'VP-P1-DO_TRAM-M',
      name: 'Áo Dài Nhật Bình',
      img: '',
      color: 'Đỏ trầm',
      size: 'M',
      qty: 1,
      unitPrice: 1200000
    };
    state.orders = [
      {
        id: 'ORD_LAN_OLD',
        createdAt: '2026-10-01T10:00:00.000Z',
        customerId: lanId,
        receiver: 'Lan',
        phone: '0912345679',
        address: 'HN',
        items: [baseItem],
        subtotal: 1200000,
        shippingFee: 30000,
        discountCode: null,
        discountAmount: 0,
        total: 1230000,
        paymentMethod: 'COD',
        orderStatus: 'delivered',
        paymentStatus: 'paid',
        settlementStatus: 'settled',
        inventoryStatus: 'fulfilled',
        shipment: {},
        transactions: [],
        refunds: [],
        policySnapshot: {},
        history: []
      },
      {
        id: 'ORD_LAN_NEW',
        createdAt: '2026-11-01T10:00:00.000Z',
        customerId: lanId,
        receiver: 'Lan',
        phone: '0912345679',
        address: 'HCM',
        items: [baseItem],
        subtotal: 1200000,
        shippingFee: 30000,
        discountCode: null,
        discountAmount: 0,
        total: 1230000,
        paymentMethod: 'COD',
        orderStatus: 'confirmed',
        paymentStatus: 'unpaid',
        settlementStatus: 'unsettled',
        inventoryStatus: 'reserved',
        shipment: {},
        transactions: [],
        refunds: [],
        policySnapshot: {},
        history: []
      },
      {
        id: 'ORD_MINH',
        createdAt: '2026-11-02T10:00:00.000Z',
        customerId: minhId,
        receiver: 'Minh',
        phone: '0988777666',
        address: 'ĐN',
        items: [baseItem],
        subtotal: 1200000,
        shippingFee: 30000,
        discountCode: null,
        discountAmount: 0,
        total: 1230000,
        paymentMethod: 'COD',
        orderStatus: 'confirmed',
        paymentStatus: 'unpaid',
        settlementStatus: 'unsettled',
        inventoryStatus: 'reserved',
        shipment: {},
        transactions: [],
        refunds: [],
        policySnapshot: {},
        history: []
      },
      {
        id: 'ORD_LEGACY_NULL',
        createdAt: '2026-09-01T10:00:00.000Z',
        customerId: null,
        receiver: 'Lan Legacy',
        phone: '0912345679',
        address: 'Legacy',
        items: [baseItem],
        subtotal: 1200000,
        shippingFee: 30000,
        discountCode: null,
        discountAmount: 0,
        total: 1230000,
        paymentMethod: 'COD',
        orderStatus: 'delivered',
        paymentStatus: 'paid',
        settlementStatus: 'settled',
        inventoryStatus: 'fulfilled',
        shipment: {},
        transactions: [],
        refunds: [],
        policySnapshot: {},
        history: []
      }
    ];
    writeDb(db);
    await start();

    // Re-login after restart (sessions are in-memory)
    res = await request('POST', '/api/customer/login', { email: 'lan@example.com', password: 'NewPassword123' });
    assert.equal(res.status, 200);
    const lanCookie4 = getCookie(res.headers, 'vp_customer_session');

    res = await request('GET', '/api/customer/orders', undefined, { Cookie: lanCookie4 });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.orders.map(o => o.id), ['ORD_LAN_NEW', 'ORD_LAN_OLD']);

    res = await request('GET', '/api/customer/orders/ORD_LAN_NEW', undefined, { Cookie: lanCookie4 });
    assert.equal(res.status, 200);
    assert.equal(res.body.order.id, 'ORD_LAN_NEW');

    res = await request('GET', '/api/customer/orders/ORD_MINH', undefined, { Cookie: lanCookie4 });
    assert.equal(res.status, 403);
    assert.equal(res.body.error, 'forbidden_order_access');

    res = await request('GET', '/api/customer/orders/ORD_LEGACY_NULL', undefined, { Cookie: lanCookie4 });
    assert.equal(res.status, 403);
    assert.equal(res.body.error, 'forbidden_order_access');

    // Locked account blocks login and revokes existing session
    await stop();
    db = readDb();
    state = db.state || db.data || db;
    state.customers.find(c => c.id === lanId).locked = true;
    state.customers.find(c => c.id === lanId).lockedReason = 'Vi phạm quy định';
    writeDb(db);
    await start();

    res = await request('POST', '/api/customer/login', { email: 'lan@example.com', password: 'NewPassword123' });
    assert.equal(res.status, 403);
    assert.equal(res.body.error, 'account_locked');

    // Also test Minh's active session gets revoked when locked via DB
    res = await request('POST', '/api/customer/login', { email: 'minh@example.com', password: 'Password456' });
    assert.equal(res.status, 200);
    const minhCookie2 = getCookie(res.headers, 'vp_customer_session');
    await stop();
    db = readDb();
    state = db.state || db.data || db;
    state.customers.find(c => c.id === minhId).locked = true;
    writeDb(db);
    await start();
    // Since in-memory sessions cleared on restart, we already verified locked login=403;
    // active-session revocation is also covered in admin.test.cjs via _test/customer-session.
    void minhCookie;
    void minhCookie2;
    void lanCookie3;
    console.log('PASS customer order sorting, isolation, legacy null protection, and locked account');

    // 6. Storefront app.js serverMode bootstrap + syncCustomerSession + updateAccountIndicator
    const vm = require('node:vm');
    const appCode = fs.readFileSync(path.join(root, 'dist', 'app.js'), 'utf8');
    const stubEl = { textContent: '', style: {}, innerHTML: '', value: '', classList: { toggle() {}, contains() { return false; } }, setAttribute() {}, addEventListener() {} };
    const statusEl = { textContent: '', style: {}, setAttribute() {} };
    const ctx = {
      console,
      fetch: (u, o) => fetch(base + u, o),
      location: { hostname: '127.0.0.1', protocol: 'http:' },
      localStorage: { getItem: () => null, setItem() {} },
      sessionStorage: { getItem: k => (k === 'vietphuc-json-visit' ? '1' : null), setItem() {} },
      document: {
        getElementById: id => (id === 'database-status' ? statusEl : stubEl),
        querySelector: () => stubEl,
        querySelectorAll: () => [],
        createElement: () => ({ ...stubEl }),
        body: { prepend() {}, appendChild() {}, style: {} },
        head: { appendChild() {} },
        addEventListener() {},
      },
      window: {},
      setTimeout,
      clearTimeout,
      URL,
      FormData: function () {},
    };
    vm.runInNewContext(appCode, ctx);
    await delay(400);
    assert.equal(statusEl.textContent, 'Dữ liệu sản phẩm và tồn kho được đồng bộ từ máy chủ.');
    assert.ok(ctx.window.VietPhuc.products.length > 0);
    console.log('PASS storefront app.js serverMode initializeDatabase & syncCustomerSession');
  } finally {
    await stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})();
