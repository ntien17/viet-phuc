# Việt Phục — website đồ án B2C

Đây là bản trình diễn chạy cục bộ với máy chủ Node.js và dữ liệu JSON, dành cho học tập. Thanh toán, vận chuyển và quản trị vẫn là mô phỏng.

## Chạy trong VS Code

1. Cài Node.js 18 trở lên. Mở thư mục `viet-phuc` bằng VS Code.
2. Mở Terminal trong VS Code và chạy:

   ```powershell
   npm start
   ```

3. Mở địa chỉ **http://127.0.0.1:3000** trong trình duyệt. Để dừng máy chủ, nhấn `Ctrl+C` trong Terminal. Lần sau chạy lại `npm start` để tiếp tục dùng dữ liệu đã lưu.

Không cần cài thư viện bổ sung. Nếu cổng 3000 đã được sử dụng, có thể chạy `$env:PORT=3001; npm start` rồi mở `http://127.0.0.1:3001`.

## Xem dữ liệu JSON

- Lần chạy đầu tiên tạo tệp `data/database.json`. Có thể mở tệp này trực tiếp trong VS Code.
- Tệp gồm `revision` để kiểm tra xung đột và `state` chứa danh mục sản phẩm, đơn hàng, tồn theo sản phẩm và size, cùng các chỉ số thử nghiệm. Đơn hàng lưu thông tin sản phẩm và giá tại thời điểm mua.
- Với biến thể chưa có mục riêng trong `stock`, bản demo mặc định còn 8 sản phẩm; sau khi phát sinh thay đổi, số lượng được ghi theo khóa như `p1|M`.
- Dừng máy chủ trước khi sửa tệp thủ công, giữ đúng cấu trúc JSON và tạo bản sao lưu trước khi sửa. Máy chủ kiểm tra dữ liệu lúc khởi động và không tự xóa tệp bị lỗi.
- Sao lưu bằng cách sao chép `data/database.json` khi máy chủ đã dừng. Thư mục `data/` được bỏ qua bởi Git để tránh vô tình đưa dữ liệu phát sinh vào mã nguồn.
- Giỏ hàng và phiên khách dùng thử vẫn thuộc trình duyệt; sản phẩm, đơn hàng và tồn kho được lưu trong file JSON của máy chủ. Dữ liệu trên bản Sites cũ và trên địa chỉ trình duyệt khác không tự chuyển sang file này.

Chạy kiểm thử bằng `npm test`. Máy chủ chỉ lắng nghe trên máy tính hiện tại. Đây không phải hệ quản trị cơ sở dữ liệu hay hệ thống xác thực bảo mật để vận hành bán hàng thật; không dùng mật khẩu, dữ liệu cá nhân hoặc giao dịch thật.
