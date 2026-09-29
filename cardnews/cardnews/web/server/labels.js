// 사람이 그은 네모를 표(D1)에 넣고 꺼낸다.
//
// 슬라이드 하나가 줄 하나다. 게시물 단위로 한 줄에 몰면 두 사람이 같은 게시물을
// 라벨링할 때 읽고-고쳐-쓰는 사이에 서로 덮어쓴다.
//
// 값은 칸으로 쪼개지 않고 JSON 한 덩어리로 넣는다 — measures.js 와 같은 사정이다.
// 판단하는 부분(형식 검사)은 순수 함수로 빼서 D1 없이 시험한다.

import { isId } from './picks.js'

// 배경은 여기 없다. 다 긋고 남는 자리가 배경이다 (설계 4절).
// 「버튼」은 뺐다(2026-08-20 사람 결정) — 장식 안에 들어가는 것이라 따로 둘 이유가 없다.
// 실물 라벨(DHqCBQnRAjW)에 버튼이 0개라(사진10·글자17·로고6·인물1·장식1) 옮길 데이터도 없다.
// 화면에서 뺀 기능의 칸들 — 저장할 때 지운다(`checkLabels` 끝). 검사는 그대로 통과
// 시킨다(옛 라벨을 400 으로 막으면 사람이 손도 못 댄다). `rle`·`conf` 는 SAM 시절
// 잔재이고, 나머지는 라벨 화면에서 칸을 없앤 것들이다.
// **`note`(설명)는 2026-09-19 에 되살렸다** — 사진 자리에 «무엇을 찍은 사진인지»
// 를 적어 두면 AI 가 그림을 만들 때 그대로 따른다(사람 지시). 화면에 칸이 다시
// 생겼으므로 죽은 칸이 아니다.
export const 죽은칸 = ['글자있음', 'cut', 'font', 'effects', 'treat', 'rle', 'conf']

export const MAX_OUTLINE = 2000
// 사람이 슥 긋는 자취는 초당 수십 점씩 쌓인다. 다듬고 나면 원이 48점,
// 다각형이 열 몇 점이라 2000 은 «다듬기를 안 거친 날것» 을 막는 문턱이다.

export const KINDS = ['글자', '사진', '인물', '도형', '장식', '로고', '장번호', '빼기']

// 되돌려 그리기와 Dify 그리기가 같은 목록을 써야 어긋나지 않는다 (설계 4-2절).
// 계산으로 나오는 것은 고딕/명조 둘뿐이고, 이 중 어느 것인지는 사람이 고른다.
export const FONTS = [
  '프리텐다드', '원티드산스', '지마켓산스', '에스코어드림',
  '여기어때잘난체', '검은고딕', '배민도현', '나눔스퀘어라운드', '나눔명조',
]
// 「번호」 는 기계가 스스로 찾은 장 번호 칸에 붙는 위계다. 화면 목록에도 있어서
// 사람이 고를 수 있는데 여기 없어 저장이 400 으로 거절됐다(2026-08-30~09-19).
export const LEVELS = ['제목', '본문', '꼬리표', '번호']
export const EFFECTS = ['외곽선', '그림자', '밑줄']
export const TREATS = ['그대로', '어둡게깔기', '밝게깔기', '흐림', '누끼', '테두리']

export const MAX_NOTE = 500

// 기울기(angle)는 네모 «가운데» 를 축으로 한 회전이다. 도(°) 단위, 시계 방향.
// -180~180 만 받는다. 그 밖의 값은 같은 회전을 다르게 적은 것일 뿐이라(370° = 10°),
// 두 가지로 적힌 같은 각도를 밑에서 또 접어야 하는 일을 여기서 끝낸다.
// lib/label.js 의 MAX_ANGLE 과 같아야 한다 — label-ui.test.js 가 대조한다.
export const MAX_ANGLE = 180

import { 말하기 } from './라벨서버말.js'

// **언어는 부르는 쪽이 넘긴다.** 안 넘기면 한국어다 — 옛 부르는 쪽이
// 그대로 돌게 두려는 것이지, 그게 맞는 값이라서가 아니다.
const MAX_CHARS = 200_000
const MAX_SLIDES = 99

