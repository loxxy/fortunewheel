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

## Configuration

Create a `.env` file at the project root to override defaults.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4000` | Express server port |
| `DRAW_CRON` | `0 0 13 * * FRI` | Cron pattern for the auto spin (cron-parser syntax) |
| `DRAW_TIMEZONE` | System timezone | Timezone for cron + countdown |
| `WINNER_HISTORY_LIMIT` | `40` | How many winners to keep in `winners.csv` |
| `REPEAT_COOLDOWN` | `3` | Number of recent winners excluded from the random pool |

Frontend requests can also be pointed at a deployed API by setting `VITE_API_URL` before building the client. During local dev, the proxy handles it automatically.

## Data

- `server/data/employees.csv` — comma separated roster with columns `id,firstName,lastName,role,avatar`. Update this file (up to ~40 rows) to change who appears on the wheel. The backend watches this file and reloads automatically.
- `server/data/winners.csv` — maintained by the server after each draw (`id,employeeId,drawnAt,trigger`). Useful if you want to import past results elsewhere. Editing manually lets you reset history.

## Deployment Notes

1. Deploy the Express server (render, fly.io, etc.) and keep `server/data/*.csv` writable so scheduled spins persist results.
2. Build the client (`npm run client:build`) and host the `client/dist` folder via CDN or behind the same server (e.g., serve static files).
3. Ensure the frontend can reach the API by setting `VITE_API_URL=https://your-domain/api`.

## Testing

- `npm run client:build` – validates the React bundle compiles without errors.
- You can also `curl http://localhost:4000/api/employees` to verify the API.
