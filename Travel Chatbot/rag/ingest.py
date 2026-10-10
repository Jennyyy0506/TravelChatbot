
import csv
from pathlib import Path
import re
from time import sleep

from dotenv import load_dotenv
from langchain_core.documents import Document
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_chroma import Chroma

# Đường dẫn
BASE_DIR = Path(__file__).resolve().parents[2]
CHATBOT_DIR = BASE_DIR / "Travel Chatbot"

CSV_PATH = BASE_DIR / "Data" / "travel_destinations_final.csv"
DB_PATH = CHATBOT_DIR / "chroma_db"

# Đọc API Key
load_dotenv(CHATBOT_DIR / ".env")

# Kiểm tra file CSV
if not CSV_PATH.exists():
    raise FileNotFoundError(f"Không tìm thấy dataset: {CSV_PATH}")

# Đọc dữ liệu
documents = []

with open(CSV_PATH, "r", encoding="utf-8-sig", newline="") as file:
    reader = csv.DictReader(file)

    for row in reader:
        name = row.get("name", "")
        province = row.get("province", "")

        # Chuyển thông tin thành nội dung văn bản
        content = "\n".join(
            f"{key}: {value}"
            for key, value in row.items()
            if value and value.strip()
        )

        document = Document(
            page_content=content,
            metadata={
                "destination_id": row.get("destination_id", ""),
                "name": name,
                "province": province
            }
        )

        documents.append(document)

print(f"Đã đọc {len(documents)} địa điểm!")

# Khởi tạo Embedding
embeddings = GoogleGenerativeAIEmbeddings(
    model="gemini-embedding-2",
    output_dimensionality=768
)

# Khởi tạo ChromaDB
vectorstore = Chroma(
    collection_name="travel_destinations",
    embedding_function=embeddings,
    persist_directory=str(DB_PATH)
)

# Lưu dữ liệu

# Kiểm tra những địa điểm đã lưu
existing_ids = set(vectorstore.get(include=[])["ids"])

print(f"Đã có {len(existing_ids)} địa điểm trong ChromaDB")

new_count = 0

for i, doc in enumerate(documents):
    doc_id = doc.metadata["destination_id"] or f"test_{i}"

    # Bỏ qua địa điểm đã lưu
    if doc_id in existing_ids:
        continue

    # Tự thử lại tối đa 5 lần nếu bị giới hạn API
    for attempt in range(5):
        try:
            vectorstore.add_documents(
                documents=[doc],
                ids=[doc_id]
            )
            existing_ids.add(doc_id)
            new_count += 1
            break

        except Exception as e:
            error_message = str(e)

            if "429" not in error_message:
                raise

            if attempt == 4:
                raise RuntimeError(
                    "API vẫn bị giới hạn sau 5 lần thử"
                ) from e

            # Ưu tiên thời gian chờ do Google cung cấp
            match = re.search(
                r"Please retry in\s+([\d.]+)s",
                error_message
            )

            wait_time = (
                max(35, float(match.group(1)) + 5)
                if match else 65
            )

            print(f"API bị giới hạn. Đợi {wait_time:.0f}s...")
            sleep(wait_time)

    if new_count % 10 == 0:
        print(f"Đã lưu thêm {new_count} địa điểm")

    # Giảm tốc độ gọi API
    sleep(1.2)

# Kiểm tra số lượng thực tế
total = len(vectorstore.get(include=[])["ids"])

print("\nHOÀN THÀNH!")
print(f"Tổng số địa điểm trong ChromaDB: {total}")


# Kiểm tra tìm kiếm
query = f"Thông tin du lịch về {documents[0].metadata['name']}"

results = vectorstore.similarity_search(query, k=3)

print("\nKẾT QUẢ TÌM KIẾM:")
for i, doc in enumerate(results, start=1):
    print(f"{i}. {doc.metadata['name']}")
    print(f"   Tỉnh/Thành: {doc.metadata['province']}")
