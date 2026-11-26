'use strict';

// Bảng ánh xạ 1-1 tên màu tiếng Việt sang COLOR_CODE chuẩn (không trùng mã)
const COLOR_CODE_MAP = Object.freeze({
  'Đỏ': 'RED',
  'Đen': 'BLACK',
  'Trắng': 'WHITE',
  'Đỏ trầm': 'DO_TRAM',
  'Trắng ngà': 'TRANG_NGA',
  'Nâu đất': 'NAU_DAT',
  'Hồng sen': 'HONG_SEN',
  'Hồng phấn': 'HONG_PHAN',
  'Xanh nhạt': 'XANH_NHAT',
  'Xanh rêu': 'XANH_REU',
});

const ENUMS = Object.freeze({
  orderStatus: ['pending', 'confirmed', 'packing', 'shipping', 'delivered', 'delivery_failed', 'returning', 'returned', 'cancelled'],
  paymentMethod: ['COD', 'online'],
  paymentStatus: ['unpaid', 'pending', 'paid', 'failed', 'partially_refunded', 'refunded'],
  settlementStatus: ['unsettled', 'pending', 'settled'],
  inventoryStatus: ['reserved', 'released', 'fulfilled', 'partially_returned', 'returned'],
  returnType: ['return', 'exchange', 'warranty'],
  returnStatus: ['pending', 'approved', 'rejected', 'completed'],
  returnCondition: ['pending', 'resellable', 'damaged'],
  supportStatus: ['open', 'in_progress', 'resolved', 'closed'],
  promotionType: ['percent', 'fixed'],
  txStatus: ['pending', 'success', 'failed'],
  refundStatus: ['pending', 'success', 'failed'],
});

const SKU_REGEX = /^VP-[A-Z0-9_-]+-[A-Z0-9_]+-[A-Z0-9_]+$/;
const ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

function normalizeSizeCode(size) {
  if (typeof size !== 'string') return '';
  return size.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function buildSku(productId, colorName, size) {
  if (typeof productId !== 'string' || !ID_REGEX.test(productId)) return null;
  const colorCode = COLOR_CODE_MAP[colorName];
  const sizeCode = normalizeSizeCode(size);
  if (!colorCode || !sizeCode) return null;
  const sku = `VP-${productId.toUpperCase()}-${colorCode}-${sizeCode}`;
  return SKU_REGEX.test(sku) ? sku : null;
}

function isPlainObject(v) {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function isNonEmptyString(v, maxLen = 500) {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= maxLen;
}

function isOptionalString(v, maxLen = 2000) {
  return v === undefined || v === null || (typeof v === 'string' && v.length <= maxLen);
}

function isNonNegInt(v) {
  return Number.isSafeInteger(v) && v >= 0;
}

function isPosInt(v) {
  return Number.isSafeInteger(v) && v >= 1;
}

function isIsoDateString(v) {
  if (typeof v !== 'string' || v.length < 10 || v.length > 40) return false;
  const t = Date.parse(v);
  return Number.isFinite(t);
}

function createErrorCollector() {
  const errors = [];
  return {
    add(path, message) {
      if (errors.length < 50) errors.push({ path, message });
    },
    get valid() {
      return errors.length === 0;
    },
    errors,
  };
}

module.exports = {
  COLOR_CODE_MAP,
  ENUMS,
  SKU_REGEX,
  ID_REGEX,
  normalizeSizeCode,
  buildSku,
  isPlainObject,
  isNonEmptyString,
  isOptionalString,
  isNonNegInt,
  isPosInt,
  isIsoDateString,
  createErrorCollector,
};
