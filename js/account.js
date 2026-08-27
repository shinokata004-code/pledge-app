import { session, updateFirebaseAccount } from "./auth.js";
import { updateUserProfile } from "./db.js";

export function initAccount() {
  const form = document.getElementById("accountForm");
  document.getElementById("accountName").value = session.name || "";
  document.getElementById("accountEmail").value = session.email || "";
  form.addEventListener("submit", onSubmit);
}

async function onSubmit(event) {
  event.preventDefault();
  const msg = document.getElementById("accountFormMsg");
  const name = document.getElementById("accountName").value.trim();
  const email = document.getElementById("accountEmail").value.trim().toLowerCase();
  const currentPassword = document.getElementById("currentPassword").value;
  const newPassword = document.getElementById("newPassword").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  msg.style.color = "var(--brick)";
  if (name.length < 2) return showMessage(msg, "Enter a name with at least 2 characters.");
  if (newPassword && newPassword.length < 6) return showMessage(msg, "The new password must be at least 6 characters.");
  if (newPassword !== confirmPassword) return showMessage(msg, "New password and confirmation do not match.");
  if ((email !== session.email || newPassword) && !currentPassword) {
    return showMessage(msg, "Enter your current password to change email or password.");
  }

  const button = document.querySelector('#accountForm button[type="submit"]');
  button.disabled = true;
  msg.style.color = "var(--ink-soft)";
  msg.textContent = "Saving…";
  try {
    await updateFirebaseAccount({ email, currentPassword, newPassword });
    await updateUserProfile(session.uid, { name, email });
    session.name = name;
    session.email = email;
    document.getElementById("sbName").textContent = name;
    document.getElementById("sbEmail").textContent = email;
    document.getElementById("currentPassword").value = "";
    document.getElementById("newPassword").value = "";
    document.getElementById("confirmPassword").value = "";
    msg.style.color = "var(--forest-lighter)";
    msg.textContent = "Account details updated.";
  } catch (error) {
    msg.style.color = "var(--brick)";
    msg.textContent = friendlyError(error.code || error.message);
  } finally {
    button.disabled = false;
  }
}

function showMessage(element, message) {
  element.textContent = message;
}

function friendlyError(code) {
  switch (code) {
    case "auth/wrong-password":
    case "auth/invalid-credential": return "The current password is incorrect.";
    case "auth/requires-recent-login": return "Please sign out and sign in again before changing security details.";
    case "auth/email-already-in-use": return "That email is already registered.";
    case "auth/invalid-email": return "Enter a valid email address.";
    case "auth/weak-password": return "The new password must be at least 6 characters.";
    case "auth/current-password-required": return "Enter your current password to continue.";
    default: return "Could not update your account. Please try again.";
  }
}