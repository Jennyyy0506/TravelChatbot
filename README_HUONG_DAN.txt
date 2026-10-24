DORA - CRUD ĐỊA ĐIỂM DU LỊCH / FIRESTORE
==========================================

1. SAO LƯU các file đang dùng:
   C:\Đồ án 2\Travel Chatbot\auth_api.py
   C:\Đồ án 2\frontend\src\App.jsx
   C:\Đồ án 2\frontend\src\App.css (nếu đã có)

2. GIẢI NÉN Dora_CRUD.zip vào thư mục C:\Đồ án 2
   Chấp nhận thay thế đúng 3 file trên khi được hỏi.
   KHÔNG tạo thư mục C:\Đồ án 2\Dora_CRUD chứa dự án bên trong.
   KHÔNG đưa Private Key JSON vào project, frontend hoặc GitHub.

3. TERMINAL BACKEND (PowerShell):
   cd "C:\Đồ án 2"
   $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\firebase-keys\serviceAccountKey.json"
   python -m uvicorn auth_api:app --app-dir ".\Travel Chatbot" --reload --reload-dir ".\Travel Chatbot" --port 8000
   (Nếu đã chạy sẵn, Ctrl+C rồi chạy lại. Nếu file key ở nơi khác, đổi đường dẫn.)

4. TERMINAL FRONTEND (PowerShell):
   cd "C:\Đồ án 2\frontend"
   npm run dev -- --port 5173 --strictPort

5. MỞ http://localhost:5173
   - Admin: danh sách (nạp tối đa 2.000 bản ghi, theo trang 100), tìm kiếm, thêm, sửa, ẩn, khôi phục.
   - User: không nhìn thấy bảng quản trị, API trả 403.
   - Swagger API: http://localhost:8000/docs
   - Test với mã mới riêng, ví dụ VN-DEMO-999; đừng sửa dữ liệu thật ngay.

6. KHÁC BIỆT CẦN BIẾT
   - DELETE là xóa mềm: giữ document, đặt is_active=false.
   - Sau thao tác ghi, rag_sync_status=pending; ChromaDB CHƯA đồng bộ tự động.
   - Chưa có Firestore -> ChromaDB đồng bộ, cũng chưa có lịch sử chat/yêu thích.
   - Firestore Rules vẫn phải cấm client tự ghi role hoặc dữ liệu địa điểm.
   - API /auth/sync và quyền admin/user được giữ lại.
   - Hình thức chỉ là giao diện quản trị thử nghiệm, không phải Figma chính thức.

TỔNG HỢP ENDPOINTS
 GET    /                   - Health check
 POST   /auth/sync          - Đăng nhập/đồng bộ tài khoản
 GET    /auth/me            - Hồ sơ người dùng
 GET    /admin/users        - Admin xem người dùng
 GET    /admin/destinations - Admin liệt kê địa điểm
 GET    /admin/destinations/{destination_id} - Chi tiết
 POST   /admin/destinations - Admin tạo địa điểm
 PATCH  /admin/destinations/{destination_id} - Admin sửa
 DELETE /admin/destinations/{destination_id} - Admin ẩn (xóa mềm)
 POST   /admin/destinations/{destination_id}/restore - Admin khôi phục
