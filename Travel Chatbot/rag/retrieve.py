
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


# 2. Khởi tạo Gemini Embedding
embeddings = GoogleGenerativeAIEmbeddings(
    model="gemini-embedding-2",
    output_dimensionality=768
)


# 3. Kết nối ChromaDB

# Collection dữ liệu CSV
vectorstore_csv = Chroma(
    collection_name="travel_destinations",
    embedding_function=embeddings,
    persist_directory=str(DB_PATH)
)

# Collection dữ liệu PDF
vectorstore_pdf = Chroma(
    collection_name="travel_documents",
    embedding_function=embeddings,
    persist_directory=str(DB_PATH)
)

total_csv = vectorstore_csv._collection.count()
total_pdf = vectorstore_pdf._collection.count()

print(f"Đã kết nối CSV: {total_csv} địa điểm")
print(f"Đã kết nối PDF: {total_pdf} chunks")


# 4. Tìm kiếm dữ liệu CSV
def search_destinations(query, k=3):
    results = vectorstore_csv.similarity_search_with_score(
        query=query,
        k=k
    )

    print("\nKẾT QUẢ TÌM KIẾM CSV:")

    if not results:
        print("Không tìm thấy dữ liệu CSV.")
        return []

    for i, (doc, distance) in enumerate(results, start=1):
        print(f"\n--- Địa điểm {i} ---")
        print("Tên:", doc.metadata.get("name"))
        print("Tỉnh:", doc.metadata.get("province"))
        print("Khoảng cách vector:", round(distance, 4))
        print("Thông tin:")
        print(doc.page_content)

    return [doc for doc, distance in results]


# 5. Tìm kiếm dữ liệu PDF bằng MMR
def search_pdf(query, k=3, file_name=None):

    search_kwargs = {
        "k": k,
        "fetch_k": max(10, k * 4),
        "lambda_mult": 0.5
    }

    # Lọc tài liệu PDF theo tên nếu cần
    if file_name:
        search_kwargs["filter"] = {
            "file_name": file_name
        }

    retriever = vectorstore_pdf.as_retriever(
        search_type="mmr",
        search_kwargs=search_kwargs
    )

    results = retriever.invoke(query)

    print("\nKẾT QUẢ TÌM KIẾM PDF:")

    if not results:
        print("Không tìm thấy dữ liệu PDF.")
        return []

    for i, doc in enumerate(results, start=1):
        print(f"\n--- Đoạn tài liệu {i} ---")
        print("Tên PDF:", doc.metadata.get("file_name"))
        print("Trang:", doc.metadata.get("page"))
        print("Nội dung:")
        print(doc.page_content)

    return results


# 6. Tìm kiếm cả CSV và PDF
def search_all(query, k=3):
    csv_results = search_destinations(query, k)
    pdf_results = search_pdf(query, k)

    return {
        "csv": csv_results,
        "pdf": pdf_results
    }


# 7. Kiểm thử trực tiếp
if __name__ == "__main__":

    while True:
        print("\nCHỌN NGUỒN DỮ LIỆU")
        print("1. CSV")
        print("2. PDF")
        print("3. Cả CSV và PDF")

        choice = input("Lựa chọn (1/2/3, exit để thoát): ").strip()

        if choice.lower() == "exit":
            break

        if choice not in ["1", "2", "3"]:
            print("Lựa chọn không hợp lệ.")
            continue

        question = input("Nhập câu hỏi: ").strip()

        if not question:
            continue

        try:
            if choice == "1":
                search_destinations(question)

            elif choice == "2":
                search_pdf(question)

            else:
                search_all(question)

        except Exception as e:
            print(f"Lỗi truy xuất: {e}")
