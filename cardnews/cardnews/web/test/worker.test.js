import { test } from 'node:test'
import assert from 'node:assert/strict'
import worker, { checkTarget, handleImage, altHost } from '../_worker.js'
import { imgSrc, setProxyAvailable, detectProxy, proxyReady, altHostOf, rawOf } from '../lib/img.js'
import { tokenOf, COOKIE } from '../server/auth.js'
import { 출입증만들기, 머리이름 } from '../server/출입증.js'

// **돈 나가는 문은 「사람인지 확인」을 지나야 열린다**(사람 결정 2026-09-22).
// 시험은 그 문 «안쪽» 을 보는 것이라 출입증을 들고 두드린다 — 자물쇠 자체는
// `출입증.test.js` 가 따로 본다.
const 시험표비밀 = '시험용표비밀'
const 시험출입증 = await 출입증만들기(시험표비밀, Date.now(), 24 * 3600)

test('인스타 CDN 주소는 통과한다', () => {
  for (const u of [
    'https://scontent-gru1-2.cdninstagram.com/v/t51.jpg?oe=1',
    'https://instagram.fosu2-1.fna.fbcdn.net/v/x.heic',
    'https://scontent.cdninstagram.com/a.jpg',
  ]) {
    assert.equal(checkTarget(u).ok, true, u)
  }
})

test('남의 주소는 막는다 — 공개 중계기가 되면 안 된다', () => {
  for (const u of [
    'https://evil.example.com/x.jpg',
    'https://cdninstagram.com.evil.com/x.jpg',
    'http://scontent.cdninstagram.com/a.jpg', // https 아님
    'file:///etc/passwd',
  ]) {
    const r = checkTarget(u)
    assert.equal(r.ok, false, u)
    assert.equal(r.status, 403)
  }
})

test('주소가 없거나 이상하면 400', () => {
  assert.equal(checkTarget('').status, 400)
  assert.equal(checkTarget(null).status, 400)
  assert.equal(checkTarget('그냥 글자').status, 400)
})

test('ping 은 ok 를 준다 — 앱이 중계 유무를 이걸로 판단한다', async () => {
  const res = await handleImage(new URL('https://x/img?ping=1'))
  assert.equal(res.status, 200)
  assert.equal((await res.text()).trim(), 'ok')
})

test('막힌 주소는 본문에 이유가 담긴다', async () => {
  const res = await handleImage(new URL('https://x/img?u=https%3A%2F%2Fevil.example.com%2Fa.jpg'))
  assert.equal(res.status, 403)
  assert.match(await res.text(), /인스타/)
})

// --- 영상 탐색(seek) — 중계기가 Range 를 그대로 흘려보내야 한다 -------------
//
// 브라우저는 <video> 탐색바를 부분 요청으로 움직인다. 중계기가 Range 를 무시하고
// 늘 전체를 200 으로 주면 탐색이 원천적으로 막히고, 첫 프레임도 파일이 한참
// 흘러온 뒤에야 뜬다. 실제로 릴스가 그랬다.

const IG_MP4 = 'https://scontent.cdninstagram.com/v/reel.mp4'
const imgUrl = (u) => new URL('https://x/img?u=' + encodeURIComponent(u))

// 인스타로 실제로 뭘 보내는지 보려면 fetch 를 가로채야 한다
async function withFetch(reply, run) {
  const real = globalThis.fetch
  const calls = []
  globalThis.fetch = async (u, init) => { calls.push({ url: String(u), init }); return reply(String(u), init) }
  try {
    await run(calls)
  } finally {
    globalThis.fetch = real
  }
}

test('Range 를 인스타로 그대로 넘기고 206 을 되돌려준다', async () => {
  await withFetch(
    () => new Response('조각', {
      status: 206,
      headers: { 'content-type': 'video/mp4', 'content-range': 'bytes 100-199/5000' },
    }),
    async (calls) => {
      const req = new Request('https://x/img', { headers: { range: 'bytes=100-199' } })
      const res = await handleImage(imgUrl(IG_MP4), req)
      assert.equal(calls[0].init.headers.range, 'bytes=100-199')
      assert.equal(res.status, 206)
      assert.equal(res.headers.get('content-range'), 'bytes 100-199/5000')
      assert.equal(res.headers.get('accept-ranges'), 'bytes')
      assert.equal(res.headers.get('content-type'), 'video/mp4')
    }
  )
})

test('부분 응답은 캐시에 안 태운다 — 조각이 전체로 캐시되면 잘린 영상을 받는다', async () => {
  await withFetch(
    () => new Response('조각', { status: 206, headers: { 'content-range': 'bytes 0-9/5000' } }),
    async (calls) => {
      const req = new Request('https://x/img', { headers: { range: 'bytes=0-9' } })
      const res = await handleImage(imgUrl(IG_MP4), req)
      assert.equal(calls[0].init.cf, undefined)
      assert.equal(res.headers.get('cache-control'), 'no-store')
    }
  )
})

test('Range 가 없으면 지금처럼 통째로 캐시하되, 탐색이 된다고 알린다', async () => {
  await withFetch(
    () => new Response('전체', { status: 200, headers: { 'content-type': 'video/mp4' } }),
    async (calls) => {
      const res = await handleImage(imgUrl(IG_MP4))
      assert.equal(calls[0].init.cf.cacheEverything, true)
      assert.equal(calls[0].init.headers.range, undefined)
      assert.equal(res.status, 200)
      assert.equal(res.headers.get('accept-ranges'), 'bytes')
      assert.match(res.headers.get('cache-control'), /max-age/)
    }
  )
})

test('/img 통로가 요청을 그대로 넘겨준다 — 안 넘기면 헤더가 사라져 탐색이 죽는다', async () => {
  await withFetch(
    () => new Response('조각', { status: 206, headers: { 'content-range': 'bytes 0-9/5000' } }),
    async (calls) => {
      const req = new Request('https://x/img?u=' + encodeURIComponent(IG_MP4), {
        headers: { range: 'bytes=0-9' },
      })
      const res = await worker.fetch(req, {})
      assert.equal(calls[0].init.headers.range, 'bytes=0-9')
      assert.equal(res.status, 206)
    }
  )
})

