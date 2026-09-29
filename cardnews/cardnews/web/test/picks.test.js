import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isId, slidesOf, rowToCard, toRow, sortCards, reelCapReached } from '../server/picks.js'

const row = (o = {}) => ({
  id: 'C_abc', url: 'https://www.instagram.com/p/C_abc/', author: 'someone',
  caption: '본문', posted_at: '2026-08-01', likes: 1234, comments: 56,
  slide_count: 3, slide_total: 3, tag: '아이돌 카드뉴스', picked_at: '2026-08-16T05:00:00.000Z',
  ...o,
})

const body = (o = {}) => ({
  id: 'C_abc', url: 'https://www.instagram.com/p/C_abc/', author: 'someone',
  caption: '본문', postedAt: '2026-08-01', likes: 1234, comments: 56,
  slideCount: 3, slideTotal: 3, tag: '아이돌 카드뉴스', ...o,
})

test('게시물 코드 판정', () => {
  for (const ok of ['C_abc', 'a', 'A-1_b', 'x'.repeat(30)]) assert.equal(isId(ok), true, ok)
  for (const no of ['', 'x'.repeat(31), '../etc', 'a/b', 'a b', 'a.b', null]) {
    assert.equal(isId(no), false, String(no))
  }
})

test('슬라이드 주소는 01 부터 두 자리로 센다', () => {
  assert.deepEqual(slidesOf('C_abc', 3), ['/f/C_abc/01.jpg', '/f/C_abc/02.jpg', '/f/C_abc/03.jpg'])
  assert.deepEqual(slidesOf('C_abc', 0), [])
  assert.equal(slidesOf('C_abc', 12)[11], '/f/C_abc/12.jpg')
})

test('영상으로 표시된 자리는 .mp4 로 센다', () => {
  // 0 은 사진, 1 은 영상. 자리 수만큼 적혀 있다.
  assert.deepEqual(slidesOf('C_abc', 3, '010'),
    ['/f/C_abc/01.jpg', '/f/C_abc/02.mp4', '/f/C_abc/03.jpg'])
})

test('표시가 없거나 길이가 어긋나면 전부 사진으로 센다', () => {
  // 영상이 생기기 전에 담아둔 줄은 이 칸이 비어 있다. 그것도 읽혀야 한다.
  assert.deepEqual(slidesOf('C_abc', 2, ''), ['/f/C_abc/01.jpg', '/f/C_abc/02.jpg'])
  assert.deepEqual(slidesOf('C_abc', 2, '1'), ['/f/C_abc/01.jpg', '/f/C_abc/02.jpg'])
  assert.deepEqual(slidesOf('C_abc', 2), ['/f/C_abc/01.jpg', '/f/C_abc/02.jpg'])
})

test('담기 요청의 영상 표시를 표에 넣는다', () => {
  assert.equal(toRow(body({ slideKinds: '010' }), 'now').row.slide_kinds, '010')
})

test('영상 표시가 0 과 1 이 아니거나 장수와 안 맞으면 버린다', () => {
  // 틀린 표시를 받아 적으면 없는 파일을 가리키게 된다. 차라리 전부 사진으로 본다.
  assert.equal(toRow(body({ slideKinds: '0x0' }), 'now').row.slide_kinds, '')
  assert.equal(toRow(body({ slideKinds: '01' }), 'now').row.slide_kinds, '')
  assert.equal(toRow(body(), 'now').row.slide_kinds, '')
})

test('표 한 줄이 카드가 된다', () => {
  const c = rowToCard(row())
  assert.equal(c.id, 'C_abc')
  assert.equal(c.postedAt, '2026-08-01')
  assert.equal(c.slideCount, 3)
  assert.equal(c.likesHidden, false)
  assert.deepEqual(c.slides, ['/f/C_abc/01.jpg', '/f/C_abc/02.jpg', '/f/C_abc/03.jpg'])
})

test('좋아요가 -1 이면 비공개로 읽는다', () => {
  assert.equal(rowToCard(row({ likes: -1 })).likesHidden, true)
})

test('담기 요청이 표에 넣을 값이 된다', () => {
  const { row: r, why } = toRow(body(), '2026-08-16T05:00:00.000Z')
  assert.equal(why, undefined)
  assert.equal(r.id, 'C_abc')
  assert.equal(r.posted_at, '2026-08-01')
  assert.equal(r.slide_count, 3)
  assert.equal(r.slide_total, 3)
  assert.equal(r.picked_at, '2026-08-16T05:00:00.000Z')
})

test('이상한 게시물 코드는 막는다 — 창고 경로를 만들 값이다', () => {
  for (const bad of ['', '../../secret', 'a/b']) {
    assert.ok(toRow(body({ id: bad }), 'now').why, bad)
  }
})

test('저장된 장수가 원래 장수보다 많을 수 없다', () => {
  assert.ok(toRow(body({ slideCount: 5, slideTotal: 3 }), 'now').why)
  assert.ok(toRow(body({ slideCount: 0 }), 'now').why)
  assert.ok(toRow(body({ slideTotal: 0 }), 'now').why)
  assert.ok(toRow(body({ slideTotal: 31 }), 'now').why)
})

