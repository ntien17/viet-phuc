'use strict';

const {
  ENUMS,
  ID_REGEX,
  isPlainObject,
  isNonEmptyString,
  isNonNegInt,
  isPosInt,
  isIsoDateString,
} = require('./common.schema');

function validatePromotions(promotions, err) {
  if (!Array.isArray(promotions) || promotions.length > 5000) {
    err.add('state.promotions', 'promotions phải là mảng hợp lệ.');
    return;
  }
  const promoIds = new Set();
  const codes = new Set();
  promotions.forEach((promo, idx) => {
    const pp = `state.promotions[${idx}]`;
    if (!isPlainObject(promo)) return err.add(pp, 'Khuyến mãi phải là object.');
    if (typeof promo.id !== 'string' || !ID_REGEX.test(promo.id) || promoIds.has(promo.id)) {
      err.add(`${pp}.id`, 'id khuyến mãi không hợp lệ hoặc bị trùng.');
    } else {
      promoIds.add(promo.id);
    }
    if (typeof promo.code !== 'string' || !/^[A-Z0-9_-]{3,40}$/.test(promo.code) || codes.has(promo.code)) {
      err.add(`${pp}.code`, 'Mã khuyến mãi phải viết hoa (3-40 ký tự) và không trùng.');
    } else {
      codes.add(promo.code);
    }
    if (!ENUMS.promotionType.includes(promo.type)) err.add(`${pp}.type`, 'type phải là percent hoặc fixed.');
    if (!isPosInt(promo.value)) err.add(`${pp}.value`, 'value phải > 0.');
    if (promo.type === 'percent' && promo.value > 100) err.add(`${pp}.value`, 'Phần trăm giảm tối đa 100.');
    if (!isNonNegInt(promo.minOrder)) err.add(`${pp}.minOrder`, 'minOrder phải >= 0.');
    if (promo.maxDiscount !== null && promo.maxDiscount !== undefined && !isNonNegInt(promo.maxDiscount)) {
      err.add(`${pp}.maxDiscount`, 'maxDiscount không hợp lệ.');
    }
    if (!isPosInt(promo.usageLimit)) err.add(`${pp}.usageLimit`, 'usageLimit phải >= 1.');
    if (!isNonNegInt(promo.usedCount)) err.add(`${pp}.usedCount`, 'usedCount phải >= 0.');
    if (isPosInt(promo.usageLimit) && isNonNegInt(promo.usedCount) && promo.usedCount > promo.usageLimit) {
      err.add(`${pp}.usedCount`, 'usedCount không được vượt quá usageLimit.');
    }
    if (typeof promo.active !== 'boolean') err.add(`${pp}.active`, 'active phải là boolean.');
    if (!isIsoDateString(promo.startAt)) err.add(`${pp}.startAt`, 'startAt phải là ngày ISO.');
    if (!isIsoDateString(promo.endAt)) err.add(`${pp}.endAt`, 'endAt phải là ngày ISO.');
  });
}

function validatePolicies(policies, err) {
  if (!isPlainObject(policies)) {
    err.add('state.policies', 'policies phải là object.');
    return;
  }
  if (!isPosInt(policies.version)) err.add('state.policies.version', 'version phải là số nguyên >= 1.');
  if (!isIsoDateString(policies.updatedAt)) err.add('state.policies.updatedAt', 'updatedAt phải là ngày ISO.');
  if (!isPlainObject(policies.storeInfo)) err.add('state.policies.storeInfo', 'storeInfo phải là object.');
  if (!isPlainObject(policies.banners)) err.add('state.policies.banners', 'banners phải là object.');
  if (!isPlainObject(policies.items)) err.add('state.policies.items', 'items phải là object.');
}

function validatePolicyVersions(versions, err) {
  if (!Array.isArray(versions) || versions.length > 500) {
    err.add('state.policyVersions', 'policyVersions phải là mảng hợp lệ.');
  }
}

function validateAdminActivityLogs(logs, err) {
  if (!Array.isArray(logs) || logs.length > 50000) {
    err.add('state.adminActivityLogs', 'adminActivityLogs phải là mảng hợp lệ.');
    return;
  }
  logs.forEach((log, idx) => {
    const lp = `state.adminActivityLogs[${idx}]`;
    if (!isPlainObject(log)) return err.add(lp, 'Log Admin phải là object.');
    if (!isNonEmptyString(log.id, 100)) err.add(`${lp}.id`, 'Thiếu id.');
    if (!isNonEmptyString(log.actor, 100)) err.add(`${lp}.actor`, 'Thiếu actor.');
    if (!isNonEmptyString(log.action, 100)) err.add(`${lp}.action`, 'Thiếu action.');
    if (!isIsoDateString(log.createdAt)) err.add(`${lp}.createdAt`, 'createdAt phải là ngày ISO.');
  });
}

module.exports = {
  validatePromotions,
  validatePolicies,
  validatePolicyVersions,
  validateAdminActivityLogs,
};
