import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CoraStore } from '../lib/cora/store';
import { sampleBrief } from '../lib/cora/model';
import { ruleCandidates, parseCandidates, fetchInstagramInsights, HOOKS } from '../lib/cora/loop';
import { loopAction, loopState, loopOf } from '../lib/cora/loop-service';

const noAI = async () => { throw new Error('AI must not be called'); };
const fresh = () => { const s = new CoraStore(':memory:'); const u = s.signup(`loop-${Math.random()}@example.test`, 'password123'); return { s, u: u.id }; };
const DAY = 86400000;

test('Loop ①: rule candidates differ in hook and structure, use only the brief’s words and keep every material character', () => {
  const c = ruleCandidates(sampleBrief, 4);
  assert.equal(new Set(c.map(x => x.hook)).size, 4);
  assert.equal(c[0].draft.slides[0].headline, '모퉁이 책방은 독립출판물을 소개하는 작은 동네 책방입니다.', 'result-first hook is the first material sentence');
  assert.match(c[2].draft.slides[0].headline, /알아둘 4가지/, 'number hook counts the real material parts');
  for (const x of c) assert.equal(x.draft.slides.slice(1, -1).map(s => s.body).join(''), sampleBrief.material.replace(/\n/g, ''));
  assert.equal(ruleCandidates(sampleBrief, 2, 'story')[0].hook, 'story'); assert.notEqual(ruleCandidates(sampleBrief, 5, null, 'result')[0].hook, 'result');
});

test('Loop ①: AI candidates are strict JSON, one per hook, with the requested card count', () => {
  const slide = { headline: '제목', body: '본문' };
  const raw = '```json\n' + JSON.stringify({ candidates: [
    { hook: 'question', angle: '처음 오는 사람', slides: [slide, slide, slide, slide], caption: 'a' },
    { hook: 'question', angle: '중복', slides: [slide, slide, slide, slide], caption: 'b' },
    { hook: 'nope', angle: 'x', slides: [slide, slide, slide, slide], caption: 'c' },
    { hook: 'number', angle: '장수 틀림', slides: [slide, slide], caption: 'd' },
    { hook: 'story', angle: '단골', slides: [slide, slide, slide, slide], caption: 'e' },
  ] }) + '\n```';
  const r = parseCandidates(raw, sampleBrief, 3, 4);
  assert.deepEqual(r.candidates.map(c => c.hook), ['question', 'story']); assert.equal(r.rejected.length, 3);
  assert.throws(() => parseCandidates('not json', sampleBrief, 3, 4), /JSON/);
});

