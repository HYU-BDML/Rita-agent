import { test } from 'node:test';
import assert from 'node:assert/strict';

import { freshness, postingSeries } from '../lib/core/series';
import type { PostRecord } from '../lib/core/post-record';

/*
 * 변화 그래프 (지시서 P5).
 *
 * 여기서 지키는 것은 **선이 실제보다 좋아 보이지 않는 것**이다. 빈 달을 건너뛰면
 * 공백이 옆칸처럼 붙어 곡선이 촘촘해 보이고, 역산 구간을 관측처럼 그리면
 * 표본이 관측으로 둔갑한다.
 */
function rec(postedAt: string | null): PostRecord {
  return {
    id: `p-${postedAt ?? 'x'}-${Math.random()}`,
    platform: 'youtube',
    url: 'https://y/1',
    postedAt,
    account: 'a',
    views: null,
    candidateId: 'c',
    discoveryId: 'benchmark-native',
    runId: 'r',
    runAt: '2026-09-17T00:00:00.000Z',
  };
}

test('시리즈: 빈 달을 0 으로 메운다', () => {
  // 3월과 7월만 있는데 두 점을 붙여 그리면 넉 달 공백이 사라진다.
  const s = postingSeries([rec('2026-03-10T00:00:00Z'), rec('2026-07-10T00:00:00Z')], '2026-09-17T00:00:00Z');
  assert.deepEqual(s.months.map((m) => m.month), ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07']);
  assert.deepEqual(s.months.map((m) => m.count), [1, 0, 0, 0, 1]);
});

test('시리즈: 첫 관측일로 역산과 관측을 가른다', () => {
  const posts = [
    rec('2026-09-10T00:00:00Z'), // 관측 전
    rec('2026-09-16T00:00:00Z'), // 관측 전
    rec('2026-09-17T09:00:00Z'), // 관측 당일 — 관측에 든다
  ];
  const s = postingSeries(posts, '2026-09-17T06:26:00Z');
  assert.equal(s.observedFrom, '2026-09-17');
  assert.equal(s.backfilled, 2);
  assert.equal(s.observed, 1);
});

test('시리즈: 게시일이 없는 레코드는 세지 않는다', () => {
  // 모르는 날짜를 오늘로 치면 없는 봉우리가 생긴다.
  const s = postingSeries([rec(null), rec('2026-09-10T00:00:00Z')], '2026-09-17T00:00:00Z');
  assert.equal(s.backfilled + s.observed, 1);
});

test('시리즈: 레코드가 없으면 빈 채로 돌려준다', () => {
  const s = postingSeries([], '2026-09-17T00:00:00Z');
  assert.deepEqual(s.months, []);
  assert.equal(s.peak, null);
});

test('시리즈: 달을 한국 날짜로 센다', () => {
  // 2026-09-30T15:30Z 는 한국에서 10-01 00:30 이다. UTC 로 세면 9월로 들어간다.
  const s = postingSeries([rec('2026-09-30T15:30:00Z')], '2026-09-01T00:00:00Z');
  assert.deepEqual(s.months.map((m) => m.month), ['2026-10']);
});

/*
 * 신선도 (세션 1).
 *
 * 여기서 지키는 것은 **모르는 것을 0 으로 적지 않는 것**이다. 표본이 적을 때 나오는
 * 비중은 한 건만 달라도 크게 튀는데, 그 값을 화면에 내면 "신선하지 않음"으로 읽힌다.
 */
function days(...list: string[]): PostRecord[] {
  return list.map((d) => rec(`${d}T00:00:00Z`));
}

/** 같은 날 n 건. 분모를 10 건 위로 올리는 데 쓴다. */
function many(day: string, n: number): PostRecord[] {
  return days(...Array.from({ length: n }, () => day));
}

test('신선도: 10 건 미만이면 null 이다 (0 이 아니다)', () => {
  // 3 건 중 1 건이 최근이면 33% 가 나오지만 한 건만 달라도 0% 나 67% 로 튄다.
  const posts = [...days('2026-09-20'), ...days('2026-01-10', '2026-02-10')];
  assert.equal(posts.length, 3);
  assert.equal(freshness(posts, '2026-09-24T00:00:00Z'), null);

  // 9 건까지 null, 10 건에서 값이 열린다.
  assert.equal(freshness(many('2026-09-20', 9), '2026-09-24T00:00:00Z'), null);
  assert.equal(freshness(many('2026-09-20', 10), '2026-09-24T00:00:00Z'), 100);
});

test('신선도: 경계는 asOf 에서 30 일 전이고 그 날은 든다', () => {
  // 2026-09-24 의 30 일 전은 08-25 다. 08-25 는 최근, 08-24 는 아니다.
  const asOf = '2026-09-24T00:00:00Z';
  assert.equal(freshness(many('2026-08-25', 10), asOf), 100);
  assert.equal(freshness(many('2026-08-24', 10), asOf), 0);
});

test('신선도: 게시일이 없는 레코드는 분모에서도 빠진다', () => {
  // 시점을 모르는 것을 "최근이 아님" 쪽에 넣으면 인스타·X 섞인 후보만 값이 내려간다.
  const posts = [...many('2026-09-20', 10), rec(null), rec(null)];
  assert.equal(freshness(posts, '2026-09-24T00:00:00Z'), 100);

  // 게시일 있는 것이 10 건을 못 채우면 레코드가 많아도 null 이다.
  assert.equal(freshness([...many('2026-09-20', 9), rec(null)], '2026-09-24T00:00:00Z'), null);
});

test('신선도: 비중을 정수로 반올림한다', () => {
  // 최근 1 건 / 전체 3 건 = 33.3% → 33. 분모를 12 로 잡아 10 건 문턱을 넘긴다.
  const posts = [...many('2026-09-20', 4), ...many('2026-01-10', 8)];
  assert.equal(freshness(posts, '2026-09-24T00:00:00Z'), 33);
});

test('신선도: 경계를 한국 날짜로 자른다', () => {
  // 2026-08-24T15:30Z 는 한국에서 08-25 00:30 이다. UTC 로 자르면 경계 밖으로 떨어진다.
  const posts = Array.from({ length: 10 }, () => rec('2026-08-24T15:30:00Z'));
  assert.equal(freshness(posts, '2026-09-24T00:00:00Z'), 100);
});

test('신선도: 기준일을 넘겨야 하는 이유 — 사흘 밀면 값이 바뀐다', () => {
  /*
   * `asOf` 를 선택으로 만들고 오늘을 기본값으로 두면 안 된다. 수집이 멈춰 있는 동안
   * 경계가 매일 뒤로 밀려서 주간 비교가 깨진다 — 값이 내려간 게 아니라 안 본 것인데
   * 화면에는 식은 것으로 나온다. 재는 시점은 부르는 쪽이 정한다.
   */
  const posts = [...many('2026-08-26', 5), ...many('2026-08-20', 5)];
  assert.equal(freshness(posts, '2026-09-24T00:00:00Z'), 50); // 경계 08-25
  assert.equal(freshness(posts, '2026-09-27T00:00:00Z'), 0); // 경계 08-28 — 다섯 건이 밖으로
});

test('신선도: 치이카와 모양 — 25 건 중 18 건이 최근이면 72%', () => {
  // 실제 db.json 의 치이카와가 이 모양이다 (PROMPT.md §7 검증값).
  const posts = [...many('2026-09-10', 18), ...many('2026-03-10', 7)];
  assert.equal(posts.length, 25);
  assert.equal(freshness(posts, '2026-09-24T00:00:00Z'), 72);
});
