# Báo cáo Kiểm thử Tổng thể & Đồng bộ Logic Website VIỆT PHỤC

- **Nhánh Git:** `feature/nguyen`
- **Ngày kiểm thử:** 2026-11-27
- **Môi trường:** Node.js (`v24.15.0`), HTML/CSS/JS thuần, JSON Database Schema V2.
- **Bảo vệ dữ liệu:** `.gitignore` giữ nguyên quy tắc `/data/` và `/node_modules/`, không đưa file database hoặc backup lên Git.

---

## A. Tổng quan

- **Số module đã kiểm tra:** 6 nhóm module chính (Storefront UI/Client, Admin Portal, Public/Customer API, Admin API, JSON Database & Schema V2, Realtime SSE & Sweeper).
- **Số chức năng đã kiểm kê:** Đầy đủ các nhóm khách hàng (trang chủ, tìm kiếm không dấu & gợi ý, lọc đa biến thể, chi tiết `#/product/:id` & modal fallback, giỏ hàng theo từng tài khoản, mã giảm giá, checkout COD/Online mô phỏng, lịch sử & chi tiết đơn hàng, đổi trả/khiếu nại, trung tâm 11 chính sách, liên hệ & phản hồi nhanh) và Admin (Dashboard, danh mục, sản phẩm & biến thể SKU, tồn kho SKU, khách hàng, đơn hàng, thanh toán/hoàn tiền mô phỏng, vận chuyển mô phỏng, đổi trả/bảo hành, chính sách & phiên bản, khuyến mãi, báo cáo & xuất CSV, tiếp nhận phản hồi nhanh).
- **Số liên kết giữa các module đã đối chiếu:** 15 liên kết xuyên suốt Storefront ↔ API ↔ Database ↔ Admin.
- **Tổng số bộ test đã chạy:** `npm test` (`node --test tests/*.test.cjs`) — **9/9 file test** (**10/10** test case/suite ở cấp runner, **PASS 100%**).

---

## B. Bảng kết quả kiểm thử theo nhóm

| Nhóm kiểm tra | Tổng kiểm tra | PASS | FAIL | Chưa kiểm tra |
|---|---:|---:|---:|---:|
| Admin & Bảo mật (`admin.test.cjs`, `admin-full.test.cjs`) | 14 | 14 | 0 | 0 |
| Catalog, Tìm kiếm & Bộ lọc (`catalog.test.cjs`) | 13 | 13 | 0 | 0 |
| Checkout, Promo & Hold Sweeper (`checkout.test.cjs`) | 4 | 4 | 0 | 0 |
| Khách hàng & Session (`customer.test.cjs`) | 6 | 6 | 0 | 0 |
| Database V2, Migration & Queue (`db.test.cjs`, `schema.test.cjs`) | 13 | 13 | 0 | 0 |
| Chính sách, Đổi trả & Hỗ trợ (`policies.test.cjs`) | 4 | 4 | 0 | 0 |
| Tích hợp xuyên suốt & UI Handler (`integration.test.cjs`) | 2 | 2 | 0 | 0 |
| **Tổng cộng** | **56** | **56** | **0** | **0** |

---

## C. Danh sách lỗi phát hiện trong quá trình kiểm thử

