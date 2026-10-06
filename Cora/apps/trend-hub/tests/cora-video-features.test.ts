import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import { timeline } from '../lib/cora/timeline';
import { ratioGeometry, fitFilter, parseLang } from '../lib/cora/video/geometry';
import { estimateNarrationSeconds, checkNarration } from '../lib/cora/video/narration';
import { cardMedia, enforceManifest } from '../lib/cora/video/manifest';
import { parseSrt, clipRange, shiftSegments, formatSrt, srtStamp } from '../lib/cora/video/srt';
import { validateTemplateSettings, applyTemplate, settingsFromRender } from '../lib/cora/video/template';
import { VideoStore, VersionConflict } from '../lib/cora/video/db';
import { motionSchedule, parseMotion } from '../lib/cora/video/motion';

const tmp = mkdtempSync(path.join(os.tmpdir(), 'cora-video-test-')); process.env.CORA_DATA_DIR = path.join(tmp, 'data');
const ff = (args: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'pipe' });
const probe = (file: string) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,codec_type,width,height:stream_tags=language:format=duration', '-of', 'json', file], { encoding: 'utf8' })) as { streams: { codec_name: string; codec_type: string; width?: number; height?: number; tags?: { language?: string } }[]; format: { duration: string } };
let frame = '';
before(() => { const p = path.join(tmp, 'f.png'); ff(['-f', 'lavfi', '-i', 'testsrc=size=540x960:duration=1', '-frames:v', '1', p]); frame = 'data:image/png;base64,' + readFileSync(p).toString('base64'); });
after(() => rmSync(tmp, { recursive: true, force: true }));

