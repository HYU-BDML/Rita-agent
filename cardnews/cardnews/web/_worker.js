// Cloudflare Pages 진입점.
//
// 인스타 CDN은 엣지마다 헤더 정책이 다르다. 일부가
// Cross-Origin-Resource-Policy: same-origin 을 보내면 브라우저가 이미지를
// 못 싣는다. 브라우저에서 우회할 방법은 없다 — 이 정책은 브라우저가 강제한다.
//
// 그래서 여기서 대신 받아 우리 주소로 내놓는다. 서버 대 서버 요청에는 CORP 가
// 적용되지 않는다(실측: 막히던 호스트 6개 전부 서버에서는 HTTP 200).
//
// wrangler.jsonc 의 main 이 이 파일을 가리키므로 wrangler 가 묶어 올린다 — import 를 쓸 수 있다.
// 서버에서만 도는 코드는 web/server/ 에 둔다. web/lib/ 는 브라우저로 그대로 내려간다.

import { allowed, tokenOf, setCookieHeader } from './server/auth.js'
import { isId, listPicks, savePick, removePick, setPinned, toRow, reelCapReached } from './server/picks.js'
import { keyOf, fileKeyOf, contentTypeOf, putSlide } from './server/slides.js'
import { checkMeasure, saveMeasure, getMeasure, listMeasureIds } from './server/measures.js'
import {
  labelRoute, checkLabels, saveLabels, getLabels, boardStatus, setRun, setConfirm,
} from './server/labels.js'
import { checkChatBody, askDeepseek, runTurn } from './server/chat.js'
import { 표확인, 출입증만들기, 출입증맞나, 실려온것, 수명초 } from './server/출입증.js'
// 서버가 화면으로 돌려주는 말. 라벨판이 그대로 띄우므로 두 언어가 다 있어야 한다.
import { 말하기 as 라벨말하기 } from './server/라벨서버말.js'
import { isConversationId, loadConversation, appendBot, 상태만저장 } from './server/conversations.js'
// 「새 대화」가 그 대화에서 올린 것을 지울 때, **창고 것만** 고르는 데 쓴다.
import { 쓸사진들, 쓸로고 } from './server/chat.js'
import { 건의검사, 건의넣기, 건의목록 } from './server/건의.js'

// 아무 주소나 받아주면 남이 이 계정으로 트래픽을 쓰는 공개 중계기가 된다.
const ALLOWED_HOST = /^([a-z0-9-]+\.)*(cdninstagram\.com|fbcdn\.net)$/i

const DAY = 86400

// 인스타는 이미지를 전 세계 엣지로 나눠 주는데, 어떤 엣지는 나중에 사라진다
// (호스트 이름이 DNS 에서 없어진다). 그런데 주소의 서명은 경로에 걸려 있어서
// 호스트만 살아 있는 곳으로 바꾸면 같은 이미지가 그대로 온다.
// 실측: 죽은 엣지 주소를 아래 호스트로 바꾸니 262,542 bytes 동일한 이미지 수신.
const FALLBACK_HOST = 'scontent.cdninstagram.com'

export function altHost(rawUrl) {
  try {
    const u = new URL(rawUrl)
    if (u.hostname === FALLBACK_HOST) return null
    u.hostname = FALLBACK_HOST
    return u.toString()
  } catch {
    return null
  }
}

export function checkTarget(raw) {
  if (!raw) return { ok: false, status: 400, message: 'u 파라미터가 없습니다' }
  let target
  try {
    target = new URL(raw)
  } catch {
    return { ok: false, status: 400, message: '주소를 알아볼 수 없습니다' }
  }
  if (target.protocol !== 'https:') {
    return { ok: false, status: 403, message: 'https 주소만 받습니다' }
  }
  if (!ALLOWED_HOST.test(target.hostname)) {
    return { ok: false, status: 403, message: '인스타 이미지 주소만 받습니다' }
  }
  return { ok: true, target }
}

// 영상은 그림과 달리 부분 요청(Range)으로 읽는다. 브라우저는 <video> 탐색바를
// 그걸로 움직이고, 첫 프레임도 그걸로 먼저 가져온다. Range 를 안 흘려보내면
// 탐색이 아예 막히고 큰 화면이 한참 빈칸으로 남는다 — 릴스에서 실제로 그랬다.
export async function handleImage(url, request = null) {
  if (url.searchParams.get('ping')) {
    return new Response('ok', { headers: { 'content-type': 'text/plain; charset=utf-8' } })
  }
  const checked = checkTarget(url.searchParams.get('u'))
  if (!checked.ok) {
    return new Response(checked.message, {
      status: checked.status,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  }
  const range = (request && request.headers.get('range')) || ''
  const first = checked.target.toString()
  // 엣지가 사라졌거나 거절하면 살아 있는 호스트로 같은 경로를 다시 받아본다
  const tries = [first, altHost(first)].filter(Boolean)
  let upstream = null
  let why = ''
  for (const url of tries) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': 'Mozilla/5.0', accept: 'image/*,*/*', ...(range ? { range } : {}) },
        // 조각은 캐시에 안 태운다. 캐시는 주소로만 가르므로 조각이 전체인 척 남으면
        // 다음 사람이 잘린 파일을 받는다. 그림은 Range 를 안 보내니 그대로 캐시된다.
        ...(range ? {} : { cf: { cacheEverything: true, cacheTtl: DAY } }), // 같은 이미지를 두 번 받으러 가지 않는다
      })
      if (res.ok) {
        upstream = res
        break
      }
      why = `HTTP ${res.status}`
    } catch (e) {
      why = e.name
    }
  }
  if (!upstream) {
    return new Response(`인스타에서 받지 못했습니다 (${why})`, {
      status: 502,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  }
  const headers = new Headers()
  headers.set('content-type', upstream.headers.get('content-type') || 'image/jpeg')
  headers.set('cache-control', range ? 'no-store' : `public, max-age=${DAY}`)
  headers.set('access-control-allow-origin', '*') // 우리 주소이므로 canvas 로도 읽을 수 있다
  headers.set('accept-ranges', 'bytes') // 이게 없으면 브라우저가 탐색을 시도조차 안 한다
  // 어디부터 어디까지인지, 전체가 몇 바이트인지는 이 줄 하나에 다 들어 있다.
  // 길이(content-length)는 안 옮긴다 — 본문을 그대로 흘려보내므로 런타임이 알아서 맞춘다.
  const part = upstream.headers.get('content-range')
  if (part) headers.set('content-range', part)
  return new Response(upstream.body, { status: upstream.status === 206 ? 206 : 200, headers })
}

const json = (obj, status = 200, headers = {}) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  })

