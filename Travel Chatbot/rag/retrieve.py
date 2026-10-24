"""Dora | Truy xuất ChromaDB: Firestore destinations + PDF cũ.

Đặt tại: C:\\Đồ án 2\\Travel Chatbot\\rag\\retrieve.py

Giữ API cũ: search_csv(query, k), search_pdf(query, k),
search_all(query, csv_k, pdf_k), print_results(results).

QUAN TRỌNG:
- Địa điểm chỉ đọc từ kho mới: chroma_db_dora/dora_destinations_firestore_v1.
- KHÔNG truy vấn collection travel_destinations cũ, tránh trả địa điểm đã ẩn.
- PDF vẫn đọc từ chroma_db/travel_documents.
- Cần chạy sync_firestore_chroma.py --apply --all (và sau các lần Admin CRUD).
- Script này chưa biến RAG thành Agentic RAG.
"""

from __future__ import annotations

import argparse
import os
from functools import lru_cache
from pathlib import Path

import chromadb
from dotenv import load_dotenv
from google import genai
from google.genai import types
from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain_google_genai import GoogleGenerativeAIEmbeddings


# retrieve.py nằm trong: C:\Đồ án 2\Travel Chatbot\rag\
CHATBOT_DIR = Path(__file__).resolve().parents[1]
DORA_DB_PATH = CHATBOT_DIR / "chroma_db_dora"
OLD_DB_PATH = CHATBOT_DIR / "chroma_db"

DORA_COLLECTION = "dora_destinations_firestore_v1"
PDF_COLLECTION = "travel_documents"
EMBEDDING_MODEL = "gemini-embedding-2"
EMBEDDING_DIM = 768

load_dotenv(CHATBOT_DIR / ".env")


def _api_key() -> str:
    key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not key:
        raise RuntimeError(
            "Thiếu GEMINI_API_KEY hoặc GOOGLE_API_KEY trong "
            "C:\\Đồ án 2\\Travel Chatbot\\.env (hoặc biến môi trường)."
        )
    return key


@lru_cache(maxsize=1)
def _dora_collection():
    """Chỉ mở collection có sẵn; không tự tạo collection trống."""
    if not DORA_DB_PATH.is_dir():
        raise FileNotFoundError(
            f"Không tìm thấy Chroma mới: {DORA_DB_PATH}. "
            "Hãy chạy sync_firestore_chroma.py --apply --all."
        )

    client = chromadb.PersistentClient(path=str(DORA_DB_PATH))
    try:
        collection = client.get_collection(
            name=DORA_COLLECTION, embedding_function=None
        )
    except Exception as exc:
        raise RuntimeError(
            f"Không tìm thấy collection '{DORA_COLLECTION}' trong {DORA_DB_PATH}. "
            "Hãy chạy sync_firestore_chroma.py --apply --all."
        ) from exc

    metadata = collection.metadata or {}
    if (
        metadata.get("embedding_model") != EMBEDDING_MODEL
        or str(metadata.get("embedding_dim")) != str(EMBEDDING_DIM)
    ):
        raise RuntimeError(
            "Collection Dora có model/kích thước vector khác mong đợi "
            f"({EMBEDDING_MODEL}, {EMBEDDING_DIM}). Dừng để tránh truy vấn sai."
        )
    return collection


@lru_cache(maxsize=1)
def _embedding_client():
    # Dùng đúng SDK và cấu hình model của sync_firestore_chroma.py.
    return genai.Client(api_key=_api_key())


def _embed_query(query: str) -> list[float]:
    response = _embedding_client().models.embed_content(
        model=EMBEDDING_MODEL,
        contents=query,
        config=types.EmbedContentConfig(output_dimensionality=EMBEDDING_DIM),
    )
    vectors = response.embeddings or []
    if len(vectors) != 1 or not vectors[0].values:
        raise RuntimeError("Gemini không trả về embedding truy vấn hợp lệ.")

    vector = list(vectors[0].values)
    if len(vector) != EMBEDDING_DIM:
        raise RuntimeError(
            f"Embedding truy vấn có {len(vector)} chiều, cần {EMBEDDING_DIM}."
        )
    return vector


@lru_cache(maxsize=1)
def _pdf_vectorstore():
    """Giữ PDF RAG cũ; PDF không có thì bỏ qua, không tạo kho giả."""
    if not OLD_DB_PATH.is_dir():
        return None

    client = chromadb.PersistentClient(path=str(OLD_DB_PATH))
    try:
        raw_collection = client.get_collection(
            name=PDF_COLLECTION, embedding_function=None
        )
    except Exception:
        return None

    if raw_collection.count() == 0:
        return None

    # Cấu hình giữ giống retrieve.py trước đây cho PDF.
    embeddings = GoogleGenerativeAIEmbeddings(
        model=EMBEDDING_MODEL,
        output_dimensionality=EMBEDDING_DIM,
        google_api_key=_api_key(),
    )
    return Chroma(
        collection_name=PDF_COLLECTION,
        embedding_function=embeddings,
        persist_directory=str(OLD_DB_PATH),
    )


