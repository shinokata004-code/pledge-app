import {
  listContributors, listContributionTypes, listContributions,
  addContribution, updateContribution, deleteContribution
} from "./db.js";
import { can } from "./auth.js";
import { APP_CONFIG } from "./firebase-config.js";
import { refreshDashboard } from "./dashboard.js";
import { escapeHtml, localDateStr } from "./utils.js";
import { renderCalendar } from "./calendar.js";

const fmt = (n) => APP_CONFIG.currencySymbol + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let contributorsCache = [];
let typesCache = [];
let contributionsCache = [];
let editingId = null;
let searchTerm = "";
let currentPage = 1;
const PAGE_SIZE = 20;

export async function initContributions() {
  document.getElementById("cfDate").value = localDateStr();

  document.getElementById("contribForm").addEventListener("submit", onSubmit);
  document.getElementById("contribSearch").addEventListener("input", (e) => {
    searchTerm = e.target.value.toLowerCase();
    currentPage = 1;
    renderTable();
  });
  document.getElementById("contribPrev").addEventListener("click", () => {
    if (currentPage > 1) { currentPage -= 1; renderTable(); }
  });
  document.getElementById("contribNext").addEventListener("click", () => {
    if (currentPage < getPageCount()) { currentPage += 1; renderTable(); }
  });

  await Promise.all([loadDropdownData(), refreshContributions()]);
}

export async function reloadDropdowns() {
  await loadDropdownData();
}

async function loadDropdownData() {
  [contributorsCache, typesCache] = await Promise.all([listContributors(), listContributionTypes()]);
  const contributorInput = document.getElementById("cfContributor");
  const contributorIdInput = document.getElementById("cfContributorId");
  const contributorList = document.getElementById("cfContributorList");
  const typeSel = document.getElementById("cfType");
  const activeContributors = contributorsCache.filter((c) => c.active !== false);

  function renderContributorSuggestions() {
    const query = contributorInput.value.trim().toLowerCase();
    const matches = !query
      ? activeContributors.slice(0, 8)
      : activeContributors.filter((c) => (c.name || "").toLowerCase().includes(query)).slice(0, 8);

    if (!matches.length) {
      contributorList.classList.remove("active");
      contributorList.innerHTML = "";
      return;
    }

    contributorList.classList.add("active");
    contributorList.innerHTML = matches.map((c) => `
      <button class="search-picker-option" type="button" data-id="${c.id}">${escapeHtml(c.name)}</button>
    `).join("");

    contributorList.querySelectorAll(".search-picker-option").forEach((btn) => {
      btn.addEventListener("click", () => {
        contributorInput.value = btn.textContent.trim();
        contributorIdInput.value = btn.getAttribute("data-id") || "";
        contributorList.classList.remove("active");
      });
    });
  }

  contributorInput.oninput = () => {
    const typedName = contributorInput.value.trim().toLowerCase();
    const match = activeContributors.find((c) => (c.name || "").toLowerCase() === typedName);
    contributorIdInput.value = match ? match.id : "";
    renderContributorSuggestions();
  };

  contributorInput.addEventListener("focus", renderContributorSuggestions);
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".search-picker")) {
      contributorList.classList.remove("active");
    }
  });

  if (!activeContributors.length) {
    contributorInput.disabled = true;
    contributorInput.placeholder = "Add a contributor first";
    contributorInput.value = "";
    contributorIdInput.value = "";
  } else {
    contributorInput.disabled = false;
    contributorInput.placeholder = "Start typing a registered name";
  }

  typeSel.innerHTML = typesCache
    .map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join("") || `<option value="">Add a type first</option>`;
  typeSel.onchange = () => {
    const selectedType = typesCache.find((t) => t.id === typeSel.value);
    const amountInput = document.getElementById("cfAmount");
    if (selectedType?.defaultAmount != null && (!amountInput.value || amountInput.value === "0")) {
      amountInput.value = selectedType.defaultAmount;
    }
  };
}

export async function refreshContributions() {
  contributionsCache = await listContributions();
  currentPage = Math.min(currentPage, getPageCount());
  renderTable();
}

