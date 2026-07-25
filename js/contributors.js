import { listContributors, addContributor, updateContributor, deleteContributor, listContributions } from "./db.js";
import { can } from "./auth.js";
import { APP_CONFIG } from "./firebase-config.js";
import { escapeHtml } from "./utils.js";
import { reloadDropdowns, refreshContributions } from "./contributions.js";

const fmt = (n) => APP_CONFIG.currencySymbol + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let contributorsCache = [];
let editingId = null;
let searchTerm = "";

export async function initContributors() {
  document.getElementById("contributorForm").addEventListener("submit", onSubmit);
  document.getElementById("ctCancelEdit").addEventListener("click", resetForm);
  document.getElementById("contributorSearch").addEventListener("input", (e) => {
    searchTerm = e.target.value.toLowerCase();
    renderTable();
  });
  await refreshContributorsView();
}

async function refreshContributorsView() {
  const [contributors, contributions] = await Promise.all([listContributors(), listContributions()]);
  contributorsCache = contributors.map((c) => {
    const total = contributions.filter((x) => x.contributorId === c.id).reduce((s, x) => s + (x.amount || 0), 0);
    return { ...c, total };
  });
  renderTable();
}

function renderTable() {
  const body = document.getElementById("contributorBody");
  const allowManage = can("manageContributors");
  let rows = contributorsCache;
  if (searchTerm) rows = rows.filter((c) => c.name.toLowerCase().includes(searchTerm));

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="4"><div class="empty-state"><div class="glyph">☰</div><p>No contributors yet.</p></div></td></tr>`;
    return;
  }
  body.innerHTML = rows.map((c) => `
    <tr>
      <td>${escapeHtml(c.name)}${c.active === false ? ' <span class="badge">inactive</span>' : ""}</td>
      <td>${escapeHtml(c.contact || "—")}</td>
      <td class="amount">${fmt(c.total)}</td>
      <td>
        ${allowManage ? `
        <div class="row-actions">
          <button class="icon-btn" data-edit="${c.id}">Edit</button>
          <button class="icon-btn danger" data-del="${c.id}">Delete</button>
        </div>` : ""}
      </td>
    </tr>
  `).join("");

  body.querySelectorAll("[data-edit]").forEach((btn) => btn.addEventListener("click", () => startEdit(btn.getAttribute("data-edit"))));
  body.querySelectorAll("[data-del]").forEach((btn) => btn.addEventListener("click", () => onDelete(btn.getAttribute("data-del"))));
}

function startEdit(id) {
  const c = contributorsCache.find((x) => x.id === id);
  if (!c) return;
  editingId = id;
  document.getElementById("ctName").value = c.name;
  document.getElementById("ctContact").value = c.contact || "";
  document.getElementById("ctNotes").value = c.notes || "";
  document.querySelector('#contributorForm button[type="submit"]').textContent = "Update contributor";
  document.getElementById("ctCancelEdit").style.display = "";
}

async function onDelete(id) {
  if (!confirm("Delete this contributor? Their past contribution records will remain, but they'll no longer appear as an active contributor.")) return;
  await deleteContributor(id);
  await refreshContributorsView();
  await reloadDropdowns();
}

async function onSubmit(e) {
  e.preventDefault();
  const payload = {
    name: document.getElementById("ctName").value.trim(),
    contact: document.getElementById("ctContact").value.trim(),
    notes: document.getElementById("ctNotes").value.trim()
  };
  if (!payload.name) return;

  if (editingId) {
    await updateContributor(editingId, payload);
  } else {
    await addContributor(payload);
  }
  resetForm();
  await refreshContributorsView();
  await reloadDropdowns();
  await refreshContributions();
}

function resetForm() {
  editingId = null;
  document.getElementById("contributorForm").reset();
  document.querySelector('#contributorForm button[type="submit"]').textContent = "Add contributor";
  document.getElementById("ctCancelEdit").style.display = "none";
}