/** AWS 문에 붙일 머리말. **열쇠는 여기서만 붙는다.**
 *
 * 우리 돈이 나가는 문은 전부 워커만 두드린다. 그래서 AWS 쪽에 자물쇠를 걸고
 * 열쇠는 워커 서버 안에서만 붙인다 — **브라우저는 이 값을 한 번도 못 본다.**
 * 그래서 리타의 iframe·쿠키·로그인 정책과 닿는 데가 없다.
 *
 * **RITA 열쇠(`RITA_AGENT_SECRET`)를 안 쓴다.** 그건 저쪽에 준 것이라,
 * 돌려쓰면 리타도 우리 돈 쓰는 문을 열 수 있게 된다.
 *
 * **열쇠가 없으면 안 붙이고 그냥 보낸다.** 그러면 잠긴 문은 401 로 떨어져
 * 화면에 드러난다 — 조용히 열어 두는 것보다 낫다.
 */
const 람다머리 = (env, 더 = {}) => (env && env.WEB_SECRET
  ? { ...더, Authorization: `Bearer ${env.WEB_SECRET}` }
  : 더)

/** 우리 돈이 나가는 문인가. **여기 없는 문은 출입증을 안 본다.**
 *
 * **람다가 되부르는 문은 일부러 뺐다** — 담기가 사진을 얹을 때 우리 웹의
 * `POST /api/picks` 와 `PUT /api/slide/…` 를 부른다(`analyze/담기.게시판에얹기`).
 * 그쪽까지 막으면 담기가 통째로 죽는다. 둘 다 돈이 안 나간다.
 *
 * **작업대 화면도 안 걸린다** — 그쪽은 워커를 안 거치고 AWS 를 직접 부른다.
 */
export function 돈나가는문(parts, method) {
  if (String(method || '').toUpperCase() !== 'POST') return false
  const 문 = parts[1]
  if (['chat', 'draft', 'bake', 'make', 'ingest', 'upload'].includes(문)) return true
  return 문 === 'analyze' && !!parts[2]
}

async function handleLogin(request, env) {
  if (request.method !== 'POST') return json({ ok: false, why: '방법이 다릅니다' }, 405)
  let body = {}
  try {
    body = await request.json()
  } catch { /* 빈 본문은 틀린 암호와 같이 다룬다 */ }
  if (!env.BOARD_PASSWORD || String(body.password ?? '') !== env.BOARD_PASSWORD) {
    return json({ ok: false, why: '암호가 다릅니다' }, 401)
  }
  return json({ ok: true }, 200, { 'set-cookie': setCookieHeader(await tokenOf(env.BOARD_PASSWORD)) })
}

async function handleFile(request, parts, env) {
  // f, 게시물 코드, 파일명 — 딱 세 조각이어야 한다. 꼬리가 붙으면 같은 그림이
  // 서로 다른 주소로 무한히 캐시될 수 있다.
  if (parts.length !== 3) return new Response('없는 파일입니다', { status: 404 })
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('방법이 다릅니다', { status: 405 })
  }
  const key = fileKeyOf(parts[1], parts[2])
  // 담아둔 릴스도 여기로 나간다. R2 가 Range 헤더를 그대로 알아들으므로 넘겨만 준다 —
  // 안 넘기면 인스타 중계기만 고쳐놓고 공동 목록 영상은 여전히 탐색이 죽는다.
  const wants = request.headers.get('range')
  const obj = key ? await env.SHOTS.get(key, wants ? { range: request.headers } : undefined) : null
  if (!obj) return new Response('없는 파일입니다', { status: 404 })
  const headers = new Headers({
    'content-type': contentTypeOf(key),
    // 창고에 들어간 그림은 내용이 바뀌지 않으니 오래 캐시하되, 출입증 뒤에
    // 있는 사적인 그림이라 공용 캐시(프록시·공용 PC 브라우저)에는 못 남기게 한다
    'cache-control': 'private, max-age=31536000, immutable',
    'access-control-allow-origin': '*', // 캔버스로 픽셀을 읽을 수 있게
    'accept-ranges': 'bytes', // 이게 없으면 브라우저가 탐색을 시도조차 안 한다
  })
  // 잘라 준 자리는 R2 가 알려준다. 어디부터 어디까지인지 브라우저에 되돌려줘야 이어붙인다.
  const cut = obj.range
  if (cut && typeof cut.offset === 'number' && typeof cut.length === 'number') {
    headers.set('content-range', `bytes ${cut.offset}-${cut.offset + cut.length - 1}/${obj.size}`)
    return new Response(obj.body, { status: 206, headers })
  }
  return new Response(obj.body, { headers })
}

