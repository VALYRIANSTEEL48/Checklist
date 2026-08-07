/* =========================================================
   TARGETS — targets.js
   Habit elimination, tracked as the inverse of the Checklist streak:
   every day you don't log the habit is a day of progress; logging it
   resets the current streak. "Terminated" is derived live from the data
   (current unbroken streak >= target), never stored, so a later relapse
   just flips it back without any state to reconcile. Own localStorage
   namespace, no cross-talk with any other module.
   ========================================================= */

(function () {
"use strict";

const STORAGE_KEY = "targets_state_v1";
const MONTH_LABELS = ["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];

/* ---------- STATE ---------- */
function defaultState() { return { habits: [] }; }
let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return { habits: Array.isArray(parsed.habits) ? parsed.habits : [] };
  } catch (e) {
    console.error("Failed to load targets state, resetting.", e);
    return defaultState();
  }
}
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

/* ---------- DATE UTILITIES ---------- */
function pad2(n) { return String(n).padStart(2, "0"); }
function formatDate(d) { d = new Date(d); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function todayStr() { return formatDate(new Date()); }
function daysBetween(aStr, bStr) {
  const a = new Date(aStr + "T12:00:00");
  const b = new Date(bStr + "T12:00:00");
  return Math.round((b - a) / 86400000);
}
function addDaysStr(ds, n) {
  const d = new Date(ds + "T12:00:00");
  d.setDate(d.getDate() + n);
  return formatDate(d);
}
function fmtDateShort(dateStr) {
  const [y,m,d] = dateStr.split("-").map(Number);
  return `${MONTH_LABELS[m-1].slice(0,3)} ${d}`;
}
function escapeHTML(s) {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
}

/* ---------- STREAK ENGINE (pure) ---------- */
function sortedRelapseDates(habit) {
  return (habit.relapses || []).map((r) => r.date).slice().sort();
}
function currentStreakDays(habit, today) {
  today = today || todayStr();
  const dates = sortedRelapseDates(habit);
  const lastRelapse = dates.length ? dates[dates.length - 1] : null;
  const anchor = lastRelapse && lastRelapse > habit.startDate ? lastRelapse : habit.startDate;
  return Math.max(0, daysBetween(anchor, today));
}
function isTerminated(habit, today) {
  return currentStreakDays(habit, today) >= habit.targetDays;
}
function longestStreakDays(habit, today) {
  today = today || todayStr();
  const dates = sortedRelapseDates(habit);
  let longest = 0;
  let anchor = habit.startDate;
  dates.forEach((relapseDate) => {
    if (relapseDate < anchor) return;
    longest = Math.max(longest, daysBetween(anchor, relapseDate));
    anchor = relapseDate;
  });
  return Math.max(longest, currentStreakDays(habit, today));
}
// Total days-ever a habit has been "clean" — current streak plus every
// historical clean segment between relapses. Used by gamification.js's
// +3/clean-day point source. Deliberately mirrors longestStreakDays'
// anchor-walk exactly (same segment-length math via daysBetween) rather
// than counting calendar days one by one, so it agrees with
// currentStreakDays/longestStreakDays' counting convention — for a habit
// with zero relapses this equals currentStreakDays exactly, not
// currentStreakDays+1 from also counting the start day itself.
function totalCleanDaysEver(habit, today) {
  today = today || todayStr();
  const dates = sortedRelapseDates(habit);
  let total = 0;
  let anchor = habit.startDate;
  dates.forEach((relapseDate) => {
    if (relapseDate < anchor) return;
    total += daysBetween(anchor, relapseDate);
    anchor = relapseDate;
  });
  total += Math.max(0, daysBetween(anchor, today));
  return total;
}

function historyTape(habit, days, today) {
  today = today || todayStr();
  const relapseDateSet = new Set(sortedRelapseDates(habit));
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const ds = addDaysStr(today, -i);
    if (ds < habit.startDate) { out.push({ date: ds, state: "before-start" }); continue; }
    if (ds > today) { out.push({ date: ds, state: "future" }); continue; }
    out.push({ date: ds, state: relapseDateSet.has(ds) ? "relapse" : "clean" });
  }
  return out;
}

/* ---------- RUNTIME (non-persisted) STATE ---------- */
let screen = null;          // null | 'detail'
let editingId = null;       // habit id being viewed, or null while creating
let draft = null;           // in-memory record while creating
let tgCalView = new Date(); // start-date picker month cursor (detail screen)
let relapseCalView = new Date();
let relapseDate = null;     // selected date in the log-relapse sheet
let relapseTargetValue = 90;
let expandedRelapseId = null;

const el = (id) => document.getElementById(id);

function currentHabit() {
  return editingId ? state.habits.find((h) => h.id === editingId) : draft;
}

/* ---------- RENDER ROOT (with error boundary) ---------- */
function render() {
  let html;
  let hadError = false;
  try {
    html = screen === "detail" ? detailScreenHTML() : listScreenHTML();
  } catch (err) {
    console.error("Targets render error:", err);
    html = errorScreenHTML(err);
    hadError = true;
  }
  el("targets-screen").innerHTML = html;
  el("tg-top-strip").style.display = "flex";

  if (hadError) { attachErrorScreenHandlers(); return; }
  try {
    attachHandlers();
  } catch (err) {
    console.error("Targets handler-wiring error:", err);
    el("targets-screen").innerHTML = errorScreenHTML(err);
    attachErrorScreenHandlers();
  }
}
function errorScreenHTML(err) {
  const msg = (err && err.message) ? err.message : String(err);
  const stack = (err && err.stack) ? err.stack : "";
  return `<div class="wk-builder-panel" style="border-color:var(--danger);">
    <h1 class="screen-h1" style="color:var(--danger);">SOMETHING WENT WRONG</h1>
    <p class="hint-text">The Targets screen hit an error. Your data is safe — nothing was deleted.</p>
    <label class="field-label">ERROR</label>
    <div class="text-input" style="white-space:pre-wrap; word-break:break-word; font-family:var(--font-mono); font-size:11px; user-select:text;">${escapeHTML(msg)}</div>
    ${stack ? `<label class="field-label">DETAILS</label>
    <div class="text-input" style="white-space:pre-wrap; word-break:break-word; font-family:var(--font-mono); font-size:10px; max-height:160px; overflow-y:auto; user-select:text;">${escapeHTML(stack)}</div>` : ""}
    <button class="btn-primary" id="btn-tg-error-home">GO TO TARGETS HOME</button>
  </div>`;
}
function attachErrorScreenHandlers() {
  const btn = el("btn-tg-error-home");
  if (btn) btn.onclick = () => { screen = null; editingId = null; draft = null; render(); };
}

/* ---------- LIST SCREEN ---------- */
function listScreenHTML() {
  const today = todayStr();
  const active = state.habits.filter((h) => !isTerminated(h, today))
    .sort((a, b) => (currentStreakDays(b, today) / b.targetDays) - (currentStreakDays(a, today) / a.targetDays));
  const terminated = state.habits.filter((h) => isTerminated(h, today))
    .sort((a, b) => currentStreakDays(b, today) - currentStreakDays(a, today));

  const readout = `
    <div class="tg-readout-panel corner-bracket">
      <div class="tg-readout-block"><div class="readout-label">IN PROGRESS</div><div class="readout-value" style="font-size:26px;">${pad2(active.length)}</div></div>
      <div class="tg-readout-block"><div class="readout-label">TERMINATED</div><div class="readout-value" style="font-size:26px;">${pad2(terminated.length)}</div></div>
    </div>`;

  // Pulls Targets' visual identity toward Checklist's streak header (big
  // dominant number) instead of Assignments' project-card look — the
  // streak count is the single most important thing on this card, so it
  // gets readout-value-scale treatment, with a compact history strip
  // underneath reading as "here's your actual history" rather than a
  // percentage bar.
  const cardHTML = (h) => {
    const streak = currentStreakDays(h, today);
    const term = isTerminated(h, today);
    const tape = historyTape(h, 14, today);
    const tapeHTML = tape.map((t) => `<div class="hb ${t.state}" title="${t.date}"></div>`).join("");
    return `<button class="habit-card ${term ? "terminated" : ""}" data-open-habit="${h.id}">
      <div class="hc-hero">
        <div class="hc-streak-big">${streak}</div>
        <div class="hc-hero-body">
          <div class="hc-name">${escapeHTML(h.name)}</div>
          <div class="hc-sub">${term ? "TERMINATED" : "TARGET " + h.targetDays + " DAYS"}</div>
        </div>
      </div>
      <div class="tg-history-tape">${tapeHTML}</div>
    </button>`;
  };

  return `<h1 class="screen-h1">TARGETS</h1>
    ${readout}
    <button class="wk-dashed-card" style="width:100%; text-align:center; margin-bottom:18px;" id="btn-tg-new">+ ADD TARGET</button>
    ${state.habits.length === 0 ? `<p class="hint-text" style="text-align:center; padding:30px 0;">No targets yet. Add one above.</p>` : ""}
    ${active.length ? `<h2 class="group-title"><span class="tick"></span>IN PROGRESS</h2>${active.map(cardHTML).join("")}` : ""}
    ${terminated.length ? `<h2 class="group-title muted" style="margin-top:22px;"><span class="tick"></span>TERMINATED</h2>${terminated.map(cardHTML).join("")}` : ""}`;
}

/* ---------- DETAIL / CREATE-EDIT SCREEN ---------- */
function calendarGridHTML(view, selectedDate) {
  const y = view.getFullYear(), m = view.getMonth();
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
    if (ds === selectedDate) cls.push("selected");
    if (ds > today) cls.push("past"); // reuse dimming style for disallowed future dates
    html += `<button type="button" data-tg-startdate="${ds}" class="${cls.join(" ")}" ${ds > today ? "disabled" : ""}>${d.getDate()}</button>`;
  }
  return html;
}

