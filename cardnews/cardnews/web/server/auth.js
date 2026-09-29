// 암호는 서버에만 있다. 브라우저에는 암호에서 계산해 나온 출입증만 준다.
//
// 출입증을 훔쳐봐도 암호 자체는 알 수 없고, 암호를 바꾸면 발급된 출입증이
// 한 번에 전부 무효가 된다. 만료 시각을 따로 관리할 필요도 없다.
//
// 사람은 쿠키(출입증)로, 파이썬은 Authorization 헤더(출입증)로 들어온다.
// 들어오는 길은 둘이지만 검사하는 곳은 allowed 하나다.

const MSG = 'cardnews-board-v1'
export const COOKIE = 'board'

export async function tokenOf(password) {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(password), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(MSG))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function cookieOf(header, name = COOKIE) {
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim()
  }
  return ''
}

export function bearerOf(header) {
  const s = String(header || '')
  return s.startsWith('Bearer ') ? s.slice(7).trim() : ''
}

export async function allowed(request, password) {
  if (!password) return false // 암호를 설정하지 않았으면 문을 열지 않는다
  // Bearer 도 쿠키와 똑같이 출입증으로만 비교한다. 원문 암호를 받아주는 문을 남겨두면
  // Cloudflare Rate limiting 규칙이 걸린 /api/login 을 거치지 않고 /api/* 아무 통로에나
  // 암호를 찍어볼 수 있다. 출입증만 받으면 찍어볼 수 있는 문이 진짜로 로그인 하나가 된다.
  const token = await tokenOf(password)
  if (cookieOf(request.headers.get('cookie')) === token) return true
  return bearerOf(request.headers.get('authorization')) === token
}

export function setCookieHeader(token) {
  return `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=7776000`
}
