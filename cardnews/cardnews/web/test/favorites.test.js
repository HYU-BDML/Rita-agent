import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_FAVORITES, EXPIRE_DAYS,
  loadFavorites, saveFavorites, addFavorite, removeFavorite, isExpired, agoLabel,
  typeOf, favoritesFor,
} from '../lib/favorites.js'

// localStorage 흉내. 용량 한도를 흉내내려고 넘치면 던지게 해둔다.
const fakeStore = (limit = Infinity) => {
  const m = new Map()
  return {
    m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    removeItem: (k) => m.delete(k),
    setItem: (k, v) => {
      if (String(v).length > limit) {
        const e = new Error('quota')
        e.name = 'QuotaExceededError'
        throw e
      }
      m.set(k, String(v))
    },
  }
}

const entry = (label, o = {}) => ({
  label,
  savedAt: '2026-08-17T00:00:00.000Z',
  results: [{ id: 'a' }],
  used: [{ tag: label }],
  ...o,
})

test('빈 저장소는 빈 목록을 준다', () => {
  assert.deepEqual(loadFavorites(fakeStore()), [])
})

test('저장한 것을 그대로 다시 읽는다', () => {
  const s = fakeStore()
  assert.equal(saveFavorites(s, [entry('@luxmag.kr')]), true)
  const got = loadFavorites(s)
  assert.equal(got.length, 1)
  assert.equal(got[0].label, '@luxmag.kr')
  assert.deepEqual(got[0].results, [{ id: 'a' }])
})

test('망가진 값은 빈 목록으로 다룬다 — 화면이 죽으면 안 된다', () => {
  const s = fakeStore()
  s.setItem('favorites', '{{{')
  assert.deepEqual(loadFavorites(s), [])
})

test('용량이 넘치면 false 를 주고 있던 것은 건드리지 않는다', () => {
  const s = fakeStore(50)
  saveFavorites(s, [entry('작은것', { results: [] })])
  const before = s.getItem('favorites')
  const big = entry('큰것', { results: Array.from({ length: 100 }, (_, i) => ({ id: 'x'.repeat(50) + i })) })
  assert.equal(saveFavorites(s, [big]), false)
  assert.equal(s.getItem('favorites'), before, '실패했는데 기존 값이 바뀌었다')
})

test('새 것이 앞에 온다', () => {
  const { list } = addFavorite([entry('먼저')], entry('나중'))
  assert.deepEqual(list.map((x) => x.label), ['나중', '먼저'])
})

test('같은 검색어를 다시 담으면 갈아끼운다 — 늘어나지 않는다', () => {
  const old = entry('@luxmag.kr', { savedAt: '2026-08-01T00:00:00.000Z' })
  const fresh = entry('@luxmag.kr', { savedAt: '2026-08-17T00:00:00.000Z' })
  const { list, why } = addFavorite([old, entry('다른것')], fresh)
  assert.equal(why, undefined)
  assert.equal(list.length, 2)
  assert.equal(list[0].savedAt, '2026-08-17T00:00:00.000Z')
})

test(`${MAX_FAVORITES}개가 꽉 차면 막는다 — 돈 주고 받은 것을 몰래 밀어내지 않는다`, () => {
  const full = Array.from({ length: MAX_FAVORITES }, (_, i) => entry('검색' + i))
  const { list, why } = addFavorite(full, entry('새것'))
  assert.ok(why, '꽉 찼는데 그냥 넣었다')
  assert.equal(list, undefined)
})

test('꽉 차 있어도 이미 있는 것을 갈아끼우는 것은 된다', () => {
  const full = Array.from({ length: MAX_FAVORITES }, (_, i) => entry('검색' + i))
  const { list, why } = addFavorite(full, entry('검색2', { savedAt: '2026-08-18T00:00:00.000Z' }))
  assert.equal(why, undefined)
  assert.equal(list.length, MAX_FAVORITES)
})

test('지우기는 그것만 뺀다', () => {
  const out = removeFavorite([entry('a'), entry('b')], 'a')
  assert.deepEqual(out.map((x) => x.label), ['b'])
})

// 인스타 이미지 주소는 나흘쯤 뒤 죽는다. 그때부터는 회색 칸이 뜨는데,
// 사용자가 고장으로 오해하지 않게 화면이 미리 알려줘야 한다.
test(`${EXPIRE_DAYS}일이 지나면 만료로 본다`, () => {
  const t0 = Date.parse('2026-08-17T00:00:00.000Z')
  const day = 86400000
  assert.equal(isExpired('2026-08-17T00:00:00.000Z', t0), false)
  assert.equal(isExpired(new Date(t0 - 3 * day).toISOString(), t0), false)
  assert.equal(isExpired(new Date(t0 - 5 * day).toISOString(), t0), true)
})

test('만료 판정이 이상한 값에 걸려 넘어지지 않는다', () => {
  assert.equal(isExpired('', Date.now()), false)
  assert.equal(isExpired(undefined, Date.now()), false)
})

test('얼마 전인지 사람 말로 준다', () => {
  const t0 = Date.parse('2026-08-17T10:00:00.000Z')
  const day = 86400000
  assert.equal(agoLabel(new Date(t0 - 60000).toISOString(), t0), '방금')
  assert.equal(agoLabel(new Date(t0 - 3 * 3600000).toISOString(), t0), '3시간 전')
  assert.equal(agoLabel(new Date(t0 - 2 * day).toISOString(), t0), '2일 전')
  assert.equal(agoLabel('', t0), '')
})

