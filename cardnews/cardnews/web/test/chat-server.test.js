import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  할일들, 말최대, checkChatBody, parseReply, systemPrompt, askDeepseek, 봇말, 언어들, 보일이름,
  고른것찾기, 화풍찾기, 화풍알아서,
  로고안씀, 쓸로고, 로고정했나, 쓸사진들, 사진최대,
} from '../server/chat.js'

const 틀들 = [{ 코드: 'AAA', 이름: '파란 타임라인', 미리보기: 'https://x/a.jpg' },
            { 코드: 'BBB', 이름: '키키' }]

test('할 일은 정확히 일곱이다', () => {
  assert.deepEqual(할일들,
    ['대답', '틀보기', '틀고르기', '저장', '만들기', '되묻기', '고르기'])
})


// ── 선택창 (사람 결정 2026-09-19) ─────────────────────────────────
//
// 주제를 받으면 바로 만들지 않는다. 템플릿에 맞춰 **주제 3안** 을 지어 단추로
// 띄우고, 고르면 **말투 3벌** 을 띄운다. 둘 다 「직접 입력」 을 같이 둔다.
//
// 열린 물음(「누구 대상이에요?」)보다 고르기가 낫다 — 사람이 생각하지 않고
// 누르기만 하면 되고, 고른 것이 곧 확정이라 되묻기가 한 바퀴 줄어든다.

test('고르기는 고를 것들을 함께 낸다', () => {
  const r = parseReply(JSON.stringify({
    할일: '고르기', 말: '어떤 쪽으로 갈까요?', 무엇: '주제',
    고를것: ['직장인이 놓치는 공제 3가지', '작년과 달라진 점', 'D-30 체크리스트'],
  }))
  assert.equal(r.할일, '고르기')
  assert.equal(r.무엇, '주제')
  assert.deepEqual(r.고를것,
    ['직장인이 놓치는 공제 3가지', '작년과 달라진 점', 'D-30 체크리스트'])
})

test('고를것은 글자 목록만 받는다 — 객체·숫자는 버린다', () => {
  // 화면이 그대로 단추로 그리므로, 글자가 아니면 «[object Object]» 가 찍힌다.
  const r = parseReply(JSON.stringify({
    할일: '고르기', 무엇: '주제', 고를것: ['좋은 것', 3, { a: 1 }, '', '또 하나'],
  }))
  assert.deepEqual(r.고를것, ['좋은 것', '또 하나'])
})

test('고를것이 너무 많으면 앞에서 셋만 쓴다', () => {
  // 단추가 다섯 개씩 깔리면 고르는 사람이 지친다. 셋 + 직접 입력이면 넉넉하다.
  const r = parseReply(JSON.stringify({
    할일: '고르기', 무엇: '주제', 고를것: ['1', '2', '3', '4', '5'],
  }))
  assert.deepEqual(r.고를것, ['1', '2', '3'])
})

test('고를것이 비면 고르기가 아니다 — 단추 없는 선택창은 막다른 길이다', () => {
  assert.equal(parseReply(JSON.stringify({ 할일: '고르기', 무엇: '주제', 고를것: [] })), null)
  assert.equal(parseReply(JSON.stringify({ 할일: '고르기', 무엇: '주제' })), null)
})

test('무엇은 주제 하나뿐이다 — 말투는 안 묻는다', () => {
  // 말투도 고르게 하려다 뺐다(사람 결정 2026-09-19). 저장된 말투 10벌이 값이
  // 거의 같아서(인칭·물음표훅은 10벌 전부 같고 어미도 7벌이 명사형) 골라 봐야
  // 결과가 안 달라진다. 말투는 템플릿에 딸린 것을 쓴다.
  assert.equal(parseReply(JSON.stringify({
    할일: '고르기', 무엇: '말투', 고를것: ['키키 말투'],
  })), null)
  assert.equal(parseReply(JSON.stringify({
    할일: '고르기', 무엇: '색깔', 고를것: ['빨강'],
  })), null)
})

test('지시문이 고르기를 시키고, 주제는 템플릿에 맞춰 세 개를 지으라 한다', () => {
  const p = systemPrompt(틀들, { 틀: { 이름: '키키', 코드: 'BBB' } })
  assert.match(p, /"고르기"/)
  assert.match(p, /주제/)
  assert.match(p, /말투/)
  // 값은 한국어 그대로여야 한다 — `parseReply` 가 글자까지 맞춰 본다.
  assert.match(p, /고를것/)
})

test('빈 말·너무 긴 말·이상한 대화 번호는 거른다', () => {
  assert.match(checkChatBody({ 말: '  ' }).why, /비었/)
  assert.match(checkChatBody({ 말: 'ㅁ'.repeat(말최대 + 1) }).why, /깁니다/)
  assert.match(checkChatBody({ 말: '안녕', 대화: 'abc' }).why, /대화 번호/)
  assert.deepEqual(checkChatBody({ 말: ' 안녕 ' }),
    { 말: '안녕', 대화: '', 언어: '한국어', 다시: false })
  const id = 'a'.repeat(32)
  assert.deepEqual(checkChatBody({ 말: '안녕', 대화: id }),
    { 말: '안녕', 대화: id, 언어: '한국어', 다시: false })
})

// **「다시」는 화면이 알려 준다**(사람 지시 2026-09-22). 서버가 말을 읽어
// 알아내려 하면 언어마다 문구가 달라 깨진다.
test('「다시」 칸은 참일 때만 참이다 — 딴 값은 거짓으로 떨어뜨린다', () => {
  assert.equal(checkChatBody({ 말: '가', 다시: true }).다시, true)
  assert.equal(checkChatBody({ 말: '가', 다시: 'true' }).다시, false)
  assert.equal(checkChatBody({ 말: '가', 다시: 1 }).다시, false)
  assert.equal(checkChatBody({ 말: '가' }).다시, false)
})

test('checkChatBody — 화풍은 목록에 있는 번호와 「알아서」만 싣는다', () => {
  assert.equal(checkChatBody({ 말: '가', 화풍: '537' }).화풍, '537')
  assert.equal(checkChatBody({ 말: '가', 화풍: '기본' }).화풍, '기본')
  assert.equal(checkChatBody({ 말: '가', 화풍: '알아서' }).화풍, '알아서')
  for (const 값 of ['999', 537, null, '']) {
    assert.ok(!('화풍' in checkChatBody({ 말: '가', 화풍: 값 })), String(값))
  }
  assert.ok(!('화풍' in checkChatBody({ 말: '가' })))
})

test('JSON 이 아니면 null — 아무것도 실행하지 않는다', () => {
  assert.equal(parseReply('네, 틀을 골라 드릴게요'), null)
  assert.equal(parseReply(''), null)
  assert.equal(parseReply('{"할일":"삭제","말":"x"}'), null)   // 여섯 밖
  assert.equal(parseReply('["대답"]'), null)
})

test('코드펜스에 싸여 와도 벗겨 읽는다', () => {
  const r = parseReply('```json\n{"할일":"틀고르기","틀":"AAA","말":"골랐어요"}\n```')
  assert.deepEqual(r,
    { 할일: '틀고르기', 말: '골랐어요', 틀: 'AAA', url: '', 주제: '',
      원고: '', 담을까: '', 사진: '', 로고: '' })
})

test('칸은 글자만 받는다 — 숫자·객체는 빈 글자로', () => {
  const r = parseReply('{"할일":"만들기","주제":42,"틀":{"코드":"A"}}')
  assert.deepEqual(r,
    { 할일: '만들기', 말: '', 틀: '', url: '', 주제: '',
      원고: '', 담을까: '', 사진: '', 로고: '' })
})

// **말투는 코드가 정한다**(사람 지적 2026-09-21: 「이건 llm이 아니라 코드야」).
// 모델이 없는 이름(「키키 말투」)을 지어내 초안이 404 로 멈췄다.
test('모델이 말투를 적어 보내도 읽지 않는다 — 말투는 코드가 정한다', () => {
  const r = parseReply('{"할일":"만들기","주제":"AI","말투":"키키 말투"}')
  assert.ok(!('말투' in r), '모델이 낸 말투가 그대로 읽혔다')
})

test('지시문에는 템플릿 이름·코드, 지금 상태, 여섯 할 일이 다 들어간다', () => {
  // 화면 용어를 「템플릿」으로 바꾼 뒤(사람 지시 2026-09-19) 지시문의 설명하는
  // 말도 같이 바뀌었다. **값(`"틀보기"`)은 그대로다.**
  const p = systemPrompt(틀들, { 틀: { 코드: 'BBB', 이름: '키키' } })
  for (const s of ['파란 타임라인', 'AAA', '키키', 'BBB', '"틀보기"', '"되묻기"', '고른 템플릿: 키키']) {
    assert.ok(p.includes(s), `지시문에 ${s} 가 없다`)
  }
  assert.ok(!p.includes('미리보기'), '그림 주소는 딥시크에 안 준다')
})

function withFetch(reply, fn) {
  const real = globalThis.fetch
  const calls = []
  globalThis.fetch = async (u, init) => { calls.push({ url: String(u), init }); return reply(String(u), init) }
  return fn(calls).finally(() => { globalThis.fetch = real })
}

test('딥시크에 열쇠를 머리말로 붙이고 JSON 답만 요구한다', () =>
  withFetch(() => new Response(JSON.stringify({ choices: [{ message: { content: '{"할일":"대답","말":"응"}' } }] })),
    async (calls) => {
      const r = await askDeepseek({ DEEPSEEK_API_KEY: 'sk-test-1234', DEEPSEEK_MODEL: 'deepseek-chat' },
        [{ role: 'user', content: '안녕' }])
      assert.deepEqual(r, { ok: true, text: '{"할일":"대답","말":"응"}' })
      assert.equal(calls[0].url, 'https://api.deepseek.com/chat/completions')
      assert.equal(calls[0].init.headers.authorization, 'Bearer sk-test-1234')
      const body = JSON.parse(calls[0].init.body)
      assert.equal(body.model, 'deepseek-chat')
      assert.deepEqual(body.response_format, { type: 'json_object' })
    }))

test('딥시크가 거절하면 이유를 주되 열쇠는 안 실린다', () =>
  withFetch(() => new Response(JSON.stringify({ error: { message: 'Insufficient Balance' } }), { status: 402 }),
    async () => {
      const r = await askDeepseek({ DEEPSEEK_API_KEY: 'sk-test-1234' }, [])
      assert.equal(r.ok, false)
      assert.match(r.why, /Insufficient Balance/)
      assert.ok(!r.why.includes('sk-test-1234'))
    }))

test('그물이 끊기면 그 이유를 준다', () =>
  withFetch(() => { throw new Error('ECONNRESET') }, async () => {
    const r = await askDeepseek({ DEEPSEEK_API_KEY: 'k' }, [])
    assert.deepEqual(r, { ok: false, why: 'ECONNRESET' })
  }))

test('세 번 다 비면 실패다 — 되풀이로 돌지 않는다', () =>
  withFetch(() => new Response(JSON.stringify({ choices: [{ message: { content: '  ' } }] })),
    async (calls) => {
      const r = await askDeepseek({ DEEPSEEK_API_KEY: 'k' }, [])
      assert.deepEqual(r, { ok: false, why: '빈 답을 받았습니다' })
      assert.equal(calls.length, 3, '세 번만 불러야 한다')
    }))

// **다시 물을 때는 물음을 조금 바꾼다**(2026-09-28 실물: 「비워 둘게요」에 빈 답이 두 번).
// 흔들림 0(temperature 0)으로 같은 물음을 그대로 다시 하면 같은 빈 답이 온다 —
// 둘째는 JSON 강제를 빼고, 셋째는 조금 흔든다.
test('빈 답 뒤에 다시 물을 때는 물음을 조금 바꾼다', () =>
  withFetch(() => new Response(JSON.stringify({ choices: [{ message: { content: '' } }] })),
    async (calls) => {
      await askDeepseek({ DEEPSEEK_API_KEY: 'k' }, [{ role: 'user', content: '비워 둘게요' }])
      const 몸들 = calls.map((c) => JSON.parse(c.init.body))
      assert.deepEqual(몸들[0].response_format, { type: 'json_object' })
      assert.equal(몸들[0].temperature, 0)
      assert.equal(몸들[1].response_format, undefined, '둘째는 JSON 강제를 뺀다')
      assert.equal(몸들[1].temperature, 0)
      assert.equal(몸들[2].response_format, undefined)
      assert.equal(몸들[2].temperature, 0.7, '셋째는 조금 흔든다')
      assert.deepEqual(몸들[2].messages, 몸들[0].messages, '대화 내용은 그대로다')
    }))

test('빈 답이 오면 한 번 더 묻는다', () => {
  // 실물 2026-09-19: 사람이 같은 말을 세 번 쳐서 세 번 다 「빈 답을 받았습니다」를
  // 봤는데, 새 대화에서 같은 말은 바로 됐다. 띄엄띄엄 나고 다시 물으면 된다.
  let 번 = 0
  return withFetch(() => {
    번 += 1
    const content = 번 === 1 ? '' : '{"할일":"대답","말":"응"}'
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }))
  }, async (calls) => {
    const r = await askDeepseek({ DEEPSEEK_API_KEY: 'k' }, [])
    assert.deepEqual(r, { ok: true, text: '{"할일":"대답","말":"응"}' })
    assert.equal(calls.length, 2)
  })
})

test('잔액 없음·그물 끊김은 다시 안 묻는다 — 돈만 두 배로 나간다', async () => {
  await withFetch(() => new Response(JSON.stringify({ error: { message: 'Insufficient Balance' } }),
    { status: 402 }), async (calls) => {
    const r = await askDeepseek({ DEEPSEEK_API_KEY: 'k' }, [])
    assert.equal(r.ok, false)
    assert.equal(calls.length, 1, '402 는 한 번만 불러야 한다')
  })
  await withFetch(() => { throw new Error('ECONNRESET') }, async (calls) => {
    const r = await askDeepseek({ DEEPSEEK_API_KEY: 'k' }, [])
    assert.deepEqual(r, { ok: false, why: 'ECONNRESET' })
    assert.equal(calls.length, 1, '그물 끊김은 한 번만 불러야 한다')
  })
})

