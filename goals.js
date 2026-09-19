/* =========================================================
   TARGETS — goals.js
   The positive counterpart to Hit List (targets.js): pick something
   that's already tracked elsewhere — a repeating Checklist task, or the
   general "did I train today" Workout streak — and set a target on it.
   Nothing is tracked here directly; every target is a thin layer over a
   streak counter that already lives in another module, watched rather
   than duplicated (same "derive, don't store" convention this app uses
   everywhere else it reasonably can).

   Two target types:
     - "fixed"    — a target streak length in days (e.g. 7). Progress
                    fills as the underlying streak runs; hitting the
                    length awards points and the bar refills for the
                    next cycle. Meant for breaking in a new habit with a
                    small, winnable first goal.
     - "everyday" — no fixed length, no refilling bar, never "complete" —
                    just a streak that's meant to never break. Rewarded
                    with a small flat amount per day it stays alive, plus
                    much larger one-time bonuses at length milestones (a
                    week, a month, three months, six months, a year, then
                    every additional year — see gamification.js's
                    EVERYDAY_MILESTONES). The reward is front-loaded
                    toward those milestones on purpose: the gap between
                    "consistent most of the time" and "never once missed,
                    for years" is enormous, and this is meant to feel
                    like it.

   A fixed target's "how many times has this ever filled" can't be
   recovered from the underlying streak's CURRENT length alone once it's
   reset (a past cycle's history is gone the moment the streak breaks) —
   so unlike everything else in this module, a fixed target keeps one
   small piece of real state: totalHits (a permanent running count) and
   lastCheckedStreak (a watermark so recomputeFixedHits can tell how many
   *new* multiples of `days` were crossed since the last check, without
   double-counting or losing partial credit across a reset). An everyday
   target deliberately has no equivalent memory — its milestone bonuses
   are re-derived fresh from the CURRENT streak every time, so breaking
   the streak genuinely forfeits them until they're re-earned. That's not
   a limitation, it's the point.
   ========================================================= */

(function () {
"use strict";

const STORAGE_KEY = "goals_state_v1";

/* ---------- STATE ---------- */
function defaultState() { return { targets: [] }; }
let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return { targets: Array.isArray(parsed.targets) ? parsed.targets : [] };
  } catch (e) {
    console.error("Failed to load targets state, resetting.", e);
    return defaultState();
  }
}
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

/* ---------- SOURCE STREAKS (reads another module's derived state) ---------- */
function sourceName(target) {
  if (target.kind === "workout") return "WORKOUT STREAK";
  if (!window.ChecklistData) return "TASK";
  const task = window.ChecklistData.getState().tasks.find((t) => t.id === target.taskId);
  return task ? task.name : "DELETED TASK";
}
// The task this target points at might have been deleted since — treat
// that as a dead target (streak 0, still shown, still deletable) rather
// than throwing, same defensive spirit as the rest of the app.
function currentStreakFor(target) {
  if (target.kind === "workout") return window.WorkoutData ? window.WorkoutData.workoutStreak() : 0;
  return window.ChecklistData ? window.ChecklistData.taskStreak(target.taskId) : 0;
}
function sourceStillExists(target) {
  if (target.kind === "workout") return !!window.WorkoutData;
  if (!window.ChecklistData) return false;
  return window.ChecklistData.getState().tasks.some((t) => t.id === target.taskId);
}

/* ---------- FIXED-TARGET HIT TRACKING (see header comment) ---------- */
function recomputeFixedHits(target) {
  if (target.type !== "fixed") return;
  const days = Math.max(1, target.days || 7);
  const current = currentStreakFor(target);
  const prev = target.lastCheckedStreak || 0;
  if (current < prev) {
    // Streak reset since the last check — banked hits stay banked, just
    // start watching for new crossings from wherever it is now.
    target.lastCheckedStreak = current;
    return;
  }
  const prevMultiples = Math.floor(prev / days);
  const newMultiples = Math.floor(current / days);
  if (newMultiples > prevMultiples) target.totalHits = (target.totalHits || 0) + (newMultiples - prevMultiples);
  target.lastCheckedStreak = current;
}
function recomputeAllFixedHits() {
  let changed = false;
  state.targets.forEach((t) => {
    if (t.type !== "fixed") return;
    const before = t.totalHits || 0;
    recomputeFixedHits(t);
    if ((t.totalHits || 0) !== before) changed = true;
  });
  if (changed) save();
}

