const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');

const root = path.resolve(__dirname, '..');
const tmpParent = fs.realpathSync(os.tmpdir());
const dataDir = fs.mkdtempSync(path.join(tmpParent, 'vietphuc-admin-test-'));
let child;
let base;
let portUsed;

const TEST_ADMIN_USER = 'qa_admin';
const TEST_ADMIN_PASS = 'QaSecret#2026!';

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

async function start(extraEnv = {}) {
  portUsed = await freePort();
  base = `http://127.0.0.1:${portUsed}`;
  let logs = '';
  const env = { ...process.env, PORT: String(portUsed), VIETPHUC_DATA_DIR: dataDir, VIETPHUC_TEST_MODE: '1', ...extraEnv };
  if (!('VIETPHUC_ADMIN_USER' in extraEnv)) delete env.VIETPHUC_ADMIN_USER;
  if (!('VIETPHUC_ADMIN_PASSWORD' in extraEnv)) delete env.VIETPHUC_ADMIN_PASSWORD;
  if (!('VIETPHUC_ADMIN_PASSWORD_HASH' in extraEnv)) delete env.VIETPHUC_ADMIN_PASSWORD_HASH;
  if (!('VIETPHUC_ADMIN_SALT' in extraEnv)) delete env.VIETPHUC_ADMIN_SALT;

  child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout.on('data', b => { logs += b; });
  child.stderr.on('data', b => { logs += b; });
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null) throw new Error('Server exited early: ' + logs);
    try { return await request('GET', '/api/admin/session'); } catch { await delay(100); }
  }
  throw new Error('Server did not start: ' + logs);
}

async function stop() {
  if (!child || child.exitCode !== null) return;
  const stopped = new Promise(resolve => child.once('exit', resolve));
  child.kill();
  await stopped;
  child = undefined;
}

