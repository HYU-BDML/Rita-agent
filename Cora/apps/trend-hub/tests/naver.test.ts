import { test } from 'node:test';
import assert from 'node:assert/strict';
import { __ratioForTest as ratio } from '../lib/collect/naver';

/*
 * 검색량이 거의 없던 말에 배수를 붙이면 허수가 나온다.
 * 실제로 '용혜인'이 작년비 134.13 배로 찍혔고, 그 숫자에는 아무 뜻이 없었다.
 */

test('정상 구간은 그대로 배수를 낸다', () => {
  assert.equal(ratio(30, 10), 3);
  assert.equal(ratio(14.6, 1.0), 14.6);
  assert.equal(ratio(5, 10), 0.5);
});

test('기준 구간에 검색이 없으면 재지 못한 것으로 둔다', () => {
  assert.equal(ratio(60, 0.4), null);
  assert.equal(ratio(60, 0.99), null);
  assert.equal(ratio(60, 0), null);
});

test('말도 안 되는 배수는 내지 않는다', () => {
  // 기준이 문턱을 겨우 넘어도 배수가 터무니없으면 표본 문제다.
  assert.equal(ratio(9000, 1.0), null);
});

test('한쪽이 없으면 null', () => {
  assert.equal(ratio(null, 10), null);
  assert.equal(ratio(10, null), null);
});
