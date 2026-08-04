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
  return { templates: JSON.parse(JSON.stringify(defaultTemplates)), history: [], weeklyTarget: 7, programs: [], activeProgramId: null };
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
      weeklyTarget: typeof parsed.weeklyTarget === "number" ? parsed.weeklyTarget : 7,
      programs: Array.isArray(parsed.programs) ? parsed.programs : [],
      activeProgramId: parsed.activeProgramId || null
    };
  } catch (e) {
    console.error("Failed to load workout state, resetting.", e);
    return defaultState();
  }
}
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

/* ---------- PROGRAM ENGINE (pure) ----------
   A program is authored as rules (phases -> weekly pattern + per-exercise
   progression formulas), not as a flat list of sessions. A concrete day's
   session is *resolved* on demand from those rules; nothing is
   pre-materialized until the user actually logs it (at which point it
   becomes a normal, permanent history entry like any freeform workout). */

function resolveProgressionValue(field, weekInPhase) {
  if (!field) return null;
  if (field.mode === "fixed") return field.base;
  if (field.mode === "custom") {
    if (field.customValues && field.customValues[weekInPhase] != null) return field.customValues[weekInPhase];
    return field.base;
  }
  let v = field.base + (field.stepPerWeek || 0) * (weekInPhase - 1);
  if (field.min != null) v = Math.max(field.min, v);
  if (field.max != null) v = Math.min(field.max, v);
  const r = field.roundTo || 1;
  v = Math.round(v / r) * r;
  v = Math.round(v * 1000) / 1000;
  return v;
}
// Date-string helpers anchored at local noon to sidestep DST edge cases.
function daysBetween(aStr, bStr) {
  const a = new Date(aStr + "T12:00:00");
  const b = new Date(bStr + "T12:00:00");
  return Math.round((b - a) / 86400000);
}
function dayOfWeekMon0(dateStr) {
  const dow = new Date(dateStr + "T12:00:00").getDay();
  return dow === 0 ? 6 : dow - 1;
}
function programWeekForDate(program, dateStr) {
  const diff = daysBetween(program.startDate, dateStr);
  if (diff < 0) return null;
  const week = Math.floor(diff / 7) + 1;
  if (week > program.totalWeeks) return null;
  return week;
}
function phaseForWeek(program, week) {
  return program.phases.find((p) => week >= p.startWeek && week <= p.endWeek) || null;
}
function resolveBlock(block, weekInPhase) {
  const out = { id: block.id, name: block.name, kind: block.kind, note: block.note || "" };
  if (block.kind === "strength") {
    out.sets = resolveProgressionValue(block.sets, weekInPhase);
    out.reps = resolveProgressionValue(block.reps, weekInPhase);
    out.rpe = resolveProgressionValue(block.rpe, weekInPhase);
  } else if (block.kind === "cardio") {
    out.durationMin = resolveProgressionValue(block.durationMin, weekInPhase);
    out.distance = resolveProgressionValue(block.distance, weekInPhase);
    out.distanceUnit = block.distanceUnit || "mi";
    out.effort = resolveProgressionValue(block.effort, weekInPhase);
  } else if (block.kind === "interval") {
    out.rounds = resolveProgressionValue(block.rounds, weekInPhase);
    out.workSec = resolveProgressionValue(block.workSec, weekInPhase);
    out.restSec = resolveProgressionValue(block.restSec, weekInPhase);
  } else if (block.kind === "ruck") {
    out.durationMin = resolveProgressionValue(block.durationMin, weekInPhase);
    out.distance = resolveProgressionValue(block.distance, weekInPhase);
    out.distanceUnit = block.distanceUnit || "mi";
    out.loadLbs = resolveProgressionValue(block.loadLbs, weekInPhase);
  }
  return out;
}
function resolveSessionForDate(program, dateStr) {
  const week = programWeekForDate(program, dateStr);
  if (week == null) {
    const diff = daysBetween(program.startDate, dateStr);
    return { status: diff < 0 ? "not-started" : "completed" };
  }
  const phase = phaseForWeek(program, week);
  if (!phase) return { status: "rest", week };
  const dow = dayOfWeekMon0(dateStr);
  const dayEntry = phase.microcycle.days.find((d) => d.dow === dow);
  if (!dayEntry || !dayEntry.slotId) return { status: "rest", week, phase };
  const slot = phase.sessionSlots.find((s) => s.id === dayEntry.slotId);
  if (!slot) return { status: "rest", week, phase };
  const weekInPhase = week - phase.startWeek + 1;
  return { status: "session", week, phase, slot, weekInPhase, blocks: slot.blocks.map((b) => resolveBlock(b, weekInPhase)) };
}
function getActiveProgram() {
  if (!state.activeProgramId) return null;
  return state.programs.find((p) => p.id === state.activeProgramId) || null;
}

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
let screen = null;          // null | 'templates' | 'variants' | 'active' | 'builder' | 'program-builder'
let tab = "home";           // 'home' | 'history' | 'manage'
let selectedTemplate = null;
let selectedVariant = null;
let activeWorkout = null;
let editingTemplate = null;
let builder = null;         // { name, icon, variants, activeVar }
let selectedMonthKey = null;
let selectedHistoryId = null;
let noteExIdx = null;

// Program builder runtime state
let editingProgram = null;      // the saved Program being edited, or null if creating new
let progBuilder = null;         // { name, totalWeeks, startDate, phases: [...] } — working copy
let progCalView = new Date();   // calendar month cursor for the start-date picker
let expandedPhaseId = null;     // which phase card is expanded in the builder
let daySheetCtx = null;         // { phaseId, dow } while the day-assign sheet is open
let slotEditorCtx = null;       // { phaseId, slotId } while the slot/block editor modal is open

const el = (id) => document.getElementById(id);
function isDrill() { return ["templates","variants","active","builder","program-builder"].includes(screen); }

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
  return workout.exercises.map((ex) => {
    const kind = ex.kind || "strength";
    if (kind === "strength") {
      return { ...ex, kind, sets: (ex.sets || []).filter((s) => s.weight !== "" && s.reps !== "" && s.weight !== undefined && s.reps !== undefined) };
    }
    return { ...ex, kind };
  }).filter((ex) => {
    if (!ex.name || !ex.name.trim()) return false;
    if (ex.kind === "strength") return ex.sets.length > 0;
    if (ex.kind === "interval") return ex.log && ex.log.roundsCompleted !== "" && ex.log.roundsCompleted !== undefined;
    return ex.log && (ex.log.durationMin !== "" || ex.log.distance !== "");
  });
}

