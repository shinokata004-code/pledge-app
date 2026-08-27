import { listContributors, addContributor, updateContributor, deleteContributor, listContributions } from "./db.js";
import { can } from "./auth.js";
import { APP_CONFIG } from "./firebase-config.js";
import { escapeHtml } from "./utils.js";
import { reloadDropdowns, refreshContributions } from "./contributions.js";

const fmt = (n) => APP_CONFIG.currencySymbol + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let contributorsCache = [];
let editingId = null;
let searchTerm = "";
let currentPage = 1;
const PAGE_SIZE = 20;

export async function initContributors() {
  document.getElementById("contributorForm").addEventListener("submit", onSubmit);
  document.getElementById("ctCancelEdit").addEventListener("click", resetForm);
  document.getElementById("contributorSearch").addEventListener("input", (e) => {
    searchTerm = e.target.value.toLowerCase();
    currentPage = 1;
    renderTable();
  });
  document.getElementById("contributorPrev").addEventListener("click", () => {
    if (currentPage > 1) { currentPage -= 1; renderTable(); }
  });
  document.getElementById("contributorNext").addEventListener("click", () => {
    if (currentPage < getPageCount()) { currentPage += 1; renderTable(); }
  });
  await refreshContributorsView();
}

async function refreshContributorsView() {
  const [contributors, contributions] = await Promise.all([listContributors(), listContributions()]);
  contributorsCache = contributors.map((c) => {
    const total = contributions.filter((x) => x.contributorId === c.id).reduce((s, x) => s + (x.amount || 0), 0);
    return { ...c, total };
  });
  currentPage = Math.min(currentPage, getPageCount());
  renderTable();
}

function getFilteredRows() {
  if (!searchTerm) return contributorsCache;
  return contributorsCache.filter((c) => c.name.toLowerCase().includes(searchTerm));
}

function getPageCount() {
  return Math.max(1, Math.ceil(getFilteredRows().length / PAGE_SIZE));
}

function renderTable() {
  const body = document.getElementById("contributorBody");
  const allowManage = can("manageContributors");
  const filteredRows = getFilteredRows();
  const rows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  if (!filteredRows.length) {
    body.innerHTML = `<tr><td colspan="4"><div class="empty-state"><div class="glyph">☰</div><p>No contributors yet.</p></div></td></tr>`;
    renderPagination(0);
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

  renderPagination(filteredRows.length);
  body.querySelectorAll("[data-edit]").forEach((btn) => btn.addEventListener("click", () => startEdit(btn.getAttribute("data-edit"))));
  body.querySelectorAll("[data-del]").forEach((btn) => btn.addEventListener("click", () => onDelete(btn.getAttribute("data-del"))));
}

function renderPagination(total) {
  const count = Math.max(1, Math.ceil(total / PAGE_SIZE));
  document.getElementById("contributorPageInfo").textContent = total ? `Page ${currentPage} of ${count}` : "No results";
  document.getElementById("contributorPrev").disabled = currentPage <= 1;
  document.getElementById("contributorNext").disabled = currentPage >= count;
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
