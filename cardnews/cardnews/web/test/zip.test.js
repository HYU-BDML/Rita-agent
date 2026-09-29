import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { crc32, makeZip, safeName } from '../lib/zip.js'

const bytes = (s) => new TextEncoder().encode(s)

test('crc32 는 표준 검사값과 맞는다', () => {
  // ZIP·PNG 가 쓰는 CRC-32 의 표준 시험값
  assert.equal(crc32(bytes('123456789')), 0xcbf43926)
  assert.equal(crc32(new Uint8Array(0)), 0)
})

test('makeZip 은 zip 서명으로 시작하고 끝 기록으로 끝난다', () => {
  const zip = makeZip([{ name: '01.jpg', data: bytes('hello') }])
  assert.deepEqual([...zip.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04])
  const tail = zip.slice(-22)
  assert.deepEqual([...tail.slice(0, 4)], [0x50, 0x4b, 0x05, 0x06])
})

test('makeZip 은 넣은 개수를 끝 기록에 적는다', () => {
  const zip = makeZip([
    { name: '01.jpg', data: bytes('a') },
    { name: '02.jpg', data: bytes('bb') },
    { name: '03.jpg', data: bytes('ccc') },
  ])
  const tail = zip.slice(-22)
  const count = tail[10] | (tail[11] << 8)
  assert.equal(count, 3)
})

test('makeZip 은 한글 이름에 UTF-8 표시를 켠다', () => {
  const zip = makeZip([{ name: '카드뉴스_01.jpg', data: bytes('x') }])
  const flags = zip[6] | (zip[7] << 8)
  assert.equal(flags & 0x0800, 0x0800, '이 표시가 없으면 한글 파일명이 깨진다')
})

test('실제 압축 프로그램이 읽고 풀 수 있다', () => {
  const zip = makeZip([
    { name: '01.jpg', data: bytes('첫 장입니다') },
    { name: '02.jpg', data: bytes('두 번째 장') },
  ])
  const dir = mkdtempSync(join(tmpdir(), 'zip-'))
  const path = join(dir, 'out.zip')
  writeFileSync(path, zip)
  // 파워셸의 압축 해제로 실제로 풀어본다. 우리끼리 맞는지가 아니라
  // 남의 프로그램이 읽을 수 있는지가 중요하다.
  execFileSync('powershell', [
    '-NoProfile', '-Command',
    `Expand-Archive -LiteralPath '${path}' -DestinationPath '${dir}\\out' -Force`,
  ])
  assert.equal(readFileSync(join(dir, 'out', '01.jpg'), 'utf8'), '첫 장입니다')
  assert.equal(readFileSync(join(dir, 'out', '02.jpg'), 'utf8'), '두 번째 장')
})

test('safeName 은 파일명에 못 쓰는 글자를 턴다', () => {
  assert.equal(safeName('아이돌/카드뉴스: "TOP9"'), '아이돌 카드뉴스 TOP9')
  assert.equal(safeName('  여러   공백  '), '여러 공백')
  assert.equal(safeName(''), 'cardnews')
  assert.equal(safeName(null, 'x'), 'x')
})

test('safeName 은 너무 긴 이름을 자른다', () => {
  assert.ok(safeName('가'.repeat(200)).length <= 60)
})
