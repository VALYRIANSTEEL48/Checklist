/* =========================================================
   CHECKLIST — app.js
   Single-user offline PWA. All data lives in localStorage.
   ========================================================= */

(function () {
"use strict";

const STORAGE_KEY = "checklist_state_v1";
const WEEKDAY_LABELS = ["SUN","MON","TUE","WED","THU","FRI","SAT"];
const MONTH_LABELS = ["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];

/* ---------- STATE ---------- */
function defaultState() {
  return {
    settings: {
      resetHour: 0,
      resetMinute: 0,
      accent: "#D98E2B",
      tone: "black"
    },
    tasks: []
  };
}

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    // shallow-merge to survive future schema additions
    const base = defaultState();
    return {
      settings: Object.assign(base.settings, parsed.settings || {}),
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : []
    };
  } catch (e) {
    console.error("Failed to load state, resetting.", e);
    return defaultState();
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ---------- DATE UTILITIES ---------- */
// All "dateStr" values are calendar dates in local time, format YYYY-MM-DD.

function pad2(n) { return String(n).padStart(2, "0"); }

function dateToStr(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function strToDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDaysStr(dateStr, n) {
  const d = strToDate(dateStr);
  d.setDate(d.getDate() + n);
  return dateToStr(d);
}

function weekdayOf(dateStr) {
  return strToDate(dateStr).getDay(); // 0=Sun..6=Sat
}

function calendarDateOfISO(iso) {
  return dateToStr(new Date(iso));
}

// Returns the "tracking date" (YYYY-MM-DD) that "now" belongs to, given the
// configured daily reset time. Before reset time, we are still in the
// previous tracking day.
function getTrackingDateStr(now) {
  now = now || new Date();
  const ref = new Date(now.getFullYear(), now.getMonth(), now.getDate(),
                        state.settings.resetHour, state.settings.resetMinute, 0, 0);
  if (now < ref) {
    return addDaysStr(dateToStr(now), -1);
  }
  return dateToStr(now);
}

function fmtTime12(hhmm) {
  if (!hhmm) return "";
  let [h, m] = hhmm.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12; if (h === 0) h = 12;
  return `${h}:${pad2(m)} ${ap}`;
}

function fmtDateShort(dateStr) {
  const d = strToDate(dateStr);
  return `${MONTH_LABELS[d.getMonth()].slice(0,3)} ${d.getDate()}`;
}

/* ---------- DUE-DATE ENGINE ----------
   A task counts toward that day's tally ("is due") according to its own
   single rule:
     - repeating          -> due on every dateStr whose weekday is in
                              task.days (empty days[] == every day), from
                              its creation date onward.
     - one-off / scheduled -> due exactly once, on task.date.
     - one-off / anytime    -> due exactly once, on its creation date
                              (i.e. "get this done today").
   Paused tasks are never due (for any date, past or future) while paused.
------------------------------------------------------------------------ */

function taskCreatedDateStr(task) {
  return calendarDateOfISO(task.createdAt);
}

function isDueOn(task, dateStr) {
  if (task.paused) return false;
  const created = taskCreatedDateStr(task);
  if (dateStr < created) return false;

  if (task.recurrence === "repeating") {
    const days = task.days && task.days.length ? task.days : [0,1,2,3,4,5,6];
    return days.includes(weekdayOf(dateStr));
  }
  // one-off
  if (task.timing === "scheduled") {
    return task.date === dateStr;
  }
  // one-off anytime: due only on its creation day
  return dateStr === created;
}

function isCompletedOn(task, dateStr) {
  return !!(task.completions && task.completions[dateStr]);
}

function getDueTasks(dateStr) {
  return state.tasks.filter((t) => isDueOn(t, dateStr));
}

function isDayComplete(dateStr) {
  const due = getDueTasks(dateStr);
  if (due.length === 0) return true;
  return due.every((t) => isCompletedOn(t, dateStr));
}

// Earliest calendar date any task was ever created — bounds streak walk-back
// so empty history before first use never counts.
function firstTaskDateStr() {
  if (!state.tasks.length) return null;
  return state.tasks.reduce((min, t) => {
    const d = taskCreatedDateStr(t);
    return (min === null || d < min) ? d : min;
  }, null);
}

function computeMainStreak() {
  const start = firstTaskDateStr();
  if (!start) return 0;
  const today = getTrackingDateStr();
  let cursor = isDayComplete(today) ? today : addDaysStr(today, -1);
  let streak = 0;
  while (cursor >= start) {
    if (isDayComplete(cursor)) { streak++; cursor = addDaysStr(cursor, -1); }
    else break;
  }
  return streak;
}

// Per-task streak + consistency (repeating tasks only — one-offs are single
// events and don't carry a meaningful streak).
function computeTaskStats(task) {
  if (task.recurrence !== "repeating") return { streak: null, consistency: null };
  const created = taskCreatedDateStr(task);
  const today = getTrackingDateStr();

  let cursor = today;
  if (!isDueOn(task, today) || !isCompletedOn(task, today)) {
    // today not yet a completed due-day for this task; start streak count from yesterday
    if (isDueOn(task, today) && !isCompletedOn(task, today)) {
      // due today and not done yet — doesn't break streak until reset passes,
      // so we still count backward from yesterday.
    }
    cursor = addDaysStr(today, -1);
  }

  let streak = 0;
  let guard = 0;
  while (cursor >= created && guard < 3660) {
    guard++;
    if (!isDueOn(task, cursor)) { cursor = addDaysStr(cursor, -1); continue; }
    if (isCompletedOn(task, cursor)) { streak++; cursor = addDaysStr(cursor, -1); }
    else break;
  }

  // consistency: completed due-days / total due-days since creation (excluding
  // today if today is still in progress and due)
  let totalDue = 0, totalDone = 0;
  let scan = created;
  const boundary = (isDueOn(task, today) && !isCompletedOn(task, today)) ? addDaysStr(today, -1) : today;
  guard = 0;
  while (scan <= boundary && guard < 3660) {
    guard++;
    if (isDueOn(task, scan)) {
      totalDue++;
      if (isCompletedOn(task, scan)) totalDone++;
    }
    scan = addDaysStr(scan, 1);
  }
  const consistency = totalDue ? Math.round((totalDone / totalDue) * 100) : null;
  return { streak, consistency };
}

function historyTape(days) {
  const today = getTrackingDateStr();
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const ds = addDaysStr(today, -i);
    if (ds > today) { out.push({ ds, state: "future" }); continue; }
    if (ds === today) {
      out.push({ ds, state: isDayComplete(ds) ? "complete" : "pending" });
      continue;
    }
    out.push({ ds, state: isDayComplete(ds) ? "complete" : "missed" });
  }
  return out;
}

/* ---------- RENDER ---------- */
const el = (id) => document.getElementById(id);

function applyTheme() {
  document.documentElement.style.setProperty("--accent", state.settings.accent);
  document.body.setAttribute("data-tone", state.settings.tone);
}

function render() {
  const today = getTrackingDateStr();

  // Readout
  el("main-streak-value").textContent = pad3(computeMainStreak());
  const now = new Date();
  const usesCustomReset = !(state.settings.resetHour === 0 && state.settings.resetMinute === 0);
  el("tracking-date-label").textContent = usesCustomReset ? "OPS DAY" : "TODAY";
  el("tracking-date-value").textContent = `${WEEKDAY_LABELS[weekdayOf(today)]} ${fmtDateShort(today)}`;

  const due = getDueTasks(today);
  const doneCount = due.filter((t) => isCompletedOn(t, today)).length;
  const pct = due.length ? Math.round((doneCount / due.length) * 100) : 100;
  el("today-progress-fill").style.width = pct + "%";

  const tape = historyTape(14);
  el("history-tape").innerHTML = tape.map((d) =>
    `<div class="hb ${d.state}" title="${d.ds}"></div>`).join("");

  renderChecklist(today);
}

function pad3(n) { return String(n).padStart(3, "0"); }

function taskMetaHTML(task, dateStr) {
  const bits = [];
  if (task.recurrence === "repeating") {
    const { streak, consistency } = computeTaskStats(task);
    bits.push(`<span class="streak-tag">STREAK ${streak}</span>`);
    if (consistency !== null) bits.push(`<span>${consistency}% CONSISTENT</span>`);
    if (task.timing === "scheduled") {
      bits.push(`<span>${fmtTime12(task.time)}${task.duration ? " · " + task.duration + "M" : ""}</span>`);
    }
  } else {
    if (task.timing === "scheduled") {
      if (task.date > dateStr) bits.push(`<span>UPCOMING · ${fmtDateShort(task.date)}</span>`);
      else if (task.date < dateStr && !isCompletedOn(task, task.date)) bits.push(`<span>OVERDUE · ${fmtDateShort(task.date)}</span>`);
      bits.push(`<span>${fmtTime12(task.time)}${task.duration ? " · " + task.duration + "M" : ""}</span>`);
    } else {
      bits.push(`<span>ONE-OFF</span>`);
    }
  }
  return bits.join("");
}

function checkIconSVG() {
  return `<svg viewBox="0 0 24 24"><path fill="#0B0E0C" d="M9 16.2L4.8 12l-1.4 1.4L9 19 20.6 7.4 19.2 6z"/></svg>`;
}
function dragIconSVG() {
  return `<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M9 6h2v2H9V6zm4 0h2v2h-2V6zM9 11h2v2H9v-2zm4 0h2v2h-2v-2zM9 16h2v2H9v-2zm4 0h2v2h-2v-2z"/></svg>`;
}

function renderChecklist(today) {
  const scheduled = [];
  const anytime = [];
  const paused = [];

  state.tasks.forEach((t) => {
    if (t.paused) { paused.push(t); return; }
    let visible = false;
    if (t.recurrence === "repeating") {
      visible = isDueOn(t, today);
    } else if (t.timing === "scheduled") {
      visible = t.date === today || (t.date < today && !isCompletedOn(t, t.date)) || t.date > today;
    } else {
      // one-off anytime: show until completed
      const created = taskCreatedDateStr(t);
      visible = !hasEverCompleted(t) || isCompletedOn(t, today) || created === today;
    }
    if (!visible) return;
    if (t.timing === "scheduled") scheduled.push(t); else anytime.push(t);
  });

  scheduled.sort((a, b) => scheduledSortKey(a, today) - scheduledSortKey(b, today) || (a.time || "").localeCompare(b.time || ""));
  anytime.sort((a, b) => (a.order || 0) - (b.order || 0));

  el("list-scheduled").innerHTML = scheduled.map((t) => taskItemHTML(t, today)).join("");
  el("empty-scheduled").style.display = scheduled.length ? "none" : "block";

  el("list-anytime").innerHTML = anytime.map((t) => taskItemHTML(t, today)).join("");
  el("empty-anytime").style.display = anytime.length ? "none" : "block";

  el("group-paused").hidden = paused.length === 0;
  el("list-paused").innerHTML = paused.map((t) => taskItemHTML(t, today)).join("");

  attachRowHandlers();
  attachDragHandlers();
}

function hasEverCompleted(t) {
  return t.completions && Object.values(t.completions).some(Boolean);
}

function scheduledSortKey(t, today) {
  if (t.recurrence === "oneoff") {
    if (t.date < today) return 0; // overdue first
    if (t.date === today) return 1;
    return 2; // upcoming
  }
  return 1; // repeating scheduled counts as "today" bucket
}

function taskItemHTML(t, today) {
  const isDoneToday = t.recurrence === "oneoff" && t.timing === "scheduled"
    ? isCompletedOn(t, t.date)
    : isCompletedOn(t, today);
  const overdue = !t.paused && t.recurrence === "oneoff" && t.timing === "scheduled" && t.date < today && !isCompletedOn(t, t.date);
  const isFuture = !t.paused && t.recurrence === "oneoff" && t.timing === "scheduled" && t.date > today;
  const classes = ["task-item"];
  if (isDoneToday) classes.push("done");
  if (overdue) classes.push("overdue");
  if (t.paused) classes.push("paused");

  const dragHandle = (!t.paused && t.timing === "anytime")
    ? `<span class="drag-handle" data-drag="${t.id}">${dragIconSVG()}</span>` : "";

  const checkbox = isFuture || t.paused
    ? `<span class="checkbox" style="opacity:.3"></span>`
    : `<span class="checkbox" data-check="${t.id}">${checkIconSVG()}</span>`;

  return `<li class="${classes.join(" ")}" data-task="${t.id}">
    ${checkbox}
    <div class="task-main" data-open="${t.id}">
      <div class="task-name">${escapeHTML(t.name)}</div>
      <div class="task-meta">${taskMetaHTML(t, today)}</div>
    </div>
    ${dragHandle}
  </li>`;
}

function escapeHTML(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

/* ---------- INTERACTIONS: check off ---------- */
function attachRowHandlers() {
  document.querySelectorAll("[data-check]").forEach((elx) => {
    elx.onclick = () => toggleComplete(elx.getAttribute("data-check"));
  });
  document.querySelectorAll("[data-open]").forEach((elx) => {
    elx.onclick = () => openActionSheet(elx.getAttribute("data-open"));
  });
}

function toggleComplete(taskId) {
  const t = state.tasks.find((x) => x.id === taskId);
  if (!t) return;
  const today = getTrackingDateStr();
  const dateKey = (t.recurrence === "oneoff" && t.timing === "scheduled") ? t.date : today;
  t.completions = t.completions || {};
  t.completions[dateKey] = !t.completions[dateKey];
  save();
  render();
}

/* ---------- DRAG REORDER (anytime list) ---------- */
let dragState = null;
function attachDragHandlers() {
  document.querySelectorAll("[data-drag]").forEach((handle) => {
    handle.onpointerdown = (e) => startDrag(e, handle);
  });
}

function startDrag(e, handle) {
  e.preventDefault();
  const li = handle.closest("li.task-item");
  const list = el("list-anytime");
  const items = Array.from(list.children);
  dragState = { id: handle.getAttribute("data-drag"), li, list, items, startY: e.clientY };
  li.classList.add("dragging");
  handle.setPointerCapture(e.pointerId);
  handle.onpointermove = onDragMove;
  handle.onpointerup = (ev) => endDrag(ev, handle);
  handle.onpointercancel = (ev) => endDrag(ev, handle);
}

function onDragMove(e) {
  if (!dragState) return;
  const { list, li } = dragState;
  const y = e.clientY;
  const siblings = Array.from(list.children).filter((c) => c !== li);
  let placed = false;
  for (const sib of siblings) {
    const rect = sib.getBoundingClientRect();
    if (y < rect.top + rect.height / 2) {
      list.insertBefore(li, sib);
      placed = true;
      break;
    }
  }
  if (!placed) list.appendChild(li);
}

function endDrag(e, handle) {
  handle.onpointermove = null;
  handle.onpointerup = null;
  handle.onpointercancel = null;
  if (!dragState) return;
  dragState.li.classList.remove("dragging");
  const orderedIds = Array.from(dragState.list.children).map((li) => li.getAttribute("data-task"));
  orderedIds.forEach((id, idx) => {
    const t = state.tasks.find((x) => x.id === id);
    if (t) t.order = idx;
  });
  dragState = null;
  save();
  render();
}

/* ---------- ADD / EDIT TASK SHEET ---------- */
let editingTaskId = null;
let calView = new Date();
let calSelected = null;

function openTaskSheet(taskId) {
  editingTaskId = taskId || null;
  const t = taskId ? state.tasks.find((x) => x.id === taskId) : null;

  el("task-sheet-title").textContent = t ? "EDIT TASK" : "NEW TASK";
  el("input-task-name").value = t ? t.name : "";
  setSeg("seg-recurrence", t ? t.recurrence : "repeating");
  setSeg("seg-timing", t ? t.timing : "anytime");

  const days = t && t.days && t.days.length ? t.days : [0,1,2,3,4,5,6];
  document.querySelectorAll("#weekday-picker button").forEach((b) => {
    b.classList.toggle("active", days.includes(Number(b.getAttribute("data-day"))));
  });

  calSelected = t && t.recurrence === "oneoff" ? t.date : getTrackingDateStr();
  calView = strToDate(calSelected);
  el("input-time").value = t ? (t.time || "07:00") : "07:00";
  el("input-duration").value = t && t.duration ? t.duration : "";

  el("btn-delete-task").hidden = !t;
  updateFormVisibility();
  renderCalendar();
  openSheet("task-overlay");
}

function setSeg(groupId, val) {
  document.querySelectorAll(`#${groupId} .seg-btn`).forEach((b) => {
    b.classList.toggle("active", b.getAttribute("data-val") === val);
  });
}
function getSeg(groupId) {
  const active = document.querySelector(`#${groupId} .seg-btn.active`);
  return active ? active.getAttribute("data-val") : null;
}

function updateFormVisibility() {
  const recurrence = getSeg("seg-recurrence");
  const timing = getSeg("seg-timing");
  el("repeat-days-wrap").style.display = recurrence === "repeating" ? "block" : "none";
  el("scheduled-fields").hidden = timing !== "scheduled";
  el("calendar-panel").style.display = (timing === "scheduled" && recurrence === "oneoff") ? "block" : "none";
  el("date-field-label").style.display = (timing === "scheduled" && recurrence === "oneoff") ? "block" : "none";
}

document.querySelectorAll("#seg-recurrence .seg-btn, #seg-timing .seg-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    setSeg(btn.parentElement.id, btn.getAttribute("data-val"));
    updateFormVisibility();
  });
});

document.querySelectorAll("#weekday-picker button").forEach((btn) => {
  btn.addEventListener("click", () => btn.classList.toggle("active"));
});

function renderCalendar() {
  const y = calView.getFullYear(), m = calView.getMonth();
  el("cal-month-label").textContent = `${MONTH_LABELS[m]} ${y}`;
  const first = new Date(y, m, 1);
  const startWeekday = first.getDay();
  const gridStart = new Date(y, m, 1 - startWeekday);
  const today = getTrackingDateStr();

  let html = "";
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    const ds = dateToStr(d);
    const classes = [];
    if (d.getMonth() !== m) classes.push("other-month");
    if (ds === today) classes.push("today");
    if (ds === calSelected) classes.push("selected");
    if (ds < today) classes.push("past");
    html += `<button type="button" data-date="${ds}" class="${classes.join(" ")}">${d.getDate()}</button>`;
  }
  el("cal-grid").innerHTML = html;
  document.querySelectorAll("#cal-grid button").forEach((b) => {
    b.onclick = () => { calSelected = b.getAttribute("data-date"); renderCalendar(); };
  });
}

