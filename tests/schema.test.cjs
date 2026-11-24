const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { buildSku } = require('../schemas/common.schema');
const { validateDatabaseV2 } = require('../schemas/database.schema');
const { migrateV1DataToV2, migrateDatabaseFile } = require('../migrations/migrate-v1-to-v2');

const seedData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'seed-products.json'), 'utf8'));

function makeValidV2() {
  const stock = {};
  for (const p of seedData.products) {
    for (const v of p.variants) stock[v.sku] = 10;
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

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('PASS ' + name);
  } catch (err) {
    console.error('FAIL ' + name + ': ' + err.message);
    process.exitCode = 1;
  }
}

test('validateDatabaseV2 accepts valid V2 seed and does not mutate input', () => {
  const data = makeValidV2();
  const snapshot = structuredClone(data);
  const res = validateDatabaseV2(data);
  assert.equal(res.valid, true);
  assert.deepEqual(data, snapshot);
});

test('buildSku enforces COLOR_CODE mapping and rejects unknown colors', () => {
  assert.equal(buildSku('p1', 'Đỏ trầm', 'M'), 'VP-P1-DO_TRAM-M');
  assert.equal(buildSku('p9', 'Đỏ trầm', 'One Size'), 'VP-P9-DO_TRAM-ONE_SIZE');
  assert.equal(buildSku('p1', 'Tím than', 'M'), null);
});

test('validateDatabaseV2 rejects missing fields, bad types, duplicate SKU, negative stock, and bad enums', () => {
  const missingField = makeValidV2();
  delete missingField.state.customers;
  assert.equal(validateDatabaseV2(missingField).valid, false);

  const dupSku = makeValidV2();
  dupSku.state.products[1].variants[0].sku = dupSku.state.products[0].variants[0].sku;
  assert.equal(validateDatabaseV2(dupSku).valid, false);

  const negStock = makeValidV2();
  negStock.state.stock['VP-P1-DO_TRAM-M'] = -1;
  assert.equal(validateDatabaseV2(negStock).valid, false);

  const stockInVariant = makeValidV2();
  stockInVariant.state.products[0].variants[0].stock = 5;
  assert.equal(validateDatabaseV2(stockInVariant).valid, false);

  const badEnum = makeValidV2();
  badEnum.state.orders.push({
    id: 'VP1',
    createdAt: '2026-11-25T03:00:00.000Z',
    customerId: null,
    receiver: 'A',
    phone: '0900',
    address: 'HN',
    items: [{ productId: 'p1', sku: 'VP-P1-DO_TRAM-M', name: 'Áo', img: '', color: 'Đỏ trầm', size: 'M', qty: 1, unitPrice: 1000 }],
    subtotal: 1000,
    shippingFee: 0,
    discountCode: null,
    discountAmount: 0,
    total: 1000,
    paymentMethod: 'COD',
    orderStatus: 'trang_thai_sai',
    paymentStatus: 'unpaid',
    settlementStatus: 'unsettled',
    inventoryStatus: 'reserved',
    shipment: {},
    transactions: [],
    refunds: [],
    policySnapshot: {},
    history: [],
  });
  assert.equal(validateDatabaseV2(badEnum).valid, false);
});

test('validateDatabaseV2 rejects refund exceeding paid transactions and allows historical missing SKU', () => {
  const data = makeValidV2();
  data.state.orders.push({
    id: 'VP_HIST',
    createdAt: '2026-11-25T03:00:00.000Z',
    customerId: null,
    receiver: 'Khách cũ',
    phone: '0900000000',
    address: 'HCM',
    items: [{ productId: 'p_deleted', sku: null, name: 'Mẫu đã ngừng bán', img: '', color: 'Màu cũ', size: 'M', qty: 1, unitPrice: 500000 }],
    subtotal: 500000,
    shippingFee: 30000,
    discountCode: null,
    discountAmount: 0,
    total: 530000,
    paymentMethod: 'online',
    orderStatus: 'delivered',
    paymentStatus: 'paid',
    settlementStatus: 'unsettled',
    inventoryStatus: 'fulfilled',
    shipment: {},
    transactions: [{ id: 'tx1', method: 'online', amount: 530000, status: 'success', isSimulated: true, createdAt: '2026-11-25T03:00:00.000Z' }],
    refunds: [],
    policySnapshot: {},
    history: [],
  });
  assert.equal(validateDatabaseV2(data).valid, true);

  data.state.orders[0].refunds.push({
    id: 'rf1',
    transactionId: 'tx1',
    amount: 600000,
    status: 'success',
    isSimulated: true,
    reason: 'Hoàn quá tiền',
    createdAt: '2026-11-25T03:10:00.000Z',
  });
  assert.equal(validateDatabaseV2(data).valid, false);
});

