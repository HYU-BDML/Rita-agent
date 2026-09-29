import test from 'node:test';
import assert from 'node:assert/strict';
import { KEEP_FIRST, MAX_EVIDENCE, MAX_NEW_PER_RUN, keepTracked, mergeEvidence } from '../lib/core/tracking';
import type { Evidence } from '../lib/core/candidate';

const ev = (n: number): Evidence => ({ source: '연합뉴스', title: `기사 ${n}`, url: `https://example.com/${n}` });
const many = (from: number, count: number) => Array.from({ length: count }, (_, i) => ev(from + i));

test('추적 근거: 이미 있는 기사는 다시 넣지 않는다', () => {
  const merged = mergeEvidence([ev(1), ev(2)], [ev(2), ev(3)]);
  assert.deepEqual(merged.map((e) => e.url), [
    'https://example.com/1',
    'https://example.com/2',
    'https://example.com/3',
  ]);
});

test('추적 근거: 거르기가 자르기보다 먼저다', () => {
  // 실제로 걸릴 뻔했다 — 자르기를 앞에 두면 이미 아는 기사가 상한을 채운 날
  // 새 기사가 뒤로 밀려 하나도 안 들어온다. 오래 추적한 후보일수록 그렇게 된다.
  const existing = many(1, 20);
  const additions = [...many(1, 20), ev(99)];
  const merged = mergeEvidence(existing, additions);
  assert.equal(merged.length, 21);
  assert.equal(merged.at(-1)!.url, 'https://example.com/99');
});

test('추적 근거: 한 회차가 붙이는 새 근거는 상한까지만', () => {
  const merged = mergeEvidence([], many(1, 50));
  assert.equal(merged.length, MAX_NEW_PER_RUN);
});

test('추적 근거: 총량이 넘치면 수집 근거는 남기고 오래된 추적분부터 민다', () => {
  // 맨 앞은 수집이 붙인 근거다. 이게 왜 후보가 됐는지를 말하므로 밀어내면 안 된다.
  const existing = [...many(1, KEEP_FIRST), ...many(100, MAX_EVIDENCE - KEEP_FIRST)];
  assert.equal(existing.length, MAX_EVIDENCE);
  const merged = mergeEvidence(existing, [ev(999)]);

  assert.equal(merged.length, MAX_EVIDENCE);
  // 수집 근거 12건은 그대로 앞에 있다.
  assert.deepEqual(merged.slice(0, KEEP_FIRST).map((e) => e.url), many(1, KEEP_FIRST).map((e) => e.url));
  // 새 기사는 들어왔고, 가장 오래된 추적분(100)이 빠졌다.
  assert.equal(merged.at(-1)!.url, 'https://example.com/999');
  assert.ok(!merged.some((e) => e.url === 'https://example.com/100'));
});

test('추적 근거: 상한 안이면 아무것도 버리지 않는다', () => {
  const existing = many(1, 10);
  const merged = mergeEvidence(existing, [ev(50)]);
  assert.equal(merged.length, 11);
});

test('다시 세우기: 추적이 모아 온 근거만 되붙인다', () => {
  // 2026-09-22 실제로 날아갔다 — 갈래를 소급하려고 재정규화 한 번 돌렸더니
  // 칸라이언즈의 근거가 13건에서 8건이 됐다. 추적이 주워 온 다섯 건이 그것이다.
  const rebuilt = [ev(1), ev(2)];
  const previous = [
    ev(1),
    { ...ev(9), via: 'tracking' as const },
    { ...ev(8), via: 'tracking' as const },
    ev(7), // 수집이 냈다가 규칙이 바뀌어 빠진 근거. 되살리면 안 된다.
  ];
  const kept = keepTracked(rebuilt, previous);
  assert.deepEqual(kept.map((e) => e.url), [
    'https://example.com/1',
    'https://example.com/2',
    'https://example.com/9',
    'https://example.com/8',
  ]);
});

test('다시 세우기: 추적 근거가 없으면 새로 세운 것을 그대로 쓴다', () => {
  const rebuilt = [ev(1), ev(2)];
  assert.equal(keepTracked(rebuilt, [ev(1), ev(3)]), rebuilt);
});

test('다시 세우기: 같은 url 이면 새로 세운 쪽을 남긴다', () => {
  // 규칙이 바뀌어 발췌·썸네일이 달라질 수 있다. 옛 사본이 이기면 안 된다.
  const rebuilt = [{ ...ev(5), excerpt: '새 규칙으로 뽑은 발췌' }];
  const kept = keepTracked(rebuilt, [{ ...ev(5), via: 'tracking' as const, excerpt: '옛것' }]);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].excerpt, '새 규칙으로 뽑은 발췌');
});
