import { test } from 'node:test';
import assert from 'node:assert/strict';

import { characterDiscovery } from '../lib/discoveries/character';
import { materialDiscovery } from '../lib/discoveries/material';
import { cardnewsProducer } from '../lib/producers/cardnews';
import { imageProducer, reelsProducer } from '../lib/producers/visual';
import { brief, referenceLock } from '../lib/producers/shared';
import { verifyNames, type NameDraft } from '../lib/collect/names';
import type { Post } from '../lib/collect/tikhub';
import { characterNativeDiscovery } from '../lib/discoveries/character-native';
import characterMock from '../mock/character.json';
import materialMock from '../mock/material.json';

const ctx = { runId: 'test-run', runAt: '2026-09-03T00:00:00.000Z', mock: true };
const chars = characterDiscovery.normalize(characterMock, ctx);
const topics = materialDiscovery.normalize(materialMock, ctx);

const grounded = chars.find((c) => c.subject === '햄보기네')!;   // source_grounded
const corporate = chars.find((c) => c.subject === '라부부')!;     // reference_required
const held = chars.find((c) => c.subject === '왕왕이')!;          // none
const topic = topics.find((c) => c.subject === '제로슈가 음료')!;

/*
 * 권리 게이팅. "트렌드로 콘텐츠 만들기"는 흔하지만 "만들면 안 되는 걸 막기"는 흔하지 않다.
 * 이 앱의 값어치가 여기 있으므로 여기가 제일 조여져 있어야 한다.
 */

test('시각 근거가 있는 개인 창작 캐릭터는 형상 제작이 열린다', () => {
  assert.equal(imageProducer.gate(grounded).ok, true);
  assert.equal(reelsProducer.gate(grounded).ok, true);
});

test('형상 제작 보류 후보는 이미지·릴스가 막힌다', () => {
  const img = imageProducer.gate(held);
  assert.equal(img.ok, false);
  assert.ok(!img.ok && img.reason.length > 0, '왜 막혔는지 반드시 말해야 한다');
  assert.equal(reelsProducer.gate(held).ok, false);
});

test('기업 IP 는 막지 않되 레퍼런스 잠금 문구가 강제로 붙는다', () => {
  assert.equal(imageProducer.gate(corporate).ok, true);

  const mapped = imageProducer.mapInputs(corporate);
  assert.ok(mapped.prompt.startsWith(referenceLock('라부부')), '잠금 문구가 프롬프트 앞에 있어야 한다');
  assert.ok(mapped.prompt.includes('라부부'));
  assert.ok(mapped.caution.includes('라이선스'), '배포 전 확인 문구가 실려야 한다');
});

test('기업 IP 의 잠금 프롬프트는 외형을 지어내지 말라고 명시한다', () => {
  const mapped = reelsProducer.mapInputs(corporate);
  assert.ok(/Do not invent, redesign/.test(mapped.prompt));
});

test('주제 후보에는 형상 제작기가 붙지 않는다', () => {
  assert.equal(imageProducer.accepts.includes('topic'), false);
  const g = imageProducer.gate(topic);
  assert.equal(g.ok, false);
  assert.ok(!g.ok && g.reason.includes('주제 후보'));
});

test('카드뉴스는 주제와 대상 둘 다 받는다', () => {
  assert.ok(cardnewsProducer.accepts.includes('topic'));
  assert.ok(cardnewsProducer.accepts.includes('subject'));
  assert.equal(cardnewsProducer.gate(topic).ok, true);
  assert.equal(cardnewsProducer.gate(grounded).ok, true);
});

test('근거가 하나라도 있으면 카드뉴스는 열린다 — 대신 원고에 경고가 실린다', () => {
  // 왕왕이는 형상 제작은 보류지만 언급 게시물 1건이 있다.
  // 글로 다루는 것까지 막을 이유는 없다. 막는 대신 얇다고 말한다.
  assert.equal(held.evidence.length, 1);
  assert.equal(cardnewsProducer.gate(held).ok, true);
  assert.ok(brief(held).includes('독립 근거가 부족'));
});

test('근거도 각도도 없으면 카드뉴스가 막힌다 — 출처를 댈 수 없으므로', () => {
  const empty = { ...held, evidence: [], hint: {} };
  const g = cardnewsProducer.gate(empty);
  assert.equal(g.ok, false);
  assert.ok(!g.ok && g.reason.includes('원고'));
});

/*
 * 재타이핑 제거. 이 파이프라인의 유일한 병목이었다.
 * Dify 카드뉴스는 material 을 "그대로 붙여넣으세요" 라고 묻고, 통합 v2 는 입력이 19칸이다.
 */

test('후보가 카드뉴스 원고를 통째로 채운다 — 사람은 안 친다', () => {
  const mapped = cardnewsProducer.mapInputs(topic);
  assert.ok(mapped.material.includes('제로슈가 음료'));
  assert.ok(mapped.material.includes('지금 오르는'));
  assert.ok(mapped.material.includes('https://www.yna.co.kr/view/AKR20260901'), '근거 링크가 원고에 실려야 한다');
  assert.ok(mapped.material.includes('따라 만들 본보기'));
});

