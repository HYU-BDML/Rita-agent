import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, checkTheme, contrast, MIN_BODY, type Theme } from '../lib/cardnews/themes';

/*
 * 테마를 늘리는 건 쉽지만 안 읽히는 조합을 늘리는 것도 쉽다.
 * 새 색을 넣을 때 여기서 걸린다.
 */

test('모든 테마가 대비 문턱을 넘는다', () => {
  const bad = THEMES.filter((t: Theme) => !checkTheme(t).ok).map(
    (t: Theme) => `${t.name}: ${checkTheme(t).problems.join(', ')}`,
  );
  assert.deepEqual(bad, [], `읽기 어려운 테마\n${bad.join('\n')}`);
});

test('테마 이름이 겹치지 않는다', () => {
  assert.equal(new Set(THEMES.map((t: Theme) => t.name)).size, THEMES.length);
});

test('밝은 테마와 어두운 테마가 둘 다 있다', () => {
  assert.ok(THEMES.some((t: Theme) => t.dark));
  assert.ok(THEMES.some((t: Theme) => !t.dark));
});

test('대비 계산이 맞다', () => {
  assert.equal(contrast('#ffffff', '#000000'), 21);
  assert.equal(contrast('#ffffff', '#ffffff'), 1);
  assert.ok(contrast('#767676', '#ffffff') >= MIN_BODY);
});