function getPageCount() {
  return Math.max(1, Math.ceil(getFilteredRows().length / PAGE_SIZE));
}

function getFilteredRows() {
  if (!searchTerm) return contributionsCache;
  return contributionsCache.filter((c) => (c.contributorName || "").toLowerCase().includes(searchTerm));
}

function renderTable() {
  const body = document.getElementById("contribBody");
  const allowManage = can("encodeContributions");
  const filteredRows = getFilteredRows();
  const rows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  if (!filteredRows.length) {
    body.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="glyph">✎</div><p>No contributions found.</p></div></td></tr>`;
    renderPagination(0);
    return;
  }
  body.innerHTML = rows.map((c) => `
    <tr>
      <td>${c.date || "—"}</td>
      <td>${escapeHtml(c.contributorName || "—")}</td>
      <td><span class="badge">${escapeHtml(c.typeName || "—")}</span></td>
      <td class="amount">${fmt(c.amount)}</td>
      <td>${escapeHtml(c.encodedByName || "—")}</td>
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
  document.getElementById("contribPageInfo").textContent = total ? `Page ${currentPage} of ${count}` : "No results";
  document.getElementById("contribPrev").disabled = currentPage <= 1;
  document.getElementById("contribNext").disabled = currentPage >= count;
}

function startEdit(id) {
  const c = contributionsCache.find((x) => x.id === id);
  if (!c) return;
  editingId = id;
  const contributor = contributorsCache.find((entry) => entry.id === c.contributorId);
  document.getElementById("cfContributor").value = contributor?.name || c.contributorName || "";
  document.getElementById("cfContributorId").value = c.contributorId || "";
  document.getElementById("cfType").value = c.typeId;
  document.getElementById("cfAmount").value = c.amount;
  document.getElementById("cfDate").value = c.date;
  document.getElementById("cfNote").value = c.note || "";
  document.querySelector('#contribForm button[type="submit"]').textContent = "Update contribution";
  document.getElementById("contribFormMsg").textContent = "Editing entry — save or refresh to cancel.";
  document.getElementById("view-contributions").scrollIntoView({ behavior: "smooth" });
}

async function onDelete(id) {
  if (!confirm("Delete this contribution record? This cannot be undone.")) return;
  await deleteContribution(id);
  await refreshContributions();
  await refreshDashboard();
  await renderCalendar();
}

async function onSubmit(e) {
  e.preventDefault();
  const msg = document.getElementById("contribFormMsg");
  const contributorInput = document.getElementById("cfContributor");
  const contributorId = document.getElementById("cfContributorId").value || contributorsCache.find((c) => (c.name || "").toLowerCase() === contributorInput.value.trim().toLowerCase())?.id || "";
  const typeId = document.getElementById("cfType").value;
  if (!contributorId || !typeId) {
    msg.style.color = "var(--brick)";
    msg.textContent = "Add at least one contributor and one contribution type first.";
    return;
  }
  const contributorName = contributorsCache.find((c) => c.id === contributorId)?.name || contributorInput.value.trim();
  const typeName = typesCache.find((t) => t.id === typeId)?.name || "";
  const payload = {
    contributorId, contributorName, typeId, typeName,
    amount: document.getElementById("cfAmount").value,
    date: document.getElementById("cfDate").value,
    note: document.getElementById("cfNote").value
  };

  try {
    if (editingId) {
      await updateContribution(editingId, payload);
      msg.style.color = "var(--forest-lighter)";
      msg.textContent = "Contribution updated.";
    } else {
      await addContribution(payload);
      msg.style.color = "var(--forest-lighter)";
      msg.textContent = "Contribution saved.";
    }
    resetForm();
    await refreshContributions();
    await refreshDashboard();
    await renderCalendar();
  } catch (err) {
    msg.style.color = "var(--brick)";
    msg.textContent = "Couldn't save. Check your permissions and try again.";
  }
}

function resetForm() {
  editingId = null;
  document.getElementById("contribForm").reset();
  document.getElementById("cfContributorId").value = "";
  document.getElementById("cfDate").value = localDateStr();
  document.querySelector('#contribForm button[type="submit"]').textContent = "Save contribution";
}
