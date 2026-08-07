/* =========================================================
   SHELL — shell.js
   Owns the dashboard, view switching between Checklist/Workouts,
   the shared Settings sheet, and combined backup/export/import.
   ========================================================= */

(function () {
"use strict";

const el = (id) => document.getElementById(id);
const VIEWS = ["view-dashboard", "view-checklist", "view-workout", "view-assignments", "view-targets", "view-missions", "view-wins", "view-profile"];

function showView(id) {
  VIEWS.forEach((v) => { el(v).hidden = v !== id; });
  // The global bottom strip is present on every view — reset it visible
  // by default each time we switch views (a module that needs it hidden,
  // e.g. Workouts mid-drill-down, re-hides it on its own next render via
  // window.setGlobalNavVisible).
  if (window.setGlobalNavVisible) window.setGlobalNavVisible(true);
  if (typeof refreshGlobalNavActive === "function") refreshGlobalNavActive(id);
}

function pad3(n) { return String(n).padStart(3, "0"); }
function pad2(n) { return String(n).padStart(2, "0"); }

/* ---------- SITREP: module status board ---------- */
function refreshDashboard() {
  if (window.ChecklistData) {
    const cs = window.ChecklistData.todaySummary();
    el("dash-checklist-stat").innerHTML = cs.done + '<span class="sc-stat-sep">/</span>' + cs.due;
    el("dash-checklist-sub").textContent = "STREAK " + pad3(cs.streak);
  }
  if (window.WorkoutData) {
    const ws = window.WorkoutData.todaySummary();
    let stat = "REST DAY";
    if (!ws.hasProgram) stat = "FREEFORM";
    else if (ws.status === "session") stat = ws.loggedToday ? "LOGGED" : ws.sessionName;
    else if (ws.status === "not-started") stat = "UPCOMING";
    else if (ws.status === "completed") stat = "COMPLETE";
    el("dash-workout-stat").textContent = stat;
    el("dash-workout-sub").textContent = ws.weeklyCount + "/" + ws.weeklyTarget + " THIS WK";
  }
  if (window.AssignmentsData) {
    const n = window.AssignmentsData.activeCount();
    const nu = window.AssignmentsData.nextUp();
    el("dash-assignments-stat").textContent = n;
    el("dash-assignments-sub").textContent = !nu ? "NONE ACTIVE"
      : nu.overdue ? "OVERDUE" : nu.dueDate ? "DUE " + fmtDateShort(nu.dueDate) : "NO DUE DATE";
  }
  if (window.TargetsData) {
    el("dash-targets-stat").textContent = window.TargetsData.bestStreak();
    el("dash-targets-sub").textContent = window.TargetsData.trackedCount() + " TRACKED";
  }
  if (window.MissionsData) {
    const primary = window.MissionsData.getPrimaryMission();
    el("dash-missions-stat").textContent = primary ? primary.title : "NO MISSIONS";
    if (primary) {
      const total = (primary.milestones || []).length;
      const done = (primary.milestones || []).filter((x) => x.done).length;
      el("dash-missions-sub").textContent = total ? done + "/" + total + " MILESTONES" : "PRIMARY";
    } else {
      el("dash-missions-sub").textContent = "NO PRIMARY";
    }
  }
  if (window.WinsData) {
    const ws = window.WinsData.getState();
    el("dash-wins-stat").textContent = ws.wins.length;
    const counts = window.WinsData.countByCategory();
    el("dash-wins-sub").textContent = counts.money + "M · " + counts.fitness + "F · " + counts.general + "G";
  }
  if (window.GamificationData) {
    const level = window.GamificationData.level();
    const rank = window.GamificationData.rankName();
    // Note: the dash-profile-stat/-sub readout was removed along with the
    // dashboard's Profile tile (Profile is now reached via the persistent
    // global-bottom-strip instead) — totalPoints() is still computed
    // elsewhere (Profile module itself) so nothing else needs it here.
    el("dash-power-level").textContent = "LV." + level;
    el("dash-power-rank").textContent = rank;
  }
  updatePriority();
}

/* ---------- DASHBOARD DISPLAY SETTINGS (clock + weather widget) ----------
   Shell owns the dashboard, so it gets its own small localStorage
   namespace for dashboard-only display prefs — same "one key per module"
   convention as everywhere else, just scoped to the shell instead of a
   feature module. */
const DASH_SETTINGS_KEY = "command_dashboard_settings_v1";
function defaultDashSettings() {
  return { timeFormat: "24h", timeOffsetMin: 0, clockFont: "standard", weatherStyle: "compact" };
}
function loadDashSettings() {
  try {
    const raw = localStorage.getItem(DASH_SETTINGS_KEY);
    if (!raw) return defaultDashSettings();
    return Object.assign(defaultDashSettings(), JSON.parse(raw));
  } catch (e) {
    console.error("Failed to load dashboard settings, resetting.", e);
    return defaultDashSettings();
  }
}
let dashSettings = loadDashSettings();
function saveDashSettings() { localStorage.setItem(DASH_SETTINGS_KEY, JSON.stringify(dashSettings)); }

/* ---------- SITREP: clock, date, time-of-day greeting ---------- */
const WEEKDAY_SHORT = ["SUN","MON","TUE","WED","THU","FRI","SAT"];
const MONTH_SHORT = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

// Sunrise/sun/sunset/moon — swaps in for the old static rotated-square
// "diamond" bullet next to the lede text, tracking the same time-of-day
// brackets the greeting itself already uses.
const TOD_ICONS = {
  sunrise: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v4M5.6 8.6l1.4 1.4M18.4 8.6l-1.4 1.4M2 14h2M20 14h2M4 18h16M8 14a4 4 0 018 0"/></svg>',
  sun:     '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg>',
  sunset:  '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8V4M5.6 8.6l1.4 1.4M18.4 8.6l-1.4 1.4M2 14h2M20 14h2M4 18h16M16 14a4 4 0 00-8 0"/></svg>',
  moon:    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 14.5A8.5 8.5 0 1110.5 4a7 7 0 009.5 10.5z"/></svg>'
};
// 12-hour formatter for the big dashboard clock specifically (distinct
// from fmtTime12 below, which formats "HH:MM"-style stored task/due
// times, not a live Date — kept separate rather than shared so a change
// to one format's rules can't accidentally affect the other).
function fmtDashClock12(now) {
  let h = now.getHours();
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12; if (h === 0) h = 12;
  return h + ":" + pad2(now.getMinutes()) + " " + ap;
}
function updateClock() {
  // The offset is a deliberate manual nudge (Settings > Dashboard), not a
  // timezone correction — it shifts what the dashboard *displays* (clock
  // text, greeting, time-of-day icon) without touching anything that
  // actually reads the real device clock elsewhere in the app (streaks,
  // due dates, etc. all still use real Date() untouched).
  const now = dashSettings.timeOffsetMin ? new Date(Date.now() + dashSettings.timeOffsetMin * 60000) : new Date();
  el("dash-time").textContent = dashSettings.timeFormat === "12h" ? fmtDashClock12(now) : (pad2(now.getHours()) + ":" + pad2(now.getMinutes()));
  el("dash-time").className = "sitrep-time clockfont-" + dashSettings.clockFont;
  el("dash-date").textContent = WEEKDAY_SHORT[now.getDay()] + " · " + MONTH_SHORT[now.getMonth()] + " " + now.getDate();
  const h = now.getHours();
  const greeting = h < 5 ? "NIGHT SITREP" : h < 12 ? "MORNING SITREP" : h < 17 ? "AFTERNOON SITREP" : h < 21 ? "EVENING SITREP" : "NIGHT SITREP";
  const todIcon = h < 5 ? TOD_ICONS.moon : h < 12 ? TOD_ICONS.sunrise : h < 17 ? TOD_ICONS.sun : h < 21 ? TOD_ICONS.sunset : TOD_ICONS.moon;
  el("dash-lede-text").textContent = greeting;
  el("dash-lede-icon").innerHTML = todIcon;
}

/* ---------- SITREP: single most urgent item across all modules ---------- */
function fmtTime12(hhmm) {
  if (!hhmm) return "";
  let [h, m] = hhmm.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12; if (h === 0) h = 12;
  return h + ":" + pad2(m) + " " + ap;
}
function fmtDateShort(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return MONTH_SHORT[m - 1] + " " + d;
}
function todayLocalStr() {
  const d = new Date();
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}

function updatePriority() {
  const candidates = [];

  if (window.AssignmentsData) {
    const nu = window.AssignmentsData.nextUp();
    if (nu && nu.overdue) candidates.push({ rank: 0, label: "OVERDUE", text: nu.title });
  }
  if (window.ChecklistData) {
    const cs = window.ChecklistData.todaySummary();
    if (cs.next && cs.next.time) candidates.push({ rank: 1, label: fmtTime12(cs.next.time), text: cs.next.name, overline: "NEXT TASK" });
  }
  if (window.WorkoutData) {
    const ws = window.WorkoutData.todaySummary();
    if (ws.hasProgram && ws.status === "session" && !ws.loggedToday) {
      candidates.push({ rank: 2, label: "TODAY'S SESSION", text: ws.sessionName });
    }
  }
  if (window.AssignmentsData) {
    const nu = window.AssignmentsData.nextUp();
    if (nu && !nu.overdue && nu.dueDate === todayLocalStr()) candidates.push({ rank: 3, label: "DUE TODAY", text: nu.title });
  }
  if (window.ChecklistData) {
    const cs = window.ChecklistData.todaySummary();
    if (cs.remaining > 0) candidates.push({ rank: 4, label: "REMAINING", text: cs.remaining + (cs.remaining === 1 ? " task" : " tasks") + " left today" });
  }

  candidates.sort((a, b) => a.rank - b.rank);
  const top = candidates[0];
  const panel = el("dash-priority");
  if (!top) { panel.hidden = true; return; }
  panel.hidden = false;
  const overlineEl = el("dash-priority-overline");
  overlineEl.hidden = !top.overline;
  if (top.overline) overlineEl.textContent = top.overline;
  el("dash-priority-label").textContent = top.label;
  el("dash-priority-text").textContent = top.text;
}

/* ---------- SITREP: weather (no API key — Open-Meteo + geolocation) ----------
   Fails silently and stays hidden if geolocation is denied/unavailable or
   the request fails — a missing weather chip is fine, an error state on
   the home screen is not. */
const WEATHER_CACHE_KEY = "command_weather_v1";
function weatherIconSVG(code) {
  if (code === 0) return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>';
  if (code <= 3) return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.5 19H7a4.5 4.5 0 01-.5-8.97A5.5 5.5 0 0117.3 8.8 4 4 0 0117.5 19z"/></svg>';
  if (code <= 48) return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 10h13a4 4 0 100-3.9M3 14h18M6 18h12"/></svg>';
  if (code <= 67 || (code >= 80 && code <= 82)) return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M16.5 15H7a4.5 4.5 0 01-.5-8.97A5.5 5.5 0 0116.3 4.8 4 4 0 0116.5 15z"/><path d="M8 18l-1.5 3M13 18l-1.5 3"/></svg>';
  if (code <= 77 || (code >= 85 && code <= 86)) return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M16.5 13H7a4.5 4.5 0 01-.5-8.97A5.5 5.5 0 0116.3 2.8 4 4 0 0116.5 13z"/><path d="M8 17v4M12 17v4M16 17v4"/></svg>';
  return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M16.5 13H7a4.5 4.5 0 01-.5-8.97A5.5 5.5 0 0116.3 2.8 4 4 0 0116.5 13z"/><path d="M11 16l-2 4h3l-2 4M15 16l1.5 3"/></svg>';
}
function weatherCodeLabel(code) {
  if (code === 0) return "CLEAR";
  if (code <= 3) return "PARTLY CLOUDY";
  if (code <= 48) return "FOG";
  if (code <= 67 || (code >= 80 && code <= 82)) return "RAIN";
  if (code <= 77 || (code >= 85 && code <= 86)) return "SNOW";
  return "STORMS";
}
let lastWeather = null;
function showWeather(tempF, code) {
  lastWeather = { tempF, code };
  el("dash-weather-icon").innerHTML = weatherIconSVG(code);
  el("dash-weather-temp").textContent = Math.round(tempF) + "°";
  el("dash-weather-cond").textContent = weatherCodeLabel(code);
  applyWeatherStyle();
}
// Re-applies the current weatherStyle setting to whatever weather is
// already showing (or hides the widget entirely), without needing a
// fresh fetch — used both right after a fetch and whenever the setting
// itself changes.
function applyWeatherStyle() {
  const w = el("dash-weather");
  if (dashSettings.weatherStyle === "hidden" || !lastWeather) { w.hidden = true; return; }
  w.hidden = false;
  el("dash-weather-cond").hidden = dashSettings.weatherStyle !== "detailed";
}
function loadCachedWeather() {
  try {
    const raw = localStorage.getItem(WEATHER_CACHE_KEY);
    if (!raw) return;
    const cached = JSON.parse(raw);
    if (cached && Date.now() - cached.ts < 60 * 60 * 1000) showWeather(cached.temp, cached.code);
  } catch (e) { /* ignore */ }
}
function fetchWeather() {
  if (!("geolocation" in navigator)) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&temperature_unit=fahrenheit`)
        .then((r) => r.ok ? r.json() : Promise.reject())
        .then((data) => {
          const temp = data && data.current && data.current.temperature_2m;
          const code = data && data.current && data.current.weather_code;
          if (typeof temp !== "number") return;
          showWeather(temp, code || 0);
          localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({ temp, code, ts: Date.now() }));
        })
        .catch(() => {});
    },
    () => {},
    { maximumAge: 30 * 60 * 1000, timeout: 8000 }
  );
}

window.goToDashboard = function () {
  showView("view-dashboard");
  refreshDashboard();
  checkRankUp();
};

/* ---------- GAMIFICATION: rank-up celebration ----------
   Checked on load and every time the dashboard is returned to (cheap —
   checkForLevelUp() only reports leveledUp:true the first time a
   threshold is crossed, then persists that checkpoint, so re-checking
   here on every dashboard visit is safe and doesn't re-trigger). */
function checkRankUp() {
  if (!window.GamificationData) return;
  try {
    const result = window.GamificationData.checkForLevelUp();
    if (result.leveledUp) showRankUp(result.newLevel, result.newRank);
  } catch (err) {
    console.error("Rank-up check failed:", err);
  }
}
function showRankUp(level, rank) {
  el("rankup-level").textContent = "LV." + level;
  el("rankup-rank").textContent = rank;
  el("rankup-overlay").classList.add("open");
}
el("btn-rankup-dismiss").addEventListener("click", () => el("rankup-overlay").classList.remove("open"));

function openChecklist() { showView("view-checklist"); }
function openWorkout() {
  // Always switch the view first, so even if something inside a module
  // throws, the person sees the (error-handled) screen instead of the tap
  // silently doing nothing.
  showView("view-workout");
  try {
    if (window.WorkoutData) window.WorkoutData.goHome();
  } catch (err) {
    console.error("Failed to open Workouts:", err);
  }
}
function openAssignments() {
  showView("view-assignments");
  try {
    if (window.AssignmentsData) window.AssignmentsData.goHome();
  } catch (err) {
    console.error("Failed to open Assignments:", err);
  }
}
function openTargets() {
  showView("view-targets");
  try {
    if (window.TargetsData) window.TargetsData.goHome();
  } catch (err) {
    console.error("Failed to open Targets:", err);
  }
}
function openMissions() {
  showView("view-missions");
  try {
    if (window.MissionsData) window.MissionsData.goHome();
  } catch (err) {
    console.error("Failed to open Missions:", err);
  }
}
function openWins() {
  showView("view-wins");
  try {
    if (window.WinsData) window.WinsData.goHome();
  } catch (err) {
    console.error("Failed to open Wins:", err);
  }
}
function openProfile() {
  showView("view-profile");
  try {
    if (window.ProfileData) window.ProfileData.goHome();
  } catch (err) {
    console.error("Failed to open Profile:", err);
  }
}
// Profile's recent-wins rows link into the Wins module itself.
window.openWinsFromProfile = openWins;

el("tile-checklist").addEventListener("click", openChecklist);
el("tile-workout").addEventListener("click", openWorkout);
el("tile-assignments").addEventListener("click", openAssignments);
el("tile-targets").addEventListener("click", openTargets);
el("tile-missions").addEventListener("click", openMissions);
el("tile-wins").addEventListener("click", openWins);
el("dash-power-chip").addEventListener("click", openProfile);

/* ---------- GLOBAL PERSISTENT BOTTOM STRIP ----------
   Present on every view. Left = profile shortcut, middle = checklist
   shortcut (the two most-visited screens), right = quick-add. The
   profile tile was removed from the dashboard grid in favor of this —
   it's now reachable from anywhere, not just the dashboard. */
// Single source of truth for "what modules exist and how do I quick-add
// to each one" — adding a new module later means adding one entry here
// (plus an `openCreate()` on that module's public *Data object); nothing
// else about the quick-add UI needs to change.
const QUICK_ADD_MODULES = [
  { id: "checklist", label: "TASK", open: openChecklist, data: () => window.ChecklistData,
    icon: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l2.5 2.5L18 7"/><rect x="3" y="3" width="18" height="18" rx="3"/></svg>' },
  { id: "workout", label: "WORKOUT", open: openWorkout, data: () => window.WorkoutData,
    icon: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2"><path d="M6.5 6.5h11M6.5 17.5h11M4 10v4M20 10v4M2 11v2M22 11v2M6.5 6.5v11M17.5 6.5v11"/></svg>' },
  { id: "assignments", label: "ASSIGNMENT", open: openAssignments, data: () => window.AssignmentsData,
    icon: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12l2 2 4-4"/></svg>' },
  { id: "targets", label: "TARGET", open: openTargets, data: () => window.TargetsData,
    icon: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>' },
  { id: "missions", label: "MISSION", open: openMissions, data: () => window.MissionsData,
    icon: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>' },
  { id: "wins", label: "WIN", open: openWins, data: () => window.WinsData,
    icon: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 21h8M12 17v4M6 4h12v3a6 6 0 01-12 0V4zM6 5H3v2a3 3 0 003 3M18 5h3v2a3 3 0 01-3 3"/></svg>' }
];

function renderQuickAddStack() {
  el("quick-add-stack").innerHTML = QUICK_ADD_MODULES.map((m) => `
    <button class="quick-add-item" data-quick-add="${m.id}">
      <span>${m.label}</span>
      <span class="quick-add-item-icon">${m.icon}</span>
    </button>`).join("");
  document.querySelectorAll("[data-quick-add]").forEach((b) => {
    b.addEventListener("click", () => {
      const mod = QUICK_ADD_MODULES.find((x) => x.id === b.getAttribute("data-quick-add"));
      closeQuickAdd();
      if (!mod) return;
      mod.open();
      const d = mod.data();
      try { if (d && d.openCreate) d.openCreate(); } catch (err) { console.error("Quick-add failed for " + mod.id, err); }
    });
  });
}
function openQuickAdd() { renderQuickAddStack(); el("quick-add-overlay").classList.add("open"); }
function closeQuickAdd() { el("quick-add-overlay").classList.remove("open"); }
el("gbs-add").addEventListener("click", openQuickAdd);
el("quick-add-backdrop").addEventListener("click", closeQuickAdd);

el("gbs-profile").addEventListener("click", openProfile);
el("gbs-checklist").addEventListener("click", openChecklist);

// Highlight which strip shortcut (if any) matches the current view.
function refreshGlobalNavActive(viewId) {
  el("gbs-profile").classList.toggle("active", viewId === "view-profile");
  el("gbs-checklist").classList.toggle("active", viewId === "view-checklist");
}

// Some modules (Workouts' active-session screen, which has its own
// fixed-bottom sticky action bar) need the strip out of the way so the
// two don't visually collide. Modules opt out per-render via this hook.
window.setGlobalNavVisible = function (visible) {
  el("global-bottom-strip").style.display = visible ? "flex" : "none";
};

// NOTE: the swipe-to-change-tab gesture itself is NOT wired here. Script
// load order is checklist -> workout -> assignments -> ... -> shell (shell
// is last, since it depends on every module's public *Data interface
// existing). Workouts and Assignments wire their own top-level swipe
// listener the moment their own script runs, which is before shell.js
// exists — so a shared `window.attachSwipeTabs` defined here wouldn't be
// available yet when they need it. Each module instead carries its own
// small local copy of the same gesture helper (see attachSwipeTabs near
// the top-strip wiring in workout.js / assignments.js).

/* ---------- DASHBOARD SETTINGS TAB (clock + weather widget) ---------- */
function populateDashSettingsFields() {
  document.querySelectorAll('#seg-time-format .seg-btn').forEach((b) => {
    b.classList.toggle("active", b.getAttribute("data-val") === dashSettings.timeFormat);
  });
  document.querySelectorAll('#clockfont-grid .tone-swatch').forEach((b) => {
    b.classList.toggle("active", b.getAttribute("data-val") === dashSettings.clockFont);
  });
  document.querySelectorAll('#seg-weather-style .seg-btn').forEach((b) => {
    b.classList.toggle("active", b.getAttribute("data-val") === dashSettings.weatherStyle);
  });
  el("clock-offset-value").textContent = (dashSettings.timeOffsetMin >= 0 ? "+" : "") + dashSettings.timeOffsetMin + " MIN";
}
document.querySelectorAll('#seg-time-format .seg-btn').forEach((b) => {
  b.addEventListener("click", () => {
    dashSettings.timeFormat = b.getAttribute("data-val");
    saveDashSettings(); populateDashSettingsFields(); updateClock();
  });
});
document.querySelectorAll('#clockfont-grid .tone-swatch').forEach((b) => {
  b.addEventListener("click", () => {
    dashSettings.clockFont = b.getAttribute("data-val");
    saveDashSettings(); populateDashSettingsFields(); updateClock();
  });
});
document.querySelectorAll('#seg-weather-style .seg-btn').forEach((b) => {
  b.addEventListener("click", () => {
    dashSettings.weatherStyle = b.getAttribute("data-val");
    saveDashSettings(); populateDashSettingsFields(); applyWeatherStyle();
  });
});
el("clock-offset-minus").addEventListener("click", () => {
  dashSettings.timeOffsetMin -= 5;
  saveDashSettings(); populateDashSettingsFields(); updateClock();
});
el("clock-offset-plus").addEventListener("click", () => {
  dashSettings.timeOffsetMin += 5;
  saveDashSettings(); populateDashSettingsFields(); updateClock();
});
el("btn-clock-offset-reset").addEventListener("click", () => {
  dashSettings.timeOffsetMin = 0;
  saveDashSettings(); populateDashSettingsFields(); updateClock();
});

/* ---------- MERGED SETTINGS SHEET ---------- */
window.openMergedSettings = function () {
  if (window.ChecklistData) window.ChecklistData.populateSettings();
  if (window.WorkoutData) window.WorkoutData.populateSettings();
  if (window.AssignmentsData) window.AssignmentsData.populateSettings();
  if (window.TargetsData) window.TargetsData.populateSettings();
  if (window.MissionsData) window.MissionsData.populateSettings();
  if (window.WinsData) window.WinsData.populateSettings();
  if (window.GamificationData) window.GamificationData.populateSettings();
  populateDashSettingsFields();
  setSettingsTab(settingsTab || "appearance");
  el("settings-overlay").classList.add("open");
};
el("btn-dash-settings").addEventListener("click", window.openMergedSettings);

// Settings tabs — plain show/hide over static panels already in the DOM,
// no re-render needed. Remembers the last tab picked for next time the
// sheet is opened (within this session; not persisted).
let settingsTab = "appearance";
function setSettingsTab(id) {
  settingsTab = id;
  document.querySelectorAll(".settings-tab-panel").forEach((p) => { p.hidden = p.getAttribute("data-tab-panel") !== id; });
  document.querySelectorAll(".settings-tab-btn").forEach((b) => { b.classList.toggle("active", b.getAttribute("data-settings-tab") === id); });
}
document.querySelectorAll(".settings-tab-btn").forEach((b) => {
  b.addEventListener("click", () => setSettingsTab(b.getAttribute("data-settings-tab")));
});

/* ---------- SHARED TOAST ---------- */
let toastTimer = null;
window.showToast = function (msg) {
  const t = el("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
};

/* ---------- COMBINED BACKUP ---------- */
el("btn-export").addEventListener("click", () => {
  const payload = {
    kind: "command-backup",
    exportedAt: new Date().toISOString(),
    checklist: window.ChecklistData ? window.ChecklistData.getState() : null,
    workout: window.WorkoutData ? window.WorkoutData.getState() : null,
    assignments: window.AssignmentsData ? window.AssignmentsData.getState() : null,
    targets: window.TargetsData ? window.TargetsData.getState() : null,
    missions: window.MissionsData ? window.MissionsData.getState() : null,
    wins: window.WinsData ? window.WinsData.getState() : null,
    gamification: window.GamificationData ? window.GamificationData.getState() : null
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url; a.download = `command-backup-${stamp}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  window.showToast("BACKUP EXPORTED");
});

el("btn-import").addEventListener("click", () => el("file-import").click());
el("file-import").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (parsed.kind === "command-backup") {
        if (parsed.checklist && window.ChecklistData) window.ChecklistData.setState(parsed.checklist);
        if (parsed.workout && window.WorkoutData) window.WorkoutData.setState(parsed.workout);
        if (parsed.assignments && window.AssignmentsData) window.AssignmentsData.setState(parsed.assignments);
        if (parsed.targets && window.TargetsData) window.TargetsData.setState(parsed.targets);
        if (parsed.missions && window.MissionsData) window.MissionsData.setState(parsed.missions);
        if (parsed.wins && window.WinsData) window.WinsData.setState(parsed.wins);
        if (parsed.gamification && window.GamificationData) window.GamificationData.setState(parsed.gamification);
      } else if (parsed.tasks && parsed.settings) {
        // legacy checklist-only backup (pre-merge)
        if (window.ChecklistData) window.ChecklistData.setState(parsed);
      } else {
        throw new Error("unrecognized file");
      }
      el("settings-overlay").classList.remove("open");
      refreshDashboard();
      window.showToast("BACKUP IMPORTED");
    } catch (err) {
      window.showToast("IMPORT FAILED — BAD FILE");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
});

el("btn-reset-all").addEventListener("click", () => {
  if (confirm("Wipe ALL data — checklist tasks, streak history, workout logs, assignments, targets, missions, wins, and your power level? This cannot be undone.")) {
    if (window.ChecklistData) window.ChecklistData.wipe();
    if (window.WorkoutData) window.WorkoutData.wipe();
    if (window.AssignmentsData) window.AssignmentsData.wipe();
    if (window.TargetsData) window.TargetsData.wipe();
    if (window.MissionsData) window.MissionsData.wipe();
    if (window.WinsData) window.WinsData.wipe();
    if (window.GamificationData) window.GamificationData.wipe();
    el("settings-overlay").classList.remove("open");
    refreshDashboard();
    window.showToast("ALL DATA WIPED");
  }
});

/* ---------- INIT ---------- */
showView("view-dashboard");
updateClock();
loadCachedWeather();
fetchWeather();
refreshDashboard();
checkRankUp();
setInterval(updateClock, 15000);
setInterval(refreshDashboard, 30000);
setInterval(fetchWeather, 15 * 60 * 1000);

})();
