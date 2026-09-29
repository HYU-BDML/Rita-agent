import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { normalize, estimateCost, estimateCostReelKeyword, fmtCredit, SOURCES, normalizeTag, COUNTS, DEFAULT_COUNT, estimateSecs, fmtDuration, parseTarget, estimateSecsAccount } from '../lib/sources.js'

const load = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'))

test('normalizeTag는 앞뒤·중복 공백만 정리한다', () => {
  assert.equal(normalizeTag('  아이돌 카드뉴스 '), '아이돌 카드뉴스')
  assert.equal(normalizeTag('아이돌   카드뉴스'), '아이돌 카드뉴스')
  assert.equal(normalizeTag(''), '')
  assert.equal(normalizeTag(null), '')
})

test('normalizeTag는 띄어쓰기를 지우지 않는다', () => {
  // "아이돌 카드뉴스"(15건 전부 카드뉴스)와 "아이돌카드뉴스"는 다른 검색이다
  assert.notEqual(normalizeTag('아이돌 카드뉴스'), '아이돌카드뉴스')
})

test('normalizeTag는 # 를 지우지 않는다', () => {
  // 인스타에서 "#아이돌"과 "아이돌"은 다른 결과를 준다
  assert.equal(normalizeTag('#아이돌'), '#아이돌')
})

test('parseTarget: @ 로 시작하면 계정으로 본다', () => {
  assert.deepEqual(parseTarget('@cardnews_daily'), { source: 'account', value: 'cardnews_daily' })
})

test('parseTarget: @ 가 없으면 검색어다', () => {
  assert.deepEqual(parseTarget('아이돌 카드뉴스'), { source: 'keyword', value: '아이돌 카드뉴스' })
})

test('parseTarget: 해시태그는 검색어로 남는다', () => {
  // 인스타에서 #아이돌 은 검색어다. @ 만 계정을 뜻한다.
  assert.deepEqual(parseTarget('#아이돌'), { source: 'keyword', value: '#아이돌' })
})

test('parseTarget: @ 뒤에 이름이 없으면 계정이 아니다', () => {
  assert.equal(parseTarget('@').source, 'keyword')
  assert.equal(parseTarget('@ ').source, 'keyword')
})

test('parseTarget: 계정 이름의 대문자는 내려 쓴다', () => {
  // 인스타 계정 이름은 대소문자를 가리지 않는다. 같은 계정이 두 갈래로 쌓이면 안 된다.
  assert.equal(parseTarget('@CardNews').value, 'cardnews')
})

test('parseTarget: 앞뒤 공백을 털고 본다', () => {
  assert.deepEqual(parseTarget('  @abc  '), { source: 'account', value: 'abc' })
})

test('키워드 소스: 영상 슬라이드에 영상 표시를 단다', () => {
  // 캐러셀 안에 영상이 섞여 온다. 표시를 안 달면 mp4 를 <img> 에 꽂아 빈칸이 된다.
  const posts = normalize('keyword', load('keywordsearch'))
  const mixed = posts.find((p) => p.slides.some((s) => s.isVideo))
  assert.ok(mixed, '표본에 영상 슬라이드가 섞인 게시물이 있어야 한다')
  assert.equal(mixed.slides[0].isVideo, false)
  assert.equal(mixed.slides[1].isVideo, true)
  assert.ok(mixed.slides[1].url.includes('.mp4'))
})

test('키워드 소스: 표지 그림을 따로 챙긴다', () => {
  // 표지가 영상이면 슬라이드 주소로는 그림을 못 그린다. 인스타가 주는 대표 그림을 쓴다.
  const posts = normalize('keyword', load('keywordsearch'))
  assert.ok(posts.every((p) => p.cover.startsWith('https://')))
})

test('계정 소스: 영상 자식은 영상 주소를 쓰고 정지 화면을 함께 챙긴다', () => {
  const posts = normalize('account', load('account'))
  const v = posts.flatMap((p) => p.slides).find((s) => s.isVideo)
  assert.ok(v, '표본에 영상 자식이 있어야 한다')
  assert.ok(v.url.includes('.mp4'))
  assert.ok(v.poster.includes('.jpg'), '정지 화면은 그림 주소여야 한다')
})

test('탐색 범위 기본값은 목록에 있고, 실행 고정비 때문에 50건 아래는 두지 않는다', () => {
  assert.ok(COUNTS.includes(DEFAULT_COUNT))
  assert.equal(DEFAULT_COUNT, 50)
  assert.ok(Math.min(...COUNTS) >= 50)
  assert.ok(Math.max(...COUNTS) <= 150)
})

