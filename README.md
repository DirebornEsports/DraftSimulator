# Draft Lab — Direborn

Dota 2 Captain's Mode draft trainer. Next.js (App Router) on Vercel, data from the OpenDota API.

## Modes
- **Draft Simulator** — full 24-step Captain's Mode vs an AI (Easy / Hard / Team style).
  - *Live feedback*: S–F grade, pros, risks and better options after every pick and ban.
  - *Blind*: no hints; full graded review at `/review` after the draft.
- **Ranked draft** (`/ranked`) — quick Ranked All Pick: ban nominations (50% each), picks 1-2-2-2-2-1,
  pick suggestions for your position (Immortal win rate, counters vs enemy picks, synergy, role fit).
  Play as one player with AI teammates, or draft the whole team.
- **Multiplayer** (`/play`) — captain vs captain in a shared room with a 6-character code. Spectators can watch.
  The server runs the turns, timers, reserve time and timeouts; each captain gets their own live or blind grades.
- **Draft Quiz** — a recent pro match from OpenDota; guess each of the 10 picks (100 exact / 60 strong alternative / 0).
- **Teams** — shared team database (Redis): players, positions, hero pools, and imported pro matches.
  Import by match IDs or by OpenDota team ID (recent matches). The team's pick/ban habits per draft slot
  become an AI profile, so the simulator opponent can role-play that team. Cards show a scouting summary.

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

## Storage
Redis keys: `dl:teams` (all teams, JSON), `dl:history` (latest 400 drafts/quizzes), `dl:room:*` (multiplayer, 24 h).
API: `/api/teams`, `/api/teams/[id]/import`, `/api/teams/[id]/match`, `/api/history`, `/api/health`.
Data saved in a browser by older versions is moved to the database on first visit.

## Grading (lib/grade.js)
Score = 30 + 0.6 × meta strength + counter value + composition needs, clamped to 0–100.
- **Meta**: pro contest rate (picks + bans), pro win rate, Immortal-bracket win rate.
- **Counters**: public matchup win rates vs enemy picks (picks) or vs your picks (bans), min 40 games.
- **Synergy**: pro-match win rate of hero pairs on the same team (last 120 days, OpenDota explorer, min 8 games).
  Picks gain for pairing with your heroes; bans gain for breaking the enemy's pairs.
- **Composition**: support/core balance, carries, initiation, lockdown.
Tiers: S ≥ 85, A ≥ 75, B ≥ 65, C ≥ 55, D ≥ 45, F below.

## Draft order & timer
`lib/draft.js` — current order (patch 7.40, unchanged through 7.41f): bans F F S S F S S · picks F S · bans F F S · picks S F F S S F · bans F S F S · picks F S. 15 s per ban in ban phase 1, 30 s otherwise, 130 s reserve. A timed-out ban is lost; a timed-out pick is random.
Re-check against the current patch notes when Valve changes the draft.

## Positions & lanes (lib/positions.js)
Captains set Pos 1–5 or Flex for each picked hero (on the board or in the review). Unset heroes are auto-assigned to the best open position.
- Position fit: estimated from OpenDota hero roles (Carry, Support, Initiator, Durable, ...).
- Flex: hero is placed at its best open position; a real flex (fits 2+ positions) earns a small bonus.
- Lanes: safe (1+5 vs 3+4), mid (2 vs 2), off (3+4 vs 1+5) graded from head-to-head win rates. Opponent positions are estimated.
- Final grade = 70% picks & bans + 15% positions + 15% lanes.

## Next steps
- Scheduled data refresh + hero synergy data.
- Team-style AI trained on a team's real pro drafts.
