'use strict';

const {
  ENUMS,
  SKU_REGEX,
  ID_REGEX,
  isPlainObject,
  isNonEmptyString,
  isOptionalString,
  isNonNegInt,
  isPosInt,
  isIsoDateString,
} = require('./common.schema');

function validateOrderItems(items, op, err) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 1000) {
    err.add(`${op}.items`, 'Đơn hàng phải có ít nhất 1 sản phẩm.');
    return;
  }
  items.forEach((item, idx) => {
    const ip = `${op}.items[${idx}]`;
    if (!isPlainObject(item)) return err.add(ip, 'Order item phải là object.');
    if (!isNonEmptyString(item.productId, 64)) err.add(`${ip}.productId`, 'Thiếu productId trong snapshot.');
    if (item.sku !== null && (typeof item.sku !== 'string' || !SKU_REGEX.test(item.sku))) {
      err.add(`${ip}.sku`, 'SKU trong snapshot phải hợp lệ hoặc null (đơn cũ chưa xác định SKU).');
    }
    if (!isNonEmptyString(item.name, 200)) err.add(`${ip}.name`, 'Thiếu tên sản phẩm trong snapshot.');
    if (!isOptionalString(item.img, 500)) err.add(`${ip}.img`, 'Đường dẫn ảnh không hợp lệ.');
    if (!isNonEmptyString(item.color, 80)) err.add(`${ip}.color`, 'Thiếu màu sắc trong snapshot.');
    if (!isNonEmptyString(item.size, 50)) err.add(`${ip}.size`, 'Thiếu kích thước trong snapshot.');
    if (!isPosInt(item.qty)) err.add(`${ip}.qty`, 'Số lượng mua phải >= 1.');
    if (!isNonNegInt(item.unitPrice)) err.add(`${ip}.unitPrice`, 'unitPrice phải là số nguyên >= 0.');
  });
}

