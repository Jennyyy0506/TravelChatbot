import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from "firebase/auth";
import { auth } from "./firebase";
import "./App.css";
import ChatPage from "./ChatPage";
import HomePage from "./HomePage";
import AuthPage from "./AuthPage";
import "./Site.css";

const SettingsPage = lazy(() => import("./SettingsPage"));

const API_BASE = "/api";

const FIELDS = [
  { key: "destination_id", label: "Mã địa điểm", required: true },
  { key: "name", label: "Tên địa điểm", required: true },
  { key: "province", label: "Tỉnh / thành phố", required: true },
  { key: "category", label: "Loại địa điểm", required: true },
  { key: "district", label: "Quận / huyện" },
  { key: "address", label: "Địa chỉ" },
  { key: "latitude", label: "Vĩ độ", type: "number" },
  { key: "longitude", label: "Kinh độ", type: "number" },
  { key: "description", label: "Mô tả", multiline: true },
  { key: "activities", label: "Hoạt động" },
  { key: "best_time", label: "Thời điểm thích hợp" },
  { key: "duration", label: "Thời lượng tham quan" },
  { key: "opening_hours", label: "Giờ mở cửa" },
  { key: "ticket_price", label: "Giá vé (giữ đúng thông tin nguồn)" },
  { key: "facilities", label: "Tiện ích" },
  { key: "source", label: "Nguồn dữ liệu" },
  { key: "image_url", label: "URL hình ảnh" },
];

const blankForm = () => Object.fromEntries(FIELDS.map(({ key }) => [key, ""]));

function toForm(place) {
  return Object.fromEntries(
    FIELDS.map(({ key }) => [key, place?.[key] == null ? "" : String(place[key])])
  );
}

function toPayload(form) {
  const result = {};
  for (const { key, type } of FIELDS) {
    const value = form[key]?.trim() ?? "";
    if (type === "number") {
      result[key] = value === "" ? null : Number(value);
    } else {
      result[key] = value === "" ? null : value;
    }
  }
  // Các trường bắt buộc đã được form kiểm tra.
  return result;
}

