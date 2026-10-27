import { updateMatch } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Body: { matchId, side: 'radiant' | 'dire' } or { matchId, remove: true }
export async function POST(req, { params }) {
  const { id } = await params;
  try {
    const body = await req.json();
    return Response.json({ team: await updateMatch(id, body.matchId, body) });
  } catch (e) {
    return Response.json({ error: e.message }, { status: e.status || 500 });
  }
}