| Mã lỗi | Module | Mô tả | Nguyên nhân | Mức độ | Trạng thái |
|---|---|---|---|---|---|
| `BUG-01` | `server.js` (`POST /api/public/contact`) | Gửi form phản hồi nhanh gây `ReferenceError: checkRateLimit is not defined` làm crash request (`ECONNRESET`) | Gọi nhầm tên hàm `checkRateLimit` và `clientIp` không tồn tại trong `server.js` | **P0** | **Đã sửa** |
| `BUG-02` | `dist/app.js` (`mapPublicProduct`, `sizesFor`) | Sản phẩm có `variants: []` trong DB vẫn tự fallback sinh size `['S','M','L','XL']` trên Storefront khiến giao diện khách hàng lệch với kho Admin | Logic fallback áp dụng cả khi đang chạy `serverMode` | **P1** | **Đã sửa** |
| `BUG-03` | `lib/admin-handlers.js` & `dist/admin-modules.js` | Ở tab **Danh mục & Sản phẩm**, Admin không thể chỉnh sửa tồn kho cho biến thể đã có | Input `.v-stock` bị đặt `readonly disabled` và `PATCH /api/admin/products/:id` chỉ nhận `initialStock` cho biến thể mới | **P1** | **Đã sửa** |
| `BUG-04` | `dist/app.js` (`applyPublicBootstrap`, `showContactInfo`) | Popup **Liên hệ** đọc sai key (`info.phone`, `info.supportHours` thay vì `info.hotline`, `info.hours`) và `#footer-contact-hours` chưa đồng bộ từ Admin Chính sách; giá trị `'Chưa cấu hình'` biến thành link `tel:`/`mailto:` | Lệch tên trường `storeInfo` giữa Admin và modal Liên hệ | **P2** | **Đã sửa** |
| `BUG-05` | `dist/app.js` (`localStorage` cart) | Giỏ hàng lưu chung 1 key trên trình duyệt, đăng xuất tài khoản A rồi đăng nhập tài khoản B vẫn thấy giỏ hàng của A | Chưa tách key `localStorage` theo `user.id` | **P1** | **Đã sửa** |
| `BUG-06` | `dist/admin-modules.js` (`renderPolicies`) | Tab **Chính sách & Nội dung** ở Admin bị trắng hoàn toàn khi `supportTickets` có ít nhất 1 phản hồi/khiếu nại | Thiếu `getStatusBadgeHtml` trong destructuring `B()` tại `renderPolicies()` gây `ReferenceError` | **P1** | **Đã sửa** |
| `BUG-07` | `dist/app.js` (`renderProducts`, `applyPublicBootstrap`) | Chỉ 3/9 sản phẩm hiển thị trên Storefront khi `data/database.json` có 6 sản phẩm `variants: []`; dropdown danh mục `#catalog-category` chưa đồng bộ khi Admin thêm danh mục | `renderProducts()` kiểm tra `matchedColors.length > 0` ngay cả khi không bật bộ lọc màu (`filters.colors.length === 0`), làm loại bỏ toàn bộ sản phẩm có 0 biến thể hoạt động | **P1** | **Đã sửa** |

---

## D. Danh sách liên kết giữa các module

