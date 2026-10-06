import { NextRequest } from 'next/server';
import { json, body } from '@/lib/cora/http';
import { store } from '@/lib/cora/store';
import { auth, fail } from '@/lib/cora/video/http';
import { withUserLock } from '@/lib/cora/video/lock';
import { videoStore } from '@/lib/cora/video/db';
import { parseMotion, renderMotion } from '@/lib/cora/video/motion';
import { enforceManifest, type MediaItem } from '@/lib/cora/video/manifest';
import { validateBgm } from '@/lib/cora/video/template';
import { audioPath } from '@/lib/cora/video/audio';
export const runtime = 'nodejs'; export const maxDuration = 150;
/** F047: POST {title, lines[<=6], seconds 5-30, ratio, background?, color?, accent?, bgm?, strict?}. Result is a normal video item (download via /api/cora/video/:id). */
export async function POST(req: NextRequest) {
  const a = auth(req, true); if ('res' in a) return a.res; const u = a.u;
  try {
    return await withUserLock(u.id, async () => {
      const b = await body(req); const input = parseMotion(b); const bgmIn = validateBgm(b.bgm); let bgm; const items: MediaItem[] = [];
      if (bgmIn) { const row = videoStore().getAudio(u.id, bgmIn.id); if (!row) throw new Error('배경음악을 찾을 수 없습니다.'); bgm = { ...bgmIn, file: audioPath(u.id, row) }; items.push({ kind: 'bgm', ref: row.id, source: row.source as MediaItem['source'], license: row.license }); }
      const strict = b.strict === true || process.env.CORA_VIDEO_STRICT_MEDIA === '1'; const manifest = enforceManifest(items, strict).items;
      const id = store().addItem(u.id, 'video', '모션그래픽 영상', { status: 'rendering' }).id;
      try { const data = await renderMotion(u.id, id, input, bgm); const full = { ...data, manifest, strict, settingsVersion: 1, settings: { ...input, bgm: bgmIn }, warnings: [] as string[] };
        store().updateItem(u.id, id, full); return json({ id, ...full, url: `/api/cora/video/${id}` }); }
      catch (e) { store().updateItem(u.id, id, { status: 'failed' }); throw e; }
    });
  } catch (e) { return fail(e, '렌더 실패'); }
}
