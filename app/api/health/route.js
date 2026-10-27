import { kvMode, getJSON, setJSON } from '@/lib/kv';

export const dynamic = 'force-dynamic';

// Shows which room storage the app found. Never returns secrets.
export async function GET() {
  let storageOk = false;
  let error = null;
  try {
    await setJSON('dl:health', { at: Date.now() }, 60);
    storageOk = !!(await getJSON('dl:health'));
  } catch (e) { error = e.message; }
  return Response.json({ storage: kvMode, storageOk, error });
}