import { runTurn, 코드뽑기, 생각켤까 } from '../server/chat.js'
import { fakeDb } from './fixtures/fake-db.js'
// 상태를 미리 깔아 두고 «그다음 판» 만 보려고 쓴다.
import { saveConversation } from '../server/conversations.js'

function deps(답JSON, extra = {}) {
  const 부른것 = { 딥시크: [], 담기: [], 초안: [] }
  return {
    부른것,
    d: {
      틀읽기: async () => 틀들,
      딥시크: async (messages) => { 부른것.딥시크.push(messages); return typeof 답JSON === 'string' ? { ok: true, text: 답JSON } : 답JSON },
      담기: async (url) => { 부른것.담기.push(url); return { ok: true, job_id: 'job-1' } },
      초안: async (몸) => { 부른것.초안.push(몸); return { ok: true, job_id: 'job-2' } },
      // **채팅은 이제 한 번에 가는 문을 안 쓴다**(사람 결정 2026-09-19
      // 「항상 거친다」). 그리로 새면 사람이 못 본 채로 사진 값이 나간다 —
      // 조용히 지나가지 말고 여기서 터뜨린다.
      만들기: async () => { throw new Error('채팅이 굽는 문을 곧장 불렀다') },
      now: () => '2026-09-16T01:00:00Z',
      ...extra,
    },
  }
}

test('코드뽑기 — p 와 reel, 꼬리 쿼리', () => {
  assert.equal(코드뽑기('https://www.instagram.com/p/DHqCBQnRAjW/?igsh=1'), 'DHqCBQnRAjW')
  assert.equal(코드뽑기('https://instagram.com/reel/AB-c_9/'), 'AB-c_9')
  assert.equal(코드뽑기('https://x.com/p/AAA/'), '')
})

test('대화 번호가 없으면 새로 만들고, 사람 말과 봇 말이 저장된다', async () => {
  const db = fakeDb()
  const { d } = deps('{"할일":"대답","말":"안녕하세요"}')
  const 답 = await runTurn({ DB: db }, { 대화: '', 말: '안녕' }, d)
  assert.match(답.대화, /^[0-9a-f]{32}$/)
  assert.equal(답.말, '안녕하세요')
  const saved = JSON.parse(db.rows.get(답.대화).messages)
  assert.deepEqual(saved.map((m) => [m.역할, m.말]), [['사람', '안녕'], ['봇', '안녕하세요']])
})

test('딥시크에 지시문 + 최근 기록 + 이번 말을 준다', async () => {
  const db = fakeDb()
  const { d, 부른것 } = deps('{"할일":"대답","말":"응"}')
  const 첫 = await runTurn({ DB: db }, { 대화: '', 말: '첫말' }, d)
  await runTurn({ DB: db }, { 대화: 첫.대화, 말: '둘째' }, d)
  const m = 부른것.딥시크[1]
  assert.equal(m[0].role, 'system')
  assert.deepEqual(m.slice(1).map((x) => [x.role, x.content]),
    [['user', '첫말'], ['assistant', '응'], ['user', '둘째']])
})

test('JSON 이 아니면 아무것도 실행하지 않고 못 알아들었다고 한다', async () => {
  const db = fakeDb()
  const { d, 부른것 } = deps('그냥 글')
  const 답 = await runTurn({ DB: db }, { 대화: '', 말: 'x' }, d)
  assert.match(답.말, /못 알아들었/)
  assert.equal(부른것.담기.length + 부른것.초안.length, 0)
  assert.equal(답.일, undefined)
})

test('딥시크가 죽으면 그 이유를 말로 돌려준다', async () => {
  const { d } = deps({ ok: false, why: '딥시크 HTTP 500' })
  const 답 = await runTurn({ DB: fakeDb() }, { 대화: '', 말: 'x' }, d)
  assert.match(답.말, /딥시크 HTTP 500/)
})

test('틀보기 — 틀 카드가 실리고 오른쪽은 틀목록', async () => {
  const { d } = deps('{"할일":"틀보기","말":"이런 틀이 있어요"}')
  const 답 = await runTurn({ DB: fakeDb() }, { 대화: '', 말: '틀 보여줘' }, d)
  assert.deepEqual(답.틀카드, [{ 코드: 'AAA', 이름: '파란 타임라인', 표지: 'https://x/a.jpg' },
                             { 코드: 'BBB', 이름: '키키', 표지: '' }])
  assert.deepEqual(답.오른쪽, { 종류: '틀목록' })
})

test('틀고르기 — 코드로 찾아 상태에 기억하고 오른쪽은 그 틀', async () => {
  const db = fakeDb()
  const { d } = deps('{"할일":"틀고르기","틀":"AAA","말":"골랐어요"}')
  const 답 = await runTurn({ DB: db }, { 대화: '', 말: '파란 타임라인으로' }, d)
  assert.deepEqual(답.상태.틀, { 코드: 'AAA', 이름: '파란 타임라인' })
  assert.deepEqual(답.오른쪽, { 종류: '틀', 코드: 'AAA' })
  assert.match(답.말, /파란 타임라인/)
})

test('틀고르기 — 이름으로 와도 찾는다', async () => {
  const { d } = deps('{"할일":"틀고르기","틀":"키키","말":"네"}')
  const 답 = await runTurn({ DB: fakeDb() }, { 대화: '', 말: '키키' }, d)
  assert.deepEqual(답.상태.틀, { 코드: 'BBB', 이름: '키키' })
})

test('틀고르기 — 없는 틀이면 카드를 다시 주고 상태는 안 바꾼다', async () => {
  const { d } = deps('{"할일":"틀고르기","틀":"ZZZ","말":"네"}')
  const 답 = await runTurn({ DB: fakeDb() }, { 대화: '', 말: '없는 틀' }, d)
  assert.equal(답.상태.틀, null)
  assert.match(답.말, /없/)
  assert.equal(답.틀카드.length, 2)
})

test('저장 — 담기를 걸고 지켜보기를 기억한다', async () => {
  const { d, 부른것 } = deps('{"할일":"저장","url":"https://www.instagram.com/p/DHqCBQnRAjW/","담을까":"네","말":"담을게요"}')
  const 답 = await runTurn({ DB: fakeDb() }, { 대화: '', 말: 'https://www.instagram.com/p/DHqCBQnRAjW/' }, d)
  assert.deepEqual(부른것.담기, ['https://www.instagram.com/p/DHqCBQnRAjW/'])
  assert.deepEqual(답.일, { 번호: 'job-1', 종류: '담김' })
  assert.deepEqual(답.상태.지켜보기, { 코드: 'DHqCBQnRAjW', 일번호: 'job-1', 부터: '2026-09-16T01:00:00Z' })
  assert.match(답.말, /담는 중/)
})

test('저장 — 상태에 일도 남는다', async () => {
  const { d } = deps('{"할일":"저장","url":"https://www.instagram.com/p/DHqCBQnRAjW/","담을까":"네","말":"담을게요"}')
  const 답 = await runTurn({ DB: fakeDb() }, { 대화: '', 말: 'https://www.instagram.com/p/DHqCBQnRAjW/' }, d)
  assert.deepEqual(답.상태.일, { 번호: 'job-1', 종류: '담김' })
})

test('저장 — 인스타 주소가 아니면 담기를 안 부른다', async () => {
  const { d, 부른것 } = deps('{"할일":"저장","url":"https://x.com/p/A/","말":"담을게요"}')
  const 답 = await runTurn({ DB: fakeDb() }, { 대화: '', 말: 'x' }, d)
  assert.equal(부른것.담기.length, 0)
  assert.match(답.말, /instagram\.com/)
})

test('저장 — 담기가 거절하면 그 이유를 말한다', async () => {
  const { d } = deps('{"할일":"저장","url":"https://www.instagram.com/p/A1/","담을까":"네","말":"x"}',
    { 담기: async () => ({ ok: false, why: '서버가 답을 안 준다' }) })
  const 답 = await runTurn({ DB: fakeDb() }, { 대화: '', 말: 'x' }, d)
  assert.match(답.말, /서버가 답을 안 준다/)
  assert.equal(답.일, undefined)
})

test('만들기 — 틀 이름·주제로 걸고, 모델이 말투를 적어도 안 보낸다', async () => {
  const db = fakeDb()
  const { d, 부른것 } = deps('{"할일":"만들기","틀":"AAA","주제":"AI 소식","말투":"파란 타임라인 말투","말":"만들게요"}')
  const 답 = await runTurn({ DB: db }, { 대화: '', 말: 'AI 소식으로 만들어줘' }, d)
  // **사진·로고가 여기 없다.** 굽는 값이라 `상태.구울것` 으로 옮겼다 —
  // 사람이 미리보기를 보는 사이에 바꿀 수 있다.
  // **말투 칸이 아예 없다**(2026-09-24). 받는 쪽에 그 칸이 없어졌다 — 틀을
  // 고르면 그 틀의 말투로 간다. 모델이 적어 보낸 「파란 타임라인 말투」는 버린다.
  assert.deepEqual(부른것.초안,
    [{ 주제: 'AI 소식', 틀: '파란 타임라인',
      원고: '', 언어: '한국어', 사진들: [] }])
  assert.deepEqual(답.일, { 번호: 'job-2', 종류: '미리보기' })
  assert.deepEqual(답.상태.틀, { 코드: 'AAA', 이름: '파란 타임라인' })
})

test('지시문은 말투를 모델에게 맡기지 않는다 — 목록도 칸도 없다', () => {
  // 모델이 고르게 두었더니 없는 이름을 지어 넘겨 초안이 404 로 멈췄다.
  const p = systemPrompt(틀들, {})
  assert.ok(!p.includes('말투 목록'), '말투 목록이 모델에게 갔다')
  assert.ok(!p.includes('"말투":'), '답 모양에 말투 칸이 있다')
  assert.match(p, /말투는 정하지 않는다/)
})

test('화면 글자를 「템플릿」으로 바꿔도 주고받는 값은 「틀」 그대로다', () => {
  // **사람 결정 2026-09-19: 「웹에서 틀→템플릿이라고 바꾸고」.** 보이는 글자만
  // 바꾼다. 아래 여섯은 봇과 서버가 주고받는 **약속**이라 바꾸면 답이 통째로
  // 버려지고, 사람은 무슨 말을 해도 「못 알아들었어요」만 보게 된다.
  assert.deepEqual(할일들,
    ['대답', '틀보기', '틀고르기', '저장', '만들기', '되묻기', '고르기'])
  // 봇 대사(보이는 글자)에는 「틀」이 남아 있으면 안 된다 — 열쇠 이름은 빼고.
  for (const [열쇠, 벌] of Object.entries(봇말)) {
    const 글 = String(벌.한국어('x', 'y'))
    assert.ok(!/(^|[^템플릿])틀/.test(글), `${열쇠} 에 「틀」이 남았다: ${글}`)
  }
})

test('영어면 틀 이름도 영어로 보여 주되, 찾는 열쇠는 한국어 그대로다', () => {
  // **이름은 찾는 열쇠로도 쓰인다**(`runTurn` 이 `틀: 틀.이름` 으로 람다에 보낸다).
  // 열쇠까지 영어로 바꾸면 창고에서 그 틀을 못 찾는다. 보여 주는 것만 바꾼다.
  const 틀 = { 코드: 'AAA', 이름: '파스텔 둥근네모', 이름영어: 'Pastel Rounded' }
  assert.equal(보일이름(틀, '영어'), 'Pastel Rounded')
  assert.equal(보일이름(틀, '한국어'), '파스텔 둥근네모')
  assert.equal(보일이름(틀), '파스텔 둥근네모')
})

test('영어 이름이 없으면 한국어 이름을 그대로 보여 준다', () => {
  // 틀마다 영어 이름을 채우는 데는 시간이 걸린다. 안 채운 틀도 보여야 한다.
  assert.equal(보일이름({ 코드: 'AAA', 이름: '키키' }, '영어'), '키키')
  assert.equal(보일이름({ 코드: 'AAA', 이름: '키키', 이름영어: '  ' }, '영어'), '키키')
  assert.equal(보일이름({ 코드: 'AAA' }, '영어'), 'AAA', '이름이 없으면 코드')
})

test('봇 대사는 열쇠마다 두 언어가 다 있다', () => {
  // 한쪽이 빠지면 **그 자리만** 한국어로 튀어나온다. 하필 오류 문구라
  // 사람이 제일 답답할 때 나온다.
  for (const [열쇠, 벌] of Object.entries(봇말)) {
    for (const 언어 of 언어들) {
      assert.equal(typeof 벌[언어], 'function', `${열쇠} 에 ${언어} 가 없다`)
      assert.ok(String(벌[언어]('x', 'y')).trim(), `${열쇠} / ${언어} 가 빈 말이다`)
    }
  }
})

test('영어 대사에 한글이 섞여 있지 않다', () => {
  for (const [열쇠, 벌] of Object.entries(봇말)) {
    const 글 = String(벌.영어('x', 'y'))
    assert.ok(!/[가-힣]/.test(글), `${열쇠} 영어 대사에 한글이 있다: ${글}`)
  }
})

test('인자를 덜 넘기면 undefined 가 문장에 박힌다 — 그걸 알고 있다', () => {
  // 2026-09-18 검토 지적. 시험이 늘 두 개를 넘겨서 자리가 뒤바뀌어도 초록이었다.
  // **이 시험은 고치라는 뜻이 아니라, 부르는 쪽이 인자를 맞춰야 한다는 못이다.**
  // 아래가 바뀌면 `봇말` 의 인자 개수가 바뀐 것이니 부르는 자리를 다 보라.
  assert.equal(봇말.만드는중.영어('키키', 'AI'),
    'Making a carousel about "AI" with "키키" (usually 5 min).')
  assert.match(String(봇말.만드는중.영어('키키')), /undefined/)
})

