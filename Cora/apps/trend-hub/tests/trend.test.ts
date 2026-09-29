import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  EMPTY_TREND,
  GROWTH_MIN,
  RUNS_FOR_VERDICT,
  comparableAcrossRuns,
  directionOf,
  gradeOf,
  growthOf,
  logSlope,
  observedDay,
  ratio,
  type Point,
} from '../lib/core/trend';
import {
  DISCOVERIES,
  PRODUCERS,
  availableDiscoveries,
  availableProducers,
  heldDiscoveries,
  heldProducers,
  hiddenDiscoveries,
  hiddenProducers,
} from '../lib/core/registry';

/*
 * 회차 간 비교.
 *
 * 후보 표는 회차마다 덮어써진다. 비교 값이 조용히 틀리면 '올랐다'는 말만 남고
 * 그 말이 맞는지 확인할 방법이 화면에 없다. 그래서 계산을 여기서 조인다.
 */

function pt(over: Partial<Point>): Point {
  return { runId: 'r', at: '2026-09-05T00:00:00.000Z', surge: null, mediaCount: null, accounts: null, views: null, ...over };
}

test('배수: 없는 값과 0 나누기에서 NaN 이 새지 않는다', () => {
  assert.equal(ratio(3, 1.5), 2);
  assert.equal(ratio(1, 3), 0.33);
  assert.equal(ratio(null, 2), null);
  assert.equal(ratio(2, null), null);
  assert.equal(ratio(2, 0), null, '0 으로 나누면 Infinity 가 아니라 null 이다');
  assert.equal(ratio(Number.NaN, 2), null);
});

test('증가율: 회차가 하나뿐이면 비교하지 않는다', () => {
  assert.equal(growthOf([]), null);
  assert.equal(growthOf([pt({ surge: 4 })]), null);
  assert.equal(EMPTY_TREND.growth, null);
});

test('증가율: 마지막 두 회차만 본다', () => {
  const points = [pt({ surge: 1 }), pt({ surge: 2 }), pt({ surge: 3 })];
  assert.equal(growthOf(points), 1.5, '3/2 이지 3/1 이 아니다');
});

test('증가율: 재는 축이 없으면 다음 축으로 넘어간다', () => {
  // 뉴스 후보는 급등 배수를 못 재는 회차가 있다. 그때는 매체 수로 견준다.
  const points = [pt({ surge: null, mediaCount: 2 }), pt({ surge: null, mediaCount: 5 })];
  assert.equal(growthOf(points), 2.5);

  const accounts = [pt({ accounts: 10 }), pt({ accounts: 15 })];
  assert.equal(growthOf(accounts), 1.5);

  assert.equal(growthOf([pt({}), pt({})]), null, '어느 축도 없으면 지어내지 않는다');
});

/*
 * 세워 둔 어댑터.
 *
 * 안 도는 것을 목록에 그냥 두면 되는 것과 섞여 화면이 무슨 상태인지 알 수 없게 된다.
 * 실제로 그렇게 됐었다 — 키가 여섯 개 꽂혀 있는데 한 번도 안 돈 어댑터가 넷이었다.
 */

test('세워 둔 것은 목록에서 내려간다', () => {
  for (const d of availableDiscoveries()) assert.equal(d.held, undefined, `${d.id} 가 목록에 남아 있다`);
  for (const p of availableProducers()) assert.equal(p.held, undefined, `${p.id} 가 목록에 남아 있다`);
});

test('세워 둔 것은 키 없음과 섞이지 않는다', () => {
  // 둘을 섞으면 고쳐야 열리는 것을 두고 사람이 키를 찾으러 간다.
  const heldIds = new Set([...heldDiscoveries(), ...heldProducers()].map((x) => x.id));
  for (const x of [...hiddenDiscoveries(), ...hiddenProducers()]) {
    assert.equal(heldIds.has(x.id), false, `${x.id} 가 양쪽에 다 있다`);
  }
});

test('세워 둔 것에는 이유가 적혀 있다', () => {
  for (const x of [...heldDiscoveries(), ...heldProducers()]) {
    assert.ok((x.held ?? '').length > 10, `${x.id} 에 왜 세웠는지가 없다`);
  }
});

test('어느 칸에도 안 들어가는 어댑터가 없다', () => {
  const bucketed = (
    [
      ...availableDiscoveries(),
      ...hiddenDiscoveries(),
      ...heldDiscoveries(),
    ] as { id: string }[]
  ).length;
  assert.equal(bucketed, DISCOVERIES.length);

  const producers = [...availableProducers(), ...hiddenProducers(), ...heldProducers()].length;
  assert.equal(producers, PRODUCERS.length);
});

/*
 * 로그 회귀 추이 (Dify v13.2 의 추이 계산).
 *
 * 직전 회차 대비 배수 하나는 한 번의 튐에 통째로 흔들린다. 그래서 회차 전체에
 * 회귀를 걸고, 회차가 모자라면 방향을 아예 말하지 않는다.
 */

test('기울기: 오르는 열은 양수, 내리는 열은 음수', () => {
  assert.ok((logSlope([10, 100, 1000]) ?? 0) > 0);
  assert.ok((logSlope([1000, 100, 10]) ?? 0) < 0);
  assert.equal(logSlope([50, 50, 50]), 0);
});

test('기울기: 자릿수가 널뛰어도 큰 값 하나가 다 먹지 않는다', () => {
  // 원값 회귀였다면 100만짜리 하나가 기울기를 지배한다. log1p 를 쓰는 이유다.
  const spike = logSlope([10, 12, 1_000_000]) ?? 0;
  assert.ok(spike < 10, `기울기가 튀었다: ${spike}`);
});

