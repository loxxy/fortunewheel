# Fortune Wheel

Weekly rewards web experience for the office. Spin a fully animated wheel filled with every teammate's face, automatically choose a winner every Friday at 1:00 PM, and keep the last few winners visible on the big screen.

## Features

- SVG-based animated wheel that scales to ~40 employees with avatars and names.
- Node/Express backend with CSV-driven employee roster + JSON winner history.
- Scheduled draw powered by cron (defaults to 1:00 PM Fridays); the kiosk automatically animates and locks in at draw time.
- Countdown timer and winner history so everyone knows what is happening next.
- Responsive layout designed to stay legible on TV displays as well as laptops.

## Getting Started

```bash
# install dependencies
npm install

# run backend + frontend together (nodemon + Vite)
npm run dev

# backend only
npm run server

# frontend only
npm run client:dev
```

The Vite dev server proxies `/api/*` calls to the Express server (`localhost:4000`). Build the production assets with `npm run build` which runs `npm run client:build`.

> The React client is tuned for kiosk mode: it fills the viewport, idles the wheel continuously, and only stops/announces when the backend scheduler picks a name.

## Configuration

Create a `.env` file at the project root to override defaults.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4000` | Express server port |
| `DRAW_CRON` | `0 0 13 * * FRI` | Cron pattern for the auto spin |
| `DRAW_TIMEZONE` | System timezone | Timezone for cron + countdown |
| `WINNER_HISTORY_LIMIT` | `40` | How many winners to keep in `data.json` |
| `REPEAT_COOLDOWN` | `3` | Number of recent winners excluded from the random pool |

Frontend requests can also be pointed at a deployed API by setting `VITE_API_URL` before building the client. During local dev, the proxy handles it automatically.

## Data

- `server/data/employees.csv` — comma separated roster with columns `id,firstName,lastName,role,avatar`. Update this file (up to ~40 rows) to change who appears on the wheel. The backend watches this file and reloads automatically.
- `server/data/winners.csv` — maintained by the server after each draw (`id,employeeId,drawnAt,trigger`). Useful if you want to import past results elsewhere. Editing manually lets you reset history.

## Deployment Notes

1. Deploy the Express server (render, fly.io, etc.) and keep `server/data/data.json` writable so scheduled spins can persist results.
2. Build the client (`npm run client:build`) and host the `client/dist` folder via CDN or behind the same server (e.g., serve static files).
3. Ensure the frontend can reach the API by setting `VITE_API_URL=https://your-domain/api`.

## Testing

- `npm run client:build` – validates the React bundle compiles without errors.
- You can also `curl http://localhost:4000/api/employees` to verify the API.
