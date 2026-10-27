import { createRoom, publicRoom } from '@/lib/room';
import { kvConfigured } from '@/lib/kv';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const { room, token, team } = await createRoom(body);
    return Response.json({ room: publicRoom(room, token), token, team, persistent: kvConfigured });
  } catch (e) {
    return Response.json({ error: e.message }, { status: e.status || 500 });
  }
}