test('migrateV1DataToV2 enforces 0 for missing stock, reports missing sizes/colors, and is idempotent', () => {
  const v1 = {
    revision: 3,
    state: {
      products: [
        { id: 'p1', name: 'Áo 1', category: 'Áo dài', price: 1000000, color: 'Đỏ trầm', material: 'Lụa', tag: 'MỚI', img: 'a.png', addedAt: '2026-01-01' },
        { id: 'p2', name: 'Áo 2', category: 'Áo dài', price: 900000, color: 'Trắng ngà', material: 'Lụa', tag: 'MỚI', img: 'b.png', sizes: ['S', 'M'], addedAt: '2026-01-02' },
        { id: 'p3', name: 'Áo màu lạ', category: 'Áo dài', price: 800000, color: 'Tím Huế', material: 'Lụa', tag: 'MỚI', img: 'c.png', sizes: ['M'], addedAt: '2026-01-03' },
      ],
      orders: [
        {
          id: 'VP-OLD-1',
          date: '2026-11-20T10:00:00.000Z',
          email: 'old@example.com',
          receiver: 'Lan',
          phone: '0911',
          address: 'Huế',
          items: [{ id: 'p2', name: 'Áo 2', color: 'Trắng ngà', size: 'S', qty: 1, price: 900000 }],
          total: 930000,
          shippingFee: 30000,
          payment: 'COD',
          status: 'Đã giao',
          paymentStatus: 'Thanh toán thành công',
          inventory: 'issued',
          settlement: 'Chưa đối soát',
          returnStatus: 'Đã hoàn tất',
          returnReason: 'Đổi size',
          history: ['Tạo đơn'],
        },
      ],
      stock: { 'p2|S': 4, 'unknown|M': 2 },
      visits: 10,
      cartEvents: 3,
    },
  };

  const res1 = migrateV1DataToV2(v1, seedData.policies);
  assert.equal(res1.alreadyV2, false);
  assert.equal(res1.data.state.returns.length, 1);
  assert.equal(res1.data.state.returns[0].status, 'completed');
  // p1 không có sizes hay stock -> không tự sinh S,M,L,XL
  assert.equal(res1.data.state.products[0].variants.length, 0);
  assert.ok(res1.report.unresolvedVariants.some(x => x.productId === 'p1'));
  // p2 có stock 'p2|S': 4, thiếu 'p2|M' -> đặt 0 và ghi unresolvedStock (không đặt 8 hay 10)
  assert.equal(res1.data.state.stock['VP-P2-TRANG_NGA-S'], 4);
  assert.equal(res1.data.state.stock['VP-P2-TRANG_NGA-M'], 0);
  assert.ok(res1.report.unresolvedStock.some(x => x.sku === 'VP-P2-TRANG_NGA-M'));
  // p3 màu lạ -> ghi unresolvedColors
  assert.ok(res1.report.unresolvedColors.some(x => x.productId === 'p3'));
  // stock lạ -> ghi unmappedStockKeys
  assert.ok(res1.report.unmappedStockKeys.some(x => x.key === 'unknown|M'));
  // Đơn cũ không tự gán customerId
  assert.equal(res1.data.state.orders[0].customerId, null);
  assert.equal(res1.data.state.orders[0].orderStatus, 'delivered');

  // Chạy lại lần 2 -> idempotent
  const res2 = migrateV1DataToV2(res1.data, seedData.policies);
  assert.equal(res2.alreadyV2, true);
  assert.deepEqual(res2.data, res1.data);

  // Kiểm tra validator từ chối returnStatus tiếng Việt và migration báo cáo trạng thái lạ
  const badReturn = structuredClone(res1.data);
  badReturn.state.returns[0].status = 'Đã hoàn tất';
  assert.equal(validateDatabaseV2(badReturn).valid, false);

  const unknownRetV1 = structuredClone(v1);
  unknownRetV1.state.orders[0].returnStatus = 'Trạng thái lạ chưa định nghĩa';
  const resUnknown = migrateV1DataToV2(unknownRetV1, seedData.policies);
  assert.equal(resUnknown.report.unresolvedReturnStatuses.length, 1);
});

test('migrateDatabaseFile creates verified backup and preserves original file on migration failure', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-mig-test-'));
  try {
    const dbFile = path.join(dir, 'database.json');
    const badV1 = { revision: 1, state: { products: [{ id: 'bad id with space' }], orders: [], stock: {} } };
    fs.writeFileSync(dbFile, JSON.stringify(badV1), 'utf8');

    assert.throws(() => migrateDatabaseFile(dbFile, seedData.policies));
    // File gốc vẫn nguyên vẹn
    assert.deepEqual(JSON.parse(fs.readFileSync(dbFile, 'utf8')), badV1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

console.log(`${passed} schema tests passed`);
