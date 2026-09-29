import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cut, stripLoneSurrogates } from '../lib/core/text';

/*
 * 이모지를 반으로 가르지 않기.
 *
 * 소셜 게시물 본문을 잘라 프롬프트에 실어 보낸다. 자른 자리가 서로게이트 쌍
 * 한가운데면 본문이 올바른 JSON 이 아니게 되어 Anthropic 이 400 으로 돌려보낸다
 * ("no low surrogate in string"). 화면에서는 깨진 글자 하나로만 보여서
 * 눈으로는 못 잡는다. 그래서 여기서 조인다.
 */

/** 이모지 하나 = UTF-16 두 칸. */
const 곰 = '🐻';

test('자른 자리가 이모지 한가운데면 이모지를 통째로 뺀다', () => {
  const s = `가나다${곰}`; // 3칸 + 2칸
  assert.equal(cut(s, 4), '가나다'); // 곰의 앞칸만 남기지 않는다
  assert.equal(cut(s, 5), `가나다${곰}`); // 딱 맞으면 그대로 둔다
});

test('자른 결과에 짝 없는 서로게이트가 남지 않는다', () => {
  for (let n = 0; n <= 8; n++) {
    const out = cut(`${곰}가${곰}나${곰}`, n);
    assert.equal(out, stripLoneSurrogates(out), `${n}칸에서 깨졌다`);
    assert.ok(JSON.parse(JSON.stringify(out)) === out);
  }
});

test('이미 깨져 들어온 문자열도 씻긴다', () => {
  const 깨진것 = `가나${곰[0]}다`; // 저장해 둔 게시물이 이미 반토막인 경우
  assert.equal(cut(깨진것, 100), '가나다');
  assert.equal(stripLoneSurrogates(깨진것), '가나다');
});

test('멀쩡한 쌍은 건드리지 않는다', () => {
  const s = `${곰}🎈🍡 보통 글자`;
  assert.equal(stripLoneSurrogates(s), s);
  assert.equal(cut(s, 100), s);
});

test('짧으면 그대로 둔다', () => {
  assert.equal(cut('가나다', 100), '가나다');
  assert.equal(cut('', 10), '');
});

test('하반 서로게이트가 혼자 있어도 지운다', () => {
  assert.equal(stripLoneSurrogates(`가${곰[1]}나`), '가나');
});