test('/img 가 아니면 정적 파일로 넘긴다', async () => {
  let asked = null
  const env = { ASSETS: { fetch: (req) => { asked = req.url; return new Response('page') } } }
  const res = await worker.fetch(new Request('https://x/index.html'), env)
  assert.equal(await res.text(), 'page')
  assert.match(asked, /index\.html$/)
})

test('/manual 은 창고의 사용설명서로 보낸다 — 파일만 바꿔 끼우면 주소는 그대로다', async () => {
  const env = { ASSETS: { fetch: () => { throw new Error('정적 파일로 가면 안 된다') } } }
  for (const 길 of ['/manual', '/manual/']) {
    const res = await worker.fetch(new Request(`https://x${길}`), env)
    assert.equal(res.status, 302)
    assert.equal(res.headers.get('location'),
      'https://cardnews-render-554608989606.s3.ap-northeast-2.amazonaws.com/manual/cardnews-guide.pdf')
  }
})

test('imgSrc 는 중계가 없으면 원래 주소를 그대로 쓴다', () => {
  setProxyAvailable(false)
  const u = 'https://scontent.cdninstagram.com/a.jpg?x=1&y=2'
  assert.equal(imgSrc(u), u)
})

test('imgSrc 는 중계가 있으면 우리 주소로 감싼다', () => {
  setProxyAvailable(true)
  const u = 'https://scontent.cdninstagram.com/a.jpg?x=1&y=2'
  const got = imgSrc(u)
  assert.ok(got.startsWith('/img?u='))
  // 원래 주소가 물음표·앰퍼샌드째로 살아 있어야 한다
  assert.equal(new URL(got, 'https://site').searchParams.get('u'), u)
  setProxyAvailable(false)
})

test('imgSrc 는 빈 주소에 터지지 않는다', () => {
  setProxyAvailable(true)
  assert.equal(imgSrc(''), '')
  assert.equal(imgSrc(null), '')
  assert.equal(imgSrc(undefined), '')
  setProxyAvailable(false)
})

test('detectProxy 는 ping 응답으로 판단한다', async () => {
  assert.equal(await detectProxy(async () => new Response('ok')), true)
  assert.equal(proxyReady(), true)
  assert.equal(await detectProxy(async () => new Response('없는 파일입니다', { status: 404 })), false)
  assert.equal(await detectProxy(async () => { throw new Error('네트워크') }), false)
  assert.equal(proxyReady(), false)
})

test('altHost 는 사라진 엣지를 살아 있는 호스트로 바꾼다', () => {
  // 서명은 경로에 걸려 있어서 호스트만 갈아끼워도 같은 이미지가 온다
  const dead = 'https://instagram.fosu2-1.fna.fbcdn.net/v/t51.jpg?oh=abc&oe=123'
  assert.equal(altHost(dead), 'https://scontent.cdninstagram.com/v/t51.jpg?oh=abc&oe=123')
})

test('altHost 는 이미 그 호스트면 되풀이하지 않는다', () => {
  assert.equal(altHost('https://scontent.cdninstagram.com/v/t51.jpg'), null)
})

test('altHost 는 이상한 주소에 터지지 않는다', () => {
  assert.equal(altHost('그냥 글자'), null)
  assert.equal(altHost(''), null)
})

test('altHostOf 는 중계 주소에서도 원래 주소를 꺼내 호스트를 바꾼다', () => {
  const raw = 'https://instagram.fosu2-1.fna.fbcdn.net/v/a.jpg?oe=1'
  const proxied = '/img?u=' + encodeURIComponent(raw)
  assert.equal(rawOf(proxied), raw)
  assert.equal(altHostOf(proxied), 'https://scontent.cdninstagram.com/v/a.jpg?oe=1')
  assert.equal(altHostOf(raw), 'https://scontent.cdninstagram.com/v/a.jpg?oe=1')
})

test('altHostOf 는 같은 호스트면 빈 값을 준다', () => {
  assert.equal(altHostOf('https://scontent.cdninstagram.com/v/a.jpg'), '')
  assert.equal(altHostOf(''), '')
})

// ── 공동 목록 통로 ──────────────────────────────────────────
const PW = '12345678'

