'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');

const root = path.resolve(__dirname, '..');
const dataDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'vietphuc-policy-test-'));
const ADMIN_USER = 'pol_qa_admin';
const ADMIN_PASS = 'PolQaSecret#2026!';

let child;
let base;

async function freePort() {
  const srv = net.createServer();
  await new Promise((resolve, reject) => srv.once('error', reject).listen(0, '127.0.0.1', resolve));
  const p = srv.address().port;
  await new Promise(resolve => srv.close(resolve));
  return p;
}

async function reqJson(method, url, body, cookie = '') {
  const headers = { 'X-VP-Requested': '1' };
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(base + url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json, setCookie: res.headers.get('set-cookie') || '' };
}

async function startServer() {
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  let logs = '';
  child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      VIETPHUC_DATA_DIR: dataDir,
      VIETPHUC_ADMIN_USER: ADMIN_USER,
      VIETPHUC_ADMIN_PASSWORD: ADMIN_PASS,
      VIETPHUC_TEST_MODE: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout.on('data', b => { logs += b; });
  child.stderr.on('data', b => { logs += b; });
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null) throw new Error('Server exited early: ' + logs);
    try {
      const r = await reqJson('GET', '/api/public/bootstrap');
      if (r.status === 200) return;
    } catch { /* wait */ }
    await delay(100);
  }
  throw new Error('Server start timeout: ' + logs);
}

