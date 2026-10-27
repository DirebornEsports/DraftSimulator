# Draft Lab — Direborn

Dota 2 Captain's Mode draft trainer. Next.js (App Router) on Vercel, data from the OpenDota API.

## Modes
- **Draft Simulator** — full 24-step Captain's Mode vs an AI (Easy / Hard / Team style).
  - *Live feedback*: S–F grade, pros, risks and better options after every pick and ban.
  - *Blind*: no hints; full graded review at `/review` after the draft.
- **Multiplayer** (`/play`) — captain vs captain in a shared room with a 6-character code. Spectators can watch.
  The server runs the turns, timers, reserve time and timeouts; each captain gets their own live or blind grades.
- **Draft Quiz** — a recent pro match from OpenDota; guess each of the 10 picks (100 exact / 60 strong alternative / 0).
- **Teams** — save teams, players, positions and preferred heroes; used by the Team-style AI.

## Data
| Route | Source | Cache |
| --- | --- | --- |
| `/api/heroes` | OpenDota `/heroStats` (names, roles, portraits, pro + Immortal stats) | 12 h |
| `/api/matchups/[id]` | OpenDota `/heroes/{id}/matchups` | 24 h |
| `/api/quiz` | OpenDota `/proMatches` + `/matches/{id}` | 1 h / 7 d |

Hero portraits load from Valve's CDN using the image path OpenDota returns.
Optional env var: `OPENDOTA_API_KEY` for higher rate limits.

## Multiplayer setup
Rooms are stored in Redis. In Vercel: Project → Storage → add **Upstash for Redis** (free tier is fine).
It sets `KV_REST_API_URL` / `KV_REST_API_TOKEN` automatically; redeploy afterwards.
Without it the app falls back to in-memory rooms, which reset between server instances (local dev only).
Clients poll `/api/rooms/[code]` once a second.

## Grading (lib/grade.js)
Score = 30 + 0.6 × meta strength + counter value + composition needs, clamped to 0–100.
- **Meta**: pro contest rate (picks + bans), pro win rate, Immortal-bracket win rate.
- **Counters**: public matchup win rates vs enemy picks (picks) or vs your picks (bans), min 40 games.
- **Composition**: support/core balance, carries, initiation, lockdown.
Tiers: S ≥ 85, A ≥ 75, B ≥ 65, C ≥ 55, D ≥ 45, F below.

## Draft order & timer
`lib/draft.js` — 7 bans · 2 picks · 3 bans · 6 picks · 4 bans · 2 picks (order introduced in 7.34); 15 s per ban in ban phase 1, 30 s otherwise, 130 s reserve. A timed-out ban is lost; a timed-out pick is random.
Re-check against the current patch notes when Valve changes the draft.

## Next steps
- Move teams and history from browser storage to Postgres (Vercel Marketplace).
- Scheduled data refresh + hero synergy data.
- Team-style AI trained on a team's real pro drafts.