// 릴스와 카드뉴스는 결과 모양이 달라서 서로의 화면에서 열면 거르개가 전부 걸러낸다.
// 실제로 릴스 모드에서 카드뉴스 즐겨찾기를 누르면 "열었습니다" 라고 해놓고 빈 화면이
// 나왔다(2026-08-18 재현). 갈래를 나눠 애초에 안 보여준다.
const reelEntry = (label) => entry(label, { results: [{ id: 'r', kind: 'video' }] })
const cardEntry = (label) => entry(label, { results: [{ id: 'c', kind: 'carousel' }] })

test('갈래를 적어둔 즐겨찾기는 그 값을 쓴다', () => {
  assert.equal(typeOf(entry('a', { contentType: 'reel', results: [{ kind: 'carousel' }] })), 'reel')
})

// 카드뉴스 키워드 검색은 릴스도 같이 긁어온다. 그리고 즐겨찾기에 담을 때는 거른 화면이
// 아니라 결과 전체가 들어간다 — 그래서 카드뉴스 즐겨찾기 안에 릴스가 섞여 있다.
// "릴스가 하나라도 있으면 릴스" 로 봤다가 카드뉴스 즐겨찾기가 릴스 화면에 떴다.
// 실측 픽스처(keywordsearch)를 normalize 한 결과가 캐러셀 3 · 사진 2 · 릴스 2 다.
const kinds = (spec) => ({
  results: Object.entries(spec).flatMap(([kind, n]) =>
    Array.from({ length: n }, (_, i) => ({ id: kind + i, kind }))),
})

test('카드뉴스 검색을 담은 것은 릴스가 섞여 있어도 카드뉴스다', () => {
  assert.equal(typeOf(kinds({ carousel: 3, image: 2, video: 2 })), 'cardnews')
})

test('릴스 검색을 담은 것은 릴스다', () => {
  assert.equal(typeOf(kinds({ video: 9 })), 'reel')
})

test('반반이면 카드뉴스로 본다 — 릴스 쪽에 잘못 넣는 편이 더 나쁘다', () => {
  assert.equal(typeOf(kinds({ video: 2, carousel: 2 })), 'cardnews')
})

test('갈래가 없는 옛 즐겨찾기는 결과를 보고 알아낸다 — 마이그레이션 없이 읽는다', () => {
  assert.equal(typeOf(reelEntry('a')), 'reel')
  assert.equal(typeOf(cardEntry('a')), 'cardnews')
  assert.equal(typeOf(entry('a', { results: [] })), 'cardnews', '판단할 근거가 없으면 카드뉴스로 본다')
})

test('지금 갈래 것만 보여준다', () => {
  const list = [reelEntry('먹방'), cardEntry('아이돌')]
  assert.deepEqual(favoritesFor(list, 'reel').map((x) => x.label), ['먹방'])
  assert.deepEqual(favoritesFor(list, 'cardnews').map((x) => x.label), ['아이돌'])
})

test('같은 검색어라도 갈래가 다르면 따로 담긴다 — 서로 덮어쓰면 안 된다', () => {
  const a = entry('아이돌', { contentType: 'cardnews' })
  const b = entry('아이돌', { contentType: 'reel' })
  const { list } = addFavorite([a], b)
  assert.equal(list.length, 2)
  assert.deepEqual(favoritesFor(list, 'reel').map((x) => x.label), ['아이돌'])
  assert.deepEqual(favoritesFor(list, 'cardnews').map((x) => x.label), ['아이돌'])
})

test('같은 검색어에 같은 갈래면 갈아끼운다', () => {
  const old = entry('아이돌', { contentType: 'reel', savedAt: '2026-08-01T00:00:00.000Z' })
  const neu = entry('아이돌', { contentType: 'reel' })
  const { list } = addFavorite([old], neu)
  assert.equal(list.length, 1)
  assert.equal(list[0].savedAt, neu.savedAt)
})

test('한도는 갈래마다 따로 센다 — 안 보이는 것 때문에 막히면 안 된다', () => {
  const cards = Array.from({ length: MAX_FAVORITES }, (_, i) =>
    entry(`카드${i}`, { contentType: 'cardnews' }))
  const { list, why } = addFavorite(cards, entry('먹방', { contentType: 'reel' }))
  assert.equal(why, undefined, '카드뉴스가 꽉 찼어도 릴스는 담겨야 한다')
  assert.equal(favoritesFor(list, 'reel').length, 1)

  const reels = Array.from({ length: MAX_FAVORITES }, (_, i) =>
    entry(`릴스${i}`, { contentType: 'reel' }))
  const full = addFavorite([...cards, ...reels], entry('새것', { contentType: 'reel' }))
  assert.match(full.why, new RegExp(String(MAX_FAVORITES)))
})

test('지울 때도 갈래를 본다 — 같은 이름의 반대편 것을 지우면 안 된다', () => {
  const list = [entry('아이돌', { contentType: 'reel' }), entry('아이돌', { contentType: 'cardnews' })]
  const left = removeFavorite(list, '아이돌', 'reel')
  assert.equal(left.length, 1)
  assert.equal(typeOf(left[0]), 'cardnews')
})