function normalize(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

function extractError(body, fallback) {
  if (typeof body?.detail === "string") return body.detail;
  if (Array.isArray(body?.detail)) {
    return body.detail.map((e) => e.msg).join("; ");
  }
  return fallback;
}

function authErrorMessage(error) {
  const messages = {
    "auth/email-already-in-use": "Email này đã được sử dụng. Bạn có thể chuyển sang Đăng nhập.",
    "auth/invalid-email": "Địa chỉ email chưa đúng. Vui lòng kiểm tra lại.",
    "auth/weak-password": "Mật khẩu chưa đủ mạnh. Hãy dùng ít nhất 8 ký tự, kết hợp chữ, số và ký tự đặc biệt.",
    "auth/password-does-not-meet-requirements": "Mật khẩu chưa đáp ứng yêu cầu. Hãy kết hợp chữ hoa, chữ thường, số và ký tự đặc biệt.",
    "auth/invalid-credential": "Email hoặc mật khẩu chưa đúng. Vui lòng thử lại.",
    "auth/wrong-password": "Email hoặc mật khẩu chưa đúng. Vui lòng thử lại.",
    "auth/user-not-found": "Email hoặc mật khẩu chưa đúng. Vui lòng thử lại.",
    "auth/user-disabled": "Tài khoản này đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên.",
    "auth/too-many-requests": "Có quá nhiều lần thử. Vui lòng đợi một lúc rồi thử lại.",
    "auth/network-request-failed": "Không kết nối được với dịch vụ đăng nhập. Vui lòng kiểm tra mạng rồi thử lại.",
    "auth/operation-not-allowed": "Phương thức này chưa được bật. Vui lòng liên hệ quản trị viên để bật đăng nhập bằng email và mật khẩu.",
    "auth/popup-blocked": "Trình duyệt đang chặn cửa sổ Google. Hãy cho phép cửa sổ bật lên rồi thử lại.",
    "auth/unauthorized-domain": "Địa chỉ trang web này chưa được cho phép đăng nhập. Vui lòng liên hệ quản trị viên.",
  };
  return messages[error.code] || "Chưa hoàn tất được yêu cầu. Vui lòng thử lại sau.";
}

async function request(path, { method = "GET", data } = {}) {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Phiên đăng nhập không còn hiệu lực.");

  const token = await currentUser.getIdToken();
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(data !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(extractError(body, `Lỗi máy chủ HTTP ${response.status}`));
  }
  return body;
}

function DestinationForm({ mode, form, setForm, onCancel, onSubmit, saving }) {
  const editing = mode === "edit";
  return (
    <section className="dora-form-panel" aria-label="Biểu mẫu địa điểm">
      <div className="dora-form-head">
        <div>
          <h3>{editing ? "Chỉnh sửa địa điểm" : "Thêm địa điểm mới"}</h3>
          <p>{editing ? "Chỉ thay đổi những thông tin cần thiết." : "Nhập thông tin địa điểm muốn bổ sung vào Firestore."}</p>
        </div>
        <button type="button" className="dora-btn dora-btn-light" onClick={onCancel} disabled={saving}>Đóng</button>
      </div>
      <form onSubmit={onSubmit}>
        <div className="dora-field-grid">
          {FIELDS.map((field) => (
            <label className={`dora-field ${field.multiline ? "dora-field-wide" : ""}`} key={field.key}>
              <span>{field.label}{field.required && <em> *</em>}</span>
              {field.multiline ? (
                <textarea
                  rows={4}
                  value={form[field.key]}
                  onChange={(event) => setForm((old) => ({ ...old, [field.key]: event.target.value }))}
                  placeholder="Nhập mô tả chi tiết"
                />
              ) : (
                <input
                  type={field.type === "number" ? "number" : "text"}
                  step={field.type === "number" ? "any" : undefined}
                  value={form[field.key]}
                  onChange={(event) => setForm((old) => ({ ...old, [field.key]: event.target.value }))}
                  required={field.required}
                  disabled={editing && field.key === "destination_id"}
                  pattern={field.key === "destination_id" ? "[A-Za-z0-9_-]+" : undefined}
                  placeholder={field.key === "destination_id" ? "VD: VN-HCM-251" : ""}
                />
              )}
            </label>
          ))}
        </div>
        <div className="dora-form-actions">
          <button type="button" className="dora-btn dora-btn-light" onClick={onCancel} disabled={saving}>Hủy</button>
          <button className="dora-btn dora-btn-primary" type="submit" disabled={saving}>
            {saving ? "Đang lưu..." : editing ? "Lưu thay đổi" : "Thêm địa điểm"}
          </button>
        </div>
      </form>
    </section>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [places, setPlaces] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [formMode, setFormMode] = useState(null);
  const [form, setForm] = useState(blankForm);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [activePage, setActivePage] = useState("home");
  const [seedPrompt, setSeedPrompt] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [authInfo, setAuthInfo] = useState("");
  const chatRef = useRef(null);  const profileVersion = useRef(0);
  const registrationPending = useRef(false);
  const authPending = useRef(false);

  const loadProfile = useCallback(async (currentUser) => {
    const currentRequestId = ++profileVersion.current;
    setUser(currentUser);
    setProfile(null);
    setPlaces([]);
    setLoaded(false);
    setError("");
    setAuthLoading(true);
    if (!currentUser) {
      setAuthLoading(false);
      return;
    }
    if (registrationPending.current) return;
    try {
      const data = await request("/auth/sync", { method: "POST" });
      if (currentRequestId === profileVersion.current) setProfile(data);
    } catch (err) {
      if (currentRequestId === profileVersion.current) setError(`Không tải được hồ sơ: ${err.message}`);
    } finally {
      if (currentRequestId === profileVersion.current) setAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      loadProfile,
      (err) => {
        setError(err.message);
        setAuthLoading(false);
      }
    );
    return () => { profileVersion.current += 1; unsubscribe(); };
  }, [loadProfile]);

  const loadPlaces = useCallback(async () => {
    setListLoading(true);
    setError("");
    try {
      // Dataset Dora khoảng 250 địa điểm: tải từng trang 100 và tìm kiếm tại frontend.
      const all = [];
      let cursor = null;
      for (let page = 0; page < 20; page += 1) {
        const path = `/admin/destinations?limit=100${cursor ? `&after=${encodeURIComponent(cursor)}` : ""}`;
        const result = await request(path);
        all.push(...result.destinations);
        cursor = result.next_cursor;
        if (!cursor) break;
        if (page === 19) throw new Error("Số trang quá lớn, chưa tải hết dữ liệu.");
      }
      setPlaces(all);
      setLoaded(true);
    } catch (err) {
      setError(`Không tải được danh sách: ${err.message}`);
    } finally {
      setListLoading(false);
    }
  }, []);

  const filteredPlaces = useMemo(() => {
    const keyword = normalize(search.trim());
    return places.filter((p) => {
      if (!showInactive && p.is_active === false) return false;
      return !keyword || [p.name, p.province, p.category, p.id, p.district]
        .some((field) => normalize(field).includes(keyword));
    });
  }, [places, search, showInactive]);

  const startCreate = () => {
    setNotice(""); setError(""); setForm(blankForm()); setFormMode("create");
  };
  const startEdit = (place) => {
    setNotice(""); setError(""); setForm(toForm(place)); setFormMode("edit");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submitForm = async (event) => {
    event.preventDefault();
    setError(""); setNotice(""); setSaving(true);
    try {
      const data = toPayload(form);
      if (!["name", "province", "category"].every((key) => data[key])) {
        throw new Error("Vui lòng nhập tên, tỉnh/thành và loại địa điểm.");
      }
      if (!formMode) return;
      if (formMode === "create") {
        await request("/admin/destinations", { method: "POST", data });
        setNotice("Đã thêm địa điểm vào Firestore. ChromaDB đang chờ đồng bộ.");
      } else {
        const id = form.destination_id;
        const updates = { ...data };
        delete updates.destination_id;
        await request(`/admin/destinations/${encodeURIComponent(id)}`, { method: "PATCH", data: updates });
        setNotice("Đã lưu thay đổi vào Firestore. ChromaDB đang chờ đồng bộ.");
      }
      setFormMode(null);
      await loadPlaces();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const changeVisibility = async (place, restore = false) => {
    const message = restore
      ? `Khôi phục địa điểm “${place.name}”?`
      : `Ẩn địa điểm “${place.name}”? Đây là xóa mềm: Firestore vẫn giữ bản ghi và ChromaDB chưa được đồng bộ.`;
    if (!window.confirm(message)) return;
    setError(""); setNotice(""); setBusyId(place.id);
    try {
      const url = `/admin/destinations/${encodeURIComponent(place.id)}`;
      await request(restore ? `${url}/restore` : url, { method: restore ? "POST" : "DELETE" });
      setNotice(restore ? "Đã khôi phục địa điểm." : "Đã ẩn địa điểm (xóa mềm). Chờ đồng bộ RAG.");
      await loadPlaces();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId("");
    }
  };

  const login = async () => {
    if (authPending.current) return;
    authPending.current = true;
    setError("");
    setAuthInfo("");
    setLoggingIn(true);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());      setActivePage("chat");
    } catch (err) {
      if (err.code === "auth/popup-closed-by-user" || err.code === "auth/cancelled-popup-request") {
        setAuthInfo("Cửa sổ Google đã đóng trước khi hoàn tất. Bạn có thể thử lại hoặc đăng nhập bằng email.");
      } else setError(authErrorMessage(err));
    }
    finally { authPending.current = false; setLoggingIn(false); }
  };

  const register = async ({ name, email, password }) => {
    if (authPending.current) return;
    authPending.current = true;
    registrationPending.current = true;
    setLoggingIn(true);
    setError("");
    setAuthInfo("");
    let registeredUser = null;
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      registeredUser = result.user;
      await updateProfile(registeredUser, { displayName: name });
      await registeredUser.getIdToken(true);
      registrationPending.current = false;
      await loadProfile(registeredUser);
      setActivePage("chat");
    } catch (err) {
      registrationPending.current = false;
      if (registeredUser) {
        await loadProfile(registeredUser);
        setError((previous) => [previous, "Tài khoản đã được tạo, nhưng chưa cập nhật được họ tên. Bạn không cần đăng ký lại."].filter(Boolean).join(" "));
        setActivePage("chat");
      } else setError(authErrorMessage(err));
    } finally {
      registrationPending.current = false;
      authPending.current = false;
      setLoggingIn(false);
    }
  };

  const loginWithEmail = async ({ email, password }) => {
    if (authPending.current) return;
    authPending.current = true;
    setLoggingIn(true);
    setError("");
    setAuthInfo("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
      setActivePage("chat");
    } catch (err) { setError(authErrorMessage(err)); }
    finally { authPending.current = false; setLoggingIn(false); }
  };

  const openAuth = (page) => {
    if (authPending.current) return;
    setError("");
    setAuthInfo("");
    setActivePage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const logout = async () => {
    setError("");
    try {
      await signOut(auth);      setActivePage("home");
    }
    catch (err) { setError(err.message); }
  };

  const openSettings = () => {
    setError("");
    setAuthInfo("");
    setActivePage("settings");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const updateAccount = async (values) => {
    const currentUser = auth.currentUser;
    if (!currentUser || currentUser.uid !== user?.uid) throw new Error("Vui lòng đăng nhập lại.");
    try {
      const { saveAccount } = await import("./accountData");
      const saved = await saveAccount(currentUser, values);
      if (auth.currentUser?.uid === currentUser.uid) setProfile((old) => old ? { ...old, ...saved } : old);
      return saved;
    } finally {
      if (auth.currentUser?.uid === currentUser.uid) setProfile((old) => old ? { ...old, display_name: currentUser.displayName || old.display_name } : old);
    }
  };

  const startChat = (prompt = "") => {
    setSeedPrompt(prompt);
    chatRef.current?.newChat(prompt);
    setActivePage("chat");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const displayName = user?.displayName || profile?.display_name || "Bạn";
  const initials = displayName.split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]).join("").toUpperCase();
  const isAuthPage = activePage === "register" || activePage === "login";

  return (
    <div className="dora-shell">
      <header className={`dora-topbar ${isAuthPage ? "is-auth" : ""}`}>
        <div className="dora-topbar-inner">
          <button className="dora-brand" onClick={() => setActivePage("home")} aria-label="Dora — Trang chủ"><span className="dora-brand-mark">D</span><span>Dora</span></button>
          {isAuthPage ? <button className="dora-auth-back" disabled={loggingIn} onClick={() => openAuth("home")}>← Về trang chủ</button> : <><nav className="dora-navigation" aria-label="Điều hướng chính">
            <button aria-current={activePage === "home" ? "page" : undefined} onClick={() => setActivePage("home")}>Trang chủ</button>
            <button aria-current={activePage === "chat" ? "page" : undefined} onClick={() => setActivePage("chat")}>Trò chuyện</button>
            <button aria-current={activePage === "settings" ? "page" : undefined} onClick={openSettings}>Cài đặt</button>
          </nav>
          <div className="dora-header-actions">
            {user ? <><button className="dora-btn dora-btn-light dora-new-chat" disabled={loggingIn || authLoading} onClick={() => startChat()}>+ Trò chuyện mới</button><button className="dora-account" onClick={openSettings} aria-label={`Tài khoản ${displayName}`}>{initials}</button></> : <><button className="dora-btn dora-btn-light" disabled={loggingIn || authLoading} onClick={() => openAuth("login")}>Đăng nhập</button><button className="dora-btn dora-btn-warm" disabled={loggingIn || authLoading} onClick={() => openAuth("register")}>Đăng ký</button></>}
          </div></>}
        </div>
      </header>

      {error && !isAuthPage && <div className="dora-global-alert dora-alert dora-alert-error" role="alert">{error}</div>}
      {authInfo && !isAuthPage && <div className="dora-global-alert dora-alert" role="status">{authInfo}</div>}
      {activePage === "home" && <HomePage onStart={startChat} onLogin={() => openAuth("register")} signedIn={!!user} />}
      {isAuthPage && <AuthPage key={activePage} mode={activePage} busy={loggingIn || authLoading} error={error} info={authInfo} onSubmit={activePage === "register" ? register : loginWithEmail} onGoogleLogin={login} onSwitch={() => openAuth(activePage === "register" ? "login" : "register")} />}
      {activePage === "settings" && <Suspense fallback={<div className="dora-content" role="status">Đang mở cài đặt…</div>}><SettingsPage key={user?.uid || "guest"} user={user} profile={profile} onUpdateProfile={updateAccount} onLogin={() => openAuth("login")} onLogout={logout} onOpenAdmin={() => { setActivePage("admin"); if (!loaded) loadPlaces(); }} /></Suspense>}
      <main className={`dora-content ${activePage === "chat" && profile ? "dora-content-chat" : ""}`} hidden={activePage === "home" || isAuthPage || activePage === "settings"}>
        {activePage === "admin" && <div className="dora-heading"><div><p className="dora-eyebrow">DORA / QUẢN TRỊ</p><h1>Quản lý địa điểm du lịch</h1><p>Cập nhật thông tin cho những hành trình mới.</p></div><button className="dora-btn dora-btn-light" onClick={() => setActivePage("chat")}>Quay lại trò chuyện</button></div>}
        {notice && activePage === "admin" && <div className="dora-alert dora-alert-success" role="status">{notice}</div>}

        {authLoading && <section className="dora-panel"><p>Đang kiểm tra và đồng bộ tài khoản…</p></section>}
        {!authLoading && !user && (
          <section className="dora-panel dora-center dora-login-panel"><span className="dora-login-mark">D</span><p className="dora-eyebrow">CHÀO MỪNG ĐẾN VỚI DORA</p><h1>Mỗi chuyến đi, một câu chuyện.</h1>
            <p>Đăng nhập để cùng Dora khám phá và lưu lại hành trình của bạn.</p>
            <button className="dora-btn dora-btn-primary" disabled={loggingIn} onClick={login}>{loggingIn ? "Đang đăng nhập…" : "Tiếp tục với Google"}</button></section>
        )}
        {!authLoading && user && !profile && (
          <section className="dora-panel"><p>Bạn đã đăng nhập nhưng chưa tải được hồ sơ. Kiểm tra kết nối rồi thử lại.</p><button className="dora-btn dora-btn-primary" onClick={() => loadProfile(auth.currentUser)}>Thử tải lại hồ sơ</button></section>
        )}
        {!authLoading && profile?.role !== "admin" && profile && activePage === "admin" && (
          <section className="dora-panel dora-center"><h2>Xin chào, {profile.display_name || "bạn"}!</h2>
            <p>Tài khoản của bạn có quyền <strong>user</strong>. Chức năng quản lý địa điểm chỉ dành cho Admin.</p></section>
        )}

        {!authLoading && profile && <div hidden={activePage !== "chat"}><ChatPage key={user.uid} ref={chatRef} onRequest={request} initialQuestion={seedPrompt} /></div>}
        {!authLoading && profile?.role === "admin" && activePage === "admin" && (
          <>
            <section className="dora-overview">
              <div className="dora-stat"><span>Tổng bản ghi đã tải</span><strong>{places.length}</strong><small>Firestore · destinations</small></div>
              <div className="dora-stat"><span>Đang hiển thị</span><strong>{filteredPlaces.length}</strong><small>Theo tìm kiếm & bộ lọc</small></div>
              <div className="dora-stat"><span>Đã ẩn</span><strong>{places.filter((p) => p.is_active === false).length}</strong><small>Có thể khôi phục</small></div>
            </section>

            {formMode && <DestinationForm mode={formMode} form={form} setForm={setForm} onSubmit={submitForm}
              onCancel={() => setFormMode(null)} saving={saving} />}

            <section className="dora-panel">
              <div className="dora-toolbar">
                <div><h2>Danh sách địa điểm</h2><p>Thêm, sửa hoặc ẩn địa điểm bằng quyền Admin.</p></div>
                <div className="dora-toolbar-buttons">
                  <button className="dora-btn dora-btn-light" onClick={loadPlaces} disabled={listLoading}>{listLoading ? "Đang tải..." : "↻ Tải lại"}</button>
                  <button className="dora-btn dora-btn-primary" onClick={startCreate}>+ Thêm địa điểm</button>
                </div>
              </div>
              <div className="dora-filters">
                <label className="dora-search"><span className="dora-sr-only">Tìm địa điểm</span>
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo tên, tỉnh, loại hoặc mã..." /></label>
                <label className="dora-checkbox"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Hiện địa điểm đã ẩn</label>
              </div>
              <div className="dora-table-wrap">
                <table className="dora-table"><thead><tr><th>Địa điểm</th><th>Tỉnh / thành</th><th>Loại</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
                  <tbody>
                    {filteredPlaces.map((place) => (
                      <tr key={place.id}>
                        <td><strong>{place.name || "(Chưa có tên)"}</strong><small>{place.id}</small></td>
                        <td>{place.province || "—"}</td><td>{place.category || "—"}</td>
                        <td><span className={`dora-status ${place.is_active === false ? "dora-status-off" : ""}`}>
                          {place.is_active === false ? "Đã ẩn" : "Đang sử dụng"}</span></td>
                        <td className="dora-actions">
                          {place.is_active === false ? (
                            <button className="dora-btn dora-btn-sm" disabled={!!busyId} onClick={() => changeVisibility(place, true)}>Khôi phục</button>
                          ) : (
                            <><button className="dora-btn dora-btn-sm" onClick={() => startEdit(place)} disabled={!!busyId}>Sửa</button>
                              <button className="dora-btn dora-btn-sm dora-btn-danger" onClick={() => changeVisibility(place)} disabled={!!busyId}>Ẩn</button></>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {listLoading && <p className="dora-empty">Đang tải dữ liệu từ Firestore...</p>}
                {!listLoading && loaded && filteredPlaces.length === 0 && <p className="dora-empty">Không có địa điểm nào phù hợp.</p>}
              </div>
              <p className="dora-note">Thao tác thêm/sửa/ẩn chỉ cập nhật Firestore. ChromaDB chưa tự đồng bộ; không dùng kết quả chatbot để kiểm chứng CRUD lúc này.</p>
            </section>
          </>
        )}
      </main>

    </div>
  );
}

export default App;
