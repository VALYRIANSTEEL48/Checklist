# Checklist — Install Guide

This is a **Progressive Web App (PWA)**, not a Play Store app. That's the
realistic way to get a real homescreen icon, full-screen standalone window,
and offline operation without going through app-store review or a
sideloaded APK. Once installed, it looks and behaves like any other app on
your phone — icon in the app drawer, opens full-screen, works with no
signal. All data is stored only on your phone; nothing is sent anywhere.

As of this version, the app is a single **Command dashboard** with two
modules — **Checklist** and **Workouts** — each with its own data, plus one
shared Settings sheet.

## Step 1 — Put the files somewhere your phone can reach over HTTPS

Android requires HTTPS (not a local file) to install a PWA and to run the
offline service worker. The free, no-maintenance way to do this is
**GitHub Pages**:

1. Go to github.com and sign in (create a free account if needed).
2. Click **+ → New repository**. Name it `checklist` (any name works),
   keep it **Public**, click **Create repository**.
3. Click **Add file → Upload files**, then drag in every file from this
   package (`index.html`, `style.css`, `checklist.js`, `workout.js`,
   `shell.js`, `manifest.json`, `sw.js`, and the `icons` folder with its 3
   images). Commit the upload.
4. Go to **Settings → Pages** (left sidebar). Under "Build and
   deployment," set **Source: Deploy from a branch**, **Branch: main /
   (root)**. Save.
5. Wait about a minute, then reload that Settings → Pages screen — it will
   show your live URL, something like:
   `https://<your-username>.github.io/checklist/`

Any static host works the same way (Netlify, Cloudflare Pages, your own
server) — GitHub Pages is just the simplest to set up with no tools.

