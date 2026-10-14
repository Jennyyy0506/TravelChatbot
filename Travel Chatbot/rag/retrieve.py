from pathlib import Path
from dotenv import load_dotenv

from langchain_chroma import Chroma
from langchain_google_genai import GoogleGenerativeAIEmbeddings

CHATBOT_DIR = Path(__file__).resolve().parents[1]
DB_PATH = CHATBOT_DIR / "chroma_db"

load_dotenv(CHATBOT_DIR / ".env")


# Kiểm tra ChromaDB
if not DB_PATH.exists():
    raise FileNotFoundError(
        f"Chưa tìm thấy ChromaDB tại: {DB_PATH}"
    )


embeddings = GoogleGenerativeAIEmbeddings(
    model="gemini-embedding-2",
    output_dimensionality=768
)


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


# Kiểm tra số lượng dữ liệu
total_csv = vectorstore_csv._collection.count()
total_pdf = vectorstore_pdf._collection.count()

print(
    f"Đã kết nối dữ liệu CSV: "
    f"{total_csv} địa điểm"
)

print(
    f"Đã kết nối dữ liệu PDF: "
    f"{total_pdf} chunks"
)


def search_csv(query, k=3):

    results = vectorstore_csv.similarity_search_with_score(
        query=query,
        k=k
    )

    documents = []

    if not results:
        return documents

    for doc, distance in results:

        # Gắn thêm loại nguồn
        doc.metadata["retrieval_source"] = "CSV"

        # Có thể lưu distance để kiểm tra/debug
        doc.metadata["vector_distance"] = float(distance)

        documents.append(doc)

    return documents


def search_pdf(query, k=3):

    # MMR giúp giảm các đoạn PDF quá giống nhau
    retriever = vectorstore_pdf.as_retriever(
        search_type="mmr",
        search_kwargs={
            "k": k,
            "fetch_k": max(10, k * 4),
            "lambda_mult": 0.5
        }
    )

    results = retriever.invoke(query)

    for doc in results:
        doc.metadata["retrieval_source"] = "PDF"

    return results



def search_all(query, csv_k=3, pdf_k=3):

    csv_results = search_csv(
        query=query,
        k=csv_k
    )

    pdf_results = search_pdf(
        query=query,
        k=pdf_k
    )

    results = csv_results + pdf_results

    return results


def print_results(results):

    if not results:
        print(
            "\nKhông tìm thấy dữ liệu phù hợp "
            "trong CSV hoặc PDF."
        )
        return

    print("\nKẾT QUẢ TRUY XUẤT:")

    for i, doc in enumerate(
        results,
        start=1
    ):

        source = doc.metadata.get(
            "retrieval_source",
            "Không rõ"
        )

        print(
            f"\n=============================="
        )

        print(
            f"Kết quả {i} - Nguồn {source}"
        )


        if source == "CSV":

            print(
                "destination_id:",
                doc.metadata.get(
                    "destination_id",
                    "Không rõ"
                )
            )

            print(
                "Tên:",
                doc.metadata.get(
                    "name",
                    "Không rõ"
                )
            )

            print(
                "Tỉnh/Thành:",
                doc.metadata.get(
                    "province",
                    "Không rõ"
                )
            )

            distance = doc.metadata.get(
                "vector_distance"
            )

            if distance is not None:
                print(
                    "Khoảng cách vector:",
                    round(distance, 4)
                )

        elif source == "PDF":

            print(
                "File:",
                doc.metadata.get(
                    "file_name",
                    "Không rõ"
                )
            )

            print(
                "Trang:",
                doc.metadata.get(
                    "page",
                    "Không rõ"
                )
            )

        print("\nNội dung:")

        print(
            doc.page_content
        )



if __name__ == "__main__":

    print("\n================================")
    print("TRUY XUẤT DỮ LIỆU DU LỊCH")
    print("================================")

    print(
        "Hệ thống tự động tìm kiếm "
        "trong cả CSV và PDF."
    )

    print(
        "Nhập 'exit' để thoát."
    )

    while True:

        question = input(
            "\nNhập câu hỏi: "
        ).strip()

        if question.lower() == "exit":
            break

        if not question:
            print(
                "Vui lòng nhập câu hỏi."
            )
            continue

        try:

            results = search_all(
                query=question,
                csv_k=3,
                pdf_k=3
            )

            print_results(
                results
            )

        except Exception as e:

            print(
                f"\nLỗi truy xuất: {e}"
            )