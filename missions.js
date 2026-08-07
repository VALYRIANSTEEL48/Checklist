/* =========================================================
   MISSIONS — missions.js
   Long-horizon goals — months to years, not days to weeks like
   Assignments. Deliberately similar in shape to Assignments (own
   checkbox-row milestone list, same calendar-panel pattern) but
   intentionally NOT linked to Assignments — that would be the first
   real cross-module coupling in this app, and the cost (dangling
   references when an Assignment is deleted) isn't worth it for this
   batch. Own localStorage namespace, no cross-talk with any other
   module. See HANDOFF.md / TIER1_BRIEFING.md for the full rationale.
   ========================================================= */

(function () {
"use strict";

const STORAGE_KEY = "missions_state_v1";
const MONTH_LABELS = ["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];

/* ---------- STATE ---------- */
function defaultState() { return { missions: [] }; }
let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return { missions: Array.isArray(parsed.missions) ? parsed.missions : [] };
  } catch (e) {
    console.error("Failed to load missions state, resetting.", e);
    return defaultState();
  }
}
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

/* ---------- DATE UTILITIES ---------- */
function pad2(n) { return String(n).padStart(2, "0"); }
function formatDate(d) { d = new Date(d); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function todayStr() { return formatDate(new Date()); }
function fmtDateShort(dateStr) {
  const [y,m,d] = dateStr.split("-").map(Number);
  return `${MONTH_LABELS[m-1].slice(0,3)} ${d}`;
}
function escapeHTML(s) {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
}

/* ---------- RUNTIME (non-persisted) STATE ---------- */
let screen = null;        // null | 'detail'
let editingId = null;     // mission id being viewed, or null if creating new
let draft = null;         // in-memory record while creating (not yet saved)
let msCalView = new Date();

const el = (id) => document.getElementById(id);

function currentMission() {
  return editingId ? state.missions.find((m) => m.id === editingId) : draft;
}

// Enforced on write, not just in the UI: setting a mission primary must
// unset any other mission's flag in the same write.
function setPrimary(missionId) {
  state.missions.forEach((m) => { m.isPrimary = (m.id === missionId); });
}

/* ---------- RENDER ROOT (with error boundary) ---------- */
function render() {
  let html;
  let hadError = false;
  try {
    html = screen === "detail" ? detailScreenHTML() : listScreenHTML();
  } catch (err) {
    console.error("Missions render error:", err);
    html = errorScreenHTML(err);
    hadError = true;
  }
  el("missions-screen").innerHTML = html;
  el("ms-top-strip").style.display = "flex";

  if (hadError) { attachErrorScreenHandlers(); return; }
  try {
    attachHandlers();
  } catch (err) {
    console.error("Missions handler-wiring error:", err);
    el("missions-screen").innerHTML = errorScreenHTML(err);
    attachErrorScreenHandlers();
  }
}
function errorScreenHTML(err) {
  const msg = (err && err.message) ? err.message : String(err);
  const stack = (err && err.stack) ? err.stack : "";
  return `<div class="wk-builder-panel" style="border-color:var(--danger);">
    <h1 class="screen-h1" style="color:var(--danger);">SOMETHING WENT WRONG</h1>
    <p class="hint-text">The Missions screen hit an error. Your data is safe — nothing was deleted.</p>
    <label class="field-label">ERROR</label>
    <div class="text-input" style="white-space:pre-wrap; word-break:break-word; font-family:var(--font-mono); font-size:11px; user-select:text;">${escapeHTML(msg)}</div>
    ${stack ? `<label class="field-label">DETAILS</label>
    <div class="text-input" style="white-space:pre-wrap; word-break:break-word; font-family:var(--font-mono); font-size:10px; max-height:160px; overflow-y:auto; user-select:text;">${escapeHTML(stack)}</div>` : ""}
    <button class="btn-primary" id="btn-ms-error-home">GO TO MISSIONS HOME</button>
  </div>`;
}
function attachErrorScreenHandlers() {
  const btn = el("btn-ms-error-home");
  if (btn) btn.onclick = () => { screen = null; editingId = null; draft = null; render(); };
}

/* ---------- DERIVED ---------- */
function milestoneProgress(m) {
  const total = (m.milestones || []).length;
  const done = (m.milestones || []).filter((x) => x.done).length;
  return { total, done };
}

/* ---------- LIST SCREEN ----------
   Missions are rare and long-lived, so a flat list is enough — no
   3-tab structure like Assignments. Active first, a secondary
   COMPLETED group below, same grouping pattern Targets uses for
   IN PROGRESS / TERMINATED. */
function listScreenHTML() {
  const active = state.missions.filter((m) => m.status !== "completed")
    .sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0));
  const completed = state.missions.filter((m) => m.status === "completed")
    .sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));

  const cardHTML = (m) => {
    const { total, done } = milestoneProgress(m);
    const pct = total ? Math.round((done / total) * 100) : 0;
    return `<button class="assignment-card" data-open-mission="${m.id}">
      <div class="ac-top">
        <span class="ac-title">${escapeHTML(m.title || "Untitled")} ${m.isPrimary ? '<span class="status-badge primary">PRIMARY</span>' : ""}</span>
        <span class="ac-due">${m.targetDate ? fmtDateShort(m.targetDate) : (m.status === "completed" && m.completedAt ? "DONE " + fmtDateShort(m.completedAt.slice(0,10)) : "NO TARGET DATE")}</span>
      </div>
      ${total ? `<div class="ac-progress-row"><div class="ac-progress-track"><div class="ac-progress-fill" style="width:${pct}%"></div></div><span class="ac-progress-label">${done}/${total}</span></div>` : ""}
    </button>`;
  };

  return `<h1 class="screen-h1">MISSIONS</h1>
    <button class="wk-dashed-card" style="width:100%; text-align:center; margin-bottom:18px;" id="btn-ms-new">+ NEW MISSION</button>
    ${state.missions.length === 0 ? `<p class="hint-text" style="text-align:center; padding:30px 0;">No missions yet. Long-horizon goals — months to years — go here.</p>` : ""}
    ${active.length ? `<h2 class="group-title"><span class="tick"></span>ACTIVE</h2>${active.map(cardHTML).join("")}` : ""}
    ${completed.length ? `<h2 class="group-title muted" style="margin-top:22px;"><span class="tick"></span>COMPLETED</h2>${completed.map(cardHTML).join("")}` : ""}`;
}

