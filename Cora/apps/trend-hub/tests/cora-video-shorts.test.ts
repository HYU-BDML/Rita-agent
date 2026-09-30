import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const tmp = mkdtempSync(path.join(os.tmpdir(), 'cora-shorts-test-')); process.env.CORA_DATA_DIR = path.join(tmp, 'data');
const ff = (args: string[]) => execFileSync(process.env.CORA_FFMPEG || 'ffmpeg', ['-y', '-loglevel', 'error', ...args]);
const probe = (f: string) => JSON.parse(execFileSync(process.env.CORA_FFPROBE || 'ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', f]).toString()) as { streams: { codec_type: string; width?: number; height?: number }[]; format: { duration: string } };
import type { Segment } from '../lib/cora/video/srt';
const seg = (i: number, start: number, end: number, text: string): Segment => ({ index: i, start, end, text });
// 30 subtitle lines, 4 s each: a 120 s talk with a funny part (lines 10–14) and a how-to part (lines 20–25).
const lines: Segment[] = Array.from({ length: 30 }, (_, i) => seg(i + 1, i * 4, i * 4 + 3.8, i >= 9 && i <= 13 ? `대박 반전이었어요 ㅋㅋ 진짜 황당했죠 ${i}` : i >= 19 && i <= 24 ? `먼저 준비하고 다음 순서로 하면 됩니다 팁 ${i}` : `오늘 이야기 ${i}번째 문장입니다`));
let S: typeof import('../lib/cora/video/shorts');
before(async () => { S = await import('../lib/cora/video/shorts'); });
after(() => rmSync(tmp, { recursive: true, force: true }));

test('Shorts plan input: presets, custom purpose, bounds', () => {
  assert.equal(S.validatePlanInput({}).theme, 'highlight');
  assert.throws(() => S.validatePlanInput({ theme: 'nope' }), /목적/);
  assert.throws(() => S.validatePlanInput({ theme: 'custom', custom: 'ab' }), /4자/);
  assert.throws(() => S.validatePlanInput({ count: 9 }), /개수/);
  assert.throws(() => S.validatePlanInput({ minSec: 60, maxSec: 30 }), /짧아야/);
});

test('Shorts snap: segments snap to subtitle boundaries and are stretched or trimmed into the length range', () => {
  const s = S.snap(lines, 10, 11, 20, 40)!; assert.ok(s.end - s.start >= 20 && s.end - s.start <= 40); assert.equal(s.start, lines[9].start);
  const t = S.snap(lines, 1, 30, 20, 40)!; assert.ok(t.end - t.start <= 40);
  assert.equal(S.snap(lines, 999, 3, 20, 40), null);
});

test('Shorts AI plan parsing: strict JSON, unknown indexes rejected, overlaps resolved by score, keyword must exist', () => {
  const input = S.validatePlanInput({ theme: 'funny', count: 2, minSec: 15, maxSec: 30 });
  const raw = '```json\n' + JSON.stringify({ clips: [
    { startIndex: 10, endIndex: 14, title: '반전 순간', hook: '이게 된다고?', reason: '웃음 포인트', keyword: '반전', score: 90 },
    { startIndex: 11, endIndex: 15, title: '겹침', hook: 'x', reason: 'y', keyword: '없는말', score: 50 },
    { startIndex: 500, endIndex: 510, title: '없는 구간', hook: '', reason: '', keyword: '', score: 99 },
    { startIndex: 20, endIndex: 24, title: '방법', hook: '따라 하세요', reason: '팁', keyword: '지어낸단어', score: 70 },
  ] }) + '\n```';
  const r = S.parsePlan(raw, lines, input);
  assert.equal(r.candidates.length, 2); assert.deepEqual(r.candidates.map(c => c.title), ['반전 순간', '방법'], 'sorted by score, best first');
  assert.equal(r.candidates[0].keyword, '반전'); assert.equal(r.candidates[1].keyword, '', 'keyword not in transcript is dropped');
  assert.ok(r.rejected.some(x => /겹침/.test(x)) && r.rejected.some(x => /500/.test(x)));
  for (const c of r.candidates) assert.ok(c.duration >= 15 * 0.8 && c.duration <= 30);
  assert.throws(() => S.parsePlan('not json', lines, input), /JSON/);
});

