import { getSynergy } from '@/lib/opendota';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  try {
    const pairs = await getSynergy();
    return Response.json({ pairs, count: Object.keys(pairs).length });
  } catch (e) {
    return Response.json({ pairs: {}, error: String(e.message || e) });
  }
}
