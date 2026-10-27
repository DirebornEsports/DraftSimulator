// Client helpers for shared teams and history (stored in the database via API routes).

async function api(path, opts = {}) {
  const r = await fetch(path, { cache: 'no-store', ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) throw new Error(d.error || 'Request failed');
  return d;
}

const myName = () => { try { return localStorage.getItem('dl.name') || ''; } catch { return ''; } };

// One-time move of data saved in this browser by earlier versions.
let migrated = null;
export function migrateLocal() {
  if (migrated) return migrated;
  migrated = (async () => {
    try {
      if (localStorage.getItem('dl.migrated')) return;
      const teams = JSON.parse(localStorage.getItem('dl.teams') || '[]');
      const history = JSON.parse(localStorage.getItem('dl.history') || '[]');
      for (const t of teams) await api('/api/teams', { method: 'POST', body: JSON.stringify({ team: t }) });
      for (const h of [...history].reverse()) await api('/api/history', { method: 'POST', body: JSON.stringify(h) });
      localStorage.setItem('dl.migrated', '1');
    } catch {}
  })();
  return migrated;
}

export async function getTeams() { await migrateLocal(); return (await api('/api/teams')).teams; }
export async function saveTeam(team) { return (await api('/api/teams', { method: 'POST', body: JSON.stringify({ team }) })).team; }
export async function deleteTeam(id) { await api('/api/teams?id=' + encodeURIComponent(id), { method: 'DELETE' }); }
export async function importMatches(teamId, body) {
  return api('/api/teams/' + encodeURIComponent(teamId) + '/import', { method: 'POST', body: JSON.stringify(body) });
}
export async function setMatchSide(teamId, matchId, side) {
  return (await api('/api/teams/' + encodeURIComponent(teamId) + '/match', { method: 'POST', body: JSON.stringify({ matchId, side }) })).team;
}
export async function removeMatch(teamId, matchId) {
  return (await api('/api/teams/' + encodeURIComponent(teamId) + '/match', { method: 'POST', body: JSON.stringify({ matchId, remove: true }) })).team;
}

export async function getHistory() { await migrateLocal(); return (await api('/api/history')).history; }
export async function getEntry(id) { return (await api('/api/history?id=' + encodeURIComponent(id))).entry; }
export async function addHistory(entry) {
  return (await api('/api/history', { method: 'POST', body: JSON.stringify({ ...entry, by: entry.by || myName() }) })).entry;
}
export async function updateEntry(id, patch) {
  return (await api('/api/history', { method: 'PATCH', body: JSON.stringify({ id, patch }) })).entry;
}

export const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