test('Loop ①–⑤: generate, human select with reason, post, daily metrics, review proposes a next action, accepted action seeds the next batch', async () => {
  const { s, u } = fresh(); const loop = loopOf(s); const now = Date.now();
  const g = await loopAction(s, u, { action: 'generate', brief: sampleBrief, count: 3, mode: 'rules' }, noAI) as { candidates: { id: string; hook: string }[] };
  assert.equal(g.candidates.length, 3);
  await assert.rejects(loopAction(s, u, { action: 'select', candidateId: g.candidates[0].id, tags: [], note: '' }, noAI), /고른 이유/);
  const sel = await loopAction(s, u, { action: 'select', candidateId: g.candidates[0].id, tags: ['첫 문장이 강함', '없는 태그'] }, noAI) as { candidate: { status: string; projectId: string; reasonTags: string[] } };
  assert.equal(sel.candidate.status, 'selected'); assert.deepEqual(sel.candidate.reasonTags, ['첫 문장이 강함']); assert.ok(s.get(u, sel.candidate.projectId), 'selected candidate becomes an editable project');
  await assert.rejects(loopAction(s, u, { action: 'select', candidateId: g.candidates[0].id, tags: ['브랜드와 맞음'] }, noAI), /이미 결정/);
  await loopAction(s, u, { action: 'reject', candidateId: g.candidates[1].id, tags: ['첫 문장이 약함'] }, noAI);
  await assert.rejects(loopAction(s, u, { action: 'post', candidateId: g.candidates[2].id, title: 'x', platform: 'instagram', accountLabel: '@a', postedAt: new Date(now - DAY).toISOString() }, noAI), /사람이 고른 후보만/);

  // Five posts, each recorded one day after posting. Post P0 (from the selected candidate) has a much higher save rate.
  const posts: string[] = [];
  for (let i = 0; i < 5; i++) {
    const at = new Date(now - (i + 2) * DAY).toISOString();
    const p = await loopAction(s, u, { action: 'post', ...(i === 0 ? { candidateId: g.candidates[0].id } : { hook: 'question', format: 'carousel' }), title: `게시물 ${i}`, platform: 'instagram', accountLabel: '@corner', postedAt: at }, noAI) as { post: { id: string; hook: string } };
    posts.push(p.post.id);
    const day1 = new Date(Date.parse(at) + DAY).toISOString().slice(0, 10);
    await loopAction(s, u, { action: 'metrics', postId: p.post.id, day: day1, reach: 1000, saves: i === 0 ? 60 : 20, shares: i === 0 ? 30 : 10, likes: '', comments: 0 }, noAI);
  }
  const snap = loop.snapshots(u, posts[0])[0]; assert.equal(snap.ageDays, 1); assert.equal(snap.likes, null, 'blank stays blank'); assert.equal(snap.comments, 0, 'written zero stays zero');
  await assert.rejects(loopAction(s, u, { action: 'metrics', postId: posts[0], day: '2000-01-01', reach: 1 }, noAI), /게시 전/);
  await assert.rejects(loopAction(s, u, { action: 'metrics', postId: posts[0], reach: -1 }, noAI), /0 이상의 정수/);

  const { review } = await loopAction(s, u, { action: 'review' }, noAI) as { review: { posts: { id: string; missingToday: boolean; compare: { saveRate: { status: string; ratio: number; n: number } } }[]; actions: { id: string; ruleId: string; preferHook: string | null; text: string }[] } };
  const top = review.posts.find(p => p.id === posts[0])!; assert.equal(top.compare.saveRate.status, 'above'); assert.equal(top.compare.saveRate.n, 4); assert.equal(top.compare.saveRate.ratio, 3);
  assert.ok(review.posts.every(p => p.missingToday), 'no snapshot for today yet');
  const repeat = review.actions.find(a => a.ruleId === 'C5-repeat-above')!; assert.equal(repeat.preferHook, g.candidates[0].hook);
  assert.ok(review.actions.some(a => a.ruleId === 'C4-daily-record'));
  const again = await loopAction(s, u, { action: 'review' }, noAI) as { review: { actions: unknown[] } }; assert.equal(again.review.actions.length, review.actions.length, 'same day review does not duplicate actions');

  await assert.rejects(loopAction(s, u, { action: 'generate', brief: sampleBrief, count: 3, mode: 'rules', fromActionId: repeat.id }, noAI), /채택한 할 일/);
  await assert.rejects(loopAction(s, u, { action: 'decide', actionId: repeat.id, status: 'dismissed', note: '' }, noAI), /이유/);
  await loopAction(s, u, { action: 'decide', actionId: repeat.id, status: 'accepted' }, noAI);
  const next = await loopAction(s, u, { action: 'generate', brief: sampleBrief, count: 2, mode: 'rules', fromActionId: repeat.id }, noAI) as { batch: { fromActionId: string }; candidates: { hook: string }[] };
  assert.equal(next.batch.fromActionId, repeat.id); assert.equal(next.candidates[0].hook, g.candidates[0].hook, 'loop closes: next batch starts from the accepted action');
  assert.equal(loopState(s, u).candidates.length, 2);
});

test('Loop: AI generation uses one call inside the daily limit; CSV import is all-or-nothing; data is per user', async () => {
  const { s, u } = fresh(); let calls = 0;
  const slide = { headline: '제목', body: '본문' };
  const fake = async () => { calls++; return { text: JSON.stringify({ candidates: (['question', 'number', 'story'] as const).map(h => ({ hook: h, angle: h, slides: Array(6).fill(slide), caption: 'c' })) }), provider: 'fake', model: 'fake', cost: null }; };
  const r = await loopAction(s, u, { action: 'generate', brief: sampleBrief, count: 3, mode: 'ai' }, fake) as { candidates: unknown[] };
  assert.equal(calls, 1); assert.equal(r.candidates.length, 3); assert.equal(s.generationCount(u), 1);
  for (let i = 0; i < 9; i++) s.addItem(u, 'run', 'x', {});
  await assert.rejects(loopAction(s, u, { action: 'generate', brief: sampleBrief, count: 3, mode: 'ai' }, fake), (e: { status?: number }) => e.status === 429); assert.equal(calls, 1);

  const p = loopOf(s).registerPost(u, { title: 'a', platform: 'instagram', accountLabel: '@a', postedAt: new Date(Date.now() - 3 * DAY).toISOString() });
  const d = new Date(Date.now() - DAY).toISOString().slice(0, 10);
  await assert.rejects(loopAction(s, u, { action: 'import', csv: `post_id,day,reach,saves\n${p.id},${d},100,5\n${p.id},2000-01-01,100,5` }, noAI), /3행/);
  assert.equal(loopOf(s).snapshots(u).length, 0, 'nothing saved when one row fails');
  assert.deepEqual(await loopAction(s, u, { action: 'import', csv: `post_id,day,reach,saves\n${p.id},${d},100,5` }, noAI), { saved: 1 });

  const other = s.signup('loop-other@example.test', 'password123').id;
  assert.equal(loopOf(s).post(other, p.id), null); assert.equal(loopState(s, other).posts.length, 0);
  await assert.rejects(loopAction(s, other, { action: 'metrics', postId: p.id, reach: 1 }, noAI), /찾을 수 없습니다/);
});

