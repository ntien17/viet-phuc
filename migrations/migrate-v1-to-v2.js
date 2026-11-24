'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { COLOR_CODE_MAP, buildSku, isPlainObject } = require('../schemas/common.schema');
const { validateDatabaseV2 } = require('../schemas/database.schema');

function mapV1OrderStatus(status) {
  const map = {
    'Chờ xác nhận': 'pending',
    'Đã xác nhận': 'confirmed',
    'Đang đóng gói': 'packing',
    'Đang giao': 'shipping',
    'Đã giao': 'delivered',
    'Giao thất bại': 'delivery_failed',
    'Đang hoàn hàng': 'returning',
    'Đã hoàn hàng': 'returned',
    'Đã hủy': 'cancelled',
  };
  return map[status] || 'pending';
}

function mapV1PaymentStatus(paymentStatus, refund) {
  if (refund === 'Đã hoàn tiền (mô phỏng)' || paymentStatus === 'Đã hoàn tiền' || paymentStatus === 'Đã hoàn toàn bộ') {
    return 'refunded';
  }
  const map = {
    'Chưa thanh toán': 'unpaid',
    'Thanh toán thành công': 'paid',
    'Thanh toán thất bại': 'failed',
    'Đã hoàn tiền': 'refunded',
    'Đã hoàn toàn bộ': 'refunded',
  };
  return map[paymentStatus] || 'unpaid';
}

function mapV1SettlementStatus(settlement) {
  return settlement === 'Đã thực nhận tiền (mô phỏng)' ? 'settled' : 'unsettled';
}

function mapV1InventoryStatus(inv) {
  const map = {
    reserved: 'reserved',
    released: 'released',
    issued: 'fulfilled',
    returned: 'returned',
  };
  return map[inv] || 'reserved';
}

function mapV1ReturnStatus(status) {
  const map = {
    'Chờ xử lý': 'pending',
    'Đã chấp nhận': 'approved',
    'Bị từ chối': 'rejected',
    'Từ chối': 'rejected',
    'Đã hoàn tất': 'completed',
    pending: 'pending',
    approved: 'approved',
    rejected: 'rejected',
    completed: 'completed',
  };
  return map[status] || null;
}

