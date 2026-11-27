'use strict';

// Máy chủ phục vụ đồ án Việt Phục (chạy local đơn tiến trình với dữ liệu JSON).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { validateDatabaseV2 } = require('./schemas/database.schema');
const { COLOR_CODE_MAP, ENUMS, ID_REGEX, buildSku } = require('./schemas/common.schema');
const { migrateDatabaseFile } = require('./migrations/migrate-v1-to-v2');
const { createAdminHandler } = require('./lib/admin-handlers');
const { createCustomerOrderHandler, createHoldSweeper } = require('./lib/customer-order-handlers');

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
const DEMO_INITIAL_STOCK = 10;

const seedData = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed-products.json'), 'utf8'));

function buildEmptyDatabaseV2() {
  const stock = {};
  for (const p of seedData.products) {
    for (const v of p.variants) {
      stock[v.sku] = DEMO_INITIAL_STOCK;
    }
  }
  return {
    schemaVersion: 2,
    revision: 0,
    state: {
      categories: structuredClone(seedData.categories),
      products: structuredClone(seedData.products),
      stock,
      inventoryLogs: [],
      customers: [],
      supportTickets: [],
      orders: [],
      returns: [],
      promotions: [],
      policies: structuredClone(seedData.policies),
      policyVersions: [],
      adminActivityLogs: [],
      visits: 0,
      cartEvents: 0,
    },
  };
}

// =========================================================
// CẤU HÌNH NGHIỆP VỤ TẬP TRUNG (BUSINESS_CONFIG)
// =========================================================
const BUSINESS_CONFIG = Object.freeze({
  shipping: Object.freeze({
    standardFee: Number(process.env.VIETPHUC_SHIPPING_STANDARD || 30000),
    remoteFee: Number(process.env.VIETPHUC_SHIPPING_REMOTE || 45000),
  }),
  codFee: Number(process.env.VIETPHUC_COD_FEE || 0),
  paymentFee: Number(process.env.VIETPHUC_PAYMENT_FEE || 0),
  onlineStockHoldMinutes: Number(process.env.VIETPHUC_ONLINE_HOLD_MINUTES || 15),
  returnWindowDays: Number(process.env.VIETPHUC_RETURN_WINDOW_DAYS || 7),
  warrantyWindowDays: Number(process.env.VIETPHUC_WARRANTY_WINDOW_DAYS || 30),
  refundProcessingDays: 5,
  complaintResponseDays: 1,
  maxPromotionsPerOrder: 1,
});

// =========================================================
// XÁC THỰC ADMIN & CUSTOMER ĐỘC LẬP (KHÔNG HARDCODE MẬT KHẨU)
// =========================================================
const adminConfigPath = path.join(dataDir, 'admin.json');

function loadAdminCredentials() {
  const envUser = process.env.VIETPHUC_ADMIN_USER;
  const envPass = process.env.VIETPHUC_ADMIN_PASSWORD;
  const envHash = process.env.VIETPHUC_ADMIN_PASSWORD_HASH;
  const envSalt = process.env.VIETPHUC_ADMIN_SALT;

  if (envUser && envHash && envSalt) {
    return { username: envUser, salt: envSalt, hash: envHash };
  }
  if (envUser && envPass) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(envPass, salt, 64).toString('hex');
    return { username: envUser, salt, hash };
  }
  if (envPass && !envUser) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(envPass, salt, 64).toString('hex');
    return { username: 'admin', salt, hash };
  }
  if (fs.existsSync(adminConfigPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(adminConfigPath, 'utf8'));
      if (cfg && typeof cfg.username === 'string' && typeof cfg.salt === 'string' && typeof cfg.hash === 'string') {
        return { username: cfg.username, salt: cfg.salt, hash: cfg.hash };
      }
    } catch {
      return null;
    }
  }
  return null;
}

function verifyAdminPassword(password, creds) {
  if (!creds || typeof password !== 'string') return false;
  try {
    const hash = crypto.scryptSync(password, creds.salt, 64);
    const expected = Buffer.from(creds.hash, 'hex');
    return hash.length === expected.length && crypto.timingSafeEqual(hash, expected);
  } catch {
    return false;
  }
}

// Kho phiên làm việc tách biệt hoàn toàn
const adminSessions = new Map();
const customerSessions = new Map();
const loginAttempts = new Map(); // Rate limit theo IP

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const IDLE_TTL_MS = 2 * 60 * 60 * 1000;

function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
    }
  }
  return out;
}

function getAdminSession(req) {
  const token = parseCookies(req).vp_admin_session;
  if (!token) return null;
  const s = adminSessions.get(token);
  if (!s) return null;
  const now = Date.now();
  if (now > s.expiresAt || now - s.lastActiveAt > IDLE_TTL_MS) {
    adminSessions.delete(token);
    return null;
  }
  s.lastActiveAt = now;
  return { token, ...s };
}

function getCustomerSession(req) {
  const token = parseCookies(req).vp_customer_session;
  if (!token) return null;
  const s = customerSessions.get(token);
  if (!s) return null;
  const now = Date.now();
  if (now > s.expiresAt || now - s.lastActiveAt > IDLE_TTL_MS) {
    customerSessions.delete(token);
    return null;
  }
  s.lastActiveAt = now;
  return { token, ...s };
}

function checkLoginRateLimit(key) {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry) return true;
  if (now > entry.resetAt) {
    loginAttempts.delete(key);
    return true;
  }
  return entry.count < 5;
}

function recordLoginFailure(key) {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + 5 * 60 * 1000 });
  } else {
    entry.count += 1;
  }
}

function clearLoginFailures(key) {
  loginAttempts.delete(key);
}

