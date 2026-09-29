// 인스타 이미지를 우리 주소로 돌려 받는다.
//
// 일부 인스타 CDN 이 Cross-Origin-Resource-Policy: same-origin 을 보내서
// 브라우저가 직접 못 싣는다. _worker.js 가 대신 받아 우리 주소로 내주면
// 같은 출처가 되므로 그 정책에 걸리지 않는다. 덤으로 canvas 로 픽셀을 읽는
// 표지 글자 검사와 파일 저장도 항상 된다.
//
// 중계가 없는 환경(파일 직접 열기 등)에서도 앱은 그대로 돌아야 하므로,
// 시작할 때 한 번 물어보고 없으면 원래 주소를 쓴다.
let available = false

export const proxyReady = () => available

export async function detectProxy(fetchImpl = fetch) {
  try {
    const res = await fetchImpl('/img?ping=1')
    available = res.ok && (await res.text()).trim() === 'ok'
  } catch {
    available = false
  }
  return available
}

export function imgSrc(url) {
  if (!url) return ''
  return available ? `/img?u=${encodeURIComponent(url)}` : url
}

// 중계 주소에서 원래 인스타 주소를 되꺼낸다.
// 중계가 실패해도 원래 주소로 한 번 더 시도할 수 있게 하기 위한 것이다.
const PREFIX = '/img?u='
export function rawOf(url) {
  const s = String(url || '')
  if (!s.startsWith(PREFIX)) return s
  try {
    return decodeURIComponent(s.slice(PREFIX.length))
  } catch {
    return s
  }
}

// 사라진 엣지를 살아 있는 호스트로 바꿔본다. 서명이 경로에 걸려 있어서
// 호스트만 갈아끼워도 같은 이미지가 온다(실측 확인).
// 다만 CORP 딱지는 경로에 붙어 있어서 이걸로는 안 뚫린다 — 그건 중계기 몫이다.
const FALLBACK_HOST = 'scontent.cdninstagram.com'
export function altHostOf(url) {
  try {
    const u = new URL(rawOf(url))
    if (u.hostname === FALLBACK_HOST) return ''
    u.hostname = FALLBACK_HOST
    return u.toString()
  } catch {
    return ''
  }
}

// 테스트용
export function setProxyAvailable(v) {
  available = Boolean(v)
}