/* ---------- ICONS ---------- */
function flagIconSVG(size) {
  size = size || 18;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 21V10M4 10l3-3 3 2 4-5 4 3M4 10V4"/><circle cx="18" cy="7" r="1.4" fill="currentColor" stroke="none"/></svg>`;
}
function penIconSVG(size) {
  size = size || 16;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
}
function escapeHTML(s) {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
}

/* ---------- EVERYDAY MILESTONES (mirrors gamification.js's own list —
   duplicated here only for display purposes; point VALUES stay solely in
   gamification.js, this is just "what's the next number to show") ---------- */
const MILESTONE_DAYS = [7, 30, 90, 180, 365];
function nextMilestone(days) {
  const next = MILESTONE_DAYS.find((m) => m > days);
  if (next != null) return next;
  // Past the first year: next milestone is the next full additional year.
  return (Math.floor(days / 365) + 1) * 365;
}
function milestonesCrossedCount(days) {
  let count = MILESTONE_DAYS.filter((m) => days >= m).length;
  if (days > 365) count += Math.floor(days / 365) - 1;
  return count;
}

/* ---------- RUNTIME (non-persisted) STATE ---------- */
let screen = null;       // null | 'edit'
let editingId = null;
let pendingSource = null; // { kind, taskId? } — chosen in the source-picker sheet, not yet a real target
let draftDays = 7;

const el = (id) => document.getElementById(id);

function currentTarget() {
  return editingId ? state.targets.find((t) => t.id === editingId) : null;
}

/* ---------- RENDER ROOT ---------- */
function render() {
  recomputeAllFixedHits();
  let html;
  let hadError = false;
  try {
    html = screen === "edit" ? editScreenHTML() : listScreenHTML();
  } catch (err) {
    console.error("Targets render error:", err);
    html = errorScreenHTML(err);
    hadError = true;
  }
  el("targets-screen").innerHTML = html;
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
  return `<div class="wk-builder-panel" style="border-color:var(--danger);">
    <h1 class="screen-h1" style="color:var(--danger);">SOMETHING WENT WRONG</h1>
    <p class="hint-text">The Targets screen hit an error. Your data is safe — nothing was deleted.</p>
    <div class="text-input" style="white-space:pre-wrap; word-break:break-word; font-family:var(--font-mono); font-size:11px; user-select:text;">${escapeHTML(msg)}</div>
    <button class="btn-primary" id="btn-tgt-error-home">GO TO TARGETS HOME</button>
  </div>`;
}
function attachErrorScreenHandlers() {
  const btn = el("btn-tgt-error-home");
  if (btn) btn.onclick = () => { screen = null; editingId = null; render(); };
}