async function main() {
  // 1. Khi chưa cấu hình Admin -> login trả 503 admin_not_configured
  await start({});
  const notCfg = await request('POST', '/api/admin/login', { username: 'admin', password: 'any' });
  assert.equal(notCfg.status, 503);
  assert.equal(notCfg.body.error, 'admin_not_configured');
  console.log('PASS unconfigured admin login returns 503 admin_not_configured');
  await stop();

  // 2. Khởi động server với tài khoản cấu hình qua env (không dùng tài khoản mặc định)
  await start({ VIETPHUC_ADMIN_USER: TEST_ADMIN_USER, VIETPHUC_ADMIN_PASSWORD: TEST_ADMIN_PASS });

  const page = await request('GET', '/admin.html');
  assert.equal(page.status, 200);
  assert.match(page.body, /Quản lý Đơn hàng/);
  assert.doesNotMatch(page.body, /admin123/);
  assert.doesNotMatch(page.body, /value="admin"/);

  const js = await request('GET', '/admin.js');
  assert.equal(js.status, 200);
  assert.match(js.body, /checkSession/);
  assert.doesNotMatch(js.body, /admin123/);

  const css = await request('GET', '/admin.css');
  assert.equal(css.status, 200);
  console.log('PASS admin assets served without hardcoded credentials');

  // 3. Endpoint dữ liệu chặn khi chưa đăng nhập (401)
  assert.equal((await request('GET', '/api/admin/bootstrap')).status, 401);
  assert.equal((await request('PATCH', '/api/admin/orders/VP1/status', { nextStatus: 'confirmed', revision: 0 })).status, 401);

  // 4. Đăng nhập sai mật khẩu + rate limit (5 lần -> 429)
  for (let i = 0; i < 5; i++) {
    const bad = await request('POST', '/api/admin/login', { username: TEST_ADMIN_USER, password: 'wrongpassword' });
    assert.equal(bad.status, 401);
  }
  assert.equal((await request('POST', '/api/admin/login', { username: TEST_ADMIN_USER, password: TEST_ADMIN_PASS })).status, 429);
  console.log('PASS admin rate limit enforced (429)');

  await stop();
  await start({ VIETPHUC_ADMIN_USER: TEST_ADMIN_USER, VIETPHUC_ADMIN_PASSWORD: TEST_ADMIN_PASS });

  // 5. Đăng nhập đúng + Kiểm tra BUSINESS_CONFIG
  const goodLogin = await request('POST', '/api/admin/login', { username: TEST_ADMIN_USER, password: TEST_ADMIN_PASS });
  assert.equal(goodLogin.status, 200);
  const adminCookie = goodLogin.headers.get('set-cookie').split(';')[0];
  assert.ok(adminCookie.startsWith('vp_admin_session='));

  const bootstrap = await request('GET', '/api/admin/bootstrap', undefined, { Cookie: adminCookie });
  assert.equal(bootstrap.status, 200);
  assert.equal(bootstrap.body.config.shipping.standardFee, 30000);
  assert.equal(bootstrap.body.config.shipping.remoteFee, 45000);
  assert.equal(bootstrap.body.config.codFee, 0);
  assert.equal(bootstrap.body.config.returnWindowDays, 7);
  console.log('PASS admin login & BUSINESS_CONFIG bootstrap verified');

  // 6. Kiểm tra CSRF (đủ 6 trường hợp)
  // 6a. Origin cùng nguồn + custom header hợp lệ -> 200
  const csrfOkOrigin = await fetch(base + '/api/public/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base, 'X-VP-Requested': '1' },
    body: JSON.stringify({ type: 'visit' }),
  });
  assert.equal(csrfOkOrigin.status, 200);

  // 6b. Origin cùng nguồn nhưng thiếu custom header -> 403
  const csrfNoHeader = await fetch(base + '/api/public/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify({ type: 'visit' }),
  });
  assert.equal(csrfNoHeader.status, 403);

  // 6c. Origin khác nguồn + custom header hợp lệ -> 403
  const csrfBadOrigin = await fetch(base + '/api/public/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://evil.example', 'X-VP-Requested': '1' },
    body: JSON.stringify({ type: 'visit' }),
  });
  assert.equal(csrfBadOrigin.status, 403);

  // 6d. Không Origin, không Referer, thiếu custom header -> 403
  const csrfNoAll = await fetch(base + '/api/public/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'visit' }),
  });
  assert.equal(csrfNoAll.status, 403);

  // 6e. Không Origin/Referer nhưng có custom header hợp lệ -> 200
  const csrfHeaderOnly = await fetch(base + '/api/public/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-VP-Requested': '1' },
    body: JSON.stringify({ type: 'visit' }),
  });
  assert.equal(csrfHeaderOnly.status, 200);

  // 6f. Referer khác nguồn + custom header hợp lệ -> 403
  const csrfBadReferer = await fetch(base + '/api/public/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Referer: 'http://evil.example/attack', 'X-VP-Requested': '1' },
    body: JSON.stringify({ type: 'visit' }),
  });
  assert.equal(csrfBadReferer.status, 403);
  console.log('PASS all 6 CSRF scenarios enforced');

  // 7. Kiểm tra phân tách session Admin vs Customer & khóa Customer
  // Tạo 2 customer session test và 1 đơn hàng gắn với cus_b để test phân quyền
  const cusARes = await request('POST', '/api/_test/customer-session', { customerId: 'cus_a', locked: false });
  const cusACookie = cusARes.headers.get('set-cookie').split(';')[0];
  const cusBRes = await request('POST', '/api/_test/customer-session', { customerId: 'cus_b', locked: false });
  const cusBCookie = cusBRes.headers.get('set-cookie').split(';')[0];

  // Ghi nhận 1 đơn hàng thuộc cus_b trực tiếp vào data/database.json qua restart để test truy cập chéo
  await stop();
  const dbNow = JSON.parse(fs.readFileSync(path.join(dataDir, 'database.json'), 'utf8'));
  dbNow.state.orders.push({
    id: 'VP-OWNED-B',
    createdAt: new Date().toISOString(),
    customerId: 'cus_b',
    receiver: 'Khách B',
    phone: '0900',
    address: 'HCM',
    items: [{ productId: 'p1', sku: 'VP-P1-DO_TRAM-M', name: 'Áo dài', img: '', color: 'Đỏ trầm', size: 'M', qty: 1, unitPrice: 1250000 }],
    subtotal: 1250000, shippingFee: 30000, discountCode: null, discountAmount: 0, total: 1280000,
    paymentMethod: 'COD', orderStatus: 'pending', paymentStatus: 'unpaid', settlementStatus: 'unsettled', inventoryStatus: 'reserved',
    shipment: {}, transactions: [], refunds: [], policySnapshot: {}, history: [],
  });
  fs.writeFileSync(path.join(dataDir, 'database.json'), JSON.stringify(dbNow, null, 2), 'utf8');
  await start({ VIETPHUC_ADMIN_USER: TEST_ADMIN_USER, VIETPHUC_ADMIN_PASSWORD: TEST_ADMIN_PASS });

  const adminLogin2 = await request('POST', '/api/admin/login', { username: TEST_ADMIN_USER, password: TEST_ADMIN_PASS });
  const adminCookie2 = adminLogin2.headers.get('set-cookie').split(';')[0];
  const cusARes2 = await request('POST', '/api/_test/customer-session', { customerId: 'cus_a', locked: false });
  const cusACookie2 = cusARes2.headers.get('set-cookie').split(';')[0];
  const cusBCookie2 = (await request('POST', '/api/_test/customer-session', { customerId: 'cus_b', locked: false })).headers.get('set-cookie').split(';')[0];

  // 7a. vp_admin_session gọi Customer API -> 401
  assert.equal((await request('GET', '/api/customer/orders', undefined, { Cookie: adminCookie2 })).status, 401);
  // 7b. vp_customer_session gọi Admin API -> 401
  assert.equal((await request('GET', '/api/admin/bootstrap', undefined, { Cookie: cusACookie2 })).status, 401);
  // 7c. Customer A truy cập đơn của Customer B -> 403
  assert.equal((await request('GET', '/api/customer/orders/VP-OWNED-B', undefined, { Cookie: cusACookie2 })).status, 403);
  assert.equal((await request('GET', '/api/customer/orders/VP-OWNED-B', undefined, { Cookie: cusBCookie2 })).status, 200);
  // 7d. Customer bị khóa -> 403 và vô hiệu hóa session
  await request('POST', '/api/_test/customer-session', { customerId: 'cus_a', locked: true });
  const lockedCall = await request('GET', '/api/customer/orders', undefined, { Cookie: cusACookie2 });
  assert.equal(lockedCall.status, 403);
  assert.equal(lockedCall.body.error, 'account_locked');
  // Gọi lại lần 2 bằng cookie cũ sau khi bị thu hồi -> 401
  assert.equal((await request('GET', '/api/customer/orders', undefined, { Cookie: cusACookie2 })).status, 401);
  console.log('PASS session separation, cross-customer isolation (403) and locked-account revocation verified');

  // 8. Admin logout
  assert.equal((await request('POST', '/api/admin/logout', undefined, { Cookie: adminCookie2 })).status, 200);
  assert.equal((await request('GET', '/api/admin/session', undefined, { Cookie: adminCookie2 })).body.loggedIn, false);
  console.log('PASS admin logout terminates session');

  // 9. Kiểm tra bộ lọc Đang đóng gói & Chờ thanh toán trong admin.html và admin.js
  const adminHtml = fs.readFileSync(path.join(root, 'dist', 'admin.html'), 'utf8');
  assert.match(adminHtml, /<option value="Đang đóng gói">/);
  assert.match(adminHtml, /<option value="Chờ thanh toán">/);
  const adminJs = fs.readFileSync(path.join(root, 'dist', 'admin.js'), 'utf8');
  assert.match(adminJs, /packing:\s*'Đang đóng gói'/);
  assert.match(adminJs, /pending:\s*'Chờ thanh toán'/);
  console.log('PASS admin order filter options include packing and pending payment');
}

main().catch(err => { console.error('FAIL', err); process.exitCode = 1; }).finally(async () => {
  await stop();
  if (path.dirname(dataDir) === tmpParent && path.basename(dataDir).startsWith('vietphuc-admin-test-')) {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