test('오류 사유가 한국어여도 영어 문장이 깨지진 않는다 — 다만 섞인다', () => {
  // **이건 통과가 아니라 기록이다.** 깊은 층이 내는 사유는 아직 한국어다
  // (`askDeepseek` 의 '빈 답을 받았습니다', `_worker` 의 '서버가 답을 안 준다').
  // 영어 사용자는 영어 문장 안에 한국어 조각을 본다. 고칠 때 이 시험을 뒤집어라.
  const 글 = 봇말.못답함.영어('빈 답을 받았습니다')
  assert.equal(글, "I can't answer right now: 빈 답을 받았습니다")
  assert.ok(/[가-힣]/.test(글), '사유가 영어로 바뀌었으면 이 시험을 지워라')
})

test('영어를 고르면 봇도 영어로 답한다', () => {
  const p = systemPrompt(틀들, {}, '영어')
  assert.ok(!p.includes('말은 한국어 한두 문장'), '한국어로 답하라는 줄이 남아 있다')
  assert.match(p, /영어로/, '영어로 답하라는 말이 없다')
})

test('지시문 자체는 통째로 한국어다 — 영어를 골라도', () => {
  // **실물 2026-09-18.** 영어일 때 이 줄만 영어 문장으로 썼더니 딥시크가
  // **빈 답**을 냈다. 두 번 다 실패했고 한국어로는 같은 물음이 잘 됐다.
  // 사용자에게는 「I can't answer right now: 빈 답을 받았습니다」만 보였다.
  //
  // 지시문 스물다섯 줄이 전부 한국어인데 거기 영어 한 줄이 끼면 모델이
  // 흔들린다. **모델에게 주는 말의 언어와 모델이 낼 답의 언어는 다른
  // 문제다** — 지시는 한국어로 하고 「영어로 써라」라고만 시킨다.
  const p = systemPrompt(틀들, {}, '영어')
  const 줄들 = p.split('\n').filter((x) => x.trim())
  const 영어만 = 줄들.filter((x) => !/[가-힣]/.test(x) && /[A-Za-z]{4,}/.test(x))
  // 틀·말투 목록 줄은 이름이 영어일 수 있으니 뺀다
  const 남은것 = 영어만.filter((x) => !x.startsWith('- ') && !x.includes('instagram.com'))
  assert.deepEqual(남은것, [], `지시문에 영어 문장이 끼었다:\n${남은것.join('\n')}`)
})

test('영어라도 할 일 이름은 한국어 낱말 그대로 받는다', () => {
  // `parseReply` 가 여섯 한국어 낱말과 대조해 안 맞으면 답을 **통째로 버린다**.
  // 「영어로 답해라」만 넣고 이걸 안 박으면 모델이 "make" 를 내고, 사용자는
  // 무슨 말을 하든 「못 알아들었어요」만 보게 된다.
  const 영 = systemPrompt(틀들, {}, '영어')
  const 한 = systemPrompt(틀들, {}, '한국어')
  for (const 할 of 할일들) assert.ok(영.includes(`"${할}"`), `${할} 가 없다`)
  // **한국어 쪽에는 없고 영어 쪽에만 있어야 한다.** 2026-09-18 검토에서
  // 이 단언이 한국어 프롬프트에도 그대로 성립해 아무것도 안 지키고 있었다
  // (58줄의 「할일:」 이 걸렸다). 두 판을 견줘야 진짜로 지킨다.
  assert.match(영, /영어로 옮기지 마라/, '할일 값을 옮기지 말라는 말이 없다')
  assert.ok(!/영어로 옮기지 마라/.test(한), '한국어 판에 영어 지시가 샜다')
})

test('아무 말 없으면 봇 지시문이 한 글자도 안 바뀐다', () => {
  assert.equal(systemPrompt(틀들, {}), systemPrompt(틀들, {}, '한국어'))
  assert.ok(systemPrompt(틀들, {}).includes('말은 한국어 한두 문장, 존댓말.'))
})

test('언어를 실으면 그대로 넘긴다 — 모르는 값은 한국어로 떨어진다', () => {
  // 화면이 보내는 낱말은 둘뿐이다. 「en」·「English」·오타가 와도 카드는
  // 나와야 한다 — 안 나오는 것보다 한국어로 나오는 편이 낫다.
  assert.equal(checkChatBody({ 말: '안녕', 언어: '영어' }).언어, '영어')
  assert.equal(checkChatBody({ 말: '안녕' }).언어, '한국어')
  assert.equal(checkChatBody({ 말: '안녕', 언어: 'English' }).언어, '한국어')
  assert.equal(checkChatBody({ 말: '안녕', 언어: 42 }).언어, '한국어')
})

test('만들기 — 고른 언어를 람다까지 실어 보낸다', async () => {
  // 이 값이 빠지면 람다가 한국어로 떨어뜨린다. 카드는 나오고 한국어일
  // 뿐이라 **눈으로 못 잡는다.**
  const { d, 부른것 } = deps('{"할일":"만들기","틀":"AAA","주제":"AI 소식","말":"만들게요"}')
  await runTurn({ DB: fakeDb() }, { 대화: '', 말: '만들어줘', 언어: '영어' }, d)
  assert.equal(부른것.초안[0].언어, '영어')
})


test('만들기 — 상태에 일도 남는다', async () => {
  const { d } = deps('{"할일":"만들기","틀":"AAA","주제":"AI 소식","말":"만들게요"}')
  const 답 = await runTurn({ DB: fakeDb() }, { 대화: '', 말: 'AI 소식으로 만들어줘' }, d)
  assert.deepEqual(답.상태.일, { 번호: 'job-2', 종류: '미리보기' })
})

test('만들기 — 틀을 안 말했으면 상태의 틀을 쓴다', async () => {
  const db = fakeDb()
  const 고름 = deps('{"할일":"틀고르기","틀":"BBB","말":"네"}')
  const 첫 = await runTurn({ DB: db }, { 대화: '', 말: '키키' }, 고름.d)
  const { d, 부른것 } = deps('{"할일":"만들기","주제":"연말정산","말":"네"}')
  await runTurn({ DB: db }, { 대화: 첫.대화, 말: '연말정산으로' }, d)
  assert.equal(부른것.초안[0].틀, '키키')
  // **말투 칸은 아예 없다**(2026-09-24) — 틀을 고르면 그 틀의 말투로 간다.
  assert.ok(!('말투' in 부른것.초안[0]), '말투 칸이 되살아났다')
})

test('만들기 — 틀도 주제도 없으면 걸지 않고 되묻는다', async () => {
  const { d, 부른것 } = deps('{"할일":"만들기","말":"네"}')
  const 답 = await runTurn({ DB: fakeDb() }, { 대화: '', 말: '만들어줘' }, d)
  assert.equal(부른것.초안.length, 0)
  assert.match(답.말, /템플릿/)   // 보이는 글자는 「템플릿」이다(2026-09-19)
  assert.equal(답.틀카드.length, 2)
  const 답2 = await runTurn({ DB: fakeDb() },
    { 대화: '', 말: 'x' }, deps('{"할일":"만들기","틀":"AAA","말":"네"}').d)
  assert.match(답2.말, /주제/)
})

test('되묻기·대답은 말만 돌려주고 상태를 안 바꾼다', async () => {
  const { d } = deps('{"할일":"되묻기","말":"어떤 틀로 할까요?"}')
  const 답 = await runTurn({ DB: fakeDb() }, { 대화: '', 말: '음' }, d)
  assert.equal(답.말, '어떤 틀로 할까요?')
  assert.equal(답.일, undefined)
  assert.equal(답.틀카드, undefined)
})


// ── 영어로 고를 때 ─────────────────────────────────────────────────
//
// 실물 2026-09-19: 영어로 열면 화면에도 지시문에도 **영어 이름**이 뜨는데,
// 틀을 찾는 쪽은 한국어 이름과 코드만 알고 있었다. 그래서 모델이 화면에서
// 본 그대로 「Idol Branding」 이라 답하면 「그런 템플릿이 없어요」가 됐다.

const 영어틀들 = [{ 코드: 'AAA', 이름: '파란 타임라인', 이름영어: 'Blue Timeline', 미리보기: 'https://x/a.jpg' },
                { 코드: 'BBB', 이름: '키키' }]

test('영어 이름으로 골라도 그 틀을 찾는다', async () => {
  const { d } = deps('{"할일":"틀고르기","틀":"Blue Timeline","말":"Got it"}', { 틀읽기: async () => 영어틀들 })
  const 답 = await runTurn({ DB: fakeDb() }, { 대화: '', 말: 'Blue Timeline', 언어: '영어' }, d)
  assert.equal(답.상태.틀?.코드, 'AAA', '화면에 보인 이름 그대로 답했는데 못 찾으면 고를 길이 없다')
  assert.equal(답.상태.틀?.이름, 'Blue Timeline', '화면에는 영어 이름이 뜬다')
})

test('영어로 골라도 람다로 가는 값은 창고에 적힌 이름이다', async () => {
  // 영어 이름을 실어 보내면 람다가 창고를 뒤지다 못 찾는다(이름 정확 일치).
  const { d, 부른것 } = deps('{"할일":"만들기","틀":"Blue Timeline","주제":"coffee","말":"ok"}',
    { 틀읽기: async () => 영어틀들 })
  await runTurn({ DB: fakeDb() }, { 대화: '', 말: 'make it', 언어: '영어' }, d)
  assert.equal(부른것.초안[0].틀, '파란 타임라인')
})

test('한국어 이름으로도 그대로 찾는다 — 영어 이름이 있어도', async () => {
  const { d } = deps('{"할일":"틀고르기","틀":"파란 타임라인","말":"네"}', { 틀읽기: async () => 영어틀들 })
  const 답 = await runTurn({ DB: fakeDb() }, { 대화: '', 말: '파란 타임라인' }, d)
  assert.equal(답.상태.틀?.코드, 'AAA')
})


test('거르다 걸린 까닭도 고른 언어로 나온다', () => {
  // 이 글은 말풍선에 그대로 뜬다. 영어로 열었는데 여기만 한국어면 제일 답답할 때
  // 한국어가 나온다(실물 2026-09-19).
  assert.equal(checkChatBody({ 말: '  ', 언어: '영어' }).why, 'You did not type anything.')
  const 긴것 = 말최대 + 1
  assert.match(checkChatBody({ 말: 'x'.repeat(긴것), 언어: '영어' }).why,
    new RegExp(`too long \\(${긴것} characters\\)`))
  assert.match(checkChatBody({ 말: '안녕', 대화: 'abc', 언어: '영어' }).why, /conversation id/)
  // 한국어는 그대로다
  assert.equal(checkChatBody({ 말: '  ' }).why, '말이 비었습니다')
})

test('거를 때도 고른 언어를 같이 돌려준다', () => {
  // 돌려주지 않으면 부르는 쪽이 어느 말로 적을지 모른다.
  assert.equal(checkChatBody({ 말: '  ', 언어: '영어' }).언어, '영어')
})


// ── 모델에게 쓰는 낱말 ─────────────────────────────────────────────
//
// 사람 지시 2026-09-19: 화면 용어를 「틀」→「템플릿」으로. 봇이 하는 말 중
// **모델이 스스로 쓰는 `말`** 은 우리가 못 고친다 — 지시문의 낱말을 따라간다.
// 그래서 지시문의 «설명하는 말»을 템플릿으로 맞추고, **값은 그대로** 둔다.

test('지시문은 사람에게 「템플릿」이라 말하라고 시킨다', () => {
  const p = systemPrompt(틀들, { 틀: { 코드: 'AAA', 이름: '키키' } })
  assert.match(p, /「템플릿」이라고 한다/, '안 시키면 모델이 「틀」이라고 말한다')
})

test('지시문의 설명하는 말은 「템플릿」이다', () => {
  const p = systemPrompt(틀들, {})
  assert.match(p, /템플릿 목록:/)
  assert.match(p, /고른 템플릿: 없음/)
  assert.doesNotMatch(p, /어떤 틀이 있는지/)
})

test('값은 그대로다 — 할 일 이름과 칸 이름', () => {
  // 여기를 바꾸면 `parseReply` 가 모델 답을 통째로 버려서, 사람이 무슨 말을
  // 하든 「못 알아들었어요」만 나온다.
  const p = systemPrompt(틀들, {})
  for (const 값 of ['"틀보기"', '"틀고르기"', '칸: 틀(코드)', '"틀":"…"']) {
    assert.ok(p.includes(값), `지시문에서 값 ${값} 이 사라졌다`)
  }
  assert.deepEqual(할일들,
    ['대답', '틀보기', '틀고르기', '저장', '만들기', '되묻기', '고르기'])
})


test('봇이 하는 말도 「틀」이 아니라 「템플릿」이라고 한다', () => {
  // 화면말 표와 같은 잣대다(chat-ui.test.js). 「틀리다」 계열은 뜻이 달라 봐준다.
  const 남은것 = []
  for (const [열쇠, 값] of Object.entries(봇말)) {
    const 글 = String(값.한국어('X', 'Y'))
    if (/틀(?![리린렸림])/.test(글)) 남은것.push(`${열쇠}: ${글}`)
  }
  assert.deepEqual(남은것, [])
})

test('영어로 하는 말도 design 이 아니라 template 이라고 한다', () => {
  // 화면 탭은 「Templates」인데 봇만 「design」이라 부르면 같은 것을 두 이름으로
  // 부르는 셈이다(실물 2026-09-19).
  const 남은것 = []
  for (const [열쇠, 값] of Object.entries(봇말)) {
    const 글 = String(값.영어('X', 'Y'))
    if (/\bdesigns?\b/i.test(글)) 남은것.push(`${열쇠}: ${글}`)
  }
  assert.deepEqual(남은것, [])
})


// ── 개인 템플릿은 지시문에도 안 싣는다 ─────────────────────────────
//
// 오른쪽 칸은 브라우저가 걸러 내지만(`lib/내템플릿.js`), **모델에게 주는 목록**
// 은 서버가 만든다. 거기 남의 개인 템플릿이 들어가면 봇이 그 이름을 말해 버린다
// — 화면에 안 그려도 말로 새는 셈이다.
//
// 자기 것은 지시문에 없어도 쓸 수 있다 — 분석이 끝나면 `상태.틀` 에 박히고,
// 만들기는 거기서 코드를 집는다.

