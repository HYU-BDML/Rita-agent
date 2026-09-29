import { test } from 'node:test';
import assert from 'node:assert/strict';

import { GRAMMARS } from '../lib/core/grammar';
import { RECIPES, SCOPE, type RecipeFrame, frameOf } from '../lib/core/recipe';
import { STEPS, stepsOf } from '../lib/core/grammar-steps';

/*
 * 만드는 순서와 사용 범위.
 *
 * 여기서 지키는 것은 **근거를 열지 않고도 쓸 수 있는 문장이 안 남는 것**이다.
 * 전에는 frame 별 템플릿 넷으로 문장을 만들어서, 방식 열두 개가 네 종류의 글쓰기 조언을
 * 나눠 갖고 있었다. 그 조언은 게시물 2,023건 중 하나도 안 가리킨다.
 */

const KINDS: RecipeFrame[] = ['video', 'copy', 'info', 'compare'];

test('부제: 네 갈래가 다 있고 12개 방식이 전부 하나를 가진다', () => {
  assert.deepEqual(Object.keys(RECIPES).sort(), [...KINDS].sort());
  for (const g of GRAMMARS) assert.ok(RECIPES[frameOf(g)], `${g.name} 의 갈래가 없다`);
  assert.equal(new Set(KINDS.map((k) => RECIPES[k].frame)).size, 4);
});

test('부제: photo 안에서도 갈래가 갈린다', () => {
  // 입고 정보는 채울 항목, 비교·투표는 비교축이다. 둘 다 photo 지만 순서가 다르다.
  const restock = GRAMMARS.find((g) => g.id === 'restock')!;
  const compare = GRAMMARS.find((g) => g.id === 'compare')!;
  assert.equal(restock.kind, 'photo');
  assert.equal(compare.kind, 'photo');
  assert.notEqual(frameOf(restock), frameOf(compare));
});

test('만드는 순서: 방식 12개가 저마다 제 단계를 갖는다', () => {
  // frame 이 넷인데 방식이 열둘이므로, frame 별 한 벌이면 여덟 개가 남의 단계를 단다.
  assert.equal(Object.keys(STEPS).length, 12);
  for (const g of GRAMMARS) assert.ok(stepsOf(g.id), `${g.name} 의 단계가 없다`);
  const all = GRAMMARS.flatMap((g) => stepsOf(g.id)!.steps.map((s) => s.do));
  assert.equal(new Set(all).size, all.length, '두 방식이 같은 지시를 달고 있다');
});

test('만드는 순서: 줄마다 근거가 붙는다', () => {
  for (const g of GRAMMARS) {
    const s = stepsOf(g.id)!;
    assert.ok(s.steps.length >= 2 && s.steps.length <= 3, `${g.name} 단계 수 ${s.steps.length}`);
    for (const st of s.steps) {
      assert.ok(st.from.length > 0, `${g.name}: 근거 없는 단계 — ${st.do}`);
      assert.ok(st.cite.trim().length > 0, `${g.name}: 인용 없는 단계 — ${st.do}`);
    }
    assert.ok(s.avoid.from.length > 0, `${g.name}: 피할 것에 근거가 없다`);
  }
});

test('만드는 순서: 인용이 캡션·숫자·해시태그 중 하나를 담는다', () => {
  // 근거를 열지 않고 쓸 수 있는 문장이면 이 중 아무것도 못 담는다.
  const grounded = /[「"“]|\d|#/;
  for (const g of GRAMMARS) {
    for (const st of stepsOf(g.id)!.steps) {
      assert.match(st.cite, grounded, `${g.name}: 인용에 근거가 없다 — ${st.cite}`);
    }
  }
});

test('만드는 순서: 근거 이름이 그 방식의 실제 근거에 있는 이름이다', async () => {
  // 번호가 아니라 이름으로 적는다. 이름이 틀리면 화면에서 번호가 조용히 사라진다.
  const fs = await import('node:fs');
  const { grammarsWithEvidence } = await import('../lib/core/grammar');
  const db = JSON.parse(fs.readFileSync('data/db.json', 'utf8'));
  const gs = grammarsWithEvidence(db.candidates ?? [], db.posts ?? [], '2026-09-24T00:00:00Z');
  for (const g of gs) {
    const have = new Set(g.evidence.map((e) => e.subject));
    const s = stepsOf(g.id)!;
    for (const name of [...s.steps.flatMap((x) => x.from), ...s.avoid.from]) {
      assert.ok(have.has(name), `${g.name}: 「${name}」 이 근거 목록에 없다`);
    }
  }
});

test('사용 범위: 3단이고 걸림 없는 칸은 과제·발표뿐이다', () => {
  assert.equal(SCOPE.length, 3);
  assert.deepEqual(SCOPE.map((r) => r.where), ['과제·발표', '개인 공개 계정', '브랜드·상업']);
  assert.deepEqual(SCOPE.map((r) => r.clear), [true, false, false]);
});

test('사용 범위: "안전"이라고 쓰지 않는다', () => {
  // 법률 자문이 아니다. 권리자·문의처·확인이 필요한 구간까지만 말한다.
  for (const r of SCOPE) {
    assert.doesNotMatch(`${r.verdict} ${r.detail}`, /안전합니다|문제없습니다|괜찮습니다/, r.where);
  }
  assert.match(SCOPE[2].detail, /판단해 드리지 않습니다/);
});

test('만드는 순서: 판정기 메모 낱말이 섞이지 않는다', () => {
  const all = GRAMMARS.flatMap((g) => {
    const s = stepsOf(g.id)!;
    return [...s.steps.map((x) => `${x.do} ${x.cite}`), s.avoid.text];
  }).join(' ');
  assert.doesNotMatch(all, /공식 레퍼런스|제작 보류|독립 출처|귀속|프롬프트/);
});
