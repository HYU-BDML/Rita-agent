import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkMeasure } from '../server/measures.js'
import { viewerHtml } from '../lib/viewer.js'

const doc = (o = {}) => ({
  shortcode: 'C_abc',
  slides: [{ index: 1, role: '훅', colors: { bg: '#FFF8E7', contrast: 12.6 } }],
  ...o,
})

test('바른 측정값은 통과하고 장수를 알려준다', () => {
  const r = checkMeasure('C_abc', JSON.stringify(doc()))
  assert.equal(r.why, undefined)
  assert.equal(r.slides, 1)
})

test('들여쓰기를 털어 같은 모양으로 넣는다', () => {
  const pretty = checkMeasure('C_abc', JSON.stringify(doc(), null, 2))
  const flat = checkMeasure('C_abc', JSON.stringify(doc()))
  assert.equal(pretty.json, flat.json)
  assert.ok(!pretty.json.includes('\n'))
})

test('이상한 게시물 코드는 막는다', () => {
  for (const bad of ['', '../../secret', 'a/b', 'x'.repeat(31)]) {
    assert.ok(checkMeasure(bad, JSON.stringify(doc())).why, bad)
  }
})

test('JSON 이 아니거나 모양이 다르면 막는다', () => {
  assert.ok(checkMeasure('C_abc', '').why)
  assert.ok(checkMeasure('C_abc', '이건 JSON 이 아니다').why)
  assert.ok(checkMeasure('C_abc', '[1,2,3]').why)
  assert.ok(checkMeasure('C_abc', '"글자"').why)
  assert.ok(checkMeasure('C_abc', JSON.stringify({ slides: [] })).why)
  assert.ok(checkMeasure('C_abc', JSON.stringify({ shortcode: 'C_abc' })).why)
})

test('너무 긴 측정값은 막는다', () => {
  const big = JSON.stringify({ slides: [{ pad: 'ㄱ'.repeat(200_001) }] })
  assert.ok(checkMeasure('C_abc', big).why)
})

// ── 뷰어 ────────────────────────────────────────────────────
const post = {
  id: 'C_abc', url: 'https://www.instagram.com/p/C_abc/', author: 'someone',
  caption: '본문', likes: 1, comments: 2, isCarousel: true, slideCount: 2,
  slides: [{ url: '/f/C_abc/01.jpg' }, { url: '/f/C_abc/02.jpg' }],
}

test('뷰어가 측정값 칸과 받아오는 코드를 들고 있다', () => {
  const html = viewerHtml(post)
  assert.ok(html.includes('id="meas"'), '측정값 칸이 있어야 한다')
  assert.ok(html.includes("'/api/measures/'"), '스스로 받아와야 한다')
  assert.ok(html.includes('drawMeas()'), '장을 넘길 때 다시 그려야 한다')
})

test('뷰어는 원래 창을 거치지 않는다 — app.js 를 안 건드리려는 것이다', () => {
  const html = viewerHtml(post)
  const at = html.indexOf('/api/measures/')
  const line = html.slice(html.lastIndexOf('\n', at), html.indexOf('\n', at))
  assert.ok(!line.includes('opener'), '측정값은 opener 를 거치지 않아야 한다')
  assert.ok(line.includes('same-origin'), '같은 출처로 불러야 쿠키가 실린다')
})
