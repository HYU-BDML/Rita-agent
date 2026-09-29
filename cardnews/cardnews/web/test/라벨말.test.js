// 라벨판이 영어로도 되나. **눈으로는 못 잡는 종류라 기계가 센다.**
//
// 사람 지시 2026-09-19: 「영어로 바꾸면 모든 것이 영어로 되어야 한다」.
// 여태 라벨판은 통째로 한국어였다 — `lib/label.js` 에 「언어」라는 낱말이 한
// 번도 안 나왔다. 영어로 채팅을 열면 봇은 영어로 답하는데, 오른쪽에 라벨판이
// 뜨면 거기부터 전부 한국어였다.
//
// **한 자리만 빠뜨려도 거기만 한국어로 뜬다.** 그래서 표를 통째로 훑는다.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { 라벨말, 말하기, 도형말, 도형설명, 손잡이말 } from '../lib/라벨말.js'
import { KINDS, LEVELS, EFFECTS, TREATS, 도형들, 설명서, 상태글 } from '../lib/label.js'
import { 낱말 } from '../lib/수집기말.js'

const WEB = fileURLToPath(new URL('../', import.meta.url))
const 한글 = /[가-힣]/

test('표의 열쇠마다 두 언어가 다 있고 영어에 한글이 없다', () => {
  const 빠진것 = []
  for (const [열쇠, 값] of Object.entries(라벨말)) {
    if (typeof 값.한국어 !== 'function' || typeof 값.영어 !== 'function') {
      빠진것.push(열쇠)
      continue
    }
    if (한글.test(String(값.영어('X', 'Y', 'Z')))) 빠진것.push(`${열쇠}(영어에 한글)`)
    if (!String(값.한국어('X', 'Y', 'Z')).trim()) 빠진것.push(`${열쇠}(한국어가 빔)`)
  }
  assert.deepEqual(빠진것, [])
})

test('저장되는 값마다 영어 낱말이 있다', () => {
  // **값은 한국어 그대로 창고에 간다** — 여기 것은 보여 줄 때만 쓴다.
  // 빠지면 그 단추만 한국어로 뜬다.
  const 빠진것 = []
  for (const [갈래, 값들] of [['종류', KINDS], ['위계', LEVELS],
                            ['효과', EFFECTS], ['처리', TREATS]]) {
    for (const v of 값들) {
      if (한글.test(낱말(갈래, v, '영어'))) 빠진것.push(`${갈래}/${v}`)
    }
  }
  assert.deepEqual(빠진것, [])
})

test('도형 스무 개마다 영어 이름과 설명이 있다', () => {
  const 빠진것 = []
  for (const { 이름, 설명 } of 도형들) {
    if (한글.test(도형말(이름, '영어'))) 빠진것.push(`이름/${이름}`)
    if (설명 && 한글.test(도형설명(이름, '영어'))) 빠진것.push(`설명/${이름}`)
  }
  assert.deepEqual(빠진것, [])
})

test('손잡이 이름마다 영어가 있다', () => {
  const 키들 = new Set()
  for (const 도형 of 도형들) for (const h of 도형.손잡이 || []) 키들.add(h.키)
  const 빠진것 = [...키들].filter((k) => 한글.test(손잡이말(k, '영어')))
  assert.deepEqual(빠진것, [], '캔버스 손잡이 이름이 한국어로 남는다')
})

test('설명서가 영어면 한 줄도 한국어가 안 남는다', () => {
  // **제일 큰 덩어리다.** 다섯 묶음 스물몇 줄인데 한 줄만 빠뜨려도 거기만 한국어다.
  const 남은것 = []
  for (const { 묶음, 줄 } of 설명서('영어')) {
    if (한글.test(묶음)) 남은것.push(`묶음: ${묶음}`)
    for (const [키, 뜻] of 줄) {
      if (한글.test(키)) 남은것.push(`키: ${키}`)
      if (한글.test(뜻)) 남은것.push(`뜻: ${뜻}`)
    }
  }
  assert.deepEqual(남은것, [])
})

test('설명서의 한국어는 옮기기 전 그대로다', () => {
  // **이 일로 한국어 화면이 달라지면 안 된다.** 묶음 이름과 줄 수를 못 박는다.
  const 것 = 설명서('한국어')
  assert.deepEqual(것.map((s) => s.묶음),
    ['네모 그리기', '모양 만들기', '글자', '여러 개 다루기', '장과 마무리'])
  assert.deepEqual(것.map((s) => s.줄.length), [8, 3, 1, 6, 7])
  assert.deepEqual(것[0].줄[0], ['빈 자리를 끈다', '새 네모'])
})

