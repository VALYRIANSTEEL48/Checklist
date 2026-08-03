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

**Dashboard** — two tiles, Checklist and Workouts, each showing a live
stat (main streak / this week's workout count). Tap a tile to enter that
module, tap the back arrow in its header to return.

**Checklist**
- Tap **+** to add a task. Choose **repeating** or **one-off**, and
  **any time** or **scheduled** — scheduled tasks get a time, optional
  duration, and (for one-off) a date from the calendar panel.
- Tap a task's checkbox to mark it done for the day. Tap the task name to
  edit, pause, or delete it.
- Drag the handle on the right of any **anytime** task to reorder it.
  Scheduled tasks always sort by time automatically.

**Workouts**
- **Today** tab: weekly target ring (tap to change the target), this
  week's calendar strip, Start New Workout, recent workouts, and monthly
  progress.
- Starting a workout: pick a template → pick a variant → log weight/reps
  per set (inputs commit when you tap away, not on every keystroke).
  Complete or discard from there; discarding with logged sets asks for
  confirmation.
- **History** tab: past workouts grouped by month; tap one for the full
  set-by-set breakdown.
- **Manage** tab: edit or delete templates, or build a new one from
  scratch (name, icon, one or more variants, each with its own exercise
  list).

**Settings** (gear icon, reachable from the dashboard or either module)
covers both apps in one place: checklist reset time, workout weekly
target, accent color, panel tone, and export/import/wipe — which now
back up and restore **both** datasets together in one JSON file.

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
