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

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function request(method, url, value, headers = {}) {
  const options = { method, headers: { ...headers } };
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

async function start() {
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  let logs = '';
  child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), VIETPHUC_DATA_DIR: dataDir },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout.on('data', b => { logs += b; });
  child.stderr.on('data', b => { logs += b; });
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null) throw new Error('Server exited early: ' + logs);
    try { return await request('GET', '/api/state'); } catch { await delay(100); }
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
  await start();

  // 1. Phục vụ trang admin.html, admin.css, admin.js
  const page = await request('GET', '/admin.html');
  assert.equal(page.status, 200);
  assert.match(page.body, /Quản lý Đơn hàng/);

  const js = await request('GET', '/admin.js');
  assert.equal(js.status, 200);
  assert.match(js.body, /checkSession/);

  const css = await request('GET', '/admin.css');
  assert.equal(css.status, 200);
  console.log('PASS admin static assets served correctly');

  // 2. Kiểm tra session khi chưa đăng nhập
  const unauthSession = await request('GET', '/api/admin/session');
  assert.equal(unauthSession.status, 200);
  assert.equal(unauthSession.body.loggedIn, false);
  console.log('PASS unauthenticated session returns loggedIn: false');

  // 3. Đăng nhập sai mật khẩu
  const badLogin = await request('POST', '/api/admin/login', { username: 'admin', password: 'wrongpassword' });
  assert.equal(badLogin.status, 401);
  assert.equal(badLogin.body.error, 'invalid_credentials');
  console.log('PASS invalid admin credentials rejected');

  // 4. Đăng nhập đúng mật khẩu
  const goodLogin = await request('POST', '/api/admin/login', { username: 'admin', password: 'admin123' });
  assert.equal(goodLogin.status, 200);
  assert.equal(goodLogin.body.success, true);
  const cookie = goodLogin.headers.get('set-cookie');
  assert.ok(cookie && cookie.includes('vp_admin_session='));
  console.log('PASS admin login succeeded and issued session cookie');

  // 5. Kiểm tra session với cookie hợp lệ
  const cookieVal = cookie.split(';')[0];
  const authSession = await request('GET', '/api/admin/session', undefined, { Cookie: cookieVal });
  assert.equal(authSession.status, 200);
  assert.equal(authSession.body.loggedIn, true);
  assert.equal(authSession.body.user, 'admin');
  console.log('PASS admin session recognized with valid cookie');

  // 6. Đăng xuất
  const logoutRes = await request('POST', '/api/admin/logout', undefined, { Cookie: cookieVal });
  assert.equal(logoutRes.status, 200);
  const afterLogout = await request('GET', '/api/admin/session', undefined, { Cookie: cookieVal });
  assert.equal(afterLogout.body.loggedIn, false);
  console.log('PASS admin logout terminates session');

  // 7. Kiểm tra nới lỏng validState() cho categories, policies, inventoryLogs
  const stateRes = await request('GET', '/api/state');
  const revision = stateRes.body.revision;
  const extendedState = {
    ...stateRes.body.state,
    categories: ['Áo dài truyền thống', 'Áo bà ba', 'Áo tứ thân', 'Phụ kiện', 'Áo dài cách tân'],
    policies: { returnDays: 7, freeShipThreshold: 1000000 },
    inventoryLogs: [{ id: 'p1', size: 'M', delta: 5, date: '2026-11-25' }]
  };
  const putExtended = await request('PUT', '/api/state', { revision, state: extendedState });
  assert.equal(putExtended.status, 200);
  assert.deepEqual(putExtended.body.state.categories, extendedState.categories);
  assert.deepEqual(putExtended.body.state.policies, extendedState.policies);
  console.log('PASS extended validState allows categories, policies and inventoryLogs');

  // 8. Kiểm tra từ chối trường lạ không an toàn
  const invalidState = {
    ...stateRes.body.state,
    unexpectedRandomField: 12345
  };
  const putInvalid = await request('PUT', '/api/state', { revision: putExtended.body.revision, state: invalidState });
  assert.equal(putInvalid.status, 400);
  console.log('PASS unexpected arbitrary fields are safely rejected by validState');
}

main().catch(err => { console.error('FAIL', err); process.exitCode = 1; }).finally(async () => {
  await stop();
  if (path.dirname(dataDir) === tmpParent && path.basename(dataDir).startsWith('vietphuc-admin-test-')) {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
