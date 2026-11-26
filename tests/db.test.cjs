const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');

const root = path.resolve(__dirname, '..');
const tmpParent = fs.realpathSync(os.tmpdir());
const dataDir = fs.mkdtempSync(path.join(tmpParent, 'vietphuc-db-test-'));
const migDir = fs.mkdtempSync(path.join(tmpParent, 'vietphuc-mig-srv-'));
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

const TEST_ADMIN_USER = 'db_qa_admin';
const TEST_ADMIN_PASS = 'DbQaSecret#2026!';

async function start(dir = dataDir) {
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  let logs = '';
  child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      VIETPHUC_DATA_DIR: dir,
      VIETPHUC_ADMIN_USER: TEST_ADMIN_USER,
      VIETPHUC_ADMIN_PASSWORD: TEST_ADMIN_PASS,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout.on('data', b => { logs += b; });
  child.stderr.on('data', b => { logs += b; });
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null) throw new Error('Server exited early: ' + logs);
    try { return await request('GET', '/api/public/bootstrap'); } catch { await delay(100); }
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
  // 1. Khởi tạo DB V2 từ thư mục trống
  const pub = await start(dataDir);
  assert.equal(pub.status, 200);
  assert.equal(pub.body.products.length, 9);
  assert.equal(pub.body.categories.length, 5);
  assert.equal(pub.body.stock['VP-P1-DO_TRAM-M'], 10);
  assert.equal(pub.body.stock['VP-P9-DO_TRAM-ONE_SIZE'], 10);
  assert.equal('orders' in pub.body, false);
  assert.equal('customers' in pub.body, false);
  console.log('PASS public bootstrap initializes V2 seed (10/SKU) without leaking orders or customers');

  // 2. Khóa vĩnh viễn /api/state công khai
  const legacyGet = await request('GET', '/api/state');
  assert.equal(legacyGet.status, 403);
  assert.equal(legacyGet.body.error, 'legacy_api_disabled');
  const legacyPut = await request('PUT', '/api/state', { revision: 0, state: {} });
  assert.equal(legacyPut.status, 403);
  console.log('PASS legacy /api/state GET and PUT are disabled');

  // 3. Khung Customer API chặn khi chưa đăng nhập
  const unauthOrder = await request('POST', '/api/orders', {});
  assert.equal(unauthOrder.status, 401);
  const unauthCustomerOrders = await request('GET', '/api/customer/orders');
  assert.equal(unauthCustomerOrders.status, 401);
  console.log('PASS customer endpoints reject unauthenticated requests (401)');

  // 4. Transaction Queue: 10 request ghi đồng thời không làm mất cập nhật
  const tracks = await Promise.all(
    Array.from({ length: 10 }, () => request('POST', '/api/public/track', { type: 'visit' }))
  );
  assert.ok(tracks.every(r => r.status === 200));

  // Đăng nhập Admin để xác minh tổng visits và persistence sau restart
  const loginRes = await request('POST', '/api/admin/login', { username: TEST_ADMIN_USER, password: TEST_ADMIN_PASS });
  assert.equal(loginRes.status, 200);
  const cookie = loginRes.headers.get('set-cookie').split(';')[0];
  const adminBoot = await request('GET', '/api/admin/bootstrap', undefined, { Cookie: cookie });
  assert.equal(adminBoot.body.state.visits, 10);
  const revBeforeFail = adminBoot.body.revision;

  // Kiểm tra Transaction lỗi: không tăng revision và không ghi dữ liệu dở dang
  const failedTx = await request('PATCH', '/api/admin/orders/NON_EXISTENT/status', { nextStatus: 'confirmed', revision: revBeforeFail }, { Cookie: cookie });
  assert.equal(failedTx.status, 404);
  const afterFailedTx = await request('GET', '/api/admin/bootstrap', undefined, { Cookie: cookie });
  assert.equal(afterFailedTx.body.revision, revBeforeFail);

  // Kiểm tra Revision cũ bị từ chối với HTTP 409
  const staleRev = await request('PATCH', '/api/admin/orders/VP1/status', { nextStatus: 'confirmed', revision: 0 }, { Cookie: cookie });
  assert.equal(staleRev.status, 409);
  assert.equal(staleRev.body.error, 'conflict');
  console.log('PASS failed transaction preserves revision and stale revision returns 409');

  await stop();
  await start(dataDir);
  const login2 = await request('POST', '/api/admin/login', { username: TEST_ADMIN_USER, password: TEST_ADMIN_PASS });
  const cookie2 = login2.headers.get('set-cookie').split(';')[0];
  const afterRestart = await request('GET', '/api/admin/bootstrap', undefined, { Cookie: cookie2 });
  assert.equal(afterRestart.body.state.visits, 10);
  console.log('PASS transaction queue preserves all 10 concurrent writes across restart');

  // 5. Static storefront served without exposing database files
  const page = await request('GET', '/');
  assert.equal(page.status, 200);
  assert.match(page.body, /VIỆT PHỤC/);
  const fileLeak = await request('GET', '/data/database.json');
  assert.ok(fileLeak.status === 404 || fileLeak.status === 403);
  console.log('PASS static storefront is served without publishing database files');
  await stop();

  // 6. Auto-migration V1 -> V2 khi khởi động server trên database V1 có sẵn
  const v1Sample = {
    revision: 2,
    state: {
      products: [
        { id: 'p9', name: 'Mấn gấm đỏ truyền thống', category: 'Phụ kiện', price: 320000, color: 'Đỏ trầm', material: 'Gấm', tag: 'MỚI', img: 'assets/accessory.png', sizes: ['One Size'], addedAt: '2026-07-01' },
      ],
      orders: [
        {
          id: 'VP-OLD-01',
          date: '2026-11-24T12:00:00.000Z',
          email: 'old@example.com',
          receiver: 'Khách V1',
          phone: '0900000000',
          address: 'Hà Nội',
          items: [{ id: 'p9', name: 'Mấn gấm đỏ truyền thống', color: 'Đỏ trầm', size: 'One Size', qty: 1, price: 320000 }],
          total: 350000,
          shippingFee: 30000,
          payment: 'COD',
          status: 'Chờ xác nhận',
          paymentStatus: 'Chưa thanh toán',
          inventory: 'reserved',
          settlement: 'Chưa đối soát',
          history: ['Tạo đơn'],
        },
      ],
      stock: { 'p9|One Size': 6 },
      visits: 5,
      cartEvents: 1,
    },
  };
  fs.writeFileSync(path.join(migDir, 'database.json'), JSON.stringify(v1Sample), 'utf8');
  const migPub = await start(migDir);
  assert.equal(migPub.status, 200);
  assert.equal(migPub.body.stock['VP-P9-DO_TRAM-ONE_SIZE'], 6);
  const filesInMig = fs.readdirSync(migDir);
  assert.ok(filesInMig.some(f => f.startsWith('database.v1.backup-')));
  const migLogin = await request('POST', '/api/admin/login', { username: TEST_ADMIN_USER, password: TEST_ADMIN_PASS });
  const migCookie = migLogin.headers.get('set-cookie').split(';')[0];
  const migBoot = await request('GET', '/api/admin/bootstrap', undefined, { Cookie: migCookie });
  assert.equal(migBoot.body.state.orders.length, 1);
  assert.equal(migBoot.body.state.orders[0].id, 'VP-OLD-01');
  assert.equal(migBoot.body.state.orders[0].customerId, null);
  console.log('PASS server auto-migrates V1 database to V2 with verified backup and preserves old order');
}

main().catch(err => { console.error('FAIL', err); process.exitCode = 1; }).finally(async () => {
  await stop();
  for (const d of [dataDir, migDir]) {
    if (path.dirname(d) === tmpParent && path.basename(d).startsWith('vietphuc-')) {
      fs.rmSync(d, { recursive: true, force: true });
    }
  }
});
