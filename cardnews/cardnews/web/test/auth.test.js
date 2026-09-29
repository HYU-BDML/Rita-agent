import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tokenOf, cookieOf, bearerOf, allowed, setCookieHeader, COOKIE } from '../server/auth.js'

const req = (headers) => new Request('https://x.test/api/picks', { headers })

test('같은 암호는 늘 같은 출입증을 낸다', async () => {
  assert.equal(await tokenOf('12345678'), await tokenOf('12345678'))
})

test('다른 암호는 다른 출입증을 낸다', async () => {
  assert.notEqual(await tokenOf('12345678'), await tokenOf('12345679'))
})

test('출입증에 암호가 들어 있지 않다', async () => {
  const t = await tokenOf('12345678')
  assert.equal(t.includes('12345678'), false)
  assert.match(t, /^[0-9a-f]{64}$/)
})

test('쿠키에서 값을 꺼낸다 — 다른 쿠키가 섞여 있어도', () => {
  assert.equal(cookieOf(`a=1; ${COOKIE}=abc; b=2`), 'abc')
  assert.equal(cookieOf('a=1; b=2'), '')
  assert.equal(cookieOf(''), '')
  assert.equal(cookieOf(null), '')
})

test('Bearer 헤더에서 암호를 꺼낸다', () => {
  assert.equal(bearerOf('Bearer 12345678'), '12345678')
  assert.equal(bearerOf('Basic 12345678'), '')
  assert.equal(bearerOf(''), '')
})

test('사람은 쿠키로 들어온다', async () => {
  const t = await tokenOf('12345678')
  assert.equal(await allowed(req({ cookie: `${COOKIE}=${t}` }), '12345678'), true)
})

test('파이썬은 헤더로 출입증을 넣어야 들어온다', async () => {
  const t = await tokenOf('12345678')
  assert.equal(await allowed(req({ authorization: `Bearer ${t}` }), '12345678'), true)
})

test('Bearer 에 원문 암호를 넣으면 막는다 — 찍어볼 수 있는 문은 로그인 하나뿐이어야 한다', async () => {
  assert.equal(await allowed(req({ authorization: 'Bearer 12345678' }), '12345678'), false)
})

test('아무것도 없으면 막는다', async () => {
  assert.equal(await allowed(req({}), '12345678'), false)
})

test('틀린 출입증은 막는다', async () => {
  assert.equal(await allowed(req({ cookie: `${COOKIE}=deadbeef` }), '12345678'), false)
})

test('서버에 암호가 설정돼 있지 않으면 아무도 못 들어온다', async () => {
  const t = await tokenOf('12345678')
  assert.equal(await allowed(req({ cookie: `${COOKIE}=${t}` }), ''), false)
  assert.equal(await allowed(req({ authorization: 'Bearer ' }), ''), false)
})

test('쿠키에 필요한 속성이 다 붙는다', () => {
  const h = setCookieHeader('abc')
  for (const bit of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=7776000']) {
    assert.ok(h.includes(bit), `${bit} 가 없다: ${h}`)
  }
})
