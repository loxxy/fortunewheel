# Fortune Wheel

Browser-based fortune wheel for employee lucky draws. Any slug (sales, ops, tech, etc.) becomes its own game with a rotating roster, scheduled or one-off spins, and a recent-winners feed that stays in sync across devices.

## Highlights

- **Always-on wheel** – SVG wheel idles smoothly, ticks every employee transition, and spins automatically at scheduled draws.
- **Timed celebrations** – Winners trigger a confetti/chime overlay before their names move into the recent list.
- **Multi-game support** – Every slug (e.g. `/aas`, `/office`) has its own roster, schedule, and history in SQLite.
- **Admin console** – `/admin` offers a password-gated UI to create games, pick repeat vs. once-off spins, and bulk-manage employees via comma-separated lists.
- **Snapshot winners** – Names are stored with the draw, so removing employees never retroactively “breaks” history.

## Stack

- Vite + React + Hooks for the kiosk UI
- Express + better-sqlite3 for backend/API/scheduling
- `node-cron` + `cron-parser` for repeat schedules
- Canvas confetti + Web Audio for celebratory effects

## Quick Start

```bash
npm install          # installs root + client deps
cp .env.example .env # optional: tweak defaults
npm run dev          # runs Express (4000) + Vite (5173)
```

Routes:

- `http://localhost:5173/admin` – sign in with the password in `.env` and create a game by entering a slug (letters/numbers), picking a schedule (repeat every week/day/hour/minute or a single date/time), then pasting employee names.
- `http://localhost:5173/<slug>` – wheel UI for that game slug. Leave it open anywhere; it counts down and spins on schedule.

> Until a game exists, the client shows “No game selected.” Create at least one slug in the admin panel first.

## Configuration

All settings live in `.env` (sample in `.env.example`):

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `4000` | Express API |
| `DRAW_CRON` | `0 0 13 * * FRI` | Default repeat cron for new games (13:00 Friday). One-time draws store their own timestamp. |
| `DRAW_TIMEZONE` | `America/Toronto` | Timezone used for cron + countdowns |
| `WINNER_HISTORY_LIMIT` | `40` | Per-game winners kept in SQLite |
| `REPEAT_COOLDOWN` | `3` | Recent winners excluded from the random pool |
| `ADMIN_PASSWORD` | `password` | Password for `/admin` + `Authorization: Bearer` |
| `VITE_API_URL` | _(unset)_ | Set when hosting the client separately to point at the API origin |

Frontend builds read `.env` variables prefixed with `VITE_`. Everything else configures the server.

## Data & Persistence

SQLite lives at `server/data/wheel.db` (plus WAL/SHM files). Tables:

- `games` – slug, cron, timezone, schedule metadata (repeat vs. once).
- `employees` – per-game roster.
- `winners` – past draws with the winner’s name/avatar snapshot.

All admin actions write through the API, so no manual file edits are required. Roster replacements never delete winner history.

## Building & Deploying

1. **Build the client:** `npm run client:build` → `client/dist`.
2. **Deploy the server:** any Node host that allows writing to `server/data`. Mount `client/dist` as static assets or host separately (set `VITE_API_URL`).
3. **Environment:** copy `.env.example`, set `ADMIN_PASSWORD`, and (optionally) override cron/timezone defaults.
4. **Database:** keep `server/data/wheel.db*` writable. WAL files (`.wal`, `.shm`) are created automatically.

## Testing & Verification

- `npm run client:build` – verifies the React bundle compiles (already run during this update).
- Manual sanity check: `npm run dev`, open `/admin`, create a slug, add a few names, and confirm `/slug` shows the wheel + countdown.

## Before Pushing to GitHub

- Ensure `.env` contains the password you want (or omit it from commits).
- Confirm `server/data/wheel.db*` are ignored (already handled in `.gitignore`).
- Run `npm run client:build` (done) so you know the UI compiles cleanly.
- Optionally delete any local-only CSVs (e.g. `server/data/employees.csv`) if you no longer need them; the app now uses SQLite exclusively.

Happy spinning!
