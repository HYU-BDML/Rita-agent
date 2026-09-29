import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  KINDS, FONTS, EFFECTS, TREATS, MAX_NOTE, MAX_ANGLE, normBox, imgPoint, tooSmall, 도형단추눌림,
  propsOf, resizeIn, centerOf, spin, toLocal, normAngle, setAngle,
  handlePoints, gripPoint, angleFrom, GRIP_UP, spinCanvas, 장식순서, 층밀기, 옛종류,
  타원잔차, 테두리네모, 도형들, 도형테두리, 아이콘칸, COLORS, 맞춰붙이기, 붙임문턱, 붙임버팀,
  도형기본값, 도형찾기, 손잡이들, 손잡이끌기, 겹치나, 그물에걸린것, 네모베끼기, 고르기토글, api, 설명서, 보일칸,
} from '../lib/label.js'
import { handleAt, pick } from '../lib/boxedit.js'
import * as serverLabels from '../server/labels.js'

// label.js 는 브라우저로 내려가 server/ 를 못 불러오므로 다섯 값을 그대로 베껴 둔다
// (label.js 의 주석 참고). 여기 node 시험에서는 두 쪽 다 불러올 수 있으니 어긋나지
// 않는지 직접 대조한다 — 예전엔 KINDS 도 주석만 믿고 있었다.
test('고를 수 있는 종류는 서버가 받는 종류의 부분집합이다', () => {
  // **둘이 같을 필요는 없어졌다.** 서버는 옛 라벨에 남은 «인물» 을 계속 받아야
  // 하지만, 사람이 새로 고를 일은 없다(사진에 합쳤다).
  for (const k of KINDS) assert.ok(serverLabels.KINDS.includes(k), k)
  assert.equal(KINDS.includes('인물'), false)
  assert.ok(serverLabels.KINDS.includes('인물'), '옛 라벨을 못 읽게 된다')
  assert.equal(옛종류.인물, '사진')
  assert.deepEqual(FONTS, serverLabels.FONTS)
  assert.deepEqual(EFFECTS, serverLabels.EFFECTS)
  assert.deepEqual(TREATS, serverLabels.TREATS)
  assert.equal(MAX_NOTE, serverLabels.MAX_NOTE)
  assert.equal(MAX_ANGLE, serverLabels.MAX_ANGLE)
})

test('모양 단추는 지금 걸린 모양만 눌린 것으로 보여 준다', () => {
  // 2026-09-28 사용자 지적 「라벨링한 거 보면 도형은 왜 체크가 안 되어 있어?」 —
  // 도형 네모를 골라도 스무 개 모양 단추 어느 것도 파랗지 않았다. 값은 둥근네모로
  // 저장돼 있었는데 단추가 그것을 안 보여 줬다(ui-state-must-show).
  const 네모 = { 도형: { 이름: '둥근네모', 값: 0.2 } }
  assert.equal(도형단추눌림(네모, '둥근네모'), true)
  assert.equal(도형단추눌림(네모, '원'), false)
  assert.equal(도형단추눌림({}, '네모'), false)
  assert.equal(도형단추눌림(null, '네모'), false)
})

test('버튼은 목록에 없다 — 키보드는 1~7 이다', () => {
  assert.equal(KINDS.includes('버튼'), false)
  assert.equal(KINDS.length, 7)
  assert.equal(KINDS[5], '장번호')
  assert.equal(KINDS[6], '빼기')
})

test('종류마다 색이 있다 — 하나라도 빠지면 그 네모가 안 보인다', () => {
  // 실제로 두 번 빠뜨렸다(2026-09-19): 「장번호」와, 다른 세션이 더한 「빼기」.
  // 색이 없으면 strokeStyle 이 undefined 라 캔버스가 기본 검정으로 긋는다 —
  // 검은 바탕 카드에서는 네모를 그었는지조차 안 보인다.
  for (const k of KINDS) assert.ok(COLORS[k], `${k} 에 색이 없다`)
  // 서로 달라야 한다. 같은 색이 둘이면 종류를 눈으로 못 가른다.
  const 색들 = KINDS.map((k) => COLORS[k])
  assert.equal(new Set(색들).size, 색들.length, JSON.stringify(색들))
})

test('거꾸로 끈 네모를 바로 편다', () => {
  assert.deepEqual(normBox([300, 400, 100, 200], 1080, 1350), [100, 200, 300, 400])
})

test('화면 밖으로 나간 네모를 안으로 자른다', () => {
  assert.deepEqual(normBox([-30, -10, 2000, 9999], 1080, 1350), [0, 0, 1080, 1350])
})

test('좌표는 정수로 만든다 — 서버가 정수만 받는다', () => {
  assert.deepEqual(normBox([10.6, 20.2, 30.9, 40.1], 1080, 1350), [11, 20, 31, 40])
})

test('화면 좌표를 그림 좌표로 되돌린다', () => {
  // 1080 짜리 그림을 540 폭으로 줄여 보여줄 때, 화면의 100px 은 그림의 200px 이다
  const rect = { left: 0, top: 0, width: 540, height: 675 }
  assert.deepEqual(imgPoint({ clientX: 100, clientY: 50 }, rect, 1080, 1350), [200, 100])
})

test('실수로 찍은 점은 네모로 안 친다', () => {
  assert.equal(tooSmall([10, 10, 14, 14]), true)
  assert.equal(tooSmall([10, 10, 200, 200]), false)
})

test('사람에게 더 묻지 않는다 — 속성 칸이 하나도 없다', () => {
  // 글씨체·효과·사진 처리는 기계가 잰다. 실측(라벨 64개): 사람이 고른 글씨체 1건
  // (그마저 기계와 같은 답) · 효과 0건 · 사진 처리 0건.
  for (const k of KINDS) assert.deepEqual(propsOf(k), [])
})

// resizeIn 은 pointermove 가 실제로 부르는 그 함수다(테스트에서 조합만 흉내내면
// label.js 의 실제 호출부가 바뀌어도 시험이 못 잡는다 — N2 리뷰 수정).
// boxedit.js 의 resize() 는 최소 크기만 지키지 화면 경계는 안 봐서, 왼쪽 모서리가
// 이미 화면 끝에 붙은 네모를 더 왼쪽으로 끌면 좌표가 음수로 나간다 — 그 값을 그대로
// 저장하면 서버가 그 장 전체를 거절한다.
test('리사이즈로 화면 밖까지 끌어도 안으로 잘린다', () => {
  const box = [10, 100, 60, 300]
  const out = resizeIn(box, 'w', [-30, 150], 1080, 1350)
  assert.deepEqual(out, [0, 100, 60, 300])
})

// ── 기울기 ──────────────────────────────────────────────────────────────────
// 대각선 글자는 자동 판정 대신 사람이 직접 기울여 긋는다(2026-08-20 사람 지시).
// 그리기·고르기·손잡이가 전부 «기운» 모양을 따라야 한다.
const near = (got, want, eps = 1e-9) => {
  assert.ok(Math.abs(got[0] - want[0]) < eps && Math.abs(got[1] - want[1]) < eps,
    `${JSON.stringify(got)} != ${JSON.stringify(want)}`)
}
const BAR = { id: 'bar', box: [0, 0, 200, 40], angle: 90 }   // 눕힌 막대. 가운데는 [100,20]

test('점을 네모 가운데 둘레로 돌린다 — 캔버스와 같은 시계 방향', () => {
  near(spin([100, 50], [50, 50], 90), [50, 100])   // 오른쪽 점이 아래로 간다
  near(spin([100, 50], [50, 50], 0), [100, 50])
  assert.deepEqual(centerOf([100, 100, 300, 200]), [200, 150])
})