/* ---------- DETAIL / CREATE-EDIT SCREEN ---------- */
function calendarGridHTML(selectedDate) {
  const y = msCalView.getFullYear(), m = msCalView.getMonth();
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
    html += `<button type="button" data-ms-date="${ds}" class="${cls.join(" ")}">${d.getDate()}</button>`;
  }
  return html;
}

function detailScreenHTML() {
  const m = currentMission();
  if (!m) return "";
  const isNew = !editingId;
  const { total, done } = milestoneProgress(m);

  const milestonesHTML = (m.milestones || []).map((s) => `
    <li class="subtask-row ${s.done ? "done" : ""}" data-milestone="${s.id}">
      <span class="checkbox" data-milestone-check="${s.id}">${s.done ? `<svg viewBox="0 0 24 24"><path fill="#0B0E0C" d="M9 16.2L4.8 12l-1.4 1.4L9 19 20.6 7.4 19.2 6z"/></svg>` : ""}</span>
      <input type="text" class="subtask-text" value="${escapeHTML(s.text)}" data-milestone-text="${s.id}">
      <button class="subtask-remove" data-milestone-remove="${s.id}">×</button>
    </li>`).join("");

  let actionHTML = "";
  if (isNew) {
    actionHTML = `<button class="btn-primary" id="btn-ms-create">CREATE MISSION</button>`;
  } else if (m.status === "completed") {
    actionHTML = `<button class="btn-secondary" id="btn-ms-reopen">REOPEN MISSION</button>
      <button class="btn-danger-outline" id="btn-ms-delete">DELETE MISSION</button>`;
  } else {
    actionHTML = `
      <button class="btn-secondary" id="btn-ms-primary">${m.isPrimary ? "★ PRIMARY MISSION" : "SET AS PRIMARY"}</button>
      <button class="btn-primary" id="btn-ms-complete">MARK COMPLETE</button>
      <button class="btn-danger-outline" id="btn-ms-delete">DELETE MISSION</button>`;
  }

  const statusBadge = isNew ? "" : `<span class="status-badge ${m.status === "completed" ? "complete" : "active"}">${m.status === "completed" ? "COMPLETED" : "ACTIVE"}</span>${m.isPrimary ? ` <span class="status-badge primary">PRIMARY</span>` : ""}`;

  return `
    ${screenHeaderHTML(isNew ? "NEW MISSION" : "MISSION")}
    ${statusBadge}
    <label class="field-label" style="margin-top:0;">TITLE</label>
    <input type="text" class="text-input" id="ms-title" value="${escapeHTML(m.title)}" placeholder="e.g. Run a marathon">

    <label class="field-label">VISION — WHY THIS MATTERS</label>
    <textarea class="text-input" id="ms-vision" style="height:100px;" placeholder="The motivating statement — not task instructions, the why">${escapeHTML(m.vision || "")}</textarea>

    <label class="field-label">TARGET DATE (OPTIONAL — SOFT/LONG-RANGE)</label>
    <div class="calendar-panel corner-bracket">
      <div class="cal-header">
        <button type="button" id="ms-cal-prev" class="icon-btn small">‹</button>
        <div>${msCalView.toLocaleDateString("default", { month: "long", year: "numeric" }).toUpperCase()}</div>
        <button type="button" id="ms-cal-next" class="icon-btn small">›</button>
      </div>
      <div class="cal-weekdays"><span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span></div>
      <div class="cal-grid">${calendarGridHTML(m.targetDate)}</div>
    </div>
    ${m.targetDate ? `<button class="btn-secondary" id="btn-ms-clear-date" style="margin-top:8px;">CLEAR TARGET DATE</button>` : ""}

    <div class="builder-section-title">MILESTONES ${total ? `(${done}/${total})` : ""}</div>
    <ul class="task-list" style="list-style:none; padding:0; margin:0 0 10px;">${milestonesHTML}</ul>
    <div class="add-subtask-row">
      <input type="text" class="text-input" id="ms-new-milestone" placeholder="Add a milestone...">
      <button type="button" id="btn-ms-add-milestone">+</button>
    </div>

    <div style="margin-top:8px;">${actionHTML}</div>
  `;
}
function screenHeaderHTML(title) {
  return `<div style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
    <button class="icon-btn" id="btn-ms-detail-back">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
    </button>
    <h1 class="screen-h1" style="margin:0;">${title}</h1>
  </div>`;
}

