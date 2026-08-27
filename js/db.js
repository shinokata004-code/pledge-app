// ============================================================
//  FIRESTORE DATA LAYER
// ============================================================
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  query,
  orderBy,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db, session } from "./auth.js";

// ---------- Contributors ----------
export async function listContributors() {
  const snap = await getDocs(query(collection(db, "contributors"), orderBy("name")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function addContributor({ name, contact, notes }) {
  return addDoc(collection(db, "contributors"), {
    name, contact: contact || "", notes: notes || "",
    active: true,
    createdAt: serverTimestamp(),
    createdBy: session.uid
  });
}

export async function updateContributor(id, data) {
  return updateDoc(doc(db, "contributors", id), data);
}

export async function deleteContributor(id) {
  return deleteDoc(doc(db, "contributors", id));
}

// ---------- Contribution Types ----------
const TYPES_STORAGE_KEY = "ledger_contribution_types";

function readStoredTypes() {
  try {
    return JSON.parse(localStorage.getItem(TYPES_STORAGE_KEY) || "[]") || [];
  } catch {
    return [];
  }
}

function saveStoredTypes(types) {
  localStorage.setItem(TYPES_STORAGE_KEY, JSON.stringify(types));
}

export async function listContributionTypes() {
  try {
    const snap = await getDocs(query(collection(db, "contributionTypes"), orderBy("name")));
    const types = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (types.length) {
      saveStoredTypes(types);
      return types;
    }
  } catch (err) {
    // Fall back to cached values when Firestore denies the read.
  }
  return readStoredTypes();
}

export async function addContributionType(payload) {
  const data = typeof payload === "string" ? { name: payload } : payload;
  try {
    await addDoc(collection(db, "contributionTypes"), {
      name: data.name,
      defaultAmount: data.defaultAmount ?? null,
      createdAt: serverTimestamp(),
      createdBy: session.uid
    });
    return true;
  } catch (err) {
    const stored = readStoredTypes();
    const fallbackType = {
      id: `local-${Date.now()}`,
      name: data.name,
      defaultAmount: data.defaultAmount ?? null,
      createdAt: new Date().toISOString(),
      createdBy: session.uid || "local"
    };
    saveStoredTypes([...stored, fallbackType]);
    return fallbackType;
  }
}

export async function deleteContributionType(id) {
  try {
    await deleteDoc(doc(db, "contributionTypes", id));
    return true;
  } catch (err) {
    const stored = readStoredTypes().filter((t) => t.id !== id);
    saveStoredTypes(stored);
    return true;
  }
}

// ---------- Expenses ----------
export async function listExpenses() {
  const key = "ledger_expenses";
  try {
    const snap = await getDocs(query(collection(db, "expenses"), orderBy("date", "desc")));
    const expenses = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    localStorage.setItem(key, JSON.stringify(expenses));
    return expenses;
  } catch (err) {
    try {
      return JSON.parse(localStorage.getItem(key) || "[]");
    } catch {
      return [];
    }
  }
}

export async function addExpense({ name, price, quantity, date, note }) {
  const payload = {
    name, price: Number(price), quantity: Number(quantity), date, note: note || "",
    createdAt: serverTimestamp(), createdBy: session.uid
  };
  try {
    const docRef = await addDoc(collection(db, "expenses"), payload);
    return docRef;
  } catch (err) {
    const stored = JSON.parse(localStorage.getItem("ledger_expenses") || "[]");
    stored.unshift({ id: `local-${Date.now()}`, ...payload, createdAt: new Date().toISOString() });
    localStorage.setItem("ledger_expenses", JSON.stringify(stored));
    return true;
  }
}

export async function updateExpense(id, { name, price, quantity, date, note }) {
  const payload = {
    name, price: Number(price), quantity: Number(quantity), date, note: note || ""
  };
  try {
    return await updateDoc(doc(db, "expenses", id), payload);
  } catch (err) {
    const stored = JSON.parse(localStorage.getItem("ledger_expenses") || "[]").map((item) =>
      item.id === id ? { ...item, ...payload } : item
    );
    localStorage.setItem("ledger_expenses", JSON.stringify(stored));
    return true;
  }
}

export async function deleteExpense(id) {
  try {
    await deleteDoc(doc(db, "expenses", id));
    return true;
  } catch (err) {
    const stored = JSON.parse(localStorage.getItem("ledger_expenses") || "[]").filter((item) => item.id !== id);
    localStorage.setItem("ledger_expenses", JSON.stringify(stored));
    return true;
  }
}

// ---------- Contributions ----------
export async function listContributions() {
  const snap = await getDocs(query(collection(db, "contributions"), orderBy("date", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listContributionsByDate(dateStr) {
  const snap = await getDocs(
    query(collection(db, "contributions"), where("date", "==", dateStr))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function addContribution({ contributorId, contributorName, typeId, typeName, amount, date, note }) {
  return addDoc(collection(db, "contributions"), {
    contributorId, contributorName, typeId, typeName,
    amount: Number(amount),
    date, // "YYYY-MM-DD"
    note: note || "",
    encodedBy: session.uid,
    encodedByName: session.name,
    createdAt: serverTimestamp()
  });
}

export async function updateContribution(id, data) {
  const payload = { ...data };
  if (payload.amount !== undefined) payload.amount = Number(payload.amount);
  return updateDoc(doc(db, "contributions", id), payload);
}

export async function deleteContribution(id) {
  return deleteDoc(doc(db, "contributions", id));
}

// ---------- Users ----------
export async function listUsers() {
  const snap = await getDocs(query(collection(db, "users"), orderBy("name")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function updateUser(uid, data) {
  return updateDoc(doc(db, "users", uid), data);
}

export async function updateUserProfile(uid, { name, email }) {
  return updateDoc(doc(db, "users", uid), { name, email });
}

export async function getUser(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