/* ---------- LIST SCREEN ---------- */
function targetCardHTML(t) {
  const name = sourceName(t);
  const streak = currentStreakFor(t);
  const exists = sourceStillExists(t);
  if (t.type === "fixed") {
    const days = Math.max(1, t.days || 7);
    const intoThisCycle = streak % days;
    const pct = Math.round((intoThisCycle / days) * 100);
    return `<div class="tgt-card">
      <button class="tgt-open" data-open-target="${t.id}">
        <div class="tgt-top">
          <div class="tgt-icon">${flagIconSVG(18)}</div>
          <div class="tgt-body">
            <div class="tgt-name">${escapeHTML(name)}${exists ? "" : " (deleted)"}</div>
            <div class="tgt-sub">FIXED ${days}D <span class="tgt-hits">· HIT ${t.totalHits || 0}×</span></div>
          </div>
          <div class="tgt-streak-pill">${streak}<span>D</span></div>
        </div>
        <div class="tgt-fill-track"><div class="tgt-fill-bar" style="width:${pct}%;"></div></div>
        <div class="tgt-fill-label">${intoThisCycle}/${days} DAYS THIS CYCLE</div>
      </button>
      <button class="hc-settings-btn" data-edit-target="${t.id}" aria-label="Target settings">${penIconSVG(15)}</button>
    </div>`;
  }
  const nm = nextMilestone(streak);
  const crossed = milestonesCrossedCount(streak);
  return `<div class="tgt-card tgt-everyday">
    <button class="tgt-open" data-open-target="${t.id}">
      <div class="tgt-top">
        <div class="tgt-icon">${flagIconSVG(18)}</div>
        <div class="tgt-body">
          <div class="tgt-name">${escapeHTML(name)}${exists ? "" : " (deleted)"}</div>
          <div class="tgt-sub">EVERYDAY <span class="tgt-hits">· ${crossed} MILESTONE${crossed === 1 ? "" : "S"}</span></div>
        </div>
        <div class="tgt-streak-pill">${streak}<span>D</span></div>
      </div>
      <div class="tgt-fill-label">NEXT MILESTONE: ${nm} DAYS (${Math.max(0, nm - streak)} TO GO)</div>
    </button>
    <button class="hc-settings-btn" data-edit-target="${t.id}" aria-label="Target settings">${penIconSVG(15)}</button>
  </div>`;
}
function listScreenHTML() {
  const fixed = state.targets.filter((t) => t.type === "fixed");
  const everyday = state.targets.filter((t) => t.type === "everyday");
  return `<h1 class="screen-h1">TARGETS</h1>
    <button class="wk-dashed-card" style="width:100%; text-align:center; margin-bottom:18px;" id="btn-tgt-new">+ ADD TARGET</button>
    ${state.targets.length === 0 ? `<p class="hint-text" style="text-align:center; padding:30px 0;">No targets set yet. Pick a task or your workout streak and give it something to aim for.</p>` : ""}
    ${everyday.length ? `<h2 class="group-title"><span class="tick"></span>EVERYDAY</h2>${everyday.map(targetCardHTML).join("")}` : ""}
    ${fixed.length ? `<h2 class="group-title muted" style="margin-top:22px;"><span class="tick"></span>FIXED</h2>${fixed.map(targetCardHTML).join("")}` : ""}`;
}

/* ---------- EDIT / DETAIL SCREEN ---------- */
function editScreenHTML() {
  const t = currentTarget();
  if (!t) return "";
  const name = sourceName(t);
  const streak = currentStreakFor(t);
  const days = Math.max(1, t.days || 7);
  return `
    <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
      <button class="icon-btn" id="btn-tgt-detail-back">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <h1 class="screen-h1" style="margin:0;">${escapeHTML(name)}</h1>
    </div>
    <span class="status-badge ${t.type === "everyday" ? "primary" : "active"}" style="margin:0 0 14px; display:inline-block;">${t.type === "everyday" ? "EVERYDAY" : "FIXED " + days + "D"}</span>
    <div class="readout-panel corner-bracket" style="margin-bottom:18px;">
      <div class="readout-main">
        <div class="readout-block"><div class="readout-label">CURRENT STREAK</div><div class="readout-value">${streak}</div></div>
        <div class="readout-divider"></div>
        ${t.type === "fixed"
          ? `<div class="readout-block"><div class="readout-label">TOTAL HITS</div><div class="readout-value">${t.totalHits || 0}</div></div>`
          : `<div class="readout-block"><div class="readout-label">MILESTONES</div><div class="readout-value">${milestonesCrossedCount(streak)}</div></div>`}
      </div>
    </div>
    ${t.type === "fixed" ? `
    <label class="field-label" style="margin-top:0;">TARGET LENGTH (DAYS)</label>
    <div class="stepper">
      <button type="button" id="tgt-days-minus">−</button>
      <div class="stepper-value" id="tgt-days-value">${days}</div>
      <button type="button" id="tgt-days-plus">+</button>
    </div>
    <p class="hint-text" style="margin-top:-6px;">Changing this doesn't erase hits already banked at the old length.</p>
    ` : `<p class="hint-text">Everyday targets don't have a length to adjust — the goal is simply not breaking it.</p>`}
    <div style="margin-top:14px;">
      <button class="btn-danger-outline" id="btn-tgt-delete">REMOVE TARGET</button>
    </div>
  `;
}
function attachHandlers() {
  if (screen === "edit") { attachEditHandlers(); return; }
  document.querySelectorAll("[data-open-target]").forEach((b) => b.onclick = () => openEdit(b.getAttribute("data-open-target")));
  document.querySelectorAll("[data-edit-target]").forEach((b) => b.onclick = () => openEdit(b.getAttribute("data-edit-target")));
  const newBtn = el("btn-tgt-new");
  if (newBtn) newBtn.onclick = () => openSourcePicker();
}
function attachEditHandlers() {
  const t = currentTarget();
  if (!t) return;
  const backBtn = el("btn-tgt-detail-back");
  if (backBtn) backBtn.onclick = () => { screen = null; editingId = null; render(); };

  if (t.type === "fixed") {
    const minus = el("tgt-days-minus"), plus = el("tgt-days-plus");
    if (minus) minus.onclick = () => { t.days = Math.max(1, (t.days || 7) - 1); save(); el("tgt-days-value").textContent = t.days; };
    if (plus) plus.onclick = () => { t.days = (t.days || 7) + 1; save(); el("tgt-days-value").textContent = t.days; };
  }

  const deleteBtn = el("btn-tgt-delete");
  if (deleteBtn) deleteBtn.onclick = () => {
    if (confirm(`Remove this target? This only removes the target — it doesn't touch the underlying streak.`)) {
      state.targets = state.targets.filter((x) => x.id !== t.id);
      save();
      screen = null; editingId = null;
      render();
      window.showToast && window.showToast("TARGET REMOVED");
    }
  };
}
function openEdit(id) {
  editingId = id;
  screen = "edit";
  render();
}

