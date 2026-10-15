
from pathlib import Path
from hashlib import sha256
from time import sleep
import re
import sys

from dotenv import load_dotenv
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_chroma import Chroma


# 1. Đường dẫn dự án
CHATBOT_DIR = Path(__file__).resolve().parents[1]
DB_PATH = CHATBOT_DIR / "chroma_db"
PDF_DIR = CHATBOT_DIR / "documents"

# Đọc API Key trong .env
load_dotenv(CHATBOT_DIR / ".env")


# 2. Đọc file PDF
def load_pdf(pdf_path):
    pdf_path = Path(pdf_path).resolve()

    if not pdf_path.is_file():
        raise FileNotFoundError(
            f"Không tìm thấy PDF: {pdf_path}"
        )

    if pdf_path.suffix.lower() != ".pdf":
        raise ValueError("File phải có định dạng PDF")

    loader = PyPDFLoader(str(pdf_path))
    documents = loader.load()

    print(f"Đã đọc {len(documents)} trang PDF")

    # Chỉ giữ những trang có văn bản
    documents = [
        doc for doc in documents
        if doc.page_content.strip()
    ]

    if not documents:
        raise ValueError(
            "PDF không có văn bản trích xuất được."
        )

    # Chuẩn hóa metadata
    for doc in documents:
        page = doc.metadata.get("page", 0)

        doc.metadata = {
            "source_type": "pdf",
            "source": str(pdf_path),
            "file_name": pdf_path.name,
            "page": int(page) + 1
        }

    return documents


# 3. Chia tài liệu thành chunks
def split_pdf(documents):
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=800,
        chunk_overlap=150,
        separators=["\n\n", "\n", ". ", " ", ""]
    )

    chunks = splitter.split_documents(documents)

    print(f"Đã tạo {len(chunks)} chunks")

    return chunks


# 4. Khởi tạo Gemini Embedding
def create_embeddings():
    return GoogleGenerativeAIEmbeddings(
        model="gemini-embedding-2",
        output_dimensionality=768
    )


# 5. Kết nối ChromaDB
def connect_chromadb():
    embeddings = create_embeddings()

    vectorstore = Chroma(
        collection_name="travel_documents",
        embedding_function=embeddings,
        persist_directory=str(DB_PATH)
    )

    return vectorstore


# 6. Lưu PDF vào ChromaDB
def ingest_pdf(pdf_path):
    pdf_path = Path(pdf_path).resolve()

    print("\nBẮT ĐẦU XỬ LÝ PDF")
    print(f"Tài liệu: {pdf_path.name}")

    # Đọc PDF
    documents = load_pdf(pdf_path)

    # Chia chunks
    chunks = split_pdf(documents)

    # Kết nối database
    vectorstore = connect_chromadb()

    # Tạo ID ổn định cho từng chunk
    for index, doc in enumerate(chunks):
        doc.metadata["chunk_index"] = index

    # Kiểm tra chunk đã lưu
    existing_ids = set(
        vectorstore.get(include=[])["ids"]
    )

    new_count = 0
    skipped_count = 0

    for index, doc in enumerate(chunks):

        # ID dựa trên đường dẫn và nội dung
        raw_id = (
            str(pdf_path)
            + "|"
            + str(doc.metadata["page"])
            + "|"
            + str(index)
            + "|"
            + doc.page_content
        )

        doc_id = "pdf_" + sha256(
            raw_id.encode("utf-8")
        ).hexdigest()

        if doc_id in existing_ids:
            skipped_count += 1
            continue

        # Tự thử lại nếu API Gemini bị giới hạn
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
                        "Gemini API vẫn bị giới hạn "
                        "sau 5 lần thử."
                    ) from e

                match = re.search(
                    r"Please retry in\s+([\d.]+)s",
                    error_message
                )

                wait_time = (
                    max(35, float(match.group(1)) + 5)
                    if match else 65
                )

                print(
                    f"API bị giới hạn. "
                    f"Đợi {wait_time:.0f}s..."
                )
                sleep(wait_time)

        print(
            f"Đã xử lý chunk "
            f"{index + 1}/{len(chunks)}"
        )

        sleep(1.2)

    # 7. Kiểm tra kết quả
    total = vectorstore._collection.count()

    print("\nHOÀN THÀNH!")
    print(f"File PDF: {pdf_path.name}")
    print(f"Số chunk mới: {new_count}")
    print(f"Số chunk bỏ qua: {skipped_count}")
    print(f"Tổng vector trong collection: {total}")

    return vectorstore


# 8. Chạy chương trình
if __name__ == "__main__":

    if len(sys.argv) > 1:
        pdf_path = Path(sys.argv[1])
    else:
        pdf_path = PDF_DIR / "du_lich_da_lat.pdf"

    try:
        ingest_pdf(pdf_path)

    except Exception as e:
        print(f"\nLỗi: {e}")
        sys.exit(1)