/* ---------- HANDLERS ---------- */
function attachHandlers() {
  if (screen === "detail") { attachDetailHandlers(); return; }
  document.querySelectorAll("[data-open-mission]").forEach((b) => b.onclick = () => openDetail(b.getAttribute("data-open-mission")));
  const newBtn = el("btn-ms-new");
  if (newBtn) newBtn.onclick = () => openDetail(null);
}

function attachDetailHandlers() {
  const m = currentMission();
  if (!m) return;
  const isNew = !editingId;
  const commit = () => { if (!isNew) save(); };

  const backBtn = el("btn-ms-detail-back");
  if (backBtn) backBtn.onclick = () => { screen = null; editingId = null; draft = null; render(); };

  el("ms-title").onblur = (e) => { m.title = e.target.value; commit(); };
  el("ms-vision").onblur = (e) => { m.vision = e.target.value; commit(); };

  document.querySelectorAll("[data-ms-date]").forEach((b) => b.onclick = () => { m.targetDate = b.getAttribute("data-ms-date"); commit(); render(); });
  const clearDateBtn = el("btn-ms-clear-date");
  if (clearDateBtn) clearDateBtn.onclick = () => { m.targetDate = null; commit(); render(); };
  const calPrev = el("ms-cal-prev");
  if (calPrev) calPrev.onclick = () => { msCalView.setMonth(msCalView.getMonth() - 1); render(); };
  const calNext = el("ms-cal-next");
  if (calNext) calNext.onclick = () => { msCalView.setMonth(msCalView.getMonth() + 1); render(); };

  document.querySelectorAll("[data-milestone-check]").forEach((cb) => cb.onclick = () => {
    const s = m.milestones.find((x) => x.id === cb.getAttribute("data-milestone-check"));
    s.done = !s.done; commit(); render();
  });
  document.querySelectorAll("[data-milestone-text]").forEach((inp) => inp.onblur = (e) => {
    const s = m.milestones.find((x) => x.id === inp.getAttribute("data-milestone-text"));
    s.text = e.target.value; commit();
  });
  document.querySelectorAll("[data-milestone-remove]").forEach((b) => b.onclick = () => {
    m.milestones = m.milestones.filter((x) => x.id !== b.getAttribute("data-milestone-remove"));
    commit(); render();
  });
  const addBtn = el("btn-ms-add-milestone");
  const newInput = el("ms-new-milestone");
  function addMilestone() {
    const text = newInput.value.trim();
    if (!text) return;
    m.milestones = m.milestones || [];
    m.milestones.push({ id: uid(), text, done: false, createdAt: new Date().toISOString() });
    commit();
    render();
    const refocus = el("ms-new-milestone");
    if (refocus) refocus.focus();
  }
  if (addBtn) addBtn.onclick = addMilestone;
  if (newInput) newInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addMilestone(); } });

  const createBtn = el("btn-ms-create");
  if (createBtn) createBtn.onclick = () => {
    const title = el("ms-title").value.trim();
    if (!title) { flashInvalid(el("ms-title")); return; }
    m.title = title;
    m.vision = el("ms-vision").value;
    const record = {
      id: uid(), title: m.title, vision: m.vision, targetDate: m.targetDate || null,
      isPrimary: false, status: "active", milestones: m.milestones || [],
      createdAt: new Date().toISOString(), completedAt: null
    };
    state.missions.push(record);
    save();
    editingId = record.id; draft = null;
    render();
    window.showToast && window.showToast("MISSION CREATED");
  };

  const primaryBtn = el("btn-ms-primary");
  if (primaryBtn) primaryBtn.onclick = () => {
    if (m.isPrimary) { m.isPrimary = false; } else { setPrimary(m.id); }
    save(); render();
    window.showToast && window.showToast(m.isPrimary ? "SET AS PRIMARY MISSION" : "REMOVED AS PRIMARY");
  };

  const completeBtn = el("btn-ms-complete");
  if (completeBtn) completeBtn.onclick = () => {
    m.status = "completed"; m.completedAt = new Date().toISOString();
    save(); render();
    window.showToast && window.showToast("MISSION COMPLETED");
  };

  const reopenBtn = el("btn-ms-reopen");
  if (reopenBtn) reopenBtn.onclick = () => {
    m.status = "active"; m.completedAt = null;
    save(); render();
    window.showToast && window.showToast("REOPENED");
  };

  const deleteBtn = el("btn-ms-delete");
  if (deleteBtn) deleteBtn.onclick = () => {
    if (confirm(`Delete "${m.title || "this mission"}"? This cannot be undone.`)) {
      state.missions = state.missions.filter((x) => x.id !== m.id);
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

function openDetail(missionId) {
  if (missionId) {
    editingId = missionId; draft = null;
    const m = state.missions.find((x) => x.id === missionId);
    msCalView = new Date((m && m.targetDate ? m.targetDate : todayStr()) + "T12:00:00");
  } else {
    editingId = null;
    draft = { title: "", vision: "", targetDate: null, isPrimary: false, milestones: [] };
    msCalView = new Date();
  }
  screen = "detail";
  render();
}

/* ---------- TOP STRIP ---------- */
el("btn-missions-back").addEventListener("click", () => window.goToDashboard());
el("btn-missions-settings").addEventListener("click", () => window.openMergedSettings());

/* ---------- PUBLIC INTERFACE ---------- */
window.MissionsData = {
  getState: () => state,
  setState: (newState) => { state = newState; render(); },
  wipe: () => { state = defaultState(); save(); render(); },
  populateSettings: () => {},
  goHome: () => { screen = null; editingId = null; draft = null; render(); },
  getPrimaryMission: () => state.missions.find((m) => m.isPrimary) || null
};

/* ---------- INIT ---------- */
render();

})();