test('사람에게 남는 질문은 후보가 알 수 없는 것뿐이다', () => {
  const asked = cardnewsProducer.extraInputs.map((f) => f.name);
  // 디자인·장수는 후보가 알 수 없다. 주제·근거·까닭은 묻지 않는다.
  assert.deepEqual(asked, ['style_id', 'slides', 'reader']);
  assert.ok(!asked.includes('material'), '원고를 다시 묻지 않는다');
  assert.ok(!asked.includes('topics'), '주제를 다시 묻지 않는다');
});

test('근거가 얇은 후보의 원고에는 경고가 실린다', () => {
  const text = brief(held);
  assert.ok(text.includes('독립 근거가 부족'));
});

/*
 * 교차 확인 문턱.
 *
 * 이 앱이 '지금이다'라고 말하는 근거는 여러 곳이 함께 다뤘다는 것이다.
 * 뉴스는 처음부터 매체 2곳을 요구했는데 캐릭터만 계정 1개로 열려 있었다.
 * 그래서 한 계정이 한 번 말한 이름 12건이 전부 후보가 됐고, 공식 계정 하나가
 * 자기 캐릭터 목록을 올린 것이 통째로 트렌드로 올라왔다.
 */

function post(over: Partial<Post> & { sourceId: string; authorId: string; text: string }): Post {
  return {
    platform: 'x',
    authorName: over.authorId,
    tags: [],
    title: '',
    views: 100,
    reactions: 0,
    followers: 0,
    url: `https://x.com/${over.authorId}/status/${over.sourceId}`,
    postedAt: null,
    ...over,
  };
}

function draft(name: string, sourceIds: string[]): NameDraft {
  return {
    name,
    aliases: [],
    entityType: 'character_candidate',
    foundIn: '본문',
    confidence: 0.8,
    sourceIds,
    evidence: '',
    why: '',
  };
}

test('캐릭터: 한 계정만 말한 이름은 후보가 되지 않는다', () => {
  const oneAccount = [
    post({ sourceId: 's1', authorId: 'a1', text: '루미 너무 귀엽다 자캐 그림' }),
    post({ sourceId: 's2', authorId: 'a1', text: '루미 새 그림 올림 캐릭터' }),
  ];
  const drafts = [draft('루미', ['s1'])];

  assert.equal(verifyNames(oneAccount, drafts, 2).length, 0, '계정 하나짜리가 통과했다');
  assert.equal(verifyNames(oneAccount, drafts, 1).length, 1, '문턱 1 에서는 통과하던 것이다');

  const twoAccounts = [
    ...oneAccount,
    post({ sourceId: 's3', authorId: 'b2', platform: 'tiktok', text: '루미 따라 그려봄 팬아트' }),
  ];
  const kept = verifyNames(twoAccounts, drafts, 2);
  assert.equal(kept.length, 1, '서로 다른 두 계정이 말했으면 통과해야 한다');
  assert.equal(kept[0].authors.length, 2);
});

test('캐릭터: 발굴형이므로 문턱이 1이다', () => {
  /*
   * 2 로 올려 본 적이 있다. 산출이 0건이 됐다 — 검색어가 '자캐'(자기 캐릭터)라
   * 서로 다른 작가가 같은 캐릭터를 그릴 일이 없어서다. 교차가 필요하면 문턱이 아니라
   * 검색어를 바꿔야 한다. 발굴에서 유효한 단위는 창작자 본인 계정 하나다.
   */
  const oneAccount = [
    post({ sourceId: 's1', authorId: 'a1', text: '루미 자캐 그렸어요' }),
    post({ sourceId: 's2', authorId: 'a1', text: '루미 새 그림 캐릭터' }),
  ];
  const kept = verifyNames(oneAccount, [draft('루미', ['s1'])], 1);
  assert.equal(kept.length, 1, '창작자 본인 하나짜리가 막혔다');
  assert.equal(kept[0].authors.length, 1);
});

test('캐릭터: 수집 문턱과 판정 문턱이 같아야 한다', () => {
  /*
   * run() 이 느슨하고 normalize() 가 빡빡하면, 권리 판정(LLM)을 사 놓고 버리게 된다.
   * 실제로 한 번 그렇게 어긋났었다 — 입력칸은 1, 코드는 2.
   * 문턱을 회차마다 고르는 입력칸으로 두면 옛 원본을 다시 판정할 때 어느 값을 쓸지 모호해진다.
   * 그래서 입력칸을 없앴다. 이 테스트가 그게 되살아나는 걸 막는다.
   */
  const names = characterNativeDiscovery.inputs.map((f) => f.name);
  assert.equal(names.includes('min_authors'), false, '문턱이 다시 입력칸이 됐다');
});
