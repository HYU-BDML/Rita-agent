import { test } from 'node:test'
import assert from 'node:assert/strict'
import { 서버말 } from '../server/라벨서버말.js'
import {
  KINDS, checkLabels, labelRoute, statusOf, setRun, RUN_STATES, FONTS, EFFECTS, TREATS,
  afterEdit, saveLabels, setConfirm, MAX_ANGLE, MAX_OUTLINE, LEVELS, 죽은칸,
} from '../server/labels.js'
import { isId } from '../server/picks.js'
import { analyzable, analyzeLabel, 틀주소, 목록주소, 창고 } from '../lib/board.js'

const NOW = Date.parse('2026-08-18T12:00:00Z')
const ago = (min) => new Date(NOW - min * 60000).toISOString()

const slide = (boxes) => JSON.stringify({
  canvas: { w: 1080, h: 1350 },
  boxes,
})
const ok = [{ id: 'b1', kind: '도형', box: [10, 20, 300, 400] }]

test('라벨은 8종이다 — 버튼은 뺐고 장번호·빼기를 더했다', () => {
  assert.deepEqual(KINDS, ['글자', '사진', '인물', '도형', '장식', '로고', '장번호', '빼기'])
})

test('「빼기」 는 저장된다 — 라벨은 하되 그리지도 재지도 않는 칸', () => {
  const r = checkLabels('C_abc', 1, slide([{ id: 'b1', kind: '빼기', box: [10, 20, 300, 400] }]))
  assert.equal(r.why, undefined)
  assert.equal(r.count, 1)
})

// 종류를 뺐으면 그 종류가 실제로 «막히는지»까지 봐야 한다. 목록만 고치고 검사를
// 안 보면(예: KINDS 를 안 쓰는 검사로 바뀌면) 옛 값이 조용히 계속 저장된다.
test('버튼은 이제 거절된다', () => {
  const r = checkLabels('C_abc', 1, slide([{ id: 'b1', kind: '버튼', box: [10, 20, 300, 400] }]))
  assert.match(r.why, /모르는 라벨/)
})

test('바른 라벨은 통과하고 개수를 알려준다', () => {
  const r = checkLabels('C_abc', 3, slide(ok))
  assert.equal(r.why, undefined)
  assert.equal(r.count, 1)
})

test('들여쓰기를 털어 같은 모양으로 넣는다', () => {
  const pretty = checkLabels('C_abc', 3, JSON.stringify(JSON.parse(slide(ok)), null, 2))
  assert.equal(pretty.json, checkLabels('C_abc', 3, slide(ok)).json)
})

test('이상한 게시물 코드는 막는다', () => {
  for (const bad of ['', '../../secret', 'a/b', 'x'.repeat(31)]) {
    assert.ok(checkLabels(bad, 1, slide(ok)).why, bad)
  }
})

test('장 번호가 이상하면 막는다', () => {
  for (const bad of [0, -1, 100, 'x', null, 1.5]) {
    assert.ok(checkLabels('C_abc', bad, slide(ok)).why, String(bad))
  }
})

test('모르는 라벨은 막는다', () => {
  const r = checkLabels('C_abc', 1, slide([{ id: 'b1', kind: '배경', box: [1, 2, 3, 4] }]))
  assert.ok(r.why)
})

test('뒤집힌 네모와 화면 밖 네모는 막는다', () => {
  const bad = [
    [300, 20, 10, 400],      // x 가 뒤집힘
    [10, 400, 300, 20],      // y 가 뒤집힘
    [-5, 20, 300, 400],      // 왼쪽 밖
    [10, 20, 300, 9999],     // 아래쪽 밖
  ]
  for (const box of bad) {
    const r = checkLabels('C_abc', 1, slide([{ id: 'b1', kind: '도형', box }]))
    assert.ok(r.why, JSON.stringify(box))
  }
})

test('네모가 하나도 없어도 저장은 된다 — 빈 장이 있을 수 있다', () => {
  assert.equal(checkLabels('C_abc', 1, slide([])).count, 0)
})

test('canvas 가 없으면 막는다 — 좌표를 검사할 기준이 없다', () => {
  const r = checkLabels('C_abc', 1, JSON.stringify({ boxes: ok }))
  assert.ok(r.why)
})

test('통로 분기를 바르게 읽는다', () => {
  assert.deepEqual(labelRoute(['api', 'labels', 'C_abc'], 'GET'), { op: 'get', id: 'C_abc' })
  assert.deepEqual(labelRoute(['api', 'labels', 'C_abc', '3'], 'PUT'),
    { op: 'put', id: 'C_abc', idx: 3 })
})