export function checkLabels(id, idx, text, 언어) {
  const 말 = 말하기(언어)
  if (!isId(id)) return { why: 말('코드이상') }
  if (!Number.isInteger(idx) || idx < 1 || idx > MAX_SLIDES) {
    return { why: 말('장번호이상') }
  }
  const s = String(text ?? '')
  if (s.length > MAX_CHARS) return { why: 말('라벨너무김', s.length) }
  let doc
  try {
    doc = JSON.parse(s)
  } catch {
    return { why: 말('라벨JSON아님') }
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return { why: 말('라벨모양아님') }

  const c = doc.canvas
  if (!c || !Number.isFinite(c.w) || !Number.isFinite(c.h) || c.w <= 0 || c.h <= 0) {
    return { why: 말('캔버스없음') }
  }
  if (!Array.isArray(doc.boxes)) return { why: 말('boxes배열아님') }

  // **죽은 칸은 검사하기 «전에» 턴다**(2026-09-19). 아래 검사가 이 칸들의
  // 모양까지 따지고 있었다 — 버릴 값이 「배열이 아니다」고 저장을 400 으로
  // 막았다(실물: `effects` 가 객체인 옛 라벨). 그런 라벨을 가진 사람은
  // 네모 하나 옮기는 것도 못 해서 고칠 길이 아예 없었다.
  //
  // 여기서 털면 «통과시킨다»가 저절로 된다 — 없는 칸은 검사에 안 걸린다.
  for (const b of doc.boxes) {
    if (b && typeof b === 'object') for (const k of 죽은칸) delete b[k]
  }

  // 이 장의 배경이 사진인가. **장 하나에 하나** — 네모의 성질이 아니다.
  // 기계가 알아서 판정하지만 조용히 틀릴 자리가 있어(거의 한 색인 사진 배경)
  // 사람이 못 박을 수 있게 둔다.
  if ('배경사진' in doc && typeof doc.배경사진 !== 'boolean') {
    return { why: 말('배경참거짓아님') }
  }
  // 배경 사진 설명 — AI 가 이 장의 배경을 그릴 때 따를 글(2026-09-19).
  // **장 하나에 하나다** — 네모가 아니라 그 장의 성질이라 여기 붙는다.
  if ('배경설명' in doc) {
    if (typeof doc.배경설명 !== 'string') return { why: 말('배경설명글아님') }
    if (doc.배경설명.length > MAX_NOTE) {
      return { why: 말('배경설명너무김', doc.배경설명.length) }
    }
  }
  for (const b of doc.boxes) {
    if (!b || typeof b !== 'object') return { why: 말('네모모양아님') }
    if (!KINDS.includes(b.kind)) return { why: 말('모르는라벨', b.kind) }
    const q = b.box
    if (!Array.isArray(q) || q.length !== 4 || !q.every(Number.isFinite)) {
      return { why: 말('좌표넷아님') }
    }
    const [x0, y0, x1, y1] = q
    if (x1 <= x0 || y1 <= y0) return { why: 말('네모뒤집힘') }
    // 이 검사는 «안 기운» 네모만 본다. angle 이 붙어도 여기는 그대로다 —
    // 기운 네모의 «모서리»는 화면 밖으로 나갈 수 있는 게 정상이고(화면 끝에 걸친
    // 대각선 글자띠), 모서리까지 검사하면 사람이 정당하게 그은 네모 하나 때문에
    // 그 장의 저장이 통째로 영영 거절된다 — 예전에 음수 좌표 하나로 실제로 겪은 그 버그다.
    // 화면을 벗어난 자리는 자를 때 잘리면 그만이지, 저장을 막을 일이 아니다.
    if (x0 < 0 || y0 < 0 || x1 > c.w || y1 > c.h) return { why: 말('네모화면밖') }

    // 여섯 칸 모두 선택이다. 없는 게 정상이라 undefined 는 건너뛴다 —
    // truthy 검사를 쓰면 cut:false 나 note:'' 처럼 정당한 값이 걸린다. angle 은 같은 함정이
    // 반대쪽으로 샌다 — `if (b.angle)` 로 쓰면 angle:null(JSON 이 NaN·Infinity 를 그렇게
    // 적는다)이 검사를 통째로 건너뛰어 그대로 저장되고, 그걸 읽는 파이썬이 밑에서 터진다.
    if ('angle' in b) {
      if (typeof b.angle !== 'number' || !Number.isFinite(b.angle)) {
        return { why: 말('기울기숫자아님') }
      }
      if (b.angle < -MAX_ANGLE || b.angle > MAX_ANGLE) {
        return { why: 말('기울기범위밖', MAX_ANGLE, b.angle) }
      }
    }
    // 설명 — 사진 자리에 «무엇을 찍은 사진인지». AI 가 그림을 만들 때 그대로
    // 따른다. **상수를 실제로 쓴다** — `MAX_NOTE` 가 양쪽에 있고 둘이 같은지
    // 보는 시험까지 있는데 정작 길이 검사에 안 걸려 있었다(2026-09-19).
    if ('note' in b) {
      if (typeof b.note !== 'string') return { why: 말('설명글아님') }
      if (b.note.length > MAX_NOTE) return { why: 말('설명너무김', b.note.length) }
    }
    // 누끼로 받을지 — 사람이 못 박은 것. **없는 게 기본이다**(그때는 분석이
    // 「배경자리 말고는 누끼」로 자동 판단한다). `false` 도 뜻이 있는 값이라
    // `in` 으로 본다 — truthy 로 보면 「안 함」이 조용히 사라진다.
    if ('누끼' in b && typeof b.누끼 !== 'boolean') {
      return { why: 말('누끼참거짓아님') }
    }
    // 글자 위계를 사람이 못 박은 것. 없으면 기계가 정한다(`levels_of`).
    if ('위계' in b && !LEVELS.includes(b.위계)) {
      return { why: 말('모르는위계', b.위계) }
    }
    // 층 — 겹친 장식 중 몇 번째인가. 작을수록 뒤다. **없어도 된다** — 한 칸이라도
    // 비면 읽는 쪽이 층을 통째로 무시하고 목록 차례를 쓴다.
    if ('층' in b) {
      if (!Number.isInteger(b.층) || b.층 < 0) {
        return { why: 말('층정수아님', b.층) }
      }
    }
    // 테두리 — 사람이 «직접 그린» 모양. 있으면 분석이 기계 누끼를 안 돌리고
    // 이걸 그대로 쓴다. **없어도 된다** — 기본은 네모이고, 원·별처럼 네모로 못
    // 담는 것만 사람이 그린다.
    //
    // 화면 안에 있는지는 «안» 본다. 네모(box)와 달리 이 점들은 사람이 가려진
    // 부분까지 이어 그리라고 만든 것이라, 글자에 덮인 원의 아랫자락이 화면
    // 가장자리를 조금 넘어가는 일이 정상이다. 자를 일은 자를 때 자르면 된다.
    if ('테두리' in b) {
      if (!Array.isArray(b.테두리) || b.테두리.length < 3) {
        return { why: 말('테두리점적음') }
      }
      if (b.테두리.length > MAX_OUTLINE) {
        return { why: 말('테두리점많음', b.테두리.length) }
      }
      for (const pt of b.테두리) {
        if (!Array.isArray(pt) || pt.length !== 2 || !pt.every(Number.isFinite)) {
          return { why: 말('테두리점모양') }
        }
      }
    }
    // 도형 — 테두리를 «만든 법»(이름과 값). 라벨링 화면이 다시 고칠 때 쓴다.
    // 분석·틀·굽는 쪽은 `테두리` 만 읽으므로 이 칸을 몰라도 된다.
    if ('도형' in b) {
      const d = b.도형
      if (!d || typeof d !== 'object' || typeof d.이름 !== 'string' || !d.이름) {
        return { why: 말('도형이름없음') }
      }
      if (d.이름.length > 20) return { why: 말('도형이름김', d.이름.length) }
      if ('값' in d) {
        if (!d.값 || typeof d.값 !== 'object' || Array.isArray(d.값)) {
          return { why: 말('도형값묶음아님') }
        }
        for (const v of Object.values(d.값)) {
          if (!Number.isFinite(v)) return { why: 말('도형값숫자아님', v) }
        }
      }
    }
  }

  return { json: JSON.stringify(doc), count: doc.boxes.length }
}

// 확정 = "이 라벨로 분석해라". 라벨이 바뀌면 그 약속이 실제와 어긋나므로 상태를 되돌린다.
// '분석중' 만은 되돌리지 않는다 — 파이썬이 이미 읽어간 라벨이 밑에서 바뀌면
// 계량표가 라벨과 안 맞는 채로 완성된다. 끝날 때까지 편집을 막는 편이 낫다.
export function afterEdit(cur) {
  if (cur === '분석중') return 'MUST_WAIT'
  if (cur === '분석 끝' || cur === '분석 실패') return '분석 대기'
  return null            // 확정 대기였으면 확정 취소, 원래 없었으면 그대로 없음
}

export async function saveLabels(db, id, idx, json, nowIso, 언어) {
  const row = await db.prepare('SELECT state FROM analysis WHERE id = ?').bind(id).first()
  const cur = row ? row.state : null
  const next = afterEdit(cur)
  if (next === 'MUST_WAIT') {
    return { ok: false, why: 말하기(언어)('분석중') }
  }

  await db
    .prepare(
      `INSERT INTO annotations (id, idx, json, saved_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(id, idx) DO UPDATE SET json = excluded.json,
         saved_at = excluded.saved_at`,
    )
    .bind(id, idx, json, nowIso)
    .run()

  if (next === null) {
    if (cur !== null) await db.prepare('DELETE FROM analysis WHERE id = ?').bind(id).run()
  } else {
    await db.prepare(
      `INSERT INTO analysis (id, state, at) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET state = excluded.state, at = excluded.at`,
    ).bind(id, next, nowIso).run()
  }
  return { ok: true }
}

// ~confirm 통로. on=true 면 "이 라벨로 분석해라"(분석 대기), on=false 면 확정 취소(행 삭제) —
// 라벨을 고쳤을 때 자동으로 풀리는 것과 같은 모양으로 맞춘다 (afterEdit 참고).
//
// '분석중'일 때는 켜기도 끄기도 막는다. 막지 않으면: (켜기) 파이썬이 이미 도는데
// 화면이 '분석 대기'라고 거짓말하고, (끄기) analysis 행이 지워졌다가 파이썬이 끝나며
// setRun 이 그 행을 다시 만들어 취소한 적이 없던 것처럼 결과가 나온다 — 취소 의도가
// 흔적도 없이 사라진다. saveLabels 와 같은 이유, 같은 문구로 막는다.
export async function setConfirm(db, id, on, nowIso, 언어) {
  if (!isId(id)) return { why: 말('코드이상') }
  const row = await db.prepare('SELECT state FROM analysis WHERE id = ?').bind(id).first()
  if (row && row.state === '분석중') {
    return { ok: false, why: 말하기(언어)('분석중') }
  }
  if (on) {
    await db.prepare(
      `INSERT INTO analysis (id, state, at) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET state = excluded.state, at = excluded.at`,
    ).bind(id, '분석 대기', nowIso).run()
  } else {
    await db.prepare('DELETE FROM analysis WHERE id = ?').bind(id).run()
  }
  return { ok: true }
}

// 통로 분기. _worker.js 를 얇게 유지하려고 판정만 여기서 한다.
export function labelRoute(parts, method) {
  if (parts[1] !== 'labels' || !parts[2]) return null
  // `~` 는 isId 의 정규식([A-Za-z0-9_-])에 없다 — 예약 이름이 어떤 게시물 코드와도
  // 부딪힐 수 없다. `_status` 로 두면 밑줄이 허용돼 같은 이름의 게시물이 실제로 담길 수 있었다.
  if (method === 'GET' && parts[2] === '~status' && parts.length === 3) return { op: 'status' }
  if (method === 'PUT' && parts[2] === '~run' && parts.length === 4) {
    return { op: 'run', id: parts[3] }
  }
  if (parts[2] === '~confirm' && parts.length === 4) {
    if (method === 'PUT') return { op: 'confirm', id: parts[3], on: true }
    if (method === 'DELETE') return { op: 'confirm', id: parts[3], on: false }
    return null
  }
  if (method === 'GET' && parts.length === 3) return { op: 'get', id: parts[2] }
  if (method === 'PUT' && parts.length === 4) {
    const idx = Number(parts[3])
    if (!Number.isInteger(idx)) return null
    return { op: 'put', id: parts[2], idx }
  }
  return null
}

export async function getLabels(db, id) {
  const { results } = await db
    .prepare('SELECT idx, json, saved_at FROM annotations WHERE id = ? ORDER BY idx')
    .bind(id)
    .all()
  return (results ?? []).map((r) => {
    const 저장된것 = JSON.parse(r.json)
    return {
      index: r.idx,
      boxes: 저장된것.boxes ?? [],
      canvas: 저장된것.canvas,
      // **이 칸이 빠져 있었다.** 저장은 되는데 돌려주지 않아서, 사람이 「이 장은
      // 배경이 사진이다」를 켜고 장을 넘겼다 오면 체크가 풀렸다. 더 나쁜 건
      // 분석도 못 읽은 것이다(`merge_labeled` 가 이 칸을 본다) — 켜도 아무
      // 일이 없었다(사람이 2026-08-27 알려 줬다).
      배경사진: Boolean(저장된것.배경사진),
      // **설명도 똑같이 빠져 있었다**(사람이 2026-09-20 알려 줬다: 「나갔다가
      // 들어오면 사라지던데」). 위 주석의 사고를 한 달 뒤에 그대로 되풀이했다 —
      // 칸을 새로 만들 때는 **돌려주는 자리까지** 같이 봐야 한다.
      배경설명: 저장된것.배경설명 ?? '',
      at: r.saved_at,
    }
  })
}

const FRESH_MS = 10 * 60 * 1000     // 이 안에 저장됐으면 누가 지금 그리고 있는 것으로 본다

// 저장된 값과 시각만으로 상태를 정한다. 따로 표시해 두지 않는다 —
// 잠금 장치를 만들면 창을 닫고 도망간 사람 때문에 영영 잠긴다.
export function statusOf(labeled, total, lastAt, runState, nowMs) {
  if (runState) return runState                       // 분석중 / 분석끝 / 분석실패
  if (!labeled) return '안 함'
  if (lastAt && nowMs - Date.parse(lastAt) < FRESH_MS) return '작업중'
  return labeled >= total ? '라벨 끝' : `라벨 ${labeled}/${total}장`
}

export async function boardStatus(db, nowMs) {
  const { results: rows } = await db.prepare(
    `SELECT p.id, p.slide_count AS total,
            COUNT(a.idx) AS labeled, MAX(a.saved_at) AS last_at, r.state AS run
       FROM picks p
       LEFT JOIN annotations a ON a.id = p.id
       LEFT JOIN analysis    r ON r.id = p.id
      GROUP BY p.id`,
  ).all()
  return Object.fromEntries((rows ?? []).map((r) =>
    [r.id, statusOf(r.labeled, r.total, r.last_at, r.run, nowMs)]))
}

// 파이썬이 분석을 시작·끝낼 때 알려준다. '분석 대기' 는 확정(사람이 누름)이 만드는
// 상태라 파이썬이 직접 보내지는 않지만, statusOf 가 runState 로 다뤄야 해서 여기 같이 둔다.
export const RUN_STATES = ['분석중', '분석 끝', '분석 실패', '분석 대기']

export async function setRun(db, id, state, nowIso) {
  if (!isId(id) || !RUN_STATES.includes(state)) return false
  await db.prepare(
    `INSERT INTO analysis (id, state, at) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET state = excluded.state, at = excluded.at`,
  ).bind(id, state, nowIso).run()
  return true
}