| Module nguồn | Module đích | API trung gian / Cơ chế | Dữ liệu đồng bộ | Kết quả |
|---|---|---|---|---|
| Admin sản phẩm | Trang khách hàng | `POST/PATCH /api/admin/products` → `GET /api/public/bootstrap` | Tên, ảnh, giá, mô tả, biến thể, `active` | **PASS** |
| Admin tồn kho (cả tab Tồn kho & Sản phẩm) | Chi tiết sản phẩm | `POST /api/admin/stock/adjust`, `PATCH /api/admin/products/:id` → `/api/public/bootstrap` | Tồn kho theo từng SKU (`stock[sku]`), `inventoryLogs` | **PASS** |
| Admin tồn kho | Giỏ hàng | `/api/public/bootstrap` + `cartStockIssue()` + `quantityInCart()` | Khả năng thêm/mua theo biến thể SKU & chặn vượt tồn | **PASS** |
| Giỏ hàng | Thanh toán | `POST /api/customer/checkout/preview`, `POST /api/customer/orders` | SKU, số lượng, đơn giá server-side, phí ship, mã giảm | **PASS** |
| Thanh toán / Đặt hàng | Admin đơn hàng | `POST /api/customer/orders` → `GET /api/admin/bootstrap` + SSE `db_update` | Đơn hàng mới, trừ tồn kho giữ hàng, lịch sử đơn | **PASS** |
| Admin đơn hàng | Tài khoản khách hàng | `PATCH /api/admin/orders/:id/status` → `GET /api/customer/orders` | Trạng thái xử lý đơn hàng & lịch sử | **PASS** |
| Admin thanh toán | Đơn hàng khách hàng | `/api/admin/orders/:id/payment`, `/refund`, `/cod-settle` | `paymentStatus`, `transactions`, phân biệt mô phỏng vs thực nhận | **PASS** |
| Admin vận chuyển | Theo dõi đơn hàng | `/api/admin/orders/:id/shipment` → `/api/customer/orders/:id` | `shipment.shipStatus`, mã vận đơn, ghi chú | **PASS** |
| Admin đổi trả | Tài khoản khách hàng & Kho | `/api/customer/returns` ↔ `/api/admin/returns/:id` | Điều kiện 7/30 ngày, `damaged` không hoàn kho, `resellable` cộng lại kho | **PASS** |
| Admin chính sách | Trung tâm chính sách & Footer/Liên hệ | `PUT /api/admin/policies` → `/api/public/bootstrap` | 11 nhóm chính sách, phiên bản `policyVersions`, `storeInfo` | **PASS** |
| Admin khuyến mãi | Giỏ hàng / Thanh toán | `/api/admin/promotions` → `/api/customer/checkout/preview` & `/orders` | Điều kiện minOrder, thời hạn, usageLimit, mức giảm | **PASS** |
| Admin khách hàng | Tài khoản khách hàng | `PATCH /api/admin/customers/:id/status` → session check | Khóa tài khoản thu hồi session & chặn mọi API cần xác thực (403) | **PASS** |
| Admin báo cáo | Database | `GET /api/admin/bootstrap`, `GET /api/admin/reports/export.csv` | Doanh thu, đối soát COD, số đơn, tồn kho | **PASS** |
| Form Phản hồi nhanh (Footer/Liên hệ) | Admin Phản hồi & Hỗ trợ | `POST /api/public/contact` → `PATCH /api/admin/support-tickets/:id` | Lưu vào `supportTickets` (`source: 'contact_feedback'`), cách ly với khách hàng | **PASS** |
| Real-time SSE | Admin & Storefront | `GET /api/admin/events`, `GET /api/public/events` | Tự đẩy `db_update` sau mỗi `runTransaction`, đóng sạch khi tắt server | **PASS** |

---

## E. Những lỗi đã sửa

