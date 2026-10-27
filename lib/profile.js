// Draft profile of a team, built from its imported pro matches.
// Each match: { pb: [[isPick, heroId, side 0|1], ...], side: 'radiant'|'dire', radiantWin }.

const inc = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };

export function buildProfile(team) {
  const matches = (team?.matches || []).filter((m) => m.side && m.pb && m.pb.length >= 20);
  const p = {
    n: matches.length, wins: 0, firstPickGames: 0,
    picks: {}, bans: {}, heroGames: {}, heroWins: {},
    slot: { F: {}, S: {} },          // slot.F['pick1'][heroId] = count
    games: { F: 0, S: 0 },
    bannedAgainst: {},               // heroes opponents ban vs this team
  };
  for (const m of matches) {
    const mine = m.side === 'radiant' ? 0 : 1;
    const won = m.radiantWin === (mine === 0);
    const first = m.pb[0][2] === mine; // first action is the first-pick team's ban
    const order = first ? 'F' : 'S';
    if (won) p.wins++;
    if (first) p.firstPickGames++;
    p.games[order]++;
    const count = { pick: 0, ban: 0 };
    for (const [isPick, heroId, side] of m.pb) {
      const type = isPick ? 'pick' : 'ban';
      if (side !== mine) { if (!isPick) inc(p.bannedAgainst, heroId); continue; }
      count[type]++;
      const key = type + count[type];
      p.slot[order][key] = p.slot[order][key] || {};
      inc(p.slot[order][key], heroId);
      if (isPick) { inc(p.picks, heroId); inc(p.heroGames, heroId); if (won) inc(p.heroWins, heroId); }
      else inc(p.bans, heroId);
    }
  }
  return p;
}

export function top(obj, n = 8) {
  return Object.entries(obj || {}).map(([id, c]) => ({ id: Number(id), c })).sort((a, b) => b.c - a.c).slice(0, n);
}

// Weight for the AI: how strongly this team tends to take `heroId` at this point of the draft.
// order: 'F' | 'S'; type: 'pick' | 'ban'; nth: 1-based count of this team's picks/bans so far.
export function tendency(profile, { order, type, nth, heroId }) {
  if (!profile || !profile.n) return 0;
  const slotMap = profile.slot[order]?.[type + nth] || {};
  const slotGames = profile.games[order] || 1;
  const slotShare = (slotMap[heroId] || 0) / slotGames;
  const overall = (type === 'pick' ? profile.picks : profile.bans)[heroId] || 0;
  const overallShare = overall / profile.n;
  return slotShare * 2 + overallShare;
}
