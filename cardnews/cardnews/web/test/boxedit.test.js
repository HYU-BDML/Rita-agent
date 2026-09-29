import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handleAt, insideBox, resize, move, pick } from '../lib/boxedit.js'

const B = [100, 100, 300, 200]

test('모서리 손잡이를 잡는다', () => {
  assert.equal(handleAt(B, [100, 100]), 'nw')
  assert.equal(handleAt(B, [300, 200]), 'se')
  assert.equal(handleAt(B, [200, 100]), 'n')
  assert.equal(handleAt(B, [200, 150]), null)     // 한가운데는 손잡이가 아니다
})

test('크기를 조절한다', () => {
  assert.deepEqual(resize(B, 'se', [400, 250]), [100, 100, 400, 250])
  assert.deepEqual(resize(B, 'nw', [50, 50]), [50, 50, 300, 200])
  assert.deepEqual(resize(B, 'n', [999, 120]), [100, 120, 300, 200])   // n 은 y 만
})

test('반대편으로 끌어도 뒤집히지 않는다', () => {
  const r = resize(B, 'se', [10, 10], 12)
  assert.deepEqual(r, [100, 100, 112, 112])
})

test('옮겨도 화면 밖으로 안 나간다', () => {
  assert.deepEqual(move(B, 50, 50, 1080, 1350), [150, 150, 350, 250])
  assert.deepEqual(move(B, -500, 0, 1080, 1350), [0, 100, 200, 200])
  assert.deepEqual(move(B, 900, 0, 1080, 1350), [880, 100, 1080, 200])
})

test('겹쳤으면 작은 것을 고른다 — 큰 도형 위의 번호칩', () => {
  const big = { id: 'a', box: [0, 0, 1000, 1000] }
  const chip = { id: 'b', box: [40, 40, 120, 120] }
  assert.equal(pick([big, chip], [80, 80]).id, 'b')
  assert.equal(pick([big, chip], [500, 500]).id, 'a')
  assert.equal(pick([big, chip], [1200, 80]), null)
})

test('insideBox 는 네모 안인지를 본다', () => {
  assert.equal(insideBox(B, [200, 150]), true)
  assert.equal(insideBox(B, [50, 50]), false)
})
