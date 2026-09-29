// 화면 글자는 한 벌뿐이다 — `수집기말.js`.
import { 말하기 } from './수집기말.js'

// Apify 는 쓴 만큼을 달러로 센다. 콘솔에도 "$0.00 / $5.00" 으로 나온다.
// 원화로 바꿔 보여주면 환율을 우리가 정해야 하고, 남은 크레딧과 대조가 안 된다.
export const fmtCredit = (usd, 언어) => {
  const n = Number(usd) || 0
  if (n > 0 && n < 0.01) return 말하기(언어)('잔_1달러미만')
  return `$${n.toFixed(2)}`
}

// 실행마다 붙는 고정 비용이 있어 잘게 나눠 뽑을수록 손해다.
// 25건은 건당 $0.0085, 100건은 $0.0068 이었다. 그래서 하한을 50건으로 올렸다.
export const COUNTS = [50, 100, 150]
export const DEFAULT_COUNT = 50

// 1GB 실측: 50건 80초 · 100건 83초 · 150건 140초.
// 30초 단위로 올려 잡는다. 말한 것보다 오래 걸리는 쪽이 짧게 걸리는 쪽보다 나쁘다.
export function estimateSecs(count) {
  return Math.ceil((40 + 0.65 * count) / 30) * 30
}

// 계정 액터는 검색 액터와 속도가 다르다. 실측 두 점뿐이다 — 10건 65초, 50건 약 60초.
// 건수를 다섯 배로 올려도 시간이 그대로였다. 뜨는 데 드는 시간이 대부분이고
// 건당 시간은 얼마 안 된다는 뜻이라, 검색 액터의 식(건당 0.65초)을 그대로 쓰면 안 된다.
//
// 점이 둘뿐이라 100건·150건은 추정이다. 실제로 돌려보고 다르면 이 식을 고쳐라 —
// 끝나고 "실제 N초 걸렸습니다" 를 보여주는 것이 그 때문이다.
export function estimateSecsAccount(count) {
  return Math.ceil((50 + 0.2 * count) / 30) * 30
}

export function fmtDuration(secs, 언어) {
  const 말 = 말하기(언어)
  const m = Math.floor(secs / 60)
  const s = secs % 60
  if (!m) return 말('때_초', s)
  return s ? 말('때_분초', m, s) : 말('때_분', m)
}

// 인스타 검색창에 그대로 치는 것과 같게 만든다. 앞뒤 공백과 중복 공백만 정리한다.
// 띄어쓰기를 지우면 안 된다. "아이돌 카드뉴스" 와 "아이돌카드뉴스" 는 다른 검색이다.
export function normalizeTag(text) {
  return String(text || '').trim().replace(/\s+/g, ' ')
}

// 입력창 하나로 두 갈래를 받는다. 인스타 표기 그대로 @ 로 시작하면 계정이다.
// #아이돌 은 검색어로 남는다 — 인스타에서도 해시태그는 검색이지 계정이 아니다.
// 계정 이름은 대소문자를 가리지 않으므로 내려 쓴다. 같은 계정이 두 갈래로 쌓이면 안 된다.
export function parseTarget(text) {
  const t = normalizeTag(text)
  if (t.startsWith('@')) {
    const name = t.slice(1).trim()
    if (name) return { source: 'account', value: name.toLowerCase() }
  }
  return { source: 'keyword', value: t }
}

const postUrl = (code) => `https://www.instagram.com/p/${code}/`
const asText = (c) => (typeof c === 'string' ? c : (c && c.text) || '')

function kindOf(isCarousel, isVideo) {
  if (isCarousel) return 'carousel'
  return isVideo ? 'video' : 'image'
}

// 릴스 전용 두 소스(reelPopular·reelAccount)가 공유하는 정규화.
// 둘 다 apify 1st-party 액터라 출력 필드 이름이 같다(shortCode/ownerUsername/displayUrl/
// likesCount/commentsCount/timestamp/videoUrl/videoPlayCount) — 2026-08-17에 reelPopular를,
// 2026-08-18에 reelAccount(@natgeo 실측)를 각각 돌려 같은 모양임을 확인했다.
// 조회수는 한 필드만 믿으면 안 된다. 인스타가 '재생 수'를 '조회 수'로 바꾸면서
// 액터도 videoPlayCount 를 비우고 videoViewCount 에 숫자를 담아 보내는 일이 있다
// (실측 응답에서 videoPlayCount 가 있는 항목 17건이 전부 null, 같은 항목의
// videoViewCount 는 숫자였다). 둘 다 없을 때만 모름(-1) 으로 둔다 — 0 으로 두면
// 진짜 조회수 0 인 릴스와 구분이 안 된다.
function viewsOf(r) {
  const raw = [r.videoPlayCount, r.videoViewCount].find((v) => v != null && v !== '')
  const n = Number(raw)
  return Number.isFinite(n) ? n : -1
}

