// Browser storage for the first version. Teams and history move to a
// Postgres database once one is attached to the Vercel project.

function read(key, fallback) {
  if (typeof window === 'undefined') return fallback;
  try { const v = window.localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function write(key, value) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export const getTeams = () => read('dl.teams', []);
export const saveTeams = (t) => write('dl.teams', t);

export const getHistory = () => read('dl.history', []);
export function addHistory(entry) {
  const h = getHistory();
  h.unshift(entry);
  write('dl.history', h.slice(0, 50));
}
export const getEntry = (id) => getHistory().find((e) => e.id === id) || null;

export const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
