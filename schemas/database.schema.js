'use strict';

const { isPlainObject, isNonNegInt, createErrorCollector } = require('./common.schema');
const { validateCategories, validateProducts, validateStock, validateInventoryLogs } = require('./product.schema');
const { validateCustomers, validateSupportTickets } = require('./customer.schema');
const { validateOrders, validateReturns } = require('./order.schema');
const { validatePromotions, validatePolicies, validatePolicyVersions, validateAdminActivityLogs } = require('./promotion.schema');

const STATE_V2_KEYS = Object.freeze([
  'adminActivityLogs',
  'cartEvents',
  'categories',
  'customers',
  'inventoryLogs',
  'orders',
  'policies',
  'policyVersions',
  'products',
  'promotions',
  'returns',
  'stock',
  'supportTickets',
  'visits',
]);

function validateDatabaseV2(data) {
  const err = createErrorCollector();
  if (!isPlainObject(data)) {
    err.add('root', 'Database phải là object.');
    return { valid: false, errors: err.errors };
  }
  if (data.schemaVersion !== 2) err.add('schemaVersion', 'schemaVersion phải bằng 2.');
  if (!isNonNegInt(data.revision)) err.add('revision', 'revision phải là số nguyên >= 0.');
  if (!isPlainObject(data.state)) {
    err.add('state', 'state phải là object.');
    return { valid: false, errors: err.errors };
  }

  const state = data.state;
  const keySet = new Set(Object.keys(state));
  for (const k of STATE_V2_KEYS) {
    if (!keySet.has(k)) err.add(`state.${k}`, `Thiếu trường bắt buộc ${k}.`);
  }
  for (const k of keySet) {
    if (!STATE_V2_KEYS.includes(k)) err.add(`state.${k}`, `Trường ${k} không nằm trong Schema V2.`);
  }

  const categoryIds = validateCategories(state.categories, err);
  const { skuSet } = validateProducts(state.products, categoryIds, err);
  validateStock(state.stock, skuSet, err);
  validateInventoryLogs(state.inventoryLogs, err);
  validateCustomers(state.customers, err);
  validateSupportTickets(state.supportTickets, err);
  const orderIds = validateOrders(state.orders, err);
  validateReturns(state.returns, orderIds, err);
  validatePromotions(state.promotions, err);
  validatePolicies(state.policies, err);
  validatePolicyVersions(state.policyVersions, err);
  validateAdminActivityLogs(state.adminActivityLogs, err);

  if (!isNonNegInt(state.visits)) err.add('state.visits', 'visits phải là số nguyên >= 0.');
  if (!isNonNegInt(state.cartEvents)) err.add('state.cartEvents', 'cartEvents phải là số nguyên >= 0.');

  return { valid: err.valid, errors: err.errors };
}

module.exports = {
  STATE_V2_KEYS,
  validateDatabaseV2,
};
