'use strict';

const crypto = require('node:crypto');

function makeErr(message, statusCode = 400, code = 'bad_request') {
  const e = new Error(message);
  e.statusCode = statusCode;
  e.code = code;
  return e;
}

function isValidImagePath(img) {
  if (typeof img !== 'string') return false;
  const s = img.trim();
  if (!s || s.length > 500 || s.includes('\0') || s.includes('..')) return false;
  return /^(assets\/|\/assets\/|https?:\/\/)/i.test(s) || /\.(png|jpe?g|webp|gif|svg)$/i.test(s);
}

function calculatePromotionDiscount(promo, subtotal, nowMs = Date.now()) {
  if (!promo || !promo.active) return { valid: false, reason: 'Mã khuyến mãi không hoạt động.', discount: 0 };
  const start = Date.parse(promo.startAt);
  const end = Date.parse(promo.endAt);
  if (Number.isNaN(start) || Number.isNaN(end) || nowMs < start || nowMs > end) {
    return { valid: false, reason: 'Mã khuyến mãi đã hết hạn hoặc chưa đến thời gian áp dụng.', discount: 0 };
  }
  if ((promo.usedCount || 0) >= (promo.usageLimit || 0)) {
    return { valid: false, reason: 'Mã khuyến mãi đã hết lượt sử dụng.', discount: 0 };
  }
  const sub = Number(subtotal);
  if (!Number.isFinite(sub) || sub < 0) {
    return { valid: false, reason: 'Giá trị đơn hàng không hợp lệ.', discount: 0 };
  }
  if (sub < (promo.minOrder || 0)) {
    return { valid: false, reason: `Đơn hàng chưa đạt giá trị tối thiểu ${promo.minOrder}.`, discount: 0 };
  }
  let discount = promo.type === 'percent'
    ? Math.floor((sub * promo.value) / 100)
    : promo.value;
  if (promo.maxDiscount !== null && promo.maxDiscount !== undefined) {
    discount = Math.min(discount, promo.maxDiscount);
  }
  discount = Math.max(0, Math.min(discount, sub));
  return { valid: true, discount };
}

