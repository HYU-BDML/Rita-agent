import { test } from 'node:test'
import assert from 'node:assert/strict'
import { 표확인, 출입증만들기, 출입증맞나, 실려온것, 머리이름, 수명초, 표최대 }
  from '../server/출입증.js'
import worker, { 돈나가는문 } from '../_worker.js'

// ── 출입증 짓고 보기 ────────────────────────────────────────────────
//
// **저장하지 않는다.** 만료 시각에 서명을 붙여 두고 그것만 본다.

const 비밀 = '시험용비밀'

test('만든 출입증은 통과한다', async () => {
  assert.equal(await 출입증맞나(비밀, await 출입증만들기(비밀)), true)
})

test('딴 비밀로는 못 만든다', async () => {
  assert.equal(await 출입증맞나(비밀, await 출입증만들기('딴비밀')), false)
})

test('시간이 지나면 안 통한다', async () => {
  const 표 = await 출입증만들기(비밀, Date.now())
  const 나중 = Date.now() + (수명초 + 10) * 1000
  assert.equal(await 출입증맞나(비밀, 표, 나중), false)
})

test('만료 시각만 미래로 고쳐 써도 안 통한다', async () => {
  // 만료가 글에 드러나 있다 — 그것만 고쳐 넣는 것이 제일 쉬운 공격이다.
  const 표 = await 출입증만들기(비밀)
  const 서명 = 표.slice(표.indexOf('.'))
  const 늘린것 = `${Math.floor(Date.now() / 1000) + 99999}${서명}`
  assert.equal(await 출입증맞나(비밀, 늘린것), false)
})

test('이상한 꼴은 다 거절한다', async () => {
  for (const x of ['', '.', '아무거나', '123', '123.', 'abc.def', null, undefined]) {
    assert.equal(await 출입증맞나(비밀, x), false, String(x))
  }
})

test('비밀이 없으면 아무도 못 들어온다', async () => {
  assert.equal(await 출입증맞나('', await 출입증만들기(비밀)), false)
})

// ── 표 되묻기 ───────────────────────────────────────────────────────
//
// **이걸 안 하면 위젯은 장식일 뿐이다** — 표는 아무 글자나 지어 보낼 수 있다.

const 가짜부르기 = (답, 본것) => async (u, init) => {
  본것.push({ url: String(u), init })
  return { json: async () => 답 }
}

test('Cloudflare 가 참이라 하면 참이다', async () => {
  const 본것 = []
  assert.equal(await 표확인(비밀, '표값', '1.2.3.4', 가짜부르기({ success: true }, 본것)), true)
  assert.match(본것[0].url, /challenges\.cloudflare\.com/)
})

test('거짓이라 하면 거짓이다', async () => {
  assert.equal(await 표확인(비밀, '표값', '', 가짜부르기({ success: false }, [])), false)
})

test('되묻지도 않는 경우 — 비밀이 없거나 표가 없거나 너무 길다', async () => {
  const 본것 = []
  const 손 = 가짜부르기({ success: true }, 본것)
  assert.equal(await 표확인('', '표값', '', 손), false)
  assert.equal(await 표확인(비밀, '', '', 손), false)
  assert.equal(await 표확인(비밀, 'ㄱ'.repeat(표최대 + 1), '', 손), false)
  assert.equal(본것.length, 0, '헛되이 되묻지 않는다')
})

test('실려온것 — 머리말에서 읽는다', () => {
  const r = new Request('https://x.test/', { headers: { [머리이름]: ' 1790.ab ' } })
  assert.equal(실려온것(r), '1790.ab')
  assert.equal(실려온것(new Request('https://x.test/')), '')
})

