// Draft grading engine.
// Every score combines: pro-scene meta strength (OpenDota heroStats),
// counter value from public matchup data (OpenDota hero matchups),
// and team composition needs. Output: 0-100 score, S-F tier, pros, cons.

export const TIERS = [
  { min: 85, t: 'S' }, { min: 75, t: 'A' }, { min: 65, t: 'B' },
  { min: 55, t: 'C' }, { min: 45, t: 'D' }, { min: 0, t: 'F' },
];
export const tierOf = (s) => TIERS.find((x) => s >= x.min).t;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Pro-match hero synergy: { 'a-b': [games, wins] } with a < b. Loaded once on the client.
let SYNERGY = {};
export function setSynergy(pairs) { SYNERGY = pairs || {}; }
export function synergyOf(a, b) {
  const key = a < b ? a + '-' + b : b + '-' + a;
  const p = SYNERGY[key];
  if (!p) return null;
  const [g, w] = p;
  return { g, wr: w / g, delta: (w + 2) / (g + 4) - 0.5 };
}
function bestSynergy(heroId, others) {
  let best = null; let worst = null; let sum = 0;
  for (const o of others) {
    const s = synergyOf(heroId, o);
    if (!s) continue;
    sum += s.delta;
    if (!best || s.delta > best.delta) best = { ...s, o };
    if (!worst || s.delta < worst.delta) worst = { ...s, o };
  }
  return { sum, best, worst };
}
const pct = (x) => Math.round(x * 100) + '%';
const MIN_GAMES = 40;

// Adds .meta (0-100) and .metaRank to every hero.
export function buildMeta(heroes) {
  const maxContest = Math.max(1, ...heroes.map((h) => h.proPick + h.proBan));
  const scored = heroes.map((h) => {
    const contest = (h.proPick + h.proBan) / maxContest;
    const proWR = (h.proWin + 5) / (h.proPick + 10);
    const hiWR = h.hiPick > 0 ? h.hiWin / h.hiPick : 0.5;
    const norm = (wr) => clamp((wr - 0.42) / 0.16, 0, 1);
    const meta = 100 * (0.55 * Math.sqrt(contest) + 0.2 * norm(proWR) + 0.25 * norm(hiWR));
    return { ...h, meta: Math.round(meta), proWR, hiWR };
  });
  const ranked = [...scored].sort((a, b) => b.proPick + b.proBan - (a.proPick + a.proBan));
  ranked.forEach((h, i) => { h.contestRank = i + 1; });
  return scored;
}

const isSupport = (h) => h.roles.includes('Support');
const isCore = (h) => !isSupport(h);
const isCarry = (h) => h.roles.includes('Carry') && !isSupport(h);

// matchups: { [heroId]: { [oppId]: { g, w } } } — wins are for the outer hero.
function edge(matchups, a, b) {
  // Returns how much hero `b` beats hero `a` (positive = b is favoured), plus games.
  const m = matchups[a] && matchups[a][b];
  if (!m || m.g < MIN_GAMES) return null;
  return { adv: 0.5 - m.w / m.g, g: m.g, bWR: 1 - m.w / m.g };
}

