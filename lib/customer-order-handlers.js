'use strict';

const crypto = require('node:crypto');
const { calculatePromotionDiscount } = require('./admin-handlers');

function expireOnlineOrderInDraft(draft, o, actor, adjustStockWithLog, note) {
  const now = new Date().toISOString();
  o.paymentStatus = 'failed';
  o.orderStatus = 'cancelled';
  const pendingTx = (o.transactions || []).find(t => t.status === 'pending');
  if (pendingTx) {
    pendingTx.status = 'failed';
  } else {
    o.transactions.push({
      id: 'tx_sim_' + crypto.randomBytes(5).toString('hex'),
      method: 'online',
      amount: o.total,
      status: 'failed',
      isSimulated: true,
      createdAt: now,
    });
  }
  if (o.inventoryStatus === 'reserved') {
    for (const it of (o.items || [])) {
      if (it.sku && Object.prototype.hasOwnProperty.call(draft.stock, it.sku)) {
        adjustStockWithLog(draft, it.sku, it.productId, it.qty, 'payment_expired', o.id, actor);
      }
    }
    o.inventoryStatus = 'released';
  }
  o.history.push({ status: 'cancelled', note, actor, at: now });
}

function makeErr(message, statusCode = 400, code = 'bad_request') {
  const e = new Error(message);
  e.statusCode = statusCode;
  e.code = code;
  return e;
}

function normalizePhone(phone) {
  if (typeof phone !== 'string') return '';
  let clean = phone.trim().replace(/[\s.-]+/g, '');
  if (clean.startsWith('+84')) clean = '0' + clean.slice(3);
  return clean;
}

function resolveShippingFee(shippingType, province, address, BUSINESS_CONFIG) {
  const remoteKeywords = ['côn đảo', 'phú quốc', 'hoàng sa', 'trường sa', 'hải đảo', 'lý sơn', 'bạch long vĩ', 'phú quý'];
  const combined = `${province || ''} ${address || ''}`.toLowerCase();
  const isRemote = shippingType === 'remote' || remoteKeywords.some(k => combined.includes(k));
  return {
    shippingType: isRemote ? 'remote' : 'standard',
    shippingFee: isRemote ? BUSINESS_CONFIG.shipping.remoteFee : BUSINESS_CONFIG.shipping.standardFee,
  };
}

function validateAndPriceCartItems(draftState, rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length < 1 || rawItems.length > 100) {
    throw makeErr('Giỏ hàng không hợp lệ hoặc đang trống.', 400, 'empty_cart');
  }
  const merged = new Map();
  for (const raw of rawItems) {
    const sku = String(raw?.sku || '').trim();
    const productId = String(raw?.productId || '').trim();
    const qty = Number(raw?.qty);
    if (!sku || !productId) throw makeErr('Thiếu thông tin sản phẩm hoặc SKU.', 400, 'invalid_item');
    if (!Number.isInteger(qty) || qty < 1 || qty > 100) {
      throw makeErr('Số lượng sản phẩm phải là số nguyên >= 1.', 400, 'invalid_qty');
    }
    const existing = merged.get(sku);
    if (existing) existing.qty += qty;
    else merged.set(sku, { productId, sku, qty });
  }

  const pricedItems = [];
  let subtotal = 0;

  for (const reqItem of merged.values()) {
    const product = draftState.products.find(p => p.id === reqItem.productId);
    if (!product) throw makeErr(`Không tìm thấy sản phẩm ${reqItem.productId}.`, 404, 'product_not_found');
    if (!product.active) throw makeErr(`Sản phẩm "${product.name}" hiện đã ngừng kinh doanh.`, 409, 'product_inactive');

    const variant = (product.variants || []).find(v => v.sku === reqItem.sku);
    if (!variant) throw makeErr(`Không tìm thấy biến thể SKU ${reqItem.sku}.`, 404, 'sku_not_found');
    if (!variant.active) throw makeErr(`Biến thể ${variant.color} / ${variant.size} của "${product.name}" đã ngừng bán.`, 409, 'variant_inactive');

    const stockQty = draftState.stock[variant.sku] ?? 0;
    if (reqItem.qty > stockQty) {
      throw makeErr(`Sản phẩm "${product.name}" (${variant.color} / ${variant.size}) chỉ còn ${stockQty} sản phẩm trong kho.`, 409, 'insufficient_stock');
    }

    const unitPrice = (variant.priceOverride !== null && variant.priceOverride !== undefined)
      ? variant.priceOverride
      : product.price;
    const lineTotal = unitPrice * reqItem.qty;
    subtotal += lineTotal;

    pricedItems.push({
      productId: product.id,
      sku: variant.sku,
      name: product.name,
      img: product.img || '',
      color: variant.color,
      size: variant.size,
      qty: reqItem.qty,
      unitPrice,
      lineTotal,
    });
  }

  return { pricedItems, subtotal };
}

