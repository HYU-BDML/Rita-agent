// 내가 만든 템플릿을 **이 브라우저에만** 적어 둔다.
//
// 사람 지시 2026-09-19: 서른다섯 명이 리타 링크로 들어와 각자 인스타 주소를 담고
// 라벨을 쳐서 자기 템플릿을 만든다. 그런데 템플릿 목록은 창고에 **파일 하나**라,
// 그대로 두면 서로의 템플릿이 다 보인다.
//
//     수집기에서 분석  →  공용   (사장님 자리)
//     채팅·라벨판에서  →  개인   (여기 적어 둔 사람에게만 보인다)

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { 내것더하기, 내것들, 보일것 } from '../lib/내템플릿.js'

function 가짜저장소() {
  const 통 = new Map()
  return {
    getItem: (k) => (통.has(k) ? 통.get(k) : null),
    setItem: (k, v) => 통.set(k, String(v)),
  }
}

test('적어 두면 다시 읽힌다', () => {
  const 저 = 가짜저장소()
  내것더하기('AAA', 저)
  내것더하기('BBB', 저)
  assert.deepEqual(내것들(저), ['AAA', 'BBB'])
})

test('같은 것을 두 번 적어도 하나다', () => {
  const 저 = 가짜저장소()
  내것더하기('AAA', 저)
  내것더하기('AAA', 저)
  assert.deepEqual(내것들(저), ['AAA'])
})

test('저장이 막힌 창에서도 안 죽는다', () => {
  // 사생활 보호 창에서는 `setItem` 이 던진다. 거기서도 화면은 떠야 한다.
  const 막힌것 = { getItem: () => { throw new Error('막힘') },
                setItem: () => { throw new Error('막힘') } }
  assert.doesNotThrow(() => 내것더하기('AAA', 막힌것))
  assert.deepEqual(내것들(막힌것), [])
})

test('공용은 다 보이고 개인은 내 것만 보인다', () => {
  const 저 = 가짜저장소()
  내것더하기('MINE', 저)
  const 목록 = [{ 코드: 'PUB1', 개인: false },
               { 코드: 'MINE', 개인: true },
               { 코드: 'OTHER', 개인: true }]
  assert.deepEqual(보일것(목록, 저).map((x) => x.코드), ['PUB1', 'MINE'])
})

test('개인 칸이 없는 옛 틀은 공용으로 본다', () => {
  // 창고에 이미 있는 열 벌에는 이 칸이 없다. 갑자기 안 보이면 고를 것이 없어진다.
  const 저 = 가짜저장소()
  assert.deepEqual(보일것([{ 코드: 'OLD' }], 저).map((x) => x.코드), ['OLD'])
})

test('빈 목록이 와도 안 죽는다', () => {
  assert.deepEqual(보일것(null, 가짜저장소()), [])
})
