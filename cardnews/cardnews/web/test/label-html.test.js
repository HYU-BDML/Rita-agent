// label.html 의 인라인 <script type="module"> 이 문법적으로 온전한지 본다.
//
// 예전에 모듈 맨 바깥에 `return` 을 넣은 채로 커밋된 적이 있다. `return` 은
// 함수 밖에서 쓰면 이른 오류(early error)라서 브라우저가 모듈을 통째로 거부하고
// #root 가 조건과 상관없이 늘 빈 채로 남는다 — 시험 없이는 브라우저를 직접 열어야만
// 드러난다. `node --check` 로 커밋마다 잡는다.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const HTML_PATH = new URL('../label.html', import.meta.url)

test('label.html 의 module 스크립트에 문법 오류가 없다', () => {
  const html = readFileSync(HTML_PATH, 'utf8')
  const m = html.match(/<script type="module">([\s\S]*?)<\/script>/)
  assert.ok(m, 'web/label.html 에서 <script type="module"> 을 못 찾았습니다')

  const tmpFile = join(tmpdir(), `label-html-check-${process.pid}-${Date.now()}.mjs`)
  writeFileSync(tmpFile, m[1])
  try {
    execFileSync(process.execPath, ['--check', tmpFile])
  } catch (e) {
    assert.fail(`web/label.html 의 <script type="module"> 이 문법 오류입니다:\n${e.stderr ?? e.message}`)
  } finally {
    unlinkSync(tmpFile)
  }
})

test('label.html 은 수집기로 가는 링크를 갖지 않는다 — 열린 URL 이라 이름이 새면 안 된다', () => {
  const html = readFileSync(HTML_PATH, 'utf8')
  assert.ok(!/href="\/index\.html"/.test(html))
  assert.ok(!/board-card-news/.test(html))
})
