// Netaji Club Quiz — Firebase setup (Auth + Firestore only; no Cloud Functions / billing needed)
import {initializeApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import * as au from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import * as fs from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyCG85CidK3Dczuo9o21QG6AhTJjFAGdynE",
  authDomain: "netaji-club.firebaseapp.com",
  projectId: "netaji-club",
  storageBucket: "netaji-club.firebasestorage.app",
  messagingSenderId: "1085917792894",
  appId: "1:1085917792894:web:b238a7b21112ca22dc262f",
  measurementId: "G-KE6WZSR7JD"
};
export const firebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
const app = initializeApp(firebaseConfig);
export const auth = au.getAuth(app);
export const db = fs.getFirestore(app);
export {au, fs};
