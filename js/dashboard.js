import { listContributions, listContributors, listExpenses } from "./db.js";
import { APP_CONFIG } from "./firebase-config.js";
import { localMonthStr, escapeHtml } from "./utils.js";

const fmt = (n) => APP_CONFIG.currencySymbol + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let monthlyChart, typeChart, expenseChart;
let latestDashboardData = { contributions: [], expenses: [] };

export async function initDashboard() {
  document.getElementById("exportReportBtn").addEventListener("click", exportDashboardReport);
  await refreshDashboard();
}

export async function refreshDashboard() {
  const [contributions, contributors, expenses] = await Promise.all([listContributions(), listContributors(), listExpenses()]);
  latestDashboardData = { contributions, expenses };

  renderStats(contributions, contributors, expenses);
  renderCharts(contributions, expenses);
  renderTopContributors(contributions);
  renderRecentActivity(contributions);
  renderExportSummary(contributions, expenses);
}

function renderStats(contributions, contributors, expenses) {
  const now = new Date();
  const monthKey = localMonthStr(now); // YYYY-MM
  const startOfWeek = getMonday(now);

  let total = 0, monthTotal = 0, weekTotal = 0;
  let expenseTotal = 0, expenseMonthTotal = 0, expenseWeekTotal = 0;
  contributions.forEach((c) => {
    total += c.amount || 0;
    if (c.date && c.date.startsWith(monthKey)) monthTotal += c.amount || 0;
    const d = new Date(c.date + "T00:00:00");
    if (c.date && d >= startOfWeek) weekTotal += c.amount || 0;
  });

  expenses.forEach((item) => {
    const itemTotal = (item.price || 0) * (item.quantity || 0);
    expenseTotal += itemTotal;
    if (item.date && item.date.startsWith(monthKey)) expenseMonthTotal += itemTotal;
    const d = new Date(item.date + "T00:00:00");
    if (item.date && d >= startOfWeek) expenseWeekTotal += itemTotal;
  });

  document.getElementById("statTotal").textContent = fmt(total - expenseTotal);
  document.getElementById("statMonth").textContent = fmt(monthTotal - expenseMonthTotal);
  document.getElementById("statMonthLabel").textContent = now.toLocaleString(undefined, { month: "long", year: "numeric" });
  document.getElementById("statWeek").textContent = fmt(weekTotal - expenseWeekTotal);
  document.getElementById("statContributors").textContent = contributors.filter((c) => c.active !== false).length;
}

function renderCharts(contributions, expenses) {
  // Monthly totals, last 6 months
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: localMonthStr(d), label: d.toLocaleString(undefined, { month: "short" }) });
  }
  const monthTotals = months.map((m) =>
    contributions.filter((c) => c.date && c.date.startsWith(m.key)).reduce((s, c) => s + (c.amount || 0), 0)
  );

  const monthlyCtx = document.getElementById("chartMonthly");
  const typeCtx = document.getElementById("chartTypes");
  const expenseCtx = document.getElementById("chartExpenses");

  if (monthlyChart) monthlyChart.destroy();
  if (typeChart) typeChart.destroy();
  if (expenseChart) expenseChart.destroy();

  if (typeof window.Chart === "undefined") {
    renderSimpleMonthlyChart(monthlyCtx, months, monthTotals);
    renderSimpleTypeChart(typeCtx, contributions, expenses);
    renderSimpleExpenseChart(expenseCtx, expenses);
    return;
  }

  monthlyChart = new window.Chart(monthlyCtx, {
    type: "bar",
    data: {
      labels: months.map((m) => m.label),
      datasets: [{
        label: "Collected",
        data: monthTotals,
        backgroundColor: "#1a73e8",
        borderRadius: 4,
        maxBarThickness: 42
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { callback: (v) => APP_CONFIG.currencySymbol + v } },
        x: { grid: { display: false } }
      }
    }
  });

  // Contributions by type, with all expenses grouped into one slice.
  const byType = {};
  contributions.forEach((c) => {
    const key = c.typeName || "Other";
    byType[key] = (byType[key] || 0) + (c.amount || 0);
  });
  const expenseTotal = expenses.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 0), 0);
  const typeLabels = Object.keys(byType);
  const typeValues = Object.values(byType);
  if (expenseTotal) {
    typeLabels.push("Expenses");
    typeValues.push(expenseTotal);
  }
  const palette = ["#1a73e8", "#fbbc04", "#34a853", "#ea4335", "#5b6b7a", "#4285f4", "#1c5744"];
  const typeColors = typeLabels.map((label, index) => label === "Expenses" ? "#ea4335" : palette[index % palette.length]);

  typeChart = new window.Chart(typeCtx, {
    type: "doughnut",
    data: {
      labels: typeLabels.length ? typeLabels : ["No data yet"],
      datasets: [{
        data: typeValues.length ? typeValues : [1],
        backgroundColor: typeLabels.length ? typeColors : ["#e6e0cc"],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 } } } }
    }
  });

  const expenseByItem = getExpenseTotals(expenses);
  const expenseLabels = Object.keys(expenseByItem);
  const expenseValues = Object.values(expenseByItem);
  const expensePalette = ["#ea4335", "#fbbc04", "#5b6b7a", "#1a73e8", "#34a853", "#c25b32", "#1c5744"];

  expenseChart = new window.Chart(expenseCtx, {
    type: "doughnut",
    data: {
      labels: expenseLabels.length ? expenseLabels : ["No data yet"],
      datasets: [{
        data: expenseValues.length ? expenseValues : [1],
        backgroundColor: expenseLabels.length ? expenseLabels.map((_, index) => expensePalette[index % expensePalette.length]) : ["#e6e0cc"],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 } } } }
    }
  });
}