1. **[server.js](file:///c:/Code/Web/viet-phuc/server.js):**
   - Sửa `POST /api/public/contact` sử dụng `checkPublicContactRateLimit` hợp lệ (10 lượt/phút/IP) thay cho `checkRateLimit` không tồn tại.
   - Bổ sung SSE stream `/api/admin/events` (yêu cầu `requireAdmin`) và `/api/public/events`, phát `db_update` trong `runTransaction`, đóng sạch kết nối trong `stopHoldSweeper()`.
2. **[lib/admin-handlers.js](file:///c:/Code/Web/viet-phuc/lib/admin-handlers.js) & [dist/admin-modules.js](file:///c:/Code/Web/viet-phuc/dist/admin-modules.js):**
   - Mở khóa chỉnh sửa `.v-stock` trong modal **Danh mục & Sản phẩm** và xử lý `v.stock` trong `PATCH /api/admin/products/:id` qua `adjustStockWithLog(..., 'manual_adjust', ...)`.
   - Thêm bảng **Phản hồi nhanh từ Storefront** trong tab Chính sách & Nội dung ở Admin.
3. **[dist/app.js](file:///c:/Code/Web/viet-phuc/dist/app.js):**
   - Bỏ fallback sinh size giả khi chạy `serverMode` ở `mapPublicProduct()` và `sizesFor()`.
   - Sửa `applyPublicBootstrap()` và `showContactInfo()` đồng bộ đúng `storeInfo.hotline`, `storeInfo.email`, `storeInfo.hours` (kể cả `#footer-contact-hours`), tránh biến `"Chưa cấu hình"` thành link `tel:`/`mailto:`.
   - Tách `localStorage` giỏ hàng theo `vietphuc-cart-<userId>` / `vietphuc-cart-guest` qua `setCustomerUser()`.
4. **[tests/integration.test.cjs](file:///c:/Code/Web/viet-phuc/tests/integration.test.cjs):**
   - Bổ sung test E2E tích hợp sửa tồn kho sản phẩm → Storefront, gửi phản hồi nhanh → Admin + cách ly khách hàng, SSE real-time, kiểm tra toàn bộ `data-action` trong HTML và cô lập giỏ hàng theo tài khoản.

---

## F. Những lỗi chưa sửa / Lưu ý vận hành

- Không còn lỗi P0/P1/P2 nào chưa xử lý.
- **Lưu ý môi trường local:** Dữ liệu máy chủ lưu tập trung tại `data/database.json` trên máy chạy `server.js` (phù hợp đồ án chạy local/demo). Nếu nhiều máy cần dùng chung dữ liệu, cần chạy `server.js` trên một máy chủ chung hoặc chuyển lớp lưu trữ sang CSDL độc lập.

---

## G. Kết quả kiểm thử thực tế (`npm test`)

Lệnh chạy: `npm test` (`node --test tests/*.test.cjs`) sau lần sửa cuối cùng:
- `tests/admin-full.test.cjs`: **PASS** (6/6 nhóm kiểm tra)
- `tests/admin.test.cjs`: **PASS** (8/8 kiểm tra bảo mật, CSRF, rate limit, filter)
- `tests/catalog.test.cjs`: **PASS** (13/13 kiểm tra catalog, tìm kiếm, bộ lọc đa biến thể)
- `tests/checkout.test.cjs`: **PASS** (4/4 nhóm kiểm tra checkout, promo, thanh toán mô phỏng, hold sweeper)
- `tests/customer.test.cjs`: **PASS** (6/6 nhóm kiểm tra đăng ký, đăng nhập, hồ sơ, đổi mật khẩu, session)
- `tests/db.test.cjs`: **PASS** (7/7 kiểm tra bootstrap, transaction queue, migration V1→V2)
- `tests/integration.test.cjs`: **PASS** (2/2 kiểm tra E2E sửa tồn kho/phản hồi nhanh/SSE + UI handlers/cô lập giỏ hàng)
- `tests/policies.test.cjs`: **PASS** (4/4 kiểm tra 11 chính sách, phiên bản, đổi trả 7/30 ngày, hỗ trợ)
- `tests/schema.test.cjs`: **PASS** (6/6 kiểm tra Schema V2 & migration)
- **Tổng kết runner:** `tests 10 | pass 10 | fail 0` (thoát mã `0`).

---

## H. Đánh giá cuối cùng

**ĐẠT** — Toàn bộ các luồng nghiệp vụ chính, liên kết dữ liệu xuyên suốt Storefront ↔ API ↔ Database ↔ Admin, kiểm thử giao diện Chrome thực tế (20/20 bước PASS, 0 JS exceptions) và bộ kiểm thử tự động (9 file test, 56/56 kiểm tra PASS) đều hoạt động chính xác và đồng bộ.

---

## I. Kiểm thử giao diện thực tế trên Chrome (Headless Chrome CDP) & Đồng bộ 2 chiều

- **Môi trường kiểm thử:** Máy chủ test độc lập tại `http://127.0.0.1:3199` sử dụng thư mục `VIETPHUC_DATA_DIR` tạm thời (không chạm `data/database.json`), kết hợp Google Chrome thực tế qua CDP (`chrome-qa.mjs`) ở độ phân giải `1440x900`.
- **Tổng kết Chrome E2E:** **20/20 bước PASS**, **0 FAIL**, **0 JS exceptions**.

### 1. Các trang & luồng đã mở, thao tác thực tế
- **Storefront (`/` & `#/product/p1`):**
  - `SF-1`: Tải trang chủ, hiển thị đủ 9 sản phẩm từ `/api/public/bootstrap`.
  - `SF-2`, `SF-3`: Tìm kiếm không dấu `"ao dai"` (lọc còn 3 sản phẩm), mở drawer bộ lọc màu `"Đỏ trầm"` (còn 2 sản phẩm) và xóa lọc.
  - `SF-4`: Mở Trung tâm chính sách từ footer, kiểm tra đủ 11 nút và 11 tab chính sách.
  - `SF-5`: Bấm nút nâu `GỬI PHẢN HỒI NHANH` ở footer, điền và gửi phản hồi (`Nguyễn Thử`, `thu@example.com`).
  - `SF-6`: Mở và đóng popup Liên hệ (`data-action="contact"`).
  - `SF-7`: Đăng ký tài khoản mới, đăng xuất và đăng nhập lại.
  - `SF-8`: Mở trang chi tiết `#/product/p1`, chuyển sang size `S` và xác nhận hiển thị tồn kho mới (`15`, `VP-P1-DO_TRAM-S`).
- **Admin (`/admin.html`):**
  - `ADM-1`, `ADM-2`: Đăng nhập `qa_admin`, duyệt qua đủ 11 tab (`Tổng quan`, `Đơn hàng`, `Danh mục & Sản phẩm`, `Tồn kho SKU`, `Khách hàng`, `Thanh toán & Hoàn tiền`, `Vận chuyển`, `Đổi trả & Bảo hành`, `Khuyến mãi`, `Chính sách & Nội dung`, `Báo cáo & Thống kê`) không phát sinh lỗi JS.
  - `ADM-3`: Sửa trực tiếp giá sản phẩm `p1` (`1.260.000₫`) và tồn kho biến thể đầu (`15`) ngay trong tab **Danh mục & Sản phẩm**.
  - `ADM-4`: Tạo mã khuyến mãi mới (`10%`, đơn tối thiểu `500.000₫`).
  - `ADM-5`: Mở tab **Chính sách & Nội dung**, kiểm tra bảng **Phản hồi nhanh từ Storefront** hiển thị phản hồi của `Nguyễn Thử`, trả lời trạng thái `resolved` và cập nhật hotline cửa hàng `0911222333`.

### 2. Đồng bộ 2 chiều Admin ↔ Storefront đã xác nhận
- `SYNC-1`: Sau khi Admin lưu giá/tồn kho/hotline, Storefront tự cập nhật live qua SSE (`p1` = `1.260.000₫`, hotline = `0911222333`).
- `SYNC-2`: Khách hàng thêm `p1` vào giỏ, áp dụng mã khuyến mãi vừa tạo, đặt đơn COD thành công.
- `SYNC-3`: Đơn hàng xuất hiện trong Admin; Admin xác nhận → bàn giao vận chuyển → giao thành công (`Đã giao`).
- `SYNC-4`, `SYNC-5`: Khách hàng nhìn thấy trạng thái `Đã giao`, gửi yêu cầu đổi trả và yêu cầu xuất hiện trong tab **Đổi trả & Bảo hành** của Admin.
- `SYNC-6`, `SYNC-7`: Admin khóa tài khoản khách hàng → API `/api/customer/orders` trả `401`; Admin mở khóa lại thành công.

### 3. Ảnh chụp màn hình kiểm thử (lưu tại thư mục artifact)
- `qa-storefront-home.png` — Trang chủ & danh sách sản phẩm Storefront.
- `qa-product-detail.png` — Trang chi tiết sản phẩm `#/product/p1` sau khi đồng bộ giá & tồn kho mới.
- `qa-admin-dashboard.png` — Trang quản trị Admin Dashboard.
- `qa-admin-order.png` — Drawer xử lý đơn hàng Admin ở trạng thái `Đã giao`.

---

## J. Đối chiếu số lượng sản phẩm (Database → API → Storefront)

### 1. Số liệu đối chiếu trên `data/database.json` hiện tại
- **Tổng số sản phẩm trong Database:** `9`
- **Số sản phẩm đang hoạt động (`active: true`):** `9`
- **Số sản phẩm bị ẩn/ngừng kinh doanh:** `0`
- **Số sản phẩm có biến thể hợp lệ (`variants.length >= 1`):** `3` (`p2`, `p4`, `p9`) — `6` sản phẩm còn lại (`p1`, `p3`, `p5`, `p6`, `p7`, `p8`) đang có `variants: []` trong `data/database.json`
- **Số sản phẩm hết hàng (`stock == 0` hoặc chưa có biến thể):** `7` (`p1`, `p3`, `p5`, `p6`, `p7`, `p8`, `p9`)
- **Số sản phẩm `GET /api/public/bootstrap` trả về:** `9` (không lọc theo tồn kho)
- **Số sản phẩm Storefront render trước khi sửa:** `3` (bị `matchedColors.length > 0` loại bỏ 6 sản phẩm `variants: []`)
- **Số sản phẩm Storefront render sau khi sửa (`BUG-07`):** **9/9** (2 sản phẩm còn hàng + 7 sản phẩm hiển thị nhãn `Hết hàng`)

### 2. Khắc phục đã thực hiện
- Sửa điều kiện lọc màu trong `renderProducts()` ([dist/app.js](file:///c:/Code/Web/viet-phuc/dist/app.js)) thành `(!filters.colors.length || matchedColors.length > 0)` để không loại bỏ sản phẩm đang hoạt động khi không lọc theo màu.
- Đồng bộ dropdown `#catalog-category` trong `applyPublicBootstrap()` theo danh sách `categories` từ `/api/public/bootstrap`.
- Bổ sung kiểm thử tự động trong [tests/integration.test.cjs](file:///c:/Code/Web/viet-phuc/tests/integration.test.cjs) xác nhận sản phẩm `active: true` có `variants: []` vẫn hiển thị trên `#product-grid`.

---

## K. Truy tìm nguồn dữ liệu biến thể & Đề xuất khôi phục `data/database.json`

### 1. Nguyên nhân mất biến thể ở 6 sản phẩm
- Kiểm tra `data/database.v1.pre-gd1-backup.json` cho thấy `v1.state.stock` trước khi nâng cấp Schema V2 chỉ có 2 khóa (`'p4|XL': 7`, `'p2|M': 7`).
- Khi `migrations/migrate-v1-to-v2.js` chuyển đổi V1 → V2 (`data/database.v2.pre-patch-backup.json` → `data/database.json`), migration chỉ tạo biến thể cho các kích thước/sản phẩm có mặt trong `state.stock` V1 (và `One Size` cho `p9`). Do đó 6 sản phẩm (`p1`, `p3`, `p5`, `p6`, `p7`, `p8`) có `variants: []`, còn `p2` và `p4` chỉ có 1 biến thể (`M` và `XL`, tồn hiện tại `8`).
- Nguồn định nghĩa biến thể gốc đầy đủ nằm tại [seed-products.json](file:///c:/Code/Web/viet-phuc/seed-products.json) (33 SKU chuẩn cho 9 sản phẩm `p1`–`p9`, không trùng lặp SKU).

### 2. Bảng đối chiếu biến thể (`data/database.json` vs `seed-products.json`)

| Product ID | Tên sản phẩm | Variants hiện tại (`data/database.json`) | Nguồn dữ liệu gốc (`seed-products.json`) | Kết luận |
|---|---|---|---|---|
| `p1` | Áo dài An Nhiên | `[]` (0 biến thể) | 4 biến thể `Đỏ trầm` (`S, M, L, XL`): `VP-P1-DO_TRAM-{S,M,L,XL}` | Thiếu 4 biến thể |
| `p2` | Áo dài Bạch Liên | `VP-P2-TRANG_NGA-M` (`Trắng ngà/M`, tồn `8`) | 4 biến thể `Trắng ngà` (`S, M, L, XL`): `VP-P2-TRANG_NGA-{S,M,L,XL}` | Thiếu 3 size `S, L, XL` |
| `p3` | Bộ tứ thân Kinh Bắc | `[]` (0 biến thể) | 4 biến thể `Nâu đất` (`S, M, L, XL`): `VP-P3-NAU_DAT-{S,M,L,XL}` | Thiếu 4 biến thể |
| `p4` | Áo bà ba Hương Sen | `VP-P4-HONG_SEN-XL` (`Hồng sen/XL`, tồn `8`) | 4 biến thể `Hồng sen` (`S, M, L, XL`): `VP-P4-HONG_SEN-{S,M,L,XL}` | Thiếu 3 size `S, M, L` |
| `p5` | Bộ tứ thân Thương Nhớ | `[]` (0 biến thể) | 4 biến thể `Đen` (`S, M, L, XL`): `VP-P5-BLACK-{S,M,L,XL}` | Thiếu 4 biến thể |
| `p6` | Áo bà ba Mộc Miên | `[]` (0 biến thể) | 4 biến thể `Hồng phấn` (`S, M, L, XL`): `VP-P6-HONG_PHAN-{S,M,L,XL}` | Thiếu 4 biến thể |
| `p7` | Bộ Việt phục Đồng Quê | `[]` (0 biến thể) | 4 biến thể `Nâu đất` (`S, M, L, XL`): `VP-P7-NAU_DAT-{S,M,L,XL}` | Thiếu 4 biến thể |
| `p8` | Áo dài cách tân Lụa Mộc | `[]` (0 biến thể) | 4 biến thể `Xanh nhạt` (`S, M, L, XL`): `VP-P8-XANH_NHAT-{S,M,L,XL}` | Thiếu 4 biến thể |
| `p9` | Mấn gấm đỏ truyền thống | `VP-P9-DO_TRAM-ONE_SIZE` (`Đỏ trầm/One Size`, tồn `0`) | 1 biến thể `Đỏ trầm/One Size`: `VP-P9-DO_TRAM-ONE_SIZE` | Đủ biến thể (tồn `0`) |

### 3. Trạng thái bảo vệ mua hàng hiện tại
- Sản phẩm có `variants: []` hoặc tồn `0`: hiển thị `Hết hàng` ở Storefront, nút `THÊM VÀO GIỎ` / `MUA NGAY` bị khóa (`disabled`), và backend `POST /api/customer/orders` từ chối tạo đơn nếu không có SKU hợp lệ hoặc thiếu tồn kho.
- Sản phẩm có tồn kho (`p2/M=8`, `p4/XL=8`): hiển thị đúng màu, size, SKU và kiểm tra tồn kho ở cả chi tiết sản phẩm, giỏ hàng và checkout.
- Admin có thể thêm/sửa biến thể và chỉnh tồn kho trực tiếp ở cả tab **Danh mục & Sản phẩm** lẫn **Tồn kho SKU**.

### 4. Đề xuất phương án khôi phục `data/database.json` (Chờ xác nhận, chưa ghi đè)
- Sao lưu `data/database.json` trước khi thao tác; giữ nguyên toàn bộ `orders`, `customers`, `supportTickets`, `policies`, `promotions` và tồn kho đang có (`VP-P2-TRANG_NGA-M: 8`, `VP-P4-HONG_SEN-XL: 8`, `VP-P9-DO_TRAM-ONE_SIZE: 0`).
- Bổ sung 30 biến thể còn thiếu từ [seed-products.json](file:///c:/Code/Web/viet-phuc/seed-products.json) và kiểm tra `validateDatabaseV2`.
- **Cần người dùng chọn mức tồn kho cho 30 SKU mới bổ sung:**
  - **Phương án 1 (An toàn, không suy đoán tồn):** Đặt tồn kho `0` cho 30 SKU mới, Admin tự nhập kho theo thực tế.
  - **Phương án 2 (Phục vụ demo/kiểm thử):** Đặt tồn kho `10` (`DEMO_INITIAL_STOCK`) cho 30 SKU mới để khách có thể đặt thử ngay toàn bộ sản phẩm.