function validateOrders(orders, err) {
  const orderIds = new Set();
  if (!Array.isArray(orders) || orders.length > 20000) {
    err.add('state.orders', 'orders phải là mảng hợp lệ.');
    return orderIds;
  }

  orders.forEach((order, idx) => {
    const op = `state.orders[${idx}]`;
    if (!isPlainObject(order)) return err.add(op, 'Đơn hàng phải là object.');
    if (typeof order.id !== 'string' || order.id.length < 1 || order.id.length > 100 || orderIds.has(order.id)) {
      err.add(`${op}.id`, 'Mã đơn hàng không hợp lệ hoặc bị trùng.');
    } else {
      orderIds.add(order.id);
    }
    if (!isIsoDateString(order.createdAt)) err.add(`${op}.createdAt`, 'createdAt phải là ngày ISO.');
    if (order.customerId !== null && typeof order.customerId !== 'string') {
      err.add(`${op}.customerId`, 'customerId phải là string hoặc null.');
    }
    if (!isNonEmptyString(order.receiver, 150)) err.add(`${op}.receiver`, 'Thiếu tên người nhận.');
    if (!isNonEmptyString(order.phone, 40)) err.add(`${op}.phone`, 'Thiếu số điện thoại người nhận.');
    if (!isNonEmptyString(order.address, 500)) err.add(`${op}.address`, 'Thiếu địa chỉ nhận hàng.');

    validateOrderItems(order.items, op, err);

    if (!isNonNegInt(order.subtotal)) err.add(`${op}.subtotal`, 'subtotal không hợp lệ.');
    if (!isNonNegInt(order.shippingFee)) err.add(`${op}.shippingFee`, 'shippingFee không hợp lệ.');
    if (order.discountCode !== null && order.discountCode !== undefined && typeof order.discountCode !== 'string') {
      err.add(`${op}.discountCode`, 'discountCode không hợp lệ.');
    }
    if (!isNonNegInt(order.discountAmount)) err.add(`${op}.discountAmount`, 'discountAmount không hợp lệ.');
    if (!isNonNegInt(order.total)) err.add(`${op}.total`, 'total không hợp lệ.');

    if (!ENUMS.paymentMethod.includes(order.paymentMethod)) err.add(`${op}.paymentMethod`, 'paymentMethod không hợp lệ.');
    if (!ENUMS.orderStatus.includes(order.orderStatus)) err.add(`${op}.orderStatus`, 'orderStatus không hợp lệ.');
    if (!ENUMS.paymentStatus.includes(order.paymentStatus)) err.add(`${op}.paymentStatus`, 'paymentStatus không hợp lệ.');
    if (!ENUMS.settlementStatus.includes(order.settlementStatus)) err.add(`${op}.settlementStatus`, 'settlementStatus không hợp lệ.');
    if (!ENUMS.inventoryStatus.includes(order.inventoryStatus)) err.add(`${op}.inventoryStatus`, 'inventoryStatus không hợp lệ.');
    if ('refund' in order) err.add(`${op}.refund`, 'Không lưu trường refund trùng lặp với refunds[].');

    if (!isPlainObject(order.shipment)) err.add(`${op}.shipment`, 'shipment phải là object.');
    if (!isPlainObject(order.policySnapshot)) err.add(`${op}.policySnapshot`, 'policySnapshot phải là object.');
    if (!Array.isArray(order.history)) err.add(`${op}.history`, 'history phải là mảng.');

    let paidTotal = 0;
    if (!Array.isArray(order.transactions)) {
      err.add(`${op}.transactions`, 'transactions phải là mảng.');
    } else {
      order.transactions.forEach((tx, tIdx) => {
        const tp = `${op}.transactions[${tIdx}]`;
        if (!isPlainObject(tx)) return err.add(tp, 'Transaction phải là object.');
        if (!isNonEmptyString(tx.id, 100)) err.add(`${tp}.id`, 'Thiếu id giao dịch.');
        if (!ENUMS.paymentMethod.includes(tx.method)) err.add(`${tp}.method`, 'method giao dịch không hợp lệ.');
        if (!isNonNegInt(tx.amount)) err.add(`${tp}.amount`, 'amount phải >= 0.');
        if (!ENUMS.txStatus.includes(tx.status)) err.add(`${tp}.status`, 'status giao dịch không hợp lệ.');
        if (typeof tx.isSimulated !== 'boolean') err.add(`${tp}.isSimulated`, 'isSimulated phải là boolean.');
        if (!isIsoDateString(tx.createdAt)) err.add(`${tp}.createdAt`, 'createdAt phải là ngày ISO.');
        if (tx.status === 'success') paidTotal += tx.amount || 0;
      });
    }

    let refundedTotal = 0;
    if (!Array.isArray(order.refunds)) {
      err.add(`${op}.refunds`, 'refunds phải là mảng.');
    } else {
      order.refunds.forEach((rf, rIdx) => {
        const rp = `${op}.refunds[${rIdx}]`;
        if (!isPlainObject(rf)) return err.add(rp, 'Refund phải là object.');
        if (!isNonEmptyString(rf.id, 100)) err.add(`${rp}.id`, 'Thiếu id hoàn tiền.');
        if (!isPosInt(rf.amount)) err.add(`${rp}.amount`, 'Số tiền hoàn phải > 0.');
        if (!ENUMS.refundStatus.includes(rf.status)) err.add(`${rp}.status`, 'status hoàn tiền không hợp lệ.');
        if (typeof rf.isSimulated !== 'boolean') err.add(`${rp}.isSimulated`, 'isSimulated phải là boolean.');
        if (!isNonEmptyString(rf.reason, 500)) err.add(`${rp}.reason`, 'Thiếu lý do hoàn tiền.');
        if (!isIsoDateString(rf.createdAt)) err.add(`${rp}.createdAt`, 'createdAt phải là ngày ISO.');
        if (rf.status === 'success') refundedTotal += rf.amount || 0;
      });
      if (refundedTotal > paidTotal && order.refunds.some(r => r.status === 'success')) {
        err.add(`${op}.refunds`, 'Tổng tiền đã hoàn vượt quá tổng tiền đã thanh toán thành công.');
      }
    }

    if (order.cancelRequest !== undefined && order.cancelRequest !== null) {
      const cr = order.cancelRequest;
      const crp = `${op}.cancelRequest`;
      if (!isPlainObject(cr)) {
        err.add(crp, 'cancelRequest phải là object.');
      } else {
        if (!isNonEmptyString(cr.id, 100)) err.add(`${crp}.id`, 'Thiếu id yêu cầu hủy.');
        if (!['pending', 'approved', 'rejected'].includes(cr.status)) err.add(`${crp}.status`, 'Trạng thái yêu cầu hủy không hợp lệ.');
        if (!isNonEmptyString(cr.reason, 500)) err.add(`${crp}.reason`, 'Thiếu lý do yêu cầu hủy.');
        if (!isIsoDateString(cr.createdAt)) err.add(`${crp}.createdAt`, 'createdAt yêu cầu hủy phải là ngày ISO.');
        if (cr.resolvedAt !== undefined && cr.resolvedAt !== null && !isIsoDateString(cr.resolvedAt)) err.add(`${crp}.resolvedAt`, 'resolvedAt phải là ngày ISO.');
        if (cr.adminReason !== undefined && cr.adminReason !== null && typeof cr.adminReason !== 'string') err.add(`${crp}.adminReason`, 'adminReason không hợp lệ.');
      }
    }

    if (order.changeRequests !== undefined) {
      if (!Array.isArray(order.changeRequests) || order.changeRequests.length > 100) {
        err.add(`${op}.changeRequests`, 'changeRequests phải là mảng hợp lệ.');
      } else {
        order.changeRequests.forEach((ch, cIdx) => {
          const chp = `${op}.changeRequests[${cIdx}]`;
          if (!isPlainObject(ch)) return err.add(chp, 'changeRequest phải là object.');
          if (!isNonEmptyString(ch.id, 100)) err.add(`${chp}.id`, 'Thiếu id yêu cầu thay đổi.');
          if (!['pending', 'approved', 'rejected'].includes(ch.status)) err.add(`${chp}.status`, 'Trạng thái yêu cầu thay đổi không hợp lệ.');
          if (!['address', 'variant', 'both'].includes(ch.type)) err.add(`${chp}.type`, 'Loại yêu cầu thay đổi không hợp lệ.');
          if (!isNonEmptyString(ch.reason, 500)) err.add(`${chp}.reason`, 'Thiếu lý do yêu cầu thay đổi.');
          if (!isIsoDateString(ch.createdAt)) err.add(`${chp}.createdAt`, 'createdAt phải là ngày ISO.');
          if (ch.resolvedAt !== undefined && ch.resolvedAt !== null && !isIsoDateString(ch.resolvedAt)) err.add(`${chp}.resolvedAt`, 'resolvedAt phải là ngày ISO.');
          if (!isPlainObject(ch.oldData) || !isPlainObject(ch.newData)) err.add(chp, 'Thiếu oldData hoặc newData.');
        });
      }
    }
  });

  return orderIds;
}

