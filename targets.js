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
function targetIconSVG(size) {
  size = size || 20;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>`;
}
function cogIconSVG(size) {
  size = size || 16;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>`;
}
function flameIconSVG(size) {
  size = size || 14;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2"><path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z"/></svg>`;
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

function streakAnchor(habit) {
  const dates = sortedRelapseDates(habit);
  const lastRelapse = dates.length ? dates[dates.length - 1] : null;
  return lastRelapse && lastRelapse > habit.startDate ? lastRelapse : habit.startDate;
}

/* ---------- CONTRIBUTION-GRAPH HEATMAP ----------
   GitHub-style: weeks as columns (Sun..Sat top-to-bottom), aligned so the
   most recent column ends on today. Shared by the card (compact, no
   labels) and the read-only detail view (full, with weekday/month
   labels). Cells are emitted column-major (week 0's 7 days, then week
   1's 7 days, ...) to match `grid-auto-flow: column` in CSS. */
function contributionCells(habit, weeksCount, today) {
  today = today || todayStr();
  const dow = new Date(today + "T12:00:00").getDay();
  const startOfThisWeek = addDaysStr(today, -dow);
  const gridStart = addDaysStr(startOfThisWeek, -(weeksCount - 1) * 7);
  const relapseSet = new Set(sortedRelapseDates(habit));
  const anchor = streakAnchor(habit);
  const cells = [];
  for (let i = 0; i < weeksCount * 7; i++) {
    const ds = addDaysStr(gridStart, i);
    let cellState;
    if (ds > today) cellState = "future";
    else if (ds < habit.startDate) cellState = "before-start";
    else if (relapseSet.has(ds)) cellState = "relapse";
    else cellState = ds >= anchor ? "current" : "clean";
    cells.push({ date: ds, state: cellState });
  }
  return cells;
}
const WEEKDAY_LABEL_COLS = ["", "", "TU", "", "TH", "", "SA"]; // Sun..Sat, alternating like a GitHub graph
function contributionMonthLabels(cells, weeksCount) {
  const labels = new Array(weeksCount).fill("");
  let lastMonth = null;
  for (let col = 0; col < weeksCount; col++) {
    const sunday = cells[col * 7];
    const m = new Date(sunday.date + "T12:00:00").getMonth();
    if (m !== lastMonth) { labels[col] = MONTH_LABELS[m].slice(0, 3); lastMonth = m; }
  }
  return labels;
}
function contributionGridHTML(habit, weeksCount, today, compact) {
  const cells = contributionCells(habit, weeksCount, today);
  const gridCells = cells.map((c) => `<div class="tg-cc ${c.state}" title="${c.date}"></div>`).join("");
  const gridHTML = `<div class="tg-contrib-grid" style="grid-template-columns:repeat(${weeksCount},1fr);">${gridCells}</div>`;
  if (compact) return `<div class="tg-contrib compact">${gridHTML}</div>`;
  const monthsHTML = contributionMonthLabels(cells, weeksCount).map((m) => `<div>${m}</div>`).join("");
  const wdHTML = WEEKDAY_LABEL_COLS.map((w) => `<span>${w}</span>`).join("");
  return `<div class="tg-contrib">
    <div class="tg-contrib-top">
      <div class="tg-contrib-weekdays">${wdHTML}</div>
      <div class="tg-contrib-body">
        <div class="tg-contrib-months" style="grid-template-columns:repeat(${weeksCount},1fr);">${monthsHTML}</div>
        ${gridHTML}
      </div>
    </div>
  </div>`;
}

/* Read-only month calendar for the detail view: dot = a clean day since
   habit start, filled = inside the current unbroken streak, red outline
   = a logged relapse. Purely informational, no click handlers. */
function viewCalendarGridHTML(view, habit, today) {
  const y = view.getFullYear(), m = view.getMonth();
  const first = new Date(y, m, 1);
  const gridStart = new Date(y, m, 1 - first.getDay());
  const relapseSet = new Set(sortedRelapseDates(habit));
  const anchor = streakAnchor(habit);
  let html = "";
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart); d.setDate(gridStart.getDate() + i);
    const ds = formatDate(d);
    const cls = [];
    if (d.getMonth() !== m) cls.push("other-month");
    if (ds === today) cls.push("today");
    if (relapseSet.has(ds)) {
      cls.push("relapse-day");
    } else if (ds >= habit.startDate && ds <= today) {
      cls.push("tracked-day");
      if (ds >= anchor) cls.push("current-streak-day");
    }
    html += `<button type="button" class="${cls.join(" ")}" disabled>${d.getDate()}</button>`;
  }
  return html;
}

/* ---------- RUNTIME (non-persisted) STATE ---------- */
let screen = null;          // null | 'view' | 'edit'
let editingId = null;       // habit id being viewed, or null while creating
let draft = null;           // in-memory record while creating
let tgCalView = new Date(); // start-date picker month cursor (edit screen)
let tgDetailCalView = new Date(); // read-only streak calendar cursor (view screen)
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
    html = screen === "edit" ? detailScreenHTML() : screen === "view" ? viewScreenHTML() : listScreenHTML();
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

  // Tapping the card opens a read-only view (name, description, heatmap,
  // streak calendar); the cog is the only route into full edit/settings.
  const cardHTML = (h) => {
    const streak = currentStreakDays(h, today);
    const term = isTerminated(h, today);
    const heatmap = contributionGridHTML(h, 18, today, true);
    return `<div class="habit-card ${term ? "terminated" : ""}">
      <button class="hc-open" data-open-habit="${h.id}">
        <div class="hc-hero">
          <div class="hc-icon">${targetIconSVG(18)}</div>
          <div class="hc-hero-body">
            <div class="hc-name">${escapeHTML(h.name)}</div>
            <div class="hc-sub">${term ? "TERMINATED" : "TARGET " + h.targetDays + " DAYS"}</div>
          </div>
          <div class="hc-streak-pill">${streak}<span>D</span></div>
        </div>
        ${heatmap}
      </button>
      <button class="hc-settings-btn" data-edit-habit="${h.id}" aria-label="Target settings">${cogIconSVG(15)}</button>
    </div>`;
  };

  return `<h1 class="screen-h1">TARGETS</h1>
    ${readout}
    <button class="wk-dashed-card" style="width:100%; text-align:center; margin-bottom:18px;" id="btn-tg-new">+ ADD TARGET</button>
    ${state.habits.length === 0 ? `<p class="hint-text" style="text-align:center; padding:30px 0;">No targets yet. Add one above.</p>` : ""}
    ${active.length ? `<h2 class="group-title"><span class="tick"></span>IN PROGRESS</h2>${active.map(cardHTML).join("")}` : ""}
    ${terminated.length ? `<h2 class="group-title muted" style="margin-top:22px;"><span class="tick"></span>TERMINATED</h2>${terminated.map(cardHTML).join("")}` : ""}`;
}

/* ---------- READ-ONLY VIEW SCREEN ----------
   Opened by tapping a card: name, description, heatmap, streak calendar.
   No editable fields here — the cog (on the card, and again in this
   screen's pill row) is the only way into the full edit/settings screen. */
function viewScreenHTML() {
  const h = currentHabit();
  if (!h) return "";
  const today = todayStr();
  const streak = currentStreakDays(h, today);
  const term = isTerminated(h, today);
  const heatmap = contributionGridHTML(h, 26, today, false);

  return `
    <div class="tg-view-header">
      <div class="tg-view-icon">${targetIconSVG(20)}</div>
      <div class="tg-view-titles">
        <div class="tg-view-name">${escapeHTML(h.name)}</div>
        <div class="tg-view-sub">${h.reason ? escapeHTML(h.reason) : "No description"}</div>
      </div>
      <button class="icon-btn" id="btn-tg-view-close" aria-label="Close">
        <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M6.4 5L5 6.4L10.6 12L5 17.6L6.4 19L12 13.4L17.6 19L19 17.6L13.4 12L19 6.4L17.6 5L12 10.6z"/></svg>
      </button>
    </div>
    ${heatmap}
    <div class="tg-view-pills">
      <span class="tg-status-badge ${term ? "terminated" : "active"}" style="margin:0;">${term ? "TERMINATED" : "TARGET " + h.targetDays + "D"}</span>
      <span class="tg-flame-pill">${flameIconSVG(13)}${streak}</span>
      <button class="hc-settings-btn" id="btn-tg-view-edit" aria-label="Target settings">${cogIconSVG(15)}</button>
    </div>
    <div class="calendar-panel corner-bracket" style="margin-top:16px;">
      <div class="cal-header">
        <button type="button" id="tg-view-cal-prev" class="icon-btn small">‹</button>
        <div>${tgDetailCalView.toLocaleDateString("default", { month: "long", year: "numeric" }).toUpperCase()}</div>
        <button type="button" id="tg-view-cal-next" class="icon-btn small">›</button>
      </div>
      <div class="cal-weekdays"><span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span></div>
      <div class="cal-grid">${viewCalendarGridHTML(tgDetailCalView, h, today)}</div>
    </div>
  `;
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
  if (screen === "edit") { attachDetailHandlers(); return; }
  if (screen === "view") { attachViewHandlers(); return; }
  document.querySelectorAll("[data-open-habit]").forEach((b) => b.onclick = () => openView(b.getAttribute("data-open-habit")));
  document.querySelectorAll("[data-edit-habit]").forEach((b) => b.onclick = () => openEdit(b.getAttribute("data-edit-habit")));
  const newBtn = el("btn-tg-new");
  if (newBtn) newBtn.onclick = () => openPresetSheet();
}

function attachViewHandlers() {
  const h = currentHabit();
  if (!h) return;

  const closeBtn = el("btn-tg-view-close");
  if (closeBtn) closeBtn.onclick = () => { screen = null; editingId = null; draft = null; render(); };

  const editBtn = el("btn-tg-view-edit");
  if (editBtn) editBtn.onclick = () => openEdit(h.id);

  const calPrev = el("tg-view-cal-prev");
  if (calPrev) calPrev.onclick = () => { tgDetailCalView.setMonth(tgDetailCalView.getMonth() - 1); render(); };
  const calNext = el("tg-view-cal-next");
  if (calNext) calNext.onclick = () => { tgDetailCalView.setMonth(tgDetailCalView.getMonth() + 1); render(); };
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

function openView(habitId) {
  editingId = habitId; draft = null;
  tgDetailCalView = new Date();
  screen = "view";
  render();
}

function openEdit(habitId) {
  editingId = habitId; draft = null;
  const h = state.habits.find((x) => x.id === habitId);
  tgCalView = new Date((h ? h.startDate : todayStr()) + "T12:00:00");
  expandedRelapseId = null;
  screen = "edit";
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
  screen = "edit";
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
