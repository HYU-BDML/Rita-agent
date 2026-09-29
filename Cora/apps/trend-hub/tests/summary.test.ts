import { test } from 'node:test';
import assert from 'node:assert/strict';

import { pick, BODY_CHARS, type SummaryInput } from '../lib/collect/summaries';
import { toTopic } from '../lib/core/brief';
import { characterNativeDiscovery as d } from '../lib/discoveries/character-native';
import type { Candidate } from '../lib/core/candidate';
import type { PostRecord } from '../lib/core/post-record';

/*
 * 본문 요약(summary).
 *
 * 지키려는 것은 둘이다.
 *   1. **why 와 겹치지 않는다.** 두 칸이 같은 말이 되면 칸이 둘일 이유가 없고,
 *      2026-09-17 에 실제로 로빈 카드 6장에 판정 메모가 박혔던 사고가 여기서 난다.
 *   2. **없는 후보에 붙지 않는다.** LLM 이 이름을 지어내면 요약이 사라지는 게 아니라
 *      엉뚱한 후보에 붙는다. 그건 틀린 것보다 나쁘다 — 틀린 줄 알 방법이 없다.
 */

const group = (name: string): SummaryInput => ({
  name,
  posts: [{ sourceId: 'tt:1', platform: 'tiktok', authorName: 'a', authorId: 'a', tags: [], title: '', text: '본문', views: 0, reactions: 0, followers: 0, url: 'https://x.test/1', postedAt: null }] as SummaryInput['posts'],
});

test('요약: 입력에 없던 이름은 버린다', () => {
  const out = pick([group('치이카와')], [
    { id: '치이카와', summary: '편의점 신상 굿즈가 나왔다는 게시물이 많다.' },
    { id: '없는캐릭터', summary: '지어낸 요약' },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].name, '치이카와');
});

test('요약: 빈 문자열은 칸을 만들지 않는다', () => {
  const out = pick([group('로빈'), group('치이카와')], [
    { id: '로빈', summary: '   ' },
    { id: '치이카와', summary: '굿즈 이야기' },
  ]);
  assert.deepEqual(out.map((x) => x.name), ['치이카와']);
});

test('요약: 같은 이름이 두 번 와도 하나만 쓴다', () => {
  const out = pick([group('로빈')], [
    { id: '로빈', summary: '먼저 온 것' },
    { id: '로빈', summary: '나중에 온 것' },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].summary, '먼저 온 것');
});

test('요약: 본문 길이는 300자다', () => {
  // 160자로 되돌아가면 한 문장이 잘린다. 값이 바뀌면 비용도 바뀌므로 테스트로 고정한다.
  assert.equal(BODY_CHARS, 300);
});

/* ─────────────────────── 계약 JSON ─────────────────────── */

function candidate(over: Partial<Candidate> = {}): Candidate {
  return {
    id: 'character:로빈',
    unit: 'subject',
    subject: '로빈',
    verdict: '기업 IP — 라이선스 필요',
    why: '',
    grounded: false,
    momentum: { views: null, accounts: 1 },
    evidence: [],
    rights: { basis: 'none', ownership: 'unknown' },
    hint: {},
    review: 'pending',
    lifecycle: 'active',
    origin: { discoveryId: 'character-native', runId: 'r1', runAt: '2026-09-18T00:00:00.000Z' },
    ...over,
  };
}

test('계약: 요약이 없으면 summary 칸 자체가 없다', () => {
  const t = toTopic(candidate());
  assert.equal('summary' in t, false);
});

test('계약: 요약이 있으면 그대로 나간다', () => {
  const t = toTopic(candidate({ summary: '아크릴 키링 신상을 올린 게시물이 많다.' }));
  assert.equal(t.summary, '아크릴 키링 신상을 올린 게시물이 많다.');
});

test('계약: 판정 메모는 요약 자리에도 못 앉는다', () => {
  const t = toTopic(candidate({ summary: '최근 확산 원인을 단정할 독립 출처가 부족함' }));
  assert.equal('summary' in t, false);
});

/* ─────────────────────── 정규화 ─────────────────────── */

const raw = {
  posts: [
    {
      sourceId: 'ig:1',
      platform: 'instagram',
      authorName: '햄보기네',
      authorId: 'hambogine',
      tags: ['햄보기'],
      title: '',
      text: '햄보기 키링이 나왔어요',
      views: 10,
      reactions: 0,
      followers: 0,
      url: 'https://instagram.test/1',
      postedAt: '2026-09-17T00:00:00.000Z',
    },
  ],
  drafts: [
    {
      name: '햄보기',
      aliases: [],
      entityType: 'character_candidate',
      foundIn: '본문',
      confidence: 0.9,
      sourceIds: ['ig:1'],
      evidence: '햄보기 키링',
      why: '',
    },
  ],
  verdicts: [],
  queries: [],
  ok: [],
  failed: [],
  calls: 0,
};