function validateReturns(returns, orderIds, err) {
  if (!Array.isArray(returns) || returns.length > 20000) {
    err.add('state.returns', 'returns phải là mảng hợp lệ.');
    return;
  }
  const returnIds = new Set();
  returns.forEach((ret, idx) => {
    const rp = `state.returns[${idx}]`;
    if (!isPlainObject(ret)) return err.add(rp, 'Yêu cầu đổi trả/bảo hành phải là object.');
    if (typeof ret.id !== 'string' || !ID_REGEX.test(ret.id) || returnIds.has(ret.id)) {
      err.add(`${rp}.id`, 'Mã yêu cầu không hợp lệ hoặc bị trùng.');
    } else {
      returnIds.add(ret.id);
    }
    if (!orderIds.has(ret.orderId)) err.add(`${rp}.orderId`, 'orderId không tồn tại trong orders.');
    if (!ENUMS.returnType.includes(ret.type)) err.add(`${rp}.type`, 'type phải là return, exchange hoặc warranty.');
    if (!isNonEmptyString(ret.reason, 1000)) err.add(`${rp}.reason`, 'Thiếu lý do.');
    if (!Array.isArray(ret.images) || ret.images.length > 10) err.add(`${rp}.images`, 'images phải là mảng (tối đa 10).');
    if (!ENUMS.returnStatus.includes(ret.status)) err.add(`${rp}.status`, 'status đổi trả không hợp lệ (chỉ chấp nhận pending, approved, rejected, completed).');
    if (!isIsoDateString(ret.createdAt)) err.add(`${rp}.createdAt`, 'createdAt phải là ngày ISO.');
    if (!Array.isArray(ret.items) || ret.items.length < 1) {
      err.add(`${rp}.items`, 'Phải có ít nhất 1 sản phẩm trong yêu cầu.');
    } else {
      ret.items.forEach((it, iIdx) => {
        const itp = `${rp}.items[${iIdx}]`;
        if (!isPlainObject(it)) return err.add(itp, 'Item đổi trả phải là object.');
        if (!isNonEmptyString(it.productId, 64)) err.add(`${itp}.productId`, 'Thiếu productId.');
        if (!isPosInt(it.qty)) err.add(`${itp}.qty`, 'qty phải >= 1.');
        if (!ENUMS.returnCondition.includes(it.condition)) err.add(`${itp}.condition`, 'condition không hợp lệ.');
      });
    }
  });
}

module.exports = {
  validateOrders,
  validateReturns,
};
