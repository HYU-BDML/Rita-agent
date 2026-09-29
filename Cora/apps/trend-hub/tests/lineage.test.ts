import { test } from 'node:test';
import assert from 'node:assert/strict';

import { pick, LINEAGE_KINDS } from '../lib/collect/lineage';

/*
 * 출신 분류 — 어디서 온 캐릭터인가.
 *
 * 지키려는 것은 하나다: **자료에서 읽은 것과 모델이 아는 것을 섞지 않는다.**
 * 자료만으로는 반만 갈린다(`요리왕 비룡` 은 요약에 있지만 `Rosalina` 는 없다).
 * 섞으면 모르는 캐릭터에 그럴듯한 출처를 지어내도 사람이 알 수가 없다.
 */

test('출신: 입력에 없던 이름은 버린다', () => {
  const out = pick([{ name: '치이카와' }], [
    { name: '치이카와', kind: '애니·만화', work: '치이카와', basis: '자료', confidence: 0.9 },
    { name: '지어낸캐릭터', kind: '게임', work: '없는게임', basis: '지식', confidence: 0.9 },
  ]);
  assert.deepEqual(out.map((o) => o.name), ['치이카와']);
});

test('출신: 모르는 갈래는 모름으로 떨어뜨린다', () => {
  const out = pick([{ name: 'a' }], [{ name: 'a', kind: '굿즈', work: '뭔가', basis: '자료', confidence: 0.5 }]);
  assert.equal(out[0].kind, '모름', '넷 중 아무 데나 넣는 것보다 낫다');
  assert.equal(out[0].work, '', '갈래를 모르면 작품 이름도 남기지 않는다');
});

test('출신: basis 는 자료가 아니면 전부 지식으로 본다', () => {
  // 안전한 쪽이 '지식' 이다 — 화면에 "추정"이 붙어 사람이 한 번 본다.
  const out = pick([{ name: 'a' }, { name: 'b' }], [
    { name: 'a', kind: '게임', work: '슈퍼 마리오', basis: '', confidence: 0.6 },
    { name: 'b', kind: '게임', work: '포켓몬', basis: '자료', confidence: 0.9 },
  ]);
  assert.equal(out.find((x) => x.name === 'a')?.basis, '지식');
  assert.equal(out.find((x) => x.name === 'b')?.basis, '자료');
});

test('출신: 같은 이름이 두 번 와도 하나만 쓴다', () => {
  const out = pick([{ name: 'a' }], [
    { name: 'a', kind: '게임', work: '먼저', basis: '자료', confidence: 0.9 },
    { name: 'a', kind: '브랜드', work: '나중', basis: '지식', confidence: 0.9 },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].work, '먼저');
});

test('출신: 갈래는 다섯이고 자캐가 들어 있다', () => {
  // '개인 창작' 으로 두면 권리의 individual 과 화면에서 같은 것으로 읽힌다.
  assert.deepEqual(LINEAGE_KINDS, ['애니·만화', '게임', '브랜드', '자캐', '모름']);
});