function createCustomerOrderHandler(deps) {
  const {
    sendJson,
    parseJsonBody,
    verifyWriteRequest,
    requireCustomer,
    runTransaction,
    adjustStockWithLog,
    getDatabase,
    BUSINESS_CONFIG,
  } = deps;

  function txCatch(res, e, fallbackCode) {
    return sendJson(res, e.statusCode || 500, {
      error: e.code || fallbackCode,
      message: e.message,
    });
  }

  return function handleCustomerOrderRoutes(req, res, pathname) {
    // -----------------------------------------------------
    // 1. PREVIEW CHECKOUT QUOTE (SERVER-SIDE PRICING & PROMO)
    // -----------------------------------------------------
    if (pathname === '/api/customer/checkout/preview') {
      if (req.method !== 'POST') return (sendJson(res, 405, { error: 'method_not_allowed' }), true);
      if (!verifyWriteRequest(req, res)) return true;
      const auth = requireCustomer(req, res);
      if (!auth) return true;

      parseJsonBody(req, (err, body) => {
        if (err) return sendJson(res, err.code, { error: err.error });
        const { items, shippingType, province, address, paymentMethod, promotionCode } = body || {};
        try {
          const s = getDatabase().state;
          const { pricedItems, subtotal } = validateAndPriceCartItems(s, items);
          const method = paymentMethod === 'online' ? 'online' : 'COD';
          const ship = resolveShippingFee(shippingType, province, address, BUSINESS_CONFIG);
          const codFee = method === 'COD' ? BUSINESS_CONFIG.codFee : 0;
          const paymentFee = method === 'online' ? BUSINESS_CONFIG.paymentFee : 0;

          let discountCode = null;
          let discountAmount = 0;
          let promoValid = true;
          let promoError = '';

          if (Array.isArray(promotionCode) || (typeof promotionCode === 'string' && promotionCode.includes(','))) {
            promoValid = false;
            promoError = 'Mỗi đơn hàng chỉ được áp dụng tối đa 1 mã khuyến mãi.';
          } else if (typeof promotionCode === 'string' && promotionCode.trim()) {
            const cleanCode = promotionCode.trim().toUpperCase();
            const promo = (s.promotions || []).find(p => p.code === cleanCode);
            const resPromo = calculatePromotionDiscount(promo, subtotal);
            if (resPromo.valid) {
              discountCode = cleanCode;
              discountAmount = resPromo.discount;
            } else {
              promoValid = false;
              promoError = resPromo.reason;
            }
          }

          const total = Math.max(0, subtotal - discountAmount + ship.shippingFee + codFee + paymentFee);
          return sendJson(res, 200, {
            items: pricedItems,
            subtotal,
            shippingType: ship.shippingType,
            shippingFee: ship.shippingFee,
            codFee,
            paymentFee,
            discountCode,
            discountAmount,
            promoValid,
            promoError,
            total,
            stockHoldMinutes: BUSINESS_CONFIG.onlineStockHoldMinutes,
          });
        } catch (e) {
          return txCatch(res, e, 'checkout_preview_failed');
        }
      });
      return true;
    }

    // -----------------------------------------------------
    // 2. CREATE ORDER (POST /api/customer/orders)
    // -----------------------------------------------------
    if (pathname === '/api/customer/orders' && req.method === 'POST') {
      if (!verifyWriteRequest(req, res)) return true;
      const auth = requireCustomer(req, res);
      if (!auth) return true;

      parseJsonBody(req, async (err, body) => {
        if (err) return sendJson(res, err.code, { error: err.error });
        const {
          items,
          receiver,
          phone,
          province,
          district,
          address,
          note,
          shippingType,
          paymentMethod,
          promotionCode,
          idempotencyKey,
        } = body || {};

        try {
          const cleanReceiver = String(receiver || '').trim();
          const cleanPhone = normalizePhone(String(phone || ''));
          const cleanAddress = String(address || '').trim();
          const cleanProvince = String(province || '').trim();
          const cleanDistrict = String(district || '').trim();
          const fullAddress = [cleanAddress, cleanDistrict, cleanProvince].filter(Boolean).join(', ');

          if (!cleanReceiver || cleanReceiver.length > 150) {
            throw makeErr('Vui lòng nhập họ và tên người nhận hợp lệ.', 400, 'invalid_receiver');
          }
          if (!/^0\d{8,10}$/.test(cleanPhone)) {
            throw makeErr('Số điện thoại nhận hàng không hợp lệ.', 400, 'invalid_phone');
          }
          if (!fullAddress || fullAddress.length > 500) {
            throw makeErr('Vui lòng nhập địa chỉ nhận hàng đầy đủ.', 400, 'invalid_address');
          }
          if (paymentMethod !== 'COD' && paymentMethod !== 'online') {
            throw makeErr('Phương thức thanh toán phải là COD hoặc online.', 400, 'invalid_payment_method');
          }
          if (Array.isArray(promotionCode) || (typeof promotionCode === 'string' && promotionCode.includes(','))) {
            throw makeErr('Mỗi đơn hàng chỉ được áp dụng tối đa 1 mã khuyến mãi.', 400, 'multiple_promotions_not_allowed');
          }
          const cleanIdem = typeof idempotencyKey === 'string' && idempotencyKey.trim()
            ? idempotencyKey.trim().slice(0, 100)
            : null;

          const txRes = await runTransaction(null, draft => {
            if (cleanIdem) {
              const dup = draft.orders.find(o => o.customerId === auth.customer.id && o.idempotencyKey === cleanIdem);
              if (dup) return { order: dup, duplicate: true };
            }

            const { pricedItems, subtotal } = validateAndPriceCartItems(draft, items);
            const ship = resolveShippingFee(shippingType, cleanProvince, fullAddress, BUSINESS_CONFIG);
            const codFee = paymentMethod === 'COD' ? BUSINESS_CONFIG.codFee : 0;
            const paymentFee = paymentMethod === 'online' ? BUSINESS_CONFIG.paymentFee : 0;

            let discountCode = null;
            let discountAmount = 0;
            if (typeof promotionCode === 'string' && promotionCode.trim()) {
              const cleanCode = promotionCode.trim().toUpperCase();
              const promo = (draft.promotions || []).find(p => p.code === cleanCode);
              const resPromo = calculatePromotionDiscount(promo, subtotal);
              if (!resPromo.valid) {
                throw makeErr(resPromo.reason, 409, 'invalid_promotion');
              }
              discountCode = cleanCode;
              discountAmount = resPromo.discount;
              promo.usedCount = (promo.usedCount || 0) + 1;
            }

            const total = Math.max(0, subtotal - discountAmount + ship.shippingFee + codFee + paymentFee);
            const now = new Date().toISOString();
            const orderId = 'VP' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(2).toString('hex').toUpperCase();
            const holdReason = paymentMethod === 'online' ? 'order_hold_online' : 'order_reserve_cod';

            for (const it of pricedItems) {
              adjustStockWithLog(draft, it.sku, it.productId, -it.qty, holdReason, orderId, auth.customer.id);
            }

            const orderItemsSnapshot = pricedItems.map(({ lineTotal, ...rest }) => rest);
            const isOnline = paymentMethod === 'online';
            const transactions = isOnline
              ? [{
                  id: 'tx_sim_' + crypto.randomBytes(5).toString('hex'),
                  method: 'online',
                  amount: total,
                  status: 'pending',
                  isSimulated: true,
                  createdAt: now,
                }]
              : [];

            const order = {
              id: orderId,
              createdAt: now,
              customerId: auth.customer.id,
              ...(cleanIdem ? { idempotencyKey: cleanIdem } : {}),
              receiver: cleanReceiver,
              phone: cleanPhone,
              address: fullAddress,
              note: String(note || '').trim().slice(0, 500),
              items: orderItemsSnapshot,
              subtotal,
              shippingFee: ship.shippingFee,
              codFee,
              paymentFee,
              discountCode,
              discountAmount,
              total,
              paymentMethod,
              orderStatus: 'pending',
              paymentStatus: isOnline ? 'pending' : 'unpaid',
              settlementStatus: 'unsettled',
              inventoryStatus: 'reserved',
              holdExpiresAt: isOnline
                ? new Date(Date.now() + BUSINESS_CONFIG.onlineStockHoldMinutes * 60000).toISOString()
                : null,
              shipment: {
                shippingType: ship.shippingType,
                shipStatus: 'pending',
                isSimulated: true,
              },
              transactions,
              refunds: [],
              policySnapshot: {
                version: draft.policies?.version || 1,
                updatedAt: draft.policies?.updatedAt || now,
                returnWindowDays: BUSINESS_CONFIG.returnWindowDays,
                warrantyWindowDays: BUSINESS_CONFIG.warrantyWindowDays || 30,
                refundProcessingDays: BUSINESS_CONFIG.refundProcessingDays || 5,
                returns: draft.policies?.items?.returns || '',
                warranty: draft.policies?.items?.warranty || '',
                shipping: draft.policies?.items?.shipping || '',
                payment: draft.policies?.items?.payment || '',
              },
              history: [{
                status: 'pending',
                note: isOnline
                  ? `Tạo đơn thanh toán trực tuyến mô phỏng (giữ hàng ${BUSINESS_CONFIG.onlineStockHoldMinutes} phút)`
                  : 'Tạo đơn COD và giữ hàng',
                actor: auth.customer.id,
                at: now,
              }],
            };

            draft.orders.push(order);
            return { order, duplicate: false };
          });

          return sendJson(res, txRes.result.duplicate ? 200 : 201, {
            order: txRes.result.order,
            duplicate: txRes.result.duplicate,
          });
        } catch (e) {
          return txCatch(res, e, 'order_create_failed');
        }
      });
      return true;
    }

    // -----------------------------------------------------
    // 3. SIMULATE ONLINE PAYMENT BY CUSTOMER
    // -----------------------------------------------------
    const payMatch = pathname.match(/^\/api\/customer\/orders\/([^/]+)\/pay-simulate$/);
    if (payMatch) {
      if (req.method !== 'POST') return (sendJson(res, 405, { error: 'method_not_allowed' }), true);
      if (!verifyWriteRequest(req, res)) return true;
      const auth = requireCustomer(req, res);
      if (!auth) return true;
      const orderId = payMatch[1];

      parseJsonBody(req, async (err, body) => {
        if (err) return sendJson(res, err.code, { error: err.error });
        const action = body?.action;
        if (!['success', 'fail', 'expire'].includes(action)) {
          return sendJson(res, 400, { error: 'invalid_action', message: 'Hành động phải là success, fail hoặc expire.' });
        }

        try {
          const txRes = await runTransaction(null, draft => {
            const o = draft.orders.find(x => x.id === orderId);
            if (!o) throw makeErr('Không tìm thấy đơn hàng.', 404, 'not_found');
            if (o.customerId !== auth.customer.id) {
              throw makeErr('Bạn không có quyền thao tác trên đơn hàng này.', 403, 'forbidden_order_access');
            }
            if (o.paymentMethod !== 'online') {
              throw makeErr('Chỉ đơn thanh toán trực tuyến mô phỏng mới hỗ trợ thao tác này.', 409, 'invalid_payment_method');
            }
            if (o.orderStatus === 'cancelled') {
              throw makeErr('Đơn hàng đã bị hủy.', 409, 'order_cancelled');
            }
            if (o.paymentStatus === 'paid') {
              throw makeErr('Đơn hàng đã thanh toán thành công trước đó.', 409, 'already_paid');
            }

            const now = new Date().toISOString();
            const isExpired = o.holdExpiresAt && Date.now() > Date.parse(o.holdExpiresAt);
            if (action === 'expire' || (action === 'success' && isExpired)) {
              expireOnlineOrderInDraft(draft, o, auth.customer.id, adjustStockWithLog, 'Hết hạn giữ hàng 15 phút - giải phóng tồn kho');
              return { order: o, expired: true };
            }

            if (action === 'success') {
              const pendingTx = o.transactions.find(t => t.status === 'pending');
              if (pendingTx) {
                pendingTx.status = 'success';
                pendingTx.paidAt = now;
              } else {
                o.transactions.push({
                  id: 'tx_sim_' + crypto.randomBytes(5).toString('hex'),
                  method: 'online',
                  amount: o.total,
                  status: 'success',
                  isSimulated: true,
                  createdAt: now,
                });
              }
              o.paymentStatus = 'paid';
              o.history.push({ status: o.orderStatus, note: 'Thanh toán trực tuyến mô phỏng thành công', actor: auth.customer.id, at: now });
              return { order: o, expired: false };
            }

            // action === 'fail'
            const pendingTx = o.transactions.find(t => t.status === 'pending');
            if (pendingTx) pendingTx.status = 'failed';
            else {
              o.transactions.push({
                id: 'tx_sim_' + crypto.randomBytes(5).toString('hex'),
                method: 'online',
                amount: o.total,
                status: 'failed',
                isSimulated: true,
                createdAt: now,
              });
            }
            o.paymentStatus = 'failed';
            o.history.push({ status: o.orderStatus, note: 'Thanh toán trực tuyến mô phỏng thất bại', actor: auth.customer.id, at: now });
            return { order: o, expired: false };
          });

          return sendJson(res, 200, txRes.result);
        } catch (e) {
          return txCatch(res, e, 'payment_simulate_failed');
        }
      });
      return true;
    }

    // -----------------------------------------------------
    // 4. CUSTOMER CANCEL ORDER (PENDING / CONFIRMED ONLY)
    // -----------------------------------------------------
    const cancelMatch = pathname.match(/^\/api\/customer\/orders\/([^/]+)\/cancel$/);
    if (cancelMatch) {
      if (req.method !== 'POST') return (sendJson(res, 405, { error: 'method_not_allowed' }), true);
      if (!verifyWriteRequest(req, res)) return true;
      const auth = requireCustomer(req, res);
      if (!auth) return true;
      const orderId = cancelMatch[1];

      parseJsonBody(req, async (err, body) => {
        if (err) return sendJson(res, err.code, { error: err.error });
        const reason = String(body?.reason || 'Khách hàng yêu cầu hủy đơn').trim().slice(0, 300);
        try {
          const txRes = await runTransaction(null, draft => {
            const o = draft.orders.find(x => x.id === orderId);
            if (!o) throw makeErr('Không tìm thấy đơn hàng.', 404, 'not_found');
            if (o.customerId !== auth.customer.id) {
              throw makeErr('Bạn không có quyền hủy đơn hàng này.', 403, 'forbidden_order_access');
            }
            if (!['pending', 'confirmed'].includes(o.orderStatus)) {
              throw makeErr('Chỉ có thể hủy đơn khi đơn chưa đóng gói hoặc chưa giao hàng.', 409, 'invalid_transition');
            }
            const now = new Date().toISOString();
            o.orderStatus = 'cancelled';
            if (o.inventoryStatus === 'reserved') {
              for (const it of o.items) {
                if (it.sku && Object.prototype.hasOwnProperty.call(draft.stock, it.sku)) {
                  adjustStockWithLog(draft, it.sku, it.productId, it.qty, 'customer_cancel', o.id, auth.customer.id);
                }
              }
              o.inventoryStatus = 'released';
            }
            o.history.push({ status: 'cancelled', note: reason, actor: auth.customer.id, at: now });
            return o;
          });
          return sendJson(res, 200, { order: txRes.result });
        } catch (e) {
          return txCatch(res, e, 'order_cancel_failed');
        }
      });
      return true;
    }

    // -----------------------------------------------------
    // 5. CUSTOMER RETURNS & WARRANTY (GET / POST /api/customer/returns)
    // -----------------------------------------------------
    if (pathname === '/api/customer/returns') {
      const auth = requireCustomer(req, res);
      if (!auth) return true;
      if (req.method === 'GET') {
        const list = (getDatabase().state.returns || [])
          .filter(r => r.customerId === auth.customer.id)
          .slice()
          .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        return (sendJson(res, 200, { returns: list }), true);
      }
      if (req.method !== 'POST') return (sendJson(res, 405, { error: 'method_not_allowed' }), true);
      if (!verifyWriteRequest(req, res)) return true;

      parseJsonBody(req, async (err, body) => {
        if (err) return sendJson(res, err.code, { error: err.error });
        const { orderId, type, reasonCategory, reason, description, images, items } = body || {};
        try {
          const txRes = await runTransaction(null, draft => {
            const o = draft.orders.find(x => x.id === orderId);
            if (!o) throw makeErr('Không tìm thấy đơn hàng.', 404, 'order_not_found');
            if (o.customerId !== auth.customer.id) {
              throw makeErr('Bạn không có quyền gửi yêu cầu cho đơn hàng này.', 403, 'forbidden_order_access');
            }
            if (o.orderStatus !== 'delivered') {
              throw makeErr('Chỉ tiếp nhận đổi trả/hỗ trợ chất lượng cho đơn hàng đã giao thành công.', 409, 'invalid_order_status');
            }
            if (!['return', 'exchange', 'warranty'].includes(type)) {
              throw makeErr('Loại yêu cầu phải là return, exchange hoặc warranty.', 400, 'invalid_type');
            }
            const cleanReason = String(reason || '').trim();
            if (!cleanReason) throw makeErr('Vui lòng nhập lý do yêu cầu.', 400, 'missing_reason');

            const cat = reasonCategory === 'store_defect' || reasonCategory === 'quality_warranty'
              ? reasonCategory
              : (type === 'warranty' ? 'quality_warranty' : 'customer_preference');
            const isDefectOrWarranty = cat === 'store_defect' || cat === 'quality_warranty' || type === 'warranty';

            const deliveredIso = o.shipment?.deliveredAt || o.updatedAt || o.createdAt;
            const deliveredMs = deliveredIso ? Date.parse(deliveredIso) : NaN;
            if (!Number.isNaN(deliveredMs)) {
              const elapsedMs = Date.now() - deliveredMs;
              const returnDays = o.policySnapshot?.returnWindowDays || BUSINESS_CONFIG.returnWindowDays || 7;
              const warrantyDays = o.policySnapshot?.warrantyWindowDays || BUSINESS_CONFIG.warrantyWindowDays || 30;
              if (!isDefectOrWarranty && elapsedMs > returnDays * 86400000) {
                throw makeErr(`Đã quá thời hạn đổi trả theo nhu cầu (${returnDays} ngày kể từ ngày nhận hàng). Nếu sản phẩm bị lỗi từ cửa hàng hoặc cần hỗ trợ chất lượng, vui lòng chọn đúng nhóm nguyên nhân.`, 409, 'return_window_expired');
              }
              if (isDefectOrWarranty && elapsedMs > warrantyDays * 86400000) {
                throw makeErr(`Đã quá thời hạn hỗ trợ chất lượng đề xuất (${warrantyDays} ngày kể từ ngày nhận hàng).`, 409, 'warranty_window_expired');
              }
            }

            if (!Array.isArray(items) || items.length < 1) {
              throw makeErr('Phải chọn ít nhất 1 sản phẩm trong đơn hàng.', 400, 'invalid_items');
            }
            const alreadyUsed = new Map();
            for (const r of draft.returns) {
              if (r.orderId === o.id && r.status !== 'rejected') {
                for (const it of r.items) {
                  const k = it.sku || it.productId;
                  alreadyUsed.set(k, (alreadyUsed.get(k) || 0) + (it.qty || 0));
                }
              }
            }
            const builtItems = [];
            for (const reqIt of items) {
              const qty = Number(reqIt?.qty);
              if (!Number.isInteger(qty) || qty < 1) throw makeErr('Số lượng sản phẩm phải >= 1.', 400, 'invalid_qty');
              const ordered = o.items.find(x => (reqIt.sku ? x.sku === reqIt.sku : x.productId === reqIt.productId));
              if (!ordered) throw makeErr('Sản phẩm không thuộc đơn hàng này.', 400, 'item_not_in_order');
              const k = ordered.sku || ordered.productId;
              const remaining = ordered.qty - (alreadyUsed.get(k) || 0);
              if (qty > remaining) {
                throw makeErr(`Số lượng yêu cầu cho ${ordered.name} vượt quá số lượng còn đủ điều kiện (${remaining}).`, 409, 'invalid_return_qty');
              }
              alreadyUsed.set(k, (alreadyUsed.get(k) || 0) + qty);
              builtItems.push({
                productId: ordered.productId,
                sku: ordered.sku || null,
                name: ordered.name,
                qty,
                condition: 'pending',
              });
            }

            const cleanImages = Array.isArray(images)
              ? images.slice(0, 10).map(x => String(x || '').trim().slice(0, 500)).filter(Boolean)
              : [];
            const shippingFeeBearer = isDefectOrWarranty ? 'store' : 'customer';
            const now = new Date().toISOString();
            const ret = {
              id: 'ret_' + crypto.randomBytes(5).toString('hex'),
              orderId: o.id,
              customerId: auth.customer.id,
              type,
              reasonCategory: cat,
              shippingFeeBearer,
              reason: cleanReason.slice(0, 1000),
              description: String(description || '').trim().slice(0, 2000),
              images: cleanImages,
              status: 'pending',
              items: builtItems,
              createdAt: now,
              createdBy: auth.customer.id,
            };
            draft.returns.push(ret);
            o.history.push({
              status: o.orderStatus,
              note: `Khách gửi yêu cầu ${type} (${ret.id} · ${shippingFeeBearer === 'store' ? 'Lỗi cửa hàng/bảo hành - shop chịu phí VC' : 'Đổi theo nhu cầu - khách chịu phí VC'})`,
              actor: auth.customer.id,
              at: now,
            });
            return ret;
          });
          return sendJson(res, 201, { returnRequest: txRes.result });
        } catch (e) {
          return txCatch(res, e, 'customer_return_create_failed');
        }
      });
      return true;
    }

    // -----------------------------------------------------
    // 6. CUSTOMER SUPPORT / COMPLAINT TICKETS
    // -----------------------------------------------------
    if (pathname === '/api/customer/support-tickets') {
      const auth = requireCustomer(req, res);
      if (!auth) return true;
      if (req.method === 'GET') {
        const tickets = (getDatabase().state.supportTickets || [])
          .filter(t => t.customerId === auth.customer.id)
          .slice()
          .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        return (sendJson(res, 200, { tickets }), true);
      }
      if (req.method !== 'POST') return (sendJson(res, 405, { error: 'method_not_allowed' }), true);
      if (!verifyWriteRequest(req, res)) return true;

      parseJsonBody(req, async (err, body) => {
        if (err) return sendJson(res, err.code, { error: err.error });
        const { orderId, category, subject, message } = body || {};
        try {
          const cleanSubject = String(subject || '').trim();
          const cleanMessage = String(message || '').trim();
          if (!cleanSubject || cleanSubject.length > 200) {
            throw makeErr('Vui lòng nhập tiêu đề khiếu nại/hỗ trợ (tối đa 200 ký tự).', 400, 'invalid_subject');
          }
          if (!cleanMessage || cleanMessage.length > 4000) {
            throw makeErr('Vui lòng nhập nội dung chi tiết (tối đa 4000 ký tự).', 400, 'invalid_message');
          }
          const txRes = await runTransaction(null, draft => {
            const cleanOrderId = orderId ? String(orderId).trim() : null;
            if (cleanOrderId) {
              const o = draft.orders.find(x => x.id === cleanOrderId);
              if (!o) throw makeErr('Không tìm thấy mã đơn hàng.', 404, 'order_not_found');
              if (o.customerId !== auth.customer.id) {
                throw makeErr('Bạn không có quyền gửi khiếu nại cho đơn hàng không thuộc tài khoản của mình.', 403, 'forbidden_order_access');
              }
            }
            const now = new Date().toISOString();
            const ticket = {
              id: 'tkt_' + crypto.randomBytes(5).toString('hex'),
              customerId: auth.customer.id,
              email: auth.customer.email,
              orderId: cleanOrderId,
              category: String(category || 'general').trim().slice(0, 60),
              subject: cleanSubject,
              message: cleanMessage,
              status: 'open',
              adminReply: '',
              createdAt: now,
              updatedAt: now,
            };
            draft.supportTickets.push(ticket);
            return ticket;
          });
          return sendJson(res, 201, { ticket: txRes.result });
        } catch (e) {
          return txCatch(res, e, 'support_ticket_create_failed');
        }
      });
      return true;
    }

    return false;
  };
}

