/* =========================================================
   WORKOUTS — workout.js
   Vanilla-JS port of the Impulse workout tracker. Own localStorage
   namespace, own runtime state, mounts into #workout-screen inside
   #view-workout. No cross-talk with the Checklist module.
   ========================================================= */

(function () {
"use strict";

const STORAGE_KEY = "workout_state_v1";

const defaultTemplates = [
  { id: "pull", name: "Pull", icon: "pull", variants: [
    { id: "pull-heavy", name: "Heavy Compounds", exercises: [
      { id: "e1", name: "Deadlift", defaultSets: 4, defaultReps: 5 },
      { id: "e2", name: "Barbell Row", defaultSets: 4, defaultReps: 6 },
      { id: "e3", name: "Weighted Pull-ups", defaultSets: 4, defaultReps: 6 },
      { id: "e4", name: "Face Pulls", defaultSets: 3, defaultReps: 12 },
      { id: "e5", name: "Barbell Curl", defaultSets: 3, defaultReps: 8 },
    ]},
    { id: "pull-volume", name: "Volume Work", exercises: [
      { id: "e1", name: "Lat Pulldown", defaultSets: 4, defaultReps: 12 },
      { id: "e2", name: "Seated Cable Row", defaultSets: 4, defaultReps: 12 },
      { id: "e3", name: "Diverging Seated Row", defaultSets: 3, defaultReps: 12 },
      { id: "e4", name: "Reverse Pec Deck", defaultSets: 3, defaultReps: 15 },
      { id: "e5", name: "Hammer Curls", defaultSets: 3, defaultReps: 12 },
      { id: "e6", name: "Cable Curls", defaultSets: 3, defaultReps: 15 },
    ]},
  ]},
  { id: "push", name: "Push", icon: "push", variants: [
    { id: "push-heavy", name: "Heavy Compounds", exercises: [
      { id: "e1", name: "Bench Press", defaultSets: 4, defaultReps: 5 },
      { id: "e2", name: "Overhead Press", defaultSets: 4, defaultReps: 6 },
      { id: "e3", name: "Weighted Dips", defaultSets: 3, defaultReps: 8 },
      { id: "e4", name: "Close Grip Bench", defaultSets: 3, defaultReps: 8 },
    ]},
    { id: "push-volume", name: "Volume Work", exercises: [
      { id: "e1", name: "Incline DB Press", defaultSets: 4, defaultReps: 10 },
      { id: "e2", name: "Cable Flyes", defaultSets: 3, defaultReps: 12 },
      { id: "e3", name: "Lateral Raises", defaultSets: 4, defaultReps: 15 },
      { id: "e4", name: "Tricep Pushdowns", defaultSets: 3, defaultReps: 12 },
      { id: "e5", name: "Overhead Tricep Extension", defaultSets: 3, defaultReps: 12 },
    ]},
  ]},
  { id: "legs", name: "Legs", icon: "legs", variants: [
    { id: "legs-heavy", name: "Heavy Compounds", exercises: [
      { id: "e1", name: "Back Squat", defaultSets: 4, defaultReps: 5 },
      { id: "e2", name: "Romanian Deadlift", defaultSets: 4, defaultReps: 8 },
      { id: "e3", name: "Walking Lunges", defaultSets: 3, defaultReps: 10 },
      { id: "e4", name: "Calf Raises", defaultSets: 4, defaultReps: 12 },
    ]},
    { id: "legs-volume", name: "Volume Work", exercises: [
      { id: "e1", name: "Leg Press", defaultSets: 4, defaultReps: 12 },
      { id: "e2", name: "Leg Curl", defaultSets: 4, defaultReps: 12 },
      { id: "e3", name: "Leg Extension", defaultSets: 3, defaultReps: 15 },
      { id: "e4", name: "Hip Adductor", defaultSets: 3, defaultReps: 12 },
      { id: "e5", name: "Seated Calf Raises", defaultSets: 4, defaultReps: 15 },
    ]},
  ]},
];

/* ---------- STATE ---------- */
function defaultState() {
  return { templates: JSON.parse(JSON.stringify(defaultTemplates)), history: [], weeklyTarget: 7 };
}
let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const base = defaultState();
    return {
      templates: Array.isArray(parsed.templates) ? parsed.templates : base.templates,
      history: Array.isArray(parsed.history) ? parsed.history : [],
      weeklyTarget: typeof parsed.weeklyTarget === "number" ? parsed.weeklyTarget : 7
    };
  } catch (e) {
    console.error("Failed to load workout state, resetting.", e);
    return defaultState();
  }
}
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

/* ---------- DATE UTILITIES ---------- */
function pad2(n) { return String(n).padStart(2, "0"); }
function formatDate(d) { d = new Date(d); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }

