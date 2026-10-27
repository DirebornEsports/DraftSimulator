import { listTeams, saveTeam, deleteTeam } from '@/lib/db';

export const dynamic = 'force-dynamic';
const fail = (e) => Response.json({ error: e.message }, { status: e.status || 500 });

export async function GET() {
  try { return Response.json({ teams: await listTeams() }); } catch (e) { return fail(e); }
}

export async function POST(req) {
  try {
    const body = await req.json();
    return Response.json({ team: await saveTeam(body.team || body) });
  } catch (e) { return fail(e); }
}

export async function DELETE(req) {
  try {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });
    await deleteTeam(id);
    return Response.json({ ok: true });
  } catch (e) { return fail(e); }
}
