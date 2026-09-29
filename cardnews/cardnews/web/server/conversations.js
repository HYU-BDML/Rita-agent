// 채팅 페이지의 대화 한 줄. 표는 schema.sql 의 conversations.
//
// 사람 구분이 없다. 번호를 아는 브라우저가 주인이다 — 번호는 128비트 무작위라
// 아무도 못 찍는다. 나중에 리타 로그인이 붙으면 «사용자 → 번호들» 만 잇는다.

const ID_RE = /^[0-9a-f]{32}$/

export function newId() {
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
}

export function isConversationId(x) {
  return ID_RE.test(String(x ?? ''))
}

const parse = (text, fallback) => {
  try {
    const v = JSON.parse(text)
    return v ?? fallback
  } catch {
    return fallback
  }
}

export async function loadConversation(db, id) {
  const row = await db.prepare('SELECT id, state, messages FROM conversations WHERE id = ?').bind(id).first()
  if (!row) return null
  return { id: row.id, state: parse(row.state, {}), messages: parse(row.messages, []) }
}

export async function saveConversation(db, id, state, messages, nowIso) {
  await db.prepare(
    `INSERT INTO conversations (id, created_at, updated_at, state, messages)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       updated_at = excluded.updated_at, state = excluded.state, messages = excluded.messages`,
  ).bind(id, nowIso, nowIso, JSON.stringify(state ?? {}), JSON.stringify(messages ?? [])).run()
}

// 말은 안 남기고 **상태만** 고쳐 둔다(사람 결정 2026-09-19: 미리보기에서 고치기).
//
// 사람이 대본 한 칸을 고칠 때마다 말풍선을 하나씩 남길 수는 없다. 그렇다고 안
// 남기면 새로고침에 고친 것이 날아간다 — 그 사이에 모델도 번호표도 안 끼니
// 대화 기록은 그대로 두고 `state` 칸만 덮는다.
export async function 상태만저장(db, id, 상태패치, nowIso) {
  const got = await loadConversation(db, id)
  if (!got) return { ok: false, why: '그런 대화가 없습니다' }
  await saveConversation(db, id, { ...got.state, ...(상태패치 || {}) }, got.messages, nowIso)
  return { ok: true }
}

// 봇이 스스로 하는 말(「분석 끝났어요」 같은 것)을 덧붙인다. 딥시크를 거치지 않는다.
export async function appendBot(db, id, 말, 상태패치, nowIso) {
  const got = await loadConversation(db, id)
  if (!got) return { ok: false, why: '그런 대화가 없습니다' }
  const state = { ...got.state, ...(상태패치 || {}) }
  const messages = [...got.messages, { 역할: '봇', 말: String(말 ?? ''), 때: nowIso }]
  await saveConversation(db, id, state, messages, nowIso)
  return { ok: true }
}
