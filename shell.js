/* =========================================================
   SHELL — shell.js
   Owns the dashboard, view switching between Checklist/Workouts,
   the shared Settings sheet, and combined backup/export/import.
   ========================================================= */

(function () {
"use strict";

const el = (id) => document.getElementById(id);
const VIEWS = ["view-dashboard", "view-checklist", "view-workout", "view-assignments", "view-targets"];

function showView(id) {
  VIEWS.forEach((v) => { el(v).hidden = v !== id; });
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
  updatePriority();
}

/* ---------- SITREP: clock, date, time-of-day greeting ---------- */
const WEEKDAY_SHORT = ["SUN","MON","TUE","WED","THU","FRI","SAT"];
const MONTH_SHORT = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

function updateClock() {
  const now = new Date();
  el("dash-time").textContent = pad2(now.getHours()) + ":" + pad2(now.getMinutes());
  el("dash-date").textContent = WEEKDAY_SHORT[now.getDay()] + " · " + MONTH_SHORT[now.getMonth()] + " " + now.getDate();
  const h = now.getHours();
  const greeting = h < 5 ? "NIGHT SITREP" : h < 12 ? "MORNING SITREP" : h < 17 ? "AFTERNOON SITREP" : h < 21 ? "EVENING SITREP" : "NIGHT SITREP";
  el("dash-lede").textContent = greeting;
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
    if (cs.next && cs.next.time) candidates.push({ rank: 1, label: fmtTime12(cs.next.time), text: cs.next.name });
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
function showWeather(tempF, code) {
  el("dash-weather-icon").innerHTML = weatherIconSVG(code);
  el("dash-weather-temp").textContent = Math.round(tempF) + "°";
  el("dash-weather").hidden = false;
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
};

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

el("tile-checklist").addEventListener("click", openChecklist);
el("tile-workout").addEventListener("click", openWorkout);
el("tile-assignments").addEventListener("click", openAssignments);
el("tile-targets").addEventListener("click", openTargets);

/* ---------- MERGED SETTINGS SHEET ---------- */
window.openMergedSettings = function () {
  if (window.ChecklistData) window.ChecklistData.populateSettings();
  if (window.WorkoutData) window.WorkoutData.populateSettings();
  if (window.AssignmentsData) window.AssignmentsData.populateSettings();
  if (window.TargetsData) window.TargetsData.populateSettings();
  el("settings-overlay").classList.add("open");
};
el("btn-dash-settings").addEventListener("click", window.openMergedSettings);

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
    targets: window.TargetsData ? window.TargetsData.getState() : null
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
  if (confirm("Wipe ALL data — checklist tasks, streak history, workout logs, assignments, and targets? This cannot be undone.")) {
    if (window.ChecklistData) window.ChecklistData.wipe();
    if (window.WorkoutData) window.WorkoutData.wipe();
    if (window.AssignmentsData) window.AssignmentsData.wipe();
    if (window.TargetsData) window.TargetsData.wipe();
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
setInterval(updateClock, 15000);
setInterval(refreshDashboard, 30000);
setInterval(fetchWeather, 15 * 60 * 1000);

})();