// =========================================================
// ĐỌC / GHI DATABASE NGUYÊN TỬ & TRANSACTION QUEUE
// =========================================================
function writeDatabase(data) {
  const temp = path.join(dataDir, `.database-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`);
  try {
    const fd = fs.openSync(temp, 'wx', 0o600);
    try {
      fs.writeFileSync(fd, JSON.stringify(data, null, 2) + '\n', 'utf8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(temp, databasePath);
  } finally {
    try {
      fs.unlinkSync(temp);
    } catch (err) {
      if (err.code !== 'ENOENT') console.error('Không thể dọn tệp tạm:', err.message);
    }
  }
}

fs.mkdirSync(dataDir, { recursive: true });
let database;
try {
  if (!fs.existsSync(databasePath)) {
    database = buildEmptyDatabaseV2();
    const check = validateDatabaseV2(database);
    if (!check.valid) throw new Error('Seed V2 không hợp lệ: ' + JSON.stringify(check.errors));
    writeDatabase(database);
  } else {
    const current = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
    if (current.schemaVersion !== 2) {
      const mig = migrateDatabaseFile(databasePath, seedData.policies);
      database = mig.data;
      console.log(`Đã migration V1 -> V2 thành công. Backup: ${mig.backupPath}`);
    } else {
      database = current;
    }
    const check = validateDatabaseV2(database);
    if (!check.valid) {
      throw new Error('Sai cấu trúc Schema V2: ' + check.errors.map(e => `${e.path}: ${e.message}`).join('; '));
    }
    // Bổ sung các nhóm chính sách mới còn thiếu (không ghi đè nội dung Admin đã chỉnh sửa)
    const defPol = seedData.policies || {};
    const curPol = database.state.policies;
    let polChanged = false;
    if (!curPol.visibility || typeof curPol.visibility !== 'object') {
      curPol.visibility = structuredClone(defPol.visibility || {});
      polChanged = true;
    }
    if (defPol.storeInfo) {
      for (const [k, v] of Object.entries(defPol.storeInfo)) {
        if (curPol.storeInfo[k] === undefined) { curPol.storeInfo[k] = v; polChanged = true; }
      }
    }
    if (defPol.items) {
      for (const [k, v] of Object.entries(defPol.items)) {
        if (curPol.items[k] === undefined) { curPol.items[k] = v; polChanged = true; }
        if (curPol.visibility[k] === undefined) { curPol.visibility[k] = true; polChanged = true; }
      }
    }
    if (polChanged) writeDatabase(database);
  }
} catch (err) {
  console.error(`Không thể khởi tạo ${databasePath}: ${err.message}`);
  process.exit(1);
}

// Hàng đợi ghi tuần tự trong tiến trình Node.js
let writeQueue = Promise.resolve();

function runTransaction(expectedRevision, mutateFn) {
  const task = writeQueue.then(() => {
    if (expectedRevision !== undefined && expectedRevision !== null) {
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
        const err = new Error('Revision không hợp lệ.');
        err.statusCode = 400;
        err.code = 'invalid_revision';
        throw err;
      }
      if (expectedRevision !== database.revision) {
        const err = new Error('Dữ liệu vừa được thay đổi ở phiên khác.');
        err.statusCode = 409;
        err.code = 'conflict';
        throw err;
      }
    }

    const draftState = structuredClone(database.state);
    const result = mutateFn(draftState);

    const next = {
      schemaVersion: 2,
      revision: database.revision + 1,
      state: draftState,
    };

    const validation = validateDatabaseV2(next);
    if (!validation.valid) {
      const err = new Error('Dữ liệu sau cập nhật không hợp lệ: ' + validation.errors.map(e => `${e.path}: ${e.message}`).join('; '));
      err.statusCode = 400;
      err.code = 'invalid_state';
      throw err;
    }

    writeDatabase(next);
    database = next;
    broadcastSse(database.revision);
    return { revision: database.revision, state: database.state, result };
  });

  // Giữ queue sống kể cả khi 1 transaction lỗi
  writeQueue = task.catch(() => {});
  return task;
}

// =========================================================
// HTTP HELPERS & SECURITY MIDDLEWARE
// =========================================================
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
};

function sendJson(res, code, value, headers = {}) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(JSON.stringify(value));
}

function isSameOriginUrl(rawUrl, hostHeader) {
  try {
    const u = new URL(rawUrl);
    return (u.protocol === 'http:' || u.protocol === 'https:') &&
      (u.hostname === '127.0.0.1' || u.hostname === 'localhost') &&
      u.host === hostHeader;
  } catch {
    return false;
  }
}

function isTrustedWriteRequest(req) {
  // Bắt buộc custom header cho mọi request thay đổi dữ liệu
  if (req.headers['x-vp-requested'] !== '1') return false;
  const hostHeader = req.headers.host;
  if (req.headers.origin) {
    return isSameOriginUrl(req.headers.origin, hostHeader);
  }
  if (req.headers.referer) {
    return isSameOriginUrl(req.headers.referer, hostHeader);
  }
  // Khi thiếu cả Origin lẫn Referer: chỉ cho phép khi đã có X-VP-Requested: 1 (đã check ở trên)
  return true;
}

function verifyWriteRequest(req, res, requireJson = true) {
  if (!isTrustedWriteRequest(req)) {
    sendJson(res, 403, { error: 'forbidden_csrf' });
    return false;
  }
  if (requireJson && !/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) {
    sendJson(res, 415, { error: 'json_required' });
    return false;
  }
  return true;
}

function requireAdmin(req, res) {
  const session = getAdminSession(req);
  if (!session) {
    sendJson(res, 401, { error: 'unauthorized', message: 'Yêu cầu đăng nhập quản trị.' });
    return null;
  }
  return session;
}

function requireCustomer(req, res) {
  const session = getCustomerSession(req);
  if (!session) {
    sendJson(res, 401, { error: 'customer_unauthorized', message: 'Vui lòng đăng nhập tài khoản khách hàng.' });
    return null;
  }
  const customer = database.state.customers.find(c => c.id === session.customerId);
  if (!customer || customer.locked) {
    customerSessions.delete(session.token);
    sendJson(res, 403, { error: 'account_locked', message: 'Tài khoản khách hàng đã bị khóa hoặc không tồn tại.' });
    return null;
  }
  return { session, customer };
}

function parseJsonBody(req, callback) {
  let chunks = [], size = 0, tooLarge = false;
  req.on('data', chunk => {
    size += chunk.length;
    if (size > MAX_BODY) {
      tooLarge = true;
      chunks = [];
    } else if (!tooLarge) {
      chunks.push(chunk);
    }
  });
  req.on('end', () => {
    if (tooLarge) return callback({ code: 413, error: 'body_too_large' });
    if (chunks.length === 0) return callback(null, {});
    try {
      const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      callback(null, data);
    } catch {
      callback({ code: 400, error: 'invalid_json' });
    }
  });
}

function sanitizeAdminState(state) {
  const cloned = structuredClone(state);
  cloned.customers = cloned.customers.map(({ passwordHash, passwordSalt, ...rest }) => rest);
  return cloned;
}

