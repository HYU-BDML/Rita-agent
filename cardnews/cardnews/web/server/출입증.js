// «출입증» — 사람인지 확인하고 나서 주는 짧은 표.
//
// **왜 Turnstile 표를 그대로 안 쓰나.** 그 표는 5분짜리 1회용이다(Cloudflare
// 문서). 채팅은 한 마디마다 요청이 나가므로 표를 그대로 쓰면 말할 때마다 검사가
// 다시 돌아 매번 느려진다. 그래서 **검사는 한 번만 하고** 우리가 수명을 정한
// 출입증으로 바꿔 쓴다.
//
// **저장하지 않는다.** 만료 시각에 서명을 붙여 두면 워커가 그것만 보고 진짜인지
// 안다 — D1 도 KV 도 안 쓴다. 비밀이 바뀌면 발급된 것이 한 번에 다 무효가 된다.
//
// **쿠키가 아니다.** 리타 화면 안에서는 우리 쿠키가 «남의 집 쿠키» 가 되어
// 브라우저가 막는다(리타 정본 문서: 로그인 정보를 안 넘긴다). 저장은 화면이
// 하고 요청마다 머리말로 싣는다 — 리타 iframe 이 `allow-same-origin` 을 열어
// 뒀으므로 저장은 된다.

export const 머리이름 = 'X-Pass'
export const 수명초 = 60 * 60          // 한 시간
export const 표최대 = 2048             // Cloudflare 문서가 적은 표 최대 길이

// **용도를 갈라 둔다.** 같은 비밀로 딴 데서도 서명하게 되면 한쪽 서명을 다른
// 쪽에 들이밀 수 있다. 여기서 한 번 더 뽑은 키로만 출입증을 서명한다.
const 뜻 = 'cardnews-pass-v1'
const 인코더 = new TextEncoder()

async function _키(비밀) {
  const 뿌리 = await crypto.subtle.importKey(
    'raw', 인코더.encode(비밀), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const 뽑은것 = await crypto.subtle.sign('HMAC', 뿌리, 인코더.encode(뜻))
  return crypto.subtle.importKey(
    'raw', 뽑은것, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
}

const _열여섯 = (buf) => [...new Uint8Array(buf)]
  .map((b) => b.toString(16).padStart(2, '0')).join('')

/** `<만료시각(초)>.<서명>`. 만료 시각이 글에 드러나 있어도 서명은 못 짓는다. */
export async function 출입증만들기(비밀, 지금 = Date.now(), 수명 = 수명초) {
  const 만료 = Math.floor(지금 / 1000) + 수명
  const 서명 = await crypto.subtle.sign('HMAC', await _키(비밀),
    인코더.encode(String(만료)))
  return `${만료}.${_열여섯(서명)}`
}

export async function 출입증맞나(비밀, 값, 지금 = Date.now()) {
  if (!비밀) return false          // 비밀이 없으면 아무도 못 들어온다
  const 글 = String(값 || '')
  const 점 = 글.indexOf('.')
  if (점 < 1) return false
  const 만료 = 글.slice(0, 점)
  if (!/^[0-9]{1,12}$/.test(만료)) return false
  if (Number(만료) * 1000 <= 지금) return false        // 지났다
  const 참 = await crypto.subtle.sign('HMAC', await _키(비밀), 인코더.encode(만료))
  return 같나(글.slice(점 + 1), _열여섯(참))
}

/** **시간이 같은 견줌.** 앞에서부터 몇 자가 맞는지 재서 서명을 한 자씩 찾아내는
 * 것을 막는다. 길이가 다르면 바로 거짓이다 — 길이는 숨길 것이 아니다. */
function 같나(가, 나) {
  if (가.length !== 나.length) return false
  let 다름 = 0
  for (let i = 0; i < 가.length; i += 1) 다름 |= 가.charCodeAt(i) ^ 나.charCodeAt(i)
  return 다름 === 0
}

/** Cloudflare 에 「이 표 진짜냐」고 되묻는다.
 *
 * **이걸 안 하면 위젯은 장식일 뿐이다** — 문서가 빨간 글씨로 적은 자리다.
 * 표는 아무 글자나 지어 보낼 수 있고, 5분이 지났거나 이미 쓴 것일 수 있다.
 */
export async function 표확인(비밀, 표, 아이피 = '', 부르기 = fetch) {
  const 글 = String(표 || '')
  if (!비밀 || !글 || 글.length > 표최대) return false
  const 몸 = new FormData()
  몸.append('secret', 비밀)
  몸.append('response', 글)
  if (아이피) 몸.append('remoteip', 아이피)
  const res = await 부르기('https://challenges.cloudflare.com/turnstile/v0/siteverify',
    { method: 'POST', body: 몸 }).catch(() => null)
  if (!res) return false
  const 난것 = await res.json().catch(() => null)
  return !!(난것 && 난것.success === true)
}

/** 요청에 실려 온 출입증. 없으면 빈 글자. */
export function 실려온것(request) {
  return String(request?.headers?.get?.(머리이름) || '').trim()
}
