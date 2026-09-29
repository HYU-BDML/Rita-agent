// 화면 글자는 한 벌뿐이다 — `수집기말.js`.
import { 말하기 } from './수집기말.js'
// 분석은 구글 비전·fal 을 돌린다 — 돈이 나가므로 출입증을 붙인다.
import { 붙여보내기 } from './출입증.js'

// 공동 목록 서버와 이야기하는 층. 화면 코드(app.js)는 여기만 부른다.
//
// 401 이 오면 needPassword 가 붙은 오류를 던진다. 암호 창을 띄울지는
// 화면이 정한다 — 이 층은 화면을 모른다.

async function ask(path, opts = {}, 언어) {
  const res = await fetch(path, { credentials: 'same-origin', ...opts })
  if (res.status === 401) {
    const e = new Error(말하기(언어)('공_암호필요'))
    e.needPassword = true
    throw e
  }
  return res
}

const asJson = (body) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

export async function login(password) {
  const res = await fetch('/api/login', { credentials: 'same-origin', ...asJson({ password }) })
  return res.ok
}

export async function listPicks(contentType, 언어) {
  const qs = contentType ? `?type=${encodeURIComponent(contentType)}` : ''
  const res = await ask(`/api/picks${qs}`, {}, 언어)
  if (!res.ok) throw new Error(말하기(언어)('공_목록못읽음'))
  return res.json()
}

// 고정은 표에 남는다 — 승민님 화면에서도 같은 순서로 보여야 하기 때문이다.
// (즐겨찾기는 반대다. 그건 사람마다 달라야 해서 브라우저에 둔다.)
export async function setPin(id, pinned, 언어) {
  const res = await ask(`/api/pin/${encodeURIComponent(id)}`, asJson({ pinned }), 언어)
  if (!res.ok) throw new Error(말하기(언어)('공_고정못바꿈'))
  return res.json()
}

export async function removePick(id, 언어) {
  const res = await ask(`/api/picks/${encodeURIComponent(id)}`, { method: 'DELETE' }, 언어)
  if (!res.ok) throw new Error(말하기(언어)('공_못뺐음'))
  return res.json()
}

// 슬라이드를 한 장씩 올린다.
//
// 실패한 장의 번호는 다음 장이 쓴다. 그래야 창고가 01..0N 으로 빈틈없이 차고,
// 나중에 slide_count 만으로 파일 이름을 셀 수 있다.
//
// 표에 줄은 맨 마지막에 넣는다. 중간에 창을 닫으면 창고에 몇 장이 남지만
// 목록에는 안 보인다 — 반쯤 담긴 카드가 뜨는 것보다 낫다.
export async function pick(post, onProgress = () => {}, 언어) {
  const taking = (post.slides || []).filter((s) => s && s.url)
  let saved = 0
  // 실제로 들어간 장만 차례대로 적는다. 실패한 장은 번호를 안 쓰므로 여기서도 빠진다.
  let kinds = ''
  for (let i = 0; i < taking.length; i += 1) {
    onProgress(i + 1, taking.length)
    const s = taking[i]
    const res = await ask(
      `/api/slide/${encodeURIComponent(post.id)}/${saved + 1}?u=${encodeURIComponent(s.url)}` +
        (s.isVideo ? '&v=1' : ''),
      { method: 'PUT' },
      언어
    )
    if (res.ok) {
      saved += 1
      kinds += s.isVideo ? '1' : '0'
    }
  }
  if (!saved) throw new Error(말하기(언어)('실_한장도'))

  // slideTotal 은 "인스타가 말한 원래 장수"다. 그래야 목록 카드에 부분 저장(10/12장)이
  // 뜬다. taking.length(우리가 실제로 받아본 슬라이드 수)는 그보다 작을 수 있으므로 그대로
  // 쓰면 안 된다. 다만 post.slideCount 가 없거나 taking.length 보다 작으면 taking.length 로
  // 낮춘다 — 표는 slideCount(=saved) <= slideTotal 을 검증하는데, 여기서 어긋나면 담기
  // 자체가 통째로 실패한다. 그게 표시 하나 틀리는 것보다 훨씬 나쁘다.
  const slideTotal = Math.max(post.slideCount || 0, taking.length)

  const res = await ask('/api/picks', asJson({
    id: post.id,
    url: post.url,
    author: post.author,
    caption: post.caption,
    postedAt: post.date,
    likes: post.likesHidden ? -1 : post.likes,
    comments: post.comments,
    slideCount: saved,
    slideTotal,
    slideKinds: kinds,
    tag: post.tag || '',
    contentType: post.contentType || 'cardnews',
    playCount: post.playCount ?? -1,
  }), 언어)
  if (!res.ok) throw new Error(말하기(언어)('공_못넣음'))
  return { saved, total: taking.length }
}