test('toLocal 은 돌린 것을 그대로 되돌린다', () => {
  const b = { box: [100, 100, 300, 200], angle: 37 }
  near(toLocal(b, spin([120, 190], centerOf(b.box), 37)), [120, 190], 1e-9)
})

test('기울기가 없으면 점을 손도 안 댄다 — 오늘과 완전히 같아야 한다', () => {
  const pt = [12, 34]
  assert.equal(toLocal({ box: [0, 0, 100, 100] }, pt), pt)          // 같은 배열 그대로
  assert.equal(toLocal({ box: [0, 0, 100, 100], angle: 0 }, pt), pt)
})

test('손잡이 8개가 기울기를 따라간다', () => {
  const flat = handlePoints([100, 100, 300, 200])
  assert.deepEqual(flat.nw, [100, 100])
  assert.deepEqual(flat.e, [300, 150])
  const spun = handlePoints([100, 100, 300, 200], 90)
  near(spun.e, [200, 250])      // 오른쪽 변 가운데가 아래로 돈다
  near(spun.nw, [250, 50])
})

test('기운 네모는 «기운 모양» 으로 집힌다', () => {
  // 눕힌 막대는 위아래로 길다. 세로로 벗어난 점이 안이고, 원래 네모 안이던 점이 밖이다.
  assert.equal(pick([BAR], [100, 100], toLocal), BAR)
  assert.equal(pick([BAR], [180, 20], toLocal), null)
  // 되돌리는 함수를 안 넘기면(=옛 동작) 정반대로 나온다 — 이 시험이 붙잡는 게 그 차이다.
  assert.equal(pick([BAR], [100, 100]), null)
  assert.equal(pick([BAR], [180, 20]), BAR)
})

test('기운 네모의 손잡이도 «기운 자리» 에서 잡힌다', () => {
  const nw = spin([0, 0], centerOf(BAR.box), 90)      // 눈에 보이는 nw 손잡이 자리
  assert.equal(handleAt(BAR.box, toLocal(BAR, nw)), 'nw')
  assert.equal(handleAt(BAR.box, nw), null)           // 되돌리지 않으면 아무것도 안 잡힌다
})

test('기울기 손잡이는 위쪽 변 바깥에 있고 같이 돈다', () => {
  near(gripPoint([100, 100, 300, 200]), [200, 100 - GRIP_UP])
  near(gripPoint(BAR.box, 90), [148, 20])
})

test('기울기 손잡이를 끈 자리가 각도가 된다 — 위쪽이 0도', () => {
  const B = [100, 100, 300, 200]
  assert.equal(angleFrom(B, [200, 50]), 0)
  assert.equal(angleFrom(B, [400, 150]), 90)
  assert.equal(angleFrom(B, [200, 300]), 180)
  assert.equal(angleFrom(B, [50, 150]), -90)
})

test('각도는 -180~180 으로 접고 소수 첫째 자리까지 남긴다', () => {
  assert.equal(normAngle(370), 10)
  assert.equal(normAngle(-190), 170)
  assert.equal(normAngle(180), 180)
  assert.equal(normAngle(-180), 180)
  assert.equal(normAngle(12.34), 12.3)
  assert.equal(normAngle(-0.02), 0)      // -0 이 아니라 0 이어야 한다
  assert.equal(normAngle(NaN), 0)
  assert.equal(normAngle('x'), 0)
})

test('0 도는 칸 자체를 지운다 — 안 기운 네모는 예전 모양 그대로 저장된다', () => {
  const b = { kind: '글자', box: [0, 0, 10, 10], angle: 12 }
  setAngle(b, 0)
  assert.equal('angle' in b, false)
  setAngle(b, 361)
  assert.equal(b.angle, 1)
  assert.equal(normAngle(b.angle), b.angle)   // 서버가 받는 범위 안이다
})

test('그리기는 캔버스를 네모 «가운데» 둘레로 기울인다', () => {
  const calls = []
  const g = {
    translate: (x, y) => calls.push(['translate', x, y]),
    rotate: (r) => calls.push(['rotate', r]),
  }
  spinCanvas(g, [100, 100, 300, 200], 90)
  assert.deepEqual(calls[0], ['translate', 200, 150])
  assert.ok(Math.abs(calls[1][1] - Math.PI / 2) < 1e-12, String(calls[1][1]))
  assert.deepEqual(calls[2], ['translate', -200, -150])
  // 안 기운 네모는 캔버스를 아예 안 건드린다 — 오늘 그리는 것과 한 획도 달라지면 안 된다
  calls.length = 0
  spinCanvas(g, [100, 100, 300, 200], 0)
  spinCanvas(g, [100, 100, 300, 200], undefined)
  assert.equal(calls.length, 0)
})

// ── 층 (겹친 장식 중 누가 위냐) ──────────────────────────────────────────
// 규칙은 workbench.js 의 같은 이름 함수와 같아야 한다 — 층은 장식끼리만,
// 글자는 언제나 앞, 층이 한 칸이라도 비면 통째로 무시(목록 차례로 되돌아간다).
test('층이 하나도 없으면 목록 차례 그대로', () => {
  const 칸들 = [{ kind: '사진' }, { kind: '로고' }, { kind: '글자' }]
  assert.deepEqual(장식순서(칸들), [0, 1])       // 글자는 안 센다
})

test('층이 다 있으면 그 순서를 따른다', () => {
  const 칸들 = [{ kind: '사진', 층: 1 }, { kind: '로고', 층: 0 }, { kind: '글자' }]
  assert.deepEqual(장식순서(칸들), [1, 0])
})

test('층이 반만 있으면 통째로 무시한다', () => {
  const 칸들 = [{ kind: '사진' }, { kind: '로고', 층: 0 }]
  assert.deepEqual(장식순서(칸들), [0, 1])
})

test('글자에는 층이 없다', () => {
  const 칸들 = [{ kind: '글자', 층: 0 }, { kind: '사진', 층: 1 }]
  assert.deepEqual(장식순서(칸들), [1])
})

test('한 칸 앞으로 밀면 바로 위와 자리를 바꾼다', () => {
  assert.deepEqual(층밀기([0, 1, 2], 0, +1),
                   [{ 번호: 1, 층: 0 }, { 번호: 0, 층: 1 }, { 번호: 2, 층: 2 }])
})

test('맨 끝에서 더 밀면 null', () => {
  assert.equal(층밀기([0, 1, 2], 2, +1), null)
  assert.equal(층밀기([0, 1, 2], 0, -1), null)
})

// ───────────────────────────────────────── 테두리 재는 도구
//
// **「직접 그리기」를 뺀 뒤 남은 것들이다**(2026-09-19). 그리기 시험은 그 커밋에서
// 같이 지웠다 — 여기 남긴 둘은 도형 단추 쪽이 아직 쓴다: `테두리네모` 는 네모를
// 도형에 맞추는 데, `타원잔차` 는 「원」 단추가 진짜 타원을 내는지 보는 데 쓴다.

const 원그리기 = (cx, cy, r, n = 90, 떨림 = 0) => {
  const 점 = []
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2
    // 떨림은 결정적으로 준다 — 시험이 판마다 달라지면 안 된다
    const d = r + 떨림 * Math.sin(t * 7.3) + 떨림 * 0.6 * Math.cos(t * 11.1)
    점.push([cx + d * Math.cos(t), cy + d * Math.sin(t)])
  }
  return 점
}