function getWeekDays() {
  const today = new Date();
  const dow = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((dow + 6) % 7));
  const names = ["M","T","W","T","F","S","S"];
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push({ date: formatDate(d), dayName: names[i], dayNum: d.getDate(), isToday: formatDate(d) === formatDate(new Date()) });
  }
  return days;
}
function getMonthKey(monthsAgo) {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - monthsAgo);
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}`;
}
function getMonthName(monthsAgo) {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - monthsAgo);
  return d.toLocaleString("default", { month: "long" });
}
function getDaysInMonth(year, month0) { return new Date(year, month0 + 1, 0).getDate(); }
function getMonthCalendarData(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = getDaysInMonth(year, month - 1);
  const adj = firstDay === 0 ? 6 : firstDay - 1;
  const days = [];
  for (let i = 0; i < adj; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push({ day: i, date: `${year}-${pad2(month)}-${pad2(i)}` });
  return days;
}
function fmtWeekdayShort(dateStr) {
  return new Date(dateStr).toLocaleDateString("en-US", { weekday: "short", day: "numeric" });
}
function fmtMonthShort(dateStr) {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fmtMonthLong(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y, m - 1, 15).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}
function fmtFullDate(dateStr) {
  return new Date(dateStr).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

/* ---------- ICONS ---------- */
function iconSVG(name, size) {
  size = size || 24;
  const s = `width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"`;
  switch (name) {
    case "pull": return `<svg ${s}><path d="M4 12h16M4 12l4-4M4 12l4 4M20 12l-4-4M20 12l-4 4"/></svg>`;
    case "push": return `<svg ${s}><path d="M12 4v16M12 4l-4 4M12 4l4 4"/></svg>`;
    case "legs": return `<svg ${s}><path d="M12 4v4M8 8v12M16 8v12M8 14h8"/></svg>`;
    case "plus": return `<svg ${s}><path d="M12 5v14M5 12h14"/></svg>`;
    case "check": return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12l5 5L20 7"/></svg>`;
    case "edit": return `<svg ${s}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
    case "trash": return `<svg ${s}><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>`;
    case "note": return `<svg ${s}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>`;
    default: return `<svg ${s}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`;
  }
}

function screenHeaderHTML(title, backBtnId) {
  return `<div style="display:flex; align-items:center; gap:12px; margin-bottom:20px;">
    <button class="icon-btn" id="${backBtnId}">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
    </button>
    <h1 class="screen-h1" style="margin:0;">${title}</h1>
  </div>`;
}

function escapeHTML(s) {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
}

/* ---------- RUNTIME (non-persisted) STATE ---------- */
let screen = null;          // null | 'templates' | 'variants' | 'active' | 'builder'
let tab = "home";           // 'home' | 'history' | 'manage'
let selectedTemplate = null;
let selectedVariant = null;
let activeWorkout = null;
let editingTemplate = null;
let builder = null;         // { name, icon, variants, activeVar }
let selectedMonthKey = null;
let selectedHistoryId = null;
let noteExIdx = null;

const el = (id) => document.getElementById(id);
function isDrill() { return ["templates","variants","active","builder"].includes(screen); }

/* ---------- DERIVED DATA ---------- */
function workoutDaysSet() { return new Set(state.history.map((w) => w.date)); }
function weeklyCount() {
  const dates = getWeekDays().map((d) => d.date);
  return state.history.filter((w) => dates.includes(w.date)).length;
}
function monthlyDayCount(monthKey) {
  return new Set(state.history.filter((w) => w.date.startsWith(monthKey)).map((w) => w.date)).size;
}
function monthlyWorkoutCount(monthKey) {
  return state.history.filter((w) => w.date.startsWith(monthKey)).length;
}
function completedExercisesOf(workout) {
  if (!workout || !workout.exercises) return [];
  return workout.exercises
    .map((ex) => ({ ...ex, sets: ex.sets.filter((s) => s.weight !== "" && s.reps !== "" && s.weight !== undefined && s.reps !== undefined) }))
    .filter((ex) => ex.sets.length > 0 && ex.name && ex.name.trim() !== "");
}

/* ---------- RENDER ROOT ---------- */
function renderWorkout() {
  let html;
  if (screen === "templates") html = templatesScreenHTML();
  else if (screen === "variants") html = variantsScreenHTML();
  else if (screen === "active") html = activeScreenHTML();
  else if (screen === "builder") html = builderScreenHTML();
  else if (tab === "history") html = historyScreenHTML();
  else if (tab === "manage") html = manageScreenHTML();
  else html = homeScreenHTML();

  el("workout-screen").innerHTML = html;

  const showChrome = !isDrill();
  el("wk-top-strip").style.display = showChrome ? "flex" : "none";
  el("wk-tabbar").style.display = showChrome ? "flex" : "none";
  el("wk-top-title").textContent = tab === "history" ? "HISTORY" : tab === "manage" ? "MANAGE" : "WORKOUTS";
  document.querySelectorAll(".wk-tab-btn").forEach((b) => {
    b.classList.toggle("active", showChrome && b.getAttribute("data-tab") === tab);
  });

  attachScreenHandlers();
}

/* ---------- HOME SCREEN ---------- */
function homeScreenHTML() {
  const wc = weeklyCount();
  const target = Math.max(1, state.weeklyTarget);
  const pct = Math.min(wc, target) / target;
  const dash = (pct * 125.6).toFixed(1);
  const week = getWeekDays();
  const wdays = workoutDaysSet();

  const weekHTML = week.map((d) => `
    <div class="wk-day">
      <span class="wk-day-name">${d.dayName}</span>
      <div class="wk-day-dot ${wdays.has(d.date) ? "done" : d.isToday ? "today" : ""}">
        ${wdays.has(d.date) ? iconSVG("check", 16) : d.dayNum}
      </div>
    </div>`).join("");

  const seen = new Set();
  const recent = state.history.filter((w) => {
    const key = w.templateId + "-" + w.variantId;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, 5);

  const recentHTML = recent.length ? `
    <div class="wk-section-title">RECENT WORKOUTS <a data-goto-tab="history">SEE ALL →</a></div>
    <div class="wk-hscroll">
      ${recent.map((w) => {
        const t = state.templates.find((x) => x.id === w.templateId);
        return `<button class="wk-mini-card" data-recent-template="${t ? t.id : ""}">
          <div class="mc-icon">${iconSVG(t ? t.icon : "target", 20)}</div>
          <div class="mc-title">${escapeHTML(w.templateName)}</div>
          <div class="mc-sub">${escapeHTML(w.variantName)}</div>
          <div class="mc-sub">${fmtMonthShort(w.date)}</div>
        </button>`;
      }).join("")}
    </div>` : "";

  const monthsHTML = [0,1,2].map((ago) => {
    const key = getMonthKey(ago);
    const dayCount = monthlyDayCount(key);
    const [y, m] = key.split("-").map(Number);
    const totalDays = getDaysInMonth(y, m - 1);
    const isCurrent = ago === 0;
    return `<button class="wk-mini-card month-card ${isCurrent ? "current" : ""}" data-month="${key}">
      <div class="mc-title">${getMonthName(ago)}</div>
      <div class="wk-mini-bar"><div class="wk-mini-bar-fill" style="width:${Math.min((dayCount/totalDays)*100,100)}%"></div></div>
      <div class="mc-sub">${dayCount} / ${totalDays} days</div>
    </button>`;
  }).join("");

  return `
    <button class="wk-target-card" id="btn-open-target">
      <div class="wk-ring-wrap">
        <svg width="52" height="52">
          <circle cx="26" cy="26" r="20" fill="none" stroke="var(--panel-alt)" stroke-width="4" transform="rotate(-90 26 26)"/>
          <circle cx="26" cy="26" r="20" fill="none" stroke="var(--accent)" stroke-width="4" stroke-linecap="round"
            stroke-dasharray="${dash} 125.6" transform="rotate(-90 26 26)"/>
        </svg>
        <span class="wk-ring-label">${wc}/${target}</span>
      </div>
      <div class="wk-target-body">
        <div class="readout-label" style="margin-bottom:2px;">WEEKLY TARGET</div>
        <div style="font-size:13px;">${wc} workout${wc !== 1 ? "s" : ""}</div>
      </div>
      <span class="wk-target-tap">TAP TO EDIT</span>
    </button>

    <div class="wk-week-strip">
      <div class="readout-label">THIS WEEK</div>
      <div class="wk-day-row">${weekHTML}</div>
    </div>

    <button class="wk-start-btn" id="btn-start-workout">${iconSVG("plus", 18)} START NEW WORKOUT</button>

    ${recentHTML}

    <div class="wk-section-title">MONTHLY PROGRESS</div>
    <div class="wk-hscroll">${monthsHTML}</div>
  `;
}

/* ---------- TEMPLATES SCREEN ---------- */
function templatesScreenHTML() {
  const cards = state.templates.map((t) => `
    <button class="wk-template-card" data-select-template="${t.id}">
      <div class="tc-icon">${iconSVG(t.icon, 22)}</div>
      <div class="tc-name">${escapeHTML(t.name)}</div>
      <div class="tc-sub">${t.variants.length} variant${t.variants.length !== 1 ? "s" : ""}</div>
    </button>`).join("");
  return `
    ${screenHeaderHTML("CHOOSE WORKOUT", "btn-templates-back")}
    <div class="wk-grid-2">
      ${cards}
      <button class="wk-dashed-card" id="btn-new-from-templates">
        <div class="tc-icon">${iconSVG("plus", 22)}</div>
        <div class="tc-name">Create New</div>
      </button>
    </div>`;
}

/* ---------- VARIANTS SCREEN ---------- */
function variantsScreenHTML() {
  if (!selectedTemplate) return "";
  const rows = selectedTemplate.variants.map((v) => `
    <button class="wk-variant-card" data-select-variant="${v.id}">
      <div class="vc-name">${escapeHTML(v.name)}</div>
      <div class="vc-sub">${v.exercises.map((e) => escapeHTML(e.name)).join(" · ")}</div>
    </button>`).join("");
  return `
    ${screenHeaderHTML(escapeHTML(selectedTemplate.name), "btn-variants-back")}
    <p class="hint-text" style="margin-bottom:14px;">Select a variant:</p>
    ${rows}`;
}

/* ---------- ACTIVE WORKOUT SCREEN ---------- */
function hasCompletedSet() {
  return !!(activeWorkout && activeWorkout.exercises.some((ex) =>
    ex.sets.some((s) => s.weight !== "" && s.weight !== undefined && s.reps !== "" && s.reps !== undefined)));
}

function activeScreenHTML() {
  if (!activeWorkout) return "";
  const canComplete = hasCompletedSet();
  const exercisesHTML = activeWorkout.exercises.map((ex, exIdx) => `
    <div class="wk-exercise-card">
      <div class="wk-ex-head">
        <input type="text" class="wk-ex-name-input" data-ex-name="${exIdx}" value="${escapeHTML(ex.name)}" placeholder="Exercise name">
        <div class="wk-ex-actions">
          <button class="icon-btn small" data-ex-note="${exIdx}" style="color:${ex.note ? "var(--accent)" : "var(--text-dim)"}">${iconSVG("note", 18)}</button>
          <button class="icon-btn small" data-ex-remove="${exIdx}" ${activeWorkout.exercises.length <= 1 ? "disabled style='opacity:.3'" : ""}>${iconSVG("trash", 18)}</button>
        </div>
      </div>
      <div class="wk-set-header"><div>SET</div><div>WEIGHT</div><div>REPS</div><div></div></div>
      ${ex.sets.map((s, setIdx) => `
        <div class="wk-set-row">
          <div class="set-num">${setIdx + 1}</div>
          <input type="number" class="wk-set-input" inputmode="decimal" placeholder="lbs" value="${s.weight}" data-set-weight="${exIdx}:${setIdx}">
          <input type="number" class="wk-set-input" inputmode="numeric" value="${s.reps}" data-set-reps="${exIdx}:${setIdx}">
          <button class="wk-set-remove" data-set-remove="${exIdx}:${setIdx}">×</button>
        </div>`).join("")}
      <button class="wk-add-set" data-add-set="${exIdx}">+ ADD SET</button>
    </div>`).join("");

  return `
    <div style="display:flex; align-items:center; gap:12px; margin-bottom:6px;">
      <button class="icon-btn" id="btn-active-back">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <div>
        <h1 class="screen-h1" style="margin:0;">${escapeHTML(activeWorkout.templateName)}</h1>
        <p class="hint-text" style="margin:2px 0 0;">${escapeHTML(activeWorkout.variantName)}</p>
      </div>
    </div>
    <div style="margin-bottom:16px;"></div>
    ${exercisesHTML}
    <button class="wk-dashed-card" style="width:100%; text-align:center; margin-bottom:16px;" id="btn-add-exercise">+ ADD EXERCISE</button>
    <div class="wk-sticky-complete">
      <button class="wk-start-btn" id="btn-complete-workout" ${canComplete ? "" : "disabled style='opacity:.4'"}>${iconSVG("check", 18)} COMPLETE WORKOUT</button>
      ${canComplete ? "" : `<p class="hint-text" style="text-align:center;">Log at least one set to complete</p>`}
    </div>`;
}

/* ---------- HISTORY SCREEN ---------- */
function historyScreenHTML() {
  if (!state.history.length) {
    return `<h1 class="screen-h1">WORKOUT HISTORY</h1>
      <p class="hint-text" style="text-align:center; padding:40px 0;">No workouts logged yet.<br>Complete a workout to see it here.</p>`;
  }
  const grouped = {};
  state.history.forEach((w) => {
    const key = w.date.substring(0, 7);
    (grouped[key] = grouped[key] || []).push(w);
  });
  const blocks = Object.keys(grouped).sort().reverse().map((month) => `
    <div class="wk-history-group">${fmtMonthLong(month).toUpperCase()}</div>
    ${grouped[month].map((w) => {
      const count = completedExercisesOf(w).length;
      return `<button class="wk-history-row" data-open-history="${w.id}">
        <span><span class="hr-name">${escapeHTML(w.templateName)}</span><br><span class="hr-sub">${escapeHTML(w.variantName)}</span></span>
        <span><span class="hr-date">${fmtWeekdayShort(w.date)}</span><br><span class="hr-count">${count} exercise${count !== 1 ? "s" : ""}</span></span>
      </button>`;
    }).join("")}`).join("");
  return `<h1 class="screen-h1">WORKOUT HISTORY</h1>${blocks}`;
}

/* ---------- MANAGE SCREEN ---------- */
function manageScreenHTML() {
  const rows = state.templates.map((t) => `
    <div class="wk-manage-row">
      <div class="mr-left"><span class="mr-icon">${iconSVG(t.icon, 20)}</span>
        <div><div class="mr-name">${escapeHTML(t.name)}</div><div class="mr-sub">${t.variants.length} variant${t.variants.length !== 1 ? "s" : ""}</div></div>
      </div>
      <div class="mr-actions">
        <button class="icon-btn small" data-edit-template="${t.id}">${iconSVG("edit", 18)}</button>
        <button class="icon-btn small" data-delete-template="${t.id}">${iconSVG("trash", 18)}</button>
      </div>
    </div>`).join("");
  return `<h1 class="screen-h1">MANAGE WORKOUTS</h1>${rows}
    <button class="wk-dashed-card" style="width:100%; text-align:center;" id="btn-new-from-manage">+ CREATE NEW WORKOUT</button>`;
}

/* ---------- BUILDER SCREEN ---------- */
function builderScreenHTML() {
  if (!builder) return "";
  const icons = ["pull","push","legs","target"];
  const iconRow = icons.map((ic) => `<button data-set-icon="${ic}" class="${builder.icon === ic ? "active" : ""}">${iconSVG(ic, 20)}</button>`).join("");
  const tabs = builder.variants.map((v, idx) => `<button class="wk-variant-tab ${idx === builder.activeVar ? "active" : ""}" data-set-active-var="${idx}">${escapeHTML(v.name)}</button>`).join("");
  const activeVariant = builder.variants[builder.activeVar] || { name: "", exercises: [] };
  const exercisesHTML = activeVariant.exercises.map((ex, idx) => `
    <div class="wk-exercise-card">
      <input type="text" class="text-input" style="margin-bottom:8px;" data-bex-name="${idx}" value="${escapeHTML(ex.name)}" placeholder="Exercise name">
      <div style="display:flex; gap:8px; align-items:flex-end;">
        <div style="flex:1;"><label class="field-label" style="margin:0 0 4px;">SETS</label>
          <input type="number" class="text-input" data-bex-sets="${idx}" value="${ex.defaultSets}"></div>
        <div style="flex:1;"><label class="field-label" style="margin:0 0 4px;">REPS</label>
          <input type="number" class="text-input" data-bex-reps="${idx}" value="${ex.defaultReps}"></div>
        <button class="icon-btn small" data-bex-remove="${idx}">${iconSVG("trash", 18)}</button>
      </div>
    </div>`).join("");

  return `
    <div style="display:flex; align-items:center; gap:12px; margin-bottom:20px;">
      <button class="icon-btn" id="btn-builder-back">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <h1 class="screen-h1" style="margin:0;">${editingTemplate ? "EDIT WORKOUT" : "CREATE WORKOUT"}</h1>
    </div>

    <div class="wk-builder-panel">
      <label class="field-label" style="margin-top:0;">WORKOUT NAME</label>
      <input type="text" class="text-input" id="builder-name" value="${escapeHTML(builder.name)}" placeholder="e.g. Pull, Push, Arms...">
      <label class="field-label">ICON</label>
      <div class="wk-icon-picker">${iconRow}</div>
    </div>

    <div class="wk-variant-tabs">${tabs}<button class="wk-variant-tab add" id="btn-add-variant">+ ADD</button></div>

    <div class="wk-builder-panel">
      <input type="text" class="text-input" id="builder-variant-name" value="${escapeHTML(activeVariant.name)}" placeholder="Variant name" style="margin-bottom:14px; font-weight:600;">
      ${exercisesHTML}
      <button class="wk-dashed-card" style="width:100%; text-align:center;" id="btn-builder-add-exercise">+ ADD EXERCISE</button>
    </div>

    <button class="btn-primary" id="btn-builder-save">SAVE WORKOUT</button>
  `;
}

/* ---------- HANDLERS ---------- */
function attachScreenHandlers() {
  // HOME
  const openTarget = el("btn-open-target");
  if (openTarget) openTarget.onclick = openTargetSheet;
  const startBtn = el("btn-start-workout");
  if (startBtn) startBtn.onclick = () => { screen = "templates"; renderWorkout(); };
  document.querySelectorAll("[data-goto-tab]").forEach((a) => a.onclick = () => { tab = a.getAttribute("data-goto-tab"); screen = null; renderWorkout(); });
  document.querySelectorAll("[data-recent-template]").forEach((b) => b.onclick = () => {
    const t = state.templates.find((x) => x.id === b.getAttribute("data-recent-template"));
    if (t) { selectedTemplate = t; screen = "variants"; renderWorkout(); }
  });
  document.querySelectorAll("[data-month]").forEach((b) => b.onclick = () => { openMonthModal(b.getAttribute("data-month")); });

  // TEMPLATES
  document.querySelectorAll("[data-select-template]").forEach((b) => b.onclick = () => {
    selectedTemplate = state.templates.find((t) => t.id === b.getAttribute("data-select-template"));
    screen = "variants"; renderWorkout();
  });
  const newFromT = el("btn-new-from-templates");
  if (newFromT) newFromT.onclick = () => openBuilder(null);

  const tBack = el("btn-templates-back");
  if (tBack) tBack.onclick = () => { screen = null; tab = "home"; renderWorkout(); };

  // VARIANTS
  document.querySelectorAll("[data-select-variant]").forEach((b) => b.onclick = () => {
    const variant = selectedTemplate.variants.find((v) => v.id === b.getAttribute("data-select-variant"));
    selectVariant(variant);
  });
  const vBack = el("btn-variants-back");
  if (vBack) vBack.onclick = () => { screen = "templates"; renderWorkout(); };

  // ACTIVE WORKOUT
  document.querySelectorAll("[data-ex-name]").forEach((inp) => inp.onblur = (e) => {
    activeWorkout.exercises[Number(inp.getAttribute("data-ex-name"))].name = e.target.value;
  });
  document.querySelectorAll("[data-ex-note]").forEach((b) => b.onclick = () => openNoteSheet(Number(b.getAttribute("data-ex-note"))));
  document.querySelectorAll("[data-ex-remove]").forEach((b) => b.onclick = () => {
    const idx = Number(b.getAttribute("data-ex-remove"));
    if (activeWorkout.exercises.length > 1) { activeWorkout.exercises.splice(idx, 1); renderWorkout(); }
  });
  document.querySelectorAll("[data-set-weight]").forEach((inp) => inp.onblur = (e) => {
    const [exIdx, setIdx] = inp.getAttribute("data-set-weight").split(":").map(Number);
    activeWorkout.exercises[exIdx].sets[setIdx].weight = e.target.value;
    renderWorkout();
  });
  document.querySelectorAll("[data-set-reps]").forEach((inp) => inp.onblur = (e) => {
    const [exIdx, setIdx] = inp.getAttribute("data-set-reps").split(":").map(Number);
    activeWorkout.exercises[exIdx].sets[setIdx].reps = e.target.value;
    renderWorkout();
  });
  document.querySelectorAll("[data-set-remove]").forEach((b) => b.onclick = () => {
    const [exIdx, setIdx] = b.getAttribute("data-set-remove").split(":").map(Number);
    if (activeWorkout.exercises[exIdx].sets.length > 1) { activeWorkout.exercises[exIdx].sets.splice(setIdx, 1); renderWorkout(); }
  });
  document.querySelectorAll("[data-add-set]").forEach((b) => b.onclick = () => {
    const exIdx = Number(b.getAttribute("data-add-set"));
    const ex = activeWorkout.exercises[exIdx];
    ex.sets.push({ reps: ex.defaultReps, weight: "" });
    renderWorkout();
  });
  const addExBtn = el("btn-add-exercise");
  if (addExBtn) addExBtn.onclick = () => {
    activeWorkout.exercises.push({ id: "e-" + uid(), name: "", defaultSets: 3, defaultReps: 10, sets: [{ reps: 10, weight: "" }] });
    renderWorkout();
  };
  const completeBtn = el("btn-complete-workout");
  if (completeBtn) completeBtn.onclick = () => { if (hasCompletedSet()) completeWorkout(); };
  const activeBack = el("btn-active-back");
  if (activeBack) activeBack.onclick = backFromActive;

  // HISTORY
  document.querySelectorAll("[data-open-history]").forEach((b) => b.onclick = () => openHistoryDetail(b.getAttribute("data-open-history")));

  // MANAGE
  document.querySelectorAll("[data-edit-template]").forEach((b) => b.onclick = () => openBuilder(state.templates.find((t) => t.id === b.getAttribute("data-edit-template"))));
  document.querySelectorAll("[data-delete-template]").forEach((b) => b.onclick = () => {
    const t = state.templates.find((x) => x.id === b.getAttribute("data-delete-template"));
    if (t && confirm(`Delete "${t.name}"?`)) { state.templates = state.templates.filter((x) => x.id !== t.id); save(); renderWorkout(); }
  });
  const newFromM = el("btn-new-from-manage");
  if (newFromM) newFromM.onclick = () => openBuilder(null);

  // BUILDER
  const bBack = el("btn-builder-back");
  if (bBack) bBack.onclick = () => { editingTemplate = null; builder = null; screen = null; tab = "home"; renderWorkout(); };
  const bName = el("builder-name");
  if (bName) bName.onblur = (e) => { builder.name = e.target.value; };
  document.querySelectorAll("[data-set-icon]").forEach((b) => b.onclick = () => { builder.icon = b.getAttribute("data-set-icon"); renderWorkout(); });
  document.querySelectorAll("[data-set-active-var]").forEach((b) => b.onclick = () => { builder.activeVar = Number(b.getAttribute("data-set-active-var")); renderWorkout(); });
  const addVarBtn = el("btn-add-variant");
  if (addVarBtn) addVarBtn.onclick = () => {
    builder.variants.push({ id: "v-" + uid(), name: "Variant " + (builder.variants.length + 1), exercises: [] });
    builder.activeVar = builder.variants.length - 1;
    renderWorkout();
  };
  const bVarName = el("builder-variant-name");
  if (bVarName) bVarName.onblur = (e) => { builder.variants[builder.activeVar].name = e.target.value; };
  document.querySelectorAll("[data-bex-name]").forEach((inp) => inp.onblur = (e) => {
    builder.variants[builder.activeVar].exercises[Number(inp.getAttribute("data-bex-name"))].name = e.target.value;
  });
  document.querySelectorAll("[data-bex-sets]").forEach((inp) => inp.onblur = (e) => {
    builder.variants[builder.activeVar].exercises[Number(inp.getAttribute("data-bex-sets"))].defaultSets = parseInt(e.target.value) || 1;
  });
  document.querySelectorAll("[data-bex-reps]").forEach((inp) => inp.onblur = (e) => {
    builder.variants[builder.activeVar].exercises[Number(inp.getAttribute("data-bex-reps"))].defaultReps = parseInt(e.target.value) || 1;
  });
  document.querySelectorAll("[data-bex-remove]").forEach((b) => b.onclick = () => {
    builder.variants[builder.activeVar].exercises.splice(Number(b.getAttribute("data-bex-remove")), 1);
    renderWorkout();
  });
  const addExB = el("btn-builder-add-exercise");
  if (addExB) addExB.onclick = () => {
    builder.variants[builder.activeVar].exercises.push({ id: "e-" + uid(), name: "", defaultSets: 3, defaultReps: 10 });
    renderWorkout();
  };
  const saveB = el("btn-builder-save");
  if (saveB) saveB.onclick = saveBuilder;
}

/* ---------- ACTIONS ---------- */
function selectVariant(variant) {
  selectedVariant = variant;
  const exercises = variant.exercises.map((ex) => ({
    ...ex,
    sets: Array.from({ length: ex.defaultSets }, () => ({ reps: ex.defaultReps, weight: "" }))
  }));
  activeWorkout = {
    templateId: selectedTemplate.id, templateName: selectedTemplate.name,
    variantId: variant.id, variantName: variant.name,
    startTime: new Date().toISOString(), exercises
  };
  screen = "active";
  renderWorkout();
}

function completeWorkout() {
  const completed = { ...activeWorkout, id: uid(), endTime: new Date().toISOString(), date: formatDate(new Date()) };
  state.history = [completed, ...state.history];
  save();
  noteExIdx = null; activeWorkout = null; selectedVariant = null; selectedTemplate = null;
  screen = null; tab = "home";
  renderWorkout();
  window.showToast && window.showToast("WORKOUT LOGGED");
}

function backFromActive() {
  if (hasCompletedSet()) { openModal("wk-discard-overlay"); return; }
  discardWorkout();
}
function discardWorkout() {
  closeModal("wk-discard-overlay");
  noteExIdx = null; activeWorkout = null; selectedVariant = null;
  screen = "variants";
  renderWorkout();
}

function openBuilder(template) {
  editingTemplate = template;
  builder = {
    name: template ? template.name : "",
    icon: template ? template.icon : "target",
    variants: template ? JSON.parse(JSON.stringify(template.variants)) : [{ id: "v-" + uid(), name: "Default", exercises: [] }],
    activeVar: 0
  };
  screen = "builder";
  renderWorkout();
}
function saveBuilder() {
  const name = (el("builder-name") ? el("builder-name").value : builder.name).trim();
  if (!name) { alert("Enter a name"); return; }
  if (builder.variants.some((v) => v.exercises.length === 0)) { alert("Each variant needs exercises"); return; }
  if (builder.variants.some((v) => v.exercises.some((e) => !e.name || !e.name.trim()))) { alert("All exercises need names"); return; }
  const template = { id: editingTemplate ? editingTemplate.id : "t-" + uid(), name, icon: builder.icon, variants: builder.variants };
  if (editingTemplate) state.templates = state.templates.map((t) => (t.id === template.id ? template : t));
  else state.templates.push(template);
  save();
  editingTemplate = null; builder = null; screen = null; // preserves whichever tab we entered from
  renderWorkout();
  window.showToast && window.showToast("WORKOUT SAVED");
}

/* ---------- SHEETS / MODALS ---------- */
function openSheet(id) { el(id).classList.add("open"); }
function closeSheet(id) { el(id).classList.remove("open"); }
function openModal(id) { el(id).classList.add("open"); }
function closeModal(id) { el(id).classList.remove("open"); }

function openTargetSheet() {
  el("wk-target-value").textContent = state.weeklyTarget;
  openSheet("wk-target-overlay");
}
function setWeeklyTarget(n) {
  state.weeklyTarget = Math.max(1, n);
  save();
  el("wk-target-value").textContent = state.weeklyTarget;
  const sv = el("settings-target-value");
  if (sv) sv.textContent = state.weeklyTarget;
  if (!isDrill() && tab === "home") renderWorkout();
}
el("wk-target-minus").onclick = () => setWeeklyTarget(state.weeklyTarget - 1);
el("wk-target-plus").onclick = () => setWeeklyTarget(state.weeklyTarget + 1);
el("btn-target-done").onclick = () => closeSheet("wk-target-overlay");
el("btn-close-target").onclick = () => closeSheet("wk-target-overlay");
el("wk-target-overlay").addEventListener("click", (e) => { if (e.target.id === "wk-target-overlay") closeSheet("wk-target-overlay"); });

// merged settings sheet's weekly-target stepper (shared control, same underlying value)
el("settings-target-minus").onclick = () => setWeeklyTarget(state.weeklyTarget - 1);
el("settings-target-plus").onclick = () => setWeeklyTarget(state.weeklyTarget + 1);

function openNoteSheet(exIdx) {
  noteExIdx = exIdx;
  const ex = activeWorkout.exercises[exIdx];
  el("wk-note-exercise-name").textContent = ex.name || "Exercise";
  el("wk-note-input").value = ex.note || "";
  openSheet("wk-note-overlay");
}
el("btn-note-done").onclick = () => {
  if (noteExIdx !== null && activeWorkout) {
    activeWorkout.exercises[noteExIdx].note = el("wk-note-input").value.slice(0, 200);
  }
  closeSheet("wk-note-overlay");
  renderWorkout();
};
el("btn-close-note").onclick = () => closeSheet("wk-note-overlay");
el("wk-note-overlay").addEventListener("click", (e) => { if (e.target.id === "wk-note-overlay") closeSheet("wk-note-overlay"); });

function openMonthModal(monthKey) {
  selectedMonthKey = monthKey;
  el("wk-month-title").textContent = fmtMonthLong(monthKey).toUpperCase();
  const wdays = workoutDaysSet();
  const grid = getMonthCalendarData(monthKey).map((d) => {
    if (!d) return `<button disabled style="visibility:hidden;"></button>`;
    const done = wdays.has(d.date);
    return `<button class="${done ? "done" : ""}" disabled>${done ? iconSVG("check", 14) : d.day}</button>`;
  }).join("");
  el("wk-month-grid").innerHTML = grid;
  el("wk-month-days").textContent = monthlyDayCount(monthKey);
  el("wk-month-count").textContent = monthlyWorkoutCount(monthKey);
  openModal("wk-month-overlay");
}
el("btn-close-month").onclick = () => closeModal("wk-month-overlay");
el("wk-month-overlay").addEventListener("click", (e) => { if (e.target.id === "wk-month-overlay") closeModal("wk-month-overlay"); });

el("btn-discard-cancel").onclick = () => closeModal("wk-discard-overlay");
el("btn-discard-confirm").onclick = discardWorkout;
el("wk-discard-overlay").addEventListener("click", (e) => { if (e.target.id === "wk-discard-overlay") closeModal("wk-discard-overlay"); });

function openHistoryDetail(id) {
  const w = state.history.find((x) => x.id === id);
  if (!w) return;
  selectedHistoryId = id;
  el("wk-detail-title").textContent = w.templateName;
  el("wk-detail-sub").textContent = `${w.variantName} · ${fmtFullDate(w.date)}`;
  const exercises = completedExercisesOf(w);
  el("wk-detail-body").innerHTML = exercises.length ? exercises.map((ex) => `
    <div class="wk-detail-block">
      <div class="db-name">${escapeHTML(ex.name)}</div>
      <div class="wk-detail-set"><span class="num">#</span><span>WEIGHT</span><span>REPS</span></div>
      ${ex.sets.map((s, i) => `<div class="wk-detail-set"><span class="num">${i+1}</span><span class="wt">${escapeHTML(s.weight)} lbs</span><span>${escapeHTML(s.reps)} reps</span></div>`).join("")}
      ${ex.note ? `<div class="wk-detail-note">${escapeHTML(ex.note)}</div>` : ""}
    </div>`).join("") : `<p class="hint-text">No completed sets recorded.</p>`;
  el("wk-detail-ex-count").textContent = exercises.length;
  el("wk-detail-set-count").textContent = exercises.reduce((sum, ex) => sum + ex.sets.length, 0);
  openModal("wk-detail-overlay");
}
el("btn-close-detail").onclick = () => closeModal("wk-detail-overlay");
el("wk-detail-overlay").addEventListener("click", (e) => { if (e.target.id === "wk-detail-overlay") closeModal("wk-detail-overlay"); });

/* ---------- TOP STRIP / TAB BAR (persistent, wired once) ---------- */
el("btn-workout-back").addEventListener("click", () => window.goToDashboard());
el("btn-workout-settings").addEventListener("click", () => window.openMergedSettings());
document.querySelectorAll(".wk-tab-btn").forEach((b) => {
  b.addEventListener("click", () => {
    tab = b.getAttribute("data-tab");
    screen = null;
    renderWorkout();
  });
});

// Intercept the active-workout back action: since the active screen has no
// in-screen back button of its own in this layout (top strip is hidden while
// drilled in), back navigation for 'variants'/'templates'/'active'/'builder'
// is handled by dedicated buttons rendered inside each screen except active,
// which uses the shared top strip's back button when visible. To keep active
// workout's discard-confirmation behavior, we give active screen its own
// back control via the browser-level hardware back is out of scope; instead
// screen navigation buttons are rendered directly in each screen's HTML.

/* ---------- PUBLIC INTERFACE ---------- */
window.WorkoutData = {
  getState: () => state,
  setState: (newState) => { state = newState; save(); renderWorkout(); },
  wipe: () => { state = defaultState(); save(); renderWorkout(); },
  populateSettings: () => { el("settings-target-value").textContent = state.weeklyTarget; },
  weeklyStat: () => `${weeklyCount()}/${Math.max(1, state.weeklyTarget)} THIS WEEK`,
  refresh: () => renderWorkout(),
  goHome: () => { screen = null; tab = "home"; renderWorkout(); }
};

/* ---------- INIT ---------- */
renderWorkout();

})();
