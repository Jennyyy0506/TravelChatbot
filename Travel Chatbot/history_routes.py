"""Dora chat history routes (FastAPI + Firebase Admin SDK).

All chat reads/writes are server-side after Firebase ID-token authentication.
Messages are saved together with conversation metadata in an atomic batch.
LangGraph receives previously saved conversation history at *every* request,
so context is reconstructed after a server restart (no RAM checkpointer needed).
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import firestore
from google.cloud.firestore_v1.base_query import FieldFilter
from pydantic import BaseModel, ConfigDict, Field

logger = logging.getLogger(__name__)


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    question: str = Field(min_length=1, max_length=2000)
    session_id: str = Field(min_length=36, max_length=36)


def _session_uuid(value: str) -> str:
    try:
        parsed = UUID(value)
        if parsed.version != 4 or str(parsed) != value.lower():
            raise ValueError("Not a canonical UUID4")
        return str(parsed)
    except (TypeError, ValueError, AttributeError) as exc:
        raise HTTPException(status_code=422, detail="Mã cuộc trò chuyện không hợp lệ") from exc


def _iso(value) -> str | None:
    return value.isoformat() if value is not None else None


def create_history_router(db, get_current_user):
    """Dependency-injected router; import in existing auth_api.py without circular imports."""
    router = APIRouter()
    conversations = db.collection("conversations")

    def _owned_conversation(session_id: str, uid: str, allow_missing=False):
        ref = conversations.document(_session_uuid(session_id))
        snap = ref.get()
        if snap.exists and (snap.to_dict() or {}).get("user_id") != uid:
            # Don't reveal whether another user's conversation exists.
            raise HTTPException(status_code=404, detail="Không tìm thấy cuộc trò chuyện")
        if not snap.exists and not allow_missing:
            raise HTTPException(status_code=404, detail="Không tìm thấy cuộc trò chuyện")
        return ref, snap

    def _recent_messages(ref, limit=16):
        # DESC first to avoid truncating long chats to their earliest messages.
        snapshots = list(ref.collection("messages")
                         .order_by("created_at", direction=firestore.Query.DESCENDING)
                         .limit(limit).stream())
        snapshots.reverse()
        return snapshots

    @router.get("/conversations")
    def list_conversations(user: dict = Depends(get_current_user)):
        # Only equality filter: no composite Firestore index required for this demo.
        docs = conversations.where(filter=FieldFilter("user_id", "==", user["uid"])) \
                            .limit(100).stream()
        items = []
        for snap in docs:
            data = snap.to_dict() or {}
            items.append({
                "id": snap.id,
                "title": data.get("title", "Cuộc trò chuyện"),
                "created_at": _iso(data.get("created_at")),
                "updated_at": _iso(data.get("updated_at")),
            })
        items.sort(key=lambda item: item.get("updated_at") or "", reverse=True)
        return {"conversations": items}

    @router.get("/conversations/{session_id}/messages")
    def get_messages(session_id: str, user: dict = Depends(get_current_user)):
        ref, _ = _owned_conversation(session_id, user["uid"])
        messages = []
        for snap in _recent_messages(ref, limit=200):
            data = snap.to_dict() or {}
            if data.get("role") not in ("user", "assistant"):
                continue
            messages.append({
                "id": snap.id,
                "role": data["role"],
                "text": data.get("content", ""),
                "created_at": _iso(data.get("created_at")),
            })
        return {"session_id": ref.id, "messages": messages}

    @router.post("/chat")
    def chat(payload: ChatRequest, user: dict = Depends(get_current_user)):
        ref, snapshot = _owned_conversation(payload.session_id, user["uid"], allow_missing=True)
        prompt = payload.question.strip()
        if not prompt:
            raise HTTPException(status_code=422, detail="Câu hỏi không được rỗng")

        try:
            from langchain_core.messages import AIMessage, HumanMessage
            from rag.chatbot import ask_chatbot

            # Restore *saved* history each request: persists context across restarts.
            history = []
            for snap in _recent_messages(ref, limit=16) if snapshot.exists else []:
                data = snap.to_dict() or {}
                content = str(data.get("content") or "")
                if data.get("role") == "user":
                    history.append(HumanMessage(content=content))
                elif data.get("role") == "assistant":
                    history.append(AIMessage(content=content))
            answer = ask_chatbot(prompt, history=history)
            if not isinstance(answer, str) or not answer.strip():
                raise RuntimeError("Empty response from Agentic RAG")
        except Exception as exc:
            logger.exception("Dora RAG failed")
            raise HTTPException(status_code=503, detail="Dora chưa trả lời được. Kiểm tra Gemini API và log backend.") from exc

        # Both messages and the parent conversation are committed atomically.
        now = datetime.now(timezone.utc)
        messages = ref.collection("messages")
        human_ref, ai_ref = messages.document(), messages.document()
        batch = db.batch()
        if snapshot.exists:
            batch.update(ref, {"updated_at": firestore.SERVER_TIMESTAMP})
        else:
            batch.set(ref, {
                "user_id": user["uid"],
                "title": prompt[:65],
                "created_at": firestore.SERVER_TIMESTAMP,
                "updated_at": firestore.SERVER_TIMESTAMP,
            })
        batch.set(human_ref, {
            "role": "user", "content": prompt,
            "created_at": now,
        })
        batch.set(ai_ref, {
            "role": "assistant", "content": answer,
            "created_at": now + timedelta(microseconds=1),
        })
        try:
            batch.commit()
        except Exception as exc:
            logger.exception("Firestore save failed")
            raise HTTPException(status_code=503, detail="Chưa lưu được tin nhắn lên Firestore. Hãy gửi lại.") from exc
        return {
            "session_id": ref.id, "answer": answer,
            "user_message_id": human_ref.id, "assistant_message_id": ai_ref.id,
            "saved": True,
        }

    @router.delete("/conversations/{session_id}")
    def delete_conversation(session_id: str, user: dict = Depends(get_current_user)):
        ref, _ = _owned_conversation(session_id, user["uid"])
        # Delete subcollection docs explicitly (Firestore parent deletion isn't recursive).
        while True:
            docs = list(ref.collection("messages").limit(200).stream())
            if not docs:
                break
            batch = db.batch()
            for doc in docs:
                batch.delete(doc.reference)
            batch.commit()
        ref.delete()
        return {"deleted": True, "session_id": ref.id}

    return router
