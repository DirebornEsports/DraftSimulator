// Ranked All Pick (non-Captain's Mode) draft logic.
// Bans: every player nominates one hero; each nomination bans with 50% chance (stacking).
// Picks: teams alternate 1-2-2-2-2-1, anyone on the team whose turn it is can pick.
import { synergyOf, tierOf } from './grade';
import { fitScores, fitReason, POSITIONS, POS_SHORT } from './positions';

export const PICK_ORDER = [1, 2, 2, 1, 1, 2, 2, 1, 1, 2]; // team 1 = first-pick team
export const BAN_CHANCE = 0.5;
export const TURN_SECONDS = 30;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pct = (x) => (Math.round(x * 1000) / 10) + '%';

// Ranked strength: Immortal-bracket win rate and popularity count most; pro data a little.
export function addRankedMeta(heroes) {
  const maxHi = Math.max(1, ...heroes.map((h) => h.hiPick));
  return heroes.map((h) => {
    const hiWR = h.hiPick ? h.hiWin / h.hiPick : 0.5;
    const pop = Math.sqrt(h.hiPick / maxHi);
    const wrN = clamp((hiWR - 0.45) / 0.11, 0, 1);
    const proN = clamp(((h.proWin + 5) / (h.proPick + 10) - 0.42) / 0.16, 0, 1);
    return { ...h, hiWR, rMeta: Math.round(100 * (0.55 * wrN + 0.3 * pop + 0.15 * proN)) };
  });
}

function edge(matchups, a, b) { // how much hero b beats hero a
  const m = matchups[a] && matchups[a][b];
  if (!m || m.g < 40) return null;
  return { adv: 0.5 - m.w / m.g, bWR: 1 - m.w / m.g, g: m.g };
}

// Score one hero for a position given allies/enemies on the board.
export function scoreHero({ heroId, pos, allies, enemies, byId, matchups }) {
  const h = byId[heroId];
  const fit = fitScores(h)[pos];
  let s = 22 + 0.35 * h.rMeta + 0.42 * fit;
  const pros = []; const cons = [];

  let counter = 0; let best = null; let worst = null;
  for (const e of enemies) {
    const x = edge(matchups, e, heroId);
    if (!x) continue;
    counter += x.adv;
    if (!best || x.adv > best.adv) best = { ...x, e };
    if (!worst || x.adv < worst.adv) worst = { ...x, e };
  }
  s += clamp(counter * 200, -18, 18);

  let syn = 0; let pair = null;
  for (const a of allies) {
    const p = synergyOf(heroId, a);
    if (!p) continue;
    syn += p.delta;
    if (!pair || p.delta > pair.delta) pair = { ...p, a };
  }
  s += clamp(syn * 70, -8, 10);

  if (fit >= 85) pros.push(fitReason(h, pos));
  else if (fit < 60) cons.push(fitReason(h, pos));
  if (best && best.adv >= 0.015) pros.push('Wins ' + pct(best.bWR) + ' vs their ' + byId[best.e].name);
  if (worst && worst.adv <= -0.015) cons.push('Only ' + pct(worst.bWR) + ' vs their ' + byId[worst.e].name);
  if (pair && pair.delta >= 0.04) pros.push('Pairs with your ' + byId[pair.a].name + ' (' + pct(pair.wr) + ' together in pro games)');
  if (h.hiPick > 500) {
    if (h.hiWR >= 0.52) pros.push('Immortal win rate ' + pct(h.hiWR));
    else if (h.hiWR <= 0.48) cons.push('Immortal win rate only ' + pct(h.hiWR));
  }
  if (!pros.length) pros.push('Solid, safe option for ' + POS_SHORT[pos]);
  const score = Math.round(clamp(s, 5, 99));
  return { id: heroId, score, tier: tierOf(score), pros: pros.slice(0, 3), cons: cons.slice(0, 2) };
}

export function suggest({ pos, allies, enemies, byId, matchups, used, n = 6 }) {
  return Object.values(byId)
    .filter((h) => !used.has(h.id))
    .map((h) => scoreHero({ heroId: h.id, pos, allies, enemies, byId, matchups }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

// Ban suggestions: strong heroes in ranked that are bad news for your position.
export function banSuggest({ pos, byId, n = 6 }) {
  const opp = { 1: '3', 2: '2', 3: '1', 4: '1', 5: '3' }[pos] || '1';
  return Object.values(byId)
    .map((h) => {
      const f = fitScores(h);
      const s = 0.65 * h.rMeta + 0.35 * f[opp];
      const why = ['Immortal win rate ' + pct(h.hiWR)];
      if (f[opp] >= 85) why.push('Likely to be your lane opponent as ' + POS_SHORT[opp]);
      return { id: h.id, score: Math.round(s), why };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

// AI players nominate bans: popular strong heroes, with variety.
export function aiNominations(byId, count, exclude = []) {
  const pool = Object.values(byId).filter((h) => !exclude.includes(h.id)).sort((a, b) => b.rMeta - a.rMeta).slice(0, 30);
  return Array.from({ length: count }, () => {
    const total = pool.reduce((a, h) => a + h.rMeta * h.rMeta, 0);
    let r = Math.random() * total;
    for (const h of pool) { r -= h.rMeta * h.rMeta; if (r <= 0) return h.id; }
    return pool[0].id;
  });
}

// Each nomination rolls 50%; a hero nominated n times is banned with 1 - 0.5^n.
export function resolveBans(nominations) {
  const rolls = nominations.map((n) => ({ ...n, hit: Math.random() < BAN_CHANCE }));
  const banned = [...new Set(rolls.filter((r) => r.hit).map((r) => r.heroId))];
  return { rolls, banned };
}

// AI pick for a team: chooses an open position (supports usually pick early in pubs) and the best hero for it.
export function aiPick({ openPositions, allies, enemies, byId, matchups, used, skill = 'hard' }) {
  const order = ['5', '4', '3', '2', '1'];
  const posPool = openPositions.slice().sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const pos = Math.random() < 0.65 ? posPool[0] : posPool[Math.floor(Math.random() * posPool.length)];
  const options = suggest({ pos, allies, enemies, byId, matchups, used, n: skill === 'easy' ? 15 : 5 });
  const pick = options[Math.floor(Math.random() * Math.min(options.length, skill === 'easy' ? 15 : 3))] || options[0];
  return { heroId: pick.id, pos };
}

export { POSITIONS, POS_SHORT };