test('키워드 소스: Carousel 을 판별하고 슬라이드를 펼친다', () => {
  const posts = normalize('keyword', load('keywordsearch'))
  const carousels = posts.filter((p) => p.isCarousel)
  assert.equal(carousels.length, 3)
  assert.ok(carousels.every((p) => p.slides.length === p.slideCount))
  assert.ok(carousels.every((p) => p.slides.every((s) => s.url.startsWith('http'))))
})

test('키워드 소스: 릴스는 캐러셀로 세지 않는다', () => {
  const posts = normalize('keyword', load('keywordsearch'))
  const reels = posts.filter((p) => p.kind === 'video')
  assert.ok(reels.length > 0)
  assert.ok(reels.every((p) => !p.isCarousel))
})

test('키워드 소스: rank는 받은 순서를 보존한다', () => {
  const posts = normalize('keyword', load('keywordsearch'))
  assert.deepEqual(posts.map((p) => p.rank), posts.map((_, i) => i))
})

test('키워드 소스: 좋아요·댓글·캡션·게시일을 읽는다', () => {
  const posts = normalize('keyword', load('keywordsearch'))
  assert.ok(posts.every((p) => typeof p.likes === 'number'))
  assert.ok(posts.every((p) => typeof p.comments === 'number'))
  assert.ok(posts.every((p) => typeof p.caption === 'string'))
  assert.ok(posts.every((p) => /^\d{4}-\d{2}-\d{2}/.test(p.date)))
})

test('키워드 소스: url은 post_url을 쓴다', () => {
  const posts = normalize('keyword', load('keywordsearch'))
  assert.ok(posts.every((p) => p.url === `https://www.instagram.com/p/${p.id}/`))
})

test('계정 소스: Sidecar를 캐러셀로 읽고 childPosts를 슬라이드로 쓴다', () => {
  const posts = normalize('account', load('account'))
  const carousels = posts.filter((p) => p.isCarousel)
  assert.equal(carousels.length, 10)
  assert.equal(
    carousels.reduce((sum, p) => sum + p.slides.length, 0),
    98
  )
})

test('계정 소스: 좋아요 음수는 숨김으로 표시한다', () => {
  const rows = [{ shortCode: 'X', type: 'Image', likesCount: -1, commentsCount: 0, childPosts: [] }]
  const [p] = normalize('account', rows)
  assert.equal(p.likesHidden, true)
})

test('kind는 세 값 중 하나다', () => {
  const posts = [...normalize('account', load('account')), ...normalize('keyword', load('keywordsearch'))]
  assert.ok(posts.every((p) => ['carousel', 'image', 'video'].includes(p.kind)))
})

test('estimateCost는 실행 고정비에 건당 단가를 더한다', () => {
  // 1GB 실측: 50건 $0.3711, 100건 $0.6804, 150건 $1.0038
  assert.ok(Math.abs(estimateCost('keyword', 50) - 0.3711) < 5e-3)
  assert.ok(Math.abs(estimateCost('keyword', 100) - 0.6804) < 5e-3)
  assert.ok(Math.abs(estimateCost('keyword', 150) - 1.0038) < 6e-3)
  // 계정 소스는 고정비를 재보지 않았다. 종전대로 건당 단가만 센다.
  assert.ok(Math.abs(estimateCost('account', 24) - 0.0648) < 1e-9)
})

test('예상 시간은 실측보다 짧게 말하지 않는다', () => {
  // 실측 1GB: 50건 80초, 100건 83초, 150건 140초
  assert.ok(estimateSecs(50) >= 80)
  assert.ok(estimateSecs(100) >= 83)
  assert.ok(estimateSecs(150) >= 140)
  assert.equal(fmtDuration(90), '1분 30초')
  assert.equal(fmtDuration(120), '2분')
  assert.equal(fmtDuration(45), '45초')
})

test('fmtCredit 은 Apify 콘솔과 같은 달러 표기를 준다', () => {
  assert.equal(fmtCredit(0.5265), '$0.53')
  assert.equal(fmtCredit(0.263), '$0.26')
  assert.equal(fmtCredit(1.053), '$1.05')
  assert.equal(fmtCredit(0), '$0.00')
})

test('fmtCredit 은 아주 작은 값을 $0.00 으로 뭉개지 않는다', () => {
  // 계정 10건이 $0.027 이다. $0.00 이라고 하면 공짜로 오해한다
  assert.equal(fmtCredit(0.004), '$0.01 미만')
})