const CTX = { runId: 'r1', runAt: '2026-09-18T00:00:00.000Z', mock: false };

test('정규화: 저장된 요약이 이름으로 후보에 붙는다', () => {
  const cands = d.normalize({ ...raw, summaries: [{ name: '햄보기', summary: '키링 신상 게시물' }] }, CTX);
  assert.equal(cands.length, 1);
  assert.equal(cands[0].summary, '키링 신상 게시물');
});

test('정규화: 요약이 없는 옛 회차도 그대로 돈다', () => {
  // 09-05·09-14·09-17 회차에는 summaries 칸이 없다. 그때는 이 경로가 없었다.
  const cands = d.normalize(raw, CTX);
  assert.equal(cands.length, 1);
  assert.equal('summary' in cands[0], false);
});

test('정규화: why 자리에 요약을 넣지 않는다', () => {
  const cands = d.normalize({ ...raw, summaries: [{ name: '햄보기', summary: '키링 신상 게시물' }] }, CTX);
  assert.equal(cands[0].why, '');
});

/* ─────────────────────── 계정명일치 ─────────────────────── */

/*
 * `momentum.extra.계정명일치` 는 프롬프트가 아니라 `names.ts:inAccount` 가 만든다.
 * 2026-09-18 까지 표시명이 글자 그대로 같을 때만 인정해서, 캐릭터 본인 계정이
 * '아니오'로 찍혔다. 같은 함수가 근거로 셀 게시물도 고르므로 느슨하게 풀면 안 된다.
 */

const acct = (authorName: string, authorId: string, text: string) => ({
  sourceId: `x:${authorId}`,
  platform: 'instagram' as const,
  authorName,
  authorId,
  tags: [] as string[],
  title: '',
  text,
  views: 1,
  reactions: 0,
  followers: 0,
  url: `https://t.test/${authorId}`,
  postedAt: '2026-09-17T00:00:00.000Z',
});

const draft = (name: string, ids: string[]) => ({
  name,
  aliases: [] as string[],
  entityType: 'character_candidate' as const,
  foundIn: '계정명',
  confidence: 0.9,
  sourceIds: ids,
  evidence: name,
  why: '',
});

test('계정명일치: 이름이 계정명 머리에 오면 본인 계정으로 본다', async () => {
  const { verifyNames } = await import('../lib/collect/names');
  const posts = [acct("🍄Tutu's Diary", 'tutulifediary', 'Tutu 인형을 만들었어요')];
  const [n] = verifyNames(posts, [draft('Tutu', ['x:tutulifediary'])], 1);
  assert.equal(n.selfNamed, true);
});

test('계정명일치: 가게가 나열한 캐릭터는 본인 계정이 아니다', async () => {
  const { verifyNames } = await import('../lib/collect/names');
  // 실제 계정이다. 이걸 '예'로 치면 파는 캐릭터가 전부 그 가게의 것이 된다.
  const posts = [acct('💛리무네상점💛 산리오•지브리•모루카•짱구•치이카와', 'rimustore__', '치이카와 입고')];
  const [n] = verifyNames(posts, [draft('치이카와', ['x:rimustore__'])], 1);
  assert.equal(n.selfNamed, false);
});

test('계정명일치: 이름이 뒤에 붙은 계정도 본인 계정이 아니다', async () => {
  const { verifyNames } = await import('../lib/collect/names');
  const posts = [acct('맹고 | 짱구🏡', 'mango._0j', '짱구 키링')];
  const [n] = verifyNames(posts, [draft('짱구', ['x:mango._0j'])], 1);
  assert.equal(n.selfNamed, false);
});

test('계정명일치: 글자 그대로 같은 계정은 그대로 인정한다', async () => {
  const { verifyNames } = await import('../lib/collect/names');
  const posts = [acct('컬러스틱맨', 'colorstickman', '컬러스틱맨 새 그림')];
  const [n] = verifyNames(posts, [draft('컬러스틱맨', ['x:colorstickman'])], 1);
  assert.equal(n.selfNamed, true);
});

/* ─────────────────────── 시간축 (metrics.trend) ─────────────────────── */

