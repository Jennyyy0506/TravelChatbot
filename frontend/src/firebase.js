
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCyNo-azsXGSptEq5lTtVYVMBqUdwnKHtw",
  authDomain: "travelchatbotvlu.firebaseapp.com",
  projectId: "travelchatbotvlu",
  storageBucket: "travelchatbotvlu.firebasestorage.app",
  messagingSenderId: "560728723206",
  appId: "1:560728723206:web:b66e80796cd4f21f539887",
  measurementId: "G-Q55LXPGBL4"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
