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

export async function getProMatches() {
  return od('/proMatches', 60 * 60);
}

export async function getMatch(id) {
  return od('/matches/' + id, 60 * 60 * 24 * 7);
}
