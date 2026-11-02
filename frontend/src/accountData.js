import { updateProfile } from "firebase/auth";
import { collection, deleteDoc, doc, getDocFromServer, getDocsFromServer, getFirestore, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { app, auth } from "./firebase";

const db = getFirestore(app);

function currentUser(user) {
  if (!user?.uid || auth.currentUser?.uid !== user.uid) throw new Error("Phiên đăng nhập đã thay đổi. Vui lòng đăng nhập lại.");
  return auth.currentUser;
}

function text(value, max, label, required = false) {
  const result = typeof value === "string" ? value.trim() : "";
  if (required && !result) throw new Error(`Vui lòng nhập ${label}.`);
  if (result.length > max) throw new Error(`${label} không được quá ${max} ký tự.`);
  return result;
}

export function accountError(error) {
  if (error?.message && !error.code) return error.message;
  const code = error?.code?.replace(/^firestore\//, "");
  if (code === "permission-denied") return "Firebase chưa cấp quyền cho thao tác này. Cần cho phép tài khoản đọc và sửa dữ liệu của chính mình trong Firestore Rules.";
  if (code === "not-found") return "Chưa tìm thấy dữ liệu trên Firebase. Hãy tải lại trang rồi thử lại.";
  if (["unauthenticated", "auth/user-token-expired", "auth/requires-recent-login"].includes(code)) return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  if (["unavailable", "deadline-exceeded", "auth/network-request-failed"].includes(code)) return "Chưa kết nối được với Firebase. Kiểm tra mạng rồi thử lại.";
  return "Chưa hoàn tất được yêu cầu với Firebase. Vui lòng thử lại.";
}

export async function loadAccount(user) {
  const signedIn = currentUser(user);
  const snapshot = await getDocFromServer(doc(db, "users", signedIn.uid));
  currentUser(user);
  if (!snapshot.exists()) throw new Error("Chưa có hồ sơ trên Firebase. Vui lòng tải lại hồ sơ tài khoản rồi thử lại.");
  const data = snapshot.data();
  return Object.fromEntries(["phone", "hometown", "bio"].map((key) => [key, typeof data[key] === "string" ? data[key] : ""]));
}

export async function saveAccount(user, values) {
  const signedIn = currentUser(user);
  const fields = { display_name: text(values.display_name, 100, "tên hiển thị", true) };
  // Omit unread fields so a failed profile read cannot erase existing contact data.
  for (const [key, max, label] of [["phone", 30, "số điện thoại"], ["hometown", 120, "nơi ở"], ["bio", 500, "giới thiệu"]]) {
    if (Object.hasOwn(values, key)) fields[key] = text(values[key], max, label);
  }
  const nameChanged = signedIn.displayName !== fields.display_name;
  if (nameChanged) await updateProfile(signedIn, { displayName: fields.display_name });
  try {
    currentUser(user);
    // Update only editable profile fields; never send role, uid or email.
    await updateDoc(doc(db, "users", signedIn.uid), { ...fields, updated_at: serverTimestamp() });
  } catch (error) {
    if (nameChanged) throw new Error(`Tên đã cập nhật trong Firebase Authentication, nhưng hồ sơ Firestore chưa đồng bộ. ${accountError(error)}`, { cause: error });
    throw error;
  }
  return fields;
}

function favoritesCollection(user) {
  currentUser(user);
  return collection(db, "favorites");
}

function favoriteDoc(user, id) {
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error("Mã điểm yêu thích chưa hợp lệ.");
  return doc(favoritesCollection(user), id);
}

export function createFavoriteId(user) {
  return doc(favoritesCollection(user)).id;
}

export async function loadFavorites(user) {
  const ownedPlaces = query(favoritesCollection(user), where("user_id", "==", currentUser(user).uid));
  const snapshot = await getDocsFromServer(ownedPlaces);
  currentUser(user);
  return snapshot.docs.map((entry) => {
    const data = entry.data();
    return { id: entry.id, name: typeof data.name === "string" ? data.name : "Điểm đến", location: typeof data.location === "string" ? data.location : "", note: typeof data.note === "string" ? data.note : "", createdAt: data.created_at?.toMillis?.() || 0 };
  }).sort((a, b) => b.createdAt - a.createdAt || a.name.localeCompare(b.name, "vi"));
}

export async function saveFavorite(user, draft) {
  const reference = favoriteDoc(user, draft.id);
  const fields = { name: text(draft.name, 120, "tên điểm đến", true), location: text(draft.location, 120, "tỉnh / thành phố"), note: text(draft.note, 2000, "ghi chú") };
  if (draft.isNew) await setDoc(reference, { ...fields, user_id: currentUser(user).uid, created_at: serverTimestamp(), updated_at: serverTimestamp() });
  else await updateDoc(reference, { ...fields, updated_at: serverTimestamp() });
  currentUser(user);
  return { id: draft.id, ...fields };
}

export async function removeFavorite(user, id) {
  await deleteDoc(favoriteDoc(user, id));
  currentUser(user);
}
