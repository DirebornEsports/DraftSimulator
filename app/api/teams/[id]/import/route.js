import { importMatches } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Body: { matchIds?: [..], odTeamId?: number, limit?: number }
export async function POST(req, { params }) {
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    return Response.json(await importMatches(id, body));
  } catch (e) {
    return Response.json({ error: e.message }, { status: e.status || 500 });
  }
}
