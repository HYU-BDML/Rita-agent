import { test } from 'node:test';
import assert from 'node:assert/strict';

import { memeNativeDiscovery as d, MIN_MEME_AUTHORS, memesFrom } from '../lib/discoveries/meme-native';
import { verifyFormats, type FormatDraft } from '../lib/collect/formats';
import type { Post } from '../lib/collect/tikhub';

/*
 * 밈 축 — 포맷 이름을 뽑아 재검색으로 세는 2단계.
 *
 * 2026-09-18~19 에 세 번 틀리고 나온 모양이라, 틀렸던 자리를 테스트로 막는다.
 *   1. confidence 로 거르면 안 된다 (0.90 → 0계정, 0.30 → 7계정이었다)
 *   2. 검색 계정 수가 아니라 **이름 대조를 통과한** 계정 수를 센다
 *      (썬키스 챌린지가 검색 20계정인데 이름 대조 0이었다)
 *   3. 문턱은 3 — 캐릭터의 1과 반대 방향이다
 */

let n = 0;
const post = (account: string, text: string, platform = 'tiktok'): Post =>
  ({
    sourceId: `tt:${n++}`,
    platform,
    authorName: account,
    authorId: account,
    tags: [],
    title: '',
    text,
    views: 100,
    reactions: 0,
    followers: 0,
    url: `https://www.tiktok.com/@${account}/video/${n}`,
    postedAt: '2026-09-18T00:00:00.000Z',
    thumbnail: `https://cdn.test/${n}.jpg`,
  }) as Post;

const CTX = { runId: 'r1', runAt: '2026-09-19T00:00:00.000Z', mock: false };

const raw = (searches: { name: string; kind?: string; posts: Post[]; searched?: number }[]) => ({
  posts: [],
  ocr: {},
  drafts: [],
  queries: ['챌린지'],
  ok: [],
  failed: [],
  calls: 0,
  searches: searches.map((s) => ({
    name: s.name,
    kind: s.kind ?? 'challenge',
    posts: s.posts,
    searched: s.searched ?? s.posts.length,
  })),
});

test(`밈: 계정 ${MIN_MEME_AUTHORS}곳 미만이면 후보가 아니다`, () => {
  const two = ['a', 'b'].map((x) => post(x, '기침챌린지 해봤어요'));
  assert.equal(d.normalize(raw([{ name: '기침챌린지', posts: two }]), CTX).length, 0);

  const three = ['a', 'b', 'c'].map((x) => post(x, '기침챌린지 해봤어요'));
  const cands = d.normalize(raw([{ name: '기침챌린지', posts: three }]), CTX);
  assert.equal(cands.length, 1);
  assert.equal(cands[0].subject, '기침챌린지');
  assert.match(cands[0].verdict, /3개 계정/);
});

test('밈: 한 계정이 여러 번 해도 한 곳으로 센다', () => {
  const spam = [...Array(9)].map(() => post('shop', '배드챌린지 막차'));
  assert.equal(d.normalize(raw([{ name: '배드챌린지', posts: spam }]), CTX).length, 0);
});

test('밈: 검색 건수가 아니라 이름 대조를 통과한 계정으로 센다', () => {
  // 썬키스 챌린지가 실제로 이랬다 — 검색 20건이 왔는데 이름이 캡션에 있는 건 0건.
  const matched = ['a', 'b', 'c'].map((x) => post(x, '썬키스 챌린지 찍음'));
  const c = d.normalize(raw([{ name: '썬키스 챌린지', posts: matched, searched: 20 }]), CTX);
  assert.equal(c.length, 1);
  assert.equal(c[0].momentum.extra?.['이름대조'], '3/20', '몇 건 중 몇 건이 진짜인지 남긴다');
});

test('밈: 이름이 그대로 제목이 된다 — 카드뉴스 주제로 쓸 수 있어야 한다', () => {
  const three = ['a', 'b', 'c'].map((x) => post(x, '스파이더맨 챌린지 막차'));
  const c = d.normalize(raw([{ name: '스파이더맨 챌린지', posts: three }]), CTX)[0];
  assert.equal(c.subject, '스파이더맨 챌린지');
  assert.equal(c.unit, 'topic', "scope 'meme' 로 갈리는 조건이다");
  assert.equal(c.why, '', '이 판정기는 왜 뜨는지를 묻지 않는다');
});

test('밈: 저장된 요약이 후보에 붙는다', () => {
  const three = ['a', 'b', 'c'].map((x) => post(x, '기침챌린지'));
  const r = { ...raw([{ name: '기침챌린지', posts: three }]), summaries: [{ name: '기침챌린지', summary: '기침 소리에 맞춰 춤추는 영상' }] };
  assert.equal(d.normalize(r, CTX)[0].summary, '기침 소리에 맞춰 춤추는 영상');
});

test('밈: 레코드가 붙어야 계약에 썸네일이 실린다', () => {
  const three = ['a', 'b', 'c'].map((x) => post(x, '기침챌린지'));
  const r = raw([{ name: '기침챌린지', posts: three }]);
  const cands = d.normalize(r, CTX);
  const recs = d.records!(r, CTX, cands);
  assert.equal(recs.length, 3);
  assert.ok(recs.every((x) => x.candidateId === 'meme:기침챌린지'));
  assert.ok(recs.every((x) => x.thumbnailUrl));
});

test('밈: 30일 지난 영상은 세지 않는다', () => {
  const old = ['a', 'b', 'c'].map((x) => ({ ...post(x, '기침챌린지'), postedAt: '2025-07-03T00:00:00.000Z' }));
  assert.equal(memesFrom(raw([{ name: '기침챌린지', posts: old }]), CTX.runAt).length, 0);
});

