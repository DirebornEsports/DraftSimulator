// Shared storage for teams and draft history (Redis via lib/kv).
// Everyone using the site shares the same teams and history.
import { getJSON, setJSON, withLock } from './kv';
import { getMatch, getTeam, getTeamMatches } from './opendota';

const TEAMS = 'dl:teams';
const HISTORY = 'dl:history';
const MAX_HISTORY = 400;
const MAX_MATCHES = 120;

const str = (v, n) => String(v ?? '').trim().slice(0, n);
const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export async function listTeams() {
  const all = (await getJSON(TEAMS)) || {};
  return Object.values(all).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

export async function getTeamById(id) {
  const all = (await getJSON(TEAMS)) || {};
  return all[id] || null;
}

function cleanTeam(input, prev) {
  return {
    id: prev?.id || str(input.id, 40) || rid(),
    createdAt: prev?.createdAt || Date.now(),
    updatedAt: Date.now(),
    name: str(input.name ?? prev?.name, 40) || 'Unnamed team',
    tag: str(input.tag ?? prev?.tag, 12),
    region: str(input.region ?? prev?.region ?? 'SEA', 20),
    odTeamId: Number(input.odTeamId ?? prev?.odTeamId) || null,
    players: (input.players ?? prev?.players ?? []).slice(0, 7).map((p) => ({
      ign: str(p.ign, 24), pos: str(p.pos, 4),
      heroes: (p.heroes || []).map(Number).filter(Boolean).slice(0, 10),
    })).filter((p) => p.ign),
    matches: prev?.matches || [],
  };
}

export async function saveTeam(input) {
  return withLock(TEAMS, async () => {
    const all = (await getJSON(TEAMS)) || {};
    const prev = input.id ? all[input.id] : null;
    const team = cleanTeam(input, prev);
    all[team.id] = team;
    await setJSON(TEAMS, all);
    return team;
  });
}

export async function deleteTeam(id) {
  return withLock(TEAMS, async () => {
    const all = (await getJSON(TEAMS)) || {};
    delete all[id];
    await setJSON(TEAMS, all);
    return true;
  });
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function detectSide(m, team) {
  if (team.odTeamId) {
    if (m.radiant_team_id === team.odTeamId) return 'radiant';
    if (m.dire_team_id === team.odTeamId) return 'dire';
  }
  const keys = [norm(team.name), norm(team.tag)].filter((k) => k.length >= 2);
  const r = [norm(m.radiant_team?.name || m.radiant_name), norm(m.radiant_team?.tag)];
  const d = [norm(m.dire_team?.name || m.dire_name), norm(m.dire_team?.tag)];
  const hit = (arr) => keys.some((k) => arr.some((x) => x && (x === k || x.includes(k) || k.includes(x))));
  const rh = hit(r); const dh = hit(d);
  if (rh && !dh) return 'radiant';
  if (dh && !rh) return 'dire';
  return null;
}

function compact(m, side) {
  const pb = [...(m.picks_bans || [])].sort((a, b) => a.order - b.order);
  return {
    id: m.match_id,
    start: m.start_time,
    league: m.league?.name || null,
    patch: m.patch || null,
    radiant: { name: m.radiant_team?.name || m.radiant_name || 'Radiant', id: m.radiant_team_id || null },
    dire: { name: m.dire_team?.name || m.dire_name || 'Dire', id: m.dire_team_id || null },
    radiantWin: !!m.radiant_win,
    side,
    pb: pb.map((x) => [x.is_pick ? 1 : 0, x.hero_id, x.team]),
  };
}

async function inBatches(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}

// Imports match drafts into a team. Either matchIds, or odTeamId (+ limit) for recent matches.
export async function importMatches(teamId, { matchIds = [], odTeamId = null, limit = 20 }) {
  let team = await getTeamById(teamId);
  if (!team) { const e = new Error('Team not found'); e.status = 404; throw e; }
  const tid = Number(odTeamId) || null;
  let ids = [...new Set(matchIds.map((x) => String(x).replace(/\D/g, '')).filter(Boolean).map(Number))];
  let teamPatch = {};
  if (tid) {
    teamPatch.odTeamId = tid;
    if (!ids.length) {
      const list = await getTeamMatches(tid);
      ids = list.slice(0, Math.min(50, Math.max(1, Number(limit) || 20))).map((m) => m.match_id);
    }
    if (!team.name || team.name === 'Unnamed team') {
      const info = await getTeam(tid).catch(() => null);
      if (info && info.name) teamPatch.name = info.name;
      if (info && info.tag && !team.tag) teamPatch.tag = info.tag;
    }
  }
  const known = new Set(team.matches.map((m) => m.id));
  const fresh = ids.filter((id) => !known.has(id)).slice(0, 50);
  const ref = { ...team, ...teamPatch };
  const skipped = ids.filter((id) => known.has(id)).map((id) => ({ id, reason: 'Already added' }));
  const results = await inBatches(fresh, 4, async (id) => {
    try {
      const m = await getMatch(id);
      if (!m || !m.picks_bans || m.picks_bans.length < 20) return { id, skip: 'No Captain’s Mode draft in this match' };
      return { id, match: compact(m, detectSide(m, ref)) };
    } catch (e) { return { id, skip: 'Could not load from OpenDota' }; }
  });
  const added = results.filter((r) => r.match).map((r) => r.match);
  results.filter((r) => r.skip).forEach((r) => skipped.push({ id: r.id, reason: r.skip }));

  team = await withLock(TEAMS, async () => {
    const all = (await getJSON(TEAMS)) || {};
    const t = all[teamId];
    if (!t) return null;
    Object.assign(t, teamPatch, { updatedAt: Date.now() });
    const have = new Set(t.matches.map((m) => m.id));
    t.matches = [...added.filter((m) => !have.has(m.id)), ...t.matches]
      .sort((a, b) => (b.start || 0) - (a.start || 0)).slice(0, MAX_MATCHES);
    all[teamId] = t;
    await setJSON(TEAMS, all);
    return t;
  });
  return { team, added: added.length, needSide: added.filter((m) => !m.side).map((m) => m.id), skipped };
}

export async function updateMatch(teamId, matchId, { side, remove }) {
  return withLock(TEAMS, async () => {
    const all = (await getJSON(TEAMS)) || {};
    const t = all[teamId];
    if (!t) { const e = new Error('Team not found'); e.status = 404; throw e; }
    if (remove) t.matches = t.matches.filter((m) => m.id !== Number(matchId));
    else t.matches = t.matches.map((m) => (m.id === Number(matchId) ? { ...m, side: side === 'dire' ? 'dire' : side === 'radiant' ? 'radiant' : null } : m));
    t.updatedAt = Date.now();
    await setJSON(TEAMS, all);
    return t;
  });
}

// ---------- History ----------
export async function listHistory() {
  return (await getJSON(HISTORY)) || [];
}

export async function addHistory(entry) {
  return withLock(HISTORY, async () => {
    const list = (await getJSON(HISTORY)) || [];
    const clean = { ...entry, id: str(entry.id, 40) || rid(), at: entry.at || Date.now(), by: str(entry.by, 24) };
    if (!list.some((e) => e.id === clean.id)) list.unshift(clean);
    await setJSON(HISTORY, list.slice(0, MAX_HISTORY));
    return clean;
  });
}

export async function patchHistory(id, patch) {
  return withLock(HISTORY, async () => {
    const list = (await getJSON(HISTORY)) || [];
    const allowed = {};
    if (patch.positions && typeof patch.positions === 'object') allowed.positions = patch.positions;
    const next = list.map((e) => (e.id === id ? { ...e, ...allowed } : e));
    await setJSON(HISTORY, next);
    return next.find((e) => e.id === id) || null;
  });
}
