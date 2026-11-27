'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');

const root = path.resolve(__dirname, '..');
const tmpParent = fs.realpathSync(os.tmpdir());
const dataDir = fs.mkdtempSync(path.join(tmpParent, 'vietphuc-postorder-test-'));
let child;
let base;

const ADMIN_USER = 'qa_postorder_admin';
const ADMIN_PASS = 'QaPost#2026!';

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
      VIETPHUC_TEST_MODE: '1',
      VIETPHUC_ADMIN_USER: ADMIN_USER,
      VIETPHUC_ADMIN_PASSWORD: ADMIN_PASS,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', d => { logs += d; });
  child.stderr.on('data', d => { logs += d; });
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null) throw new Error('Server exited early: ' + logs);
    try {
      const r = await fetch(`${base}/api/public/bootstrap`);
      if (r.ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error('Server failed to start: ' + logs);
}

async function run() {
  await startServer();
  try {
    // 1. Admin & Customer auth
    const admLogin = await reqJson('POST', '/api/admin/login', { username: ADMIN_USER, password: ADMIN_PASS });
    assert.equal(admLogin.status, 200);
    const admH = { Cookie: getCookie(admLogin.headers, 'vp_admin_session') };

    const reg1 = await reqJson('POST', '/api/customer/register', {
      name: 'Nguyễn Văn An', email: 'an@example.com', phone: '0901234567', password: 'Password123!'
    });
    assert.equal(reg1.status, 201);
    const cusH = { Cookie: getCookie(reg1.headers, 'vp_customer_session') };

    const reg2 = await reqJson('POST', '/api/customer/register', {
      name: 'Trần Thị Bình', email: 'binh@example.com', phone: '0909876543', password: 'Password123!'
    });
    assert.equal(reg2.status, 201);
    const otherH = { Cookie: getCookie(reg2.headers, 'vp_customer_session') };

    let boot = await reqJson('GET', '/api/admin/bootstrap', undefined, admH);
    assert.equal(boot.status, 200);
    const p1 = boot.body.state.products.find(p => p.active && p.variants.filter(v => v.active).length >= 2);
    assert.ok(p1, 'Need an active product with at least 2 variants');
    const v1 = p1.variants.find(v => v.active && (boot.body.state.stock[v.sku] || 0) >= 3);
    const v2 = p1.variants.find(v => v.active && v.sku !== v1.sku && (boot.body.state.stock[v.sku] || 0) >= 2);
    const vOos = p1.variants.find(v => v.active && v.sku !== v1.sku && v.sku !== v2?.sku);
    assert.ok(v1 && v2, 'Need 2 stocked variants');

    // Ensure vOos has 0 stock if present
    if (vOos) {
      const adj = await reqJson('POST', '/api/admin/stock/adjust', { sku: vOos.sku, mode: 'set', qty: 0, reason: 'QA OOS setup' }, admH);
      assert.equal(adj.status, 200);
    }

    const stockBeforeV1 = boot.body.state.stock[v1.sku];
    const stockBeforeV2 = boot.body.state.stock[v2.sku];

    // 2. QR Demo checkout + pay-simulate
    const qrOrderRes = await reqJson('POST', '/api/customer/orders', {
      items: [{ productId: p1.id, sku: v1.sku, qty: 1 }],
      receiver: 'Nguyễn Văn An', phone: '0901234567', province: 'Hà Nội', address: '12 Tràng Tiền',
      paymentMethod: 'online',
    }, cusH);
    assert.equal(qrOrderRes.status, 201);
    const qrOrder = qrOrderRes.body.order;
    assert.equal(qrOrder.paymentMethod, 'online');
    assert.equal(qrOrder.paymentStatus, 'pending');
    assert.equal(qrOrder.transactions[0].isSimulated, true);

    const payOk = await reqJson('POST', `/api/customer/orders/${qrOrder.id}/pay-simulate`, { action: 'success' }, cusH);
    assert.equal(payOk.status, 200);
    assert.equal(payOk.body.order.paymentStatus, 'paid');

    // 3. Cancel Request workflow (reject -> re-request -> approve with simulated refund & single stock release)
    assert.equal((await reqJson('POST', `/api/customer/orders/${qrOrder.id}/cancel-request`, { reason: '   ' }, cusH)).status, 400);
    assert.equal((await reqJson('POST', `/api/customer/orders/${qrOrder.id}/cancel-request`, { reason: 'Cross user' }, otherH)).status, 403);

    const cr1 = await reqJson('POST', `/api/customer/orders/${qrOrder.id}/cancel-request`, {
      reasonCode: 'change_plan', reason: 'Thay đổi kế hoạch mua hàng'
    }, cusH);
    assert.equal(cr1.status, 201);
    assert.equal(cr1.body.cancelRequest.status, 'pending');
    // Duplicate pending blocked
    assert.equal((await reqJson('POST', `/api/customer/orders/${qrOrder.id}/cancel-request`, { reason: 'Gửi lại' }, cusH)).status, 409);

    // Admin reject requires reason
    assert.equal((await reqJson('POST', `/api/admin/orders/${qrOrder.id}/cancel-request`, { decision: 'reject', adminReason: '  ' }, admH)).status, 400);
    const rejCr = await reqJson('POST', `/api/admin/orders/${qrOrder.id}/cancel-request`, {
      decision: 'reject', adminReason: 'Đơn đang được ưu tiên xử lý'
    }, admH);
    assert.equal(rejCr.status, 200);
    assert.equal(rejCr.body.order.cancelRequest.status, 'rejected');
    assert.equal(rejCr.body.order.orderStatus, 'pending');

    // Customer re-submits and Admin approves
    const cr2 = await reqJson('POST', `/api/customer/orders/${qrOrder.id}/cancel-request`, {
      reasonCode: 'other', reason: 'Không còn nhu cầu sử dụng nữa'
    }, cusH);
    assert.equal(cr2.status, 201);

    const appCr = await reqJson('POST', `/api/admin/orders/${qrOrder.id}/cancel-request`, {
      decision: 'approve', adminReason: 'Đồng ý hủy theo yêu cầu khách'
    }, admH);
    assert.equal(appCr.status, 200);
    assert.equal(appCr.body.order.orderStatus, 'cancelled');
    assert.equal(appCr.body.order.inventoryStatus, 'released');
    assert.equal(appCr.body.order.cancelRequest.status, 'approved');
    assert.equal(appCr.body.order.refunds.length, 1);
    assert.equal(appCr.body.order.refunds[0].isSimulated, true);
    assert.equal(appCr.body.order.refunds[0].status, 'pending');
    // Double approve blocked (no double stock release)
    assert.equal((await reqJson('POST', `/api/admin/orders/${qrOrder.id}/cancel-request`, { decision: 'approve' }, admH)).status, 409);

    boot = await reqJson('GET', '/api/admin/bootstrap', undefined, admH);
    assert.equal(boot.body.state.stock[v1.sku], stockBeforeV1, 'Stock must return to exact initial level');

    // 4. Change Request workflow after Admin confirms order
    const pendingOnlineRes = await reqJson('POST', '/api/customer/orders', {
      items: [{ productId: p1.id, sku: v1.sku, qty: 1 }],
      receiver: 'Nguyễn Văn An', phone: '0901234567', province: 'Hà Nội', address: '12 Tràng Tiền',
      paymentMethod: 'online',
    }, cusH);
    assert.equal(pendingOnlineRes.status, 201);
    assert.equal(pendingOnlineRes.body.order.orderStatus, 'pending');
    // Cannot request change before Admin confirms
    assert.equal((await reqJson('POST', `/api/customer/orders/${pendingOnlineRes.body.order.id}/change-request`, {
      reason: 'Đổi địa chỉ',
      addressChange: { receiver: 'Nguyễn Văn An', phone: '0901234567', address: '99 Hai Bà Trưng, Hà Nội' }
    }, cusH)).status, 409);

    const codRes = await reqJson('POST', '/api/customer/orders', {
      items: [{ productId: p1.id, sku: v1.sku, qty: 1 }],
      receiver: 'Nguyễn Văn An', phone: '0901234567', province: 'Hà Nội', address: '12 Tràng Tiền',
      paymentMethod: 'COD',
    }, cusH);
    assert.equal(codRes.status, 201);
    const codOrder = codRes.body.order;
    if (codOrder.orderStatus === 'pending') {
      assert.equal((await reqJson('PATCH', `/api/admin/orders/${codOrder.id}/status`, { nextStatus: 'confirmed' }, admH)).status, 200);
    }
    const stockAfterCodV1 = stockBeforeV1 - 2; // 1 held by pendingOnlineRes, 1 by codRes

    // OOS variant blocked
    if (vOos) {
      assert.equal((await reqJson('POST', `/api/customer/orders/${codOrder.id}/change-request`, {
        reason: 'Đổi sang mẫu hết hàng',
        itemChanges: [{ itemIndex: 0, newSku: vOos.sku }]
      }, cusH)).status, 409);
    }

    // Valid change request (address + variant)
    const ch1 = await reqJson('POST', `/api/customer/orders/${codOrder.id}/change-request`, {
      reason: 'Đổi sang màu/size khác và cập nhật địa chỉ nhận',
      addressChange: { receiver: 'Lê Thị Hoa', phone: '0911223344', address: '88 Lý Thường Kiệt, Hà Nội' },
      itemChanges: [{ itemIndex: 0, newSku: v2.sku }],
    }, cusH);
    assert.equal(ch1.status, 201);
    assert.equal(ch1.body.changeRequest.status, 'pending');
    // Order not mutated yet
    assert.equal(ch1.body.order.items[0].sku, v1.sku);
    assert.equal(ch1.body.order.receiver, 'Nguyễn Văn An');

    // Duplicate pending change request blocked
    assert.equal((await reqJson('POST', `/api/customer/orders/${codOrder.id}/change-request`, {
      reason: 'Gửi thêm lần nữa',
      addressChange: { receiver: 'Lê Thị Hoa', phone: '0911223344', address: '88 Lý Thường Kiệt, Hà Nội' },
    }, cusH)).status, 409);

    // Admin rejects change request (requires reason)
    assert.equal((await reqJson('POST', `/api/admin/orders/${codOrder.id}/change-request`, {
      decision: 'reject', requestId: ch1.body.changeRequest.id, adminReason: ''
    }, admH)).status, 400);

    const rejCh = await reqJson('POST', `/api/admin/orders/${codOrder.id}/change-request`, {
      decision: 'reject', requestId: ch1.body.changeRequest.id, adminReason: 'Chưa xác minh được SĐT mới'
    }, admH);
    assert.equal(rejCh.status, 200);
    assert.equal(rejCh.body.order.changeRequests[0].status, 'rejected');
    assert.equal(rejCh.body.order.items[0].sku, v1.sku);

    // Customer submits new change request & Admin approves
    const ch2 = await reqJson('POST', `/api/customer/orders/${codOrder.id}/change-request`, {
      reason: 'Xác nhận đổi sang biến thể mới và địa chỉ mới',
      addressChange: { receiver: 'Lê Thị Hoa', phone: '0911223344', address: '88 Lý Thường Kiệt, Hà Nội' },
      itemChanges: [{ itemIndex: 0, newSku: v2.sku }],
    }, cusH);
    assert.equal(ch2.status, 201);

    const appCh = await reqJson('POST', `/api/admin/orders/${codOrder.id}/change-request`, {
      decision: 'approve', requestId: ch2.body.changeRequest.id
    }, admH);
    assert.equal(appCh.status, 200);
    assert.equal(appCh.body.order.receiver, 'Lê Thị Hoa');
    assert.equal(appCh.body.order.phone, '0911223344');
    assert.equal(appCh.body.order.address, '88 Lý Thường Kiệt, Hà Nội');
    assert.equal(appCh.body.order.items[0].sku, v2.sku);
    assert.equal(appCh.body.order.items[0].originalSku, v1.sku);

    boot = await reqJson('GET', '/api/admin/bootstrap', undefined, admH);
    assert.equal(boot.body.state.stock[v1.sku], stockAfterCodV1 + 1, 'Old SKU stock restored');
    assert.equal(boot.body.state.stock[v2.sku], stockBeforeV2 - 1, 'New SKU stock deducted');

    // Verify customer profile was NOT overwritten by order address change
    const me = await reqJson('GET', '/api/customer/me', undefined, cusH);
    assert.equal(me.body.customer.name, 'Nguyễn Văn An');
    assert.equal(me.body.customer.phone, '0901234567');

    // 5. Shipping order blocks both cancel-request and change-request
    assert.equal((await reqJson('PATCH', `/api/admin/orders/${codOrder.id}/status`, { nextStatus: 'shipping' }, admH)).status, 200);
    assert.equal((await reqJson('POST', `/api/customer/orders/${codOrder.id}/cancel-request`, { reason: 'Hủy khi đang giao' }, cusH)).status, 409);
    assert.equal((await reqJson('POST', `/api/customer/orders/${codOrder.id}/change-request`, {
      reason: 'Sửa khi đang giao',
      addressChange: { receiver: 'A', phone: '0901234567', address: '123 ABC, Hà Nội' }
    }, cusH)).status, 409);

    console.log('PASS post-order-requests (QR Demo, Cancel Request, Change Request)');
  } finally {
    if (child) child.kill();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
