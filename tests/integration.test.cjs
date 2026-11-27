const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { setTimeout: delay } = require('node:timers/promises');

const root = path.resolve(__dirname, '..');
const ADMIN_USER = 'qa_int_admin';
const ADMIN_PASS = 'QaInt#2026!';

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

function getCookie(headers, name) {
  const raw = headers.getSetCookie ? headers.getSetCookie() : [headers.get('set-cookie')].filter(Boolean);
  for (const item of raw) {
    const part = item.split(';')[0];
    if (part.startsWith(name + '=')) return part;
  }
  return '';
}

async function reqJson(base, method, url, value, headers = {}) {
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

test('E2E integration: product stock edit, public contact->admin, and SSE realtime', async () => {
  const tmpParent = fs.realpathSync(os.tmpdir());
  const dataDir = fs.mkdtempSync(path.join(tmpParent, 'vietphuc-int-test-'));
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      VIETPHUC_DATA_DIR: dataDir,
      VIETPHUC_TEST_MODE: '1',
      VIETPHUC_ADMIN_USER: ADMIN_USER,
      VIETPHUC_ADMIN_PASSWORD: ADMIN_PASS,
    },
  });
  let serverErr = '';
  child.stderr.on('data', d => { serverErr += d.toString(); });

  try {
    let ready = false;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(base + '/api/public/bootstrap');
        if (res.ok) { ready = true; break; }
      } catch {}
      await delay(50);
    }
    assert.ok(ready, 'Test server should start');

    // 1. Admin login & SSE auth check
    assert.equal((await fetch(base + '/api/admin/events')).status, 401);
    const admLogin = await reqJson(base, 'POST', '/api/admin/login', { username: ADMIN_USER, password: ADMIN_PASS });
    assert.equal(admLogin.status, 200);
    const admCookie = getCookie(admLogin.headers, 'vp_admin_session');
    assert.ok(admCookie);

    // 2. Admin creates product & edits existing variant stock via PATCH /api/admin/products/:id
    const createRes = await reqJson(base, 'POST', '/api/admin/products', {
      id: 'P_INT_1',
      categoryId: 'cat1',
      name: 'Áo dài Kiểm Thử',
      price: 950000,
      material: 'Lụa',
      img: 'assets/ao-dai-do.png',
      active: true,
      variants: [{ color: 'Đỏ trầm', size: 'M', initialStock: 5, active: true }],
    }, { Cookie: admCookie });
    assert.equal(createRes.status, 201, JSON.stringify(createRes.body));
    const sku = createRes.body.product.variants[0].sku;

    const badStock = await reqJson(base, 'PATCH', '/api/admin/products/P_INT_1', {
      variants: [{ color: 'Đỏ trầm', size: 'M', stock: -2, active: true }],
    }, { Cookie: admCookie });
    assert.equal(badStock.status, 400);

    const editStock = await reqJson(base, 'PATCH', '/api/admin/products/P_INT_1', {
      name: 'Áo dài Kiểm Thử v2',
      variants: [{ color: 'Đỏ trầm', size: 'M', stock: 12, active: true }],
    }, { Cookie: admCookie });
    assert.equal(editStock.status, 200, JSON.stringify(editStock.body));
    assert.equal(editStock.body.state.stock[sku], 12);
    assert.ok(editStock.body.state.inventoryLogs.some(l => l.sku === sku && l.delta === 7 && l.reason === 'manual_adjust'));

    const pubBoot = await reqJson(base, 'GET', '/api/public/bootstrap');
    const pubProd = pubBoot.body.products.find(p => p.id === 'P_INT_1');
    assert.equal(pubProd.name, 'Áo dài Kiểm Thử v2');
    assert.equal(pubBoot.body.stock[sku], 12);

    // 3. Open Admin & Public SSE streams and verify db_update arrives on POST /api/public/contact
    const acAdmin = new AbortController();
    const acPublic = new AbortController();
    const adminSseRes = await fetch(base + '/api/admin/events', { headers: { Cookie: admCookie }, signal: acAdmin.signal });
    const publicSseRes = await fetch(base + '/api/public/events', { signal: acPublic.signal });
    assert.equal(adminSseRes.status, 200);
    assert.equal(publicSseRes.status, 200);
    assert.match(adminSseRes.headers.get('content-type') || '', /text\/event-stream/);

    const admReader = adminSseRes.body.getReader();
    const pubReader = publicSseRes.body.getReader();
    const dec = new TextDecoder();
    const firstAdm = dec.decode((await admReader.read()).value);
    const firstPub = dec.decode((await pubReader.read()).value);
    assert.match(firstAdm, /event: connected/);
    assert.match(firstPub, /event: connected/);

    // Invalid public contact rejected
    assert.equal((await reqJson(base, 'POST', '/api/public/contact', { name: 'A', email: 'bad', message: 'hi' })).status, 400);

    // Valid public contact triggers DB write + SSE broadcast
    const contactRes = await reqJson(base, 'POST', '/api/public/contact', {
      name: 'Nguyễn Văn Thử',
      email: 'guest@example.com',
      message: 'Cho mình hỏi thời gian giao hàng nội thành.',
    });
    assert.equal(contactRes.status, 201);
    const ticketId = contactRes.body.ticketId;

    const admUpdate = dec.decode((await admReader.read()).value);
    const pubUpdate = dec.decode((await pubReader.read()).value);
    assert.match(admUpdate, /event: db_update/);
    assert.match(pubUpdate, /event: db_update/);
    await admReader.cancel().catch(() => {});
    await pubReader.cancel().catch(() => {});
    acAdmin.abort();
    acPublic.abort();

    // 4. Verify contact ticket appears in Admin and does NOT leak to customer support tickets
    const admBootAfter = await reqJson(base, 'GET', '/api/admin/bootstrap', undefined, { Cookie: admCookie });
    const fb = admBootAfter.body.state.supportTickets.find(t => t.id === ticketId);
    assert.ok(fb);
    assert.equal(fb.source, 'contact_feedback');
    assert.equal(fb.customerId, null);

    const reg = await reqJson(base, 'POST', '/api/customer/register', {
      name: 'Khách Riêng',
      email: 'private@example.com',
      phone: '0912345678',
      password: 'Password123!',
    });
    assert.equal(reg.status, 201);
    const cusCookie = getCookie(reg.headers, 'vp_customer_session');
    const cusTickets = await reqJson(base, 'GET', '/api/customer/support-tickets', undefined, { Cookie: cusCookie });
    assert.equal(cusTickets.status, 200);
    assert.equal(cusTickets.body.tickets.some(t => t.id === ticketId), false);

    const replyRes = await reqJson(base, 'PATCH', `/api/admin/support-tickets/${encodeURIComponent(ticketId)}`, {
      status: 'resolved',
      adminReply: 'Giao nội thành từ 1-2 ngày ạ.',
    }, { Cookie: admCookie });
    assert.equal(replyRes.status, 200);
    assert.equal(replyRes.body.ticket.status, 'resolved');
  } catch (err) {
    if (serverErr) err.message += '\nSERVER STDERR:\n' + serverErr;
    throw err;
  } finally {
    child.kill('SIGTERM');
    await delay(150);
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('Storefront UI: handlers complete, storeInfo syncs contact modal, and cart is isolated per account', async () => {
  const html = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8');
  const appCode = fs.readFileSync(path.join(root, 'dist/app.js'), 'utf8');

  // 1. All static HTML data-action attributes must have click handlers
  const htmlActions = [...new Set([...html.matchAll(/data-action="([^"]+)"/g)].map(m => m[1]))];
  const handled = new Set([...appCode.matchAll(/action\s*===\s*'([^']+)'/g)].map(m => m[1]));
  for (const a of htmlActions) {
    assert.ok(handled.has(a), `Missing click handler for data-action="${a}"`);
  }

  // 2. VM test for storeInfo sync + contact modal + per-account cart isolation
  const storageMap = new Map([
    ['vietphuc-cart-cus_A', JSON.stringify([{ id: 'p1', sku: 'VP-P1-DO_TRAM-M', color: 'Đỏ trầm', size: 'M', qty: 2 }])],
  ]);
  const localStorage = {
    getItem: k => (storageMap.has(k) ? storageMap.get(k) : null),
    setItem: (k, v) => storageMap.set(k, String(v)),
    removeItem: k => storageMap.delete(k),
  };
  const els = {};
  const makeEl = id => (els[id] ||= {
    id, innerHTML: '', textContent: '', hidden: id === 'product-page', value: '', style: {},
    classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
    setAttribute() {}, getAttribute: () => '', querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {}, focus() {}, scrollIntoView() {}, prepend() {}, remove() {},
  });
  let currentSessionUser = { id: 'cus_A', name: 'Nguyễn Văn A', email: 'a@example.com' };
  let modalBodyHtml = '';
  const listeners = {};
  const ctx = {
    URL, FormData: class { constructor() {} get() { return ''; } getAll() { return []; } },
    Intl, console, setTimeout, clearTimeout,
    localStorage,
    sessionStorage: { getItem: () => '1', setItem() {} },
    location: { hostname: '127.0.0.1', protocol: 'http:', hash: '' },
    history: { replaceState() {}, pushState() {}, state: null },
    addEventListener() {},
    removeEventListener() {},
    scrollTo() {},
    scrollY: 0,
    document: {
      title: 'VIỆT PHỤC',
      body: { style: {}, prepend() {}, append() {}, appendChild(n) { modalBodyHtml = n.innerHTML || modalBodyHtml; } },
      head: { appendChild() {} },
      getElementById: id => makeEl(id),
      querySelector: sel => {
        if (sel === '.footer-social') return { outerHTML: '<ul class="footer-social"></ul>' };
        return makeEl(sel);
      },
      querySelectorAll: () => [],
      createElement: () => makeEl('created'),
      addEventListener: (ev, fn) => { (listeners[ev] ||= []).push(fn); },
    },
    fetch: async url => {
      if (url === '/api/public/bootstrap') {
        return {
          ok: true, status: 200,
          json: async () => ({
            categories: [{ id: 'cat1', name: 'Áo dài', active: true }],
            products: [
              {
                id: 'p1', categoryId: 'cat1', name: 'Áo dài An Nhiên', price: 1250000,
                img: 'assets/ao-dai-do.png', material: 'Lụa', active: true,
                variants: [{ sku: 'VP-P1-DO_TRAM-M', color: 'Đỏ trầm', size: 'M', priceOverride: null, active: true }],
              },
              {
                id: 'p2', categoryId: 'cat1', name: 'Áo dài Hết Biến Thể', price: 980000,
                img: 'assets/ao-dai-trang.png', material: 'Lụa', active: true,
                variants: [],
              },
            ],
            stock: { 'VP-P1-DO_TRAM-M': 10 },
            policies: {
              storeInfo: { hotline: '0909888777', email: 'shop@vietphuc.test', hours: '08:30 - 18:00' },
              items: {}, visibility: {},
            },
            promotions: [],
          }),
        };
      }
      if (url === '/api/customer/session') {
        return { ok: true, status: 200, json: async () => ({ loggedIn: Boolean(currentSessionUser), customer: currentSessionUser }) };
      }
      if (url === '/api/customer/logout') {
        currentSessionUser = null;
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    },
  };
  ctx.window = ctx;
  vm.runInNewContext(appCode, ctx, { filename: 'app.js' });
  await delay(150);

  // Verify footer contact synced from storeInfo & both products (including 0-variant out-of-stock p2) render
  assert.equal(makeEl('footer-contact-phone').textContent, '0909888777');
  assert.equal(makeEl('footer-contact-email').textContent, 'shop@vietphuc.test');
  assert.equal(makeEl('footer-contact-hours').textContent, '08:30 - 18:00');
  assert.match(makeEl('product-grid').innerHTML, /Áo dài An Nhiên/);
  assert.match(makeEl('product-grid').innerHTML, /Áo dài Hết Biến Thể/);

  // Verify cart for cus_A is loaded from vietphuc-cart-cus_A and isolated after logout
  const st = ctx.window.VietPhuc.getState();
  assert.equal(st.cart.length, 1);
  // Trigger customer-logout click
  const clickFn = listeners.click[0];
  await clickFn({
    target: { closest: () => ({ dataset: { action: 'customer-logout' } }) },
    preventDefault() {},
  });
  await delay(50);
  assert.equal(ctx.window.VietPhuc.getState().cart.length, 0);
  assert.match(storageMap.get('vietphuc-cart-cus_A') || '', /VP-P1-DO_TRAM-M/);

  // Verify showContactInfo modal renders real storeInfo (no fake support@vietphuc.vn)
  ctx.document.body.append = node => { modalBodyHtml = node.innerHTML || ''; };
  await clickFn({
    target: { closest: () => ({ dataset: { action: 'contact' } }) },
    preventDefault() {},
  });
  assert.match(modalBodyHtml, /0909888777/);
  assert.match(modalBodyHtml, /shop@vietphuc\.test/);
  assert.doesNotMatch(modalBodyHtml, /support@vietphuc\.vn/);
});

test('Admin stock restock: single +10, validation edge cases, conflict 409, and atomic batch restock', async () => {
  const tmpParent = fs.realpathSync(os.tmpdir());
  const dataDir = fs.mkdtempSync(path.join(tmpParent, 'vietphuc-restock-test-'));
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      VIETPHUC_DATA_DIR: dataDir,
      VIETPHUC_TEST_MODE: '1',
      VIETPHUC_ADMIN_USER: ADMIN_USER,
      VIETPHUC_ADMIN_PASSWORD: ADMIN_PASS,
    },
  });
  try {
    for (let i = 0; i < 40; i++) {
      try { if ((await fetch(base + '/api/public/bootstrap')).ok) break; } catch {}
      await delay(50);
    }
    const login = await reqJson(base, 'POST', '/api/admin/login', { username: ADMIN_USER, password: ADMIN_PASS });
    assert.equal(login.status, 200);
    const admCookie = getCookie(login.headers, 'vp_admin_session');
    const boot = await reqJson(base, 'GET', '/api/admin/bootstrap', undefined, { Cookie: admCookie });
    const sku1 = 'VP-P1-DO_TRAM-S';
    const sku2 = 'VP-P1-DO_TRAM-M';

    // Set initial stock of sku1 to 8, then restock +10 -> 18
    const setRes = await reqJson(base, 'POST', '/api/admin/stock/adjust', {
      sku: sku1, mode: 'set', qty: 8, reason: 'Kiểm kê', revision: boot.body.revision,
    }, { Cookie: admCookie });
    assert.equal(setRes.status, 200);
    assert.equal(setRes.body.stock, 8);

    // Invalid inputs: 0, negative, decimal, missing SKU, unknown SKU
    assert.equal((await reqJson(base, 'POST', '/api/admin/stock/adjust', { sku: sku1, mode: 'in', qty: 0, reason: 'Nhập' }, { Cookie: admCookie })).status, 400);
    assert.equal((await reqJson(base, 'POST', '/api/admin/stock/adjust', { sku: sku1, mode: 'in', qty: -5, reason: 'Nhập' }, { Cookie: admCookie })).status, 400);
    assert.equal((await reqJson(base, 'POST', '/api/admin/stock/adjust', { sku: sku1, mode: 'in', qty: 2.5, reason: 'Nhập' }, { Cookie: admCookie })).status, 400);
    assert.equal((await reqJson(base, 'POST', '/api/admin/stock/adjust', { sku: '', mode: 'in', qty: 5, reason: 'Nhập' }, { Cookie: admCookie })).status, 400);
    assert.equal((await reqJson(base, 'POST', '/api/admin/stock/adjust', { sku: 'VP-INVALID-SKU', mode: 'in', qty: 5, reason: 'Nhập' }, { Cookie: admCookie })).status, 404);

    // Valid +10 with note -> 18, and stale revision -> 409
    const staleRev = setRes.body.revision - 1;
    assert.equal((await reqJson(base, 'POST', '/api/admin/stock/adjust', {
      sku: sku1, mode: 'in', qty: 10, reason: 'Nhập bổ sung hàng', note: 'Lô 01', revision: staleRev,
    }, { Cookie: admCookie })).status, 409);

    const addRes = await reqJson(base, 'POST', '/api/admin/stock/adjust', {
      sku: sku1, mode: 'in', qty: 10, reason: 'Nhập bổ sung hàng', note: 'Lô 01', revision: setRes.body.revision,
    }, { Cookie: admCookie });
    assert.equal(addRes.status, 200);
    assert.equal(addRes.body.stock, 18);

    // Batch restock: atomic rejection on invalid second item, then valid batch
    const badBatch = await reqJson(base, 'POST', '/api/admin/stock/restock-batch', {
      items: [{ sku: sku1, qty: 2 }, { sku: sku2, qty: 1.5 }],
      reason: 'Nhập lô sản xuất mới',
      revision: addRes.body.revision,
    }, { Cookie: admCookie });
    assert.equal(badBatch.status, 400);

    const okBatch = await reqJson(base, 'POST', '/api/admin/stock/restock-batch', {
      items: [{ sku: sku1, qty: 2 }, { sku: sku2, qty: 5 }],
      reason: 'Nhập lô sản xuất mới',
      note: 'Đợt T11',
      revision: addRes.body.revision,
    }, { Cookie: admCookie });
    assert.equal(okBatch.status, 200);
    assert.equal(okBatch.body.updatedCount, 2);
    assert.equal(okBatch.body.state.stock[sku1], 20);
    assert.equal(okBatch.body.state.stock[sku2], 15);
  } finally {
    child.kill('SIGTERM');
    await delay(150);
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