const 다각형그리기 = (cx, cy, r, 변, 점당 = 12) => {
  const 점 = []
  for (let i = 0; i < 변; i++) {
    const a = (i / 변) * Math.PI * 2
    const b = ((i + 1) / 변) * Math.PI * 2
    for (let j = 0; j < 점당; j++) {
      const t = j / 점당
      점.push([cx + r * (Math.cos(a) * (1 - t) + Math.cos(b) * t),
               cy + r * (Math.sin(a) * (1 - t) + Math.sin(b) * t)])
    }
  }
  return 점
}


test('그린 모양에 딱 맞는 네모를 낸다', () => {
  assert.deepEqual(테두리네모([[10, 20], [90, 20], [90, 77], [10, 77]]), [10, 20, 90, 77])
})

test('타원잔차는 원에 0, 네모에 크다', () => {
  assert.ok(타원잔차(원그리기(0, 0, 50, 60)) < 0.01)
  assert.ok(타원잔차(다각형그리기(0, 0, 50, 4)) > 0.06)
})

// ───────────────────────────────────────── 네모 안에서 도형 고르기
//
// **목록이 «유일한 길» 이면 감옥이지만 «지름길» 이면 아니다.** 목록에 없는
// 모양은 그대로 직접 그리면 된다(위 다듬기 시험). 카드뉴스 크롭은 실물에서
// 원·알약·네모가 대부분이라 그 셋만 지름길로 낸다.

test('도형 목록은 넉넉하다 — 그래도 목록 밖은 직접 그린다', () => {
  assert.ok(도형들.length >= 20, 도형들.length)
  for (const 있어야 of ['원', '네모', '둥근네모', '삼각형', '오각형', '5각별', '하트', '말풍선']) {
    assert.ok(도형들.some((d) => d.이름 === 있어야), 있어야)
  }
  assert.equal(new Set(도형들.map((d) => d.이름)).size, 도형들.length, '이름이 겹친다')
})

test('모든 도형이 네모에 내접한다', () => {
  // 「네모에 내접」 이 이 화면에서 뜻하는 바 — 세로로 길든 가로로 길든 꽉 채운다.
  for (const box of [[100, 200, 300, 500], [0, 0, 400, 100], [50, 50, 150, 150]]) {
    for (const { 이름 } of 도형들) {
      const 테 = 도형테두리(이름, box)
      assert.ok(테 && 테.length >= 3, `${이름} 이 점을 안 냈다`)
      const xs = 테.map((p) => p[0]); const ys = 테.map((p) => p[1])
      const 여유 = 1.5
      assert.ok(Math.min(...xs) >= box[0] - 여유, `${이름} 이 왼쪽으로 삐져나온다`)
      assert.ok(Math.max(...xs) <= box[2] + 여유, `${이름} 이 오른쪽으로 삐져나온다`)
      assert.ok(Math.min(...ys) >= box[1] - 여유, `${이름} 이 위로 삐져나온다`)
      assert.ok(Math.max(...ys) <= box[3] + 여유, `${이름} 이 아래로 삐져나온다`)
      // 한쪽이라도 네모에 닿아야 «내접» 이다 — 안 닿으면 네모가 헐렁해 보인다
      const 닿음 = Math.abs(Math.min(...xs) - box[0]) < 2 || Math.abs(Math.max(...xs) - box[2]) < 2
      assert.ok(닿음, `${이름} 이 네모 폭을 안 채운다`)
    }
  }
})

test('정다각형은 점 수가 정확하다', () => {
  const 셈 = (이름) => 도형테두리(이름, [0, 0, 100, 100]).length
  assert.equal(셈('삼각형'), 3)
  assert.equal(셈('마름모'), 4)
  assert.equal(셈('오각형'), 5)
  assert.equal(셈('육각형'), 6)
  assert.equal(셈('팔각형'), 8)
  assert.equal(셈('5각별'), 10)
  assert.equal(셈('8각별'), 16)
})

test('원은 네모에 내접한다', () => {
  const 테 = 도형테두리('원', [100, 200, 300, 500])
  const xs = 테.map((p) => p[0]); const ys = 테.map((p) => p[1])
  assert.ok(Math.abs(Math.min(...xs) - 100) < 1, Math.min(...xs))
  assert.ok(Math.abs(Math.max(...xs) - 300) < 1, Math.max(...xs))
  assert.ok(Math.abs(Math.min(...ys) - 200) < 1)
  assert.ok(Math.abs(Math.max(...ys) - 500) < 1)
  // 정확히 타원이다 — 다듬기의 어림이 아예 안 낀다
  assert.ok(타원잔차(테) < 0.001, 타원잔차(테))
})

test('네모는 꼭짓점 넷이다', () => {
  assert.deepEqual(도형테두리('네모', [10, 20, 30, 40]),
    [[10, 20], [30, 20], [30, 40], [10, 40]])
})


test('모르는 이름은 아무것도 안 만든다', () => {
  assert.equal(도형테두리('별', [0, 0, 10, 10]), null)
})

test('아이콘 칸은 네모가 어떻게 생겼든 정사각형이다', () => {
  // 사람 지시 2026-09-19 「납작하게 하지마」. 어떤 네모를 골라도 도형은 안 찌그러진다.
  for (const box of [[0, 0, 200, 200], [0, 0, 200, 133], [0, 0, 400, 100],
    [0, 0, 100, 400], [0, 0, 900, 40], [0, 0, 40, 900]]) {
    assert.deepEqual(아이콘칸(box), [34, 34], String(box))
  }
})

test('최대비를 키우면 옛 동작(비율 따라가기)으로 돌아간다', () => {
  assert.deepEqual(아이콘칸([0, 0, 400, 100], 34, 2), [34, 17])
  assert.deepEqual(아이콘칸([0, 0, 100, 400], 34, 2), [17, 34])
})

test('둥근네모 손잡이를 끝까지 밀면 알약이 된다 — 그래서 알약 항목이 없다', () => {
  const box = [0, 0, 400, 100]
  const 왼끝 = (테) => 테.reduce((a, p) => (p[0] < a[0] ? p : a), [1e9, 0])
  // 둥글기 1 = 짧은 쪽 절반이 반지름 = 알약. 왼쪽 끝이 세로 한가운데에 닿는다.
  assert.ok(Math.abs(왼끝(도형테두리('둥근네모', box, { 둥글기: 1 }))[1] - 50) < 3)
  // 기본값(0.3)은 모서리만 접힌다 — 왼쪽 끝이 한가운데가 아니다.
  assert.ok(Math.abs(왼끝(도형테두리('둥근네모', box, { 둥글기: 0.3 }))[1] - 50) > 10)
  assert.equal(도형들.some((d) => d.이름 === '알약'), false, '알약은 손잡이로 대체됐다')
})

test('십이각형은 뺐다 — 원과 눈으로 구별이 안 된다', () => {
  assert.equal(도형들.some((d) => d.이름 === '십이각형'), false)
})

// **한 붓 그리기가 스스로 꼬이면 안 된다.** 말풍선이 실제로 꼬여 있었다 —
// 꼬리를 테두리 끝에 «덧붙여서» 마지막 점에서 꼬리로, 꼬리에서 첫 점으로 선이
// 뛰며 몸통을 가로질렀다. 그림을 안 보면 못 잡는 종류라 시험으로 못 박는다.
const 교차 = (p, q, r, s) => {
  const d = (a, b, c) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]))
  const [d1, d2, d3, d4] = [d(p, q, r), d(p, q, s), d(r, s, p), d(r, s, q)]
  return d1 !== d2 && d3 !== d4 && d1 !== 0 && d2 !== 0 && d3 !== 0 && d4 !== 0
}

