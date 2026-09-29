import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { GrammarEvidence, GrammarWithEvidence } from '../lib/core/grammar';
import type { PostRecord } from '../lib/core/post-record';
import { P25_MIN_POSTS, weekly } from '../lib/core/weekly';

/*
 * 브리프 한 장 (세션 4).
 *
 * 여기서 지키는 것 셋.
 *   1. 고르는 규칙이 데이터에서만 나온다 — 근거 수, 동점이면 신선도
 *   2. 표본이 적을 때 사분위를 내지 않는다. 한 건만 달라도 크게 튄다
 *   3. 추이·기울기를 만들지 않는다. 수집이 과거 2주까지만 닿아 전부 상승으로 보인다
 */

function ev(p: { subject: string; views?: number | null }): GrammarEvidence {
  return {
    candidateId: `c-${p.subject}`,
    subject: p.subject,
    url: `https://t/${p.subject}`,
    topViews: p.views ?? null,
    accounts: 1,
    thumbs: [],
    caption: null,
    line: '계정 1곳이 따라 했습니다',
    quote: false,
    freshness: null,
  };
}

function gram(p: {
  id: string;
  name: string;
  evidence: GrammarEvidence[];
  freshness?: number | null;
}): GrammarWithEvidence {
  return {
    id: p.id,
    name: p.name,
    kind: 'video',
    need: { item: false },
    desc: '한 줄',
    match: /x/,
    evidence: p.evidence,
    freshness: p.freshness ?? null,
  };
}

function post(subject: string, views: number | null): PostRecord {
  return {
    id: `p-${subject}-${Math.random()}`,
    platform: 'tiktok',
    url: `https://t/${Math.random()}`,
    postedAt: '2026-09-20T00:00:00Z',
    account: `a-${Math.random()}`,
    views,
    candidateId: `c-${subject}`,
    discoveryId: 'meme-native',
    runId: 'r',
    runAt: '2026-09-24T00:00:00.000Z',
  };
}

const ASOF = '2026-09-24T09:00:00Z';
const RUNS = ['2026-09-22T01:00:00Z', '2026-09-24T01:00:00Z', '2026-09-24T09:00:00Z'];

test('브리프: 근거가 가장 많은 방식을 고른다', () => {
  const gs = [
    gram({ id: 'a', name: '적은 쪽', evidence: [ev({ subject: 'x' })], freshness: 99 }),
    gram({ id: 'b', name: '많은 쪽', evidence: [ev({ subject: 'y' }), ev({ subject: 'z' })], freshness: 1 }),
  ];
  const w = weekly(gs, [post('y', 1), post('z', 1)], ASOF, RUNS)!;
  // 신선도가 낮아도 근거가 많은 쪽이 먼저다.
  assert.equal(w.top.name, '많은 쪽');
});

test('브리프: 근거 수가 같으면 신선도 높은 쪽', () => {
  const gs = [
    gram({ id: 'a', name: '식은 쪽', evidence: [ev({ subject: 'x' })], freshness: 10 }),
    gram({ id: 'b', name: '신선한 쪽', evidence: [ev({ subject: 'y' })], freshness: 90 }),
  ];
  assert.equal(weekly(gs, [], ASOF, RUNS)!.top.name, '신선한 쪽');
});

test('브리프: 근거 카드는 최고 조회 한 건', () => {
  const gs = [
    gram({
      id: 'a',
      name: '하나',
      evidence: [ev({ subject: '적은', views: 100 }), ev({ subject: '많은', views: 9000 })],
    }),
  ];
  assert.equal(weekly(gs, [], ASOF, RUNS)!.lead.subject, '많은');
});

test('브리프: 조회수 붙은 게시물이 10건 미만이면 사분위를 내지 않는다', () => {
  // 표본이 적을 때 나오는 사분위는 한 건만 달라도 크게 튄다.
  const gs = [gram({ id: 'a', name: '하나', evidence: [ev({ subject: 'x', views: 5 })] })];
  const nine = Array.from({ length: P25_MIN_POSTS - 1 }, (_, i) => post('x', (i + 1) * 100));
  assert.equal(weekly(gs, nine, ASOF, RUNS)!.p25, null);
  const ten = [...nine, post('x', 1000)];
  assert.notEqual(weekly(gs, ten, ASOF, RUNS)!.p25, null);
});

test('브리프: 조회수 없는 게시물은 사분위 표본에서 뺀다', () => {
  // null 을 0 으로 치면 하위 사분위가 0 이 된다.
  const gs = [gram({ id: 'a', name: '하나', evidence: [ev({ subject: 'x', views: 5 })] })];
  const posts = [
    ...Array.from({ length: 12 }, () => post('x', 1000)),
    ...Array.from({ length: 12 }, () => post('x', null)),
  ];
  assert.equal(weekly(gs, posts, ASOF, RUNS)!.p25, 1000);
});

test('브리프: 하위 25% 는 오름차순 네 칸 중 첫 칸이다', () => {
  const gs = [gram({ id: 'a', name: '하나', evidence: [ev({ subject: 'x', views: 5 })] })];
  // 1..20 → 20 * 0.25 = 5 번째 자리(0부터 세어 index 5) = 6
  const posts = Array.from({ length: 20 }, (_, i) => post('x', i + 1));
  assert.equal(weekly(gs, posts, ASOF, RUNS)!.p25, 6);
});

test('브리프: 관측은 회차 수가 아니라 날 수다', () => {
  // 같은 날 세 번 돌린 것은 하루다. RUNS 는 09-22 와 09-24(두 번) 이라 이틀이다.
  const gs = [gram({ id: 'a', name: '하나', evidence: [ev({ subject: 'x' })] })];
  assert.equal(weekly(gs, [], ASOF, RUNS)!.days, 2);
});

test('브리프: 근거는 합집합이다. 같은 게시물은 방식이 달라도 한 건', () => {
  const same = ev({ subject: 'x' });
  const gs = [
    gram({ id: 'a', name: 'A', evidence: [same, ev({ subject: 'y' })] }),
    gram({ id: 'b', name: 'B', evidence: [same] }),
  ];
  assert.equal(weekly(gs, [], ASOF, RUNS)!.sources, 2);
});

test('브리프: 근거가 하나도 없으면 null 이다', () => {
  // 억지로 채우거나 얇은 방식을 끌어올리지 않는다.
  assert.equal(weekly([gram({ id: 'a', name: '하나', evidence: [] })], [], ASOF, RUNS), null);
  assert.equal(weekly([], [], ASOF, RUNS), null);
});

test('브리프: 기준일을 한국 날짜로 자른다', () => {
  const gs = [gram({ id: 'a', name: '하나', evidence: [ev({ subject: 'x' })] })];
  // 2026-09-24T15:30Z 는 한국에서 09-25 00:30 이다.
  assert.equal(weekly(gs, [], '2026-09-24T15:30:00Z', RUNS)!.asOfDay, '2026-09-25');
});
