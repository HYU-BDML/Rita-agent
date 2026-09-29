import { test } from 'node:test'
import assert from 'node:assert/strict'
import { 부드러운값, 말칸html, 틀카드html, 오른쪽주소, 일끝처리, 분석알림, 사진띠html,
  언어표, 쓸언어, 다음언어, 새대화상태, 새대화말, 화면말, 고르기html, 엔터로보내나, 사진꽂을것,
  라벨예시html, 라벨예시목록, 사용법줄, 생각중html, 뼈대html,
  사진쓰임값, 사진쓰임단추, 사진쓰임적기, 바람값, 화풍카드html, 복원카드html } from '../lib/chat.js'
import { KINDS } from '../lib/label.js'
import { 화풍목록 } from '../lib/화풍.js'

// ── 언어 ───────────────────────────────────────────────────────────

test('화면 글자와 서버로 가는 값은 다르다 — 값은 파이썬과 글자까지 같아야 한다', () => {
  // `dify/프롬프트.py` 의 한국어·영어 와 한 글자라도 어긋나면 람다가 조용히
  // 한국어로 떨어뜨린다. 카드는 나오고 한국어일 뿐이라 눈으로 못 잡는다.
  assert.deepEqual(언어표.map((x) => x.값), ['한국어', '영어'])
  assert.deepEqual(언어표.map((x) => x.보임), ['한국어', 'English'])
})

test('저장된 것이 없거나 이상하면 한국어다', () => {
  assert.equal(쓸언어('영어'), '영어')
  assert.equal(쓸언어('한국어'), '한국어')
  assert.equal(쓸언어(null), '한국어')
  assert.equal(쓸언어('English'), '한국어')
  assert.equal(쓸언어(42), '한국어')
})

// ── 새 대화 ────────────────────────────────────────────────────────

test('새 대화는 지우지 않고 그냥 새로 시작한다', () => {
  // **옛 대화를 지우지 않는다.** 지우면 되돌릴 수 없다. 화면에서 손을 떼고
  // 새 번호로 시작할 뿐이라, 주소에 ?c=옛번호 를 넣으면 다시 열린다.
  assert.deepEqual(새대화상태(), {
    대화: '', 상태: { 틀: null, 지켜보기: null, 오른쪽: null, 일: null, 구울것: null, 사진들: [] },
  })
})

test('새 대화 단추 글자도 고른 언어를 탄다', () => {
  assert.equal(새대화말('한국어'), '새 대화')
  assert.equal(새대화말('영어'), 'New chat')
  assert.equal(새대화말(), '새 대화')
})

test('봇에게 한국어 글자를 직접 넘기는 자리가 없다', async () => {
  // **표를 순회하는 시험은 이걸 구조적으로 못 잡는다** — 표에 «안 들어온»
  // 문장이 문제이기 때문이다. 2026-09-18 검토에서 그런 대사 넷이 남아 있었다.
  // 그래서 소스를 직접 읽어 «적기/봇적기에 한글 리터럴을 넘기는가» 를 본다.
  const { readFile } = await import('node:fs/promises')
  const 소스 = await readFile(new URL('../lib/chat.js', import.meta.url), 'utf8')
  const 걸린것 = []
  for (const 줄 of 소스.split('\n')) {
    if (줄.trim().startsWith('//')) continue
    if (/(봇적기|적기)\s*\(\s*(`[^`]*[가-힣]|'[^']*[가-힣]|"[^"]*[가-힣])/.test(줄)) 걸린것.push(줄.trim())
  }
  assert.deepEqual(걸린것, [], `화면말 표로 옮겨라:\n${걸린것.join('\n')}`)
})

test('영어면 분석 알림도 영어로 나온다', () => {
  assert.ok(!/[가-힣]/.test(분석알림('분석중', '영어')), 분석알림('분석중', '영어'))
  assert.ok(!/[가-힣]/.test(분석알림('분석 끝', '영어')))
  assert.ok(!/[가-힣]/.test(분석알림('분석 실패', '영어')))
  // 들어오는 «상태» 값은 파이썬이 보내는 한국어 그대로다 — 그건 안 바꾼다.
  assert.equal(분석알림('모르는 상태', '영어'), '')
})

test('분석 알림은 아무 말 없으면 한국어 그대로다', () => {
  assert.equal(분석알림('분석중'), '분석 시작했어요 (1~2분)')
  assert.equal(분석알림('분석중'), 분석알림('분석중', '한국어'))
})

test('영어면 일이 실패했을 때도 영어로 말한다', () => {
  // 봉투에 실패 사유가 실려 오면 그건 그대로 보여 준다(람다가 쓴 말이다).
  // 사유가 없을 때 우리가 채우는 문장만 언어를 탄다.
  const r = 일끝처리('만들기', { status: 'failed' }, '영어')
  assert.ok(!/[가-힣]/.test(r.말), r.말)
})

test('영어면 작업대 링크 딱지도 영어다', () => {
  // 주소에 한글이 없는 것을 쓴다 — 실제 작업대 주소는 「판.html」이라
  // 한글이 섞이는데, 그건 주소지 우리가 쓴 말이 아니다.
  const 봉투 = { status: 'succeeded',
    result: { content: 'Done.', components: [{ type: 'link', url: 'https://x/board.html' }] } }
  const r = 일끝처리('만들기', 봉투, '영어')
  assert.ok(!/[가-힣]/.test(r.말), r.말)
  // **주소는 글에 안 찍는다**(2026-09-24). 오른쪽 칸에 작업대가 그대로 뜨고
  // 「크게 열기」로 새 탭도 된다 — 긴 주소를 글에 또 적으면 말풍선을 채운다.
  assert.ok(!r.말.includes('https://x/board.html'), r.말)
  assert.equal(r.오른쪽.주소, 'https://x/board.html', '오른쪽에도 안 열면 못 본다')
})

test('단추를 누르면 둘 사이를 오간다', () => {
  assert.equal(다음언어('한국어'), '영어')
  assert.equal(다음언어('영어'), '한국어')
  assert.equal(다음언어('엉뚱한 것'), '영어', '모르는 값에서 눌러도 영어로 간다')
})

test('말칸 — 글자를 이스케이프하고 줄바꿈을 br 로', () => {
  const h = 말칸html({ 역할: '봇', 말: '<b>안녕</b>\n둘째' })
  assert.ok(h.includes('class="msg 봇"'))
  assert.ok(h.includes('&lt;b&gt;안녕&lt;/b&gt;<br>둘째'))
})

test('틀카드 — 코드가 data-code 에, 그림이 없으면 «표지 없음»', () => {
  const h = 틀카드html([{ 코드: 'A', 이름: '키키', 표지: 'https://x/a.jpg' }, { 코드: 'B', 이름: '<x>', 표지: '' }])
  assert.ok(h.includes('data-code="A"'))
  assert.ok(h.includes('src="https://x/a.jpg"'))
  assert.ok(h.includes('&lt;x&gt;'))
  assert.ok(h.includes('표지 없음'))
  assert.ok(!h.includes('board-card-news'))
})

// 사람 결정 2026-09-16: 틀 카드는 오른쪽 칸에만 — 채팅에 또 그리면 두 벌이다.
test('말칸은 틀카드가 딸려 와도 그리지 않는다 — 오른쪽 칸 몫이다', () => {
  const h = 말칸html({ 역할: '봇', 말: '골라요', 틀카드: [{ 코드: 'A', 이름: '키키', 표지: '' }] })
  assert.ok(!h.includes('data-code="A"'))
  assert.ok(h.includes('골라요'))
})

test('오른쪽주소 — 라벨판·작업대만 주소가 있다', () => {
  assert.equal(오른쪽주소({ 종류: '라벨판', 코드: 'DHq_1' }), '/label.html?id=DHq_1')
  assert.equal(오른쪽주소({ 종류: '작업대', 주소: 'https://s3/viewer/x.html' }), 'https://s3/viewer/x.html')
  assert.equal(오른쪽주소({ 종류: '틀', 코드: 'A' }), '')
  assert.equal(오른쪽주소(null), '')
})

test('오른쪽주소 — 작업대는 http(s) 주소만 받는다', () => {
  assert.equal(오른쪽주소({ 종류: '작업대', 주소: 'javascript:alert(1)' }), '')
  assert.equal(오른쪽주소({ 종류: '작업대', 주소: 'https://s3/viewer/x.html' }), 'https://s3/viewer/x.html')
})

test('일끝처리 — 담김이 끝나면 링크에서 코드를 꺼내 라벨판을 연다', () => {
  const r = 일끝처리('담김', { status: 'succeeded', result: { content: '게시물을 담았습니다 — 7장.',
    components: [{ type: 'link', url: 'https://cardnews.x/label.html?id=DHqCBQnRAjW&n=7', label: '라벨하러 가기' }] } })
  assert.equal(r.말, '게시물을 담았습니다 — 7장.')
  assert.deepEqual(r.오른쪽, { 종류: '라벨판', 코드: 'DHqCBQnRAjW' })
  assert.equal(r.코드, 'DHqCBQnRAjW')
})

