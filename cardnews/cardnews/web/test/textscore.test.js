import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scoreGray, toGray, hasText, TEXT_THRESHOLD } from '../lib/textscore.js'

// 매끈한 바탕에 진한 글자획을 얹은 가짜 표지
function fakeCover({ w = 64, h = 80, strokes = true }) {
  const g = new Float32Array(w * h).fill(240) // 평평한 밝은 바탕
  if (strokes) {
    for (const row of [20, 22, 24, 40, 42, 44]) {
      for (let x = 8; x < w - 8; x += 3) {
        g[row * w + x] = 10 // 획: 바탕과 대비가 큰 점
        g[row * w + x + 1] = 10
      }
    }
  }
  return { g, w, h }
}

// 어디를 봐도 자글자글한 사진
function fakePhoto({ w = 64, h = 80 }) {
  const g = new Float32Array(w * h)
  let seed = 7
  for (let i = 0; i < g.length; i += 1) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    g[i] = (seed >> 16) % 256
  }
  return { g, w, h }
}

test('글자를 얹은 표지가 사진보다 점수가 높다', () => {
  const cover = fakeCover({})
  const photo = fakePhoto({})
  const a = scoreGray(cover.g, cover.w, cover.h)
  const b = scoreGray(photo.g, photo.w, photo.h)
  assert.ok(a > b, `표지 ${a} > 사진 ${b} 여야 한다`)
})

test('민무늬 바탕은 경계가 없어 0점이다', () => {
  const flat = fakeCover({ strokes: false })
  assert.equal(scoreGray(flat.g, flat.w, flat.h), 0)
})

test('자글자글한 사진은 기준선을 넘지 못한다', () => {
  const photo = fakePhoto({})
  assert.ok(scoreGray(photo.g, photo.w, photo.h) < TEXT_THRESHOLD)
})

test('너무 작은 그림은 0점으로 떨어진다', () => {
  assert.equal(scoreGray(new Float32Array(4), 2, 2), 0)
})

test('toGray는 RGBA를 밝기 한 값으로 접는다', () => {
  const rgba = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255])
  const g = toGray(rgba, 2, 1)
  assert.equal(Math.round(g[0]), 255)
  assert.equal(Math.round(g[1]), 0)
})

test('아직 못 잰 표지(null)는 남긴다', () => {
  // 글자가 있는 걸 빠뜨리는 쪽이 헛잡는 쪽보다 나쁘다
  assert.equal(hasText(null), true)
})

test('기준선 위는 남기고 아래는 뺀다', () => {
  assert.equal(hasText(TEXT_THRESHOLD), true)
  assert.equal(hasText(TEXT_THRESHOLD - 0.001), false)
  assert.equal(hasText(0), false)
})

test('기준선은 실측 최저 글자 점수(0.023)보다 넉넉히 아래다', () => {
  assert.ok(TEXT_THRESHOLD < 0.023 / 2)
})
