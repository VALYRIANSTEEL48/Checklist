/* =========================================================
   CALENDAR — calendar.js
   The CALENDAR tab of the Checklist page (the LIST / CALENDAR tab strip,
   the sliding two-pane pager, and the calendar itself).

   Nothing is stored here: every event is a scheduled Checklist task
   (timing "scheduled" with a time + optional duration — repeating ones on
   each due day, one-offs on their date), read through
   window.ChecklistData.eventsForDate(). Editing is the normal task sheet;
   completing is deliberately NOT possible from this tab (list tab only).

   Views: DAY and WEEK (hour grid, overlapping events share columns, a live
   "now" line), and MONTH (day cells with event chips). Tapping a day in
   WEEK/MONTH drills into DAY. ‹ › step by a day / week / month; TODAY jumps
   back. Only view mode + cursor date live in memory.
   ========================================================= */

(function () {
"use strict";

const MONTHS = ["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];
const MON3 = MONTHS.map((m) => m.slice(0, 3));
const DOW3 = ["SUN","MON","TUE","WED","THU","FRI","SAT"];
const HOUR_H = 48;          // px per hour in the day/week grids
const MIN_EVENT_MIN = 30;   // events without a duration (or shorter) draw at least this tall
const SWIPE_MIN_PX = 60;

const el = (id) => document.getElementById(id);

/* ---------- date helpers (kept local, same convention as other modules) ---------- */
function pad2(n) { return String(n).padStart(2, "0"); }
function dateToStr(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function strToDate(ds) { return new Date(ds + "T12:00:00"); }
function addDays(ds, n) { const d = strToDate(ds); d.setDate(d.getDate() + n); return dateToStr(d); }
function startOfWeek(ds) { return addDays(ds, -strToDate(ds).getDay()); }
function escapeHTML(s) { const d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; }
function toMin(hhmm) { const [h, m] = (hhmm || "00:00").split(":").map(Number); return h * 60 + (m || 0); }
function fmtTime(hhmm) {
  const [h, m] = (hhmm || "00:00").split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${pad2(m)}${ap}` : `${h12}${ap}`;
}
function fmtMin(totalMin) { return fmtTime(`${pad2(Math.floor(totalMin / 60) % 24)}:${pad2(totalMin % 60)}`); }
function hourLabel(h) { return h === 0 ? "12A" : h < 12 ? h + "A" : h === 12 ? "12P" : (h - 12) + "P"; }

const data = () => window.ChecklistData;
const today = () => (data() ? data().todayStr() : dateToStr(new Date()));

/* ---------- STATE ---------- */
let tab = "list";            // "list" | "calendar"
let mode = "day";            // "day" | "week" | "month"
let cursor = today();        // the date being looked at (selected day in week/month too)
let didInitialScroll = false;

/* ---------- EVENT LAYOUT ---------- */
function eventsOn(ds) {
  const list = data() ? data().eventsForDate(ds) : [];
  return list.map((e) => {
    const start = toMin(e.time);
    const dur = Math.max(e.duration || 0, MIN_EVENT_MIN);
    return Object.assign({}, e, { start, end: Math.min(start + dur, 24 * 60) });
  }).sort((a, b) => a.start - b.start || a.end - b.end);
}

// Greedy column packing: overlapping events within a cluster each get a
// column index and share the cluster's width equally.
function layoutColumns(events) {
  const out = [];
  let cluster = [], clusterEnd = -1;
  const flush = () => {
    const cols = [];
    cluster.forEach((e) => {
      let c = cols.findIndex((end) => end <= e.start);
      if (c === -1) { c = cols.length; cols.push(e.end); } else cols[c] = e.end;
      e._col = c;
    });
    cluster.forEach((e) => out.push({ e, col: e._col, cols: cols.length }));
    cluster = []; clusterEnd = -1;
  };
  events.forEach((e) => {
    if (cluster.length && e.start >= clusterEnd) flush();
    cluster.push(e);
    clusterEnd = Math.max(clusterEnd, e.end);
  });
  if (cluster.length) flush();
  return out;
}

/* ---------- RENDER ---------- */
function titleText() {
  const d = strToDate(cursor);
  if (mode === "month") return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  if (mode === "week") {
    const a = strToDate(startOfWeek(cursor)), b = strToDate(addDays(startOfWeek(cursor), 6));
    const left = `${MON3[a.getMonth()]} ${a.getDate()}`;
    const right = a.getMonth() === b.getMonth() ? `${b.getDate()}` : `${MON3[b.getMonth()]} ${b.getDate()}`;
    return `${left} – ${right}, ${b.getFullYear()}`;
  }
  return `${DOW3[d.getDay()]} ${MON3[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function eventBlockHTML(item) {
  const { e, col, cols } = item;
  const top = (e.start / 60) * HOUR_H;
  const height = Math.max(((e.end - e.start) / 60) * HOUR_H - 2, 16);
  const width = 100 / cols;
  const roomy = height >= 34 && cols <= 2;
  return `<button class="cp-event${e.done ? " done" : ""}${e.repeating ? " rep" : ""}" data-cal-event="${e.id}" style="top:${top}px;height:${height}px;left:calc(${col * width}% + 1px);width:calc(${width}% - 3px);">
    <span class="cp-ev-name">${escapeHTML(e.name)}</span>${roomy ? `<span class="cp-ev-time">${fmtMin(e.start)} – ${fmtMin(e.end)}</span>` : ""}
  </button>`;
}

function hourLinesHTML() {
  let h = "";
  for (let i = 0; i < 24; i++) h += `<div class="cp-hour-line" style="top:${i * HOUR_H}px"></div>`;
  return h;
}
function gutterHTML() {
  let h = "";
  for (let i = 0; i < 24; i++) h += `<div class="cp-hour-label" style="top:${i * HOUR_H}px">${i === 0 ? "" : hourLabel(i)}</div>`;
  return h;
}
function nowLineHTML() {
  const now = new Date();
  const top = ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_H;
  return `<div class="cp-now" style="top:${top}px"></div>`;
}

function dayViewHTML() {
  const items = layoutColumns(eventsOn(cursor));
  const isToday = cursor === today();
  return `<div class="cp-grid" style="height:${24 * HOUR_H}px">
    <div class="cp-gutter">${gutterHTML()}</div>
    <div class="cp-cols"><div class="cp-col" data-cal-col="${cursor}">${hourLinesHTML()}${items.map(eventBlockHTML).join("")}${isToday ? nowLineHTML() : ""}</div></div>
  </div>${items.length ? "" : `<p class="cp-empty-note">NOTHING SCHEDULED</p>`}`;
}

function weekViewHTML() {
  const start = startOfWeek(cursor);
  const t = today();
  let heads = "", cols = "";
  for (let i = 0; i < 7; i++) {
    const ds = addDays(start, i);
    const d = strToDate(ds);
    const cls = (ds === t ? " today" : "") + (ds === cursor ? " selected" : "");
    heads += `<button class="cp-wk-head${cls}" data-cal-day="${ds}"><span>${DOW3[d.getDay()]}</span><b>${d.getDate()}</b></button>`;
    const items = layoutColumns(eventsOn(ds));
    cols += `<div class="cp-col${ds === t ? " today" : ""}" data-cal-col="${ds}">${hourLinesHTML()}${items.map(eventBlockHTML).join("")}${ds === t ? nowLineHTML() : ""}</div>`;
  }
  return `<div class="cp-wk-heads"><div class="cp-gutter-spacer"></div>${heads}</div>
    <div class="cp-grid cp-week" style="height:${24 * HOUR_H}px">
      <div class="cp-gutter">${gutterHTML()}</div>
      <div class="cp-cols cp-cols-7">${cols}</div>
    </div>`;
}

function monthViewHTML() {
  const c = strToDate(cursor);
  const y = c.getFullYear(), m = c.getMonth();
  const first = new Date(y, m, 1);
  const gridStart = dateToStr(new Date(y, m, 1 - first.getDay()));
  const t = today();
  let cells = "";
  for (let i = 0; i < 42; i++) {
    const ds = addDays(gridStart, i);
    const d = strToDate(ds);
    const evs = eventsOn(ds);
    const cls = [d.getMonth() !== m ? "other" : "", ds === t ? "today" : "", ds === cursor ? "selected" : ""].filter(Boolean).join(" ");
    const chips = evs.slice(0, 3).map((e) => `<span class="cp-chip${e.done ? " done" : ""}">${escapeHTML(e.name)}</span>`).join("");
    const more = evs.length > 3 ? `<span class="cp-more">+${evs.length - 3}</span>` : "";
    cells += `<button class="cp-mcell ${cls}" data-cal-day="${ds}"><b>${d.getDate()}</b>${chips}${more}</button>`;
  }
  return `<div class="cp-mweekdays">${DOW3.map((d) => `<span>${d[0]}</span>`).join("")}</div><div class="cp-mgrid">${cells}</div>`;
}

function render() {
  const pane = el("calendar-pane");
  if (!pane) return;
  const prevBody = el("cp-body");
  const prevScroll = prevBody ? prevBody.scrollTop : 0;
  const view = mode === "month" ? monthViewHTML() : mode === "week" ? weekViewHTML() : dayViewHTML();
  pane.innerHTML = `<div class="cp-toolbar">
      <div class="cp-nav">
        <button class="icon-btn small" id="cp-prev" aria-label="Previous">‹</button>
        <button class="cp-today-btn" id="cp-today">TODAY</button>
        <button class="icon-btn small" id="cp-next" aria-label="Next">›</button>
        <div class="cp-title" id="cp-title">${titleText()}</div>
      </div>
      <div class="segmented cp-modes" id="cp-modes">
        ${["day", "week", "month"].map((m) => `<button class="seg-btn${mode === m ? " active" : ""}" data-cal-mode="${m}">${m.toUpperCase()}</button>`).join("")}
      </div>
    </div>
    <div class="cp-body" id="cp-body">${view}</div>`;
  attach();
  const body = el("cp-body");
  if (prevBody) body.scrollTop = prevScroll;
  else if (mode !== "month") scrollToSensibleHour(body);
}

// First open of a grid view: land on the current hour (today) or the first
// event of the day, else 7am — instead of the dead-of-night midnight top.
function scrollToSensibleHour(body) {
  let startMin = 7 * 60;
  if (mode === "day") {
    const evs = eventsOn(cursor);
    if (cursor === today()) { const n = new Date(); startMin = n.getHours() * 60 + n.getMinutes() - 60; }
    else if (evs.length) startMin = evs[0].start - 30;
  } else {
    const n = new Date(); startMin = Math.min(n.getHours() * 60 - 60, 12 * 60);
  }
  body.scrollTop = Math.max(0, (startMin / 60) * HOUR_H);
}

function attach() {
  el("cp-prev").onclick = () => step(-1);
  el("cp-next").onclick = () => step(1);
  el("cp-today").onclick = () => { cursor = today(); render(); };
  document.querySelectorAll("[data-cal-mode]").forEach((b) => b.onclick = () => {
    mode = b.getAttribute("data-cal-mode");
    render();
    scrollToSensibleHour(el("cp-body"));
  });
  document.querySelectorAll("[data-cal-day]").forEach((b) => b.onclick = () => {
    cursor = b.getAttribute("data-cal-day");
    // Month cell / week header drills into that day; in week view the
    // selected-day highlight is enough only if we're already looking at DAY.
    mode = "day";
    render();
    scrollToSensibleHour(el("cp-body"));
  });
  document.querySelectorAll("[data-cal-event]").forEach((b) => b.onclick = (ev) => {
    ev.stopPropagation();
    if (data()) data().openTask(b.getAttribute("data-cal-event"));
  });
}

function step(dir) {
  if (mode === "day") cursor = addDays(cursor, dir);
  else if (mode === "week") cursor = addDays(cursor, 7 * dir);
  else {
    const d = strToDate(cursor);
    const target = new Date(d.getFullYear(), d.getMonth() + dir, 1);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    cursor = dateToStr(new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), lastDay)));
  }
  render();
}

/* ---------- TABS + SWIPE ---------- */
function setTab(next) {
  tab = next === "calendar" ? "calendar" : "list";
  const track = el("cl-track");
  if (track) track.style.transform = tab === "calendar" ? "translateX(-50%)" : "translateX(0)";
  const listPane = el("checklist-main"), calPane = el("calendar-pane");
  if (listPane) { listPane.classList.toggle("inactive", tab !== "list"); listPane.setAttribute("aria-hidden", tab !== "list" ? "true" : "false"); }
  if (calPane) { calPane.classList.toggle("inactive", tab !== "calendar"); calPane.setAttribute("aria-hidden", tab !== "calendar" ? "true" : "false"); }
  document.querySelectorAll("#cl-tabs .seg-btn").forEach((b) => {
    const on = b.getAttribute("data-tab") === tab;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
  const input = el("input-quick-task");
  if (input) input.placeholder = tab === "calendar" ? "New scheduled task" : "New task";
  if (tab === "calendar") {
    cursor = cursor || today();
    render();
    if (!didInitialScroll && mode !== "month") { didInitialScroll = true; scrollToSensibleHour(el("cp-body")); }
  }
}

document.querySelectorAll("#cl-tabs .seg-btn").forEach((b) => b.addEventListener("click", () => setTab(b.getAttribute("data-tab"))));

(function wireSwipe() {
  const pager = el("cl-pager");
  if (!pager) return;
  let sx = 0, sy = 0, tracking = false;
  pager.addEventListener("touchstart", (e) => {
    const t = e.touches && e.touches[0];
    // A long-press reorder drag on a task row owns the gesture — never swipe-switch tabs from it.
    tracking = !!t && !(e.target.closest && e.target.closest("[data-drag]"));
    if (t) { sx = t.clientX; sy = t.clientY; }
  }, { passive: true });
  pager.addEventListener("touchend", (e) => {
    if (!tracking) return;
    tracking = false;
    const t = e.changedTouches && e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0 && tab === "list") setTab("calendar");
    else if (dx > 0 && tab === "calendar") setTab("list");
  }, { passive: true });
})();

/* ---------- PUBLIC INTERFACE ---------- */
window.CalendarPane = {
  refresh: () => { if (tab === "calendar" || !el("cp-body")) render(); },
  isActive: () => tab === "calendar",
  setTab,
  // Defaults for a task made from the quick-add bar while on this tab:
  // the day being viewed, at the next whole hour if that's today.
  quickAddDefaults: () => {
    const t = today();
    let time = "09:00";
    if (cursor === t) { const h = Math.min(new Date().getHours() + 1, 23); time = `${pad2(h)}:00`; }
    return { date: cursor, time };
  },
  getView: () => ({ tab, mode, cursor }),
  setView: (m, ds) => { if (m) mode = m; if (ds) cursor = ds; render(); }
};

render();
setTab("list");

})();