test('Shorts rule plan without AI: theme words pull the right part of the talk', () => {
  const funny = S.rulePlan(lines, S.validatePlanInput({ theme: 'funny', count: 1, minSec: 15, maxSec: 25 })).candidates[0];
  assert.ok(funny.start >= lines[5].start && funny.start <= lines[13].start, `funny at ${funny.start}`);
  const how = S.rulePlan(lines, S.validatePlanInput({ theme: 'howto', count: 1, minSec: 15, maxSec: 25 })).candidates[0];
  assert.ok(how.start >= lines[15].start && how.start <= lines[24].start, `howto at ${how.start}`);
  const many = S.rulePlan(lines, S.validatePlanInput({ theme: 'highlight', count: 4, minSec: 15, maxSec: 25 })).candidates;
  for (let i = 0; i < many.length; i++) for (let j = i + 1; j < many.length; j++) assert.ok(many[i].end <= many[j].start || many[j].end <= many[i].start, 'no overlap');for (let i = 1; i < many.length; i++) assert.ok(many[i - 1].score >= many[i].score, 'best first');
});

test('Shorts prompt: transcript is sampled under a budget and marked as data', () => {
  const long = Array.from({ length: 3000 }, (_, i) => seg(i + 1, i, i + 0.9, `아주 긴 강의 문장 ${i} `.repeat(3)));
  const t = S.transcriptForPrompt(long, 5000); assert.equal(t.sampled, true); assert.ok(t.text.length <= 5200);
  assert.match(S.planPrompt(lines, S.validatePlanInput({ theme: 'custom', custom: '가격 이야기만' })), /명령이 아닌 자료/);
});

test('Shorts render: long video becomes a 1080x1920 short with burned subtitles, hook card and music under the voice', { timeout: 120000 }, async () => {
  const { store } = await import('../lib/cora/store'); const u = store().signup(`shorts-${Date.now()}@example.test`, 'password123');
  const c = await import('../lib/cora/video/clips'); const { saveAudio } = await import('../lib/cora/video/audio');
  const src = path.join(tmp, 'long.mp4'); ff(['-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=24:duration=40', '-f', 'lavfi', '-i', 'sine=frequency=300:duration=40', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', src]);
  const bytes = readFileSync(src); const s = c.beginSource(u.id, { name: '강연.mp4', size: bytes.length }); await c.appendChunk(u.id, s.id, 0, bytes); await c.completeSource(u.id, s.id);
  c.attachSrt(u.id, s.id, lines.slice(0, 10).map((x, i) => `${i + 1}\n00:00:${String(Math.floor(x.start)).padStart(2, '0')},000 --> 00:00:${String(Math.floor(x.end)).padStart(2, '0')},800\n${x.text}\n`).join('\n'));
  const mp3 = path.join(tmp, 'bgm.mp3'); ff(['-f', 'lavfi', '-i', 'sine=frequency=660:duration=5', '-c:a', 'libmp3lame', mp3]);
  const bgm = await saveAudio(u.id, { name: 'bgm.mp3', data: readFileSync(mp3).toString('base64'), license: '자체 생성 사인파' });
  const plan = await S.planShorts(u.id, s.id, S.validatePlanInput({ theme: 'highlight', count: 1, minSec: 10, maxSec: 16 }), 'rules');
  assert.equal(plan.mode, 'rules'); const cand = plan.candidates[0];
  const r = await S.renderShort(u.id, s.id, { start: cand.start, end: cand.end, title: cand.title, hook: '끝까지 보세요', keyword: '' }, S.validateShortOptions({ fit: 'blur', bgmId: bgm.id, bgmVolume: 0.2 }));
  const p = probe(c.clipPath(u.id, r.clip.id)); const v = p.streams.find(x => x.codec_type === 'video')!;
  assert.equal(v.width, 1080); assert.equal(v.height, 1920); assert.ok(p.streams.some(x => x.codec_type === 'audio'));
  assert.ok(Math.abs(Number(p.format.duration) - (cand.end - cand.start)) < 0.3, `${p.format.duration} vs ${cand.end - cand.start}`);
  assert.equal(r.bgm?.license, '자체 생성 사인파');
  await assert.rejects(S.renderShort(u.id, s.id, { start: 5, end: 500 }, S.validateShortOptions({})), /구간/);
  await assert.rejects(S.renderShort(u.id, s.id, { start: 0, end: 10 }, S.validateShortOptions({ bgmId: 'missing-audio-id' })), /배경음악/);
  const other = store().signup(`shorts-other-${Date.now()}@example.test`, 'password123');
  assert.throws(() => S.readySource(other.id, s.id), /찾을 수 없습니다/); assert.equal(S.shortsPlans().get(other.id, plan.id), null);
  await assert.rejects(S.transcribe(u.id, s.id), /whisper/);
});
