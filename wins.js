/* =========================================================
   WINS — wins.js
   A private "wins channel" — small logged victories (money, fitness,
   general), meant to be a pleasant thing to revisit, not just a table.
   The dollar amount field is for the person's own tracking and for
   Profile's tally — it deliberately does NOT scale points awarded
   (flat per-category value; see gamification.js). Own localStorage
   namespace, no cross-talk with any other module.
   ========================================================= */

(function () {
"use strict";

const STORAGE_KEY = "wins_state_v1";
const MONTH_LABELS = ["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];
const CATEGORIES = ["money", "fitness", "general"];
const CATEGORY_LABELS = { money: "MONEY", fitness: "FITNESS", general: "GENERAL" };

/* ---------- STATE ---------- */
function defaultState() { return { wins: [] }; }
let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return { wins: Array.isArray(parsed.wins) ? parsed.wins : [] };
  } catch (e) {
    console.error("Failed to load wins state, resetting.", e);
    return defaultState();
  }
}
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

/* ---------- DATE UTILITIES ---------- */
function pad2(n) { return String(n).padStart(2, "0"); }
function formatDate(d) { d = new Date(d); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function todayStr() { return formatDate(new Date()); }
function fmtDateShort(dateStr) {
  const [y,m,d] = dateStr.split("-").map(Number);
  return `${MONTH_LABELS[m-1].slice(0,3)} ${d}`;
}
function fmtMonthLong(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  return `${MONTH_LABELS[m - 1]} ${y}`;
}
function escapeHTML(s) {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
}

/* ---------- RUNTIME (non-persisted) STATE ---------- */
let editingId = null;      // win id being edited via the log sheet, or null when logging new
let logCategory = "general";
let logDate = todayStr();
let logCalView = new Date();

const el = (id) => document.getElementById(id);

/* ---------- RENDER ROOT (with error boundary) ---------- */
function render() {
  let html;
  let hadError = false;
  try {
    html = listScreenHTML();
  } catch (err) {
    console.error("Wins render error:", err);
    html = errorScreenHTML(err);
    hadError = true;
  }
  el("wins-screen").innerHTML = html;
  el("wn-top-strip").style.display = "flex";

  if (hadError) { attachErrorScreenHandlers(); return; }
  try {
    attachHandlers();
  } catch (err) {
    console.error("Wins handler-wiring error:", err);
    el("wins-screen").innerHTML = errorScreenHTML(err);
    attachErrorScreenHandlers();
  }
}
function errorScreenHTML(err) {
  const msg = (err && err.message) ? err.message : String(err);
  const stack = (err && err.stack) ? err.stack : "";
  return `<div class="wk-builder-panel" style="border-color:var(--danger);">
    <h1 class="screen-h1" style="color:var(--danger);">SOMETHING WENT WRONG</h1>
    <p class="hint-text">The Wins screen hit an error. Your data is safe — nothing was deleted.</p>
    <label class="field-label">ERROR</label>
    <div class="text-input" style="white-space:pre-wrap; word-break:break-word; font-family:var(--font-mono); font-size:11px; user-select:text;">${escapeHTML(msg)}</div>
    ${stack ? `<label class="field-label">DETAILS</label>
    <div class="text-input" style="white-space:pre-wrap; word-break:break-word; font-family:var(--font-mono); font-size:10px; max-height:160px; overflow-y:auto; user-select:text;">${escapeHTML(stack)}</div>` : ""}
    <button class="btn-primary" id="btn-wn-error-home">RELOAD WINS</button>
  </div>`;
}
function attachErrorScreenHandlers() {
  const btn = el("btn-wn-error-home");
  if (btn) btn.onclick = () => render();
}

/* ---------- LIST SCREEN (reverse-chron, grouped by month — same
   grouping pattern Workouts' History tab already uses) ---------- */
function listScreenHTML() {
  if (!state.wins.length) {
    return `<h1 class="screen-h1">WINS</h1>
      <button class="wk-dashed-card" style="width:100%; text-align:center; margin-bottom:18px;" id="btn-wn-new">+ LOG WIN</button>
      <p class="hint-text" style="text-align:center; padding:30px 0;">No wins logged yet. Small or big, log it here.</p>`;
  }
  const sorted = state.wins.slice().sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const grouped = {};
  sorted.forEach((w) => {
    const key = w.date.substring(0, 7);
    (grouped[key] = grouped[key] || []).push(w);
  });
  const blocks = Object.keys(grouped).sort().reverse().map((month) => `
    <div class="wk-history-group">${fmtMonthLong(month).toUpperCase()}</div>
    ${grouped[month].map((w) => `
      <button class="wk-history-row win-card cat-${w.category}" data-open-win="${w.id}">
        <span><span class="hr-name">${escapeHTML(w.title || "Untitled win")}</span><br><span class="hr-sub">${CATEGORY_LABELS[w.category] || "GENERAL"}${w.note ? " · " + escapeHTML(w.note.slice(0, 60)) : ""}</span></span>
        <span><span class="hr-date">${fmtDateShort(w.date)}</span><br>${w.category === "money" && w.amount ? `<span class="hr-count">$${Number(w.amount).toLocaleString()}</span>` : ""}</span>
      </button>`).join("")}`).join("");

  return `<h1 class="screen-h1">WINS</h1>
    <button class="wk-dashed-card" style="width:100%; text-align:center; margin-bottom:18px;" id="btn-wn-new">+ LOG WIN</button>
    ${blocks}`;
}

/* ---------- LOG / EDIT SHEET ---------- */
function calendarGridHTML() {
  const y = logCalView.getFullYear(), m = logCalView.getMonth();
  const first = new Date(y, m, 1);
  const gridStart = new Date(y, m, 1 - first.getDay());
  const today = todayStr();
  let html = "";
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart); d.setDate(gridStart.getDate() + i);
    const ds = formatDate(d);
    const cls = [];
    if (d.getMonth() !== m) cls.push("other-month");
    if (ds === today) cls.push("today");
    if (ds === logDate) cls.push("selected");
    html += `<button type="button" data-wn-date="${ds}" class="${cls.join(" ")}">${d.getDate()}</button>`;
  }
  return html;
}
function renderLogCalendar() {
  el("wn-cal-label").textContent = logCalView.toLocaleDateString("default", { month: "long", year: "numeric" }).toUpperCase();
  el("wn-cal-grid").innerHTML = calendarGridHTML();
  document.querySelectorAll("[data-wn-date]").forEach((b) => b.onclick = () => { logDate = b.getAttribute("data-wn-date"); renderLogCalendar(); });
}
function setLogCategorySeg(val) {
  document.querySelectorAll("#seg-wn-category .seg-btn").forEach((b) => b.classList.toggle("active", b.getAttribute("data-val") === val));
  el("wn-amount-wrap").hidden = val !== "money";
}
function openLogSheet(winId) {
  const w = winId ? state.wins.find((x) => x.id === winId) : null;
  editingId = winId || null;
  logCategory = w ? w.category : "general";
  logDate = w ? w.date : todayStr();
  logCalView = new Date(logDate + "T12:00:00");
  el("wn-sheet-title").textContent = w ? "EDIT WIN" : "LOG WIN";
  el("wn-title").value = w ? w.title : "";
  el("wn-amount").value = w && w.amount != null ? w.amount : "";
  el("wn-note").value = w ? (w.note || "") : "";
  el("btn-wn-delete").hidden = !w;
  setLogCategorySeg(logCategory);
  renderLogCalendar();
  el("wn-overlay").classList.add("open");
}
function closeLogSheet() { el("wn-overlay").classList.remove("open"); }

