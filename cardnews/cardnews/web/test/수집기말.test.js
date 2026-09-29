// 수집기 화면 글자표. **여기서 재는 것은 「빠진 데가 없나」 하나다.**
//
// 글자 하나하나를 시험으로 박으면 말을 다듬을 때마다 시험이 빨개진다.
// 대신 «열쇠마다 두 언어가 다 있나», «영어 자리에 한글이 남았나» 를 잰다 —
// 반만 옮긴 자리는 화면에서 안 보이고, 그 자리만 한국어로 튀어나온다.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { 수집기말, 뷰어말표, 뷰어꾸러미, 말하기, 낱말 } from '../lib/수집기말.js'

// 두 표를 같은 잣대로 잰다 — 뷰어 창 것만 빠뜨리면 그 창만 한국어가 된다.
const 표들 = { 수집기말, 뷰어말표 }
const 모든칸 = () => Object.entries(표들)
  .flatMap(([표이름, 표]) => Object.entries(표).map(([열쇠, 값]) => [`${표이름}.${열쇠}`, 값]))

const 여기 = dirname(fileURLToPath(import.meta.url))
const 웹 = join(여기, '..')
const 한글 = /[가-힣]/

test('열쇠마다 한국어와 영어가 둘 다 있다', () => {
  // 한쪽만 있으면 그 자리에서 터지거나(undefined) 한국어가 그대로 남는다.
  const 빠진것 = []
  for (const [열쇠, 값] of 모든칸()) {
    if (typeof 값.한국어 !== 'function') 빠진것.push(`${열쇠}.한국어`)
    if (typeof 값.영어 !== 'function') 빠진것.push(`${열쇠}.영어`)
  }
  assert.deepEqual(빠진것, [])
})

test('영어 자리에 한글이 남아 있지 않다', () => {
  // 값을 끼우는 말은 자리를 채워야 결과를 본다. 어떤 값이 와도 틀이 영어여야
  // 하므로, 자리에는 한글이 아닌 표본을 넣고 나온 글을 본다.
  const 표본 = ['X', 3, 'Y', 4, 'Z', 5]
  const 남은것 = []
  for (const [열쇠, 값] of 모든칸()) {
    const 난것 = String(값.영어(...표본.slice(0, 값.영어.length)))
    if (한글.test(난것)) 남은것.push(`${열쇠}: ${난것}`)
  }
  assert.deepEqual(남은것, [])
})

test('값을 끼우는 자리 개수가 두 언어에서 같다', () => {
  // 한쪽이 값을 덜 받으면 그 언어에서만 숫자가 통째로 사라진다.
  const 어긋난것 = []
  for (const [열쇠, 값] of 모든칸()) {
    if (값.한국어.length !== 값.영어.length) {
      어긋난것.push(`${열쇠}: 한국어 ${값.한국어.length}, 영어 ${값.영어.length}`)
    }
  }
  assert.deepEqual(어긋난것, [])
})

test('모르는 언어로 물으면 한국어가 나온다', () => {
  // 저장소가 망가져 엉뚱한 값이 와도 화면은 떠야 한다. 안 나오는 것보다 낫다.
  assert.equal(말하기('중국어')('탭_검색'), 수집기말.탭_검색.한국어())
  assert.equal(말하기(undefined)('탭_검색'), 수집기말.탭_검색.한국어())
})

test('낱말표는 모르는 값을 그대로 돌려준다', () => {
  // 창고에서 오는 값이라 새 낱말이 언제든 들어온다. 그때 빈 칸이 되면 안 된다.
  assert.equal(낱말('역할', '훅', '영어'), 'Hook')
  assert.equal(낱말('역할', '처음보는것', '영어'), '처음보는것')
  assert.equal(낱말('역할', '훅', '한국어'), '훅')
})

