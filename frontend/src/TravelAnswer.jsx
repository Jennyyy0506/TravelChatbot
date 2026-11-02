import { useState } from "react";
import myKhe from "./assets/figma/my-khe.svg";
import hoiAn from "./assets/figma/hoi-an-illustration.svg";
import sonTra from "./assets/figma/son-tra.svg";

function InlineText({ text }) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => part.startsWith("**") ? <strong key={index}>{part.slice(2, -2)}</strong> : part);
}

function Paragraphs({ text }) {
  return text.split(/\n{2,}/).filter(Boolean).map((paragraph, index) => <p key={index}><InlineText text={paragraph} /></p>);
}

function splitItinerary(text) {
  const headings = [...text.matchAll(/^[ \t]*(?:#{1,4}\s*)?(?:\*\*)?(Ngày\s+\d+[^\n]*)$/gim)];
  if (headings.length < 2 || headings.length > 7) return null;
  return {
    intro: text.slice(0, headings[0].index).trim(),
    days: headings.map((heading, index) => {
      const body = text.slice(heading.index + heading[0].length, headings[index + 1]?.index ?? text.length).trim();
      const title = heading[1].replace(/\*\*/g, "").trim();
      const place = `${title} ${body}`;
      const image = /mỹ khê/i.test(place) ? myKhe : /hội an/i.test(place) ? hoiAn : /sơn trà/i.test(place) ? sonTra : null;
      return { title, body, image };
    }),
  };
}

export default function TravelAnswer({ text }) {
  const [copyStatus, setCopyStatus] = useState("");
  const itinerary = splitItinerary(text);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopyStatus("Đã sao chép"); }
    catch { setCopyStatus("Chưa sao chép được. Bạn có thể chọn và sao chép nội dung."); }
  };
  return (
    <div className="dora-answer">
      {itinerary ? <><div className="dora-answer-text"><Paragraphs text={itinerary.intro} /></div><div className="dora-itinerary-grid">{itinerary.days.map((day, index) => <article className={`dora-itinerary-card ${day.image ? "has-image" : ""}`} key={index}>{day.image && <div className="dora-itinerary-image"><img src={day.image} alt="" /></div>}<div><p className="dora-itinerary-day">NGÀY {String(index + 1).padStart(2, "0")}</p><h3>{day.title.replace(/^Ngày\s+\d+\s*[:·.\-–—]?\s*/i, "") || day.title}</h3><div className="dora-answer-text"><Paragraphs text={day.body} /></div></div></article>)}</div></> : <div className="dora-answer-text"><Paragraphs text={text} /></div>}
      <div className="dora-answer-actions"><button type="button" onClick={copy}>Sao chép</button><span role="status">{copyStatus}</span></div>
    </div>
  );
}
