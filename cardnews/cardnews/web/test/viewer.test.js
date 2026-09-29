import { test } from 'node:test'
import assert from 'node:assert/strict'
import { viewerHtml } from '../lib/viewer.js'

const post = (o = {}) => ({
  id: 'C_abc',
  url: 'https://www.instagram.com/p/C_abc/',
  caption: '본문',
  author: 'someone',
  likes: 1234,
  comments: 56,
  likesHidden: false,
  isCarousel: true,
  kind: 'carousel',
  slideCount: 2,
  slides: [
    { url: 'https://cdn.test/01.jpg' },
    { url: 'https://cdn.test/02.mp4', isVideo: true },
  ],
  ...o,
})

// 인라인으로 숨긴 칸은 style.display = '' 로 되살아난다(인라인 선언이 지워지므로).
// 그런데 스타일시트 규칙으로 숨긴 칸은 그렇지 않다 — 인라인을 지우면 규칙이 다시 이겨서
// 계속 숨어 있다. 실제로 영상 칸(#vid)이 이것 때문에 한 장도 안 보였다.
//
// 그래서 #vid 하나를 콕 집지 않고, "스타일시트가 숨긴 칸" 을 CSS 에서 직접 찾아
// 그것들을 빈 문자열로 되살리려는 곳이 있는지 본다. 다음에 다른 칸에서 같은 실수를 해도 걸린다.
function hiddenByStylesheet(html) {
  // 주석을 먼저 걷어낸다. 안 그러면 규칙 앞에 붙은 주석이 선택자에 딸려 들어가
  // 그 규칙을 통째로 못 읽고, 이 시험이 아무것도 안 보면서 통과해버린다.
  const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'))
    .replace(/\/\*[\s\S]*?\*\//g, '')
  const ids = new Set()
  for (const rule of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (!/display\s*:\s*none/.test(rule[2])) continue
    for (const sel of rule[1].split(',')) {
      const m = sel.trim().match(/^#([\w-]+)$/)
      if (m) ids.add(m[1])
    }
  }
  return ids
}

test('스타일시트로 숨긴 칸을 빈 문자열로 되살리려 하지 않는다', () => {
  const html = viewerHtml(post(), (u) => u)
  const ids = hiddenByStylesheet(html)

  // 하나도 못 찾았다면 CSS 모양이 바뀐 것이다. 시험이 조용히 헛돌면 안 된다.
  assert.ok(ids.size > 0, '스타일시트에서 숨긴 칸을 하나도 못 찾았다 — 이 시험이 헛돌고 있다')

  for (const id of ids) {
    const assign = new RegExp(`\\$\\('${id}'\\)\\.style\\.display\\s*=\\s*([^;\\n]+)`, 'g')
    for (const m of html.matchAll(assign)) {
      assert.equal(
        /''|""/.test(m[1]),
        false,
        `#${id} 는 스타일시트가 숨긴다. '' 로는 다시 못 켠다 — 실제 값을 줘라: ${m[1].trim()}`
      )
    }
  }
})

test('영상 칸과 사진 칸이 동시에 꺼지지 않는다', () => {
  const html = viewerHtml(post(), (u) => u)
  // 같은 자리를 나눠 쓰는 두 칸이라, 한쪽을 끄면 다른 쪽은 반드시 켜져야 한다.
  const slide = html.match(/\$\('slide'\)\.style\.display\s*=\s*([^;\n]+)/)
  const vid = html.match(/\$\('vid'\)\.style\.display\s*=\s*([^;\n]+)/)
  assert.ok(slide && vid, '두 칸을 켜고 끄는 자리를 못 찾았다')
  assert.match(slide[1], /'none'/, '사진 칸을 끄는 값이 없다')
  assert.match(vid[1], /'none'/, '영상 칸을 끄는 값이 없다')
  // 켜는 쪽이 빈 문자열이면 스타일시트에 진다
  assert.equal(/''|""/.test(vid[1]), false, '영상 칸을 켜는 값이 빈 문자열이다')
})