test('모든 도형이 스스로 꼬이지 않는다', () => {
  for (const { 이름 } of 도형들) {
    const 테 = 도형테두리(이름, [0, 0, 300, 200])
    const n = 테.length
    for (let i = 0; i < n; i++) {
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue        // 맞닿은 첫·끝 변은 이웃이다
        assert.equal(교차(테[i], 테[(i + 1) % n], 테[j], 테[(j + 1) % n]), false,
          `${이름} 의 ${i}번 변과 ${j}번 변이 꼬인다`)
      }
    }
  }
})

// ───────────────────────────────────────── 도형 손잡이
//
// **손잡이는 꼭짓점이 아니라 그 도형 식구 안의 «값» 이다.** 원을 만지면 타원이
// 되기를 바라지 우그러지기를 바라지 않는다. 그래서 손잡이를 끌어도 도형은
// 제 식구를 벗어나지 않는다.

test('손잡이가 있는 도형은 값이 실제로 모양을 바꾼다', () => {
  const box = [0, 0, 300, 200]
  for (const d of 도형들.filter((x) => x.손잡이)) {
    for (const h of d.손잡이) {
      const 낮 = 도형테두리(d.이름, box, { ...도형기본값(d.이름), [h.키]: h.최소 })
      const 높 = 도형테두리(d.이름, box, { ...도형기본값(d.이름), [h.키]: h.최대 })
      const 다름 = 낮.length !== 높.length
        || 낮.some((p, i) => Math.abs(p[0] - 높[i][0]) > 1 || Math.abs(p[1] - 높[i][1]) > 1)
      assert.ok(다름, `${d.이름} 의 ${h.키} 를 바꿔도 모양이 그대로다`)
    }
  }
})

test('손잡이를 끌면 값이 그 자리를 따라온다', () => {
  const box = [0, 0, 300, 200]
  for (const d of 도형들.filter((x) => x.손잡이)) {
    for (const h of d.손잡이) {
      const 원한값 = h.최대 * 0.8 + h.최소 * 0.2
      const 자리 = 손잡이들(d.이름, box, { ...도형기본값(d.이름), [h.키]: 원한값 })
        .find((z) => z.키 === h.키)
      const 새 = 손잡이끌기(d.이름, box, 도형기본값(d.이름), h.키, [자리.x, 자리.y])
      assert.ok(Math.abs(새[h.키] - 원한값) <= (h.최대 - h.최소) * 0.12,
        `${d.이름} ${h.키}: 끌면 ${새[h.키]} 인데 ${원한값} 여야 한다`)
    }
  }
})

test('손잡이는 늘 테두리 «위» 에 있다', () => {
  // 자리를 따로 셈하면 화면에 보이는 모양과 손잡이가 갈린다.
  const box = [10, 20, 310, 220]
  for (const d of 도형들.filter((x) => x.손잡이)) {
    const 값 = 도형기본값(d.이름)
    const 테 = 도형테두리(d.이름, box, 값)
    for (const h of 손잡이들(d.이름, box, 값)) {
      assert.ok(테.some((p) => Math.abs(p[0] - h.x) < 0.6 && Math.abs(p[1] - h.y) < 0.6),
        `${d.이름} 의 ${h.키} 손잡이가 테두리 위에 없다`)
    }
  }
})

test('손잡이가 없는 도형은 빈 목록을 낸다', () => {
  for (const 이름 of ['원', '네모', '삼각형', '하트']) {
    assert.deepEqual(손잡이들(이름, [0, 0, 100, 100], {}), [])
  }
})

test('모르는 손잡이를 끌어도 값이 안 망가진다', () => {
  const 값 = 도형기본값('둥근네모')
  assert.deepEqual(손잡이끌기('둥근네모', [0, 0, 100, 100], 값, '없는키', [5, 5]), 값)
  assert.deepEqual(손잡이끌기('원', [0, 0, 100, 100], {}, '둥글기', [5, 5]), {})
})

test('손잡이는 값 범위 «어디서나» 움직인다', () => {
  // **값의 절반에서 안 움직이는 손잡이는 손잡이가 아니다.** 반원의 손잡이가
  // 볼록함 0.5 아래에서 왼쪽 아래 모서리에 붙박여 꼼짝을 안 했다 — 사람이
  // 「왜 중간에서 멈추냐」고 바로 알아챘다. 눈에 기대면 또 놓친다.
  const box = [0, 0, 300, 200]
  const 걸음 = 20
  for (const d of 도형들.filter((x) => x.손잡이)) {
    for (const h of d.손잡이) {
      const 자리 = []
      for (let i = 0; i <= 걸음; i++) {
        const v = h.최소 + ((h.최대 - h.최소) * i) / 걸음
        자리.push(손잡이들(d.이름, box, { ...도형기본값(d.이름), [h.키]: v })
          .find((z) => z.키 === h.키))
      }
      for (let i = 1; i < 자리.length; i++) {
        const 움직임 = Math.hypot(자리[i].x - 자리[i - 1].x, 자리[i].y - 자리[i - 1].y)
        assert.ok(움직임 > 0.5,
          `${d.이름} 의 ${h.키} 손잡이가 ${i}번째 걸음에서 ${움직임.toFixed(2)}px 밖에 안 움직인다`)
      }
    }
  }
})

// ───────────────────────────────────────── 여러 개 고르기 · 복사·붙여넣기
//
// 카드뉴스는 같은 도형이 여러 장에 되풀이된다 — 키키의 검은 제목 알약은
// 2~7장 **여섯 장**에 똑같이 있다. 장마다 다시 만드는 것은 사람 손을 버리는 일이다.

test('그물은 닿기만 해도 걸린다', () => {
  // 통째로 감싸야 걸리게 하면 큰 네모를 고르려고 화면 밖까지 끌어야 한다 —
  // 라벨의 사진 자리는 장의 절반을 넘는 일이 흔하다.
  assert.equal(겹치나([0, 0, 100, 100], [50, 50, 200, 200]), true)
  assert.equal(겹치나([0, 0, 100, 100], [100, 0, 200, 100]), false, '변만 맞대면 안 걸린다')
  assert.equal(겹치나([0, 0, 100, 100], [10, 10, 20, 20]), true, '통째로 든 것')
})

test('그물에 걸린 것을 목록 차례대로 낸다', () => {
  const 칸들 = [{ id: 'a', box: [0, 0, 50, 50] }, { id: 'b', box: [200, 200, 300, 300] },
    { id: 'c', box: [40, 40, 90, 90] }]
  assert.deepEqual(그물에걸린것(칸들, [10, 10, 60, 60]).map((b) => b.id), ['a', 'c'])
  assert.deepEqual(그물에걸린것(칸들, [500, 500, 600, 600]), [])
})

test('베낀 네모는 모양을 다 물려받되 id 는 새로 받는다', () => {
  const 원본 = { id: 'a', kind: '도형', box: [10, 20, 110, 80], angle: 12, 층: 2, cut: true,
    위계: '제목',
    도형: { 이름: '둥근네모', 값: { 둥글기: 0.42 } }, 테두리: [[10, 20], [110, 20], [110, 80]] }
  const 벤것 = 네모베끼기(원본, 'b9')
  assert.equal(벤것.id, 'b9')
  assert.deepEqual(벤것.box, 원본.box)
  assert.equal(벤것.angle, 12)
  assert.equal(벤것.층, 2)
  assert.equal(벤것.cut, true)
  assert.deepEqual(벤것.도형, 원본.도형)
  assert.deepEqual(벤것.테두리, 원본.테두리)
  // **이게 빠져 있었다**(2026-08-27). 도형에 위계를 골라 놓고 다음 장에
  // 붙이면 모양만 따라가고 위계는 조용히 풀렸다.
  assert.equal(벤것.위계, '제목')
})