const 섞인틀들 = [{ 코드: 'PUB', 이름: '공용 템플릿' },
                { 코드: 'MINE', 이름: '남의 개인 템플릿', 개인: true }]

test('지시문에 개인 템플릿은 안 적는다', () => {
  const p = systemPrompt(섞인틀들, {})
  assert.match(p, /공용 템플릿/)
  assert.doesNotMatch(p, /남의 개인 템플릿/, '봇이 남의 템플릿 이름을 말하게 된다')
})

test('개인 템플릿이라도 코드로 고른 것은 그대로 만든다', async () => {
  // 제 것을 만든 사람은 `상태.틀` 로 들고 있다. 지시문에 없다고 못 쓰면 안 된다.
  const { d, 부른것 } = deps('{"할일":"만들기","주제":"커피","말":"ok"}',
    { 틀읽기: async () => 섞인틀들 })
  const 답 = await runTurn({ DB: fakeDb() },
    { 대화: '', 말: '만들어줘' }, d)
  assert.ok(답)  // 상태 없이는 되묻는다 — 아래에서 상태를 주고 다시 본다
  const { d: d2, 부른것: 부른것2 } = deps(
    '{"할일":"만들기","틀":"MINE","주제":"커피","말":"ok"}',
    { 틀읽기: async () => 섞인틀들 })
  const 답2 = await runTurn({ DB: fakeDb() }, { 대화: '', 말: '만들어줘' }, d2)
  assert.equal(부른것2.초안[0]?.틀, '남의 개인 템플릿')
})

// ── 원고 붙이기 (사람 결정 2026-09-19) ────────────────────────────
//
// 람다는 진작부터 `원고` 칸을 받는다(`render/app.py`). 웹 채팅만 안 보냈다.
// 그래서 원고를 붙여 넣어도 **주제로 요약돼 내용이 통째로 사라졌다.**
//
// 막는 것이 둘이었다 — ① 채팅이 1,000자에서 자른다(리타 쪽은 20,000자다)
// ② `parseReply` 와 만들기 봉투에 `원고` 칸이 없다.

test('원고를 붙일 만큼 길게 받는다', () => {
  // 원고 한 편이 1,000자를 넘는다. 리타 API 쪽 상한(20,000)과 맞춘다.
  assert.equal(말최대, 20000)
  assert.ok(!checkChatBody({ 말: 'ㄱ'.repeat(5000) }).why, '5,000자가 막혔다')
  assert.match(checkChatBody({ 말: 'ㄱ'.repeat(20001) }).why, /깁니다/)
})

test('만들기가 원고를 같이 낸다', () => {
  const r = parseReply(JSON.stringify({
    할일: '만들기', 틀: 'AAA', 주제: '연말정산', 원고: '지난달 국세청이…',
  }))
  assert.equal(r.원고, '지난달 국세청이…')
})

test('원고가 없으면 빈 글자다 — 없는 칸으로 두지 않는다', () => {
  const r = parseReply(JSON.stringify({ 할일: '만들기', 틀: 'AAA', 주제: '연말정산' }))
  assert.equal(r.원고, '')
})

test('지시문이 긴 글은 원고로 담으라고 시킨다', () => {
  const p = systemPrompt(틀들, {})
  assert.match(p, /원고/)
})

test('주소를 붙이면 담기 전에 먼저 묻는다', async () => {
  const db = fakeDb()
  // **`담을까` 가 비어 있다** — 주소를 «처음» 붙인 자리다.
  const { d, 부른것 } = deps(JSON.stringify({
    할일: '저장', url: 'https://www.instagram.com/p/AAA111/',
  }))
  const 답 = await runTurn({ DB: db }, { 대화: '', 말: 'https://www.instagram.com/p/AAA111/' }, d)
  assert.equal(부른것.담기.length, 0, '묻기 전에 담았다')
  assert.match(답.말, /네모/)          // 무엇을 해야 하는지
  assert.ok(답.고를것 && 답.고를것.length >= 2, '고를 것을 안 줬다')
})

test('「네」라고 하면 그때 담는다', async () => {
  const db = fakeDb()
  const { d, 부른것 } = deps(JSON.stringify({
    할일: '저장', url: 'https://www.instagram.com/p/AAA111/', 담을까: '네',
  }))
  await runTurn({ DB: db }, { 대화: '', 말: '네, 할게요' }, d)
  assert.equal(부른것.담기.length, 1)
  assert.equal(부른것.담기[0], 'https://www.instagram.com/p/AAA111/')
})

test('봇이 하는 말에 별표를 안 쓴다 — 말풍선은 글자를 그대로 낸다', () => {
  // `말칸html` 은 글을 그대로 내보내고 줄바꿈만 <br> 로 바꾼다. 그래서 **굵게**
  // 라고 적으면 화면에 별표가 그대로 보인다(실물 2026-09-19: 「you need to
  // **draw boxes** around」).
  const 남은것 = []
  for (const [열쇠, 값] of Object.entries(봇말)) {
    for (const 말 of 언어들) {
      const 글 = String(값[말]('X', 'Y'))
      if (글.includes('**')) 남은것.push(`${열쇠}(${말}): ${글}`)
    }
  }
  assert.deepEqual(남은것, [])
})


// ── 사진을 비울까 만들까 ────────────────────────────────────────────
//
// 사람 결정 2026-09-19: 「비워둘지 이미지 만들지 선택하겠금 하고싶어」.
//
// 사진 자리는 여태 회색 네모에 물음표로 남았다(`template_render`). 그게 나쁜
// 것은 아니지만 **고를 수 있어야 한다** — 완성본을 바로 받고 싶은 사람도 있다.
// 돈이 나가는 쪽이라(한 장 $0.01029) 묻지 않고 켜면 안 된다.
//
// 담기 전에 묻는 길과 **같은 결**이다 — 단추를 누르면 그 말이 사람이 친 말로
// 다시 들어오고, 그때 딥시크가 `사진` 칸을 채워 보낸다.

// 사진 자리가 둘인 틀. `틀하나읽기` 가 돌려주는 모양 그대로다.
const 사진둘 = {
  코드: 'AAA',
  슬라이드: [
    { 장식영역: [{ 종류: '사진' }, { 종류: '도형' }] },
    { 장식영역: [{ 종류: '인물' }, { 종류: '로고' }] },
  ],
}
const 사진없음 = { 코드: 'BBB', 슬라이드: [{ 장식영역: [{ 종류: '도형' }] }] }
// CTA 장은 세지 않는다 — 그 자리는 AI 가 못 만드는 «자기 소개» 자리다.
const 사진과CTA = {
  코드: 'AAA',
  슬라이드: [
    { 역할: '사례', 장식영역: [{ 종류: '사진' }] },
    { 역할: 'CTA', 장식영역: [{ 종류: '사진' }, { 종류: '사진' }] },
  ],
}

test('사진 자리가 있으면 만들기 전에 먼저 묻는다', async () => {
  const { d, 부른것 } = deps(
    JSON.stringify({ 할일: '만들기', 틀: 'AAA', 주제: '연말정산' }),
    { 틀하나읽기: async () => 사진둘 })
  const 답 = await runTurn({ DB: fakeDb() }, { 대화: '', 말: '연말정산으로 만들어 줘' }, d)
  assert.equal(부른것.초안.length, 0, '묻기 전에 만들었다')
  assert.equal(답.무엇, '사진')
  assert.equal(답.고를것.length, 2)
  assert.match(답.말, /2/, '몇 자리인지 안 알려 준다')
})

// ── 참조해서 만들기 (사람 결정 2026-09-28) ─────────────────────────
//
// 올린 사진을 자리에 꽂는 것이 아니라 그 사진 속 사람·물건으로 새 장면을 만든다.
// 그러면 「비워 둘까요 / AI 가 만들까요」를 물을 것이 없다 — 만드는 판이다.

test('참조 판이면 사진을 안 묻고 «만듦» 으로 초안을 건다', async () => {
  const db = fakeDb()
  const id = 있던대화(db, { 틀: { 코드: 'AAA', 이름: '파란 타임라인' },
    사진들: 올린사진(1), 사진쓰임: '참조', 바람: '카페 탁자 위에', 로고: 로고안씀, 화풍: '알아서' })
  const { d, 부른것 } = deps(
    JSON.stringify({ 할일: '만들기', 틀: 'AAA', 주제: '연말정산' }),
    { 틀하나읽기: async () => 사진둘 })
  const 답 = await runTurn({ DB: db }, { 대화: id, 말: '만들어 줘' }, d)
  assert.equal(답.무엇, undefined, '참조 판인데 사진을 또 물었다')
  assert.equal(부른것.초안.length, 1)
  assert.equal(부른것.초안[0].사진쓰임, '참조')
  assert.equal(부른것.초안[0].바람, '카페 탁자 위에')
  assert.deepEqual(부른것.초안[0].사진들, 올린사진(1))
  assert.equal(답.상태.구울것.사진, '만듦', '참조 판은 만드는 판이다')
})

test('참조 판이 아니면 사진쓰임·바람 칸이 아예 안 실린다', async () => {
  // 옛 봉투 모양 그대로다 — 람다는 칸이 없으면 「그대로」로 본다.
  const db = fakeDb()
  const id = 있던대화(db, { 틀: { 코드: 'AAA', 이름: '파란 타임라인' },
    사진들: 올린사진(2), 바람: '이건 안 실린다', 로고: 로고안씀 })
  const { d, 부른것 } = deps(
    JSON.stringify({ 할일: '만들기', 틀: 'AAA', 주제: '연말정산' }),
    { 틀하나읽기: async () => 사진둘 })
  await runTurn({ DB: db }, { 대화: id, 말: '만들어 줘' }, d)
  assert.ok(!('사진쓰임' in 부른것.초안[0]), '참조 판이 아닌데 사진쓰임이 실렸다')
  assert.ok(!('바람' in 부른것.초안[0]), '참조 판이 아닌데 바람이 실렸다')
})

test('참조를 골랐어도 사진이 없으면 여태 물음 그대로', async () => {
  const db = fakeDb()
  const id = 있던대화(db, { 틀: { 코드: 'AAA', 이름: '파란 타임라인' }, 사진쓰임: '참조' })
  const { d, 부른것 } = deps(
    JSON.stringify({ 할일: '만들기', 틀: 'AAA', 주제: '연말정산' }),
    { 틀하나읽기: async () => 사진둘 })
  const 답 = await runTurn({ DB: db }, { 대화: id, 말: '만들어 줘' }, d)
  assert.equal(답.무엇, '사진')
  assert.equal(부른것.초안.length, 0)
})

test('「비워 두기」를 고르면 그때 만들고 봉투에 비움이 실린다', async () => {
  const { d, 부른것 } = deps(
    // `사진둘` 에는 로고 자리도 하나 있다 — 로고 관문을 같이 지나게 답한다.
    // 이 시험이 보는 것은 사진 칸이다.
    JSON.stringify({ 할일: '만들기', 틀: 'AAA', 주제: '연말정산', 사진: '비움', 로고: '없음' }),
    { 틀하나읽기: async () => 사진둘 })
  const 답 = await runTurn({ DB: fakeDb() }, { 대화: '', 말: '비워 둘게요' }, d)
  assert.equal(부른것.초안.length, 1)
  assert.equal(답.상태.구울것.사진, '비움')
})

test('「AI로 만들기」를 고르면 봉투에 만듦이 실린다', async () => {
  // 화풍은 이미 골랐다 — 이 시험이 보는 것은 사진 칸이다.
  const db = fakeDb()
  const id = 있던대화(db, { 화풍: '알아서' })
  const { d, 부른것 } = deps(
    JSON.stringify({ 할일: '만들기', 틀: 'AAA', 주제: '연말정산', 사진: '만듦', 로고: '없음' }),
    { 틀하나읽기: async () => 사진둘 })
  const 답 = await runTurn({ DB: db }, { 대화: id, 말: 'AI로 만들어 주세요' }, d)
  assert.equal(부른것.초안.length, 1)
  assert.equal(답.상태.구울것.사진, '만듦')
})

test('사진 자리가 없는 틀이면 안 묻고 바로 만든다', async () => {
  // 물어 봐야 고를 것이 없다 — 물음만 한 번 는다.
  const { d, 부른것 } = deps(
    JSON.stringify({ 할일: '만들기', 틀: 'BBB', 주제: '연말정산' }),
    { 틀하나읽기: async () => 사진없음 })
  const 답 = await runTurn({ DB: fakeDb() }, { 대화: '', 말: '만들어 줘' }, d)
  assert.equal(부른것.초안.length, 1)
  assert.equal(답.무엇, undefined)
})

// ── 화풍 고르기 (사람 결정 2026-09-29) ─────────────────────────────
//
// 「AI에 사진 맡기면 화풍 고르는 것을 채팅으로도 하자. 예시는 우리가 만든 것.」
// 초안 바로 앞 — 사진·로고 물음이 다 끝난 뒤에 묻는다.

test('AI로 만들기를 고르면 초안 전에 화풍을 묻는다', async () => {
  const { d, 부른것 } = deps(
    JSON.stringify({ 할일: '만들기', 틀: 'AAA', 주제: '연말정산', 사진: '만듦', 로고: '없음',
      원고: '붙여 넣은 원고' }),
    { 틀하나읽기: async () => 사진둘 })
  const 답 = await runTurn({ DB: fakeDb() }, { 대화: '', 말: 'AI가 만들어 주세요' }, d)
  assert.equal(부른것.초안.length, 0, '화풍을 묻기 전에 초안을 걸었다')
  assert.equal(답.무엇, '화풍')
  assert.deepEqual(답.상태.물은것, { 무엇: '화풍', 사진: '만듦', 원고: '붙여 넣은 원고' })
})

