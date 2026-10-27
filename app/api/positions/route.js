import { getPositionData } from '@/lib/opendota';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  try {
    return Response.json({ heroes: await getPositionData() });
  } catch (e) {
    return Response.json({ heroes: {}, error: String(e.message || e) });
  }
}