el("cal-prev").onclick = () => { calView.setMonth(calView.getMonth() - 1); renderCalendar(); };
el("cal-next").onclick = () => { calView.setMonth(calView.getMonth() + 1); renderCalendar(); };

el("btn-save-task").onclick = () => {
  const name = el("input-task-name").value.trim();
  if (!name) { flashInvalid(el("input-task-name")); return; }
  const recurrence = getSeg("seg-recurrence");
  const timing = getSeg("seg-timing");
  const days = Array.from(document.querySelectorAll("#weekday-picker button.active")).map((b) => Number(b.getAttribute("data-day")));
  const time = el("input-time").value || "07:00";
  const duration = el("input-duration").value ? Number(el("input-duration").value) : null;

  if (editingTaskId) {
    const t = state.tasks.find((x) => x.id === editingTaskId);
    t.name = name;
    t.recurrence = recurrence;
    t.timing = timing;
    t.days = recurrence === "repeating" ? days : [];
    t.time = timing === "scheduled" ? time : null;
    t.duration = timing === "scheduled" ? duration : null;
    t.date = (timing === "scheduled" && recurrence === "oneoff") ? calSelected : null;
  } else {
    const maxOrder = state.tasks.reduce((m, x) => Math.max(m, x.order || 0), 0);
    state.tasks.push({
      id: uid(),
      name,
      recurrence,
      timing,
      days: recurrence === "repeating" ? days : [],
      time: timing === "scheduled" ? time : null,
      duration: timing === "scheduled" ? duration : null,
      date: (timing === "scheduled" && recurrence === "oneoff") ? calSelected : null,
      createdAt: new Date().toISOString(),
      paused: false,
      order: maxOrder + 1,
      completions: {}
    });
  }
  save();
  closeSheet("task-overlay");
  render();
  toast(editingTaskId ? "TASK UPDATED" : "TASK ADDED");
};