test('비워 두기 판은 화풍을 안 묻는다', async () => {
  const { d, 부른것 } = deps(
    JSON.stringify({ 할일: '만들기', 틀: 'AAA', 주제: '연말정산', 사진: '비움', 로고: '없음' }),
    { 틀하나읽기: async () => 사진둘 })
  const 답 = await runTurn({ DB: fakeDb() }, { 대화: '', 말: '비워 둘게요' }, d)
  assert.equal(답.무엇, undefined)
  assert.equal(부른것.초안.length, 1)
})

const 화풍묻는중 = (db, 더 = {}) => 있던대화(db, { 틀: { 코드: 'AAA', 이름: '파란 타임라인' },
  주제: '연말정산', 로고: 로고안씀, 물은것: { 무엇: '화풍', 사진: '만듦', 원고: '붙여 넣은 원고' }, ...더 })

test('화풍 카드를 누르면 딥시크 없이 그 화풍으로 초안을 건다', async () => {
  const db = fakeDb()
  const id = 화풍묻는중(db)
  const { d, 부른것 } = deps('딥시크를 부르면 안 된다', { 틀하나읽기: async () => 사진둘 })
  const 답 = await runTurn({ DB: db }, { 대화: id, 말: '어두운 초현실', 화풍: '537' }, d)
  assert.equal(부른것.딥시크.length, 0, '고른 것을 모델에게 또 물었다')
  assert.equal(부른것.초안.length, 1)
  assert.equal(부른것.초안[0].화풍, '537')
  assert.equal(부른것.초안[0].원고, '붙여 넣은 원고', '물을 때 받은 원고가 사라졌다')
  assert.equal(부른것.초안[0].주제, '연말정산')
  assert.equal(답.상태.구울것.사진, '만듦')
  assert.equal(답.상태.화풍, '', '다음 판에 옛 화풍이 몰래 실린다')
  assert.equal(답.상태.물은것, null)
})

test('「알아서」를 고르면 초안에 화풍 칸이 없다', async () => {
  const db = fakeDb()
  const id = 화풍묻는중(db)
  const { d, 부른것 } = deps('딥시크를 부르면 안 된다', { 틀하나읽기: async () => 사진둘 })
  await runTurn({ DB: db }, { 대화: id, 말: '알아서 (AI가 고름)', 화풍: 화풍알아서 }, d)
  assert.equal(부른것.초안.length, 1)
  assert.ok(!('화풍' in 부른것.초안[0]), '알아서인데 화풍 칸이 실렸다')
})

test('화풍 이름을 쳐도 누른 것과 같다', async () => {
  const db = fakeDb()
  const id = 화풍묻는중(db)
  const { d, 부른것 } = deps('딥시크를 부르면 안 된다', { 틀하나읽기: async () => 사진둘 })
  await runTurn({ DB: db }, { 대화: id, 말: ' 픽셀 그림 ' }, d)
  assert.equal(부른것.딥시크.length, 0)
  assert.equal(부른것.초안[0].화풍, '215')
})

test('화풍을 묻는 사이 딴 말을 하면 물음을 접고 딥시크로 간다', async () => {
  const db = fakeDb()
  const id = 화풍묻는중(db)
  const { d, 부른것 } = deps('{"할일":"대답","말":"네, 말씀하세요."}', { 틀하나읽기: async () => 사진둘 })
  const 답 = await runTurn({ DB: db }, { 대화: id, 말: '잠깐, 주제를 바꿀래' }, d)
  assert.equal(부른것.딥시크.length, 1)
  assert.equal(부른것.초안.length, 0)
  assert.equal(답.상태.물은것, null, '접은 물음이 다음 말을 «고른 것» 으로 읽는다')
  assert.equal(답.상태.화풍, '')
})

test('사진 단추 → 로고 단추 → 화풍 카드까지 모델 없이 이어진다', async () => {
  // 두 세션 일을 합친 뒤(2026-09-29): 사진·로고 단추 답(`단추답찾기`, 상태.사진)과 화풍 물음이
  // 한 흐름이다. 로고 답에는 «사진» 칸이 없으므로 화풍 물음은 적어 둔 사진 답을 봐야 한다.
  const db = fakeDb()
  const { d, 부른것 } = deps(JSON.stringify({ 할일: '만들기', 틀: 'AAA', 주제: '연말정산' }),
    { 틀하나읽기: async () => 사진둘 })
  let 답 = await runTurn({ DB: db }, { 대화: '', 말: '연말정산으로 만들어 줘' }, d)
  assert.equal(답.무엇, '사진')
  const id = 답.대화
  답 = await runTurn({ DB: db }, { 대화: id, 말: 봇말.사진만듦.한국어() }, d)
  assert.equal(답.무엇, '로고')
  답 = await runTurn({ DB: db }, { 대화: id, 말: 봇말.로고없이.한국어() }, d)
  assert.equal(답.무엇, '화풍', '로고 답 뒤에 «만듦» 이 끊겨 화풍을 안 물었다')
  답 = await runTurn({ DB: db }, { 대화: id, 말: '픽셀 그림', 화풍: '215' }, d)
  assert.equal(부른것.딥시크.length, 1, '처음 한 번만 모델을 불렀어야 한다')
  assert.equal(부른것.초안.length, 1)
  assert.equal(부른것.초안[0].화풍, '215')
  assert.equal(답.상태.구울것.사진, '만듦')
})

test('사진 자리가 없는 템플릿이면 «만듦» 이어도 화풍을 안 묻는다', async () => {
  // 딥시크가 «만듦» 을 먼저 적어 보내도 사진이 한 장도 안 들어가는 틀이다(2026-09-29 검토 M-3).
  const { d, 부른것 } = deps(
    JSON.stringify({ 할일: '만들기', 틀: 'BBB', 주제: '연말정산', 사진: '만듦' }),
    { 틀하나읽기: async () => 사진없음 })
  const 답 = await runTurn({ DB: fakeDb() }, { 대화: '', 말: 'AI가 사진도 만들어 줘' }, d)
  assert.equal(답.무엇, undefined, '사진이 한 장도 안 들어가는데 화풍을 물었다')
  assert.equal(부른것.초안.length, 1)
})

test('화풍찾기 — «알아서» 는 짧은 말일 때만, 이름은 띄어쓰기를 안 가린다', () => {
  // 「주제는 알아서 하지 말고…」 를 «알아서 골라» 로 받으면 바로 초안이 걸린다(2026-09-29 검토 M-5).
  const 물음 = { 무엇: '화풍' }
  assert.equal(화풍찾기(물음, '주제는 알아서 하지 말고 원고대로 써 줘', ''), '')
  assert.equal(화풍찾기(물음, '알아서 골라 줘', ''), 화풍알아서)
  assert.equal(화풍찾기(물음, '픽셀그림', ''), '215')
  assert.equal(화풍찾기(물음, 'pixelart', ''), '215')
})

test('묻는 중이 아닐 때 화풍 카드를 누르면 딥시크 없이 미리보기 칸을 가리킨다', async () => {
  // 초안을 건 뒤 채팅에 남은 카드를 누른 것이다(검토 I-3, 2026-09-29). 딥시크로 보내면
  // 화풍 이름을 주제로 읽는다 — 사람은 화풍을 바꾼 줄 아는데 아무것도 안 바뀐다.
  const db = fakeDb()
  const id = 있던대화(db, { 틀: { 코드: 'AAA', 이름: '파란 타임라인' }, 주제: '연말정산',
    로고: 로고안씀, 오른쪽: { 종류: '미리보기', 밑그림: { 화풍: '435' } } })
  const { d, 부른것 } = deps('딥시크를 부르면 안 된다', { 틀하나읽기: async () => 사진둘 })
  const 답 = await runTurn({ DB: db }, { 대화: id, 말: '어두운 초현실', 화풍: '537' }, d)
  assert.equal(부른것.딥시크.length, 0, '지난 카드를 모델에게 주제로 보냈다')
  assert.equal(부른것.초안.length, 0)
  assert.match(답.말, /미리보기/)
  assert.equal(답.상태.화풍, '')
})

test('화풍찾기 — 물은 것이 화풍일 때만, 번호·이름·영어 이름·알아서', () => {
  const 물음 = { 무엇: '화풍' }
  assert.equal(화풍찾기(물음, '아무 말', '537'), '537')
  assert.equal(화풍찾기(물음, '', 화풍알아서), 화풍알아서)
  assert.equal(화풍찾기(물음, 'Pixel Art', ''), '215')
  assert.equal(화풍찾기(물음, '그냥 알아서 해 줘', ''), 화풍알아서)
  assert.equal(화풍찾기(물음, 'Let AI pick', ''), 화풍알아서)
  assert.equal(화풍찾기(물음, '주제 바꿀래', ''), '')
  assert.equal(화풍찾기(물음, '아무 말', '999'), '')
  assert.equal(화풍찾기({ 무엇: '주제' }, '픽셀 그림', '215'), '', '화풍을 안 물었는데 받았다')
  assert.equal(화풍찾기(null, '픽셀 그림', ''), '')
})

test('틀을 못 읽어도 만들기는 걸린다 — 묻다가 멈추면 안 된다', async () => {
  // 창고가 잠깐 안 되는 것과 「사진 자리가 없다」는 다른 일이지만, 둘 다
  // **만들기를 막지는 않는다**. 사진은 지금까지처럼 빈 자리로 남는다.
  const { d, 부른것 } = deps(
    JSON.stringify({ 할일: '만들기', 틀: 'AAA', 주제: '연말정산' }),
    { 틀하나읽기: async () => { throw new Error('창고가 안 된다') } })
  await runTurn({ DB: fakeDb() }, { 대화: '', 말: '만들어 줘' }, d)
  assert.equal(부른것.초안.length, 1)
})

test('틀하나읽기 가 아예 없어도 만들기는 걸린다', async () => {
  // 옛 화면이 부르던 길이 그대로 살아야 한다.
  const { d, 부른것 } = deps(
    JSON.stringify({ 할일: '만들기', 틀: 'AAA', 주제: '연말정산' }))
  await runTurn({ DB: fakeDb() }, { 대화: '', 말: '만들어 줘' }, d)
  assert.equal(부른것.초안.length, 1)
})

test('사진 칸은 두 값만 받는다 — 딴 글자는 버린다', () => {
  const 판 = (x) => parseReply(JSON.stringify({ 할일: '만들기', 틀: 'AAA', 주제: 'ㄱ', 사진: x }))
  assert.equal(판('비움').사진, '비움')
  assert.equal(판('만듦').사진, '만듦')
  assert.equal(판('아무거나').사진, '')
  assert.equal(판(123).사진, '')
  assert.equal(parseReply(JSON.stringify({ 할일: '만들기', 틀: 'AAA', 주제: 'ㄱ' })).사진, '')
})

test('지시문이 사진 고르는 말을 어떻게 받아 적을지 알려 준다', () => {
  const p = systemPrompt(틀들, {})
  assert.match(p, /사진/)
  assert.match(p, /비움/)
  assert.match(p, /만듦/)
})
// ── 로고 (사람 지시 2026-09-19) ────────────────────────────────────
//
// 「채팅에 로고를 넣었으면 좋겠어. 로고 안 넣기를 선택하면 만들어질 때
// 로고 영역은 없어지는 거지」 — 그래서 **묻고 답을 받아야** 만들어진다.
//
// 사진과 다른 점 둘: ① 「올리기」는 말이 아니라 파일이라 딥시크를 안 거친다,
// ② 한 번 정하면 **그 대화 내내** 기억한다(사람 결정: 「가 — 대화마다」).

// 로고 자리 둘. 사진 자리는 일부러 안 넣었다 — 사진 관문이 먼저 서기 때문에
// 섞으면 무엇 때문에 멈춘 것인지 흐려진다.
const 로고둘 = {
  코드: 'AAA',
  슬라이드: [
    { 장식영역: [{ 종류: '로고' }, { 종류: '도형' }] },
    { 장식영역: [{ 종류: '로고' }] },
  ],
}
const 로고없음 = { 코드: 'BBB', 슬라이드: [{ 장식영역: [{ 종류: '도형' }] }] }

// 올린 로고가 앉는 곳. `render/app.upload_media` 가 돌려주는 모양 그대로다.
const 올린로고 = 'https://cardnews-render-554608989606.s3.ap-northeast-2.amazonaws.com/photos/ab12.png'

/** 상태를 미리 심어 둔 대화 하나. 새로고침해서 이어 하는 자리를 흉내낸다. */
function 있던대화(db, 상태) {
  const id = 'a'.repeat(32)
  db.rows.set(id, { id, created_at: '2026-09-19T00:00:00Z', updated_at: '2026-09-19T00:00:00Z',
    state: JSON.stringify(상태), messages: '[]' })
  return id
}

test('로고 자리가 있으면 만들기 전에 먼저 묻는다', async () => {
  const { d, 부른것 } = deps(
    JSON.stringify({ 할일: '만들기', 틀: 'AAA', 주제: '연말정산' }),
    { 틀하나읽기: async () => 로고둘 })
  const 답 = await runTurn({ DB: fakeDb() }, { 대화: '', 말: '연말정산으로 만들어 줘' }, d)
  assert.equal(부른것.초안.length, 0, '묻기 전에 만들었다')
  assert.equal(답.무엇, '로고')
  assert.deepEqual(답.고를것, [봇말.로고올리기.한국어(), 봇말.로고없이.한국어()])
  assert.match(답.말, /2/, '몇 자리인지 안 알려 준다')
})

test('「로고 없이」를 고르면 만들고, 봉투의 로고는 빈 글자다', async () => {
  const { d, 부른것 } = deps(
    JSON.stringify({ 할일: '만들기', 틀: 'AAA', 주제: '연말정산', 로고: '없음' }),
    { 틀하나읽기: async () => 로고둘 })
  const 답 = await runTurn({ DB: fakeDb() }, { 대화: '', 말: '로고 없이' }, d)
  assert.equal(부른것.초안.length, 1)
  assert.equal(답.상태.구울것.로고, '', '안 넣기로 했는데 주소가 실렸다')
  assert.equal(답.상태.로고, 로고안씀, '고른 것을 이 대화에 안 남겼다')
})