test('모르는 통로는 null 이다', () => {
  assert.equal(labelRoute(['api', 'labels'], 'GET'), null)
  assert.equal(labelRoute(['api', 'labels', 'C_abc'], 'DELETE'), null)
  assert.equal(labelRoute(['api', 'labels', 'C_abc', 'x'], 'PUT'), null)
  assert.equal(labelRoute(['api', 'picks'], 'GET'), null)
})

test('한 장도 안 그었으면 안 함이다', () => {
  assert.equal(statusOf(0, 7, null, null, NOW), '안 함')
})

test('방금 저장했으면 작업중이다', () => {
  assert.equal(statusOf(3, 7, ago(2), null, NOW), '작업중')
})

test('한참 전에 멈췄으면 몇 장까지 했는지 보여준다', () => {
  assert.equal(statusOf(3, 7, ago(60), null, NOW), '라벨 3/7장')
})

test('장 수를 다 채웠으면 라벨 끝이다', () => {
  assert.equal(statusOf(7, 7, ago(60), null, NOW), '라벨 끝')
})

test('분석 상태가 있으면 그게 이긴다', () => {
  assert.equal(statusOf(7, 7, ago(1), '분석중', NOW), '분석중')
  assert.equal(statusOf(7, 7, ago(60), '분석 끝', NOW), '분석 끝')
})

test('상태와 분석 통로가 갈라진다', () => {
  assert.deepEqual(labelRoute(['api', 'labels', '~status'], 'GET'), { op: 'status' })
  assert.deepEqual(labelRoute(['api', 'labels', '~run', 'C_abc'], 'PUT'),
    { op: 'run', id: 'C_abc' })
  // `~` 는 isId 정규식에 없다 — 예약 이름이 게시물 코드와 부딪힐 수 없음을 못 박는다
  assert.equal(isId('~status'), false)
})

// setRun 의 이른 반환은 db 에 손도 안 대야 한다 — 공용 암호만 있으면 누구나 두드릴 수
// 있는 쓰기 통로라, 이상한 값이 걸러지는지를 db 를 실제로 건드리는지로 확인해 둔다.
const poisonDb = { prepare() { throw new Error('db 에 닿으면 안 된다') } }

test('setRun 은 이상한 게시물 코드를 db 를 건드리지 않고 막는다', async () => {
  assert.equal(await setRun(poisonDb, '../etc', RUN_STATES[0], ago(0)), false)
})

test('setRun 은 모르는 상태를 db 를 건드리지 않고 막는다', async () => {
  assert.equal(await setRun(poisonDb, 'C_abc', '분석보류', ago(0)), false)
})

test('setRun 은 바른 값이면 db 까지 닿아 저장한다', async () => {
  const calls = []
  const db = {
    prepare(sql) {
      calls.push(sql)
      return { bind: (...args) => ({ run: async () => { calls.push(args) } }) }
    },
  }
  assert.equal(await setRun(db, 'C_abc', RUN_STATES[0], ago(0)), true)
  assert.deepEqual(calls[1], ['C_abc', RUN_STATES[0], ago(0)])
})

// 새 칸 다섯(글씨체·효과·사진 처리·누끼·설명)은 전부 선택이다 — 예전 라벨엔 없다.
const pass = (boxes) => checkLabels('abc', 1,
  JSON.stringify({ canvas: { w: 1080, h: 1350 }, boxes }))

test('속성이 하나도 없어도 통과한다 — 예전 라벨이 그대로 읽혀야 한다', () => {
  assert.ok(pass([{ kind: '도형', box: [0, 0, 10, 10] }]).json)
})

// 글씨체·효과·누끼는 **화면에서 뺀 칸**이다(`죽은칸`). 값이 무엇이든 막지 않고
// 저장할 때 턴다 — 막으면 그런 옛 라벨을 가진 사람이 손도 못 댄다(2026-09-19).
test('글씨체·효과·누끼는 무슨 값이 와도 안 막고 안 남긴다', () => {
  for (const 칸 of ['font', 'effects', 'cut']) {
    const r = pass([{ kind: '글자', box: [0, 0, 10, 10], [칸]: '아무거나' }])
    assert.ok(r.json, `${칸} 이 저장을 막았다: ${r.why}`)
    assert.ok(!(칸 in JSON.parse(r.json).boxes[0]), `${칸} 이 저장됐다`)
  }
})