/* ---------- SOURCE-PICKER SHEET ---------- */
function openSheet(id) { el(id).classList.add("open"); }
function closeSheet(id) { el(id).classList.remove("open"); }
function targetedTaskIds() { return new Set(state.targets.filter((t) => t.kind === "task").map((t) => t.taskId)); }
function hasWorkoutTarget() { return state.targets.some((t) => t.kind === "workout"); }
function openSourcePicker() {
  const taken = targetedTaskIds();
  const tasks = window.ChecklistData ? window.ChecklistData.repeatingTasks().filter((t) => !taken.has(t.id)) : [];
  const workoutRow = hasWorkoutTarget() ? "" : `
    <button class="preset-card" data-pick-source="workout" style="width:100%; text-align:left; display:flex; align-items:center; gap:10px; margin-bottom:8px;">
      <div class="pc-icon">${flagIconSVG(20)}</div>
      <div class="pc-name">GENERAL WORKOUT STREAK</div>
    </button>`;
  const taskRows = tasks.map((t) => `
    <button class="preset-card" data-pick-source="task:${t.id}" style="width:100%; text-align:left; display:flex; align-items:center; gap:10px; margin-bottom:8px;">
      <div class="pc-icon">${flagIconSVG(20)}</div>
      <div class="pc-name">${escapeHTML(t.name)}</div>
    </button>`).join("");
  const body = workoutRow + taskRows;
  el("tgt-source-list").innerHTML = body || `<p class="hint-text">No repeating tasks available, and the workout streak already has a target. Add a repeating task in Checklist first.</p>`;
  document.querySelectorAll("[data-pick-source]").forEach((b) => b.onclick = () => {
    const v = b.getAttribute("data-pick-source");
    pendingSource = v === "workout" ? { kind: "workout" } : { kind: "task", taskId: v.slice(5) };
    closeSheet("tgt-source-overlay");
    openTypePicker();
  });
  openSheet("tgt-source-overlay");
}
el("btn-close-tgt-source").addEventListener("click", () => closeSheet("tgt-source-overlay"));
el("tgt-source-overlay").addEventListener("click", (e) => { if (e.target.id === "tgt-source-overlay") closeSheet("tgt-source-overlay"); });

