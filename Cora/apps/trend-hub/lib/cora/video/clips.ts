import { mkdir, mkdtemp, open, rename, rm, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { run, ffmpegBin, probe } from './ffmpeg';
import { videoStore, type SourceRow } from './db';
import { safeId, userVideoDir } from './paths';
import { rasterize } from './raster';
import { clipRange, formatSrt, parseSrt, shiftSegments } from './srt';
import { parseLang, type Lang } from './geometry';
import { validateStyle } from './template';
/** E207 owned long-form video: chunked upload, SRT segments, cutting clips. All paths derive from the caller's user id. */
export const SOURCE_MAX_BYTES = 200 * 1024 * 1024, CHUNK_MAX_BYTES = 8 * 1024 * 1024, SRT_MAX_BYTES = 1024 * 1024, SOURCE_MAX_SECONDS = 4 * 3600;
export const LIMITS = { sources: 10, clips: 50, audio: 20, templates: 30 };
const EXTS = ['mp4', 'mov', 'm4v', 'mkv', 'webm'];
export const sourcePath = (userId: string, s: Pick<SourceRow, 'id' | 'ext'>) => path.join(userVideoDir(userId, 'sources'), `${safeId(s.id)}.${s.ext}`);
export const clipPath = (userId: string, id: string) => path.join(userVideoDir(userId, 'clips'), `${safeId(id)}.mp4`);
export function beginSource(userId: string, b: Record<string, unknown>) {
  const name = typeof b.name === 'string' ? b.name.replace(/[\u0000-\u001f/\\]/g, '').trim().slice(0, 120) : ''; const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (!name || !EXTS.includes(ext)) throw new Error(`영상 파일 이름과 확장자(${EXTS.join(', ')})가 필요합니다.`);
  if (!Number.isInteger(b.size) || (b.size as number) < 1 || (b.size as number) > SOURCE_MAX_BYTES) throw new Error('영상은 200MB 이하여야 합니다.');
  if (videoStore().listSources(userId).length >= LIMITS.sources) throw new Error(`원본 영상은 ${LIMITS.sources}개까지 보관합니다. 하나를 삭제한 뒤 올려 주세요.`);
  return videoStore().addSource(userId, name, ext, b.size as number);
}
/** Writes one chunk at `offset`; the offset must equal the bytes already stored, so retries and races cannot corrupt the file. */
export async function appendChunk(userId: string, id: string, offset: number, data: Buffer) {
  const s = videoStore().getSource(userId, id); if (!s) throw new Error('원본 영상을 찾을 수 없습니다.');
  if (s.status !== 'uploading') throw new Error('이미 업로드가 끝난 영상입니다.');
  if (!data.length || data.length > CHUNK_MAX_BYTES) throw new Error('조각은 1바이트~8MB여야 합니다.');
  if (!Number.isInteger(offset) || offset !== s.received) throw new Error(`이어 붙일 위치가 맞지 않습니다. 서버가 받은 바이트: ${s.received}`);
  if (s.received + data.length > s.size) throw new Error('선언한 파일 크기를 넘었습니다.');
  await mkdir(userVideoDir(userId, 'sources'), { recursive: true });
  const fh = await open(sourcePath(userId, s), offset === 0 ? 'w' : 'r+'); try { await fh.write(data, 0, data.length, offset); } finally { await fh.close(); }
  if (!videoStore().advanceSource(userId, id, offset, data.length)) throw new Error('동시에 다른 조각이 저장되었습니다. 다시 시도해 주세요.');
  return { received: s.received + data.length, size: s.size };
}
export async function completeSource(userId: string, id: string) {
  const s = videoStore().getSource(userId, id); if (!s) throw new Error('원본 영상을 찾을 수 없습니다.');
  if (s.status === 'ready') return s; if (s.received !== s.size) throw new Error(`아직 ${s.size - s.received}바이트가 남았습니다.`);
  const file = sourcePath(userId, s);
  try {
    if ((await stat(file)).size !== s.size) throw new Error('저장된 파일 크기가 다릅니다. 다시 올려 주세요.');
    const info = await probe(file);
    if (!info.hasVideo || !(info.duration > 0.5) || info.duration > SOURCE_MAX_SECONDS || info.width < 16) throw new Error('재생할 수 있는 영상(0.5초~4시간)이 아닙니다.');
    videoStore().finishSource(userId, id, { duration: Math.round(info.duration * 1000) / 1000, width: info.width, height: info.height, hasAudio: info.hasAudio });
    return videoStore().getSource(userId, id)!;
  } catch (e) { await removeSource(userId, id); throw e; }
}
export function attachSrt(userId: string, id: string, text: string) {
  const s = videoStore().getSource(userId, id); if (!s) throw new Error('원본 영상을 찾을 수 없습니다.'); if (s.status !== 'ready') throw new Error('영상 업로드를 먼저 완료해 주세요.');
  const segments = parseSrt(text); const last = Math.max(...segments.map(x => x.end));
  if (last > s.duration + 2) throw new Error(`자막이 영상 길이(${s.duration}초)보다 깁니다. 자막 마지막 시각: ${last}초`);
  videoStore().setSourceSrt(userId, id, segments); return segments;
}
export async function removeSource(userId: string, id: string) {
  const s = videoStore().getSource(userId, id); if (!s) return false;
  for (const c of videoStore().clipIdsForSource(userId, id)) await rm(clipPath(userId, c), { force: true });
  videoStore().deleteSource(userId, id); await rm(sourcePath(userId, s), { force: true }); return true;
}
export async function removeClip(userId: string, id: string) { if (!videoStore().deleteClip(userId, id)) return false; await rm(clipPath(userId, id), { force: true }); return true; }
export interface ClipRequest { segments: number[]; pad: number; burn: boolean; track: boolean; lang: Lang; style: ReturnType<typeof validateStyle> }
export function parseClipRequest(b: Record<string, unknown>): ClipRequest {
  const pad = b.pad === undefined ? 0 : b.pad; if (typeof pad !== 'number') throw new Error('앞뒤 여유는 숫자여야 합니다.');
  for (const k of ['burn', 'track']) if (b[k] !== undefined && typeof b[k] !== 'boolean') throw new Error(`${k}는 true 또는 false여야 합니다.`);
  return { segments: b.segments as number[], pad, burn: b.burn === true, track: b.track === true, lang: parseLang(b.lang), style: validateStyle(b.style) };
}
export async function cutClip(userId: string, sourceId: string, req: ClipRequest) {
  const s = videoStore().getSource(userId, sourceId); if (!s || s.status !== 'ready') throw new Error('원본 영상을 찾을 수 없습니다.');
  if (!s.srt) throw new Error('이 영상에 자막(SRT) 파일을 먼저 올려 주세요.');
  if (videoStore().listClips(userId).length >= LIMITS.clips) throw new Error(`클립은 ${LIMITS.clips}개까지 보관합니다. 하나를 삭제한 뒤 만들어 주세요.`);
  const range = clipRange(s.srt, req.segments, s.duration, req.pad); const shifted = shiftSegments(s.srt, range.start, range.end);
  const id = randomUUID(); const dir = userVideoDir(userId, 'clips'); await mkdir(dir, { recursive: true }); const work = await mkdtemp(path.join(dir, 'work-')); const out = path.join(dir, `${id}.tmp.mp4`);
  try {
    const args = ['-y', '-ss', String(range.start), '-i', sourcePath(userId, s)]; let n = 1; let srtIdx = -1;
    if (req.track) { await writeFile(path.join(work, 'clip.srt'), formatSrt(shifted)); args.push('-i', path.join(work, 'clip.srt')); srtIdx = n++; }
    const ew = s.width - (s.width % 2), eh = s.height - (s.height % 2); const chains = [`[0:v]scale=${ew}:${eh},setsar=1[v0]`]; let last = 0;
    if (req.burn) {
      const scale = Math.min(ew, eh) / 1080; const jobs = shifted.map((seg, i) => ({ out: path.join(work, `s${i}.png`), text: seg.text }));
      await rasterize(jobs.map(j => ({ ...j, size: Math.max(16, Math.round(req.style.size * scale)), maxWidth: Math.round(ew * .82), color: req.style.color, highlight: req.style.highlight, mode: 'subtitle' as const, canvasWidth: ew, canvasHeight: eh, position: req.style.position })));
      shifted.forEach((seg, i) => { args.push('-i', jobs[i].out); chains.push(`[v${i}][${n}:v]overlay=0:0:enable='between(t,${seg.start.toFixed(3)},${seg.end.toFixed(3)})'[v${i + 1}]`); n++; last = i + 1; });
    }
    args.push('-filter_complex', chains.join(';'), '-map', `[v${last}]`); if (s.hasAudio) args.push('-map', '0:a:0');
    if (req.track) args.push('-map', `${srtIdx}:s:0`, '-c:s', 'mov_text', '-metadata:s:s:0', `language=${req.lang}`);
    args.push('-t', String(range.duration), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', ...(s.hasAudio ? ['-c:a', 'aac', '-b:a', '128k'] : []), '-movflags', '+faststart', out);
    await run(ffmpegBin(), args, { timeoutMs: 300000, failMessage: '클립 자르기에 실패했습니다.' }); await rename(out, clipPath(userId, id));
    const clip = videoStore().addClip(userId, id, { sourceId, start: range.start, end: range.end, burn: req.burn, track: req.track, bytes: (await stat(clipPath(userId, id))).size });
    return { clip, duration: range.duration, subtitleSegments: shifted.length };
  } finally { await rm(work, { recursive: true, force: true }); await rm(out, { force: true }); }
}
