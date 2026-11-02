import { useEffect, useRef, useState } from "react";
import "./ChatPage.css";

const EXAMPLES = [
  "Gợi ý 3 điểm tham quan ở TP. Hồ Chí Minh phù hợp gia đình",
  "Ở Cần Thơ có địa điểm du lịch nào?",
  "Cho tôi biết giá vé Địa đạo Củ Chi",
];
const makeSessionId = () => crypto.randomUUID();

export default function ChatPage({ onRequest }) {
  const [sessionId, setSessionId] = useState(makeSessionId);
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef(null);
  // Prevent stale requests from switching the chat when a user starts a new one.
  const selectionVersion = useRef(0);

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      try {
        const data = await onRequest("/conversations");
        if (cancelled) return;
        const list = data.conversations || [];
        setConversations(list);
        if (list.length) {
          const chatId = list[0].id;
          const version = ++selectionVersion.current;
          setSessionId(chatId);
          setLoadingMessages(true);
          const detail = await onRequest(`/conversations/${encodeURIComponent(chatId)}/messages`);
          if (!cancelled && version === selectionVersion.current) {
            setMessages(detail.messages || []);
          }
        }
      } catch (err) {
        if (!cancelled) setError(`Không tải được lịch sử chat: ${err.message}`);
      } finally {
        if (!cancelled) {
          setLoadingList(false);
          setLoadingMessages(false);
        }
      }
    }
    initialize();
    return () => { cancelled = true; selectionVersion.current += 1; };
  }, [onRequest]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, busy]);

  const locked = busy || loadingList || loadingMessages;

  const newChat = () => {
    if (locked) return;
    selectionVersion.current += 1;
    setSessionId(makeSessionId());
    setMessages([]);
    setQuestion("");
    setError("");
  };

  const openChat = async (id) => {
    if (locked || id === sessionId) return;
    const version = ++selectionVersion.current;
    setSessionId(id);
    setMessages([]);
    setError("");
    setLoadingMessages(true);
    try {
      const data = await onRequest(`/conversations/${encodeURIComponent(id)}/messages`);
      if (selectionVersion.current === version) setMessages(data.messages || []);
    } catch (err) {
      if (selectionVersion.current === version) {
        setError(`Không mở được cuộc trò chuyện: ${err.message}`);
      }
    } finally {
      if (selectionVersion.current === version) setLoadingMessages(false);
    }
  };

  const deleteChat = async (id) => {
    if (locked) return;
    if (!window.confirm("Xóa cuộc trò chuyện này và toàn bộ tin nhắn?")) return;
    setBusy(true);
    setError("");
    try {
      await onRequest(`/conversations/${encodeURIComponent(id)}`, { method: "DELETE" });
      const remaining = conversations.filter((c) => c.id !== id);
      setConversations(remaining);
      if (sessionId === id) {
        // Start a new (not-yet-saved) chat instead of returning deleted content.
        selectionVersion.current += 1;
        setSessionId(makeSessionId());
        setMessages([]);
      }
    } catch (err) {
      setError(`Không xóa được cuộc trò chuyện: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    const prompt = question.trim();
    if (!prompt || locked) return;
    setError("");
    setQuestion("");
    const pendingId = makeSessionId();
    setMessages((old) => [...old, { id: pendingId, role: "user", text: prompt }]);
    setBusy(true);
    try {
      const data = await onRequest("/chat", {
        method: "POST",
        data: { question: prompt, session_id: sessionId },
      });
      setMessages((old) => [
        ...old.map((m) => m.id === pendingId ? { ...m, id: data.user_message_id || m.id } : m),
        { id: data.assistant_message_id || makeSessionId(), role: "assistant", text: data.answer },
      ]);
      // Refresh sidebar, but never turn a successfully saved answer into an error.
      try {
        const result = await onRequest("/conversations");
        setConversations(result.conversations || []);
      } catch (historyErr) {
        setError(`Tin nhắn đã lưu nhưng chưa cập nhật danh sách: ${historyErr.message}`);
      }
    } catch (err) {
      // Request failed => don't pretend that the message was stored.
      setMessages((old) => old.filter((m) => m.id !== pendingId));
      setQuestion(prompt);
      setError(`Không gửi/lưu được tin nhắn: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="dora-chat-layout" aria-label="Trò chuyện với Dora">
      <aside className="dora-chat-side">
        <div className="dora-chat-side-title">🌿 Dora AI</div>
        <button type="button" className="dora-chat-new" onClick={newChat} disabled={locked}>
          ＋ Cuộc trò chuyện mới
        </button>
        <div className="dora-chat-side-caption">Lịch sử hội thoại</div>
        {loadingList && <p className="dora-chat-side-foot">Đang tải lịch sử…</p>}
        <div className="dora-chat-history-list">
          {conversations.map((chat) => (
            <div className="dora-chat-history-row" key={chat.id}>
              <button
                type="button"
                className={`dora-chat-side-item dora-chat-history-open ${sessionId === chat.id ? "is-active" : ""}`}
                onClick={() => openChat(chat.id)}
                disabled={locked}
                title={chat.title}
              >
                💬 {chat.title || "Cuộc trò chuyện"}
              </button>
              <button
                type="button"
                className="dora-chat-history-delete"
                onClick={() => deleteChat(chat.id)}
                disabled={locked}
                aria-label={`Xóa ${chat.title || "cuộc trò chuyện"}`}
                title="Xóa cuộc trò chuyện"
              >×</button>
            </div>
          ))}
        </div>
        <p className="dora-chat-side-foot">Cuộc trò chuyện và tin nhắn được lưu trong Firestore theo tài khoản Google của bạn.</p>
      </aside>

      <div className="dora-chat-main">
        <div className="dora-chat-head">
          <div className="dora-chat-avatar">✿</div>
          <div><strong>Dora Travel Assistant</strong><span>Khám phá Việt Nam theo cách của bạn</span></div>
          <div className="dora-chat-live"><span /> Firestore</div>
        </div>
        <div className="dora-chat-thread" aria-live="polite">
          {loadingMessages && <p className="dora-chat-loading">Đang mở cuộc trò chuyện…</p>}
          {!loadingMessages && messages.length === 0 && (
            <div className="dora-chat-welcome">
              <div className="dora-chat-welcome-symbol">🌏</div>
              <h2>Xin chào! Mình là Dora 🌸</h2>
              <p>Bạn muốn khám phá địa điểm nào tại Việt Nam? Dora sẽ tra cứu dữ liệu du lịch để tư vấn nhé.</p>
              <div className="dora-chat-examples">
                {EXAMPLES.map((example) => (
                  <button key={example} type="button" disabled={locked} onClick={() => setQuestion(example)}>{example}</button>
                ))}
              </div>
            </div>
          )}
          {messages.map((message) => (
            <div key={message.id} className={`dora-chat-message dora-chat-message-${message.role}`}>
              {message.role === "assistant" && <div className="dora-chat-mini-avatar">✿</div>}
              <div className="dora-chat-bubble">{message.text}</div>
            </div>
          ))}
          {busy && <div className="dora-chat-message dora-chat-message-assistant"><div className="dora-chat-mini-avatar">✿</div><div className="dora-chat-bubble dora-chat-thinking">Dora đang tìm thông tin du lịch…</div></div>}
          <div ref={bottomRef} />
        </div>
        {error && <div className="dora-chat-error" role="alert">{error}</div>}
        <form className="dora-chat-compose" onSubmit={submit}>
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Hỏi Dora về địa điểm du lịch Việt Nam..."
            aria-label="Nhập câu hỏi"
            rows={2}
            maxLength={2000}
            disabled={locked}
          />
          <button type="submit" disabled={locked || !question.trim()} aria-label="Gửi câu hỏi">➤</button>
        </form>
        <p className="dora-chat-disclaimer">Dora trả lời dựa trên dữ liệu RAG. Giá vé và giờ mở cửa cần xác minh từ nguồn chính thức.</p>
      </div>
    </section>
  );
}