// 가짜 표와 가짜 창고. 진짜 D1·R2 를 부르지 않고 라우팅만 본다.
function fakeEnv() {
  const rows = []
  const shots = new Map()
  const db = {
    prepare(sql) {
      const q = { sql, args: [] }
      q.bind = (...a) => { q.args = a; return q }
      q.all = async () => ({ results: rows.slice() })
      q.run = async () => {
        if (/^\s*DELETE/i.test(sql)) {
          const i = rows.findIndex((r) => r.id === q.args[0])
          if (i >= 0) rows.splice(i, 1)
        } else {
          rows.push({
            id: q.args[0], url: q.args[1], author: q.args[2], caption: q.args[3],
            posted_at: q.args[4], likes: q.args[5], comments: q.args[6],
            slide_count: q.args[7], slide_total: q.args[8], tag: q.args[9], picked_at: q.args[10],
            content_type: q.args[12], play_count: q.args[13],
          })
        }
        return {}
      }
      return q
    },
  }
  const bucket = {
    async put(k, v) { shots.set(k, v) },
    // 진짜 R2 는 Range 헤더를 직접 알아듣고, 잘라준 자리를 obj.range 로 알려준다.
    async get(k, opts = {}) {
      if (!shots.has(k)) return null
      const bytes = shots.get(k)
      const asked = opts.range && typeof opts.range.get === 'function' ? opts.range.get('range') : ''
      const m = /^bytes=(\d+)-(\d*)$/.exec(asked || '')
      // 진짜 R2ObjectBody 는 arrayBuffer() 도 준다.
      if (!m) return { body: bytes, size: bytes.length, arrayBuffer: async () => bytes.buffer }
      const offset = Number(m[1])
      const end = m[2] ? Number(m[2]) : bytes.length - 1
      const length = end - offset + 1
      return { body: bytes.slice(offset, end + 1), size: bytes.length, range: { offset, length } }
    },
    async list({ prefix }) {
      return { objects: [...shots.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }
    },
    async delete(keys) { for (const k of keys) shots.delete(k) },
  }
  return { env: { DB: db, SHOTS: bucket, BOARD_PASSWORD: PW, TURNSTILE_SECRET: 시험표비밀,
    ASSETS: { fetch: async () => new Response('정적') } }, rows, shots }
}

const call = (path, opts = {}) =>
  new Request(`https://x.test${path}`, {
    ...opts,
    headers: { ...(opts.headers || {}), [머리이름]: 시험출입증 },
  })

async function withPass(path, opts = {}) {
  const t = await tokenOf(PW)
  return call(path, { ...opts, headers: { ...(opts.headers || {}), cookie: `${COOKIE}=${t}` } })
}

// 2026-09-16 사람 결정: 공동 목록 암호를 없앤다. 리타에 넣을 열린 URL 이라
// 암호도 로그인도 못 붙인다 — 문은 그냥 열려 있다.
test('출입증이 없어도 목록을 준다 — 암호 관문은 없다', async () => {
  const { env } = fakeEnv()
  const res = await worker.fetch(call('/api/picks'), env)
  assert.equal(res.status, 200)
})

test('암호가 맞으면 출입증을 준다', async () => {
  const { env } = fakeEnv()
  const res = await worker.fetch(
    call('/api/login', { method: 'POST', body: JSON.stringify({ password: PW }) }), env)
  assert.equal(res.status, 200)
  assert.match(res.headers.get('set-cookie') || '', new RegExp(`^${COOKIE}=[0-9a-f]{64};`))
})

test('암호가 틀리면 출입증을 안 준다', async () => {
  const { env } = fakeEnv()
  const res = await worker.fetch(
    call('/api/login', { method: 'POST', body: JSON.stringify({ password: '00000000' }) }), env)
  assert.equal(res.status, 401)
  assert.equal(res.headers.get('set-cookie'), null)
})

test('담고 나면 목록에 나온다', async () => {
  const { env } = fakeEnv()
  const body = JSON.stringify({
    id: 'C_abc', url: 'https://www.instagram.com/p/C_abc/', author: 'a', caption: 'b',
    postedAt: '2026-08-01', likes: 10, comments: 2, slideCount: 2, slideTotal: 3, tag: 't',
  })
  const saved = await worker.fetch(await withPass('/api/picks', { method: 'POST', body }), env)
  assert.equal(saved.status, 200)

  const listed = await worker.fetch(await withPass('/api/picks'), env)
  const cards = await listed.json()
  assert.equal(cards.length, 1)
  assert.equal(cards[0].id, 'C_abc')
  assert.equal(cards[0].slideTotal, 3)
  assert.deepEqual(cards[0].slides, ['/f/C_abc/01.jpg', '/f/C_abc/02.jpg'])
})

test('이상한 담기 요청은 400 이다', async () => {
  const { env } = fakeEnv()
  const body = JSON.stringify({ id: '../etc', slideCount: 1, slideTotal: 1 })
  const res = await worker.fetch(await withPass('/api/picks', { method: 'POST', body }), env)
  assert.equal(res.status, 400)
})

test('인스타 주소가 아니면 슬라이드를 안 받는다', async () => {
  const { env } = fakeEnv()
  const res = await worker.fetch(
    await withPass('/api/slide/C_abc/1?u=https%3A%2F%2Fevil.example.com%2Fx.jpg', { method: 'PUT' }), env)
  assert.equal(res.status, 403)
})

test('빼면 표와 창고가 함께 빈다', async () => {
  const { env, shots } = fakeEnv()
  const body = JSON.stringify({ id: 'C_abc', slideCount: 1, slideTotal: 1 })
  await worker.fetch(await withPass('/api/picks', { method: 'POST', body }), env)
  shots.set('C_abc/01.jpg', new Uint8Array([1]))

  const res = await worker.fetch(await withPass('/api/picks/C_abc', { method: 'DELETE' }), env)
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { ok: true, removed: 1 })
  assert.equal(shots.size, 0)

  const cards = await (await worker.fetch(await withPass('/api/picks'), env)).json()
  assert.equal(cards.length, 0)
})

test('창고에 없는 그림은 404 다', async () => {
  const { env } = fakeEnv()
  const res = await worker.fetch(await withPass('/f/C_abc/01.jpg'), env)
  assert.equal(res.status, 404)
})

// 공동 목록에 담아둔 릴스는 인스타가 아니라 우리 창고(/f/...)에서 나온다.
// 여기도 Range 를 받아야 영상 탐색이 된다 — /img 만 고치면 절반만 고친 것이다.
test('담아둔 영상은 Range 로 잘라 준다', async () => {
  const { env, shots } = fakeEnv()
  shots.set('C_abc/01.mp4', new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]))
  const res = await worker.fetch(await withPass('/f/C_abc/01.mp4', { headers: { range: 'bytes=2-5' } }), env)
  assert.equal(res.status, 206)
  assert.equal(res.headers.get('content-range'), 'bytes 2-5/10')
  assert.equal(res.headers.get('content-type'), 'video/mp4')
  assert.deepEqual([...new Uint8Array(await res.arrayBuffer())], [2, 3, 4, 5])
})

test('끝을 안 적은 Range 도 받는다 — 브라우저가 실제로 이렇게 묻는다', async () => {
  const { env, shots } = fakeEnv()
  shots.set('C_abc/01.mp4', new Uint8Array([0, 1, 2, 3]))
  const res = await worker.fetch(await withPass('/f/C_abc/01.mp4', { headers: { range: 'bytes=1-' } }), env)
  assert.equal(res.status, 206)
  assert.equal(res.headers.get('content-range'), 'bytes 1-3/4')
})