document.querySelectorAll("#seg-wn-category .seg-btn").forEach((btn) => {
  btn.addEventListener("click", () => { logCategory = btn.getAttribute("data-val"); setLogCategorySeg(logCategory); });
});
el("wn-cal-prev").addEventListener("click", () => { logCalView.setMonth(logCalView.getMonth() - 1); renderLogCalendar(); });
el("wn-cal-next").addEventListener("click", () => { logCalView.setMonth(logCalView.getMonth() + 1); renderLogCalendar(); });
el("btn-close-wn").addEventListener("click", closeLogSheet);
el("wn-overlay").addEventListener("click", (e) => { if (e.target.id === "wn-overlay") closeLogSheet(); });

el("btn-wn-save").addEventListener("click", () => {
  const title = el("wn-title").value.trim();
  if (!title) { flashInvalid(el("wn-title")); return; }
  const amount = logCategory === "money" && el("wn-amount").value !== "" ? Number(el("wn-amount").value) : null;
  const note = el("wn-note").value.trim() || null;
  if (editingId) {
    const w = state.wins.find((x) => x.id === editingId);
    if (w) { w.title = title; w.category = logCategory; w.amount = amount; w.note = note; w.date = logDate; }
  } else {
    state.wins.push({
      id: uid(), category: logCategory, title, note, amount, date: logDate,
      createdAt: new Date().toISOString()
    });
  }
  save();
  closeLogSheet();
  render();
  window.showToast && window.showToast(editingId ? "WIN UPDATED" : "WIN LOGGED");
});
el("btn-wn-delete").addEventListener("click", () => {
  if (!editingId) return;
  state.wins = state.wins.filter((x) => x.id !== editingId);
  save();
  closeLogSheet();
  render();
  window.showToast && window.showToast("WIN DELETED");
});
function flashInvalid(input) {
  input.style.borderColor = "var(--danger)";
  setTimeout(() => { input.style.borderColor = ""; }, 900);
}

/* ---------- HANDLERS ---------- */
function attachHandlers() {
  document.querySelectorAll("[data-open-win]").forEach((b) => b.onclick = () => openLogSheet(b.getAttribute("data-open-win")));
  const newBtn = el("btn-wn-new");
  if (newBtn) newBtn.onclick = () => openLogSheet(null);
}

/* ---------- TOP STRIP ---------- */
el("btn-wins-back").addEventListener("click", () => window.goToDashboard());
el("btn-wins-settings").addEventListener("click", () => window.openMergedSettings());

/* ---------- PUBLIC INTERFACE ---------- */
window.WinsData = {
  getState: () => state,
  setState: (newState) => { state = newState; render(); },
  wipe: () => { state = defaultState(); save(); render(); },
  populateSettings: () => {},
  goHome: () => { render(); },
  // Quick-add entry point (global bottom-strip plus button).
  openCreate: () => { openLogSheet(null); },
  // Used by gamification.js's point calculation and Profile's summary.
  countByCategory: () => {
    const counts = { money: 0, fitness: 0, general: 0 };
    state.wins.forEach((w) => { counts[w.category] = (counts[w.category] || 0) + 1; });
    return counts;
  }
};

/* ---------- INIT ---------- */
render();

})();