test('사람이 고른 것이 하나도 안 빠진다', () => {
  // 붙여넣기의 뜻은 «이것과 같게» 다. 칸을 새로 만들 때마다 여기 늘려라 —
  // 안 늘리면 그 칸만 조용히 안 따라가고, 사람은 그걸 알 길이 없다.
  const 사람이고른것 = ['angle', '층', 'cut', '도형', '테두리', '위계']
  const 원본 = { id: 'a', kind: '도형', box: [0, 0, 10, 10], angle: 5, 층: 1, cut: true,
    위계: '본문', 도형: { 이름: '원', 값: {} }, 테두리: [[0, 0], [1, 0], [1, 1]] }
  const 벤것 = 네모베끼기(원본, 'b9')
  for (const 칸 of 사람이고른것) {
    assert.ok(칸 in 벤것, `${칸} 을 안 옮긴다`)
  }
})

test('베낀 것을 고쳐도 원본이 안 움직인다', () => {
  // 얕게 베끼면 붙여넣은 것의 손잡이를 끌 때 원본까지 같이 움직인다.
  const 원본 = { id: 'a', kind: '도형', box: [10, 20, 110, 80],
    도형: { 이름: '5각별', 값: { 안쪽: 0.3 } }, 테두리: [[10, 20], [110, 20], [110, 80]] }
  const 벤것 = 네모베끼기(원본, 'b9')
  벤것.box[0] = 999
  벤것.도형.값.안쪽 = 0.9
  벤것.테두리[0][0] = 999
  assert.equal(원본.box[0], 10)
  assert.equal(원본.도형.값.안쪽, 0.3)
  assert.equal(원본.테두리[0][0], 10)
})

test('없는 칸은 안 만들어 낸다', () => {
  // 기울기도 층도 안 준 네모를 베끼면 그 칸이 «없는 채로» 남아야 한다.
  const 벤것 = 네모베끼기({ id: 'a', kind: '사진', box: [0, 0, 10, 10] }, 'b1')
  assert.equal('angle' in 벤것, false)
  assert.equal('층' in 벤것, false)
  assert.equal('도형' in 벤것, false)
  assert.equal('테두리' in 벤것, false)
  assert.equal('cut' in 벤것, false)
  assert.equal('위계' in 벤것, false)
})

test('한 네모가 주인과 여럿에 «둘 다» 들지 않는다', () => {
  // 둘 다 들면 옮길 때 두 번 세어져 그 네모만 두 배로 달아난다.
  const [a, b, c] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  const 겹침없나 = (r) => !r.여럿.includes(r.sel) && new Set(r.여럿).size === r.여럿.length
  for (const [sel, 여럿, 맞은것] of [
    [a, [b, c], b], [a, [b, c], c], [a, [b, c], a], [a, [], a], [null, [], a], [a, [], b],
  ]) {
    const r = 고르기토글(sel, 여럿, 맞은것)
    assert.ok(겹침없나(r), `sel=${r.sel?.id} 여럿=${r.여럿.map((x) => x.id)}`)
  }
})

test('여럿에 든 것을 Shift+클릭하면 «맞바꾼다»', () => {
  const [a, b, c] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  const r = 고르기토글(a, [b, c], b)
  assert.equal(r.sel, b, '누른 것이 주인이 된다')
  assert.deepEqual(r.여럿.map((x) => x.id), ['a', 'c'], '옛 주인은 여럿으로 내려간다')
})

test('주인을 Shift+클릭하면 빠지고 다음이 주인이 된다', () => {
  const [a, b, c] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  const r = 고르기토글(a, [b, c], a)
  assert.equal(r.sel, b)
  assert.deepEqual(r.여럿.map((x) => x.id), ['c'])
  assert.deepEqual(고르기토글(a, [], a), { sel: null, 여럿: [] })
})

test('안 고른 것을 Shift+클릭하면 더해진다', () => {
  const [a, b] = [{ id: 'a' }, { id: 'b' }]
  assert.deepEqual(고르기토글(a, [], b), { sel: a, 여럿: [b] })
  assert.deepEqual(고르기토글(null, [], b), { sel: b, 여럿: [] })
})

test('토글은 원래 목록을 안 건드린다', () => {
  // 배열을 그 자리에서 고치면 draw() 가 반쯤 바뀐 목록을 그린다.
  const [a, b] = [{ id: 'a' }, { id: 'b' }]
  const 여럿 = [b]
  고르기토글(a, 여럿, b)
  assert.deepEqual(여럿.map((x) => x.id), ['b'])
})

test('라벨 화면 통신 층에 분석 걸기가 있다', () => {
  // **라벨링을 끝낸 사람이 그 화면에 있다.** 분석하려고 목록으로 되돌아가게
  // 하면 단추를 못 찾는다 — 2026-08-27 실제로 못 찾았다.
  assert.equal(typeof api.analyze, 'function')
})

// ───────────────────────────────────────── 설명서
//
// **여기 적힌 것과 실제 키가 갈리면 안 된다.** 갈린 설명서는 없는 것보다 나쁘다 —
// 사람이 그대로 눌러 보고 «고장 났다» 고 여긴다.

test('설명서에 실제로 있는 키만 적혀 있다', () => {
  const 적힌키 = 설명서().flatMap((g) => g.줄.map(([k]) => k))
  const 있어야 = ['Alt + 끌기', 'Shift + 끌기', 'Shift + 클릭',
    'Ctrl + C', 'Ctrl + V', 'Del', 'Ctrl + Z', '← →']
  for (const k of 있어야) assert.ok(적힌키.includes(k), `설명서에 ${k} 가 없다`)
})

test('종류 키 안내가 KINDS 를 따라간다', () => {
  // 손으로 「1~6」 이라 적어 두면 종류를 하나 뺀 날 설명서만 거짓말을 한다.
  const 줄 = 설명서().flatMap((g) => g.줄).find(([k]) => k.endsWith('키'))
  assert.ok(줄, '종류 키 줄이 없다')
  assert.equal(줄[0], `${KINDS.map((_, i) => i + 1).join('·')} 키`)
  for (const k of KINDS) assert.ok(줄[1].includes(k), `${k} 가 안내에 없다`)
})

test('설명서가 빈 줄이나 빈 묶음을 안 낸다', () => {
  const 묶음들 = 설명서()
  assert.ok(묶음들.length >= 3)
  for (const g of 묶음들) {
    assert.ok(g.묶음 && g.줄.length, JSON.stringify(g))
    for (const [k, v] of g.줄) assert.ok(k && v, `${k} / ${v}`)
  }
})

// ───────────────────────────────────────── 종류마다 다른 칸
//
// **다 보여 주면 아무것도 안 보여 주는 것과 같다** — 로고에 「글자 위계」가 뜨면
// 그게 무슨 뜻인지 생각하다 진짜 필요한 칸을 지나친다.

test('글자에만 위계가 있다', () => {
  assert.equal(보일칸('글자').위계, true)
  for (const k of KINDS.filter((x) => x !== '글자')) assert.equal(보일칸(k).위계, false, k)
})

test('글자에는 층이 없다 — 글자는 언제나 맨 앞이다', () => {
  assert.equal(보일칸('글자').층, false)
  for (const k of KINDS.filter((x) => x !== '글자')) assert.equal(보일칸(k).층, true, k)
})

test('「안에 글자 있다」 칸은 없앴다 — 도형을 긋고 그 안 글자도 따로 긋는다', () => {
  // 2026-09-16 결정. 체크박스가 있던 칸이라 KINDS 전부에서 사라졌는지 본다.
  for (const k of KINDS) assert.equal('글자있음' in 보일칸(k), false, k)
})