async function handlePutSlide(parts, url, env) {
  const id = parts[2]
  const n = Number(parts[3])
  if (!isId(id) || !Number.isInteger(n) || n < 1 || n > 30) {
    return json({ ok: false, why: '주소가 이상합니다' }, 400)
  }
  const checked = checkTarget(url.searchParams.get('u'))
  if (!checked.ok) return json({ ok: false, why: checked.message }, checked.status)
  const first = checked.target.toString()
  const isVideo = url.searchParams.get('v') === '1'
  const out = await putSlide(env.SHOTS, keyOf(id, n, isVideo), [first, altHost(first)].filter(Boolean))
  return json(out, out.ok ? 200 : 502)
}

async function handleSave(request, env) {
  let body
  try {
    body = await request.json()
  } catch {
    return json({ ok: false, why: '본문을 읽지 못했습니다' }, 400)
  }
  const { row, why } = toRow(body, new Date().toISOString())
  if (why) return json({ ok: false, why }, 400)
  if (row.content_type === 'reel') {
    const existing = await listPicks(env.DB)
    if (reelCapReached(existing, row.id)) {
      return json({ ok: false, why: '릴스 공동 목록은 100건까지입니다. 먼저 하나를 빼주세요' }, 400)
    }
  }
  await savePick(env.DB, row)
  return json({ ok: true })
}

// 측정값은 본문이 통째로 JSON 이라 json() 을 거치지 않고 그대로 내보낸다.
async function handleGetMeasure(id, env) {
  const text = await getMeasure(env.DB, id)
  if (!text) return json({ ok: false, why: '아직 재지 않았습니다' }, 404)
  return new Response(text, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // 다시 재서 올리면 바뀐다. 캐시에 남으면 옛 값을 보게 된다.
      'cache-control': 'no-store',
    },
  })
}

async function handlePutMeasure(request, id, env) {
  const { json: body, why, slides } = checkMeasure(id, await request.text())
  if (why) return json({ ok: false, why }, 400)
  await saveMeasure(env.DB, id, body, new Date().toISOString())
  return json({ ok: true, slides })
}

// 쓰다가 남긴 건의. **두 문 다 암호가 없다**(사람 결정 2026-09-21).
//
// 적는 쪽에 암호를 걸면 아무도 안 쓴다 — 건의는 귀찮으면 그냥 안 하고 마는
// 일이다. 읽는 쪽은 처음에 출입증을 걸었다가 사람이 뺐다(「어차피 /건의 를
// 안 치면 모르는 거잖아」). 주소를 아는 사람만 온다는 잣대다.
//
// **그래서 쓴 것은 주소를 아는 누구나 본다.** 이름은 안 받으므로 누가 썼는지는
// 여전히 아무도 모른다 — 익명이 여기서 값을 한다.
async function handle건의(request, env) {
  if (request.method === 'POST') {
    let 몸 = {}
    try {
      몸 = await request.json()
    } catch { /* 빈 몸통은 빈 글과 같이 다룬다 */ }
    const { why, 줄 } = 건의검사(몸)
    if (why) return json({ ok: false, why }, 400)
    await 건의넣기(env.DB, 줄, crypto.randomUUID().replace(/-/g, ''), new Date().toISOString())
    return json({ ok: true })
  }
  if (request.method === 'GET') {
    return json({ ok: true, 건의: await 건의목록(env.DB) })
  }
  return json({ ok: false, why: '방법이 다릅니다' }, 405)
}

