# Dora — Agentic RAG + bộ nhớ hội thoại ngắn hạn

## Thay thế file
1. Sao lưu `C:\Đồ án 2\Travel Chatbot\rag\chatbot.py` hiện tại.
2. Giải nén ZIP vào `C:\Đồ án 2` để thay đúng `Travel Chatbot\rag\chatbot.py`.
3. Giữ nguyên `retrieve.py`, ChromaDB, Firebase, `auth_api.py`, frontend và `.env`.
4. Nếu cần: `python -m pip install -U langgraph` (đã cài thì không cần).

## Chạy thử trên Terminal
Từ `C:\Đồ án 2` (đã bật `.venv`, đặt `GOOGLE_APPLICATION_CREDENTIALS`):

```powershell
python ".\Travel Chatbot\rag\chatbot.py" --debug
```

Gõ liên tiếp **trong cùng một phiên Terminal**:
- `Lan là học sinh tiểu học.`
- `Lan là học sinh gì?`

Dora cần trả lời là `học sinh tiểu học`, dựa vào lịch sử người dùng vừa đưa, **không cần Firestore**.

Kiểm tra du lịch:
- `Gợi ý 3 địa điểm tham quan ở TP. Hồ Chí Minh.`
- `Giờ mở cửa của Thảo Cầm Viên là gì?`

Câu du lịch vẫn cần chứng cứ truy xuất qua công cụ.

## Tích hợp vào API sau này
```python
from rag.chatbot import ask_chatbot
answer = ask_chatbot(question, session_id=f"{verified_uid}:{server_generated_chat_id}")
```
`verified_uid` phải đến từ Firebase ID Token đã xác minh. Cần kiểm tra quyền sở hữu chat_id trước khi lấy lịch sử; KHÔNG tin uid do browser tự khai báo. Người dùng khác phải có thread_id khác. Gọi `ask_chatbot(question)` không truyền session_id sẽ không nhớ lượt cũ.

## Giới hạn cần biết
- `InMemorySaver` chỉ giữ memory trong bộ nhớ của tiến trình Python; tắt backend/Terminal là mất. Khi deploy nhiều instance cần dùng persistence database (ví dụ Firestore lưu chat history hoặc checkpointer bền vững).
- Demo hiện định tuyến nhớ lại thông tin bằng một số dấu hiệu đơn giản, không phải bộ phân loại ý định hoàn chỉnh; hãy thử thêm các câu hỏi nối tiếp để đánh giá.
- Agent dùng tools để xác minh dữ liệu du lịch; lời người dùng tự kể chỉ được dùng để nhắc lại trong cuộc hội thoại, không coi là dữ liệu chính thức về địa điểm.
- Không đổi dữ liệu Firestore/Chroma hay script sync.
