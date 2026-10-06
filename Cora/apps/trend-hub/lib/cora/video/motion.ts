import { mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { run, ffmpegBin } from './ffmpeg';
import { BRAND_COLOR, hexColor, ratioGeometry } from './geometry';
import { rasterize } from './raster';
import { bgmFilter, videoPath } from '../video';
/** F047 text-only motion video: title + up to 6 lines slide/fade in over a solid brand color. Duration 5-30 s. */
export interface MotionInput { title: string; lines: string[]; seconds: number; ratio: ReturnType<typeof ratioGeometry>['ratio']; background: string; color: string; accent: string }
export function parseMotion(b: Record<string, unknown>): MotionInput {
  const title = typeof b.title === 'string' ? b.title.trim() : ''; if (!title || title.length > 40) throw new Error('제목은 1~40자여야 합니다.');
  const lines = b.lines === undefined ? [] : b.lines; if (!Array.isArray(lines) || lines.length > 6 || lines.some(l => typeof l !== 'string' || !l.trim() || l.length > 60 || /[\u0000-\u001f]/.test(l))) throw new Error('본문 줄은 60자 이하 문장 최대 6개입니다.');
  const seconds = b.seconds === undefined ? 10 : b.seconds; if (typeof seconds !== 'number' || !(seconds >= 5 && seconds <= 30)) throw new Error('영상 길이는 5~30초입니다.');
  return { title, lines: (lines as string[]).map(l => l.trim()), seconds, ratio: ratioGeometry(b.ratio).ratio, background: hexColor(b.background, BRAND_COLOR, '배경색'), color: hexColor(b.color, '#ffffff', '글자색'), accent: hexColor(b.accent, '#ffd84d', '강조색') };
}
export const FADE_IN = .6, FADE_OUT = .5;
/** Start second of each element (index 0 = title). Every element has finished fading in before the shared fade-out starts. */
export function motionSchedule(lineCount: number, seconds: number) {
  const step = Math.min(1, (seconds - 2.5) / Math.max(1, lineCount)); const starts = [.3, ...Array.from({ length: lineCount }, (_, i) => Math.round((1 + i * step) * 100) / 100)];
  return { starts, fadeOutStart: Math.round((seconds - FADE_OUT - .1) * 100) / 100 };
}
export async function renderMotion(userId: string, id: string, input: MotionInput, bgm?: { id: string; file: string; volume: number; fadeOut: number }) {
  const geo = ratioGeometry(input.ratio); const dir = videoPath(userId, id); await mkdir(dir, { recursive: true }); const work = await mkdtemp(path.join(dir, 'work-'));
  try {
    const texts = [input.title, ...input.lines];
    const sized = await rasterize(texts.map((text, i) => ({ out: path.join(work, `t${i}.png`), text, mode: 'block' as const, size: i === 0 ? Math.round(geo.width * .078) : Math.round(geo.width * .048), maxWidth: Math.round(geo.width * .84), color: input.color, highlight: input.accent, bold: i === 0, keyword: i === 0 ? text : '' })));
    const gap = 36, total = sized.reduce((s, r) => s + r.height, 0) + gap * (sized.length - 1); let y = Math.round((geo.height - total) / 2); const ys = sized.map(r => { const at = y; y += r.height + gap; return at; });
    const { starts, fadeOutStart } = motionSchedule(input.lines.length, input.seconds); const D = input.seconds;
    const args = ['-y', '-f', 'lavfi', '-i', `color=c=0x${input.background.slice(1)}:s=${geo.width}x${geo.height}:r=24:d=${D}`];
    sized.forEach(r => args.push('-loop', '1', '-framerate', '24', '-t', String(D), '-i', r.out));
    if (bgm) args.push('-stream_loop', '-1', '-i', bgm.file);
    const chains: string[] = [];
    sized.forEach((r, k) => {
      const s = starts[k]; const ease = `pow(max(0,1-(t-${s})/${FADE_IN}),2)`;
      chains.push(`[${k + 1}:v]format=rgba,fade=t=in:st=${s}:d=${FADE_IN}:alpha=1,fade=t=out:st=${fadeOutStart}:d=${FADE_OUT}:alpha=1[t${k}]`);
      const pos = k === 0 ? `x='(W-w)/2-${Math.round(geo.width * .15)}*${ease}':y=${ys[k]}` : `x='(W-w)/2':y='${ys[k]}+60*${ease}'`;
      chains.push(`[v${k}][t${k}]overlay=${pos}[v${k + 1}]`);
    });
    // [v0] is the lavfi background
    chains.unshift('[0:v]null[v0]'); chains.push(`[v${sized.length}]format=yuv420p[vout]`);
    if (bgm) chains.push(bgmFilter(sized.length + 1, D, bgm.volume, bgm.fadeOut));
    args.push('-filter_complex', chains.join(';'), '-map', '[vout]'); if (bgm) args.push('-map', '[aout]', '-c:a', 'aac', '-b:a', '128k');
    const tmp = path.join(dir, 'video.tmp.mp4');
    args.push('-t', String(D), '-r', '24', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '22', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', tmp);
    await run(ffmpegBin(), args, { timeoutMs: 120000, failMessage: '모션그래픽 렌더에 실패했습니다.' }); await rename(tmp, path.join(dir, 'video.mp4'));
    return { status: 'ready', kind: 'motion', seconds: D, frames: 0, width: geo.width, height: geo.height, ratio: geo.ratio, audio: !!bgm, subtitles: false, subtitleTrack: false, burned: false, scenes: [], title: input.title, lines: input.lines, schedule: { starts, fadeOutStart } };
  } finally { await rm(work, { recursive: true, force: true }); await rm(path.join(dir, 'video.tmp.mp4'), { force: true }); }
}
