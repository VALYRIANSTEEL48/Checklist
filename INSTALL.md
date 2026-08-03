# Checklist — Install Guide

This is a **Progressive Web App (PWA)**, not a Play Store app. That's the
realistic way to get a real homescreen icon, full-screen standalone window,
and offline operation without going through app-store review or a
sideloaded APK. Once installed, it looks and behaves like any other app on
your phone — icon in the app drawer, opens full-screen, works with no
signal. All data (tasks, streaks, settings) is stored only on your phone;
nothing is sent anywhere.

## Step 1 — Put the files somewhere your phone can reach over HTTPS

Android requires HTTPS (not a local file) to install a PWA and to run the
offline service worker. The free, no-maintenance way to do this is
**GitHub Pages**:

1. Go to github.com and sign in (create a free account if needed).
2. Click **+ → New repository**. Name it `checklist` (any name works),
   keep it **Public**, click **Create repository**.
3. Click **Add file → Upload files**, then drag in all 8 files from this
   package (`index.html`, `style.css`, `app.js`, `manifest.json`, `sw.js`,
   and the `icons` folder with its 3 images). Commit the upload.
4. Go to **Settings → Pages** (left sidebar). Under "Build and
   deployment," set **Source: Deploy from a branch**, **Branch: main /
   (root)**. Save.
5. Wait about a minute, then reload that Settings → Pages screen — it will
   show your live URL, something like:
   `https://<your-username>.github.io/checklist/`

Any static host works the same way (Netlify, Cloudflare Pages, your own
server) — GitHub Pages is just the simplest to set up with no tools.

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

- Tap **+** to add a task. Choose **repeating** or **one-off**, and
  **any time** or **scheduled** — scheduled tasks get a time, optional
  duration, and (for one-off) a date from the calendar panel.
- Tap a task's checkbox to mark it done for the day. Tap the task name to
  edit, pause, or delete it.
- Drag the handle on the right of any **anytime** task to reorder it.
  Scheduled tasks always sort by time automatically.
- Open **Settings** (gear icon) to change the daily reset time, accent
  color, and panel tone, or to export/import a JSON backup.

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