function adjustStockWithLog(draftState, sku, productId, delta, reason, refId, actor) {
  const beforeQty = draftState.stock[sku] ?? 0;
  const afterQty = beforeQty + delta;
  if (afterQty < 0) {
    const err = new Error(`Không đủ tồn kho cho SKU ${sku}.`);
    err.statusCode = 409;
    err.code = 'insufficient_stock';
    throw err;
  }
  draftState.stock[sku] = afterQty;
  draftState.inventoryLogs.push({
    id: 'log_' + crypto.randomBytes(6).toString('hex'),
    sku,
    productId,
    beforeQty,
    delta,
    afterQty,
    reason,
    refId,
    actor,
    createdAt: new Date().toISOString(),
  });
}

function recordAdminLog(draftState, actor, action, targetId, detail) {
  draftState.adminActivityLogs.push({
    id: 'act_' + crypto.randomBytes(6).toString('hex'),
    actor,
    action,
    targetId,
    detail,
    createdAt: new Date().toISOString(),
  });
}

const handleAdminRoutes = createAdminHandler({
  sendJson,
  parseJsonBody,
  verifyWriteRequest,
  requireAdmin,
  runTransaction,
  sanitizeAdminState,
  adjustStockWithLog,
  recordAdminLog,
  customerSessions,
  getDatabase: () => database,
  BUSINESS_CONFIG,
  buildSku,
  COLOR_CODE_MAP,
  ENUMS,
  ID_REGEX,
});

const handleCustomerOrderRoutes = createCustomerOrderHandler({
  sendJson,
  parseJsonBody,
  verifyWriteRequest,
  requireCustomer,
  runTransaction,
  adjustStockWithLog,
  getDatabase: () => database,
  BUSINESS_CONFIG,
});

const sweepExpiredOnlineOrders = createHoldSweeper({
  getDatabase: () => database,
  runTransaction,
  adjustStockWithLog,
});