test('일끝처리 — 담김이 물러섰으면(링크에 id 가 없으면) 말만 적는다', () => {
  const r = 일끝처리('담김', { status: 'succeeded', result: { content: '오늘 담기는 20건까지입니다.',
    components: [{ type: 'link', url: 'https://cardnews.x/', label: '웹에서 담고 라벨하기' }] } })
  assert.equal(r.말, '오늘 담기는 20건까지입니다.')
  assert.equal(r.오른쪽, undefined)
})

test('일끝처리 — 만들기가 끝나면 작업대를 연다', () => {
  const r = 일끝처리('만들기', { status: 'succeeded', result: { content: '7장을 만들었습니다.',
    components: [{ type: 'image', url: 'https://s3/c.png', alt: '표지' }, { type: 'link', url: 'https://s3/viewer/x.html', label: '작업대에서 고치기' }] } })
  assert.ok(r.말.includes('7장을 만들었습니다.'))
  // 주소는 글에 안 찍고 **오른쪽 칸으로만** 낸다(2026-09-24).
  assert.ok(!r.말.includes('https://s3/viewer/x.html'), r.말)
  assert.deepEqual(r.오른쪽, { 종류: '작업대', 주소: 'https://s3/viewer/x.html' })
})

test('일끝처리 — 실패면 그 이유', () => {
  const r = 일끝처리('만들기', { status: 'failed', error: { code: 'x', message: '그런 말투가 없습니다' } })
  assert.equal(r.말, '그런 말투가 없습니다')
  assert.equal(r.오른쪽, undefined)
})

test('분석알림 — 셋만 말이 된다', () => {
  assert.equal(분석알림('분석중'), '분석 시작했어요 (1~2분)')
  assert.match(분석알림('분석 끝'), /만들까요/)
  assert.match(분석알림('분석 실패'), /실패/)
  assert.equal(분석알림('라벨 끝'), '')
})

import { readFileSync, readdirSync, statSync, writeFileSync, unlinkSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const WEB = fileURLToPath(new URL('../', import.meta.url))

test('index.html 은 채팅 페이지다 — 왼쪽 채팅, 오른쪽 칸, 새 창 링크', () => {
  const html = readFileSync(join(WEB, 'index.html'), 'utf8')
  assert.ok(html.includes('<title>카드뉴스 에이전트</title>'))
  for (const id of ['id="chat"', 'id="msgs"', 'id="say"', 'id="send"', 'id="pane"', 'id="paneOpen"', 'id="paneBack"', 'id="split"']) {
    assert.ok(html.includes(id), `${id} 가 없다`)
  }
  assert.ok(html.includes("import { mount } from './lib/chat.js'"))
})

// **링크 미리보기는 정적 HTML 에만 있다**(사람 지시 2026-09-20: 「밋밋해 …
// 이미지가 없어」). 메신저 크롤러는 스크립트를 안 돌리니 `chat.js` 가 갈아
// 끼우는 제목은 못 본다. 여기 없으면 「여기를 눌러 링크를 확인하세요」로 돌아간다.
test('index.html 이 링크 미리보기 정보를 들고 있다', () => {
  const html = readFileSync(join(WEB, 'index.html'), 'utf8')
  for (const t of ['og:title', 'og:description', 'og:image', 'og:url',
                   'twitter:card', 'name="description"']) {
    assert.ok(html.includes(t), `${t} 가 없다`)
  }
  // 그림 주소는 절대 주소라야 한다 — 상대 주소를 못 읽는 데가 있다.
  assert.ok(html.includes('content="https://cardnews.david112702.workers.dev/og.jpg"'))
  // 그림 파일이 실제로 있어야 한다. 주소만 적고 파일이 없으면 미리보기가 빈다.
  for (const f of ['og.jpg', 'og-square.jpg']) {
    assert.ok(existsSync(join(WEB, f)), `${f} 가 없다`)
  }
})

test('index.html 의 module 스크립트에 문법 오류가 없다', () => {
  const html = readFileSync(join(WEB, 'index.html'), 'utf8')
  const m = html.match(/<script type="module">([\s\S]*?)<\/script>/)
  assert.ok(m)
  const tmp = join(tmpdir(), `chat-html-check-${process.pid}-${Date.now()}.mjs`)
  writeFileSync(tmp, m[1])
  try { execFileSync(process.execPath, ['--check', tmp]) } finally { unlinkSync(tmp) }
})

test('수집기는 board-card-news.html 이고, 그 이름은 어디에도 안 적혀 있다', () => {
  assert.ok(statSync(join(WEB, 'board-card-news.html')).isFile())
  const 훑기 = (dir) => readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return n === 'test' ? [] : 훑기(p)
    return /\.(html|js|md)$/.test(n) ? [p] : []
  })
  for (const p of 훑기(WEB)) {
    if (p.endsWith('board-card-news.html')) continue
    assert.ok(!readFileSync(p, 'utf8').includes('board-card-news'), `${p} 에 수집기 이름이 있다`)
  }
})


// ── 채팅 화면에 한국어가 박혀 있지 않나 ────────────────────────────
//
// 실물 2026-09-19: 영어로 열었는데 「보내기」 단추와 넣는 칸 안내, 「새 창에서
// 크게 열기」가 한국어로 남아 있었다. 표에 안 넣고 HTML 에 박아 둔 탓이다.
// 눈으로는 한참 못 잡았으므로 기계가 본다.

test('채팅 HTML 에 사람이 읽을 한국어가 박혀 있지 않다', () => {
  let 글 = readFileSync(join(WEB, 'index.html'), 'utf-8')
  글 = 글.replace(/<!--[\s\S]*?-->/g, ' ')          // 주석
    .replace(/<style[\s\S]*?<\/style>/g, ' ')        // 모양 규칙
    .replace(/<title>[\s\S]*?<\/title>/g, ' ')       // 글씨 뜨기 전 잠깐 보이는 것
  const 샌것 = []
  for (const m of 글.matchAll(/>([^<>]+)</g)) {
    const t = m[1].trim()
    if (t && /[가-힣]/.test(t)) 샌것.push(t.slice(0, 60))
  }
  for (const m of 글.matchAll(/(?:title|alt|placeholder|aria-label)="([^"]*)"/g)) {
    if (/[가-힣]/.test(m[1])) 샌것.push('속성: ' + m[1].slice(0, 60))
  }
  assert.deepEqual(샌것, [], '이 글자들은 화면말 표로 옮기고 JS 가 채워야 한다')
})

test('화면말 표의 열쇠마다 두 언어가 다 있고 영어에 한글이 없다', () => {
  const 빠진것 = []
  for (const [열쇠, 값] of Object.entries(화면말)) {
    if (typeof 값.한국어 !== 'function' || typeof 값.영어 !== 'function') 빠진것.push(열쇠)
    else if (/[가-힣]/.test(String(값.영어('X', 'Y')))) 빠진것.push(`${열쇠}(영어에 한글)`)
  }
  assert.deepEqual(빠진것, [])
})


test('화면에 거는 말은 「틀」이 아니라 「템플릿」이라고 한다', () => {
  // 사람 지시 2026-09-19: 웹에서 「틀」을 「템플릿」으로 바꾼다. 값(할일 이름·
  // `오른쪽.종류`)은 그대로 두고 **사람이 읽는 말만** 바꾼다.
  // 「틀리다」 계열은 뜻이 다르므로 봐준다.
  const 남은것 = []
  for (const [열쇠, 값] of Object.entries(화면말)) {
    const 글 = String(값.한국어('X', 'Y'))
    if (/틀(?![리린렸림])/.test(글)) 남은것.push(`${열쇠}: ${글}`)
  }
  assert.deepEqual(남은것, [])
})


// ── 선택창 (사람 결정 2026-09-19) ─────────────────────────────────

test('고를 것을 단추로 그리고 「직접 입력」을 같이 둔다', () => {
  const h = 고르기html('주제', ['연말정산 공제 3가지', '작년과 달라진 점', 'D-30 체크리스트'])
  assert.match(h, /연말정산 공제 3가지/)
  assert.match(h, /작년과 달라진 점/)
  assert.match(h, /D-30 체크리스트/)
  // 셋 다 눌러야 하므로 단추여야 한다.
  assert.equal((h.match(/class="pick"/g) || []).length, 3)
  // 「직접 입력」이 없으면 셋 밖으로 못 나간다 — 막다른 길이 된다.
  assert.match(h, /pick-own/)
})

test('고를 것에 든 꺾쇠는 글자로 나온다 — 화면을 안 깬다', () => {
  const h = 고르기html('주제', ['<b>굵게</b> 하는 법'])
  assert.ok(!h.includes('<b>굵게</b>'))
  assert.match(h, /&lt;b&gt;/)
})

test('무엇을 고르는지가 단추에 실린다 — 눌렀을 때 뭘 보낼지 알아야 한다', () => {
  const h = 고르기html('주제', ['연말정산 공제 3가지'])
  assert.match(h, /data-무엇="주제"/)
  assert.match(h, /data-값="연말정산 공제 3가지"/)
})