/* ---------- RENDER ROOT ---------- */
function renderWorkout() {
  let html;
  if (screen === "templates") html = templatesScreenHTML();
  else if (screen === "variants") html = variantsScreenHTML();
  else if (screen === "active") html = activeScreenHTML();
  else if (screen === "builder") html = builderScreenHTML();
  else if (screen === "program-builder") html = programBuilderScreenHTML();
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

  const activeProgram = getActiveProgram();
  const heroHTML = activeProgram ? programHeroHTML(activeProgram) : `
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

    <button class="wk-start-btn" id="btn-start-workout">${iconSVG("plus", 18)} START NEW WORKOUT</button>`;

  return `
    ${heroHTML}

    <div class="wk-week-strip">
      <div class="readout-label">THIS WEEK</div>
      <div class="wk-day-row">${weekHTML}</div>
    </div>

    ${recentHTML}

    <div class="wk-section-title">MONTHLY PROGRESS</div>
    <div class="wk-hscroll">${monthsHTML}</div>
  `;
}

function programHeroHTML(program) {
  const resolved = resolveSessionForDate(program, formatDate(new Date()));
  const pct = program.totalWeeks ? Math.min(100, Math.round(((resolved.week || program.totalWeeks) / program.totalWeeks) * 100)) : 0;

  if (resolved.status === "not-started") {
    return `<div class="program-hero corner-bracket">
      <div class="ph-program-name">${escapeHTML(program.name)}</div>
      <div class="ph-rest"><div class="big-label">STARTS ${fmtMonthShort(program.startDate).toUpperCase()}</div></div>
    </div>`;
  }
  if (resolved.status === "completed") {
    return `<div class="program-hero corner-bracket">
      <div class="ph-program-name">${escapeHTML(program.name)}</div>
      <div class="ph-rest"><div class="big-label">PROGRAM COMPLETE</div>
        <p class="hint-text">Nice work. Deactivate it from Manage when you're ready to start something new.</p></div>
    </div>`;
  }
  if (resolved.status === "rest") {
    return `<div class="program-hero corner-bracket">
      <div class="ph-top"><span class="ph-week">WEEK ${resolved.week} OF ${program.totalWeeks}</span></div>
      <div class="ph-program-name" style="margin-bottom:10px;">${escapeHTML(program.name)}</div>
      <div class="ph-progress-track"><div class="ph-progress-fill" style="width:${pct}%"></div></div>
      <div class="ph-rest"><div class="big-label">RECOVERY DAY</div></div>
      <a class="ph-freeform-link" data-goto-templates="1">+ LOG A FREEFORM WORKOUT</a>
    </div>`;
  }
  const preview = resolved.blocks.slice(0, 5).map((b) =>
    `<div>${escapeHTML(b.name || "Exercise")} — <b>${escapeHTML(blockSummaryText(b))}</b></div>`).join("");
  return `<div class="program-hero corner-bracket">
    <div class="ph-top">
      <div>
        <span class="ph-week">WEEK ${resolved.week} OF ${program.totalWeeks}</span>
        <div class="ph-program-name">${escapeHTML(program.name)} · ${escapeHTML(resolved.phase.name)}</div>
      </div>
    </div>
    <div class="ph-title">${escapeHTML(resolved.slot.name)}</div>
    <div class="ph-progress-track"><div class="ph-progress-fill" style="width:${pct}%"></div></div>
    <div class="ph-exercise-preview" style="margin-top:12px;">${preview || "<div>No exercises defined for this session yet.</div>"}</div>
    <button class="wk-start-btn" id="btn-begin-program-session">${iconSVG("plus", 18)} BEGIN SESSION</button>
    <a class="ph-freeform-link" data-goto-templates="1">or log a freeform workout instead</a>
  </div>`;
}

function blockSummaryText(b) {
  if (b.kind === "strength") return `${b.sets ?? "?"}×${b.reps ?? "?"}${b.rpe != null ? " @ RPE " + b.rpe : ""}`;
  if (b.kind === "cardio") {
    const parts = [];
    if (b.durationMin) parts.push(b.durationMin + " min");
    if (b.distance) parts.push(b.distance + " " + (b.distanceUnit || "mi"));
    return parts.join(" · ") || "—";
  }
  if (b.kind === "interval") return `${b.rounds ?? "?"} rounds · ${b.workSec ?? "?"}s work / ${b.restSec ?? "?"}s rest`;
  if (b.kind === "ruck") return `${b.distance ?? "?"} ${b.distanceUnit || "mi"} · ${b.loadLbs ?? "?"} lbs`;
  return "";
}

function startProgramSession(program, resolved) {
  activeWorkout = {
    programId: program.id, phaseId: resolved.phase.id, weekNumber: resolved.week, weekInPhase: resolved.weekInPhase,
    slotId: resolved.slot.id,
    templateId: null, templateName: program.name, variantId: resolved.slot.id,
    variantName: `${resolved.slot.name} · Week ${resolved.week}`,
    startTime: new Date().toISOString(),
    exercises: resolved.blocks.map(buildLoggableBlock)
  };
  screen = "active";
  renderWorkout();
}

function buildLoggableBlock(b) {
  const base = { id: b.id, name: b.name, kind: b.kind };
  if (b.kind === "cardio") return { ...base, targetDurationMin: b.durationMin, targetDistance: b.distance, distanceUnit: b.distanceUnit, targetEffort: b.effort, log: { durationMin: "", distance: "", effort: "" } };
  if (b.kind === "interval") return { ...base, targetRounds: b.rounds, targetWorkSec: b.workSec, targetRestSec: b.restSec, log: { roundsCompleted: "", notes: "" } };
  if (b.kind === "ruck") return { ...base, targetDurationMin: b.durationMin, targetDistance: b.distance, distanceUnit: b.distanceUnit, targetLoadLbs: b.loadLbs, log: { durationMin: "", distance: "", loadLbs: b.loadLbs != null ? String(b.loadLbs) : "" } };
  // strength (default)
  return { ...base, kind: "strength", targetReps: b.reps, targetRPE: b.rpe,
    sets: Array.from({ length: Math.max(1, b.sets || 1) }, () => ({ reps: b.reps != null ? String(b.reps) : "", weight: "", rpe: "" })) };
}

/* ---------- PROGRAM BUILDER SCREEN ---------- */
function makeDefaultPhase(name, startWeek, endWeek) {
  return {
    id: uid(), name, startWeek, endWeek,
    microcycle: { days: [0,1,2,3,4,5,6].map((dow) => ({ dow, slotId: null })) },
    sessionSlots: []
  };
}
function defaultProgField(base, roundTo) {
  return { mode: "fixed", base, stepPerWeek: 0, min: null, max: null, roundTo: roundTo || 1, customValues: {} };
}
function ensureBlockFields(b) {
  if (b.kind === "strength") {
    b.sets = b.sets || defaultProgField(3);
    b.reps = b.reps || defaultProgField(10);
    b.rpe = b.rpe || defaultProgField(7, 0.5);
  } else if (b.kind === "cardio") {
    b.durationMin = b.durationMin || defaultProgField(20);
    b.distance = b.distance || defaultProgField(0, 0.1);
    b.effort = b.effort || defaultProgField(5);
    b.distanceUnit = b.distanceUnit || "mi";
  } else if (b.kind === "interval") {
    b.rounds = b.rounds || defaultProgField(6);
    b.workSec = b.workSec || defaultProgField(60);
    b.restSec = b.restSec || defaultProgField(30);
  } else if (b.kind === "ruck") {
    b.durationMin = b.durationMin || defaultProgField(45);
    b.distance = b.distance || defaultProgField(3, 0.1);
    b.loadLbs = b.loadLbs || defaultProgField(30, 5);
    b.distanceUnit = b.distanceUnit || "mi";
  }
  return b;
}

