// Tiny key-value layer for multiplayer rooms.
// Production: Upstash Redis over its REST API (add "Upstash for Redis" from the
// Vercel Marketplace; it sets KV_REST_API_URL / KV_REST_API_TOKEN or the
// UPSTASH_REDIS_REST_* variables). Local dev without those: in-memory fallback.

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const kvConfigured = Boolean(URL_ && TOKEN);

const mem = globalThis.__dlMem || (globalThis.__dlMem = new Map());

async function cmd(args) {
  if (!kvConfigured) return memCmd(args);
  const res = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
    cache: 'no-store',
  });
  const d = await res.json();
  if (d.error) throw new Error('Redis: ' + d.error);
  return d.result;
}

function memCmd([op, key, val, ...rest]) {
  const now = Date.now();
  const e = mem.get(key);
  const live = e && (!e.exp || e.exp > now) ? e : null;
  if (op === 'GET') return live ? live.v : null;
  if (op === 'DEL') { mem.delete(key); return 1; }
  if (op === 'SET') {
    const nx = rest.includes('NX');
    if (nx && live) return null;
    let exp = null;
    const ex = rest.indexOf('EX'); if (ex >= 0) exp = now + Number(rest[ex + 1]) * 1000;
    const px = rest.indexOf('PX'); if (px >= 0) exp = now + Number(rest[px + 1]);
    mem.set(key, { v: val, exp });
    return 'OK';
  }
  throw new Error('Unsupported op ' + op);
}

export async function getJSON(key) {
  const v = await cmd(['GET', key]);
  return v ? JSON.parse(v) : null;
}

export async function setJSON(key, value, ttlSeconds) {
  return cmd(['SET', key, JSON.stringify(value), 'EX', String(ttlSeconds)]);
}

export async function setNX(key, value, ttlSeconds) {
  return (await cmd(['SET', key, value, 'NX', 'EX', String(ttlSeconds)])) === 'OK';
}

// Short lock so two requests never write the same room at once.
export async function withLock(key, fn) {
  const lockKey = key + ':lock';
  const id = Math.random().toString(36).slice(2);
  for (let i = 0; i < 25; i++) {
    const ok = (await cmd(['SET', lockKey, id, 'NX', 'PX', '4000'])) === 'OK';
    if (ok) {
      try { return await fn(); } finally { await cmd(['DEL', lockKey]).catch(() => {}); }
    }
    await new Promise((r) => setTimeout(r, 80 + Math.random() * 80));
  }
  throw new Error('Room is busy, try again');
}
