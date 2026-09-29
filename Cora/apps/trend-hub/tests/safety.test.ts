import { test } from 'node:test';
import assert from 'node:assert/strict';

import { adultHits, dropAdult, isAdult, isAdultName } from '../lib/collect/safety';
import { TRACKS_SIZE, characterNativeDiscovery } from '../lib/discoveries/character-native';

/*
 * 19금 걸러내기.
 *
 * 캐릭터 검색어(자캐·팬아트·2차창작)에는 성인 창작물이 딸려 온다.
 * 후보로 한 번 올라가면 권리 판정을 사서 붙이고, 포스터 프롬프트로 넘어가고,
 * 화면에 뜬다. 그래서 수집 직후에 버린다.
 *
 * 놓치는 것보다 과하게 버리는 쪽으로 기울여 두었지만, 멀쩡한 창작물을
 * 통째로 날리면 판정기가 쓸모없어진다. 양쪽을 다 조인다.
 */

function post(over: { text?: string; title?: string; tags?: string[] }) {
  return { text: '', title: '', tags: [], ...over };
}

test('19금: 태그로 걸러낸다', () => {
  for (const tag of ['nsfw', '#NSFW', 'r18', '19금', 'hentai', '후방주의']) {
    assert.equal(isAdult(post({ tags: [tag] })), true, `놓쳤다: ${tag}`);
  }
});

test('19금: 본문으로 걸러낸다', () => {
  const bad = [
    'commission open! NSFW ok',
    '자캐 그렸어요 R-18 주의',
    '19금 주의 후방주의',
    '성인웹툰 연재 시작',
    'uncensored version on my page',
  ];
  for (const text of bad) {
    assert.ok(adultHits(post({ text })).length > 0, `놓쳤다: ${text}`);
  }
});

test('19금: 멀쩡한 창작물을 날리지 않는다', () => {
  /*
   * 여기가 더 중요하다. 과하게 걸러 놓고 '19금이 없었다'고 착각하면
   * 판정기가 조용히 빈손이 된다. 실제로 걸리기 쉬운 말들을 골라 뒀다.
   */
  const fine = [
    '자캐 그렸습니다 오늘 성인식 다녀와서',
    'nude 톤 색연필로 칠했어요',
    '18세기 복장 참고해서 디자인했습니다',
    '캐릭터 굿즈 펀딩 오픈했어요 성인 사이즈 티셔츠도 있습니다',
    '노출 없는 일러스트 위주로 그립니다',
  ];
  for (const text of fine) {
    assert.deepEqual(adultHits(post({ text })), [], `괜히 버렸다: ${text}`);
  }
});

test('19금: 몇 건을 왜 버렸는지 돌려준다', () => {
  // 조용히 사라지면 수집이 적게 된 건지 걸러진 건지 구분이 안 된다.
  const posts = [
    post({ text: '자캐 그림' }),
    post({ text: '팬아트', tags: ['nsfw'] }),
    post({ text: 'R18 주의' }),
  ];
  const r = dropAdult(posts);
  assert.equal(r.kept.length, 1);
  assert.equal(r.dropped, 2);
  assert.ok(r.reasons.length > 0);
});

test('19금: 이름 자체가 표지인 경우도 막는다', () => {
  assert.equal(isAdultName('NSFW'), true);
  assert.equal(isAdultName('19금'), true);
  assert.equal(isAdultName('루미'), false);
  assert.equal(isAdultName('Mr. Computer'), false);
});

/* 발굴형으로 세운 뒤의 모양 */

test('캐릭터 발굴은 다시 쓸 수 있는 상태다', () => {
  assert.equal(characterNativeDiscovery.held, undefined, '아직 세워 둔 상태다');
  assert.equal(characterNativeDiscovery.unit, 'subject');
});

test('캐릭터 발굴 기본 트랙은 전체를 본다', () => {
  /*
   * Dify v13.2 의 기본값이다. 네이티브로 옮기면서 TikHub 호출 수를 아끼려고
   * 이 세트를 통째로 뺐는데, 남이 남의 캐릭터를 말하는 자리가 여기뿐이라
   * 교차 확인이라는 판정축이 같이 사라졌다.
   * 남의 IP 도 일단 담는다 — 거르는 건 수집이 아니라 권리 판정의 일이다.
   */
  const track = characterNativeDiscovery.inputs.find((f) => f.name === 'track')!;
  assert.equal(track.default, '전체');
  assert.ok((track.options ?? []).includes('팬아트'));
});

test('검색어 세트는 5개씩이다', () => {
  // 플랫폼당 노드가 5개였다. 3개로 줄인 것이 세트를 반토막 냈다.
  for (const t of characterNativeDiscovery.inputs.find((f) => f.name === 'track')!.options ?? []) {
    assert.equal(TRACKS_SIZE[t], 5, `${t} 세트가 5개가 아니다`);
  }
});
