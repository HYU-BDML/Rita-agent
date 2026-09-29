// 화면 쪽 «출입증» — 사람인지 한 번 확인받고, 그 표를 출입증으로 바꿔 들고 다닌다.
//
// **로그인이 아니다.** 리타가 정책으로 로그인 정보를 안 넘겨주므로(저쪽 정본
// 문서) 「누구냐」는 영영 알 수 없다. 대신 「사람이 맞느냐」만 묻는다.
//
// **쿠키를 안 쓴다.** 리타 화면 안에서는 우리 쿠키가 «남의 집 쿠키» 가 되어
// 브라우저가 막는다. 저장소에 두고 머리말로 싣는다 — 리타 iframe 이
// `allow-same-origin` 을 열어 뒀으므로 저장은 된다.

// **공개 값이다.** 화면에 박히라고 만든 것이라 숨길 것이 아니다.
// 비밀 열쇠(`TURNSTILE_SECRET`)는 워커에만 있고 브라우저로 안 내려온다.
const 위젯열쇠 = '0x4AAAAAAFAAbZVnzBPBTW-x'
const 머리이름 = 'X-Pass'
const 저장칸 = 'cardnews-pass'
const 스크립트 = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

let 받는중 = null      // 같은 순간에 여러 요청이 와도 표는 한 번만 받는다

/** 저장소는 막혀 있을 수 있다(사생활 보호 창·차단 설정). 막혀도 돌아야 한다. */
const 읽기 = () => {
  try { return localStorage.getItem(저장칸) || '' } catch { return '' }
}
const 쓰기 = (값) => {
  try { localStorage.setItem(저장칸, 값) } catch { /* 저장 못 해도 이번 판은 된다 */ }
}
const 지우기 = () => {
  try { localStorage.removeItem(저장칸) } catch { /* 없어도 그만 */ }
}

/** `<만료시각(초)>.<서명>` 에서 만료만 본다. **서명은 서버가 본다** — 여기서
 * 보는 것은 「굳이 보내 볼 필요가 있나」를 가리는 것뿐이다. */
const 아직쓸만한가 = (값) => {
  const 점 = String(값 || '').indexOf('.')
  if (점 < 1) return false
  const 만료 = Number(String(값).slice(0, 점))
  if (!Number.isFinite(만료)) return false
  // 30초 여유를 둔다 — 보내는 사이에 지나 버리면 헛걸음이다.
  return 만료 * 1000 > Date.now() + 30_000
}

function 스크립트깔기() {
  if (window.turnstile) return Promise.resolve()
  const 있던것 = document.querySelector(`script[src="${스크립트}"]`)
  if (있던것) return 있던것._기다림
  return new Promise((맞다, 아니다) => {
    const s = document.createElement('script')
    s.src = 스크립트
    s.async = true
    s.onload = () => 맞다()
    s.onerror = () => 아니다(new Error('사람 확인 스크립트를 못 불러왔습니다'))
    s._기다림 = new Promise((ok) => { s.addEventListener('load', () => ok()) })
    document.head.appendChild(s)
  })
}

/** 위젯이 앉을 자리. **평소엔 아무것도 안 보인다** — 수상할 때만 네모가 뜨므로,
 * 그때 사람 눈에 띄도록 화면 가운데 아래에 둔다. */
function 자리만들기() {
  let 칸 = document.getElementById('사람확인')
  if (칸) return 칸
  칸 = document.createElement('div')
  칸.id = '사람확인'
  칸.style.cssText = 'position:fixed; left:50%; bottom:16px; transform:translateX(-50%);'
    + ' z-index:9999; display:flex; justify-content:center;'
  document.body.appendChild(칸)
  return 칸
}

/** 표를 하나 받는다. 수상하면 이때 네모가 뜨고, 사람이 누르면 이어진다. */
function 표받기() {
  return 스크립트깔기().then(() => new Promise((맞다, 아니다) => {
    const 칸 = 자리만들기()
    칸.innerHTML = ''
    window.turnstile.render(칸, {
      sitekey: 위젯열쇠,
      // **수상할 때만 보인다**(사람 결정 2026-09-22). 「아예 안 보이게」는
      // 의심받은 진짜 사람이 빠져나갈 길이 없어서 안 쓴다.
      appearance: 'interaction-only',
      callback: (표) => 맞다(표),
      'error-callback': () => 아니다(new Error('사람 확인에 실패했습니다')),
      'timeout-callback': () => 아니다(new Error('사람 확인이 시간이 지났습니다')),
    })
  }))
}

/** 표를 받아 워커에게 주고 출입증으로 바꾼다. **여러 번 불러도 한 번만 돈다.** */
function 새로받기() {
  if (받는중) return 받는중
  받는중 = (async () => {
    const 표 = await 표받기()
    const res = await fetch('/api/pass', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 표 }),
    })
    const 난것 = await res.json().catch(() => null)
    if (!난것 || !난것.출입증) throw new Error((난것 && 난것.why) || '출입증을 못 받았습니다')
    쓰기(난것.출입증)
    return 난것.출입증
  })().finally(() => { 받는중 = null })
  return 받는중
}

/** 들고 있는 출입증. 없거나 지났으면 새로 받는다. */
export async function 출입증() {
  const 있던것 = 읽기()
  if (아직쓸만한가(있던것)) return 있던것
  return 새로받기()
}

/** 머리말에 출입증을 얹는다. 돈 나가는 문을 부를 때 쓴다. */
export async function 머리(더 = {}) {
  return { ...더, [머리이름]: await 출입증() }
}

/** 워커가 「출입증이 필요하다」고 돌려보냈나. 그러면 새로 받아 한 번 더 건다. */
export function 표필요한가(답) {
  return !!(답 && 답.표필요)
}

/** **한 번은 다시 걸어 준다.** 출입증이 한 시간짜리라 오래 켜 둔 화면에서는
 * 지나 있을 수 있다 — 그때 사람에게 「다시 해 보세요」라고 하면 안 된다. */
export async function 붙여보내기(주소, 옵션 = {}) {
  const 걸기 = async () => fetch(주소, { ...옵션, headers: await 머리(옵션.headers) })
  let res = await 걸기()
  if (res.status !== 401) return res
  const 벗긴것 = await res.clone().json().catch(() => null)
  if (!표필요한가(벗긴것)) return res
  지우기()
  res = await 걸기()
  return res
}