// ── 화면과 표가 맞나 ──────────────────────────────────────────────
//
// 열쇠를 잘못 치면 그 자리가 **빈 칸**이 된다 — 터지지 않아서 눈으로만 잡아야
// 하는데, 화면 한 구석은 안 열어 보면 모른다. 그래서 기계가 맞춰 본다.

test('수집기 HTML 이 부르는 열쇠가 표에 다 있다', () => {
  const 글 = readFileSync(join(웹, 'board-card-news.html'), 'utf-8')
  const 부른것 = [...글.matchAll(/data-말(?:h|ph)?="([^"]+)"/g)].map((m) => m[1])
  assert.ok(부른것.length > 30, `data-말 이 ${부른것.length}개뿐이다 — 안 붙은 데가 있다`)
  assert.deepEqual(부른것.filter((열쇠) => !수집기말[열쇠]), [])
})

/**
 * 글자 따옴표 안의 내용만 뽑는다. **주석은 안 본다** — 주석에 적힌 한국어는
 * 화면에 안 뜨는데, 거칠게 훑으면 그것까지 잡아 시험이 못 쓰게 된다.
 * 그래서 글자 안인지 밖인지를 세면서 한 자씩 걷는다.
 */
function 글자들(글) {
  const 난것 = []

  // 한 자씩 걸으며 «지금 글자 안인가 밖인가» 를 센다. 코드 안에 또 글이 들어가고
  // (`${esc(말('키_없음'))}`) 그 안에 또 코드가 들어가므로 되돌아 부른다.
  function 훑기(i, 끝따옴) {
    let 속 = ''
    let 앞글자 = ''          // 바로 앞의 뜻 있는 글자 — `/` 가 나눗셈인지 가른다
    while (i < 글.length) {
      const c = 글[i]
      if (끝따옴 && c === 끝따옴) return { i: i + 1, 속 }
      if (!끝따옴 && c === '}') return { i: i + 1, 속 }       // `${ }` 의 닫는 자리
      if (c === '\\' && 끝따옴) { i += 2; continue }

      if (!끝따옴 || 끝따옴 === '`') {
        if (끝따옴 === '`' && c === '$' && 글[i + 1] === '{') {
          i = 훑기(i + 2, '').i                              // 안쪽 코드
          continue
        }
      }
      if (!끝따옴) {
        if (c === '/' && 글[i + 1] === '/') {                 // 한 줄 주석
          while (i < 글.length && 글[i] !== '\n') i += 1
          continue
        }
        if (c === '/' && 글[i + 1] === '*') {                 // 여러 줄 주석
          const 끝 = 글.indexOf('*/', i + 2)
          i = 끝 < 0 ? 글.length : 끝 + 2
          continue
        }
        // **찾기 무늬(`/…/`)를 건너뛴다.** 안에 따옴표가 흔해서(`/[&<>"]/g`)
        // 지나치면 그 자리부터 글자 안팎이 통째로 어긋난다.
        if (c === '/' && (앞글자 === '' || '(,=:[!&|?{};+-*%~^<>'.includes(앞글자))) {
          i += 1
          while (i < 글.length && 글[i] !== '/' && 글[i] !== '\n') {
            if (글[i] === '\\') { i += 2; continue }
            if (글[i] === '[') {                              // 무늬 안의 [] — / 가 그대로 들어간다
              while (i < 글.length && 글[i] !== ']' && 글[i] !== '\n') {
                i += (글[i] === '\\' ? 2 : 1)
              }
            }
            i += 1
          }
          i += 1
          앞글자 = '/'
          continue
        }
        if (c === '{') { i = 훑기(i + 1, '').i; continue }     // 짝 맞추기
        if (c === "'" || c === '"' || c === '`') {
          const 안 = 훑기(i + 1, c)
          난것.push(안.속)
          i = 안.i
          앞글자 = c
          continue
        }
        if (!/\s/.test(c)) 앞글자 = c
        i += 1
        continue
      }

      속 += c
      i += 1
    }
    return { i, 속 }
  }

  훑기(0, '')
  return 난것
}