test('상태글이 두 언어로 나온다', () => {
  for (const s of ['분석중', '분석 끝', '분석 실패']) {
    assert.ok(상태글(s, '한국어'), s)
    assert.ok(상태글(s, '영어'), s)
    assert.ok(!한글.test(상태글(s, '영어')), `${s} 가 영어로 안 나온다`)
  }
  // 모르는 상태는 빈 글자 — 단추 글자를 안 건드린다.
  assert.equal(상태글('라벨 끝', '영어'), '')
})

test('모르는 언어는 한국어로 떨어진다', () => {
  // 안 나오는 것보다 한국어로 나오는 편이 낫다 — `언어.js` 와 같은 규칙이다.
  for (const 이상한것 of [null, undefined, 'en', 'English', 42]) {
    assert.equal(말하기(이상한것)('단추_확정'), '확정', String(이상한것))
    assert.equal(도형말('5각별', 이상한것), '5각별')
  }
})

test('label.js 에 화면 글자가 직접 박혀 있지 않다', () => {
  // **표를 만들어 놓고 한 자리를 코드에 남기면 거기만 한국어로 뜬다.**
  // 값 목록·CSS 이름·요소 id 는 화면 글자가 아니라 봐준다.
  const 값들 = new Set([...KINDS, ...LEVELS, ...EFFECTS, ...TREATS,
    '인물', '종류칸', '속성칸', '무대', '조작판', '눌림', '흐린글', '그물', '도형손잡이',
    '세로', '가로', '분석중', '분석 끝', '분석 실패', '시간 초과', '저장',
    ...도형들.map((d) => d.이름),
    ...도형들.flatMap((d) => (d.손잡이 || []).map((h) => h.키)),
    ...['프리텐다드', '원티드산스', '지마켓산스', '에스코어드림', '여기어때잘난체',
      '검은고딕', '배민도현', '나눔스퀘어라운드', '나눔명조'],
  ])
  const 글 = readFileSync(join(WEB, 'lib', 'label.js'), 'utf-8')
  const 남은것 = []
  let 여러줄 = false
  for (const 줄 of 글.split('\n')) {
    const 벗김 = 줄.trim()
    if (여러줄) { if (벗김.includes('*/')) 여러줄 = false; continue }
    if (벗김.startsWith('/*')) { 여러줄 = !벗김.includes('*/'); continue }
    if (벗김.startsWith('//')) continue
    const 민줄 = 줄.replace(/\s\/\/.*$/, '')
    // 글자를 화면에 박는 자리만 본다
    if (!/\.(textContent|placeholder|title|innerHTML)\s*=|\.append\(|new Option\(|fillText\(/.test(민줄)) continue
    // **표를 부르는 자리는 뺀다** — 열쇠 이름(`단추_확정`)도 한국어라 같이 걸린다.
    const 민민줄 = 민줄.replace(/(말하기\([^)]*\)|말|보일낱말|낱말|도형말|도형설명|손잡이말)\([^)]*\)/g, "")
    for (const m
      of 민민줄.matchAll(/'([^'\n]*)'|"([^"\n]*)"/g)) {
      const v = (m[1] ?? m[2] ?? '').trim()
      // `${아이콘[0]}` 처럼 값만 끼우는 자리는 화면 글자가 아니다 — 변수 이름이다.
      if (/^\$\{[^}]*\}$/.test(v)) continue
      if (한글.test(v) && !값들.has(v)) 남은것.push(v)
    }
  }
  assert.deepEqual(남은것, [], `표(\`라벨말.js\`)로 옮겨라:\n${남은것.join('\n')}`)
})

test('label.html 에도 한국어가 직접 박혀 있지 않다', () => {
  const 글 = readFileSync(join(WEB, 'label.html'), 'utf-8')
  const 몸통 = 글.slice(글.indexOf('<body'))
  const 남은것 = []
  for (const m of 몸통.matchAll(/<p>([^<]*)<\/p>/g)) {
    if (한글.test(m[1])) 남은것.push(m[1])
  }
  assert.deepEqual(남은것, [], '`라벨말.js` 로 옮겨라')
  // 쪽 제목도 JS 가 채운다 — 마크업에 박아 두면 영어로 열어도 「라벨링」이다.
  assert.match(글, /document\.title = 말\('쪽제목'\)/)
})
