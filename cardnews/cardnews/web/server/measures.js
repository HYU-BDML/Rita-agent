// 분석이 잰 측정값을 표(D1)에 넣고 꺼낸다.
//
// 값을 칸으로 쪼개지 않고 글자 한 덩어리로 넣는다. 측정 항목이 아직 굳지 않아서다 —
// 축이 하나 늘 때마다 표를 고치면 파이썬과 표가 계속 어긋난다. 여기서는 보여주기만
// 하므로 칸별로 찾을 일도 없다.
//
// 판단하는 부분(형식 검사)은 순수 함수로 빼서 D1 없이 시험한다.

import { isId } from './picks.js'

// 슬라이드 40장짜리 게시물도 20KB 안쪽이다. 100배를 한도로 둔다.
const MAX_CHARS = 200_000

// 올라온 측정값이 쓸 만한지 본다. 이상하면 why 만 돌려준다.
export function checkMeasure(id, text) {
  if (!isId(id)) return { why: '게시물 코드가 이상합니다' }
  const s = String(text ?? '')
  if (!s) return { why: '측정값이 비었습니다' }
  if (s.length > MAX_CHARS) return { why: `측정값이 너무 깁니다 (${s.length}자)` }
  let doc
  try {
    doc = JSON.parse(s)
  } catch {
    return { why: '측정값이 JSON 이 아닙니다' }
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return { why: '측정값 모양이 아닙니다' }
  if (!Array.isArray(doc.slides) || !doc.slides.length) return { why: 'slides 가 비었습니다' }
  // 다시 찍어 넣는다. 들여쓰기와 줄바꿈을 털어 표에 같은 모양으로만 들어가게 한다.
  return { json: JSON.stringify(doc), slides: doc.slides.length }
}

// 같은 게시물을 다시 올리면 덮어쓴다. 다시 재서 올리는 일이 잦다.
export async function saveMeasure(db, id, json, nowIso) {
  await db
    .prepare(
      `INSERT INTO measures (id, json, saved_at) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET json = excluded.json, saved_at = excluded.saved_at`
    )
    .bind(id, json, nowIso)
    .run()
}

export async function getMeasure(db, id) {
  if (!isId(id)) return null
  const row = await db.prepare('SELECT json FROM measures WHERE id = ?').bind(id).first()
  return row ? row.json : null
}

// 어느 게시물이 재어졌는지만 알려준다. 목록 화면에 표시를 붙일 때 쓴다.
export async function listMeasureIds(db) {
  const { results } = await db.prepare('SELECT id FROM measures').all()
  return (results || []).map((r) => r.id)
}