// 기울기(angle) — 대각선 글자를 사람이 직접 기울여 긋는다(2026-08-20).
test('기울기는 없어도 되고 0 도 정당한 값이다', () => {
  assert.ok(pass([{ kind: '글자', box: [0, 0, 10, 10] }]).json)              // 안 붙인 옛 라벨
  assert.ok(pass([{ kind: '글자', box: [0, 0, 10, 10], angle: 0 }]).json)    // truthy 검사면 여기서 터진다
  assert.ok(pass([{ kind: '글자', box: [0, 0, 10, 10], angle: -12.5 }]).json)
})

test('기울기는 -180~180 만 받는다', () => {
  for (const a of [-180, 180]) {
    assert.ok(pass([{ kind: '글자', box: [0, 0, 10, 10], angle: a }]).json, String(a))
  }
  for (const a of [181, -180.1, 360]) {
    assert.match(pass([{ kind: '글자', box: [0, 0, 10, 10], angle: a }]).why, /기울기/, String(a))
  }
})

test('숫자가 아닌 기울기는 막는다', () => {
  for (const a of ['12', null, NaN, Infinity, [12]]) {
    assert.match(pass([{ kind: '글자', box: [0, 0, 10, 10], angle: a }]).why, /기울기/, String(a))
  }
})

// 화면 밖 검사는 «안 기운» 네모만 본다 — 기울여 놓으면 모서리가 화면을 벗어나는 게
// 정상이라(끝에 걸친 대각선 글자띠), 모서리까지 보면 그 장의 저장이 통째로 영영 막힌다.
test('기울여서 모서리가 화면을 벗어나도 저장은 된다', () => {
  // 화면 맨 위를 가로지르는 띠를 45도 돌리면 왼쪽 위 모서리가 화면 위로 올라간다
  // (가운데 [540,100], 모서리 [0,0] → [228.9, -352.5]). 안 기운 네모는 화면 안이다.
  const r = pass([{ kind: '글자', box: [0, 0, 1080, 200], angle: 45 }])
  assert.equal(r.why, undefined)
  assert.equal(r.count, 1)
})

test('기울기 한계는 서버가 정한다', () => {
  assert.equal(MAX_ANGLE, 180)
})

// **설명(note)은 2026-09-19 에 되살아났다.** 사진 자리에 «무엇을 찍은 사진인지»
// 를 적으면 AI 그림 지시문이 그대로 쓴다 — 이제 살아 있는 칸이라 길이를 본다.
test('설명은 500자까지 — 넘으면 막는다', () => {
  const ok = pass([{ kind: '사진', box: [0, 0, 10, 10], note: 'ㄱ'.repeat(500) }])
  assert.ok(ok.json, `500자를 막았다: ${ok.why}`)
  assert.equal(JSON.parse(ok.json).boxes[0].note.length, 500, '설명이 안 남았다')
  assert.match(pass([{ kind: '사진', box: [0, 0, 10, 10], note: 'ㄱ'.repeat(501) }]).why,
    /설명/)
})

test('효과 3종·처리 6종', () => {
  assert.deepEqual(EFFECTS, ['외곽선', '그림자', '밑줄'])
  assert.equal(TREATS.length, 6)
})

// **글씨체는 개수를 못 박지 않는다**(2026-09-18). 표가 여섯 군데 흩어져 있어서
// (화면·굽기·분석·라벨 둘·틀점검) 늘릴 때마다 숫자를 고치는 것보다 «서로 같은가»
// 를 재는 편이 실제로 막아야 할 것을 막는다 — 하나만 빠지면 「고를 수는 있는데
// 저장이 400」 이나 「저장은 되는데 딴 글꼴로 그려짐」 이 생긴다.
// 파이썬 네 곳은 `render/test_workbench.py::test_글씨체_목록이_여섯_곳에서_같다`
// 가 본다.
test('글씨체 목록이 라벨 화면과 서버가 같다', async () => {
  const ui = await import('../lib/label.js')
  assert.deepEqual(ui.FONTS, FONTS)
  assert.ok(FONTS.includes('프리텐다드'), '기본 글꼴이 빠지면 안 된다')
})

test('확정 대기는 확정이 풀린다', () => {
  assert.equal(afterEdit('분석 대기'), null)
})

test('분석이 끝난 것은 다시 대기로 간다 — 고친 라벨로 다시 돌려야 하니까', () => {
  assert.equal(afterEdit('분석 끝'), '분석 대기')
  assert.equal(afterEdit('분석 실패'), '분석 대기')
})

test('분석중에는 못 고친다', () => {
  assert.equal(afterEdit('분석중'), 'MUST_WAIT')
})

test('아직 아무 상태도 없으면 그대로 없다', () => {
  assert.equal(afterEdit(null), null)
})

test('분석 대기가 상태 목록에 있다', () => {
  assert.ok(RUN_STATES.includes('분석 대기'))
})

