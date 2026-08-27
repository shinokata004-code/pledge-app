import { listExpenses, addExpense, updateExpense, deleteExpense } from "./db.js";
import { can } from "./auth.js";
import { escapeHtml } from "./utils.js";
import { refreshDashboard } from "./dashboard.js";

const fmt = (value) => `₱${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

let expensesCache = [];
let editingId = null;
let searchTerm = "";
let currentPage = 1;
const PAGE_SIZE = 20;

export async function initExpenses() {
  document.getElementById("expenseForm").addEventListener("submit", onSubmit);
  document.getElementById("expCancelEdit").addEventListener("click", resetForm);
  document.getElementById("expenseSearch").addEventListener("input", (e) => {
    searchTerm = e.target.value.trim().toLowerCase();
    currentPage = 1;
    renderTable();
  });
  document.getElementById("expensePrev").addEventListener("click", () => {
    if (currentPage > 1) { currentPage -= 1; renderTable(); }
  });
  document.getElementById("expenseNext").addEventListener("click", () => {
    if (currentPage < getPageCount()) { currentPage += 1; renderTable(); }
  });
  await refreshExpenses();
}

export async function refreshExpenses() {
  expensesCache = await listExpenses();
  currentPage = Math.min(currentPage, getPageCount());
  renderTable();
}

function getFilteredRows() {
  if (!searchTerm) return expensesCache;
  return expensesCache.filter((item) => [item.name, item.note, item.date]
    .some((value) => String(value || "").toLowerCase().includes(searchTerm)));
}

function getPageCount() {
  return Math.max(1, Math.ceil(getFilteredRows().length / PAGE_SIZE));
}

function renderTable() {
  const body = document.getElementById("expenseBody");
  const allowManage = can("manageExpenses");
  const rows = getFilteredRows();
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="glyph">💸</div><p>No expenses logged yet.</p></div></td></tr>`;
    renderPagination(0);
    return;
  }

  const start = (currentPage - 1) * PAGE_SIZE;
  body.innerHTML = rows.slice(start, start + PAGE_SIZE).map((item) => `
    <tr>
      <td>${escapeHtml(item.name || "—")}</td>
      <td class="amount">${item.quantity || 0}</td>
      <td class="amount">${fmt(item.price || 0)}</td>
      <td class="amount">${fmt((item.price || 0) * (item.quantity || 0))}</td>
      <td>${item.date || "—"}</td>
      <td>
        ${allowManage ? `<div class="row-actions"><button class="icon-btn" data-edit="${item.id}">Edit</button><button class="icon-btn danger" data-del="${item.id}">Delete</button></div>` : ""}
      </td>
    </tr>
  `).join("");

  renderPagination(rows.length);
  body.querySelectorAll("[data-edit]").forEach((btn) => btn.addEventListener("click", () => startEdit(btn.getAttribute("data-edit"))));
  body.querySelectorAll("[data-del]").forEach((btn) => btn.addEventListener("click", () => onDelete(btn.getAttribute("data-del"))));
}

function renderPagination(total) {
  const count = Math.max(1, Math.ceil(total / PAGE_SIZE));
  document.getElementById("expensePageInfo").textContent = total ? `Page ${currentPage} of ${count}` : "No results";
  document.getElementById("expensePrev").disabled = currentPage <= 1;
  document.getElementById("expenseNext").disabled = currentPage >= count;
}

function startEdit(id) {
  const item = expensesCache.find((expense) => expense.id === id);
  if (!item) return;
  editingId = id;
  document.getElementById("expName").value = item.name || "";
  document.getElementById("expPrice").value = item.price ?? "";
  document.getElementById("expQuantity").value = item.quantity ?? "";
  document.getElementById("expDate").value = item.date || "";
  document.getElementById("expNote").value = item.note || "";
  document.querySelector('#expenseForm button[type="submit"]').textContent = "Update expense";
  document.getElementById("expCancelEdit").style.display = "";
  document.getElementById("expenseFormMsg").textContent = "Editing entry — save or cancel.";
  document.getElementById("view-expenses").scrollIntoView({ behavior: "smooth" });
}

async function onDelete(id) {
  if (!confirm("Delete this expense record?")) return;
  await deleteExpense(id);
  await refreshExpenses();
  await refreshDashboard();
}

async function onSubmit(e) {
  e.preventDefault();
  const msg = document.getElementById("expenseFormMsg");
  const name = document.getElementById("expName").value.trim();
  const price = document.getElementById("expPrice").value;
  const quantity = document.getElementById("expQuantity").value;
  if (!name || !price || !quantity) {
    msg.style.color = "var(--brick)";
    msg.textContent = "Please fill in the item, price, and quantity.";
    return;
  }

  try {
    const payload = {
      name,
      price: Number(price),
      quantity: Number(quantity),
      date: document.getElementById("expDate").value || new Date().toISOString().slice(0, 10),
      note: document.getElementById("expNote").value.trim()
    };
    if (editingId) await updateExpense(editingId, payload);
    else await addExpense(payload);
    msg.style.color = "var(--accent-green)";
    msg.textContent = editingId ? "Expense updated." : "Expense recorded.";
    resetForm();
    await refreshExpenses();
    await refreshDashboard();
  } catch (err) {
    msg.style.color = "var(--brick)";
    msg.textContent = "Could not save the expense.";
  }
}

function resetForm() {
  editingId = null;
  document.getElementById("expenseForm").reset();
  document.getElementById("expDate").value = new Date().toISOString().slice(0, 10);
  document.querySelector('#expenseForm button[type="submit"]').textContent = "Record expense";
  document.getElementById("expCancelEdit").style.display = "none";
}
