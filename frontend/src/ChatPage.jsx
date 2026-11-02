import { useEffect, useImperativeHandle, useRef, useState } from "react";
import globe from "./assets/figma/globe.png";
import compass from "./assets/figma/compass.png";
import historyDaNang from "./assets/figma/history-da-nang.svg";
import historyDaLat from "./assets/figma/history-da-lat.svg";
import historyPhuQuoc from "./assets/figma/history-phu-quoc.svg";
import TravelAnswer from "./TravelAnswer";
import { canShowAnswerNotice, personalizedQuestion } from "./settings";
import "./ChatPage.css";

const DEFAULT_QUESTION = "Bạn có thể gợi ý địa điểm du lịch ở Đà Nẵng không?";

const EXAMPLES = [
  { label: "Lên lịch trình du lịch", question: "Giúp tôi lên lịch trình du lịch Việt Nam." },
  { label: "Khám phá điểm đến", question: "Gợi ý những điểm đến thú vị ở Việt Nam." },
  { label: "Dự trù chi phí", question: "Giúp tôi dự trù chi phí cho chuyến du lịch." },
];
const makeSessionId = () => crypto.randomUUID();
const normalize = (text) => String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase();

function historyImage(title) {
  const value = normalize(title);
  if (value.includes("da nang") || value.includes("my khe")) return historyDaNang;
  if (value.includes("da lat")) return historyDaLat;
  if (value.includes("phu quoc")) return historyPhuQuoc;
  return null;
}

