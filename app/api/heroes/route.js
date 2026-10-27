import { getHeroes } from '@/lib/opendota';

export const revalidate = 43200;

export async function GET() {
  try {
    const heroes = await getHeroes();
    return Response.json({ heroes, fetchedAt: new Date().toISOString() });
  } catch (e) {
    return Response.json({ error: String(e.message || e) }, { status: 502 });
  }
}
