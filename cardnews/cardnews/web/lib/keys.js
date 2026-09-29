// 화면 글자는 한 벌뿐이다 — `수집기말.js`.
import { 말하기 } from './수집기말.js'

export const MIN_REMAINING_USD = 0.5
const STORAGE_KEY = 'apify_keys'

export function parseKeys(text) {
  const found = String(text || '').match(/apify_api_[A-Za-z0-9]+/g) || []
  return [...new Set(found)]
}

// 인스타 세션 쿠키. 넣으면 검색 결과가 내 화면과 같아진다. 선택 사항이다.
const COOKIE_KEY = 'ig_cookie'

export function loadCookie(storage) {
  return storage.getItem(COOKIE_KEY) || ''
}

export function saveCookie(storage, value) {
  if (value) storage.setItem(COOKIE_KEY, value)
  else storage.removeItem(COOKIE_KEY)
}

// 키는 쌓인다. 하나가 소진되면 다음 키로 넘어가는 것이 여러 개를 두는 이유다.
export function mergeKeys(existing, added) {
  return [...new Set([...(existing || []), ...(added || [])])]
}

// keyStatus() 가 받아온 잔액을 사람 말로 바꾼다.
// 이 값은 키를 고르는 데만 쓰고 있었는데, 얼마 남았는지는 사람이 더 알고 싶어 한다.
export function creditLabel(status, 언어) {
  const 말 = 말하기(언어)
  if (!status) return 말('잔_확인중')
  if (status.state === 'invalid') return 말('잔_틀린키')
  if (status.state !== 'ok' || typeof status.remaining !== 'number') return 말('잔_모름')
  const left = 말('잔_남음', status.remaining.toFixed(2))
  // 이 아래로는 다음 검색이 이 키로 안 돌아간다. 미리 알려줘야 키를 더 넣는다.
  return status.remaining < MIN_REMAINING_USD ? 말('잔_곧소진', left) : left
}

// 화면에 키를 되돌려주지 않는다. 어느 키인지 구분할 만큼만 남긴다.
export function maskKey(key) {
  const s = String(key || '')
  if (!s) return ''
  return s.length <= 4 ? '•'.repeat(s.length) : '•'.repeat(8) + s.slice(-4)
}

export function pickKey(statuses) {
  for (const s of statuses) {
    if (s.remaining !== null && s.remaining >= MIN_REMAINING_USD) return s.key
  }
  return null
}

export function loadKeys(storage) {
  const raw = storage.getItem(STORAGE_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveKeys(storage, keys) {
  storage.setItem(STORAGE_KEY, JSON.stringify(keys))
}
