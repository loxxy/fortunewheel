# Fortune Wheel

Weekly rewards web experience for the office. Spin a fully animated wheel filled with every teammate's face, automatically choose a winner on a schedule, and keep the last few winners visible on the big screen.

## Features

- SVG-based animated wheel with avatars & readable initials that reshuffle after every spin.
- Node/Express backend with CSV-driven employee roster + CSV winner history storage.
- Cron-driven auto spin (defaults to 1:00 PM Fridays) or manual trigger; countdown shows the next scheduled draw.
- Celebration overlay with confetti + chime; recent winners update only after the reveal.
- Idle motion with ticking audio keeps the wheel alive between draws; layout scales up for TVs.

## Getting Started

```bash
npm install               # install root + client deps
npm run dev               # run Express + Vite together
npm run server            # backend only
npm run client:dev        # frontend only
npm run client:build      # production build (outputs client/dist)
```

The Vite dev server proxies `/api/*` calls to `localhost:4000`. For production, `vite.config.js` uses relative asset paths so `client/dist` can be hosted from any static server.

> The React client is tuned for kiosk mode: it fills the viewport, idles the wheel continuously, and only stops/announces when the backend scheduler picks a name.

> After starting the app, head to `/admin` to create your first game; until you do, `/:slug` routes will show “No game selected.”

## Configuration

Create a `.env` file at the project root to override defaults.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4000` | Express server port |
| `DRAW_CRON` | `*/1 * * * *` | Default cron pattern for new games (cron-parser syntax) |
| `DRAW_TIMEZONE` | System timezone | Timezone for cron + countdown |
| `WINNER_HISTORY_LIMIT` | `40` | How many winners to keep per game |
| `REPEAT_COOLDOWN` | `3` | Number of recent winners excluded from the random pool |
| `ADMIN_PASSWORD` | `gameAdmin1@wof#` | Password for `/admin` interface & API |

Frontend requests can also be pointed at a deployed API by setting `VITE_API_URL` before building the client. During local dev, the proxy handles it automatically.

## Data

- SQLite database at `server/data/wheel.db` stores everything. Tables:
  - `games` – slug, display name, cron schedule, timezone.
  - `employees` – roster per game.
  - `winners` – historical draws per game.
- The CLI admin interface lets you add/delete games and employees; the wheel UI automatically shuffles employee order every draw.

## URLs

- `/:gameSlug` – public wheel for the game slug you created (e.g. `/aas`). If no slug is provided you’ll see a “No game selected” message.
- `/admin` – admin console (password prompt). From there you can:
  - add/edit games (slug, cron expression, timezone),
  - drop in a comma/newline separated list of employees to add in bulk,
  - view cron info. All admin API calls require the password via Bearer token.

## Deployment Notes

1. Deploy the Express server (render, fly.io, etc.) and keep `server/data` writable – this is where the SQLite database (`wheel.db`) lives.
2. Build the client (`npm run client:build`) and host the `client/dist` folder via CDN or behind the same server (e.g., serve static files). `vite.config.js` already uses relative asset paths.
3. Ensure the frontend can reach the API by setting `VITE_API_URL=https://your-domain` (the React app calls `/api/...` behind the scenes).

## Testing

- `npm run client:build` – validates the React bundle compiles without errors.
- You can also `curl http://localhost:4000/api/employees` to verify the API.
