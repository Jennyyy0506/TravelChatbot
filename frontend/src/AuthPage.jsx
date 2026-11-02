import { useRef, useState } from "react";
import globe from "./assets/figma/auth-globe.png";
import plane from "./assets/figma/auth-plane.png";
import daLat from "./assets/figma/register-da-lat.png";
import eye from "./assets/figma/password-eye.svg";
import "./AuthPage.css";

export default function AuthPage({ mode, busy, error, info, onSubmit, onGoogleLogin, onSwitch }) {
  const registering = mode === "register";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [validation, setValidation] = useState("");
  const nameRef = useRef(null);
  const confirmationRef = useRef(null);

  const submit = (event) => {
    event.preventDefault();
    if (busy) return;
    setValidation("");
    if (registering && !name.trim()) {
      setValidation("Vui lòng nhập họ và tên của bạn.");
      nameRef.current?.focus();
      return;
    }
    if (registering && password !== confirmation) {
      setValidation("Mật khẩu xác nhận chưa trùng khớp.");
      confirmationRef.current?.focus();
      return;
    }
    onSubmit({ name: name.trim(), email: email.trim(), password });
  };

  return (
    <div className={`dora-auth-page ${registering ? "is-register" : "is-login"}`}>
      <main className="dora-auth-main">
        <div className="dora-auth-plane" aria-hidden="true"><img src={plane} alt="" /></div>
        <div className="dora-auth-globe" aria-hidden="true"><img src={globe} alt="" /></div>
        <div className="dora-auth-grid">
          <section className="dora-auth-welcome" aria-label="Cảm hứng hành trình">
            <p className="dora-auth-eyebrow">ĐIỂM KHỞI ĐẦU CỦA NHỮNG ĐIỀU MỚI</p>
            <h2>Khám phá thế giới,<br />theo cách của bạn.</h2>
            <figure><img src={daLat} alt="Những ngôi nhà giữa rừng thông Đà Lạt" /><figcaption>Đà Lạt · Một khoảng xanh để nghỉ ngơi</figcaption></figure>
          </section>
          <section className="dora-auth-card" aria-labelledby="auth-title">
            <h1 id="auth-title">{registering ? "Tạo tài khoản mới." : "Chào mừng trở lại."}</h1>
            <p className="dora-auth-description">{registering ? "Bắt đầu lưu giữ những hành trình của riêng bạn." : "Đăng nhập để tiếp tục hành trình cùng Dora."}</p>
            {(validation || error) && <p className="dora-auth-error" role="alert">{validation || error}</p>}
            {info && <p className="dora-auth-info" role="status">{info}</p>}
            <form onSubmit={submit}>
              <fieldset disabled={busy}>
                <legend className="dora-sr-only">{registering ? "Thông tin đăng ký" : "Thông tin đăng nhập"}</legend>
                <div className="dora-auth-fields">
                  {registering && <label className="dora-auth-field"><span>Họ và tên</span><input ref={nameRef} name="name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Nhập họ và tên của bạn" maxLength={100} required /></label>}
                  <label className="dora-auth-field"><span>Email</span><input name="email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></label>
                  <label className="dora-auth-field"><span>Mật khẩu</span><span className="dora-password-input"><input name="password" type={showPassword ? "text" : "password"} autoComplete={registering ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={registering ? "Tạo mật khẩu tối thiểu 8 ký tự" : "Nhập mật khẩu của bạn"} minLength={registering ? 8 : undefined} maxLength={4096} required /><button type="button" aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"} aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)}><img src={eye} alt="" /></button></span></label>
                  {registering && <label className="dora-auth-field"><span>Xác nhận mật khẩu</span><span className="dora-password-input"><input ref={confirmationRef} name="confirmation" type={showConfirmation ? "text" : "password"} autoComplete="new-password" value={confirmation} onChange={(event) => { setConfirmation(event.target.value); setValidation(""); }} placeholder="Nhập lại mật khẩu" minLength={8} maxLength={4096} aria-invalid={!!validation && password !== confirmation} required /><button type="button" aria-label={showConfirmation ? "Ẩn mật khẩu xác nhận" : "Hiện mật khẩu xác nhận"} aria-pressed={showConfirmation} onClick={() => setShowConfirmation((visible) => !visible)}><img src={eye} alt="" /></button></span></label>}
                </div>
                {registering && <><p className="dora-password-hint">Gợi ý: kết hợp chữ, số và ký tự đặc biệt.</p><label className="dora-auth-consent"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} required /><span>Tôi đồng ý với Điều khoản và Chính sách riêng tư.</span></label></>}
                <button type="submit" className="dora-btn dora-btn-primary dora-auth-submit">{busy ? (registering ? "Đang tạo tài khoản…" : "Đang đăng nhập…") : (registering ? "Tạo tài khoản" : "Đăng nhập")}</button>
                {!registering && <button type="button" className="dora-btn dora-btn-light dora-auth-google" onClick={onGoogleLogin}>Tiếp tục với Google</button>}
              </fieldset>
            </form>
            <p className="dora-auth-switch">{registering ? "Đã có tài khoản?" : "Bạn chưa có tài khoản?"}<button type="button" onClick={onSwitch} disabled={busy}>{registering ? "Đăng nhập" : "Đăng ký"}</button></p>
          </section>
        </div>
      </main>
      <footer className="dora-footer"><strong>Dora</strong><p>Hành trình của bạn, theo cách của bạn.</p></footer>
    </div>
  );
}
