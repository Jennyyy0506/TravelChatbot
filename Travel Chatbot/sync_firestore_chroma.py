"""Dora | Sync Firestore destinations -> a NEW Chroma collection.

Place at: C:\\Đồ án 2\\Travel Chatbot\\sync_firestore_chroma.py
Safety: Does not modify the old travel_destinations / travel_documents collections.
Default mode previews only. Writes require explicit --apply with --limit or --all.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path
from typing import Any

import chromadb
import firebase_admin
from dotenv import load_dotenv
from firebase_admin import firestore
from google import genai
from google.genai import types


BASE_DIR = Path(__file__).resolve().parent
CHROMA_PATH = BASE_DIR / "chroma_db_dora"  # Folder MỚI, không làm thay đổi Chroma hiện có.
COLLECTION = "dora_destinations_firestore_v1"  # Không đụng collection RAG cũ.
MODEL = "gemini-embedding-2"
DIMENSION = 768

TEXT_FIELDS = [
    ("Tên địa điểm", "name"),
    ("Tỉnh thành", "province"),
    ("Quận huyện", "district"),
    ("Địa chỉ", "address"),
    ("Loại địa điểm", "category"),
    ("Mô tả", "description"),
    ("Hoạt động", "activities"),
    ("Thời điểm phù hợp", "best_time"),
    ("Thời lượng", "duration"),
    ("Giờ mở cửa", "opening_hours"),
    ("Giá vé", "ticket_price"),
    ("Tiện ích", "facilities"),
    ("Nguồn", "source"),
]


def destination_text(doc_id: str, data: dict[str, Any]) -> str:
    """Nội dung được embed; không tự đoán dữ liệu thiếu hoặc giá vé."""
    rows = [f"Mã địa điểm: {doc_id}"]
    for label, field in TEXT_FIELDS:
        value = data.get(field)
        if value is not None and str(value).strip():
            rows.append(f"{label}: {str(value).strip()}")
    # Giới hạn đầu vào ở mức thận trọng; nội dung dài hơn cần chia chunk sau.
    return "\n".join(rows)[:8000]


def data_hash(doc_id: str, data: dict[str, Any]) -> str:
    """Dấu vân tay của 17 trường dữ liệu, gồm cả tọa độ / ảnh."""
    fields = ("destination_id", "name", "province", "district", "address",
              "latitude", "longitude", "category", "description", "activities",
              "best_time", "duration", "opening_hours", "ticket_price",
              "facilities", "source", "image_url")
    payload = {field: data.get(field) for field in fields}
    payload["destination_id"] = doc_id
    canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def chroma_metadata(doc_id: str, data: dict[str, Any], digest: str) -> dict:
    metadata = {
        "destination_id": doc_id,
        "name": str(data.get("name") or ""),
        "province": str(data.get("province") or ""),
        "category": str(data.get("category") or ""),
        "source": "firestore",
        "content_sha256": digest,
        "embedding_model": MODEL,
    }
    for field in ("address", "image_url", "ticket_price"):
        value = data.get(field)
        if value is not None and str(value).strip():
            metadata[field] = str(value).strip()
    for field in ("latitude", "longitude"):
        value = data.get(field)
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            metadata[field] = float(value)
    return metadata


def firestore_client():
    try:
        firebase_admin.get_app()
    except ValueError:
        firebase_admin.initialize_app()
    return firestore.client()


def chroma_collection(client):
    collection = client.get_or_create_collection(
        name=COLLECTION,
        metadata={
            "source": "firestore",
            "embedding_model": MODEL,
            "embedding_dim": DIMENSION,
        },
    )
    meta = collection.metadata or {}
    if (meta.get("embedding_model") != MODEL or
            int(meta.get("embedding_dim", 0)) != DIMENSION):
        raise RuntimeError(
            f"Collection {COLLECTION} có model/dimension khác; dừng để tránh trộn vector."
        )
    return collection


def gemini_client():
    key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not key:
        raise RuntimeError(
            "Thiếu GEMINI_API_KEY hoặc GOOGLE_API_KEY trong Travel Chatbot/.env "
            "hoặc biến môi trường Terminal. Đây KHÔNG phải Firebase Private Key."
        )
    return genai.Client(api_key=key)


def embed(client, text: str) -> list[float]:
    response = client.models.embed_content(
        model=MODEL,
        contents=text,
        config=types.EmbedContentConfig(output_dimensionality=DIMENSION),
    )
    vectors = response.embeddings or []
    if len(vectors) != 1 or not vectors[0].values:
        raise RuntimeError("Gemini không trả về embedding hợp lệ")
    vector = list(vectors[0].values)
    if len(vector) != DIMENSION:
        raise RuntimeError(f"Embedding trả về {len(vector)} chiều, cần {DIMENSION}")
    return vector


def is_active(data: dict[str, Any]) -> bool:
    # 250 địa điểm CSV cũ chưa có is_active => mặc định đang hiển thị.
    return data.get("is_active", True) is not False


def safe_mark_synced(ref, expected_active: bool, expected_hash: str | None):
    """Không đánh dấu synced khi admin đã sửa document trong lúc embed."""
    latest = ref.get()
    if not latest.exists:
        print(f"  [WARN] {ref.id}: Đã bị xóa trên Firestore, bỏ qua cập nhật trạng thái")
        return False
    current = latest.to_dict() or {}
    if is_active(current) != expected_active:
        print(f"  [WARN] {ref.id}: Trạng thái đã đổi, giữ pending để đồng bộ lại")
        return False
    if expected_active and data_hash(ref.id, current) != expected_hash:
        print(f"  [WARN] {ref.id}: Nội dung đã đổi, giữ pending để đồng bộ lại")
        return False
    ref.update({
        "rag_sync_status": "synced",
        "rag_sync_operation": "none",
        "rag_synced_at": firestore.SERVER_TIMESTAMP,
        "rag_sync_model": MODEL,
        "rag_sync_hash": expected_hash or "deleted",
    })
    return True


def get_existing_meta(collection, doc_id: str) -> dict | None:
    result = collection.get(ids=[doc_id], include=["metadatas"])
    if not result.get("ids"):
        return None
    metas = result.get("metadatas") or []
    return metas[0] or {}


def sync_one(doc, collection, ai_client) -> str:
    doc_id = doc.id
    data = doc.to_dict() or {}
    ref = doc.reference
    existing = get_existing_meta(collection, doc_id)

    if not is_active(data):
        if existing is not None:
            collection.delete(ids=[doc_id])
            action = "deleted-vector"
        else:
            action = "already-hidden"
        safe_mark_synced(ref, False, None)
        return action

    content = destination_text(doc_id, data)
    digest = data_hash(doc_id, data)
    if (existing is not None and existing.get("content_sha256") == digest and
            existing.get("embedding_model") == MODEL):
        action = "unchanged"
    else:
        vector = embed(ai_client, content)
        collection.upsert(
            ids=[doc_id],
            documents=[content],
            metadatas=[chroma_metadata(doc_id, data, digest)],
            embeddings=[vector],  # Chroma KHÔNG được dùng embedding mặc định.
        )
        action = "embedded"
    safe_mark_synced(ref, True, digest)
    return action


def main() -> int:
    parser = argparse.ArgumentParser(description="Dora Firestore -> Chroma (collection riêng, an toàn)")
    parser.add_argument("--apply", action="store_true", help="Thực sự ghi vào Chroma + trạng thái Firestore")
    scope = parser.add_mutually_exclusive_group()
    scope.add_argument("--limit", type=int, help="Số document tối đa khi thử nghiệm, ví dụ 3")
    scope.add_argument("--all", action="store_true", help="Xử lý toàn bộ destinations")
    parser.add_argument("--search", type=str, help="Thử truy vấn collection mới (có dùng 1 lần Gemini)")
    args = parser.parse_args()

    if args.limit is not None and args.limit < 1:
        parser.error("--limit phải lớn hơn 0")
    if args.apply and not (args.all or args.limit):
        parser.error("Khi --apply phải chọn --limit N hoặc --all")
    if args.search and (args.apply or args.all or args.limit):
        parser.error("--search phải chạy riêng, không kèm --apply/--all/--limit")

    load_dotenv(BASE_DIR / ".env")
    print(f"Chroma path: {CHROMA_PATH}")
    print(f"Collection MỚI: {COLLECTION}")

    # Search mode: không truy cập Firestore.
    if args.search:
        if not CHROMA_PATH.is_dir():
            print("Chưa có thư mục ChromaDB.")
            return 1
        collection = chroma_collection(chromadb.PersistentClient(path=str(CHROMA_PATH)))
        if collection.count() == 0:
            print("Collection mới đang trống, hãy sync một vài địa điểm trước.")
            return 1
        qvec = embed(gemini_client(), args.search)
        results = collection.query(query_embeddings=[qvec], n_results=min(3, collection.count()),
                                   include=["documents", "metadatas", "distances"])
        for i, rid in enumerate(results["ids"][0], start=1):
            md = results["metadatas"][0][i - 1] or {}
            print(f"  {i}. {rid}: {md.get('name')} | {md.get('province')}")
        return 0

    docs = list(firestore_client().collection("destinations").stream())
    active_count = sum(is_active(d.to_dict() or {}) for d in docs)
    print(f"Firestore: {len(docs)} bản ghi | đang hiển thị: {active_count} | đã ẩn: {len(docs)-active_count}")

    if not args.apply:
        print("CHỈ XEM TRƯỚC - CHƯA GHI FIRESTORE / CHROMADB / CHƯA GỌI GEMINI")
        for doc in docs[:10]:
            data = doc.to_dict() or {}
            label = "active" if is_active(data) else "hidden"
            print(f"  {doc.id}: {data.get('name')} [{label}]")
        return 0

    selected = docs if args.all else docs[:args.limit]
    ai_client = None
    collection = None
    tally: dict[str, int] = {}
    failures = 0

    for i, doc in enumerate(selected, start=1):
        try:
            if collection is None:
                collection = chroma_collection(chromadb.PersistentClient(path=str(CHROMA_PATH)))
            # Trường hợp đã ẩn không cần gọi Gemini.
            if is_active(doc.to_dict() or {}):
                existing = get_existing_meta(collection, doc.id)
                current_hash = data_hash(doc.id, doc.to_dict() or {})
                if not (existing and existing.get("content_sha256") == current_hash
                        and existing.get("embedding_model") == MODEL):
                    if ai_client is None:
                        ai_client = gemini_client()
            action = sync_one(doc, collection, ai_client)
            tally[action] = tally.get(action, 0) + 1
            print(f"[{i}/{len(selected)}] {doc.id}: {action}")
        except Exception as exc:
            failures += 1
            print(f"[{i}/{len(selected)}] {doc.id}: ERROR - {type(exc).__name__}: {exc}")
            # Giữ trạng thái pending / không đánh dấu synced để có thể chạy lại.

    print("Kết quả:", tally, f"| Lỗi: {failures}")
    print("Các thay đổi CHƯA có tác dụng trên chatbot cho tới khi sửa retriever dùng collection mới.")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