test('시간축: 월별 편수로 나가고 빈 달도 0 으로 채운다', () => {
  const mk = (id: string, at: string, runAt: string): PostRecord =>
    ({ id, platform: 'youtube', url: `https://y.test/${id}`, postedAt: at, account: 'a',
       views: null, candidateId: 'character:로빈', discoveryId: 'character-native',
       runId: 'r', runAt } as PostRecord);
  const t = toTopic(candidate(), [
    mk('y1', '2026-06-10T00:00:00.000Z', '2026-09-14T00:00:00.000Z'),
    mk('y2', '2026-08-02T00:00:00.000Z', '2026-09-18T00:00:00.000Z'),
    mk('y3', '2026-08-20T00:00:00.000Z', '2026-09-18T00:00:00.000Z'),
  ]);
  assert.deepEqual(
    t.metrics.trend.map((p) => `${p.at}:${p.value}`),
    ['2026-06-01:1', '2026-07-01:0', '2026-08-01:2'],
    '빈 달을 건너뛰면 간격이 거짓말을 한다',
  );
});

test('시간축: 첫 관측일은 origin.runAt 이 아니라 가장 이른 때다', () => {
  // 후보 행은 회차마다 덮어써져 origin.runAt 이 매일 앞으로 밀린다. 그러면 관측 구간이
  // 영영 안 열린다. 레코드에 09-14 가 남아 있으면 그게 첫 관측일이다.
  const post = { id: 'y1', platform: 'youtube', url: 'https://y.test/1',
    postedAt: '2026-08-10T00:00:00.000Z', account: 'a', views: null,
    candidateId: 'character:로빈', discoveryId: 'character-native', runId: 'r',
    runAt: '2026-09-14T00:00:00.000Z' } as PostRecord;
  const t = toTopic(candidate(), [post]);
  assert.equal(t.metrics.observed_from, '2026-09-14');
});

test('시간축: 레코드가 없으면 칸을 만들지 않는다', () => {
  const t = toTopic(candidate());
  assert.deepEqual(t.metrics.trend, []);
  assert.equal('observed_from' in t.metrics, false);
});

/* ─────────────────────── 개인 창작자 예약 자리 ─────────────────────── */

/*
 * 이름 한도를 50 으로 올리자 기업 IP 가 16칸을 다 채우고 개인 창작자가 표에서
 * 사라졌다(토랩이·컬러스틱맨). 정렬 축이 계정 → 플랫폼 → 조회인데 개인 창작자는
 * 본인이 올리니 계정이 구조적으로 1곳이라 구조적으로 진다. 상한을 올려도 안 고쳐진다 —
 * 늘린 자리도 기업 IP 가 먼저 가져간다. 그래서 자리를 뗀다.
 */

const nm = (name: string, selfNamed = false) => ({ name, selfNamed });

test('예약: 상한 밖의 개인 창작자를 끌어올린다', async () => {
  const { pickForTable } = await import('../lib/discoveries/character-native');
  const list = [...Array(6)].map((_, i) => nm(`기업${i}`)).concat([nm('창작자', true)]);
  const out = pickForTable(list, 6, 4);
  assert.equal(out.length, 6, '자리 수는 그대로다');
  assert.ok(out.some((n) => n.name === '창작자'), '예약 자리로 들어와야 한다');
  assert.ok(!out.some((n) => n.name === '기업5'), '순위가 가장 낮은 비예약 항목이 밀린다');
  assert.equal(out[0].name, '기업0', '위쪽 순위는 건드리지 않는다');
});

test('예약: 이미 들어 있으면 아무것도 안 한다', async () => {
  const { pickForTable } = await import('../lib/discoveries/character-native');
  const list = [nm('창작자', true), ...[...Array(5)].map((_, i) => nm(`기업${i}`)), nm('뒤창작자', true)];
  const out = pickForTable(list, 6, 1);
  assert.deepEqual(out.map((n) => n.name), ['창작자', '기업0', '기업1', '기업2', '기업3', '기업4']);
});

test('예약: 채울 개인 창작자가 없으면 자리를 비우지 않는다', async () => {
  const { pickForTable } = await import('../lib/discoveries/character-native');
  const list = [...Array(8)].map((_, i) => nm(`기업${i}`));
  const out = pickForTable(list, 6, 4);
  assert.equal(out.length, 6);
  assert.ok(out.every((n) => !n.selfNamed));
});

test('예약: 상한에 못 미치면 밀어낼 이유가 없다', async () => {
  const { pickForTable } = await import('../lib/discoveries/character-native');
  const list = [nm('기업0'), nm('창작자', true)];
  assert.deepEqual(pickForTable(list, 6, 4).map((n) => n.name), ['기업0', '창작자']);
});
