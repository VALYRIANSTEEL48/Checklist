/* =========================================================
   GAMIFICATION — gamification.js
   Power Level + Ranks. Not a CRUD module and not an event ledger: every
   point source except "opened the app" is fully derivable by counting
   qualifying records that already live in another module's state.
   Nothing is logged as "+15 points, checklist complete, Aug 6" — the
   total is recomputed fresh each time from source data. This avoids an
   entire category of bugs (double-counting, points awarded twice,
   ledger drifting from reality) for free, consistent with the
   "resolve on demand, don't store derived state" principle used
   elsewhere in this app (Checklist streaks, Program session
   resolution, Targets' "terminated" flag).

   Has no view/screen of its own — it's a read layer, surfaced on the
   dashboard (small readout) and on Profile (hero block) and via the
   rank-up celebration modal. Only two things are actually persisted
   here: the app-open log (nothing else tracks "was the app opened
   today") and lastSeenLevel (the mechanism that makes a level-up a
   moment instead of just a number that changed).
   ========================================================= */

(function () {
"use strict";

const STORAGE_KEY = "gamification_state_v1";

// Placeholder names — the person wants to name these themselves (see
// Settings > RANKS). Thresholds (RANK_LEVEL_THRESHOLDS below) are not
// user-editable in v1, only the names are.
const DEFAULT_RANK_NAMES = ["RECRUIT","PRIVATE","CORPORAL","SERGEANT","LIEUTENANT","CAPTAIN","MAJOR","COLONEL","GENERAL"];
// Tunable, not final — flagged per TIER1_BRIEFING.md so it's easy to
// retune once there's real point accumulation to look at.
const RANK_LEVEL_THRESHOLDS = [1, 5, 10, 15, 20, 25, 30, 35, 40];

// Point values per source. Also tunable.
const POINTS = {
  appOpenPerDay: 5,
  checklistFullDay: 15,
  workoutLogged: 20,
  weeklyTargetHit: 25,
  targetCleanDay: 3,
  targetGoalReached: 100,
  assignmentCompleted: 30,
  assignmentOnTimeBonus: 10,
  missionMilestone: 40,
  missionCompleted: 250,
  winGeneral: 10,
  winFitness: 15,
  winMoney: 20
};

/* ---------- STATE ---------- */
function defaultState() {
  return { openLog: [], lastSeenLevel: 1, rankNames: DEFAULT_RANK_NAMES.slice() };
}
let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const base = defaultState();
    return {
      openLog: Array.isArray(parsed.openLog) ? parsed.openLog : base.openLog,
      lastSeenLevel: typeof parsed.lastSeenLevel === "number" ? parsed.lastSeenLevel : base.lastSeenLevel,
      rankNames: Array.isArray(parsed.rankNames) && parsed.rankNames.length === DEFAULT_RANK_NAMES.length
        ? parsed.rankNames : base.rankNames
    };
  } catch (e) {
    console.error("Failed to load gamification state, resetting.", e);
    return defaultState();
  }
}
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

/* ---------- DATE UTILITIES ---------- */
function pad2(n) { return String(n).padStart(2, "0"); }
function formatDate(d) { d = new Date(d); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function todayStr() { return formatDate(new Date()); }
function addDaysStr(ds, n) {
  const d = new Date(ds + "T12:00:00");
  d.setDate(d.getDate() + n);
  return formatDate(d);
}
// Monday-anchored week key, same bucketing workout.js's getWeekDays()
// uses for "this week" — reused here to walk *all* historical weeks
// rather than just the current one.
function mondayKeyOf(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  const dow = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((dow + 6) % 7));
  return formatDate(monday);
}

const el = (id) => document.getElementById(id);

/* ---------- APP-OPEN LOG (the one real piece of state) ----------
   Idempotent by construction: adding today's date is a no-op if it's
   already present, so calling this multiple times in the same day
   (multiple renders, multiple tab focuses) never double-counts. */
function recordAppOpen() {
  const today = todayStr();
  if (!state.openLog.includes(today)) {
    state.openLog.push(today);
    save();
  }
}
function openStreak() {
  const set = new Set(state.openLog);
  let streak = 0;
  let cursor = todayStr();
  let guard = 0;
  while (set.has(cursor) && guard < 3660) {
    streak++; guard++;
    cursor = addDaysStr(cursor, -1);
  }
  return streak;
}

/* ---------- POINT SOURCES (pure — computed fresh, nothing logged) ---------- */

// Full-checklist-day count, across every day since the checklist's
// first task existed. The day-completion logic itself lives in
// checklist.js (ChecklistData.isDayComplete) — this just walks dates.
function countFullChecklistDays() {
  if (!window.ChecklistData) return 0;
  const cs = window.ChecklistData.getState();
  if (!cs.tasks || !cs.tasks.length) return 0;
  const earliest = cs.tasks.reduce((min, t) => {
    const d = t.createdAt ? t.createdAt.slice(0, 10) : null;
    if (!d) return min;
    return (min === null || d < min) ? d : min;
  }, null);
  if (!earliest) return 0;
  const today = todayStr();
  let count = 0;
  let cursor = earliest;
  let guard = 0;
  while (cursor <= today && guard < 3660) {
    guard++;
    if (window.ChecklistData.isDayComplete(cursor)) count++;
    cursor = addDaysStr(cursor, 1);
  }
  return count;
}

