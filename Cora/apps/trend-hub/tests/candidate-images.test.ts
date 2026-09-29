import test from 'node:test';
import assert from 'node:assert/strict';
import { bestShotFirst, characterImages, formatImages, newsImages } from '../lib/core/candidate-images';
import type { Candidate } from '../lib/core/candidate';
import type { PostRecord } from '../lib/core/post-record';

const post = (id: string, score: number | undefined, postedAt: string): PostRecord => ({
  id,
  platform: 'tiktok',
  url: `https://example.com/${id}`,
  thumbnailUrl: `https://img.example.com/${id}.jpg`,
  postedAt,
  account: `author-${id}`,
  views: 1,
  candidateId: 'character:test',
  discoveryId: 'character-native',
  runId: 'run',
  runAt: postedAt,
  ...(score === undefined ? {} : { charShot: score }),
});

test('캐릭터 대표 이미지는 최신순보다 charShot 최고점을 우선한다', () => {
  const images = characterImages([
    post('new-face', 0, '2026-09-22T00:00:00Z'),
    post('old-character', 2, '2026-09-20T00:00:00Z'),
  ], '테스트 캐릭터');
  // 화면은 첫 장만 그린다. 그 자리에 charShot 최고점이 와야 한다.
  assert.equal(images[0].href, 'https://example.com/old-character');
});

test('캐릭터 대표 이미지는 뒤에 대비책을 남긴다', () => {
  // 한 장만 내던 때는 그 장이 죽으면 카드가 통째로 비었다 — 살아 있는 장이 뒤에
  // 있어도 화면에 올라올 길이 없었다. 이제 화면이 첫 장을 지우면 다음 장이 들어선다.
  const images = characterImages([
    post('best', 2, '2026-09-22T00:00:00Z'),
    post('second', 1, '2026-09-21T00:00:00Z'),
    post('third', 0, '2026-09-20T00:00:00Z'),
  ], '테스트 캐릭터');
  assert.ok(images.length > 1, '대비책이 없다');
  assert.deepEqual(images.map((i) => i.href), [
    'https://example.com/best',
    'https://example.com/second',
    'https://example.com/third',
  ]);
});

test('유행 포맷은 최신 실제 게시물 세 장까지만 고른다', () => {
  const images = formatImages([
    post('one', undefined, '2026-09-19T00:00:00Z'),
    post('four', undefined, '2026-09-22T00:00:00Z'),
    post('two', undefined, '2026-09-20T00:00:00Z'),
    post('three', undefined, '2026-09-21T00:00:00Z'),
  ], '테스트 포맷');
  assert.deepEqual(images.map((image) => image.href), [
    'https://example.com/four',
    'https://example.com/three',
    'https://example.com/two',
  ]);
});

test('뉴스 대표 이미지는 해당 기사의 원문 링크와 함께 고른다', () => {
  const candidate = {
    subject: '테스트 뉴스',
    origin: { discoveryId: 'news' },
    evidence: [
      { source: 'A', title: '사진 없음', url: 'https://example.com/a' },
      { source: 'B', title: '사진 있음', url: 'https://example.com/b', thumbnailUrl: 'https://img.example.com/b.jpg' },
    ],
  } as Candidate;
  assert.deepEqual(newsImages(candidate), [{
    src: 'https://img.example.com/b.jpg',
    href: 'https://example.com/b',
    alt: '테스트 뉴스 기사 대표 사진',
  }]);
});

test('대표 사진 순서: 점수 없는 장은 0(사람 얼굴)보다 앞, 2(캐릭터가 주인공)보다 뒤', () => {
  // 목록·상세·추적 목록이 같은 순서를 쓴다. 여기가 흔들리면 화면마다 다른 그림이 나온다.
  const ordered = bestShotFirst([
    post('face', 0, '2026-09-22T00:00:00Z'),
    post('unscored', undefined, '2026-09-21T00:00:00Z'),
    post('hero', 2, '2026-09-19T00:00:00Z'),
  ]);
  assert.deepEqual(ordered.map((p) => p.id), ['hero', 'unscored', 'face']);
});

test('대표 사진 순서: 점수가 같으면 최신이 앞이고, 썸네일 없는 장은 빠진다', () => {
  const ordered = bestShotFirst([
    { ...post('old', 2, '2026-09-18T00:00:00Z') },
    { ...post('new', 2, '2026-09-22T00:00:00Z') },
    { ...post('no-thumb', 2, '2026-09-23T00:00:00Z'), thumbnailUrl: undefined },
  ]);
  assert.deepEqual(ordered.map((p) => p.id), ['new', 'old']);
});

test('유행 포맷: 세 장을 한 플랫폼에서만 뽑지 않는다', () => {
  // 최신순으로만 고르면 세 장이 틱톡에서 나오고, 서명 주소라 며칠 뒤 한꺼번에 죽는다.
  // 유튜브 썸네일은 만료되지 않으므로 섞어 걸어야 한 곳이 죽어도 카드가 남는다.
  const tiktok = ['t1', 't2', 't3', 't4'].map((id, i) =>
    ({ ...post(id, undefined, `2026-09-2${3 - i}T00:00:00Z`), platform: 'tiktok' }));
  const youtube = ['y1', 'y2'].map((id, i) =>
    ({ ...post(id, undefined, `2026-09-1${5 - i}T00:00:00Z`), platform: 'youtube' }));
  const images = formatImages([...tiktok, ...youtube], '테스트 포맷');
  assert.equal(images.length, 3);
  // 최신순이면 t1·t2·t3 만 나온다. 섞으면 유튜브가 한 장은 들어온다.
  assert.ok(images.some((i) => i.href.includes('y1')), '유튜브가 한 장도 안 들어왔다');
});

test('유행 포맷: 플랫폼이 하나뿐이면 최신순 그대로', () => {
  const only = ['a', 'b', 'c', 'd'].map((id, i) =>
    ({ ...post(id, undefined, `2026-09-2${3 - i}T00:00:00Z`), platform: 'tiktok' }));
  assert.deepEqual(
    formatImages(only, 'x').map((i) => i.href),
    ['https://example.com/a', 'https://example.com/b', 'https://example.com/c'],
  );
});
