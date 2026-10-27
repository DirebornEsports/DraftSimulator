// Positions (Pos 1-5), flex picks and lane matchups.
// Position fit is estimated from OpenDota hero roles; lanes use public matchup win rates.
import { tierOf } from './grade';

export const POSITIONS = ['1', '2', '3', '4', '5'];
export const POS_NAME = { 1: 'Pos 1 · Carry', 2: 'Pos 2 · Mid', 3: 'Pos 3 · Offlane', 4: 'Pos 4 · Soft support', 5: 'Pos 5 · Hard support' };
export const POS_SHORT = { 1: 'Carry', 2: 'Mid', 3: 'Offlane', 4: 'Soft sup', 5: 'Hard sup' };

const W = {
  1: { Carry: 3, Escape: 1, Pusher: 0.5, Durable: 0.3, Support: -2.5, Initiator: -0.3 },
  2: { Nuker: 1.5, Escape: 1.2, Carry: 1, Pusher: 0.6, Disabler: 0.5, Initiator: 0.3, Support: -1.5 },
  3: { Initiator: 2, Durable: 2, Disabler: 0.6, Nuker: 0.4, Carry: 0.2, Support: -1.2 },
  4: { Support: 2, Disabler: 1, Initiator: 1, Nuker: 1, Escape: 0.5, Carry: -1.5, Durable: -0.3 },
  5: { Support: 3, Disabler: 1.2, Nuker: 0.3, Carry: -2.5, Escape: -0.4, Durable: -0.3 },
};

function raw(hero, pos) {
  let s = 0;
  for (const r of hero.roles || []) s += W[pos][r] || 0;
  if (pos === '2' && hero.attackType === 'Ranged') s += 0.4;
  if (pos === '3' && hero.attackType === 'Melee') s += 0.3;
  return s;
}

// 0-100 fit for every position, best position = 100.
export function fitScores(hero) {
  const vals = POSITIONS.map((p) => raw(hero, p));
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const out = {};
  POSITIONS.forEach((p, i) => { out[p] = max === min ? 70 : Math.round(25 + 75 * (vals[i] - min) / (max - min)); });
  return out;
}

const REASON_GOOD = {
  1: 'Carry kit that scales with farm in the safe lane',
  2: 'Has the damage, mobility or rune control a mid needs',
  3: 'Tanky or initiating kit that can survive the hard lane',
  4: 'Roaming support with setup and playmaking spells',
  5: 'Low farm dependency with saves or lockdown for the safe lane',
};
const REASON_BAD = {
  1: 'Not built to carry: falls off without the right items',
  2: 'Lacks the damage or mobility to win mid on its own',
  3: 'Too fragile or passive for the offlane',
  4: 'Needs farm, so a roaming support slot wastes it',
  5: 'Core hero in a zero-farm role',
};

export function fitReason(hero, pos) {
  const f = fitScores(hero);
  const best = POSITIONS.reduce((a, p) => (f[p] > f[a] ? p : a), '1');
  if (f[pos] >= 85) return REASON_GOOD[pos];
  if (f[pos] >= 60) return 'Playable here, but best as ' + POS_SHORT[best];
  return REASON_BAD[pos] + '. Best as ' + POS_SHORT[best];
}

// Fills open positions with the best permutation; fixed = { heroId: '1'..'5' }.
export function bestAssignment(heroIds, byId, fixed = {}) {
  const ids = heroIds.filter((id) => byId[id]);
  const taken = new Set(Object.entries(fixed).filter(([id]) => ids.includes(Number(id))).map(([, p]) => p));
  const free = POSITIONS.filter((p) => !taken.has(p));
  const open = ids.filter((id) => !fixed[id]);
  let best = null; let bestScore = -1;
  const fits = Object.fromEntries(open.map((id) => [id, fitScores(byId[id])]));
  const permute = (rest, used, acc, score) => {
    if (!rest.length) { if (score > bestScore) { bestScore = score; best = { ...acc }; } return; }
    const [id, ...tail] = rest;
    for (const p of free) {
      if (used.has(p)) continue;
      used.add(p); acc[id] = p;
      permute(tail, used, acc, score + fits[id][p]);
      used.delete(p); delete acc[id];
    }
  };
  permute(open, new Set(), {}, 0);
  const out = {};
  ids.forEach((id) => { out[id] = fixed[id] || (best && best[id]) || null; });
  return out;
}

