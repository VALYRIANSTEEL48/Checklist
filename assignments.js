/* =========================================================
   ASSIGNMENTS — assignments.js
   Ongoing projects broken into checkable subtasks. No streaks, no daily
   reset — runs on its own clock. Own localStorage namespace, no
   cross-talk with Checklist or Workouts.
   ========================================================= */

(function () {
"use strict";

const STORAGE_KEY = "assignments_state_v1";
const MONTH_LABELS = ["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];

/* ---------- STATE ---------- */
function defaultState() { return { assignments: [] }; }
let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return { assignments: Array.isArray(parsed.assignments) ? parsed.assignments : [] };
  } catch (e) {
    console.error("Failed to load assignments state, resetting.", e);
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
function penIconSVG(size) {
  size = size || 16;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
}

/* ---------- RUNTIME (non-persisted) STATE ---------- */
let tab = "active";       // 'active' | 'planning' | 'completed'
let screen = null;        // null | 'detail'
let editingId = null;     // assignment id being viewed, or null if creating new
let draft = null;         // in-memory record while creating (not yet saved)
let asCalView = new Date();

const el = (id) => document.getElementById(id);

function currentAssignment() {
  return editingId ? state.assignments.find((a) => a.id === editingId) : draft;
}

/* ---------- RENDER ROOT (with error boundary) ---------- */
function render() {
  let html;
  let hadError = false;
  try {
    html = screen === "edit" ? detailScreenHTML() : screen === "view" ? viewScreenHTML() : listScreenHTML();
  } catch (err) {
    console.error("Assignments render error:", err);
    html = errorScreenHTML(err);
    hadError = true;
  }
  el("assignments-screen").innerHTML = html;
  if (pendingSwipeAnim) {
    const scr = el("assignments-screen");
    scr.classList.remove("tab-swipe-left", "tab-swipe-right");
    void scr.offsetWidth;
    scr.classList.add(pendingSwipeAnim === "left" ? "tab-swipe-left" : "tab-swipe-right");
    pendingSwipeAnim = null;
  }

  const showChrome = screen === null && !hadError;
  el("as-top-strip").style.display = "flex";
  el("as-tabbar").style.display = showChrome ? "flex" : "none";
  el("as-top-title").textContent = "ASSIGNMENTS";
  document.querySelectorAll(".module-tab-btn[data-as-tab]").forEach((b) => {
    b.classList.toggle("active", showChrome && b.getAttribute("data-as-tab") === tab);
  });

  if (hadError) { attachErrorScreenHandlers(); return; }
  try {
    attachHandlers();
  } catch (err) {
    console.error("Assignments handler-wiring error:", err);
    el("assignments-screen").innerHTML = errorScreenHTML(err);
    attachErrorScreenHandlers();
  }
}
function errorScreenHTML(err) {
  const msg = (err && err.message) ? err.message : String(err);
  const stack = (err && err.stack) ? err.stack : "";
  return `<div class="wk-builder-panel" style="border-color:var(--danger);">
    <h1 class="screen-h1" style="color:var(--danger);">SOMETHING WENT WRONG</h1>
    <p class="hint-text">The Assignments screen hit an error. Your data is safe — nothing was deleted.</p>
    <label class="field-label">ERROR</label>
    <div class="text-input" style="white-space:pre-wrap; word-break:break-word; font-family:var(--font-mono); font-size:11px; user-select:text;">${escapeHTML(msg)}</div>
    ${stack ? `<label class="field-label">DETAILS</label>
    <div class="text-input" style="white-space:pre-wrap; word-break:break-word; font-family:var(--font-mono); font-size:10px; max-height:160px; overflow-y:auto; user-select:text;">${escapeHTML(stack)}</div>` : ""}
    <button class="btn-primary" id="btn-as-error-home">GO TO ASSIGNMENTS HOME</button>
  </div>`;
}
function attachErrorScreenHandlers() {
  const btn = el("btn-as-error-home");
  if (btn) btn.onclick = () => { screen = null; editingId = null; draft = null; tab = "active"; render(); };
}

/* ---------- DERIVED ---------- */
function subtaskProgress(a) {
  const total = (a.subtasks || []).length;
  const done = (a.subtasks || []).filter((s) => s.done).length;
  return { total, done };
}
function isOverdue(a) {
  return a.dueDate && a.status !== "completed" && a.dueDate < todayStr();
}

/* Tab identifiers ('active'/'planning'/'completed') and status values
   ('planning'/'in_progress'/'completed') use different vocabulary — the
   tab shown day-to-day is called "Active" but the underlying status is
   "in_progress". Map explicitly rather than assuming they line up. */
const TAB_TO_STATUS = { active: "in_progress", planning: "planning", completed: "completed" };

/* ---------- LIST SCREENS ---------- */
function listScreenHTML() {
  const items = state.assignments
    .filter((a) => a.status === TAB_TO_STATUS[tab])
    .sort((a, b) => {
      if (tab === "completed") return (b.completedAt || "").localeCompare(a.completedAt || "");
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    });

  const activeCount = state.assignments.filter((a) => a.status === "in_progress").length;
  const dueThisWeek = state.assignments.filter((a) => {
    if (a.status === "completed" || !a.dueDate) return false;
    const diff = Math.round((new Date(a.dueDate + "T12:00:00") - new Date(todayStr() + "T12:00:00")) / 86400000);
    return diff >= 0 && diff <= 7;
  }).length;

  const readout = tab !== "completed" ? `
    <div class="as-readout-panel corner-bracket">
      <div class="as-readout-block"><div class="readout-label">ACTIVE</div><div class="readout-value" style="font-size:26px;">${pad2(activeCount)}</div></div>
      <div class="as-readout-block"><div class="readout-label">DUE THIS WEEK</div><div class="readout-value" style="font-size:26px;">${pad2(dueThisWeek)}</div></div>
    </div>` : "";

  const createBtn = tab !== "completed"
    ? `<button class="wk-dashed-card" style="width:100%; text-align:center; margin-bottom:16px;" id="btn-as-new">+ CREATE NEW ASSIGNMENT</button>` : "";

  const cardsHTML = items.map((a) => {
    const { total, done } = subtaskProgress(a);
    const pct = total ? Math.round((done / total) * 100) : 0;
    const overdue = isOverdue(a);
    const cls = ["assignment-card"];
    if (overdue) cls.push("overdue");
    if (a.status === "completed") cls.push("done");
    return `<button class="${cls.join(" ")}" data-open-assignment="${a.id}">
      <div class="ac-top">
        <span class="ac-title">${escapeHTML(a.title || "Untitled")}</span>
        <span class="ac-due">${a.dueDate ? (overdue ? "OVERDUE · " : "") + fmtDateShort(a.dueDate) : (a.status === "completed" && a.completedAt ? "DONE " + fmtDateShort(a.completedAt.slice(0,10)) : "NO DUE DATE")}</span>
      </div>
      ${a.description ? `<div class="ac-desc">${escapeHTML(a.description)}</div>` : ""}
      ${total ? `<div class="ac-progress-row"><div class="ac-progress-track"><div class="ac-progress-fill" style="width:${pct}%"></div></div><span class="ac-progress-label">${done}/${total}</span></div>` : ""}
    </button>`;
  }).join("");

  const emptyMsg = { active: "No active assignments.", planning: "Nothing in planning yet.", completed: "Nothing completed yet." }[tab];

  return `<h1 class="screen-h1">${tab.toUpperCase()}</h1>
    ${readout}${createBtn}
    ${cardsHTML || `<p class="hint-text" style="text-align:center; padding:30px 0;">${emptyMsg}</p>`}`;
}

/* ---------- READ-ONLY VIEW SCREEN ----------
   Opened by tapping a card: title, description, due date, and the
   subtask checklist stay read-only EXCEPT the checkboxes themselves and
   the MARK COMPLETE action, which stay live here for fast day-to-day
   use. Renaming/adding/removing subtasks, editing title/description/due
   date, and start/reopen/delete all live behind the pen icon in the
   full edit screen. */
function viewScreenHTML() {
  const a = currentAssignment();
  if (!a) return "";
  const { total, done } = subtaskProgress(a);
  const overdue = isOverdue(a);

  const subtasksHTML = (a.subtasks || []).map((s) => `
    <li class="subtask-row ${s.done ? "done" : ""}" data-subtask="${s.id}">
      <span class="checkbox" data-subtask-check="${s.id}">${s.done ? `<svg viewBox="0 0 24 24"><path fill="#0B0E0C" d="M9 16.2L4.8 12l-1.4 1.4L9 19 20.6 7.4 19.2 6z"/></svg>` : ""}</span>
      <span class="subtask-text-ro">${escapeHTML(s.text)}</span>
    </li>`).join("");

  const statusBadge = `<span class="as-status-badge ${a.status}">${a.status.replace("_", " ").toUpperCase()}</span>`;

  let actionHTML = "";
  if (a.status === "in_progress") {
    actionHTML = `<button class="btn-primary" id="btn-as-mark-complete">MARK COMPLETE</button>`;
  } else if (a.status === "completed") {
    const note = a.completionNote || {};
    actionHTML = `
      <div class="completion-note-block">
        <div class="cn-label">COMPLETED ${a.completedAt ? fmtDateShort(a.completedAt.slice(0,10)).toUpperCase() : ""}</div>
        <div class="cn-text">${escapeHTML(note.summary || "(no summary written)")}</div>
        ${note.skippedReason ? `<div class="cn-label" style="margin-top:10px;">SKIPPED SUBTASKS — WHY</div><div class="cn-text">${escapeHTML(note.skippedReason)}</div>` : ""}
      </div>`;
  }

  return `
    <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
      <button class="icon-btn" id="btn-as-view-back">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <h1 class="screen-h1" style="margin:0; flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHTML(a.title || "Untitled")}</h1>
      <button class="icon-btn" id="btn-as-view-edit" aria-label="Edit assignment">${penIconSVG(20)}</button>
    </div>
    ${statusBadge}
    ${a.description ? `<p class="hint-text" style="margin:10px 0 4px; font-size:13px; line-height:1.5; color:var(--text);">${escapeHTML(a.description)}</p>` : ""}
    <div class="hint-text" style="margin-bottom:14px;">${a.dueDate ? (overdue ? "OVERDUE · " : "DUE ") + fmtDateShort(a.dueDate) : "NO DUE DATE"}</div>

    ${total ? `<div class="builder-section-title">SUBTASKS (${done}/${total})</div>
    <ul class="task-list" style="list-style:none; padding:0; margin:0 0 16px;">${subtasksHTML}</ul>` : ""}

    ${actionHTML}
  `;
}

/* ---------- DETAIL / CREATE-EDIT SCREEN ---------- */
function calendarGridHTML(selectedDate) {
  const y = asCalView.getFullYear(), m = asCalView.getMonth();
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
    html += `<button type="button" data-as-date="${ds}" class="${cls.join(" ")}">${d.getDate()}</button>`;
  }
  return html;
}

function detailScreenHTML() {
  const a = currentAssignment();
  if (!a) return "";
  const isNew = !editingId;
  const { total, done } = subtaskProgress(a);

  const subtasksHTML = (a.subtasks || []).map((s) => `
    <li class="subtask-row ${s.done ? "done" : ""}" data-subtask="${s.id}">
      <span class="checkbox" data-subtask-check="${s.id}">${s.done ? `<svg viewBox="0 0 24 24"><path fill="#0B0E0C" d="M9 16.2L4.8 12l-1.4 1.4L9 19 20.6 7.4 19.2 6z"/></svg>` : ""}</span>
      <input type="text" class="subtask-text" value="${escapeHTML(s.text)}" data-subtask-text="${s.id}">
      <button class="subtask-remove" data-subtask-remove="${s.id}">×</button>
    </li>`).join("");

  let actionHTML = "";
  if (isNew) {
    actionHTML = `<button class="btn-primary" id="btn-as-create">CREATE ASSIGNMENT</button>`;
  } else if (a.status === "planning") {
    actionHTML = `<button class="btn-primary" id="btn-as-start">START ASSIGNMENT</button>
      <button class="btn-danger-outline" id="btn-as-delete">DELETE ASSIGNMENT</button>`;
  } else if (a.status === "in_progress") {
    actionHTML = `<button class="btn-primary" id="btn-as-mark-complete">MARK COMPLETE</button>
      <button class="btn-danger-outline" id="btn-as-delete">DELETE ASSIGNMENT</button>`;
  } else {
    const note = a.completionNote || {};
    actionHTML = `
      <div class="completion-note-block">
        <div class="cn-label">COMPLETED ${a.completedAt ? fmtDateShort(a.completedAt.slice(0,10)).toUpperCase() : ""}</div>
        <div class="cn-text">${escapeHTML(note.summary || "(no summary written)")}</div>
        ${note.skippedReason ? `<div class="cn-label" style="margin-top:10px;">SKIPPED SUBTASKS — WHY</div><div class="cn-text">${escapeHTML(note.skippedReason)}</div>` : ""}
      </div>
      <button class="btn-secondary" id="btn-as-reopen">REOPEN ASSIGNMENT</button>
      <button class="btn-danger-outline" id="btn-as-delete">DELETE ASSIGNMENT</button>`;
  }

  const statusBadge = isNew ? "" : `<span class="as-status-badge ${a.status}">${a.status.replace("_", " ").toUpperCase()}</span>`;

  return `
    ${screenHeaderHTML(isNew ? "NEW ASSIGNMENT" : "ASSIGNMENT")}
    ${statusBadge}
    <label class="field-label" style="margin-top:0;">TITLE</label>
    <input type="text" class="text-input" id="as-title" value="${escapeHTML(a.title)}" placeholder="e.g. Build the client portal">

    <label class="field-label">DESCRIPTION / INSTRUCTIONS</label>
    <textarea class="text-input" id="as-description" style="height:90px;" placeholder="What this is and why it matters">${escapeHTML(a.description || "")}</textarea>

    <label class="field-label">DUE DATE</label>
    <div class="calendar-panel corner-bracket">
      <div class="cal-header">
        <button type="button" id="as-cal-prev" class="icon-btn small">‹</button>
        <div>${asCalView.toLocaleDateString("default", { month: "long", year: "numeric" }).toUpperCase()}</div>
        <button type="button" id="as-cal-next" class="icon-btn small">›</button>
      </div>
      <div class="cal-weekdays"><span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span></div>
      <div class="cal-grid">${calendarGridHTML(a.dueDate)}</div>
    </div>
    ${a.dueDate ? `<button class="btn-secondary" id="btn-as-clear-date" style="margin-top:8px;">CLEAR DUE DATE</button>` : ""}

    <div class="builder-section-title">SUBTASKS ${total ? `(${done}/${total})` : ""}</div>
    <ul class="task-list" style="list-style:none; padding:0; margin:0 0 10px;">${subtasksHTML}</ul>
    <div class="add-subtask-row">
      <input type="text" class="text-input" id="as-new-subtask" placeholder="Add a step or task...">
      <button type="button" id="btn-as-add-subtask">+</button>
    </div>

    <div style="margin-top:8px;">${actionHTML}</div>
  `;
}
function screenHeaderHTML(title) {
  return `<div style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
    <button class="icon-btn" id="btn-as-detail-back">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
    </button>
    <h1 class="screen-h1" style="margin:0;">${title}</h1>
  </div>`;
}

/* ---------- HANDLERS ---------- */
function attachHandlers() {
  if (screen === "edit") { attachDetailHandlers(); return; }
  if (screen === "view") { attachViewHandlers(); return; }
  document.querySelectorAll("[data-open-assignment]").forEach((b) => b.onclick = () => openView(b.getAttribute("data-open-assignment")));
  const newBtn = el("btn-as-new");
  if (newBtn) newBtn.onclick = () => openEdit(null);
}

function attachViewHandlers() {
  const a = currentAssignment();
  if (!a) return;

  const backBtn = el("btn-as-view-back");
  if (backBtn) backBtn.onclick = () => { screen = null; editingId = null; draft = null; render(); };
  const editBtn = el("btn-as-view-edit");
  if (editBtn) editBtn.onclick = () => openEdit(a.id);

  document.querySelectorAll("[data-subtask-check]").forEach((cb) => cb.onclick = () => {
    const s = a.subtasks.find((x) => x.id === cb.getAttribute("data-subtask-check"));
    s.done = !s.done; save(); render();
  });

  const markCompleteBtn = el("btn-as-mark-complete");
  if (markCompleteBtn) markCompleteBtn.onclick = () => openCompleteSheet();
}

function attachDetailHandlers() {
  const a = currentAssignment();
  if (!a) return;
  const isNew = !editingId;
  const commit = () => { if (!isNew) save(); };

  const backBtn = el("btn-as-detail-back");
  // Editing an existing assignment came from the view screen (via the pen
  // icon) — return there, not the list. Creating a new one has no view to
  // go back to, so that path still exits to the list.
  if (backBtn) backBtn.onclick = () => {
    if (editingId) { screen = "view"; render(); }
    else { screen = null; editingId = null; draft = null; render(); }
  };

  el("as-title").onblur = (e) => { a.title = e.target.value; commit(); };
  el("as-description").onblur = (e) => { a.description = e.target.value; commit(); };

  document.querySelectorAll("[data-as-date]").forEach((b) => b.onclick = () => { a.dueDate = b.getAttribute("data-as-date"); commit(); render(); });
  const clearDateBtn = el("btn-as-clear-date");
  if (clearDateBtn) clearDateBtn.onclick = () => { a.dueDate = null; commit(); render(); };
  const calPrev = el("as-cal-prev");
  if (calPrev) calPrev.onclick = () => { asCalView.setMonth(asCalView.getMonth() - 1); render(); };
  const calNext = el("as-cal-next");
  if (calNext) calNext.onclick = () => { asCalView.setMonth(asCalView.getMonth() + 1); render(); };

  document.querySelectorAll("[data-subtask-check]").forEach((cb) => cb.onclick = () => {
    const s = a.subtasks.find((x) => x.id === cb.getAttribute("data-subtask-check"));
    s.done = !s.done; commit(); render();
  });
  document.querySelectorAll("[data-subtask-text]").forEach((inp) => inp.onblur = (e) => {
    const s = a.subtasks.find((x) => x.id === inp.getAttribute("data-subtask-text"));
    s.text = e.target.value; commit();
  });
  document.querySelectorAll("[data-subtask-remove]").forEach((b) => b.onclick = () => {
    a.subtasks = a.subtasks.filter((x) => x.id !== b.getAttribute("data-subtask-remove"));
    commit(); render();
  });
  const addSubtaskBtn = el("btn-as-add-subtask");
  const newSubtaskInput = el("as-new-subtask");
  function addSubtask() {
    const text = newSubtaskInput.value.trim();
    if (!text) return;
    a.subtasks = a.subtasks || [];
    a.subtasks.push({ id: uid(), text, done: false, createdAt: new Date().toISOString() });
    commit();
    render();
    const refocus = el("as-new-subtask");
    if (refocus) refocus.focus();
  }
  if (addSubtaskBtn) addSubtaskBtn.onclick = addSubtask;
  if (newSubtaskInput) newSubtaskInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addSubtask(); } });

  const createBtn = el("btn-as-create");
  if (createBtn) createBtn.onclick = () => {
    const title = el("as-title").value.trim();
    if (!title) { flashInvalid(el("as-title")); return; }
    a.title = title;
    a.description = el("as-description").value;
    const record = {
      id: uid(), title: a.title, description: a.description, dueDate: a.dueDate || null,
      status: "planning", subtasks: a.subtasks || [], createdAt: new Date().toISOString(),
      startedAt: null, completedAt: null, completionNote: null
    };
    state.assignments.push(record);
    save();
    editingId = record.id; draft = null;
    render();
    window.showToast && window.showToast("ASSIGNMENT CREATED");
  };

  const startBtn = el("btn-as-start");
  if (startBtn) startBtn.onclick = () => {
    a.status = "in_progress"; a.startedAt = new Date().toISOString();
    save(); render();
    window.showToast && window.showToast("ASSIGNMENT STARTED");
  };

  const markCompleteBtn = el("btn-as-mark-complete");
  if (markCompleteBtn) markCompleteBtn.onclick = () => openCompleteSheet();

  const reopenBtn = el("btn-as-reopen");
  if (reopenBtn) reopenBtn.onclick = () => {
    a.status = "in_progress"; a.completedAt = null; a.completionNote = null;
    save(); render();
    window.showToast && window.showToast("REOPENED");
  };

  const deleteBtn = el("btn-as-delete");
  if (deleteBtn) deleteBtn.onclick = () => {
    if (confirm(`Delete "${a.title || "this assignment"}"? This cannot be undone.`)) {
      state.assignments = state.assignments.filter((x) => x.id !== a.id);
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

function openView(assignmentId) {
  editingId = assignmentId; draft = null;
  screen = "view";
  render();
}
function openEdit(assignmentId) {
  if (assignmentId) {
    editingId = assignmentId; draft = null;
    const a = state.assignments.find((x) => x.id === assignmentId);
    asCalView = new Date((a && a.dueDate ? a.dueDate : todayStr()) + "T12:00:00");
  } else {
    editingId = null;
    draft = { title: "", description: "", dueDate: null, subtasks: [] };
    asCalView = new Date();
  }
  screen = "edit";
  render();
}

/* ---------- COMPLETION SHEET ---------- */
function openSheet(id) { el(id).classList.add("open"); }
function closeSheet(id) { el(id).classList.remove("open"); }
function openCompleteSheet() {
  const a = currentAssignment();
  const { total, done } = subtaskProgress(a);
  el("as-complete-summary").value = "";
  el("as-complete-skipped-reason").value = "";
  el("as-complete-skipped-wrap").hidden = !(total > 0 && done < total);
  openSheet("as-complete-overlay");
}
el("btn-close-as-complete").addEventListener("click", () => closeSheet("as-complete-overlay"));
el("as-complete-overlay").addEventListener("click", (e) => { if (e.target.id === "as-complete-overlay") closeSheet("as-complete-overlay"); });
el("btn-as-complete-confirm").addEventListener("click", () => {
  const a = currentAssignment();
  if (!a || editingId == null) { closeSheet("as-complete-overlay"); return; }
  const { total, done } = subtaskProgress(a);
  a.status = "completed";
  a.completedAt = new Date().toISOString();
  a.completionNote = {
    summary: el("as-complete-summary").value,
    allCompleted: total > 0 && done === total,
    skippedReason: el("as-complete-skipped-wrap").hidden ? "" : el("as-complete-skipped-reason").value
  };
  save();
  closeSheet("as-complete-overlay");
  render();
  window.showToast && window.showToast("ASSIGNMENT COMPLETED");
});

/* ---------- TOP STRIP / TAB BAR ---------- */
el("btn-assignments-back").addEventListener("click", () => window.goToDashboard());
el("btn-assignments-settings").addEventListener("click", () => window.openMergedSettings());
document.querySelectorAll(".module-tab-btn[data-as-tab]").forEach((b) => {
  b.addEventListener("click", () => { tab = b.getAttribute("data-as-tab"); screen = null; render(); });
});

// Lightweight swipe-left/right gesture: a pointer-based horizontal drag
// past a distance/angle threshold moves to the next/previous tab. Kept as
// a local copy rather than a shared shell.js helper because this module's
// script runs (and wires this up) before shell.js does — see script tag
// order in index.html — so a `window.*` helper wouldn't exist yet.
let pendingSwipeAnim = null;
function attachSwipeTabs(containerEl, tabs, getCurrentTab, onSwipe) {
  if (!containerEl) return;
  let startX = null, startY = null, tracking = false;
  containerEl.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    startX = e.clientX; startY = e.clientY; tracking = true;
    // Without capture, a real swipe that drifts outside this element's
    // box before the finger lifts fires pointerup on whatever happens to
    // be under the finger at that moment — which might not even be a
    // descendant of containerEl, so the listener below would never see
    // it. Capturing pins all of this pointer's subsequent events to
    // containerEl regardless of where it physically ends up.
    try { containerEl.setPointerCapture(e.pointerId); } catch (err) { /* best-effort only */ }
  });
  containerEl.addEventListener("pointerup", (e) => {
    if (!tracking || startX === null) { tracking = false; return; }
    tracking = false;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    startX = null; startY = null;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const idx = tabs.indexOf(getCurrentTab());
    if (idx === -1) return;
    if (dx < 0 && idx < tabs.length - 1) onSwipe(tabs[idx + 1], "left");
    else if (dx > 0 && idx > 0) onSwipe(tabs[idx - 1], "right");
  });
  containerEl.addEventListener("pointercancel", () => { tracking = false; startX = null; startY = null; });
}