test('Range 없이 물으면 통째로 주되, 탐색이 된다고 알린다', async () => {
  const { env, shots } = fakeEnv()
  shots.set('C_abc/01.mp4', new Uint8Array([0, 1, 2]))
  const res = await worker.fetch(await withPass('/f/C_abc/01.mp4'), env)
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('accept-ranges'), 'bytes')
  assert.equal(res.headers.get('content-range'), null)
})

test('창고 밖으로 나가는 경로는 404 다', async () => {
  const { env } = fakeEnv()
  const res = await worker.fetch(await withPass('/f/C_abc/1.jpg'), env)
  assert.equal(res.status, 404)
})

test('그림은 공용 캐시에 남지 않는다 — 출입증 뒤에 있는 사적인 그림이다', async () => {
  const { env, shots } = fakeEnv()
  shots.set('C_abc/01.jpg', new Uint8Array([1]))
  const res = await worker.fetch(await withPass('/f/C_abc/01.jpg'), env)
  assert.equal(res.status, 200)
  assert.match(res.headers.get('cache-control') || '', /^private/)
})

test('경로 꼬리가 붙으면 404 다', async () => {
  const { env, shots } = fakeEnv()
  shots.set('C_abc/01.jpg', new Uint8Array([1]))
  const res = await worker.fetch(await withPass('/f/C_abc/01.jpg/아무거나'), env)
  assert.equal(res.status, 404)
})

test('DELETE 로는 그림을 못 받는다', async () => {
  const { env, shots } = fakeEnv()
  shots.set('C_abc/01.jpg', new Uint8Array([1]))
  const res = await worker.fetch(await withPass('/f/C_abc/01.jpg', { method: 'DELETE' }), env)
  assert.equal(res.status, 405)
})

test('공동 목록과 상관없는 주소는 정적 파일로 간다', async () => {
  const { env } = fakeEnv()
  const res = await worker.fetch(call('/index.html'), env)
  assert.equal(await res.text(), '정적')
})

test('type 쿼리로 콘텐츠 종류를 거른다', async () => {
  const { env } = fakeEnv()
  const cardnewsBody = JSON.stringify({
    id: 'C_cn', url: 'https://www.instagram.com/p/C_cn/', slideCount: 1, slideTotal: 1,
  })
  const reelBody = JSON.stringify({
    id: 'C_reel', url: 'https://www.instagram.com/p/C_reel/', slideCount: 1, slideTotal: 1,
    contentType: 'reel', playCount: 500,
  })
  await worker.fetch(await withPass('/api/picks', { method: 'POST', body: cardnewsBody }), env)
  await worker.fetch(await withPass('/api/picks', { method: 'POST', body: reelBody }), env)

  const reels = await (await worker.fetch(await withPass('/api/picks?type=reel'), env)).json()
  assert.deepEqual(reels.map((c) => c.id), ['C_reel'])
  assert.equal(reels[0].playCount, 500)

  const cardnews = await (await worker.fetch(await withPass('/api/picks?type=cardnews'), env)).json()
  assert.deepEqual(cardnews.map((c) => c.id), ['C_cn'])

  const all = await (await worker.fetch(await withPass('/api/picks'), env)).json()
  assert.equal(all.length, 2)
})

test('릴스가 100건이면 새로 담기를 막는다', async () => {
  const { env, rows } = fakeEnv()
  for (let i = 0; i < 100; i += 1) {
    rows.push({
      id: `R_${i}`, content_type: 'reel', slide_count: 1, slide_total: 1,
      picked_at: 'now', likes: 0, comments: 0,
    })
  }
  const body = JSON.stringify({
    id: 'R_new', url: 'https://www.instagram.com/reel/R_new/', slideCount: 1, slideTotal: 1,
    contentType: 'reel',
  })
  const res = await worker.fetch(await withPass('/api/picks', { method: 'POST', body }), env)
  assert.equal(res.status, 400)
  assert.match((await res.json()).why, /100건/)
})

test('이미 담긴 릴스를 다시 담는 건 캡에 안 걸린다', async () => {
  const { env, rows } = fakeEnv()
  for (let i = 0; i < 100; i += 1) {
    rows.push({
      id: `R_${i}`, content_type: 'reel', slide_count: 1, slide_total: 1,
      picked_at: 'now', likes: 0, comments: 0,
    })
  }
  const body = JSON.stringify({
    id: 'R_0', url: 'https://www.instagram.com/reel/R_0/', slideCount: 1, slideTotal: 1,
    contentType: 'reel',
  })
  const res = await worker.fetch(await withPass('/api/picks', { method: 'POST', body }), env)
  assert.equal(res.status, 200)
})

test('카드뉴스는 100건을 넘겨도 안 막힌다', async () => {
  const { env, rows } = fakeEnv()
  for (let i = 0; i < 150; i += 1) {
    rows.push({
      id: `C_${i}`, content_type: 'cardnews', slide_count: 1, slide_total: 1,
      picked_at: 'now', likes: 0, comments: 0,
    })
  }
  const body = JSON.stringify({
    id: 'C_new', url: 'https://www.instagram.com/p/C_new/', slideCount: 1, slideTotal: 1,
  })
  const res = await worker.fetch(await withPass('/api/picks', { method: 'POST', body }), env)
  assert.equal(res.status, 200)
})

// ── 채팅 페이지 창구 ──────────────────────────────────────────
import { fakeDb as fakeChatDb } from './fixtures/fake-db.js'

const 딥시크답 = (obj) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(obj) } }] }))

// 바깥 부름을 주소별로 가짜로 답한다. 창고 목록·딥시크·Lambda.
function withOutside(routes, fn) {
  const real = globalThis.fetch
  const calls = []
  globalThis.fetch = async (u, init) => {
    const url = String(u)
    calls.push({ url, init })
    for (const [머리, 답] of Object.entries(routes)) if (url.startsWith(머리)) return 답(url, init)
    return new Response('없음', { status: 404 })
  }
  return fn(calls).finally(() => { globalThis.fetch = real })
}