test('모양(도형·직접 그리기)은 글자 말고 전부', () => {
  // 사진도 로고도 원형으로 자른다. 글자는 이제 「도형 + 안에 글자 있다」로 간다.
  assert.equal(보일칸('글자').모양, false)
  for (const k of KINDS.filter((x) => x !== '글자')) assert.equal(보일칸(k).모양, true, k)
})

test('기울기는 모든 종류에 있다', () => {
  for (const k of KINDS) assert.equal(보일칸(k).각도, true, k)
})

test('모르는 종류에도 안 죽는다', () => {
  // 옛 라벨의 «인물» 처럼 목록에 없는 종류가 올 수 있다.
  const r = 보일칸('인물')
  assert.equal(typeof r.위계, 'boolean')
  assert.equal(r.모양, true)
})

import { 상태글, 분석지켜보기 } from '../lib/label.js'

test('상태글 — 분석 상태 셋만 말이 되고 나머지는 빈 글자', () => {
  assert.equal(상태글('분석중'), '분석중…')
  assert.equal(상태글('분석 끝'), '분석 끝 — 템플릿이 됐습니다')
  assert.equal(상태글('분석 실패'), '분석 실패')
  assert.equal(상태글('라벨 끝'), '')
  assert.equal(상태글(undefined), '')
})

test('분석지켜보기 — 바뀔 때마다 알리고 끝나면 멈춘다', async () => {
  const 순서 = [{ X: '분석 대기' }, { X: '분석중' }, { X: '분석중' }, { X: '분석 끝' }, { X: '분석 끝' }]
  let i = 0
  const 본것 = []
  const 끝 = await 분석지켜보기({
    id: 'X',
    api: { status: async () => 순서[Math.min(i++, 순서.length - 1)] },
    onState: (s) => 본것.push(s),
    sleep: async () => {},
  })
  assert.equal(끝, '분석 끝')
  assert.deepEqual(본것, ['분석 대기', '분석중', '분석 끝'])
  assert.equal(i, 4)
})

test('분석지켜보기 — 실패도 멈춘다', async () => {
  const 끝 = await 분석지켜보기({ id: 'X', api: { status: async () => ({ X: '분석 실패' }) }, onState: () => {}, sleep: async () => {} })
  assert.equal(끝, '분석 실패')
})

test('분석지켜보기 — 한도를 넘으면 시간 초과', async () => {
  let n = 0
  const 끝 = await 분석지켜보기({ id: 'X', api: { status: async () => { n++; return { X: '분석중' } } },
    onState: () => {}, sleep: async () => {}, 한도: 3 })
  assert.equal(끝, '시간 초과')
  assert.equal(n, 3)
})

test('분석지켜보기 — 물어보기가 터져도 죽지 않고 다음 번에 다시 묻는다', async () => {
  let n = 0
  const 끝 = await 분석지켜보기({ id: 'X', api: { status: async () => { n++; if (n === 1) throw new Error('그물'); return { X: '분석 끝' } } },
    onState: () => {}, sleep: async () => {} })
  assert.equal(끝, '분석 끝')
})

test('「안에 글자 있다」 체크박스는 없앴다', () => {
  // 2026-09-16 결정: 도형을 긋고 그 «안» 글자도 따로 긋는다. 체크박스로 그은
  // 칸은 글자 네모 = 도형 네모라서, 도형 안에 사진이 있으면 글자가 사진 위로
  // 올라간다(실물 파란 타임라인 4번 장: 글자가 x67 에서 시작, 원본은 x306).
  const 글 = readFileSync(new URL('../lib/label.js', import.meta.url), 'utf8')
  assert.ok(!글.includes('안에 글자 있다'), '체크박스 글귀가 남아 있다')
  assert.ok(!글.includes('글자있음'), '`글자있음` 을 아직 내보낸다')
})

// ───────────────────────────────────────── 맞춰 붙이기 (스마트 가이드)
//
// 파워포인트의 그 기능이다(사람 지시 2026-09-19). 눈대중으로 맞추면 1~2px 씩
// 어긋나고, 그 어긋남이 그대로 틀에 실려 만든 카드에서 보인다.

test('문턱 안이면 왼쪽 변이 옆 네모에 딱 붙는다', () => {
  const r = 맞춰붙이기([104, 300, 204, 400], [[100, 50, 200, 150]])
  assert.deepEqual(r.box, [100, 300, 200, 400], '4px 어긋난 것이 붙어야 한다')
  assert.equal(r.선.length, 1, '폭이 같아 세 자리가 다 맞아도 선은 하나다')
  assert.equal(r.선[0].방향, '세로')
  assert.equal(r.선[0].값, 100)
})

test('문턱 밖이면 손도 안 댄다', () => {
  const 끌 = [120, 300, 220, 400]
  const r = 맞춰붙이기(끌, [[100, 50, 200, 150]])
  assert.deepEqual(r.box, 끌)
  assert.deepEqual(r.선, [])
})

test('가로·세로를 따로 붙인다 — 한 축만 맞아도 된다', () => {
  const r = 맞춰붙이기([103, 300, 203, 400], [[100, 50, 200, 150]])
  assert.equal(r.box[0], 100, '가로는 붙는다')
  assert.equal(r.box[1], 300, '세로는 맞을 데가 없어 그대로다')
})

test('크기는 안 바뀐다 — 옮기기만 한다', () => {
  const r = 맞춰붙이기([104, 304, 204, 454], [[100, 300, 200, 150]])
  assert.equal(r.box[2] - r.box[0], 100)
  assert.equal(r.box[3] - r.box[1], 150)
})

test('여럿이 걸리면 제일 가까운 것에 붙는다', () => {
  // 100 은 4px, 101 은 3px 떨어져 있다 — 가까운 101 이 이긴다.
  const r = 맞춰붙이기([104, 300, 204, 400], [[100, 50, 200, 150], [101, 50, 201, 150]])
  assert.equal(r.box[0], 101)
})

test('같은 줄에 여럿이 걸리면 선 하나로 다 잇는다', () => {
  // 선을 네모마다 그으면 같은 자리에 겹쳐 그어져 굵어 보이기만 한다.
  const r = 맞춰붙이기([104, 300, 204, 400], [[100, 50, 200, 150], [100, 600, 200, 700]])
  assert.equal(r.box[0], 100)
  const 세로선 = r.선.filter((x) => x.방향 === '세로')
  assert.equal(세로선.length, 1)
  assert.equal(세로선[0].부터, 50, '제일 위 네모부터')
  assert.equal(세로선[0].까지, 700, '제일 아래 네모까지')
})

test('가운데끼리는 안 맞춘다 — 변만 본다', () => {
  // 사람 지시 2026-09-19: 「맞추는거 중심부는 필요없을거 같아」.
  // 1080 폭 한가운데는 540. 끄는 네모 가운데가 543 이라도 안 붙는다.
  const 끌 = [493, 300, 593, 400]
  assert.deepEqual(맞춰붙이기(끌, [[0, 0, 1080, 1350]]).box, 끌)
  // 옆 네모 가운데(150)에도 안 붙는다 — 예전엔 붙었다
  const 끌2 = [105, 300, 205, 400]
  assert.deepEqual(맞춰붙이기(끌2, [[100, 50, 200, 150]]).box, [100, 300, 200, 400],
    '왼쪽 변 100 에는 여전히 붙는다')
  // 화면 가장자리(0·1080)에는 붙는다 — 그건 변이다
  assert.equal(맞춰붙이기([4, 300, 104, 400], [[0, 0, 1080, 1350]]).box[0], 0)
})