function toIsoFallback(dateStr) {
  if (typeof dateStr === 'string') {
    const parsed = Date.parse(dateStr);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  return new Date().toISOString();
}

function migrateV1DataToV2(v1Data, defaultPolicies) {
  if (isPlainObject(v1Data) && v1Data.schemaVersion === 2) {
    return {
      alreadyV2: true,
      data: v1Data,
      report: {
        alreadyV2: true,
        unresolvedVariants: [],
        unresolvedColors: [],
        unresolvedStock: [],
        unmappedStockKeys: [],
        unresolvedOrderItems: [],
        unresolvedReturnStatuses: [],
      },
    };
  }

  if (!isPlainObject(v1Data) || !isPlainObject(v1Data.state) || !Array.isArray(v1Data.state.products)) {
    throw new Error('Dữ liệu V1 không hợp lệ để migration.');
  }

  const s1 = v1Data.state;
  const report = {
    alreadyV2: false,
    unresolvedVariants: [],
    unresolvedColors: [],
    unresolvedStock: [],
    unmappedStockKeys: [],
    unresolvedOrderItems: [],
    unresolvedReturnStatuses: [],
  };

  // 1. Categories
  const categoryMap = new Map();
  const categories = [];
  let catIdx = 1;

  if (Array.isArray(s1.categories)) {
    for (const c of s1.categories) {
      if (typeof c === 'string' && c.trim() && !categoryMap.has(c.trim())) {
        const id = `cat${catIdx++}`;
        categoryMap.set(c.trim(), id);
        categories.push({ id, name: c.trim(), active: true, sortOrder: categories.length + 1 });
      }
    }
  }
  for (const p of s1.products) {
    const catName = typeof p.category === 'string' ? p.category.trim() : '';
    if (catName && !categoryMap.has(catName)) {
      const id = `cat${catIdx++}`;
      categoryMap.set(catName, id);
      categories.push({ id, name: catName, active: true, sortOrder: categories.length + 1 });
    }
  }

  // 2. Thu thập các size thực tế có căn cứ từ stock V1 theo từng productId
  const v1Stock = isPlainObject(s1.stock) ? s1.stock : {};
  const stockSizesByProduct = new Map();
  const productIdSet = new Set(s1.products.map(p => p.id));

  for (const [key, qty] of Object.entries(v1Stock)) {
    const sepIdx = key.indexOf('|');
    if (sepIdx <= 0) {
      report.unmappedStockKeys.push({ key, qty });
      continue;
    }
    const pid = key.slice(0, sepIdx);
    const size = key.slice(sepIdx + 1);
    if (!productIdSet.has(pid) || !size) {
      report.unmappedStockKeys.push({ key, qty });
      continue;
    }
    if (!stockSizesByProduct.has(pid)) stockSizesByProduct.set(pid, []);
    stockSizesByProduct.get(pid).push(size);
  }

  // 3. Chuyển đổi Products & Stock (tuyệt đối không dùng ?? 8 hay S,M,L,XL mặc định)
  const stockV2 = {};
  const productsV2 = s1.products.map(p => {
    const categoryId = categoryMap.get(String(p.category || '').trim()) || (categories[0]?.id || 'cat1');
    const colorName = typeof p.color === 'string' ? p.color.trim() : '';
    const hasValidColor = Boolean(COLOR_CODE_MAP[colorName]);

    if (!hasValidColor) {
      report.unresolvedColors.push({ productId: p.id, color: p.color });
    }

    const declaredSizes = Array.isArray(p.sizes) ? p.sizes : [];
    const stockSizes = stockSizesByProduct.get(p.id) || [];
    const actualSizes = [...new Set([...declaredSizes, ...stockSizes])];

    if (actualSizes.length === 0) {
      report.unresolvedVariants.push({ productId: p.id, reason: 'Không có sizes và không có bản ghi stock V1' });
    }

    const variants = [];
    if (hasValidColor && actualSizes.length > 0) {
      for (const size of actualSizes) {
        const sku = buildSku(p.id, colorName, size);
        if (!sku) {
          report.unresolvedVariants.push({ productId: p.id, size, reason: 'Không tạo được SKU hợp lệ' });
          continue;
        }
        variants.push({
          sku,
          color: colorName,
          size,
          priceOverride: null,
          active: true,
        });
        const oldKey = `${p.id}|${size}`;
        if (Object.prototype.hasOwnProperty.call(v1Stock, oldKey)) {
          stockV2[sku] = v1Stock[oldKey];
        } else {
          stockV2[sku] = 0;
          report.unresolvedStock.push({ sku, productId: p.id, size, assignedQty: 0 });
        }
      }
    }

    return {
      id: p.id,
      categoryId,
      name: p.name,
      description: typeof p.description === 'string' ? p.description : '',
      price: p.price,
      old: p.old ?? null,
      material: p.material,
      tag: p.tag || '',
      img: p.img,
      variants,
      active: true,
      featured: p.tag === 'BÁN CHẠY' || p.tag === 'ĐƯỢC YÊU THÍCH',
      addedAt: p.addedAt || new Date().toISOString().slice(0, 10),
    };
  });

  // 4. Chuyển đổi Orders & Returns (bảo toàn snapshot & giá cũ)
  const returnsV2 = [];
  const productImgById = new Map(s1.products.map(p => [p.id, p.img]));
  const ordersV2 = (Array.isArray(s1.orders) ? s1.orders : []).map(o => {
    const createdAt = toIsoFallback(o.createdAt || o.date);
    const items = (Array.isArray(o.items) ? o.items : []).map(it => {
      const unitPrice = Number.isSafeInteger(it.unitPrice) ? it.unitPrice : (Number.isSafeInteger(it.price) ? it.price : 0);
      const color = typeof it.color === 'string' && it.color.trim() ? it.color.trim() : 'Không rõ';
      const size = typeof it.size === 'string' && it.size.trim() ? it.size.trim() : 'Không rõ';
      const sku = buildSku(it.id || it.productId, color, size);
      if (!sku) {
        report.unresolvedOrderItems.push({ orderId: o.id, productId: it.id || it.productId, color, size });
      }
      return {
        productId: it.productId || it.id,
        sku: sku || null,
        name: it.name || 'Sản phẩm',
        img: it.img || productImgById.get(it.id || it.productId) || '',
        color,
        size,
        qty: it.qty || 1,
        unitPrice,
      };
    });

    const subtotal = items.reduce((sum, it) => sum + it.unitPrice * it.qty, 0);
    const shippingFee = Number.isSafeInteger(o.shippingFee) ? o.shippingFee : 0;
    const total = Number.isSafeInteger(o.total) ? o.total : subtotal + shippingFee;
    const paymentMethod = o.paymentMethod === 'online' || o.payment === 'online' ? 'online' : 'COD';
    const orderStatus = mapV1OrderStatus(o.status);
    const paymentStatus = mapV1PaymentStatus(o.paymentStatus, o.refund);
    const settlementStatus = mapV1SettlementStatus(o.settlement);
    const inventoryStatus = mapV1InventoryStatus(o.inventory);

    const transactions = [];
    if (paymentStatus === 'paid' || paymentStatus === 'refunded') {
      transactions.push({
        id: `tx_mig_${o.id}`,
        method: paymentMethod,
        amount: total,
        status: 'success',
        isSimulated: true,
        createdAt,
        actor: 'migration_v1',
      });
    } else if (paymentStatus === 'failed') {
      transactions.push({
        id: `tx_mig_${o.id}`,
        method: paymentMethod,
        amount: total,
        status: 'failed',
        isSimulated: true,
        createdAt,
        actor: 'migration_v1',
      });
    }

    const refunds = [];
    if (paymentStatus === 'refunded') {
      refunds.push({
        id: `rf_mig_${o.id}`,
        transactionId: transactions[0]?.id || null,
        amount: total,
        status: 'success',
        isSimulated: true,
        reason: 'Migrated from V1 refunded order',
        createdAt,
        actor: 'migration_v1',
      });
    }

    if (o.returnStatus) {
      const mappedReturnStatus = mapV1ReturnStatus(o.returnStatus);
      if (!mappedReturnStatus) {
        report.unresolvedReturnStatuses.push({ orderId: o.id, rawReturnStatus: o.returnStatus });
      } else {
        returnsV2.push({
          id: `ret_mig_${o.id}`,
          orderId: o.id,
          customerId: null,
          type: 'return',
          items: items.map(it => ({
            productId: it.productId,
            sku: it.sku,
            qty: it.qty,
            condition: mappedReturnStatus === 'completed' ? 'resellable' : 'pending',
          })),
          reason: o.returnReason || 'Yêu cầu đổi trả từ dữ liệu V1',
          images: [],
          withinPolicyDays: true,
          status: mappedReturnStatus,
          resolution: mappedReturnStatus === 'completed' ? 'refund' : null,
          createdAt,
          resolvedAt: mappedReturnStatus === 'completed' ? createdAt : null,
        });
      }
    }

    const history = (Array.isArray(o.history) ? o.history : []).map(h =>
      typeof h === 'string'
        ? { status: orderStatus, note: h, actor: 'migration_v1', at: createdAt }
        : h
    );

    return {
      id: o.id,
      createdAt,
      customerId: null,
      receiver: o.receiver || 'Khách hàng V1',
      phone: o.phone || '0000000000',
      address: o.address || 'Chưa có địa chỉ',
      items,
      subtotal,
      shippingFee,
      discountCode: null,
      discountAmount: 0,
      total,
      paymentMethod,
      orderStatus,
      paymentStatus,
      settlementStatus,
      inventoryStatus,
      shipment: {
        carrier: '',
        trackingCode: '',
        shippedAt: null,
        deliveredAt: orderStatus === 'delivered' ? createdAt : null,
        returnedAt: orderStatus === 'returned' ? createdAt : null,
      },
      transactions,
      refunds,
      policySnapshot: {
        version: 1,
        summary: typeof o.policy === 'string' ? o.policy : 'Chính sách V1',
      },
      history,
    };
  });

  const policies = isPlainObject(s1.policies) && s1.policies.version
    ? s1.policies
    : structuredClone(defaultPolicies);

  const migrated = {
    schemaVersion: 2,
    revision: Number.isSafeInteger(v1Data.revision) ? v1Data.revision + 1 : 1,
    state: {
      categories,
      products: productsV2,
      stock: stockV2,
      inventoryLogs: Array.isArray(s1.inventoryLogs) ? s1.inventoryLogs : [],
      customers: [],
      supportTickets: [],
      orders: ordersV2,
      returns: returnsV2,
      promotions: [],
      policies,
      policyVersions: [],
      adminActivityLogs: [],
      visits: Number.isSafeInteger(s1.visits) ? s1.visits : 0,
      cartEvents: Number.isSafeInteger(s1.cartEvents) ? s1.cartEvents : 0,
    },
  };

  const check = validateDatabaseV2(migrated);
  if (!check.valid) {
    const details = check.errors.map(e => `${e.path}: ${e.message}`).join('; ');
    throw new Error(`Migration V2 không đạt chuẩn schema: ${details}`);
  }

  return { alreadyV2: false, data: migrated, report };
}

function migrateDatabaseFile(databasePath, defaultPolicies) {
  const raw = fs.readFileSync(databasePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (isPlainObject(parsed) && parsed.schemaVersion === 2) {
    return { alreadyV2: true, data: parsed, backupPath: null, report: { alreadyV2: true } };
  }

  // Tạo backup V1 và đọc lại để xác minh trước khi migrate
  const dir = path.dirname(databasePath);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(dir, `database.v1.backup-${stamp}.json`);
  const fd = fs.openSync(backupPath, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, raw, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }

  // Xác minh backup có thể đọc lại hợp lệ
  const verifyBackup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  if (!isPlainObject(verifyBackup) || !isPlainObject(verifyBackup.state)) {
    throw new Error('Xác minh file backup V1 thất bại.');
  }

  const result = migrateV1DataToV2(verifyBackup, defaultPolicies);

  // Ghi nguyên tử file V2
  const temp = path.join(dir, `.migrate-${process.pid}-${Date.now()}.tmp`);
  try {
    const tfd = fs.openSync(temp, 'wx', 0o600);
    try {
      fs.writeFileSync(tfd, JSON.stringify(result.data, null, 2) + '\n', 'utf8');
      fs.fsyncSync(tfd);
    } finally {
      fs.closeSync(tfd);
    }
    fs.renameSync(temp, databasePath);
  } finally {
    try { fs.unlinkSync(temp); } catch (_) {}
  }

  return { alreadyV2: false, data: result.data, backupPath, report: result.report };
}

module.exports = {
  migrateV1DataToV2,
  migrateDatabaseFile,
};