// Swipe left/right over the list cycles ACTIVE/PLANNING/COMPLETED, only
// while at the top-level list (screen === null) — not mid view/edit.
attachSwipeTabs(el("assignments-screen"), ["active", "planning", "completed"], () => tab, (newTab, dir) => {
  if (screen !== null) return;
  tab = newTab;
  pendingSwipeAnim = dir;
  render();
});

/* ---------- PUBLIC INTERFACE ---------- */
window.AssignmentsData = {
  getState: () => state,
  setState: (newState) => { state = newState; render(); },
  wipe: () => { state = defaultState(); save(); render(); },
  populateSettings: () => {},
  activeCount: () => state.assignments.filter((a) => a.status === "in_progress").length,
  goHome: () => { screen = null; editingId = null; draft = null; tab = "active"; render(); },
  // Quick-add entry point (global bottom-strip plus button).
  openCreate: () => { openEdit(null); },
  // Dashboard SITREP summary: the single most pressing non-completed
  // assignment (earliest due date; undated ones sort last), plus whether
  // it's already overdue. Resolved on demand, same sort as the list view.
  nextUp: () => {
    const today = todayStr();
    const active = state.assignments.filter((a) => a.status !== "completed");
    if (!active.length) return null;
    const withDates = active.filter((a) => a.dueDate).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const chosen = withDates[0] || active[0];
    return {
      title: chosen.title,
      dueDate: chosen.dueDate || null,
      overdue: !!(chosen.dueDate && chosen.dueDate < today)
    };
  }
};

/* ---------- INIT ---------- */
render();

})();
