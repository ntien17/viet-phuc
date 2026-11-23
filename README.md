# Việt Phục — website đồ án B2C

Website trình diễn bán trang phục truyền thống Việt Nam, tham khảo cấu trúc cửa hàng thời trang trực tuyến. Chạy cục bộ bằng một máy chủ tĩnh:

```powershell
cd viet-phuc
python -m http.server 4173 --directory dist
```

Truy cập http://localhost:4173. Các chức năng đặt hàng, thanh toán, giao hàng, quản trị và thông tin khách hàng là mô phỏng; dữ liệu được lưu trong trình duyệt bằng localStorage, không chia sẻ giữa các thiết bị và có thể mất khi xóa dữ liệu trình duyệt. Không nhập dữ liệu cá nhân thực hoặc dùng để giao dịch thật. Trước khi vận hành thực tế cần xây dựng máy chủ, xác thực, cơ sở dữ liệu, bảo mật, tích hợp thanh toán và vận chuyển thực, cùng kiểm thử phù hợp.
