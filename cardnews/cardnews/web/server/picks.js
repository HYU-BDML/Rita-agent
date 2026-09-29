// 표(D1)를 읽고 쓴다.
//
// 판단하는 부분(형식 검사·모양 바꾸기)은 순수 함수로 빼서 D1 없이 시험한다.
// D1 을 실제로 만지는 세 함수만 얇게 남긴다.

// 이 값은 창고 경로가 된다. 여기서 막지 않으면 남의 폴더를 건드릴 수 있다.
// 게시물 코드 판정은 이 함수 하나뿐이다 — 정규식을 다른 곳에 복사하지 않는다.
const ID_RE = /^[A-Za-z0-9_-]{1,30}$/
export const isId = (s) => ID_RE.test(String(s ?? ''))

const MAX_SLIDES = 30
const MAX_CAPTION = 2200 // 인스타 본문 한도
const CONTENT_TYPES = new Set(['cardnews', 'reel'])
const REEL_CAP = 100

// kinds 는 자리마다 0(사진)·1(영상)이 적힌 문자열이다. 길이가 장수와 다르면
// 믿지 않는다 — 영상이 생기기 전에 담아둔 줄은 이 칸이 비어 있고, 어긋난 표시를
// 따라가면 없는 파일을 가리키게 된다. 그럴 땐 전부 사진으로 본다.
export function slidesOf(id, slideCount, kinds = '') {
  const mark = String(kinds ?? '').length === slideCount ? String(kinds) : ''
  const out = []
  for (let i = 1; i <= slideCount; i += 1) {
    const ext = mark[i - 1] === '1' ? 'mp4' : 'jpg'
    out.push(`/f/${id}/${String(i).padStart(2, '0')}.${ext}`)
  }
  return out
}

export function rowToCard(row) {
  return {
    id: row.id,
    url: row.url,
    author: row.author,
    caption: row.caption,
    postedAt: row.posted_at,
    likes: row.likes,
    comments: row.comments,
    likesHidden: row.likes < 0,
    slideCount: row.slide_count,
    slideTotal: row.slide_total,
    tag: row.tag,
    pickedAt: row.picked_at,
    // 칸이 생기기 전에 담긴 줄에는 값이 없다. 그때는 고정 안 된 것으로 본다.
    pinned: Boolean(row.pinned),
    slides: slidesOf(row.id, row.slide_count, row.slide_kinds),
    // 릴스 추가 이전 줄에는 이 칸이 없다. 그때는 카드뉴스·조회수 모름으로 본다.
    contentType: row.content_type || 'cardnews',
    playCount: Number.isFinite(row.play_count) ? row.play_count : -1,
  }
}

// 고정한 것이 앞, 그 안에서는 최근 담은 순.
// SQL 로도 되지만 여기 두는 이유는 규칙을 시험으로 붙들어 두기 위해서다.
export function sortCards(cards) {
  return [...cards].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return String(b.pickedAt).localeCompare(String(a.pickedAt))
  })
}

const int = (v) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : 0)

