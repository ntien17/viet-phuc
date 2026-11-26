'use strict';

const {
  COLOR_CODE_MAP,
  SKU_REGEX,
  ID_REGEX,
  isPlainObject,
  isNonEmptyString,
  isOptionalString,
  isNonNegInt,
  isIsoDateString,
} = require('./common.schema');

function validateCategories(categories, err) {
  const categoryIds = new Set();
  if (!Array.isArray(categories) || categories.length > 200) {
    err.add('state.categories', 'categories phải là mảng hợp lệ (tối đa 200).');
    return categoryIds;
  }
  categories.forEach((cat, idx) => {
    const p = `state.categories[${idx}]`;
    if (!isPlainObject(cat)) return err.add(p, 'Danh mục phải là object.');
    if (typeof cat.id !== 'string' || !ID_REGEX.test(cat.id) || categoryIds.has(cat.id)) {
      err.add(`${p}.id`, 'Mã danh mục không hợp lệ hoặc bị trùng.');
    } else {
      categoryIds.add(cat.id);
    }
    if (!isNonEmptyString(cat.name, 100)) err.add(`${p}.name`, 'Tên danh mục không hợp lệ.');
    if (typeof cat.active !== 'boolean') err.add(`${p}.active`, 'active phải là boolean.');
    if (!isNonNegInt(cat.sortOrder)) err.add(`${p}.sortOrder`, 'sortOrder phải là số nguyên >= 0.');
  });
  return categoryIds;
}

function validateProducts(products, categoryIds, err) {
  const productIds = new Set();
  const skuSet = new Set();
  if (!Array.isArray(products) || products.length > 10000) {
    err.add('state.products', 'products phải là mảng hợp lệ (tối đa 10000).');
    return { productIds, skuSet };
  }

  products.forEach((prod, idx) => {
    const p = `state.products[${idx}]`;
    if (!isPlainObject(prod)) return err.add(p, 'Sản phẩm phải là object.');
    if (typeof prod.id !== 'string' || !ID_REGEX.test(prod.id) || productIds.has(prod.id)) {
      err.add(`${p}.id`, 'Mã sản phẩm không hợp lệ hoặc bị trùng.');
    } else {
      productIds.add(prod.id);
    }
    if (typeof prod.categoryId !== 'string' || !categoryIds.has(prod.categoryId)) {
      err.add(`${p}.categoryId`, 'categoryId không tồn tại trong categories.');
    }
    if (!isNonEmptyString(prod.name, 200)) err.add(`${p}.name`, 'Tên sản phẩm không hợp lệ.');
    if (!isOptionalString(prod.description, 4000)) err.add(`${p}.description`, 'Mô tả không hợp lệ.');
    if (!isNonNegInt(prod.price)) err.add(`${p}.price`, 'Giá bán phải là số nguyên >= 0.');
    if (prod.old !== undefined && prod.old !== null && !isNonNegInt(prod.old)) {
      err.add(`${p}.old`, 'Giá cũ phải là số nguyên >= 0 hoặc null.');
    }
    if (!isNonEmptyString(prod.material, 200)) err.add(`${p}.material`, 'Chất liệu không hợp lệ.');
    if (!isOptionalString(prod.tag, 100)) err.add(`${p}.tag`, 'Nhãn không hợp lệ.');
    if (!isNonEmptyString(prod.img, 500)) err.add(`${p}.img`, 'Đường dẫn ảnh không hợp lệ.');
    if (typeof prod.active !== 'boolean') err.add(`${p}.active`, 'active phải là boolean.');
    if (typeof prod.featured !== 'boolean') err.add(`${p}.featured`, 'featured phải là boolean.');
    if (!isNonEmptyString(prod.addedAt, 40)) err.add(`${p}.addedAt`, 'addedAt không hợp lệ.');

    if (!Array.isArray(prod.variants) || prod.variants.length > 100) {
      err.add(`${p}.variants`, 'variants phải là mảng (tối đa 100 biến thể).');
    } else {
      prod.variants.forEach((v, vIdx) => {
        const vp = `${p}.variants[${vIdx}]`;
        if (!isPlainObject(v)) return err.add(vp, 'Biến thể phải là object.');
        if (typeof v.sku !== 'string' || !SKU_REGEX.test(v.sku) || skuSet.has(v.sku)) {
          err.add(`${vp}.sku`, 'SKU không hợp lệ hoặc bị trùng.');
        } else {
          skuSet.add(v.sku);
        }
        if (!isNonEmptyString(v.color, 60) || !COLOR_CODE_MAP[v.color]) {
          err.add(`${vp}.color`, 'Màu biến thể chưa được khai báo trong bảng COLOR_CODE.');
        }
        if (!isNonEmptyString(v.size, 50)) err.add(`${vp}.size`, 'Kích thước biến thể không hợp lệ.');
        if (v.priceOverride !== undefined && v.priceOverride !== null && !isNonNegInt(v.priceOverride)) {
          err.add(`${vp}.priceOverride`, 'priceOverride phải là số nguyên >= 0 hoặc null.');
        }
        if (typeof v.active !== 'boolean') err.add(`${vp}.active`, 'active phải là boolean.');
        if ('stock' in v) err.add(`${vp}.stock`, 'Không lưu tồn kho trùng lặp trong variants[].');
      });
    }
  });

  return { productIds, skuSet };
}

