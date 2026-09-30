import { NextRequest } from 'next/server';
import { json, body } from '@/lib/cora/http';
import { store } from '@/lib/cora/store';
import { renderVideo } from '@/lib/cora/video';
import { auth, fail, versionOf } from '@/lib/cora/video/http';
import { withUserLock } from '@/lib/cora/video/lock';
import { videoStore, VersionConflict } from '@/lib/cora/video/db';
import { cardMedia, enforceManifest, type MediaItem } from '@/lib/cora/video/manifest';
import { validateBgm } from '@/lib/cora/video/template';
import { audioPath } from '@/lib/cora/video/audio';
export const runtime = 'nodejs'; export const maxDuration = 150;
/**
 * Render request (all new fields optional; the original {frames, seconds, scenes} body still works):
 *  ratio '9:16'|'4:5'|'1:1', lang 'kor'|'eng', subtitles {track, burn, style}, scenes[i].keyword (highlight word),
 *  bgm {id, volume 0-1, fadeOut s}, media [{source, license, url?}] per frame, strict (refuse media without a license note).
 * F052: re-rendering an existing video needs videoId + expectedVersion (= settingsVersion the editor loaded); a stale value gives 409.
 */
export async function POST(req: NextRequest) {
  const a = auth(req, true); if ('res' in a) return a.res; const u = a.u;
  try {
    return await withUserLock(u.id, async () => {
      const b = await body(req); if (!Array.isArray(b.frames)) throw new Error('장면이 필요합니다.');
      const sub = (b.subtitles ?? {}) as { track?: boolean; burn?: boolean; style?: unknown };
      let previous: { id: string; data: Record<string, unknown>; version: number } | null = null;
      if (b.videoId !== undefined) {
        const it = typeof b.videoId === 'string' ? store().item(u.id, b.videoId) : null; if (!it || it.kind !== 'video') throw new Error('다시 만들 영상을 찾을 수 없습니다.');
        if (it.data.status === 'rendering') throw new VersionConflict(Number(it.data.settingsVersion ?? 1));
        const current = Number(it.data.settingsVersion ?? 1); if (versionOf(b.expectedVersion) !== current) throw new VersionConflict(current);
        previous = { id: it.id, data: it.data, version: current };
      }
      const bgmIn = validateBgm(b.bgm); let bgm; const extra: MediaItem[] = [];
      if (bgmIn) { const row = videoStore().getAudio(u.id, bgmIn.id); if (!row) throw new Error('배경음악을 찾을 수 없습니다.'); bgm = { ...bgmIn, file: audioPath(u.id, row) }; extra.push({ kind: 'bgm', ref: row.id, source: row.source as MediaItem['source'], license: row.license }); }
      const strict = b.strict === true || process.env.CORA_VIDEO_STRICT_MEDIA === '1';
      const manifest = enforceManifest([...cardMedia(b.media, b.frames.length), ...extra], strict).items;
      let id = previous?.id;
      if (previous) store().updateItem(u.id, previous.id, { ...previous.data, status: 'rendering' }); else id = store().addItem(u.id, 'video', '카드뉴스 영상', { status: 'rendering' }).id;
      try {
        const data = await renderVideo(u.id, id!, b.frames, b.seconds, b.scenes, { ratio: b.ratio, lang: b.lang, track: sub.track, burn: sub.burn, style: sub.style, bgm, manifest, narrationRate: typeof b.narrationRate === 'number' ? b.narrationRate : undefined });
        const settingsVersion = (previous?.version ?? 0) + 1; store().updateItem(u.id, id!, { ...data, strict, settingsVersion, renderedAt: new Date().toISOString() });
        return json({ id, ...data, strict, settingsVersion, url: `/api/cora/video/${id}` });
      } catch (e) { if (previous) store().updateItem(u.id, previous.id, previous.data); else store().updateItem(u.id, id!, { status: 'failed' }); throw e; }
    });
  } catch (e) { return fail(e, '렌더 실패'); }
}