function detailScreenHTML() {
  const h = currentHabit();
  if (!h) return "";
  const isNew = !editingId;
  const today = todayStr();
  const streak = isNew ? 0 : currentStreakDays(h, today);
  const term = !isNew && isTerminated(h, today);
  const longest = !isNew ? longestStreakDays(h, today) : 0;
  const hasRelapses = !isNew && (h.relapses || []).length > 0;

  // Detail screen has room for a denser, more calendar-like read than the
  // card's compact strip — a 6-week (42-day) grid, 7 wide, like a
  // compressed contribution graph.
  const tape = !isNew ? historyTape(h, 42, today) : [];
  const tapeHTML = tape.map((t) => `<div class="hb ${t.state}" title="${t.date}"></div>`).join("");

  const relapsesSorted = !isNew ? (h.relapses || []).slice().sort((a, b) => b.date.localeCompare(a.date)) : [];
  const relapseListHTML = relapsesSorted.map((r) => {
    const expanded = expandedRelapseId === r.id;
    return `<button class="relapse-row" data-toggle-relapse="${r.id}">
      <div class="rr-date">${fmtDateShort(r.date)}</div>
      ${expanded ? `
        <div class="relapse-detail-block" style="margin-top:8px; margin-bottom:0;">
          <div class="rd-label">TRIGGER</div><div class="rd-text">${escapeHTML(r.trigger || "—")}</div>
          <div class="rd-label">WHAT WILL CHANGE</div><div class="rd-text">${escapeHTML(r.adjustment || "—")}</div>
          ${r.notes ? `<div class="rd-label">NOTES</div><div class="rd-text">${escapeHTML(r.notes)}</div>` : ""}
        </div>` : `<div class="rr-snippet">${escapeHTML(r.trigger || "No details")}</div>`}
    </button>`;
  }).join("");

  let actionHTML = "";
  if (isNew) {
    actionHTML = `<button class="btn-primary" id="btn-tg-create">CREATE TARGET</button>`;
  } else {
    actionHTML = `<button class="btn-secondary" id="btn-tg-log-relapse">LOG RELAPSE</button>
      <button class="btn-danger-outline" id="btn-tg-delete">DELETE TARGET</button>`;
  }

  const statusBadge = isNew ? "" : `<span class="tg-status-badge ${term ? "terminated" : "active"}">${term ? "TERMINATED" : "IN PROGRESS"}</span>`;

  const readoutBlock = isNew ? "" : `
    <div class="readout-panel corner-bracket" style="margin-bottom:18px;">
      <div class="readout-main">
        <div class="readout-block"><div class="readout-label">CURRENT STREAK</div><div class="readout-value">${streak}</div></div>
        <div class="readout-divider"></div>
        <div class="readout-block"><div class="readout-label">TARGET</div><div class="readout-sub">${h.targetDays} DAYS</div><div class="hint-text" style="margin-top:4px;">BEST: ${longest}D</div></div>
      </div>
      <div class="tg-heatmap">${tapeHTML}</div>
    </div>`;

  return `
    ${screenHeaderHTML(isNew ? "NEW TARGET" : escapeHTML(h.name))}
    ${statusBadge}
    ${readoutBlock}
    <label class="field-label" style="margin-top:0;">NAME</label>
    <input type="text" class="text-input" id="tg-name" value="${escapeHTML(h.name)}" placeholder="e.g. Smoking">

    <label class="field-label">REASON — WHY GET RID OF IT?</label>
    <textarea class="text-input" id="tg-reason" style="height:80px;" placeholder="What this is costing you, why it matters">${escapeHTML(h.reason || "")}</textarea>

    <label class="field-label">TARGET (DAYS)</label>
    <div class="stepper">
      <button type="button" id="tg-target-minus">−</button>
      <div class="stepper-value" id="tg-target-value">${h.targetDays}</div>
      <button type="button" id="tg-target-plus">+</button>
    </div>

    ${!hasRelapses ? `
    <label class="field-label">START DATE</label>
    <div class="calendar-panel corner-bracket">
      <div class="cal-header">
        <button type="button" id="tg-cal-prev" class="icon-btn small">‹</button>
        <div>${tgCalView.toLocaleDateString("default", { month: "long", year: "numeric" }).toUpperCase()}</div>
        <button type="button" id="tg-cal-next" class="icon-btn small">›</button>
      </div>
      <div class="cal-weekdays"><span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span></div>
      <div class="cal-grid">${calendarGridHTML(tgCalView, h.startDate)}</div>
    </div>` : `<label class="field-label">STARTED</label><p class="hint-text">${fmtDateShort(h.startDate)} — locked once a relapse is logged, so history stays accurate.</p>`}

    <div style="margin-top:14px;">${actionHTML}</div>

    ${!isNew && relapsesSorted.length ? `<div class="builder-section-title">RELAPSE HISTORY</div>${relapseListHTML}` : ""}
  `;
}
function screenHeaderHTML(title) {
  return `<div style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
    <button class="icon-btn" id="btn-tg-detail-back">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
    </button>
    <h1 class="screen-h1" style="margin:0;">${title}</h1>
  </div>`;
}

