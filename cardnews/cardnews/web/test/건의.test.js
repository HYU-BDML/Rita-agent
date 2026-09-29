// 건의함 — 쓰다가 남긴 말을 받아 모은다(교수님 요청 2026-09-21).
//
// **두 문 다 암호가 없다.** 적는 쪽에 걸면 아무도 안 쓰고, 읽는 쪽은 사람이
// 「어차피 `/건의` 를 안 치면 모르는 거잖아」라고 정했다. 그 대신 **이름을
// 안 받는다** — 문이 열려 있는 만큼 익명이 값을 한다. 여기 시험이 지키는 것이
// 그 둘이다.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import worker from '../_worker.js'
import { 건의검사, 건의넣기, 건의목록, 글최대 } from '../server/건의.js'

const PW = 'password-1234'

// 넣은 줄을 그대로 들고 있는 가짜 표. 칸 차례가 어긋나면 여기서 드러난다.
function 가짜표() {
  const 줄들 = []
  return {
    줄들,
    마지막SQL: '',
    prepare(sql) {
      this.마지막SQL = sql
      const q = { sql, args: [] }
      q.bind = (...a) => { q.args = a; return q }
      q.run = async () => {
        줄들.push({ id: q.args[0], body: q.args[1], screen: q.args[2],
                   made: q.args[3], at: q.args[4] })
        return {}
      }
      q.all = async () => ({ results: 줄들.slice() })
      return q
    },
  }
}

const 환경 = (db = 가짜표()) => ({ DB: db, BOARD_PASSWORD: PW })
const 부름 = (path, opts = {}) => new Request(`https://x.test${path}`, opts)
const 적기 = (몸) => 부름('/api/suggest', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(몸),
})

// ── 형식 검사 ──────────────────────────────────────────────────────

test('빈 글은 안 받는다', () => {
  for (const 몸 of [{}, { 글: '' }, { 글: '   ' }, { 글: null }]) {
    assert.equal(건의검사(몸).why, '내용을 적어 주세요')
  }
})

test('긴 글은 버리지 않고 잘라서 받는다', () => {
  // 길게 썼는데 통째로 버리면 쓴 사람은 그 글을 다시 못 살린다.
  const { why, 줄 } = 건의검사({ 글: 'ㄱ'.repeat(글최대 + 500) })
  assert.equal(why, undefined)
  assert.equal(줄.글.length, 글최대)
})

test('앞뒤 공백을 턴다', () => {
  assert.equal(건의검사({ 글: '  사진이 안 올라가요  ' }).줄.글, '사진이 안 올라가요')
})

test('이름 칸이 아예 없다 — 익명이다', () => {
  // 사람 결정 2026-09-21: 「익명으로 받을게」. 보내도 안 담긴다.
  const { 줄 } = 건의검사({ 글: 'ㄱ', 이름: '홍길동', name: '홍길동' })
  assert.deepEqual(Object.keys(줄).sort(), ['글', '카드뉴스', '화면'])
})

// ── 표에 넣고 꺼내기 ───────────────────────────────────────────────

test('넣은 칸 차례가 꺼낼 때와 맞는다', async () => {
  const db = 가짜표()
  await 건의넣기(db, { 글: '느려요', 화면: '작업대', 카드뉴스: 'https://x/w.html' },
                'abc', '2026-09-21T01:00:00Z')
  const [g] = await 건의목록(db)
  assert.deepEqual(g, { 번호: 'abc', 글: '느려요', 화면: '작업대',
                       카드뉴스: 'https://x/w.html', 때: '2026-09-21T01:00:00Z' })
})

test('최신 것이 위로 온다', async () => {
  // 차례를 화면에서 다시 뒤집지 않는다 — 표에 시키는 편이 한 곳이다.
  const db = 가짜표()
  await 건의목록(db)
  assert.match(db.마지막SQL, /ORDER BY at DESC/)
})

// ── 통로 ──────────────────────────────────────────────────────────

test('적는 데는 암호가 필요 없다 — 걸면 아무도 안 쓴다', async () => {
  const env = 환경()
  const res = await worker.fetch(적기({ 글: '글자가 작아요' }), env)
  assert.equal(res.status, 200)
  assert.equal(env.DB.줄들.length, 1)
  assert.equal(env.DB.줄들[0].body, '글자가 작아요')
})

test('어디서 눌렀는지가 같이 담긴다', async () => {
  // 글만 쌓이면 「이상해요」가 무엇을 두고 한 말인지 영영 모른다.
  const env = 환경()
  await worker.fetch(적기({ 글: 'ㄱ', 화면: '작업대', 카드뉴스: 'https://x/w.html' }), env)
  assert.equal(env.DB.줄들[0].screen, '작업대')
  assert.equal(env.DB.줄들[0].made, 'https://x/w.html')
})

test('빈 글은 400 이고 표에 안 들어간다', async () => {
  const env = 환경()
  const res = await worker.fetch(적기({ 글: ' ' }), env)
  assert.equal(res.status, 400)
  assert.equal(env.DB.줄들.length, 0)
})

test('몸통이 JSON 이 아니어도 죽지 않는다', async () => {
  const env = 환경()
  const res = await worker.fetch(부름('/api/suggest', { method: 'POST', body: '{' }), env)
  assert.equal(res.status, 400)
})

test('읽는 데도 암호가 없다', async () => {
  // 사람 결정 2026-09-21: 「어차피 /건의 를 안 치면 모르는 거잖아」.
  // 처음에는 출입증을 걸었다가 뺐다 — 주소를 아는 사람만 온다는 잣대다.
  const env = 환경()
  await worker.fetch(적기({ 글: '느려요' }), env)
  const res = await worker.fetch(부름('/api/suggest'), env)
  assert.equal(res.status, 200)
  const j = await res.json()
  assert.equal(j.건의.length, 1)
  assert.equal(j.건의[0].글, '느려요')
})

test('누가 썼는지는 어디에도 안 나온다', async () => {
  // 문을 열어 둔 만큼 익명이 값을 한다 — 쓴 사람을 가리키는 칸이 하나도 없다.
  const env = 환경()
  await worker.fetch(적기({ 글: 'ㄱ', 이름: '홍길동' }), env)
  const j = await (await worker.fetch(부름('/api/suggest'), env)).json()
  assert.deepEqual(Object.keys(j.건의[0]).sort(), ['글', '때', '번호', '카드뉴스', '화면'])
})

// ── 보는 쪽 주소 ───────────────────────────────────────────────────

test('/건의 를 열면 보는 쪽이 나온다', async () => {
  // 브라우저는 한글을 퍼센트로 바꿔 보낸다. 풀어서 견주지 않으면 영영 안 맞는다.
  let 물은것 = ''
  const env = { ...환경(), ASSETS: { fetch: (req) => { 물은것 = req.url; return new Response('쪽') } } }
  for (const 주소 of ['/건의', '/%EA%B1%B4%EC%9D%98', '/건의/']) {
    물은것 = ''
    const res = await worker.fetch(부름(주소), env)
    assert.equal(res.status, 200, 주소)
    // `.html` 을 붙여 부르면 정적 파일 쪽이 뗀 주소로 307 을 돌려준다 —
    // 브라우저가 옮겨 가면서 주소창의 `/건의` 가 사라진다(실측 2026-09-21).
    assert.match(물은것, /\/suggestions$/, 주소)
  }
})
