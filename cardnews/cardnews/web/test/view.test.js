import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyView, SORTS, sortKeysFor } from '../lib/view.js'

const post = (o) => ({
  id: o.id, slides: [], slideCount: o.slideCount ?? 5,
  likes: o.likes ?? 0, comments: o.comments ?? 0,
  likesHidden: o.likesHidden ?? false, date: o.date ?? '2026-01-01',
  isCarousel: o.isCarousel ?? true, rank: o.rank ?? 0, caption: '', author: 'a',
  kind: o.kind ?? 'carousel', playCount: o.playCount ?? -1,
})

test('carouselOnly는 캐러셀이 아닌 것을 버린다', () => {
  const out = applyView(
    [post({ id: 'a' }), post({ id: 'b', isCarousel: false })],
    { carouselOnly: true, minSlides: 2, sort: 'likes' }
  )
  assert.deepEqual(out.map((p) => p.id), ['a'])
})

test('minSlides 미만은 버린다', () => {
  const out = applyView(
    [post({ id: 'a', slideCount: 7 }), post({ id: 'b', slideCount: 3 })],
    { carouselOnly: true, minSlides: 5, sort: 'likes' }
  )
  assert.deepEqual(out.map((p) => p.id), ['a'])
})

test('carouselOnly가 꺼지면 슬라이드 조건도 적용하지 않는다', () => {
  const out = applyView(
    [post({ id: 'a', isCarousel: false, slideCount: 1 })],
    { carouselOnly: false, minSlides: 5, sort: 'likes' }
  )
  assert.deepEqual(out.map((p) => p.id), ['a'])
})

test('좋아요순은 내림차순이다', () => {
  const out = applyView(
    [post({ id: 'a', likes: 5 }), post({ id: 'b', likes: 900 }), post({ id: 'c', likes: 50 })],
    { carouselOnly: true, minSlides: 2, sort: 'likes' }
  )
  assert.deepEqual(out.map((p) => p.id), ['b', 'c', 'a'])
})

test('좋아요 동점은 댓글로, 그다음 rank로 가른다', () => {
  const out = applyView(
    [
      post({ id: 'a', likes: 0, comments: 1, rank: 3 }),
      post({ id: 'b', likes: 0, comments: 9, rank: 5 }),
      post({ id: 'c', likes: 0, comments: 1, rank: 1 }),
    ],
    { carouselOnly: true, minSlides: 2, sort: 'likes' }
  )
  assert.deepEqual(out.map((p) => p.id), ['b', 'c', 'a'])
})

test('좋아요 숨김은 항상 맨 뒤로 간다', () => {
  const out = applyView(
    [
      post({ id: 'hidden', likes: 99999, likesHidden: true }),
      post({ id: 'low', likes: 1 }),
    ],
    { carouselOnly: true, minSlides: 2, sort: 'likes' }
  )
  assert.deepEqual(out.map((p) => p.id), ['low', 'hidden'])
})

test('댓글순은 댓글 내림차순이다', () => {
  const out = applyView(
    [post({ id: 'a', likes: 900, comments: 3 }), post({ id: 'b', likes: 500, comments: 22 })],
    { carouselOnly: true, minSlides: 2, sort: 'comments' }
  )
  assert.deepEqual(out.map((p) => p.id), ['b', 'a'])
})

test('최신순은 날짜 내림차순이다', () => {
  const out = applyView(
    [post({ id: 'old', date: '2025-01-01' }), post({ id: 'new', date: '2026-08-15' })],
    { carouselOnly: true, minSlides: 2, sort: 'recent' }
  )
  assert.deepEqual(out.map((p) => p.id), ['new', 'old'])
})

test('인스타 기준은 rank 오름차순이다', () => {
  const out = applyView(
    [post({ id: 'a', rank: 9, likes: 900 }), post({ id: 'b', rank: 0, likes: 1 })],
    { carouselOnly: true, minSlides: 2, sort: 'instagram' }
  )
  assert.deepEqual(out.map((p) => p.id), ['b', 'a'])
})

