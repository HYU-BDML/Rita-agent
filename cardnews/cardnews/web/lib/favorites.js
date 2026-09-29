// 화면 글자는 한 벌뿐이다 — `수집기말.js`.
import { 말하기 } from './수집기말.js'

// 즐겨찾기 — 돈 주고 받은 검색 결과를 브라우저에 남겨두고 공짜로 다시 꺼내 본다.
//
// 서버에 두지 않는 이유: 이 앱은 이름을 받지 않고 암호 하나만 쓴다. 서버에 두면
// 개인 공간이 아니라 전부 공유돼 버린다. 브라우저에 두면 그 자체로 사람마다 다르다.
// Apify 키도 이미 같은 자리에 같은 방식으로 저장한다 — 훨씬 민감한 값인데도.
//
// 대신 다른 컴퓨터로 가면 안 따라오고, 방문기록을 지우면 사라진다. 감수한 값이다.
//
// 그리고 인스타 이미지 주소는 나흘쯤 뒤 죽는다. 글자는 남지만 그림이 회색이 된다.
// 그림까지 오래 두는 것은 공동 목록(서버 창고)이 하는 일이고, 여기는 그 전 단계다.

const STORAGE_KEY = 'favorites'

export const MAX_FAVORITES = 5
export const EXPIRE_DAYS = 4

export function loadFavorites(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return [] // 망가진 값 때문에 화면 전체가 죽으면 안 된다
  }
}

// 넣지 못했으면 false 를 준다. 결과가 커서 한도를 넘는 일이 실제로 있다
// (인스타 주소가 길어서 검색 한 번이 수백 KB 다). 실패해도 있던 것은 그대로 둔다.
export function saveFavorites(storage, list) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(list))
    return true
  } catch {
    return false
  }
}

// 릴스와 카드뉴스는 결과 모양이 달라서, 서로의 화면에서 열면 거르개가 전부 걸러낸다.
// 실제로 릴스 모드에서 카드뉴스 즐겨찾기를 누르면 "열었습니다" 라고 해놓고 빈 화면이
// 나왔다. 그래서 갈래를 나눠 애초에 안 보여준다.
//
// 갈래를 안 적어둔 옛 즐겨찾기가 이미 브라우저에 남아 있다. 마이그레이션 코드를 두는
// 대신 읽을 때 결과를 보고 알아낸다.
//
// "릴스가 한 건이라도 있으면 릴스" 는 틀렸다. 카드뉴스 키워드 검색이 릴스도 같이 긁어오고,
// 담을 때는 거른 화면이 아니라 결과 전체가 들어가기 때문이다 — 실측 픽스처를 normalize
// 하면 캐러셀 3 · 사진 2 · 릴스 2 가 나온다. 그래서 카드뉴스 즐겨찾기가 릴스 화면에 떴다.
//
// 다수로 가른다. 릴스 검색 결과는 릴스가 다수고, 카드뉴스 검색 결과는 아니다.
// 반반이면 카드뉴스로 본다 — 릴스 쪽에 잘못 넣는 편이 더 나쁘다.
export function typeOf(entry) {
  if (entry && entry.contentType) return entry.contentType
  const results = (entry && entry.results) || []
  const reels = results.filter((p) => p && p.kind === 'video').length
  return reels > results.length - reels ? 'reel' : 'cardnews'
}

export const favoritesFor = (list, contentType) =>
  (Array.isArray(list) ? list : []).filter((x) => typeOf(x) === contentType)

// 같은 검색어면 갈아끼운다. 새 것이 앞에 온다. 다만 갈래가 다르면 다른 것이다 —
// 같은 검색어를 양쪽에서 담을 수 있어야 하고, 서로 덮어쓰면 안 된다.
// 꽉 찼는데 새 검색어면 막는다 — 돈 주고 받은 것을 사용자 모르게 밀어내지 않는다.
// 한도는 갈래마다 따로 센다. 합쳐서 세면 화면에 안 보이는 반대편 갈래 때문에 막히는데,
// 안 보이니 지울 수도 없다.
export function addFavorite(list, entry, 언어) {
  const cur = Array.isArray(list) ? list : []
  const type = typeOf(entry)
  const same = (x) => x.label === entry.label && typeOf(x) === type
  const rest = cur.filter((x) => !same(x))
  if (rest.length === cur.length && favoritesFor(cur, type).length >= MAX_FAVORITES) {
    return { why: 말하기(언어)('즐_꽉참', MAX_FAVORITES) }
  }
  return { list: [entry, ...rest] }
}

export function removeFavorite(list, label, contentType) {
  return (Array.isArray(list) ? list : []).filter(
    (x) => !(x.label === label && (contentType === undefined || typeOf(x) === contentType))
  )
}

const DAY = 86400000

export function isExpired(savedAt, now = Date.now()) {
  const t = Date.parse(String(savedAt || ''))
  if (!Number.isFinite(t)) return false // 언제 담았는지 모르면 만료라고 단정하지 않는다
  return now - t >= EXPIRE_DAYS * DAY
}

export function agoLabel(savedAt, now = Date.now(), 언어) {
  const 말 = 말하기(언어)
  const t = Date.parse(String(savedAt || ''))
  if (!Number.isFinite(t)) return ''
  const gap = Math.max(0, now - t)
  if (gap < 3600000) return 말('전_방금')
  if (gap < DAY) return 말('전_시간', Math.floor(gap / 3600000))
  return 말('전_일', Math.floor(gap / DAY))
}
