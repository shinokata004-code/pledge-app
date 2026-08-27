import { listContributions, listContributionsByDate, listExpenses } from "./db.js";
import { APP_CONFIG } from "./firebase-config.js";
import { escapeHtml, localMonthStr, localDateStr } from "./utils.js";

const fmt = (n) => APP_CONFIG.currencySymbol + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

let cursor = new Date(); // month being viewed
cursor.setDate(1);

export async function initCalendar() {
  document.getElementById("calPrev").addEventListener("click", () => { cursor.setMonth(cursor.getMonth() - 1); renderCalendar(); });
  document.getElementById("calNext").addEventListener("click", () => { cursor.setMonth(cursor.getMonth() + 1); renderCalendar(); });
  document.getElementById("dayModalClose").addEventListener("click", closeModal);
  document.getElementById("dayModal").addEventListener("click", (e) => { if (e.target.id === "dayModal") closeModal(); });
  await renderCalendar();
}

async function renderCalendar() {
  document.getElementById("calLabel").textContent = cursor.toLocaleString(undefined, { month: "long", year: "numeric" });

  // Draw the grid (day headers + date cells) first, independent of any
  // network call. This way the calendar is always usable even if the
  // contributions fetch below fails or is slow.
  const grid = document.getElementById("calGrid");
  grid.innerHTML = "";
  DOW.forEach((d) => {
    const el = document.createElement("div");
    el.className = "cal-dow";
    el.textContent = d;
    grid.appendChild(el);
  });

  const firstDay = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const startOffset = firstDay.getDay();
  const todayStr = localDateStr();

  for (let i = 0; i < startOffset; i++) {
    const el = document.createElement("div");
    el.className = "cal-cell empty";
    grid.appendChild(el);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dow = new Date(cursor.getFullYear(), cursor.getMonth(), day).getDay();
    const dateStr = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const isCollectionDay = APP_CONFIG.collectionDays.includes(dow);

    const cell = document.createElement("div");
    cell.className = "cal-cell" + (isCollectionDay ? " collection-day" : "") + (dateStr === todayStr ? " today" : "");
    cell.dataset.date = dateStr;
    cell.innerHTML = `<div class="daynum">${day}</div>`;
    cell.addEventListener("click", () => openDayModal(dateStr));
    grid.appendChild(cell);
  }

  // Now layer in totals/stamps from Firestore. If this fails (e.g. rules
  // not published yet, or a network hiccup), the dates above still show
  // and are still clickable — we just show a small inline notice.
  const errorBox = ensureErrorBox();
  errorBox.style.display = "none";
  renderMonthMetrics([], []);
  try {
    const monthPrefix = localMonthStr(cursor);
    const [allContributions, allExpenses] = await Promise.all([listContributions(), listExpenses()]);
    const monthContributions = allContributions.filter((c) => c.date && c.date.startsWith(monthPrefix));
    const monthExpenses = allExpenses.filter((item) => item.date && item.date.startsWith(monthPrefix));
    renderMonthMetrics(monthContributions, monthExpenses);
    const totalsByDay = {};
    monthContributions.forEach((c) => { totalsByDay[c.date] = (totalsByDay[c.date] || 0) + (c.amount || 0); });
    monthExpenses.forEach((item) => { totalsByDay[item.date] = (totalsByDay[item.date] || 0) - ((item.price || 0) * (item.quantity || 0)); });

    grid.querySelectorAll(".cal-cell[data-date]").forEach((cell) => {
      const total = totalsByDay[cell.dataset.date];
      if (total) {
        cell.insertAdjacentHTML("beforeend", `<div class="cal-total">${fmt(total)}</div><div class="stamp">✓</div>`);
      }
    });
  } catch (err) {
    console.error("Failed to load contribution totals for calendar:", err);
    errorBox.textContent = "Couldn't load collection totals (" + (err.code || err.message || "unknown error") + "). Dates are still clickable.";
    errorBox.style.display = "block";
  }
}

function renderMonthMetrics(contributions, expenses) {
  const collectionTotal = contributions.reduce((sum, item) => sum + (item.amount || 0), 0);
  const expenseTotal = expenses.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 0)), 0);
  const offeringsTotal = contributions
    .filter((item) => String(item.typeName || "").trim().toLowerCase() === "offering")
    .reduce((sum, item) => sum + (item.amount || 0), 0);
  document.getElementById("calCollectionTotal").textContent = fmt(collectionTotal);
  document.getElementById("calExpensesTotal").textContent = fmt(expenseTotal);
  document.getElementById("calOfferingsTotal").textContent = fmt(offeringsTotal);
}

function ensureErrorBox() {
  let box = document.getElementById("calLoadError");
  if (!box) {
    box = document.createElement("div");
    box.id = "calLoadError";
    box.style.cssText = "margin-bottom:12px;padding:10px 12px;border-radius:6px;background:#fbeae5;border:1px solid var(--brick);color:var(--brick);font-size:12.5px;display:none;";
    document.getElementById("calGrid").parentElement.insertBefore(box, document.getElementById("calGrid"));
  }
  return box;
}

async function openDayModal(dateStr) {
  const modal = document.getElementById("dayModal");
  const title = document.getElementById("dayModalTitle");
  const body = document.getElementById("dayModalBody");

  const d = new Date(dateStr + "T00:00:00");
  title.textContent = d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  body.innerHTML = `<p style="color:var(--ink-soft);font-size:13.5px;">Loading…</p>`;
  modal.classList.add("active");

  try {
    const [entries, expenses] = await Promise.all([listContributionsByDate(dateStr), listExpenses()]);
    const dayExpenses = expenses.filter((item) => item.date === dateStr);
    const hasRecords = entries.length || dayExpenses.length;
    if (!hasRecords) {
      body.innerHTML = `<div class="empty-state"><div class="glyph">▦</div><p>No contributions or expenses recorded on this day.</p></div>`;
      return;
    }
    const total = entries.reduce((s, e) => s + (e.amount || 0), 0) - dayExpenses.reduce((s, item) => s + ((item.price || 0) * (item.quantity || 0)), 0);
    const rows = [];
    entries.forEach((e) => {
      rows.push(`
        <div class="day-entry">
          <div>
            <div class="who">${escapeHtml(e.contributorName || "Contributor")}</div>
            <div class="type">${escapeHtml(e.typeName || "Contribution")}${e.note ? " · " + escapeHtml(e.note) : ""}</div>
          </div>
          <div class="amt">${fmt(e.amount)}</div>
        </div>
      `);
    });
    dayExpenses.forEach((item) => {
      rows.push(`
        <div class="day-entry expense">
          <div>
            <div class="who">${escapeHtml(item.name || "Expense")}</div>
            <div class="type">${item.quantity ? `${item.quantity} × ${fmt(item.price || 0)}` : fmt(item.price || 0)}${item.note ? " · " + escapeHtml(item.note) : ""}</div>
          </div>
          <div class="amt">-${fmt((item.price || 0) * (item.quantity || 0))}</div>
        </div>
      `);
    });
    body.innerHTML = rows.join("") + `<div class="day-total-row"><span>Net total</span><span class="mono">${fmt(total)}</span></div>`;
  } catch (err) {
    console.error("Failed to load contributions for", dateStr, err);
    body.innerHTML = `<div class="empty-state"><div class="glyph">⚠</div><p>Couldn't load this day's records (${escapeHtml(err.code || err.message || "unknown error")}).</p></div>`;
  }
}

function closeModal() {
  document.getElementById("dayModal").classList.remove("active");
}

export { renderCalendar };
