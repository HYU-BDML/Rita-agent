import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pick, cardToPost, listPicks, coverIsVideo, coverTag, badgeOf, confirmLabels } from '../lib/board.js'

const card = (o = {}) => ({
  id: 'C_abc', url: 'https://www.instagram.com/p/C_abc/', author: 'someone',
  caption: '본문', postedAt: '2026-08-01', likes: 1234, comments: 56, likesHidden: false,
  slideCount: 2, slideTotal: 2, tag: 't', pickedAt: 'now',
  slides: ['/f/C_abc/01.jpg', '/f/C_abc/02.jpg'], ...o,
})

const post = (n, o = {}) => ({
  id: 'C_abc', url: 'https://www.instagram.com/p/C_abc/', author: 'someone', caption: '본문',
  date: '2026-08-01', likes: 1234, comments: 56, likesHidden: false, tag: 't',
  slides: Array.from({ length: n }, (_, i) => ({ url: `https://cdn.test/${i + 1}.jpg` })),
  ...o,
})

// globalThis.fetch 를 가로채 무엇을 어떤 순서로 불렀는지 본다
function spyFetch(reply) {
  const calls = []
  globalThis.fetch = async (path, opts = {}) => {
    calls.push({ path, method: opts.method || 'GET', body: opts.body })
    return reply(path, opts, calls.length)
  }
  return calls
}

const ok = (obj = { ok: true }) => ({ ok: true, status: 200, json: async () => obj })
const bad = (status) => ({ ok: false, status, json: async () => ({ ok: false }) })

test('표에서 온 카드가 뷰어가 아는 모양이 된다', () => {
  const p = cardToPost(card())
  assert.equal(p.id, 'C_abc')
  assert.equal(p.isCarousel, true)
  assert.equal(p.slideCount, 2)
  assert.deepEqual(p.slides.map((s) => s.url), ['/f/C_abc/01.jpg', '/f/C_abc/02.jpg'])
})

test('담아둔 카드도 영상 자리를 알아본다 — 확장자가 그 기록이다', () => {
  const p = cardToPost(card({ slides: ['/f/C_abc/01.jpg', '/f/C_abc/02.mp4'] }))
  assert.equal(p.slides[0].isVideo, false)
  assert.equal(p.slides[1].isVideo, true)
})

test('좋아요 비공개는 0 으로 보이되 비공개 표시가 남는다', () => {
  const p = cardToPost(card({ likes: -1, likesHidden: true }))
  assert.equal(p.likes, 0)
  assert.equal(p.likesHidden, true)
})

test('슬라이드를 한 장씩 올리고 마지막에 표에 넣는다', async () => {
  const calls = spyFetch(() => ok())
  const out = await pick(post(3))
  assert.deepEqual(out, { saved: 3, total: 3 })
  assert.deepEqual(calls.map((c) => c.method), ['PUT', 'PUT', 'PUT', 'POST'])
  assert.match(calls[0].path, /\/api\/slide\/C_abc\/1\?u=/)
  assert.match(calls[2].path, /\/api\/slide\/C_abc\/3\?u=/)
  assert.equal(calls[3].path, '/api/picks')
})

test('실패한 장의 번호를 다음 장이 쓴다 — 창고에 구멍이 나면 안 된다', async () => {
  const calls = spyFetch((path, opts, nth) => (nth === 2 ? bad(502) : ok()))
  const out = await pick(post(3))
  assert.deepEqual(out, { saved: 2, total: 3 })
  const nums = calls.filter((c) => c.method === 'PUT').map((c) => c.path.match(/\/(\d+)\?u=/)[1])
  assert.deepEqual(nums, ['1', '2', '2'])
  assert.deepEqual(JSON.parse(calls.at(-1).body).slideCount, 2)
  assert.deepEqual(JSON.parse(calls.at(-1).body).slideTotal, 3)
})

test('한 장도 못 받으면 표에 넣지 않는다', async () => {
  const calls = spyFetch(() => bad(502))
  await assert.rejects(() => pick(post(2)), /한 장도/)
  assert.equal(calls.some((c) => c.method === 'POST'), false)
})

test('진행 상황을 알려준다', async () => {
  spyFetch(() => ok())
  const seen = []
  await pick(post(2), (done, total) => seen.push(`${done}/${total}`))
  assert.deepEqual(seen, ['1/2', '2/2'])
})

test('좋아요 비공개는 -1 로 보낸다', async () => {
  const calls = spyFetch(() => ok())
  await pick({ ...post(1), likesHidden: true, likes: 0 })
  assert.equal(JSON.parse(calls.at(-1).body).likes, -1)
})