function openProgramBuilder(program) {
  editingProgram = program;
  progBuilder = program ? JSON.parse(JSON.stringify(program)) : {
    id: null, name: "", totalWeeks: 8, startDate: formatDate(new Date()),
    phases: [makeDefaultPhase("Phase 1", 1, 8)]
  };
  expandedPhaseId = progBuilder.phases.length ? progBuilder.phases[0].id : null;
  progCalView = new Date(progBuilder.startDate + "T12:00:00");
  screen = "program-builder";
  renderWorkout();
}

function progCalendarGridHTML() {
  const y = progCalView.getFullYear(), m = progCalView.getMonth();
  const first = new Date(y, m, 1);
  const gridStart = new Date(y, m, 1 - first.getDay());
  let html = "";
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart); d.setDate(gridStart.getDate() + i);
    const ds = formatDate(d);
    const cls = [];
    if (d.getMonth() !== m) cls.push("other-month");
    if (ds === progBuilder.startDate) cls.push("selected");
    html += `<button type="button" data-prog-date="${ds}" class="${cls.join(" ")}">${d.getDate()}</button>`;
  }
  return html;
}

function phaseCardHTML(phase) {
  const expanded = expandedPhaseId === phase.id;
  const dayLabels = ["MON","TUE","WED","THU","FRI","SAT","SUN"];
  const dayRow = phase.microcycle.days.slice().sort((a,b) => a.dow - b.dow).map((d) => {
    const slot = phase.sessionSlots.find((s) => s.id === d.slotId);
    return `<button class="day-assign-btn ${!slot ? "is-rest" : ""}" data-assign-day="${phase.id}:${d.dow}">
      <span class="dn">${dayLabels[d.dow]}</span>
      <span class="ds">${slot ? escapeHTML(slot.name) : "REST"}</span>
    </button>`;
  }).join("");

  const slotsHTML = phase.sessionSlots.map((s) => `
    <div class="slot-row">
      <div class="sr-left">
        <span class="kind-badge">${s.kind.toUpperCase()}</span>
        <div><div class="sr-name">${escapeHTML(s.name)}</div><div class="sr-meta">${s.blocks.length} block${s.blocks.length !== 1 ? "s" : ""}${s.optional ? " · optional" : ""}</div></div>
      </div>
      <div class="sr-actions">
        <button class="icon-btn small" data-edit-slot="${phase.id}:${s.id}">${iconSVG("edit", 16)}</button>
        <button class="icon-btn small" data-delete-slot="${phase.id}:${s.id}">${iconSVG("trash", 16)}</button>
      </div>
    </div>`).join("");

  return `<div class="phase-card">
    <div class="phase-head">
      <button class="phase-chevron ${expanded ? "open" : ""}" data-toggle-phase="${phase.id}">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>
      </button>
      <input type="text" class="text-input" data-phase-name="${phase.id}" value="${escapeHTML(phase.name)}">
      <div class="phase-week-inputs">
        <span>WK</span><input type="number" data-phase-start="${phase.id}" value="${phase.startWeek}" min="1">
        <span>–</span><input type="number" data-phase-end="${phase.id}" value="${phase.endWeek}" min="1">
      </div>
      <button class="icon-btn small" data-delete-phase="${phase.id}">${iconSVG("trash", 16)}</button>
    </div>
    <div class="phase-body" ${expanded ? "" : "hidden"}>
      <label class="field-label" style="margin-top:0;">TRAINING DAYS</label>
      <div class="day-assign-row">${dayRow}</div>
      <label class="field-label">SESSION TEMPLATES</label>
      ${slotsHTML || `<p class="hint-text" style="margin-bottom:10px;">No session templates yet.</p>`}
      <button class="wk-dashed-card" style="width:100%; text-align:center;" data-add-slot="${phase.id}">+ ADD SESSION TEMPLATE</button>
    </div>
  </div>`;
}

function programBuilderScreenHTML() {
  if (!progBuilder) return "";
  const phasesHTML = progBuilder.phases.map((p) => phaseCardHTML(p)).join("");
  return `
    ${screenHeaderHTML(editingProgram ? "EDIT PROGRAM" : "NEW PROGRAM", "btn-program-back")}
    <div class="wk-builder-panel">
      <label class="field-label" style="margin-top:0;">PROGRAM NAME</label>
      <input type="text" class="text-input" id="prog-name" value="${escapeHTML(progBuilder.name)}" placeholder="e.g. 12-Week Strength Block">
      <div class="row-2">
        <div><label class="field-label">TOTAL WEEKS</label>
          <input type="number" class="text-input" id="prog-weeks" value="${progBuilder.totalWeeks}" min="1"></div>
        <div><label class="field-label">STARTS</label>
          <div class="text-input" style="text-align:center; color:var(--accent);">${fmtMonthShort(progBuilder.startDate)}</div></div>
      </div>
      <div class="calendar-panel corner-bracket" style="margin-top:10px;">
        <div class="cal-header">
          <button type="button" id="prog-cal-prev" class="icon-btn small">‹</button>
          <div>${progCalView.toLocaleDateString("default", { month: "long", year: "numeric" }).toUpperCase()}</div>
          <button type="button" id="prog-cal-next" class="icon-btn small">›</button>
        </div>
        <div class="cal-weekdays"><span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span></div>
        <div class="cal-grid">${progCalendarGridHTML()}</div>
      </div>
    </div>

    <div class="builder-section-title">PHASES</div>
    ${phasesHTML}
    <button class="wk-dashed-card" style="width:100%; text-align:center; margin-bottom:20px;" id="btn-add-phase">+ ADD PHASE</button>

    <button class="btn-primary" id="btn-save-program">SAVE PROGRAM</button>
  `;
}

