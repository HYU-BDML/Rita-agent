import { NextRequest } from 'next/server';
import { json } from '@/lib/cora/http';
import { auth, bigJson, fail } from '@/lib/cora/video/http';
import { saveAudio } from '@/lib/cora/video/audio';
import { videoStore } from '@/lib/cora/video/db';
import { LIMITS } from '@/lib/cora/video/clips';
export const runtime = 'nodejs';
export async function GET(req: NextRequest) { const a = auth(req, false); if ('res' in a) return a.res; return json({ audio: videoStore().listAudio(a.u.id) }); }
/** F043: POST {name, data (base64 mp3/m4a/wav, <=10MB), license (required), source?} */
export async function POST(req: NextRequest) {
  const a = auth(req, true); if ('res' in a) return a.res;
  try { if (videoStore().listAudio(a.u.id).length >= LIMITS.audio) throw new Error(`배경음악은 ${LIMITS.audio}개까지 보관합니다.`);
    return json({ audio: await saveAudio(a.u.id, await bigJson(req, 14_500_000)) }); } catch (e) { return fail(e); }
}