test('키워드 소스 입력은 검색어를 손대지 않고 그대로 넘긴다', () => {
  const input = SOURCES.keyword.buildInput({ tag: '아이돌 카드뉴스', count: 50 })
  assert.deepEqual(input.keywords, ['아이돌 카드뉴스'])
  assert.equal(input.maxPosts, 50)
  assert.deepEqual(SOURCES.keyword.buildInput({ tag: '#아이돌', count: 50 }).keywords, ['#아이돌'])
})

test('쿠키는 넣었을 때만 입력에 실린다', () => {
  const without = SOURCES.keyword.buildInput({ tag: '부동산', count: 50 })
  assert.ok(!('cookies' in without))
  const withCookie = SOURCES.keyword.buildInput({ tag: '부동산', count: 50, cookies: 'sessionid=abc' })
  assert.equal(withCookie.cookies, 'sessionid=abc')
})

test('계정 소스 입력은 detailedData를 강제한다', () => {
  const input = SOURCES.account.buildInput({ username: 'miikkomo', count: 24 })
  assert.equal(input.dataDetailLevel, 'detailedData')
  assert.deepEqual(input.username, ['miikkomo'])
  assert.equal(input.resultsLimit, 24)
})

// 계정 액터는 검색 액터보다 훨씬 평평하다. 실측 10건 65초 / 50건 약 60초 —
// 건수를 다섯 배로 올려도 시간이 거의 그대로였다.
test('계정 예상 시간은 실측 두 점을 지난다', () => {
  assert.equal(estimateSecsAccount(10), 60)   // 실측 65초
  assert.equal(estimateSecsAccount(50), 60)   // 실측 약 60초
})

test('계정 예상 시간은 검색보다 건수에 훨씬 덜 끌려간다', () => {
  const 계정 = estimateSecsAccount(150) - estimateSecsAccount(50)
  const 검색 = estimateSecs(150) - estimateSecs(50)
  assert.ok(계정 < 검색, `계정 ${계정}초 / 검색 ${검색}초 — 계정이 더 가팔라졌다`)
})

test('예상 시간은 30초 단위로 올려 잡는다', () => {
  for (const n of [10, 50, 100, 150]) {
    assert.equal(estimateSecsAccount(n) % 30, 0, `${n}건`)
  }
})

test('키워드 소스: 릴스 낱장도 영상으로 표시한다 — media_items[0].type 은 Video 가 아니라 Reel 이다', () => {
  const posts = normalize('keyword', load('keywordsearch'))
  const reels = posts.filter((p) => p.kind === 'video')
  assert.ok(reels.length > 0)
  assert.ok(reels.every((p) => p.slides[0].isVideo === true), '릴스 낱장은 isVideo 여야 mp4 로 저장된다')
})

test('키워드 소스: 릴스는 조회수를 챙긴다', () => {
  const posts = normalize('keyword', load('keywordsearch'))
  const reels = posts.filter((p) => p.kind === 'video')
  assert.ok(reels.some((p) => p.playCount > 0), '표본에 조회수 있는 릴스가 있어야 한다')
})

test('키워드 소스: 캐러셀·사진은 조회수가 -1(해당 없음)이다', () => {
  const posts = normalize('keyword', load('keywordsearch'))
  const notReel = posts.filter((p) => p.kind !== 'video')
  assert.ok(notReel.every((p) => p.playCount === -1))
})

// Apify 주소는 /v2/acts/<액터>/runs 인데, 액터를 username/name 으로 적으면 슬래시가
// 경로를 한 칸 더 쪼개서 /acts/apify/instagram-search-scraper/runs 가 되고 404 가 난다.
// 실측(2026-08-18): ~ 로 적으면 200, / 로 적으면 404.
// 이걸 놓치면 B 가 매번 조용히 죽고 A 로 폴백해서, 비싼 액터로 조회수 없는 결과를 받는다.
test('액터 ID 는 username~name 으로 적는다 — 슬래시는 API 경로를 쪼갠다', () => {
  for (const [name, s] of Object.entries(SOURCES)) {
    assert.match(s.actorId, /^[\w.-]+~[\w.-]+$/, `${name} 의 actorId 가 이상하다: ${s.actorId}`)
  }
})

test('릴스 인기 소스(B): 실제 데이터를 릴스 카드로 정규화한다', () => {
  const posts = normalize('reelPopular', load('reel-popular'))
  assert.equal(posts.length, 9)
  assert.ok(posts.every((p) => p.kind === 'video'))
  assert.ok(posts.every((p) => p.isCarousel === false))
  assert.ok(posts.every((p) => p.slideCount === 1))
  assert.ok(posts.every((p) => p.slides[0].isVideo === true))
  assert.ok(posts.every((p) => p.slides[0].url.startsWith('https://')))
  assert.ok(posts.every((p) => p.cover.startsWith('https://')))
  assert.ok(posts.every((p) => typeof p.playCount === 'number' && p.playCount > 0))
  assert.ok(posts.every((p) => typeof p.likes === 'number'))
  assert.ok(posts.every((p) => /^\d{4}-\d{2}-\d{2}/.test(p.date)))
  assert.ok(posts.every((p) => p.author.length > 0))
})