function saveProgramBuilder() {
  const name = (el("prog-name") ? el("prog-name").value : progBuilder.name).trim();
  if (!name) { alert("Enter a program name"); return; }
  if (!progBuilder.phases.length) { alert("Add at least one phase"); return; }
  for (const p of progBuilder.phases) {
    if (Number(p.endWeek) < Number(p.startWeek)) { alert(`Phase "${p.name}" has an invalid week range`); return; }
    if (!p.microcycle.days.some((d) => d.slotId)) { alert(`Phase "${p.name}" has no training days assigned`); return; }
  }
  progBuilder.name = name;
  progBuilder.totalWeeks = Math.max(1, parseInt(el("prog-weeks") ? el("prog-weeks").value : progBuilder.totalWeeks, 10) || 1);

  if (editingProgram) {
    progBuilder.id = editingProgram.id;
    progBuilder.status = editingProgram.status;
    state.programs = state.programs.map((p) => (p.id === progBuilder.id ? progBuilder : p));
  } else {
    progBuilder.id = uid();
    progBuilder.status = "draft";
    state.programs.push(progBuilder);
  }
  save();
  editingProgram = null; progBuilder = null; screen = null;
  renderWorkout();
  window.showToast && window.showToast("PROGRAM SAVED");
}

/* ---- day-assignment sheet ---- */
function openDayAssignSheet(phaseId, dow) {
  daySheetCtx = { phaseId, dow };
  const phase = progBuilder.phases.find((p) => p.id === phaseId);
  const dayLabels = ["MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY","SATURDAY","SUNDAY"];
  el("wk-day-assign-title").textContent = dayLabels[dow];
  const options = [`<button class="btn-secondary" data-pick-slot="__rest__" style="margin-top:0;">REST DAY</button>`]
    .concat(phase.sessionSlots.map((s) => `<button class="btn-secondary" data-pick-slot="${s.id}">${escapeHTML(s.name)} <span class="kind-badge" style="margin-left:6px;">${s.kind.toUpperCase()}</span></button>`))
    .concat([`<button class="btn-primary" data-pick-slot="__new__">+ NEW SESSION TEMPLATE</button>`]);
  el("wk-day-assign-body").innerHTML = options.join("");
  document.querySelectorAll("[data-pick-slot]").forEach((b) => b.onclick = () => pickDaySlot(b.getAttribute("data-pick-slot")));
  openSheet("wk-day-assign-overlay");
}
function pickDaySlot(choice) {
  const { phaseId, dow } = daySheetCtx;
  const phase = progBuilder.phases.find((p) => p.id === phaseId);
  const dayEntry = phase.microcycle.days.find((d) => d.dow === dow);
  closeSheet("wk-day-assign-overlay");
  if (choice === "__rest__") { dayEntry.slotId = null; renderWorkout(); return; }
  if (choice === "__new__") {
    const slot = { id: uid(), name: "New Session", kind: "strength", optional: false, blocks: [] };
    phase.sessionSlots.push(slot);
    dayEntry.slotId = slot.id;
    renderWorkout();
    openSlotEditor(phaseId, slot.id);
    return;
  }
  dayEntry.slotId = choice;
  renderWorkout();
}

