# Planner

A calm, mobile-first daily planner built for *sticking with it*, not for features.
One main thing a day, a routine of 3–5 small habits, and plenty of open time.

Plain HTML, CSS and JavaScript. No build step, no framework, no account.
Data stays on your phone (IndexedDB) and the app works offline once installed.

---

## Run it locally

You need any static file server. Python is already on your Mac:

```bash
cd ~/Documents/planner-app
python3 -m http.server 8080
```

Open <http://localhost:8080>. Opening `index.html` directly as a file won't work,
because ES modules and service workers need a real server.

**Developing:** on `localhost` the service worker fetches from the network first,
so a normal reload shows your edits. If something looks stale, hard-reload (⇧⌘R).

**Trying it on your iPhone before deploying:** with the server running, open
`http://<your-mac's-LAN-IP>:8080` in Safari on the same Wi-Fi (find the IP in
System Settings → Wi-Fi → Details). It works, but offline mode won't, because
service workers need HTTPS. Deploy (below) for the real install.

---

## Deploy it free

The app is static files, so any static host works. Both options below give you HTTPS,
which iPhone home-screen install and offline mode need.

### Option A: GitHub Pages

1. Create an empty repo on GitHub (e.g. `planner`), then push:
   ```bash
   git add -A
   git commit -m "Planner phase 1"
   git remote add origin https://github.com/<you>/planner.git
   git push -u origin main
   ```
2. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
   choose `main` and `/ (root)`, then Save.
3. After a minute it's live at `https://<you>.github.io/planner/`.
   All paths in the app are relative, so the `/planner/` sub-path just works.

### Option B: Netlify

- **Quickest:** go to <https://app.netlify.com/drop> and drag the `planner-app` folder in.
- **Auto-deploy on push:** in Netlify, choose **Add new site → Import an existing project**,
  pick your GitHub repo, leave **Build command** empty, set **Publish directory** to `.`.

Netlify is also where Phase 2's serverless function (the Claude API proxy) will live,
so pick it now if you want fewer moves later.

### Shipping updates

Phones cache the app for offline use. When you deploy changes, **bump `VERSION` in
`sw.js`** (e.g. `'v1'` → `'v2'`). Installed copies download the new version in the
background and use it on the next launch. If you add a new file, add it to `ASSETS`
in `sw.js` too.

---

## Add it to your iPhone home screen

1. Open your deployed URL in **Safari** (it must be Safari).
2. Tap the **Share** button, then **Add to Home Screen**, then **Add**.
3. Launch it from the home screen icon. It opens full-screen like an app and works offline.

Things to know:

- **The installed app has its own storage**, separate from Safari tabs. Set it up
  from the home-screen icon, not in Safari.
- **Back up now and then:** Settings → *Export all data (JSON)*, then save to Files/iCloud.
  Deleting the home-screen icon deletes its data. *Import from backup* restores it.
- **Calendar export:** *Add to my calendar (.ics)* on the Today screen. In the installed
  app this opens the share sheet. If Calendar isn't offered, choose *Save to Files*,
  then open the file from Files to add the events. Each event has a reminder 5 minutes
  before it starts.

---

## How it works

### File structure

```
index.html              App shell + bottom tab bar
manifest.webmanifest    Install info (name, icons, standalone)
sw.js                   Offline cache
css/styles.css          All styles; light/dark via CSS variables
icons/                  App icons
js/
  app.js                Startup, hash router, daily rollover trigger
  db.js                 IndexedDB wrapper + JSON export/import
  store.js              Defaults and data helpers (settings, routine, days, tasks)
  time.js               Time/date math
  windows.js            Works out a day's personal windows from settings
  scheduler.js          Rule-based planner (pure function)
  rollover.js           Anti-guilt rules + "never miss twice"
  ics.js                Calendar file builder
  ui.js                 Small DOM helpers (h(), chips, sheet, toast, file save)
  views/                One file per screen, plus shared pieces
```

### Data model (IndexedDB database `planner`)

| Store | Key | What's in it |
|---|---|---|
| `settings` | `"main"` | wake/bed times, work days & hours, lunch time, lunch-free days, commute, energy per window (1–3), `onboardedDate`, `lastOpened` |
| `routine` | `id` | `{ trigger, action, minutes, anchor, variant: weekday \| weekend, order }` |
| `tasks` | `id` | `{ title, minutes, kind: main \| small, status, plannedDate, rolloverCount, window, history[] }` |
| `days` | `"YYYY-MM-DD"` | `{ blocks[], lunchFree, confirmed, routineDone[], results{}, checkedIn }` |

Task status: `pending` → `done`, or rolls over → `decide` (keep/drop) → `dropped`.

### Key decisions

- **The scheduler is a pure function.** `buildPlan()` takes settings, routine, tasks and the
  date, and returns blocks + reasons + overflow. No storage, no UI. That makes it easy
  to test, and Phase 2's AI planner can return the same shape.
- **Windows are filled head / body / tail.** Routine items "after I wake up" and the
  30-minute after-work decompression pin to the start of a window. Bedtime and
  "before I leave" items pin to the end. Tasks pack after the head. Buffers (10 min) and
  breaks (15 min after blocks of 50+ min) are inserted automatically.
- **The 70% cap applies twice:** to the whole day *and* to each window. That way a
  morning never gets packed wall-to-wall with no time to get ready.
- **Main task placement order:** whole task in your highest-energy window → split across
  the two best windows → a lower-energy window → "doesn't fit", with Move / Shorten /
  Drop options. It's never squeezed in.
- **Focus block length:** 90 minutes max on workdays and 150 on days off. Longer tasks are
  chunked with breaks.
- **Anti-guilt rules run once per day on open** (`rollover.js`). Unfinished tasks roll
  once, then ask keep-or-drop. After 3+ days away, old tasks are quietly dropped. There
  is no overdue list anywhere, and no streak counter. The 7-dot "never miss twice"
  indicator only speaks up after a missed day.
- **No HTML injection:** all UI is built with `createElement`/`textContent`, so anything
  you type is shown as text.

---

## Phase 2 hooks (not built yet)

- **AI planning:** add a Netlify/Vercel function that receives
  `{ settings, routine, tasks, recent days }` and returns the same structure as
  `buildPlan()`. In `views/plan.js`, `propose()` would call it, falling back to
  `buildPlan()` when offline. The API key stays in the function's environment variables.
- **Planned vs. completed by window:** every task's `history` entry already records
  `{ date, result, reason, window }`, and each block has a `window`.
- **Weekly review:** reads the same `history` + `days[].results`.
- **Sunday planning:** tasks already have a `plannedDate` separate from `createdDate`,
  and future-dated tasks are left alone by the rollover rules until their day comes.
  New stores can be added with a version bump in `db.js` (migrations run by version).