test('확정 통로', () => {
  assert.deepEqual(labelRoute(['api', 'labels', '~confirm', 'abc'], 'PUT'),
    { op: 'confirm', id: 'abc', on: true })
  assert.deepEqual(labelRoute(['api', 'labels', '~confirm', 'abc'], 'DELETE'),
    { op: 'confirm', id: 'abc', on: false })
})

// saveLabels·setConfirm 은 저장 전에 analysis.state 를 먼저 읽고 그 값에 따라 갈린다.
// curState 를 SELECT 응답으로 미리 심어 두고, 그 뒤 실제로 나간 쓰기(run)만 기록한다 —
// 반환값만 보면 '어느 표에 뭘 썼는지'가 바뀌어도(예: analysis 대신 annotations 에 상태를
// 쓰는 버그) 시험이 못 잡는다.
function fakeAnalysisDb(curState) {
  const writes = []
  return {
    writes,
    prepare(sql) {
      return {
        bind: (...args) => ({
          first: async () => (curState == null ? null : { state: curState }),
          run: async () => { writes.push({ sql, args }) },
        }),
      }
    },
  }
}

test('saveLabels 는 분석중이면 저장을 막고 annotations 에 안 쓴다', async () => {
  const db = fakeAnalysisDb('분석중')
  const r = await saveLabels(db, 'C_abc', 1, slide(ok), ago(0))
  assert.equal(r.ok, false)
  assert.match(r.why, /분석이 도는 중/)
  assert.equal(db.writes.length, 0)
})

test('saveLabels 는 확정 대기였다가 고치면 analysis 행을 지운다', async () => {
  const db = fakeAnalysisDb('분석 대기')
  const r = await saveLabels(db, 'C_abc', 1, slide(ok), ago(0))
  assert.equal(r.ok, true)
  assert.match(db.writes[0].sql, /INSERT INTO annotations/)
  assert.match(db.writes[1].sql, /DELETE FROM analysis/)
  assert.deepEqual(db.writes[1].args, ['C_abc'])
})

test('saveLabels 는 분석이 끝난 뒤 고치면 분석 대기로 되돌린다', async () => {
  const db = fakeAnalysisDb('분석 끝')
  const r = await saveLabels(db, 'C_abc', 1, slide(ok), ago(0))
  assert.equal(r.ok, true)
  assert.match(db.writes[1].sql, /INSERT INTO analysis/)
  assert.deepEqual(db.writes[1].args, ['C_abc', '분석 대기', ago(0)])
})

test('setConfirm 은 on=true 면 분석 대기로 올린다', async () => {
  const db = fakeAnalysisDb(null)
  const r = await setConfirm(db, 'C_abc', true, ago(0))
  assert.deepEqual(r, { ok: true })
  assert.equal(db.writes.length, 1)
  assert.match(db.writes[0].sql, /INSERT INTO analysis/)
  assert.deepEqual(db.writes[0].args, ['C_abc', '분석 대기', ago(0)])
})

test('setConfirm 은 on=false 면 analysis 행을 지운다', async () => {
  const db = fakeAnalysisDb('분석 대기')
  const r = await setConfirm(db, 'C_abc', false, ago(0))
  assert.deepEqual(r, { ok: true })
  assert.equal(db.writes.length, 1)
  assert.match(db.writes[0].sql, /DELETE FROM analysis/)
  assert.deepEqual(db.writes[0].args, ['C_abc'])
})

test('setConfirm 은 분석중이면 켜기도 끄기도 막는다 — 화면이 거짓말하면 안 된다', async () => {
  const dbOn = fakeAnalysisDb('분석중')
  const rOn = await setConfirm(dbOn, 'C_abc', true, ago(0))
  assert.equal(rOn.ok, false)
  assert.match(rOn.why, /분석이 도는 중/)
  assert.equal(dbOn.writes.length, 0)

  const dbOff = fakeAnalysisDb('분석중')
  const rOff = await setConfirm(dbOff, 'C_abc', false, ago(0))
  assert.equal(rOff.ok, false)
  assert.match(rOff.why, /분석이 도는 중/)
  assert.equal(dbOff.writes.length, 0)
})

// ── 층 (겹친 장식 중 누가 위냐) ──────────────────────────────────────────
// «검사» 라는 이름의 함수는 이 파일에 없다 — 저장 검사는 checkLabels(id, idx, text) 다.
// slide() 로 이미 쓰는 모양(JSON 문자열)에 맞춰 넣는다.
test('층은 정수만 받는다', () => {
  const 만들기 = (층) => slide([{ id: 'b1', kind: '사진', box: [0, 0, 10, 10], 층 }])
  assert.equal(checkLabels('C_abc', 1, 만들기(0)).why, undefined)
  assert.equal(checkLabels('C_abc', 1, 만들기(3)).why, undefined)
  assert.match(checkLabels('C_abc', 1, 만들기(1.5)).why, /층/)
  assert.match(checkLabels('C_abc', 1, 만들기('0')).why, /층/)
  assert.match(checkLabels('C_abc', 1, 만들기(-1)).why, /층/)
})

