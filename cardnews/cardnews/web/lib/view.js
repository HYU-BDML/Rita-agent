const byRank = (a, b) => a.rank - b.rank

// **`label` 은 한국어 그대로 둔다.** 화면에 거는 글자는 `말열쇠` 로 글자표
// (`수집기말.js`)를 거친다 — 여기에 영어를 같이 두면 규칙이 두 벌이 된다.
export const SORTS = {
  likes: {
    label: '좋아요순',
    말열쇠: '정_좋아요순',
    compare: (a, b) => b.likes - a.likes || b.comments - a.comments || byRank(a, b),
  },
  comments: {
    label: '댓글순',
    말열쇠: '정_댓글순',
    compare: (a, b) => b.comments - a.comments || b.likes - a.likes || byRank(a, b),
  },
  recent: {
    label: '최신순',
    말열쇠: '정_최신순',
    compare: (a, b) => String(b.date).localeCompare(String(a.date)) || byRank(a, b),
  },
  instagram: {
    label: '인스타 기준',
    말열쇠: '정_인스타기준',
    compare: byRank,
  },
  views: {
    label: '조회수순',
    말열쇠: '정_조회수순',
    compare: (a, b) => (b.playCount ?? -1) - (a.playCount ?? -1) || byRank(a, b),
  },
}

// 조회수를 하나도 못 받은 결과에서 조회수순을 남겨두면, 비교값이 전부 같아져 인스타
// 기준 순서로 조용히 떨어진다. 오류도 안 나고 목록은 바뀐 것처럼 보여서 정렬된 줄 안다 —
// 아무것도 안 하면서 한 척하는 셈이라 없는 것보다 나쁘다. 그래서 아예 안 보여준다.
//
// 실제로 그런 일이 난다: 릴스 검색어가 A 액터(crawlerbros)로 폴백하면 그 액터는 조회수를
// 아예 안 준다(2026-08-18 실측 — 영상 낱장 54건 중 조회수 필드를 가진 것 0건).
//
// 0 회는 '있는 것'이다. 모름(-1)과 갈라야 한다.
export const hasViews = (posts) =>
  (posts || []).some((p) => p.kind === 'video' && Number(p.playCount) >= 0)

export function sortKeysFor(contentType, posts) {
  const base = ['likes', 'comments', 'recent', 'instagram']
  if (contentType !== 'reel') return base
  // 릴스를 한 건도 못 받았으면 감추지 않는다. 검색 전부터 없으면 기능이 원래 없는
  // 것처럼 보인다 — 검색한 뒤에 사라져야 "이 검색이 조회수를 못 받았구나" 로 읽힌다.
  const reels = (posts || []).filter((p) => p.kind === 'video')
  if (!reels.length || hasViews(reels)) return ['views', ...base]
  return base
}

export function applyView(posts, { carouselOnly, minSlides, sort, reelOnly }) {
  const kept = (posts || []).filter((p) => {
    if (reelOnly) return p.kind === 'video'
    if (!carouselOnly) return true
    return p.isCarousel && p.slideCount >= minSlides
  })
  const compare = (SORTS[sort] || SORTS.likes).compare
  const visible = kept.filter((p) => !p.likesHidden).sort(compare)
  const hidden = kept.filter((p) => p.likesHidden).sort(compare)
  return [...visible, ...hidden]
}
