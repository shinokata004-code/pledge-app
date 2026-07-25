import { listUsers, updateUser } from "./db.js";
import { adminCreateUser, session } from "./auth.js";
import { escapeHtml } from "./utils.js";

export async function initUsers() {
  document.getElementById("userForm").addEventListener("submit", onCreateUser);
  await refreshUsers();
}

async function refreshUsers() {
  const users = await listUsers();
  const body = document.getElementById("userBody");
  if (!users.length) {
    body.innerHTML = `<tr><td colspan="5">No users found.</td></tr>`;
    return;
  }
  body.innerHTML = users.map((u) => `
    <tr>
      <td>${escapeHtml(u.name || "—")}${u.id === session.uid ? " (you)" : ""}</td>
      <td>${escapeHtml(u.email || "—")}</td>
      <td>
        <select data-role-select="${u.id}" ${u.id === session.uid ? "disabled" : ""} style="padding:5px 8px;border:1px solid var(--line);border-radius:6px;">
          <option value="viewer" ${u.role === "viewer" ? "selected" : ""}>Viewer</option>
          <option value="treasurer" ${u.role === "treasurer" ? "selected" : ""}>Treasurer</option>
          <option value="admin" ${u.role === "admin" ? "selected" : ""}>Admin</option>
        </select>
      </td>
      <td>${u.active === false ? '<span class="badge">Deactivated</span>' : '<span class="badge gold">Active</span>'}</td>
      <td>
        ${u.id === session.uid ? "" : `
        <button class="icon-btn ${u.active === false ? "" : "danger"}" data-toggle="${u.id}" data-next="${u.active === false}">
          ${u.active === false ? "Reactivate" : "Deactivate"}
        </button>`}
      </td>
    </tr>
  `).join("");

  body.querySelectorAll("[data-role-select]").forEach((sel) => {
    sel.addEventListener("change", async () => {
      await updateUser(sel.getAttribute("data-role-select"), { role: sel.value });
      await refreshUsers();
    });
  });
  body.querySelectorAll("[data-toggle]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const makeActive = btn.getAttribute("data-next") === "true";
      const label = makeActive ? "reactivate" : "deactivate";
      if (!confirm(`Are you sure you want to ${label} this account?`)) return;
      await updateUser(btn.getAttribute("data-toggle"), { active: makeActive });
      await refreshUsers();
    });
  });
}

async function onCreateUser(e) {
  e.preventDefault();
  const msg = document.getElementById("userFormMsg");
  const name = document.getElementById("usName").value.trim();
  const email = document.getElementById("usEmail").value.trim();
  const password = document.getElementById("usPassword").value;
  const role = document.getElementById("usRole").value;

  msg.style.color = "var(--ink-soft)";
  msg.textContent = "Creating…";
  try {
    await adminCreateUser({ email, password, name, role });
    msg.style.color = "var(--forest-lighter)";
    msg.textContent = "Account created.";
    document.getElementById("userForm").reset();
    await refreshUsers();
  } catch (err) {
    msg.style.color = "var(--brick)";
    msg.textContent = friendlyError(err.code);
  }
}

function friendlyError(code) {
  switch (code) {
    case "auth/email-already-in-use": return "That email is already registered.";
    case "auth/weak-password": return "Password should be at least 6 characters.";
    case "auth/invalid-email": return "That email address looks invalid.";
    default: return "Couldn't create the account. Please try again.";
  }
}
