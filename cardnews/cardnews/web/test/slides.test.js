import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isMedia, keyOf, fileKeyOf, contentTypeOf, putSlide } from '../server/slides.js'

const bytes = (...b) => new Uint8Array([...b, 0, 0, 0, 0])
// mp4 는 앞 네 바이트가 상자 크기고 그 다음이 ftyp 다.
const mp4 = () => new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0, 0, 0, 0])

test('JPEG · PNG · MP4 를 통과시킨다', () => {
  assert.equal(isMedia(bytes(0xff, 0xd8, 0xff, 0xe0)), true)          // JPEG
  assert.equal(isMedia(bytes(0x89, 0x50, 0x4e, 0x47)), true)          // PNG
  assert.equal(isMedia(mp4()), true)                                  // MP4
})

test('오류 페이지는 여전히 막는다 — 인스타가 HTML 을 200 으로 줄 때가 있다', () => {
  assert.equal(isMedia(bytes(0x3c, 0x21, 0x44, 0x4f)), false)         // <!DO
  assert.equal(isMedia(new Uint8Array([0xff])), false)
  assert.equal(isMedia(null), false)
  // ftyp 이 앞자리에 오는 것은 mp4 가 아니다. 자리까지 봐야 한다.
  assert.equal(isMedia(bytes(0x66, 0x74, 0x79, 0x70)), false)
})

test('창고 열쇠는 두 자리 0채움이고, 영상이면 .mp4 다', () => {
  assert.equal(keyOf('C_abc', 1), 'C_abc/01.jpg')
  assert.equal(keyOf('C_abc', 12), 'C_abc/12.jpg')
  assert.equal(keyOf('C_abc', 1, true), 'C_abc/01.mp4')
})

test('파일 통로는 이상한 경로를 거른다 — 남의 폴더를 못 열게', () => {
  assert.equal(fileKeyOf('C_abc', '01.jpg'), 'C_abc/01.jpg')
  assert.equal(fileKeyOf('C_abc', '01.mp4'), 'C_abc/01.mp4')
  assert.equal(fileKeyOf('../etc', '01.jpg'), '')
  assert.equal(fileKeyOf('C_abc', '../../x.jpg'), '')
  assert.equal(fileKeyOf('C_abc', '1.jpg'), '')
  assert.equal(fileKeyOf('C_abc', '01.png'), '')
})

test('꼬리표는 확장자로 고른다 — mp4 를 image/jpeg 로 내보내면 재생이 안 된다', () => {
  assert.equal(contentTypeOf('C_abc/01.jpg'), 'image/jpeg')
  assert.equal(contentTypeOf('C_abc/01.mp4'), 'video/mp4')
})

// 가짜 창고와 가짜 인스타로 시험한다. 진짜 R2 도 진짜 인스타도 부르지 않는다.
const fakeBucket = () => {
  const store = new Map()
  return {
    store,
    async put(key, body, opts) {
      store.set(key, { body, type: opts && opts.httpMetadata && opts.httpMetadata.contentType })
    },
  }
}

const fakeFetch = (plan) => async (url) => {
  const r = plan[url]
  if (!r) throw new Error('그런 주소 없음')
  if (r.throws) { const e = new Error('죽은 엣지'); e.name = 'TypeError'; throw e }
  return {
    ok: r.status === 200,
    status: r.status,
    arrayBuffer: async () => r.body.buffer.slice(r.body.byteOffset, r.body.byteOffset + r.body.byteLength),
  }
}

test('받아서 창고에 넣는다', async () => {
  const bucket = fakeBucket()
  const jpg = bytes(0xff, 0xd8, 0xff, 0xe0)
  const out = await putSlide(bucket, 'C_abc/01.jpg', ['https://a.test/1.jpg'],
    fakeFetch({ 'https://a.test/1.jpg': { status: 200, body: jpg } }))
  assert.equal(out.ok, true)
  assert.equal(out.bytes, jpg.length)
  assert.equal(bucket.store.has('C_abc/01.jpg'), true)
})

test('첫 주소가 죽으면 두 번째 주소로 다시 받는다', async () => {
  const bucket = fakeBucket()
  const jpg = bytes(0xff, 0xd8, 0xff, 0xe0)
  const out = await putSlide(bucket, 'C_abc/01.jpg',
    ['https://dead.test/1.jpg', 'https://alive.test/1.jpg'],
    fakeFetch({
      'https://dead.test/1.jpg': { throws: true },
      'https://alive.test/1.jpg': { status: 200, body: jpg },
    }))
  assert.equal(out.ok, true)
  assert.equal(bucket.store.has('C_abc/01.jpg'), true)
})

test('영상은 video/mp4 꼬리표를 달아 창고에 넣는다', async () => {
  const bucket = fakeBucket()
  const out = await putSlide(bucket, 'C_abc/01.mp4', ['https://a.test/1.mp4'],
    fakeFetch({ 'https://a.test/1.mp4': { status: 200, body: mp4() } }))
  assert.equal(out.ok, true)
  assert.equal(bucket.store.get('C_abc/01.mp4').type, 'video/mp4')
})

test('그림이 아니면 창고에 넣지 않는다', async () => {
  const bucket = fakeBucket()
  const html = bytes(0x3c, 0x21, 0x44, 0x4f)
  const out = await putSlide(bucket, 'C_abc/01.jpg', ['https://a.test/1.jpg'],
    fakeFetch({ 'https://a.test/1.jpg': { status: 200, body: html } }))
  assert.equal(out.ok, false)
  assert.equal(bucket.store.size, 0)
})

test('전부 실패하면 왜 실패했는지 남긴다', async () => {
  const bucket = fakeBucket()
  const out = await putSlide(bucket, 'C_abc/01.jpg', ['https://a.test/1.jpg'],
    fakeFetch({ 'https://a.test/1.jpg': { status: 403, body: new Uint8Array() } }))
  assert.equal(out.ok, false)
  assert.equal(out.why, 'HTTP 403')
})
