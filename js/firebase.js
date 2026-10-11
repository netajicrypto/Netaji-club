// Firebase modular SDK. Paste your project's web config in firebaseConfig below.
// Never place Firebase Admin SDK credentials or service-account keys in frontend files.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";

export const firebaseConfig = {
  apiKey: "PASTE_FIREBASE_WEB_API_KEY",
  authDomain: "PASTE_PROJECT_ID.firebaseapp.com",
  projectId: "PASTE_PROJECT_ID",
  storageBucket: "PASTE_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "PASTE_MESSAGING_SENDER_ID",
  appId: "PASTE_APP_ID"
};
export const firebaseConfigured = !Object.values(firebaseConfig).some(v => String(v).includes("PASTE_"));
let app, auth, db, functions;
if (firebaseConfigured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  try { db = initializeFirestore(app, {localCache: persistentLocalCache({tabManager:persistentMultipleTabManager()})}); }
  catch { db = getFirestore(app); }
  functions = getFunctions(app);
}
export { app, auth, db, functions };
