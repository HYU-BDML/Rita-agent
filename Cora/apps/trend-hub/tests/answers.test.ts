import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readForm, readItem } from '../lib/core/answers';

/*
 * 주소에 적힌 답 (세션 5).
 *
 * 여기서 지키는 것은 **모르는 값에 빈 화면을 내지 않는 것**이다. 주소는 사람이 손으로
 * 고칠 수 있는 자리고, 링크를 잘라 붙이다 망가지는 자리다. `?form=음악` 이 들어왔을 때
 * 아무것도 못 보여주면 그 링크를 받은 사람은 앱이 고장 난 줄 안다.
 */

test('답 읽기: 아는 값만 받는다', () => {
  assert.equal(readForm('video'), 'video');
  assert.equal(readForm('photo'), 'photo');
  assert.equal(readForm('copy'), 'copy');
  assert.equal(readItem('yes'), 'yes');
  assert.equal(readItem('no'), 'no');
});

test('답 읽기: 모르는 값은 안 고른 것으로 둔다', () => {
  // 없어진 낱말이 링크에 남아 있을 수 있다. info·compare 는 kind 가 아니게 됐다.
  assert.equal(readForm('info'), undefined);
  assert.equal(readForm('compare'), undefined);
  assert.equal(readForm('음악'), undefined);
  assert.equal(readForm(''), undefined);
  assert.equal(readForm(undefined), undefined);
  assert.equal(readItem('maybe'), undefined);
  assert.equal(readItem('true'), undefined);
  assert.equal(readItem(undefined), undefined);
});

test('답 읽기: 같은 이름이 두 번 오면 첫 것을 쓴다', () => {
  // ?form=video&form=copy — 주소를 이어 붙이다 생긴다. 500 을 내지 않는다.
  assert.equal(readForm(['video', 'copy']), 'video');
  assert.equal(readItem(['no', 'yes']), 'no');
  assert.equal(readForm(['음악', 'video']), undefined);
});
