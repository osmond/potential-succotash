# Plant Tracker (Local-First PWA)

Nerdy and beautiful plant tracker that works on phone and laptop.

- Local-first: data saved in your browser (IndexedDB)
- Installable PWA: add to home screen / dock
- Offline support via Service Worker
- Basic features now; room to grow nerdy insights later

## Quick Start

Open `index.html` in a modern browser. No build step required.

## Current Features

- Add/edit plants with species, light level, pot size, and base watering interval
- See upcoming waterings on the dashboard (dynamic interval based on light + pot)
- Mark plants as watered; auto-updates next due date
- Import/Export data as JSON
- Offline-capable PWA

### Nerdy Additions

- Taxonomy fields: family, genus, species, cultivar
- Tasks + reminders: fertilize/repot intervals, .ics export for calendars
- Watering history per plant with a simple intervals chart (Details)
- Link-based local sync: copy a generated `#sync=` URL to another device to merge

### New: Photos, Science Panel, Task actions

- Observations with photos: attach images to plants; timeline in Details
- Science panel: set season, temp, RH; schedule adapts via VPD/season factors
- Per-task actions: mark fertilize/repot/prune/inspect/mist as done

### New: Soil/Location, Weather, and Taxonomy Assist

- Soil & location fields per plant (soil type, exposure, indoor/outdoor, room)
- Modeling adjusts intervals for soil/exposure and global season/VPD
- Local weather button pulls Temp/RH from Open‑Meteo (geolocation)
- Taxonomy suggestions via GBIF and optional OpenAI proxy with disambiguation chips

## Roadmap Ideas

- Photos and observation logs (growth, pests, bloom)
- Fertilizer and repot schedules
- Seasonal adjustments, GDD-style metrics, VPD hints
- Charts for moisture and watering intervals
- Tagging and collections (e.g., succulents, aroids)

## Reminders (.ics)

- Click Reminders to download a calendar file with upcoming watering and tasks.
- Import it into your calendar app to get system notifications.

## Sync Between Devices

- Click Share to copy a URL containing your data in the URL hash.
- Open that URL on another device to import and merge locally.
- This keeps things local-first; no server is required.
  - Note: Large photo-heavy datasets may produce very long share URLs. Prefer JSON export for those.

## OpenAI Taxonomy Proxy (Optional)

Client apps shouldn’t embed your API key. Deploy a tiny proxy and set `window.OPENAI_PROXY_URL` to its URL.

Vercel (Node): `serverless/vercel/api/suggest.js`

- Set env var `OPENAI_API_KEY`
- Deploy, then set in your app (e.g., add a small inline script):
  `window.OPENAI_PROXY_URL = 'https://<your-vercel-app>.vercel.app/api/suggest'`
  or put it in `config.js`.

Cloudflare Workers: `serverless/cloudflare-worker/openai-proxy.js`

- Bind env var `OPENAI_API_KEY`
- Publish, then set `window.OPENAI_PROXY_URL` to your worker URL

The proxy expects POST `{ q: "plant name" }` and returns an array like:
`[{ family: "Araceae", genus: "Monstera", species: "deliciosa", cultivar: "" }]`

Never embed your OpenAI API key in the frontend. Use the serverless proxy and environment variables.

## Deploy with GitHub + Vercel (Single Project)

1) Push this repo to GitHub
- Create a new repo, then push your local project.

2) Import into Vercel
- Vercel → New Project → Import your repo
- Framework preset: None
- Build Command: leave empty (static site)
- Output Directory: leave empty (serve root)
- The `api/suggest.js` function will deploy automatically under `/api/suggest`.

3) Add secret in Vercel
- In your project settings → Environment Variables:
  - Key: `OPENAI_API_KEY`
  - Value: your key (do not commit it)

4) Point the app to your proxy
- Open `config.js` and set:
  `window.OPENAI_PROXY_URL = 'https://<your-vercel-domain>.vercel.app/api/suggest'`
- Commit and push; Vercel will redeploy.

That’s it — static app + serverless API in one project, with safe secrets handling.

## Weather

- Use the Science Panel’s “Use Local Weather” to fetch Temp/RH via Open‑Meteo.
- Season + VPD factor affects modeled intervals; exposure/soil adjusts micro‑environment.

## Tailwind Setup

- Integrated Tailwind via CDN for zero-build usage.
- See `index.html` head: a minimal `tailwind.config` mirrors the app palette.
- Existing CSS remains; you can gradually migrate components to utilities.

Usage examples:
- Add Tailwind utilities alongside current classes, e.g. `class="btn px-3 py-2 rounded-xl"`.
- Layout tweaks: `class="grid grid-cols-1 md:grid-cols-2 gap-3"` on lists or panels.

Production note:
- For full tree-shaking, you can switch to a build step later (Tailwind CLI/PostCSS). For now, the CDN keeps things simple and works with the service worker cache.
## Deploy on Vercel (Build Output API)

This repo serves static files from the repo root. We use Tailwind CLI and Vercel’s Build Output API to deploy cleanly.

Checklist:

- GitHub: push this repo as-is (index.html at repo root)
- Vercel → New Project → Import repo
- Project Settings → Build & Output:
  - Framework Preset: Other
  - Root Directory: /
  - Install Command: npm install
  - Build Command: npm run build
  - Output Directory: leave blank (root)
- Environment → Add `OPENAI_API_KEY`
- Deploy

What the build does:

- Runs Tailwind CLI to generate `tailwind.css`
- Emits `.vercel/output/static` with: `index.html`, `health.html`, `styles.css`, `tailwind.css`, `app.js`, `db.js`, `sw.js`, `manifest.webmanifest`, `config.js`
- Emits functions at `.vercel/output/functions/api/{suggest,plan}.func`

Verify after deploy:

- Open `/health.html` → should show checks for Tailwind and both API endpoints
- Open the homepage → should render Tasks and Plants; try Add Demo
- If you still see “public” output errors, ensure Framework=Other and Output Directory is blank; also make sure `.vercel/output` is present in the Build log
