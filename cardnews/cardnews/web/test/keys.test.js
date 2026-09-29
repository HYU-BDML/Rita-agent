import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseKeys, pickKey, loadKeys, saveKeys, mergeKeys, maskKey, MIN_REMAINING_USD, creditLabel } from '../lib/keys.js'

test('mergeKeys는 기존 키를 지우지 않고 뒤에 더한다', () => {
  assert.deepEqual(
    mergeKeys(['apify_api_A', 'apify_api_B'], ['apify_api_C']),
    ['apify_api_A', 'apify_api_B', 'apify_api_C']
  )
})

test('mergeKeys는 이미 있는 키를 두 번 넣지 않는다', () => {
  assert.deepEqual(
    mergeKeys(['apify_api_A', 'apify_api_B'], ['apify_api_B', 'apify_api_C']),
    ['apify_api_A', 'apify_api_B', 'apify_api_C']
  )
})

test('mergeKeys는 빈 입력에도 기존 목록을 지킨다', () => {
  assert.deepEqual(mergeKeys(['apify_api_A'], []), ['apify_api_A'])
  assert.deepEqual(mergeKeys(['apify_api_A'], null), ['apify_api_A'])
  assert.deepEqual(mergeKeys(null, ['apify_api_A']), ['apify_api_A'])
})

test('maskKey는 끝 4자리만 남기고 나머지를 가린다', () => {
  assert.equal(maskKey('apify_api_ABCDEFGH1234'), '••••••••1234')
})

test('maskKey 결과에는 키 본문이 남지 않는다', () => {
  const key = 'apify_api_SECRETVALUE9999'
  const masked = maskKey(key)
  assert.ok(!masked.includes('SECRET'))
  assert.ok(!masked.includes('apify_api_'))
  assert.equal(masked.length, 12)
})

test('maskKey는 짧은 값과 빈 값도 흘리지 않는다', () => {
  assert.equal(maskKey('abcd'), '••••')
  assert.equal(maskKey(''), '')
  assert.equal(maskKey(null), '')
})

test('parseKeys는 라벨이 섞인 텍스트에서 키만 뽑는다', () => {
  const text = `apify api_1: apify_api_AAA111
apify api_2:apify_api_BBB222`
  assert.deepEqual(parseKeys(text), ['apify_api_AAA111', 'apify_api_BBB222'])
})

test('parseKeys는 중복을 제거한다', () => {
  assert.deepEqual(parseKeys('apify_api_AAA apify_api_AAA'), ['apify_api_AAA'])
})

test('parseKeys는 키가 없으면 빈 배열', () => {
  assert.deepEqual(parseKeys('아무 키도 없음'), [])
})

test('pickKey는 잔여 크레딧이 충분한 첫 키를 고른다', () => {
  const picked = pickKey([
    { key: 'a', remaining: 0.1 },
    { key: 'b', remaining: 3.0 },
    { key: 'c', remaining: 5.0 },
  ])
  assert.equal(picked, 'b')
})

test('pickKey는 조회 실패한 키(null)를 건너뛴다', () => {
  const picked = pickKey([
    { key: 'a', remaining: null },
    { key: 'b', remaining: 2.0 },
  ])
  assert.equal(picked, 'b')
})

test('pickKey는 쓸 키가 없으면 null', () => {
  assert.equal(pickKey([{ key: 'a', remaining: 0 }]), null)
  assert.equal(pickKey([]), null)
})

test('MIN_REMAINING_USD 경계값은 포함된다', () => {
  assert.equal(pickKey([{ key: 'a', remaining: MIN_REMAINING_USD }]), 'a')
})

test('saveKeys와 loadKeys가 왕복한다', () => {
  const store = new Map()
  const storage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
  }
  saveKeys(storage, ['apify_api_AAA', 'apify_api_BBB'])
  assert.deepEqual(loadKeys(storage), ['apify_api_AAA', 'apify_api_BBB'])
})

test('loadKeys는 저장된 게 없으면 빈 배열', () => {
  const storage = { getItem: () => null, setItem: () => {} }
  assert.deepEqual(loadKeys(storage), [])
})

// 키마다 얼마 남았는지 화면에 보여준다. keyStatus() 가 이미 Apify 에서 받아오던 값인데
// 키를 고르는 데만 쓰고 사람에게는 안 보여줬다.
test('잔액을 사람 말로 바꾼다', () => {
  assert.equal(creditLabel({ state: 'ok', remaining: 4.123 }), '$4.12 남음')
  assert.equal(creditLabel({ state: 'invalid', remaining: null }), '키가 틀렸습니다')
  assert.equal(creditLabel({ state: 'unknown', remaining: null }), '확인 못 함')
  assert.equal(creditLabel(null), '확인 중…')
})

test('곧 소진될 키는 그렇다고 말한다', () => {
  // MIN_REMAINING_USD 아래면 이 키로는 다음 검색이 안 돌아간다
  assert.match(creditLabel({ state: 'ok', remaining: 0.08 }), /곧 소진/)
  assert.equal(/곧 소진/.test(creditLabel({ state: 'ok', remaining: 4.12 })), false)
})

test('잔액이 0 이하여도 무너지지 않는다', () => {
  assert.match(creditLabel({ state: 'ok', remaining: 0 }), /^\$0\.00 남음/)
  assert.match(creditLabel({ state: 'ok', remaining: -0.5 }), /곧 소진/)
})