test('한 번 정하면 그 대화에서 다시 안 묻는다', async () => {
  // 사진은 만들 때마다 묻지만 로고는 안 묻는다 — 둘의 갈린 자리다.
  const db = fakeDb()
  const 대화 = 있던대화(db, { 틀: { 코드: 'AAA', 이름: '파란 타임라인' }, 로고: 로고안씀 })
  const { d, 부른것 } = deps(
    JSON.stringify({ 할일: '만들기', 틀: 'AAA', 주제: '두 번째' }),
    { 틀하나읽기: async () => { throw new Error('틀을 또 읽었다 — 이미 정했는데') } })
  const 답 = await runTurn({ DB: db }, { 대화, 말: '두 번째도 만들어 줘' }, d)
  assert.equal(답.무엇, undefined, '또 물었다')
  assert.equal(부른것.초안.length, 1)
})

test('올린 로고 주소가 있으면 안 묻고 봉투에 그대로 싣는다', async () => {
  const db = fakeDb()
  const 대화 = 있던대화(db, { 틀: { 코드: 'AAA', 이름: '파란 타임라인' }, 로고: 올린로고 })
  const { d, 부른것 } = deps(
    JSON.stringify({ 할일: '만들기', 틀: 'AAA', 주제: '연말정산' }),
    { 틀하나읽기: async () => 로고둘 })
  const 답 = await runTurn({ DB: db }, { 대화, 말: '만들어 줘' }, d)
  assert.equal(답.무엇, undefined, '이미 올렸는데 또 물었다')
  assert.equal(답.상태.구울것.로고, 올린로고)
})

test('우리 창고 밖 주소는 안 싣고, 정한 것으로도 안 친다', async () => {
  // 이 화면은 열린 주소다 — 로그인이 없어서 상태에 아무 주소나 적어 넣을 수
  // 있다. 그걸 그대로 실으면 굽는 Lambda 가 남의 주소를 대신 긁으러 간다.
  const db = fakeDb()
  const 대화 = 있던대화(db, { 틀: { 코드: 'AAA', 이름: '파란 타임라인' },
                          로고: 'https://evil.example/x.png' })
  const { d, 부른것 } = deps(
    JSON.stringify({ 할일: '만들기', 틀: 'AAA', 주제: '연말정산' }),
    { 틀하나읽기: async () => 로고둘 })
  const 답 = await runTurn({ DB: db }, { 대화, 말: '만들어 줘' }, d)
  assert.equal(부른것.초안.length, 0, '남의 주소로 만들기를 걸었다')
  assert.equal(답.무엇, '로고', '이상한 주소인데 정한 것으로 쳤다')
})

test('로고 자리가 없는 틀이면 안 묻고 바로 만든다', async () => {
  const { d, 부른것 } = deps(
    JSON.stringify({ 할일: '만들기', 틀: 'BBB', 주제: '연말정산' }),
    { 틀하나읽기: async () => 로고없음 })
  const 답 = await runTurn({ DB: fakeDb() }, { 대화: '', 말: '만들어 줘' }, d)
  assert.equal(답.무엇, undefined, '없는 자리를 물었다')
  assert.equal(부른것.초안.length, 1)
  assert.equal(답.상태.구울것.로고, '')
})

test('딥시크가 로고 주소를 지어내도 안 받는다', () => {
  // 모델이 적을 수 있는 값은 「없음」 하나뿐이다. 주소를 받아 주면 모델이
  // 지어낸 주소를 굽는 쪽이 긁으러 간다.
  assert.equal(parseReply('{"할일":"만들기","로고":"https://evil.example/x.png"}').로고, '')
  assert.equal(parseReply('{"할일":"만들기","로고":"네"}').로고, '')
  assert.equal(parseReply(`{"할일":"만들기","로고":"${로고안씀}"}`).로고, 로고안씀)
})

test('쓸로고·로고정했나 — 창고 것만 통과한다', () => {
  assert.equal(쓸로고(올린로고), 올린로고)
  assert.equal(쓸로고(' ' + 올린로고 + ' '), 올린로고, '앞뒤 빈칸을 안 턴다')
  for (const 나쁜것 of ['https://evil.example/x.png', 'javascript:alert(1)',
                      로고안씀, '', null, undefined, 42]) {
    assert.equal(쓸로고(나쁜것), '', `«${나쁜것}» 을 통과시켰다`)
  }
  assert.equal(로고정했나(올린로고), true)
  assert.equal(로고정했나(로고안씀), true)
  assert.equal(로고정했나(''), false)
  assert.equal(로고정했나(undefined), false)
  assert.equal(로고정했나('https://evil.example/x.png'), false)
})


test('CTA 장의 사진 자리는 세지 않는다', async () => {
  // 만드는 쪽이 CTA 를 건너뛰므로(`analyze/사진만들기.건너뛸역할`) 여기서도 빼야
  // 한다 — 안 그러면 「3자리」라고 해 놓고 1장만 만든다.
  const { d } = deps(
    JSON.stringify({ 할일: '만들기', 틀: 'AAA', 주제: '연말정산' }),
    { 틀하나읽기: async () => 사진과CTA })
  const 답 = await runTurn({ DB: fakeDb() }, { 대화: '', 말: '만들어 줘' }, d)
  assert.equal(답.무엇, '사진')
  assert.match(답.말, /1/, 'CTA 둘까지 세어 3 이라고 했다')
  assert.doesNotMatch(답.말, /3/)
})

// ── 왜 버렸는지 적는다 · 덩어리로 와도 받는다 (사람 결정 2026-09-19) ──
//
// 「왜 자꾸 이해를 못했다 다시 말해달라 이말이 왜나오는지 알아?」 — 그 말은
// 사람 말을 못 알아들은 것이 아니라 **모델이 낸 답을 우리가 버린 것**이다.
// 버리는 자리가 다섯인데 여태 아무 데도 안 적어서 무엇에 걸렸는지 몰랐다.

const 적힌것 = () => {
  const 쌓임 = []
  return [쌓임, (왜, 앞머리) => 쌓임.push(String(왜) + (앞머리 ? ' | ' + 앞머리 : ''))]
}

test('JSON 이 아니면 그렇다고 적는다', () => {
  const [쌓임, 적기] = 적힌것()
  assert.equal(parseReply('죄송하지만 그건 제가 답할 수 없어요', 적기), null)
  assert.equal(쌓임.length, 1)
  assert.match(쌓임[0], /JSON 이 아니다/)
})

test('할일이 여섯 밖이면 그 값을 적는다 — 무엇을 냈는지 알아야 고친다', () => {
  const [쌓임, 적기] = 적힌것()
  assert.equal(parseReply(JSON.stringify({ 할일: 'make', 말: '네' }), 적기), null)
  assert.match(쌓임[0], /할일이 여섯 밖이다/)
  assert.match(쌓임[0], /make/)
})

test('고를것이 비면 몇 개가 어떤 생김새로 왔는지 적는다', () => {
  const [쌓임, 적기] = 적힌것()
  assert.equal(parseReply(JSON.stringify({ 할일: '고르기', 무엇: '주제', 고를것: [1, 2] }), 적기), null)
  assert.match(쌓임[0], /고를것이 비었다/)
  assert.match(쌓임[0], /2개/)
})

test('사람이 쓴 글은 안 적는다 — 원고가 답 안에 들어 있다', () => {
  const [쌓임, 적기] = 적힌것()
  const 원고 = '우리 회사 비밀 계획은 다음 분기에 서울 지사를 연다는 것이다'
  parseReply(JSON.stringify({ 할일: 'make', 주제: 원고, 원고 }), 적기)
  for (const 줄 of 쌓임) assert.ok(!줄.includes('서울 지사'), '사람 글이 자국에 샜다: ' + 줄)
})

test('적기를 안 줘도 그대로 돈다 — 옛 부름이 안 깨진다', () => {
  assert.equal(parseReply('{'), null)
  assert.equal(parseReply(JSON.stringify({ 할일: '대답', 말: '네' })).할일, '대답')
})

test('고를것이 「제목·설명」 덩어리로 와도 한 줄로 붙여 받는다', () => {
  const r = parseReply(JSON.stringify({
    할일: '고르기', 무엇: '주제', 말: '골라 주세요',
    고를것: [{ 제목: '처음 해 보는 사람에게', 설명: '계좌 트기부터 첫 매수까지' },
           { title: 'For beginners', description: 'from opening an account' },
           '셋째는 그냥 글자'],
  }))
  assert.deepEqual(r.고를것, ['처음 해 보는 사람에게 — 계좌 트기부터 첫 매수까지',
                           'For beginners — from opening an account',
                           '셋째는 그냥 글자'])
})

test('덩어리에 한 칸만 있으면 그 칸만 쓴다 — 「제목 — 」 이 안 나오게', () => {
  const r = parseReply(JSON.stringify({
    할일: '고르기', 무엇: '주제', 고를것: [{ 제목: '초보자편' }, { 설명: '언제 팔까' }],
  }))
  assert.deepEqual(r.고를것, ['초보자편', '언제 팔까'])
})

test('덩어리라도 알맹이가 없으면 여전히 버린다', () => {
  assert.equal(parseReply(JSON.stringify({
    할일: '고르기', 무엇: '주제', 고를것: [{ 값: 1 }, {}],
  })), null)
})

// ── 고를것을 안 보내는 것을 막는다 (실물 자국 2026-09-19) ──────────
//
// 잡힌 자국: `고르기인데 고를것이 비었다 (0개 왔고 생김새 없음)`.
// 조정 세션 실측으로 이 조합에서 5번 중 4번, 이어 3번 중 3번 실패했다 —
// 템플릿 고르고 주제 치는 제일 흔한 길이다.

test('지시문이 「고를것을 반드시 채워라」 라고 말한다', () => {
  const p = systemPrompt(틀들, {})
  assert.ok(p.includes('반드시 채운다'), '비우면 안 된다는 말이 없다')
  assert.ok(p.includes('"되묻기" 를 낸다'), '못 지을 때 갈 곳을 안 알려 준다')
})

// **금지를 더 얹지 않는다.** 「갈래를 말 안에 줄글로 쓰지 마라」를 넣었다가
// 뺐다 — 버린 판의 `말` 이 36자였다(조정 세션 실측). 안 일어나는 일이다.
test('지시문에 금지가 늘지 않았다 — 「반드시」 쪽으로 고친 것이지 막은 것이 아니다', () => {
  const p = systemPrompt(틀들, {})
  assert.ok(!p.includes('줄글로 쓰지 마라'),
    '안 일어나는 일을 막는 줄이 들어왔다 — 이 지시문의 탈이 바로 금지 과다다')
})

test('고를것이 비어도 버리지 않는다 — 「고르기」인 채로 넘긴다', () => {
  // **예전엔 「되묻기」로 낮췄다**(2026-09-19). 그러면 모델이 쓴 「셋 중 하나를
  // 골라 주세요」가 단추 없이 그대로 나가, 고를 것도 없이 고르라는 막다른 길이
  // 됐다. 이제 `runTurn` 이 앞서 낸 목록을 다시 깔거나 말을 갈아 끼운다.
  const r = parseReply(JSON.stringify({
    할일: '고르기', 무엇: '주제', 고를것: [], 말: '어느 쪽으로 갈까요?',
  }))
  assert.ok(r, '답을 통째로 버렸다 — 말은 멀쩡한데 「못 알아들었어요」가 뜬다')
  assert.equal(r.할일, '고르기', '여기서 낮추면 runTurn 이 손쓸 자리가 없어진다')
  assert.deepEqual(r.고를것, [])
  assert.equal(r.말, '어느 쪽으로 갈까요?')
})

test('고를것도 말도 비면 그때는 버린다 — 빈 말풍선은 못 띄운다', () => {
  assert.equal(parseReply(JSON.stringify({ 할일: '고르기', 무엇: '주제', 고를것: [] })), null)
  assert.equal(parseReply(JSON.stringify({
    할일: '고르기', 무엇: '주제', 고를것: [], 말: '   ',
  })), null)
})

test('자국에 말 «길이» 는 적고 말 «내용» 은 안 적는다', () => {
  const 쌓임 = []
  const 원고 = '우리 회사 비밀 계획은 다음 분기에 서울 지사를 연다는 것이다'
  parseReply(JSON.stringify({ 할일: '고르기', 무엇: '주제', 고를것: [], 말: 원고 }),
    (왜) => 쌓임.push(String(왜)))
  assert.equal(쌓임.length, 1)
  assert.match(쌓임[0], new RegExp('말 ' + 원고.length + '자'))
  assert.ok(!쌓임[0].includes('서울 지사'), '사람 글이 자국에 샜다: ' + 쌓임[0])
})

// ── 올린 사진 (사람 결정 2026-09-19) ──────────────────────────────
//
// **굽는 칸이 아니라 대본 칸이다.** 대본을 쓸 때 「이 장엔 이런 사진」을 알려
// 주려면 그때 이미 꽂혀 있어야 한다(설계: 자리가 대본보다 먼저).

const 창고앞시험 = 'https://cardnews-render-554608989606.s3.ap-northeast-2.amazonaws.com/'
const 올린사진 = (n) => Array.from({ length: n }, (_, i) => `${창고앞시험}photos/${i}.png`)

test('올린 사진을 초안 봉투에 싣는다', async () => {
  const db = fakeDb()
  const id = 있던대화(db, { 틀: { 코드: 'AAA', 이름: '파란 타임라인' }, 사진들: 올린사진(2) })
  const { d, 부른것 } = deps('{"할일":"만들기","틀":"AAA","주제":"AI 소식","말":"네"}')
  await runTurn({ DB: db }, { 대화: id, 말: '만들어줘' }, d)
  assert.deepEqual(부른것.초안[0].사진들, 올린사진(2))
})