test('ratio geometry and language tag', () => {
  assert.deepEqual(ratioGeometry('9:16'), { ratio: '9:16', width: 1080, height: 1920 });
  assert.deepEqual([ratioGeometry('4:5').height, ratioGeometry('1:1').height, ratioGeometry().height], [1350, 1080, 1920]);
  assert.throws(() => ratioGeometry('16:9')); assert.equal(parseLang('eng'), 'eng'); assert.throws(() => parseLang('jpn'));
  assert.match(fitFilter(1080, 1350), /scale=1080:1350:force_original_aspect_ratio=decrease,pad=1080:1350/);
});
test('narration estimate: documented 7 syllables/s, flags shorter scenes, never mutates', () => {
  assert.equal(estimateNarrationSeconds('안녕하세요 여러분'), 1.1); // 8 Hangul syllables / 7 per second
  assert.equal(estimateNarrationSeconds('가'.repeat(35)), 5); assert.equal(estimateNarrationSeconds('가'.repeat(35), 5), 7); assert.equal(estimateNarrationSeconds('ab12'), .4);
  const scenes = [{ seconds: 2, subtitle: '가'.repeat(35) }, { seconds: 5, subtitle: '가'.repeat(35) }, { seconds: 3, subtitle: '' }, { seconds: 3, subtitle: '가'.repeat(100) }];
  const copy = JSON.parse(JSON.stringify(scenes)); const r = checkNarration(scenes);
  assert.deepEqual(r.warnings.map(w => w.scene), [1, 4]); assert.deepEqual(r.suggestedSeconds, [5, 5, 3, 10]); assert.equal(r.warnings[1].reachable, false); assert.deepEqual(scenes, copy);
  assert.throws(() => estimateNarrationSeconds('가', 1));
});
test('media manifest: defaults, url needs a link, strict refuses missing license', () => {
  const items = cardMedia([{ source: 'user-upload', license: '직접 촬영' }, { source: 'url', url: 'https://example.com/a.png', license: 'CC0' }], 3);
  assert.deepEqual(items.map(i => i.source), ['user-upload', 'url', 'generated']); assert.equal(items[2].license, '');
  assert.throws(() => cardMedia([{ source: 'url', license: 'x' }], 1)); assert.throws(() => cardMedia([{ source: 'stock' }], 1)); assert.throws(() => cardMedia([{}, {}], 1));
  assert.equal(enforceManifest(items, false).missing.length, 1); assert.throws(() => enforceManifest(items, true), /card-3/);
  assert.doesNotThrow(() => enforceManifest(items.slice(0, 2), true));
});
test('SRT parsing and clip time math', () => {
  const segs = parseSrt('﻿1\r\n00:00:01,000 --> 00:00:03,500\r\n첫 <b>줄</b>\r\n\r\n2\r\n00:00:04.000 --> 00:00:06,000\r\n둘째\r\n셋째\r\n\r\nbad\r\n\r\n3\r\n00:00:08,000 --> 00:00:07,000\r\nx\r\n\r\n4\r\n00:00:09,000 --> 00:00:11,250\r\n끝\r\n');
  assert.deepEqual(segs.map(s => [s.index, s.start, s.end, s.text]), [[1, 1, 3.5, '첫 줄'], [2, 4, 6, '둘째\n셋째'], [3, 9, 11.25, '끝']]);
  assert.throws(() => parseSrt('아무 내용')); assert.throws(() => parseSrt(''));
  assert.deepEqual(clipRange(segs, [2, 3], 12, 0), { start: 4, end: 11.25, duration: 7.25 });
  assert.deepEqual(clipRange(segs, [1], 12, 2), { start: 0, end: 5.5, duration: 5.5 }); assert.equal(clipRange(segs, [3], 10, 2).end, 10);
  assert.throws(() => clipRange(segs, [9], 12)); assert.throws(() => clipRange(segs, [], 12)); assert.throws(() => clipRange(segs, [1.5], 12)); assert.throws(() => clipRange(segs, [1, 3], 12, 0, 5), /초 이하/);
  const shifted = shiftSegments(segs, 4, 11.25); assert.deepEqual(shifted.map(s => [s.start, s.end]), [[0, 2], [5, 7.25]]);
  assert.equal(srtStamp(3661.5), '01:01:01,500'); assert.equal(formatSrt(shifted).split('\n')[1], '00:00:00,000 --> 00:00:02,000');
});
test('timeline keyword must occur in the scene subtitle', () => {
  assert.equal(timeline(2, [{ seconds: 2, subtitle: '최대 30% 할인', keyword: ' 30% ' }, { seconds: 2, subtitle: '' }])[0].keyword, '30%');
  assert.throws(() => timeline(2, [{ seconds: 2, subtitle: '할인', keyword: '무료' }, { seconds: 2, subtitle: '' }]));
  assert.equal('keyword' in timeline(2, [{ seconds: 2, subtitle: 'a' }, { seconds: 2, subtitle: '' }])[0], false);
});
test('template validation, apply pattern, from-render settings, optimistic version (409 semantics)', () => {
  const s = validateTemplateSettings({ ratio: '1:1', secondsPattern: [2, 4], lang: 'eng', burn: true, bgm: { id: '11111111-2222-3333-4444-555555555555', volume: .3 } });
  assert.deepEqual([s.ratio, s.track, s.burn, s.bgm?.fadeOut, s.style.highlight], ['1:1', true, true, 2, '#ffd84d']);
  assert.deepEqual(applyTemplate(s, 5).seconds, [2, 4, 2, 4, 2]);
  for (const bad of [{ ...s, secondsPattern: [] }, { ...s, secondsPattern: [11] }, { ...s, ratio: '3:2' }, { ...s, style: { color: 'red' } }, { ...s, bgm: { id: 'x' } }, { ...s, bgm: { id: s.bgm!.id, volume: 2 } }]) assert.throws(() => validateTemplateSettings(bad));
  assert.deepEqual(settingsFromRender({ settings: { ratio: '4:5', lang: 'kor', track: false, burn: true }, scenes: [{ seconds: 3 }, { seconds: 5 }] }).secondsPattern, [3, 5]);
  assert.throws(() => settingsFromRender({ scenes: [] }), /저장된 렌더 설정/);
  const vs = new VideoStore(new DatabaseSync(':memory:')); const t = vs.addTemplate('u1', '기본', s); assert.equal(t.version, 1);
  const t2 = vs.updateTemplate('u1', t.id, 1, { name: '수정' })!; assert.equal(t2.version, 2);
  assert.throws(() => vs.updateTemplate('u1', t.id, 1, { name: '오래된 편집' }), (e: unknown) => e instanceof VersionConflict && e.current === 2);
  assert.equal(vs.getTemplate('u2', t.id), null); assert.equal(vs.updateTemplate('u2', t.id, 2, { name: 'x' }), null); assert.equal(vs.deleteTemplate('u2', t.id), false); assert.equal(vs.deleteTemplate('u1', t.id), true);
});
test('motion input validation and schedule', () => {
  assert.equal(parseMotion({ title: '제목', lines: ['a'] }).seconds, 10);
  for (const bad of [{ title: '' }, { title: 'a', seconds: 4 }, { title: 'a', seconds: 31 }, { title: 'a', lines: Array(7).fill('x') }, { title: 'a', ratio: '2:1' }, { title: 'a', background: 'blue' }]) assert.throws(() => parseMotion(bad));
  const m = motionSchedule(6, 5); assert.equal(m.starts.length, 7); assert.ok(m.starts[6] + .6 < m.fadeOutStart);
});

