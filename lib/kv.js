// Tiny key-value layer for multiplayer rooms. Works with any Redis that
// Vercel's Storage tab can attach:
//  - REST (Upstash): *KV_REST_API_URL + *KV_REST_API_TOKEN, or UPSTASH_REDIS_REST_*
//  - TCP (Redis / Redis Cloud / Upstash TCP): *REDIS_URL or *KV_URL
// Variable names may carry a custom prefix chosen when connecting the store.
// With none of these set, rooms fall back to memory (local dev only).

const env = process.env;
const findEnv = (...suffixes) => {
  for (const sfx of suffixes) {
    if (env[sfx]) return env[sfx];
    const k = Object.keys(env).find((key) => key.endsWith('_' + sfx) && env[key]);
    if (k) return env[k];
  }
  return null;
};

const REST_URL = findEnv('KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL');
const REST_TOKEN = findEnv('KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_TOKEN');
const TCP_URL = findEnv('REDIS_URL', 'KV_URL');

export const kvMode = REST_URL && REST_TOKEN ? 'rest' : TCP_URL ? 'tcp' : 'memory';
export const kvConfigured = kvMode !== 'memory';

const mem = globalThis.__dlMem || (globalThis.__dlMem = new Map());

async function tcpClient() {
  if (!globalThis.__dlRedis) {
    globalThis.__dlRedis = (async () => {
      const { createClient } = await import('redis');
      const client = createClient({ url: TCP_URL, socket: { connectTimeout: 5000, reconnectStrategy: (n) => Math.min(n * 200, 2000) } });
      client.on('error', (e) => console.error('Redis error', e.message));
      await client.connect();
      return client;
    })().catch((e) => { globalThis.__dlRedis = null; throw e; });
  }
  return globalThis.__dlRedis;
}

async function cmd(args) {
  if (kvMode === 'memory') return memCmd(args);
  if (kvMode === 'tcp') {
    const client = await tcpClient();
    return client.sendCommand(args.map(String));
  }
  const res = await fetch(REST_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + REST_TOKEN, 'Content-Type': 'application/json' },
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