test('층이 없어도 된다', () => {
  const r = checkLabels('C_abc', 1, slide([{ id: 'b1', kind: '사진', box: [0, 0, 10, 10] }]))
  assert.equal(r.why, undefined)
})

// ───────────────────────────────── 사람이 직접 그린 테두리
const 그린네모 = (테두리) => [{ id: 'b1', kind: '사진', box: [10, 10, 200, 200], 테두리 }]

test('테두리를 받는다', () => {
  const r = checkLabels('C_abc', 1, slide(그린네모([[10, 100], [105, 10], [200, 100], [105, 200]])))
  assert.equal(r.why, undefined)
})

test('테두리 점이 셋 미만이면 막는다', () => {
  const r = checkLabels('C_abc', 1, slide(그린네모([[10, 10], [20, 20]])))
  assert.match(r.why, /셋 미만/)
})

test('테두리 점이 좌표 둘이 아니면 막는다', () => {
  const r = checkLabels('C_abc', 1, slide(그린네모([[10, 10], [20, 20], [30]])))
  assert.match(r.why, /좌표 둘이 아닙니다/)
})

test('다듬기를 안 거친 날것은 막는다', () => {
  const 날것 = Array.from({ length: MAX_OUTLINE + 1 }, (_, i) => [i % 100, (i * 7) % 100])
  assert.match(checkLabels('C_abc', 1, slide(그린네모(날것))).why, /너무 많습니다/)
})

test('테두리가 화면을 조금 넘어가도 막지 않는다', () => {
  // 사람이 «가려진 부분까지» 이어 그리라고 만든 칸이다 — 원의 아랫자락이
  // 화면 가장자리를 넘는 일이 정상이다. 네모(box) 와 규칙이 다르다.
  const r = checkLabels('C_abc', 1, slide(그린네모([[-5, 100], [105, -8], [200, 100], [105, 1400]])))
  assert.equal(r.why, undefined)
})

test('도형 만드는 법을 받는다', () => {
  const r = checkLabels('C_abc', 1, slide([{ id: 'b1', kind: '사진', box: [10, 10, 200, 200],
    도형: { 이름: '둥근네모', 값: { 둥글기: 0.42 } },
    테두리: [[10, 100], [105, 10], [200, 100], [105, 200]] }]))
  assert.equal(r.why, undefined)
})

test('도형에 이름이 없으면 막는다', () => {
  const r = checkLabels('C_abc', 1, slide([{ id: 'b1', kind: '사진', box: [10, 10, 200, 200],
    도형: { 값: { 둥글기: 0.42 } } }]))
  assert.match(r.why, /이름이 없습니다/)
})

test('도형 값이 숫자가 아니면 막는다', () => {
  const r = checkLabels('C_abc', 1, slide([{ id: 'b1', kind: '사진', box: [10, 10, 200, 200],
    도형: { 이름: '원', 값: { 둥글기: '많이' } } }]))
  assert.match(r.why, /숫자가 아닙니다/)
})

// ───────────────────────────────── 분석 단추를 언제 보여 주나
test('라벨을 그었으면 언제든 분석할 수 있다', () => {
  // **「라벨 끝」일 때만 보여 주면 한 번 분석한 뒤 단추가 사라진다.** 그러면
  // 라벨을 고쳐도 다시 분석할 길이 목록에 없다 — 라벨 화면에 들어가 「확정」을
  // 눌러야 상태가 되돌아온다. 사람이 그걸 알 리가 없다(2026-08-27, 실제로 못 찾음).
  for (const s of ['라벨 끝', '분석 끝', '분석 실패', '분석 대기', '작업중', '라벨 3/7장']) {
    assert.equal(analyzable(s), true, s)
  }
})

test('아직 안 그었거나 도는 중이면 못 누른다', () => {
  assert.equal(analyzable('안 함'), false, '그은 라벨이 없으면 잴 것이 없다')
  assert.equal(analyzable('분석중'), false, '도는 중에 또 걸면 두 번 돈다')
  assert.equal(analyzable(''), false)
  assert.equal(analyzable(undefined), false)
})

