
import os
from pathlib import Path
from dotenv import load_dotenv
from langchain_google_genai import GoogleGenerativeAIEmbeddings

# Đọc API Key từ file .env
env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=env_path)

if not os.getenv("GOOGLE_API_KEY"):
    raise ValueError("Chưa tìm thấy GOOGLE_API_KEY trong file .env")

print("Đã đọc API Key thành công!")

# Khởi tạo mô hình Embedding
embeddings = GoogleGenerativeAIEmbeddings(
    model="gemini-embedding-2",
    output_dimensionality=768
)

# Nội dung kiểm thử
text = "Tôi muốn tìm địa điểm du lịch ở Đà Lạt"

print("Đang tạo Embedding...")

vector = embeddings.embed_query(text)

print("Embedding thành công!")
print("Số chiều vector:", len(vector))
print("5 giá trị đầu tiên:", vector[:5])