export function evaluate({ heroId, type, mine, theirs, byId, matchups }) {
  const h = byId[heroId];
  const pros = [];
  const cons = [];
  let s = 30 + h.meta * 0.6;

  if (h.contestRank <= 10) pros.push('Top ' + h.contestRank + ' most contested hero in pro games right now');
  else if (h.contestRank > 60 && type === 'ban') cons.push('Rarely picked or banned by pro teams this patch');
  if (h.proPick >= 20 && h.proWR >= 0.55) pros.push('Pro win rate ' + pct(h.proWR) + ' over ' + h.proPick + ' games');
  if (h.proPick >= 20 && h.proWR <= 0.45) cons.push('Pro win rate only ' + pct(h.proWR) + ' over ' + h.proPick + ' games');

  if (type === 'pick') {
    let counterSum = 0;
    let best = null; let worst = null;
    for (const e of theirs) {
      const x = edge(matchups, e, heroId); // how much our hero beats enemy e
      if (!x) continue;
      counterSum += x.adv;
      if (!best || x.adv > best.adv) best = { ...x, e };
      if (!worst || x.adv < worst.adv) worst = { ...x, e };
    }
    s += clamp(counterSum * 220, -22, 22);

    const syn = bestSynergy(heroId, mine);
    s += clamp(syn.sum * 90, -12, 15);
    if (syn.best && syn.best.delta >= 0.05) pros.unshift('Pairs well with your ' + byId[syn.best.o].name + ': ' + pct(syn.best.wr) + ' in ' + syn.best.g + ' pro games together');
    if (syn.worst && syn.worst.delta <= -0.06) cons.push('Weak pairing with your ' + byId[syn.worst.o].name + ': ' + pct(syn.worst.wr) + ' in ' + syn.worst.g + ' pro games');
    if (best && best.adv >= 0.02) pros.push('Wins ' + pct(best.bWR) + ' vs their ' + byId[best.e].name + ' (' + best.g.toLocaleString() + ' games)');
    if (worst && worst.adv <= -0.02) cons.push('Only ' + pct(worst.bWR) + ' vs their ' + byId[worst.e].name + ' (' + worst.g.toLocaleString() + ' games)');

    const team = mine.map((id) => byId[id]);
    const supports = team.filter(isSupport).length;
    const carries = team.filter(isCarry).length;
    const cores = team.filter(isCore).length;
    const left = 5 - team.length;
    if (isSupport(h)) {
      if (supports >= 2) { s -= 10; cons.push('Third support: your draft already has two'); }
      else if (left <= 2 - supports) { s += 6; pros.push('Fills a support slot you still need'); }
    } else {
      if (cores >= 3) { s -= 14; cons.push('Fourth core: leaves no room for two supports'); }
      if (isCarry(h) && carries >= 2) { s -= 8; cons.push('Another carry: your draft already has ' + carries); }
      if (isCarry(h) && carries === 0 && team.length >= 2) { s += 5; pros.push('Gives your draft its first real carry'); }
    }
    const initiators = team.filter((x) => x.roles.includes('Initiator')).length;
    if (h.roles.includes('Initiator') && initiators === 0 && team.length >= 1) { s += 4; pros.push('Adds initiation your lineup lacked'); }
    const disablers = team.filter((x) => x.roles.includes('Disabler')).length;
    if (h.roles.includes('Disabler') && disablers < 2) { s += 3; pros.push('Adds lockdown to your lineup'); }
    if (team.length <= 1 && h.meta < 45) { s -= 5; cons.push('Weak first-phase pick that is easy to answer'); }
    if (h.roles.length >= 4 && team.length <= 2) pros.push('Flexible hero that hides your lineup');
  } else {
    // Ban: value = threat to the user's picks + how likely the enemy wants it.
    let threat = 0; let top = null;
    for (const m of mine) {
      const x = edge(matchups, m, heroId); // how much the banned hero beats our hero m
      if (!x) continue;
      threat += x.adv;
      if (!top || x.adv > top.adv) top = { ...x, m };
    }
    s += clamp(threat * 200, -10, 20);
    const combo = bestSynergy(heroId, theirs);
    s += clamp(combo.sum * 80, -4, 14);
    if (combo.best && combo.best.delta >= 0.05) pros.push('Breaks their combo with ' + byId[combo.best.o].name + ' (' + pct(combo.best.wr) + ' in ' + combo.best.g + ' pro games)');
    if (top && top.adv >= 0.02) pros.push('Removes a counter: it wins ' + pct(top.bWR) + ' vs your ' + byId[top.m].name);
    const enemy = theirs.map((id) => byId[id]);
    const enemySupports = enemy.filter(isSupport).length;
    const enemyCores = enemy.filter(isCore).length;
    if (isSupport(h) && enemySupports >= 2) { s -= 10; cons.push('They already have two supports, so lower pick risk'); }
    if (isCore(h) && enemyCores >= 3) { s -= 10; cons.push('They already have three cores, so lower pick risk'); }
    if (h.meta < 40 && !(top && top.adv >= 0.02)) { s -= 6; cons.push('Low threat: unlikely to be picked against you'); }
    if (!pros.length) pros.push('Keeps a playable hero out of the pool');
  }

  if (!pros.length) pros.push('Playable choice with no major red flags');
  if (!cons.length) cons.push('No clear downside spotted by the data');

  const score = Math.round(clamp(s, 5, 99));
  return { score, tier: tierOf(score), pros: pros.slice(0, 3), cons: cons.slice(0, 3) };
}

export function rankOptions({ type, mine, theirs, byId, matchups, used, exclude }) {
  return Object.values(byId)
    .filter((h) => !used.has(h.id) && h.id !== exclude)
    .map((h) => ({ id: h.id, ...evaluate({ heroId: h.id, type, mine, theirs, byId, matchups }) }))
    .sort((a, b) => b.score - a.score);
}

// AI opponent choice.
// AI opponent choice. For level 'team', `profile` (lib/profile.js) makes the AI draft like that team.
export function aiChoose({ level, type, aiPicks, userPicks, byId, matchups, used, preferred = [], profile = null, order = 'F', nth = 1, tendencyFn = null }) {
  const options = rankOptions({ type, mine: aiPicks, theirs: userPicks, byId, matchups, used });
  if (!options.length) return null;
  if (level === 'easy') {
    const metaTop = Object.values(byId).filter((h) => !used.has(h.id)).sort((a, b) => b.meta - a.meta).slice(0, 15);
    return metaTop[Math.floor(Math.random() * metaTop.length)].id;
  }
  if (level === 'team' && ((profile && profile.n && tendencyFn) || preferred.length)) {
    const weighted = options.map((o) => {
      const t = profile && profile.n && tendencyFn ? tendencyFn(profile, { order, type, nth, heroId: o.id }) : 0;
      const pool = type === 'pick' && preferred.includes(o.id) ? 0.35 : 0;
      return { id: o.id, w: 0.3 * (o.score / 100) + 2.5 * t + pool };
    }).sort((a, b) => b.w - a.w).slice(0, 10);
    if (Math.random() < 0.85) {
      const total = weighted.reduce((a, x) => a + Math.pow(x.w, 3), 0);
      let r = Math.random() * total;
      for (const x of weighted) { r -= Math.pow(x.w, 3); if (r <= 0) return x.id; }
      return weighted[0].id;
    }
  }
  const r = Math.random();
  return (r < 0.7 ? options[0] : r < 0.9 ? options[1] || options[0] : options[2] || options[0]).id;
}

export function overallGrade(log) {
  if (!log.length) return { score: 0, tier: 'F' };
  const score = Math.round(log.reduce((a, l) => a + l.score, 0) / log.length);
  return { score, tier: tierOf(score) };
}
