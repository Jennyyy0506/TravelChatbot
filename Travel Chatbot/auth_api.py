"""Dora Travel Chatbot - Firebase Auth + Firestore CRUD (Admin).

Đặt file tại: C:\\Đồ án 2\\Travel Chatbot\\auth_api.py
Private Key phải nằm ngoài repository. Backend dùng GOOGLE_APPLICATION_CREDENTIALS.

Lưu ý: Xóa địa điểm hiện là XÓA MỀM (is_active=False) để tránh mất dữ liệu
và đánh dấu chờ đồng bộ với ChromaDB. ChromaDB CHƯA tự cập nhật.
"""

import firebase_admin
from firebase_admin import auth, firestore
from fastapi import Depends, FastAPI, Header, HTTPException, Path, Query
from fastapi.middleware.cors import CORSMiddleware
from google.api_core.exceptions import AlreadyExists, Conflict, NotFound
from pydantic import BaseModel, ConfigDict, Field


# ========================= FIREBASE =========================
try:
    firebase_admin.get_app()
except ValueError:
    firebase_admin.initialize_app()

db = firestore.client()
app = FastAPI(title="Dora Travel Chatbot API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

DESTINATIONS = "destinations"
DESTINATION_ID = {"min_length": 1, "max_length": 100, "pattern": r"^[A-Za-z0-9_-]+$"}


# ========================= XÁC THỰC =========================
def verify_firebase_user(authorization: str | None) -> dict:
    if not authorization:
        raise HTTPException(status_code=401, detail="Bạn chưa đăng nhập")

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(status_code=401, detail="Authorization không hợp lệ")

    try:
        return auth.verify_id_token(token.strip(), check_revoked=True)
    except (
        ValueError,
        auth.InvalidIdTokenError,
        auth.ExpiredIdTokenError,
        auth.RevokedIdTokenError,
        auth.UserDisabledError,
    ) as exc:
        raise HTTPException(
            status_code=401,
            detail="Firebase ID Token không hợp lệ hoặc đã hết hạn",
        ) from exc


def get_current_user(authorization: str | None = Header(default=None)) -> dict:
    decoded = verify_firebase_user(authorization)
    uid = decoded["uid"]
    doc = db.collection("users").document(uid).get()
    if not doc.exists:
        raise HTTPException(status_code=403, detail="Chưa có hồ sơ người dùng")

    profile = doc.to_dict() or {}
    return {
        "uid": uid,
        "display_name": profile.get("display_name"),
        "email": profile.get("email"),
        "role": profile.get("role", "user"),
    }


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Bạn không có quyền Admin")
    return user


# ========================= TÀI KHOẢN =========================
@app.get("/")
def home():
    return {"message": "Dora backend is running"}


@app.post("/auth/sync")
def sync_user(authorization: str | None = Header(default=None)):
    decoded = verify_firebase_user(authorization)
    uid = decoded["uid"]
    ref = db.collection("users").document(uid)

    try:
        ref.create({
            "uid": uid,
            "display_name": decoded.get("name") or "Người dùng",
            "email": decoded.get("email"),
            "photo_url": decoded.get("picture"),
            "role": "user",   # Người mới luôn là user
            "created_at": firestore.SERVER_TIMESTAMP,
            "last_login_at": firestore.SERVER_TIMESTAMP,
        })
    except (Conflict, AlreadyExists):
        # Tài khoản cũ: tuyệt đối không ghi đè role=admin
        ref.update({"last_login_at": firestore.SERVER_TIMESTAMP})

    profile = ref.get().to_dict() or {}
    return {
        "uid": uid,
        "display_name": profile.get("display_name"),
        "email": profile.get("email"),
        "role": profile.get("role", "user"),
    }


@app.get("/auth/me")
def my_profile(user: dict = Depends(get_current_user)):
    return user


@app.get("/admin/users")
def list_users(admin: dict = Depends(require_admin)):
    result = []
    for doc in db.collection("users").limit(50).stream():
        data = doc.to_dict() or {}
        result.append({
            "uid": doc.id,
            "display_name": data.get("display_name"),
            "email": data.get("email"),
            "role": data.get("role", "user"),
        })
    return {"users": result, "returned_count": len(result)}


# ========================= 17 TRƯỜNG CSV =========================
class DestinationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    destination_id: str = Field(**DESTINATION_ID)
    name: str = Field(min_length=1, max_length=300)
    province: str = Field(min_length=1, max_length=150)
    category: str = Field(min_length=1, max_length=150)
    district: str | None = Field(default=None, max_length=200)
    address: str | None = Field(default=None, max_length=1200)
    latitude: float | None = Field(default=None, ge=-90, le=90, allow_inf_nan=False)
    longitude: float | None = Field(default=None, ge=-180, le=180, allow_inf_nan=False)
    description: str | None = Field(default=None, max_length=20000)
    activities: str | None = Field(default=None, max_length=5000)
    best_time: str | None = Field(default=None, max_length=500)
    duration: str | None = Field(default=None, max_length=300)
    opening_hours: str | None = Field(default=None, max_length=1000)
    ticket_price: str | None = Field(default=None, max_length=1000)
    facilities: str | None = Field(default=None, max_length=5000)
    source: str | None = Field(default=None, max_length=1000)
    image_url: str | None = Field(default=None, max_length=2000)


class DestinationUpdate(BaseModel):
    """PATCH: Chỉ cập nhật các trường được gửi; không được thay destination_id."""
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: str | None = Field(default=None, min_length=1, max_length=300)
    province: str | None = Field(default=None, min_length=1, max_length=150)
    category: str | None = Field(default=None, min_length=1, max_length=150)
    district: str | None = Field(default=None, max_length=200)
    address: str | None = Field(default=None, max_length=1200)
    latitude: float | None = Field(default=None, ge=-90, le=90, allow_inf_nan=False)
    longitude: float | None = Field(default=None, ge=-180, le=180, allow_inf_nan=False)
    description: str | None = Field(default=None, max_length=20000)
    activities: str | None = Field(default=None, max_length=5000)
    best_time: str | None = Field(default=None, max_length=500)
    duration: str | None = Field(default=None, max_length=300)
    opening_hours: str | None = Field(default=None, max_length=1000)
    ticket_price: str | None = Field(default=None, max_length=1000)
    facilities: str | None = Field(default=None, max_length=5000)
    source: str | None = Field(default=None, max_length=1000)
    image_url: str | None = Field(default=None, max_length=2000)


def destination_ref(destination_id: str):
    return db.collection(DESTINATIONS).document(destination_id)


def get_existing_destination(destination_id: str):
    ref = destination_ref(destination_id)
    snapshot = ref.get()
    if not snapshot.exists:
        raise HTTPException(status_code=404, detail="Không tìm thấy địa điểm")
    return ref, snapshot


def serialize_destination(snapshot):
    data = snapshot.to_dict() or {}
    return {
        **data,
        "id": snapshot.id,
        "is_active": data.get("is_active", True),  # Hỗ trợ dữ liệu CSV cũ
    }


# ========================= R - READ =========================
@app.get("/admin/destinations")
def list_destinations(
    limit: int = Query(default=100, ge=1, le=100),
    after: str | None = Query(default=None, **DESTINATION_ID),
    admin: dict = Depends(require_admin),
):
    collection = db.collection(DESTINATIONS)
    query = collection.order_by("__name__").limit(limit + 1)

    if after is not None:
        last_doc = collection.document(after).get()
        if not last_doc.exists:
            raise HTTPException(status_code=400, detail="Cursor không hợp lệ")
        query = query.start_after(last_doc)

    docs = list(query.stream())
    page = docs[:limit]
    return {
        "destinations": [serialize_destination(doc) for doc in page],
        "returned_count": len(page),
        "next_cursor": page[-1].id if len(docs) > limit else None,
    }


@app.get("/admin/destinations/{destination_id}")
def get_destination(
    destination_id: str = Path(**DESTINATION_ID),
    admin: dict = Depends(require_admin),
):
    _, snapshot = get_existing_destination(destination_id)
    return serialize_destination(snapshot)


# ========================= C - CREATE =========================
@app.post("/admin/destinations", status_code=201)
def create_destination(
    destination: DestinationCreate,
    admin: dict = Depends(require_admin),
):
    data = destination.model_dump()
    data.update({
        "is_active": True,
        "created_at": firestore.SERVER_TIMESTAMP,
        "updated_at": firestore.SERVER_TIMESTAMP,
        "rag_sync_status": "pending",
        "rag_sync_operation": "upsert",
    })

    try:
        destination_ref(destination.destination_id).create(data)
    except (Conflict, AlreadyExists) as exc:
        raise HTTPException(status_code=409, detail="Destination ID đã tồn tại") from exc

    return {
        "message": "Đã thêm địa điểm",
        "destination_id": destination.destination_id,
        "rag_sync_status": "pending",
    }


# ========================= U - UPDATE =========================
@app.patch("/admin/destinations/{destination_id}")
def update_destination(
    changes: DestinationUpdate,
    destination_id: str = Path(**DESTINATION_ID),
    admin: dict = Depends(require_admin),
):
    ref, snapshot = get_existing_destination(destination_id)
    old_data = snapshot.to_dict() or {}
    if old_data.get("is_active", True) is False:
        raise HTTPException(status_code=409, detail="Địa điểm đang ẩn; hãy khôi phục trước")

    updates = changes.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Chưa gửi trường cần cập nhật")
    for required in ("name", "province", "category"):
        if required in updates and not updates[required]:
            raise HTTPException(status_code=422, detail=f"{required} không được để trống")

    updates.update({
        "updated_at": firestore.SERVER_TIMESTAMP,
        "rag_sync_status": "pending",
        "rag_sync_operation": "upsert",
    })
    try:
        ref.update(updates)
    except NotFound as exc:
        raise HTTPException(status_code=404, detail="Địa điểm không còn tồn tại") from exc

    return {"message": "Đã cập nhật địa điểm", "destination_id": destination_id,
            "rag_sync_status": "pending"}


# ========================= D - DELETE (XÓA MỀM) =========================
@app.delete("/admin/destinations/{destination_id}")
def delete_destination(
    destination_id: str = Path(**DESTINATION_ID),
    admin: dict = Depends(require_admin),
):
    ref, snapshot = get_existing_destination(destination_id)
    if (snapshot.to_dict() or {}).get("is_active", True) is False:
        return {"message": "Địa điểm đã được ẩn", "destination_id": destination_id}

    # Không xóa cứng để còn lưu bản ghi và chờ xóa vector khỏi ChromaDB.
    ref.update({
        "is_active": False,
        "updated_at": firestore.SERVER_TIMESTAMP,
        "rag_sync_status": "pending",
        "rag_sync_operation": "delete",
    })
    return {"message": "Đã ẩn địa điểm (xóa mềm)", "destination_id": destination_id,
            "rag_sync_status": "pending"}


# ========================= KHÔI PHỤC =========================
@app.post("/admin/destinations/{destination_id}/restore")
def restore_destination(
    destination_id: str = Path(**DESTINATION_ID),
    admin: dict = Depends(require_admin),
):
    ref, _ = get_existing_destination(destination_id)
    ref.update({
        "is_active": True,
        "updated_at": firestore.SERVER_TIMESTAMP,
        "rag_sync_status": "pending",
        "rag_sync_operation": "upsert",
    })
    return {"message": "Đã khôi phục địa điểm", "destination_id": destination_id,
            "rag_sync_status": "pending"}
