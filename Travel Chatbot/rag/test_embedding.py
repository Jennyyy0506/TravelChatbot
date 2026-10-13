import os
from pathlib import Path
from dotenv import load_dotenv
from langchain_google_genai import GoogleGenerativeAIEmbeddings

# Đường dẫn tới thư mục Travel Chatbot
CHATBOT_DIR = Path(__file__).resolve().parents[1]

# Đường dẫn tới file .env
ENV_PATH = CHATBOT_DIR / ".env"

print("Đường dẫn .env:", ENV_PATH)
print("File .env tồn tại:", ENV_PATH.is_file())

# Đọc API Key
load_dotenv(dotenv_path=ENV_PATH, override=True)

api_key = os.getenv("GOOGLE_API_KEY")

if not api_key:
    raise ValueError("Chưa tìm thấy GOOGLE_API_KEY trong .env!")

print("Đã đọc API Key thành công!")