test('남의 주소는 안 싣는다 — 우리 창고 것만', async () => {
  // 이 화면은 열린 주소라 상태에 아무 주소나 적어 넣을 수 있다. 거르지 않으면
  // 남의 주소를 우리 서버가 대신 긁어 오는 문이 된다.
  const db = fakeDb()
  const id = 있던대화(db, { 틀: { 코드: 'AAA', 이름: '파란 타임라인' },
    사진들: ['https://evil.example/x.png', `${창고앞시험}photos/ok.png`, 7, null] })
  const { d, 부른것 } = deps('{"할일":"만들기","틀":"AAA","주제":"AI 소식","말":"네"}')
  await runTurn({ DB: db }, { 대화: id, 말: '만들어줘' }, d)
  assert.deepEqual(부른것.초안[0].사진들, [`${창고앞시험}photos/ok.png`])
})

test('쓸사진들 — 창고 것만, 상한까지만', () => {
  assert.deepEqual(쓸사진들(null), [])
  assert.deepEqual(쓸사진들('한 장'), [])
  assert.deepEqual(쓸사진들(['https://evil.example/x.png']), [])
  assert.equal(쓸사진들(올린사진(40)).length, 사진최대)
  assert.deepEqual(쓸사진들([` ${창고앞시험}a.png `]), [`${창고앞시험}a.png`],
    '앞뒤 빈칸을 안 턴다')
})

// ── 올린 사진이 자리를 채우고 «남는» 만큼만 묻는다 (설계 §6.1) ─────
//
// 열 자리에 열 장을 올렸는데도 「AI가 만들까요」를 물으면, 사람은 제 사진이
// 안 들어간 줄로 읽는다.

test('올린 사진이 자리를 다 채우면 안 묻고 바로 건다', async () => {
  const db = fakeDb()
  // `사진둘` 에는 로고 자리도 하나 있다 — 그 관문은 「없이」로 미리 지나 둔다.
  // 이 시험이 보는 것은 «사진을 또 묻나» 하나다.
  const id = 있던대화(db, { 틀: { 코드: 'AAA', 이름: '파란 타임라인' },
    사진들: 올린사진(2), 로고: 로고안씀 })
  const { d, 부른것 } = deps(
    JSON.stringify({ 할일: '만들기', 틀: 'AAA', 주제: '연말정산' }),
    { 틀하나읽기: async () => 사진둘 })
  const 답 = await runTurn({ DB: db }, { 대화: id, 말: '만들어 줘' }, d)
  assert.equal(부른것.초안.length, 1, '다 채웠는데 또 물었다')
  assert.equal(답.무엇, undefined)
})

test('자리보다 적게 올렸으면 남은 자리를 두고 묻는다', async () => {
  const db = fakeDb()
  const id = 있던대화(db, { 틀: { 코드: 'AAA', 이름: '파란 타임라인' }, 사진들: 올린사진(1) })
  const { d, 부른것 } = deps(
    JSON.stringify({ 할일: '만들기', 틀: 'AAA', 주제: '연말정산' }),
    { 틀하나읽기: async () => 사진둘 })
  const 답 = await runTurn({ DB: db }, { 대화: id, 말: '만들어 줘' }, d)
  assert.equal(부른것.초안.length, 0, '묻기 전에 만들었다')
  assert.match(답.말, /넣었어요/, '올린 사진이 이미 꽂혔다는 말이 없다')
  assert.match(답.말, /1개/, '남은 자리가 몇 개인지 안 알려 준다')
})

test('한 장도 안 올렸으면 여태 쓰던 물음 그대로', async () => {
  const { d } = deps(
    JSON.stringify({ 할일: '만들기', 틀: 'AAA', 주제: '연말정산' }),
    { 틀하나읽기: async () => 사진둘 })
  const 답 = await runTurn({ DB: fakeDb() }, { 대화: '', 말: '연말정산으로 만들어 줘' }, d)
  assert.match(답.말, /사진 자리가 2개/)
})


// ── 지시문이 «지금 무엇이 돌고 있는지» 를 안다 (사람 지적 2026-09-20) ──
//
// 실물 대화 2026-09-20:
//
//     봇  「… 초안을 짜는 중이에요 (1~2분). 오른쪽에서 장별로 보고 고칠 수 있어요.」
//     사람 「안보이는데」
//     봇  「사진이 안 보이신다니, 다시 한 장씩 올려 주시겠어요?」   ← 엉뚱하다
//     사람 「사진이 아니라 오른쪽에 창이 안뜨는데」
//     봇  「지금은 대답을 못 하겠어요: 빈 답을 받았습니다」          ← 답을 못 냈다
//
// **지시문이 「일이 돌고 있다」를 몰랐다.** 상태에서 `틀` 만 꺼내 적으니,
// 모델은 앞 대화의 사진 이야기를 보고 짐작했고, 사람이 고쳐 말하자 맞는
// 갈래가 없어 빈 답을 냈다. 사용자 지적: 「대답도 잘해야지」.

test('일이 돌고 있으면 지시문이 그것을 알린다', () => {
  const 글 = systemPrompt([], { 일: { 번호: 'job_x', 종류: '미리보기' } })
  assert.match(글, /미리보기/, '무슨 일이 도는지 안 적었다')
  assert.match(글, /돌고 있|만드는 중|기다/, '기다리라고 말할 근거가 없다')
})

test('일이 없으면 그 줄이 아예 없다', () => {
  const 글 = systemPrompt([], { 틀: { 코드: 'A', 이름: '가' } })
  assert.ok(!/지금 .*돌고 있/.test(글), '도는 일이 없는데 있다고 적었다')
})

test('일이 도는 동안 「안 보인다」에 무엇을 하라고 일러둔다', () => {
  const 글 = systemPrompt([], { 일: { 번호: 'job_x', 종류: '만들기' } })
  assert.match(글, /안 보인|안 뜬|아직/, '「안 보인다」를 만났을 때 할 일이 없다')
})

// ── 고른 것을 또 고르라고 하지 않는다 (실물 2026-09-22) ──────────────
//
// 사람이 세 갈래 중 하나를 누르면 그 글이 «사람이 친 말» 로 다시 들어온다.
// 서버가 «내가 무엇을 물었나» 를 아무 데도 안 적어서, 모델 눈에는 그냥 «주제를
// 한 마디로 말한 사람» 이었다 — 그래서 또 「고르기」를 냈고, 고를 때마다 또
// 고르라기를 대여섯 번 되풀이했다.

const 갈래셋 = ['흙에서 항구까지 — 서울 행당동의 공장과 부산 영도를 잇는 길',
              '영도에 도착한 뒤 — 모인 산업도자가 다시 어디로 흘러갔나',
              '흙은 어떻게 항구에 닿았나 — 원료에서 생산까지의 이동']

test('고른것찾기 — 목록에 있는 글이면 그 글을 돌려준다', () => {
  const 물은것 = { 무엇: '주제', 고를것: 갈래셋 }
  assert.equal(고른것찾기(물은것, 갈래셋[0]), 갈래셋[0])
  assert.equal(고른것찾기(물은것, `  ${갈래셋[1]}  `), 갈래셋[1], '앞뒤 빈칸은 봐준다')
})

test('고른것찾기 — 제목만 쳐도 걸린다', () => {
  const 물은것 = { 무엇: '주제', 고를것: 갈래셋 }
  assert.equal(고른것찾기(물은것, '흙에서 항구까지'), 갈래셋[0])
})

test('고른것찾기 — 주제 갈래가 아니면 아무것도 안 준다', () => {
  // 사진·로고 선택창도 단추를 깐다. 「비워 둘게요」가 주제로 둔갑하면 안 된다.
  assert.equal(고른것찾기({ 무엇: '사진', 고를것: ['비워 둘게요'] }, '비워 둘게요'), '')
  assert.equal(고른것찾기(null, '아무거나'), '')
  assert.equal(고른것찾기({ 무엇: '주제', 고를것: 갈래셋 }, '전혀 딴 말'), '')
})

test('고르기를 내면 «내가 낸 목록» 을 상태에 적어 둔다', async () => {
  const db = fakeDb()
  const { d } = deps('{"할일":"고르기","무엇":"주제","고를것":["가 — 하나"],"말":"고르세요"}')
  const 답 = await runTurn({ DB: db }, { 대화: '', 말: '산업도자' }, d)
  assert.deepEqual(답.상태.물은것, { 무엇: '주제', 고를것: ['가 — 하나'] },
    '안 적어 두면 다음 판에서 고른 것을 못 알아본다')
})

test('고른 갈래를 다시 보내면 — 모델을 «안» 부르고 초안을 건다', async () => {
  const db = fakeDb()
  const { d, 부른것 } = deps('{"할일":"대답","말":"응"}')
  const id = 'c'.repeat(32)
  await saveConversation(db, id, {
    틀: { 코드: 'AAA', 이름: '파란 타임라인' },
    물은것: { 무엇: '주제', 고를것: 갈래셋 },
  }, [], '2026-09-22T00:00:00Z')

  const 답 = await runTurn({ DB: db }, { 대화: id, 말: 갈래셋[0] }, d)
  assert.equal(부른것.딥시크.length, 0, '모델을 불렀다 — 코드가 아는 것을 다시 물었다')
  assert.equal(부른것.초안.length, 1, '초안을 안 걸었다')
  assert.equal(부른것.초안[0].주제, 갈래셋[0])
  assert.equal(답.상태.물은것, null, '고른 뒤에는 물음이 끝나야 한다')
})

test('제목만 쳐도 초안으로 넘어간다', async () => {
  const db = fakeDb()
  const { d, 부른것 } = deps('{"할일":"대답","말":"응"}')
  const id = 'd'.repeat(32)
  await saveConversation(db, id, {
    틀: { 코드: 'AAA', 이름: '파란 타임라인' },
    물은것: { 무엇: '주제', 고를것: 갈래셋 },
  }, [], '2026-09-22T00:00:00Z')
  await runTurn({ DB: db }, { 대화: id, 말: '흙에서 항구까지' }, d)
  assert.equal(부른것.딥시크.length, 0)
  assert.equal(부른것.초안[0].주제, 갈래셋[0], '제목만 쳤는데 못 알아봤다')
})

test('못 알아들어도 «같은» 갈래를 다시 보여 준다 — 새로 짓지 않는다', async () => {
  const db = fakeDb()
  const { d } = deps('{"할일":"고르기","무엇":"주제","고를것":["아주 다른 것 — 새로 지은 것"],"말":"골라 주세요"}')
  const 첫 = await runTurn({ DB: db }, { 대화: '', 말: '산업도자' }, d)
  const 둘 = await runTurn({ DB: db }, { 대화: 첫.대화, 말: '세 가지가 뭔데' }, d)
  assert.deepEqual(둘.고를것, 첫.고를것, '볼 때마다 다른 셋이 쏟아지면 고를 수가 없다')
})

test('「다시」면 새 갈래로 갈아 끼운다', async () => {
  const db = fakeDb()
  const { d } = deps('{"할일":"고르기","무엇":"주제","고를것":["새것 — 새로 지은 것"],"말":"골라 주세요"}')
  const 첫 = await runTurn({ DB: db }, { 대화: '', 말: '산업도자' }, d)
  const 둘 = await runTurn({ DB: db }, { 대화: 첫.대화, 말: '다른 것 보여줘', 다시: true }, d)
  assert.deepEqual(둘.고를것, ['새것 — 새로 지은 것'], '「다시」가 하는 일이 없어졌다')
})

test('고를 것이 하나도 없으면 «고르세요» 라고 말하지 않는다', async () => {
  // 단추 없는 선택창은 막다른 길이다. 여태는 모델이 쓴 「셋 중 하나를 골라
  // 주세요」가 단추 없이 그대로 나갔다.
  const db = fakeDb()
  const { d } = deps('{"할일":"고르기","무엇":"주제","고를것":[],"말":"세 가지 중 하나를 골라 주세요"}')
  const 답 = await runTurn({ DB: db }, { 대화: '', 말: '산업도자' }, d)
  assert.equal(답.고를것, undefined, '빈 선택창을 띄웠다')
  assert.equal(답.말, 봇말.무슨주제로.한국어(), '고를 것도 없이 고르라고 했다')
  assert.equal(답.상태.물은것, null)
})

test('틀을 바꾸면 앞서 낸 주제 갈래는 버린다', async () => {
  const db = fakeDb()
  const { d } = deps('{"할일":"고르기","무엇":"주제","고를것":["가 — 하나"],"말":"골라 주세요"}')
  const 첫 = await runTurn({ DB: db }, { 대화: '', 말: '산업도자' }, d)
  assert.ok(첫.상태.물은것)
  const { d: d2 } = deps('{"할일":"틀고르기","틀":"AAA","말":"골랐어요"}')
  const 둘 = await runTurn({ DB: db }, { 대화: 첫.대화, 말: '템플릿 파란 타임라인' }, d2)
  assert.equal(둘.상태.물은것, null, '다른 틀의 장 수·골격에 맞춰 지은 갈래라 낡았다')
})


// ── 생각 모드는 «필요한 자리»에만 켠다 (사람 결정 2026-09-24) ─────────
//
// 딥시크는 생각 모드가 **기본으로 켜져** 있다. 그래서 「키키 틀로」 한 마디에도
// 모델이 먼저 혼자 생각한 뒤 답했다 — 실측 **한 마디에 15~20초**.
//
// **끄는 것은 «가리기만 하는» 차례뿐이다.** 켜는 자리는 하나 — 틀은 골랐고
// 사람이 주제를 한 마디로 말한 차례. 거기서는 그 틀의 장 수·골격에 맞는 주제
// 방향 셋을 새로 지어야 한다.
//
// **부르기 «전» 에 아는 것으로만 가른다.** 모델에게 물어봐야 아는 것으로 가르면
// 닭이 먼저냐가 된다.

const 틀골랐음 = { 틀: { 코드: 'BBB', 이름: '키키' }, 물은것: null }

test('틀은 골랐고 주제를 한 마디로 말했으면 켠다 — 갈래 셋을 지어야 한다', () => {
  assert.equal(생각켤까('대학생 시험기간 꿀팁', 틀골랐음, 틀들), true)
})

