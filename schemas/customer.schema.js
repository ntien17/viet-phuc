'use strict';

const {
  ENUMS,
  ID_REGEX,
  isPlainObject,
  isNonEmptyString,
  isOptionalString,
  isIsoDateString,
} = require('./common.schema');

function validateCustomers(customers, err) {
  const customerIds = new Set();
  const emails = new Set();
  const phones = new Set();
  if (!Array.isArray(customers) || customers.length > 50000) {
    err.add('state.customers', 'customers phải là mảng hợp lệ.');
    return customerIds;
  }

  customers.forEach((cus, idx) => {
    const cp = `state.customers[${idx}]`;
    if (!isPlainObject(cus)) return err.add(cp, 'Khách hàng phải là object.');
    if (typeof cus.id !== 'string' || !ID_REGEX.test(cus.id) || customerIds.has(cus.id)) {
      err.add(`${cp}.id`, 'Mã khách hàng không hợp lệ hoặc bị trùng.');
    } else {
      customerIds.add(cus.id);
    }
    if (!isNonEmptyString(cus.name, 150)) err.add(`${cp}.name`, 'Tên khách hàng không hợp lệ.');
    if (typeof cus.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cus.email) || cus.email !== cus.email.toLowerCase()) {
      err.add(`${cp}.email`, 'Email phải hợp lệ và viết chữ thường.');
    } else if (emails.has(cus.email)) {
      err.add(`${cp}.email`, 'Email bị trùng.');
    } else {
      emails.add(cus.email);
    }
    if (!isOptionalString(cus.phone, 30)) {
      err.add(`${cp}.phone`, 'Số điện thoại không hợp lệ.');
    } else if (typeof cus.phone === 'string' && cus.phone.trim().length > 0) {
      if (phones.has(cus.phone)) {
        err.add(`${cp}.phone`, 'Số điện thoại bị trùng.');
      } else {
        phones.add(cus.phone);
      }
    }
    if (!isOptionalString(cus.defaultAddress, 500)) err.add(`${cp}.defaultAddress`, 'Địa chỉ mặc định không hợp lệ.');
    if (!isNonEmptyString(cus.passwordSalt, 128)) err.add(`${cp}.passwordSalt`, 'Thiếu passwordSalt.');
    if (!isNonEmptyString(cus.passwordHash, 256)) err.add(`${cp}.passwordHash`, 'Thiếu passwordHash.');
    if (typeof cus.locked !== 'boolean') err.add(`${cp}.locked`, 'locked phải là boolean.');
    if (!isOptionalString(cus.lockedReason, 500)) err.add(`${cp}.lockedReason`, 'lockedReason không hợp lệ.');
    if (!isIsoDateString(cus.createdAt)) err.add(`${cp}.createdAt`, 'createdAt phải là ngày ISO.');
    if (cus.updatedAt !== undefined && cus.updatedAt !== null && !isIsoDateString(cus.updatedAt)) {
      err.add(`${cp}.updatedAt`, 'updatedAt phải là ngày ISO.');
    }
  });

  return customerIds;
}

function validateSupportTickets(tickets, err) {
  if (!Array.isArray(tickets) || tickets.length > 20000) {
    err.add('state.supportTickets', 'supportTickets phải là mảng hợp lệ.');
    return;
  }
  const ticketIds = new Set();
  tickets.forEach((t, idx) => {
    const tp = `state.supportTickets[${idx}]`;
    if (!isPlainObject(t)) return err.add(tp, 'Ticket hỗ trợ phải là object.');
    if (typeof t.id !== 'string' || !ID_REGEX.test(t.id) || ticketIds.has(t.id)) {
      err.add(`${tp}.id`, 'Mã ticket không hợp lệ hoặc bị trùng.');
    } else {
      ticketIds.add(t.id);
    }
    if (t.customerId !== null && t.customerId !== undefined && typeof t.customerId !== 'string') {
      err.add(`${tp}.customerId`, 'customerId không hợp lệ.');
    }
    if (!isNonEmptyString(t.email, 200)) err.add(`${tp}.email`, 'Thiếu email.');
    if (!isNonEmptyString(t.subject, 200)) err.add(`${tp}.subject`, 'Thiếu tiêu đề hỗ trợ.');
    if (!isNonEmptyString(t.message, 4000)) err.add(`${tp}.message`, 'Thiếu nội dung hỗ trợ.');
    if (!ENUMS.supportStatus.includes(t.status)) err.add(`${tp}.status`, 'Trạng thái ticket không hợp lệ.');
    if (!isOptionalString(t.adminReply, 4000)) err.add(`${tp}.adminReply`, 'adminReply không hợp lệ.');
    if (!isIsoDateString(t.createdAt)) err.add(`${tp}.createdAt`, 'createdAt phải là ngày ISO.');
    if (!isIsoDateString(t.updatedAt)) err.add(`${tp}.updatedAt`, 'updatedAt phải là ngày ISO.');
  });
}

module.exports = {
  validateCustomers,
  validateSupportTickets,
};
