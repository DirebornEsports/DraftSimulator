// Server-side multiplayer room logic. The server is the source of truth for
// turns, timers, reserve time and auto-picks; clients only send actions.
import { STEPS, stepTime, TIMER } from './draft';
import { getJSON, setJSON, setNX, withLock, kvConfigured } from './kv';
import { getHeroes } from './opendota';

const TTL = 60 * 60 * 24; // rooms live 24 h
const key = (code) => 'dl:room:' + code;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
const token = () => Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => b.toString(16).padStart(2, '0')).join('');
const cleanName = (n, fallback) => (String(n || '').trim().slice(0, 24) || fallback);

export async function createRoom({ name, side, order, mode }) {
  const hostTeam = order === 'second' ? 2 : 1;
  const hostSide = side === 'dire' ? 'dire' : 'radiant';
  const otherSide = hostSide === 'radiant' ? 'dire' : 'radiant';
  for (let i = 0; i < 8; i++) {
    const code = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => ALPHABET[b % ALPHABET.length]).join('');
    const t = token();
    const room = {
      code, v: 1, createdAt: Date.now(), status: 'lobby',
      mode: mode === 'blind' ? 'blind' : 'live',
      seats: {
        [hostTeam]: { side: hostSide, name: cleanName(name, 'Captain 1'), token: t, ready: false },
        [hostTeam === 1 ? 2 : 1]: { side: otherSide, name: null, token: null, ready: false },
      },
      actions: [], step: 0, turnStart: null, reserve: { 1: TIMER.reserve * 1000, 2: TIMER.reserve * 1000 },
    };
    if (await setNX(key(code), JSON.stringify(room), TTL)) return { room, token: t, team: hostTeam };
  }
  throw new Error('Could not create a room, try again');
}

export async function loadRoom(code) {
  return getJSON(key(code));
}

async function save(room) {
  room.v += 1;
  await setJSON(key(room.code), room, TTL);
  return room;
}

export function teamOf(room, tok) {
  if (!tok) return null;
  if (room.seats[1].token === tok) return 1;
  if (room.seats[2].token === tok) return 2;
  return null;
}

// Applies timeouts: a ban that runs out of time is lost, a pick is randomed.
function advance(room, now, heroIds) {
  let changed = false;
  while (room.status === 'live' && room.step < STEPS.length) {
    const s = STEPS[room.step];
    const limit = stepTime(room.step) * 1000;
    const deadline = room.turnStart + limit + room.reserve[s.team];
    if (now <= deadline) break;
    room.reserve[s.team] = 0;
    let hero = null;
    if (s.type === 'pick') {
      const used = new Set(room.actions.filter(Boolean));
      const pool = heroIds.filter((id) => !used.has(id));
      hero = pool[Math.floor(Math.random() * pool.length)];
    }
    room.actions.push(hero);
    room.step += 1;
    room.turnStart = deadline;
    changed = true;
  }
  if (room.status === 'live' && room.step >= STEPS.length) { room.status = 'done'; room.turnStart = null; changed = true; }
  return changed;
}

function needsAdvance(room, now) {
  if (room.status !== 'live' || room.step >= STEPS.length) return room.status === 'live';
  const s = STEPS[room.step];
  return now > room.turnStart + stepTime(room.step) * 1000 + room.reserve[s.team];
}

async function heroIds() {
  const h = await getHeroes();
  return h.map((x) => x.id);
}

// Read a room, applying any expired timers first.
export async function readRoom(code) {
  let room = await loadRoom(code);
  if (!room) return null;
  if (needsAdvance(room, Date.now())) {
    const ids = await heroIds();
    room = await withLock(key(code), async () => {
      const fresh = await loadRoom(code);
      if (fresh && advance(fresh, Date.now(), ids)) await save(fresh);
      return fresh;
    });
  }
  return room;
}

export async function joinRoom(code, name) {
  return withLock(key(code), async () => {
    const room = await loadRoom(code);
    if (!room) throw httpError(404, 'Room not found');
    const free = [1, 2].find((t) => !room.seats[t].token);
    if (!free) return { room, token: null, team: null }; // spectator
    const t = token();
    room.seats[free] = { ...room.seats[free], name: cleanName(name, 'Captain ' + free), token: t, ready: false };
    await save(room);
    return { room, token: t, team: free };
  });
}

export async function setReady(code, tok, ready) {
  return withLock(key(code), async () => {
    const room = await loadRoom(code);
    if (!room) throw httpError(404, 'Room not found');
    const team = teamOf(room, tok);
    if (!team) throw httpError(403, 'Not a captain in this room');
    if (room.status !== 'lobby') return room;
    room.seats[team].ready = !!ready;
    if (room.seats[1].ready && room.seats[2].ready && room.seats[1].token && room.seats[2].token) {
      room.status = 'live';
      room.turnStart = Date.now() + 3000; // 3 s countdown
    }
    await save(room);
    return room;
  });
}

export async function act(code, tok, heroId) {
  const ids = await heroIds();
  return withLock(key(code), async () => {
    const room = await loadRoom(code);
    if (!room) throw httpError(404, 'Room not found');
    const now = Date.now();
    advance(room, now, ids);
    if (room.status !== 'live') { await save(room); throw httpError(409, 'Draft is not running'); }
    const team = teamOf(room, tok);
    const s = STEPS[room.step];
    if (!team || team !== s.team) throw httpError(409, 'Not your turn');
    if (now < room.turnStart) throw httpError(409, 'Draft starts in a moment');
    if (!ids.includes(heroId)) throw httpError(400, 'Unknown hero');
    if (room.actions.includes(heroId)) throw httpError(409, 'Hero already taken');
    const over = Math.max(0, now - room.turnStart - stepTime(room.step) * 1000);
    room.reserve[team] = Math.max(0, room.reserve[team] - over);
    room.actions.push(heroId);
    room.step += 1;
    room.turnStart = now;
    if (room.step >= STEPS.length) { room.status = 'done'; room.turnStart = null; }
    await save(room);
    return room;
  });
}

export async function rematch(code, tok) {
  return withLock(key(code), async () => {
    const room = await loadRoom(code);
    if (!room) throw httpError(404, 'Room not found');
    if (!teamOf(room, tok)) throw httpError(403, 'Not a captain in this room');
    room.status = 'lobby'; room.actions = []; room.step = 0; room.turnStart = null;
    room.reserve = { 1: TIMER.reserve * 1000, 2: TIMER.reserve * 1000 };
    room.seats[1].ready = false; room.seats[2].ready = false;
    await save(room);
    return room;
  });
}

// What clients see: never the other captain's token.
export function publicRoom(room, tok) {
  return {
    code: room.code, v: room.v, status: room.status, mode: room.mode,
    seats: {
      1: { side: room.seats[1].side, name: room.seats[1].name, ready: room.seats[1].ready, joined: !!room.seats[1].token },
      2: { side: room.seats[2].side, name: room.seats[2].name, ready: room.seats[2].ready, joined: !!room.seats[2].token },
    },
    actions: room.actions, step: room.step, turnStart: room.turnStart, reserve: room.reserve,
    you: teamOf(room, tok), serverNow: Date.now(), persistent: kvConfigured,
  };
}

export function httpError(status, message) {
  const e = new Error(message); e.status = status; return e;
}
