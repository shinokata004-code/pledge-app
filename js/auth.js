// ============================================================
//  FIREBASE INIT + AUTH
// ============================================================
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  updatePassword
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, APP_CONFIG } from "./firebase-config.js";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Holds the signed-in user's profile (role, name, active) once loaded.
export const session = {
  uid: null,
  email: null,
  name: null,
  role: null,
  active: true
};

function normalizeRole(role) {
  return String(role || "").trim().toLowerCase();
}

export function can(action) {
  const { ADMIN, TREASURER } = APP_CONFIG.roles;
  const role = normalizeRole(session.role);
  const isAdmin = role === normalizeRole(ADMIN);
  const isTreasurer = role === normalizeRole(TREASURER);
  switch (action) {
    case "manageUsers":
    case "manageContributors":
    case "manageTypes":
      return isAdmin;
    case "manageExpenses":
    case "encodeContributions":
      return isAdmin || isTreasurer;
    default:
      return false;
  }
}

export async function loginWithEmail(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function logout() {
  await signOut(auth);
  window.location.href = "index.html";
}

export async function loadUserProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  return snap.data();
}

// Watches auth state. onReady(profile) fires once we have a signed-in user
// AND their Firestore profile loaded. onSignedOut() fires otherwise.
export function watchAuth({ onReady, onSignedOut }) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      onSignedOut && onSignedOut();
      return;
    }
    const profile = await loadUserProfile(user.uid);
    if (!profile) {
      // Signed in with Firebase Auth but no matching users/{uid} doc.
      await signOut(auth);
      onSignedOut && onSignedOut("No account profile found. Contact your admin.");
      return;
    }
    if (profile.active === false) {
      await signOut(auth);
      onSignedOut && onSignedOut("This account has been deactivated.");
      return;
    }
    session.uid = user.uid;
    session.email = user.email;
    session.name = profile.name || user.email;
    session.role = normalizeRole(profile.role);
    session.active = true;
    onReady && onReady(profile);
  });
}

// --------------------------------------------------------------
// Creating a new user account (admin action) WITHOUT signing the
// admin out. The normal client SDK createUserWithEmailAndPassword
// call signs the browser in as the new user, which would kick the
// admin out of their own session. We sidestep this by spinning up
// a temporary, separate Firebase App instance just for the create
// call, then immediately signing out & disposing of it.
// --------------------------------------------------------------
export async function adminCreateUser({ email, password, name, role }) {
  const tempAppName = "temp-user-create-" + Date.now();
  const tempApp = initializeApp(firebaseConfig, tempAppName);
  const tempAuth = getAuth(tempApp);
  try {
    const cred = await createUserWithEmailAndPassword(tempAuth, email, password);
    const uid = cred.user.uid;
    await setDoc(doc(db, "users", uid), {
      name,
      email,
      role,
      active: true,
      createdAt: serverTimestamp(),
      createdBy: session.uid
    });
    await signOut(tempAuth);
    return uid;
  } finally {
    // Clean up the temp app instance so it doesn't linger.
    const existing = getApps().find((a) => a.name === tempAppName);
    if (existing) {
      try { await tempAuth.signOut(); } catch (e) { /* ignore */ }
    }
  }
}