/* ---- session slot / block editor modal ---- */
function currentSlot() {
  if (!slotEditorCtx) return null;
  const phase = progBuilder.phases.find((p) => p.id === slotEditorCtx.phaseId);
  return phase ? phase.sessionSlots.find((s) => s.id === slotEditorCtx.slotId) : null;
}
function currentPhaseForSlot() {
  return slotEditorCtx ? progBuilder.phases.find((p) => p.id === slotEditorCtx.phaseId) : null;
}
function openSlotEditor(phaseId, slotId) {
  slotEditorCtx = { phaseId, slotId };
  renderSlotEditor();
  openModal("wk-slot-editor-overlay");
}
function progressionFieldHTML(blockIdx, fieldKey, label, field, phaseWeeks) {
  const modeBtns = ["fixed","linear","custom"].map((m) =>
    `<button class="${field.mode === m ? "active" : ""}" data-prog-mode="${blockIdx}:${fieldKey}:${m}">${m === "linear" ? "RAMP" : m.toUpperCase()}</button>`).join("");
  let body;
  if (field.mode === "fixed") {
    body = `<div class="prog-inline-row"><input type="number" step="any" value="${field.base}" data-prog-base="${blockIdx}:${fieldKey}"></div>`;
  } else if (field.mode === "linear") {
    const vals = [];
    for (let w = 1; w <= phaseWeeks; w++) vals.push(resolveProgressionValue(field, w));
    body = `<div class="prog-inline-row">
      <input type="number" step="any" placeholder="start" value="${field.base}" data-prog-base="${blockIdx}:${fieldKey}">
      <input type="number" step="any" placeholder="step / wk" value="${field.stepPerWeek}" data-prog-step="${blockIdx}:${fieldKey}">
    </div>
    <div class="prog-preview">${vals.map((v, i) => `W${i+1}: <b>${v}</b>`).join(" &nbsp; ")}</div>`;
  } else {
    let cells = "";
    for (let w = 1; w <= phaseWeeks; w++) {
      const v = (field.customValues && field.customValues[w] != null) ? field.customValues[w] : field.base;
      cells += `<div class="prog-custom-cell"><span>W${w}</span><input type="number" step="any" value="${v}" data-prog-custom="${blockIdx}:${fieldKey}:${w}"></div>`;
    }
    body = `<div class="prog-custom-grid">${cells}</div>`;
  }
  return `<div class="prog-field">
    <div class="prog-field-label"><span>${label}</span></div>
    <div class="prog-mode-toggle">${modeBtns}</div>
    ${body}
  </div>`;
}
function blockEditorHTML(b, bIdx, phaseWeeks) {
  ensureBlockFields(b);
  const kindSeg = ["strength","cardio","interval","ruck"].map((k) =>
    `<button class="${b.kind === k ? "active" : ""}" data-block-kind="${bIdx}:${k}">${k.slice(0,4).toUpperCase()}</button>`).join("");
  let fields = "";
  if (b.kind === "strength") {
    fields = progressionFieldHTML(bIdx, "sets", "SETS", b.sets, phaseWeeks)
      + progressionFieldHTML(bIdx, "reps", "REPS", b.reps, phaseWeeks)
      + progressionFieldHTML(bIdx, "rpe", "TARGET RPE", b.rpe, phaseWeeks);
  } else if (b.kind === "cardio") {
    fields = progressionFieldHTML(bIdx, "durationMin", "DURATION (MIN)", b.durationMin, phaseWeeks)
      + progressionFieldHTML(bIdx, "distance", `DISTANCE (${(b.distanceUnit||"mi").toUpperCase()})`, b.distance, phaseWeeks)
      + progressionFieldHTML(bIdx, "effort", "EFFORT (1–10)", b.effort, phaseWeeks);
  } else if (b.kind === "interval") {
    fields = progressionFieldHTML(bIdx, "rounds", "ROUNDS", b.rounds, phaseWeeks)
      + progressionFieldHTML(bIdx, "workSec", "WORK (SEC)", b.workSec, phaseWeeks)
      + progressionFieldHTML(bIdx, "restSec", "REST (SEC)", b.restSec, phaseWeeks);
  } else if (b.kind === "ruck") {
    fields = progressionFieldHTML(bIdx, "durationMin", "DURATION (MIN)", b.durationMin, phaseWeeks)
      + progressionFieldHTML(bIdx, "distance", `DISTANCE (${(b.distanceUnit||"mi").toUpperCase()})`, b.distance, phaseWeeks)
      + progressionFieldHTML(bIdx, "loadLbs", "LOAD (LBS)", b.loadLbs, phaseWeeks);
  }
  return `<div class="block-card">
    <div class="block-head">
      <input type="text" class="text-input" data-block-name="${bIdx}" value="${escapeHTML(b.name)}" placeholder="Name">
      <button class="icon-btn small" data-remove-block="${bIdx}">${iconSVG("trash", 16)}</button>
    </div>
    <div class="segmented" style="margin-bottom:12px;">${kindSeg}</div>
    ${fields}
  </div>`;
}
function renderSlotEditor() {
  const slot = currentSlot();
  const phase = currentPhaseForSlot();
  if (!slot || !phase) return;
  const phaseWeeks = Math.max(1, phase.endWeek - phase.startWeek + 1);
  el("wk-slot-editor-title").textContent = slot.name || "SESSION TEMPLATE";
  const kindTabs = ["strength","cardio","interval","ruck"].map((k) =>
    `<button class="seg-btn ${slot.kind === k ? "active" : ""}" data-slot-kind="${k}">${k.toUpperCase()}</button>`).join("");
  const blocksHTML = slot.blocks.map((b, bIdx) => blockEditorHTML(b, bIdx, phaseWeeks)).join("");
  el("wk-slot-editor-body").innerHTML = `
    <label class="field-label" style="margin-top:0;">SESSION NAME</label>
    <input type="text" class="text-input" id="slot-name-input" value="${escapeHTML(slot.name)}">
    <label class="field-label">DEFAULT TYPE FOR NEW ITEMS</label>
    <div class="segmented" id="slot-kind-seg">${kindTabs}</div>
    <label class="field-label" style="display:flex; align-items:center; gap:8px; margin-top:16px;">
      <input type="checkbox" id="slot-optional-input" ${slot.optional ? "checked" : ""} style="width:16px; height:16px;">
      OPTIONAL / RECOVERY SESSION
    </label>
    <div class="builder-section-title">EXERCISES / ACTIVITIES</div>
    ${blocksHTML || `<p class="hint-text">No items yet — add one below.</p>`}
    <button class="wk-dashed-card" style="width:100%; text-align:center;" id="btn-add-block">+ ADD ITEM</button>
  `;
  attachSlotEditorHandlers();
}
function attachSlotEditorHandlers() {
  const slot = currentSlot();
  if (!slot) return;
  const nameInput = el("slot-name-input");
  if (nameInput) nameInput.onblur = (e) => { slot.name = e.target.value; };
  document.querySelectorAll("#slot-kind-seg .seg-btn").forEach((b) => b.onclick = () => {
    slot.kind = b.getAttribute("data-slot-kind");
    renderSlotEditor(); renderWorkout();
  });
  const optInput = el("slot-optional-input");
  if (optInput) optInput.onchange = (e) => { slot.optional = e.target.checked; };

  document.querySelectorAll("[data-block-name]").forEach((inp) => inp.onblur = (e) => {
    slot.blocks[Number(inp.getAttribute("data-block-name"))].name = e.target.value;
  });
  document.querySelectorAll("[data-block-kind]").forEach((b) => b.onclick = () => {
    const [idx, kind] = b.getAttribute("data-block-kind").split(":");
    slot.blocks[Number(idx)].kind = kind;
    ensureBlockFields(slot.blocks[Number(idx)]);
    renderSlotEditor();
  });
  document.querySelectorAll("[data-remove-block]").forEach((b) => b.onclick = () => {
    slot.blocks.splice(Number(b.getAttribute("data-remove-block")), 1);
    renderSlotEditor(); renderWorkout();
  });
  document.querySelectorAll("[data-prog-mode]").forEach((b) => b.onclick = () => {
    const [idx, key, mode] = b.getAttribute("data-prog-mode").split(":");
    slot.blocks[Number(idx)][key].mode = mode;
    renderSlotEditor();
  });
  document.querySelectorAll("[data-prog-base]").forEach((inp) => inp.onblur = (e) => {
    const [idx, key] = inp.getAttribute("data-prog-base").split(":");
    slot.blocks[Number(idx)][key].base = parseFloat(e.target.value) || 0;
    renderSlotEditor();
  });
  document.querySelectorAll("[data-prog-step]").forEach((inp) => inp.onblur = (e) => {
    const [idx, key] = inp.getAttribute("data-prog-step").split(":");
    slot.blocks[Number(idx)][key].stepPerWeek = parseFloat(e.target.value) || 0;
    renderSlotEditor();
  });
  document.querySelectorAll("[data-prog-custom]").forEach((inp) => inp.onblur = (e) => {
    const [idx, key, week] = inp.getAttribute("data-prog-custom").split(":");
    const field = slot.blocks[Number(idx)][key];
    field.customValues = field.customValues || {};
    field.customValues[Number(week)] = parseFloat(e.target.value) || 0;
  });
  const addBlockBtn = el("btn-add-block");
  if (addBlockBtn) addBlockBtn.onclick = () => {
    slot.blocks.push(ensureBlockFields({ id: uid(), name: "", kind: slot.kind }));
    renderSlotEditor();
  };
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
  if (!activeWorkout) return false;
  return activeWorkout.exercises.some((ex) => {
    const kind = ex.kind || "strength";
    if (kind === "strength") return (ex.sets || []).some((s) => s.weight !== "" && s.weight !== undefined && s.reps !== "" && s.reps !== undefined);
    if (kind === "cardio" || kind === "ruck") return ex.log && (ex.log.durationMin !== "" || ex.log.distance !== "");
    if (kind === "interval") return ex.log && ex.log.roundsCompleted !== "" && ex.log.roundsCompleted !== undefined;
    return false;
  });
}

