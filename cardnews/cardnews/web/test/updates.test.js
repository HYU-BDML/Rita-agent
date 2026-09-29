import { test } from 'node:test'
import assert from 'node:assert/strict'
import { UPDATES, LATEST, hasUnseen, markerOf, updatesFor } from '../lib/updates.js'

const at = (date, title = 't') => ({ date, title, body: 'b' })

test('내역은 최신이 맨 위에 있다', () => {
  // 화면에 그리는 순서가 곧 이 순서다. 뒤집혀 있으면 옛 소식이 먼저 보인다.
  const dates = UPDATES.map((u) => u.date)
  assert.deepEqual(dates, [...dates].sort().reverse())
  assert.ok(LATEST.startsWith(dates[0]), `${LATEST} 가 ${dates[0]} 로 시작하지 않는다`)
})

// 예전에는 날짜만 보고 판정해서, 같은 날 소식을 하나 더 올리면 그날 이미
// 열어본 사람에게 점이 안 붙었다. 올린 사람은 붙는 줄 알고 있으니 조용히 놓친다.
test('같은 날에 소식을 하나 더해도 표식이 바뀐다', () => {
  const before = markerOf([at('2026-08-17', '첫째')])
  const after = markerOf([at('2026-08-17', '둘째'), at('2026-08-17', '첫째')])
  assert.notEqual(before, after)
})

test('날짜가 바뀌어도 표식이 바뀐다', () => {
  assert.notEqual(markerOf([at('2026-08-17')]), markerOf([at('2026-08-18')]))
})

test('목록이 그대로면 표식도 그대로다', () => {
  const list = [at('2026-08-17', 'a'), at('2026-08-16', 'b')]
  assert.equal(markerOf(list), markerOf([...list]))
})

test('소식이 하나도 없으면 표식이 없다', () => {
  assert.equal(markerOf([]), '')
  assert.equal(markerOf(null), '')
})

test('처음 온 사람에게는 새 소식이 있다', () => {
  assert.equal(hasUnseen(''), true)
  assert.equal(hasUnseen(null), true)
  assert.equal(hasUnseen(undefined), true)
})

test('지금 목록을 다 본 사람에게는 점을 띄우지 않는다', () => {
  assert.equal(hasUnseen(LATEST), false)
})

test('예전 방식으로 날짜만 적어둔 브라우저에는 다시 띄운다', () => {
  // 날짜만 저장하던 시절의 값이 남아 있는 경우. 그 뒤로 소식이 늘었을 수 있으니
  // 안 띄우는 쪽보다 한 번 더 띄우는 쪽이 낫다.
  assert.equal(hasUnseen('2026-08-17'), true)
  assert.equal(hasUnseen('9999-12-31'), true)
})

test('모든 소식에 scope 가 있다', () => {
  assert.ok(UPDATES.every((u) => ['cardnews', 'reel', 'common'].includes(u.scope)))
})

test('updatesFor: common 과 그 종류만 남긴다', () => {
  const reel = updatesFor('reel')
  assert.ok(reel.every((u) => u.scope === 'common' || u.scope === 'reel'))
  assert.ok(reel.every((u) => u.scope !== 'cardnews'))

  const cardnews = updatesFor('cardnews')
  assert.ok(cardnews.every((u) => u.scope === 'common' || u.scope === 'cardnews'))
  assert.ok(cardnews.every((u) => u.scope !== 'reel'))
})

test('updatesFor: 순서는 유지된다(최신이 먼저)', () => {
  const list = updatesFor('cardnews')
  const dates = list.map((u) => u.date)
  assert.deepEqual(dates, [...dates].sort().reverse())
})

test('hasUnseen 은 두 번째 인자로 다른 목록의 마커를 받을 수 있다', () => {
  const reelLatest = markerOf(updatesFor('reel'))
  assert.equal(hasUnseen('', reelLatest), true)
  assert.equal(hasUnseen(reelLatest, reelLatest), false)
})

test('hasUnseen 은 인자를 하나만 줘도 전체 목록 기준으로 동작한다(하위호환)', () => {
  assert.equal(hasUnseen(LATEST), false)
})
