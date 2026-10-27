import { normCode, readRoom, joinRoom, setReady, act, rematch, publicRoom } from '@/lib/room';

export const dynamic = 'force-dynamic';

const tokenOf = (req) => req.headers.get('x-room-token') || null;

export async function GET(req, { params }) {
  const code = normCode((await params).code);
  try {
    const room = await readRoom(code);
    if (!room) return Response.json({ error: 'Room not found' }, { status: 404 });
    return Response.json(publicRoom(room, tokenOf(req)), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return Response.json({ error: e.message }, { status: e.status || 500 });
  }
}

// One endpoint for every room action: { type: 'join' | 'ready' | 'action' | 'rematch', ... }
export async function POST(req, { params }) {
  const code = normCode((await params).code);
  const tok = tokenOf(req);
  try {
    const body = await req.json().catch(() => ({}));
    if (body.type === 'join') {
      const { room, token, team } = await joinRoom(code, body.name);
      return Response.json({ room: publicRoom(room, token), token, team });
    }
    if (body.type === 'ready') return Response.json(publicRoom(await setReady(code, tok, body.ready), tok));
    if (body.type === 'action') return Response.json(publicRoom(await act(code, tok, Number(body.heroId)), tok));
    if (body.type === 'rematch') return Response.json(publicRoom(await rematch(code, tok), tok));
    return Response.json({ error: 'Unknown request' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e.message }, { status: e.status || 500 });
  }
}