test('점선은 맞은 두 네모를 잇는 만큼만 긋는다', () => {
  // 화면을 가로지르게 그으면 어느 네모에 맞은 것인지 안 보인다.
  const r = 맞춰붙이기([104, 300, 204, 400], [[100, 50, 200, 150]])
  assert.equal(r.선[0].부터, 50, '위 네모의 위쪽')
  assert.equal(r.선[0].까지, 400, '끄는 네모의 아래쪽')
})

test('견줄 것이 없거나 이상하면 그냥 둔다', () => {
  const 끌 = [10, 20, 30, 40]
  for (const 남 of [[], null, undefined, [null, [1, 2]]]) {
    assert.deepEqual(맞춰붙이기(끌, 남).box, 끌, JSON.stringify(남))
  }
})

test('문턱 안이면 붙고 한 픽셀만 더 벗어나면 안 붙는다', () => {
  // **화면 픽셀이다.** 부르는 쪽이 배율로 나눠 넣는다 — 그림 픽셀로 재면
  // 크게 볼 땐 너무 잘 붙고 작게 볼 땐 거의 안 붙는다(실측 배율 0.145에서
  // 6그림px = 손끝 0.9px).
  //
  // **숫자를 손으로 안 적는다** — 값은 사람이 만져 보며 고치는 것이라
  // (8 → 5, 2026-09-19) 박아 두면 고칠 때마다 시험만 빨개진다.
  const 남 = [[100, 50, 200, 150]]
  const 붙는다 = (어긋남) => 맞춰붙이기([100 + 어긋남, 300, 200 + 어긋남, 400], 남).box[0] === 100
  assert.ok(붙는다(붙임문턱), `${붙임문턱} 은 붙어야 한다`)
  assert.ok(!붙는다(붙임문턱 + 1), `${붙임문턱 + 1} 은 안 붙어야 한다`)
  // 문턱을 넣으면 그것을 쓴다
  assert.equal(맞춰붙이기([120, 300, 220, 400], 남, { 문턱: 25 }).box[0], 100)
})

// ── 끈적함 ─────────────────────────────────────────────────────────
// 붙자마자 1px 만 움직여도 떨어지면 붙었다 떨어졌다만 되풀이할 뿐 「딱」 느낌이
// 안 난다(사람 지적 2026-09-19). 붙어 있던 줄은 더 버틴다.

test('붙어 있던 줄은 문턱을 넘어서도 버틴다', () => {
  const 남 = [[100, 50, 200, 150]]
  // 문턱보다 1px 더 벗어난 자리 — 보통은 안 붙는다
  const 어긋남 = 붙임문턱 + 1
  const 끌 = [100 + 어긋남, 300, 200 + 어긋남, 400]
  assert.equal(맞춰붙이기(끌, 남).box[0], 100 + 어긋남)
  // 그런데 직전에 100 에 붙어 있었으면 문턱 × 1.6 까지 버틴다
  assert.ok(어긋남 <= 붙임문턱 * 붙임버팀, '이 시험이 서려면 버팀 안쪽이어야 한다')
  const r = 맞춰붙이기(끌, 남, { 버틴값: { 가로: 100, 세로: null } })
  assert.equal(r.box[0], 100)
  assert.equal(r.붙은값.가로, 100)
})

test('아주 멀어지면 버티던 줄도 놓는다', () => {
  const 멀리 = Math.ceil(붙임문턱 * 붙임버팀) + 1
  const r = 맞춰붙이기([100 + 멀리, 300, 200 + 멀리, 400], [[100, 50, 200, 150]],
    { 버틴값: { 가로: 100, 세로: null } })
  assert.equal(r.box[0], 100 + 멀리, '문턱 × 버팀 을 넘으면 떨어진다')
  assert.equal(r.붙은값.가로, null)
})

test('버티는 줄이 조금 더 가까운 옆 줄을 이긴다', () => {
  // 100 은 6px, 104 는 2px 떨어져 있다. 거리만 보면 104 가 이기지만,
  // 100 에 붙어 있었으면 가산점(÷1.6)을 받아 6/1.6 = 3.75 로 104(2) 에 진다.
  // 그래서 여기서는 104 가 맞다 — 너무 끈적하면 옆으로 못 옮긴다.
  const r = 맞춰붙이기([106, 300, 206, 400], [[100, 50, 200, 150], [104, 50, 204, 150]],
    { 버틴값: { 가로: 100, 세로: null } })
  assert.equal(r.box[0], 104)
})

test('버팀 배수는 1.6 이다', () => {
  assert.equal(붙임버팀, 1.6)
})

// ── 크기 조정도 붙는다 ──────────────────────────────────────────────

test('크기를 바꿀 때는 «잡은 변» 만 붙고 반대쪽은 못 박힌 듯 그대로다', () => {
  // 오른쪽(e) 손잡이를 잡았다. 오른쪽 변 404 가 옆 네모 오른쪽 400 에 붙어야 하고
  // 왼쪽 변 100 은 안 움직여야 한다.
  const r = 맞춰붙이기([100, 300, 404, 400], [[200, 50, 400, 150]], { 손잡이: 'e' })
  assert.deepEqual(r.box, [100, 300, 400, 400])
})

test('왼쪽 손잡이는 왼쪽 변만 민다', () => {
  const r = 맞춰붙이기([196, 300, 500, 400], [[200, 50, 400, 150]], { 손잡이: 'w' })
  assert.deepEqual(r.box, [200, 300, 500, 400])
})

test('위아래 손잡이는 가로를 안 건드린다', () => {
  const r = 맞춰붙이기([104, 296, 204, 400], [[100, 300, 200, 500]], { 손잡이: 'n' })
  assert.equal(r.box[0], 104, '가로는 그대로')
  assert.equal(r.box[1], 300, '위 변만 붙는다')
})

test('모서리 손잡이는 두 변을 같이 민다', () => {
  const r = 맞춰붙이기([196, 296, 500, 600], [[200, 300, 400, 500]], { 손잡이: 'nw' })
  assert.deepEqual(r.box, [200, 300, 500, 600])
})

test('붙이다 네모가 사라질 만하면 안 붙인다', () => {
  // 오른쪽 변을 왼쪽 변보다 왼쪽으로 붙이려 하면 네모가 뒤집힌다.
  const 끌 = [300, 100, 302, 200]
  const r = 맞춰붙이기(끌, [[0, 0, 300, 50]], { 손잡이: 'e', 문턱: 10 })
  assert.deepEqual(r.box, 끌)
  assert.deepEqual(r.선, [])
})


// ── 사진 설명 (사람 지시 2026-09-19) ───────────────────────────────
//
// 「라벨링 할 때 사진에 설명 같은 것도 적을 수 있게 해서, 나중에 OpenAI 한테
// 사진 만들어 달라고 할 때 그 설명대로 만들게」
//
// **위치·방향이 알맹이다**(사람 지적: 「오른쪽 사진 3개 쪽으로 프레젠테이션
// 포즈 해야지」). 지금 사진 지시문은 «그 장의 글» 만 넘겨서, 사람이 어느 쪽을
// 보고 어디를 가리키는지를 말할 길이 없다.
//
// `note` 는 예전에 있다가 화면에서 뺐고, 그래서 죽은칸에 들어갔다. 되살리는
// 것이라 **화면 칸·죽은칸·종류바꾸기 셋을 한 커밋에서** 같이 고친다 —
// 목록에서만 빼면 값 없는 칸이 또 떠돈다(폴더 세션 지적).

