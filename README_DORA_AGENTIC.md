# Dora — Agentic RAG (LangGraph + Gemini)

**Dành cho:** `C:\Đồ án 2` (Windows / PowerShell)

## Có gì mới?

- `rag/chatbot.py` đã là **Agentic RAG**: Gemini dùng tool calling trong vòng lặp LangGraph để tự chọn truy xuất ngữ nghĩa, lọc Firestore, tra cứu mã địa điểm, hoặc tìm PDF.
- Dùng **`rag/retrieve.py` đã cập nhật**; không chỉnh kho vector, không đụng CRUD/Auth hay frontend.
- Kiểm tra `is_active` trực tiếp trên Firestore khi trả kết quả địa điểm từ ChromaDB. Nội dung các trường lấy từ Firestore tại thời điểm tra cứu để tránh dữ liệu Chroma cũ.
- Chạy tối đa **2 vòng gọi công cụ** trên mỗi câu; không bảo đảm luôn trả lời dưới 30 giây (phải đo với Gemini/mạng thật).
- Không có công cụ thời tiết thời gian thực. PDF chỉ mang tính tham khảo bổ sung; khuyến nghị địa điểm phải có bằng chứng từ Firestore đã xác minh.
- Giữ `ask_chatbot(question)` để code khác gọi được. Thêm `history=` và `debug=` tùy chọn.

## 1. Cài đặt

1. Sao lưu file cũ: `C:\Đồ án 2\Travel Chatbot\rag\chatbot.py` thành `chatbot_basic_backup.py` (bảo quản riêng khỏi repo nếu cần).
2. Giải nén ZIP vào **`C:\Đồ án 2`** và chọn thay `Travel Chatbot\rag\chatbot.py`.
3. Giữ nguyên `retrieve.py` mới đang truy vấn `chroma_db_dora/dora_destinations_firestore_v1`.
4. Mở Terminal PowerShell ở `C:\Đồ án 2`, kích hoạt `.venv` nếu chưa được kích hoạt:

```powershell
cd "C:\Đồ án 2"
.\.venv\Scripts\Activate.ps1
python -m pip install langgraph
python -m pip check
```

`langchain-core`, `langchain-google-genai`, `firebase-admin`, `google-genai`, `langchain-chroma`, `chromadb`, `python-dotenv` cũng phải có sẵn — chúng đã được dùng ở các bước RAG trước. Nếu `pip check` báo xung đột, giải quyết phiên bản theo thông báo trước khi chạy.

## 2. Cấu hình

File `C:\Đồ án 2\Travel Chatbot\.env` cần có ít nhất một trong các biến:

```
GEMINI_API_KEY=YOUR_KEY_HERE
```

hoặc `GOOGLE_API_KEY` (không cần cả hai). Không push `.env` lên GitHub.

Trong **Terminal đang chạy agent** cần có `GOOGLE_APPLICATION_CREDENTIALS` trỏ đến JSON Firebase Admin SDK đã tải (dùng đường dẫn thực tế của bạn). Ví dụ chỉ khi file tồn tại ở đây:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\firebase-keys\serviceAccountKey.json"
Test-Path $env:GOOGLE_APPLICATION_CREDENTIALS
```

Chỉ giữ private key ở máy/backend tin cậy, không cho vào React.

## 3. Chạy Agentic RAG

```powershell
python ".\Travel Chatbot\rag\chatbot.py" --debug
```

Chế độ 1 câu:

```powershell
python ".\Travel Chatbot\rag\chatbot.py" --query "Gợi ý 3 điểm tham quan ở TP. Hồ Chí Minh" --debug
```

`--debug` in tên công cụ và thời gian xử lý ra Terminal (không hiển thị ra website).

### Đề xuất kiểm thử

1. `Gợi ý 3 nơi tham quan ở TP. Hồ Chí Minh, phù hợp cho gia đình.` (tìm ngữ nghĩa)
2. `Ở Cần Thơ có địa điểm du lịch nào?` (lọc đúng tỉnh/thành)
3. `Cho tôi biết giá vé Địa đạo Củ Chi.` (không bịa giá nếu dữ liệu chưa xác minh)
4. `Tài liệu PDF có thông tin gì về ẩm thực ở Huế?` (tìm PDF)
5. Ẩn một địa điểm thử nghiệm trong Firestore rồi hỏi lại; không được gợi ý bản ghi đang ẩn dù Chroma chưa đồng bộ. Khôi phục sau kiểm thử.
6. `Thời tiết bây giờ ở Đà Lạt thế nào?` (phải nêu không có dữ liệu thời tiết realtime)

## 4. Giới hạn hiện tại / bước phát triển tiếp

- Cơ chế này **đã là agent tool calling**, không còn Basic RAG chỉ ghép top-k. Tuy nhiên, chưa có đánh giá tự động chất lượng retrieval, reranking, ground-truth/citation validator, hoặc test 30 giây theo thống kê.
- Địa điểm mới chưa index vào Chroma chỉ xuất hiện qua công cụ lọc Firestore nếu model chọn công cụ đó. Sau CRUD, **vẫn cần chạy sync**:

```powershell
python ".\Travel Chatbot\sync_firestore_chroma.py" --apply --all
```

- Bộ lọc Firestore trực tiếp hiện quét tối đa 600 bản ghi để thuận tiện với ~250 địa điểm; quy mô lớn cần lập chỉ mục/phân trang hoặc dịch vụ tìm kiếm.
- Việc chống gợi ý địa điểm ẩn được cưỡng chế ở các công cụ đọc Firestore; nội dung PDF vẫn có thể nhắc tới chúng. System Prompt cấm coi PDF là nguồn xác minh địa điểm, nhưng cần kiểm thử và bổ sung hậu kiểm khi triển khai production.
- Chưa tự đưa Agentic RAG lên website. Khi nối FastAPI, chỉ gọi `rag.chatbot.ask_chatbot(question)` **sau khi xác minh tài khoản** và phải thêm timeout, rate limits, theo dõi chi phí/quota Gemini trước khi public API.

## 5. Khôi phục

Nếu Gemini/model chưa hỗ trợ tool calling trên tài khoản của bạn hoặc gặp xung đột package, đổi tên bản `chatbot_basic_backup.py` trở về `chatbot.py`. Không cần đổi lại Firestore hay ChromaDB.