/* ── 1단계: 이름 제안 ─────────────────────────────────────────── */

const draft = (name: string, conf: number): FormatDraft => ({
  name,
  kind: 'challenge',
  evidence: name,
  sourceIds: [],
  confidence: conf,
  why: '',
});

test('이름: 원문에 없는 이름은 버린다', () => {
  const posts = [post('a', '기침챌린지 해봤어요')];
  const out = verifyFormats(posts, new Map(), [draft('기침챌린지', 0.5), draft('지어낸챌린지', 0.9)]);
  assert.deepEqual(out.map((o) => o.draft.name), ['기침챌린지']);
});

test('이름: 자막에만 있어도 인정한다 — 포맷 이름은 자막에 박힌다', () => {
  const p = post('a', '오늘도 찍어봤어요');
  const out = verifyFormats([p], new Map([[p.sourceId, '남자 유행어 TOP4']]), [draft('남자 유행어 TOP4', 0.9)]);
  assert.equal(out.length, 1);
});

test('이름: confidence 가 낮아도 버리지 않는다', () => {
  // `유행 막차타기` 는 confidence 0.30 이었는데 재검색에서 7계정이 나왔다.
  // 확신은 "이름이 분명한가"지 "남들이 따라 하는가"가 아니다. 거르는 건 재검색뿐이다.
  const posts = [post('a', '유행 막차타기 #10')];
  const out = verifyFormats(posts, new Map(), [draft('유행 막차타기', 0.3)]);
  assert.equal(out.length, 1, '낮은 확신을 여기서 거르면 제일 큰 밈을 놓친다');
});

/* ── 안전 판정 3단 (2026-09-19) ────────────────────────────────── */

import { safetyGate } from '../lib/producers/shared';
import { pick as pickSafety } from '../lib/collect/meme-safety';
import { toBrief, toTopic } from '../lib/core/brief';
import type { Candidate } from '../lib/core/candidate';

/*
 * 첫 회차 1위가 `야차룰`이었다 — 사람이 죽은 폭력 유행이다. 이 앱은 후보에서
 * 카드뉴스를 만드는 도구라 그대로 두면 그 유행에 올라타는 카드가 만들어진다.
 *
 * 3단인 이유: 2단으로 하면 애매한 것을 전부 막게 되고 블랙 코미디·자조가 사라진다.
 * **애매하면 막지 않고 표시한다.**
 */

const memeCand = (over: Partial<Candidate> = {}): Candidate => ({
  id: 'meme:테스트',
  unit: 'topic',
  subject: '테스트밈',
  verdict: '5개 계정이 따라 함',
  why: '',
  grounded: true,
  momentum: { accounts: 5 },
  evidence: [{ source: 'tiktok', title: '제목', url: 'https://t.test/1' }],
  rights: { basis: 'none', ownership: 'unknown' },
  hint: {},
  review: 'pending',
  lifecycle: 'active',
  origin: { discoveryId: 'meme-native', runId: 'r', runAt: '2026-09-19T00:00:00.000Z' },
  ...over,
});

test('안전: blocked 는 생성기가 막는다', () => {
  const c = memeCand({ safety: { level: 'blocked', reason: '사람이 숨진 사건이 얽힘', evidence: '숨진 채 발견' } });
  const g = safetyGate(c);
  assert.equal(g.ok, false);
  assert.match(g.ok === false ? g.reason : '', /숨진 채 발견/, '근거를 보여 줘야 사람이 오판을 푼다');
});

test('안전: flagged 는 막지 않는다 — 표시일 뿐이다', () => {
  const c = memeCand({ safety: { level: 'flagged', reason: '블랙 코미디로 보임', evidence: '인생 끝났다ㅋㅋ' } });
  assert.equal(safetyGate(c).ok, true, '애매한 것을 막으면 블랙 코미디가 전부 사라진다');
  assert.equal(safetyGate(memeCand()).ok, true, '판정이 없어도 막지 않는다');
});

test('계약: blocked 는 넘기지 않는다', () => {
  const b = toBrief([memeCand({ safety: { level: 'blocked', reason: '폭력', evidence: 'x' } })], []);
  assert.equal(b.topics.length, 0);
});

test('계약: flagged 는 넘기되 safety_note 를 붙인다', () => {
  const c = memeCand({ safety: { level: 'flagged', reason: '과장된 표현', evidence: '죽고싶다 진짜' } });
  const t = toTopic(c);
  assert.match(t.safety_note ?? '', /과장된 표현/);
  assert.match(t.safety_note ?? '', /죽고싶다 진짜/);
  assert.equal(toBrief([c], []).topics.length, 1, '표시는 금지가 아니다');
});

test('계약: 판정이 ok 면 칸을 만들지 않는다', () => {
  assert.equal('safety_note' in toTopic(memeCand({ safety: { level: 'ok', reason: '', evidence: '' } })), false);
});

test('안전: 등급을 못 읽으면 통과가 아니라 표시로 둔다', () => {
  const out = pickSafety([{ name: 'a' }, { name: 'b' }], [
    { name: 'a', level: '알수없음', reason: '', evidence: '' },
    { name: 'b', level: 'ok', reason: '', evidence: '' },
  ]);
  assert.equal(out.find((x) => x.name === 'a')?.level, 'flagged', '깨진 판정을 통과로 두면 안 된다');
  assert.equal(out.find((x) => x.name === 'b')?.level, 'ok');
});

test('안전: 입력에 없던 이름은 버린다', () => {
  const out = pickSafety([{ name: 'a' }], [{ name: '지어낸밈', level: 'blocked', reason: '', evidence: '' }]);
  assert.equal(out.length, 0);
});