test('기울기: 점이 하나면 말하지 않는다', () => {
  assert.equal(logSlope([5]), null);
  assert.equal(logSlope([]), null);
  assert.equal(logSlope([null, null]), null);
});

test('방향: 회차가 모자라면 판정하지 않는다', () => {
  const two = [pt({ views: 10 }), pt({ views: 1000 })];
  const r = directionOf(two);
  assert.ok(r.slope != null, '기울기는 계산된다');
  assert.equal(r.direction, null, `회차 ${RUNS_FOR_VERDICT}번 전에는 방향을 말하지 않는다`);
});

test('방향: 문턱을 넘어야 오른다고 말한다', () => {
  const up = directionOf([pt({ views: 10 }), pt({ views: 100 }), pt({ views: 1000 })]);
  assert.equal(up.direction, 'up');
  assert.ok((up.slope ?? 0) >= GROWTH_MIN);

  const flat = directionOf([pt({ views: 100 }), pt({ views: 101 }), pt({ views: 102 })]);
  assert.equal(flat.direction, 'flat', '흔들림을 추세로 읽으면 안 된다');

  const down = directionOf([pt({ views: 1000 }), pt({ views: 100 }), pt({ views: 10 })]);
  assert.equal(down.direction, 'down');
});

test('방향: 재는 축이 회차마다 달라도 있는 축을 고른다', () => {
  // 캐릭터는 조회, 주제는 급등. 한 함수가 둘 다 받는다.
  const byViews = directionOf([pt({ views: 10 }), pt({ views: 100 }), pt({ views: 1000 })]);
  assert.equal(byViews.direction, 'up');
  const bySurge = directionOf([pt({ surge: 1 }), pt({ surge: 3 }), pt({ surge: 9 })]);
  assert.equal(bySurge.direction, 'up');
  assert.equal(directionOf([pt({}), pt({}), pt({})]).direction, null, '축이 없으면 지어내지 않는다');
});

test('빈 추이에는 방향이 없다', () => {
  assert.equal(EMPTY_TREND.slope, null);
  assert.equal(EMPTY_TREND.direction, null);
});

/*
 * 판정 등급 3단 (9/20 지시서 T2).
 *
 * 여기서 지키는 것은 **등급이 거짓말을 하지 않는 것**이다. 09-14 에 5분 간격으로 두 번
 * 돌린 적이 있는데 그걸 두 번 본 것으로 세면 하루짜리 후보가 "잠정"이 된다.
 */

test('관측일: UTC 가 아니라 한국 날짜로 자른다', () => {
  // 09-05 회차는 15:56Z 라 UTC 로는 09-05 지만 한국에서는 09-06 00:56 에 돌린 것이다.
  assert.equal(observedDay('2026-09-05T15:56:00.000Z'), '2026-09-06');
  assert.equal(observedDay('2026-09-17T06:26:00.000Z'), '2026-09-17');
});

test('등급: 같은 날 두 번 본 것은 한 번이다', () => {
  const sameDay = [pt({ at: '2026-09-14T10:15:00.000Z' }), pt({ at: '2026-09-14T10:20:00.000Z' })];
  const g = gradeOf(sameDay);
  assert.equal(g.days, 1, '5분 간격 회차가 두 번 관측이 되면 안 된다');
  assert.equal(g.label, '새로 포착');
});

test('등급: 관측일이 쌓이는 만큼만 오른다', () => {
  const day = (d: string) => pt({ at: `2026-09-${d}T10:00:00.000Z` });
  assert.equal(gradeOf([day('14')]).label, '새로 포착');
  assert.equal(gradeOf([day('14'), day('17')]).label, '잠정');
  assert.equal(gradeOf([day('14'), day('17'), day('18')]).label, '확정');
});

test('등급: 확정 문턱은 방향이 열리는 문턱과 같다', () => {
  // 단위가 어긋나면 "확정"인데 방향이 안 열리는 후보가 생긴다. 화면에서 둘이 따로 논다.
  const days = Array.from({ length: RUNS_FOR_VERDICT }, (_, i) =>
    pt({ at: `2026-09-1${i}T10:00:00.000Z`, accounts: (i + 1) * 10 }),
  );
  assert.equal(gradeOf(days).level, 'confirmed');
  assert.notEqual(directionOf(days).direction, null, '확정인데 방향이 null 이면 어긋난 것이다');
});

test('등급: 점이 없어도 빈칸으로 두지 않는다', () => {
  // 빈칸을 없애는 게 이 배지의 목적이다. 여기서 비우면 만든 이유가 사라진다.
  const g = gradeOf([], '2026-09-17T06:26:00.000Z');
  assert.equal(g.label, '새로 포착');
  assert.equal(g.lastSeen, '2026-09-17');
  assert.equal(gradeOf([]).lastSeen, null, '기댈 날짜조차 없으면 날짜를 지어내지 않는다');
});

test('등급: 마지막 관측일이 붙는다', () => {
  // 열흘 전에 한 번 본 것과 오늘 처음 본 것이 같은 배지를 달면 오해가 생긴다.
  const g = gradeOf([pt({ at: '2026-09-05T15:56:00.000Z' })]);
  assert.equal(g.lastSeen, '2026-09-06');
});

test('비교 축: 캐릭터는 회차 간 비교를 하지 않는다', () => {
  // momentum.views 는 그 회차가 우연히 건진 게시물의 조회 합계다. 회차마다 표본이 바뀐다.
  assert.equal(comparableAcrossRuns('subject'), false);
  assert.equal(comparableAcrossRuns('topic'), true, '주제는 매체 수·검색 급등을 같은 자로 잰다');
});
