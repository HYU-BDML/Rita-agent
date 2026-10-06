/** E207 SRT parsing and clip time math. Times are seconds (float). */
export interface Segment { index: number; start: number; end: number; text: string }
const TIME = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/;
const toSeconds = (m: RegExpMatchArray) => Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, '0')) / 1000;
export const MAX_SEGMENTS = 5000;
export function parseSrt(input: string): Segment[] {
  const text = input.replace(/^﻿/, '').replace(/\r\n?/g, '\n').trim();
  if (!text) throw new Error('자막 파일이 비어 있습니다.');
  const segments: Segment[] = [];
  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split('\n'); const at = lines.findIndex(l => l.includes('-->')); if (at < 0 || at > 1) continue;
    const [a, b] = lines[at].split('-->'); const ma = a.match(TIME), mb = b?.match(TIME); if (!ma || !mb) continue;
    const start = toSeconds(ma), end = toSeconds(mb); const body = lines.slice(at + 1).join('\n').replace(/<[^>]+>/g, '').trim();
    if (end <= start || !body) continue;
    segments.push({ index: 0, start, end, text: body }); if (segments.length > MAX_SEGMENTS) throw new Error(`자막은 ${MAX_SEGMENTS}개 이하여야 합니다.`);
  }
  if (!segments.length) throw new Error('읽을 수 있는 SRT 자막이 없습니다. 시간 줄(00:00:01,000 --> 00:00:03,000)을 확인해 주세요.');
  segments.sort((x, y) => x.start - y.start); return segments.map((s, i) => ({ ...s, index: i + 1 }));
}
export const srtStamp = (seconds: number) => { const ms = Math.round(Math.max(0, seconds) * 1000); const p = (n: number, w = 2) => String(n).padStart(w, '0'); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`; };
export const formatSrt = (segments: Segment[]) => segments.map((s, i) => `${i + 1}\n${srtStamp(s.start)} --> ${srtStamp(s.end)}\n${s.text}\n\n`).join('');
/** Clip = span from the earliest selected start to the latest selected end (gaps between selected segments stay in), widened by `pad` seconds and limited to the source. */
export function clipRange(segments: Segment[], selected: unknown, sourceDuration: number, pad = 0, maxSeconds = 600) {
  if (!Array.isArray(selected) || !selected.length || selected.length > MAX_SEGMENTS || selected.some(n => !Number.isInteger(n))) throw new Error('잘라낼 자막 구간을 하나 이상 선택해 주세요.');
  if (!Number.isFinite(pad) || pad < 0 || pad > 5) throw new Error('앞뒤 여유는 0~5초입니다.');
  const chosen = selected.map(n => segments.find(s => s.index === n)); if (chosen.some(c => !c)) throw new Error('존재하지 않는 자막 구간입니다.');
  const segs = chosen as Segment[];
  const start = Math.max(0, Math.min(...segs.map(s => s.start)) - pad);
  const end = Math.min(sourceDuration, Math.max(...segs.map(s => s.end)) + pad);
  if (!(end > start)) throw new Error('선택한 구간이 원본 영상 길이를 벗어났습니다.');
  if (end - start > maxSeconds) throw new Error(`클립은 ${maxSeconds}초 이하여야 합니다.`);
  return { start: Math.round(start * 1000) / 1000, end: Math.round(end * 1000) / 1000, duration: Math.round((end - start) * 1000) / 1000 };
}
/** Segments overlapping [start,end), re-timed to the clip start and clamped to the clip end. */
export const shiftSegments = (segments: Segment[], start: number, end: number): Segment[] =>
  segments.filter(s => s.end > start && s.start < end).map((s, i) => ({ index: i + 1, start: Math.max(0, s.start - start), end: Math.min(end, s.end) - start, text: s.text }));