const _장 = (boxes) => JSON.stringify({ canvas: { w: 1080, h: 1350 }, boxes })

test('설명은 죽은 칸이 아니다 — 화면에 칸이 생겼으므로', () => {
  assert.ok(!serverLabels.죽은칸.includes('note'), 'note 가 저장할 때 털린다')
})

test('종류를 바꿔도 설명은 안 지운다', () => {
  // 서버만 고치면 화면이 지운다 — 사람이 종류를 한 번 바꾸는 순간 사라진다.
  const 글 = readFileSync(new URL('../lib/label.js', import.meta.url), 'utf-8')
  const m = 글.match(/for \(const key of \[([^\]]*)\]\) delete sel\[key\]/)
  assert.ok(m, '종류 바꿀 때 지우는 줄을 못 찾았다')
  assert.ok(!m[1].includes('note'), `종류를 바꾸면 설명이 지워진다: ${m[1]}`)
})

test('설명 칸은 사진·인물·장식에만 뜬다', () => {
  // 글자 네모에 「사진 설명」이 뜨면 무슨 뜻인지 생각하다 진짜 칸을 지나친다.
  for (const k of ['사진', '인물', '장식']) assert.equal(보일칸(k).설명, true, k)
  for (const k of ['글자', '도형', '로고', '장번호', '빼기']) {
    assert.equal(보일칸(k).설명, false, k)
  }
})

test('설명이 너무 길면 막는다 — MAX_NOTE 를 실제로 쓴다', () => {
  // 상수도 있고 둘이 같은지 보는 시험도 있는데 길이 검사에 안 걸려 있었다.
  const ok = serverLabels.checkLabels('C_abc', 1, _장([{ id: 'b1', kind: '사진',
    box: [0, 0, 10, 10], note: 'ㄱ'.repeat(MAX_NOTE) }]))
  assert.ok(ok.json, `${MAX_NOTE}자를 막았다: ${ok.why}`)
  const 긴것 = serverLabels.checkLabels('C_abc', 1, _장([{ id: 'b1', kind: '사진',
    box: [0, 0, 10, 10], note: 'ㄱ'.repeat(MAX_NOTE + 1) }]))
  assert.match(긴것.why, /설명/)
})

test('설명이 저장된다', () => {
  const r = serverLabels.checkLabels('C_abc', 1, _장([{ id: 'b1', kind: '사진',
    box: [0, 0, 10, 10], note: '검은 정장 남성, 오른쪽을 가리키는 포즈' }]))
  assert.equal(JSON.parse(r.json).boxes[0].note, '검은 정장 남성, 오른쪽을 가리키는 포즈')
})

test('설명 칸을 화면에 실제로 그린다', () => {
  // **깃발만 세우고 칸을 안 그리면 아무 일도 안 일어난다.** `보일칸` 이
  // `설명: true` 를 내도 그것을 읽어 입력칸을 만드는 코드가 없으면 사람은
  // 적을 데가 없다(실물 2026-09-19: 제가 그렇게 했다).
  const 글 = readFileSync(new URL('../lib/label.js', import.meta.url), 'utf-8')
  assert.ok(/보임\.설명/.test(글), '`보일칸` 의 설명 깃발을 아무도 안 읽는다')
  assert.ok(/target\.note/.test(글), '적은 글을 네모에 안 담는다')
  assert.ok(/MAX_NOTE/.test(글), '길이를 안 막는다 — 서버가 400 을 내면 그 장이 통째로 안 저장된다')
})

// ── 누끼 고르기 (사람 지적 2026-09-19) ─────────────────────────────
//
// 「사진란에 뭐 추가해야하는거 아님? 누끼뺄건지말건지 맞아?」
//
// 지금은 «배경자리만 빼고 전부 누끼» 로 자동인데, 실측으로 그게 늘 맞지 않다:
// 창고 사진 자리 163개 중 132개가 자동 누끼 대상이고, **그중 10곳은 장의 절반
// 넘게 차지하는 큰 사진**이다(실물: 트렌드유통 장2 60% · AI문해력 장2 51%).
// 그런 자리가 투명해지면 허전해진다.
//
// **자동을 기본으로 두되 사람이 뒤집을 수 있게 한다.** 라벨 163개를 사람이
// 다 고르게 하면 손이 너무 많이 간다.

test('누끼 칸은 사진·인물에만 뜬다', () => {
  for (const k of ['사진', '인물']) assert.equal(보일칸(k).누끼, true, k)
  for (const k of ['글자', '도형', '장식', '로고', '장번호', '빼기']) {
    assert.equal(보일칸(k).누끼, false, k)
  }
})

test('누끼 칸을 화면에 실제로 그린다', () => {
  const 글 = readFileSync(new URL('../lib/label.js', import.meta.url), 'utf-8')
  assert.ok(/보임\.누끼/.test(글), '`보일칸` 의 누끼 깃발을 아무도 안 읽는다')
  assert.ok(/target\.누끼/.test(글), '고른 것을 네모에 안 담는다')
})

test('누끼는 체크해야만 한다 — 기본은 «안 뺌»', () => {
  // 사람 지시 2026-09-19: 「기계가 정함 이건 빼 그냥 기본으로는 안빼고
  // 체크해야 뺌」. 안 고른 것과 「안 함」을 가를 이유가 없어졌다.
  const 안고름 = serverLabels.checkLabels('C_abc', 1, _장([{ id: 'b1', kind: '사진',
    box: [0, 0, 10, 10] }]))
  assert.ok(안고름.json, 안고름.why)
  const 고름 = serverLabels.checkLabels('C_abc', 1, _장([{ id: 'b1', kind: '사진',
    box: [0, 0, 10, 10], 누끼: true }]))
  assert.equal(JSON.parse(고름.json).boxes[0].누끼, true)
  assert.match(serverLabels.checkLabels('C_abc', 1, _장([{ id: 'b1', kind: '사진',
    box: [0, 0, 10, 10], 누끼: '응' }])).why, /누끼/)
})

test('배경이 사진인 장에도 설명을 적을 수 있다', () => {
  // 사람 지시 2026-09-19: 「배경이 사진이다 부분도 설명 넣을수있지 않아?」
  // 장 하나에 하나다 — 네모의 성질이 아니라 그 장의 성질이라 `doc` 에 붙는다.
  const r = serverLabels.checkLabels('C_abc', 1, JSON.stringify({
    canvas: { w: 1080, h: 1350 }, 배경사진: true,
    배경설명: '해질 무렵 도시 야경, 위쪽은 하늘로 비워 둘 것',
    boxes: [],
  }))
  assert.ok(r.json, r.why)
  assert.equal(JSON.parse(r.json).배경설명, '해질 무렵 도시 야경, 위쪽은 하늘로 비워 둘 것')
  assert.match(serverLabels.checkLabels('C_abc', 1, JSON.stringify({
    canvas: { w: 1080, h: 1350 }, 배경설명: 42, boxes: [],
  })).why, /설명/)
})

test('장을 다시 읽을 때 배경 설명을 되살린다', () => {
  // 사람 지적 2026-09-20: 「나갔다가 들어오면 사라지던데」. 저장 검사만 보고
  // **되읽는 길을 아무도 안 봤다** — `load()` 가 배경사진만 채우고 설명은
  // 빈 채로 뒀다. 서버가 돌려주는지는 `labels.test.js` 가 따로 본다.
  const 글 = readFileSync(new URL('../lib/label.js', import.meta.url), 'utf-8')
  assert.ok(/배경설명 = [^=\n]*이장/.test(글), '되읽을 때 배경 설명을 안 채운다')
})