test('고를 것이 없으면 아무것도 안 그린다', () => {
  assert.equal(고르기html('주제', []), '')
  assert.equal(고르기html('주제', null), '')
})

test('선택창 글자도 말 표를 거친다 — 영어면 영어로', () => {
  assert.match(화면말.직접입력.영어(), /[A-Za-z]/)
  assert.ok(!/[가-힣]/.test(화면말.직접입력.영어()))
  assert.match(화면말.직접입력.한국어(), /[가-힣]/)
})

// ── 라벨 예시 (사람 결정 2026-09-22) ──────────────────────────────

test('예시 그림 셋을 다 깔고 눌러서 크게 볼 수 있게 표를 단다', () => {
  const h = 라벨예시html('한국어')
  for (const [주소] of 라벨예시목록) assert.ok(h.includes(주소), `${주소} 가 빠졌다`)
  // 표가 없으면 화면이 눌린 것을 못 가려내 «크게 보기» 가 통째로 죽는다.
  assert.equal((h.match(/class="예시그림"/g) || []).length, 라벨예시목록.length)
})

test('사용법 여덟 줄이 다 나온다 — 하나라도 빠지면 그 종류를 못 배운다', () => {
  const h = 라벨예시html('한국어')
  for (const [이름] of 사용법줄) assert.ok(h.includes(`<b>${이름}</b>`), `${이름} 줄이 빠졌다`)
})

test('사용법의 종류 이름은 라벨 화면의 종류와 같다', () => {
  // 화면에 없는 종류를 가르치면 읽고 와서 그 단추를 못 찾는다. 「마무리」는
  // 종류가 아니라 순서라 뺀다.
  const 종류들 = 사용법줄.map(([이름]) => 이름).filter((이름) => 이름 !== '마무리')
  assert.deepEqual(종류들.filter((k) => !KINDS.includes(k)), [])
})

test('영어로 열면 사용법도 영어다', () => {
  const h = 라벨예시html('영어')
  assert.match(h, /How to label/)
  // 게시물 이름은 표지에 적힌 글 그대로라 한국어로 남는다 — 사용법만 본다.
  // **표는 벗기고 본다** — 클래스 이름(`class="사용법"`)이 한국어라, 그대로
  // 재면 글자가 다 영어여도 걸린다.
  const 사용법 = h.slice(h.indexOf('<div class="사용법"')).replace(/<[^>]*>/g, ' ')
  assert.ok(!/[가-힣]/.test(사용법), `영어인데 한글이 남았다:\n${사용법}`)
})


test('주제 선택창에는 「다시」가 붙는다', () => {
  const h = 고르기html('주제', ['가', '나', '다'])
  assert.match(h, /pick-again/)
  // 앞서 낸 것들을 실어 보내야 딥시크가 겹치는 것을 안 낸다.
  assert.match(h, /data-앞것="가 \/ 나 \/ 다"/)
})

test('담기 물음에는 「다시」가 안 붙는다', () => {
  // 「네/아니오」는 다시 뽑을 것이 없다.
  const h = 고르기html('담기', ['네, 할게요', '아니요'])
  assert.ok(!h.includes('pick-again'))
  assert.match(h, /pick-own/)
})

test('「새 대화」를 누르면 첫 화면을 다시 그린다 — 빈 화면으로 두지 않는다', () => {
  // 실물 2026-09-19 배포본: 「새 대화」를 누르면 인사말도 템플릿 목록도 사라지고
  // **아무것도 없는 흰 화면**이 남았다. 새로고침해야 나왔다. 서른다섯 명 중
  // 이 단추를 누른 사람은 여기가 무엇을 하는 곳인지 다시 볼 길이 없다.
  //
  // 지우기와 그리기가 **한 곳에서** 이어져야 한다.
  const 글 = readFileSync(join(WEB, 'lib/chat.js'), 'utf-8')
  const 처음 = 글.indexOf('const 새로시작 = ')
  assert.ok(처음 > 0, '새로시작 을 못 찾았다')
  const 몸 = 글.slice(처음, 글.indexOf('if (새단추)', 처음))
  assert.ok(몸.includes('첫화면그리기()'),
    '지우기만 하고 다시 안 그린다 — 흰 화면이 남는다')
})

test('템플릿 카드를 누르면 말풍선에 「템플릿」이라 찍힌다 — 「틀」이 아니라', () => {
  // 실물 2026-09-19 배포본: 카드를 누르면 파란 말풍선에 「틀 DG0AA6PJ8s4」 라고
  // 찍혔다. 화면 곳곳을 「템플릿」으로 바꿔 놓고 **사람이 한 말만** 옛 낱말로
  // 남은 자리다.
  //
  // 이 글은 딥시크에게 그대로 간다. 배포본에 「템플릿 DG0AA6PJ8s4」 로 직접
  // 물어 두 언어 다 같은 답(코드 잡힘·오른쪽 칸 열림)을 받고 바꿨다.
  const 글 = readFileSync(join(WEB, 'lib/chat.js'), 'utf-8')
  assert.ok(!글.includes('보내기(`틀 '), '말풍선에 「틀」이라 찍힌다')
  assert.ok(글.includes('보내기(`템플릿 "'), '누르는 길이 사라졌다')
})

test('틀카드html — 고른 코드에만 «고름» 표가 붙는다', () => {
  const h = 틀카드html([{ 코드: 'A', 이름: '가', 표지: '' },
                      { 코드: 'B', 이름: '나', 표지: '' }], 'B')
  const A = h.slice(h.indexOf('data-code="A"') - 60, h.indexOf('data-code="A"'))
  const B = h.slice(h.indexOf('data-code="B"') - 60, h.indexOf('data-code="B"'))
  assert.ok(!A.includes('고름'), '안 고른 것에 표가 붙었다')
  assert.ok(B.includes('고름'), '고른 것에 표가 없다')
})

test('틀카드html — 고른 코드를 안 주면 아무 데도 표가 없다', () => {
  const h = 틀카드html([{ 코드: 'A', 이름: '가', 표지: '' }])
  assert.ok(!h.includes('고름'))
})

// **고른 뒤에도 목록이 보여야 한다**(사람 결정 2026-09-19). 여태는 하나를
// 고르면 오른쪽 칸이 상세로 통째로 바뀌어 목록이 사라졌고, 다시 보려면
// 「목록으로」를 눌러야 했다. 소스를 읽어 그 길이 살아 있는지 본다 — 화면
// 없이 돌리는 시험이라 이 방식이 `chat-ui` 의 관례다.
test('chat.js — 고른 뒤에도 남는 템플릿 띠가 있다', async () => {
  const { readFile } = await import('node:fs/promises')
  const 글 = await readFile(new URL('../lib/chat.js', import.meta.url), 'utf8')
  assert.ok(글.includes('const 띠그리기'), '띠를 그리는 데가 없다')
  assert.ok(글.includes("paneStrip.addEventListener('click'"), '띠에서 누르는 길이 없다')
  // 목록 화면에서는 큰 격자가 그 몫을 하므로 띠를 숨긴다 — 두 벌로 안 보인다.
  assert.ok(글.includes("종류 === '틀목록'"), '목록 화면을 가리는 데가 없다')
  // 새 템플릿이 생기면 띠가 들고 있던 옛 목록을 버려야 한다.
  assert.ok(글.includes('목록비우기()'), '새 템플릿 뒤에 목록을 안 새로 받는다')
})

test('index.html — 띠 자리와 꾸밈이 있다', async () => {
  const { readFile } = await import('node:fs/promises')
  const 글 = await readFile(new URL('../index.html', import.meta.url), 'utf8')
  assert.ok(글.includes('id="paneStrip"'), '띠 자리가 없다')
  assert.ok(글.includes('#paneStrip .tpl-pick.고름'), '고른 표시 꾸밈이 없다')
})
// ── 로고 올리기 단추 (사람 지시 2026-09-19) ────────────────────────

test('로고 선택창은 첫 단추만 「말 안 보내는」 단추다', () => {
  // 누르면 말이 아니라 파일 고르기가 열린다. **자리로 가른다** — 글자로
  // 가르면 영어로 바꿀 때 깨진다.
  const h = 고르기html('로고', ['로고 올리기', '로고 없이'], '한국어')
  const 것들 = h.match(/<button[^>]*class="pick[^"]*"/g) || []
  assert.ok(것들[0].includes('pick-올림'), '첫 단추에 표가 없다')
  assert.ok(!것들[1].includes('pick-올림'), '「없이」까지 올리기가 됐다')
})

test('영어로 열어도 첫 단추가 올리기다', () => {
  const h = 고르기html('로고', ['Upload a logo', 'No logo'], '영어')
  const 것들 = h.match(/<button[^>]*class="pick[^"]*"/g) || []
  assert.ok(것들[0].includes('pick-올림'))
  assert.ok(!것들[1].includes('pick-올림'))
})