function csvCell(v) {
  const s = String(v ?? '');
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildCsv(headers, rows) {
  const lines = [headers.map(csvCell).join(',')];
  for (const row of rows) lines.push(row.map(csvCell).join(','));
  return '\uFEFF' + lines.join('\r\n');
}

function createAdminHandler(deps) {
  const {
    sendJson,
    parseJsonBody,
    verifyWriteRequest,
    requireAdmin,
    runTransaction,
    sanitizeAdminState,
    adjustStockWithLog,
    recordAdminLog,
    customerSessions,
    getDatabase,
    BUSINESS_CONFIG,
    buildSku,
    COLOR_CODE_MAP,
    ENUMS,
    ID_REGEX,
  } = deps;

  function txCatch(res, e, fallbackCode) {
    const extra = e.code === 'conflict'
      ? { revision: getDatabase().revision, state: sanitizeAdminState(getDatabase().state) }
      : {};
    return sendJson(res, e.statusCode || 500, {
      error: e.code || fallbackCode,
      message: e.message,
      ...extra,
    });
  }

  return function handleAdminRoutes(req, res, pathname, urlObj) {
    // -----------------------------------------------------
    // A. CATEGORIES (2.4.2)
    // -----------------------------------------------------
    if (pathname === '/api/admin/categories') {
      if (req.method !== 'POST') return (sendJson(res, 405, { error: 'method_not_allowed' }), true);
      if (!verifyWriteRequest(req, res)) return true;
      const session = requireAdmin(req, res);
      if (!session) return true;

      parseJsonBody(req, async (err, body) => {
        if (err) return sendJson(res, err.code, { error: err.error });
        const { id, name, description, active, sortOrder, revision } = body || {};
        try {
          const txRes = await runTransaction(revision, draft => {
            const cleanName = String(name || '').trim();
            if (!cleanName || cleanName.length > 100) throw makeErr('Tên danh mục không hợp lệ.', 400, 'invalid_name');
            const catId = id ? String(id).trim() : ('cat_' + crypto.randomBytes(3).toString('hex'));
            if (!ID_REGEX.test(catId)) throw makeErr('Mã danh mục chỉ gồm chữ, số, _ hoặc -.', 400, 'invalid_id');
            if (draft.categories.some(c => c.id === catId)) throw makeErr('Mã danh mục đã tồn tại.', 409, 'duplicate_id');
            if (draft.categories.some(c => c.name.toLowerCase() === cleanName.toLowerCase())) {
              throw makeErr('Tên danh mục đã tồn tại.', 409, 'duplicate_name');
            }
            const cat = {
              id: catId,
              name: cleanName,
              description: String(description || '').trim().slice(0, 500),
              active: active === undefined ? true : Boolean(active),
              sortOrder: Number.isInteger(sortOrder) && sortOrder >= 0 ? sortOrder : draft.categories.length + 1,
            };
            draft.categories.push(cat);
            recordAdminLog(draft, session.user, 'category_create', cat.id, cat.name);
            return cat;
          });
          return sendJson(res, 201, { revision: txRes.revision, category: txRes.result, state: sanitizeAdminState(txRes.state) });
        } catch (e) {
          return txCatch(res, e, 'category_create_failed');
        }
      });
      return true;
    }

    const catMatch = pathname.match(/^\/api\/admin\/categories\/([^/]+)$/);
    if (catMatch) {
      const catId = catMatch[1];
      if (req.method === 'PATCH') {
        if (!verifyWriteRequest(req, res)) return true;
        const session = requireAdmin(req, res);
        if (!session) return true;
        parseJsonBody(req, async (err, body) => {
          if (err) return sendJson(res, err.code, { error: err.error });
          const { name, description, active, sortOrder, revision } = body || {};
          try {
            const txRes = await runTransaction(revision, draft => {
              const cat = draft.categories.find(c => c.id === catId);
              if (!cat) throw makeErr('Không tìm thấy danh mục.', 404, 'not_found');
              if (name !== undefined) {
                const cleanName = String(name || '').trim();
                if (!cleanName || cleanName.length > 100) throw makeErr('Tên danh mục không hợp lệ.', 400, 'invalid_name');
                if (draft.categories.some(c => c.id !== catId && c.name.toLowerCase() === cleanName.toLowerCase())) {
                  throw makeErr('Tên danh mục đã tồn tại.', 409, 'duplicate_name');
                }
                cat.name = cleanName;
              }
              if (description !== undefined) cat.description = String(description || '').trim().slice(0, 500);
              if (active !== undefined) cat.active = Boolean(active);
              if (sortOrder !== undefined) {
                if (!Number.isInteger(sortOrder) || sortOrder < 0) throw makeErr('Thứ tự không hợp lệ.', 400, 'invalid_sort_order');
                cat.sortOrder = sortOrder;
              }
              recordAdminLog(draft, session.user, 'category_update', cat.id, cat.name);
              return cat;
            });
            return sendJson(res, 200, { revision: txRes.revision, category: txRes.result, state: sanitizeAdminState(txRes.state) });
          } catch (e) {
            return txCatch(res, e, 'category_update_failed');
          }
        });
        return true;
      }
      if (req.method === 'DELETE') {
        if (!verifyWriteRequest(req, res)) return true;
        const session = requireAdmin(req, res);
        if (!session) return true;
        parseJsonBody(req, async (err, body) => {
          if (err) return sendJson(res, err.code, { error: err.error });
          const { revision } = body || {};
          try {
            const txRes = await runTransaction(revision, draft => {
              const idx = draft.categories.findIndex(c => c.id === catId);
              if (idx < 0) throw makeErr('Không tìm thấy danh mục.', 404, 'not_found');
              if (draft.products.some(p => p.categoryId === catId)) {
                throw makeErr('Không thể xóa danh mục đang có sản phẩm. Hãy ẩn danh mục hoặc chuyển sản phẩm sang danh mục khác.', 409, 'category_in_use');
              }
              const [removed] = draft.categories.splice(idx, 1);
              recordAdminLog(draft, session.user, 'category_delete', removed.id, removed.name);
              return removed;
            });
            return sendJson(res, 200, { revision: txRes.revision, state: sanitizeAdminState(txRes.state) });
          } catch (e) {
            return txCatch(res, e, 'category_delete_failed');
          }
        });
        return true;
      }
      return (sendJson(res, 405, { error: 'method_not_allowed' }), true);
    }

    // -----------------------------------------------------
    // B. PRODUCTS & VARIANTS (2.4.2)
    // -----------------------------------------------------
    if (pathname === '/api/admin/products') {
      if (req.method !== 'POST') return (sendJson(res, 405, { error: 'method_not_allowed' }), true);
      if (!verifyWriteRequest(req, res)) return true;
      const session = requireAdmin(req, res);
      if (!session) return true;

      parseJsonBody(req, async (err, body) => {
        if (err) return sendJson(res, err.code, { error: err.error });
        const { id, categoryId, name, description, price, old, material, tag, img, active, featured, variants, revision } = body || {};
        try {
          const txRes = await runTransaction(revision, draft => {
            const prodId = id ? String(id).trim().toUpperCase() : ('P' + (draft.products.length + 1) + '_' + crypto.randomBytes(2).toString('hex').toUpperCase());
            if (!ID_REGEX.test(prodId)) throw makeErr('Mã sản phẩm chỉ gồm chữ, số, _ hoặc -.', 400, 'invalid_id');
            if (draft.products.some(p => p.id === prodId)) throw makeErr('Mã sản phẩm đã tồn tại.', 409, 'duplicate_id');
            if (!draft.categories.some(c => c.id === categoryId)) throw makeErr('Danh mục không tồn tại.', 400, 'invalid_category');
            const cleanName = String(name || '').trim();
            if (!cleanName || cleanName.length > 200) throw makeErr('Tên sản phẩm không hợp lệ.', 400, 'invalid_name');
            if (!Number.isInteger(price) || price < 0) throw makeErr('Giá bán phải là số nguyên >= 0.', 400, 'invalid_price');
            const oldPrice = old === undefined || old === null || old === '' ? null : Number(old);
            if (oldPrice !== null && (!Number.isInteger(oldPrice) || oldPrice < 0)) throw makeErr('Giá gốc không hợp lệ.', 400, 'invalid_old_price');
            const cleanMat = String(material || '').trim();
            if (!cleanMat || cleanMat.length > 200) throw makeErr('Chất liệu không hợp lệ.', 400, 'invalid_material');
            if (!isValidImagePath(img)) throw makeErr('Đường dẫn ảnh không hợp lệ.', 400, 'invalid_img');
            if (!Array.isArray(variants) || variants.length < 1 || variants.length > 100) {
              throw makeErr('Sản phẩm phải có ít nhất 1 biến thể.', 400, 'invalid_variants');
            }

            const existingSkus = new Set(Object.keys(draft.stock || {}));
            const seenLocal = new Set();
            const builtVariants = [];
            const stockToInit = [];

            for (const v of variants) {
              const color = String(v?.color || '').trim();
              const size = String(v?.size || '').trim();
              if (!COLOR_CODE_MAP[color]) throw makeErr(`Màu "${color}" chưa có trong bảng COLOR_CODE chuẩn.`, 400, 'unknown_color');
              if (!size || size.length > 50) throw makeErr('Kích thước biến thể không hợp lệ.', 400, 'invalid_size');
              const sku = buildSku(prodId, color, size);
              if (seenLocal.has(sku) || existingSkus.has(sku)) throw makeErr(`SKU bị trùng: ${sku}`, 409, 'duplicate_sku');
              seenLocal.add(sku);
              const initQty = v.initialStock === undefined ? 0 : Number(v.initialStock);
              if (!Number.isInteger(initQty) || initQty < 0) throw makeErr('Tồn kho ban đầu phải là số nguyên >= 0.', 400, 'invalid_stock');
              const priceOverride = v.priceOverride === undefined || v.priceOverride === null || v.priceOverride === '' ? null : Number(v.priceOverride);
              if (priceOverride !== null && (!Number.isInteger(priceOverride) || priceOverride < 0)) {
                throw makeErr('Giá biến thể không hợp lệ.', 400, 'invalid_price_override');
              }
              builtVariants.push({ sku, color, size, priceOverride, active: v.active === undefined ? true : Boolean(v.active) });
              stockToInit.push({ sku, initQty });
            }

            const now = new Date().toISOString();
            const product = {
              id: prodId,
              categoryId,
              name: cleanName,
              description: String(description || '').trim().slice(0, 4000),
              price,
              old: oldPrice,
              material: cleanMat,
              tag: String(tag || '').trim().slice(0, 100),
              img: String(img).trim(),
              active: active === undefined ? true : Boolean(active),
              featured: Boolean(featured),
              addedAt: now.slice(0, 10),
              variants: builtVariants,
            };
            draft.products.push(product);
            for (const item of stockToInit) {
              draft.stock[item.sku] = 0;
              if (item.initQty > 0) {
                adjustStockWithLog(draft, item.sku, prodId, item.initQty, 'initial_stock', prodId, session.user);
              }
            }
            recordAdminLog(draft, session.user, 'product_create', prodId, `${cleanName} (${builtVariants.length} biến thể)`);
            return product;
          });
          return sendJson(res, 201, { revision: txRes.revision, product: txRes.result, state: sanitizeAdminState(txRes.state) });
        } catch (e) {
          return txCatch(res, e, 'product_create_failed');
        }
      });
      return true;
    }

    const prodMatch = pathname.match(/^\/api\/admin\/products\/([^/]+)$/);
    if (prodMatch) {
      if (req.method !== 'PATCH') return (sendJson(res, 405, { error: 'method_not_allowed' }), true);
      if (!verifyWriteRequest(req, res)) return true;
      const session = requireAdmin(req, res);
      if (!session) return true;
      const prodId = prodMatch[1];

      parseJsonBody(req, async (err, body) => {
        if (err) return sendJson(res, err.code, { error: err.error });
        const { categoryId, name, description, price, old, material, tag, img, active, featured, variants, revision } = body || {};
        try {
          const txRes = await runTransaction(revision, draft => {
            const p = draft.products.find(x => x.id === prodId);
            if (!p) throw makeErr('Không tìm thấy sản phẩm.', 404, 'not_found');
            if (categoryId !== undefined) {
              if (!draft.categories.some(c => c.id === categoryId)) throw makeErr('Danh mục không tồn tại.', 400, 'invalid_category');
              p.categoryId = categoryId;
            }
            if (name !== undefined) {
              const cleanName = String(name || '').trim();
              if (!cleanName || cleanName.length > 200) throw makeErr('Tên sản phẩm không hợp lệ.', 400, 'invalid_name');
              p.name = cleanName;
            }
            if (description !== undefined) p.description = String(description || '').trim().slice(0, 4000);
            if (price !== undefined) {
              if (!Number.isInteger(price) || price < 0) throw makeErr('Giá bán phải là số nguyên >= 0.', 400, 'invalid_price');
              if (price !== p.price) recordAdminLog(draft, session.user, 'product_price_change', p.id, `${p.price} -> ${price}`);
              p.price = price;
            }
            if (old !== undefined) {
              const oldPrice = old === null || old === '' ? null : Number(old);
              if (oldPrice !== null && (!Number.isInteger(oldPrice) || oldPrice < 0)) throw makeErr('Giá gốc không hợp lệ.', 400, 'invalid_old_price');
              p.old = oldPrice;
            }
            if (material !== undefined) {
              const cleanMat = String(material || '').trim();
              if (!cleanMat || cleanMat.length > 200) throw makeErr('Chất liệu không hợp lệ.', 400, 'invalid_material');
              p.material = cleanMat;
            }
            if (tag !== undefined) p.tag = String(tag || '').trim().slice(0, 100);
            if (img !== undefined) {
              if (!isValidImagePath(img)) throw makeErr('Đường dẫn ảnh không hợp lệ.', 400, 'invalid_img');
              p.img = String(img).trim();
            }
            if (active !== undefined) p.active = Boolean(active);
            if (featured !== undefined) p.featured = Boolean(featured);

            if (variants !== undefined) {
              if (!Array.isArray(variants) || variants.length < 1 || variants.length > 100) {
                throw makeErr('Sản phẩm phải có ít nhất 1 biến thể.', 400, 'invalid_variants');
              }
              const otherSkus = new Set();
              for (const other of draft.products) {
                if (other.id !== prodId) {
                  for (const ov of other.variants) otherSkus.add(ov.sku);
                }
              }
              const oldSkuSet = new Set(p.variants.map(v => v.sku));
              const seenLocal = new Set();
              const nextVariants = [];
              const newStockItems = [];

              for (const v of variants) {
                const color = String(v?.color || '').trim();
                const size = String(v?.size || '').trim();
                if (!COLOR_CODE_MAP[color]) throw makeErr(`Màu "${color}" chưa có trong bảng COLOR_CODE chuẩn.`, 400, 'unknown_color');
                if (!size || size.length > 50) throw makeErr('Kích thước biến thể không hợp lệ.', 400, 'invalid_size');
                const sku = buildSku(prodId, color, size);
                if (seenLocal.has(sku) || otherSkus.has(sku)) throw makeErr(`SKU bị trùng: ${sku}`, 409, 'duplicate_sku');
                seenLocal.add(sku);
                const priceOverride = v.priceOverride === undefined || v.priceOverride === null || v.priceOverride === '' ? null : Number(v.priceOverride);
                if (priceOverride !== null && (!Number.isInteger(priceOverride) || priceOverride < 0)) {
                  throw makeErr('Giá biến thể không hợp lệ.', 400, 'invalid_price_override');
                }
                nextVariants.push({ sku, color, size, priceOverride, active: v.active === undefined ? true : Boolean(v.active) });
                if (!oldSkuSet.has(sku)) {
                  const initQty = v.initialStock === undefined ? 0 : Number(v.initialStock);
                  if (!Number.isInteger(initQty) || initQty < 0) throw makeErr('Tồn kho ban đầu phải là số nguyên >= 0.', 400, 'invalid_stock');
                  newStockItems.push({ sku, initQty });
                }
              }

              for (const oldSku of oldSkuSet) {
                if (!seenLocal.has(oldSku)) {
                  if ((draft.stock[oldSku] ?? 0) > 0) {
                    throw makeErr(`Không thể xóa biến thể ${oldSku} khi vẫn còn tồn kho > 0. Hãy ẩn biến thể hoặc xuất hết tồn trước.`, 409, 'variant_has_stock');
                  }
                  delete draft.stock[oldSku];
                }
              }

              p.variants = nextVariants;
              for (const item of newStockItems) {
                draft.stock[item.sku] = 0;
                if (item.initQty > 0) {
                  adjustStockWithLog(draft, item.sku, prodId, item.initQty, 'initial_stock', prodId, session.user);
                }
              }
            }

            recordAdminLog(draft, session.user, 'product_update', p.id, p.name);
            return p;
          });
          return sendJson(res, 200, { revision: txRes.revision, product: txRes.result, state: sanitizeAdminState(txRes.state) });
        } catch (e) {
          return txCatch(res, e, 'product_update_failed');
        }
      });
      return true;
    }

    // -----------------------------------------------------
    // C. INVENTORY ADJUSTMENT (2.4.2)
    // -----------------------------------------------------
    if (pathname === '/api/admin/stock/adjust') {
      if (req.method !== 'POST') return (sendJson(res, 405, { error: 'method_not_allowed' }), true);
      if (!verifyWriteRequest(req, res)) return true;
      const session = requireAdmin(req, res);
      if (!session) return true;

      parseJsonBody(req, async (err, body) => {
        if (err) return sendJson(res, err.code, { error: err.error });
        const { sku, mode, qty, reason, revision } = body || {};
        try {
          const txRes = await runTransaction(revision, draft => {
            if (!sku || typeof sku !== 'string') throw makeErr('Thiếu mã SKU.', 400, 'invalid_sku');
            const owner = draft.products.find(p => p.variants.some(v => v.sku === sku));
            if (!owner) throw makeErr('Không tìm thấy SKU trong danh mục sản phẩm.', 404, 'sku_not_found');
            const numQty = Number(qty);
            if (!Number.isInteger(numQty) || numQty < 0) throw makeErr('Số lượng phải là số nguyên >= 0.', 400, 'invalid_qty');

            const current = draft.stock[sku] ?? 0;
            let delta = 0;
            if (mode === 'in') {
              if (numQty <= 0) throw makeErr('Số lượng nhập kho phải > 0.', 400, 'invalid_qty');
              delta = numQty;
            } else if (mode === 'out') {
              if (numQty <= 0) throw makeErr('Số lượng xuất kho phải > 0.', 400, 'invalid_qty');
              delta = -numQty;
            } else if (mode === 'set') {
              delta = numQty - current;
            } else {
              throw makeErr('Chế độ điều chỉnh không hợp lệ (in, out, set).', 400, 'invalid_mode');
            }

            const cleanReason = String(reason || `manual_${mode}`).trim().slice(0, 100);
            adjustStockWithLog(draft, sku, owner.id, delta, cleanReason, '', session.user);
            recordAdminLog(draft, session.user, 'stock_adjust', sku, `${mode}: ${current} -> ${current + delta} (${cleanReason})`);
            return { sku, stock: draft.stock[sku] };
          });
          return sendJson(res, 200, { revision: txRes.revision, ...txRes.result, state: sanitizeAdminState(txRes.state) });
        } catch (e) {
          return txCatch(res, e, 'stock_adjust_failed');
        }
      });
      return true;
    }

    // -----------------------------------------------------
    // D. CUSTOMERS LOCK/UNLOCK (2.4.3)
    // -----------------------------------------------------
    const cusLockMatch = pathname.match(/^\/api\/admin\/customers\/([^/]+)\/lock$/);
    if (cusLockMatch) {
      if (req.method !== 'PATCH') return (sendJson(res, 405, { error: 'method_not_allowed' }), true);
      if (!verifyWriteRequest(req, res)) return true;
      const session = requireAdmin(req, res);
      if (!session) return true;
      const cusId = cusLockMatch[1];

      parseJsonBody(req, async (err, body) => {
        if (err) return sendJson(res, err.code, { error: err.error });
        const { locked, reason, revision } = body || {};
        try {
          const txRes = await runTransaction(revision, draft => {
            const cus = draft.customers.find(c => c.id === cusId);
            if (!cus) throw makeErr('Không tìm thấy khách hàng.', 404, 'not_found');
            const nextLocked = Boolean(locked);
            const cleanReason = nextLocked ? String(reason || 'Khóa bởi quản trị viên').trim().slice(0, 500) : '';
            cus.locked = nextLocked;
            cus.lockedReason = cleanReason;
            cus.updatedAt = new Date().toISOString();

            if (nextLocked && customerSessions) {
              for (const [tok, sess] of customerSessions.entries()) {
                if (sess.customerId === cusId) customerSessions.delete(tok);
              }
            }
            recordAdminLog(draft, session.user, nextLocked ? 'customer_lock' : 'customer_unlock', cus.id, cleanReason || cus.email);
            const { passwordHash, passwordSalt, ...safeCus } = cus;
            return safeCus;
          });
          return sendJson(res, 200, { revision: txRes.revision, customer: txRes.result, state: sanitizeAdminState(txRes.state) });
        } catch (e) {
          return txCatch(res, e, 'customer_lock_failed');
        }
      });
      return true;
    }

    // -----------------------------------------------------
    // E. SIMULATED PAYMENT (2.4.5)
    // -----------------------------------------------------
    const paySimMatch = pathname.match(/^\/api\/admin\/orders\/([^/]+)\/payment-simulate$/);
    if (paySimMatch) {
      if (req.method !== 'POST') return (sendJson(res, 405, { error: 'method_not_allowed' }), true);
      if (!verifyWriteRequest(req, res)) return true;
      const session = requireAdmin(req, res);
      if (!session) return true;
      const orderId = paySimMatch[1];

      parseJsonBody(req, async (err, body) => {
        if (err) return sendJson(res, err.code, { error: err.error });
        const { action, note, revision } = body || {};
        try {
          const txRes = await runTransaction(revision, draft => {
            const o = draft.orders.find(x => x.id === orderId);
            if (!o) throw makeErr('Không tìm thấy đơn hàng.', 404, 'not_found');
            if (o.orderStatus === 'cancelled' || o.orderStatus === 'returned') {
              throw makeErr('Không thể xử lý thanh toán cho đơn đã hủy hoặc đã trả hàng.', 409, 'invalid_order_status');
            }
            if (o.paymentStatus === 'paid') {
              throw makeErr('Đơn hàng đã thanh toán thành công trước đó. Không thể xử lý trùng.', 409, 'already_paid');
            }
            const now = new Date().toISOString();
            if (action === 'success') {
              o.paymentStatus = 'paid';
              o.transactions.push({
                id: 'tx_sim_' + crypto.randomBytes(5).toString('hex'),
                method: o.paymentMethod,
                amount: o.total,
                status: 'success',
                isSimulated: true,
                createdAt: now,
                actor: session.user,
              });
              o.history.push({ status: o.orderStatus, note: note || 'Thanh toán mô phỏng thành công', actor: session.user, at: now });
            } else if (action === 'failed') {
              o.paymentStatus = 'failed';
              o.transactions.push({
                id: 'tx_sim_' + crypto.randomBytes(5).toString('hex'),
                method: o.paymentMethod,
                amount: o.total,
                status: 'failed',
                isSimulated: true,
                createdAt: now,
                actor: session.user,
              });
              o.history.push({ status: o.orderStatus, note: note || 'Thanh toán mô phỏng thất bại', actor: session.user, at: now });
            } else if (action === 'pending') {
              o.paymentStatus = 'pending';
              o.transactions.push({
                id: 'tx_sim_' + crypto.randomBytes(5).toString('hex'),
                method: o.paymentMethod,
                amount: o.total,
                status: 'pending',
                isSimulated: true,
                createdAt: now,
                actor: session.user,
              });
              o.history.push({ status: o.orderStatus, note: note || 'Chuyển trạng thái chờ thanh toán mô phỏng', actor: session.user, at: now });
            } else if (action === 'expired') {
              o.paymentStatus = 'failed';
              o.transactions.push({
                id: 'tx_sim_' + crypto.randomBytes(5).toString('hex'),
                method: o.paymentMethod,
                amount: o.total,
                status: 'failed',
                isSimulated: true,
                createdAt: now,
                actor: session.user,
              });
              if (o.orderStatus === 'pending') {
                o.orderStatus = 'cancelled';
                if (o.inventoryStatus === 'reserved') {
                  for (const it of o.items) {
                    if (it.sku && Object.prototype.hasOwnProperty.call(draft.stock, it.sku)) {
                      adjustStockWithLog(draft, it.sku, it.productId, it.qty, 'payment_expired', o.id, session.user);
                    }
                  }
                  o.inventoryStatus = 'released';
                }
              }
              o.history.push({ status: o.orderStatus, note: note || 'Hết hạn giữ hàng thanh toán mô phỏng -> giải phóng tồn kho', actor: session.user, at: now });
            } else {
              throw makeErr('Hành động thanh toán mô phỏng không hợp lệ.', 400, 'invalid_action');
            }
            recordAdminLog(draft, session.user, 'payment_simulate', o.id, `${action} (${o.paymentStatus})`);
            return o;
          });
          return sendJson(res, 200, { revision: txRes.revision, order: txRes.result, state: sanitizeAdminState(txRes.state) });
        } catch (e) {
          return txCatch(res, e, 'payment_simulate_failed');
        }
      });
      return true;
    }

    // -----------------------------------------------------
    // F. SHIPMENT UPDATE (2.4.6)
    // -----------------------------------------------------
    const shipmentMatch = pathname.match(/^\/api\/admin\/orders\/([^/]+)\/shipment$/);
    if (shipmentMatch) {
      if (req.method !== 'PATCH') return (sendJson(res, 405, { error: 'method_not_allowed' }), true);
      if (!verifyWriteRequest(req, res)) return true;
      const session = requireAdmin(req, res);
      if (!session) return true;
      const orderId = shipmentMatch[1];

      parseJsonBody(req, async (err, body) => {
        if (err) return sendJson(res, err.code, { error: err.error });
        const { carrier, trackingCode, shipStatus, note, revision } = body || {};
        try {
          const txRes = await runTransaction(revision, draft => {
            const o = draft.orders.find(x => x.id === orderId);
            if (!o) throw makeErr('Không tìm thấy đơn hàng.', 404, 'not_found');
            if (o.orderStatus === 'cancelled' || o.orderStatus === 'returned') {
              throw makeErr('Không thể cập nhật vận chuyển cho đơn đã hủy hoặc đã trả hàng.', 409, 'invalid_order_status');
            }
            const now = new Date().toISOString();
            o.shipment = {
              ...(o.shipment || {}),
              carrier: carrier !== undefined ? String(carrier || '').trim().slice(0, 100) : (o.shipment?.carrier || ''),
              trackingCode: trackingCode !== undefined ? String(trackingCode || '').trim().slice(0, 100) : (o.shipment?.trackingCode || ''),
              shipStatus: shipStatus !== undefined ? String(shipStatus || '').trim().slice(0, 60) : (o.shipment?.shipStatus || 'pending'),
              note: note !== undefined ? String(note || '').trim().slice(0, 500) : (o.shipment?.note || ''),
              isSimulated: true,
              updatedAt: now,
            };

            if (shipStatus === 'shipping') {
              if (!['confirmed', 'packing', 'shipping'].includes(o.orderStatus)) {
                throw makeErr('Đơn hàng phải ở trạng thái Đã xác nhận hoặc Đang đóng gói trước khi giao.', 409, 'invalid_transition');
              }
              if (o.paymentMethod === 'online' && o.paymentStatus !== 'paid') {
                throw makeErr('Chặn giao hàng: Đơn thanh toán trực tuyến chưa hoàn tất thanh toán.', 409, 'payment_required');
              }
              o.orderStatus = 'shipping';
              o.inventoryStatus = 'fulfilled';
              o.shipment.shippedAt = o.shipment.shippedAt || now;
            } else if (shipStatus === 'delivered') {
              if (o.orderStatus !== 'shipping') {
                throw makeErr('Chỉ có thể xác nhận giao thành công khi đơn đang ở trạng thái Đang giao.', 409, 'invalid_transition');
              }
              o.orderStatus = 'delivered';
              o.shipment.deliveredAt = now;
              if (o.paymentMethod === 'COD' && o.paymentStatus === 'unpaid') {
                o.paymentStatus = 'paid';
                o.transactions.push({
                  id: 'tx_cod_' + crypto.randomBytes(4).toString('hex'),
                  method: 'COD',
                  amount: o.total,
                  status: 'success',
                  isSimulated: true,
                  createdAt: now,
                  actor: session.user,
                });
              }
            } else if (shipStatus === 'delivery_failed') {
              if (o.orderStatus !== 'shipping') {
                throw makeErr('Chỉ có thể đánh dấu giao thất bại khi đơn đang giao.', 409, 'invalid_transition');
              }
              o.orderStatus = 'delivery_failed';
            }

            o.history.push({
              status: o.orderStatus,
              note: `Cập nhật vận chuyển mô phỏng (${o.shipment.carrier || 'Nội bộ'} · ${o.shipment.trackingCode || '—'}): ${o.shipment.shipStatus}`,
              actor: session.user,
              at: now,
            });
            recordAdminLog(draft, session.user, 'order_shipment', o.id, `${o.shipment.shipStatus} / ${o.shipment.trackingCode}`);
            return o;
          });
          return sendJson(res, 200, { revision: txRes.revision, order: txRes.result, state: sanitizeAdminState(txRes.state) });
        } catch (e) {
          return txCatch(res, e, 'shipment_update_failed');
        }
      });
      return true;
    }

    // -----------------------------------------------------
    // G. RETURNS & WARRANTY CREATE / INSPECT (2.4.7)
    // -----------------------------------------------------
    if (pathname === '/api/admin/returns') {
      if (req.method !== 'POST') return (sendJson(res, 405, { error: 'method_not_allowed' }), true);
      if (!verifyWriteRequest(req, res)) return true;
      const session = requireAdmin(req, res);
      if (!session) return true;

      parseJsonBody(req, async (err, body) => {
        if (err) return sendJson(res, err.code, { error: err.error });
        const { orderId, type, reason, items, revision } = body || {};
        try {
          const txRes = await runTransaction(revision, draft => {
            const o = draft.orders.find(x => x.id === orderId);
            if (!o) throw makeErr('Không tìm thấy đơn hàng.', 404, 'order_not_found');
            if (!ENUMS.returnType.includes(type)) throw makeErr('Loại yêu cầu phải là return, exchange hoặc warranty.', 400, 'invalid_type');
            if (o.orderStatus !== 'delivered') {
              throw makeErr('Chỉ tiếp nhận đổi trả/bảo hành cho đơn hàng đã giao thành công.', 409, 'invalid_order_status');
            }
            const cleanReason = String(reason || '').trim();
            if (!cleanReason) throw makeErr('Vui lòng nhập lý do đổi trả/bảo hành.', 400, 'missing_reason');

            if (type !== 'warranty' && o.shipment?.deliveredAt) {
              const deliveredMs = Date.parse(o.shipment.deliveredAt);
              const limitMs = (BUSINESS_CONFIG.returnWindowDays || 7) * 24 * 60 * 60 * 1000;
              if (!Number.isNaN(deliveredMs) && Date.now() - deliveredMs > limitMs) {
                throw makeErr(`Đã quá thời hạn đổi trả ${BUSINESS_CONFIG.returnWindowDays || 7} ngày kể từ khi giao thành công.`, 409, 'return_window_expired');
              }
            }

            if (!Array.isArray(items) || items.length < 1) throw makeErr('Phải chọn ít nhất 1 sản phẩm.', 400, 'invalid_items');
            const alreadyUsed = new Map();
            for (const r of draft.returns) {
              if (r.orderId === o.id && r.status !== 'rejected') {
                for (const it of r.items) {
                  const key = it.sku || it.productId;
                  alreadyUsed.set(key, (alreadyUsed.get(key) || 0) + (it.qty || 0));
                }
              }
            }

            const builtItems = [];
            for (const reqIt of items) {
              const qty = Number(reqIt?.qty);
              if (!Number.isInteger(qty) || qty < 1) throw makeErr('Số lượng đổi trả phải >= 1.', 400, 'invalid_qty');
              const ordered = o.items.find(x => (reqIt.sku ? x.sku === reqIt.sku : x.productId === reqIt.productId));
              if (!ordered) throw makeErr('Sản phẩm không thuộc đơn hàng này.', 400, 'item_not_in_order');
              const key = ordered.sku || ordered.productId;
              const remaining = ordered.qty - (alreadyUsed.get(key) || 0);
              if (qty > remaining) {
                throw makeErr(`Số lượng yêu cầu cho ${ordered.name} vượt quá số lượng còn đủ điều kiện (${remaining}).`, 409, 'invalid_return_qty');
              }
              alreadyUsed.set(key, (alreadyUsed.get(key) || 0) + qty);
              builtItems.push({
                productId: ordered.productId,
                sku: ordered.sku || null,
                name: ordered.name,
                qty,
                condition: 'pending',
              });
            }

            const now = new Date().toISOString();
            const ret = {
              id: 'ret_' + crypto.randomBytes(5).toString('hex'),
              orderId: o.id,
              customerId: o.customerId || null,
              type,
              reason: cleanReason.slice(0, 1000),
              images: [],
              status: 'pending',
              items: builtItems,
              createdAt: now,
              createdBy: session.user,
            };
            draft.returns.push(ret);
            o.history.push({ status: o.orderStatus, note: `Tạo yêu cầu ${type} (${ret.id})`, actor: session.user, at: now });
            recordAdminLog(draft, session.user, 'return_create', ret.id, `${o.id} (${type})`);
            return ret;
          });
          return sendJson(res, 201, { revision: txRes.revision, returnRequest: txRes.result, state: sanitizeAdminState(txRes.state) });
        } catch (e) {
          return txCatch(res, e, 'return_create_failed');
        }
      });
      return true;
    }

    // -----------------------------------------------------
    // H. POLICIES & SITE CONTENT (2.4.8)
    // -----------------------------------------------------
    if (pathname === '/api/admin/policies') {
      if (req.method !== 'PUT') return (sendJson(res, 405, { error: 'method_not_allowed' }), true);
      if (!verifyWriteRequest(req, res)) return true;
      const session = requireAdmin(req, res);
      if (!session) return true;

      parseJsonBody(req, async (err, body) => {
        if (err) return sendJson(res, err.code, { error: err.error });
        const { storeInfo, banners, items, note, revision } = body || {};
        try {
          const txRes = await runTransaction(revision, draft => {
            const now = new Date().toISOString();
            draft.policyVersions.push({
              version: draft.policies.version,
              updatedAt: draft.policies.updatedAt,
              archivedAt: now,
              actor: session.user,
              note: String(note || 'Lưu phiên bản trước khi cập nhật').trim().slice(0, 300),
              snapshot: structuredClone(draft.policies),
            });
            draft.policies = {
              version: (draft.policies.version || 1) + 1,
              updatedAt: now,
              storeInfo: storeInfo && typeof storeInfo === 'object' ? storeInfo : (draft.policies.storeInfo || {}),
              banners: banners && typeof banners === 'object' ? banners : (draft.policies.banners || {}),
              items: items && typeof items === 'object' ? items : (draft.policies.items || {}),
            };
            recordAdminLog(draft, session.user, 'policies_update', `v${draft.policies.version}`, String(note || 'Cập nhật chính sách & nội dung'));
            return draft.policies;
          });
          return sendJson(res, 200, { revision: txRes.revision, policies: txRes.result, state: sanitizeAdminState(txRes.state) });
        } catch (e) {
          return txCatch(res, e, 'policies_update_failed');
        }
      });
      return true;
    }

    // -----------------------------------------------------
    // I. PROMOTIONS (2.4.9)
    // -----------------------------------------------------
    if (pathname === '/api/admin/promotions') {
      if (req.method !== 'POST') return (sendJson(res, 405, { error: 'method_not_allowed' }), true);
      if (!verifyWriteRequest(req, res)) return true;
      const session = requireAdmin(req, res);
      if (!session) return true;

      parseJsonBody(req, async (err, body) => {
        if (err) return sendJson(res, err.code, { error: err.error });
        const { code, name, description, type, value, minOrder, maxDiscount, usageLimit, startAt, endAt, active, revision } = body || {};
        try {
          const txRes = await runTransaction(revision, draft => {
            const cleanCode = String(code || '').trim().toUpperCase();
            if (!/^[A-Z0-9_-]{3,40}$/.test(cleanCode)) {
              throw makeErr('Mã khuyến mãi phải gồm 3-40 ký tự chữ in hoa, số, _ hoặc -.', 400, 'invalid_code');
            }
            if (draft.promotions.some(p => p.code === cleanCode)) {
              throw makeErr('Mã khuyến mãi đã tồn tại.', 409, 'duplicate_code');
            }
            if (!ENUMS.promotionType.includes(type)) throw makeErr('Loại giảm giá phải là percent hoặc fixed.', 400, 'invalid_type');
            const numVal = Number(value);
            if (!Number.isInteger(numVal) || numVal <= 0 || (type === 'percent' && numVal > 100)) {
              throw makeErr('Giá trị giảm không hợp lệ.', 400, 'invalid_value');
            }
            const numMin = Number(minOrder ?? 0);
            if (!Number.isInteger(numMin) || numMin < 0) throw makeErr('Đơn tối thiểu không hợp lệ.', 400, 'invalid_min_order');
            const numMax = maxDiscount === undefined || maxDiscount === null || maxDiscount === '' ? null : Number(maxDiscount);
            if (numMax !== null && (!Number.isInteger(numMax) || numMax < 0)) throw makeErr('Giảm tối đa không hợp lệ.', 400, 'invalid_max_discount');
            const numLimit = Number(usageLimit ?? 100);
            if (!Number.isInteger(numLimit) || numLimit < 1) throw makeErr('Giới hạn lượt sử dụng phải >= 1.', 400, 'invalid_usage_limit');
            if (!startAt || !endAt || Number.isNaN(Date.parse(startAt)) || Number.isNaN(Date.parse(endAt)) || Date.parse(endAt) <= Date.parse(startAt)) {
              throw makeErr('Thời gian áp dụng không hợp lệ (ngày kết thúc phải sau ngày bắt đầu).', 400, 'invalid_dates');
            }

            const promo = {
              id: 'promo_' + crypto.randomBytes(4).toString('hex'),
              code: cleanCode,
              name: String(name || cleanCode).trim().slice(0, 150),
              description: String(description || '').trim().slice(0, 500),
              type,
              value: numVal,
              minOrder: numMin,
              maxDiscount: numMax,
              usageLimit: numLimit,
              usedCount: 0,
              active: active === undefined ? true : Boolean(active),
              startAt: new Date(startAt).toISOString(),
              endAt: new Date(endAt).toISOString(),
            };
            draft.promotions.push(promo);
            recordAdminLog(draft, session.user, 'promotion_create', promo.id, promo.code);
            return promo;
          });
          return sendJson(res, 201, { revision: txRes.revision, promotion: txRes.result, state: sanitizeAdminState(txRes.state) });
        } catch (e) {
          return txCatch(res, e, 'promotion_create_failed');
        }
      });
      return true;
    }

    if (pathname === '/api/admin/promotions/validate') {
      if (req.method !== 'POST') return (sendJson(res, 405, { error: 'method_not_allowed' }), true);
      if (!verifyWriteRequest(req, res)) return true;
      const session = requireAdmin(req, res);
      if (!session) return true;
      parseJsonBody(req, (err, body) => {
        if (err) return sendJson(res, err.code, { error: err.error });
        const cleanCode = String(body?.code || '').trim().toUpperCase();
        const promo = getDatabase().state.promotions.find(p => p.code === cleanCode);
        const result = calculatePromotionDiscount(promo, body?.subtotal);
        return sendJson(res, result.valid ? 200 : 400, { ...result, code: cleanCode });
      });
      return true;
    }

    const promoMatch = pathname.match(/^\/api\/admin\/promotions\/([^/]+)$/);
    if (promoMatch) {
      if (req.method !== 'PATCH') return (sendJson(res, 405, { error: 'method_not_allowed' }), true);
      if (!verifyWriteRequest(req, res)) return true;
      const session = requireAdmin(req, res);
      if (!session) return true;
      const promoId = promoMatch[1];

      parseJsonBody(req, async (err, body) => {
        if (err) return sendJson(res, err.code, { error: err.error });
        const { name, description, type, value, minOrder, maxDiscount, usageLimit, startAt, endAt, active, revision } = body || {};
        try {
          const txRes = await runTransaction(revision, draft => {
            const promo = draft.promotions.find(p => p.id === promoId);
            if (!promo) throw makeErr('Không tìm thấy mã khuyến mãi.', 404, 'not_found');
            if (name !== undefined) promo.name = String(name || promo.code).trim().slice(0, 150);
            if (description !== undefined) promo.description = String(description || '').trim().slice(0, 500);
            if (type !== undefined) {
              if (!ENUMS.promotionType.includes(type)) throw makeErr('Loại giảm giá không hợp lệ.', 400, 'invalid_type');
              promo.type = type;
            }
            if (value !== undefined) {
              const numVal = Number(value);
              if (!Number.isInteger(numVal) || numVal <= 0 || (promo.type === 'percent' && numVal > 100)) {
                throw makeErr('Giá trị giảm không hợp lệ.', 400, 'invalid_value');
              }
              promo.value = numVal;
            }
            if (minOrder !== undefined) {
              const numMin = Number(minOrder);
              if (!Number.isInteger(numMin) || numMin < 0) throw makeErr('Đơn tối thiểu không hợp lệ.', 400, 'invalid_min_order');
              promo.minOrder = numMin;
            }
            if (maxDiscount !== undefined) {
              const numMax = maxDiscount === null || maxDiscount === '' ? null : Number(maxDiscount);
              if (numMax !== null && (!Number.isInteger(numMax) || numMax < 0)) throw makeErr('Giảm tối đa không hợp lệ.', 400, 'invalid_max_discount');
              promo.maxDiscount = numMax;
            }
            if (usageLimit !== undefined) {
              const numLimit = Number(usageLimit);
              if (!Number.isInteger(numLimit) || numLimit < promo.usedCount) {
                throw makeErr(`Giới hạn lượt dùng không thể nhỏ hơn số lượt đã dùng (${promo.usedCount}).`, 409, 'invalid_usage_limit');
              }
              promo.usageLimit = numLimit;
            }
            if (startAt !== undefined) {
              if (Number.isNaN(Date.parse(startAt))) throw makeErr('Ngày bắt đầu không hợp lệ.', 400, 'invalid_dates');
              promo.startAt = new Date(startAt).toISOString();
            }
            if (endAt !== undefined) {
              if (Number.isNaN(Date.parse(endAt))) throw makeErr('Ngày kết thúc không hợp lệ.', 400, 'invalid_dates');
              promo.endAt = new Date(endAt).toISOString();
            }
            if (Date.parse(promo.endAt) <= Date.parse(promo.startAt)) {
              throw makeErr('Ngày kết thúc phải sau ngày bắt đầu.', 400, 'invalid_dates');
            }
            if (active !== undefined) promo.active = Boolean(active);
            recordAdminLog(draft, session.user, 'promotion_update', promo.id, `${promo.code} (active=${promo.active})`);
            return promo;
          });
          return sendJson(res, 200, { revision: txRes.revision, promotion: txRes.result, state: sanitizeAdminState(txRes.state) });
        } catch (e) {
          return txCatch(res, e, 'promotion_update_failed');
        }
      });
      return true;
    }

    // -----------------------------------------------------
    // J. CSV REPORT EXPORT (2.4.10)
    // -----------------------------------------------------
    if (pathname === '/api/admin/reports/export.csv') {
      if (req.method !== 'GET') return (sendJson(res, 405, { error: 'method_not_allowed' }), true);
      const session = requireAdmin(req, res);
      if (!session) return true;

      const type = urlObj.searchParams.get('type') || 'orders';
      const fromStr = urlObj.searchParams.get('from');
      const toStr = urlObj.searchParams.get('to');
      const fromMs = fromStr ? Date.parse(fromStr) : null;
      const toMs = toStr ? Date.parse(toStr) + 86399999 : null;
      const inRange = iso => {
        const ms = Date.parse(iso);
        if (Number.isNaN(ms)) return true;
        if (fromMs !== null && !Number.isNaN(fromMs) && ms < fromMs) return false;
        if (toMs !== null && !Number.isNaN(toMs) && ms > toMs) return false;
        return true;
      };

      const s = getDatabase().state;
      let csv = '';
      if (type === 'orders') {
        const rows = s.orders.filter(o => inRange(o.createdAt)).map(o => [
          o.id, o.createdAt, o.receiver, o.phone, o.paymentMethod, o.orderStatus, o.paymentStatus, o.settlementStatus, o.subtotal, o.discountAmount, o.shippingFee, o.total,
        ]);
        csv = buildCsv(['Mã đơn', 'Ngày tạo', 'Người nhận', 'SĐT', 'Phương thức', 'Trạng thái đơn', 'Thanh toán (mô phỏng)', 'Đối soát', 'Tạm tính', 'Giảm giá', 'Phí ship', 'Tổng tiền'], rows);
      } else if (type === 'customers') {
        const rows = s.customers.filter(c => inRange(c.createdAt)).map(c => {
          const cusOrders = s.orders.filter(o => o.customerId === c.id && o.orderStatus !== 'cancelled');
          const spent = cusOrders.filter(o => o.paymentStatus === 'paid').reduce((sum, o) => sum + o.total, 0);
          return [c.id, c.name, c.email, c.phone || '', c.locked ? 'Đã khóa' : 'Hoạt động', cusOrders.length, spent, c.createdAt];
        });
        csv = buildCsv(['Mã KH', 'Họ tên', 'Email', 'SĐT', 'Trạng thái', 'Số đơn hợp lệ', 'Tổng đã thanh toán', 'Ngày đăng ký'], rows);
      } else if (type === 'products') {
        const soldMap = new Map();
        for (const o of s.orders) {
          if (o.orderStatus === 'cancelled' || !inRange(o.createdAt)) continue;
          for (const it of o.items) {
            const key = it.sku || it.productId;
            soldMap.set(key, (soldMap.get(key) || 0) + (it.qty || 0));
          }
        }
        const rows = [];
        for (const p of s.products) {
          for (const v of p.variants) {
            rows.push([p.id, p.name, v.sku, v.color, v.size, v.priceOverride ?? p.price, s.stock[v.sku] ?? 0, soldMap.get(v.sku) || 0, p.active && v.active ? 'Đang bán' : 'Ẩn']);
          }
        }
        csv = buildCsv(['Mã SP', 'Tên sản phẩm', 'SKU', 'Màu', 'Size', 'Giá bán', 'Tồn kho', 'Số lượng bán', 'Trạng thái'], rows);
      } else if (type === 'promotions') {
        const rows = s.promotions.map(p => [p.code, p.name || p.code, p.type, p.value, p.minOrder, p.usedCount, p.usageLimit, p.active ? 'Hoạt động' : 'Tạm ngưng', p.startAt, p.endAt]);
        csv = buildCsv(['Mã KM', 'Tên chương trình', 'Loại', 'Giá trị', 'Đơn tối thiểu', 'Đã dùng', 'Giới hạn', 'Trạng thái', 'Bắt đầu', 'Kết thúc'], rows);
      } else {
        return sendJson(res, 400, { error: 'invalid_report_type' });
      }

      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="vietphuc-${type}-${new Date().toISOString().slice(0, 10)}.csv"`,
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(csv);
      return true;
    }

    return false;
  };
}

module.exports = {
  createAdminHandler,
  calculatePromotionDiscount,
};