/* ---------- HANDLERS ---------- */
function attachHandlers() {
  if (screen === "detail") { attachDetailHandlers(); return; }
  document.querySelectorAll("[data-open-habit]").forEach((b) => b.onclick = () => openDetail(b.getAttribute("data-open-habit")));
  const newBtn = el("btn-tg-new");
  if (newBtn) newBtn.onclick = () => openPresetSheet();
}

function attachDetailHandlers() {
  const h = currentHabit();
  if (!h) return;
  const isNew = !editingId;
  const commit = () => { if (!isNew) save(); };

  const backBtn = el("btn-tg-detail-back");
  if (backBtn) backBtn.onclick = () => { screen = null; editingId = null; draft = null; render(); };

  el("tg-name").onblur = (e) => { h.name = e.target.value; commit(); };
  el("tg-reason").onblur = (e) => { h.reason = e.target.value; commit(); };

  el("tg-target-minus").onclick = () => { h.targetDays = Math.max(1, h.targetDays - 1); commit(); el("tg-target-value").textContent = h.targetDays; };
  el("tg-target-plus").onclick = () => { h.targetDays = h.targetDays + 1; commit(); el("tg-target-value").textContent = h.targetDays; };

  const calPrev = el("tg-cal-prev");
  if (calPrev) calPrev.onclick = () => { tgCalView.setMonth(tgCalView.getMonth() - 1); render(); };
  const calNext = el("tg-cal-next");
  if (calNext) calNext.onclick = () => { tgCalView.setMonth(tgCalView.getMonth() + 1); render(); };
  document.querySelectorAll("[data-tg-startdate]").forEach((b) => b.onclick = () => {
    if (b.hasAttribute("disabled")) return;
    h.startDate = b.getAttribute("data-tg-startdate"); commit(); render();
  });

  document.querySelectorAll("[data-toggle-relapse]").forEach((b) => b.onclick = () => {
    const id = b.getAttribute("data-toggle-relapse");
    expandedRelapseId = expandedRelapseId === id ? null : id;
    render();
  });

  const createBtn = el("btn-tg-create");
  if (createBtn) createBtn.onclick = () => {
    const name = el("tg-name").value.trim();
    if (!name) { flashInvalid(el("tg-name")); return; }
    const record = {
      id: uid(), name, reason: el("tg-reason").value, targetDays: h.targetDays || 90,
      startDate: h.startDate || todayStr(), createdAt: new Date().toISOString(), relapses: []
    };
    state.habits.push(record);
    save();
    editingId = record.id; draft = null;
    render();
    window.showToast && window.showToast("TARGET CREATED");
  };

  const logRelapseBtn = el("btn-tg-log-relapse");
  if (logRelapseBtn) logRelapseBtn.onclick = () => openRelapseSheet();

  const deleteBtn = el("btn-tg-delete");
  if (deleteBtn) deleteBtn.onclick = () => {
    if (confirm(`Delete "${h.name}"? All history for it will be lost.`)) {
      state.habits = state.habits.filter((x) => x.id !== h.id);
      save();
      screen = null; editingId = null; draft = null;
      render();
      window.showToast && window.showToast("DELETED");
    }
  };
}
function flashInvalid(input) {
  input.style.borderColor = "var(--danger)";
  setTimeout(() => { input.style.borderColor = ""; }, 900);
}

