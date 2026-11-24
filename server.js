'use strict';

// Máy chủ chỉ phục vụ bản demo cục bộ; không dùng cho dữ liệu hoặc giao dịch thật.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.join(__dirname, 'dist');
const dataDir = path.resolve(process.env.VIETPHUC_DATA_DIR || path.join(__dirname, 'data'));
const databasePath = path.join(dataDir, 'database.json');
const host = '127.0.0.1';
const portText = process.env.PORT === undefined ? '3000' : process.env.PORT;
const port = Number(portText);
if (!/^\d+$/.test(portText) || !Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error('PORT phải là một số từ 0 đến 65535.');
}
const MAX_BODY = 2 * 1024 * 1024;
const seedProducts = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed-products.json'), 'utf8'));
const empty = () => ({ revision: 0, state: { products: structuredClone(seedProducts), orders: [], stock: {}, visits: 0, cartEvents: 0 } });

// Cấu hình tài khoản Admin bảo mật với node:crypto
const ADMIN_SALT = 'vp_salt_admin_2026';
// Băm scrypt cho mật khẩu mặc định "admin123"
const ADMIN_HASH = '0d4dc578c21856726172a8874dc35c65879cf9204b6691ee3b4912c34b02ee01acea006025211ed29b9bad22e47e3ee07aeeabd084c58f20121c857700e5edd3';
const ADMIN_USERNAME = 'admin';

function verifyAdminPassword(password) {
  try {
    const hash = crypto.scryptSync(password, ADMIN_SALT, 64);
    const expected = Buffer.from(ADMIN_HASH, 'hex');
    return hash.length === expected.length && crypto.timingSafeEqual(hash, expected);
  } catch {
    return false;
  }
}

// Bộ nhớ phiên làm việc của Admin (Session Storage)
const adminSessions = new Map();

function getAdminSession(req) {
  const cookieHeader = req.headers.cookie || '';
  const match = cookieHeader.match(/(?:^|;\s*)vp_admin_session=([^;]+)/);
  if (!match) return null;
  const token = match[1];
  const session = adminSessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    adminSessions.delete(token);
    return null;
  }
  return { token, ...session };
}

function validState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return false;

  // 5 trường bắt buộc cốt lõi
  const requiredKeys = ['cartEvents', 'orders', 'products', 'stock', 'visits'];
  for (const k of requiredKeys) {
    if (!(k in state)) return false;
  }

  // Danh sách trường cho phép mở rộng (categories, policies, inventoryLogs)
  const allowedKeys = new Set([...requiredKeys, 'categories', 'policies', 'inventoryLogs']);
  for (const k of Object.keys(state)) {
    if (!allowedKeys.has(k)) return false;
  }

  if (!Array.isArray(state.products) || state.products.length > 10000) return false;
  const productIds = new Set();
  for (const p of state.products) {
    if (!p || typeof p !== 'object' || Array.isArray(p) || typeof p.id !== 'string' || !/^[a-zA-Z0-9_-]{1,50}$/.test(p.id) || productIds.has(p.id)) return false;
    if (![p.name,p.category,p.color,p.material,p.tag,p.img,p.addedAt].every(x=>typeof x === 'string' && x.length > 0 && x.length <= 500)) return false;
    if (!Number.isSafeInteger(p.price) || p.price < 0 || (p.old !== undefined && (!Number.isSafeInteger(p.old) || p.old < 0))) return false;
    if (p.sizes !== undefined && (!Array.isArray(p.sizes) || p.sizes.length < 1 || p.sizes.length > 30 || !p.sizes.every(s=>typeof s==='string' && /^[a-zA-Z0-9 _-]{1,50}$/.test(s)))) return false;
    productIds.add(p.id);
  }
  if (!Array.isArray(state.orders) || state.orders.length > 10000) return false;
  const ids = new Set();
  for (const order of state.orders) {
    if (!order || typeof order !== 'object' || Array.isArray(order) || typeof order.id !== 'string' || order.id.length < 1 || order.id.length > 100 || !Array.isArray(order.items) || order.items.length > 1000 || ids.has(order.id)) return false;
    ids.add(order.id);
  }
  if (!state.stock || typeof state.stock !== 'object' || Array.isArray(state.stock) || Object.keys(state.stock).length > 10000) return false;
  if (!Object.entries(state.stock).every(([key, n]) => /^[a-zA-Z0-9_-]+\|[a-zA-Z0-9 _-]+$/.test(key) && key.length <= 100 && Number.isSafeInteger(n) && n >= 0)) return false;

  if (!Number.isSafeInteger(state.visits) || state.visits < 0 || !Number.isSafeInteger(state.cartEvents) || state.cartEvents < 0) return false;

  // Kiểm tra tính hợp lệ của các trường mở rộng nếu có mặt
  if (state.categories !== undefined) {
    if (!Array.isArray(state.categories) || state.categories.length > 100 || !state.categories.every(c => typeof c === 'string' && c.length > 0 && c.length <= 100)) return false;
  }
  if (state.policies !== undefined) {
    if (typeof state.policies !== 'object' || Array.isArray(state.policies)) return false;
  }
  if (state.inventoryLogs !== undefined) {
    if (!Array.isArray(state.inventoryLogs) || state.inventoryLogs.length > 20000) return false;
  }

  return true;
}

function validateDatabase(data) {
  return data && typeof data === 'object' && Number.isSafeInteger(data.revision) && data.revision >= 0 && validState(data.state);
}