el("btn-delete-task").onclick = () => {
  if (!editingTaskId) return;
  state.tasks = state.tasks.filter((t) => t.id !== editingTaskId);
  save();
  closeSheet("task-overlay");
  render();
  toast("TASK DELETED");
};

function flashInvalid(input) {
  input.style.borderColor = "var(--danger)";
  setTimeout(() => { input.style.borderColor = ""; }, 900);
}

/* ---------- ACTION SHEET (edit / pause / delete) ---------- */
let actionTaskId = null;
function openActionSheet(taskId) {
  actionTaskId = taskId;
  const t = state.tasks.find((x) => x.id === taskId);
  if (!t) return;
  el("action-task-name").textContent = t.name;
  el("action-pause").textContent = t.paused ? "RESUME" : "PAUSE";
  openSheet("action-overlay");
}
el("action-edit").onclick = () => { closeSheet("action-overlay"); openTaskSheet(actionTaskId); };
el("action-pause").onclick = () => {
  const t = state.tasks.find((x) => x.id === actionTaskId);
  if (t) { t.paused = !t.paused; save(); }
  closeSheet("action-overlay");
  render();
};
el("action-delete").onclick = () => {
  state.tasks = state.tasks.filter((t) => t.id !== actionTaskId);
  save();
  closeSheet("action-overlay");
  render();
  toast("TASK DELETED");
};