// chosen: { heroId: '1'..'5' | 'flex' | '' }. Returns final positions and per-hero rows.
export function resolvePositions(heroIds, chosen = {}, byId) {
  const fixed = {};
  heroIds.forEach((id) => { const c = chosen[id]; if (c && c !== 'flex') fixed[id] = c; });
  const final = bestAssignment(heroIds, byId, fixed);
  const rows = heroIds.filter((id) => byId[id]).map((id) => {
    const pos = final[id];
    const f = fitScores(byId[id]);
    const good = POSITIONS.filter((p) => f[p] >= 80);
    const flex = chosen[id] === 'flex';
    const auto = !chosen[id];
    let score = pos ? f[pos] : 50;
    if (flex && good.length >= 2) score = Math.min(100, score + 6);
    return {
      heroId: id, pos, flex, auto, fit: f, score, tier: tierOf(score),
      reason: pos ? fitReason(byId[id], pos) : 'No position',
      flexNote: flex ? (good.length >= 2 ? 'Real flex pick: fits ' + good.map((p) => POS_SHORT[p]).join(' / ') : 'Marked flex, but only really fits ' + POS_SHORT[good[0] || pos]) : null,
    };
  }).sort((a, b) => Number(a.pos) - Number(b.pos));
  return { final, rows };
}

const LANES = [
  { key: 'safe', name: 'Safe lane', mine: ['1', '5'], theirs: ['3', '4'] },
  { key: 'mid', name: 'Mid lane', mine: ['2'], theirs: ['2'] },
  { key: 'off', name: 'Off lane', mine: ['3', '4'], theirs: ['1', '5'] },
];

// matchups[a][b] = { g, w } wins for a vs b.
export function laneReport({ myFinal, theirFinal, byId, matchups }) {
  const byPos = (fin) => Object.fromEntries(Object.entries(fin).map(([id, p]) => [p, Number(id)]));
  const me = byPos(myFinal);
  const them = byPos(theirFinal);
  return LANES.map((lane) => {
    const mine = lane.mine.map((p) => me[p]).filter(Boolean);
    const theirs = lane.theirs.map((p) => them[p]).filter(Boolean);
    let sum = 0; let n = 0; let best = null; let worst = null;
    for (const a of mine) for (const b of theirs) {
      const m = matchups[a] && matchups[a][b];
      if (!m || m.g < 40) continue;
      const wr = m.w / m.g;
      sum += wr - 0.5; n++;
      const x = { a, b, wr, g: m.g };
      if (!best || wr > best.wr) best = x;
      if (!worst || wr < worst.wr) worst = x;
    }
    const adv = n ? sum / n : 0;
    const score = Math.round(Math.max(5, Math.min(99, 65 + adv * 400)));
    const notes = [];
    const pct = (v) => Math.round(v * 100) + '%';
    if (best && best.wr >= 0.52) notes.push(byId[best.a].name + ' wins ' + pct(best.wr) + ' vs ' + byId[best.b].name);
    if (worst && worst.wr <= 0.48) notes.push(byId[worst.a].name + ' only ' + pct(worst.wr) + ' vs ' + byId[worst.b].name);
    if (!n) notes.push('Not enough matchup data for this lane');
    return { ...lane, mineIds: mine, theirIds: theirs, score, tier: tierOf(score), notes };
  });
}

export function finalGrade({ draftScore, posRows, lanes }) {
  const posAvg = posRows.length ? posRows.reduce((a, r) => a + r.score, 0) / posRows.length : draftScore;
  const laneAvg = lanes.length ? lanes.reduce((a, l) => a + l.score, 0) / lanes.length : draftScore;
  const score = Math.round(0.7 * draftScore + 0.15 * posAvg + 0.15 * laneAvg);
  return { score, tier: tierOf(score), posAvg: Math.round(posAvg), laneAvg: Math.round(laneAvg) };
}