// 창고에 넣을 때 확장자로 종류를 남겼다. 그것이 브라우저에서는 유일한 기록이다.
// 이 판정은 여기 하나뿐이다 — 표지와 뷰어가 서로 다르게 보면 안 된다.
export const coverIsVideo = (u) => /\.mp4($|\?)/i.test(String(u ?? ''))

const attr = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

// 목록 표지 한 칸. 첫 장이 영상인 게시물이 있어서 <img> 하나로는 안 된다 —
// <img> 에 mp4 를 꽂으면 통째로 빈칸이 된다. 뷰어 썸네일이 쓰는 방법을 그대로 쓴다.
export function coverTag(url) {
  const u = attr(url)
  // 목록에서 소리가 나면 안 되고, 표지로는 첫 프레임만 있으면 된다.
  return coverIsVideo(url)
    ? `<video muted playsinline preload="metadata" src="${u}"></video>`
    : `<img loading="lazy" src="${u}" alt="">`
}

// 라벨링 상태 — 목록과 따로 온다. 카드가 이미 그려진 뒤에 붙는 값이라 실패해도
// 화면이 비면 안 된다. 그 판단은 화면(app.js)이 하고, 이 층은 그냥 부르기만 한다.
export async function labelStatus(언어) {
  const res = await ask('/api/labels/~status', {}, 언어)
  if (!res.ok) throw new Error(말하기(언어)('공_상태못읽음'))
  return res.json()
}

// 공동 목록의 "분석하기" 단추 — label.html 의 '확정'과 같은 API(PUT ~confirm)를
// 부른다. 취소(DELETE)는 여기서 안 다룬다 — 목록은 '라벨 끝'일 때만 이 단추를
// 보여주므로 되돌릴 일이 없고, 되돌리려면 라벨 화면에 이미 그 단추가 있다.
// '분석이 도는 중입니다' 같은 서버의 구체적 이유를 그대로 살려 던진다.
export async function confirmLabels(id, 언어) {
  const res = await ask(`/api/labels/~confirm/${encodeURIComponent(id)}`, { method: 'PUT' }, 언어)
  const body = await res.json().catch(() => ({}))
  // **서버가 적어 보낸 까닭(`why`)은 그대로 쓴다.** 거기 한국어가 오면 영어
  // 화면에도 한국어로 뜬다 — 그 글은 람다가 쓰는 것이라 여기서 못 고친다.
  if (!res.ok || body.ok === false) throw new Error(body.why || 말하기(언어)('분_요청못넣음'))
  return body
}

// 틀 창고. **분석이 끝나면 여기에 파일이 올라간다** — 목록에서 바로 열 수
// 있어야 한다(그 전에는 주소를 아는 사람만 볼 수 있었다).
export const 창고 = 'https://cardnews-render-554608989606.s3.ap-northeast-2.amazonaws.com'
export const 틀주소 = (id) => `${창고}/templates/${encodeURIComponent(id)}.json`
export const 목록주소 = `${창고}/templates/${encodeURIComponent('목록.json')}`

