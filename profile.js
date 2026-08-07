/* =========================================================
   PROFILE — profile.js
   Not a CRUD module — a read-only aggregation page, the dashboard's
   bigger sibling. Reads other modules' state through their existing
   public interfaces (getState() / dedicated getters), computes
   everything live, writes nothing back anywhere, and owns no
   localStorage key of its own.

   Trend/summary stats are collected as small {label, value, trend,
   source} entries from a list of source functions specifically so a
   later WHOOP integration (Tier 2 — needs a backend) can add new
   stat-source functions to the same list rather than requiring this
   page to be restructured.
   ========================================================= */

(function () {
"use strict";

const el = (id) => document.getElementById(id);

/* ---------- DATE UTILITIES ---------- */
function pad2(n) { return String(n).padStart(2, "0"); }
function formatDate(d) { d = new Date(d); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function todayStr() { return formatDate(new Date()); }
function fmtDateShort(dateStr) {
  const MONTH = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  const [y,m,d] = dateStr.split("-").map(Number);
  return `${MONTH[m-1]} ${d}`;
}
function escapeHTML(s) {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
}

/* ---------- RENDER ROOT (with error boundary) ---------- */
function render() {
  let html;
  let hadError = false;
  try {
    html = profileScreenHTML();
  } catch (err) {
    console.error("Profile render error:", err);
    html = errorScreenHTML(err);
    hadError = true;
  }
  el("profile-screen").innerHTML = html;
  el("pf-top-strip").style.display = "flex";
  if (hadError) attachErrorScreenHandlers();
}
function errorScreenHTML(err) {
  const msg = (err && err.message) ? err.message : String(err);
  const stack = (err && err.stack) ? err.stack : "";
  return `<div class="wk-builder-panel" style="border-color:var(--danger);">
    <h1 class="screen-h1" style="color:var(--danger);">SOMETHING WENT WRONG</h1>
    <p class="hint-text">The Profile screen hit an error. Nothing here is stored, so there's nothing to lose — just retry.</p>
    <label class="field-label">ERROR</label>
    <div class="text-input" style="white-space:pre-wrap; word-break:break-word; font-family:var(--font-mono); font-size:11px; user-select:text;">${escapeHTML(msg)}</div>
    ${stack ? `<label class="field-label">DETAILS</label>
    <div class="text-input" style="white-space:pre-wrap; word-break:break-word; font-family:var(--font-mono); font-size:10px; max-height:160px; overflow-y:auto; user-select:text;">${escapeHTML(stack)}</div>` : ""}
    <button class="btn-primary" id="btn-pf-error-retry">RETRY</button>
  </div>`;
}
function attachErrorScreenHandlers() {
  const btn = el("btn-pf-error-retry");
  if (btn) btn.onclick = () => render();
}

/* ---------- HERO: Power Level / Rank ---------- */
function heroHTML() {
  if (!window.GamificationData) return "";
  const points = window.GamificationData.totalPoints();
  const level = window.GamificationData.level();
  const rank = window.GamificationData.rankName();
  const curFloor = window.GamificationData.pointsFloorForLevel(level);
  const nextFloor = window.GamificationData.pointsFloorForLevel(level + 1);
  const span = Math.max(1, nextFloor - curFloor);
  const pct = Math.min(100, Math.round(((points - curFloor) / span) * 100));
  const toNext = Math.max(0, nextFloor - points);
  const openStreak = window.GamificationData.openStreak();

  return `<div class="readout-panel corner-bracket" style="margin-bottom:18px;">
    <div class="readout-main">
      <div class="readout-block">
        <div class="readout-label">POWER LEVEL</div>
        <div class="readout-value">${level}</div>
      </div>
      <div class="readout-divider"></div>
      <div class="readout-block">
        <div class="readout-label">RANK</div>
        <div class="readout-sub">${escapeHTML(rank)}</div>
        <div class="hint-text" style="margin-top:4px;">${points} PTS · ${toNext} TO NEXT LEVEL</div>
      </div>
    </div>
    <div class="today-progress" style="margin-top:14px;"><div class="today-progress-fill" style="width:${pct}%"></div></div>
    <p class="hint-text" style="margin-top:8px; margin-bottom:0;">OPEN STREAK: ${openStreak} DAY${openStreak === 1 ? "" : "S"}</p>
  </div>`;
}

/* ---------- PRIMARY MISSION ---------- */
function primaryMissionHTML() {
  if (!window.MissionsData) return "";
  const m = window.MissionsData.getPrimaryMission();
  if (!m) return "";
  const total = (m.milestones || []).length;
  const done = (m.milestones || []).filter((x) => x.done).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  return `<div class="wk-builder-panel">
    <div class="builder-section-title" style="margin-top:0;">PRIMARY MISSION</div>
    <div class="ac-title" style="margin-bottom:4px;">${escapeHTML(m.title)}</div>
    ${m.targetDate ? `<div class="hint-text" style="margin-top:0;">TARGET ${fmtDateShort(m.targetDate)}</div>` : ""}
    ${total ? `<div class="ac-progress-row" style="margin-top:10px;"><div class="ac-progress-track"><div class="ac-progress-fill" style="width:${pct}%"></div></div><span class="ac-progress-label">${done}/${total}</span></div>` : ""}
  </div>`;
}

/* ---------- AUTO-DETECTED PRs ---------- */
function computePRs() {
  if (!window.WorkoutData) return [];
  const ws = window.WorkoutData.getState();
  const byExercise = {};
  (ws.history || []).forEach((w) => {
    (w.exercises || []).forEach((ex) => {
      if (!ex.fields || !ex.hasSets || !ex.fields.includes("weight") || !ex.fields.includes("reps")) return;
      (ex.sets || []).forEach((s) => {
        const weight = parseFloat(s.weight), reps = parseFloat(s.reps);
        if (!isFinite(weight) || !isFinite(reps) || weight <= 0 || reps <= 0) return;
        const e1rm = weight * (1 + reps / 30);
        const key = ex.name.trim().toLowerCase();
        if (!key) return;
        const rec = byExercise[key] || { name: ex.name.trim(), maxWeight: 0, best1RM: 0, count: 0 };
        rec.count++;
        if (weight > rec.maxWeight) rec.maxWeight = weight;
        if (e1rm > rec.best1RM) rec.best1RM = e1rm;
        byExercise[key] = rec;
      });
    });
  });
  return Object.values(byExercise).sort((a, b) => b.count - a.count).slice(0, 5);
}
function prsHTML() {
  const prs = computePRs();
  if (!prs.length) return "";
  const rows = prs.map((p) => `<div class="stat-line"><span class="lbl">${escapeHTML(p.name.toUpperCase())}</span><span class="val">${Math.round(p.maxWeight)} LBS · EST 1RM ${Math.round(p.best1RM)}</span></div>`).join("");
  return `<div class="wk-builder-panel">
    <div class="builder-section-title" style="margin-top:0;">BEST LIFTS</div>
    ${rows}
  </div>`;
}

/* ---------- TREND STATS ----------
   Each source function returns {label, value, trend, source} or null.
   Collected into one list and rendered generically — this is the
   extension point for WHOOP stats later (resting HR, HRV, sleep,
   recovery) without restructuring this page. */
function trendArrow(trend) {
  if (trend === "up") return `<span style="color:var(--success);">▲</span>`;
  if (trend === "down") return `<span style="color:var(--danger);">▼</span>`;
  return `<span style="color:var(--text-dim);">▬</span>`;
}
function strengthTrendStat() {
  if (!window.WorkoutData) return null;
  const ws = window.WorkoutData.getState();
  const points = [];
  (ws.history || []).forEach((w) => {
    (w.exercises || []).forEach((ex) => {
      if (!ex.fields || !ex.hasSets || !ex.fields.includes("weight") || !ex.fields.includes("reps")) return;
      (ex.sets || []).forEach((s) => {
        const weight = parseFloat(s.weight), reps = parseFloat(s.reps);
        if (!isFinite(weight) || !isFinite(reps) || weight <= 0 || reps <= 0) return;
        points.push({ date: w.date, e1rm: weight * (1 + reps / 30) });
      });
    });
  });
  if (points.length < 4) return null;
  points.sort((a, b) => a.date.localeCompare(b.date));
  const mid = Math.floor(points.length / 2);
  const avg = (arr) => arr.reduce((s, p) => s + p.e1rm, 0) / arr.length;
  const oldAvg = avg(points.slice(0, mid)), newAvg = avg(points.slice(mid));
  const diffPct = oldAvg ? ((newAvg - oldAvg) / oldAvg) * 100 : 0;
  const trend = diffPct > 3 ? "up" : diffPct < -3 ? "down" : "flat";
  return { label: "STRENGTH TREND", value: `${Math.round(newAvg)} LBS AVG EST. 1RM`, trend, source: "workout" };
}
function aerobicTrendStat() {
  if (!window.WorkoutData) return null;
  const ws = window.WorkoutData.getState();
  const points = [];
  (ws.history || []).forEach((w) => {
    (w.exercises || []).forEach((ex) => {
      if (!ex.fields) return;
      const isCardio = ex.fields.includes("distance") && !ex.fields.includes("weight");
      if (!isCardio) return;
      const rows = ex.hasSets ? (ex.sets || []) : [ex.log || {}];
      rows.forEach((r) => {
        const dist = parseFloat(r.distance);
        if (isFinite(dist) && dist > 0) points.push({ date: w.date, distance: dist });
      });
    });
  });
  if (points.length < 4) return null;
  points.sort((a, b) => a.date.localeCompare(b.date));
  const mid = Math.floor(points.length / 2);
  const avg = (arr) => arr.reduce((s, p) => s + p.distance, 0) / arr.length;
  const oldAvg = avg(points.slice(0, mid)), newAvg = avg(points.slice(mid));
  const diffPct = oldAvg ? ((newAvg - oldAvg) / oldAvg) * 100 : 0;
  const trend = diffPct > 5 ? "up" : diffPct < -5 ? "down" : "flat";
  return { label: "AEROBIC TREND", value: `${newAvg.toFixed(1)} MI AVG DISTANCE`, trend, source: "workout" };
}
function checklistStreakStat() {
  if (!window.ChecklistData) return null;
  const streak = window.ChecklistData.mainStreak();
  return { label: "CHECKLIST STREAK", value: `${streak} DAY${streak === 1 ? "" : "S"}`, trend: "flat", source: "checklist" };
}
function targetsOverviewStat() {
  if (!window.TargetsData) return null;
  const n = window.TargetsData.trackedCount();
  if (!n) return null;
  const best = window.TargetsData.bestStreak();
  return { label: "TARGETS", value: `${n} tracked, longest streak ${best}d`, trend: "flat", source: "targets" };
}
function assignmentVelocityStat() {
  if (!window.AssignmentsData) return null;
  const as = window.AssignmentsData.getState();
  const completed = (as.assignments || []).filter((a) => a.status === "completed");
  if (!completed.length) return null;
  const onTime = completed.filter((a) => a.dueDate && a.completedAt && a.completedAt.slice(0, 10) <= a.dueDate).length;
  const pct = Math.round((onTime / completed.length) * 100);
  return { label: "ASSIGNMENTS", value: `${completed.length} completed, ${pct}% on time`, trend: "flat", source: "assignments" };
}
const STAT_SOURCES = [checklistStreakStat, targetsOverviewStat, assignmentVelocityStat, strengthTrendStat, aerobicTrendStat];
function statsHTML() {
  const stats = STAT_SOURCES.map((fn) => { try { return fn(); } catch (e) { console.error("Profile stat source failed:", e); return null; } }).filter(Boolean);
  if (!stats.length) return "";
  const rows = stats.map((s) => `<div class="stat-line"><span class="lbl">${escapeHTML(s.label)}</span><span class="val">${trendArrow(s.trend)} ${escapeHTML(s.value)}</span></div>`).join("");
  return `<div class="wk-builder-panel">
    <div class="builder-section-title" style="margin-top:0;">OVERVIEW</div>
    ${rows}
  </div>`;
}

/* ---------- WINS SUMMARY ---------- */
function winsSummaryHTML() {
  if (!window.WinsData) return "";
  const ws = window.WinsData.getState();
  if (!ws.wins || !ws.wins.length) return "";
  const recent = ws.wins.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const counts = window.WinsData.countByCategory();
  const thisMonthKey = todayStr().slice(0, 7);
  const moneyThisMonth = ws.wins.filter((w) => w.category === "money" && w.date.startsWith(thisMonthKey) && w.amount).reduce((s, w) => s + Number(w.amount), 0);

  const recentHTML = recent.map((w) => `
    <button class="wk-history-row win-card cat-${w.category}" data-goto-win="1">
      <span><span class="hr-name">${escapeHTML(w.title)}</span></span>
      <span><span class="hr-date">${fmtDateShort(w.date)}</span></span>
    </button>`).join("");

  return `<div class="wk-builder-panel">
    <div class="builder-section-title" style="margin-top:0;">WINS</div>
    <div class="stat-line"><span class="lbl">THIS MONTH — MONEY</span><span class="val">$${moneyThisMonth.toLocaleString()}</span></div>
    <div class="stat-line"><span class="lbl">LOGGED</span><span class="val">${counts.money} money · ${counts.fitness} fitness · ${counts.general} general</span></div>
    <div style="margin-top:10px;">${recentHTML}</div>
  </div>`;
}

function profileScreenHTML() {
  return `<h1 class="screen-h1">PROFILE</h1>
    ${heroHTML()}
    ${primaryMissionHTML()}
    ${prsHTML()}
    ${statsHTML()}
    ${winsSummaryHTML()}
    <p class="hint-text version-tag" style="text-align:center;">Wearable-derived stats (resting HR, HRV, sleep, recovery) join this page once WHOOP integration ships — needs a backend, see HANDOFF.md.</p>`;
}

document.addEventListener("click", (e) => {
  if (e.target.closest && e.target.closest("[data-goto-win]")) window.openWinsFromProfile && window.openWinsFromProfile();
});

/* ---------- TOP STRIP ---------- */
el("btn-profile-back").addEventListener("click", () => window.goToDashboard());
el("btn-profile-settings").addEventListener("click", () => window.openMergedSettings());

/* ---------- PUBLIC INTERFACE ---------- */
window.ProfileData = {
  getState: () => ({}),
  setState: () => {},
  wipe: () => {},
  populateSettings: () => {},
  goHome: () => { render(); }
};

/* ---------- INIT ---------- */
render();

})();