function targetLineHTML(ex) {
  const kind = ex.kind || "strength";
  if (kind === "strength" && ex.targetReps != null) {
    return `<div class="hint-text" style="margin-bottom:8px;">TARGET: ${ex.targetReps} reps${ex.targetRPE != null ? " @ RPE " + ex.targetRPE : ""}</div>`;
  }
  if (kind === "cardio") {
    const parts = [];
    if (ex.targetDurationMin) parts.push(ex.targetDurationMin + " min");
    if (ex.targetDistance) parts.push(ex.targetDistance + " " + (ex.distanceUnit || "mi"));
    if (ex.targetEffort != null) parts.push("effort " + ex.targetEffort + "/10");
    return parts.length ? `<div class="hint-text" style="margin-bottom:8px;">TARGET: ${parts.join(" · ")}</div>` : "";
  }
  if (kind === "interval") {
    return `<div class="hint-text" style="margin-bottom:8px;">TARGET: ${ex.targetRounds ?? "?"} rounds · ${ex.targetWorkSec ?? "?"}s work / ${ex.targetRestSec ?? "?"}s rest</div>`;
  }
  if (kind === "ruck") {
    const parts = [];
    if (ex.targetDistance) parts.push(ex.targetDistance + " " + (ex.distanceUnit || "mi"));
    if (ex.targetLoadLbs) parts.push(ex.targetLoadLbs + " lbs");
    if (ex.targetDurationMin) parts.push(ex.targetDurationMin + " min");
    return parts.length ? `<div class="hint-text" style="margin-bottom:8px;">TARGET: ${parts.join(" · ")}</div>` : "";
  }
  return "";
}

function exerciseCardHTML(ex, exIdx) {
  const kind = ex.kind || "strength";
  const head = `
    <div class="wk-ex-head">
      <input type="text" class="wk-ex-name-input" data-ex-name="${exIdx}" value="${escapeHTML(ex.name)}" placeholder="${kind === "strength" ? "Exercise name" : "Activity name"}">
      <div class="wk-ex-actions">
        ${kind !== "strength" ? `<span class="kind-badge">${kind.toUpperCase()}</span>` : ""}
        <button class="icon-btn small" data-ex-note="${exIdx}" style="color:${ex.note ? "var(--accent)" : "var(--text-dim)"}">${iconSVG("note", 18)}</button>
        <button class="icon-btn small" data-ex-remove="${exIdx}" ${activeWorkout.exercises.length <= 1 ? "disabled style='opacity:.3'" : ""}>${iconSVG("trash", 18)}</button>
      </div>
    </div>`;
  const targetLine = targetLineHTML(ex);

  if (kind === "strength") {
    const showRPE = ex.targetRPE != null;
    const cols = showRPE ? "28px 1fr 1fr 1fr 22px" : "32px 1fr 1fr 26px";
    return `<div class="wk-exercise-card">
      ${head}${targetLine}
      <div class="wk-set-header" style="grid-template-columns:${cols};"><div>SET</div><div>WEIGHT</div><div>REPS</div>${showRPE ? "<div>RPE</div>" : ""}<div></div></div>
      ${ex.sets.map((s, setIdx) => `
        <div class="wk-set-row" style="grid-template-columns:${cols};">
          <div class="set-num">${setIdx + 1}</div>
          <input type="number" class="wk-set-input" inputmode="decimal" placeholder="lbs" value="${s.weight}" data-set-weight="${exIdx}:${setIdx}">
          <input type="number" class="wk-set-input" inputmode="numeric" placeholder="reps" value="${s.reps}" data-set-reps="${exIdx}:${setIdx}">
          ${showRPE ? `<input type="number" class="wk-set-input" inputmode="decimal" step="0.5" placeholder="rpe" value="${s.rpe || ""}" data-set-rpe="${exIdx}:${setIdx}">` : ""}
          <button class="wk-set-remove" data-set-remove="${exIdx}:${setIdx}">×</button>
        </div>`).join("")}
      <button class="wk-add-set" data-add-set="${exIdx}">+ ADD SET</button>
    </div>`;
  }

  if (kind === "cardio" || kind === "ruck") {
    const unit = ex.distanceUnit || "mi";
    return `<div class="wk-exercise-card">
      ${head}${targetLine}
      <div class="row-2" style="margin-bottom:10px;">
        <div><label class="field-label" style="margin:0 0 4px;">DURATION (MIN)</label>
          <input type="number" class="wk-set-input" value="${ex.log.durationMin}" data-log-field="${exIdx}:durationMin"></div>
        <div><label class="field-label" style="margin:0 0 4px;">DISTANCE (${unit.toUpperCase()})</label>
          <input type="number" class="wk-set-input" step="0.1" value="${ex.log.distance}" data-log-field="${exIdx}:distance"></div>
      </div>
      ${kind === "cardio"
        ? `<label class="field-label" style="margin:0 0 4px;">EFFORT (1–10)</label>
           <input type="number" class="wk-set-input" min="1" max="10" value="${ex.log.effort}" data-log-field="${exIdx}:effort">`
        : `<label class="field-label" style="margin:0 0 4px;">LOAD CARRIED (LBS)</label>
           <input type="number" class="wk-set-input" value="${ex.log.loadLbs}" data-log-field="${exIdx}:loadLbs">`}
    </div>`;
  }

  if (kind === "interval") {
    return `<div class="wk-exercise-card">
      ${head}${targetLine}
      <label class="field-label" style="margin:0 0 4px;">ROUNDS COMPLETED</label>
      <input type="number" class="wk-set-input" value="${ex.log.roundsCompleted}" data-log-field="${exIdx}:roundsCompleted">
    </div>`;
  }
  return `<div class="wk-exercise-card">${head}</div>`;
}