**If you already installed the earlier single-app version:** re-upload
over the same repo (this version deletes `app.js` in favor of
`checklist.js` + `workout.js` + `shell.js` — make sure the old `app.js` is
removed from the repo so it doesn't linger). Reopen the installed app once
after updating so it can fetch the new files; the service worker will pick
up the new cache automatically.

## Step 2 — Install it to your homescreen (Samsung / Android)

1. Open the URL from Step 1 in **Chrome** (or Samsung Internet) on your
   phone.
2. Tap the **⋮** menu (top right) → **Add to Home screen** → **Install**.
   Chrome may also show an automatic "Install app" banner — either works.
3. Confirm the name **Checklist** and tap **Add** / **Install**.

You'll now have a real icon on your homescreen or app drawer. Opening it
launches full-screen with no browser address bar, and it keeps working
offline after the first load.

## Using it

**A note on exercise/activity fields:** every exercise now starts from a
composable set of fields (Sets, Reps, Weight, RPE, Rest Between Sets,
Duration, Distance, Rounds, Work/Rest Interval) rather than a locked
"strength / cardio / interval / ruck" type — add or remove whichever
fields a given exercise actually needs (e.g. Sets + Distance for a
farmer carry, Sets + Duration for a plank). This applies in both the
freeform builder and program session editor.

**Dashboard** — four tiles (Checklist, Workouts, Assignments, Targets),
each showing a live stat. Tap a tile to enter that module, tap the back
arrow in its header to return.

**Checklist**
- Tap **+** to add a task. Choose **repeating** or **one-off**, and
  **any time** or **scheduled** — scheduled tasks get a time, optional
  duration, and (for one-off) a date from the calendar panel.
- Tap a task's checkbox to mark it done for the day. Tap the task name to
  edit, pause, or delete it.
- Drag the handle on the right of any **anytime** task to reorder it.
  Scheduled tasks always sort by time automatically.

**Workouts**
- **Today** tab: if no program is active, this is the freeform view — weekly
  target ring (tap to change it), this week's calendar strip, Start New
  Workout, recent workouts, monthly progress.
- If a **program is active**, the top card becomes your programmed session
  for today instead: week number, phase, session name, a preview of the
  exercises with this week's targets, and a Begin Session button. Rest days
  show a Recovery card. A small link lets you log a freeform workout
  instead any time.
- Starting a workout: pick a template → pick a variant → log per set
  (inputs commit when you tap away, not on every keystroke). Complete or
  discard from there; discarding with logged sets asks for confirmation.
- **History** tab: past workouts grouped by month; tap one for the full
  breakdown. Program-driven sessions are tagged.
- **Manage** tab: two sections — **Training Programs** (build/edit/
  activate/delete multi-week programs) and **Quick-Start Workouts** (the
  original freeform templates, untouched).

**Training Programs** — for real periodized plans (a 12-week block, RPE
that ramps weekly, exercises that change partway through, running/ruck/
interval days mixed in), not just quick ad-hoc sessions:
- A program is built from **phases** (e.g. "Weeks 1–4: Base," "Weeks 5–8:
  Peak"). Each phase has its own weekly schedule — tap a day to assign it
  a session template or mark it rest — and its own session templates.
- Each exercise/activity in a session template gets a **progression rule**:
  Fixed (same every week), Ramp (a start value + a step per week — you'll
  see a live preview of what every week resolves to as you set it), or
  Custom (hand-set a value for each week individually). This is what lets
  a 12-week program come from a handful of session templates instead of
  84 individually-written days.
- Four exercise/activity types are supported per item: **Strength**
  (sets/reps/RPE), **Cardio** (duration/distance/effort), **Interval**
  (rounds, work/rest seconds), and **Ruck** (distance/load/duration). You
  can mix types within one session.
- Moving into a new phase resets progression to that phase's own starting
  values — that's how "RPE ramps within a block, then exercises change for
  the next block" works without hand-editing every week.
- Only one program can be active at a time. Activating a new one doesn't
  delete the others — they stay listed as drafts you can reactivate later.
  Deleting a program keeps any workouts you already logged from it in your
  history; they just lose the link back to a program that no longer
  exists.
- **Programs are calendar-locked, not adherence-based** — if you skip
  Tuesday's session, Wednesday's is still Wednesday's, the plan doesn't
  reshuffle around missed days.
- Weight is always something you log, never something the program dictates
  — it prescribes reps and target RPE, and you pick the load that hits
  that RPE for those reps (autoregulation), same as most RPE-based
  programs work.

**Settings** (gear icon, reachable from the dashboard or either module)
covers both apps in one place: checklist reset time, workout weekly
target, accent color, panel tone, and export/import/wipe — which now
back up and restore **both** datasets together in one JSON file
(including all programs).

**Exercise library** — any exercise you name gets remembered automatically
(no separate save step). Start typing a name anywhere and matching past
exercises show up to tap instead of retyping — picking one carries over
its fields and last-used numbers, which you can still adjust.

**Assignments** — ongoing projects, not daily habits. No streaks, no
reset time; runs on its own clock entirely separate from Checklist and
Workouts.
- Three tabs: **Active**, **Planning**, **Completed**.
- Create one with a title, description/instructions, an optional due
  date, and a list of subtasks — add more subtasks any time, including
  mid-project.
- **Planning → Active**: tap Start once you're ready to begin; it just
  sits in Planning until then.
- **Active → Completed**: tap Mark Complete, write a short summary, and
  — if you left any subtasks unchecked — a note on why. That note stays
  attached to the assignment permanently.
- Overdue assignments (past due date, not completed) get the same red
  highlight as an overdue checklist task.
- A completed assignment can be reopened if you're not actually done.

**Targets** — habit elimination, tracked as the inverse of the checklist:
every day you *don't* log the habit is a day of progress, and logging it
resets the count. No reset time, no daily interaction required — it just
runs in the background off the calendar.
- **+ Add Target** offers four quick presets (Pornography, Weed, Smoking,
  Alcohol) or a custom one — name, a reason for wanting it gone, and a
  target day count (90 by default, adjustable any time via the stepper).
- The big streak readout and 30-day history strip reuse the same
  components as the checklist's main streak header — green for clean
  days, red for a relapse.
- **"Terminated" isn't a locked state** — it's simply what shows once
  your current unbroken streak reaches the target. There's no separate
  status to manage; it's computed live from your start date and relapse
  log, so a relapse after termination just flips it back to "in
  progress" automatically.
- **Log Relapse** opens a short form: the date it happened (editable, in
  case you're logging it a day late), what triggered it, what you'll do
  differently, optional notes, and a chance to adjust the target if it
  wasn't realistic. The streak recalculates immediately.
- The start date can only be edited before the first relapse is logged,
  so the streak math can't be retroactively thrown off once real history
  exists.
- Relapse history is kept per target, tap any entry to expand the full
  notes.


## A few things worth knowing

- **Backups matter.** This app has no cloud sync by design (it's yours
  only) — which means if you clear Chrome's site data or switch phones,
  the data is gone unless you've used **Export** in Settings first.
  Worth doing occasionally.
- **Deleting a task erases its history**, including any past misses tied
  to it. That's a deliberate simplicity trade-off, not a bug — just be
  aware a delete can quietly "clean up" a broken streak.
- **Pausing also removes a task from streak accounting entirely**, past
  and future, while paused — so pausing something you missed will undo
  that day's damage to your main streak. Again, intentional, but good to
  know so it doesn't feel like a loophole you stumbled into.