test('인스타가 12장이라 했는데 10장만 왔을 때 slideTotal 이 12로 나간다', async () => {
  const calls = spyFetch(() => ok())
  const p = { ...post(10), slideCount: 12 }
  const out = await pick(p)
  assert.deepEqual(out, { saved: 10, total: 10 })
  const body = JSON.parse(calls.at(-1).body)
  assert.equal(body.slideCount, 10)
  assert.equal(body.slideTotal, 12)
})

test('401 이 오면 암호가 필요하다고 알린다', async () => {
  spyFetch(() => bad(401))
  await assert.rejects(() => listPicks(), (e) => e.needPassword === true)
})

// 창고에 든 슬라이드는 그림일 수도 영상일 수도 있다(주소 끝이 .jpg / .mp4).
// 목록 표지를 <img> 로만 그리면 첫 장이 영상인 게시물은 표지가 통째로 빈칸이 된다.
// 실제로 그랬다 — 검색 탭과 뷰어 썸네일은 이미 각자 피해 갔는데 목록만 안 피했다.
test('표지가 영상인지 주소로 가린다', () => {
  assert.equal(coverIsVideo('/f/C_abc/01.mp4'), true)
  assert.equal(coverIsVideo('/f/C_abc/01.jpg'), false)
  assert.equal(coverIsVideo(''), false)
  assert.equal(coverIsVideo(undefined), false)
})

test('표지 태그는 영상이면 video, 그림이면 img 로 낸다', () => {
  const vid = coverTag('/f/C_abc/01.mp4')
  assert.match(vid, /^<video /)
  assert.match(vid, /muted/)            // 목록에서 소리가 나면 안 된다
  assert.match(vid, /preload="metadata"/) // 첫 프레임만 받아 표지로 쓴다
  assert.equal(/<img /.test(vid), false)

  const img = coverTag('/f/C_abc/01.jpg')
  assert.match(img, /^<img /)
  assert.match(img, /loading="lazy"/)
})

test('표지 주소에 든 따옴표를 그대로 흘리지 않는다', () => {
  // 주소는 서버가 만들지만, 태그를 만드는 자리는 언제나 막아둔다
  assert.equal(coverTag('/f/x/01.jpg" onerror="alert(1)').includes('onerror="alert(1)"'), false)
})

test('담기 요청에 콘텐츠 종류·조회수를 싣는다', async () => {
  const calls = spyFetch(() => ok())
  await pick(post(1, { contentType: 'reel', playCount: 5000 }))
  const saveBody = JSON.parse(calls.at(-1).body)
  assert.equal(saveBody.contentType, 'reel')
  assert.equal(saveBody.playCount, 5000)
})

test('콘텐츠 종류가 없으면 카드뉴스로 보낸다', async () => {
  const calls = spyFetch(() => ok())
  await pick(post(1))
  const saveBody = JSON.parse(calls.at(-1).body)
  assert.equal(saveBody.contentType, 'cardnews')
  assert.equal(saveBody.playCount, -1)
})

test('릴스 카드는 뷰어에 캐러셀이 아닌 영상으로 넘어간다', () => {
  const p = cardToPost(card({ contentType: 'reel', slideCount: 1, slides: ['/f/C_abc/01.mp4'] }))
  assert.equal(p.isCarousel, false)
  assert.equal(p.kind, 'video')
})

test('카드뉴스 카드는 지금처럼 캐러셀로 넘어간다', () => {
  const p = cardToPost(card({ contentType: 'cardnews' }))
  assert.equal(p.isCarousel, true)
  assert.equal(p.kind, 'carousel')
})

test('분석하기는 PUT ~confirm 을 부른다', async () => {
  const calls = spyFetch(() => ok())
  await confirmLabels('C_abc')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].method, 'PUT')
  assert.equal(calls[0].path, '/api/labels/~confirm/C_abc')
})

test('분석중이면 서버 이유를 그대로 담아 던진다', async () => {
  spyFetch(() => ({ ok: false, status: 409, json: async () => ({ ok: false, why: '분석이 도는 중입니다. 끝난 뒤에 고쳐주세요' }) }))
  await assert.rejects(() => confirmLabels('C_abc'), /분석이 도는 중입니다/)
})

test('분석하기도 401 이면 암호가 필요하다고 알린다', async () => {
  spyFetch(() => bad(401))
  await assert.rejects(() => confirmLabels('C_abc'), (e) => e.needPassword === true)
})

// '라벨 N/M장' 은 장수가 매번 달라 값 비교가 아니라 모양으로 잡아야 한다.
test('상태마다 뱃지 색이 다르다', () => {
  assert.equal(badgeOf('안 함').tone, 'off')
  assert.equal(badgeOf('라벨 3/7장').tone, 'busy')
  assert.equal(badgeOf('분석 대기').tone, 'ready')
  assert.equal(badgeOf('분석중').tone, 'busy')
  assert.equal(badgeOf('분석 끝').tone, 'done')
  assert.equal(badgeOf('분석 실패').tone, 'bad')
})
