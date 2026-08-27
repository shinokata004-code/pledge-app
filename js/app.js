import { watchAuth, session, logout, can } from "./auth.js";
import { initDashboard } from "./dashboard.js";
import { initCalendar } from "./calendar.js";
import { initContributions } from "./contributions.js";
import { initContributors } from "./contributors.js";
import { initSettings } from "./settings.js";
import { initUsers } from "./users.js";
import { initExpenses } from "./expenses.js";
import { initAccount } from "./account.js";

const views = ["dashboard", "calendar", "contributions", "contributors", "expenses", "settings", "users", "account"];
let initialized = false;

function loadThemePreference() {
  const saved = localStorage.getItem("ledger-theme");
  if (saved === "dark") {
    document.body.classList.add("dark-mode");
  }
}

function setThemePreference(isDark) {
  document.body.classList.toggle("dark-mode", isDark);
  localStorage.setItem("ledger-theme", isDark ? "dark" : "light");
  document.querySelectorAll(".theme-toggle").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(isDark));
    const label = btn.querySelector(".theme-toggle-label");
    if (label) label.textContent = isDark ? "Light mode" : "Night mode";
    const icon = btn.querySelector(".theme-toggle-icon");
    if (icon) icon.textContent = isDark ? "☀️" : "🌙";
  });
}

loadThemePreference();
setThemePreference(document.body.classList.contains("dark-mode"));

watchAuth({
  onReady: (profile) => {
    document.getElementById("sbName").textContent = profile.name || session.email;
    document.getElementById("sbEmail").textContent = session.email;
    const roleBadge = document.getElementById("sbRole");
    roleBadge.textContent = profile.role || session.role;

    applyRoleVisibility(session.role);

    if (!initialized) {
      initialized = true;
      wireNav();
      wireLogout();
      wireMobileChrome();
      initDashboard();
      initCalendar();
      initContributions();
      initContributors();
      initExpenses();
      initAccount();
      if (can("manageTypes")) {
        initSettings();
      }
      if (can("manageUsers")) {
        initUsers();
      }
      switchView("dashboard");
    }
  },
  onSignedOut: (message) => {
    if (message) sessionStorage.setItem("ledger_flash_error", message);
    window.location.href = "index.html";
  }
});

function applyRoleVisibility(role) {
  document.querySelectorAll("[data-role]").forEach((el) => {
    const required = el.getAttribute("data-role");
    el.style.display = role === required ? "" : "none";
  });
  // Hide the encode form (but keep the table) for viewers.
  const encodeCard = document.getElementById("encodeFormCard");
  if (encodeCard) encodeCard.style.display = can("encodeContributions") ? "" : "none";
  const contributorFormCard = document.getElementById("contributorFormCard");
  if (contributorFormCard) contributorFormCard.style.display = can("manageContributors") ? "" : "none";
  const expenseFormCard = document.getElementById("expenseFormCard");
  if (expenseFormCard) expenseFormCard.style.display = can("manageExpenses") ? "" : "none";
}

function wireNav() {
  document.querySelectorAll(".nav-item[data-view]").forEach((item) => {
    item.addEventListener("click", () => {
      switchView(item.getAttribute("data-view"));
      closeDrawer();
    });
  });

  document.querySelectorAll(".theme-toggle").forEach((toggle) => {
    toggle.addEventListener("click", () => {
      const isDark = !document.body.classList.contains("dark-mode");
      setThemePreference(isDark);
    });
  });
}

function switchView(name) {
  views.forEach((v) => {
    const section = document.getElementById("view-" + v);
    if (section) section.classList.toggle("active", v === name);
  });
  document.querySelectorAll(".nav-item[data-view]").forEach((item) => {
    item.classList.toggle("active", item.getAttribute("data-view") === name);
  });
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
}

function wireLogout() {
  document.getElementById("logoutBtn").addEventListener("click", () => logout());
}

function wireMobileChrome() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("drawerOverlay");
  const hamburger = document.getElementById("hamburgerBtn");
  hamburger.addEventListener("click", () => {
    sidebar.style.display = "flex";
    sidebar.style.position = "fixed";
    sidebar.style.zIndex = "50";
    sidebar.style.height = "100vh";
    overlay.classList.add("active");
  });
  overlay.addEventListener("click", closeDrawer);
}

function closeDrawer() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("drawerOverlay");
  if (window.innerWidth <= 760) sidebar.style.display = "none";
  overlay.classList.remove("active");
}