// 출입증 검사를 통과한 뒤에만 온다
async function handleBoard(request, url, env) {
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts[1] === 'suggest') return handle건의(request, env)
  if (parts[0] === 'f') return handleFile(request, parts, env)
  if (parts[1] === 'slide' && request.method === 'PUT') return handlePutSlide(parts, url, env)
  // 고정 토글. 담기와 나눠 둔다 — 다시 담아도 고정이 풀리면 안 된다.
  if (parts[1] === 'pin' && request.method === 'POST') {
    let body = {}
    try {
      body = await request.json()
    } catch { /* 몸통이 없으면 고정 해제로 본다 */ }
    const ok = await setPinned(env.DB, parts[2] ?? '', Boolean(body.pinned))
    return ok
      ? json({ ok: true, pinned: Boolean(body.pinned) })
      : json({ ok: false, why: '그런 게시물이 목록에 없습니다' }, 404)
  }
  if (parts[1] === 'picks') {
    if (request.method === 'GET') return json(await listPicks(env.DB, url.searchParams.get('type') || undefined))
    if (request.method === 'POST') return handleSave(request, env)
    if (request.method === 'DELETE') {
      return json({ ok: true, removed: await removePick(env.DB, env.SHOTS, parts[2] ?? '') })
    }
  }
  // 분석 걸기 — 작업대 Lambda 의 `POST /analyze/{코드}` 로 넘긴다.
  //
  // **여기서 중계하는 까닭.** 브라우저가 Lambda 를 곧장 부르면 게이트웨이의
  // CORS 를 이 주소까지 열어야 한다. 중계하면 브라우저는 제 집 주소만 부르고,
  // 암호 관문(`allowed`)도 이미 지난 뒤라 아무나 남의 게시물을 분석에 밀어
  // 넣지 못한다.
  //
  // **기다리지 않는다.** 계량은 1~2분이라 작업대가 202 만 주고 끝난다. 다 됐는지는
  // 목록의 상태(「분석중」→「분석 끝」)로 안다.
  // 창고의 목록 둘을 중계한다 — 틀 목록과 만든 것 목록.
  //
  // **브라우저가 창고를 곧장 못 읽는다.** S3 가 딴 집(우리 웹)에서 오는 요청에
  // 허락을 안 내줘서 `Failed to fetch` 로 끝난다(실측 2026-08-27 — 화면이
  // 텅 비어 보이던 진짜 까닭이 이것이었다). 그림(`<img>`)은 허락이 필요 없어서
  // 잘 나오는데, 글 파일을 «읽어 오는» 것만 막힌다.
  //
  // 창고 설정을 통째로 여는 대신 여기서 중계한다 — 서버끼리는 그 규칙이 없다.
  if (parts[1] === 'catalog' && request.method === 'GET' && parts[2]) {
    const 창고 = 'https://cardnews-render-554608989606.s3.ap-northeast-2.amazonaws.com'
    const 자리 = { templates: 'templates/목록.json', made: '만든것/목록.json',
                 tones: '말투/목록.json' }[parts[2]]
    if (!자리) return json({ error: '모르는 목록입니다' }, 404)
    const res = await fetch(`${창고}/${encodeURI(자리)}`, { cf: { cacheTtl: 0 } })
    // 아직 하나도 없으면 창고에 파일이 없다 — 그건 탈이 아니라 «빈 목록» 이다.
    if (res.status === 403 || res.status === 404) return json([])
    if (!res.ok) return json({ error: '목록을 못 읽었습니다' }, 502)
    return json(await res.json().catch(() => []))
  }

  // 카드뉴스 만들기·물어보기 — 작업대 Lambda 로 넘긴다.
  //
  // **채팅(`/chat`)과 같은 사슬이다.** 다른 것은 받는 모양뿐이다 — 채팅은 말
  // 한 덩이를 받아 뜻을 읽고, 여기는 화면이 이미 칸으로 나눠 준다.
  //
  // **RITA 열쇠를 안 쓴다.** 저 문은 남이 부르는 문이라 열쇠가 필요하지만,
  // 여기는 이미 우리 암호 관문을 지난 뒤다. 열쇠를 브라우저까지 내려보내면
  // 그때부터 그건 열쇠가 아니다.
  // 틀 하나를 중계한다 — 「자세히 보기」가 그림으로 그릴 재료다.
  if (parts[1] === 'template' && request.method === 'GET' && parts[2]) {
    const 창고 = 'https://cardnews-render-554608989606.s3.ap-northeast-2.amazonaws.com'
    // 열쇠는 코드에서 온다 — 주소를 그대로 부르지 않는다.
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(parts[2])) return json({ error: '이상한 코드' }, 400)
    const res = await fetch(`${창고}/templates/${parts[2]}.json`, { cf: { cacheTtl: 0 } })
    if (!res.ok) return json({ error: '그런 틀이 없습니다' }, 404)
    return json(await res.json().catch(() => ({})))
  }

  // ── 채팅 페이지 ──────────────────────────────────────────────
  //
  // 딥시크는 «무슨 할 일인가» 만 고른다. 담기·만들기는 작업대 Lambda 의 웹 문으로
  // 중계한다 — 같은 사슬이라 채팅과 수집기가 갈라질 수 없다. 열쇠는 여기서만 산다.
  const 람다 = (env.RENDER_API || 'https://l26m3zzcjd.execute-api.ap-northeast-2.amazonaws.com').replace(/\/$/, '')
  const 창고 = 'https://cardnews-render-554608989606.s3.ap-northeast-2.amazonaws.com'

  // ── 사람인지 확인 (사람 결정 2026-09-22) ─────────────────────
  //
  // AWS 문에는 자물쇠를 걸었지만 **워커 앞은 그대로 열려 있었다** — 워커가
  // 열쇠를 대신 붙여 주므로 우리 웹 주소만 알면 프로그램으로도 통과했다.
  //
  // 로그인으로는 못 막는다. 리타가 **정책으로** 로그인 정보를 안 넘긴다.
  // 그래서 「누구냐」 대신 「사람이 맞느냐」를 묻는다.
  const 표비밀 = env.TURNSTILE_SECRET || ''

  // **표를 출입증으로 바꿔 주는 문. 표를 받는 곳은 여기 하나뿐이다.**
  if (parts[1] === 'pass' && request.method === 'POST') {
    const 몸 = await request.json().catch(() => ({}))
    const 아이피 = request.headers.get('CF-Connecting-IP') || ''
    if (!(await 표확인(표비밀, 몸 && 몸.표, 아이피))) {
      return json({ ok: false, why: '사람인지 확인하지 못했습니다' }, 403)
    }
    return json({ ok: true, 출입증: await 출입증만들기(표비밀), 수명초 })
  }

  if (돈나가는문(parts, request.method)) {
    // **비밀이 없으면 문을 닫는다.** 편의로 열어 두면 그게 바로 열린 상태다
    // (`rita.열쇠확인` 과 같은 결). 까닭을 또렷이 적어 두어야 설정이
    // 빠진 것을 바로 안다 — 조용히 죽으면 아무도 못 찾는다.
    if (!표비밀) {
      return json({ ok: false, why: '사람 확인 설정이 안 돼 있습니다 (TURNSTILE_SECRET)' }, 503)
    }
    if (!(await 출입증맞나(표비밀, 실려온것(request)))) {
      // `표필요` 를 실어 보낸다 — 화면이 이걸 보고 표를 새로 받아 다시 건다.
      return json({ ok: false, why: '사람인지 확인이 필요합니다', 표필요: true }, 401)
    }
  }

  const 목록읽기 = async (자리) => {
    const res = await fetch(`${창고}/${encodeURI(자리)}`, { cf: { cacheTtl: 0 } })
    if (!res.ok) return []
    const 것 = await res.json().catch(() => [])
    return Array.isArray(것) ? 것 : []
  }
  const 람다걸기 = async (문, 몸) => {
    let res
    try {
      res = await fetch(`${람다}/${문}`, { method: 'POST',
        headers: 람다머리(env, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(몸) })
    } catch (e) {
      return { ok: false, why: e.message }
    }
    const body = await res.json().catch(() => ({}))
    if (!res.ok || !body.job_id) return { ok: false, why: body.why || body.error || '서버가 답을 안 준다' }
    return { ok: true, job_id: body.job_id }
  }
  if (parts[1] === 'chat' && request.method === 'POST' && parts.length === 2) {
    const checked = checkChatBody(await request.json().catch(() => ({})))
    if (checked.why) return json({ ok: false, why: checked.why }, 400)
    const 답 = await runTurn(env, checked, {
      틀읽기: () => 목록읽기('templates/목록.json'),
      // 틀 하나를 통째로. **사진 자리를 세려고** 부른다 — 목록에는 그 수가
      // 안 실려 있고, 사진을 고르기 전 한 판에 많아야 한 번 불린다.
      틀하나읽기: async (코드) => {
        if (!/^[A-Za-z0-9_-]{1,80}$/.test(String(코드 || ''))) return null
        const res = await fetch(`${창고}/templates/${코드}.json`, { cf: { cacheTtl: 0 } })
        if (!res.ok) return null
        return res.json().catch(() => null)
      },
      딥시크: (messages) => askDeepseek(env, messages),
      // **언어를 같이 보낸다.** 담김이 끝나면 람다가 「게시물을 담았습니다」를
      // 써 보내는데, 안 보내면 그 한 줄만 한국어로 뜬다.
      담기: (url, 언어) => 람다걸기('ingest', { url, 언어 }),
      // **굽는 문이 아니라 초안 문이다**(사람 결정 2026-09-19 「항상 거친다」).
      // 굽기는 사람이 미리보기를 보고 「이대로 만들기」를 누를 때 화면이
      // `/api/bake` 로 따로 부른다.
      초안: (몸) => 람다걸기('draft', 몸),
      now: () => new Date().toISOString(),
    })
    return json(답)
  }
  if (parts[1] === 'ingest' && request.method === 'POST') {
    const res = await fetch(`${람다}/ingest`, {
      method: 'POST',
      headers: 람다머리(env, { 'Content-Type': 'application/json' }),
      body: (await request.text().catch(() => '')) || '{}',
    })
    const body = await res.json().catch(() => ({ ok: false, why: '서버가 답을 안 준다' }))
    return json(body, res.status)
  }
  // **「새 대화」가 부르는 문**(사람 지시 2026-09-22: 「새 대화라는 게 리셋임
  // 모든게 리셋(로고까지)」). 그 대화에서 올린 사진과 로고를 창고에서 지운다.
  //
  // **주소를 브라우저에게서 안 받는다.** 대화 번호만 받고 그 대화에 적힌 목록을
  // 서버가 읽는다 — 주소를 받는 문이면 남의 사진 주소를 아는 사람이 지울 수
  // 있다. 대화 번호는 128비트 난수라 아무도 못 찍는다.
  if (parts[1] === 'conversation' && parts.length === 4 && parts[3] === 'uploads'
      && request.method === 'DELETE') {
    if (!isConversationId(parts[2])) return json({ ok: false, why: '대화 번호가 이상합니다' }, 400)
    const got = await loadConversation(env.DB, parts[2])
    if (!got) return json({ ok: false, why: '그런 대화가 없습니다' }, 404)
    // **창고 것만 고른다.** 상태에 남이 적어 넣은 주소가 있어도 안 넘어간다 —
    // 두 함수가 우리 창고 앞자리를 본다(`server/chat.js`).
    const 주소들 = [...쓸사진들(got.state?.사진들), 쓸로고(got.state?.로고)].filter(Boolean)
    let 지운수 = 0
    if (주소들.length) {
      const 끝 = (env.RENDER_API || 'https://l26m3zzcjd.execute-api.ap-northeast-2.amazonaws.com')
        .replace(/\/$/, '')
      const res = await fetch(`${끝}/upload/delete`, {
        method: 'POST',
        headers: 람다머리(env, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ 주소들 }),
      }).catch(() => null)
      const 난것 = res ? await res.json().catch(() => null) : null
      지운수 = Number(난것?.지운수) || 0
      // **못 지워도 새 대화는 된다.** 다만 조용히 넘기지는 않는다 — 안 적으면
      // 창고에 주인 없는 그림이 쌓이는 것을 아무도 모른다.
      if (지운수 < 주소들.length) {
        console.warn(`!! 올린 것 ${주소들.length}개 중 ${지운수}개만 지웠다`)
      }
    }
    // **주소도 같이 비운다.** 파일만 지우고 주소를 남기면 옛 대화를 열었을 때
    // 깨진 그림이 뜬다.
    await 상태만저장(env.DB, parts[2], { 사진들: [], 로고: '', 사진쓰임: '', 바람: '' },
                  new Date().toISOString())
    return json({ ok: true, 지운수 })
  }
  if (parts[1] === 'conversation' && parts.length === 3) {
    if (!isConversationId(parts[2])) return json({ ok: false, why: '대화 번호가 이상합니다' }, 400)
    if (request.method === 'GET') {
      const got = await loadConversation(env.DB, parts[2])
      return got ? json(got) : json({ ok: false, why: '그런 대화가 없습니다' }, 404)
    }
    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const 말 = String(body?.말 ?? '').trim()
      const 상태 = body?.상태 && typeof body.상태 === 'object' ? body.상태 : {}
      // **말 없이 상태만 고치는 길**(사람 결정 2026-09-19: 미리보기에서 고치기).
      // 대본 한 칸 고칠 때마다 말풍선을 남길 수는 없고, 안 남기면 새로고침에
      // 날아간다. 상태가 비었으면 여태처럼 거절한다 — 빈 요청은 실수다.
      if (!말) {
        if (!Object.keys(상태).length) return json({ ok: false, why: '말이 비었습니다' }, 400)
        const r2 = await 상태만저장(env.DB, parts[2], 상태, new Date().toISOString())
        return json(r2, r2.ok ? 200 : 404)
      }
      const r = await appendBot(env.DB, parts[2], 말, 상태, new Date().toISOString())
      return json(r, r.ok ? 200 : 404)
    }
  }
  // 로고 올리기 — 작업대 Lambda 의 `/upload` 로 넘긴다. **열쇠가 필요 없는
  // 문이다**(그 쪽 자물쇠는 `/chat` 과 번호표에만 걸려 있다). 그래서 브라우저에
  // 아무것도 안 내려보내고 여기서 그대로 흘린다.
  //
  // **몸통을 안 뜯는다.** multipart 는 머리말의 `boundary` 와 한 짝이라 여기서
  // 읽어 다시 싸면 경계가 어긋난다 — 머리말을 그대로 얹어 통째로 넘긴다.
  //
  // **크기는 여기서 먼저 막는다.** 안 막으면 API Gateway 가 10MB 에서 끊는데,
  // 그때 오는 답에는 까닭이 안 적혀 있어 사람은 「왜 안 되지」만 본다.
  // 로고 한 장에 5MB 면 넉넉하다.
  if (parts[1] === 'upload' && request.method === 'POST') {
    // **사진은 안 줄인다. 원본 그대로**(사람 지시 2026-09-19: 「품질 중요해…
    // 타협하지마」). 그래서 한 장씩 따로 올려 게이트웨이의 10MB 를 피한다 —
    // 여기 상한은 그 한 장의 상한이다. 로고 한 장에도 넉넉하다.
    const 최대 = 9 * 1024 * 1024
    const 길이 = Number(request.headers.get('content-length') || 0)
    if (길이 > 최대) return json({ ok: false, why: '그림이 너무 큽니다 (9MB 까지)' }, 413)
    const 끝 = (env.RENDER_API || 'https://l26m3zzcjd.execute-api.ap-northeast-2.amazonaws.com')
      .replace(/\/$/, '')
    const 몸 = await request.arrayBuffer().catch(() => null)
    if (!몸) return json({ ok: false, why: '그림을 못 읽었습니다' }, 400)
    if (몸.byteLength > 최대) return json({ ok: false, why: '그림이 너무 큽니다 (9MB 까지)' }, 413)
    const res = await fetch(`${끝}/upload`, {
      method: 'POST',
      headers: 람다머리(env, { 'content-type': request.headers.get('content-type') || '' }),
      body: 몸,
    })
    const 난것 = await res.json().catch(() => null)
    // **두 칸을 꺼내 준다** — 로고 하나(`주소`)와 올린 사진들(`사진들`).
    //
    // 저쪽은 `logo` 칸과 `photos` 칸을 따로 받아 따로 돌려준다. 화면이 어느
    // 쪽으로 올렸느냐에 따라 한쪽만 차서 온다 — 그래서 **둘 다 비었을 때만**
    // 실패로 본다(사람 결정 2026-09-19: 채팅창에 사진 올리기).
    const 주소 = String(난것?.logo_url || '').trim()
    const 사진들 = String(난것?.photo_urls || '').split(/\r?\n/)
      .map((x) => x.trim()).filter(Boolean)
    if (!res.ok || (!주소 && !사진들.length)) {
      return json({ ok: false, why: 난것?.why || 난것?.error || '그림을 못 올렸습니다' },
                  res.ok ? 502 : res.status)
    }
    return json({ ok: true, 주소, 사진들 })
  }

  // 만들기 세 문 — 받는 모양이 같아 한 자리에서 그대로 흘린다.
  //
  // | 문 | 하는 일 | 돈 |
  // |---|---|---|
  // | `make` | 대본부터 작업대까지 한 번에 | 나간다 |
  // | `draft` | **굽기 전까지만** — 장별 대본과 사진 계획 | 안 나간다 |
  // | `bake` | 사람이 보고 고친 초안을 굽는다 | 나간다 |
  //
  // 사람 결정 2026-09-19: 「항상 거친다」 — 미리보기를 건너뛰는 길은 안 만든다.
  if (['make', 'draft', 'bake'].includes(parts[1]) && request.method === 'POST') {
    const 끝 = (env.RENDER_API || 'https://l26m3zzcjd.execute-api.ap-northeast-2.amazonaws.com')
      .replace(/\/$/, '')
    const res = await fetch(`${끝}/${parts[1]}`, {
      method: 'POST',
      headers: 람다머리(env, { 'Content-Type': 'application/json' }),
      body: (await request.text().catch(() => '')) || '{}',
    })
    const body = await res.json().catch(() => ({ ok: false, why: '서버가 답을 안 준다' }))
    return json(body, res.status)
  }

  // 「그만두기」 — 번호표에 「그만」만 적는다(2026-09-24). 실제로 멈추는 것은
  // 분석 람다다. **`jobs` GET 갈래보다 먼저 본다** — 같은 `parts[1]` 을 쓴다.
  //
  // **돈 나가는 문이 아니다.** 오히려 줄에서 기다리는 사진을 fal 에서 빼므로
  // 값을 아낀다 — 그래서 `돈나가는문` 목록에 안 넣었다.
  if (parts[1] === 'jobs' && parts[3] === 'stop' && request.method === 'POST' && parts[2]) {
    const 끝 = (env.RENDER_API || 'https://l26m3zzcjd.execute-api.ap-northeast-2.amazonaws.com')
      .replace(/\/$/, '')
    const res = await fetch(`${끝}/make/${encodeURIComponent(parts[2])}/stop`, {
      method: 'POST', headers: 람다머리(env),
    })
    const 봉투 = await res.json().catch(() => null)
    if (!봉투) return json({ ok: false, why: '서버가 답을 안 준다' }, 502)
    return json(봉투, res.status)
  }

  if (parts[1] === 'jobs' && request.method === 'GET' && parts[2]) {
    const 끝 = (env.RENDER_API || 'https://l26m3zzcjd.execute-api.ap-northeast-2.amazonaws.com')
      .replace(/\/$/, '')
    // **웹 전용 문(`/make/{번호}`)을 쓴다.** RITA 것(`/jobs`)은 규격대로 열쇠를
    // 보는데, 그러자고 열쇠를 워커까지 옮기면 열쇠가 한 군데 더 산다.
    // 번호표가 256비트 무작위라 아무도 못 찍고, 여기는 암호 관문 뒤다.
    const res = await fetch(`${끝}/make/${encodeURIComponent(parts[2])}`, { headers: 람다머리(env) })
    // **못 읽은 것은 «모른다» 지 «실패» 가 아니다**(실물 2026-09-22).
    //
    // 여태는 여기서 `{ status: 'failed' }` 를 냈다. 그러면 화면이 그 일을 통째로
    // 실패로 단정하고 묻기를 멈춘다 — 실제로는 굽기가 18:03:46 에 멀쩡히 끝났는데
    // 화면은 18:01:34 에 「실패했습니다」를 띄우고 손을 놨다(75% 지점, 2분 13초
    // 일찍). 까닭 칸도 안 채워서 사람에게는 「실패했습니다」 다섯 자만 남았다.
    //
    // **작업대 쪽이 진작부터 맞는 길이다**(`render/workbench.py` 의 번호표 읽기):
    // 못 읽으면 그 판만 건너뛰고 5초 뒤에 다시 묻는다. 여기도 같게 맞춘다 —
    // `status` 가 없는 답을 주면 화면이 건너뛴다(`lib/chat.js` 의 일기다리기).
    const 봉투 = await res.json().catch(() => null)
    if (!봉투) return json({}, 502)
    return json(봉투, res.status)
  }

  // 틀 이름 바꾸기 — 작업대 Lambda 의 `POST /template/rename` 으로 넘긴다.
  //
  // **암호 관문 뒤다.** 창고의 틀 목록 자체는 누구나 읽을 수 있지만(그림을
  // 보여 줘야 하니까), 이름을 «바꾸는» 것은 다르다 — 여기로 중계하면 이미
  // 관문을 지난 뒤라 아무나 남의 틀 이름을 못 바꾼다.
  if (parts[1] === 'template' && parts[2] === 'rename' && request.method === 'POST') {
    const 끝 = (env.RENDER_API || 'https://l26m3zzcjd.execute-api.ap-northeast-2.amazonaws.com')
      .replace(/\/$/, '')
    const 몸 = await request.text().catch(() => '')
    const res = await fetch(`${끝}/template/rename`, {
      method: 'POST',
      headers: 람다머리(env, { 'Content-Type': 'application/json' }),
      body: 몸 || '{}',
    })
    const body = await res.json().catch(() => ({ ok: false, why: '서버가 답을 안 준다' }))
    return json(body, res.ok ? 200 : 502)
  }
  if (parts[1] === 'analyze' && request.method === 'POST' && parts[2]) {
    const 끝 = (env.RENDER_API || 'https://l26m3zzcjd.execute-api.ap-northeast-2.amazonaws.com')
      .replace(/\/$/, '')
    // 몸통(사람이 지은 틀 이름)을 그대로 넘긴다. 못 읽으면 빈 것으로 — 이름이
    // 없으면 서버가 게시물 코드를 이름으로 쓴다.
    const 몸 = await request.text().catch(() => '')
    const res = await fetch(`${끝}/analyze/${encodeURIComponent(parts[2])}`, {
      method: 'POST',
      headers: 람다머리(env, { 'Content-Type': 'application/json' }),
      body: 몸 || '{}',
    })
    const body = await res.json().catch(() => ({ ok: false, why: '분석 서버가 답을 안 준다' }))
    return json(body, res.ok ? 202 : 502)
  }
  if (parts[1] === 'measures') {
    if (request.method === 'GET' && parts[2]) return handleGetMeasure(parts[2], env)
    if (request.method === 'GET') return json(await listMeasureIds(env.DB))
    if (request.method === 'PUT' && parts[2]) return handlePutMeasure(request, parts[2], env)
  }
  // **언어는 주소에 실려 온다**(`?언어=영어`). 라벨판이 부를 때마다 붙인다
  // (`lib/label.js` 의 `api`). 안 오면 한국어 — 옛 부르는 쪽이 그대로 돈다.
  const 쓸말 = new URL(request.url).searchParams.get('언어')
  const 서버말 = 라벨말하기(쓸말)
  const lr = labelRoute(parts, request.method)
  if (lr?.op === 'status') return json(await boardStatus(env.DB, Date.now()))
  if (lr?.op === 'run') {
    const state = (await request.json().catch(() => ({}))).state
    const ok = await setRun(env.DB, lr.id, state, new Date().toISOString())
    return json({ ok }, ok ? 200 : 400)
  }
  if (lr?.op === 'get') return json(await getLabels(env.DB, lr.id))
  if (lr?.op === 'confirm') {
    const r = await setConfirm(env.DB, lr.id, lr.on, new Date().toISOString(), 쓸말)
    // '분석중' 거절은 saveLabels 와 같은 409 계약 — 화면이 그 문구를 그대로 보여준다.
    if (r.ok === false) return json(r, 409)
    if (r.why) return json({ ok: false, why: r.why }, 400)
    return json({ ok: true })
  }
  if (lr?.op === 'put') {
    const { json: body, why, count } = checkLabels(lr.id, lr.idx, await request.text(), 쓸말)
    if (why) return json({ ok: false, why }, 400)
    const saved = await saveLabels(env.DB, lr.id, lr.idx, body, new Date().toISOString(), 쓸말)
    if (!saved.ok) return json(saved, 409)
    return json({ ok: true, count })
  }
  return json({ ok: false, why: 서버말('없는통로') }, 404)
}