test('FFmpeg: 1:1 scene render with bgm loop+fade, burned keyword subtitles and eng track', async () => {
  const { renderVideo } = await import('../lib/cora/video');
  const { saveAudio, removeAudio, audioPath } = await import('../lib/cora/video/audio'); const { videoStore } = await import('../lib/cora/video/db');
  const wav = path.join(tmp, 'b.mp3'); ff(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:a', 'libmp3lame', wav]);
  const data = readFileSync(wav).toString('base64');
  await assert.rejects(saveAudio('user-a-0000', { name: 'x.mp3', data, license: '' }), /라이선스/);
  await assert.rejects(saveAudio('user-a-0000', { name: 'x.mp3', data: Buffer.from('not audio at all!').toString('base64'), license: 'l' }), /mp3, m4a, wav/);
  await assert.rejects(saveAudio('user-a-0000', { name: 'x.mp3', data: 'A'.repeat(14_000_000), license: 'l' }), /10MB/);
  const row = await saveAudio('user-a-0000', { name: '테스트.mp3', data, license: '자체 생성 사인파' }); assert.equal(row.ext, 'mp3'); assert.ok(row.duration > 1.5);
  assert.equal(videoStore().getAudio('user-b-0000', row.id), null);
  const out = await renderVideo('user-a-0000', 'render-0001', [frame, frame, frame], 3, [{ seconds: 2, subtitle: '봄 신상 30% 할인', keyword: '30%' }, { seconds: 2, subtitle: '' }, { seconds: 2, subtitle: '지금 시작' }],
    { ratio: '1:1', lang: 'eng', track: true, burn: true, bgm: { id: row.id, file: audioPath('user-a-0000', row), volume: .5, fadeOut: 1 } });
  const file = path.join(process.env.CORA_DATA_DIR!, 'videos', 'user-a-0000', 'render-0001', 'video.mp4'); const p = probe(file); const v = p.streams.find(s => s.codec_type === 'video')!;
  assert.deepEqual([v.width, v.height, v.codec_name], [1080, 1080, 'h264']); assert.ok(Math.abs(Number(p.format.duration) - 6) < .2, p.format.duration);
  assert.ok(p.streams.some(s => s.codec_type === 'audio')); assert.equal(p.streams.find(s => s.codec_type === 'subtitle')?.tags?.language, 'eng');
  assert.deepEqual([out.burned, out.subtitleTrack, out.audio, out.width], [true, true, true, 1080]);
  // burned text really changes pixels: frame at t=0.5 (subtitle on) differs from the same render without burn
  const on = path.join(tmp, 'on.png'), off = path.join(tmp, 'off.png'); ff(['-ss', '0.5', '-i', file, '-frames:v', '1', on]);
  await renderVideo('user-a-0000', 'render-0002', [frame, frame, frame], 3, [{ seconds: 2, subtitle: '봄 신상 30% 할인', keyword: '30%' }, { seconds: 2, subtitle: '' }, { seconds: 2, subtitle: '지금 시작' }], { ratio: '1:1' });
  ff(['-ss', '0.5', '-i', path.join(process.env.CORA_DATA_DIR!, 'videos', 'user-a-0000', 'render-0002', 'video.mp4'), '-frames:v', '1', off]); assert.notDeepEqual(readFileSync(on), readFileSync(off));
  const dir = path.join(process.env.CORA_DATA_DIR!, 'videos', 'user-a-0000', 'render-0001'); assert.deepEqual(require('node:fs').readdirSync(dir).sort(), ['subtitles.srt', 'video.mp4']); // temp files cleaned
  assert.equal(await removeAudio('user-a-0000', row.id), true); assert.equal(existsSync(audioPath('user-a-0000', row)), false);
});
test('FFmpeg: 4:5 and 9:16 renders, longer audio is trimmed to video length', async () => {
  const { renderVideo } = await import('../lib/cora/video');
  const long = path.join(tmp, 'long.wav'); ff(['-f', 'lavfi', '-i', 'sine=frequency=330:duration=12', long]);
  for (const [ratio, h] of [['4:5', 1350], ['9:16', 1920]] as const) {
    const out = await renderVideo('user-a-0000', 'render-' + ratio.replace(':', ''), [frame, frame], 2, undefined, { ratio, bgm: { id: 'x', file: long, volume: 1, fadeOut: 0 } });
    const p = probe(path.join(process.env.CORA_DATA_DIR!, 'videos', 'user-a-0000', 'render-' + ratio.replace(':', ''), 'video.mp4')); const v = p.streams.find(s => s.codec_type === 'video')!;
    assert.deepEqual([v.width, v.height], [1080, h]); assert.ok(Math.abs(Number(p.format.duration) - 4) < .2, p.format.duration); assert.ok(p.streams.some(s => s.codec_type === 'audio')); assert.equal(out.subtitles, false);
  }
});
test('FFmpeg: motion graphic 4:5, 6 s, animation changes pixels over time', async () => {
  const { renderMotion } = await import('../lib/cora/video/motion');
  const out = await renderMotion('user-a-0000', 'motion-0001', parseMotion({ title: '가을 신메뉴 출시', lines: ['따뜻한 라테', '30% 할인', '9월 30일까지'], seconds: 6, ratio: '4:5' }));
  const file = path.join(process.env.CORA_DATA_DIR!, 'videos', 'user-a-0000', 'motion-0001', 'video.mp4'); const p = probe(file); const v = p.streams.find(s => s.codec_type === 'video')!;
  assert.deepEqual([v.width, v.height], [1080, 1350]); assert.ok(Math.abs(Number(p.format.duration) - 6) < .2); assert.equal(out.seconds, 6);
  const f0 = path.join(tmp, 'm0.png'), f4 = path.join(tmp, 'm4.png'); ff(['-ss', '0', '-i', file, '-frames:v', '1', f0]); ff(['-ss', '4', '-i', file, '-frames:v', '1', f4]);
  assert.ok(statSync(f4).size > statSync(f0).size * 1.3, `${statSync(f0).size} vs ${statSync(f4).size}`);
});
test('missing font gives a Korean error', async () => {
  const { rasterize } = await import('../lib/cora/video/raster'); const prev = process.env.CORA_FONT_FILE; process.env.CORA_FONT_FILE = '/nonexistent/font.ttc';
  try { await assert.rejects(rasterize([{ out: path.join(tmp, 'x.png'), text: '가', size: 30, maxWidth: 100, mode: 'block' }]), /CORA_FONT_FILE.*찾을 수 없습니다/); } finally { if (prev === undefined) delete process.env.CORA_FONT_FILE; else process.env.CORA_FONT_FILE = prev; }
});
test('FFmpeg: owned video upload in chunks, SRT segments, clip with burned subtitles, ownership and delete', async () => {
  const c = await import('../lib/cora/video/clips'); const { videoStore } = await import('../lib/cora/video/db');
  const src = path.join(tmp, 'src.mp4'); ff(['-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=24:duration=12', '-f', 'lavfi', '-i', 'sine=frequency=500:duration=12', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', src]);
  const bytes = readFileSync(src); const A = 'owner-aaaa-0001', B = 'other-bbbb-0002';
  assert.throws(() => c.beginSource(A, { name: 'x.exe', size: 10 }), /확장자/); assert.throws(() => c.beginSource(A, { name: 'x.mp4', size: 201 * 1024 * 1024 }), /200MB/);
  const s = c.beginSource(A, { name: '강의.mp4', size: bytes.length }); const half = Math.floor(bytes.length / 2);
  await assert.rejects(c.appendChunk(A, s.id, 5, bytes.subarray(0, half)), /위치/);
  await c.appendChunk(A, s.id, 0, bytes.subarray(0, half)); await assert.rejects(c.completeSource(A, s.id), /남았습니다/);
  await assert.rejects(c.appendChunk(B, s.id, half, bytes.subarray(half)), /찾을 수 없습니다/);
  await c.appendChunk(A, s.id, half, bytes.subarray(half)); const ready = await c.completeSource(A, s.id);
  assert.deepEqual([ready.status, ready.width, ready.hasAudio], ['ready', 320, true]); assert.ok(Math.abs(ready.duration - 12) < .3);
  await assert.rejects(c.cutClip(A, s.id, c.parseClipRequest({ segments: [1] })), /SRT/);
  assert.throws(() => c.attachSrt(B, s.id, '1\n00:00:01,000 --> 00:00:02,000\nx\n'), /찾을 수 없습니다/); assert.throws(() => c.attachSrt(A, s.id, '1\n00:00:01,000 --> 00:00:99,000\nx\n'), /보다 깁니다/);
  const segs = c.attachSrt(A, s.id, '1\n00:00:01,000 --> 00:00:03,000\n첫 구간\n\n2\n00:00:04,000 --> 00:00:06,500\n둘째 구간\n\n3\n00:00:09,000 --> 00:00:11,000\n셋째 구간\n'); assert.equal(segs.length, 3);
  await assert.rejects(c.cutClip(B, s.id, c.parseClipRequest({ segments: [1] })), /찾을 수 없습니다/);
  const r = await c.cutClip(A, s.id, c.parseClipRequest({ segments: [2, 3], burn: true, track: true, lang: 'kor' })); assert.equal(r.duration, 7);
  const cf = c.clipPath(A, r.clip.id); const p = probe(cf); assert.ok(Math.abs(Number(p.format.duration) - 7) < .2, p.format.duration);
  assert.ok(p.streams.some(x => x.codec_name === 'h264') && p.streams.some(x => x.codec_name === 'aac')); assert.equal(p.streams.find(x => x.codec_type === 'subtitle')?.tags?.language, 'kor');
  assert.equal(videoStore().getClip(B, r.clip.id), null); assert.equal(await c.removeClip(B, r.clip.id), false); assert.equal(await c.removeSource(B, s.id), false);
  assert.equal(await c.removeSource(A, s.id), true); assert.equal(existsSync(cf), false); assert.equal(existsSync(c.sourcePath(A, s)), false); assert.equal(videoStore().listClips(A).length, 0);
  writeFileSync(path.join(tmp, 'done'), '1');
});