// 분석을 «실제로» 건다. `confirmLabels` 로 「분석 대기」에 넣은 다음 이걸 부른다 —
// 앞의 것은 「이 라벨로 해라」는 표시이고, 이것이 계량을 시작시킨다.
//
// 202 를 준다. 끝났는지는 목록의 상태로 안다(「분석중」→「분석 끝」·「분석 실패」)
// — 계량이 1~2분이라 기다리는 판을 만들면 브라우저만 붙잡힌다.
/** 분석을 «실제로» 건다.
 *
 * **`개인: false` 를 같이 보낸다**(사람 지시 2026-09-19). 서버는 기본을 「개인」
 * 으로 두고, **여기서만** 공용이라고 말한다 — 여기가 사장님 자리이고 이름도
 * 물어보는 곳이다. 채팅·라벨판에서 건 것은 그 사람 브라우저에만 남는다.
 */
export async function startAnalyze(id, 이름 = '', 언어) {
  const res = await 붙여보내기(`/api/analyze/${encodeURIComponent(id)}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 이름, 개인: false }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body.ok === false) throw new Error(body.why || 말하기(언어)('분_못걸었음'))
  return body
}

// 분석 단추를 보여 줄까. **「라벨 끝」일 때만 보여 주면 안 된다** — 한 번 분석하면
// 상태가 「분석 끝」이 되어 단추가 사라지고, 라벨을 고쳐도 목록에서 다시 분석할 길이
// 없다(라벨 화면에 들어가 「확정」을 눌러야 상태가 되돌아오는데 사람이 그걸 알 리가
// 없다 — 2026-08-27 실제로 못 찾았다).
//
// 못 누르는 경우는 둘뿐이다: 그은 라벨이 아예 없거나(잴 것이 없다), 지금 도는 중
// (또 걸면 두 번 돈다).
export const analyzable = (status) => Boolean(status) && status !== '안 함' && status !== '분석중'

// 단추에 적을 말. 「분석하기」와 「다시 분석」을 가르는 것은 친절이 아니라 «지금
// 무슨 일이 일어나는지» 를 알려 주는 것이다 — 이미 한 것을 또 하면 덮어쓴다.
export function analyzeLabel(status) {
  if (status === '분석중') return '분석중…'
  return status === '분석 끝' || status === '분석 실패' ? '다시 분석' : '분석하기'
}

// 뱃지 색만 고른다. '안 함' 도 값은 내지만(off) 카드마다 다 뜨면 소음이라
// 부르는 쪽(app.js)에서 그 경우만 안 그린다.
// '라벨 N/M장' 은 장수가 게시물마다 달라 값 비교가 안 통한다 — 모양으로 잡는다.
export function badgeOf(status) {
  if (status === '안 함') return { tone: 'off' }
  if (status === '분석 대기') return { tone: 'ready' }
  if (status === '작업중' || status === '분석중') return { tone: 'busy' }
  if (status === '라벨 끝' || status === '분석 끝') return { tone: 'done' }
  if (status === '분석 실패') return { tone: 'bad' }
  if (/^라벨 \d+\/\d+장$/.test(status)) return { tone: 'busy' }
  return { tone: 'off' }
}

// 표에서 온 카드를 뷰어가 아는 게시물 모양으로 바꾼다.
// 릴스는 캐러셀이 아니라 영상 하나다 — contentType 으로 가른다.
export function cardToPost(card) {
  const isReel = card.contentType === 'reel'
  return {
    id: card.id,
    url: card.url,
    caption: card.caption,
    author: card.author,
    likes: card.likes < 0 ? 0 : card.likes,
    comments: card.comments,
    likesHidden: card.likes < 0,
    isCarousel: !isReel,
    kind: isReel ? 'video' : 'carousel',
    slideCount: card.slideCount,
    slides: (card.slides || []).map((u) => ({
      url: u, width: 0, height: 0, isVideo: coverIsVideo(u), poster: '',
    })),
  }
}
