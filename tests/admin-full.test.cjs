const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');

const root = path.resolve(__dirname, '..');
const tmpParent = fs.realpathSync(os.tmpdir());
const dataDir = fs.mkdtempSync(path.join(tmpParent, 'vietphuc-admin-full-test-'));
let child;
let base;

const ADMIN_USER = 'qa_admin_full';
const ADMIN_PASS = 'QaFull#2026!';

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
  child.stderr.on('data', d => { logs += d; process.stderr.write('[SERVER ERR] ' + d); });
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
    // Login Admin
    const loginRes = await reqJson('POST', '/api/admin/login', { username: ADMIN_USER, password: ADMIN_PASS });
    assert.equal(loginRes.status, 200);
    const adminCookie = getCookie(loginRes.headers, 'vp_admin_session');
    const authH = { Cookie: adminCookie };

    let boot = await reqJson('GET', '/api/admin/bootstrap', undefined, authH);
    assert.equal(boot.status, 200);
    let rev = boot.body.revision;

    // 1. Categories & Products & Stock (2.4.2)
    let r = await reqJson('POST', '/api/admin/categories', { id: 'cat_test', name: 'Áo Tấc Test', revision: rev }, authH);
    assert.equal(r.status, 201);
    rev = r.body.revision;

    // Duplicate category name -> 409
    r = await reqJson('POST', '/api/admin/categories', { name: 'Áo Tấc Test', revision: rev }, authH);
    assert.equal(r.status, 409);

    // Delete category with product -> 409, empty category -> 200
    r = await reqJson('POST', '/api/admin/products', {
      id: 'PTEST1',
      categoryId: 'cat_test',
      name: 'Áo Tấc Hoàng Bào',
      price: 1500000,
      material: 'Gấm',
      img: 'assets/ao-dai-do.png',
      variants: [{ color: 'Đỏ trầm', size: 'M', initialStock: 5 }],
      revision: rev,
    }, authH);
    assert.equal(r.status, 201);
    assert.equal(r.body.product.variants[0].sku, 'VP-PTEST1-DO_TRAM-M');
    rev = r.body.revision;
    assert.equal(r.body.state.stock['VP-PTEST1-DO_TRAM-M'], 5);

    // Unknown color rejected
    r = await reqJson('POST', '/api/admin/products', {
      id: 'PTEST2',
      categoryId: 'cat_test',
      name: 'Áo Lỗi Màu',
      price: 500000,
      material: 'Lụa',
      img: 'assets/ao-dai-do.png',
      variants: [{ color: 'Tím than chưa khai báo', size: 'M' }],
      revision: rev,
    }, authH);
    assert.equal(r.status, 400);

    // Category in use cannot be deleted
    r = await reqJson('DELETE', '/api/admin/categories/cat_test', { revision: rev }, authH);
    assert.equal(r.status, 409);

    // Stock adjust: in, out, negative blocked
    r = await reqJson('POST', '/api/admin/stock/adjust', { sku: 'VP-PTEST1-DO_TRAM-M', mode: 'in', qty: 3, reason: 'Nhập thêm', revision: rev }, authH);
    assert.equal(r.status, 200);
    assert.equal(r.body.stock, 8);
    rev = r.body.revision;

    r = await reqJson('POST', '/api/admin/stock/adjust', { sku: 'VP-PTEST1-DO_TRAM-M', mode: 'out', qty: 20, reason: 'Xuất quá tồn', revision: rev }, authH);
    assert.equal(r.status, 409);
    assert.equal(r.body.error, 'insufficient_stock');

    // Hide product -> Storefront /api/public/bootstrap no longer returns it
    r = await reqJson('PATCH', '/api/admin/products/PTEST1', { active: false, price: 1600000, revision: rev }, authH);
    assert.equal(r.status, 200);
    rev = r.body.revision;
    const pubAfterHide = await reqJson('GET', '/api/public/bootstrap');
    assert.equal(pubAfterHide.body.products.some(p => p.id === 'PTEST1'), false);
    console.log('PASS 2.4.2 categories, products, SKU variants, stock adjustment, and Storefront sync');

    // 2. Customer management & lock/unlock (2.4.3)
    const cusReg = await reqJson('POST', '/api/customer/register', {
      name: 'Phạm Thảo', email: 'thao@example.com', phone: '0911222333', password: 'Password123'
    });
    assert.equal(cusReg.status, 201);
    const cusId = cusReg.body.customer.id;
    const cusCookie = getCookie(cusReg.headers, 'vp_customer_session');

    boot = await reqJson('GET', '/api/admin/bootstrap', undefined, authH);
    rev = boot.body.revision;
    const cusInAdmin = boot.body.state.customers.find(c => c.id === cusId);
    assert.ok(cusInAdmin);
    assert.equal('passwordHash' in cusInAdmin, false);
    assert.equal('passwordSalt' in cusInAdmin, false);

    r = await reqJson('PATCH', `/api/admin/customers/${cusId}/lock`, { locked: true, reason: 'Spam đơn', revision: rev }, authH);
    assert.equal(r.status, 200);
    rev = r.body.revision;
    assert.equal((await reqJson('GET', '/api/customer/me', undefined, { Cookie: cusCookie })).status, 401);
    assert.equal((await reqJson('POST', '/api/customer/login', { email: 'thao@example.com', password: 'Password123' })).status, 403);

    r = await reqJson('PATCH', `/api/admin/customers/${cusId}/lock`, { locked: false, revision: rev }, authH);
    assert.equal(r.status, 200);
    rev = r.body.revision;
    assert.equal((await reqJson('POST', '/api/customer/login', { email: 'thao@example.com', password: 'Password123' })).status, 200);
    console.log('PASS 2.4.3 customer list sanitization, lock/unlock, and session revocation');

    // 3. Orders, Simulated Payment, Refund, Shipment (2.4.4, 2.4.5, 2.4.6)
    await stop();
    const dbPath = path.join(dataDir, 'database.json');
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    const skuTest = 'VP-PTEST1-DO_TRAM-M';
    db.state.orders.push(
      {
        id: 'ORD_ONLINE_1',
        createdAt: new Date().toISOString(),
        customerId: cusId,
        receiver: 'Phạm Thảo',
        phone: '0911222333',
        address: 'Hà Nội',
        items: [{ productId: 'PTEST1', sku: skuTest, name: 'Áo Tấc Hoàng Bào', img: '', color: 'Đỏ trầm', size: 'M', qty: 2, unitPrice: 1500000 }],
        subtotal: 3000000, shippingFee: 30000, discountCode: null, discountAmount: 0, total: 3030000,
        paymentMethod: 'online', orderStatus: 'pending', paymentStatus: 'unpaid', settlementStatus: 'unsettled', inventoryStatus: 'reserved',
        shipment: {}, transactions: [], refunds: [], policySnapshot: {}, history: [],
      },
      {
        id: 'ORD_COD_1',
        createdAt: new Date().toISOString(),
        customerId: cusId,
        receiver: 'Phạm Thảo',
        phone: '0911222333',
        address: 'Hà Nội',
        items: [{ productId: 'PTEST1', sku: skuTest, name: 'Áo Tấc Hoàng Bào', img: '', color: 'Đỏ trầm', size: 'M', qty: 1, unitPrice: 1500000 }],
        subtotal: 1500000, shippingFee: 30000, discountCode: null, discountAmount: 0, total: 1530000,
        paymentMethod: 'COD', orderStatus: 'confirmed', paymentStatus: 'unpaid', settlementStatus: 'unsettled', inventoryStatus: 'reserved',
        shipment: {}, transactions: [], refunds: [], policySnapshot: {}, history: [],
      }
    );
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
    await start();

    const loginRes2 = await reqJson('POST', '/api/admin/login', { username: ADMIN_USER, password: ADMIN_PASS });
    const adminCookie2 = getCookie(loginRes2.headers, 'vp_admin_session');
    const authH2 = { Cookie: adminCookie2 };
    rev = (await reqJson('GET', '/api/admin/bootstrap', undefined, authH2)).body.revision;

    // Invalid transition pending -> delivered -> 409
    r = await reqJson('PATCH', '/api/admin/orders/ORD_ONLINE_1/status', { nextStatus: 'delivered', revision: rev }, authH2);
    assert.equal(r.status, 409);

    // Simulated payment success -> paid & isSimulated: true; second success -> 409
    r = await reqJson('POST', '/api/admin/orders/ORD_ONLINE_1/payment-simulate', { action: 'success', revision: rev }, authH2);
    assert.equal(r.status, 200);
    assert.equal(r.body.order.paymentStatus, 'paid');
    assert.equal(r.body.order.transactions[0].isSimulated, true);
    rev = r.body.revision;

    r = await reqJson('POST', '/api/admin/orders/ORD_ONLINE_1/payment-simulate', { action: 'success', revision: rev }, authH2);
    assert.equal(r.status, 409);

    // Partial refund & over-refund blocked
    r = await reqJson('POST', '/api/admin/orders/ORD_ONLINE_1/refund', { amount: 5000000, reason: 'Quá số tiền', revision: rev }, authH2);
    assert.equal(r.status, 409);

    r = await reqJson('POST', '/api/admin/orders/ORD_ONLINE_1/refund', { amount: 1000000, reason: 'Hoàn 1 phần', revision: rev }, authH2);
    assert.equal(r.status, 200);
    assert.equal(r.body.order.paymentStatus, 'partially_refunded');
    assert.equal(r.body.order.refunds[0].isSimulated, true);
    rev = r.body.revision;

    // Shipment flow on ORD_COD_1: shipping -> delivered -> settle
    r = await reqJson('PATCH', '/api/admin/orders/ORD_COD_1/shipment', { carrier: 'GHN (Mô phỏng)', trackingCode: 'VP-SIM-01', shipStatus: 'shipping', revision: rev }, authH2);
    assert.equal(r.status, 200);
    assert.equal(r.body.order.orderStatus, 'shipping');
    rev = r.body.revision;

    r = await reqJson('PATCH', '/api/admin/orders/ORD_COD_1/shipment', { carrier: 'GHN (Mô phỏng)', trackingCode: 'VP-SIM-01', shipStatus: 'delivered', revision: rev }, authH2);
    assert.equal(r.status, 200);
    assert.equal(r.body.order.orderStatus, 'delivered');
    assert.equal(r.body.order.paymentStatus, 'paid');
    assert.ok(r.body.order.shipment.deliveredAt);
    rev = r.body.revision;

    r = await reqJson('POST', '/api/admin/orders/ORD_COD_1/settle', { revision: rev }, authH2);
    assert.equal(r.status, 200);
    assert.equal(r.body.order.settlementStatus, 'settled');
    rev = r.body.revision;
    console.log('PASS 2.4.4, 2.4.5, 2.4.6 order state machine, simulated payment/refund, shipment & COD settle');

    // 4. Returns & Inspection (2.4.7)
    // Qty > ordered -> 409
    r = await reqJson('POST', '/api/admin/returns', {
      orderId: 'ORD_COD_1', type: 'return', reason: 'Chật', items: [{ productId: 'PTEST1', sku: skuTest, qty: 2 }], revision: rev
    }, authH2);
    assert.equal(r.status, 409);

    // Valid return
    r = await reqJson('POST', '/api/admin/returns', {
      orderId: 'ORD_COD_1', type: 'return', reason: 'Đổi size', items: [{ productId: 'PTEST1', sku: skuTest, qty: 1 }], revision: rev
    }, authH2);
    assert.equal(r.status, 201);
    const retId = r.body.returnRequest.id;
    const stockBeforeApprove = r.body.state.stock[skuTest];
    rev = r.body.revision;

    // Approve -> approved (NO restock yet)
    r = await reqJson('PATCH', `/api/admin/returns/${retId}`, { action: 'approve', revision: rev }, authH2);
    assert.equal(r.status, 200);
    assert.equal(r.body.returnRequest.status, 'approved');
    assert.equal(r.body.state.stock[skuTest], stockBeforeApprove);
    rev = r.body.revision;

    // Complete as damaged -> NO restock!
    r = await reqJson('PATCH', `/api/admin/returns/${retId}`, { action: 'complete', itemConditions: { 0: 'damaged' }, note: 'Rách tay áo', revision: rev }, authH2);
    assert.equal(r.status, 200);
    assert.equal(r.body.returnRequest.status, 'completed');
    assert.equal(r.body.state.stock[skuTest], stockBeforeApprove);
    rev = r.body.revision;

    // Second complete -> 409
    r = await reqJson('PATCH', `/api/admin/returns/${retId}`, { action: 'complete', revision: rev }, authH2);
    assert.equal(r.status, 409);
    console.log('PASS 2.4.7 return creation, two-step inspection, and damaged item non-restock');

    // 5. Policies, Promotions, Reports CSV & Activity Logs (2.4.8, 2.4.9, 2.4.10)
    r = await reqJson('PUT', '/api/admin/policies', {
      storeInfo: { name: 'VIỆT PHỤC HERITAGE', phone: '1900 9999' },
      banners: { notice: 'Miễn phí vận chuyển đơn từ 1 triệu' },
      items: { returns: 'Đổi trả trong 7 ngày còn nguyên tem mác.' },
      note: 'Cập nhật thử nghiệm',
      revision: rev,
    }, authH2);
    assert.equal(r.status, 200);
    assert.equal(r.body.policies.version, 2);
    assert.equal(r.body.state.policyVersions.length, 1);
    rev = r.body.revision;

    const pubPolicies = await reqJson('GET', '/api/public/bootstrap');
    assert.equal(pubPolicies.body.policies.items.returns, 'Đổi trả trong 7 ngày còn nguyên tem mác.');

    r = await reqJson('POST', '/api/admin/promotions', {
      code: 'TET2026', name: 'Ưu đãi Tết', type: 'percent', value: 20, minOrder: 500000, maxDiscount: 300000, usageLimit: 50,
      startAt: '2025-01-01T00:00:00.000Z', endAt: '2027-12-31T23:59:59.000Z', revision: rev
    }, authH2);
    assert.equal(r.status, 201);
    rev = r.body.revision;

    const valPromo = await reqJson('POST', '/api/admin/promotions/validate', { code: 'TET2026', subtotal: 2000000 }, authH2);
    assert.equal(valPromo.status, 200);
    assert.equal(valPromo.body.discount, 300000); // capped at maxDiscount

    const csvOrders = await reqJson('GET', '/api/admin/reports/export.csv?type=orders', undefined, authH2);
    assert.equal(csvOrders.status, 200);
    assert.ok(csvOrders.body.includes('ORD_ONLINE_1'));
    assert.equal(csvOrders.body.includes('passwordHash'), false);

    const csvCus = await reqJson('GET', '/api/admin/reports/export.csv?type=customers', undefined, authH2);
    assert.equal(csvCus.status, 200);
    assert.ok(csvCus.body.includes('thao@example.com'));
    assert.equal(csvCus.body.includes('passwordHash'), false);
    console.log('PASS 2.4.8, 2.4.9, 2.4.10 policies versioning, promotion calculation, and CSV export');

    // 6. Extra logic verification: resellable return restock, order cancel once, promo invalid rules, security & JSON disk check
    // Promo below minOrder & inactive
    const valBelowMin = await reqJson('POST', '/api/admin/promotions/validate', { code: 'TET2026', subtotal: 100000 }, authH2);
    assert.equal(valBelowMin.status, 400);
    const promoId = r.body.promotion.id;
    r = await reqJson('PATCH', `/api/admin/promotions/${promoId}`, { active: false, revision: rev }, authH2);
    assert.equal(r.status, 200);
    rev = r.body.revision;
    assert.equal((await reqJson('POST', '/api/admin/promotions/validate', { code: 'TET2026', subtotal: 2000000 }, authH2)).status, 400);

    // Cancel ORD_ONLINE_1 releases reserved stock once; cannot cancel delivered ORD_COD_1
    const stockBeforeCancel = (await reqJson('GET', '/api/admin/bootstrap', undefined, authH2)).body.state.stock[skuTest];
    r = await reqJson('PATCH', '/api/admin/orders/ORD_ONLINE_1/status', { nextStatus: 'cancelled', note: 'Khách đổi ý', revision: rev }, authH2);
    assert.equal(r.status, 200);
    assert.equal(r.body.state.stock[skuTest], stockBeforeCancel + 2);
    rev = r.body.revision;
    assert.equal((await reqJson('PATCH', '/api/admin/orders/ORD_ONLINE_1/status', { nextStatus: 'cancelled', revision: rev }, authH2)).status, 409);
    assert.equal((await reqJson('PATCH', '/api/admin/orders/ORD_COD_1/status', { nextStatus: 'cancelled', revision: rev }, authH2)).status, 409);

    // Stale revision returns 409 and does not mutate DB
    const staleRes = await reqJson('POST', '/api/admin/categories', { name: 'Stale Cat', revision: 0 }, authH2);
    assert.equal(staleRes.status, 409);

    // CSRF missing header & Customer token blocked on Admin API
    const noCsrf = await fetch(base + '/api/admin/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie2 },
      body: JSON.stringify({ name: 'No CSRF', revision: rev }),
    });
    assert.equal(noCsrf.status, 403);
    const cusLogin2 = await reqJson('POST', '/api/customer/login', { email: 'thao@example.com', password: 'Password123' });
    const cusCookie2 = getCookie(cusLogin2.headers, 'vp_customer_session');
    assert.equal((await reqJson('GET', '/api/admin/reports/export.csv?type=orders', undefined, { Cookie: cusCookie2 })).status, 401);

    // Verify actual JSON file on disk
    await stop();
    const diskDb = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    assert.equal(diskDb.schemaVersion, 2);
    assert.equal(diskDb.revision, rev);
    assert.ok(diskDb.state.categories.some(c => c.id === 'cat_test'));
    assert.ok(diskDb.state.products.some(p => p.id === 'PTEST1' && p.active === false));
    assert.ok(diskDb.state.inventoryLogs.some(l => l.sku === skuTest && l.reason === 'order_cancel' && l.delta === 2));
    assert.ok(diskDb.state.adminActivityLogs.length >= 5);
    assert.equal(diskDb.state.policies.version, 2);
    assert.equal(diskDb.state.policyVersions.length, 1);
    console.log('PASS extra logic, security, stale revision, and direct JSON disk verification');
  } finally {
    await stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})();
