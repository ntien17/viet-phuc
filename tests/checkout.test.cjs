const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');

const root = path.resolve(__dirname, '..');
const tmpParent = fs.realpathSync(os.tmpdir());
const dataDir = fs.mkdtempSync(path.join(tmpParent, 'vietphuc-checkout-test-'));
let child;
let base;

const ADMIN_USER = 'qa_admin_gd3';
const ADMIN_PASS = 'QaGd3#2026!';

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function reqJson(method, url, value, headers = {}) {
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
  const env = {
    ...process.env,
    PORT: String(port),
    VIETPHUC_DATA_DIR: dataDir,
    VIETPHUC_TEST_MODE: '1',
    VIETPHUC_ADMIN_USER: ADMIN_USER,
    VIETPHUC_ADMIN_PASSWORD: ADMIN_PASS,
  };
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

(async () => {
  await start();
  try {
    // 1. Setup Customer & Admin & Product/Promo
    const reg1 = await reqJson('POST', '/api/customer/register', {
      name: 'Lê Hoàng Nam', email: 'nam@example.com', phone: '0901234567', password: 'Password123'
    });
    assert.equal(reg1.status, 201);
    const cusCookie = getCookie(reg1.headers, 'vp_customer_session');
    const cusH = { Cookie: cusCookie };

    const reg2 = await reqJson('POST', '/api/customer/register', {
      name: 'Khách Khác', email: 'other@example.com', phone: '0907654321', password: 'Password123'
    });
    assert.equal(reg2.status, 201);
    const otherH = { Cookie: getCookie(reg2.headers, 'vp_customer_session') };

    const admLogin = await reqJson('POST', '/api/admin/login', { username: ADMIN_USER, password: ADMIN_PASS });
    assert.equal(admLogin.status, 200);
    const admH = { Cookie: getCookie(admLogin.headers, 'vp_admin_session') };

    const pub = await reqJson('GET', '/api/public/bootstrap');
    const p1 = pub.body.products[0];
    const v1 = p1.variants[0];
    const initialStock = pub.body.stock[v1.sku];
    assert.ok(initialStock >= 5);

    let boot = await reqJson('GET', '/api/admin/bootstrap', undefined, admH);
    let rev = boot.body.revision;

    // Create promotions: valid, expired, future, inactive, single-use
    let r = await reqJson('POST', '/api/admin/promotions', {
      code: 'GD3SALE', name: 'Giảm 20% tối đa 200k', type: 'percent', value: 20, minOrder: 500000, maxDiscount: 200000, usageLimit: 10,
      startAt: '2025-01-01T00:00:00.000Z', endAt: '2027-12-31T23:59:59.000Z', revision: rev
    }, admH);
    assert.equal(r.status, 201);
    rev = r.body.revision;

    r = await reqJson('POST', '/api/admin/promotions', {
      code: 'EXPIRED1', type: 'fixed', value: 50000, minOrder: 0, usageLimit: 10,
      startAt: '2020-01-01T00:00:00.000Z', endAt: '2021-01-01T00:00:00.000Z', revision: rev
    }, admH);
    assert.equal(r.status, 201);
    rev = r.body.revision;

    r = await reqJson('POST', '/api/admin/promotions', {
      code: 'FUTURE1', type: 'fixed', value: 50000, minOrder: 0, usageLimit: 10,
      startAt: '2029-01-01T00:00:00.000Z', endAt: '2030-01-01T00:00:00.000Z', revision: rev
    }, admH);
    assert.equal(r.status, 201);
    rev = r.body.revision;

    // 2. Checkout validation & tampering protection
    assert.equal((await reqJson('POST', '/api/customer/orders', { items: [{ productId: p1.id, sku: v1.sku, qty: 1 }] })).status, 401);
    assert.equal((await reqJson('POST', '/api/customer/orders', { items: [], receiver: 'Nam', phone: '0901234567', address: 'HN', paymentMethod: 'COD' }, cusH)).status, 400);
    assert.equal((await reqJson('POST', '/api/customer/orders', { items: [{ productId: p1.id, sku: v1.sku, qty: 1 }], receiver: '', phone: '0901234567', address: 'HN', paymentMethod: 'COD' }, cusH)).status, 400);
    assert.equal((await reqJson('POST', '/api/customer/orders', { items: [{ productId: p1.id, sku: v1.sku, qty: 1 }], receiver: 'Nam', phone: '123', address: 'HN', paymentMethod: 'COD' }, cusH)).status, 400);
    assert.equal((await reqJson('POST', '/api/customer/orders', { items: [{ productId: p1.id, sku: 'VP-INVALID-SKU', qty: 1 }], receiver: 'Nam', phone: '0901234567', address: 'HN', paymentMethod: 'COD' }, cusH)).status, 404);
    assert.equal((await reqJson('POST', '/api/customer/orders', { items: [{ productId: p1.id, sku: v1.sku, qty: initialStock + 5 }], receiver: 'Nam', phone: '0901234567', address: 'HN', paymentMethod: 'COD' }, cusH)).status, 409);

    // Promo validation: multiple codes, expired, future, preview doesn't increment usedCount
    assert.equal((await reqJson('POST', '/api/customer/orders', {
      items: [{ productId: p1.id, sku: v1.sku, qty: 1 }], receiver: 'Nam', phone: '0901234567', address: 'HN', paymentMethod: 'COD', promotionCode: 'A,B'
    }, cusH)).status, 400);
    assert.equal((await reqJson('POST', '/api/customer/orders', {
      items: [{ productId: p1.id, sku: v1.sku, qty: 1 }], receiver: 'Nam', phone: '0901234567', address: 'HN', paymentMethod: 'COD', promotionCode: 'EXPIRED1'
    }, cusH)).status, 409);
    assert.equal((await reqJson('POST', '/api/customer/orders', {
      items: [{ productId: p1.id, sku: v1.sku, qty: 1 }], receiver: 'Nam', phone: '0901234567', address: 'HN', paymentMethod: 'COD', promotionCode: 'FUTURE1'
    }, cusH)).status, 409);

    const preview = await reqJson('POST', '/api/customer/checkout/preview', {
      items: [{ productId: p1.id, sku: v1.sku, qty: 2 }],
      shippingType: 'remote',
      province: 'Phú Quốc',
      paymentMethod: 'COD',
      promotionCode: 'GD3SALE',
    }, cusH);
    assert.equal(preview.status, 200);
    assert.equal(preview.body.shippingFee, 45000);
    assert.equal(preview.body.discountAmount, 200000);
    assert.equal(preview.body.total, p1.price * 2 - 200000 + 45000);

    // Verify preview did NOT increment usedCount
    boot = await reqJson('GET', '/api/admin/bootstrap', undefined, admH);
    assert.equal(boot.body.state.promotions.find(p => p.code === 'GD3SALE').usedCount, 0);
    console.log('PASS GĐ3 checkout validation, promo rules, and server-side preview');

    // 3. Create COD order with client price/fee tampering + idempotencyKey
    const idem = 'idem_test_1';
    const orderCodRes = await reqJson('POST', '/api/customer/orders', {
      items: [{ productId: p1.id, sku: v1.sku, qty: 2, unitPrice: 1 }],
      subtotal: 2,
      shippingFee: 0,
      discountAmount: 9999999,
      total: 1,
      receiver: 'Lê Hoàng Nam',
      phone: '0901234567',
      province: 'TP.HCM',
      address: '10 Nguyễn Huệ',
      shippingType: 'standard',
      paymentMethod: 'COD',
      promotionCode: 'GD3SALE',
      idempotencyKey: idem,
    }, cusH);
    assert.equal(orderCodRes.status, 201);
    assert.equal(orderCodRes.body.duplicate, false);
    const codOrder = orderCodRes.body.order;
    assert.equal(codOrder.subtotal, p1.price * 2);
    assert.equal(codOrder.discountAmount, 200000);
    assert.equal(codOrder.shippingFee, 30000);
    assert.equal(codOrder.total, p1.price * 2 - 200000 + 30000);
    assert.equal(codOrder.paymentStatus, 'unpaid');
    assert.equal(codOrder.inventoryStatus, 'reserved');

    // Duplicate submit with same idempotencyKey -> 200 duplicate: true, stock only deducted once
    const dupRes = await reqJson('POST', '/api/customer/orders', {
      items: [{ productId: p1.id, sku: v1.sku, qty: 2 }],
      receiver: 'Lê Hoàng Nam', phone: '0901234567', province: 'TP.HCM', address: '10 Nguyễn Huệ',
      paymentMethod: 'COD', idempotencyKey: idem,
    }, cusH);
    assert.equal(dupRes.status, 200);
    assert.equal(dupRes.body.duplicate, true);
    assert.equal(dupRes.body.order.id, codOrder.id);

    boot = await reqJson('GET', '/api/admin/bootstrap', undefined, admH);
    assert.equal(boot.body.state.stock[v1.sku], initialStock - 2);
    assert.equal(boot.body.state.promotions.find(p => p.code === 'GD3SALE').usedCount, 1);
    rev = boot.body.revision;

    // Cross-customer isolation
    assert.equal((await reqJson('GET', `/api/customer/orders/${codOrder.id}`, undefined, otherH)).status, 403);
    assert.equal((await reqJson('POST', `/api/customer/orders/${codOrder.id}/cancel`, {}, otherH)).status, 403);

    // Admin updates COD order -> Customer sees new status
    r = await reqJson('PATCH', `/api/admin/orders/${codOrder.id}/status`, { nextStatus: 'confirmed', revision: rev }, admH);
    assert.equal(r.status, 200);
    rev = r.body.revision;
    const cusViewOrder = await reqJson('GET', `/api/customer/orders/${codOrder.id}`, undefined, cusH);
    assert.equal(cusViewOrder.body.order.orderStatus, 'confirmed');
    console.log('PASS GĐ3 COD order creation, anti-tampering, idempotency, and Admin->Customer sync');

    const editUrl = `/api/customer/orders/${codOrder.id}/details`;
    const alternate = p1.variants.find(v => v.active && v.sku !== v1.sku && boot.body.state.stock[v.sku] >= 2);
    const editedAddress = '12 Nguyễn Huệ, TP.HCM';
    const edits = { address: editedAddress, skus: [alternate.sku], version: cusViewOrder.body.order.history.length };
    assert.equal((await reqJson('POST', editUrl, edits, otherH)).status, 404);
    assert.equal((await reqJson('POST', editUrl, {...edits, skus: ['missing-sku']}, cusH)).status, 409);
    const change = await reqJson('POST', editUrl, edits, cusH);
    assert.equal(change.status, 200, JSON.stringify(change.body));
    assert.equal(change.body.order.address, editedAddress);
    assert.equal(change.body.order.items[0].sku, alternate.sku);
    assert.equal(change.body.order.total, codOrder.total);
    assert.equal((await reqJson('POST', editUrl, edits, cusH)).status, 409);
    const changedState = (await reqJson('GET', '/api/admin/bootstrap', undefined, admH)).body.state;
    assert.equal(changedState.stock[v1.sku], initialStock);
    assert.equal(changedState.stock[alternate.sku], boot.body.state.stock[alternate.sku] - 2);
    assert.equal((await reqJson('POST', editUrl, {...edits, skus:[v1.sku], version:change.body.order.history.length}, cusH)).status, 200);
    const separate = (await reqJson('POST', '/api/customer/orders', {
      items:[{productId:p1.id, sku:v1.sku, qty:1}], receiver:'Khách thử', phone:'0901234567',
      province:'Hà Nội', address:'12 Tràng Tiền', paymentMethod:'COD'
    }, cusH)).body.order;
    assert.equal((await reqJson('POST', `/api/customer/orders/${separate.id}/details`, edits, cusH)).status, 409);
    const cancelUrl = `/api/customer/orders/${separate.id}/cancel`;
    assert.equal((await reqJson('POST', cancelUrl, {reason:'  '}, cusH)).status, 400);
    const canceled = await reqJson('POST', cancelUrl, {reason:'Tôi đã đặt nhầm mẫu'}, cusH);
    assert.equal(canceled.status, 200);
    assert.equal(canceled.body.order.history.at(-1).note, 'Tôi đã đặt nhầm mẫu');
    assert.equal((await reqJson('POST', cancelUrl, {reason:'Thử lại'}, cusH)).status, 409);

    // 4. Online simulated payment + 15-min hold + cancel & expire release stock once
    const onlineRes = await reqJson('POST', '/api/customer/orders', {
      items: [{ productId: p1.id, sku: v1.sku, qty: 1 }],
      receiver: 'Lê Hoàng Nam', phone: '0901234567', province: 'Hà Nội', address: '1 Tràng Tiền',
      paymentMethod: 'online',
    }, cusH);
    assert.equal(onlineRes.status, 201);
    const onlineOrder = onlineRes.body.order;
    assert.equal(onlineOrder.paymentStatus, 'pending');
    assert.equal(onlineOrder.transactions[0].isSimulated, true);
    assert.ok(onlineOrder.holdExpiresAt);

    // Fail then retry success (no double stock deduction)
    r = await reqJson('POST', `/api/customer/orders/${onlineOrder.id}/pay-simulate`, { action: 'fail' }, cusH);
    assert.equal(r.status, 200);
    assert.equal(r.body.order.paymentStatus, 'failed');

    r = await reqJson('POST', `/api/customer/orders/${onlineOrder.id}/pay-simulate`, { action: 'success' }, cusH);
    assert.equal(r.status, 200);
    assert.equal(r.body.order.paymentStatus, 'paid');
    // Duplicate success blocked
    assert.equal((await reqJson('POST', `/api/customer/orders/${onlineOrder.id}/pay-simulate`, { action: 'success' }, cusH)).status, 409);

    boot = await reqJson('GET', '/api/admin/bootstrap', undefined, admH);
    assert.equal(boot.body.state.stock[v1.sku], initialStock - 3);

    // Expire online order releases stock once
    const onlineExpRes = await reqJson('POST', '/api/customer/orders', {
      items: [{ productId: p1.id, sku: v1.sku, qty: 1 }],
      receiver: 'Lê Hoàng Nam', phone: '0901234567', province: 'Hà Nội', address: '1 Tràng Tiền',
      paymentMethod: 'online',
    }, cusH);
    assert.equal(onlineExpRes.status, 201);
    const expOrder = onlineExpRes.body.order;
    r = await reqJson('POST', `/api/customer/orders/${expOrder.id}/pay-simulate`, { action: 'expire' }, cusH);
    assert.equal(r.status, 200);
    assert.equal(r.body.expired, true);
    assert.equal(r.body.order.orderStatus, 'cancelled');
    assert.equal(r.body.order.inventoryStatus, 'released');

    boot = await reqJson('GET', '/api/admin/bootstrap', undefined, admH);
    assert.equal(boot.body.state.stock[v1.sku], initialStock - 3);
    console.log('PASS GĐ3 simulated online payment, retry, hold expiration, and single stock release');

    // 5. Automatic Hold Sweeper tests (all 10 scenarios)
    const { createHoldSweeper } = require('../lib/customer-order-handlers');

    // Create 1 unexpired online order + 1 expired online order (via DB backdate before restart)
    const freshOnlineRes = await reqJson('POST', '/api/customer/orders', {
      items: [{ productId: p1.id, sku: v1.sku, qty: 1 }],
      receiver: 'Nam Fresh', phone: '0901234567', province: 'Hà Nội', address: '2 Tràng Tiền',
      paymentMethod: 'online',
    }, cusH);
    assert.equal(freshOnlineRes.status, 201);
    const freshOnlineId = freshOnlineRes.body.order.id;

    const expiredOnlineRes = await reqJson('POST', '/api/customer/orders', {
      items: [{ productId: p1.id, sku: v1.sku, qty: 2 }],
      receiver: 'Nam Expired', phone: '0901234567', province: 'Hà Nội', address: '3 Tràng Tiền',
      paymentMethod: 'online',
    }, cusH);
    assert.equal(expiredOnlineRes.status, 201);
    const expiredOnlineId = expiredOnlineRes.body.order.id;

    await stop();
    const dbPath = path.join(dataDir, 'database.json');
    const diskBefore = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    const pastIso = new Date(Date.now() - 60000).toISOString();
    diskBefore.state.orders.find(o => o.id === expiredOnlineId).holdExpiresAt = pastIso;
    // Also backdate paid onlineOrder's holdExpiresAt to verify paid orders are NEVER released
    diskBefore.state.orders.find(o => o.id === onlineOrder.id).holdExpiresAt = pastIso;
    fs.writeFileSync(dbPath, JSON.stringify(diskBefore, null, 2), 'utf8');

    // Restart server -> startup sweep must automatically release expiredOnlineId only
    await start();
    await delay(250);
    await stop();

    const diskAfter = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    const expAfter = diskAfter.state.orders.find(o => o.id === expiredOnlineId);
    const freshAfter = diskAfter.state.orders.find(o => o.id === freshOnlineId);
    const paidAfter = diskAfter.state.orders.find(o => o.id === onlineOrder.id);
    const codAfter = diskAfter.state.orders.find(o => o.id === codOrder.id);
    const cancelledAfter = diskAfter.state.orders.find(o => o.id === expOrder.id);

    assert.equal(expAfter.orderStatus, 'cancelled');
    assert.equal(expAfter.paymentStatus, 'failed');
    assert.equal(expAfter.inventoryStatus, 'released');
    assert.equal(freshAfter.orderStatus, 'pending');
    assert.equal(freshAfter.inventoryStatus, 'reserved');
    assert.equal(paidAfter.paymentStatus, 'paid');
    assert.equal(paidAfter.inventoryStatus, 'reserved');
    assert.equal(codAfter.orderStatus, 'confirmed');
    assert.equal(cancelledAfter.inventoryStatus, 'released');

    // Stock: initialStock - 2 (COD) - 1 (paid online) - 1 (fresh online) = initialStock - 4
    assert.equal(diskAfter.state.stock[v1.sku], initialStock - 4);
    const expLogs = diskAfter.state.inventoryLogs.filter(l => l.refId === expiredOnlineId && l.reason === 'payment_expired');
    assert.equal(expLogs.length, 1);
    assert.equal(expLogs[0].delta, 2);

    // Restart a second time -> idempotent (no double restock, revision unchanged)
    const revBeforeSecondStart = diskAfter.revision;
    await start();
    await delay(200);
    await stop();
    const diskAfterSecond = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    assert.equal(diskAfterSecond.state.stock[v1.sku], initialStock - 4);
    assert.equal(diskAfterSecond.revision, revBeforeSecondStart);

    // Unit/concurrency check on createHoldSweeper: two concurrent sweeps + error isolation
    let mockRevision = 0;
    const mockDb = {
      revision: 0,
      state: {
        stock: { 'VP-P1-DO_TRAM-M': 5 },
        inventoryLogs: [],
        orders: [
          {
            id: 'ERR_ORD', paymentMethod: 'online', orderStatus: 'pending', paymentStatus: 'pending',
            inventoryStatus: 'reserved', holdExpiresAt: pastIso, total: 100, items: [{ productId: 'p1', sku: 'VP-P1-DO_TRAM-M', qty: 1 }],
            transactions: [], history: [],
          },
          {
            id: 'GOOD_EXP_ORD', paymentMethod: 'online', orderStatus: 'pending', paymentStatus: 'pending',
            inventoryStatus: 'reserved', holdExpiresAt: pastIso, total: 100, items: [{ productId: 'p1', sku: 'VP-P1-DO_TRAM-M', qty: 2 }],
            transactions: [], history: [],
          },
        ],
      },
    };
    let txQueue = Promise.resolve();
    const mockRunTx = (_, fn) => {
      const p = txQueue.then(async () => {
        const draft = structuredClone(mockDb.state);
        const result = fn(draft);
        if (draft.orders.find(o => o.id === 'ERR_ORD' && o.orderStatus === 'cancelled')) {
          throw new Error('Simulated per-order failure');
        }
        mockDb.state = draft;
        mockDb.revision = ++mockRevision;
        return { revision: mockRevision, state: draft, result };
      });
      txQueue = p.catch(() => {});
      return p;
    };
    const mockAdjust = (d, sku, pid, delta, reason, refId, actor) => {
      d.stock[sku] = (d.stock[sku] || 0) + delta;
      d.inventoryLogs.push({ sku, productId: pid, delta, reason, refId, actor });
    };
    const sweeper = createHoldSweeper({ getDatabase: () => mockDb, runTransaction: mockRunTx, adjustStockWithLog: mockAdjust });
    const [s1, s2] = await Promise.all([sweeper(), sweeper()]);
    assert.equal(s1.released + s2.released, 1);
    assert.equal(s1.failed + s2.failed, 1);
    assert.equal(mockDb.state.stock['VP-P1-DO_TRAM-M'], 7); // +2 only once from GOOD_EXP_ORD
    assert.equal(mockDb.state.orders.find(o => o.id === 'GOOD_EXP_ORD').inventoryStatus, 'released');
    console.log('PASS GĐ3 automatic hold sweeper (restart, idempotency, concurrency, error isolation, JSON integrity)');
  } finally {
    await stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})();
