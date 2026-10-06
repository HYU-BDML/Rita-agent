import { NextRequest } from 'next/server';
import { json, body } from '@/lib/cora/http';
import { timeline } from '@/lib/cora/timeline';
import { checkNarration } from '@/lib/cora/video/narration';
import { auth, fail } from '@/lib/cora/video/http';
export const runtime = 'nodejs';
/** F051: POST {scenes:[{seconds,subtitle}], rate?} -> warnings and a suggested seconds array. Nothing is applied or saved. */
export async function POST(req: NextRequest) {
  const a = auth(req, true); if ('res' in a) return a.res;
  try { const b = await body(req); const scenes = Array.isArray(b.scenes) ? timeline(b.scenes.length, b.scenes) : timeline(0, b.scenes);
    return json({ ...checkNarration(scenes, typeof b.rate === 'number' ? b.rate : undefined), applied: false }); } catch (e) { return fail(e); }
}