function formatTime(value, settings) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  if (settings?.travelSaved) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: settings.timeZone }).formatToParts(date).map((part) => [part.type, part.value]));
    const day = settings.dateFormat === "YYYY-MM-DD" ? `${parts.year}-${parts.month}-${parts.day}` : settings.dateFormat === "MM/DD/YYYY" ? `${parts.month}/${parts.day}/${parts.year}` : `${parts.day}/${parts.month}/${parts.year}`;
    return `${day} · ${parts.hour}:${parts.minute}`;
  }
  return new Intl.DateTimeFormat("vi-VN", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

export default function ChatPage({ onRequest, initialQuestion = "", settings, ref }) {
  const [sessionId, setSessionId] = useState(makeSessionId);
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState(initialQuestion || DEFAULT_QUESTION);
  const [busy, setBusy] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [answerNotice, setAnswerNotice] = useState(false);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  const bottomRef = useRef(null);
  const composerRef = useRef(null);
  const drawerRef = useRef(null);
  const selectionVersion = useRef(0);
  const requestPending = useRef(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      try {
        const data = await onRequest("/conversations");
        if (!cancelled) setConversations(data.conversations || []);
      } catch (err) {
        if (!cancelled) setError(`Không tải được lịch sử chat: ${err.message}`);
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    }
    initialize();
    return () => { cancelled = true; selectionVersion.current += 1; };
  }, [onRequest]);

  useEffect(() => {
    if (messages.length || busy) bottomRef.current?.scrollIntoView({ behavior: settings?.reduceMotion ? "auto" : "smooth", block: "nearest" });
  }, [messages, busy, settings?.reduceMotion]);

  const locked = busy || loadingList || loadingMessages;
  const hasThread = messages.length > 0 || loadingMessages;
  const activeChat = conversations.find((chat) => chat.id === sessionId);
  const title = activeChat?.title || messages.find((message) => message.role === "user")?.text || "Hành trình của bạn";
  const filtered = conversations.filter((chat) => normalize(chat.title).includes(normalize(search)));

  const newChat = (prompt = "") => {
    if (locked || requestPending.current) return;
    selectionVersion.current += 1;
    setSessionId(makeSessionId());
    setMessages([]);
    setQuestion(prompt || DEFAULT_QUESTION);
    setError("");
    setSearch("");
    setAnswerNotice(false);
    drawerRef.current?.close();
    composerRef.current?.focus();
  };
  useImperativeHandle(ref, () => ({ newChat }));

  const openChat = async (id) => {
    if (locked || requestPending.current) return;
    drawerRef.current?.close();
    if (id === sessionId && messages.length > 0) return;
    const version = ++selectionVersion.current;
    setSessionId(id);
    setMessages([]);
    setQuestion("");
    setError("");
    setAnswerNotice(false);
    setLoadingMessages(true);
    try {
      const data = await onRequest(`/conversations/${encodeURIComponent(id)}/messages`);
      if (selectionVersion.current === version) setMessages(data.messages || []);
    } catch (err) {
      if (selectionVersion.current === version) setError(`Không mở được cuộc trò chuyện: ${err.message}`);
    } finally {
      if (selectionVersion.current === version) setLoadingMessages(false);
    }
  };

  const deleteChat = async (id) => {
    if (locked || requestPending.current) return;
    if (!window.confirm("Xóa cuộc trò chuyện này và toàn bộ tin nhắn?")) return;
    requestPending.current = true;
    setBusy(true);
    setError("");
    try {
      await onRequest(`/conversations/${encodeURIComponent(id)}`, { method: "DELETE" });
      setConversations((old) => old.filter((chat) => chat.id !== id));
      if (sessionId === id) {
        selectionVersion.current += 1;
        setSessionId(makeSessionId());
        setMessages([]);
        setQuestion("");
      }
    } catch (err) {
      setError(`Không xóa được cuộc trò chuyện: ${err.message}`);
    } finally {
      requestPending.current = false;
      setBusy(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    const prompt = question.trim();
    if (!prompt || locked || requestPending.current) return;
    requestPending.current = true;
    setError("");
    setQuestion("");
    setAnswerNotice(false);
    const pendingId = makeSessionId();
    const version = selectionVersion.current;
    setMessages((old) => [...old, { id: pendingId, role: "user", text: prompt }]);
    setBusy(true);
    try {
      const data = await onRequest("/chat", { method: "POST", data: { question: prompt, session_id: sessionId } });
      if (version !== selectionVersion.current) return;
      setMessages((old) => [
        ...old.map((message) => message.id === pendingId ? { ...message, id: data.user_message_id || message.id } : message),
        { id: data.assistant_message_id || makeSessionId(), role: "assistant", text: data.answer },
      ]);
      setAnswerNotice(canShowAnswerNotice(settings));
      try {
        const result = await onRequest("/conversations");
        if (version === selectionVersion.current) setConversations(result.conversations || []);
      } catch (historyErr) {
        if (version === selectionVersion.current) setError(`Tin nhắn đã lưu nhưng chưa cập nhật danh sách: ${historyErr.message}`);
      }
    } catch (err) {
      if (version === selectionVersion.current) {
        setMessages((old) => old.filter((message) => message.id !== pendingId));
        setQuestion(prompt);
        setError(`Không gửi/lưu được tin nhắn: ${err.message}`);
      }
    } finally {
      requestPending.current = false;
      setBusy(false);
      composerRef.current?.focus();
    }
  };

  const historyRows = (drawer = false) => (
    <div className="dora-history-list">
      {loadingList && <p className="dora-history-empty" role="status">Đang tải lịch sử…</p>}
      {!loadingList && filtered.length === 0 && <p className="dora-history-empty">{search ? "Không tìm thấy cuộc trò chuyện phù hợp." : "Chưa có cuộc trò chuyện. Hãy bắt đầu hành trình đầu tiên cùng Dora."}</p>}
      {filtered.map((chat) => {
        const thumbnail = drawer && historyImage(chat.title);
        return (
          <div className={`dora-history-row ${sessionId === chat.id ? "is-active" : ""}`} key={chat.id}>
            <button type="button" className="dora-history-open" onClick={() => openChat(chat.id)} disabled={locked} aria-current={sessionId === chat.id ? "true" : undefined}>
              {drawer && <span className="dora-history-thumbnail">{thumbnail ? <img src={thumbnail} alt="" /> : <span className="dora-history-letter">D</span>}</span>}
              <span className="dora-history-copy"><strong>{chat.title || "Cuộc trò chuyện"}</strong><span>{chat.last_message || "Tiếp tục hành trình cùng Dora."}</span>{drawer && <time dateTime={chat.updated_at}>{formatTime(chat.updated_at, settings)}</time>}</span>
              {!drawer && <time dateTime={chat.updated_at}>{formatTime(chat.updated_at, settings)}</time>}
            </button>
            <button type="button" className="dora-history-delete" onClick={() => deleteChat(chat.id)} disabled={locked} aria-label={`Xóa ${chat.title || "cuộc trò chuyện"}`} title="Xóa cuộc trò chuyện">×</button>
          </div>
        );
      })}
    </div>
  );

  return (
    <section className={`dora-chat-page ${hasThread ? "is-conversation" : "is-start"} ${(settings?.theme === "dark" || (settings?.theme === "system" && systemDark)) ? "is-dark" : ""} text-${settings?.fontSize || "medium"} ${settings?.reduceMotion ? "has-reduced-motion" : ""}`} aria-label="Trò chuyện với Dora">
      <div className="dora-chat-decoration" aria-hidden="true"><img src={globe} alt="" /></div>
      {!hasThread ? <div className="dora-chat-intro"><p className="dora-eyebrow">DORA · TRỢ LÝ DU LỊCH AI</p><h1>Mỗi chuyến đi, một câu chuyện.</h1><p>Cùng Dora khám phá điểm đến và lên kế hoạch cho hành trình của riêng bạn.</p></div> : <div className="dora-chat-titlebar"><div><p className="dora-eyebrow">TRÒ CHUYỆN CÙNG DORA</p><h1>{title}</h1></div><button className="dora-btn dora-btn-light" onClick={() => drawerRef.current?.showModal()}>Lịch sử trò chuyện</button></div>}
      <div className="dora-chat-card">
        <div className="dora-chat-head"><strong>{hasThread ? "Dora AI  ·  Trợ lý cho hành trình của bạn" : "Bắt đầu hành trình mới"}</strong>{hasThread && <span className="dora-chat-live"><span />{busy ? "Đang tìm thông tin" : "Đang hoạt động"}</span>}</div>
        {!hasThread ? <div className="dora-chat-welcome"><h2>Bạn muốn đi đâu tiếp theo?</h2><p>Một điểm đến mới, một chuyến nghỉ ngơi hay một ý tưởng đang chờ bạn.</p><div className="dora-chat-examples">{EXAMPLES.map((example) => <button key={example.label} type="button" disabled={locked} onClick={() => { setQuestion(personalizedQuestion(example.question, settings)); composerRef.current?.focus(); }}>{example.label}<span aria-hidden="true">→</span></button>)}</div></div> : <div className="dora-chat-thread" role="log" aria-label="Tin nhắn" aria-live="polite" aria-busy={busy || loadingMessages}>
          {loadingMessages && <p className="dora-chat-loading">Đang mở cuộc trò chuyện…</p>}
          {messages.map((message) => <div key={message.id} className={`dora-chat-message dora-chat-message-${message.role}`}>
            {message.role === "assistant" && <span className="dora-chat-mini-avatar" aria-hidden="true">D</span>}
            <div className="dora-chat-message-content">{message.role === "assistant" && <strong className="dora-chat-speaker">Dora</strong>}{message.role === "assistant" ? <TravelAnswer text={message.text || ""} /> : <div className="dora-chat-bubble">{message.text}</div>}</div>
          </div>)}
          {busy && <div className="dora-chat-message dora-chat-message-assistant"><span className="dora-chat-mini-avatar" aria-hidden="true">D</span><div><strong className="dora-chat-speaker">Dora</strong><p className="dora-chat-thinking">Dora đang tìm thông tin du lịch<span className="dora-typing-dots">…</span></p></div></div>}
          <div ref={bottomRef} />
        </div>}
        {error && <div className="dora-chat-error" role="alert">{error}</div>}
        <form className="dora-chat-compose" onSubmit={submit}>
          <textarea ref={composerRef} value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
          }} placeholder={hasThread ? "Bạn muốn Dora điều chỉnh lịch trình như thế nào?" : "Bạn muốn đi đâu? Hãy kể Dora nghe..."} aria-label="Nhập câu hỏi" rows={hasThread ? 2 : 1} maxLength={2000} disabled={locked} />
          <div className="dora-compose-footer"><span>Enter để gửi <span aria-hidden="true">·</span> Shift + Enter để xuống dòng</span><button type="submit" disabled={locked || !question.trim()}>Gửi <span aria-hidden="true">→</span></button></div>
        </form>
      </div>
      {!hasThread && settings?.showHistory !== false && <section className="dora-history-panel" aria-labelledby="history-title"><div className="dora-history-heading"><h2 id="history-title">Lịch sử trò chuyện</h2><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm trong lịch sử..." aria-label="Tìm trong lịch sử" /></div>{historyRows()}<img className="dora-history-compass" src={compass} alt="" aria-hidden="true" /></section>}
      {answerNotice && <div className="dora-chat-answer-notice" role="status"><span>Dora đã trả lời câu hỏi của bạn.</span><button type="button" aria-label="Đóng thông báo câu trả lời" onClick={() => setAnswerNotice(false)}>×</button></div>}
      <p className="dora-chat-disclaimer">Dora có thể mắc lỗi. Hãy kiểm tra thông tin quan trọng trước chuyến đi.</p>
      <dialog ref={drawerRef} className="dora-history-drawer" aria-labelledby="drawer-title" onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
        <div className="dora-drawer-content"><div className="dora-dialog-heading"><h2 id="drawer-title">Lịch sử trò chuyện</h2><button className="dora-icon-button" onClick={() => drawerRef.current.close()} aria-label="Đóng lịch sử">×</button></div><p>Tiếp tục hành trình từ nơi bạn đã dừng lại.</p><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm trong lịch sử..." aria-label="Tìm cuộc trò chuyện" /><button className="dora-btn dora-btn-primary" disabled={locked} onClick={() => newChat()}>+ Cuộc trò chuyện mới</button><p className="dora-eyebrow">GẦN ĐÂY</p>{historyRows(true)}<p className="dora-drawer-foot">Lịch sử được lưu trong tài khoản của bạn.</p></div>
      </dialog>
    </section>
  );
}