function activeScreenHTML() {
  if (!activeWorkout) return "";
  const canComplete = hasCompletedSet();
  const exercisesHTML = activeWorkout.exercises.map((ex, exIdx) => exerciseCardHTML(ex, exIdx)).join("");

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
      const progTag = w.programId ? `<span class="status-badge active" style="margin-left:6px;">PROGRAM</span>` : "";
      return `<button class="wk-history-row" data-open-history="${w.id}">
        <span><span class="hr-name">${escapeHTML(w.templateName)}${progTag}</span><br><span class="hr-sub">${escapeHTML(w.variantName)}</span></span>
        <span><span class="hr-date">${fmtWeekdayShort(w.date)}</span><br><span class="hr-count">${count} exercise${count !== 1 ? "s" : ""}</span></span>
      </button>`;
    }).join("")}`).join("");
  return `<h1 class="screen-h1">WORKOUT HISTORY</h1>${blocks}`;
}

/* ---------- MANAGE SCREEN ---------- */
function manageScreenHTML() {
  const programRows = state.programs.map((p) => {
    const resolved = p.status === "active" ? resolveSessionForDate(p, formatDate(new Date())) : null;
    const weekLabel = resolved && resolved.week ? `WEEK ${resolved.week}/${p.totalWeeks}` : `${p.totalWeeks} WEEKS`;
    const badgeClass = p.status === "active" ? "active" : (resolved && resolved.status === "completed") ? "complete" : "draft";
    const badgeText = p.status === "active" ? "ACTIVE" : "DRAFT";
    return `<div class="program-row">
      <div class="pr-top">
        <div><div class="pr-name">${escapeHTML(p.name)}</div><div class="pr-sub">${weekLabel} · ${p.phases.length} phase${p.phases.length !== 1 ? "s" : ""}</div></div>
        <span class="status-badge ${badgeClass}">${badgeText}</span>
      </div>
      <div class="pr-actions">
        <button class="pr-btn-neutral" data-edit-program="${p.id}">EDIT</button>
        ${p.status === "active"
          ? `<button class="pr-btn-neutral" data-deactivate-program="${p.id}">DEACTIVATE</button>`
          : `<button class="pr-btn-activate" data-activate-program="${p.id}">ACTIVATE</button>`}
        <button class="pr-btn-neutral" data-delete-program="${p.id}" style="flex:0 0 40px;">${iconSVG("trash", 16)}</button>
      </div>
    </div>`;
  }).join("");

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

  return `<h1 class="screen-h1">MANAGE</h1>
    <div class="wk-section-title">TRAINING PROGRAMS</div>
    ${programRows}
    <button class="wk-dashed-card" style="width:100%; text-align:center; margin-bottom:22px;" id="btn-new-program">+ CREATE PROGRAM</button>

    <div class="wk-section-title">QUICK-START WORKOUTS</div>
    ${rows}
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
  document.querySelectorAll("[data-goto-templates]").forEach((a) => a.onclick = () => { screen = "templates"; renderWorkout(); });
  const beginProgBtn = el("btn-begin-program-session");
  if (beginProgBtn) beginProgBtn.onclick = () => {
    const program = getActiveProgram();
    if (!program) return;
    const resolved = resolveSessionForDate(program, formatDate(new Date()));
    if (resolved.status === "session") startProgramSession(program, resolved);
  };

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
  document.querySelectorAll("[data-set-rpe]").forEach((inp) => inp.onblur = (e) => {
    const [exIdx, setIdx] = inp.getAttribute("data-set-rpe").split(":").map(Number);
    activeWorkout.exercises[exIdx].sets[setIdx].rpe = e.target.value;
    renderWorkout();
  });
  document.querySelectorAll("[data-log-field]").forEach((inp) => inp.onblur = (e) => {
    const [exIdx, field] = inp.getAttribute("data-log-field").split(":");
    activeWorkout.exercises[Number(exIdx)].log[field] = e.target.value;
    renderWorkout();
  });
  document.querySelectorAll("[data-set-remove]").forEach((b) => b.onclick = () => {
    const [exIdx, setIdx] = b.getAttribute("data-set-remove").split(":").map(Number);
    if (activeWorkout.exercises[exIdx].sets.length > 1) { activeWorkout.exercises[exIdx].sets.splice(setIdx, 1); renderWorkout(); }
  });
  document.querySelectorAll("[data-add-set]").forEach((b) => b.onclick = () => {
    const exIdx = Number(b.getAttribute("data-add-set"));
    const ex = activeWorkout.exercises[exIdx];
    ex.sets.push({ reps: ex.targetReps != null ? String(ex.targetReps) : "", weight: "", rpe: "" });
    renderWorkout();
  });
  const addExBtn = el("btn-add-exercise");
  if (addExBtn) addExBtn.onclick = () => {
    activeWorkout.exercises.push({ id: "e-" + uid(), name: "", kind: "strength", sets: [{ reps: "10", weight: "", rpe: "" }] });
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

  // MANAGE — programs
  const newProgBtn = el("btn-new-program");
  if (newProgBtn) newProgBtn.onclick = () => openProgramBuilder(null);
  document.querySelectorAll("[data-edit-program]").forEach((b) => b.onclick = () => openProgramBuilder(state.programs.find((p) => p.id === b.getAttribute("data-edit-program"))));
  document.querySelectorAll("[data-activate-program]").forEach((b) => b.onclick = () => {
    const id = b.getAttribute("data-activate-program");
    state.programs.forEach((p) => { if (p.status === "active") p.status = "draft"; });
    const p = state.programs.find((x) => x.id === id);
    if (p) p.status = "active";
    state.activeProgramId = id;
    save(); renderWorkout();
    window.showToast && window.showToast("PROGRAM ACTIVATED");
  });
  document.querySelectorAll("[data-deactivate-program]").forEach((b) => b.onclick = () => {
    const id = b.getAttribute("data-deactivate-program");
    const p = state.programs.find((x) => x.id === id);
    if (p) p.status = "draft";
    if (state.activeProgramId === id) state.activeProgramId = null;
    save(); renderWorkout();
  });
  document.querySelectorAll("[data-delete-program]").forEach((b) => b.onclick = () => {
    const id = b.getAttribute("data-delete-program");
    const p = state.programs.find((x) => x.id === id);
    if (p && confirm(`Delete program "${p.name}"? Logged workout history from it will be kept.`)) {
      state.programs = state.programs.filter((x) => x.id !== id);
      if (state.activeProgramId === id) state.activeProgramId = null;
      save(); renderWorkout();
    }
  });

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

  // PROGRAM BUILDER
  const progBack = el("btn-program-back");
  if (progBack) progBack.onclick = () => { editingProgram = null; progBuilder = null; screen = null; tab = "manage"; renderWorkout(); };
  const progName = el("prog-name");
  if (progName) progName.onblur = (e) => { progBuilder.name = e.target.value; };
  const progWeeks = el("prog-weeks");
  if (progWeeks) progWeeks.onblur = (e) => { progBuilder.totalWeeks = Math.max(1, parseInt(e.target.value, 10) || 1); renderWorkout(); };
  const progCalPrev = el("prog-cal-prev");
  if (progCalPrev) progCalPrev.onclick = () => { progCalView.setMonth(progCalView.getMonth() - 1); renderWorkout(); };
  const progCalNext = el("prog-cal-next");
  if (progCalNext) progCalNext.onclick = () => { progCalView.setMonth(progCalView.getMonth() + 1); renderWorkout(); };
  document.querySelectorAll("[data-prog-date]").forEach((b) => b.onclick = () => {
    progBuilder.startDate = b.getAttribute("data-prog-date");
    renderWorkout();
  });
  const addPhaseBtn = el("btn-add-phase");
  if (addPhaseBtn) addPhaseBtn.onclick = () => {
    const last = progBuilder.phases[progBuilder.phases.length - 1];
    const start = last ? Number(last.endWeek) + 1 : 1;
    const end = Math.min(start + 3, Math.max(start, progBuilder.totalWeeks));
    const phase = makeDefaultPhase(`Phase ${progBuilder.phases.length + 1}`, start, end);
    progBuilder.phases.push(phase);
    expandedPhaseId = phase.id;
    renderWorkout();
  };
  document.querySelectorAll("[data-toggle-phase]").forEach((b) => b.onclick = () => {
    const id = b.getAttribute("data-toggle-phase");
    expandedPhaseId = expandedPhaseId === id ? null : id;
    renderWorkout();
  });
  document.querySelectorAll("[data-phase-name]").forEach((inp) => inp.onblur = (e) => {
    const p = progBuilder.phases.find((x) => x.id === inp.getAttribute("data-phase-name"));
    if (p) p.name = e.target.value;
  });
  document.querySelectorAll("[data-phase-start]").forEach((inp) => inp.onblur = (e) => {
    const p = progBuilder.phases.find((x) => x.id === inp.getAttribute("data-phase-start"));
    if (p) p.startWeek = Math.max(1, parseInt(e.target.value, 10) || 1);
  });
  document.querySelectorAll("[data-phase-end]").forEach((inp) => inp.onblur = (e) => {
    const p = progBuilder.phases.find((x) => x.id === inp.getAttribute("data-phase-end"));
    if (p) p.endWeek = Math.max(p.startWeek, parseInt(e.target.value, 10) || p.startWeek);
  });
  document.querySelectorAll("[data-delete-phase]").forEach((b) => b.onclick = () => {
    const id = b.getAttribute("data-delete-phase");
    if (progBuilder.phases.length <= 1) { alert("A program needs at least one phase."); return; }
    if (confirm("Delete this phase?")) {
      progBuilder.phases = progBuilder.phases.filter((p) => p.id !== id);
      renderWorkout();
    }
  });
  document.querySelectorAll("[data-assign-day]").forEach((b) => b.onclick = () => {
    const [phaseId, dow] = b.getAttribute("data-assign-day").split(":");
    openDayAssignSheet(phaseId, Number(dow));
  });
  document.querySelectorAll("[data-add-slot]").forEach((b) => b.onclick = () => {
    const phaseId = b.getAttribute("data-add-slot");
    const phase = progBuilder.phases.find((p) => p.id === phaseId);
    const slot = { id: uid(), name: "New Session", kind: "strength", optional: false, blocks: [] };
    phase.sessionSlots.push(slot);
    renderWorkout();
    openSlotEditor(phaseId, slot.id);
  });
  document.querySelectorAll("[data-edit-slot]").forEach((b) => b.onclick = () => {
    const [phaseId, slotId] = b.getAttribute("data-edit-slot").split(":");
    openSlotEditor(phaseId, slotId);
  });
  document.querySelectorAll("[data-delete-slot]").forEach((b) => b.onclick = () => {
    const [phaseId, slotId] = b.getAttribute("data-delete-slot").split(":");
    if (!confirm("Delete this session template? Any days using it will become rest days.")) return;
    const phase = progBuilder.phases.find((p) => p.id === phaseId);
    phase.sessionSlots = phase.sessionSlots.filter((s) => s.id !== slotId);
    phase.microcycle.days.forEach((d) => { if (d.slotId === slotId) d.slotId = null; });
    renderWorkout();
  });
  const saveProgBtn = el("btn-save-program");
  if (saveProgBtn) saveProgBtn.onclick = saveProgramBuilder;
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

el("btn-close-day-assign").onclick = () => closeSheet("wk-day-assign-overlay");
el("wk-day-assign-overlay").addEventListener("click", (e) => { if (e.target.id === "wk-day-assign-overlay") closeSheet("wk-day-assign-overlay"); });

el("btn-close-slot-editor").onclick = () => { closeModal("wk-slot-editor-overlay"); renderWorkout(); };
el("btn-slot-editor-done").onclick = () => { closeModal("wk-slot-editor-overlay"); renderWorkout(); };
el("wk-slot-editor-overlay").addEventListener("click", (e) => { if (e.target.id === "wk-slot-editor-overlay") { closeModal("wk-slot-editor-overlay"); renderWorkout(); } });

el("btn-discard-cancel").onclick = () => closeModal("wk-discard-overlay");
el("btn-discard-confirm").onclick = discardWorkout;
el("wk-discard-overlay").addEventListener("click", (e) => { if (e.target.id === "wk-discard-overlay") closeModal("wk-discard-overlay"); });

function detailBlockHTML(ex) {
  const kind = ex.kind || "strength";
  if (kind === "strength") {
    return `<div class="wk-detail-block">
      <div class="db-name">${escapeHTML(ex.name)}</div>
      <div class="wk-detail-set"><span class="num">#</span><span>WEIGHT</span><span>REPS</span></div>
      ${ex.sets.map((s, i) => `<div class="wk-detail-set"><span class="num">${i+1}</span><span class="wt">${escapeHTML(s.weight)} lbs</span><span>${escapeHTML(s.reps)}${s.rpe ? " @ RPE " + escapeHTML(s.rpe) : ""}</span></div>`).join("")}
      ${ex.note ? `<div class="wk-detail-note">${escapeHTML(ex.note)}</div>` : ""}
    </div>`;
  }
  let lines = "";
  const unit = ex.distanceUnit || "mi";
  if (kind === "cardio" || kind === "ruck") {
    const rows = [];
    if (ex.log.durationMin !== "") rows.push(`<div class="stat-line"><span class="lbl">DURATION</span><span class="val">${escapeHTML(ex.log.durationMin)} min</span></div>`);
    if (ex.log.distance !== "") rows.push(`<div class="stat-line"><span class="lbl">DISTANCE</span><span class="val">${escapeHTML(ex.log.distance)} ${unit}</span></div>`);
    if (kind === "cardio" && ex.log.effort !== "") rows.push(`<div class="stat-line"><span class="lbl">EFFORT</span><span class="val">${escapeHTML(ex.log.effort)}/10</span></div>`);
    if (kind === "ruck" && ex.log.loadLbs !== "") rows.push(`<div class="stat-line"><span class="lbl">LOAD</span><span class="val">${escapeHTML(ex.log.loadLbs)} lbs</span></div>`);
    lines = rows.join("");
  } else if (kind === "interval") {
    lines = `<div class="stat-line"><span class="lbl">ROUNDS COMPLETED</span><span class="val">${escapeHTML(ex.log.roundsCompleted)}</span></div>`;
  }
  return `<div class="wk-detail-block">
    <div class="db-name">${escapeHTML(ex.name)} <span class="kind-badge" style="margin-left:6px;">${kind.toUpperCase()}</span></div>
    ${lines}
    ${ex.note ? `<div class="wk-detail-note">${escapeHTML(ex.note)}</div>` : ""}
  </div>`;
}

function openHistoryDetail(id) {
  const w = state.history.find((x) => x.id === id);
  if (!w) return;
  selectedHistoryId = id;
  el("wk-detail-title").textContent = w.templateName;
  el("wk-detail-sub").textContent = `${w.variantName} · ${fmtFullDate(w.date)}`;
  const exercises = completedExercisesOf(w);
  el("wk-detail-body").innerHTML = exercises.length ? exercises.map(detailBlockHTML).join("") : `<p class="hint-text">No completed sets recorded.</p>`;
  el("wk-detail-ex-count").textContent = exercises.length;
  el("wk-detail-set-count").textContent = exercises.reduce((sum, ex) => sum + (ex.kind === "strength" ? ex.sets.length : 1), 0);
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
