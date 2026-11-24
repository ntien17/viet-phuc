const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { setTimeout: delay } = require('node:timers/promises');

const root = path.resolve(__dirname, '..');
const tmpParent = fs.realpathSync(os.tmpdir());
const dataDir = fs.mkdtempSync(path.join(tmpParent, 'vietphuc-db-test-'));
let child;
let base;

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function request(method, url, value) {
  const options = { method, headers: {} };
  if (value !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(value);
  }
  const response = await fetch(base + url, options);
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: response.status, body };
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

async function storefrontSession() {
  const handlers = {};
  let overlay;
  const ids = {};
  function element(id) {
    return { id, value:'', textContent:'', innerHTML:'', dataset:{}, listeners:{}, style:{}, classList:{toggle(){}},
      addEventListener(type, fn){this.listeners[type]=fn;}, setAttribute(){}, scrollIntoView(){}, focus(){},
      remove(){if(this===overlay)overlay=null;} };
  }
  for(const id of ['product-grid','filter-summary','catalog-search','catalog-category','catalog-sort','filter-open','cart-count'])ids[id]=element(id);
  const document={getElementById:id=>ids[id]||null,querySelector(sel){if(sel==='.vp-overlay')return overlay||null;return null;},
    querySelectorAll(sel){return sel==='#cart-count,[data-cart-count]'?[ids['cart-count']]:[];},createElement(){return element();},
    addEventListener(type,fn){(handlers[type]||=[]).push(fn);},head:{appendChild(){}},body:{style:{},prepend(el){ids[el.id]=el;},appendChild(el){if(el.className?.startsWith('vp-overlay'))overlay=el;}}};
  const local={},session={};
  const storage=obj=>({getItem:key=>obj[key]??null,setItem(key,value){obj[key]=String(value);}});
  class FormDataMock {constructor(form){this.values=form.values||{};}get(name){return this.values[name]??null;}getAll(name){const value=this.values[name];return value===undefined?[]:Array.isArray(value)?value:[value];}}
  const context={document,window:{},location:{hostname:'127.0.0.1',protocol:'http:'},localStorage:storage(local),sessionStorage:storage(session),FormData:FormDataMock,
    fetch:(url,options)=>fetch(base+url,options),Intl,console,setTimeout(){},clearTimeout(){}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'dist/app.js'),'utf8'),context,{filename:'app.js'});
  for(let i=0;i<80;i++){if(ids['database-status']?.textContent.includes('lưu trong file JSON'))break;await delay(50);}
  assert.match(ids['database-status']?.textContent||'',/lưu trong file JSON/);
  async function click(action,extra={}) {const target={dataset:{action,...extra},closest(){return this;}};for(const handler of handlers.click)await handler({target});}
  async function submit(type,values) {const form={dataset:{form:type},values,closest(){return this;}};for(const handler of handlers.submit)await handler({target:form,preventDefault(){}});}
  await submit('login',{name:'Khách thử nghiệm',email:'test@example.com'});
  await click('product',{id:'p1'});
  await click('add');
  assert.equal(context.window.VietPhuc.getState().cart.length,1);
  await submit('checkout',{receiver:'Khách thử nghiệm',phone:'0900000000',address:'Địa chỉ thử',shipping:'30000',payment:'COD'});
  assert.equal(context.window.VietPhuc.getState().cart.length,0);
  return await request('GET','/api/state');
}

async function main() {
  let result = await start();
  assert.equal(result.status, 200);
  assert.equal(typeof result.body.revision, 'number');
  assert.deepEqual(result.body.state.orders, []);
  assert.deepEqual(result.body.state.stock, {});
  assert.ok(Array.isArray(result.body.state.products));
  assert.equal(result.body.state.products.length, 9);
  assert.ok(result.body.state.products.some(p => p.category === 'Phụ kiện'));
  console.log('PASS initial state loads from a new data directory');

  const revision = result.body.revision;
  const products = structuredClone(result.body.state.products);
  products[0].price += 1000;
  const state = { products, orders: [{ id: 'VP-TEST-001', items: [{ id: 'p1', size: 'M', qty: 1 }], total: 1250000 }], stock: { 'p1|M': 7 }, visits: 3, cartEvents: 2 };
  result = await request('PUT', '/api/state', { revision, state });
  assert.equal(result.status, 200);
  assert.ok(result.body.revision > revision);
  const committedRevision = result.body.revision;
  await stop();
  result = await start();
  assert.equal(result.body.revision, committedRevision);
  assert.deepEqual(result.body.state, state);
  console.log('PASS state and revision survive server restart');

  const stale = await request('PUT', '/api/state', { revision, state: { ...state, visits: 1 } });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.revision, committedRevision);
  assert.deepEqual(stale.body.state, state);
  console.log('PASS stale revision cannot overwrite committed data');

  const competing = await Promise.all([
    request('PUT', '/api/state', { revision: committedRevision, state: { ...state, visits: 4 } }),
    request('PUT', '/api/state', { revision: committedRevision, state: { ...state, visits: 5 } }),
  ]);
  assert.deepEqual(competing.map(x => x.status).sort(), [200, 409]);
  result = await request('GET', '/api/state');
  assert.ok([4, 5].includes(result.body.state.visits));
  assert.deepEqual(result.body.state.orders, state.orders);
  console.log('PASS concurrent writes detect revision conflicts');

  const invalid = await request('PUT', '/api/state', { revision: result.body.revision, state: { ...result.body.state, stock: { 'p1|M': -1 } } });
  assert.ok(invalid.status >= 400 && invalid.status < 500);
  const unchanged = await request('GET', '/api/state');
  assert.deepEqual(unchanged.body, result.body);
  console.log('PASS invalid stock cannot corrupt persisted state');

  const page = await request('GET', '/');
  assert.equal(page.status, 200);
  assert.match(page.body, /VIỆT PHỤC/);
  const fileLeak = await request('GET', '/data/db.json');
  assert.ok(fileLeak.status === 404 || fileLeak.status === 403);
  console.log('PASS static storefront is served without publishing database files');

  const afterOrder = await storefrontSession();
  assert.equal(afterOrder.body.state.orders.length, 2);
  assert.equal(afterOrder.body.state.stock['p1|M'], 6);
  assert.equal(afterOrder.body.state.orders[1].payment, 'COD');
  await stop();
  const afterRestart = await start();
  assert.deepEqual(afterRestart.body.state, afterOrder.body.state);
  console.log('PASS storefront creates a COD order and preserves order and stock after restart');
}

main().catch(err => { console.error('FAIL', err); process.exitCode = 1; }).finally(async () => {
  await stop();
  if (path.dirname(dataDir) === tmpParent && path.basename(dataDir).startsWith('vietphuc-db-test-')) fs.rmSync(dataDir, { recursive: true, force: true });
});
