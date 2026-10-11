// ======================================================
// NETAJI CLUB — FIREBASE CONFIGURATION
// Firebase Modular SDK v10.14.1
// ======================================================

import { initializeApp } from
  "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";

import {
  getAuth
} from
  "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from
  "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import {
  getFunctions
} from
  "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";


// ======================================================
// 1. FIREBASE WEB CONFIG
// ======================================================

export const firebaseConfig = {
  apiKey: "AIzaSyCG85CidK3Dczuo9o21QG6AhTJjFAGdynE",
  authDomain: "netaji-club.firebaseapp.com",
  projectId: "netaji-club",
  storageBucket: "netaji-club.firebasestorage.app",
  messagingSenderId: "1085917792894",
  appId: "1:1085917792894:web:b238a7b21112ca22dc262f",
  measurementId: "G-KE6WZSR7JD"
};


// ======================================================
// 2. CHECK CONFIGURATION
// ======================================================

export const firebaseConfigured =
  Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId
  );


// ======================================================
// 3. INITIALIZE FIREBASE SERVICES
// ======================================================

let app = null;
let auth = null;
let db = null;
let functions = null;

if (firebaseConfigured) {
  try {
    // Initialize Firebase application
    app = initializeApp(firebaseConfig);

    // Firebase Authentication
    auth = getAuth(app);

    // Firestore database with persistent local cache
    try {
      db = initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager()
        })
      });
    } catch (error) {
      // Fallback if Firestore has already been initialized
      console.warn(
        "Firestore persistence initialization fallback:",
        error.message
      );

      db = getFirestore(app);
    }

    // Cloud Functions
    // Change the region if your functions are deployed elsewhere.
    functions = getFunctions(app, "us-central1");

    console.log("Firebase initialized successfully.");

  } catch (error) {
    console.error("Firebase initialization failed:", error);

    app = null;
    auth = null;
    db = null;
    functions = null;
  }
} else {
  console.warn("Firebase configuration is incomplete.");
}


// ======================================================
// 4. EXPORT SERVICES
// Keep these exports compatible with app.js and admin.js.
// ======================================================

export {
  app,
  auth,
  db,
  functions
};
