'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { buildMeta, setSynergy } from './grade';

let heroCache = null;
let synergyLoaded = false;
const matchupCache = {};
const inflight = {};

export function useHeroes() {
  const [state, setState] = useState(heroCache || { heroes: [], byId: {}, loading: true, error: null });

  useEffect(() => {
    if (heroCache) return;
    let alive = true;
    if (!synergyLoaded) {
      synergyLoaded = true;
      fetch('/api/synergy').then((r) => r.json()).then((d) => setSynergy(d.pairs)).catch(() => {});
    }
    fetch('/api/heroes')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        const heroes = buildMeta(d.heroes);
        const byId = {};
        heroes.forEach((h) => { byId[h.id] = h; });
        heroCache = { heroes, byId, loading: false, error: null, fetchedAt: d.fetchedAt };
        if (alive) setState(heroCache);
      })
      .catch((e) => alive && setState({ heroes: [], byId: {}, loading: false, error: e.message }));
    return () => { alive = false; };
  }, []);

  return state;
}

export function fetchMatchups(heroId) {
  if (matchupCache[heroId]) return Promise.resolve(matchupCache[heroId]);
  if (!inflight[heroId]) {
    inflight[heroId] = fetch('/api/matchups/' + heroId)
      .then((r) => r.json())
      .then((d) => { matchupCache[heroId] = d.matchups || {}; return matchupCache[heroId]; })
      .catch(() => { matchupCache[heroId] = {}; return {}; })
      .finally(() => { delete inflight[heroId]; });
  }
  return inflight[heroId];
}

// Keeps a { [heroId]: matchups } object for a list of hero ids.
export function useMatchups() {
  const [map, setMap] = useState({});
  const ref = useRef(map);
  ref.current = map;
  const ensure = useCallback(async (ids) => {
    const missing = ids.filter((id) => !(id in ref.current));
    if (!missing.length) return ref.current;
    const results = await Promise.all(missing.map((id) => fetchMatchups(id).then((m) => [id, m])));
    const next = { ...ref.current };
    results.forEach(([id, m]) => { next[id] = m; });
    ref.current = next;
    setMap(next);
    return next;
  }, []);
  const reset = useCallback(() => { ref.current = {}; setMap({}); }, []);
  return { matchups: map, ensure, reset };
}
