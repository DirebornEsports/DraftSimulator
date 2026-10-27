// Server-side helpers for the OpenDota API. Responses are cached by Next.js
// so the app never hits OpenDota on every click.

const BASE = 'https://api.opendota.com/api';
const CDN = 'https://cdn.cloudflare.steamstatic.com';

async function od(path, revalidate) {
  const key = process.env.OPENDOTA_API_KEY;
  const url = BASE + path + (key ? (path.includes('?') ? '&' : '?') + 'api_key=' + key : '');
  const res = await fetch(url, { next: { revalidate } });
  if (!res.ok) throw new Error('OpenDota ' + path + ' failed: ' + res.status);
  return res.json();
}

export async function getHeroes() {
  const raw = await od('/heroStats', 60 * 60 * 12);
  return raw.map((h) => {
    const slug = (h.name || '').replace('npc_dota_hero_', '');
    const img = h.img ? CDN + h.img.replace(/\?$/, '') : CDN + '/apps/dota2/images/dota_react/heroes/' + slug + '.png';
    const icon = h.icon ? CDN + h.icon.replace(/\?$/, '') : null;
    return {
      id: h.id,
      name: h.localized_name,
      slug,
      attr: h.primary_attr === 'all' ? 'uni' : h.primary_attr,
      roles: h.roles || [],
      attackType: h.attack_type,
      img,
      icon,
      proPick: h.pro_pick || 0,
      proBan: h.pro_ban || 0,
      proWin: h.pro_win || 0,
      hiPick: (h['7_pick'] || 0) + (h['8_pick'] || 0),
      hiWin: (h['7_win'] || 0) + (h['8_win'] || 0),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getMatchups(heroId) {
  const raw = await od('/heroes/' + heroId + '/matchups', 60 * 60 * 24);
  const out = {};
  for (const m of raw) out[m.hero_id] = { g: m.games_played, w: m.wins };
  return out;
}

// Hero pairs on the same team in pro matches over the last 120 days.
export async function getSynergy() {
  const sql = "SELECT pm1.hero_id a, pm2.hero_id b, count(*) games, sum(case when (pm1.player_slot<128)=m.radiant_win then 1 else 0 end) wins "
    + 'FROM matches m JOIN player_matches pm1 ON pm1.match_id=m.match_id '
    + 'JOIN player_matches pm2 ON pm2.match_id=m.match_id AND pm1.hero_id < pm2.hero_id AND (pm1.player_slot<128)=(pm2.player_slot<128) '
    + "WHERE m.start_time > extract(epoch from now() - interval '120 days') "
    + 'GROUP BY pm1.hero_id, pm2.hero_id HAVING count(*) >= 8';
  const d = await od('/explorer?sql=' + encodeURIComponent(sql), 60 * 60 * 24);
  if (d.err) throw new Error(String(d.err));
  const pairs = {};
  for (const r of d.rows || []) pairs[r.a + '-' + r.b] = [Number(r.games), Number(r.wins)];
  return pairs;
}

// How often each hero plays each position in pro matches (last 180 days).
// Position = lane + farm rank in its team: top-3 farm on safe/mid/off = Pos 1/2/3; others = Pos 5 (safe) / Pos 4.
export async function getPositionData() {
  const sql = 'SELECT hero_id, pos, count(*) games FROM (SELECT pm.hero_id, CASE WHEN r <= 3 THEN (CASE pm.lane_role WHEN 1 THEN 1 WHEN 2 THEN 2 WHEN 3 THEN 3 ELSE NULL END) '
    + 'ELSE (CASE pm.lane_role WHEN 1 THEN 5 WHEN 3 THEN 4 ELSE 4 END) END pos FROM (SELECT pm.hero_id, pm.lane_role, '
    + 'row_number() OVER (PARTITION BY pm.match_id, (pm.player_slot < 128) ORDER BY pm.gold_per_min DESC) r '
    + "FROM player_matches pm JOIN matches m ON m.match_id = pm.match_id WHERE m.start_time > extract(epoch from now() - interval '180 days')) pm) t "
    + 'WHERE pos IS NOT NULL GROUP BY hero_id, pos';
  const d = await od('/explorer?sql=' + encodeURIComponent(sql), 60 * 60 * 24);
  if (d.err) throw new Error(String(d.err));
  const out = {};
  for (const r of d.rows || []) { (out[r.hero_id] = out[r.hero_id] || {})[r.pos] = Number(r.games); }
  return out;
}

export async function getTeam(teamId) {
  return od('/teams/' + teamId, 60 * 60 * 6);
}

export async function getTeamMatches(teamId) {
  return od('/teams/' + teamId + '/matches', 60 * 30);
}

export async function getProMatches() {
  return od('/proMatches', 60 * 60);
}

export async function getMatch(id) {
  return od('/matches/' + id, 60 * 60 * 24 * 7);
}