test('단추에 적을 말이 상태를 따라간다', () => {
  assert.equal(analyzeLabel('라벨 끝'), '분석하기')
  assert.equal(analyzeLabel('분석 끝'), '다시 분석')
  assert.equal(analyzeLabel('분석 실패'), '다시 분석')
  assert.equal(analyzeLabel('분석중'), '분석중…')
  assert.equal(analyzeLabel('라벨 3/7장'), '분석하기')
})

test('안에 글자 있다 표시를 받는다', () => {
  const r = checkLabels('C_abc', 1, slide([{ id: 'b1', kind: '도형',
    box: [10, 10, 200, 200], 글자있음: true }]))
  assert.equal(r.why, undefined)
})

test('「안에 글자 있다」는 값이 이상해도 안 막고 안 남긴다', () => {
  // 이 칸을 파이썬이 「사람이 못 박은 답」으로 읽어 글자칸이 두 겹으로 그려졌다.
  // 그래서 화면에서 뺐다 — 이제 들어와도 저장 때 털린다.
  const r = checkLabels('C_abc', 1, slide([{ id: 'b1', kind: '도형',
    box: [10, 10, 200, 200], 글자있음: '응' }]))
  assert.equal(r.why, undefined, `저장을 막았다: ${r.why}`)
  assert.ok(!('글자있음' in JSON.parse(r.json).boxes[0]))
})

test('배경이 사진이다 표시를 받는다', () => {
  const doc = JSON.stringify({ canvas: { w: 1080, h: 1350 }, 배경사진: true,
    boxes: [{ id: 'b1', kind: '글자', box: [10, 10, 200, 200] }] })
  assert.equal(checkLabels('C_abc', 1, doc).why, undefined)
})

test('배경이 사진이다가 참·거짓이 아니면 막는다', () => {
  const doc = JSON.stringify({ canvas: { w: 1080, h: 1350 }, 배경사진: 'yes',
    boxes: [{ id: 'b1', kind: '글자', box: [10, 10, 200, 200] }] })
  assert.match(checkLabels('C_abc', 1, doc).why, /배경이 사진이다/)
})

test('저장한 문서에 새 칸이 그대로 실린다', () => {
  // 문서를 통째로 넣으므로 칸이 늘어도 저장 코드는 안 건드린다 — 그게 맞는지 본다.
  const doc = JSON.stringify({ canvas: { w: 1080, h: 1350 }, 배경사진: true,
    boxes: [{ id: 'b1', kind: '도형', box: [10, 10, 200, 200], 층: 2 }] })
  const r = checkLabels('C_abc', 1, doc)
  const 되읽음 = JSON.parse(r.json)
  assert.equal(되읽음.배경사진, true)
  assert.equal(되읽음.boxes[0].층, 2)
})

test('화면에서 뺀 칸은 저장할 때 지운다 — 옛 라벨이 파이썬을 속이지 못하게', () => {
  // 2026-09-19. 「안에 글자 있다」·글씨체·오려내기가 라벨에 남아 파이썬이 그것을
  // 「사람이 못 박은 답」으로 읽어 사고가 셋 났다(글자칸 두 겹·측정값 덮어쓰기·도형 두 겹).
  const doc = JSON.stringify({ canvas: { w: 1080, h: 1350 },
    boxes: [{ id: 'b1', kind: '도형', box: [10, 10, 200, 200], 층: 1,
      글자있음: true, cut: true, font: '지마켓산스', effects: ['밑줄'],
      treat: '누끼', note: '메모', rle: 'xx', conf: 0.9 }] })
  const b = JSON.parse(checkLabels('C_abc', 1, doc).json).boxes[0]
  for (const k of 죽은칸) assert.equal(k in b, false, k)
  assert.equal(b.층, 1)          // 살아 있는 칸은 그대로
  assert.equal(b.kind, '도형')
})

test('사람이 못 박은 글자 위계를 받는다', () => {
  for (const v of ['제목', '본문', '꼬리표']) {
    const r = checkLabels('C_abc', 1, slide([{ id: 'b1', kind: '글자',
      box: [10, 10, 200, 200], 위계: v }]))
    assert.equal(r.why, undefined, v)
  }
})

test('모르는 위계는 막는다', () => {
  const r = checkLabels('C_abc', 1, slide([{ id: 'b1', kind: '글자',
    box: [10, 10, 200, 200], 위계: '대제목' }]))
  assert.match(r.why, /모르는 글자 위계/)
})