test('원본 배열을 변형하지 않는다', () => {
  const input = [post({ id: 'a', likes: 1 }), post({ id: 'b', likes: 9 })]
  const before = input.map((p) => p.id)
  applyView(input, { carouselOnly: true, minSlides: 2, sort: 'likes' })
  assert.deepEqual(input.map((p) => p.id), before)
})

test('SORTS의 모든 키에 한글 라벨이 있다', () => {
  for (const k of ['likes', 'comments', 'recent', 'instagram']) {
    assert.equal(typeof SORTS[k].label, 'string')
    assert.ok(SORTS[k].label.length > 0)
  }
})

test('reelOnly는 video 만 남기고 캐러셀 조건은 안 본다', () => {
  const out = applyView(
    [
      post({ id: 'a', kind: 'video', isCarousel: false, slideCount: 1 }),
      post({ id: 'b', kind: 'carousel' }),
    ],
    { reelOnly: true, minSlides: 99, sort: 'likes' }
  )
  assert.deepEqual(out.map((p) => p.id), ['a'])
})

test('조회수순은 playCount 내림차순이다', () => {
  const out = applyView(
    [
      post({ id: 'a', kind: 'video', playCount: 10 }),
      post({ id: 'b', kind: 'video', playCount: 999 }),
      post({ id: 'c', kind: 'video', playCount: 100 }),
    ],
    { reelOnly: true, minSlides: 0, sort: 'views' }
  )
  assert.deepEqual(out.map((p) => p.id), ['b', 'c', 'a'])
})

test('SORTS에 조회수순 라벨이 있다', () => {
  assert.equal(typeof SORTS.views.label, 'string')
  assert.ok(SORTS.views.label.length > 0)
})

// 조회수가 하나도 없는 결과에서 조회수순을 남겨두면, 비교값이 전부 같아져 인스타 기준
// 순서로 조용히 떨어진다. 오류도 안 뜨고 목록은 바뀐 것처럼 보여서 정렬된 줄 안다.
// A 액터로 폴백하면 실제로 그렇게 된다 — 그 액터는 조회수를 아예 안 준다(2026-08-18 실측).
const reel = (id, playCount) => ({ id, rank: 0, kind: 'video', playCount, likes: 0, comments: 0 })

test('조회수가 전부 없으면 조회수순을 아예 안 보여준다', () => {
  const keys = sortKeysFor('reel', [reel('a', -1), reel('b', -1)])
  assert.equal(keys.includes('views'), false)
  assert.equal(keys[0], 'likes', '조회수순이 빠지면 좋아요순이 기본이 되어야 한다')
})

test('조회수가 하나라도 있으면 조회수순을 맨 앞에 둔다', () => {
  const keys = sortKeysFor('reel', [reel('a', -1), reel('b', 1234)])
  assert.equal(keys[0], 'views')
})

test('조회수 0 은 있는 것이다 — 모름(-1) 과 가른다', () => {
  assert.equal(sortKeysFor('reel', [reel('a', 0)])[0], 'views')
})

test('카드뉴스는 조회수순을 쓰지 않는다', () => {
  assert.equal(sortKeysFor('cardnews', [reel('a', 1234)]).includes('views'), false)
})

test('아직 검색 전에는 조회수순을 그대로 둔다 — 거짓말할 대상이 없다', () => {
  // 여기서 감추면 기능이 원래 없는 것처럼 보인다. 검색해서 조회수를 못 받았을 때
  // 사라져야 "이 검색이 조회수를 못 받았구나" 로 읽힌다.
  assert.equal(sortKeysFor('reel', []).includes('views'), true)
})

test('릴스가 아닌 결과만 있으면 조회수순을 그대로 둔다 — 아직 판단할 근거가 없다', () => {
  const photo = { id: 'p', rank: 0, kind: 'carousel', playCount: -1, likes: 0, comments: 0 }
  assert.equal(sortKeysFor('reel', [photo]).includes('views'), true)
})

test('내놓는 정렬 키는 전부 SORTS 에 있는 것이어야 한다', () => {
  for (const ct of ['reel', 'cardnews']) {
    for (const k of sortKeysFor(ct, [reel('a', 1)])) assert.ok(SORTS[k], `${ct}: ${k} 가 SORTS 에 없다`)
  }
})
