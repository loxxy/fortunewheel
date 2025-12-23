# Fortune Wheel

![Fortune Wheel preview](assets/wheel-preview.png)

Browser-based fortune wheel for participant lucky draws. Any slug (sales, ops, tech, etc.) becomes its own game with a rotating roster, scheduled or one-off spins, and a recent-winners feed that stays in sync across devices.

## Highlights

- **Always-on wheel** – SVG wheel idles smoothly, ticks every participant transition, and spins automatically at scheduled draws.
- **Timed celebrations** – Winners trigger a confetti/chime overlay before their names move into the recent list.
- **Multi-game support** – Every slug (e.g. `/team-alpha`, `/office`) has its own roster, schedule, and history in SQLite.
- **Admin console** – `/admin` offers a super-admin UI to create games, configure schedules, set gift rotations, and bulk-manage participants.
- **Game-level admin** – `/<slug>/admin` lets a per-game admin manage only that game, using a game-specific password.
- **Snapshot winners** – Names are stored with the draw, so removing participants never retroactively “breaks” history.
- **Kiosk mode** – `/<slug>/kiosk` hides the roster button and shows a QR code pointing to the non-kiosk URL.

## Stack

- Vite + React + Hooks for the kiosk UI
- Express + better-sqlite3 for backend/API/scheduling
- `node-cron` + `cron-parser` for repeat schedules
- Canvas confetti + Web Audio for celebratory effects

## How it Works

1. Visit `/admin`, enter the super-admin password from `.env`, and create a game by picking a slug (e.g. `sales`, `ops`, `tech`).
2. Choose a schedule: repeat every minute/hour/day/week, or run once on a specific date/time.
3. Add comma-separated participant names; duplicates are blocked and the roster updates immediately.
4. Optionally set a game admin password and share `/<slug>/admin` for that game only.
5. Display `/<slug>` anywhere (TV, browser tab, etc.). For kiosk displays, use `/<slug>/kiosk`.

The backend stores all rosters, schedules, and winners in SQLite and exposes `/api/:slug/...` endpoints for the client. Winners include the name snapshot taken at draw time, so removing participants later never breaks history.

## Production Run

```bash
npm install                   # root/server deps (run once)
npm install --prefix client   # frontend deps (run once)
npm run client:build          # emits client/dist
npm run server                # serves API + built UI on PORT (default 4000)
```

Set any overrides in `.env` (e.g., `PORT`, `ADMIN_PASSWORD`, `VITE_CLIENT_PORT`) before starting the server. Once running, visit `/admin` to configure games and `/<slug>` to display a wheel.

## Admin Features

- **Configuration**: schedule builder (repeat/once), allow repeat winners, and gift rotation list (comma separated).
- **Manage Participants**: bulk add names, roster list with active/inactive status, and delete entries.
- **Manage Winners**: edit gift per winner, save changes in bulk, export winners as CSV, and reset winners (reactivates participants).
- **Recent winners**: the UI shows the most recent 100 winners with gift names.

## Routes

- `/admin` – super admin dashboard (all games).
- `/<slug>` – game view.
- `/<slug>/kiosk` – kiosk view with QR code to `/<slug>`.
- `/<slug>/admin` – game admin dashboard (single game).