test('고를 수 있는 위계는 서버가 받는 위계의 부분집합이다', async () => {
  // **둘이 같을 필요는 없다.** 서버는 옛 라벨에 남은 「번호」를 계속 받아야 하지만,
  // 사람이 새로 고를 일은 없다 — 장 번호는 「장번호」 종류로 옮겼다(2026-09-19).
  const ui = await import('../lib/label.js')
  for (const v of ui.LEVELS) assert.ok(LEVELS.includes(v), v)
  assert.equal(ui.LEVELS.includes('번호'), false)
  assert.ok(LEVELS.includes('번호'), '옛 라벨을 못 읽게 된다')
})

test('틀 주소가 창고의 그 파일을 가리킨다', () => {
  // 분석이 끝나면 여기에 올라간다 — 목록에서 바로 열 수 있어야 한다.
  assert.match(틀주소('DG0AA6PJ8s4'), /\/templates\/DG0AA6PJ8s4\.json$/)
  assert.ok(틀주소('DG0AA6PJ8s4').startsWith(창고))
  assert.match(목록주소, /%EB%AA%A9%EB%A1%9D\.json$/, '한글 파일 이름은 감싸야 한다')
})

test('이상한 코드가 와도 주소가 안 깨진다', () => {
  assert.ok(!틀주소('a/b?c').includes('/b?c'), '조각이 주소 구조를 뚫으면 안 된다')
})


// ── 「이 장은 배경이 사진이다」 ────────────────────────────────
//
// **켜도 아무 일이 없었다.** 저장은 됐는데 돌려주지 않아서 — 장을 넘겼다
// 오면 체크가 풀리고, 분석도 그 칸을 못 읽었다(2026-08-27 사람이 알려 줬다).

import { getLabels } from '../server/labels.js'

function _가짜디비(줄들) {
  return {
    prepare: () => ({
      bind: () => ({ all: async () => ({ results: 줄들 }) }),
    }),
  }
}

test('배경사진을 켠 채로 저장하면 그대로 돌아온다', async () => {
  const 줄 = { idx: 1, saved_at: '2026-08-27T00:00:00Z',
               json: JSON.stringify({ boxes: [], canvas: { w: 1080, h: 1350 }, 배경사진: true }) }
  const [난것] = await getLabels(_가짜디비([줄]), 'AAA')
  assert.equal(난것.배경사진, true)
})

test('배경 설명도 그대로 돌아온다', async () => {
  // 2026-09-20. 배경사진이 2026-08-27 에 당한 것과 **똑같이** 빠져 있었다 —
  // 저장은 되는데 안 돌려줘서, 적고 장을 넘겼다 오면 칸이 비어 있었다.
  // 분석도 이 문으로 받으므로(`fetch_labels`) 적은 글이 지시문까지 못 갔다.
  const 줄 = { idx: 1, saved_at: 'x',
               json: JSON.stringify({ boxes: [], canvas: { w: 1080, h: 1350 },
                                      배경사진: true, 배경설명: '해질 무렵 도시 야경' }) }
  const [난것] = await getLabels(_가짜디비([줄]), 'AAA')
  assert.equal(난것.배경설명, '해질 무렵 도시 야경')
})

test('안 켰으면 false 로 돌아온다', async () => {
  const 줄 = { idx: 1, saved_at: 'x', json: JSON.stringify({ boxes: [], canvas: {} }) }
  const [난것] = await getLabels(_가짜디비([줄]), 'AAA')
  assert.equal(난것.배경사진, false, '없는 것과 꺼진 것을 같게 다룬다')
})

test('네모와 캔버스는 그대로 나온다', async () => {
  const 줄 = { idx: 2, saved_at: 'x',
               json: JSON.stringify({ boxes: [{ id: 'b1', kind: '글자' }],
                                      canvas: { w: 1080, h: 1350 } }) }
  const [난것] = await getLabels(_가짜디비([줄]), 'AAA')
  assert.equal(난것.index, 2)
  assert.equal(난것.boxes.length, 1)
  assert.deepEqual(난것.canvas, { w: 1080, h: 1350 })
})

test('죽은 칸은 모양이 틀려도 저장을 안 막는다 — 어차피 버릴 것이다', () => {
  // **실물 2026-09-19.** 주석은 「검사는 그대로 통과시킨다(옛 라벨을 400 으로
  // 막으면 사람이 손도 못 댄다)」인데, 실제로는 여섯 곳에서 막고 있었다.
  // 버릴 칸의 «모양»이 틀렸다고 저장을 거절하면, 그런 옛 라벨을 가진 사람은
  // 네모 하나 옮기는 것도 못 한다 — 고칠 길이 아예 없다.
  const 엉망 = 죽은칸.map((k) => [k, { 못쓸: '값' }])
  for (const [칸, 값] of 엉망) {
    const r = checkLabels('C_abc', 1, slide([{ ...ok[0], [칸]: 값 }]))
    assert.equal(r.why, undefined, `${칸} 이 저장을 막았다: ${r.why}`)
  }
})