// =========================================================
// HTTP SERVER ROUTING
// =========================================================
const server = http.createServer((req, res) => {
  const requestHost = (req.headers.host || '').toLowerCase();
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(requestHost)) {
    return sendJson(res, 403, { error: 'forbidden_host' });
  }
  let urlObj;
  let pathname;
  try {
    urlObj = new URL(req.url, 'http://localhost');
    pathname = decodeURIComponent(urlObj.pathname);
  } catch {
    return sendJson(res, 400, { error: 'invalid_url' });
  }

  // Khóa vĩnh viễn /api/state công khai
  if (pathname === '/api/state') {
    return sendJson(res, 403, { error: 'legacy_api_disabled', message: 'API /api/state đã bị khóa. Vui lòng sử dụng Public, Customer hoặc Admin API.' });
  }

  // -------------------------------------------------------
  // 1. PUBLIC API
  // -------------------------------------------------------
  if (pathname === '/api/public/bootstrap') {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });
    const s = database.state;
    const activeCategories = s.categories.filter(c => c.active);
    const activeProducts = s.products.filter(p => p.active);
    const activeSkus = new Set();
    for (const p of activeProducts) {
      for (const v of p.variants) {
        if (v.active) activeSkus.add(v.sku);
      }
    }
    const publicStock = {};
    for (const sku of activeSkus) {
      publicStock[sku] = s.stock[sku] ?? 0;
    }
    const vis = (s.policies && s.policies.visibility) || {};
    const publicItems = {};
    for (const [k, v] of Object.entries((s.policies && s.policies.items) || {})) {
      if (vis[k] !== false) publicItems[k] = v;
    }
    const nowMs = Date.now();
    const publicPromotions = (s.promotions || [])
      .filter(p => p.active && Date.parse(p.startAt) <= nowMs && Date.parse(p.endAt) >= nowMs && (p.usedCount || 0) < (p.usageLimit || 0))
      .map(p => ({
        code: p.code,
        name: p.name || p.code,
        description: p.description || '',
        type: p.type,
        value: p.value,
        minOrder: p.minOrder || 0,
        maxDiscount: p.maxDiscount ?? null,
        startAt: p.startAt,
        endAt: p.endAt,
        remainingUses: Math.max(0, (p.usageLimit || 0) - (p.usedCount || 0)),
      }));
    return sendJson(res, 200, {
      categories: activeCategories,
      products: activeProducts,
      stock: publicStock,
      policies: {
        ...s.policies,
        items: publicItems,
      },
      promotions: publicPromotions,
      siteContent: s.policies.banners || {},
      config: BUSINESS_CONFIG,
    });
  }

  if (pathname === '/api/public/track') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
    if (!verifyWriteRequest(req, res)) return;
    parseJsonBody(req, async (err, body) => {
      if (err) return sendJson(res, err.code, { error: err.error });
      const type = body?.type;
      if (type !== 'visit' && type !== 'cart') {
        return sendJson(res, 400, { error: 'invalid_track_type' });
      }
      try {
        await runTransaction(null, draft => {
          if (type === 'visit') draft.visits += 1;
          else draft.cartEvents += 1;
        });
        return sendJson(res, 200, { ok: true });
      } catch (e) {
        return sendJson(res, e.statusCode || 500, { error: e.code || 'track_failed' });
      }
    });
    return;
  }

  if (pathname === '/api/public/contact') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
    if (!verifyWriteRequest(req, res)) return;
    if (!checkPublicContactRateLimit(req.socket.remoteAddress || 'local')) {
      return sendJson(res, 429, { error: 'rate_limited', message: 'Bạn gửi phản hồi quá nhanh. Vui lòng thử lại sau ít phút.' });
    }
    parseJsonBody(req, async (err, body) => {
      if (err) return sendJson(res, err.code, { error: err.error });
      const name = String(body?.name || '').trim();
      const email = String(body?.email || '').trim().toLowerCase();
      const message = String(body?.message || '').trim();
      if (name.length < 2 || name.length > 100) {
        return sendJson(res, 400, { error: 'invalid_name', message: 'Họ và tên cần từ 2 đến 100 ký tự.' });
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
        return sendJson(res, 400, { error: 'invalid_email', message: 'Email không hợp lệ.' });
      }
      if (message.length < 5 || message.length > 2000) {
        return sendJson(res, 400, { error: 'invalid_message', message: 'Nội dung phản hồi cần từ 5 đến 2000 ký tự.' });
      }
      try {
        const txRes = await runTransaction(null, draft => {
          const now = new Date().toISOString();
          const ticket = {
            id: 'fb_' + crypto.randomBytes(6).toString('hex'),
            customerId: null,
            orderId: null,
            source: 'contact_feedback',
            senderName: name,
            email,
            subject: `Phản hồi nhanh từ ${name}`.slice(0, 200),
            message,
            status: 'open',
            adminReply: '',
            createdAt: now,
            updatedAt: now,
          };
          draft.supportTickets.push(ticket);
          return ticket;
        });
        return sendJson(res, 201, { ok: true, ticketId: txRes.result.id });
      } catch (e) {
        return sendJson(res, e.statusCode || 500, { error: e.code || 'contact_failed', message: e.message });
      }
    });
    return;
  }

  if (pathname === '/api/public/events') {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });
    return openSseStream(req, res, publicSseClients);
  }

  // -------------------------------------------------------
  // 2. CUSTOMER API (GĐ2 – TÀI KHOẢN KHÁCH HÀNG)
  // -------------------------------------------------------
  const normalizeEmail = e => String(e || '').trim().toLowerCase();
  const isValidEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 200;
  const normalizePhone = p => String(p || '').trim().replace(/[\s.-]/g, '').replace(/^\+84/, '0');
  const isValidPhone = p => /^0\d{8,10}$/.test(p);
  const publicCustomerView = c => ({
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    defaultAddress: c.defaultAddress || '',
    createdAt: c.createdAt,
    updatedAt: c.updatedAt || c.createdAt,
  });
  function verifyCustomerPass(password, c) {
    if (!c || typeof password !== 'string') return false;
    try {
      const hash = crypto.scryptSync(password, c.passwordSalt, 64);
      const expected = Buffer.from(c.passwordHash, 'hex');
      return hash.length === expected.length && crypto.timingSafeEqual(hash, expected);
    } catch {
      return false;
    }
  }
  function revokeCustomerSessions(customerId) {
    for (const [tok, sess] of customerSessions.entries()) {
      if (sess.customerId === customerId) customerSessions.delete(tok);
    }
  }

  if (pathname === '/api/customer/register') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
    if (!verifyWriteRequest(req, res)) return;
    parseJsonBody(req, async (err, body) => {
      if (err) return sendJson(res, err.code, { error: err.error });
      const name = String(body?.name || '').trim();
      const email = normalizeEmail(body?.email);
      const phone = normalizePhone(body?.phone);
      const password = body?.password;

      if (name.length < 2 || name.length > 150) {
        return sendJson(res, 400, { error: 'invalid_name', message: 'Họ và tên phải từ 2 đến 150 ký tự.' });
      }
      if (!isValidEmail(email)) {
        return sendJson(res, 400, { error: 'invalid_email', message: 'Email không hợp lệ.' });
      }
      if (!isValidPhone(phone)) {
        return sendJson(res, 400, { error: 'invalid_phone', message: 'Số điện thoại không hợp lệ (gồm 9-11 chữ số, bắt đầu bằng 0).' });
      }
      if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
        return sendJson(res, 400, { error: 'invalid_password', message: 'Mật khẩu phải có ít nhất 8 ký tự.' });
      }

      try {
        const txRes = await runTransaction(null, draft => {
          if (draft.customers.some(c => c.email === email)) {
            const e = new Error('Email này đã được đăng ký.');
            e.statusCode = 409; e.code = 'email_exists'; throw e;
          }
          if (draft.customers.some(c => c.phone === phone)) {
            const e = new Error('Số điện thoại này đã được đăng ký.');
            e.statusCode = 409; e.code = 'phone_exists'; throw e;
          }
          const salt = crypto.randomBytes(16).toString('hex');
          const hash = crypto.scryptSync(password, salt, 64).toString('hex');
          const nowIso = new Date().toISOString();
          const customer = {
            id: 'cus_' + crypto.randomBytes(6).toString('hex'),
            name,
            email,
            phone,
            defaultAddress: '',
            passwordSalt: salt,
            passwordHash: hash,
            locked: false,
            lockedReason: '',
            createdAt: nowIso,
            updatedAt: nowIso,
          };
          draft.customers.push(customer);
          return customer;
        });

        const token = crypto.randomBytes(32).toString('hex');
        const now = Date.now();
        customerSessions.set(token, { customerId: txRes.result.id, expiresAt: now + SESSION_TTL_MS, lastActiveAt: now });
        const cookie = `vp_customer_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400`;
        return sendJson(res, 201, { customer: publicCustomerView(txRes.result) }, { 'Set-Cookie': cookie });
      } catch (e) {
        return sendJson(res, e.statusCode || 500, { error: e.code || 'register_failed', message: e.message });
      }
    });
    return;
  }

  if (pathname === '/api/customer/login') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
    if (!verifyWriteRequest(req, res)) return;
    const rateKey = 'cust:' + (req.socket.remoteAddress || 'local');
    if (!checkLoginRateLimit(rateKey)) {
      return sendJson(res, 429, { error: 'too_many_requests', message: 'Thử đăng nhập sai quá nhiều lần. Vui lòng đợi 5 phút.' });
    }
    parseJsonBody(req, (err, body) => {
      if (err) return sendJson(res, err.code, { error: err.error });
      const email = normalizeEmail(body?.email);
      const password = body?.password;
      const customer = database.state.customers.find(c => c.email === email);
      if (!customer || typeof password !== 'string' || !verifyCustomerPass(password, customer)) {
        recordLoginFailure(rateKey);
        return sendJson(res, 401, { error: 'invalid_credentials', message: 'Email hoặc mật khẩu không đúng.' });
      }
      if (customer.locked) {
        return sendJson(res, 403, { error: 'account_locked', message: 'Tài khoản của bạn đã bị khóa.' });
      }
      clearLoginFailures(rateKey);
      const token = crypto.randomBytes(32).toString('hex');
      const now = Date.now();
      customerSessions.set(token, { customerId: customer.id, expiresAt: now + SESSION_TTL_MS, lastActiveAt: now });
      const cookie = `vp_customer_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400`;
      return sendJson(res, 200, { customer: publicCustomerView(customer) }, { 'Set-Cookie': cookie });
    });
    return;
  }

  if (pathname === '/api/customer/logout') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
    if (!verifyWriteRequest(req, res, false)) return;
    const session = getCustomerSession(req);
    if (session) customerSessions.delete(session.token);
    const cookie = `vp_customer_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
    return sendJson(res, 200, { success: true }, { 'Set-Cookie': cookie });
  }

  if (pathname === '/api/customer/session') {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });
    const session = getCustomerSession(req);
    if (!session) return sendJson(res, 200, { loggedIn: false });
    const customer = database.state.customers.find(c => c.id === session.customerId);
    if (!customer || customer.locked) {
      customerSessions.delete(session.token);
      return sendJson(res, 200, { loggedIn: false });
    }
    return sendJson(res, 200, { loggedIn: true, customer: publicCustomerView(customer) });
  }

  if (pathname === '/api/customer/me') {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });
    const auth = requireCustomer(req, res);
    if (!auth) return;
    return sendJson(res, 200, { customer: publicCustomerView(auth.customer) });
  }

  if (pathname === '/api/customer/profile') {
    if (req.method !== 'PUT') return sendJson(res, 405, { error: 'method_not_allowed' });
    if (!verifyWriteRequest(req, res)) return;
    const auth = requireCustomer(req, res);
    if (!auth) return;
    parseJsonBody(req, async (err, body) => {
      if (err) return sendJson(res, err.code, { error: err.error });
      const name = String(body?.name || '').trim();
      const phone = normalizePhone(body?.phone);
      const defaultAddress = String(body?.defaultAddress ?? '').trim();
      if (name.length < 2 || name.length > 150) {
        return sendJson(res, 400, { error: 'invalid_name', message: 'Họ và tên phải từ 2 đến 150 ký tự.' });
      }
      if (!isValidPhone(phone)) {
        return sendJson(res, 400, { error: 'invalid_phone', message: 'Số điện thoại không hợp lệ.' });
      }
      if (defaultAddress.length > 500) {
        return sendJson(res, 400, { error: 'invalid_address', message: 'Địa chỉ tối đa 500 ký tự.' });
      }
      try {
        const txRes = await runTransaction(null, draft => {
          const c = draft.customers.find(x => x.id === auth.customer.id);
          if (!c || c.locked) {
            const e = new Error('Tài khoản không khả dụng.');
            e.statusCode = 403; e.code = 'account_locked'; throw e;
          }
          if (draft.customers.some(x => x.id !== c.id && x.phone === phone)) {
            const e = new Error('Số điện thoại đã được tài khoản khác sử dụng.');
            e.statusCode = 409; e.code = 'phone_exists'; throw e;
          }
          c.name = name;
          c.phone = phone;
          c.defaultAddress = defaultAddress;
          c.updatedAt = new Date().toISOString();
          return c;
        });
        return sendJson(res, 200, { customer: publicCustomerView(txRes.result) });
      } catch (e) {
        return sendJson(res, e.statusCode || 500, { error: e.code || 'profile_update_failed', message: e.message });
      }
    });
    return;
  }

  if (pathname === '/api/customer/change-password') {
    if (req.method !== 'PUT') return sendJson(res, 405, { error: 'method_not_allowed' });
    if (!verifyWriteRequest(req, res)) return;
    const auth = requireCustomer(req, res);
    if (!auth) return;
    parseJsonBody(req, async (err, body) => {
      if (err) return sendJson(res, err.code, { error: err.error });
      const currentPassword = body?.currentPassword;
      const newPassword = body?.newPassword;
      if (typeof currentPassword !== 'string' || !verifyCustomerPass(currentPassword, auth.customer)) {
        return sendJson(res, 401, { error: 'invalid_current_password', message: 'Mật khẩu hiện tại không đúng.' });
      }
      if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 128) {
        return sendJson(res, 400, { error: 'invalid_new_password', message: 'Mật khẩu mới phải có ít nhất 8 ký tự.' });
      }
      try {
        await runTransaction(null, draft => {
          const c = draft.customers.find(x => x.id === auth.customer.id);
          if (!c || c.locked) {
            const e = new Error('Tài khoản không khả dụng.');
            e.statusCode = 403; e.code = 'account_locked'; throw e;
          }
          const salt = crypto.randomBytes(16).toString('hex');
          const hash = crypto.scryptSync(newPassword, salt, 64).toString('hex');
          c.passwordSalt = salt;
          c.passwordHash = hash;
          c.updatedAt = new Date().toISOString();
        });
        revokeCustomerSessions(auth.customer.id);
        const clearCookie = `vp_customer_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
        return sendJson(res, 200, { success: true, message: 'Đổi mật khẩu thành công. Vui lòng đăng nhập lại.' }, { 'Set-Cookie': clearCookie });
      } catch (e) {
        return sendJson(res, e.statusCode || 500, { error: e.code || 'change_password_failed', message: e.message });
      }
    });
    return;
  }

  if (handleCustomerOrderRoutes(req, res, pathname) || res.writableEnded || res.headersSent) return;

  if (pathname === '/api/customer/orders') {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });
    const auth = requireCustomer(req, res);
    if (!auth) return;
    const myOrders = database.state.orders
      .filter(o => o.customerId === auth.customer.id)
      .slice()
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return sendJson(res, 200, { orders: myOrders });
  }

  const customerOrderDetailMatch = pathname.match(/^\/api\/customer\/orders\/([^/]+)$/);
  if (customerOrderDetailMatch) {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });
    const auth = requireCustomer(req, res);
    if (!auth) return;
    const order = database.state.orders.find(o => o.id === customerOrderDetailMatch[1]);
    if (!order) return sendJson(res, 404, { error: 'not_found' });
    if (order.customerId !== auth.customer.id) {
      return sendJson(res, 403, { error: 'forbidden_order_access', message: 'Bạn không có quyền xem đơn hàng này.' });
    }
    return sendJson(res, 200, { order });
  }

  if (pathname === '/api/orders' || pathname.startsWith('/api/orders/')) {
    const auth = requireCustomer(req, res);
    if (!auth) return;
    return sendJson(res, 501, { error: 'not_implemented_in_gd2' });
  }

  // Test-only fixture endpoint (chỉ bật khi VIETPHUC_TEST_MODE=1 để kiểm thử phân tách session)
  if (process.env.VIETPHUC_TEST_MODE === '1' && pathname === '/api/_test/customer-session') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
    parseJsonBody(req, async (err, body) => {
      if (err) return sendJson(res, err.code, { error: err.error });
      const { customerId, name, email, phone, locked } = body || {};
      try {
        await runTransaction(null, draft => {
          let c = draft.customers.find(x => x.id === customerId);
          if (!c) {
            const salt = crypto.randomBytes(16).toString('hex');
            const hash = crypto.scryptSync('test-pass-only', salt, 64).toString('hex');
            const uniqueDigits = String(crypto.createHash('md5').update(String(customerId)).digest('hex').replace(/\D/g, '') + '00000000').slice(0, 8);
            c = {
              id: customerId,
              name: name || 'Test Customer',
              email: email || `${customerId}@example.com`,
              phone: phone || `09${uniqueDigits}`,
              defaultAddress: '',
              passwordSalt: salt,
              passwordHash: hash,
              locked: Boolean(locked),
              lockedReason: locked ? 'Test lock' : '',
              createdAt: new Date().toISOString(),
            };
            draft.customers.push(c);
          } else if (typeof locked === 'boolean') {
            c.locked = locked;
          }
        });
        const token = crypto.randomBytes(32).toString('hex');
        const now = Date.now();
        customerSessions.set(token, { customerId, expiresAt: now + SESSION_TTL_MS, lastActiveAt: now });
        return sendJson(res, 200, { ok: true }, { 'Set-Cookie': `vp_customer_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400` });
      } catch (e) {
        return sendJson(res, 500, { error: e.message });
      }
    });
    return;
  }

  // -------------------------------------------------------
  // 3. ADMIN AUTH (HOẠT ĐỘNG KHI CHƯA ĐĂNG NHẬP)
  // -------------------------------------------------------
  if (pathname === '/api/admin/login') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
    if (!verifyWriteRequest(req, res)) return;
    const creds = loadAdminCredentials();
    if (!creds) {
      return sendJson(res, 503, {
        error: 'admin_not_configured',
        message: 'Tài khoản Admin chưa được cấu hình. Hãy thiết lập biến môi trường hoặc chạy node scripts/init-admin.js.',
      });
    }
    const rateKey = req.socket.remoteAddress || 'local';
    if (!checkLoginRateLimit(rateKey)) {
      return sendJson(res, 429, { error: 'too_many_requests', message: 'Thử đăng nhập sai quá nhiều lần. Vui lòng đợi 5 phút.' });
    }
    parseJsonBody(req, (err, body) => {
      if (err) return sendJson(res, err.code, { error: err.error });
      const { username, password } = body || {};
      if (username !== creds.username || typeof password !== 'string' || !verifyAdminPassword(password, creds)) {
        recordLoginFailure(rateKey);
        return sendJson(res, 401, { error: 'invalid_credentials', message: 'Tài khoản hoặc mật khẩu không đúng.' });
      }
      clearLoginFailures(rateKey);
      const token = crypto.randomBytes(32).toString('hex');
      const now = Date.now();
      adminSessions.set(token, { user: creds.username, role: 'admin', expiresAt: now + SESSION_TTL_MS, lastActiveAt: now });
      const cookie = `vp_admin_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400`;
      return sendJson(res, 200, { success: true, user: creds.username, role: 'admin' }, { 'Set-Cookie': cookie });
    });
    return;
  }

  if (pathname === '/api/admin/session') {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });
    const session = getAdminSession(req);
    if (!session) return sendJson(res, 200, { loggedIn: false });
    return sendJson(res, 200, { loggedIn: true, user: session.user, role: session.role });
  }

  if (pathname === '/api/admin/logout') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
    if (!verifyWriteRequest(req, res, false)) return;
    const session = getAdminSession(req);
    if (session) adminSessions.delete(session.token);
    const cookie = `vp_admin_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
    return sendJson(res, 200, { success: true }, { 'Set-Cookie': cookie });
  }

  // -------------------------------------------------------
  // 4. ADMIN DATA API (BẮT BUỘC requireAdmin)
  // -------------------------------------------------------
  if (pathname === '/api/admin/bootstrap') {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });
    if (!requireAdmin(req, res)) return;
    return sendJson(res, 200, { revision: database.revision, state: sanitizeAdminState(database.state), config: BUSINESS_CONFIG });
  }

  if (pathname === '/api/admin/events') {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });
    if (!requireAdmin(req, res)) return;
    return openSseStream(req, res, adminSseClients);
  }

  // Cập nhật trạng thái đơn hàng
  const orderStatusMatch = pathname.match(/^\/api\/admin\/orders\/([^/]+)\/status$/);
  if (orderStatusMatch) {
    if (req.method !== 'PATCH') return sendJson(res, 405, { error: 'method_not_allowed' });
    if (!verifyWriteRequest(req, res)) return;
    const session = requireAdmin(req, res);
    if (!session) return;
    const orderId = orderStatusMatch[1];

    parseJsonBody(req, async (err, body) => {
      if (err) return sendJson(res, err.code, { error: err.error });
      const { nextStatus, revision, note } = body || {};
      try {
        const txRes = await runTransaction(revision, draft => {
          const o = draft.orders.find(x => x.id === orderId);
          if (!o) {
            const e = new Error('Không tìm thấy đơn hàng.');
            e.statusCode = 404; e.code = 'not_found'; throw e;
          }
          const allowed = {
            pending: ['confirmed', 'cancelled'],
            confirmed: ['packing', 'shipping', 'cancelled'],
            packing: ['shipping', 'cancelled'],
            shipping: ['delivered', 'delivery_failed'],
            delivery_failed: ['returning'],
            returning: ['returned'],
          };
          if (!allowed[o.orderStatus] || !allowed[o.orderStatus].includes(nextStatus)) {
            const e = new Error('Trạng thái đơn hàng không hợp lệ cho thao tác này.');
            e.statusCode = 409; e.code = 'invalid_transition'; throw e;
          }
          if (nextStatus === 'shipping' && o.paymentMethod === 'online' && o.paymentStatus !== 'paid') {
            const e = new Error('Chặn thao tác: Đơn thanh toán trực tuyến chưa hoàn tất thanh toán.');
            e.statusCode = 409; e.code = 'payment_required'; throw e;
          }

          const now = new Date().toISOString();
          o.orderStatus = nextStatus;

          if (nextStatus === 'shipping') {
            o.inventoryStatus = 'fulfilled';
            o.shipment.shippedAt = now;
          } else if (nextStatus === 'delivered') {
            o.shipment.deliveredAt = now;
            if (o.paymentMethod === 'COD' && o.paymentStatus === 'unpaid') {
              o.paymentStatus = 'paid';
              o.transactions.push({ id: 'tx_cod_' + crypto.randomBytes(4).toString('hex'), method: 'COD', amount: o.total, status: 'success', isSimulated: true, createdAt: now, actor: session.user });
            }
          } else if (nextStatus === 'returned' || nextStatus === 'cancelled') {
            if (o.inventoryStatus === 'reserved' || o.inventoryStatus === 'fulfilled') {
              for (const it of o.items) {
                if (it.sku && Object.prototype.hasOwnProperty.call(draft.stock, it.sku)) {
                  adjustStockWithLog(draft, it.sku, it.productId, it.qty, nextStatus === 'cancelled' ? 'order_cancel' : 'order_returned', o.id, session.user);
                }
              }
              o.inventoryStatus = nextStatus === 'cancelled' ? 'released' : 'returned';
            }
            if (nextStatus === 'returned') o.shipment.returnedAt = now;
          }

          o.history.push({ status: nextStatus, note: note || `Admin chuyển trạng thái sang ${nextStatus}`, actor: session.user, at: now });
          recordAdminLog(draft, session.user, 'order_status', o.id, `${nextStatus}`);
          return o;
        });
        return sendJson(res, 200, { revision: txRes.revision, order: txRes.result, state: sanitizeAdminState(txRes.state) });
      } catch (e) {
        const extra = e.code === 'conflict' ? { revision: database.revision, state: sanitizeAdminState(database.state) } : {};
        return sendJson(res, e.statusCode || 500, { error: e.code || 'update_failed', message: e.message, ...extra });
      }
    });
    return;
  }

  // Hoàn tiền mô phỏng (từ Admin UI hiện có)
  const orderRefundMatch = pathname.match(/^\/api\/admin\/orders\/([^/]+)\/refund$/);
  if (orderRefundMatch) {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
    if (!verifyWriteRequest(req, res)) return;
    const session = requireAdmin(req, res);
    if (!session) return;
    const orderId = orderRefundMatch[1];

    parseJsonBody(req, async (err, body) => {
      if (err) return sendJson(res, err.code, { error: err.error });
      const { amount, reason, revision } = body || {};
      try {
        const txRes = await runTransaction(revision, draft => {
          const o = draft.orders.find(x => x.id === orderId);
          if (!o) {
            const e = new Error('Không tìm thấy đơn hàng.');
            e.statusCode = 404; e.code = 'not_found'; throw e;
          }
          const paid = o.transactions.filter(t => t.status === 'success').reduce((s, t) => s + t.amount, 0);
          const refunded = o.refunds.filter(r => r.status === 'success').reduce((s, r) => s + r.amount, 0);
          const reqAmount = Number.isSafeInteger(amount) ? amount : o.total;
          if (reqAmount <= 0 || refunded + reqAmount > paid) {
            const e = new Error('Số tiền hoàn vượt quá số tiền đã thanh toán hoặc đã hoàn đủ.');
            e.statusCode = 409; e.code = 'invalid_refund_amount'; throw e;
          }
          const now = new Date().toISOString();
          o.refunds.push({
            id: 'rf_' + crypto.randomBytes(5).toString('hex'),
            transactionId: o.transactions.find(t => t.status === 'success')?.id || null,
            amount: reqAmount,
            status: 'success',
            isSimulated: true,
            reason: reason || 'Admin xác nhận hoàn tiền mô phỏng',
            createdAt: now,
            actor: session.user,
          });
          o.paymentStatus = (refunded + reqAmount === paid) ? 'refunded' : 'partially_refunded';
          o.history.push({ status: o.orderStatus, note: `Hoàn tiền mô phỏng ${reqAmount}`, actor: session.user, at: now });
          recordAdminLog(draft, session.user, 'order_refund', o.id, `Hoàn ${reqAmount}`);
          return o;
        });
        return sendJson(res, 200, { revision: txRes.revision, order: txRes.result, state: sanitizeAdminState(txRes.state) });
      } catch (e) {
        const extra = e.code === 'conflict' ? { revision: database.revision, state: sanitizeAdminState(database.state) } : {};
        return sendJson(res, e.statusCode || 500, { error: e.code || 'refund_failed', message: e.message, ...extra });
      }
    });
    return;
  }

  // Đối soát COD mô phỏng
  const orderSettleMatch = pathname.match(/^\/api\/admin\/orders\/([^/]+)\/settle$/);
  if (orderSettleMatch) {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
    if (!verifyWriteRequest(req, res)) return;
    const session = requireAdmin(req, res);
    if (!session) return;
    const orderId = orderSettleMatch[1];

    parseJsonBody(req, async (err, body) => {
      if (err) return sendJson(res, err.code, { error: err.error });
      const { revision } = body || {};
      try {
        const txRes = await runTransaction(revision, draft => {
          const o = draft.orders.find(x => x.id === orderId);
          if (!o) {
            const e = new Error('Không tìm thấy đơn hàng.');
            e.statusCode = 404; e.code = 'not_found'; throw e;
          }
          if (o.settlementStatus === 'settled') {
            const e = new Error('Đơn hàng đã được đối soát trước đó.');
            e.statusCode = 409; e.code = 'already_settled'; throw e;
          }
          if (o.orderStatus !== 'delivered') {
            const e = new Error('Chỉ đối soát đơn hàng đã giao thành công.');
            e.statusCode = 409; e.code = 'invalid_order_status'; throw e;
          }
          const now = new Date().toISOString();
          o.settlementStatus = 'settled';
          o.settledAt = now;
          o.history.push({ status: o.orderStatus, note: 'Đã đối soát COD mô phỏng', actor: session.user, at: now });
          recordAdminLog(draft, session.user, 'order_settle', o.id, 'settled');
          return o;
        });
        return sendJson(res, 200, { revision: txRes.revision, order: txRes.result, state: sanitizeAdminState(txRes.state) });
      } catch (e) {
        const extra = e.code === 'conflict' ? { revision: database.revision, state: sanitizeAdminState(database.state) } : {};
        return sendJson(res, e.statusCode || 500, { error: e.code || 'settle_failed', message: e.message, ...extra });
      }
    });
    return;
  }

  // Duyệt / nhận kiểm tra / từ chối đổi trả & bảo hành (2.4.7)
  const returnMatch = pathname.match(/^\/api\/admin\/returns\/([^/]+)$/);
  if (returnMatch) {
    if (req.method !== 'PATCH') return sendJson(res, 405, { error: 'method_not_allowed' });
    if (!verifyWriteRequest(req, res)) return;
    const session = requireAdmin(req, res);
    if (!session) return;
    const retId = returnMatch[1];

    parseJsonBody(req, async (err, body) => {
      if (err) return sendJson(res, err.code, { error: err.error });
      const { action, note, itemConditions, resolution, revision } = body || {};
      try {
        const txRes = await runTransaction(revision, draft => {
          const ret = draft.returns.find(r => r.id === retId);
          if (!ret) {
            const e = new Error('Không tìm thấy yêu cầu đổi trả.');
            e.statusCode = 404; e.code = 'not_found'; throw e;
          }
          if (ret.status === 'completed' || ret.status === 'rejected') {
            const e = new Error('Yêu cầu đã được xử lý trước đó.');
            e.statusCode = 409; e.code = 'already_resolved'; throw e;
          }
          const now = new Date().toISOString();
          const o = draft.orders.find(x => x.id === ret.orderId);
          if (action === 'approve') {
            if (ret.status !== 'pending') {
              const e = new Error('Chỉ có thể duyệt yêu cầu đang chờ xử lý.');
              e.statusCode = 409; e.code = 'invalid_transition'; throw e;
            }
            ret.status = 'approved';
            ret.approvedAt = now;
            ret.adminNote = String(note || '').trim().slice(0, 500);
            if (o) {
              o.history.push({ status: o.orderStatus, note: `Duyệt yêu cầu ${ret.type} (${ret.id}) - chờ nhận & kiểm tra hàng`, actor: session.user, at: now });
            }
          } else if (action === 'complete') {
            if (ret.status !== 'approved' && ret.status !== 'pending') {
              const e = new Error('Yêu cầu chưa ở trạng thái hợp lệ để hoàn tất.');
              e.statusCode = 409; e.code = 'invalid_transition'; throw e;
            }
            ret.status = 'completed';
            ret.resolution = resolution || (ret.type === 'warranty' ? 'warranty_done' : 'refund');
            ret.resolvedAt = now;
            ret.adminNote = String(note || ret.adminNote || '').trim().slice(0, 500);
            let restockedAny = false;
            ret.items.forEach((it, idx) => {
              const cond = itemConditions && itemConditions[idx] ? itemConditions[idx] : (it.condition === 'damaged' ? 'damaged' : 'resellable');
              if (!['resellable', 'damaged'].includes(cond)) {
                const e = new Error('Tình trạng kiểm tra hàng không hợp lệ (resellable hoặc damaged).');
                e.statusCode = 400; e.code = 'invalid_condition'; throw e;
              }
              it.condition = cond;
              if (cond === 'resellable' && ret.type !== 'warranty' && it.sku && Object.prototype.hasOwnProperty.call(draft.stock, it.sku)) {
                adjustStockWithLog(draft, it.sku, it.productId, it.qty, 'return_restock', o?.id || ret.id, session.user);
                restockedAny = true;
              }
            });
            if (o) {
              if (restockedAny) o.inventoryStatus = 'returned';
              o.history.push({ status: o.orderStatus, note: `Hoàn tất ${ret.type} (${ret.id})${restockedAny ? ' & nhập kho hàng đạt chuẩn' : ' (không nhập kho bán)'}`, actor: session.user, at: now });
            }
          } else if (action === 'reject') {
            ret.status = 'rejected';
            ret.resolvedAt = now;
            ret.adminNote = String(note || '').trim().slice(0, 500);
            if (o) o.history.push({ status: o.orderStatus, note: `Từ chối yêu cầu ${ret.type} (${ret.id}): ${note || ''}`, actor: session.user, at: now });
          } else {
            const e = new Error('Hành động không hợp lệ.');
            e.statusCode = 400; e.code = 'invalid_action'; throw e;
          }
          recordAdminLog(draft, session.user, 'return_' + action, ret.id, note || '');
          return ret;
        });
        return sendJson(res, 200, { revision: txRes.revision, returnRequest: txRes.result, state: sanitizeAdminState(txRes.state) });
      } catch (e) {
        const extra = e.code === 'conflict' ? { revision: database.revision, state: sanitizeAdminState(database.state) } : {};
        return sendJson(res, e.statusCode || 500, { error: e.code || 'return_failed', message: e.message, ...extra });
      }
    });
    return;
  }

  if (handleAdminRoutes(req, res, pathname, urlObj) || res.writableEnded || res.headersSent) return;

  if (pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'not_found' });

  // Phục vụ static files trong dist/
  if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'method_not_allowed' });
  if (pathname.includes('\0') || pathname.includes('\\')) return sendJson(res, 400, { error: 'invalid_path' });
  const requested = pathname === '/' ? '/index.html' : pathname;
  const file = path.resolve(root, '.' + requested);
  if (!file.startsWith(root + path.sep)) return sendJson(res, 403, { error: 'forbidden' });
  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) return sendJson(res, 404, { error: 'not_found' });
    res.writeHead(200, {
      'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache',
    });
    if (req.method === 'HEAD') return res.end();
    const stream = fs.createReadStream(file);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  });
});

const adminSseClients = new Set();
const publicSseClients = new Set();
const publicContactRateLimit = new Map();

function checkPublicContactRateLimit(key) {
  const now = Date.now();
  const entry = publicContactRateLimit.get(key);
  if (!entry || now > entry.resetAt) {
    publicContactRateLimit.set(key, { count: 1, resetAt: now + 60 * 1000 });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count += 1;
  return true;
}

function openSseStream(req, res, clientSet) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'X-Content-Type-Options': 'nosniff',
  });
  res.write(`event: connected\ndata: ${JSON.stringify({ revision: database.revision })}\n\n`);
  const keepalive = setInterval(() => {
    try { res.write(': keepalive\n\n'); } catch (_) {}
  }, 25000);
  if (typeof keepalive.unref === 'function') keepalive.unref();
  const entry = { res, keepalive };
  clientSet.add(entry);
  const cleanup = () => {
    clearInterval(keepalive);
    clientSet.delete(entry);
  };
  req.on('close', cleanup);
  res.on('error', cleanup);
}

function broadcastSse(revision) {
  const payload = `event: db_update\ndata: ${JSON.stringify({ revision })}\n\n`;
  for (const set of [adminSseClients, publicSseClients]) {
    for (const entry of set) {
      try {
        entry.res.write(payload);
      } catch (_) {
        clearInterval(entry.keepalive);
        set.delete(entry);
      }
    }
  }
}

function closeAllSse() {
  for (const set of [adminSseClients, publicSseClients]) {
    for (const entry of set) {
      clearInterval(entry.keepalive);
      try { entry.res.end(); } catch (_) {}
    }
    set.clear();
  }
}

let sweepTimer = null;
const sweepIntervalMs = Math.max(20, Number(process.env.VIETPHUC_SWEEP_INTERVAL_MS || 30000));

function stopHoldSweeper() {
  closeAllSse();
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
}

server.on('close', stopHoldSweeper);
process.once('SIGTERM', () => { stopHoldSweeper(); server.close(() => process.exit(0)); });
process.once('SIGINT', () => { stopHoldSweeper(); server.close(() => process.exit(0)); });

server.listen(port, host, () => {
  console.log(`Việt Phục đang chạy tại http://${host}:${server.address().port}`);
  console.log(`Dữ liệu JSON (Schema V2): ${databasePath}`);
  sweepExpiredOnlineOrders();
  sweepTimer = setInterval(() => { sweepExpiredOnlineOrders(); }, sweepIntervalMs);
  if (typeof sweepTimer.unref === 'function') sweepTimer.unref();
});
