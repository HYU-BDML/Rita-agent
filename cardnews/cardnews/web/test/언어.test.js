import { test } from 'node:test'
import assert from 'node:assert/strict'
import { 언어표, 언어들, 언어열쇠, 쓸언어, 다음언어 } from '../lib/언어.js'
import { 언어들 as 서버언어들 } from '../server/chat.js'
import { 쓸언어 as 채팅쓸언어 } from '../lib/chat.js'

// **이 파일이 지키는 것은 하나다 — 언어를 거르는 규칙이 한 벌뿐인가.**
//
// 2026-09-18 검토에서 같은 값을 여덟 자리가 세 가지 규칙으로 거르고 있었다.
// 규칙이 갈리면 한쪽만 고쳤을 때 「봇은 한국어인데 카드는 영어」처럼 조용히
// 갈라진다. 그래서 사본을 못 만들게 여기서 못 박는다.

test('값과 보이는 글자는 다르다 — 값은 파이썬과 글자까지 같아야 한다', () => {
  assert.deepEqual(언어표.map((x) => x.값), ['한국어', '영어'])
  assert.deepEqual(언어표.map((x) => x.보임), ['한국어', 'English'])
  assert.deepEqual(언어들, ['한국어', '영어'])
})

test('서버도 채팅 화면도 같은 한 벌을 쓴다 — 사본이 없다', () => {
  assert.deepEqual(서버언어들, 언어들, '서버가 제 사본을 들고 있다')
  assert.equal(채팅쓸언어, 쓸언어, '채팅 화면이 제 사본을 들고 있다')
})

test('저장된 것이 없거나 이상하면 한국어다', () => {
  assert.equal(쓸언어('영어'), '영어')
  assert.equal(쓸언어('한국어'), '한국어')
  assert.equal(쓸언어(null), '한국어')
  assert.equal(쓸언어(''), '한국어')
  assert.equal(쓸언어('English'), '한국어')
  assert.equal(쓸언어(42), '한국어')
})

test('단추를 누르면 둘 사이를 오간다', () => {
  assert.equal(다음언어('한국어'), '영어')
  assert.equal(다음언어('영어'), '한국어')
  assert.equal(다음언어('엉뚱한 것'), '영어')
})

test('브라우저에 남기는 열쇠 이름이 한 벌이다', () => {
  // 채팅이 쓴 것을 게시판이 읽는다. 이름이 갈리면 게시판만 한국어로 만든다.
  assert.equal(언어열쇠, 'cardnews.언어')
})