test('죽은 칸은 검사를 통과하되 저장되지는 않는다', () => {
  // 통과시키는 것과 «남기는» 것은 다르다. 들어와도 되지만 창고엔 안 남는다.
  const 넣은것 = Object.fromEntries(죽은칸.map((k) => [k, { 못쓸: '값' }]))
  const r = checkLabels('C_abc', 1, slide([{ ...ok[0], ...넣은것 }]))
  assert.equal(r.why, undefined)
  const 난것 = JSON.parse(r.json).boxes[0]
  for (const 칸 of 죽은칸) assert.ok(!(칸 in 난것), `${칸} 이 저장됐다`)
  assert.equal(난것.kind, '도형', '산 칸까지 지웠다')
})
// ── 서버가 돌려주는 말도 영어로 (사람 지시 2026-09-19) ────────────
//
// 화면 글자는 `lib/라벨말.js` 로 옮겼는데 **서버가 거절할 때 돌려주는 말**이
// 한국어로 남아 있었다. 그 말은 라벨판이 그대로 띄운다(`failed`) — 영어로
// 쓰다가 저장이 막히면 거기서만 한국어가 튀어나온다.

test('서버말 표의 열쇠마다 두 언어가 다 있고 영어에 한글이 없다', () => {
  const 빠진것 = []
  for (const [열쇠, 값] of Object.entries(서버말)) {
    if (typeof 값.한국어 !== 'function' || typeof 값.영어 !== 'function') {
      빠진것.push(열쇠)
      continue
    }
    if (/[가-힣]/.test(String(값.영어('X', 'Y')))) 빠진것.push(`${열쇠}(영어에 한글)`)
  }
  assert.deepEqual(빠진것, [])
})

test('영어를 주면 거절 문구가 영어로 온다', () => {
  // 화면이 이 글자를 그대로 띄운다.
  assert.ok(!/[가-힣]/.test(checkLabels('!!', 1, '{}', '영어').why))
  assert.ok(!/[가-힣]/.test(checkLabels('AAA', 0, '{}', '영어').why))
  assert.ok(!/[가-힣]/.test(checkLabels('AAA', 1, '{{{', '영어').why))
})

test('언어를 안 주면 한국어 그대로다', () => {
  // **옛 부르는 쪽이 그대로 돌아야 한다.** 칸이 늘었다고 깨지면 안 된다.
  assert.equal(checkLabels('!!', 1, '{}').why, '게시물 코드가 이상합니다')
  assert.equal(checkLabels('!!', 1, '{}', '한국어').why, '게시물 코드가 이상합니다')
  assert.equal(checkLabels('!!', 1, '{}', 'en').why, '게시물 코드가 이상합니다')
})

test('네모 하나하나를 거르는 말도 두 언어로 나온다', () => {
  const 판 = (네모) => JSON.stringify({ canvas: { w: 100, h: 100 }, boxes: [네모] })
  const 것들 = [
    { kind: '없는종류', box: [0, 0, 10, 10] },
    { kind: '글자', box: [0, 0, 10] },
    { kind: '글자', box: [10, 10, 0, 0] },
    { kind: '글자', box: [0, 0, 10, 10], angle: '기울기' },
    { kind: '글자', box: [0, 0, 10, 10], 위계: '없는위계' },
  ]
  for (const 네모 of 것들) {
    const 한 = checkLabels('AAA', 1, 판(네모), '한국어').why
    const 영 = checkLabels('AAA', 1, 판(네모), '영어').why
    assert.ok(한, `한국어가 안 나온다: ${JSON.stringify(네모)}`)
    assert.ok(영, `영어가 안 나온다: ${JSON.stringify(네모)}`)
    // 값(«없는종류»)은 한국어 그대로 되돌린다 — 화면이 그 값으로 무엇이 틀렸는지 찾는다.
    const 값만 = 영.replace(/[A-Za-z0-9 ,.:;!?'"()\-–—]/g, '').trim()
    assert.ok(!값만 || 네모.kind === 값만 || 네모.위계 === 값만 || 네모.angle === 값만,
      `영어 문구에 한글이 남았다: ${영}`)
  }
})

test('「분석이 도는 중입니다」도 두 언어로 나온다', () => {
  // **이것만 평범하게 쓰다가 만난다.** 나머지는 화면이 이상한 값을 보냈을 때만 뜬다.
  assert.match(서버말.분석중.한국어(), /분석이 도는 중/)
  assert.ok(!/[가-힣]/.test(서버말.분석중.영어()))
})
