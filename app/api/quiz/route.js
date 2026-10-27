import { getProMatches, getMatch } from '@/lib/opendota';

export const dynamic = 'force-dynamic';

// Returns one recent pro match that has a complete 24-step Captain's Mode draft.
export async function GET(req) {
  const exclude = new Set((new URL(req.url).searchParams.get('exclude') || '').split(',').filter(Boolean));
  try {
    const list = (await getProMatches()).filter((m) => !exclude.has(String(m.match_id)));
    const pool = list.slice(0, 60);
    for (let attempt = 0; attempt < 6 && pool.length; attempt++) {
      const idx = Math.floor(Math.random() * pool.length);
      const m = pool.splice(idx, 1)[0];
      const match = await getMatch(m.match_id).catch(() => null);
      const pb = match && match.picks_bans;
      if (!pb || pb.length !== 24) continue;
      return Response.json({
        matchId: m.match_id,
        league: m.league_name || match.league?.name || 'Pro match',
        radiant: m.radiant_name || 'Radiant',
        dire: m.dire_name || 'Dire',
        startTime: m.start_time,
        radiantWin: m.radiant_win,
        patch: match.patch || null,
        picksBans: pb
          .sort((a, b) => a.order - b.order)
          .map((x) => ({ isPick: x.is_pick, heroId: x.hero_id, team: x.team, order: x.order })),
      });
    }
    return Response.json({ error: 'No complete pro draft found right now. Try again.' }, { status: 503 });
  } catch (e) {
    return Response.json({ error: String(e.message || e) }, { status: 502 });
  }
}