// 담기 요청을 표에 넣을 값으로 바꾼다. 이상하면 why 만 돌려준다.
// 빠진 값은 빈 값으로 채운다 — 계정명이 없다고 담기가 실패하면 안 된다.
export function toRow(body, nowIso) {
  const b = body || {}
  if (!isId(b.id)) return { why: '게시물 코드가 이상합니다' }
  const total = int(b.slideTotal)
  const count = int(b.slideCount)
  if (total < 1 || total > MAX_SLIDES) return { why: '원래 장수가 이상합니다' }
  if (count < 1 || count > total) return { why: '저장된 장수가 이상합니다' }
  const caption = String(b.caption ?? '')
  if (caption.length > MAX_CAPTION) return { why: '본문이 너무 깁니다' }
  // 영상 표시가 이상하면 담기를 실패시키지 않고 표시만 버린다. 그림 종류 하나
  // 때문에 담기가 통째로 막히는 것이 훨씬 나쁘다.
  const kinds = String(b.slideKinds ?? '')
  const slideKinds = kinds.length === count && /^[01]+$/.test(kinds) ? kinds : ''
  // 콘텐츠 종류가 이상하면 카드뉴스로 본다 — 종류 하나 때문에 담기가 통째로 막히면 안 된다.
  const contentType = CONTENT_TYPES.has(b.contentType) ? b.contentType : 'cardnews'
  const rawPlayCount = Number(b.playCount)
  const playCount = Number.isFinite(rawPlayCount) ? Math.trunc(rawPlayCount) : -1
  return {
    row: {
      id: String(b.id),
      url: String(b.url ?? ''),
      author: String(b.author ?? '').slice(0, 60),
      caption,
      posted_at: String(b.postedAt ?? ''),
      likes: int(b.likes),
      comments: int(b.comments),
      slide_count: count,
      slide_total: total,
      slide_kinds: slideKinds,
      tag: String(b.tag ?? '').slice(0, 60),
      picked_at: nowIso,
      content_type: contentType,
      play_count: playCount,
    },
  }
}

export async function listPicks(db, contentType) {
  const { results } = await db.prepare('SELECT * FROM picks ORDER BY picked_at DESC').all()
  const cards = sortCards((results || []).map(rowToCard))
  return contentType ? cards.filter((c) => c.contentType === contentType) : cards
}

// 릴스만 건수를 제한한다 — 영상은 카드뉴스보다 R2 용량을 훨씬 빨리 채운다.
// 이미 담긴 걸 다시 담는(재담기·고정 등) 경우는 새로 늘어나는 게 아니라 캡에 안 걸린다.
export function reelCapReached(cards, id, cap = REEL_CAP) {
  if (cards.some((c) => c.id === id)) return false
  return cards.filter((c) => c.contentType === 'reel').length >= cap
}

// 고정만 바꾼다. 담기(savePick)와 나눠 둔 이유는, 같은 게시물을 다시 담아도
// 고정이 풀리면 안 되기 때문이다 — savePick 은 pinned 칸을 아예 건드리지 않는다.
export async function setPinned(db, id, pinned) {
  if (!isId(id)) return false
  const { meta } = await db
    .prepare('UPDATE picks SET pinned = ? WHERE id = ?')
    .bind(pinned ? 1 : 0, id)
    .run()
  return Boolean(meta && meta.changes)
}

// 같은 것을 다시 담으면 덮어쓴다. 둘이 동시에 담아도 결과가 같다.
export async function savePick(db, row) {
  await db
    .prepare(
      `INSERT INTO picks (id, url, author, caption, posted_at, likes, comments,
                          slide_count, slide_total, slide_kinds, tag, picked_at,
                          content_type, play_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         url = excluded.url, author = excluded.author, caption = excluded.caption,
         posted_at = excluded.posted_at, likes = excluded.likes, comments = excluded.comments,
         slide_count = excluded.slide_count, slide_total = excluded.slide_total,
         slide_kinds = excluded.slide_kinds,
         tag = excluded.tag, picked_at = excluded.picked_at,
         content_type = excluded.content_type, play_count = excluded.play_count`
    )
    .bind(row.id, row.url, row.author, row.caption, row.posted_at, row.likes,
          row.comments, row.slide_count, row.slide_total, row.slide_kinds, row.tag, row.picked_at,
          row.content_type, row.play_count)
    .run()
}

// 창고를 먼저 비우고 표를 지운다. 반대로 하면 줄이 사라진 뒤 그림만 남아 손댈 길이 없어진다.
export async function removePick(db, bucket, id) {
  if (!isId(id)) return 0
  const listed = await bucket.list({ prefix: `${id}/` })
  const keys = (listed.objects || []).map((o) => o.key)
  if (keys.length) await bucket.delete(keys)
  await db.prepare('DELETE FROM picks WHERE id = ?').bind(id).run()
  return keys.length
}
