import { getMatchups } from '@/lib/opendota';

export async function GET(_req, { params }) {
  const { id } = await params;
  const heroId = Number(id);
  if (!Number.isInteger(heroId) || heroId <= 0) {
    return Response.json({ error: 'Invalid hero id' }, { status: 400 });
  }
  try {
    const matchups = await getMatchups(heroId);
    return Response.json({ heroId, matchups }, {
      headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=86400' },
    });
  } catch (e) {
    return Response.json({ error: String(e.message || e) }, { status: 502 });
  }
}