test('Loop ④: Instagram insights adapter maps metric names, keeps missing metrics blank and keeps the token out of the URL', async () => {
  let seen = ''; let auth = '';
  const ok = (async (url: string, init: RequestInit) => { seen = url; auth = String((init.headers as Record<string, string>).Authorization); return new Response(JSON.stringify({ data: [{ name: 'reach', values: [{ value: 120 }] }, { name: 'saved', values: [{ value: 7 }] }, { name: 'shares', total_value: { value: 3 } }] }), { status: 200 }); }) as unknown as typeof fetch;
  const v = await fetchInstagramInsights('tok-123', '17890000000000001', ok);
  assert.deepEqual(v, { reach: 120, views: null, likes: null, comments: null, saves: 7, shares: 3, follows: null });
  assert.ok(!seen.includes('tok-123') && auth === 'Bearer tok-123'); assert.match(seen, /\/17890000000000001\/insights\?metric=reach%2Cviews/);
  const bad = (async () => new Response('{}', { status: 400 })) as unknown as typeof fetch;
  await assert.rejects(fetchInstagramInsights('t', '1', bad), /HTTP 400/);
  await assert.rejects(fetchInstagramInsights('t', 'abc', ok), /게시물 ID/);
  assert.equal(Object.keys(HOOKS).length, 5);
});

test('Loop know-how: 44 sourced rules, official-only stability, Instagram 48h delay holds back judgement, reel cadence check', async () => {
  const { PLAYBOOK } = await import('../lib/cora/loop-playbook');
  const know = PLAYBOOK.filter(r => /^R\d\d$/.test(r.id)); assert.equal(know.length, 44);
  for (const r of know) { assert.ok(r.sources.length > 0 && r.sources.every(x => /^https:\/\//.test(x.url)), r.id); if (r.stability === '안정') assert.ok(r.sources.some(x => x.type === 'official') || new Set(r.sources.map(x => new URL(x.url).hostname)).size >= 3, r.id); }
  assert.ok(know.filter(r => r.sources.some(x => /socialmediatoday|tubefilter|routenote/.test(x.url))).every(r => r.sources.filter(x => /socialmediatoday|tubefilter|routenote/.test(x.url)).every(x => x.type !== 'official')), 'press reports are not labelled official');
  const { s, u } = fresh(); const loop = loopOf(s); const now = Date.UTC(2026, 9, 3, 12); // fixed clock: post 0 is exactly day 1
  const ids: string[] = [];
  for (let i = 0; i < 5; i++) { const p = loop.registerPost(u, { title: `릴스 ${i}`, platform: 'instagram', accountLabel: '@a', postedAt: new Date(now - (i === 0 ? 1 : i + 2) * DAY - 3600000).toISOString(), hook: 'story', format: 'reel', mediaId: String(1000 + i) }, now); ids.push(p.id); }
  // Post 0 is one day old and its numbers came from Instagram: it must not be judged yet even though its save rate is high.
  loop.recordMetrics(u, ids[0], { reach: 100, saves: 50 }, 'instagram', now);
  for (let i = 1; i < 5; i++) loop.recordMetrics(u, ids[i], { day: new Date(now - (i + 1) * DAY).toISOString().slice(0, 10), reach: 100, saves: 5 }, 'manual', now);
  const r = loop.review(u, now);
  assert.ok(r.actions.some(a => a.ruleId === 'R27')); assert.ok(!r.actions.some(a => a.ruleId === 'C5-repeat-above'), '48h rule holds back the repeat proposal');
  const cad = r.actions.find(a => a.ruleId === 'R18')!; assert.equal(cad.preferFormat, 'reel'); assert.match(cad.evidence, /릴스 기록 5개/);
});