test('출입증은 아스키뿐이다 — 아니면 머리말에 못 싣는다', async () => {
  // HTTP 머리말 값은 바이트 글자만 받는다. 한글이 한 자라도 섞이면 브라우저가
  // 요청을 아예 못 만든다 — 시험에서 실제로 여기에 걸렸다.
  const 표 = await 출입증만들기(비밀)
  assert.match(표, /^[0-9]+\.[0-9a-f]+$/)
  assert.doesNotThrow(() => new Request('https://x.test/', { headers: { [머리이름]: 표 } }))
})

// ── 어느 문에 거나 ──────────────────────────────────────────────────

test('돈이 나가는 문만 고른다', () => {
  for (const 문 of ['chat', 'draft', 'bake', 'make', 'ingest', 'upload']) {
    assert.equal(돈나가는문(['api', 문], 'POST'), true, 문)
  }
  assert.equal(돈나가는문(['api', 'analyze', 'ABC123'], 'POST'), true)
})

test('람다가 되부르는 문은 안 건다 — 막으면 담기가 죽는다', () => {
  // `analyze/담기.게시판에얹기` 가 `POST /api/picks` 와 `PUT /api/slide/…` 를 부른다.
  assert.equal(돈나가는문(['api', 'picks'], 'POST'), false)
  assert.equal(돈나가는문(['api', 'slide', 'x', '1'], 'PUT'), false)
})

test('읽기만 하는 것은 안 건다', () => {
  assert.equal(돈나가는문(['api', 'chat'], 'GET'), false)
  assert.equal(돈나가는문(['api', 'jobs', 'job_x'], 'GET'), false)
  assert.equal(돈나가는문(['api', 'analyze'], 'POST'), false, '코드가 없으면 그 문이 아니다')
  assert.equal(돈나가는문(['api', 'pass'], 'POST'), false, '표를 받는 문 자체는 열려 있어야 한다')
})


// ── 쓰는데 안 들여온 것 (실물 2026-09-23) ───────────────────────────
//
// 화면에서 「보내지 못했어요: 붙여보내기 is not defined」가 떴다. 패치 script 에
// 「들머리를 못 찾으면 건너뛴다」를 넣어 둬서 `chat.js` 만 조용히 빠졌다.
// **조용히 빠지는 것이 제일 나쁘다** — 시험도 배포도 다 통과했다.
//
// 브라우저 파일이라 여기서 불러 돌릴 수는 없다. 글자를 읽어서 본다.

import { readFileSync } from 'node:fs'

const 읽기 = (자리) => readFileSync(new URL(자리, import.meta.url), 'utf8')

test('출입증을 쓰는 화면 파일은 반드시 들여온다', () => {
  for (const 파일 of ['chat.js', 'board.js', 'label.js', '출입증.js']) {
    const 글 = 읽기(`../lib/${파일}`)
    const 쓴다 = /(?<!function\s)붙여보내기\s*\(/.test(글)
    const 들여온다 = /import\s*\{[^}]*붙여보내기[^}]*\}\s*from\s*'\.\/출입증\.js'/.test(글)
      || 파일 === '출입증.js'
    assert.ok(!쓴다 || 들여온다, `${파일} 이 붙여보내기 를 쓰는데 안 들여온다`)
  }
})

test('돈 나가는 문을 부르는 화면 파일은 출입증을 거친다', () => {
  // 맨 `fetch` 로 부르면 401 이 떨어진다 — 사람에게는 「보내지 못했어요」로 보인다.
  const 돈문 = ['/api/chat', '/api/bake', '/api/draft', '/api/make',
              '/api/ingest', '/api/upload', '/api/analyze']
  for (const 파일 of ['chat.js', 'board.js', 'label.js']) {
    const 글 = 읽기(`../lib/${파일}`)
    for (const 줄 of 글.split(String.fromCharCode(10))) {
      if (!줄.includes('fetch(')) continue
      for (const 문 of 돈문) {
        assert.ok(!줄.includes(문),
          `${파일} 이 ${문} 을 맨 fetch 로 부른다 — 붙여보내기 를 써야 한다`)
      }
    }
  }
})