function renderSimpleMonthlyChart(container, months, monthTotals) {
  if (!container) return;
  const maxValue = Math.max(...monthTotals, 1);
  container.innerHTML = `
    <div class="simple-chart">
      ${months.map((m, index) => {
        const height = Math.max(10, Math.round((monthTotals[index] / maxValue) * 100));
        return `
          <div class="simple-bar-item">
            <div class="simple-bar-track">
              <div class="simple-bar-fill" style="height:${height}%"></div>
            </div>
            <div class="simple-bar-label">${escapeHtml(m.label)}</div>
            <div class="simple-bar-value">${fmt(monthTotals[index])}</div>
          </div>`;
      }).join("")}
    </div>
  `;
}

function renderSimpleTypeChart(container, contributions, expenses) {
  if (!container) return;
  const byType = {};
  contributions.forEach((c) => {
    const key = c.typeName || "Other";
    byType[key] = (byType[key] || 0) + (c.amount || 0);
  });
  const expenseTotal = expenses.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 0), 0);
  const labels = Object.keys(byType);
  const values = Object.values(byType);
  if (expenseTotal) {
    labels.push("Expenses");
    values.push(expenseTotal);
  }
  const total = values.reduce((sum, value) => sum + value, 0) || 1;
  const palette = ["#1a73e8", "#fbbc04", "#34a853", "#ea4335", "#5b6b7a", "#4285f4", "#1c5744"];
  let start = 0;
  const gradientParts = labels.length
    ? labels.map((label, index) => {
        const angle = (values[index] / total) * 360;
        const color = label === "Expenses" ? "#ea4335" : palette[index % palette.length];
        const part = `${color} ${start}deg ${start + angle}deg`;
        start += angle;
        return part;
      })
    : ["#e6e0cc 0deg 360deg"];

  container.innerHTML = `
    <div class="simple-pie-wrap">
      <div class="simple-pie" style="background: conic-gradient(${gradientParts.join(", ")});"></div>
      <div class="simple-legend">
        ${labels.length ? labels.map((label, index) => `
          <div class="simple-legend-item"><span class="simple-legend-swatch" style="background:${label === "Expenses" ? "#ea4335" : palette[index % palette.length]}"></span>${escapeHtml(label)}</div>
        `).join("") : '<div class="simple-legend-item"><span class="simple-legend-swatch" style="background:#e6e0cc"></span>No data yet</div>'}
      </div>
    </div>
  `;
}

function getExpenseTotals(expenses) {
  const totals = {};
  expenses.forEach((item) => {
    const key = item.name || "Expense";
    totals[key] = (totals[key] || 0) + (item.price || 0) * (item.quantity || 0);
  });
  return totals;
}