const 바깥 = (딥시크) => ({
  'https://cardnews-render-554608989606.s3.ap-northeast-2.amazonaws.com/templates/': () =>
    new Response(JSON.stringify([{ 코드: 'AAA', 이름: '파란 타임라인' }])),
  'https://cardnews-render-554608989606.s3.ap-northeast-2.amazonaws.com/%EB%A7%90%ED%88%AC/': () =>
    new Response(JSON.stringify([])),
  'https://api.deepseek.com/': () => 딥시크답(딥시크),
  'https://l26m3zzcjd.execute-api.ap-northeast-2.amazonaws.com/ingest': () =>
    new Response(JSON.stringify({ job_id: 'j1', status: 'queued' }), { status: 202 }),
  'https://l26m3zzcjd.execute-api.ap-northeast-2.amazonaws.com/make': () =>
    new Response(JSON.stringify({ job_id: 'j2', status: 'queued' }), { status: 202 }),
})

const chatEnv = () => ({ ...fakeEnv().env, DB: fakeChatDb(), DEEPSEEK_API_KEY: 'sk-x' })

test('/api/chat — 말이 비면 400', async () => {
  const res = await worker.fetch(call('/api/chat', { method: 'POST', body: '{"말":""}' }), chatEnv())
  assert.equal(res.status, 400)
})

test('/api/chat — 딥시크에 묻고 답을 돌려주며 대화 번호를 준다', () =>
  withOutside(바깥({ 할일: '대답', 말: '안녕하세요' }), async (calls) => {
    const env = chatEnv()
    const res = await worker.fetch(call('/api/chat', { method: 'POST', body: '{"말":"안녕"}' }), env)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.말, '안녕하세요')
    assert.match(body.대화, /^[0-9a-f]{32}$/)
    const 딥 = calls.find((c) => c.url.startsWith('https://api.deepseek.com/'))
    assert.equal(딥.init.headers.authorization, 'Bearer sk-x')
    assert.equal(env.DB.rows.size, 1)
  }))

test('/api/chat — 저장이면 Lambda /ingest 로 중계하고 일 번호를 준다', () =>
  withOutside(바깥({ 할일: '저장', url: 'https://www.instagram.com/p/DHqCBQnRAjW/', 담을까: '네', 말: '담을게요' }), async (calls) => {
    const res = await worker.fetch(call('/api/chat', { method: 'POST',
      body: '{"말":"https://www.instagram.com/p/DHqCBQnRAjW/"}' }), chatEnv())
    const body = await res.json()
    assert.deepEqual(body.일, { 번호: 'j1', 종류: '담김' })
    const 람다 = calls.find((c) => c.url.endsWith('/ingest'))
    // **언어를 같이 싣는다** — 담김이 끝났을 때 람다가 써 보내는 말이 그 언어로 온다.
    assert.deepEqual(JSON.parse(람다.init.body),
      { url: 'https://www.instagram.com/p/DHqCBQnRAjW/', 언어: '한국어' })
  }))

// **만들기는 이제 `/draft` 로 간다**(사람 결정 2026-09-19 「항상 거친다」).
// `/make` 로 새면 사람이 초안을 보기도 전에 사진 값이 나간다.
test('/api/chat — 만들기면 Lambda /draft 로 중계한다', () =>
  withOutside({ ...바깥({ 할일: '만들기', 틀: 'AAA', 주제: 'AI 소식', 말투: '', 말: '네' }),
    ...만들기창구() }, async (calls) => {
    const res = await worker.fetch(call('/api/chat', { method: 'POST', body: '{"말":"AI 소식"}' }), chatEnv())
    const body = await res.json()
    assert.deepEqual(body.일, { 번호: 'd1', 종류: '미리보기' })
    assert.equal(calls.filter((c) => c.url.endsWith('/make')).length, 0, '굽는 문으로 곧장 갔다')
    const 람다 = calls.find((c) => c.url.endsWith('/draft'))
    // 「언어」는 화면이 보낸 것을 그대로 실어 보낸다. 안 보내면 한국어다.
    // **사진·로고는 없다** — 구울 때 쓰는 값이라 화면이 들고 있다가 `/bake` 로 보낸다.
    assert.deepEqual(JSON.parse(람다.init.body),
      // **말투 칸이 없다**(2026-09-24) — 틀을 고르면 그 틀의 말투로 간다.
      { 주제: 'AI 소식', 틀: '파란 타임라인', 원고: '', 언어: '한국어',
        사진들: [] })
  }))

// ── 로고 올리기 (사람 지시 2026-09-19) ────────────────────────────
//
// 몸통을 안 뜯고 통째로 넘긴다 — multipart 는 머리말의 `boundary` 와 한 짝이다.

const 올림창구 = (답, 상태 = 200) => ({
  'https://l26m3zzcjd.execute-api.ap-northeast-2.amazonaws.com/upload': () =>
    new Response(JSON.stringify(답), { status: 상태 }),
})
const 로고주소 = 'https://cardnews-render-554608989606.s3.ap-northeast-2.amazonaws.com/photos/ab.png'

test('/api/upload — Lambda /upload 로 넘기고 로고 주소를 꺼내 준다', () =>
  withOutside(올림창구({ photo_urls: '', logo_url: 로고주소 }), async (calls) => {
    const res = await worker.fetch(call('/api/upload', { method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=zz' },
      body: '--zz\r\n--zz--' }), chatEnv())
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { ok: true, 주소: 로고주소, 사진들: [] })
    const 람다 = calls.find((c) => c.url.endsWith('/upload'))
    // **머리말이 그대로 가야 한다** — boundary 가 빠지면 저쪽이 못 읽는다.
    assert.equal(람다.init.headers['content-type'], 'multipart/form-data; boundary=zz')
  }))

