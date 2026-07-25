import { listExpenses, addExpense, deleteExpense } from "./db.js";
import { can } from "./auth.js";
import { escapeHtml } from "./utils.js";
import { refreshDashboard } from "./dashboard.js";

const fmt = (value) => `₱${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

let expensesCache = [];

export async function initExpenses() {
  document.getElementById("expenseForm").addEventListener("submit", onSubmit);
  await refreshExpenses();
}

export async function refreshExpenses() {
  expensesCache = await listExpenses();
  renderTable();
}

function renderTable() {
  const body = document.getElementById("expenseBody");
  const allowManage = can("manageExpenses");
  if (!expensesCache.length) {
    body.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="glyph">💸</div><p>No expenses logged yet.</p></div></td></tr>`;
    return;
  }

  body.innerHTML = expensesCache.map((item) => `
    <tr>
      <td>${escapeHtml(item.name || "—")}</td>
      <td class="amount">${item.quantity || 0}</td>
      <td class="amount">${fmt(item.price || 0)}</td>
      <td class="amount">${fmt((item.price || 0) * (item.quantity || 0))}</td>
      <td>${item.date || "—"}</td>
      <td>
        ${allowManage ? `<div class="row-actions"><button class="icon-btn danger" data-del="${item.id}">Delete</button></div>` : ""}
      </td>
    </tr>
  `).join("");

  body.querySelectorAll("[data-del]").forEach((btn) => btn.addEventListener("click", () => onDelete(btn.getAttribute("data-del"))));
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
    await addExpense({
      name,
      price: Number(price),
      quantity: Number(quantity),
      date: document.getElementById("expDate").value || new Date().toISOString().slice(0, 10),
      note: document.getElementById("expNote").value.trim()
    });
    msg.style.color = "var(--accent-green)";
    msg.textContent = "Expense recorded.";
    document.getElementById("expenseForm").reset();
    document.getElementById("expDate").value = new Date().toISOString().slice(0, 10);
    await refreshExpenses();
    await refreshDashboard();
  } catch (err) {
    msg.style.color = "var(--brick)";
    msg.textContent = "Could not save the expense.";
  }
}
