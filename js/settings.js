import { listContributionTypes, addContributionType, deleteContributionType } from "./db.js";
import { escapeHtml } from "./utils.js";
import { reloadDropdowns } from "./contributions.js";

export async function initSettings() {
  document.getElementById("typeForm").addEventListener("submit", onSubmit);
  await refreshTypes();
}

async function refreshTypes() {
  const types = await listContributionTypes();
  const body = document.getElementById("typeBody");
  if (!types.length) {
    body.innerHTML = `<tr><td colspan="3"><div class="empty-state"><div class="glyph">⚙</div><p>No contribution types yet. Add your first one above.</p></div></td></tr>`;
    return;
  }
  body.innerHTML = types.map((t) => `
    <tr>
      <td>${escapeHtml(t.name)}</td>
      <td>${t.defaultAmount != null ? escapeHtml(String(t.defaultAmount)) : "—"}</td>
      <td><div class="row-actions"><button class="icon-btn danger" data-del="${t.id}">Delete</button></div></td>
    </tr>
  `).join("");
  body.querySelectorAll("[data-del]").forEach((btn) => btn.addEventListener("click", async () => {
    if (!confirm("Delete this contribution type? Past records that used it will keep their original label.")) return;
    await deleteContributionType(btn.getAttribute("data-del"));
    await refreshTypes();
    await reloadDropdowns();
  }));
}

async function onSubmit(e) {
  e.preventDefault();
  const input = document.getElementById("tyName");
  const amountInput = document.getElementById("tyAmount");
  const status = document.getElementById("typeFormMsg");
  const name = input.value.trim();
  if (!name) return;
  const payload = {
    name,
    defaultAmount: amountInput.value === "" ? null : Number(amountInput.value)
  };
  try {
    await addContributionType(payload);
    status.textContent = "Contribution type added.";
    status.style.color = "var(--accent-green)";
    input.value = "";
    amountInput.value = "";
    await refreshTypes();
    await reloadDropdowns();
  } catch (err) {
    status.textContent = "Could not save the type. Please try again.";
    status.style.color = "var(--brick)";
  }
}