function normalizeReel(r, i) {
  return {
    id: r.shortCode,
    url: r.url || postUrl(r.shortCode),
    slides: [{
      url: r.videoUrl || '',
      width: r.dimensionsWidth || 0,
      height: r.dimensionsHeight || 0,
      isVideo: true,
      poster: r.displayUrl || '',
    }],
    cover: r.displayUrl || '',
    slideCount: 1,
    likes: Math.max(r.likesCount || 0, 0),
    comments: r.commentsCount || 0,
    likesHidden: (r.likesCount ?? 0) < 0,
    caption: asText(r.caption),
    author: r.ownerUsername || '',
    date: r.timestamp || '',
    isCarousel: false,
    kind: 'video',
    playCount: viewsOf(r),
    rank: i,
  }
}

export const SOURCES = {
  // 인스타는 해시태그 피드 페이지를 없애고 검색으로 합쳤다(/explore/tags/... → /explore/search).
  // 그래서 사람이 보는 화면과 같은 것을 받으려면 해시태그 피드가 아니라 검색을 긁어야 한다.
  // 검색 결과는 로그인한 계정마다 다르므로, 쿠키를 넣어야 내 화면과 일치한다.
  keyword: {
    actorId: 'crawlerbros~instagram-keyword-search-scraper',
    // 액터 기본값은 4GB 다. 그런데 시작 비용이 메모리 1GB 당 $0.05 라, 4GB 면 결과가 몇 건이든
    // 켤 때마다 $0.20 을 먼저 낸다. 1GB 로 내려도 받는 건수·필드가 같고 오히려 더 빠르다
    // (실측 100건: 1GB 83초 $0.68 vs 2GB 188초 $0.75, 4GB 는 시작 비용만 $0.20).
    memoryMb: 1024,
    startCost: 0.054, // 실행 1회 고정분 — 시작 $0.05 + CPU 약 $0.004
    unitCost: 0.0063, // 건당 — 결과 $0.005 + 레지덴셜 프록시 약 $0.0013 (프록시는 액터가 고정, 못 끈다)
    // 검색어를 손대지 않고 그대로 넘긴다. 인스타 검색창에 친 것과 같아야 한다.
    buildInput: ({ tag, count, cookies }) => ({
      keywords: [tag],
      maxPosts: count,
      ...(cookies ? { cookies } : {}),
    }),
    normalize: (r, i) => {
      // 영상 낱장은 url 이 mp4 다. 종류를 안 챙기면 <img> 에 mp4 를 꽂아 빈칸이 된다.
      // 캐러셀 속 영상은 type 이 'Video', 단일 게시물이 릴스면 media_items[0].type 은
      // 'Reel' 이다 — 하나만 보면 릴스 낱장을 그림으로 잘못 판정한다.
      const slides = (r.media_items || []).map((m) => ({
        url: m.url || '',
        width: m.width || 0,
        height: m.height || 0,
        isVideo: m.type === 'Video' || m.type === 'Reel',
        poster: '',
      }))
      const isCarousel = r.media_type === 'Carousel'
      // 릴스만 조회수가 있다. media_items[0].play_count 는 문자열로 온다.
      const rawPlayCount = Number((r.media_items || [])[0]?.play_count)
      return {
        id: r.shortcode,
        url: r.post_url || postUrl(r.shortcode),
        slides,
        cover: r.thumbnail_url || (slides[0] && slides[0].url) || '',
        slideCount: r.media_count || slides.length,
        likes: r.like_count || 0,
        comments: r.comment_count || 0,
        likesHidden: Boolean(r.likes_hidden),
        caption: asText(r.caption),
        author: r.username || '',
        date: r.pub_date || '',
        isCarousel,
        kind: kindOf(isCarousel, r.media_type === 'Reel'),
        playCount: Number.isFinite(rawPlayCount) ? rawPlayCount : -1,
        rank: i,
      }
    },
  },

  account: {
    actorId: 'apify~instagram-post-scraper',
    // 키워드 액터와 달리 시작 비용 이벤트가 없고, 플랫폼 사용료(CPU·프록시)도 사용자에게 물리지 않는다.
    // 그래서 메모리를 낮춰도 비용이 한 푼도 안 줄고 느려지기만 한다
    // (실측 10건: 기본 1GB 65초 $0.0270 vs 256MB 91초 $0.0270 — 동일).
    // 지정하지 않고 액터 기본값(1GB)을 쓴다.
    memoryMb: null,
    startCost: 0,
    unitCost: 0.0027, // 건당 post $0.0017 + post-details $0.001 (FREE 등급. 유료 등급일수록 싸진다)
    buildInput: ({ username, count }) => ({
      username: [username],
      resultsLimit: count,
      dataDetailLevel: 'detailedData',
    }),
    normalize: (r, i) => {
      const children = r.childPosts || []
      // 이 소스는 영상 낱장에 videoUrl 과 displayUrl 을 같이 준다.
      // displayUrl 은 그 영상의 정지 화면이라, 재생 전에 보여줄 그림으로 쓴다.
      const asSlide = (c) => ({
        url: c.videoUrl || c.displayUrl || '',
        width: c.originalWidth || 0,
        height: c.originalHeight || 0,
        isVideo: Boolean(c.videoUrl),
        poster: c.videoUrl ? c.displayUrl || '' : '',
      })
      const slides = children.map(asSlide)
      const isCarousel = r.type === 'Sidecar'
      return {
        id: r.shortCode,
        url: r.url || postUrl(r.shortCode),
        slides: slides.length ? slides : r.displayUrl ? [asSlide(r)] : [],
        cover: r.displayUrl || '',
        slideCount: isCarousel ? children.length : 1,
        likes: Math.max(r.likesCount || 0, 0),
        comments: r.commentsCount || 0,
        likesHidden: (r.likesCount || 0) < 0,
        caption: asText(r.caption),
        author: r.ownerUsername || '',
        date: r.timestamp || '',
        isCarousel,
        kind: kindOf(isCarousel, r.type === 'Video'),
        rank: i,
      }
    },
  },

  // 인스타의 "이 주제의 인기 릴스" 큐레이션 페이지를 긁는다. 전체 검색이 아니라 인스타가
  // 자체적으로 주제별 인기 릴스를 골라둔 페이지라서, 그 페이지가 없는 검색어(너무 포괄적이거나
  // 릴스 콘텐츠가 아닌 주제)는 결정론적으로 실패한다(2026-08-17 실측: "카드뉴스"·"food" 실패,
  // "dog"·"먹방"·"아이돌" 성공, 재시도해도 같은 결과 — 로그인/쿠키 문제가 아니었다).
  // 그래서 릴스 키워드 검색은 이 소스를 먼저 시도하고 실패하면 keyword 로 폴백한다(app.js).
  reelPopular: {
    actorId: 'apify~instagram-search-scraper',
    memoryMb: null, // 액터 기본값. 실측 전까지 확정 아님
    startCost: 0,
    unitCost: 0.0015, // $1.50/1000 (실측 실행에서 3건에 소액 과금 확인, 정확한 소수점은 재검증 필요)
    buildInput: ({ tag, count }) => ({
      search: tag,
      searchType: 'popular',
      searchLimit: count,
    }),
    normalize: normalizeReel,
  },

  // 계정 릴스 전용 액터. 카드뉴스 account 소스처럼 계정명을 그대로 받는다.
  // Apify API 로 직접 조회한 30일 성공률 99.5%(2026-08-17 기준) — 마케팅 문구가 아니라
  // 실제 실행 통계다.
  reelAccount: {
    actorId: 'apify~instagram-reel-scraper',
    memoryMb: null,
    startCost: 0,
    unitCost: 0.0026, // $2.60/1000. 실측 실행 전이라 확정 아님 — 첫 실행 때 재검증할 것
    buildInput: ({ username, count }) => ({
      username: [username],
      resultsLimit: count,
    }),
    normalize: normalizeReel,
  },
}

export function normalize(sourceName, rows) {
  const src = SOURCES[sourceName]
  if (!src) throw new Error(`알 수 없는 소스: ${sourceName}`)
  return (rows || []).map((r, i) => src.normalize(r, i))
}

export function estimateCost(sourceName, count) {
  const src = SOURCES[sourceName]
  return src.startCost + src.unitCost * count
}

// 릴스 키워드 검색은 reelPopular(B) 를 먼저 시도하고 실패하면 keyword(A) 로 폴백한다
// (app.js). B 가 실패해도 거의 과금이 안 되지만(실측), 검색 전 비용 표시는 정직하게
// "B만 성공 시 ~ A까지 갈 때" 범위로 보여준다.
export function estimateCostReelKeyword(count) {
  const min = estimateCost('reelPopular', count)
  const max = min + estimateCost('keyword', count)
  return { min, max }
}
