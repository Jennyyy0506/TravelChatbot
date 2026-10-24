DORA - ĐỒNG BỘ FIRESTORE -> CHROMADB (BẢN THỬ AN TOÀN)
===========================================================

MỤC ĐÍCH
- Đọc collection `destinations` trong Firestore.
- Tạo embeddings bằng Gemini `gemini-embedding-2`, 768 chiều.
- Lưu bản ghi đang hoạt động vào ChromaDB bằng document ID = destination_id.
- Admin sửa/thêm -> cập nhật vector khi chạy lại script.
- Admin ẩn -> xóa vector của địa điểm khỏi collection MỚI.
- Admin khôi phục -> thêm lại vector khi chạy lại script.
- Bỏ qua re-embedding khi dữ liệu không thay đổi (so sánh hash 17 trường).

RANH GIỚI AN TOÀN
- Script KHÔNG sửa auth_api.py, App.jsx hoặc code RAG cũ.
- Script KHÔNG mở kho Chroma hiện có ở `Travel Chatbot/chroma_db`.
- Script tạo thư mục mới `Travel Chatbot/chroma_db_dora`, collection
  `dora_destinations_firestore_v1` để tránh ảnh hưởng cấu trúc cũ.
- Đây là bước DỰNG VÀ THỬ KHO VECTOR MỚI. Chatbot cũ CHƯA đọc kho này
  cho đến khi cập nhật rag/retrieve.py (tùy cấu trúc dự án thực tế).
- Script chạy THỦ CÔNG. Tự động sync khi Admin CRUD sẽ bổ sung sau khi
  phần retriever đã dùng đúng collection mới.
- Bất kỳ document nào bị xóa cứng khỏi Firestore không có cơ hội tạo
  tombstone; nên giữ xóa mềm như CRUD hiện tại.

1) GIẢI NÉN ZIP VÀO C:\Đồ án 2
   Sẽ tạo:
   C:\Đồ án 2\Travel Chatbot\sync_firestore_chroma.py
   C:\Đồ án 2\README_DORA_SYNC.txt

2) CÀI THƯ VIỆN TẠI POWERSHELL (đang bật .venv)
   cd "C:\Đồ án 2"
   python -m pip install firebase-admin chromadb google-genai python-dotenv

   LƯU Ý: Có kho Chroma cũ, đừng tùy tiện nâng cấp/chuyển định dạng kho
   đó. Script sử dụng thư mục mới nên không can thiệp kho cũ.

3) KEY (KHÔNG ĐƯA LÊN GITHUB)
   - Firebase Private Key JSON ở đường dẫn THẬT của bạn. Ví dụ:
     $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\firebase-keys\serviceAccountKey.json"
   - Trong C:\Đồ án 2\Travel Chatbot\.env cần có một trong:
     GEMINI_API_KEY=your_key_here
     hoặc GOOGLE_API_KEY=your_key_here
   - Không trộn Firebase Private Key và Gemini API Key.
   - .env và khóa JSON phải được .gitignore chặn commit.

4) XEM TRƯỚC - KHÔNG GỌI GEMINI, KHÔNG GHI DỮ LIỆU
   python ".\Travel Chatbot\sync_firestore_chroma.py"

5) THỬ CHỈ 3 ĐỊA ĐIỂM
   python ".\Travel Chatbot\sync_firestore_chroma.py" --apply --limit 3

6) KIỂM TRA TÌM KIẾM TRONG CHROMA MỚI
   python ".\Travel Chatbot\sync_firestore_chroma.py" --search "Địa điểm du lịch tại Cần Thơ"
   (Kết quả chỉ có 3 địa điểm thử; chưa thể kết luận chất lượng truy vấn.)

7) SAU KHI THỬ THÀNH CÔNG - ĐỒNG BỘ TOÀN BỘ
   python ".\Travel Chatbot\sync_firestore_chroma.py" --apply --all

8) CHẠY LẠI SAU KHI ADMIN THÊM, SỬA, ẨN, KHÔI PHỤC
   python ".\Travel Chatbot\sync_firestore_chroma.py" --apply --all
   Bản ghi không đổi được bỏ qua không cần gọi lại Gemini.

LƯU Ý VỀ CHI PHÍ
- --apply tạo embedding trên Gemini API; chịu giới hạn lượt gọi/quota
  và có thể phát sinh phí theo tài khoản của bạn.
- Test --limit 3 trước; nếu báo 429/quota, chờ quota hồi phục hoặc kiểm tra key.
- Quá trình không chạy ẩn 24/7 và không tự đồng bộ trên website.

KIỂM THỬ ĐÃ THỰC HIỆN TRONG MÔI TRƯỜNG MÔ PHỎNG
- Python syntax: PASS
- Upsert mới: PASS
- Không re-embedding dữ liệu không đổi: PASS
- Cập nhật nội dung: PASS
- Xóa mềm / xóa vector: PASS
- Khôi phục: PASS
Chưa có quyền truy cập Firebase, Gemini API hoặc ChromaDB trên máy bạn;
vì vậy cần test thực tế tại địa phương theo hướng dẫn trên.
