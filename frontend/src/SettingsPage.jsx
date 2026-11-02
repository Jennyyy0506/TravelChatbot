import { useEffect, useRef, useState } from "react";
import { accountError, createFavoriteId, loadAccount, loadFavorites, removeFavorite, saveFavorite } from "./accountData";
import "./SettingsPage.css";

function Panel({ title, description, children, className = "" }) {
  return <section className={`dora-settings-panel ${className}`}><div className="dora-settings-panel-heading"><h2>{title}</h2><p>{description}</p></div>{children}</section>;
}

function Field({ label, multiline = false, ...props }) {
  return <label className="dora-settings-field"><span>{label}</span>{multiline ? <textarea aria-label={label} {...props} /> : <input aria-label={label} {...props} />}</label>;
}

function Feedback({ message, error = false }) {
  return message && <p className={`dora-settings-feedback ${error ? "is-error" : ""}`} role={error ? "alert" : "status"}>{message}</p>;
}

function Account({ user, profile, onUpdateProfile, onOpenAdmin, busy, setBusy }) {
  const [name, setName] = useState(user.displayName || profile?.display_name || "");
  const [details, setDetails] = useState({ phone: "", hometown: "", bio: "" });
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [failed, setFailed] = useState(false);
  const pending = useRef(false);
  useEffect(() => {
    let cancelled = false;
    loadAccount(user).then((data) => {
      if (!cancelled) { setDetails(data); setLoaded(true); }
    }).catch((error) => { if (!cancelled) setLoadError(accountError(error)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user, retry]);
  const reload = () => { setLoading(true); setLoaded(false); setLoadError(""); setRetry((value) => value + 1); };
  const set = (key, value) => { setDetails((old) => ({ ...old, [key]: value })); setFeedback(""); };
  const save = async (event) => {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true; setBusy(true); setFeedback(""); setFailed(false);
    try {
      await onUpdateProfile({ display_name: name, ...(loaded ? details : {}) });
      setName(name.trim());
      setFeedback(loaded ? "Đã cập nhật thông tin tài khoản trên Firebase." : "Đã cập nhật tên trên Firebase. Thông tin liên hệ được giữ nguyên.");
    } catch (error) { setFailed(true); setFeedback(accountError(error)); }
    finally { pending.current = false; setBusy(false); }
  };
  const displayName = user.displayName || profile?.display_name || "Bạn";
  const initials = displayName.split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]).join("").toUpperCase();
  return <form onSubmit={save}>
    <Panel title="Thông tin tài khoản" description="Một chút về bạn, cho những hành trình sắp tới.">
      <div className="dora-settings-profile"><span className="dora-settings-avatar">{user.photoURL ? <img src={user.photoURL} alt="" /> : initials}</span><div><strong>{displayName}</strong><p>{user.email}</p></div></div>
      {loading && <p className="dora-settings-note" role="status">Đang tải thông tin từ Firebase…</p>}
      {loadError && <div className="dora-settings-load-error"><Feedback message={loadError} error /><button type="button" className="dora-settings-text-button" disabled={busy} onClick={reload}>Thử tải lại thông tin</button></div>}
      <div className="dora-settings-field-grid">
        <Field label="Tên hiển thị" autoComplete="name" value={name} onChange={(event) => { setName(event.target.value); setFeedback(""); }} placeholder="Tên mọi người gọi bạn" maxLength={100} disabled={busy || loading} required />
        <Field label="Email đăng nhập" type="email" autoComplete="email" value={user.email || ""} readOnly />
        <Field label="Số điện thoại liên hệ" type="tel" autoComplete="tel" value={details.phone} onChange={(event) => set("phone", event.target.value)} placeholder="Thêm số điện thoại" maxLength={30} disabled={busy || !loaded || loading} />
        <Field label="Nơi ở" autoComplete="address-level2" value={details.hometown} onChange={(event) => set("hometown", event.target.value)} placeholder="Tỉnh / thành phố của bạn" maxLength={120} disabled={busy || !loaded || loading} />
        <div className="dora-settings-field-wide"><Field label="Giới thiệu ngắn" multiline rows={3} value={details.bio} onChange={(event) => set("bio", event.target.value)} placeholder="Bạn thích khám phá những điều gì?" maxLength={500} disabled={busy || !loaded || loading} /></div>
      </div>
      <p className="dora-settings-note">Email dùng để đăng nhập. Số điện thoại là thông tin liên hệ, không thay đổi phương thức đăng nhập.</p>
      {profile?.role === "admin" && <button type="button" className="dora-settings-text-button" disabled={busy} onClick={onOpenAdmin}>Quản lý địa điểm</button>}
    </Panel>
    <div className="dora-settings-save"><p>Thông tin được lưu theo tài khoản của bạn.</p><button type="submit" className="dora-btn dora-btn-primary" disabled={busy || loading}>{busy ? "Đang cập nhật…" : "Cập nhật tài khoản"}</button></div>
    <Feedback message={feedback} error={failed} />
  </form>;
}

function Favorites({ user, busy, setBusy }) {
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [draft, setDraft] = useState(null);
  const [feedback, setFeedback] = useState("");
  const [failed, setFailed] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const pending = useRef(false);
  useEffect(() => {
    let cancelled = false;
    loadFavorites(user).then((data) => { if (!cancelled) setPlaces(data); })
      .catch((error) => { if (!cancelled) setLoadError(accountError(error)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user, retry]);
  const startNew = () => {
    try { setDraft({ id: createFavoriteId(user), name: "", location: "", note: "", isNew: true }); setFeedback(""); setDeleting(null); }
    catch (error) { setFailed(true); setFeedback(accountError(error)); }
  };
  const edit = (place) => { setDraft({ ...place, isNew: false }); setFeedback(""); setDeleting(null); };
  const set = (key, value) => { setDraft((old) => ({ ...old, [key]: value })); setFeedback(""); };
  const save = async (event) => {
    event.preventDefault();
    if (!draft || pending.current) return;
    pending.current = true; setBusy(true); setFeedback(""); setFailed(false);
    try {
      const saved = await saveFavorite(user, draft);
      setPlaces((old) => draft.isNew ? [{ ...saved, createdAt: Date.now() }, ...old] : old.map((place) => place.id === saved.id ? { ...place, ...saved } : place));
      setDraft(null); setFeedback(draft.isNew ? "Đã lưu điểm yêu thích trên Firebase." : "Đã cập nhật điểm đến và ghi chú trên Firebase.");
    } catch (error) { setFailed(true); setFeedback(accountError(error)); }
    finally { pending.current = false; setBusy(false); }
  };
  const remove = async (place) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setFeedback(""); setFailed(false);
    try { await removeFavorite(user, place.id); setPlaces((old) => old.filter((entry) => entry.id !== place.id)); setDeleting(null); setFeedback("Đã xóa điểm khỏi danh sách yêu thích."); }
    catch (error) { setFailed(true); setFeedback(accountError(error)); }
    finally { pending.current = false; setBusy(false); }
  };
  const reload = () => { setLoadError(""); setLoading(true); setRetry((value) => value + 1); };
  return <div>
    <Panel title="Điểm yêu thích" description="Giữ lại những nơi muốn đến, cùng ghi chú của riêng bạn.">
      {!draft && <div className="dora-favorites-toolbar"><p>{loading ? "Đang tải danh sách…" : loadError ? "Chưa tải được danh sách" : `${places.length} điểm đến đã lưu`}</p><button type="button" className="dora-btn dora-btn-primary" disabled={busy || loading || !!loadError} onClick={startNew}>+ Thêm điểm yêu thích</button></div>}
      {loading && <p className="dora-settings-note" role="status">Đang tải điểm yêu thích từ Firebase…</p>}
      {loadError && <div><Feedback message={loadError} error /><button type="button" className="dora-settings-text-button" disabled={busy} onClick={reload}>Thử tải lại danh sách</button></div>}
      {draft && <form key={draft.id} className="dora-favorite-form" onSubmit={save} aria-label={draft.isNew ? "Thêm điểm yêu thích" : "Chỉnh sửa điểm yêu thích"}>
        <h3>{draft.isNew ? "Một nơi bạn muốn đến" : "Chỉnh sửa điểm yêu thích"}</h3>
        <div className="dora-settings-field-grid"><Field label="Tên điểm đến" autoFocus value={draft.name} onChange={(event) => set("name", event.target.value)} placeholder="VD: Phố cổ Hội An" maxLength={120} disabled={busy} required /><Field label="Tỉnh / thành phố" value={draft.location} onChange={(event) => set("location", event.target.value)} placeholder="VD: Quảng Nam" maxLength={120} disabled={busy} /><div className="dora-settings-field-wide"><Field label="Ghi chú của bạn" multiline rows={4} value={draft.note} onChange={(event) => set("note", event.target.value)} placeholder="Quán muốn ghé, món muốn thử hay điều cần nhớ…" maxLength={2000} disabled={busy} /></div></div>
        <div className="dora-favorite-form-actions"><button type="button" className="dora-btn" disabled={busy} onClick={() => { setDraft(null); setFeedback(""); }}>Hủy</button><button type="submit" className="dora-btn dora-btn-primary" disabled={busy}>{busy ? "Đang lưu…" : draft.isNew ? "Lưu điểm yêu thích" : "Lưu thay đổi"}</button></div>
      </form>}
      {!loading && !loadError && !places.length && !draft && <div className="dora-favorites-empty"><span aria-hidden="true">♡</span><h3>Hành trình bắt đầu từ một nơi yêu thích</h3><p>Thêm điểm đến đầu tiên và ghi lại điều khiến bạn muốn ghé thăm.</p></div>}
      {!loading && !loadError && places.length > 0 && <div className="dora-favorites-list">{places.map((place) => <article className="dora-favorite-card" key={place.id}>
        <span className="dora-favorite-mark" aria-hidden="true">♥</span><div className="dora-favorite-copy"><h3>{place.name}</h3>{place.location && <p className="dora-favorite-location">{place.location}</p>}<p className={`dora-favorite-note ${place.note ? "" : "is-empty"}`}>{place.note || "Chưa có ghi chú. Thêm một điều bạn muốn nhớ nhé."}</p>
          {deleting === place.id ? <div className="dora-favorite-delete-confirm"><p>Xóa “{place.name}” khỏi điểm yêu thích?</p><button type="button" className="dora-settings-text-button" disabled={busy} onClick={() => setDeleting(null)}>Giữ lại</button><button type="button" className="dora-settings-text-button is-danger" disabled={busy} onClick={() => remove(place)}>{busy ? "Đang xóa…" : "Xác nhận xóa"}</button></div> : <div className="dora-favorite-actions"><button type="button" className="dora-settings-text-button" disabled={busy || !!draft} onClick={() => edit(place)} aria-label={`Chỉnh sửa ${place.name}`}>Chỉnh sửa ghi chú</button><button type="button" className="dora-settings-text-button is-danger" disabled={busy || !!draft} onClick={() => { setDeleting(place.id); setFeedback(""); }} aria-label={`Xóa ${place.name}`}>Xóa</button></div>}
        </div>
      </article>)}</div>}
    </Panel>
    <Feedback message={feedback} error={failed} />
  </div>;
}

export default function SettingsPage({ user, profile, onUpdateProfile, onLogin, onLogout, onOpenAdmin }) {
  const [tab, setTab] = useState("account");
  const [busy, setBusy] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const logout = async () => { if (logoutBusy) return; setLogoutBusy(true); try { await onLogout(); } finally { setLogoutBusy(false); } };
  return <div className="dora-settings-page"><main className="dora-settings-main"><h1>Cài đặt</h1><p className="dora-settings-subtitle">Thông tin của bạn và những điểm đến yêu thích.</p>
    <div className="dora-settings-workspace"><nav className="dora-settings-nav" aria-label="Các mục cài đặt">
      {[["account", "Tài khoản"], ["favorites", "Điểm yêu thích"]].map(([key, title]) => <button type="button" key={key} disabled={busy || logoutBusy} aria-current={tab === key ? "page" : undefined} onClick={() => setTab(key)}>{title}</button>)}
      <div className="dora-settings-nav-divider" /><button type="button" className="dora-settings-logout" disabled={busy || logoutBusy} onClick={user ? logout : onLogin}>{logoutBusy ? "Đang đăng xuất…" : user ? "Đăng xuất" : "Đăng nhập"}</button>
    </nav><div className="dora-settings-panels">{!user ? <Panel title={tab === "account" ? "Thông tin tài khoản" : "Điểm yêu thích"} description="Đăng nhập để cập nhật thông tin và lưu những điểm đến của riêng bạn."><button type="button" className="dora-btn dora-btn-primary" onClick={onLogin}>Đăng nhập</button></Panel> : tab === "account" ? <Account user={user} profile={profile} onUpdateProfile={onUpdateProfile} onOpenAdmin={onOpenAdmin} busy={busy} setBusy={setBusy} /> : <Favorites user={user} busy={busy} setBusy={setBusy} />}</div></div>
  </main><footer className="dora-footer"><strong>Dora</strong><p>Hành trình của bạn, theo cách của bạn.</p></footer></div>;
}