test('/api/upload — 주소가 안 오면 실패로 알린다', () =>
  withOutside(올림창구({ photo_urls: '', logo_url: '' }), async () => {
    const res = await worker.fetch(call('/api/upload', { method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=zz' }, body: 'x' }), chatEnv())
    assert.equal(res.status, 502)
    assert.equal((await res.json()).ok, false)
  }))

test('/api/upload — 저쪽이 까닭을 주면 그 까닭을 그대로 보여 준다', () =>
  withOutside(올림창구({ ok: false, why: '그림이 아니다 — «a.txt»' }, 400), async () => {
    const res = await worker.fetch(call('/api/upload', { method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=zz' }, body: 'x' }), chatEnv())
    assert.equal(res.status, 400)
    assert.match((await res.json()).why, /a\.txt/)
  }))

test('/api/upload — 9MB 를 넘으면 Lambda 를 안 부르고 막는다', () =>
  withOutside(올림창구({ logo_url: 로고주소 }), async (calls) => {
    // 안 막으면 API Gateway 가 10MB 에서 끊는데, 그 답에는 까닭이 안 적혀 있다.
    // **사진은 안 줄인다**(사람 지시 2026-09-19: 「품질 중요해… 타협하지마」) —
    // 그래서 한 장씩 올리고, 그 한 장의 상한이 이것이다.
    const res = await worker.fetch(call('/api/upload', { method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=zz',
                 'content-length': String(10 * 1024 * 1024) },
      body: 'x' }), chatEnv())
    assert.equal(res.status, 413)
    assert.match((await res.json()).why, /9MB/)
    assert.equal(calls.filter((c) => c.url.endsWith('/upload')).length, 0,
      '막아 놓고 Lambda 를 불렀다')
  }))

test('/api/ingest — Lambda 로 그대로 중계한다', () =>
  withOutside(바깥({}), async (calls) => {
    const res = await worker.fetch(call('/api/ingest', { method: 'POST', body: '{"url":"https://www.instagram.com/p/A1/"}' }), chatEnv())
    assert.equal(res.status, 202)
    assert.equal((await res.json()).job_id, 'j1')
    assert.ok(calls.some((c) => c.url.endsWith('/ingest')))
  }))

test('/api/conversation/{id} — 없으면 404, 있으면 통째로', async () => {
  const env = chatEnv()
  const id = 'b'.repeat(32)
  assert.equal((await worker.fetch(call(`/api/conversation/${id}`), env)).status, 404)
  assert.equal((await worker.fetch(call('/api/conversation/짧다'), env)).status, 400)
  await env.DB.prepare('INSERT').bind(id, 't', 't', '{"틀":null}', '[{"역할":"봇","말":"응","때":"t"}]').run()
  const res = await worker.fetch(call(`/api/conversation/${id}`), env)
  assert.equal(res.status, 200)
  assert.deepEqual((await res.json()).messages, [{ 역할: '봇', 말: '응', 때: 't' }])
})

test('/api/conversation/{id} POST — 봇 말을 덧붙이고 상태를 합친다', async () => {
  const env = chatEnv()
  const id = 'c'.repeat(32)
  await env.DB.prepare('INSERT').bind(id, 't', 't', '{"지켜보기":{"코드":"X"}}', '[]').run()
  const res = await worker.fetch(call(`/api/conversation/${id}`, { method: 'POST',
    body: '{"말":"분석 끝났어요","상태":{"지켜보기":null}}' }), env)
  assert.equal(res.status, 200)
  const got = await (await worker.fetch(call(`/api/conversation/${id}`), env)).json()
  assert.equal(got.messages[0].말, '분석 끝났어요')
  assert.equal(got.state.지켜보기, null)
})

// ── 말 없이 상태만 저장하기 (사람 결정 2026-09-19: 미리보기에서 고치기) ──
//
// 대본 한 칸 고칠 때마다 말풍선을 남길 수는 없고, 안 남기면 새로고침에 고친
// 것이 날아간다. 그래서 «말 없이 상태만» 이 길이 하나 있다.

test('/api/conversation/{id} POST — 말이 없어도 상태만 저장한다', async () => {
  const env = chatEnv()
  const id = 'd'.repeat(32)
  await env.DB.prepare('INSERT').bind(id, 't', 't', '{"틀":null}', '[{"역할":"봇","말":"응","때":"t"}]').run()
  const res = await worker.fetch(call(`/api/conversation/${id}`, { method: 'POST',
    body: '{"상태":{"오른쪽":{"종류":"미리보기","밑그림":{"슬라이드":[{"blocks":["고친 글"]}]}}}}' }), env)
  assert.equal(res.status, 200)
  const got = await (await worker.fetch(call(`/api/conversation/${id}`), env)).json()
  assert.equal(got.state.오른쪽.밑그림.슬라이드[0].blocks[0], '고친 글')
  assert.deepEqual(got.messages, [{ 역할: '봇', 말: '응', 때: 't' }], '말풍선이 하나 늘었다')
  assert.equal(got.state.틀, null, '앞서 있던 상태가 날아갔다')
})

test('/api/conversation/{id} POST — 말도 상태도 비면 거절한다', async () => {
  const env = chatEnv()
  const id = 'e'.repeat(32)
  await env.DB.prepare('INSERT').bind(id, 't', 't', '{}', '[]').run()
  const res = await worker.fetch(call(`/api/conversation/${id}`, { method: 'POST', body: '{}' }), env)
  assert.equal(res.status, 400)
})

test('/api/conversation/{id} POST — 없는 대화에 상태만 보내면 404', async () => {
  const res = await worker.fetch(call(`/api/conversation/${'f'.repeat(32)}`, { method: 'POST',
    body: '{"상태":{"틀":null}}' }), chatEnv())
  assert.equal(res.status, 404)
})

// ── 굽기 전에 멈추는 두 문 (사람 결정 2026-09-19 「항상 거친다」) ──────
//
// 워커는 **아무것도 안 뜯는다** — 몸통을 그대로 흘린다. 여기서 칸을 고르면
// 고르는 자리가 둘이 되고(람다 쪽 `/draft`·`/bake` 가 이미 고른다), 언젠가
// 한쪽만 새 칸을 받게 된다.

const 만들기창구 = () => ({
  'https://l26m3zzcjd.execute-api.ap-northeast-2.amazonaws.com/draft': () =>
    new Response(JSON.stringify({ job_id: 'd1', status: 'queued' }), { status: 202 }),
  'https://l26m3zzcjd.execute-api.ap-northeast-2.amazonaws.com/bake': () =>
    new Response(JSON.stringify({ job_id: 'b1', status: 'queued' }), { status: 202 }),
})

test('/api/draft — Lambda /draft 로 몸통을 그대로 넘긴다', () =>
  withOutside(만들기창구(), async (calls) => {
    const 몸 = { 주제: 'AI 소식', 틀: '파란 타임라인', 언어: '영어' }
    const res = await worker.fetch(call('/api/draft', { method: 'POST', body: JSON.stringify(몸) }), fakeEnv().env)
    assert.equal(res.status, 202)
    assert.equal((await res.json()).job_id, 'd1')
    const 람다 = calls.find((c) => c.url.endsWith('/draft'))
    assert.deepEqual(JSON.parse(람다.init.body), 몸)
  }))

test('/api/bake — 사람이 고친 밑그림을 한 글자도 안 뜯고 넘긴다', () =>
  withOutside(만들기창구(), async (calls) => {
    const 몸 = { 밑그림: { 카드: [{ 역할: '표지', 글자영역: [{ 글: '사람이 고친 글' }] }], 장수: 1 },
      사진: '만듦', 로고: '' }
    const res = await worker.fetch(call('/api/bake', { method: 'POST', body: JSON.stringify(몸) }), fakeEnv().env)
    assert.equal(res.status, 202)
    assert.equal((await res.json()).job_id, 'b1')
    const 람다 = calls.find((c) => c.url.endsWith('/bake'))
    assert.deepEqual(JSON.parse(람다.init.body), 몸)
  }))

test('/api/draft 와 /api/bake 가 서로 안 잡힌다', () =>
  withOutside(만들기창구(), async (calls) => {
    await worker.fetch(call('/api/bake', { method: 'POST', body: '{"밑그림":{"카드":[1]}}' }), fakeEnv().env)
    assert.equal(calls.filter((c) => c.url.endsWith('/draft')).length, 0,
      'bake 가 draft 로 갔다 — 초안 없이 대본부터 다시 짓는다')
  }))

// ── 채팅창에 사진 올리기 (사람 결정 2026-09-19) ────────────────────
//
// 저쪽 문 하나가 로고 칸과 사진 칸을 따로 받아 따로 돌려준다. 화면이 어느
// 쪽으로 올렸느냐에 따라 **한쪽만 차서** 온다.

test('/api/upload — 사진으로 올리면 사진 주소를 꺼내 준다', () =>
  withOutside(올림창구({ photo_urls: `${로고주소}
${로고주소}`, logo_url: '' }), async () => {
    const res = await worker.fetch(call('/api/upload', { method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=zz' }, body: 'x' }), chatEnv())
    assert.equal(res.status, 200)
    const 난것 = await res.json()
    assert.deepEqual(난것.사진들, [로고주소, 로고주소])
    assert.equal(난것.주소, '', '로고를 안 올렸는데 로고 주소가 찼다')
  }))

test('/api/upload — 둘 다 비어 오면 실패로 본다', () =>
  withOutside(올림창구({ photo_urls: '', logo_url: '' }), async () => {
    const res = await worker.fetch(call('/api/upload', { method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=zz' }, body: 'x' }), chatEnv())
    assert.equal(res.status, 502)
    assert.equal((await res.json()).ok, false)
  }))

// ── 새 대화는 리셋이다 — 올린 것을 창고에서도 지운다 (사람 지시 2026-09-22) ──
//
// 「새 대화라는 게 리셋임 모든게 리셋(로고까지)」. 여태 한 번 올라간 그림을 지우는
// 길이 **아예 없었다** — 사람이 AWS 화면에서 손으로 지우는 수밖에 없었다.
//
// **주소를 브라우저에게서 안 받는다** — 대화 번호만 받고 서버가 그 대화에 적힌
// 목록을 읽는다. 그래서 여기서 보는 것은 «무엇을 지우라고 시켰나» 다.
import { saveConversation } from '../server/conversations.js'

const 창고사진 = 'https://cardnews-render-554608989606.s3.ap-northeast-2.amazonaws.com/photos/'
const 지우는문 = 'https://l26m3zzcjd.execute-api.ap-northeast-2.amazonaws.com/upload/delete'
const 대화번호 = 'a'.repeat(32)

const 대화깔기 = (env, state) =>
  saveConversation(env.DB, 대화번호, state, [], '2026-09-22T00:00:00Z')
const 상태읽기 = (env) => JSON.parse(env.DB.rows.get(대화번호).state)
const 지우기부르기 = (env) =>
  worker.fetch(call(`/api/conversation/${대화번호}/uploads`, { method: 'DELETE' }), env)

test('새 대화 — 사진과 로고를 같이 지우라고 시키고, 주소도 비운다', () =>
  withOutside({ [지우는문]: () => new Response(JSON.stringify({ ok: true, 지운수: 2 })) },
    async (calls) => {
      const env = chatEnv()
      await 대화깔기(env, { 사진들: [`${창고사진}${'1'.repeat(32)}.png`],
                        로고: `${창고사진}${'2'.repeat(32)}.png` })
      const res = await 지우기부르기(env)
      assert.equal(res.status, 200)
      assert.equal((await res.json()).지운수, 2)
      const 시킴 = JSON.parse(calls.find((c) => c.url === 지우는문).init.body)
      assert.equal(시킴.주소들.length, 2, '로고까지 같이 가야 한다')
      const 남은 = 상태읽기(env)
      assert.deepEqual(남은.사진들, [], '주소도 비워야 옛 대화에 깨진 그림이 안 뜬다')
      assert.equal(남은.로고, '')
    }))

test('새 대화 — 창고 것이 아닌 주소는 아예 안 넘긴다', () =>
  withOutside({ [지우는문]: () => new Response(JSON.stringify({ ok: true, 지운수: 0 })) },
    async (calls) => {
      const env = chatEnv()
      await 대화깔기(env, { 사진들: ['https://evil.example/a.png'], 로고: '없음' })
      await 지우기부르기(env)
      assert.equal(calls.find((c) => c.url === 지우는문), undefined,
        '지울 것이 없으면 람다를 부르지도 않는다')
      assert.deepEqual(상태읽기(env).사진들, [])
    }))

test('새 대화 — 지우기가 죽어도 200 이고 주소는 비운다', () =>
  withOutside({}, async () => {
    const env = chatEnv()
    await 대화깔기(env, { 사진들: [`${창고사진}${'3'.repeat(32)}.png`], 로고: '' })
    const res = await 지우기부르기(env)
    assert.equal(res.status, 200, '못 지웠다고 새 대화를 막으면 안 된다')
    assert.deepEqual(상태읽기(env).사진들, [])
  }))

test('새 대화 — 번호가 이상하면 400, 없는 대화면 404', async () => {
  const env = chatEnv()
  const 이상 = await worker.fetch(call('/api/conversation/zz/uploads', { method: 'DELETE' }), env)
  assert.equal(이상.status, 400)
  const 없음 = await worker.fetch(
    call(`/api/conversation/${'b'.repeat(32)}/uploads`, { method: 'DELETE' }), env)
  assert.equal(없음.status, 404)
})

// ── 번호표 읽기 — 못 읽은 것은 «모른다» 지 «실패» 가 아니다 (실물 2026-09-22) ──
//
// 굽기는 18:03:46 에 멀쩡히 끝났는데 화면은 18:01:34 에 「실패했습니다」를 띄우고
// 손을 놨다. 중계가 답 한 번을 못 읽은 것을 «그 일은 실패» 로 단정했기 때문이다.

const 번호표 = 'job_' + 'a'.repeat(43)

async function 번호표읽기(답) {
  const { env } = fakeEnv()
  const 진짜 = globalThis.fetch
  globalThis.fetch = async () => 답
  try {
    return await worker.fetch(await withPass(`/api/jobs/${번호표}`), env)
  } finally {
    globalThis.fetch = 진짜
  }
}

test('번호표 답을 못 읽으면 «실패» 라고 하지 않는다', async () => {
  const res = await 번호표읽기(new Response('<html>게이트웨이 오류</html>',
    { status: 502, headers: { 'content-type': 'text/html' } }))
  const 몸 = await res.json()
  assert.notEqual(몸.status, 'failed', '한 번 못 읽은 것을 실패로 단정하면 안 된다')
  assert.equal(몸.status, undefined, 'status 가 없어야 화면이 그 판을 건너뛴다')
})

test('굽는 중이라는 답은 그대로 넘긴다', async () => {
  const res = await 번호표읽기(Response.json({ status: 'running', progress: 75 }))
  assert.deepEqual(await res.json(), { status: 'running', progress: 75 })
})

test('진짜 실패는 까닭까지 그대로 넘긴다', async () => {
  // 서버가 실패를 알릴 때는 반드시 까닭을 붙인다(`render/rita.폴링봉투`).
  // 그 까닭이 사람에게 그대로 닿아야 「실패했습니다」 다섯 자만 남지 않는다.
  const res = await 번호표읽기(Response.json(
    { status: 'failed', error: { code: 'bake_failed', message: '굽다 터졌다' } }))
  const 몸 = await res.json()
  assert.equal(몸.status, 'failed')
  assert.equal(몸.error.message, '굽다 터졌다')
})

// ── AWS 문에 붙이는 열쇠 (사람 결정 2026-09-22) ────────────────────
//
// 돈이 나가는 문은 전부 워커만 두드린다. AWS 쪽에 자물쇠를 걸고 열쇠는 워커
// 서버 안에서만 붙인다 — 브라우저는 이 값을 한 번도 못 본다.

async function 나간것(경로, env, opts) {
  const 본것 = []
  const 진짜 = globalThis.fetch
  globalThis.fetch = async (u, init) => {
    본것.push({ url: String(u), init: init || {} })
    return Response.json({ ok: true, status: 'running' })
  }
  try {
    await worker.fetch(await withPass(경로, opts), env)
  } finally {
    globalThis.fetch = 진짜
  }
  return 본것
}

const 굽기부름 = { method: 'POST', body: '{}',
  headers: { 'Content-Type': 'application/json' } }

test('돈 나가는 문을 부를 때 열쇠를 붙인다', async () => {
  const { env } = fakeEnv()
  env.WEB_SECRET = '열쇠값'
  const 본것 = await 나간것('/api/bake', env, 굽기부름)
  assert.equal(본것.length, 1)
  assert.equal(본것[0].init.headers.Authorization, 'Bearer 열쇠값',
    '열쇠를 안 붙이면 잠긴 문이 401 로 떨어진다')
})

test('번호표 읽기에도 붙인다 — 머리말 칸이 아예 없던 자리다', async () => {
  const { env } = fakeEnv()
  env.WEB_SECRET = '열쇠값'
  const 본것 = await 나간것(`/api/jobs/${번호표}`, env)
  assert.equal(본것[0].init.headers.Authorization, 'Bearer 열쇠값')
})

test('열쇠가 없으면 안 붙이고 그냥 보낸다', async () => {
  // 조용히 열어 두는 것보다 401 로 드러나는 편이 낫다.
  const { env } = fakeEnv()
  const 본것 = await 나간것('/api/bake', env, 굽기부름)
  assert.equal(본것[0].init.headers.Authorization, undefined)
  assert.equal(본것[0].init.headers['Content-Type'], 'application/json',
    '열쇠가 없다고 본래 머리말까지 잃으면 안 된다')
})

test('열쇠는 브라우저로 안 내려간다', async () => {
  const { env } = fakeEnv()
  env.WEB_SECRET = '열쇠값'
  const 진짜 = globalThis.fetch
  globalThis.fetch = async () => Response.json({ ok: true })
  let 답
  try {
    답 = await worker.fetch(await withPass('/api/bake', 굽기부름), env)
  } finally {
    globalThis.fetch = 진짜
  }
  const 글 = await 답.text()
  assert.ok(!글.includes('열쇠값'), '답에 열쇠가 섞여 나갔다')
  for (const [, v] of 답.headers) {
    assert.ok(!String(v).includes('열쇠값'), '머리말에 열쇠가 섞여 나갔다')
  }
})