function openDetail(habitId) {
  editingId = habitId; draft = null;
  const h = state.habits.find((x) => x.id === habitId);
  tgCalView = new Date((h ? h.startDate : todayStr()) + "T12:00:00");
  expandedRelapseId = null;
  screen = "detail";
  render();
}

/* ---------- PRESET PICKER SHEET ---------- */
function openSheet(id) { el(id).classList.add("open"); }
function closeSheet(id) { el(id).classList.remove("open"); }
function openPresetSheet() { openSheet("tg-preset-overlay"); }
function startDraft(name) {
  closeSheet("tg-preset-overlay");
  editingId = null;
  draft = { name: name || "", reason: "", targetDays: 90, startDate: todayStr() };
  tgCalView = new Date();
  screen = "detail";
  render();
}
document.querySelectorAll("[data-preset]").forEach((b) => b.addEventListener("click", () => startDraft(b.getAttribute("data-preset"))));
el("btn-tg-preset-custom").addEventListener("click", () => startDraft(""));
el("btn-close-tg-preset").addEventListener("click", () => closeSheet("tg-preset-overlay"));
el("tg-preset-overlay").addEventListener("click", (e) => { if (e.target.id === "tg-preset-overlay") closeSheet("tg-preset-overlay"); });

/* ---------- LOG RELAPSE SHEET ---------- */
function relapseCalendarGridHTML() {
  const y = relapseCalView.getFullYear(), m = relapseCalView.getMonth();
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
    if (ds === relapseDate) cls.push("selected");
    if (ds > today) cls.push("past");
    html += `<button type="button" data-relapse-date="${ds}" class="${cls.join(" ")}" ${ds > today ? "disabled" : ""}>${d.getDate()}</button>`;
  }
  return html;
}
function renderRelapseCalendar() {
  el("tg-relapse-cal-label").textContent = relapseCalView.toLocaleDateString("default", { month: "long", year: "numeric" }).toUpperCase();
  el("tg-relapse-cal-grid").innerHTML = relapseCalendarGridHTML();
  document.querySelectorAll("[data-relapse-date]").forEach((b) => b.onclick = () => {
    if (b.hasAttribute("disabled")) return;
    relapseDate = b.getAttribute("data-relapse-date");
    renderRelapseCalendar();
  });
}
function openRelapseSheet() {
  const h = currentHabit();
  relapseDate = todayStr();
  relapseCalView = new Date();
  relapseTargetValue = h.targetDays;
  el("tg-relapse-trigger").value = "";
  el("tg-relapse-adjustment").value = "";
  el("tg-relapse-notes").value = "";
  el("tg-relapse-target-value").textContent = relapseTargetValue;
  renderRelapseCalendar();
  openSheet("tg-relapse-overlay");
}
el("tg-relapse-cal-prev").addEventListener("click", () => { relapseCalView.setMonth(relapseCalView.getMonth() - 1); renderRelapseCalendar(); });
el("tg-relapse-cal-next").addEventListener("click", () => { relapseCalView.setMonth(relapseCalView.getMonth() + 1); renderRelapseCalendar(); });
el("tg-relapse-target-minus").addEventListener("click", () => { relapseTargetValue = Math.max(1, relapseTargetValue - 1); el("tg-relapse-target-value").textContent = relapseTargetValue; });
el("tg-relapse-target-plus").addEventListener("click", () => { relapseTargetValue = relapseTargetValue + 1; el("tg-relapse-target-value").textContent = relapseTargetValue; });
el("btn-close-tg-relapse").addEventListener("click", () => closeSheet("tg-relapse-overlay"));
el("tg-relapse-overlay").addEventListener("click", (e) => { if (e.target.id === "tg-relapse-overlay") closeSheet("tg-relapse-overlay"); });
el("btn-tg-relapse-confirm").addEventListener("click", () => {
  const h = currentHabit();
  if (!h || !editingId) { closeSheet("tg-relapse-overlay"); return; }
  h.relapses = h.relapses || [];
  h.relapses.push({
    id: uid(), date: relapseDate || todayStr(),
    trigger: el("tg-relapse-trigger").value,
    adjustment: el("tg-relapse-adjustment").value,
    notes: el("tg-relapse-notes").value,
    createdAt: new Date().toISOString()
  });
  h.targetDays = relapseTargetValue;
  save();
  closeSheet("tg-relapse-overlay");
  render();
  window.showToast && window.showToast("LOGGED — BACK TO DAY 0");
});

