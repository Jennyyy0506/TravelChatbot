import { useCallback, useEffect, useMemo, useState } from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { auth } from "./firebase";
import "./App.css";
import ChatPage from "./ChatPage";

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
  const [activePage, setActivePage] = useState("chat");

  useEffect(() => {
    let requestId = 0;
    const unsubscribe = onAuthStateChanged(
      auth,
      async (currentUser) => {
        const currentRequestId = ++requestId;
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
        try {
          const data = await request("/auth/sync", { method: "POST" });
          if (currentRequestId === requestId) setProfile(data);
        } catch (err) {
          if (currentRequestId === requestId) setError(`Không đồng bộ được hồ sơ: ${err.message}`);
        } finally {
          if (currentRequestId === requestId) setAuthLoading(false);
        }
      },
      (err) => {
        setError(err.message);
        setAuthLoading(false);
      }
    );
    return () => { requestId += 1; unsubscribe(); };
  }, []);

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

  useEffect(() => {
    if (profile?.role === "admin") loadPlaces();
  }, [profile?.role, loadPlaces]);

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
        const { destination_id, ...updates } = data;
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
    setError("");
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (err) { setError(err.message); }
  };
  const logout = async () => {
    setError("");
    try { await signOut(auth); }
    catch (err) { setError(err.message); }
  };

  return (
    <div className="dora-shell">
      <header className="dora-topbar">
        <div className="dora-brand"><span className="dora-brand-mark">✿</span><span>Dora <small>Travel Chatbot</small></span></div>
        {user && <button type="button" onClick={logout} className="dora-btn dora-btn-light">Đăng xuất</button>}
      </header>

      <main className="dora-content">
        <div className="dora-heading">
          <div><div className="dora-eyebrow">DORA / {activePage === "chat" && profile ? "AI ASSISTANT" : "FIREBASE"}</div><h1>{activePage === "chat" && profile ? "Trợ lý du lịch Dora" : "Quản lý địa điểm du lịch"}</h1>
            <p>{activePage === "chat" && profile ? "Hỏi Dora về các địa điểm du lịch Việt Nam." : "Kiểm thử CRUD trên Firestore — giao diện quản trị tạm thời."}</p></div>
          {profile && <span className="dora-pill">{profile.role === "admin" ? "✦ Admin" : "User"}</span>}
        </div>

        {profile && (
          <nav className="dora-demo-nav" aria-label="Điều hướng Dora">
            <button type="button" className="dora-demo-tab" aria-current={activePage === "chat" ? "page" : undefined} onClick={() => setActivePage("chat")}>💬 Chat Dora</button>
            {profile.role === "admin" && <button type="button" className="dora-demo-tab" aria-current={activePage === "admin" ? "page" : undefined} onClick={() => setActivePage("admin")}>🗂️ Quản lý địa điểm</button>}
          </nav>
        )}
        {error && <div className="dora-alert dora-alert-error" role="alert">{error}</div>}
        {notice && <div className="dora-alert dora-alert-success" role="status">{notice}</div>}

        {authLoading && <section className="dora-panel"><p>Đang kiểm tra và đồng bộ tài khoản Google...</p></section>}
        {!authLoading && !user && (
          <section className="dora-panel dora-center"><h2>Chào mừng đến với Dora 🌸</h2>
            <p>Đăng nhập Google để tiếp tục.</p>
            <button className="dora-btn dora-btn-primary" onClick={login}>Đăng nhập bằng Google</button></section>
        )}
        {!authLoading && user && !profile && (
          <section className="dora-panel"><p>Đã đăng nhập Google nhưng chưa tải được hồ sơ Firestore. Kiểm tra backend tại localhost:8000.</p></section>
        )}
        {!authLoading && profile?.role !== "admin" && profile && activePage === "admin" && (
          <section className="dora-panel dora-center"><h2>Xin chào, {profile.display_name || "bạn"}!</h2>
            <p>Tài khoản của bạn có quyền <strong>user</strong>. Chức năng quản lý địa điểm chỉ dành cho Admin.</p></section>
        )}

        {!authLoading && profile && activePage === "chat" && <ChatPage onRequest={request} />}
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