/* ---------- SETTINGS SHEET ---------- */
function openSettingsSheet() {
  const rt = `${pad2(state.settings.resetHour)}:${pad2(state.settings.resetMinute)}`;
  el("input-reset-time").value = rt;
  document.querySelectorAll(".swatch[data-color]").forEach((s) => {
    s.classList.toggle("selected", s.getAttribute("data-color").toLowerCase() === state.settings.accent.toLowerCase());
  });
  el("custom-color").value = state.settings.accent;
  setSeg("seg-tone", state.settings.tone);
  openSheet("settings-overlay");
}

el("input-reset-time").addEventListener("change", (e) => {
  const [h, m] = e.target.value.split(":").map(Number);
  state.settings.resetHour = h; state.settings.resetMinute = m;
  save(); render();
});

document.querySelectorAll(".swatch[data-color]").forEach((s) => {
  s.addEventListener("click", () => {
    state.settings.accent = s.getAttribute("data-color");
    save(); applyTheme(); render(); openSettingsSheet();
  });
});
el("custom-color").addEventListener("input", (e) => {
  state.settings.accent = e.target.value;
  save(); applyTheme(); render();
});

document.querySelectorAll("#seg-tone .seg-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    setSeg("seg-tone", btn.getAttribute("data-val"));
    state.settings.tone = btn.getAttribute("data-val");
    save(); applyTheme();
  });
});

