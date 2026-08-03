/* =========================================================
   SHELL — shell.js
   Owns the dashboard, view switching between Checklist/Workouts,
   the shared Settings sheet, and combined backup/export/import.
   ========================================================= */

(function () {
"use strict";

const el = (id) => document.getElementById(id);
const VIEWS = ["view-dashboard", "view-checklist", "view-workout"];

function showView(id) {
  VIEWS.forEach((v) => { el(v).hidden = v !== id; });
}

function pad3(n) { return String(n).padStart(3, "0"); }

function refreshDashboard() {
  if (window.ChecklistData) {
    el("dash-checklist-stat").textContent = "STREAK " + pad3(window.ChecklistData.mainStreak());
  }
  if (window.WorkoutData) {
    el("dash-workout-stat").textContent = window.WorkoutData.weeklyStat();
  }
}

window.goToDashboard = function () {
  showView("view-dashboard");
  refreshDashboard();
};

function openChecklist() { showView("view-checklist"); }
function openWorkout() { if (window.WorkoutData) window.WorkoutData.goHome(); showView("view-workout"); }

el("tile-checklist").addEventListener("click", openChecklist);
el("tile-workout").addEventListener("click", openWorkout);

/* ---------- MERGED SETTINGS SHEET ---------- */
window.openMergedSettings = function () {
  if (window.ChecklistData) window.ChecklistData.populateSettings();
  if (window.WorkoutData) window.WorkoutData.populateSettings();
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
    workout: window.WorkoutData ? window.WorkoutData.getState() : null
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
  if (confirm("Wipe ALL data — checklist tasks, streak history, and workout logs? This cannot be undone.")) {
    if (window.ChecklistData) window.ChecklistData.wipe();
    if (window.WorkoutData) window.WorkoutData.wipe();
    el("settings-overlay").classList.remove("open");
    refreshDashboard();
    window.showToast("ALL DATA WIPED");
  }
});

/* ---------- INIT ---------- */
showView("view-dashboard");
refreshDashboard();
setInterval(refreshDashboard, 30000);

})();
