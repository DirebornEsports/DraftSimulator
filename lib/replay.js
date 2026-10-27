import { STEPS } from './draft';
import { evaluate, rankOptions } from './grade';

// Turns a flat list of actions (one hero id or null per step) into picks/bans per team.
export function splitActions(actions) {
  const picks = { 1: [], 2: [] };
  const bans = { 1: [], 2: [] };
  actions.forEach((heroId, i) => {
    const s = STEPS[i];
    if (!s) return;
    (s.type === 'pick' ? picks : bans)[s.team].push(heroId);
  });
  return { picks, bans };
}

// Grades one step given everything that happened before it.
export function gradeStep({ actions, stepIdx, byId, matchups }) {
  const s = STEPS[stepIdx];
  const heroId = actions[stepIdx];
  const before = splitActions(actions.slice(0, stepIdx));
  const mine = before.picks[s.team].filter(Boolean);
  const theirs = before.picks[s.team === 1 ? 2 : 1].filter(Boolean);
  if (heroId == null) {
    return { step: stepIdx, type: s.type, heroId: null, score: 5, tier: 'F', pros: ['—'], cons: ['Timer ran out: the ban was lost'], alts: [] };
  }
  const used = new Set(actions.slice(0, stepIdx + 1).filter(Boolean));
  const ev = evaluate({ heroId, type: s.type, mine, theirs, byId, matchups });
  const alts = rankOptions({ type: s.type, mine, theirs, byId, matchups, used, exclude: heroId })
    .filter((o) => o.score > ev.score).slice(0, 2)
    .map((o) => ({ heroId: o.id, tier: o.tier, score: o.score, why: o.pros[0] }));
  return { step: stepIdx, type: s.type, heroId, ...ev, alts };
}

// Grades every action of one team.
export function gradeTeam({ actions, team, byId, matchups }) {
  return actions
    .map((_, i) => i)
    .filter((i) => STEPS[i] && STEPS[i].team === team)
    .map((i) => gradeStep({ actions, stepIdx: i, byId, matchups }));
}
