import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkDeck, deckFromCards, deckFromPoster } from '../lib/producers/deck';
import type { Card } from '../lib/producers/cardnews-native';
import type { Poster } from '../lib/producers/poster-shape';

/*
 * 원고 → 덱 변환.
 *
 * 생성기가 아니라 변환기다. 순수 함수라 렌더 서버 없이 조인다 —
 * 보내는 경로를 아직 몰라도 이 부분은 지금 확정할 수 있다.
 */

const 아는것 = { templates: ['explain_box', 'photo_copy'], styles: ['gogumafarm', 'careet'] };

const cards: Card[] = [
  { no: 1, kind: '표지', headline: '9월에 벌써 작년을 넘었다', body: '' },
  { no: 2, kind: '본문', headline: '수출 누계 7천94억달러', body: '작년 연간치를 넘어섰다', sourceName: '연합뉴스', sourceUrl: 'https://a.example/1' },
  { no: 3, kind: '마지막장', headline: '더 보기', body: '트렌드를 콘텐츠로 옮깁니다' },
];

test('장 역할이 서버 이름으로 옮겨진다', () => {
  // 표지/본문/마지막장 ↔ cover/body/outro 는 1:1 이다. 여기가 어긋나면 전부 어긋난다.
  const d = deckFromCards(cards, { template: 'explain_box', style: 'gogumafarm' });
  assert.deepEqual(d.deck.slides.map((s) => s.role), ['cover', 'body', 'outro']);
  assert.equal(d.template, 'explain_box');
  assert.equal(d.style, 'gogumafarm');
});

test('글자 칸 이름은 headline·text·kicker 다', () => {
  /*
   * 처음에 title·body·caption 으로 넘겨짚었다가 전부 틀렸다.
   * Dify weave 노드가 세우는 모양이 진짜다:
   *   {"role":"cover","headline":…,"text":…,"kicker":…}
   */
  const d = deckFromCards(cards, { template: 'explain_box', style: 'gogumafarm' });
  const s = d.deck.slides[1];
  assert.equal(s.headline, '수출 누계 7천94억달러');
  assert.match(s.text ?? '', /작년 연간치를 넘어섰다/);
  assert.equal('title' in s, false);
  assert.equal('body' in s, false);
  assert.equal('caption' in s, false);
});

test('출처가 글에 한 줄로 따라간다', () => {
  // 서버 슬라이드에 출처 칸이 없다. 안 붙이면 대조해 둔 것이 그림으로 넘어가며 사라진다.
  const d = deckFromCards(cards, { template: 'explain_box', style: 'gogumafarm' });
  assert.match(d.deck.slides[1].text ?? '', /출처 연합뉴스/);
});

test('마지막장은 이름이 워드마크로 가고 큰 글씨는 소개다', () => {
  // 계정 이름을 큰 글씨에 그대로 넣으면 원본과 구조가 뒤집힌다 (워크플로우 주석).
  const d = deckFromCards(cards, { template: 'explain_box', style: 'gogumafarm', account: '@트렌드허브' });
  const o = d.deck.slides[2];
  assert.equal(o.role, 'outro');
  assert.equal(o.wordmark, '@트렌드허브');
  assert.equal(o.headline, '더 보기', '큰 글씨가 계정 이름으로 덮이면 안 된다');
  assert.equal(d.deck.brand?.wordmark, '@트렌드허브');
});

test('분류어는 고른 방식대로만 채운다', () => {
  // 모델이 멋대로 붙인 분류어가 강조색으로 카드에 박힌 적이 있다(워크플로우 주석).
  const 안씀 = deckFromCards(cards, { template: 'explain_box', style: 'gogumafarm' });
  assert.deepEqual(안씀.deck.slides.map((s) => s.kicker), ['', '', '']);

  const 순서 = deckFromCards(cards, { template: 'explain_box', style: 'gogumafarm', kicker: '순서' });
  assert.deepEqual(순서.deck.slides.map((s) => s.kicker), ['', '하나', '']);
});

const poster: Poster = {
  headline: '9월에 벌써 작년을 넘었다',
  subhead: '수출 누계 7천94억달러',
  kicker: '수출',
  account: '@트렌드허브',
  ratio: '4:5',
  imageUrl: '/gen/poster-1.jpg',
  visualPrompt: '…',
  sourceName: '연합뉴스',
  sourceUrl: 'https://a.example/1',
};

test('포스터는 장이 하나인 덱이다', () => {
  /*
   * 포스터를 별개 물건으로 두면 색·크기·막말이 카드뉴스와 따로 놀아
   * 같은 계정에서 나온 것으로 안 보인다. 서버의 photo_copy 가 곧 우리 포스터다.
   */
  const d = deckFromPoster(poster, { style: 'careet' });
  assert.equal(d.template, 'photo_copy');
  assert.equal(d.deck.slides.length, 1);
  assert.equal(d.deck.slides[0].role, 'cover');
  assert.deepEqual(d.photos, ['/gen/poster-1.jpg'], '사진은 슬라이드가 아니라 photos 로 간다');
  assert.match(d.deck.slides[0].text ?? '', /연합뉴스/);
});

test('키비주얼이 없으면 photos 를 아예 안 보낸다', () => {
  // 서버가 모르는 칸이나 빈 칸을 얹으면 사진이 제대로 안 깔린다(워크플로우 주석).
  const d = deckFromPoster({ ...poster, imageUrl: '' }, { style: 'careet' });
  assert.equal('photos' in d, false);
});

test('서버가 모르는 틀·겉모습은 보내기 전에 막는다', () => {
  // 굽는 데까지 가서 실패하면 왕복이 더 든다. 무료 티어는 한 번에 20초다.
  const good = deckFromCards(cards, { template: 'explain_box', style: 'gogumafarm' });
  assert.equal(checkDeck(good, 아는것).ok, true);

  const badT = checkDeck({ ...good, template: '없는틀' }, 아는것);
  assert.equal(badT.ok, false);
  assert.match(badT.ok === false ? badT.reason : '', /배치 형식/);

  const badS = checkDeck({ ...good, style: '없는겉모습' }, 아는것);
  assert.equal(badS.ok, false);
  assert.match(badS.ok === false ? badS.reason : '', /겉모습/);
});

test('빈 장이 섞여 있으면 막는다', () => {
  const d = deckFromCards(cards, { template: 'explain_box', style: 'gogumafarm' });
  d.deck.slides.push({ role: 'body', headline: '' });
  const r = checkDeck(d, 아는것);
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.reason : '', /4번째 장/);
});

test('서버 목록을 아직 못 받았으면 틀·겉모습을 막지 않는다', () => {
  // 서버가 자고 있어 /health 를 못 받는 경우가 있다. 그때 전부 막으면 아무것도 못 만든다.
  const d = deckFromCards(cards, { template: '무엇이든', style: '무엇이든' });
  assert.equal(checkDeck(d, { templates: [], styles: [] }).ok, true);
});