test('주제 선택창에는 올리기 표가 안 붙는다', () => {
  // 「무엇」이 로고일 때만이다. 주제 첫 단추가 파일 고르기를 열면 큰일이다.
  const h = 고르기html('주제', ['처음 하는 사람에게', '뭘 사야 하나'], '한국어')
  assert.ok(!h.includes('pick-올림'))
})

test('index.html 에 로고 파일칸이 있다', () => {
  // 없으면 「로고 올리기」를 눌러도 아무 일이 안 난다 — 화면에 흔적도 없이.
  const html = readFileSync(join(WEB, 'index.html'), 'utf-8')
  assert.match(html, /id="logoFile"/, 'lib/chat.js 가 찾는 칸이 없다')
  assert.match(html, /accept="image\//, '그림만 고르게 안 막았다')
})

// ── 누르면 «이름» 으로 말한다 (사람 지시 2026-09-19) ──────────────
//
// 「클릭하면 여전히 내가 템플릿 DHqCBQnRAjW 라고 부르는데 싫어」 — 카드를
// 누르면 파란 말풍선에 창고 코드가 그대로 찍혔다. 사람이 그렇게 부른 적이
// 없는 이름이다.

test('틀카드 단추에 이름이 실린다 — 눌렀을 때 그 이름으로 말하려고', () => {
  const h = 틀카드html([{ 코드: 'DG0AA6PJ8s4', 이름: '키키로 배우는 브랜딩 전략', 표지: '' }])
  assert.ok(h.includes('data-name="키키로 배우는 브랜딩 전략"'), '이름이 단추에 없다')
  assert.ok(h.includes('data-code="DG0AA6PJ8s4"'), '코드도 있어야 한다 — 이름 없는 틀의 대비책')
})

test('이름이 없는 틀은 코드가 이름 자리에 온다 — 전과 같이 간다', () => {
  const h = 틀카드html([{ 코드: 'DHqCBQnRAjW', 이름: '', 표지: '' }])
  assert.ok(h.includes('data-name="DHqCBQnRAjW"'))
})

// **카드를 누르면 구경만 한다**(사람 결정 2026-09-28: 「템플릿 좀 보게 해주세요 …
// 누르면 바로 선택되고」 사용자 제보). 고르는 것은 「이 템플릿으로 만들기」 단추 하나다.
test('카드를 누르면 구경만 한다 — 누르는 자리 셋 다 말을 안 보낸다', () => {
  const 글 = readFileSync(join(WEB, 'lib/chat.js'), 'utf-8')
  assert.equal((글.match(/if \(b\) (\{ )?구경하기\(b\)/g) || []).length, 3,
    '누르는 자리 셋(말칸·오른쪽 칸·띠)이 다 구경으로 가야 한다 — 하나만 고치면 길이 갈린다')
  assert.ok(!/보내기\(`템플릿 "\$\{b\.dataset/.test(글), '카드를 누르면 아직도 말을 보내는 자리가 있다')
})

test('고르기 단추는 이름으로 말하고 코드를 같이 싣는다', () => {
  const 글 = readFileSync(join(WEB, 'lib/chat.js'), 'utf-8')
  assert.ok(!글.includes('b.dataset.code}`)'),
    '말풍선에 창고 코드가 그대로 찍힌다')
  assert.ok(글.includes('보내기(`템플릿 "${paneUse.dataset.name || 코드}"`, { 틀코드: 코드 })'),
    '단추가 이름으로 말하지 않거나 코드를 안 싣는다 — 코드가 없으면 모델이 이름을 주제로 읽는다')
})

// ── 분석이 끝나면 이름을 묻는다 (사람 결정 2026-09-19) ─────────────
//
// 이름을 안 받으면 `make_dsl_cardnews.틀_쓰기` 가 게시물 코드를 이름 자리에
// 넣는다. 수집기 화면과 RITA 채팅은 이미 묻는데 **웹 채팅만 안 물어서**
// 목록에 「DHqCBQnRAjW」 가 떴다. 화면 없이 돌리는 시험이라 소스를 읽는다 —
// `chat-ui` 의 관례다.

test('이름이 코드 그대로일 때만 묻는다 — 이미 이름이 있으면 안 묻는다', () => {
  const 글 = readFileSync(join(WEB, 'lib/chat.js'), 'utf-8')
  assert.ok(글.includes("if ((틀.이름 || '') === 틀.코드) {"),
    '이름이 코드인지 보는 자리가 없다 — 이름 있는 틀에도 묻게 된다')
  assert.ok(글.includes("이름묻는중 = 코드"), '무엇을 기다리는지 안 적어 둔다')
})

test('기다리던 이름은 딥시크에 안 보내고 이름 바꾸기로 간다', () => {
  const 글 = readFileSync(join(WEB, 'lib/chat.js'), 'utf-8')
  assert.ok(글.includes("'/api/template/rename'"),
    '이름만 고치는 길을 안 쓴다 — 분석을 다시 돌리면 값도 시간도 아깝다')
  // **창을 1,200자로 잡는다**(2026-09-20: 400자였다). 그 함수에 「대기 사진을
  // 먼저 올린다」가 들어오면서 `이름붙이기(` 가 668자 자리로 밀렸다. 창이 좁으면
  // 코드가 멀쩡한데도 빨개진다 — 검사하려던 것은 «간다/안 간다» 이지 «몇 자
  // 안에 있나» 가 아니다.
  const 몸 = 글.slice(글.indexOf('const 친말보내기'), 글.indexOf('const 친말보내기') + 1200)
  assert.ok(몸.includes('이름붙이기('), '친 말이 이름으로 안 간다')
})

test('고르기 단추는 이름 물음을 접는다 — 「템플릿 키키」가 이름이 되면 안 된다', () => {
  const 글 = readFileSync(join(WEB, 'lib/chat.js'), 'utf-8')
  assert.ok(/이름묻는중 = null\s+보내기\(`템플릿 /.test(글),
    '고를 때 물음을 안 접는다 — 이름을 기다리던 중에 누르면 「템플릿 …」이 이름이 된다')
})

test('이름을 못 바꿔도 화면이 멈추지 않는다 — 다음에 할 일을 알려 준다', () => {
  assert.ok(화면말.이름못붙임.한국어('막힘').includes('이름 바꾸기'),
    '실패했을 때 사람이 할 수 있는 것을 안 적었다')
  assert.ok(화면말.이름물음.영어().length > 0, '영어 말이 비었다')
  assert.ok(화면말.이름붙임.영어('Travel').includes('Travel'))
})

test('템플릿 이름을 따옴표로 감싸 보낸다', () => {
  // 사람 지시 2026-09-19: 「템플릿 "이름" 이렇게 해줘 지금은 템플릿 이름 이거임」.
  //
  // 이름에 빈칸이 들어 있으면(「키키로 배우는 브랜딩 전략」) 어디까지가 이름인지
  // 눈으로도 모델로도 안 갈린다. 따옴표가 그 금을 긋는다.
  const 글 = readFileSync(join(WEB, 'lib/chat.js'), 'utf-8')
  assert.ok(!/보내기\(`템플릿 \$\{[^}]+\}`\)/.test(글), '따옴표 없이 보내는 곳이 남았다')
  // 템플릿을 말로 보내는 곳은 이제 「이 템플릿으로 만들기」 단추 하나다(2026-09-28).
  const 몇곳 = (글.match(/보내기\(`템플릿 "\$\{/g) || []).length
  assert.equal(몇곳, 1, `따옴표로 감싼 곳이 ${몇곳}곳 — 하나여야 한다`)
})

// ── 고른 뒤에도 선택창은 남는다 (사람 지시 2026-09-19) ─────────────
//
// 「주제 3안중 하나 선택하나 선택하면 없어지더라고 그러지말고 계속 유지했으면
// 좋겠어」 — 세 갈래를 받아 하나를 고르면 나머지 둘이 같이 사라졌다. 무엇
// 중에서 골랐는지도, 마음을 바꿀 길도 없어졌다.

test('고르고 나서 선택창을 지우지 않는다', () => {
  const 글 = readFileSync(join(WEB, 'lib/chat.js'), 'utf-8')
  const 자리 = 글.indexOf("const 겹 = p.closest('.picks')")
  assert.ok(자리 > 0, '고르는 자리가 사라졌다 — 시험이 낡았다')
  const 몸 = 글.slice(자리, 자리 + 300)
  assert.ok(!몸.includes('겹.remove()'), '고르면 선택창이 사라진다')
  assert.ok(몸.includes("p.classList.add('고름')"), '고른 것에 표가 안 붙는다')
})

test('마음을 바꾸면 표도 따라간다 — 한 묶음에 표는 하나', () => {
  const 글 = readFileSync(join(WEB, 'lib/chat.js'), 'utf-8')
  assert.ok(글.includes("겹.querySelectorAll('.pick.고름')"),
    '옛 표를 안 지운다 — 다른 것을 누르면 표가 둘이 된다')
})

test('고른 표에 눈에 띄는 모양이 있다 — 남겨 두기만 하면 뭘 눌렀는지 모른다', () => {
  const 꾸밈 = readFileSync(join(WEB, 'index.html'), 'utf-8')
  assert.ok(꾸밈.includes('.pick.고름'), '고른 표의 모양이 없다')
})


// ── 올린 사진 띠 (사람 결정 2026-09-19) ────────────────────────────

test('사진띠html — 한 장도 없으면 빈 글자다 (띠를 숨기라는 뜻)', () => {
  assert.equal(사진띠html([], '한국어'), '')
  assert.equal(사진띠html(null, '한국어'), '')
  assert.equal(사진띠html(['', '  '], '한국어'), '')
})

test('사진띠html — 장마다 그림 하나와 빼는 단추 하나', () => {
  const h = 사진띠html(['https://x/a.png', 'https://x/b.png'], '한국어')
  assert.equal((h.match(/<img /g) || []).length, 2)
  assert.match(h, /data-차례="0"/)
  assert.match(h, /data-차례="1"/)
  assert.match(h, /올린 사진 2장/)
})

test('사진띠html — 영어로 열면 한국어가 안 남는다', () => {
  const h = 사진띠html(['https://x/a.png'], '영어')
  assert.match(h, /1 photo/)
  assert.ok(!h.includes('올린 사진'))
  // **보이는 글자만 본다.** `class="샷빼기"` 는 코드 이름이라 한국어가 맞다 —
  // 그걸 영어로 바꾸면 꾸밈이 안 걸린다.
  assert.match(h, /title="Remove"/)
  assert.ok(!h.includes('title="빼기"'))
})

// ── 사진은 «엔터를 눌러야» 올라간다 (사람 지시 2026-09-20) ────────
//
// 「컨트롤 v 하면 사진이 바로 들어가거든? 아마 드레그도 그럴거 같은데
//  그러면 안되고 엔터 눌러야 들어가야함」
//
// **이 셋이 깨지면 조용히 틀린다** — 오류가 안 나고 사진만 안 들어간다.

test('붙여넣기·끌어다 놓기·단추 셋이 바로 안 올리고 담기만 한다', () => {
  const 글 = readFileSync(join(WEB, 'lib/chat.js'), 'utf-8')
  // 셋이 붙잡는 자리에서 «올리기» 를 바로 부르면 안 된다.
  for (const 자리 of ["사진칸.value = ''", '끌기표(false)', "사진칸.value = ''"]) {
    const i = 글.indexOf(자리)
    assert.ok(i > 0, `자리를 못 찾았다: ${자리}`)
    const 몸 = 글.slice(i, i + 200)
    assert.ok(!몸.includes('await 사진올리기('),
      `${자리} 뒤에서 바로 올린다 — 엔터를 눌러야 올라가야 한다`)
  }
  assert.ok((글.match(/사진담기\(/g) || []).length >= 3,
    '셋이 다 «담기» 로 가야 한다')
})

test('보내기가 대기 사진을 «먼저» 올리고 끝까지 기다린다', () => {
  // 안 기다리면 주문이 먼저 서버에 닿아 `상태.사진들` 이 빈 채로 읽힌다 —
  // 「사진 자리가 N개 있어요」를 또 묻거나 초안에 사람 사진이 안 꽂힌다.
  const 글 = readFileSync(join(WEB, 'lib/chat.js'), 'utf-8')
  const i = 글.indexOf('const 친말보내기')
  const 몸 = 글.slice(i, i + 1200)
  const 올림 = 몸.indexOf('await 사진올리기(')
  const 보냄 = 몸.indexOf('await 보내기(')
  assert.ok(올림 > 0, '보내기가 대기 사진을 안 올린다')
  assert.ok(보냄 > 올림, '올리기보다 보내기가 먼저다 — 사진이 빈 채로 읽힌다')
})

test('글이 비어도 사진만 보낼 수 있다', () => {
  // 사람 지적 2026-09-20: 「주제는 내가 왜 적냐?」
  const 글 = readFileSync(join(WEB, 'lib/chat.js'), 'utf-8')
  const i = 글.indexOf('const 친말보내기')
  const 몸 = 글.slice(i, i + 1200)
  const 빈검사 = 몸.indexOf("!String(글 || '').trim()")
  const 올림 = 몸.indexOf('await 사진올리기(')
  assert.ok(빈검사 > 올림,
    '빈 글이면 사진도 안 올리고 돌아선다 — 사진만 보낼 수가 없다')
})

test('사진띠html — 아직 안 올린 사진도 같은 띠에 그린다', () => {
  // **사람 지시 2026-09-20** — 「컨트롤 v 하면 사진이 바로 들어가거든? …
  // 엔터 눌러야 들어가야함」. 붙여넣은 순간 올리지 않고 «대기» 로 두는데,
  // 그러면 사람이 붙여넣고 아무것도 못 보게 된다. 같은 띠에 흐리게 보여 준다.
  //
  // **띠는 하나다** — 둘로 가르면 한쪽만 고치게 된다.
  const h = 사진띠html([], '한국어', ['blob:x/1', 'blob:x/2'])
  assert.equal((h.match(/<img /g) || []).length, 2)
  assert.match(h, /대기/, '대기 표시가 없다')
  assert.match(h, /data-대기차례="0"/)
  assert.match(h, /data-대기차례="1"/)
})

test('사진띠html — 올린 것과 대기가 섞여도 둘 다 나온다', () => {
  const h = 사진띠html(['https://x/a.png'], '한국어', ['blob:x/1'])
  assert.equal((h.match(/<img /g) || []).length, 2)
  assert.match(h, /data-차례="0"/, '올린 것의 빼기 단추가 없다')
  assert.match(h, /data-대기차례="0"/, '대기의 빼기 단추가 없다')
})

test('사진띠html — 대기가 영어로도 나온다', () => {
  const h = 사진띠html([], '영어', ['blob:x/1'])
  // **보이는 글자만 본다.** `class="대기"`·`data-대기차례` 는 코드가 읽는 이름이지
  // 사람이 보는 글자가 아니다 — 옆의 `data-차례` 도 처음부터 한국어였다.
  const 보이는것 = h.replace(/<[^>]*>/g, '')
    + (h.match(/title="([^"]*)"/g) || []).join(' ')
  assert.ok(!/[가-힣]/.test(보이는것), `한국어가 남았다: ${보이는것}`)
})

test('사진띠html — 주소를 글자로 넣는다', () => {
  const h = 사진띠html(['https://x/a.png"><script>alert(1)</script>'], '한국어')
  assert.ok(!h.includes('<script>'), '주소가 태그로 들어갔다')
})


// ── 기다리는 동안 «어디까지 왔는지» 보여 준다 (사람 지시 2026-09-20) ──
//
// 「기다리는 표시 예를들어 얼마나 되고있는지 퍼센트를 나타내주는거」
//
// 실제로 초안이 3분 24초 걸렸는데 화면엔 「1~2분」 한 줄뿐이라, 사람이
// 「안 뜨는데」 하고 멈춘 줄 알았다. **고장이 아니라 안내가 없던 것이다.**

test('일기다리기가 진행률을 화면에 보여 준다', () => {
  const 글 = readFileSync(join(WEB, 'lib/chat.js'), 'utf-8')
  // **`진행그리기` 부터 본다** — 퍼센트를 꺼내는 곳은 그리는 함수 쪽이고,
  // `일기다리기` 는 그것을 부르기만 한다.
  const i = 글.indexOf('const 진행그리기')
  assert.ok(i > 0, '진행을 그리는 자리가 없다')
  // **범위를 4000 으로 넓혔다**(2026-09-24). 둘 사이에 `사진채우기` 가 들어왔다 —
  // 사진이 오는 대로 초안에 꽂는 자리인데, 같은 폴링 고리가 부르므로 여기 있는
  // 것이 맞다. 「바로 앞」의 뜻은 «같은 덩이 안» 이지 «붙어 있어야 한다» 가 아니다.
  const 몸 = 글.slice(i, i + 4000)
  assert.ok(몸.includes('progress'),
    '봉투에서 progress 를 안 꺼낸다 — 받고도 버린다')
  assert.ok(몸.includes('const 일기다리기'),
    '진행그리기가 일기다리기 바로 앞에 있어야 한다 — 멀어지면 짝을 놓친다')
  // **`(봉투` 까지만 본다.** 「그만두기」가 붙어 `진행그리기(봉투, 일.번호)` 가
  // 됐다(2026-09-24) — 인자가 늘어난다고 이 시험이 깨질 까닭은 없다.
  assert.ok(/진행그리기\(봉투/.test(몸),
    '도는 동안 진행을 안 그린다')
})

test('진행 표시는 말풍선을 쌓지도 서버에 저장하지도 않는다', () => {
  // 5초마다 도는 고리다. 말풍선을 쌓으면 3분에 서른여섯 개가 쌓이고,
  // 서버에 저장하면 대화 기록이 진행률로 뒤덮인다.
  const 글 = readFileSync(join(WEB, 'lib/chat.js'), 'utf-8')
  const i = 글.indexOf('const 일기다리기')
  const 몸 = 글.slice(i, i + 2000)
  // 고리 «안» 에서 부르면 안 되는 것들
  const 고리 = 몸.slice(몸.indexOf('while ('), 몸.indexOf('return'))
  assert.ok(!/봇적기\(/.test(고리) || /succeeded|failed/.test(고리),
    '도는 동안 봇적기로 말풍선을 쌓는다')
  assert.ok(!/상태저장\(/.test(고리), '도는 동안 서버에 저장한다')
})

test('일이 끝나면 진행 표시를 치운다', () => {
  const 글 = readFileSync(join(WEB, 'lib/chat.js'), 'utf-8')
  const i = 글.indexOf('const 일기다리기')
  const 몸 = 글.slice(i, i + 2000)
  assert.ok(/진행지우기|진행그리기\(null\)/.test(몸),
    '끝난 뒤 진행 표시를 치우는 자리가 없다 — 「62%」가 화면에 남는다')
})


// ── 굽는 시간 안내는 «사진을 만드나» 로 갈린다 (실측 2026-09-20) ──
//
// 사람 지적: 「실제 카드뉴스 만드는 데 진짜 오래걸렸거든」
//
// 람다 자국으로 쟀다 — **굽기 361초(6분 1초)** 인데 화면은 「1~3분」이라 했다.
//
//     사진 1~6장   17~24초씩      정상
//     사진 7장     3분 48초       한 장이 유독 길었다
//     그림 굽기    21초
//
// **사진을 안 만들면 1분이 안 걸린다** — 대본은 이미 있고 굽기만 남는다.
// 그래서 한 문구로는 둘 다 틀린다.

test('사진을 만들면 오래 걸린다고 말한다', () => {
  const 글 = 화면말.이제굽는다.한국어(true)
  assert.match(글, /[3-9]~|사진/, `사진 만들 때 안내가 그대로다: ${글}`)
  assert.ok(!글.includes('1~3분'), '실측 6분인데 「1~3분」이라 한다')
})

test('사진을 안 만들면 짧다고 말한다', () => {
  const 짧 = 화면말.이제굽는다.한국어(false)
  const 김 = 화면말.이제굽는다.한국어(true)
  assert.notEqual(짧, 김, '사진을 만드나 안 만드나 같은 말을 한다')
})

test('굽는 시간 안내가 영어로도 갈린다', () => {
  const 짧 = 화면말.이제굽는다.영어(false)
  const 김 = 화면말.이제굽는다.영어(true)
  assert.notEqual(짧, 김)
  assert.ok(!/[가-힣]/.test(짧 + 김), `한국어가 남았다: ${짧} / ${김}`)
})


// ── 막대는 «기어간다» (사람 지적 2026-09-20) ──────────────────────
//
// 「비율 뚝뚝 올리지말고 자연스럽게 되어야하는데 지금 안되는듯?」
//
// 서버는 **단계가 바뀔 때만** 값을 준다. 실측(2026-09-20)에서 30%(「대본을
// 쓴다」)에 **2분 38초** 머물렀다가 한 번에 60%로 뛰었다. 화면이 그 값을
// 그대로 쓰면 2분 38초 동안 멈춰 있다가 뚝 뛴다.
//
// 그래서 **시간으로 그 사이를 메운다.** 받은 값에서 조금씩 기어가되,
// 다음 단계를 모르므로 **일정 폭 안에서 점점 느려진다**(끝에 안 닿는다).

test('부드러운값 — 시간이 지나면 앞으로 기어간다', () => {
  const 처음 = 부드러운값(30, 0, 0)
  const 나중 = 부드러운값(30, 30, 처음)
  assert.ok(나중 > 처음, `안 움직인다: ${처음} → ${나중}`)
  assert.ok(나중 > 31, `너무 조금 움직인다: ${나중}`)
})

test('부드러운값 — 받은 값보다 너무 앞서가지 않는다', () => {
  // 앞서 달리면 60% 를 받았을 때 막대가 뒤로 가거나 멈춘 것처럼 보인다.
  const 한참 = 부드러운값(30, 600, 0)
  assert.ok(한참 < 58, `10분 뒤 ${한참}% — 너무 멀리 갔다`)
})

test('부드러운값 — 절대 뒤로 안 간다', () => {
  // 미리보기는 62 → 68 로 가는데, 화면이 이미 그보다 앞서 있을 수 있다.
  const 앞선것 = 부드러운값(62, 100, 0)
  assert.equal(부드러운값(62, 0, 앞선것), 앞선것, '받은 값으로 되돌아갔다')
})

test('부드러운값 — 100 을 안 넘는다', () => {
  assert.ok(부드러운값(99, 99999, 99) <= 100)
  assert.ok(부드러운값(95, 99999, 0) <= 100)
})

// ── 엔터로 보내기 ──────────────────────────────────────────────────
//
// 맥에서 「안녕」을 치고 엔터를 누르면 「안녕」은 보내지는데 칸에 「녕」이
// 남았다(사람 신고 2026-09-22). 엔터는 한글 입력기한테 «이 글자 만들기 끝»
// 신호이기도 해서, 우리가 칸을 비운 «뒤에» 만들던 글자가 되돌아온다.

test('엔터로보내나 — 그냥 엔터는 보낸다', () => {
  assert.equal(엔터로보내나({ key: 'Enter', shiftKey: false, isComposing: false, keyCode: 13 }), true)
})

test('엔터로보내나 — 시프트+엔터는 줄바꿈이라 안 보낸다', () => {
  assert.equal(엔터로보내나({ key: 'Enter', shiftKey: true, isComposing: false, keyCode: 13 }), false)
})

test('엔터로보내나 — 한글을 만드는 중이면 안 보낸다', () => {
  assert.equal(엔터로보내나({ key: 'Enter', shiftKey: false, isComposing: true, keyCode: 229 }), false)
})

test('엔터로보내나 — isComposing 을 안 주고 keyCode 229 만 주는 브라우저도 막는다', () => {
  // 229 = 「이 키는 입력기가 가져갔다」는 뜻이라 보내기 신호가 될 수 없다.
  assert.equal(엔터로보내나({ key: 'Enter', shiftKey: false, isComposing: false, keyCode: 229 }), false)
})

test('엔터로보내나 — 엔터가 아니면 안 보낸다', () => {
  assert.equal(엔터로보내나({ key: 'a', shiftKey: false, isComposing: false, keyCode: 65 }), false)
})

// ── 새 대화는 리셋이다 (사람 지시 2026-09-22) ──────────────────────
//
// 「새 대화라는 게 리셋임 모든게 리셋(로고까지)」. 화면 쪽은 DOM 이 있어야 돌아서
// 이 저장소가 하던 대로 **글로 못 박는다** — 지우는 부름이 빠지면 창고에 주인 없는
// 그림이 쌓이는데, 그건 아무 화면에도 안 보여서 영영 모른다.

test('새 대화 — 번호를 비우기 «전에» 지우기를 건다', () => {
  const 글 = readFileSync(join(WEB, 'lib/chat.js'), 'utf-8')
  const 지우기 = 글.indexOf('올린것지우기(대화)')
  const 비우기 = 글.indexOf('const ㅅ = 새대화상태()')
  assert.ok(지우기 > 0, '새 대화가 올린 것을 안 지운다')
  assert.ok(비우기 > 0)
  assert.ok(지우기 < 비우기, '번호를 먼저 비우면 무엇을 지울지 모르게 된다')
})

test('새 대화 — 주소가 아니라 대화 번호만 보낸다', () => {
  // 주소를 받는 문이면 남의 사진 주소를 아는 사람이 지울 수 있다.
  const 글 = readFileSync(join(WEB, 'lib/chat.js'), 'utf-8')
  assert.match(글, /\/uploads`, \{ method: 'DELETE' \}/, '지우는 문을 안 부른다')
  assert.ok(!/DELETE'[\s\S]{0,200}사진들/.test(글), '주소를 실어 보내고 있다')
})

test('새 대화 — 아직 안 올린 사진도 비운다', () => {
  // 안 비우면 새 대화인데 띠에 옛 사진이 그대로 남는다.
  const 글 = readFileSync(join(WEB, 'lib/chat.js'), 'utf-8')
  const 새로시작 = 글.slice(글.indexOf('const 새로시작'), 글.indexOf('if (새단추)'))
  assert.match(새로시작, /대기사진 = \[\]/, '대기 사진을 안 비운다')
  assert.match(새로시작, /revokeObjectURL/, '만든 주소를 안 거둔다')
})

// ── 생각 중 표시 (사람 지시 2026-09-22) ─────────────────────────────
//
// 「그 생각중일때 좀 돌고있는표시 추가하는게 좋을듯」. 여태 기다리는 동안 하는
// 일은 보내기 단추를 회색으로 끄는 것 하나였고, 단추는 글 칸 옆이라 눈이 안 갔다.

test('생각중html — 지울 때 찾는 표가 붙어 있다', () => {
  const h = 생각중html('한국어')
  assert.ok(h.includes('생각중'), '표가 없으면 답이 와도 못 지워 계속 남는다')
  assert.ok(h.includes('숨쉬는글'), '꾸밈 이름이 없으면 움직이지 않는다')
  assert.ok(h.includes('생각 중…'))
})

test('생각중html — 언어를 따라간다', () => {
  assert.ok(생각중html('영어').includes('Thinking…'))
  assert.ok(!생각중html('영어').includes('생각 중'))
})

test('생각중html — 봇 쪽(왼쪽)에 붙는다', () => {
  // 사람 쪽에 붙으면 파란 말풍선이 되어 «내가 한 말» 처럼 보인다.
  assert.ok(생각중html('한국어').includes('class="msg 봇 생각중"'))
})

test('생각 중 글은 두 언어가 다 있다', () => {
  // 한쪽이 비면 그 언어에서 말풍선이 «undefined» 로 뜬다.
  assert.equal(화면말.생각중.한국어(), '생각 중…')
  assert.equal(화면말.생각중.영어(), 'Thinking…')
})


// ── 사진이 덜 만들어졌을 때 — 「이어서 하기」 (2026-09-24) ──────────
//
// 람다가 900초에 끊기거나 fal 이 빈손으로 오면 사진 자리가 빈 채로 구워진다.
// 그때 오른쪽을 작업대로 덮어 버리면 **「이대로 만들기」 단추가 사라져서**
// 빈 자리를 채울 길이 없다 — 처음부터 다시 만들어야 하고, 이미 만든 사진값이
// 통째로 또 나간다. **여기서 못을 박는 것이 그 값이다.**

const _구운봉투 = (더) => ({ status: 'succeeded',
  result: { content: '만들었습니다.',
    components: [{ type: 'link', url: 'https://x/판.html' }], ...더 } })

test('사진이 다 됐으면 여태대로 작업대를 연다', () => {
  const r = 일끝처리('만들기', _구운봉투(), '한국어')
  assert.equal(r.오른쪽.종류, '작업대')
  assert.equal(r.오른쪽.주소, 'https://x/판.html')
})

test('사진이 덜 됐으면 초안을 되살린다 — 다시 누를 단추가 거기 있다', () => {
  const 밑그림 = { 주제: 'ㅇ', 카드: [{ 장식영역: [{ 종류: '사진', media_url: 'https://x/된것.png' }] }] }
  const r = 일끝처리('만들기', _구운봉투({ 밑그림, 못만든사진: 2 }), '한국어')
  assert.equal(r.오른쪽.종류, '미리보기', '작업대로 덮어 단추를 없앴다')
  assert.equal(r.오른쪽.밑그림, 밑그림)
})

test('되살려도 작업대로 가는 길은 남는다 — 구운 것은 이미 나왔다', () => {
  // 초안을 되살리면 오른쪽이 «미리보기» 로 가므로 작업대 칸을 안 쓴다.
  // 그래서 이때만은 **글이 유일한 길**이다 — 거기까지 없애면 구운 것을 못 본다.
  const 밑그림 = { 주제: 'ㅇ', 카드: [] }
  const r = 일끝처리('만들기', _구운봉투({ 밑그림, 못만든사진: 1 }), '한국어')
  assert.equal(r.오른쪽.종류, '미리보기')
  assert.ok(r.말.includes('https://x/판.html'), r.말)
})

test('되살린 초안의 카드에는 이번에 만든 사진이 박혀 있다', () => {
  // 이게 없으면 다시 눌렀을 때 같은 자리를 또 산다.
  const 밑그림 = { 카드: [{ 장식영역: [{ 종류: '사진', media_url: 'https://x/된것.png' },
    { 종류: '사진' }] }] }
  const r = 일끝처리('만들기', _구운봉투({ 밑그림, 못만든사진: 1 }), '한국어')
  const 자리 = r.오른쪽.밑그림.카드[0].장식영역
  assert.equal(자리[0].media_url, 'https://x/된것.png')
  assert.ok(!자리[1].media_url, '빈 자리가 채워진 것처럼 보인다')
})


// ── 사진이 오는 대로 꽂을 것 고르기 (2026-09-24) ─────────────────────
//
// 람다가 한 장 꽂을 때마다 번호표에 «{장}-{자리}: 주소» 를 적는다. 5초마다 보는
// 고리가 **새로 온 것만** 골라 화면에 꽂는다 — 같은 것을 또 그리면 방금 온 것을
// 알리는 번쩍임이 매번 다시 돈다.

test('새로 온 것만 골라 낸다', () => {
  const 이미 = new Set(['0-0'])
  const 낼것 = 사진꽂을것({ '0-0': 'https://x/a.png', '1-2': 'https://x/b.png' }, 이미)
  assert.deepEqual(낼것, [{ 열: '1-2', 장: 1, 자리: 2, 주소: 'https://x/b.png' }])
})

test('빈 것도 없는 것도 그냥 넘긴다', () => {
  assert.deepEqual(사진꽂을것(undefined, new Set()), [])
  assert.deepEqual(사진꽂을것({}, new Set()), [])
  assert.deepEqual(사진꽂을것({ '0-0': '' }, new Set()), [])
})

test('열쇠 모양이 아니면 버린다', () => {
  // 번호표는 람다가 쓰지만, 모양이 어긋난 것을 Number() 에 그냥 넣으면
  // NaN 이 되어 엉뚱한 자리를 짚는다.
  assert.deepEqual(사진꽂을것({ 'a-b': 'https://x/a.png' }, new Set()), [])
  assert.deepEqual(사진꽂을것({ '0': 'https://x/a.png' }, new Set()), [])
})

test('http 가 아닌 주소는 꽂지 않는다', () => {
  // **그림 주소를 그대로 DOM 에 넣는다.** 여기서 안 막으면 그게 그대로 산다.
  assert.deepEqual(사진꽂을것({ '0-0': 'javascript:alert(1)' }, new Set()), [])
  assert.deepEqual(사진꽂을것({ '0-0': 'data:text/html,<script>' }, new Set()), [])
  assert.equal(사진꽂을것({ '0-0': 'http://x/a.png' }, new Set()).length, 1)
})

test('차례 번호를 숫자로 낸다 — 화면이 그것으로 자리를 짚는다', () => {
  const [것] = 사진꽂을것({ '3-1': 'https://x/a.png' }, new Set())
  assert.equal(것.장, 3)
  assert.equal(것.자리, 1)
  assert.equal(typeof 것.장, 'number')
})


// ── 첫 화면이 비지 않는다 (사용자 지적 2026-09-24) ────────────────────
//
// 「첫 화면이 잠깐 비어 있음 — 약 3초 뒤에 템플릿 목록이 뜸」. 목록은 창고에서
// 받아오는데 그때까지 칸이 **아무것도 없이** 비었다. 빈 화면은 「고장인가」로
// 읽히고, 같은 크기 회색 네모는 「오는 중」으로 읽힌다.

test('뼈대는 틀 카드와 같은 모양·같은 칸이다', () => {
  const h = 뼈대html(3)
  assert.ok(h.includes('class="tpl-strip"'), '띠가 아니면 칸 크기가 달라진다')
  assert.equal((h.match(/tpl-pick/g) || []).length, 3)
  assert.equal((h.match(/tpl-face/g) || []).length, 3)
  assert.equal((h.match(/tpl-name/g) || []).length, 3)
})

test('뼈대는 누를 수 없다 — 단추가 아니다', () => {
  const h = 뼈대html(2)
  assert.ok(!h.includes('<button'), '누르면 빈 카드가 골라진다')
  assert.ok(h.includes('aria-hidden="true"'), '읽어 주는 기계에 뼈대를 읽히면 안 된다')
})

test('뼈대에는 사람이 읽을 글이 없다 — 가짜 이름을 안 만든다', () => {
  assert.ok(!/[가-힣]/.test(뼈대html(4).replace(/뼈대/g, '')), 뼈대html(4))
})

test('개수를 안 주거나 0 이하면 적어도 하나는 깐다', () => {
  for (const n of [undefined, 0, -3]) {
    assert.ok((뼈대html(n).match(/tpl-pick/g) || []).length >= 1, String(n))
  }
})

// ── 「이 템플릿으로 만들기」 단추 (사람 결정 2026-09-28) ─────────────────
//
// 템플릿을 누르면 구경만 하고, 오른쪽 위 띠의 단추로 고른다. **이미 고른 것을
// 보고 있으면 그렇다고 보여 준다**(손잡이를 만들면 상태 표시까지).

test('고르기 단추 — 템플릿을 볼 때만 뜬다', async () => {
  const { 고르기단추 } = await import('../lib/chat.js')
  assert.equal(고르기단추(null, '', '한국어'), null)
  assert.equal(고르기단추({ 종류: '틀목록' }, '', '한국어'), null)
  assert.equal(고르기단추({ 종류: '미리보기' }, 'AAA', '한국어'), null)
})

test('고르기 단추 — 안 고른 것을 보면 고르라 하고, 고른 것을 보면 골랐다고 한다', async () => {
  const { 고르기단추 } = await import('../lib/chat.js')
  assert.deepEqual(고르기단추({ 종류: '틀', 코드: 'BBB' }, 'AAA', '한국어'),
    { 글: '이 템플릿으로 만들기', 고름: false })
  assert.deepEqual(고르기단추({ 종류: '틀', 코드: 'AAA' }, 'AAA', '한국어'),
    { 글: '✓ 고른 템플릿', 고름: true })
  assert.deepEqual(고르기단추({ 종류: '틀', 코드: 'BBB' }, '', '영어'),
    { 글: 'Use this template', 고름: false })
})

// ── 사진을 어떻게 쓸까 (사람 결정 2026-09-28) ─────────────────────

test('사진쓰임 단추는 둘이고 자리로 가른다 — 첫째 그대로, 둘째 참조', () => {
  assert.deepEqual(사진쓰임단추('한국어'), ['그대로 넣기', '참조해서 만들기'])
  assert.deepEqual(사진쓰임단추('영어'), ['Place as-is', 'Use as reference'])
  assert.equal(사진쓰임값(0), '그대로')
  assert.equal(사진쓰임값(1), '참조')
  assert.equal(사진쓰임값(7), '그대로', '모르는 자리는 그대로 — 돈 안 드는 쪽')
})

test('사진쓰임 선택창은 data-무엇 으로 갈린다', () => {
  const h = 고르기html('사진쓰임', 사진쓰임단추('한국어'), '한국어')
  assert.equal((h.match(/data-무엇="사진쓰임"/g) || []).length, 2)
  assert.ok(!h.includes('pick-올림'), '파일 고르기를 여는 단추가 아니다')
})

test('사진쓰임 말은 두 언어가 다 있다', () => {
  for (const 열쇠 of ['사진쓰임물음', '사진그대로', '사진참조', '그대로갑니다', '참조로갑니다']) {
    assert.equal(typeof 화면말[열쇠]?.한국어, 'function', 열쇠)
    assert.equal(typeof 화면말[열쇠]?.영어, 'function', 열쇠)
  }
})

// ── 검토 반영 (2026-09-29) ─────────────────────────────────────────

test('사진쓰임 클릭은 도는 채팅 턴이 끝난 «뒤» 에 적는다 — 턴 끝 저장이 덮지 않게', async () => {
  // 사진과 글을 같이 보내면 턴이 도는 동안 단추가 보인다. 그때 누른 것을 바로
  // 적으면 턴 끝의 «통째 저장» 이 옛 상태로 덮어 선택이 조용히 사라진다(검토 I1).
  const 일지 = []
  let 턴끝내기
  const 도는턴 = new Promise((r) => { 턴끝내기 = r })
  const 약속 = 사진쓰임적기({ 차례: 1, 도는턴, 적기: async (값) => { 일지.push(`적음:${값}`) } })
  await Promise.resolve()
  assert.deepEqual(일지, [], '턴이 안 끝났는데 적었다')
  일지.push('턴끝')
  턴끝내기()
  assert.equal(await 약속, '참조')
  assert.deepEqual(일지, ['턴끝', '적음:참조'])
})

test('도는 턴이 없으면 사진쓰임을 바로 적는다', async () => {
  const 일지 = []
  assert.equal(await 사진쓰임적기({ 차례: 0, 도는턴: null, 적기: async (값) => { 일지.push(값) } }), '그대로')
  assert.deepEqual(일지, ['그대로'])
})

test('턴이 실패해도 고른 사진쓰임은 적는다', async () => {
  const 일지 = []
  await 사진쓰임적기({ 차례: 1, 도는턴: Promise.reject(new Error('망')),
    적기: async (값) => { 일지.push(값) } })
  assert.deepEqual(일지, ['참조'])
})

test('바람은 사진을 올릴 때마다 새로 적는다 — 글이 없으면 빈 글자다', () => {
  // 안 지우면 옛 바람(「카페 테이블 위에」)이 다음 참조 판에 몰래 실린다(검토 I3).
  assert.equal(바람값(' 카페 테이블 위에 '), '카페 테이블 위에')
  assert.equal(바람값(''), '')
  assert.equal(바람값(undefined), '')
})

test('사진쓰임 물음은 «올린 사진 전부» 에 적용된다고 말한다', () => {
  // 쓰임은 대화에 하나뿐이다(검토 I4). 새로 올리면 되돌아가고 다시 묻는다.
  assert.match(화면말.사진쓰임물음.한국어(), /전부/)
  assert.match(화면말.사진쓰임물음.영어(), /all/i)
})

// ── 화풍 카드 (사람 결정 2026-09-29) ───────────────────────────────

test('화풍 카드 — 알아서가 맨 앞이고 열아홉이 예시 그림과 나온다', () => {
  const h = 화풍카드html('한국어')
  const 번호들 = [...h.matchAll(/data-화풍="([^"]+)"/g)].map((m) => m[1])
  assert.equal(번호들[0], '알아서')
  assert.deepEqual(번호들.slice(1), 화풍목록.map((x) => x.id))
  assert.ok(h.includes('src="/hwapung/530.jpg"'))
  assert.ok(h.includes('data-이름="실사 배경 + 손그림 인물"'))
  assert.ok(h.includes('data-이름="알아서 (AI가 고름)"'))
})

test('화풍 카드 — 영어면 영어 이름', () => {
  const h = 화풍카드html('영어')
  assert.ok(h.includes('data-이름="Pixel art"') && h.includes('data-이름="Let AI pick"'))
  assert.ok(!h.includes('data-이름="픽셀 그림"'))
})

test('새로고침해도 화풍을 묻는 중이면 카드를 다시 깐다', () => {
  // 여태는 물음 글만 남고 카드가 사라졌다 — 이름을 모르는 사람은 막혔다(2026-09-29 검토 M-4).
  assert.ok(복원카드html({ 물은것: { 무엇: '화풍' } }, '한국어').includes('hwa-strip'))
  assert.equal(복원카드html({ 물은것: { 무엇: '주제', 고를것: ['가'] } }, '한국어'), '')
  assert.equal(복원카드html({}, '한국어'), '')
  const 글 = readFileSync(new URL('../lib/chat.js', import.meta.url), 'utf8')
  const 처음 = 글.indexOf('for (const 줄 of got.messages) 적기(줄)')
  assert.ok(처음 > 0)
  assert.ok(글.slice(처음, 처음 + 400).includes('복원카드html(상태, 언어)'), '불러올 때 카드를 안 깐다')
})

test('미리보기를 그릴 때 굽는 중인지 넘긴다', () => {
  const 글 = readFileSync(new URL('../lib/chat.js', import.meta.url), 'utf8')
  assert.match(글, /미리보기html\(오른쪽\.밑그림, 언어, 상태\.구울것\?\.사진 \|\| '', 자리판,\s*상태\.일\?\.종류 === '만들기'\)/)
})

test('화풍을 바꿔도 미리보기를 통째로 다시 그리지 않는다 — 굽는 중 단추가 되살아나지 않게', () => {
  // 검토 I-2(2026-09-29): 통째로 다시 그리면 「이대로 만들기」 단추가 켜진 채로 새로 그려져,
  // 굽는 동안 다시 눌러 사진값이 두 번 나갈 수 있었다. 예시 그림과 안내 두 곳만 갈아 끼운다.
  const 글 = readFileSync(new URL('../lib/chat.js', import.meta.url), 'utf8')
  const 처음 = 글.indexOf('const 화풍고치기')
  assert.ok(처음 > 0, '화풍고치기가 없다')
  const 몸 = 글.slice(처음, 글.indexOf('\n  }\n', 처음))
  assert.ok(!몸.includes('오른쪽띄우기'), '화풍을 바꾸면서 미리보기를 통째로 다시 그린다')
  assert.match(몸, /미리-화풍그림/)
  assert.match(몸, /미리-화풍안내/)
})

test('화풍 카드를 누르면 이름을 말로, 번호를 몸에 실어 보낸다', () => {
  const 글 = readFileSync(new URL('../lib/chat.js', import.meta.url), 'utf8')
  assert.match(글, /closest\('\.hwa-pick'\)/)
  assert.match(글, /보내기\(h\.dataset\['이름'\] \|\| '', \{ 화풍: h\.dataset\['화풍'\] \|\| '' \}\)/)
  assert.match(글, /답\.무엇 === '화풍'/)
})

// **첫 인사는 «링크만 주면 바꿔 준다» 고 말하지 않는다**(사람 지시 2026-09-28).
// 인스타 게시물이 템플릿이 되려면 사람이 장마다 글자·사진 자리에 네모를 쳐야 한다.
test('첫 인사는 사람이 네모를 쳐야 템플릿이 된다고 말한다', () => {
  const 한 = 화면말.뭐로만들까.한국어()
  assert.ok(!/링크만|변환해/.test(한), 한)
  assert.ok(한.includes('네모'), `사람이 네모를 친다는 말이 없다: ${한}`)
  assert.ok(/draw boxes/i.test(화면말.뭐로만들까.영어()), 화면말.뭐로만들까.영어())
})