def search_csv(query: str, k: int = 3) -> list[Document]:
    """Giữ tên hàm cũ để chatbot.py vẫn gọi được.

    'CSV' ở retrieval_source là tên tương thích cũ; nguồn thực tế
    là Firestore, đã được đồng bộ sang ChromaDB.
    """
    if not query or not query.strip() or k <= 0:
        return []

    collection = _dora_collection()
    count = collection.count()
    if count == 0:
        return []

    results = collection.query(
        query_embeddings=[_embed_query(query.strip())],
        n_results=min(k, count),
        include=["documents", "metadatas", "distances"],
    )

    ids = (results.get("ids") or [[]])[0]
    texts = (results.get("documents") or [[]])[0]
    metas = (results.get("metadatas") or [[]])[0]
    distances = (results.get("distances") or [[]])[0]

    documents = []
    for i, doc_id in enumerate(ids):
        metadata = dict(metas[i] or {}) if i < len(metas) else {}
        metadata.setdefault("destination_id", doc_id)
        metadata["retrieval_source"] = "CSV"  # Tương thích chatbot cũ
        metadata["data_origin"] = "Firestore"
        if i < len(distances) and distances[i] is not None:
            metadata["vector_distance"] = float(distances[i])

        documents.append(
            Document(
                page_content=(texts[i] or "") if i < len(texts) else "",
                metadata=metadata,
            )
        )
    return documents


def search_pdf(query: str, k: int = 3) -> list[Document]:
    if not query or not query.strip() or k <= 0:
        return []

    store = _pdf_vectorstore()
    if store is None:
        return []

    retriever = store.as_retriever(
        search_type="mmr",
        search_kwargs={
            "k": k,
            "fetch_k": max(10, k * 4),
            "lambda_mult": 0.5,
        },
    )
    documents = retriever.invoke(query.strip())
    for doc in documents:
        doc.metadata["retrieval_source"] = "PDF"
    return documents


def search_all(query: str, csv_k: int = 3, pdf_k: int = 3) -> list[Document]:
    """Giữ nguyên hàm & tham số cũ; ghép kết quả địa điểm với PDF."""
    return search_csv(query, k=csv_k) + search_pdf(query, k=pdf_k)


def print_results(results: list[Document]) -> None:
    if not results:
        print("\nKhông tìm thấy kết quả trong dữ liệu địa điểm hoặc PDF.")
        return

    print("\nKẾT QUẢ TRUY XUẤT:")
    for i, doc in enumerate(results, start=1):
        metadata = doc.metadata
        source = metadata.get("retrieval_source", "Không rõ")
        print(f"\n{'=' * 42}\nKết quả {i} - Nguồn {source}")

        if source == "CSV":
            print("Nguồn dữ liệu: Firestore → ChromaDB Dora")
            print("destination_id:", metadata.get("destination_id", "Không rõ"))
            print("Tên:", metadata.get("name", "Không rõ"))
            print("Tỉnh/Thành:", metadata.get("province", "Không rõ"))
            distance = metadata.get("vector_distance")
            if distance is not None:
                print("Khoảng cách vector:", round(float(distance), 4))
        elif source == "PDF":
            print("File:", metadata.get("file_name", "Không rõ"))
            print("Trang:", metadata.get("page", "Không rõ"))

        print("\nNội dung:\n", doc.page_content)


def print_stats() -> None:
    print(f"Kho Dora: {DORA_DB_PATH}")
    print(f"Collection: {DORA_COLLECTION}")
    dora_count = _dora_collection().count()
    print(f"Địa điểm đã đồng bộ: {dora_count}")
    if 0 < dora_count <= 3:
        print("Lưu ý: Có thể bà mới sync 3 địa điểm để thử nghiệm.")
        print("Muốn đồng bộ đầy đủ, chạy sync_firestore_chroma.py --apply --all.")

    if OLD_DB_PATH.is_dir():
        client = chromadb.PersistentClient(path=str(OLD_DB_PATH))
        try:
            pdf_count = client.get_collection(
                name=PDF_COLLECTION, embedding_function=None
            ).count()
        except Exception:
            pdf_count = 0
    else:
        pdf_count = 0
    print(f"PDF cũ: {pdf_count} chunks")


def main() -> None:
    parser = argparse.ArgumentParser(description="Dora RAG: Firestore/Chroma + PDF")
    parser.add_argument("--stats", action="store_true", help="Kiểm tra số bản ghi, không gọi Gemini")
    parser.add_argument("--query", type=str, help="Truy vấn nhanh không cần chế độ nhập liên tục")
    parser.add_argument("--csv-only", action="store_true", help="Chỉ tìm địa điểm Firestore")
    parser.add_argument("--pdf-only", action="store_true", help="Chỉ tìm PDF")
    args = parser.parse_args()
    if args.csv_only and args.pdf_only:
        parser.error("Chỉ chọn một trong --csv-only hoặc --pdf-only")

    if args.stats:
        print_stats()
        return

    print("\nDORA - TRUY XUẤT DỮ LIỆU DU LỊCH")
    print("Địa điểm: Firestore -> ChromaDB Dora | Tài liệu: PDF cũ")
    print("Nhập 'exit' để thoát.\n")

    def execute(question: str):
        if args.csv_only:
            found = search_csv(question)
        elif args.pdf_only:
            found = search_pdf(question)
        else:
            found = search_all(question)
        print_results(found)

    if args.query is not None:
        execute(args.query)
        return

    while True:
        try:
            question = input("Nhập câu hỏi: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nKết thúc truy xuất.")
            break
        if question.lower() == "exit":
            break
        if not question:
            print("Vui lòng nhập câu hỏi.")
            continue
        try:
            execute(question)
        except Exception as exc:
            print(f"Lỗi truy xuất: {type(exc).__name__}: {exc}")


if __name__ == "__main__":
    main()