function validateStock(stock, skuSet, err) {
  if (!isPlainObject(stock) || Object.keys(stock).length > 50000) {
    err.add('state.stock', 'stock phải là object hợp lệ.');
    return;
  }
  for (const [sku, qty] of Object.entries(stock)) {
    if (!SKU_REGEX.test(sku)) {
      err.add(`state.stock.${sku}`, 'Khóa tồn kho phải là SKU hợp lệ.');
    } else if (!skuSet.has(sku)) {
      err.add(`state.stock.${sku}`, 'SKU tồn kho không tồn tại trong variants[].');
    }
    if (!isNonNegInt(qty)) {
      err.add(`state.stock.${sku}`, 'Số lượng tồn kho phải là số nguyên >= 0.');
    }
  }
}

function validateInventoryLogs(logs, err) {
  if (!Array.isArray(logs) || logs.length > 50000) {
    err.add('state.inventoryLogs', 'inventoryLogs phải là mảng hợp lệ.');
    return;
  }
  logs.forEach((log, idx) => {
    const lp = `state.inventoryLogs[${idx}]`;
    if (!isPlainObject(log)) return err.add(lp, 'Log tồn kho phải là object.');
    if (!isNonEmptyString(log.id, 100)) err.add(`${lp}.id`, 'Thiếu id log.');
    if (typeof log.sku !== 'string' || !SKU_REGEX.test(log.sku)) err.add(`${lp}.sku`, 'SKU log không hợp lệ.');
    if (!isNonEmptyString(log.productId, 64)) err.add(`${lp}.productId`, 'Thiếu productId.');
    if (!isNonNegInt(log.beforeQty)) err.add(`${lp}.beforeQty`, 'beforeQty phải >= 0.');
    if (!Number.isSafeInteger(log.delta)) err.add(`${lp}.delta`, 'delta phải là số nguyên.');
    if (!isNonNegInt(log.afterQty)) err.add(`${lp}.afterQty`, 'afterQty phải >= 0.');
    if (Number.isSafeInteger(log.beforeQty) && Number.isSafeInteger(log.delta) && log.beforeQty + log.delta !== log.afterQty) {
      err.add(`${lp}.afterQty`, 'beforeQty + delta phải bằng afterQty.');
    }
    if (!isNonEmptyString(log.reason, 100)) err.add(`${lp}.reason`, 'Thiếu reason.');
    if (!isOptionalString(log.refId, 100)) err.add(`${lp}.refId`, 'refId không hợp lệ.');
    if (!isNonEmptyString(log.actor, 100)) err.add(`${lp}.actor`, 'Thiếu actor.');
    if (!isIsoDateString(log.createdAt)) err.add(`${lp}.createdAt`, 'createdAt phải là ngày ISO.');
  });
}

module.exports = {
  validateCategories,
  validateProducts,
  validateStock,
  validateInventoryLogs,
};