/* ---------- TOP STRIP ---------- */
el("btn-targets-back").addEventListener("click", () => window.goToDashboard());
el("btn-targets-settings").addEventListener("click", () => window.openMergedSettings());

/* ---------- PUBLIC INTERFACE ---------- */
window.TargetsData = {
  getState: () => state,
  setState: (newState) => { state = newState; render(); },
  wipe: () => { state = defaultState(); save(); render(); },
  populateSettings: () => {},
  trackedCount: () => state.habits.length,
  bestStreak: () => state.habits.reduce((max, h) => Math.max(max, currentStreakDays(h, todayStr())), 0),
  goHome: () => { screen = null; editingId = null; draft = null; render(); },
  // Both for gamification.js's point calculation — pure reads over the
  // existing engine functions, nothing new stored.
  totalCleanDaysAcrossHabits: () => state.habits.reduce((sum, h) => sum + totalCleanDaysEver(h, todayStr()), 0),
  // "Reached its goal" is based on longest-ever streak, not current — a
  // habit that terminated and later relapsed keeps having earned this,
  // one-time, per the design (award once per habit, not once per day
  // it stays terminated).
  terminatedCount: () => state.habits.filter((h) => longestStreakDays(h, todayStr()) >= h.targetDays).length
};

/* ---------- INIT ---------- */
render();

})();