// Type picker reuses the same source-picker sheet's body (simpler than a
// second static overlay) — swaps its content for a fixed-vs-everyday
// choice once a source has been picked.
function openTypePicker() {
  draftDays = 7;
  el("tgt-source-list").innerHTML = `
    <p class="hint-text" style="margin-bottom:12px;">Setting a target on <b>${escapeHTML(pendingSource.kind === "workout" ? "your workout streak" : sourceName({ kind: "task", taskId: pendingSource.taskId }))}</b>.</p>
    <button class="preset-card" data-pick-type="fixed" style="width:100%; text-align:left; margin-bottom:10px;">
      <div class="pc-name">FIXED LENGTH</div>
      <p class="hint-text" style="margin:4px 0 0;">Pick a streak length. Fills a bar, awards points, refills for the next cycle. Good for breaking in a new habit.</p>
    </button>
    <button class="preset-card" data-pick-type="everyday" style="width:100%; text-align:left;">
      <div class="pc-name">EVERYDAY</div>
      <p class="hint-text" style="margin:4px 0 0;">No length, no refill — a streak meant to never break. Small daily reward, much bigger bonuses at long milestones. A real commitment.</p>
    </button>
  `;
  document.querySelectorAll("[data-pick-type]").forEach((b) => b.onclick = () => {
    const type = b.getAttribute("data-pick-type");
    if (type === "fixed") openFixedLengthPicker();
    else createTarget("everyday");
  });
  openSheet("tgt-source-overlay");
}
function openFixedLengthPicker() {
  el("tgt-source-list").innerHTML = `
    <label class="field-label" style="margin-top:0;">TARGET LENGTH (DAYS)</label>
    <div class="stepper">
      <button type="button" id="tgt-new-days-minus">−</button>
      <div class="stepper-value" id="tgt-new-days-value">${draftDays}</div>
      <button type="button" id="tgt-new-days-plus">+</button>
    </div>
    <button class="btn-primary" id="btn-tgt-create-fixed" style="margin-top:16px;">CREATE TARGET</button>
  `;
  el("tgt-new-days-minus").onclick = () => { draftDays = Math.max(1, draftDays - 1); el("tgt-new-days-value").textContent = draftDays; };
  el("tgt-new-days-plus").onclick = () => { draftDays = draftDays + 1; el("tgt-new-days-value").textContent = draftDays; };
  el("btn-tgt-create-fixed").onclick = () => createTarget("fixed");
}
function createTarget(type) {
  const record = Object.assign({ id: uid(), type, createdAt: new Date().toISOString(), totalHits: 0, lastCheckedStreak: 0, days: type === "fixed" ? draftDays : null }, pendingSource);
  state.targets.push(record);
  save();
  closeSheet("tgt-source-overlay");
  pendingSource = null;
  screen = null; editingId = null;
  render();
  window.showToast && window.showToast("TARGET SET");
}

/* ---------- TOP STRIP ---------- */
el("btn-targets-back").addEventListener("click", () => window.goToDashboard());
el("btn-targets-settings").addEventListener("click", () => window.openMergedSettings());

/* ---------- PUBLIC INTERFACE ---------- */
window.TargetsData = {
  getState: () => state,
  setState: (newState) => { state = newState; render(); },
  wipe: () => { state = defaultState(); save(); render(); },
  populateSettings: () => {},
  goHome: () => { screen = null; editingId = null; render(); },
  // Quick-add entry point (global bottom-strip plus button).
  openCreate: () => { screen = null; editingId = null; render(); openSourcePicker(); },
  activeCount: () => state.targets.length,
  // Dashboard "X HIT" readout: fixed-target cycles filled, plus every
  // milestone an everyday target has ever crossed at its current streak.
  hitCount: () => state.targets.reduce((sum, t) => sum + (t.type === "fixed" ? (t.totalHits || 0) : milestonesCrossedCount(currentStreakFor(t))), 0),
  // For gamification.js's point calculation — see this file's header
  // comment and gamification.js's own POINTS.target* entries.
  totalHitCount: () => { recomputeAllFixedHits(); return state.targets.filter((t) => t.type === "fixed").reduce((sum, t) => sum + (t.totalHits || 0), 0); },
  totalEverydayActiveDays: () => state.targets.filter((t) => t.type === "everyday").reduce((sum, t) => sum + currentStreakFor(t), 0),
  // milestoneFn is gamification.js's own everydayMilestonesCrossed — kept
  // there (not duplicated here) so the day-threshold tuning lives in one
  // place alongside the point values it multiplies.
  totalEverydayMilestonesCrossed: (milestoneFn) => state.targets.filter((t) => t.type === "everyday").reduce((sum, t) => sum + milestoneFn(currentStreakFor(t)), 0)
};

/* ---------- INIT ---------- */
recomputeAllFixedHits();
render();

})();