function renderSimpleExpenseChart(container, expenses) {
  if (!container) return;
  const totals = getExpenseTotals(expenses);
  const labels = Object.keys(totals);
  const values = Object.values(totals);
  const total = values.reduce((sum, value) => sum + value, 0) || 1;
  const palette = ["#ea4335", "#fbbc04", "#5b6b7a", "#1a73e8", "#34a853", "#c25b32", "#1c5744"];
  let start = 0;
  const gradientParts = labels.length
    ? labels.map((label, index) => {
        const angle = (values[index] / total) * 360;
        const part = `${palette[index % palette.length]} ${start}deg ${start + angle}deg`;
        start += angle;
        return part;
      })
    : ["#e6e0cc 0deg 360deg"];

  container.innerHTML = `
    <div class="simple-pie-wrap">
      <div class="simple-pie" style="background: conic-gradient(${gradientParts.join(", ")});"></div>
      <div class="simple-legend">
        ${labels.length ? labels.map((label, index) => `
          <div class="simple-legend-item"><span class="simple-legend-swatch" style="background:${palette[index % palette.length]}"></span>${escapeHtml(label)}</div>
        `).join("") : '<div class="simple-legend-item"><span class="simple-legend-swatch" style="background:#e6e0cc"></span>No data yet</div>'}
      </div>
    </div>
  `;
}

function renderTopContributors(contributions) {
  const totals = {};
  contributions.forEach((c) => {
    const key = c.contributorName || "Unknown";
    if (!totals[key]) totals[key] = { amount: 0, count: 0 };
    totals[key].amount += c.amount || 0;
    totals[key].count += 1;
  });
  const rows = Object.entries(totals).sort((a, b) => b[1].amount - a[1].amount).slice(0, 8);

  const body = document.getElementById("topContributorsBody");
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="3"><div class="empty-state"><div class="glyph">◆</div><p>No contributions recorded yet.</p></div></td></tr>`;
    return;
  }
  body.innerHTML = rows.map(([name, v]) => `
    <tr><td>${escapeHtml(name)}</td><td class="amount">${fmt(v.amount)}</td><td class="amount">${v.count}</td></tr>
  `).join("");
}

function renderRecentActivity(contributions) {
  const rows = [...contributions].sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 8);
  const body = document.getElementById("recentActivityBody");
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="4"><div class="empty-state"><div class="glyph">✎</div><p>Nothing encoded yet.</p></div></td></tr>`;
    return;
  }
  body.innerHTML = rows.map((c) => `
    <tr>
      <td>${c.date || "—"}</td>
      <td>${escapeHtml(c.contributorName || "—")}</td>
      <td><span class="badge">${escapeHtml(c.typeName || "—")}</span></td>
      <td class="amount">${fmt(c.amount)}</td>
    </tr>
  `).join("");
}

function renderExportSummary(contributions, expenses) {
  const body = document.getElementById("exportSummaryBody");
  const range = document.getElementById("exportRange").value;
  const now = new Date();
  const start = range === "weekly" ? getMonday(now) : new Date(now.getFullYear(), now.getMonth(), 1);
  const end = range === "weekly" ? new Date(now) : new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const collectionTotal = contributions.filter((c) => c.date && c.date >= formatDate(start) && c.date <= formatDate(end)).reduce((sum, item) => sum + (item.amount || 0), 0);
  const expenseTotal = expenses.filter((item) => item.date && item.date >= formatDate(start) && item.date <= formatDate(end)).reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 0), 0);
  body.innerHTML = `<tr><td>${range === "weekly" ? "This week" : "This month"}</td><td class="amount">${fmt(collectionTotal)}</td><td class="amount">${fmt(expenseTotal)}</td><td class="amount">${fmt(collectionTotal - expenseTotal)}</td></tr>`;
}

