import haLong from "./assets/figma/ha-long.png";
import hoiAn from "./assets/figma/hoi-an.png";
import daLat from "./assets/figma/da-lat.png";
import phuQuoc from "./assets/figma/phu-quoc.png";
import globe from "./assets/figma/globe.png";
import plane from "./assets/figma/plane.png";

const FEATURES = [
  { image: hoiAn, place: "Hội An", label: "01 · KHÁM PHÁ", title: "Tìm điểm đến hợp gu", description: "Từ một kỳ nghỉ bên biển đến hành trình khám phá văn hóa, luôn có nơi dành cho bạn.", prompt: "Gợi ý những điểm đến ở Việt Nam phù hợp với sở thích của tôi." },
  { image: daLat, place: "Đà Lạt", label: "02 · LÊN KẾ HOẠCH", title: "Lịch trình theo nhịp của bạn", description: "Sắp xếp thời gian, điểm đến và trải nghiệm thành một hành trình nhẹ nhàng.", prompt: "Giúp tôi lên lịch trình du lịch Đà Lạt cuối tuần." },
  { image: phuQuoc, place: "Phú Quốc", label: "03 · CHỦ ĐỘNG", title: "Ngân sách trong tầm tay", description: "Dự trù các khoản chi để bạn tận hưởng chuyến đi một cách thoải mái hơn.", prompt: "Giúp tôi dự trù chi phí cho chuyến đi Phú Quốc." },
];

export default function HomePage({ onStart, onLogin, signedIn }) {
  return (
    <>
      <main className="dora-home">
        <img className="dora-home-globe" src={globe} alt="" aria-hidden="true" />
        <div className="dora-home-plane" aria-hidden="true"><img src={plane} alt="" /></div>
        <div className="dora-home-content">
          <section className="dora-hero" aria-labelledby="welcome-title">
            <div className="dora-hero-copy">
              <p className="dora-eyebrow">CHÀO BẠN, NGƯỜI ĐỒNG HÀNH</p>
              <h1 id="welcome-title">Đi đâu cũng được,<br />có Dora đồng hành.</h1>
              <p className="dora-hero-description">Khám phá điểm đến, lên lịch trình và dự trù chi phí.<br />Mọi ý tưởng bắt đầu từ một cuộc trò chuyện.</p>
              <div className="dora-hero-actions">
                <button className="dora-btn dora-btn-warm" onClick={() => onStart()}>Bắt đầu lên kế hoạch</button>
                <button className="dora-btn dora-btn-peach" onClick={signedIn ? () => onStart() : onLogin}>{signedIn ? "Trò chuyện cùng Dora" : "Tạo tài khoản"}</button>
              </div>
            </div>
            <figure className="dora-hero-destination">
              <img src={haLong} alt="Làn nước xanh ngọc và các đảo đá tại Vịnh Hạ Long" />
              <figcaption><h2>Vịnh Hạ Long</h2><p>Biển ngọc, núi đá và những ngày thảnh thơi.</p></figcaption>
            </figure>
          </section>
          <section className="dora-features" aria-labelledby="features-title">
            <div className="dora-section-heading"><h2 id="features-title">Một trợ lý, nhiều cách khám phá</h2><p>Bạn chọn điều muốn làm. Dora giúp bạn bắt đầu.</p></div>
            <div className="dora-feature-grid">
              {FEATURES.map((feature) => (
                <button className="dora-feature-card" key={feature.place} onClick={() => onStart(feature.prompt)}>
                  <div className={`dora-feature-image ${feature.place === "Phú Quốc" ? "is-phu-quoc" : ""}`}><img src={feature.image} alt={feature.place} /><span>{feature.place}</span></div>
                  <div className="dora-feature-copy"><p className="dora-feature-label">{feature.label}</p><h3>{feature.title}</h3><p>{feature.description}</p></div>
                </button>
              ))}
            </div>
          </section>
          <section className="dora-home-cta"><div><h2>Ý tưởng cho chuyến đi tiếp theo?</h2><p>Kể Dora nghe nơi bạn muốn đến và điều bạn muốn trải nghiệm.</p></div><button className="dora-btn dora-btn-primary" onClick={() => onStart()}>Trò chuyện ngay <span aria-hidden="true">→</span></button></section>
        </div>
      </main>
      <footer className="dora-footer"><strong>Dora</strong><p>Hành trình của bạn, theo cách của bạn.</p></footer>
    </>
  );
}
