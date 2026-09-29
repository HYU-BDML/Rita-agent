import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  newId, isConversationId, loadConversation, saveConversation, appendBot,
} from '../server/conversations.js'
import { fakeDb } from './fixtures/fake-db.js'

test('번호는 32자 hex 이고 매번 다르다', () => {
  const a = newId(), b = newId()
  assert.match(a, /^[0-9a-f]{32}$/)
  assert.notEqual(a, b)
  assert.equal(isConversationId(a), true)
  assert.equal(isConversationId('abc'), false)
  assert.equal(isConversationId(''), false)
})

test('없는 대화는 null 이다', async () => {
  assert.equal(await loadConversation(fakeDb(), newId()), null)
})

test('저장한 것을 그대로 읽는다', async () => {
  const db = fakeDb()
  const id = newId()
  await saveConversation(db, id, { 틀: { 코드: 'A', 이름: '키키' } },
    [{ 역할: '사람', 말: '안녕', 때: '2026-09-16T00:00:00Z' }], '2026-09-16T00:00:01Z')
  const got = await loadConversation(db, id)
  assert.deepEqual(got.state, { 틀: { 코드: 'A', 이름: '키키' } })
  assert.equal(got.messages.length, 1)
  assert.equal(got.messages[0].말, '안녕')
})

test('다시 저장하면 덮는다 — 만든 시각은 처음 것이 남는다', async () => {
  const db = fakeDb()
  const id = newId()
  await saveConversation(db, id, {}, [], '2026-09-16T00:00:00Z')
  await saveConversation(db, id, { 틀: null }, [{ 역할: '봇', 말: '응', 때: 't' }], '2026-09-16T00:00:09Z')
  assert.equal(db.rows.get(id).created_at, '2026-09-16T00:00:00Z')
  assert.equal(db.rows.get(id).updated_at, '2026-09-16T00:00:09Z')
  assert.equal((await loadConversation(db, id)).messages.length, 1)
})

test('봇 말을 덧붙이면 말이 늘고 상태가 얕게 합쳐진다', async () => {
  const db = fakeDb()
  const id = newId()
  await saveConversation(db, id, { 틀: { 코드: 'A', 이름: '키키' }, 지켜보기: { 코드: 'X' } }, [], 't0')
  const r = await appendBot(db, id, '분석 끝났어요', { 지켜보기: null }, 't1')
  assert.equal(r.ok, true)
  const got = await loadConversation(db, id)
  assert.deepEqual(got.state, { 틀: { 코드: 'A', 이름: '키키' }, 지켜보기: null })
  assert.deepEqual(got.messages, [{ 역할: '봇', 말: '분석 끝났어요', 때: 't1' }])
})

test('없는 대화에 봇 말을 덧붙이면 거절한다', async () => {
  const r = await appendBot(fakeDb(), newId(), '응', {}, 't')
  assert.equal(r.ok, false)
  assert.match(r.why, /대화/)
})