function writeDatabase(data) {
  // Tệp tạm nằm cùng thư mục để rename là thao tác thay thế nguyên vẹn.
  const temp = path.join(dataDir, `.database-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`);
  try {
    const fd = fs.openSync(temp, 'wx', 0o600);
    try {
      fs.writeFileSync(fd, JSON.stringify(data, null, 2) + '\n', 'utf8');
      fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
    fs.renameSync(temp, databasePath);
  } finally {
    try { fs.unlinkSync(temp); } catch (err) { if (err.code !== 'ENOENT') console.error('Không thể dọn tệp tạm:', err.message); }
  }
}

fs.mkdirSync(dataDir, { recursive: true });
let database;
try {
  database = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
  if (!validateDatabase(database)) throw new Error('Sai cấu trúc cơ sở dữ liệu.');
} catch (err) {
  if (err.code !== 'ENOENT') {
    console.error(`Không thể đọc ${databasePath}. Giữ nguyên tệp để kiểm tra: ${err.message}`);
    process.exit(1);
  }
  database = empty();
  writeDatabase(database);
}

const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.svg':'image/svg+xml', '.ico':'image/x-icon', '.webp':'image/webp' };
function sendJson(res, code, value, headers = {}) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers
  });
  res.end(JSON.stringify(value));
}

function sameOrigin(req) {
  if (!req.headers.origin) return true;
  try {
    const origin = new URL(req.headers.origin);
    return origin.protocol === 'http:' && (origin.hostname === '127.0.0.1' || origin.hostname === 'localhost') && origin.host === req.headers.host;
  } catch { return false; }
}

function parseJsonBody(req, callback) {
  let chunks = [], size = 0, tooLarge = false;
  req.on('data', chunk => {
    size += chunk.length;
    if (size > MAX_BODY) { tooLarge = true; chunks = []; } else if (!tooLarge) chunks.push(chunk);
  });
  req.on('end', () => {
    if (tooLarge) return callback({ code: 413, error: 'body_too_large' });
    try {
      const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      callback(null, data);
    } catch {
      callback({ code: 400, error: 'invalid_json' });
    }
  });
}

const server = http.createServer((req, res) => {
  // Tránh truy cập qua Host bất ngờ và giữ API trong máy tính này.
  const requestHost = (req.headers.host || '').toLowerCase();
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(requestHost)) return sendJson(res, 403, { error: 'forbidden_host' });
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { return sendJson(res, 400, { error: 'invalid_url' }); }

  // API Đăng nhập Admin với xác thực mật khẩu băm và Cookie session
  if (pathname === '/api/admin/login') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
    if (!sameOrigin(req)) return sendJson(res, 403, { error: 'forbidden_origin' });
    parseJsonBody(req, (err, body) => {
      if (err) return sendJson(res, err.code, { error: err.error });
      const { username, password } = body || {};
      if (username !== ADMIN_USERNAME || typeof password !== 'string' || !verifyAdminPassword(password)) {
        return sendJson(res, 401, { error: 'invalid_credentials', message: 'Tài khoản hoặc mật khẩu không đúng.' });
      }
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
      adminSessions.set(token, { user: ADMIN_USERNAME, role: 'admin', expiresAt });
      const cookie = `vp_admin_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400`;
      return sendJson(res, 200, { success: true, user: ADMIN_USERNAME, role: 'admin' }, { 'Set-Cookie': cookie });
    });
    return;
  }

  // API Kiểm tra phiên làm việc Admin
  if (pathname === '/api/admin/session') {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });
    const session = getAdminSession(req);
    if (!session) return sendJson(res, 200, { loggedIn: false });
    return sendJson(res, 200, { loggedIn: true, user: session.user, role: session.role });
  }

  // API Đăng xuất Admin
  if (pathname === '/api/admin/logout') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
    const session = getAdminSession(req);
    if (session) adminSessions.delete(session.token);
    const cookie = `vp_admin_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
    return sendJson(res, 200, { success: true }, { 'Set-Cookie': cookie });
  }

  if (pathname === '/api/state') {
    if (req.method === 'GET') return sendJson(res, 200, database);
    if (req.method !== 'PUT') return sendJson(res, 405, { error: 'method_not_allowed' });
    if (!sameOrigin(req)) return sendJson(res, 403, { error: 'forbidden_origin' });
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) return sendJson(res, 415, { error: 'json_required' });
    
    parseJsonBody(req, (err, update) => {
      if (err) return sendJson(res, err.code, { error: err.error });
      if (!update || !Number.isSafeInteger(update.revision) || update.revision < 0 || !validState(update.state)) return sendJson(res, 400, { error: 'invalid_state' });
      if (update.revision !== database.revision) return sendJson(res, 409, { error: 'conflict', ...database });
      const next = { revision: database.revision + 1, state: update.state };
      try { writeDatabase(next); database = next; }
      catch (err) { console.error('Không thể lưu cơ sở dữ liệu:', err.message); return sendJson(res, 500, { error: 'write_failed' }); }
      return sendJson(res, 200, database);
    });
    return;
  }
  if (pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'not_found' });
  if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'method_not_allowed' });
  if (pathname.includes('\0') || pathname.includes('\\')) return sendJson(res, 400, { error: 'invalid_path' });
  const requested = pathname === '/' ? '/index.html' : pathname;
  const file = path.resolve(root, '.' + requested);
  if (!file.startsWith(root + path.sep)) return sendJson(res, 403, { error: 'forbidden' });
  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) return sendJson(res, 404, { error: 'not_found' });
    res.writeHead(200, { 'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' });
    if (req.method === 'HEAD') return res.end();
    const stream = fs.createReadStream(file);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  });
});

server.listen(port, host, () => {
  console.log(`Việt Phục đang chạy tại http://${host}:${server.address().port}`);
  console.log(`Dữ liệu JSON: ${databasePath}`);
});