test('우리가 깔아 둔 단추를 누른 답이면 끈다', () => {
  const 상태 = { 틀: { 코드: 'BBB', 이름: '키키' },
    물은것: { 무엇: '주제', 고를것: ['벼락치기 3일 계획', '카페 자리 잡기', '족보 구하기'] } }
  assert.equal(생각켤까('벼락치기 3일 계획', 상태, 틀들), false)
})

test('인스타 주소가 들어 있으면 끈다 — 담기다', () => {
  assert.equal(생각켤까('https://www.instagram.com/p/DSW6lrk5rs/ 담아줘', 틀골랐음, 틀들), false)
})

test('저장된 틀 이름이 들어 있으면 끈다 — 이름 맞추기뿐이다', () => {
  assert.equal(생각켤까('키키로 만들어줘', { 틀: null, 물은것: null }, 틀들), false)
  assert.equal(생각켤까('파란 타임라인 틀로', 틀골랐음, 틀들), false)
})

test('목록을 물으면 끈다', () => {
  assert.equal(생각켤까('템플릿 목록 보여줘', 틀골랐음, 틀들), false)
  assert.equal(생각켤까('어떤 템플릿이 있어?', 틀골랐음, 틀들), false)
})

test('사진·로고를 물은 바로 뒤면 끈다 — 예/아니오를 받는 자리다', () => {
  const 상태 = { 틀: { 코드: 'BBB', 이름: '키키' }, 물은것: { 무엇: '사진', 고를것: ['비움', '만듦'] } }
  assert.equal(생각켤까('비워 둘게요', 상태, 틀들), false)
})

test('원고를 통째로 붙여 넣으면 끈다 — 한 줄 요약뿐이다', () => {
  assert.equal(생각켤까('요즘 대학생들은 '.repeat(20), 틀골랐음, 틀들), false)
})

test('틀을 아직 안 골랐으면 끈다 — 「템플릿부터」로 되묻는 차례다', () => {
  assert.equal(생각켤까('대학생 시험기간 꿀팁', { 틀: null, 물은것: null }, 틀들), false)
})

test('빈 말이면 끈다', () => {
  assert.equal(생각켤까('', 틀골랐음, 틀들), false)
  assert.equal(생각켤까('   ', 틀골랐음, 틀들), false)
})


// ── 주제를 잊지 않는다 (사용자 실물 지적 2026-09-24) ─────────────────
//
// 실물로 난 것 둘:
//   ① 「대학생 시험기간 꿀팁」을 넣었는데 답이 「무슨 주제로 만들까요?」
//   ② 「키키 틀로」를 넣었는데 답이 「…템플릿을 골랐어요. 무슨 주제로 만들까요?」
//
// 까닭은 **서버가 주제를 아무 데도 안 적어 뒀다**는 것이다. 상태에는 `틀` 만
// 있었다. 그래서 틀을 고르는 차례에 주제가 같이 와도 버려졌고, `틀골랐음` 말은
// 주제를 아는지 **안 보고** 늘 「무슨 주제로?」를 붙였다.

test('틀을 고를 때 같이 온 주제를 적어 둔다 — 또 안 묻는다', async () => {
  const db = fakeDb()
  const { d } = deps('{"할일":"틀고르기","틀":"BBB","주제":"대학생 시험기간 꿀팁","말":"네"}')
  const 답 = await runTurn({ DB: db }, { 대화: '', 말: '키키 틀로 대학생 시험기간 꿀팁' }, d)
  assert.equal(답.상태.주제, '대학생 시험기간 꿀팁')
  assert.ok(!답.말.includes('무슨 주제로'), 답.말)
  assert.ok(답.말.includes('대학생 시험기간 꿀팁'), 답.말)
})

test('주제를 모르면 여태대로 묻는다', async () => {
  const db = fakeDb()
  const { d } = deps('{"할일":"틀고르기","틀":"BBB","말":"네"}')
  const 답 = await runTurn({ DB: db }, { 대화: '', 말: '키키 틀로' }, d)
  assert.equal(답.상태.주제, '')
  assert.ok(답.말.includes('무슨 주제로'), 답.말)
})

test('앞서 말한 주제로 「만들어줘」만 해도 이어진다', async () => {
  const db = fakeDb()
  // ① 틀과 주제를 같이 말한다
  const 첫 = deps('{"할일":"틀고르기","틀":"BBB","주제":"연말정산","말":"네"}')
  const a = await runTurn({ DB: db }, { 대화: '', 말: '키키 틀로 연말정산' }, 첫.d)
  // ② 「만들어줘」만 한다 — 모델이 주제를 안 실어 보내도 적어 둔 것을 쓴다
  const 둘 = deps('{"할일":"만들기","틀":"BBB","말":"네"}')
  await runTurn({ DB: db }, { 대화: a.대화, 말: '만들어줘' }, 둘.d)
  assert.equal(둘.부른것.초안.length, 1, '초안을 안 걸었다')
  assert.equal(둘.부른것.초안[0].주제, '연말정산')
})

test('주제가 아예 없으면 초안을 안 걸고 묻는다', async () => {
  const db = fakeDb()
  const { d, 부른것 } = deps('{"할일":"만들기","틀":"BBB","말":"네"}')
  const 답 = await runTurn({ DB: db }, { 대화: '', 말: '만들어줘' }, d)
  assert.equal(부른것.초안.length, 0, '주제도 없이 걸었다')
  assert.ok(답.말.includes('무슨 주제로'), 답.말)
})

// ── 「이 템플릿으로 만들기」 단추 (사람 결정 2026-09-28) ─────────────────
//
// 템플릿을 누르면 **구경만** 한다. 고르는 것은 단추 하나다. 단추는 이름과 함께
// 코드를 실어 보내고, 서버는 **모델을 안 부르고** 그 코드로 곧장 고른다.
//
// 까닭(사용자 제보 2026-09-28): 템플릿 이름은 원래 게시물 제목이라, 이름을
// 말로 보내면 모델이 그 제목을 **주제로** 읽고 「그 제목대로 카드뉴스를 만든다」.

test('틀코드는 코드 꼴일 때만 싣는다 — 없으면 칸 자체가 없다', () => {
  assert.equal(checkChatBody({ 말: '가', 틀코드: 'DSW-6lrk5rs' }).틀코드, 'DSW-6lrk5rs')
  assert.equal(checkChatBody({ 말: '가', 틀코드: 'Dbku_On' }).틀코드, 'Dbku_On')
  assert.equal(checkChatBody({ 말: '가', 틀코드: '../x' }).틀코드, undefined)
  assert.equal(checkChatBody({ 말: '가', 틀코드: 3 }).틀코드, undefined)
  assert.equal(checkChatBody({ 말: '가', 틀코드: 'a'.repeat(65) }).틀코드, undefined)
  assert.equal('틀코드' in checkChatBody({ 말: '가' }), false)
})

test('단추로 고르면 — 모델을 «안» 부르고 그 틀을 고른다, 이름이 주제로 새지 않는다', async () => {
  // 모델을 불렀다면 이 답을 받는다 — 제목을 주제로 읽고 곧장 만들려 드는 답.
  const { d, 부른것 } = deps('{"할일":"만들기","틀":"AAA","주제":"파란 타임라인","말":"만들게요"}')
  const 답 = await runTurn({ DB: fakeDb() },
    { 대화: '', 말: '템플릿 "파란 타임라인"', 틀코드: 'AAA' }, d)
  assert.equal(부른것.딥시크.length, 0, '모델을 불렀다 — 코드가 아는 것을 다시 물었다')
  assert.equal(부른것.초안.length, 0, '고르기만 했는데 초안을 걸었다')
  assert.deepEqual(답.상태.틀, { 코드: 'AAA', 이름: '파란 타임라인' })
  assert.equal(답.상태.주제, '', '템플릿 이름이 주제로 샜다')
  assert.deepEqual(답.오른쪽, { 종류: '틀', 코드: 'AAA' })
  assert.ok(답.말.includes('무슨 주제로'), 답.말)
})

test('단추로 고른 틀이 창고에 없으면 — 모델을 안 부르고 없다고 한다', async () => {
  const { d, 부른것 } = deps('{"할일":"대답","말":"응"}')
  const 답 = await runTurn({ DB: fakeDb() },
    { 대화: '', 말: '템플릿 "지운 것"', 틀코드: 'ZZZ' }, d)
  assert.equal(부른것.딥시크.length, 0)
  assert.equal(답.상태.틀, null)
  assert.match(답.말, /없/)
  assert.equal(답.틀카드.length, 2)
})

// ── 틀을 알아내면 곧바로 적어 둔다 (2026-09-28 실물) ─────────────────
//
// 「퍼플 틀로 카드뉴스 만들어줘」 → 「무슨 주제로?」 → 갈래 셋 → 하나 고름 →
// 「어떤 템플릿으로 만들까요?」. 틀은 초안을 걸 때만 적혀서, 주제를 고르는 사이 사라졌다.

test('처음 말에서 알아낸 틀을 적어 둔다 — 주제를 고르는 사이 안 사라진다', async () => {
  const db = fakeDb()
  const 첫 = deps('{"할일":"만들기","틀":"AAA","말":""}')
  const 답1 = await runTurn({ DB: db }, { 대화: '', 말: '파란 틀로 카드뉴스 만들어줘' }, 첫.d)
  assert.ok(답1.말.includes('무슨 주제로'), 답1.말)
  assert.deepEqual(답1.상태.틀, { 코드: 'AAA', 이름: '파란 타임라인' })
  const 둘 = deps(JSON.stringify({ 할일: '고르기', 무엇: '주제', 고를것: 갈래셋, 말: '골라 주세요' }))
  await runTurn({ DB: db }, { 대화: 답1.대화, 말: '행당동' }, 둘.d)
  const 셋 = deps('{"할일":"대답","말":"응"}')
  const 답3 = await runTurn({ DB: db }, { 대화: 답1.대화, 말: 갈래셋[0] }, 셋.d)
  assert.ok(!답3.말.includes('어떤 템플릿'), `틀을 잃고 또 물었다: ${답3.말}`)
  assert.equal(셋.부른것.초안.length, 1)
  assert.equal(셋.부른것.초안[0].틀, '파란 타임라인')
})

test('고르기·되묻기에 실려 온 틀도 적어 둔다', async () => {
  const { d } = deps(JSON.stringify({ 할일: '되묻기', 틀: 'BBB', 말: '무엇에 대한 카드뉴스인가요?' }))
  const 답 = await runTurn({ DB: fakeDb() }, { 대화: '', 말: '키키로 하나 만들어줘' }, d)
  assert.deepEqual(답.상태.틀, { 코드: 'BBB', 이름: '키키' })
})

// ── 사진·로고 물음의 단추는 모델 없이 읽는다 (2026-09-28 실물) ────────
//
// 「비워 둘게요」를 눌렀는데 딥시크가 빈 답을 두 번 내 「대답을 못 하겠어요」.
// 우리가 낸 단추 글과 똑같으면 무엇을 골랐는지 코드가 안다 — 주제 갈래와 같은 길.

const 사진로고틀 = { 슬라이드: [{ 역할: '훅', 장식영역: [{ 종류: '사진' }, { 종류: '로고' }] }] }

test('사진 물음을 내면 단추 글을 물은것에 적어 둔다', async () => {
  const db = fakeDb()
  const { d } = deps('{"할일":"만들기","틀":"AAA","주제":"연말정산","말":""}',
    { 틀하나읽기: async () => 사진로고틀 })
  const 답 = await runTurn({ DB: db }, { 대화: '', 말: '파란 타임라인으로 연말정산' }, d)
  assert.equal(답.무엇, '사진')
  assert.deepEqual(답.상태.물은것, { 무엇: '사진', 고를것: 답.고를것 })
})

test('사진·로고 단추를 누르면 모델을 안 부르고, 사진 답을 잊지 않고 초안까지 간다', async () => {
  const db = fakeDb()
  const 첫 = deps('{"할일":"만들기","틀":"AAA","주제":"연말정산","말":""}',
    { 틀하나읽기: async () => 사진로고틀 })
  const 답1 = await runTurn({ DB: db }, { 대화: '', 말: '파란 타임라인으로 연말정산' }, 첫.d)
  // 모델을 부르면 빈 답이 온다 — 부르면 안 된다.
  const 빈답 = { ok: false, why: '빈 답을 받았습니다' }
  const 둘 = deps(빈답, { 틀하나읽기: async () => 사진로고틀 })
  const 답2 = await runTurn({ DB: db }, { 대화: 답1.대화, 말: 봇말.사진비움.한국어() }, 둘.d)
  assert.equal(둘.부른것.딥시크.length, 0, '사진 단추에 모델을 불렀다')
  assert.equal(답2.무엇, '로고', 답2.말)
  const 셋 = deps(빈답, { 틀하나읽기: async () => 사진로고틀 })
  const 답3 = await runTurn({ DB: db }, { 대화: 답1.대화, 말: 봇말.로고없이.한국어() }, 셋.d)
  assert.equal(셋.부른것.딥시크.length, 0, '로고 단추에 모델을 불렀다')
  assert.equal(셋.부른것.초안.length, 1, `초안을 안 걸었다: ${답3.말}`)
  assert.deepEqual(답3.상태.구울것, { 사진: '비움', 로고: '' })
  assert.equal(답3.상태.물은것, null)
})

test('단추 글이 아닌 말은 여태처럼 모델이 읽는다', async () => {
  const db = fakeDb()
  const 첫 = deps('{"할일":"만들기","틀":"AAA","주제":"연말정산","말":""}',
    { 틀하나읽기: async () => 사진로고틀 })
  const 답1 = await runTurn({ DB: db }, { 대화: '', 말: '파란 타임라인으로 연말정산' }, 첫.d)
  const 둘 = deps('{"할일":"만들기","틀":"AAA","사진":"만듦","말":""}', { 틀하나읽기: async () => 사진로고틀 })
  await runTurn({ DB: db }, { 대화: 답1.대화, 말: '음 AI 가 해 줘요' }, 둘.d)
  assert.equal(둘.부른것.딥시크.length, 1)
})