// 사용설명서(사람 결정 2026-09-28). **주소는 고정하고 파일만 바꿔 끼운다** —
// 설명서를 계속 고치므로, 창고의 같은 열쇠에 새 PDF 를 덮어 올리면 이 주소가
// 늘 최신을 연다. 배포를 다시 할 까닭이 없다.
const 설명서주소 = 'https://cardnews-render-554608989606.s3.ap-northeast-2.amazonaws.com/manual/cardnews-guide.pdf'

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname.replace(/\/$/, '') === '/manual') return Response.redirect(설명서주소, 302)
    if (url.pathname === '/img') return handleImage(url, request)
    if (url.pathname === '/api/login') return handleLogin(request, env)
    // 사람에게 주는 주소는 `/건의` 다(사람이 고름). 브라우저는 한글을 퍼센트로
    // 바꿔 보내므로 **풀어서 견준다** — 안 풀면 영영 안 맞는다.
    // 파일 이름은 아스키로 둔다. 창고에 한글 열쇠를 썼다가 요청조차 안 된 적이
    // 있다(`render/app.py` 의 그 탈).
    //
    // **`.html` 을 떼고 부른다.** 붙이면 정적 파일 쪽이 뗀 주소로 307 을 돌려주고,
    // 브라우저가 그리로 옮겨 가서 주소창의 `/건의` 가 사라진다(실측 2026-09-21).
    if (decodeURIComponent(url.pathname).replace(/\/$/, '') === '/건의') {
      return env.ASSETS.fetch(new Request(new URL('/suggestions', url), request))
    }
    // **암호 관문은 없다.** 2026-09-16 사람 결정 — 리타에 넣을 열린 URL 이라
    // 암호도 로그인도 못 붙인다. 하루 상한은 나중에 따로 둔다.
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/f/')) {
      return handleBoard(request, url, env)
    }
    return env.ASSETS.fetch(request)
  },
}
