import { test } from 'node:test'
import assert from 'node:assert/strict'
import { 역할줄, 늘어놓기, 카드, 격자, 한판자리, 원본줄, 칸폭 } from '../lib/templates.js'

const 줄 = (x = {}) => ({
  코드: 'AAA', 이름: '키키 밈체', 장수: 7, 만든날: '2026-08-20',
  역할: { 훅: 1, 사례: 4 }, 나온곳: '분석', ...x,
})

test('역할 세는 칸이 한 줄이 된다', () => {
  assert.equal(역할줄({ 훅: 1, 사례: 4 }), '훅 · 사례×4')
  assert.equal(역할줄({ 훅: 0 }), '', '0 짜리는 없는 것과 같다')
  assert.equal(역할줄(undefined), '')
})

test('새것이 위로 온다', () => {
  const 것들 = 늘어놓기([줄({ 이름: '옛', 만든날: '2026-01-01' }),
    줄({ 이름: '새', 만든날: '2026-08-27' })])
  assert.deepEqual(것들.map((x) => x.이름), ['새', '옛'])
})

test('이름도 코드도 없는 줄은 뺀다', () => {
  assert.equal(늘어놓기([{ 장수: 3 }, null, 줄()]).length, 1)
})

test('카드에 표지 그림이 들어간다', () => {
  const html = 카드(줄({ 미리보기: 'https://x/a.jpg' }))
  assert.match(html, /<img src="https:\/\/x\/a\.jpg"/)
  assert.match(html, /키키 밈체/)
  assert.match(html, /7장 · 훅 · 사례×4/)
})

test('표지가 없으면 그 자리를 메운다', () => {
  const html = 카드(줄())
  assert.match(html, /표지 없음/)
  assert.doesNotMatch(html, /<img/, '빈 src 로 깨진 그림을 띄우면 안 된다')
})

test('이름 복사 단추가 이름을 들고 있다', () => {
  assert.match(카드(줄()), /class="tpl-copy" data-name="키키 밈체"/)
})

test('따옴표가 든 이름이 쪽지를 깨지 않는다', () => {
  const html = 카드(줄({ 이름: '"헉" <b>' }))
  assert.doesNotMatch(html, /<b>/)
  assert.match(html, /&quot;헉&quot;/)
})

test('이름이 없으면 코드로 보여 준다', () => {
  assert.match(카드({ 코드: 'BBB', 장수: 5 }), /BBB/)
})

test('빈 목록이면 무엇을 해야 하는지 적는다', () => {
  const html = 격자([])
  assert.match(html, /분석하기/, '「없음」만 적으면 다음에 뭘 할지 모른다')
  assert.doesNotMatch(html, /tpl-grid/)
})

test('격자에 줄 수만큼 카드가 있다', () => {
  const html = 격자([줄(), 줄({ 코드: 'BBB', 이름: '아기' })])
  assert.equal(html.split('tpl-card').length - 1, 2)
})


// ── 만든 것 ────────────────────────────────────────────────────

import { 만든칸, 만든격자, 목록길, 만든것길, 목록읽기, 만든것읽기 } from '../lib/templates.js'

const 만든 = (x = {}) => ({
  edit_id: 'abc', 주소: 'https://x/판.html', 표지: 'https://x/1.png',
  장수: 7, 제목: '강남 카페 트렌드', 만든날: '2026-08-27T09:00:00Z', ...x,
})