// 인스타가 '재생 수'를 '조회 수'로 바꾸면서 액터도 videoPlayCount 를 비우고
// videoViewCount 에 담아 보내는 일이 있다. 이 저장소에 남은 실제 응답에서도
// videoPlayCount 가 있는 항목 17건이 전부 null 이고, 같은 항목의 videoViewCount 에
// 진짜 숫자가 들어 있었다(예: null / 153352).
const oneReel = (o) => [{
  shortCode: 'C_x', url: 'https://www.instagram.com/reel/C_x/',
  ownerUsername: 'someone', displayUrl: 'https://cdn.test/c.jpg',
  videoUrl: 'https://cdn.test/v.mp4', likesCount: 1, commentsCount: 2,
  timestamp: '2026-08-18T00:00:00.000Z', ...o,
}]

test('조회수는 videoPlayCount 가 비면 videoViewCount 로 읽는다', () => {
  for (const src of ['reelPopular', 'reelAccount']) {
    const [p] = normalize(src, oneReel({ videoPlayCount: null, videoViewCount: 153352 }))
    assert.equal(p.playCount, 153352, src)
  }
})

test('조회수는 videoPlayCount 가 있으면 그것을 먼저 쓴다', () => {
  const [p] = normalize('reelPopular', oneReel({ videoPlayCount: 10, videoViewCount: 99 }))
  assert.equal(p.playCount, 10)
})

test('조회수가 글자로 와도 숫자로 읽는다', () => {
  const [p] = normalize('reelPopular', oneReel({ videoViewCount: '1201' }))
  assert.equal(p.playCount, 1201)
})

test('두 필드가 다 비면 0 이 아니라 모름(-1) 이다 — 0 회로 보이면 안 된다', () => {
  for (const o of [{}, { videoPlayCount: null, videoViewCount: null }]) {
    const [p] = normalize('reelPopular', oneReel(o))
    assert.equal(p.playCount, -1, JSON.stringify(o))
  }
})

test('릴스 계정 소스: 실제 데이터를 릴스 카드로 정규화한다', () => {
  const posts = normalize('reelAccount', load('reel-account'))
  assert.equal(posts.length, 3)
  assert.ok(posts.every((p) => p.kind === 'video'))
  assert.ok(posts.every((p) => p.isCarousel === false))
  assert.ok(posts.every((p) => p.slideCount === 1))
  assert.ok(posts.every((p) => p.slides[0].isVideo === true))
  assert.ok(posts.every((p) => p.slides[0].url.startsWith('https://')))
  assert.ok(posts.every((p) => p.cover.startsWith('https://')))
  assert.ok(posts.every((p) => typeof p.playCount === 'number' && p.playCount > 0))
  assert.ok(posts.every((p) => typeof p.likes === 'number'))
  assert.ok(posts.every((p) => typeof p.comments === 'number'))
  assert.ok(posts.every((p) => /^\d{4}-\d{2}-\d{2}/.test(p.date)))
  assert.ok(posts.every((p) => p.author === 'natgeo'), '입력 계정이 natgeo 이므로 모든 결과의 author 도 natgeo 여야 한다')
})

test('릴스 계정 소스: buildInput 은 계정 배열과 건수를 그대로 넘긴다', () => {
  const input = SOURCES.reelAccount.buildInput({ username: 'natgeo', count: 10 })
  assert.deepEqual(input.username, ['natgeo'])
  assert.equal(input.resultsLimit, 10)
})

test('릴스 인기 소스: buildInput 은 검색어와 popular 종류를 넘긴다', () => {
  const input = SOURCES.reelPopular.buildInput({ tag: '먹방', count: 3 })
  assert.equal(input.search, '먹방')
  assert.equal(input.searchType, 'popular')
  assert.equal(input.searchLimit, 3)
})

test('estimateCostReelKeyword: B만 성공 시와 A까지 갈 때의 범위를 준다', () => {
  const { min, max } = estimateCostReelKeyword(50)
  assert.ok(Math.abs(min - estimateCost('reelPopular', 50)) < 1e-9)
  assert.ok(Math.abs(max - (estimateCost('reelPopular', 50) + estimateCost('keyword', 50))) < 1e-9)
  assert.ok(min < max)
})
