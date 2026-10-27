import { listHistory, addHistory, patchHistory } from '@/lib/db';

export const dynamic = 'force-dynamic';
const fail = (e) => Response.json({ error: e.message }, { status: e.status || 500 });

export async function GET(req) {
  try {
    const id = new URL(req.url).searchParams.get('id');
    const list = await listHistory();
    if (id) return Response.json({ entry: list.find((e) => e.id === id) || null });
    return Response.json({ history: list.slice(0, 150) });
  } catch (e) { return fail(e); }
}

export async function POST(req) {
  try { return Response.json({ entry: await addHistory(await req.json()) }); } catch (e) { return fail(e); }
}

// Body: { id, patch: { positions } }
export async function PATCH(req) {
  try {
    const { id, patch } = await req.json();
    return Response.json({ entry: await patchHistory(id, patch || {}) });
  } catch (e) { return fail(e); }
}
