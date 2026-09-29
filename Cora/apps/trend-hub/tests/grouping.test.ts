import test from 'node:test';
import assert from 'node:assert/strict';
import { pick, type GroupInput } from '../lib/collect/grouping';

const items = (...names: string[]): GroupInput[] => names.map((name) => ({ name }));

test('묶기: 모델이 빠뜨린 이름은 혼자 세운다', () => {
  // 묶기는 줄이는 일이지 버리는 일이 아니다. 빠뜨린 이름이 조용히 사라지면
  // 그 유행이 표에서 통째로 없어지고, 왜 없어졌는지 화면에는 자취가 없다.
  const got = pick(items('BAD 챌린지', '배드 챌린지', '기침챌린지'), [
    { canonical: 'BAD 챌린지', aliases: ['배드 챌린지'], related: [] },
  ]);
  assert.deepEqual(got.map((g) => g.canonical), ['BAD 챌린지', '기침챌린지']);
  assert.deepEqual(got[0].aliases, ['배드 챌린지']);
});

test('묶기: 입력에 없던 이름을 지어내면 버린다', () => {
  const got = pick(items('기침챌린지'), [
    { canonical: '지어낸 챌린지', aliases: ['기침챌린지'], related: [] },
  ]);
  // 대표가 가짜라 그룹째 버리고, 남은 이름은 혼자 세운다.
  assert.deepEqual(got, [{ canonical: '기침챌린지', aliases: [], related: [] }]);
});

test('묶기: 한 이름이 두 그룹에 들어가지 않는다', () => {
  const got = pick(items('A 챌린지', 'B 챌린지', 'C 챌린지'), [
    { canonical: 'A 챌린지', aliases: ['B 챌린지'], related: [] },
    { canonical: 'C 챌린지', aliases: ['B 챌린지'], related: [] },
  ]);
  assert.deepEqual(got.find((g) => g.canonical === 'A 챌린지')!.aliases, ['B 챌린지']);
  assert.deepEqual(got.find((g) => g.canonical === 'C 챌린지')!.aliases, []);
  assert.equal(got.length, 2);
});

test('묶기: 대표를 제 별칭에 또 넣지 않는다', () => {
  const got = pick(items('기침챌린지'), [
    { canonical: '기침챌린지', aliases: ['기침챌린지'], related: [] },
  ]);
  assert.deepEqual(got[0].aliases, []);
});

test('묶기: 파생은 related 로 남고 합쳐지지 않는다', () => {
  const got = pick(items('연애의 조건 챌린지', '연애의 조건 행진곡'), [
    { canonical: '연애의 조건 챌린지', aliases: [], related: ['연애의 조건 행진곡'] },
    { canonical: '연애의 조건 행진곡', aliases: [], related: ['연애의 조건 챌린지'] },
  ]);
  assert.equal(got.length, 2);
  assert.deepEqual(got[0].related, ['연애의 조건 행진곡']);
});

test('묶기: related 에 없는 이름이 적혀 있으면 버린다', () => {
  const got = pick(items('A', 'B'), [
    { canonical: 'A', aliases: [], related: ['없는것', 'B', 'A'] },
    { canonical: 'B', aliases: [], related: [] },
  ]);
  assert.deepEqual(got[0].related, ['B']);   // 없는 이름과 자기 자신은 뺀다
});

test('묶기: 그룹을 하나도 못 받아도 입력이 그대로 남는다', () => {
  const got = pick(items('A', 'B'), []);
  assert.deepEqual(got.map((g) => g.canonical), ['A', 'B']);
});