(async () => {
  try {
    await startServer();

    // 1. Guest can read public policies with all 11 groups and no fake contact info
    let r = await reqJson('GET', '/api/public/bootstrap');
    assert.equal(r.status, 200);
    const items = r.body.policies.items;
    for (const k of ['pricing', 'purchase', 'payment', 'shipping', 'returns', 'warranty', 'privacy', 'complaints', 'rights', 'orderProcess', 'size']) {
      assert.ok(typeof items[k] === 'string' && items[k].length > 200, `Missing or too-short policy item: ${k}`);
    }
    assert.match(items.returns, /07 ngày/);
    assert.match(items.returns, /05 ngày làm việc/);
    assert.match(items.warranty, /30 ngày/);
    assert.match(items.complaints, /01 ngày làm việc/);
    for (const range of ['1–2 ngày', '2–3 ngày', '2–4 ngày', '4–7 ngày']) assert.ok(items.shipping.includes(range), `Missing shipping estimate: ${range}`);
    assert.match(items.size, /\| S \| 40–47 kg \|/);
    assert.match(items.size, /Cách chọn size[\s\S]*1\./);
    assert.match(items.payment, /mô phỏng[\s\S]*không phải giao dịch ngân hàng thật/i);
    assert.equal(r.body.policies.storeInfo.hotline, 'Chưa cấu hình');
    assert.equal(r.body.policies.storeInfo.email, 'Chưa cấu hình');
    console.log('PASS 1: Public bootstrap exposes all 11 full policies & honest unconfigured channels');

    // 2. Customer A places an order -> policySnapshot v1 recorded
    const c1 = await reqJson('POST', '/api/_test/customer-session', { customerId: 'cus_pol_a', name: 'Nguyen A', email: 'pola@example.com' });
    const c1Cookie = c1.setCookie.split(';')[0];
    const c2 = await reqJson('POST', '/api/_test/customer-session', { customerId: 'cus_pol_b', name: 'Tran B', email: 'polb@example.com' });
    const c2Cookie = c2.setCookie.split(';')[0];

    const ordRes = await reqJson('POST', '/api/customer/orders', {
      items: [{ productId: 'p1', sku: 'VP-P1-DO_TRAM-M', qty: 1 }],
      receiver: 'Nguyen A',
      phone: '0912345678',
      province: 'Đắk Lắk',
      address: '10 Lê Duẩn',
      shippingType: 'standard',
      paymentMethod: 'COD',
    }, c1Cookie);
    assert.equal(ordRes.status, 201);
    const orderId = ordRes.body.order.id;
    assert.equal(ordRes.body.order.policySnapshot.version, 1);
    assert.equal(ordRes.body.order.policySnapshot.returnWindowDays, 7);
    assert.equal(ordRes.body.order.policySnapshot.warrantyWindowDays, 30);

    // 3. Admin logs in, updates policies & toggles 'terms' visibility off
    const admLogin = await reqJson('POST', '/api/admin/login', { username: ADMIN_USER, password: ADMIN_PASS });
    assert.equal(admLogin.status, 200);
    const admCookie = admLogin.setCookie.split(';')[0];

    const newItems = { ...items, returns: 'Chính sách đổi trả v2 mới cập nhật.' };
    const updPol = await reqJson('PUT', '/api/admin/policies', {
      items: newItems,
      visibility: { ...r.body.policies.visibility, orderProcess: false },
      note: 'Cập nhật đổi trả & ẩn mục quản lý đơn hàng thử nghiệm',
    }, admCookie);
    assert.equal(updPol.status, 200);
    assert.equal(updPol.body.policies.version, 2);
    assert.equal(updPol.body.state.policyVersions.length, 1);

    // Storefront reflects v2 and hides 'orderProcess'
    const pub2 = await reqJson('GET', '/api/public/bootstrap');
    assert.equal(pub2.body.policies.version, 2);
    assert.equal(pub2.body.policies.items.returns, 'Chính sách đổi trả v2 mới cập nhật.');
    assert.equal(pub2.body.policies.items.orderProcess, undefined);

    // Old order still keeps v1 policySnapshot!
    const oldOrd = await reqJson('GET', `/api/customer/orders/${orderId}`, undefined, c1Cookie);
    assert.equal(oldOrd.body.order.policySnapshot.version, 1);
    assert.notEqual(oldOrd.body.order.policySnapshot.returns, 'Chính sách đổi trả v2 mới cập nhật.');
    console.log('PASS 2: Admin policy versioning, visibility toggle, and old order snapshot immutability');

    async function deliverOrder(id) {
      for (const nextStatus of ['confirmed', 'packing']) {
        const st = await reqJson('PATCH', `/api/admin/orders/${id}/status`, { nextStatus }, admCookie);
        assert.equal(st.status, 200);
      }
      for (const shipStatus of ['shipping', 'delivered']) {
        const sh = await reqJson('PATCH', `/api/admin/orders/${id}/shipment`, { carrier: 'GHN (Mô phỏng)', trackingCode: `VP-${id}`, shipStatus }, admCookie);
        assert.equal(sh.status, 200);
      }
    }

    // 4. Advance order to delivered, then test return/support rules
    await deliverOrder(orderId);

    // Customer B cannot submit return on Customer A's order (403)
    const crossRet = await reqJson('POST', '/api/customer/returns', {
      orderId,
      type: 'exchange',
      reasonCategory: 'customer_preference',
      reason: 'Đổi size',
      items: [{ productId: 'p1', sku: 'VP-P1-DO_TRAM-M', qty: 1 }],
    }, c2Cookie);
    assert.equal(crossRet.status, 403);

    // Customer A submits within 7 days -> succeeds with shippingFeeBearer = 'customer'
    const okRet = await reqJson('POST', '/api/customer/returns', {
      orderId,
      type: 'exchange',
      reasonCategory: 'customer_preference',
      reason: 'Đổi từ M sang L',
      items: [{ productId: 'p1', sku: 'VP-P1-DO_TRAM-M', qty: 1 }],
    }, c1Cookie);
    assert.equal(okRet.status, 201);
    assert.equal(okRet.body.returnRequest.shippingFeeBearer, 'customer');

    // Customer A submits support ticket & Admin replies
    const tktRes = await reqJson('POST', '/api/customer/support-tickets', {
      orderId,
      category: 'order',
      subject: 'Hỏi tiến độ đổi size',
      message: 'Nhờ shop hỗ trợ kiểm tra yêu cầu đổi size.',
    }, c1Cookie);
    assert.equal(tktRes.status, 201);
    const ticketId = tktRes.body.ticket.id;

    // Customer B cannot create ticket on Customer A's order
    const crossTkt = await reqJson('POST', '/api/customer/support-tickets', {
      orderId,
      category: 'order',
      subject: 'Test',
      message: 'Test',
    }, c2Cookie);
    assert.equal(crossTkt.status, 403);

    const admReply = await reqJson('PATCH', `/api/admin/support-tickets/${ticketId}`, {
      status: 'resolved',
      adminReply: 'Đã tiếp nhận và xử lý đổi size cho bạn.',
    }, admCookie);
    assert.equal(admReply.status, 200);
    assert.equal(admReply.body.ticket.status, 'resolved');
    console.log('PASS 3: Customer returns, cross-customer isolation (403), and support ticket workflow');

    // 5. Test 7-day expired customer_preference vs 30-day store_defect on a delivered order aged 10 days
    const ord2 = await reqJson('POST', '/api/customer/orders', {
      items: [{ productId: 'p2', sku: 'VP-P2-TRANG_NGA-S', qty: 1 }],
      receiver: 'Nguyen A',
      phone: '0912345678',
      province: 'Hà Nội',
      address: '20 Phố Huế',
      shippingType: 'standard',
      paymentMethod: 'COD',
    }, c1Cookie);
    const oid2 = ord2.body.order.id;
    await deliverOrder(oid2);
    // Stop server briefly, backdate deliveredAt by 10 days in temp database, restart server
    child.kill('SIGTERM');
    await delay(300);
    const dbPath = path.join(dataDir, 'database.json');
    const dbJson = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    const o2InDb = dbJson.state.orders.find(x => x.id === oid2);
    o2InDb.shipment.deliveredAt = new Date(Date.now() - 10 * 86400000).toISOString();
    fs.writeFileSync(dbPath, JSON.stringify(dbJson, null, 2) + '\n');
    await startServer();

    const afterRestart = await reqJson('GET', '/api/public/bootstrap');
    assert.equal(afterRestart.status, 200);
    assert.match(afterRestart.body.policies.items.size, /\| S \| 40–47 kg \|/);
    assert.match(afterRestart.body.policies.items.warranty, /30 ngày/);

    const c1Re = await reqJson('POST', '/api/_test/customer-session', { customerId: 'cus_pol_a', name: 'Nguyen A', email: 'pola@example.com' });
    const c1CookieRe = c1Re.setCookie.split(';')[0];

    // Customer preference after 10 days (> 7 days) must be rejected
    const expPref = await reqJson('POST', '/api/customer/returns', {
      orderId: oid2,
      type: 'exchange',
      reasonCategory: 'customer_preference',
      reason: 'Đổi màu khác',
      items: [{ productId: 'p2', sku: 'VP-P2-TRANG_NGA-S', qty: 1 }],
    }, c1CookieRe);
    assert.equal(expPref.status, 409);
    assert.equal(expPref.body.error, 'return_window_expired');

    // Store defect after 10 days (<= 30 days) must NOT be rejected by 7-day preference limit!
    const okDefect = await reqJson('POST', '/api/customer/returns', {
      orderId: oid2,
      type: 'return',
      reasonCategory: 'store_defect',
      reason: 'Sản phẩm bị rách đường may từ trước khi nhận',
      images: ['https://example.com/evidence.jpg'],
      items: [{ productId: 'p2', sku: 'VP-P2-TRANG_NGA-S', qty: 1 }],
    }, c1CookieRe);
    assert.equal(okDefect.status, 201);
    assert.equal(okDefect.body.returnRequest.shippingFeeBearer, 'store');
    console.log('PASS 4: 7-day customer_preference limit vs 30-day store_defect & store shippingFeeBearer');
  } finally {
    if (child && !child.killed) child.kill('SIGTERM');
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})();
