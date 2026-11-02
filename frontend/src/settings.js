export const TRAVEL_INTERESTS = ["Biển và nghỉ dưỡng", "Thiên nhiên", "Văn hóa và lịch sử", "Khám phá ẩm thực"];

const DEFAULTS = {
  phone: "", language: "vi", currency: "VND", dateFormat: "DD/MM/YYYY", timeZone: "Asia/Ho_Chi_Minh",
  interests: [], budget: "Cân bằng", pace: "Thoải mái", travelSaved: false,
  theme: "light", fontSize: "medium", reduceMotion: false, showHistory: true,
  answerNotice: true, quietStart: "22:00", quietEnd: "07:00", personalize: true,
};

export const settingsKey = (uid) => `dora:settings:v1:${uid || "guest"}`;

export function readSettings(uid) {
  let stored;
  try { stored = JSON.parse(localStorage.getItem(settingsKey(uid)) || "{}"); }
  catch { stored = {}; }
  const result = { ...DEFAULTS, interests: [] };
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return result;
  for (const key of Object.keys(DEFAULTS)) {
    if (typeof stored[key] === typeof DEFAULTS[key] && key !== "interests") result[key] = stored[key];
  }
  if (Array.isArray(stored.interests)) result.interests = TRAVEL_INTERESTS.filter((interest) => stored.interests.includes(interest));
  if (!["light", "dark", "system"].includes(result.theme)) result.theme = "light";
  if (!["small", "medium", "large"].includes(result.fontSize)) result.fontSize = "medium";
  if (!["Asia/Ho_Chi_Minh", "Asia/Bangkok", "Asia/Tokyo", "UTC"].includes(result.timeZone)) result.timeZone = DEFAULTS.timeZone;
  if (!["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"].includes(result.dateFormat)) result.dateFormat = DEFAULTS.dateFormat;
  if (!["VND", "USD", "EUR"].includes(result.currency)) result.currency = "VND";
  for (const key of ["quietStart", "quietEnd"]) if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(result[key])) result[key] = DEFAULTS[key];
  result.phone = result.phone.slice(0, 30);
  result.language = "vi";
  return result;
}

export function saveSettings(uid, settings) {
  localStorage.setItem(settingsKey(uid), JSON.stringify(settings));
}

export function personalizedQuestion(question, settings) {
  if (!settings?.personalize || !settings.travelSaved) return question;
  const details = [settings.interests.length ? `Sở thích: ${settings.interests.join(", ")}.` : "", `Ngân sách: ${settings.budget}. Nhịp độ: ${settings.pace}. Dự trù chi phí bằng ${settings.currency}.`];
  return [question, ...details.filter(Boolean)].join("\n");
}

export function canShowAnswerNotice(settings, date = new Date()) {
  if (!settings?.answerNotice) return false;
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: settings.timeZone }).format(date);
  const { quietStart: start, quietEnd: end } = settings;
  const quiet = start === end ? false : start < end ? time >= start && time < end : time >= start || time < end;
  return !quiet;
}