el("btn-export").onclick = () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `checklist-backup-${getTrackingDateStr()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast("EXPORTED");
};
el("btn-import").onclick = () => el("file-import").click();
el("file-import").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed.tasks || !parsed.settings) throw new Error("bad file");
      state = parsed;
      save(); applyTheme(); render(); closeSheet("settings-overlay");
      toast("DATA IMPORTED");
    } catch (err) {
      toast("IMPORT FAILED — BAD FILE");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
});
el("btn-reset-all").onclick = () => {
  if (confirm("Wipe all tasks and history? This cannot be undone.")) {
    state = defaultState();
    save(); applyTheme(); render(); closeSheet("settings-overlay");
    toast("ALL DATA WIPED");
  }
};

/* ---------- SHEET PLUMBING ---------- */
function openSheet(id) { el(id).classList.add("open"); }
function closeSheet(id) { el(id).classList.remove("open"); }
[["task-overlay","btn-close-task"], ["settings-overlay","btn-close-settings"]].forEach(([overlay, btn]) => {
  el(overlay).addEventListener("click", (e) => { if (e.target.id === overlay) closeSheet(overlay); });
  el(btn).addEventListener("click", () => closeSheet(overlay));
});
el("action-overlay").addEventListener("click", (e) => { if (e.target.id === "action-overlay") closeSheet("action-overlay"); });

el("btn-add").addEventListener("click", () => openTaskSheet(null));
el("btn-settings").addEventListener("click", openSettingsSheet);

/* ---------- TOAST ---------- */
let toastTimer = null;
function toast(msg) {
  const t = el("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
}

/* ---------- SERVICE WORKER ---------- */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW registration failed", e));
  });
}

/* ---------- LIVE REFRESH ---------- */
let lastTrackingDate = getTrackingDateStr();
setInterval(() => {
  const now = getTrackingDateStr();
  if (now !== lastTrackingDate) { lastTrackingDate = now; render(); }
}, 30000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") render();
});

/* ---------- INIT ---------- */
applyTheme();
render();

})();