test('목록은 창고가 아니라 워커를 거친다', () => {
  // 브라우저가 딴 집(S3)의 글 파일을 곧장 읽으면 허락이 없어 못 읽는다 —
  // 화면이 텅 비어 보이던 진짜 까닭이 이것이었다(2026-08-27).
  for (const 길 of [목록길, 만든것길]) {
    assert.match(길, /^\/api\//, '우리 집 주소여야 한다')
    assert.doesNotMatch(길, /^https?:/)
  }
})

test('누르면 작업대가 열린다', () => {
  const html = 만든칸(만든())
  assert.match(html, /<a class="tpl-card" href="https:\/\/x\/판\.html"/)
  assert.match(html, /target="_blank"/)
})

test('표지와 제목이 보인다', () => {
  const html = 만든칸(만든())
  assert.match(html, /<img src="https:\/\/x\/1\.png"/)
  assert.match(html, /강남 카페 트렌드/)
  assert.match(html, /7장/)
})

test('만든날은 날짜까지만 보여 준다', () => {
  assert.match(만든칸(만든()), /2026-08-27/)
  assert.doesNotMatch(만든칸(만든()), /T09:00/)
})

test('글 없는 카드뉴스도 알아볼 수 있다', () => {
  assert.match(만든칸(만든({ 제목: '' })), /글 없는 카드뉴스/)
})

test('표지가 없으면 그 자리를 메운다', () => {
  const html = 만든칸(만든({ 표지: '' }))
  assert.match(html, /표지 없음/)
  assert.doesNotMatch(html, /<img/)
})

test('제목의 서식 글자가 쪽지를 못 깬다', () => {
  const html = 만든칸(만든({ 제목: '<b>굵게</b>' }))
  assert.doesNotMatch(html, /<b>/)
})

test('비었으면 다음에 뭘 할지 적는다', () => {
  // 화면에서 「틀」을 「템플릿」으로 바꾼 뒤(사람 지시 2026-09-19) 이 말도 같이 바뀌었다.
  const html = 만든격자([])
  assert.match(html, /템플릿/)
  assert.doesNotMatch(html, /tpl-grid/)
})

test('주소 없는 줄은 뺀다', () => {
  assert.equal(만든격자([만든(), { edit_id: 'x' }]).split('tpl-card').length - 1, 1)
})

test('틀 카드에 이름 바꾸기가 있다', () => {
  const html = 카드(줄())
  assert.match(html, /class="tpl-rename" data-code="AAA"/)
})

test('안 들어왔을 때는 할 일을 적어 준다', async () => {
  // 401 은 탈이 아니라 «아직 안 들어왔다» 는 뜻이다.
  const 가짜 = async () => ({ status: 401, ok: false })
  await assert.rejects(목록읽기(가짜), /암호/)
  await assert.rejects(만든것읽기(가짜), /암호/)
})

test('만든 것이 아직 없으면 빈 목록이다', async () => {
  const 가짜 = async () => ({ status: 404, ok: false })
  assert.deepEqual(await 만든것읽기(가짜), [])
})


// ── 만들기 칸 ──────────────────────────────────────────────────

import { 말투칸, 만들기칸, 만든결과, 말투길 } from '../lib/templates.js'

test('말투 목록도 워커를 거친다', () => {
  assert.match(말투길, /^\/api\//)
})

test('말투 첫 줄은 「이 디자인 그대로」다', () => {
  const html = 말투칸([])
  assert.match(html, /value=""[^>]*>이 디자인 그대로/)
})

test('말투마다 설명이 같이 뜬다', () => {
  // 「명사형·중간」 같은 낱말만으로는 못 고른다 — 한 줄 설명이 붙어야 한다.
  const html = 말투칸([{ 이름: '키키', 설명: '명사형 · 중간 · 재미 낮음' }])
  assert.match(html, /키키 — 명사형 · 중간 · 재미 낮음/)
})

test('이름 없는 말투는 뺀다', () => {
  assert.equal(말투칸([{ 설명: 'ㅋ' }]).split('<option').length - 1, 1)
})

test('만들기 칸에 고를 것 넷이 있다', () => {
  const html = 만들기칸('키키', [])
  assert.match(html, /「키키」 로 만들기/)      // 디자인 — 이미 정해짐
  assert.match(html, /id="makeTone"/)          // 말투
  assert.match(html, /id="makeTopic"/)         // 주제
  assert.match(html, /id="makeScript"/)        // 원고
})

test('원고는 비워도 된다고 적어 준다', () => {
  assert.match(만들기칸('키키', []), /비우면 AI 가 씁니다/)
})

test('틀 카드에 「이 틀로 만들기」가 있다', () => {
  assert.match(카드(줄()), /class="tpl-make" data-name="키키 밈체"/)
})

test('다 되면 표지와 작업대 링크가 뜬다', () => {
  const html = 만든결과({
    content: '7장을 만들었습니다',
    components: [
      { type: 'image', url: 'https://x/1.png', alt: '표지' },
      { type: 'link', url: 'https://x/판.html', label: '작업대에서 고치기' },
    ],
  })
  assert.match(html, /<img src="https:\/\/x\/1\.png"/)
  assert.match(html, /href="https:\/\/x\/판\.html"/)
  assert.match(html, /7장을 만들었습니다/)
})

test('칸이 없어도 안 깨진다', () => {
  assert.doesNotThrow(() => 만든결과({}))
  assert.doesNotThrow(() => 만든결과(null))
})


// ── 틀 들여다보기 ──────────────────────────────────────────────

import { 틀장, 틀그림, 틀길 } from '../lib/templates.js'

const 장 = (x = {}) => ({
  index: 2, 역할: '사례', 배경: { 종류: '단색', hex: '#FFFFFF' },
  장식영역: [{ 종류: '도형', box: [67, 89, 1029, 213], 채움색: '#010301' },
           { 종류: '사진', box: [231, 253, 836, 599] }],
  글자슬롯: [{ box: [235, 89, 861, 213], pt: 40, 위계: '제목', 최소: 19, 최대: 28, 줄수: 1 }],
  ...x,
})

test('틀 하나도 워커를 거친다', () => {
  assert.match(틀길('AAA'), /^\/api\/template\/AAA$/)
})

test('도형은 잰 색 그대로 칠한다', () => {
  // 그게 그 디자인의 알맹이다 — 검은 알약은 검게 보여야 한다.
  assert.match(틀장(장(), { w: 1080, h: 1350 }), /background:#010301/)
})

test('자리를 몫으로 잡는다', () => {
  // 픽셀로 잡으면 칸 크기가 달라질 때 어긋난다.
  const html = 틀장(장(), { w: 1080, h: 1350 })
  assert.match(html, /left:6\.\d+%/)
  assert.doesNotMatch(html, /left:67px/)
})

test('글자 자리에 위계와 자수가 적힌다', () => {
  const html = 틀장(장(), { w: 1080, h: 1350 })
  assert.match(html, /제목/)
  assert.match(html, /40pt/)
  assert.match(html, /19~28자/)
})

test('여러 줄이면 줄 수도 적는다', () => {
  const html = 틀장(장({ 글자슬롯: [{ box: [122, 332, 993, 1228], pt: 47, 위계: '본문', 최소: 15, 최대: 22, 줄수: 11 }] }),
    { w: 1080, h: 1350 })
  assert.match(html, /11줄/)
})

test('그라데이션 배경도 그린다', () => {
  const html = 틀장(장({ 배경: { 종류: '그라데이션', 띠: '#FEFEFE@0% → #3C3C3C@100%' } }),
    { w: 1080, h: 1350 })
  assert.match(html, /linear-gradient/)
})

test('장이 없으면 그렇게 말한다', () => {
  assert.match(틀그림({ 슬라이드: [] }, '빈 틀'), /장이 없습니다/)
})

test('그림에 장 수와 안내가 있다', () => {
  const html = 틀그림({ 캔버스: { w: 1080, h: 1350 }, 슬라이드: [장(), 장()] }, '키키')
  assert.match(html, /「키키」 — 2장/)
  assert.match(html, /점선은 글자 자리/)
})

test('틀 카드에 「자세히 보기」가 있다', () => {
  assert.match(카드(줄()), /class="tpl-peek" data-code="AAA"/)
})

// ── 원본 게시물 ────────────────────────────────────────────────────
//
// 사람 결정 2026-09-19: 「템플릿 클릭하면 지금 템플릿만 뜨는데 실제 원본
// 그리고 밑에 템플릿 이렇게 하고싶은데」. 설계도만 보면 무슨 결인지 모른다 —
// 원본을 봐야 이름이 무슨 뜻인지 바로 안다.

test('원본이 있으면 설계도 위에 원본 사진이 먼저 온다', () => {
  const html = 틀그림({ 한판: 'https://x/sheets/AAA.jpg', 캔버스: { w: 1080, h: 1350 },
    슬라이드: [장(), 장()] }, '키키')
  assert.match(html, /class="pk-원본줄"/)
  assert.ok(html.indexOf('pk-원본줄') < html.indexOf('pk-줄'), '원본이 설계도보다 뒤에 있다')
  assert.match(html, /https:\/\/x\/sheets\/AAA\.jpg/)
  // 장마다 한 칸 — 설계도 칸과 수가 같아야 위아래가 짝이 맞는다
  assert.equal((html.match(/class="pk-원장"/g) || []).length, 2)
  assert.equal((html.match(/class="pk-장"/g) || []).length, 2)
})

test('원본은 한 장짜리 이어 붙인 그림을 쓴다 — 낱장을 따로 안 부른다', () => {
  // **실측 2026-09-19.** 낱장을 부르니 한 장에 220KB, 일곱 장이면 1.5MB 라
  // 다 뜨는 데 10초가 걸렸다. 「한판」은 일곱 장을 이어 붙인 것이고 105KB 다.
  const html = 틀그림({ 한판: 'https://x/sheets/AAA.jpg', 코드: 'AAA',
    캔버스: { w: 1080, h: 1350 }, 슬라이드: [장(), 장()] }, '키키')
  assert.ok(!html.includes('/f/AAA/01.jpg'), '아직 낱장을 부른다')
  assert.equal((html.match(/pk-원본/g) || []).length, 1)
})

test('한판이 없으면 설계도만 보여 준다', () => {
  // 작업대에서 뽑은 틀은 원본 게시물이 없다 — 한판도 없다.
  const html = 틀그림({ 캔버스: { w: 1080, h: 1350 }, 슬라이드: [장()] }, '손으로 만든 것')
  assert.ok(!html.includes('pk-원본'))
  assert.match(html, /pk-줄/)
})

test('한판 주소가 http 가 아니면 안 싣는다', () => {
  // iframe·img 에 끼우는 주소다 — `javascript:` 가 오면 우리 집 안에서 돈다.
  const html = 틀그림({ 한판: 'javascript:alert(1)', 캔버스: { w: 1080, h: 1350 },
    슬라이드: [장()] }, '이상한 것')
  assert.ok(!html.includes('javascript:'))
  assert.ok(!html.includes('pk-원본'))
})

test('색을 못 잰 도형은 그림에서도 안 그린다', () => {
  // 굽는 쪽이 안 그리는 것을 여기서만 그리면 그림과 결과가 어긋난다.
  const html = 틀장(장({ 장식영역: [
    { 종류: '도형', box: [67, 89, 1029, 213], 채움색: '#010301' },
    { 종류: '도형', box: [64, 91, 1026, 214] },
  ] }), { w: 1080, h: 1350 })
  assert.equal(html.split('pk-칸').length - 1, 1)
  assert.match(html, /#010301/)
})

test('사진 자리는 색이 없어도 그린다', () => {
  // 도형과 달리 «여기에 사진이 들어올 것이다» 는 뜻이라 보여 줘야 한다.
  const html = 틀장(장({ 장식영역: [{ 종류: '사진', box: [0, 0, 100, 100] }] }),
    { w: 1080, h: 1350 })
  assert.equal(html.split('pk-칸').length - 1, 1)
})


// ── 단추와 손잡이 ──────────────────────────────────────────────
//
// **이 시험이 왜 있나.** 「자세히 보기」 단추를 그려 놓고 app.js 에 손잡이를
// 안 달아서, 눌러도 아무 일이 없었다(2026-08-27 사람이 알려 줬다). 단추는
// 보이니까 다 된 것처럼 보이고, 시험은 다 초록이었다.
//
// 그리는 쪽과 받는 쪽이 다른 파일이라 각각은 멀쩡했다. 둘을 견줘야 잡힌다.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

test('그린 단추마다 손잡이가 있다', () => {
  const 앱 = readFileSync(fileURLToPath(new URL('../app.js', import.meta.url)), 'utf8')
  const 그린것 = new Set()
  for (const html of [카드(줄()), 만들기칸('키키', []), 만든칸(만든())]) {
    // **단추만 본다.** tpl-card 같은 담는 칸은 눌리는 것이 아니다.
    for (const m of html.matchAll(/<button class="(tpl-[a-z]+)"/g)) 그린것.add(m[1])
    for (const m of html.matchAll(/id="(make[A-Za-z]+)"/g)) 그린것.add(m[1])
  }
  assert.ok(그린것.size >= 4, '견줄 단추가 있어야 한다')
  for (const 이름 of 그린것) {
    assert.ok(앱.includes(이름), `${이름} 를 그리는데 app.js 가 안 받는다`)
  }
})

test('넉넉한 자리에는 이름을 적는다', () => {
  const html = 틀장(장(), { w: 1080, h: 1350 })
  assert.match(html, /<i>도형<\/i>/)
  assert.match(html, /<i>사진<\/i>/)
})

test('좁은 자리에는 안 적는다', () => {
  // 8px 글자도 안 들어가는 칸에 욱여넣으면 삐져나와 옆 칸을 덮는다.
  const html = 틀장(장({ 장식영역: [{ 종류: '로고', box: [0, 0, 40, 40] }] }),
    { w: 1080, h: 1350 })
  assert.doesNotMatch(html, /<i>/)
  assert.match(html, /title="로고"/, '못 적어도 올리면 뜨게 남긴다')
})

test('어두운 도형에는 밝은 글씨를 쓴다', () => {
  // 검은 알약에 검은 글씨를 쓰면 안 보인다.
  const 어둠 = 틀장(장({ 장식영역: [{ 종류: '도형', box: [0, 0, 900, 300], 채움색: '#010301' }] }),
    { w: 1080, h: 1350 })
  assert.match(어둠, /color:rgba\(255,255,255/)
  const 밝음 = 틀장(장({ 장식영역: [{ 종류: '도형', box: [0, 0, 900, 300], 채움색: '#F5F5F5' }] }),
    { w: 1080, h: 1350 })
  assert.match(밝음, /color:rgba\(0,0,0/)
})

test('좁은 글자 자리도 올리면 무엇인지 뜬다', () => {
  const html = 틀장(장({ 글자슬롯: [{ box: [0, 0, 40, 40], pt: 20, 위계: '꼬리표', 최소: 3, 최대: 8 }] }),
    { w: 1080, h: 1350 })
  assert.match(html, /title="꼬리표 · 20pt · 3~8자"/)
})


// ── 영어로 그릴 때 ─────────────────────────────────────────────────
//
// **화면에 거는 글자와 서버로 가는 값은 다르다.** 단추에 실린 이름은 서버가
// 템플릿을 찾는 열쇠라 창고에 적힌 그대로여야 한다 — 영어 이름으로 바꿔 보내면
// 「그런 템플릿 없다」가 된다.

test('영어로 그리면 단추 글자가 영어다', () => {
  const html = 카드(줄(), '영어')
  assert.match(html, /Make with this/)
  assert.match(html, /Copy name/)
  assert.match(html, /Rename/)
  assert.match(html, /Look inside/)
})

test('영어로 그려도 단추에 싣는 이름은 창고에 적힌 그대로다', () => {
  const html = 카드(줄({ 이름영어: 'Kiki Meme' }), '영어')
  assert.match(html, /data-name="키키 밈체"/, '이 값으로 서버가 템플릿을 찾는다')
  assert.doesNotMatch(html, /data-name="Kiki Meme"/)
})

test('영어 이름이 창고에 있으면 그것을 보여 준다', () => {
  const html = 카드(줄({ 이름영어: 'Kiki Meme' }), '영어')
  assert.match(html, /<div class="tpl-name">Kiki Meme<\/div>/)
})

test('영어 이름이 없으면 한국어 이름을 그대로 보여 준다', () => {
  // 빈 칸으로 두면 무엇인지 아예 못 본다. 못 옮긴 것보다 나쁘다.
  const html = 카드(줄(), '영어')
  assert.match(html, /<div class="tpl-name">키키 밈체<\/div>/)
})

test('역할 낱말도 영어로 바뀐다', () => {
  assert.equal(역할줄({ 훅: 1, 사례: 4 }, '영어'), 'Hook · Example×4')
})

test('모르는 역할 낱말은 그대로 둔다', () => {
  // 창고에서 오는 값이라 새 낱말이 언제든 들어온다.
  assert.equal(역할줄({ 반전: 1 }, '영어'), '반전')
})

test('빈 격자 안내도 영어가 된다', () => {
  assert.match(격자([], '영어'), /Analyze/)
  assert.doesNotMatch(격자([], '영어'), /[가-힣]/)
})

test('설계도의 자리 이름도 영어가 된다', () => {
  const html = 틀장(장({ 장식영역: [{ 종류: '사진', box: [0, 0, 600, 600] }] }),
    { w: 1080, h: 1350 }, '영어')
  assert.match(html, /<i>Photo<\/i>/)
  assert.match(html, /title="Photo"/)
})

test('글자 자리 설명도 영어가 된다', () => {
  const html = 틀장(장({ 글자슬롯: [{ box: [0, 0, 900, 300], pt: 47, 위계: '본문', 최소: 15, 최대: 22 }] }),
    { w: 1080, h: 1350 }, '영어')
  assert.match(html, /<b>Body<\/b>/)
  assert.match(html, /47pt · 15–22 chars/)
})

test('만들기 칸도 영어가 된다', () => {
  const html = 만들기칸('키키 밈체', [], '영어')
  assert.match(html, /Topic/)
  assert.match(html, /Voice/)
  assert.match(html, /Same as this design/)
  assert.match(html, /the AI writes it/)
})

// ── 「한판」 자르기 ────────────────────────────────────────────────────────
//
// **아래 숫자는 `analyze/lambda_분석.py` 를 그대로 돌려서 얻은 값이다.**
// 저쪽 규칙이 바뀌면 여기가 빨개진다 — 그때 둘을 같이 고쳐야 한다. 안 그러면
// 원본 그림이 한 칸씩 밀려, 3번 장 자리에 4번 장이 보이는 식이 된다.
test('한판 자르는 자리가 파이썬이 붙인 자리와 같다', () => {
  assert.deepEqual(한판자리(7, 1080, 1350), {
    판폭: 1728, 판높이: 608, 칸높이: 300,
    자리: [[0, 154], [248, 154], [496, 154], [744, 154], [992, 154], [1240, 154], [1488, 154]],
  })
  // 8장은 4칸 2줄이 이긴다 — 한 줄로 늘어놓으면 장이 더 작아 보인다
  assert.deepEqual(한판자리(8, 1080, 1350), {
    판폭: 1727, 판높이: 608, 칸높이: 300,
    자리: [[371, 0], [619, 0], [867, 0], [1115, 0],
      [371, 308], [619, 308], [867, 308], [1115, 308]],
  })
  assert.deepEqual(한판자리(16, 1080, 1350).자리[8], [0, 352], '둘째 줄 첫 장')
  assert.deepEqual(한판자리(1, 1080, 1080), { 판폭: 682, 판높이: 240, 칸높이: 240, 자리: [[221, 0]] })
  assert.deepEqual(한판자리(5, 1080, 1920).자리[0], [0, 3], '세로로 긴 장')
  assert.deepEqual(한판자리(3, 1080, 1350).자리, [[58, 0], [306, 0], [554, 0]])
})

test('장수나 크기가 이상하면 안 자른다', () => {
  for (const [n, w, h] of [[0, 1080, 1350], [7, 0, 1350], [7, 1080, 0]]) {
    assert.equal(한판자리(n, w, h), null, `${n}/${w}x${h}`)
  }
})

test('원본줄은 설계도와 같은 폭으로 장마다 한 칸씩 낸다', () => {
  const h = 원본줄('https://x.test/한판.jpg', '한국어', 7, { w: 1080, h: 1350 })
  assert.equal((h.match(/class="pk-원장"/g) || []).length, 7)
  assert.match(h, /class="pk-원본줄"/)
  // **숫자를 손으로 안 적는다** — `칸폭` 을 바꾸면 이 시험만 빨개져서 고치게 된다.
  // 한판 픽셀(판 1728×608, 칸높이 300, 첫 장 [0,154])에 배율을 곱한 값이다.
  const 배 = 칸폭 / 240
  const 자 = (v) => (v * 배).toFixed(1).replace('.', '\\.')
  assert.match(h, new RegExp(`background-size:${자(1728)}px ${자(608)}px`))
  assert.match(h, new RegExp(`background-position:-${자(0)}px -${자(154)}px`))
  assert.match(h, new RegExp(`height:${자(300)}px`))
  // 둘째 칸은 한판에서 248px 오른쪽에 있다
  assert.match(h, new RegExp(`background-position:-${자(248)}px`))
})

test('주소가 http 가 아니면 아무것도 안 낸다', () => {
  assert.equal(원본줄('javascript:alert(1)', '한국어', 7, { w: 1080, h: 1350 }), '')
  assert.equal(원본줄('', '한국어', 7, { w: 1080, h: 1350 }), '')
})

test('짜임새를 못 셈하면 옛 모양으로 통째로 깐다', () => {
  const h = 원본줄('https://x.test/한판.jpg', '한국어', 0, null)
  assert.match(h, /class="pk-원본"/)
  assert.match(h, /<img /)
})

test('칸 폭이 두 화면의 CSS 와 같다 — 어긋나면 위아래 크기가 안 맞는다', async () => {
  // 원본은 `칸폭` 으로 잘리고 설계도는 CSS 의 width 로 그려진다. 값이 갈리면
  // 사람이 바로 본다(2026-09-19: 「위에는 원본 아래는 템플릿이잖아 크기 맞춰야지」).
  const { readFileSync, readdirSync } = await import('node:fs')
  const { fileURLToPath } = await import('node:url')
  // **화면 파일 이름을 여기 적지 않는다** — 다른 시험이 그걸 막는다(chat-ui).
  const 터 = fileURLToPath(new URL('../', import.meta.url))
  const 쪽들 = readdirSync(터).filter((n) => n.endsWith('.html'))
  let 본것 = 0
  for (const 이름 of 쪽들) {
    const html = readFileSync(터 + 이름, 'utf8')
    if (!html.includes('.pk-장 {')) continue
    본것 += 1
    for (const 골 of ['.pk-원장', '.pk-장', '.pk-판']) {
      const m = new RegExp('\\' + 골 + ' \\{[^}]*?width:(\\d+)px').exec(html)
      assert.ok(m, `${이름} 에 ${골} 의 width 가 없다`)
      assert.equal(Number(m[1]), 칸폭, `${이름} 의 ${골}`)
    }
  }
  assert.ok(본것 >= 2, `설계도를 그리는 화면을 ${본것}개만 찾았다`)
})

test('설계도 판은 그 틀의 캔버스 비율을 쓴다 — CSS 의 4:5 가 아니라', () => {
  assert.match(틀장(장(), { w: 1080, h: 1440 }, '한국어'), /aspect-ratio:1080\/1440/)
  assert.match(틀장(장(), { w: 1080, h: 1350 }, '한국어'), /aspect-ratio:1080\/1350/)
})