test('너무 긴 본문은 막는다', () => {
  assert.ok(toRow(body({ caption: 'ㄱ'.repeat(2201) }), 'now').why)
  assert.equal(toRow(body({ caption: 'ㄱ'.repeat(2200) }), 'now').why, undefined)
})

test('빠진 값은 빈 값으로 채운다 — 담기 자체가 실패하면 안 된다', () => {
  const { row: r, why } = toRow({ id: 'C_abc', slideCount: 1, slideTotal: 1 }, 'now')
  assert.equal(why, undefined)
  assert.equal(r.author, '')
  assert.equal(r.caption, '')
  assert.equal(r.likes, 0)
  assert.equal(r.comments, 0)
})

// 고정 — 공동 목록은 같이 보는 자리라 고정도 같이 본다(브라우저가 아니라 표에 남긴다).
test('카드에 고정 여부가 실려 나온다', () => {
  assert.equal(rowToCard(row({ pinned: 1 })).pinned, true)
  assert.equal(rowToCard(row({ pinned: 0 })).pinned, false)
  // 옛 줄에는 칸이 없다. 그때도 고정 안 된 것으로 본다 — 화면이 죽으면 안 된다.
  assert.equal(rowToCard(row({ pinned: undefined })).pinned, false)
})

test('고정 목록은 고정 먼저, 그 안에서 최근 순이다', () => {
  const cards = [
    { id: 'a', pinned: false, pickedAt: '2026-08-17' },
    { id: 'b', pinned: true, pickedAt: '2026-08-10' },
    { id: 'c', pinned: false, pickedAt: '2026-08-16' },
    { id: 'd', pinned: true, pickedAt: '2026-08-15' },
  ]
  assert.deepEqual(sortCards(cards).map((x) => x.id), ['d', 'b', 'a', 'c'])
})

test('담기 요청은 고정을 건드리지 않는다 — 다시 담아도 고정이 안 풀린다', () => {
  const { row: r } = toRow(body({ pinned: true }), 'now')
  assert.equal('pinned' in r, false, 'toRow 가 고정을 덮어쓰려 한다')
})

test('담기 요청의 콘텐츠 종류를 표에 넣는다', () => {
  assert.equal(toRow(body({ contentType: 'reel' }), 'now').row.content_type, 'reel')
  assert.equal(toRow(body({ contentType: 'cardnews' }), 'now').row.content_type, 'cardnews')
})

test('콘텐츠 종류가 이상하거나 빠지면 카드뉴스로 본다 — 담기가 통째로 막히면 안 된다', () => {
  assert.equal(toRow(body(), 'now').row.content_type, 'cardnews')
  assert.equal(toRow(body({ contentType: 'movie' }), 'now').row.content_type, 'cardnews')
})

test('조회수를 표에 넣는다', () => {
  assert.equal(toRow(body({ playCount: 12345 }), 'now').row.play_count, 12345)
})

test('조회수가 이상하거나 빠지면 -1(모름)로 본다', () => {
  assert.equal(toRow(body(), 'now').row.play_count, -1)
  assert.equal(toRow(body({ playCount: 'NaN' }), 'now').row.play_count, -1)
})

test('카드의 콘텐츠 종류·조회수를 읽는다', () => {
  const c = rowToCard(row({ content_type: 'reel', play_count: 999 }))
  assert.equal(c.contentType, 'reel')
  assert.equal(c.playCount, 999)
})

test('옛 줄(칸이 없던 시절)은 카드뉴스·조회수 모름으로 본다', () => {
  const c = rowToCard(row({ content_type: undefined, play_count: undefined }))
  assert.equal(c.contentType, 'cardnews')
  assert.equal(c.playCount, -1)
})

test('reelCapReached: 릴스가 캡 미만이면 안 걸린다', () => {
  const cards = [{ id: 'a', contentType: 'reel' }, { id: 'b', contentType: 'cardnews' }]
  assert.equal(reelCapReached(cards, 'new', 100), false)
})

test('reelCapReached: 릴스가 캡에 닿으면 새 게시물을 막는다', () => {
  const cards = Array.from({ length: 100 }, (_, i) => ({ id: `r${i}`, contentType: 'reel' }))
  assert.equal(reelCapReached(cards, 'new', 100), true)
})

test('reelCapReached: 이미 담긴 걸 다시 담는 건 캡에 안 걸린다', () => {
  const cards = Array.from({ length: 100 }, (_, i) => ({ id: `r${i}`, contentType: 'reel' }))
  assert.equal(reelCapReached(cards, 'r0', 100), false)
})

test('reelCapReached: 카드뉴스는 릴스 캡과 무관하다', () => {
  const cards = Array.from({ length: 100 }, (_, i) => ({ id: `r${i}`, contentType: 'reel' }))
  cards.push({ id: 'cn1', contentType: 'cardnews' })
  assert.equal(reelCapReached(cards, 'cn2', 100), true) // 새 릴스 기준으로 물어봐도 릴스가 이미 100개면 true
})