function isExpiredOnlineCandidate(o, nowMs) {
  if (!o || o.paymentMethod !== 'online') return false;
  if (o.orderStatus !== 'pending') return false;
  if (o.paymentStatus === 'paid') return false;
  if (o.inventoryStatus !== 'reserved') return false;
  const expMs = Date.parse(o.holdExpiresAt);
  return !Number.isNaN(expMs) && nowMs > expMs;
}

function createHoldSweeper({ getDatabase, runTransaction, adjustStockWithLog }) {
  let sweeping = false;

  return async function sweepExpiredOnlineOrders() {
    if (sweeping) return { skipped: true, checked: 0, released: 0, failed: 0 };
    sweeping = true;
    let checked = 0;
    let released = 0;
    let failed = 0;

    try {
      const nowMs = Date.now();
      const orders = getDatabase()?.state?.orders || [];
      const candidateIds = orders.filter(o => isExpiredOnlineCandidate(o, nowMs)).map(o => o.id);
      checked = candidateIds.length;

      for (const orderId of candidateIds) {
        try {
          const txRes = await runTransaction(null, draft => {
            const o = draft.orders.find(x => x.id === orderId);
            if (!isExpiredOnlineCandidate(o, Date.now())) {
              return { released: false };
            }
            expireOnlineOrderInDraft(
              draft,
              o,
              'system:hold_sweeper',
              adjustStockWithLog,
              'Tự động hủy và giải phóng tồn kho do quá thời hạn giữ hàng thanh toán trực tuyến'
            );
            return { released: true, orderId: o.id };
          });
          if (txRes?.result?.released) released++;
        } catch (err) {
          failed++;
          console.error(`Lỗi giải phóng đơn hết hạn ${orderId}:`, err.message);
        }
      }

      if (released > 0) {
        console.log(`Đã tự động giải phóng tồn kho cho ${released} đơn thanh toán trực tuyến quá hạn.`);
      }
      return { skipped: false, checked, released, failed };
    } finally {
      sweeping = false;
    }
  };
}

module.exports = {
  createCustomerOrderHandler,
  createHoldSweeper,
};