function exportDashboardReport() {
  const range = document.getElementById("exportRange").value;
  const now = new Date();
  const title = range === "weekly" ? "Weekly Ledger Report" : "Monthly Ledger Report";
  const start = range === "weekly" ? getMonday(now) : new Date(now.getFullYear(), now.getMonth(), 1);
  const end = range === "weekly" ? new Date(now) : new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const contributions = latestDashboardData.contributions || [];
  const expenses = latestDashboardData.expenses || [];
  const filteredContributions = contributions.filter((c) => c.date && c.date >= formatDate(start) && c.date <= formatDate(end));
  const filteredExpenses = expenses.filter((item) => item.date && item.date >= formatDate(start) && item.date <= formatDate(end));

  const collectionTotal = filteredContributions.reduce((sum, item) => sum + (item.amount || 0), 0);
  const expenseTotal = filteredExpenses.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 0), 0);
  const netTotal = collectionTotal - expenseTotal;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: Calibri, Arial, sans-serif; margin: 40px; line-height: 1.6; }
    h1 { color: #1a73e8; border-bottom: 3px solid #1a73e8; padding-bottom: 10px; }
    h2 { color: #1a73e8; margin-top: 20px; border-left: 4px solid #fbbc04; padding-left: 10px; }
    .summary { background: #f8fafc; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #1a73e8; }
    .summary-item { margin: 8px 0; font-size: 14px; }
    .summary-label { font-weight: bold; display: inline-block; width: 150px; }
    .summary-value { font-family: 'Courier New', monospace; }
    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    th { background: #1a73e8; color: white; padding: 10px; text-align: left; font-weight: 600; }
    td { padding: 8px; border-bottom: 1px solid #ddd; }
    tr:hover { background: #f8fafc; }
    tr.contribution-row { border-left: 3px solid #34a853; }
    tr.expense-row { border-left: 3px solid #ea4335; color: #ea4335; }
    .contribution-badge { display: inline-block; background: #c6e3b5; color: #2d8e47; padding: 2px 6px; border-radius: 3px; font-size: 12px; font-weight: 600; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p>Generated on: <strong>${now.toDateString()}</strong></p>
  <p>Period: <strong>${formatDate(start)}</strong> to <strong>${formatDate(end)}</strong></p>

  <div class="summary">
    <div class="summary-item">
      <span class="summary-label">Collections:</span>
      <span class="summary-value" style="color: #34a853; font-weight: bold;">${fmt(collectionTotal)}</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">Expenses:</span>
      <span class="summary-value" style="color: #ea4335; font-weight: bold;">${fmt(expenseTotal)}</span>
    </div>
    <div class="summary-item" style="font-size: 16px; margin-top: 10px; padding-top: 10px; border-top: 1px solid #ddd;">
      <span class="summary-label">Net Total:</span>
      <span class="summary-value" style="color: #34a853; font-weight: bold; font-size: 18px;">${fmt(netTotal)}</span>
    </div>
  </div>

  <h2>✓ Contributions</h2>
  ${filteredContributions.length ? `
  <table>
    <thead>
      <tr><th>Date</th><th>Contributor</th><th>Type</th><th>Amount</th></tr>
    </thead>
    <tbody>
      ${filteredContributions.map((c) => `<tr class="contribution-row"><td>${c.date}</td><td>${escapeHtml(c.contributorName || "—")}</td><td>${escapeHtml(c.typeName || "—")}</td><td style="text-align: right; color: #34a853; font-weight: 600;">${fmt(c.amount)}</td></tr>`).join("")}
    </tbody>
  </table>
  ` : "<p>No contributions recorded.</p>"}\n
  <h2>✕ Expenses</h2>
  ${filteredExpenses.length ? `
  <table>
    <thead>
      <tr><th>Date</th><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr>
    </thead>
    <tbody>
      ${filteredExpenses.map((item) => `<tr class="expense-row"><td>${item.date}</td><td>${escapeHtml(item.name || "—")}</td><td style="text-align: center;">${item.quantity}</td><td style="text-align: right;">${fmt(item.price)}</td><td style="text-align: right; font-weight: 600;">-${fmt((item.price || 0) * (item.quantity || 0))}</td></tr>`).join("")}
    </tbody>
  </table>
  ` : "<p>No expenses recorded.</p>"}\n
  <p style="margin-top: 30px; font-size: 12px; color: #666;">This report was generated from The Ledger application.</p>
</body>
</html>`;

  const dateStr = range === "weekly" 
    ? `Week of ${formatDate(start)}`
    : now.toLocaleString(undefined, { month: "long", year: "numeric" });
  const filename = `Ledger Report - ${dateStr}.html`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(date.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}
