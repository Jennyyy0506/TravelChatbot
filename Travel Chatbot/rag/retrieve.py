
from pathlib import Path
from dotenv import load_dotenv

from langchain_chroma import Chroma
from langchain_google_genai import GoogleGenerativeAIEmbeddings

# 1. Đường dẫn dự án
CHATBOT_DIR = Path(__file__).resolve().parents[1]
DB_PATH = CHATBOT_DIR / "chroma_db"

load_dotenv(CHATBOT_DIR / ".env")

if not DB_PATH.exists():
    raise FileNotFoundError("Chưa tìm thấy ChromaDB!")

# 2. Khởi tạo Embedding
embeddings = GoogleGenerativeAIEmbeddings(
    model="gemini-embedding-2",
    output_dimensionality=768
)

# 3. Kết nối ChromaDB đã tạo
vectorstore = Chroma(
    collection_name="travel_destinations",
    embedding_function=embeddings,
    persist_directory=str(DB_PATH)
)

total = vectorstore._collection.count()
print(f"Đã kết nối ChromaDB: {total} địa điểm")

# 4. Hàm tìm kiếm thông tin
def search_destinations(query, k=3):
    results = vectorstore.similarity_search_with_score(
        query=query,
        k=k
    )

    print("\nKẾT QUẢ TÌM KIẾM:")

    if not results:
        print("Không tìm thấy dữ liệu.")
        return

    for i, (doc, distance) in enumerate(results, start=1):
        print(f"\n--- Địa điểm {i} ---")
        print("Tên:", doc.metadata.get("name"))
        print("Tỉnh:", doc.metadata.get("province"))
        print("Khoảng cách vector:", round(distance, 4))
        print("Thông tin:")
        print(doc.page_content)

# 5. Kiểm thử trực tiếp
if __name__ == "__main__":
    while True:
        question = input("\nNhập câu hỏi (exit để thoát): ").strip()

        if question.lower() == "exit":
            break

        if not question:
            continue

        search_destinations(question)