test('수집기 화면 파일에 번역 안 된 글자가 남아 있지 않다', () => {
  // 표를 만들어 놓고 한 군데를 안 옮기면 거기만 한국어로 뜬다. 눈으로는 못
  // 잡으므로 소스를 훑는다 — 화면에 거는 글자에 한글이 남았으면 빨개진다.
  //
  // 표의 열쇠는 한국어지만 화면에 안 뜬다. 프로그램끼리 주고받는 값도 마찬가지다.
  const 열쇠들 = new Set([...Object.keys(수집기말), ...Object.keys(뷰어말표)])
  const 봐줄것 = new Set([
    '한국어', '영어',                    // 언어 값 — 람다가 글자까지 맞춰 본다
    '안 함', '분석중', '분석 끝',          // 라벨 상태 — 값으로 견주는 자리
    '목록.json', '이름', '코드', '주제', '원고', '틀', '말투', '언어', '제목',
    '도형', '단색', '그라데이션', '사진', '인물', '로고', '장식',  // 틀 파일의 값
    '역할', '위계', '종류', '상태', '나온곳',  // 낱말표 갈래 이름
    '한판',                              // 틀 파일의 열쇠 — 원본 게시물 그림 주소
    '.pk-원본줄', '.pk-원장',  // 우리 class 이름 — 화면에 안 뜬다
    'cardnews.수집기탭',                  // 브라우저에 남기는 열쇠
  ])
  // 사람이 읽는 자리만 남긴다 — 표딱지(`<div class="pk-칸">`) 안의 한국어는
  // 화면 글자가 아니라 이름이다. 다만 올렸을 때 뜨는 말(title 따위)은 글자다.
  const 읽는자리 = (속) => {
    const 붙일것 = [...속.matchAll(/(?:title|alt|placeholder|aria-label)="([^"]*)"/g)]
      .map((m) => m[1])
    // 끝을 못 닫은 표딱지(글이 `${…}` 에서 끊긴 자리)도 같이 턴다. 그러고도
    // 남는 `data-칸높이=""` 같은 짝은 표딱지 **안쪽**이 `${…}` 에 잘려 나온
    // 조각이다 — 이름이지 글자가 아니니 같이 턴다(읽는 말은 위에서 이미 떴다).
    return [속.replace(/<[^>]*>/g, ' ').replace(/<[^>]*$/, ' ')
      .replace(/[\w가-힣-]+="[^"]*"/g, ' '), ...붙일것].join(' ')
  }
  const 샌것 = []
  // 뷰어(`lib/viewer.js`)는 여기서 안 본다 — 파일 통째가 HTML 문서 한 덩이라
  // 그 안의 CSS·코드 주석까지 글자로 잡힌다. 그쪽은 실제로 그려 보고 잰다
  // (아래 「뷰어 창을 영어로 그리면」).
  for (const 이름 of ['app.js', 'lib/templates.js']) {
    for (const 속 of 글자들(readFileSync(join(웹, 이름), 'utf-8'))) {
      const 알맹이 = 읽는자리(속).trim()
      if (!한글.test(알맹이)) continue
      if (열쇠들.has(알맹이) || 봐줄것.has(알맹이)) continue
      if (알맹이.endsWith('.js')) continue                    // 파일 이름
      if (/^\[?data-말h?p?h?\]?$/.test(알맹이)) continue       // HTML 에 박은 열쇠를 찾는 말
      샌것.push(`${이름}: ${알맹이}`)
    }
  }
  assert.deepEqual(샌것, [])
})


test('뷰어 꾸러미는 값 자리를 비운 채 굳힌다', () => {
  // 뷰어는 딴 창이라 함수를 못 부른다. 자리만 비워 둔 글로 실어 보내야 한다.
  const 한 = 뷰어꾸러미('한국어')
  const 영 = 뷰어꾸러미('영어')
  assert.equal(한.전체저장, '전체 저장 ({0}장)')
  assert.equal(영.전체저장, 'Save all ({0})')
  assert.equal(영.원본, 'Original')
})

test('뷰어 꾸러미에 표의 열쇠가 하나도 안 빠진다', () => {
  const 꾸러미 = 뷰어꾸러미('영어')
  assert.deepEqual(Object.keys(뷰어말표).filter((열쇠) => !(열쇠 in 꾸러미)), [])
})


// ── 뷰어 창 ────────────────────────────────────────────────────────

test('뷰어 창을 영어로 그리면 단추도 영어다', async () => {
  const { viewerHtml } = await import('../lib/viewer.js')
  const 게시물 = {
    id: 'AAA', url: 'https://instagram.com/p/AAA', caption: '', author: 'cardnews',
    likes: 10, comments: 2, isCarousel: true, slideCount: 2, kind: 'image',
    slides: [{ url: 'https://x/1.jpg' }, { url: 'https://x/2.jpg' }],
  }
  const 영 = viewerHtml(게시물, (u) => u, { 언어: '영어' })
  for (const 글 of ['Save all ({0})', 'Original', 'More from this account',
                   'No measurements for this slide.', '(no caption)']) {
    assert.ok(영.includes(글), `영어 화면에 「${글}」 이 없다`)
  }
  assert.ok(영.includes('lang="en"'), '쪽 언어 표시도 영어여야 한다')
  // 굳혀 실어 보낸 글 꾸러미에 한국어가 섞이면 안 된다.
  const 처음 = 영.indexOf('const D = ') + 'const D = '.length
  const 끝 = 영.indexOf(';', 처음)
  const 꾸러미 = JSON.parse(영.slice(처음, 끝).split('\u003c').join('<'))
  const 샌것 = Object.entries(꾸러미.말).filter(([, v]) => 한글.test(v))
  assert.deepEqual(샌것, [])
})

test('뷰어 창은 고른 언어가 없으면 한국어로 그린다', async () => {
  const { viewerHtml } = await import('../lib/viewer.js')
  const 게시물 = {
    id: 'AAA', url: 'https://instagram.com/p/AAA', caption: '', author: 'cardnews',
    likes: 10, comments: 2, isCarousel: true, slideCount: 2, kind: 'image',
    slides: [{ url: 'https://x/1.jpg' }],
  }
  const 한 = viewerHtml(게시물, (u) => u)
  assert.ok(한.includes('원본'))
  assert.ok(한.includes('lang="ko"'))
})


// ── 언어 스위치 ────────────────────────────────────────────────────
//
// 사람 지시 2026-09-19: 「수집기에도 언어 스위치 달아줘」. 그 전에는 채팅에만
// 두기로 했었는데(2026-09-18), 수집기를 따로 열면 바꿀 길이 없었다.

test('수집기 화면에도 언어 스위치가 있다', () => {
  const 글 = readFileSync(join(웹, 'board-card-news.html'), 'utf-8')
  assert.match(글, /id="langBtn"/, '스위치가 없으면 수집기만 열었을 때 못 바꾼다')
  // **글자는 HTML 에 안 박는다** — 고른 언어를 타므로 app.js 가 채운다.
  assert.match(글, /<button id="langBtn"[^>]*><\/button>/)
})

test('스위치를 누른 뒤에도 보던 판으로 돌아온다', () => {
  // 언어를 바꾸면 쪽을 다시 불러야 화면이 통째로 바뀐다. 그때 검색 판으로
  // 떨어지면 「눌렀더니 딴 데로 갔다」가 된다.
  const 글 = readFileSync(join(웹, 'app.js'), 'utf-8')
  assert.match(글, /수집기탭/, '보던 판을 안 남기면 되돌아올 수가 없다')
  assert.match(글, /location\.reload\(\)/)
})
