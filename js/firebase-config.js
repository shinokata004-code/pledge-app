// ============================================================
//  FIREBASE CONFIG
//  Replace the values below with the config object from:
//  Firebase Console → Project settings → Your apps → SDK setup
// ============================================================
export const firebaseConfig = {
  apiKey: "AIzaSyAfiCs3yduVWUg8pmhQubyB7_eUQOYQ9mw",
  authDomain: "pledeapp.firebaseapp.com",
  projectId: "pledeapp",
  storageBucket: "pledeapp.firebasestorage.app",
  messagingSenderId: "168593071136",
  appId: "1:168593071136:web:b55ffe0e696de51b193045"
};

// ============================================================
//  APP SETTINGS — safe to tweak
// ============================================================
export const APP_CONFIG = {
  appName: "The Ledger",
  currencySymbol: "₱",
  // Days that are highlighted as regular collection days on the calendar.
  // 0 = Sunday, 1 = Monday, 2 = Tuesday, 3 = Wednesday, 4 = Thursday, 5 = Friday, 6 = Saturday
  collectionDays: [0, 3], // Sunday & Wednesday
  roles: {
    ADMIN: "admin",
    TREASURER: "treasurer",
    VIEWER: "viewer"
  }
};