function countWeeksHittingTarget(workoutState) {
  const history = workoutState.history || [];
  if (!history.length) return 0;
  const target = Math.max(1, workoutState.weeklyTarget || 7);
  const weekCounts = {};
  history.forEach((w) => {
    const key = mondayKeyOf(w.date);
    weekCounts[key] = (weekCounts[key] || 0) + 1;
  });
  return Object.values(weekCounts).filter((c) => c >= target).length;
}

// The core design insight this module is built around: every number
// here is a fresh count over another module's existing state, never a
// stored running total. Rendering this twice in a row with no
// underlying data change must produce the same answer — that's the
// whole point (see TIER1_BRIEFING.md's testing requirements).
function computeTotalPoints() {
  let total = state.openLog.length * POINTS.appOpenPerDay;

  if (window.ChecklistData) {
    total += countFullChecklistDays() * POINTS.checklistFullDay;
  }

  if (window.WorkoutData) {
    const ws = window.WorkoutData.getState();
    total += (ws.history || []).length * POINTS.workoutLogged;
    total += countWeeksHittingTarget(ws) * POINTS.weeklyTargetHit;
  }

  if (window.TargetsData) {
    total += window.TargetsData.totalCleanDaysAcrossHabits() * POINTS.targetCleanDay;
    total += window.TargetsData.terminatedCount() * POINTS.targetGoalReached;
  }

  if (window.AssignmentsData) {
    const as = window.AssignmentsData.getState();
    const completed = (as.assignments || []).filter((a) => a.status === "completed");
    total += completed.length * POINTS.assignmentCompleted;
    total += completed.filter((a) => a.dueDate && a.completedAt && a.completedAt.slice(0, 10) <= a.dueDate).length * POINTS.assignmentOnTimeBonus;
  }

  if (window.MissionsData) {
    const ms = window.MissionsData.getState();
    const allMilestones = (ms.missions || []).reduce((acc, m) => acc.concat(m.milestones || []), []);
    total += allMilestones.filter((x) => x.done).length * POINTS.missionMilestone;
    total += (ms.missions || []).filter((m) => m.status === "completed").length * POINTS.missionCompleted;
  }

  if (window.WinsData) {
    const counts = window.WinsData.countByCategory();
    total += (counts.general || 0) * POINTS.winGeneral
      + (counts.fitness || 0) * POINTS.winFitness
      + (counts.money || 0) * POINTS.winMoney;
  }

  return total;
}

/* ---------- LEVEL CURVE + RANKS ---------- */
// Fast early levels, progressively harder later. Constants (50, the
// sqrt curve) are tunable — see TIER1_BRIEFING.md.
function levelForPoints(points) {
  return Math.floor(Math.sqrt(Math.max(0, points) / 50)) + 1;
}
// Inverse of levelForPoints: minimum points required to *be* this level.
function pointsFloorForLevel(level) {
  return 50 * Math.pow(Math.max(1, level) - 1, 2);
}
function rankNameForLevel(level) {
  let idx = 0;
  for (let i = 0; i < RANK_LEVEL_THRESHOLDS.length; i++) {
    if (level >= RANK_LEVEL_THRESHOLDS[i]) idx = i; else break;
  }
  return state.rankNames[idx] || state.rankNames[state.rankNames.length - 1];
}

/* ---------- RANK-UP DETECTION ----------
   The only way to know a level-up just happened (vs. just displaying
   the current level on every render) is comparing against a persisted
   "last seen" checkpoint. Fires exactly once per threshold crossed:
   the first call after crossing returns leveledUp:true and immediately
   persists the new checkpoint, so a second call — even in the same
   session — sees newLevel === lastSeenLevel and returns false. */
function checkForLevelUp() {
  const points = computeTotalPoints();
  const newLevel = levelForPoints(points);
  const leveledUp = newLevel > (state.lastSeenLevel || 1);
  const result = { leveledUp, newLevel, newRank: rankNameForLevel(newLevel) };
  if (newLevel !== state.lastSeenLevel) {
    state.lastSeenLevel = newLevel;
    save();
  }
  return result;
}

/* ---------- SETTINGS: rank-name editing ---------- */
function populateSettingsFields() {
  const wrap = el("gm-rank-names");
  if (!wrap) return;
  wrap.querySelectorAll("input[data-rank-idx]").forEach((input) => {
    const idx = Number(input.getAttribute("data-rank-idx"));
    input.value = state.rankNames[idx] || "";
  });
}
document.addEventListener("change", (e) => {
  if (e.target && e.target.matches && e.target.matches("#gm-rank-names input[data-rank-idx]")) {
    const idx = Number(e.target.getAttribute("data-rank-idx"));
    const val = e.target.value.trim();
    if (val) { state.rankNames[idx] = val; save(); }
  }
});

/* ---------- PUBLIC INTERFACE ---------- */
window.GamificationData = {
  getState: () => state,
  setState: (newState) => { state = newState; },
  wipe: () => { state = defaultState(); save(); },
  populateSettings: populateSettingsFields,
  goHome: () => {},
  totalPoints: () => computeTotalPoints(),
  level: () => levelForPoints(computeTotalPoints()),
  rankName: () => rankNameForLevel(levelForPoints(computeTotalPoints())),
  pointsFloorForLevel,
  openStreak,
  checkForLevelUp
};

/* ---------- INIT ---------- */
recordAppOpen();

})();
