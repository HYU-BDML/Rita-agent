// Cloudflare Pages 에 올릴 폴더를 만든다. 테스트와 문서는 뺀다.
// 픽스처에 실제 인스타 데이터가 들어 있어 공개 배포에 넣을 이유가 없다.
import { cp, rm, mkdir, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join, relative, sep } from 'node:path'

const SRC = fileURLToPath(new URL('./cardnews/web/', import.meta.url))
const OUT = fileURLToPath(new URL('./dist/', import.meta.url))

const SKIP_DIRS = new Set(['test', 'server'])
// _worker.js 는 정적 파일이 아니라 진입 스크립트다. wrangler.jsonc 의 main 이
// 원본을 직접 가리키므로 여기 복사하면 코드가 그대로 공개된다.
// web/server/ 는 서버에서만 도는 코드다. dist 로 복사하면 브라우저에 그대로 공개된다.
const SKIP_FILES = new Set(['_worker.js'])
const skip = (abs) => {
  const rel = relative(SRC, abs)
  if (!rel) return false
  const [first] = rel.split(sep)
  return SKIP_DIRS.has(first) || SKIP_FILES.has(rel) || rel.endsWith('.md')
}

await rm(OUT, { recursive: true, force: true })
await mkdir(OUT, { recursive: true })
await cp(SRC, OUT, { recursive: true, filter: (src) => !skip(src) })

const list = async (dir, prefix = '') => {
  const out = []
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...(await list(join(dir, e.name), `${prefix}${e.name}/`)))
    else out.push(prefix + e.name)
  }
  return out
}
const files = await list(OUT)
console.log(`dist/ 준비 완료 — ${files.length}개 파일`)
for (const f of files.sort()) console.log('  ' + f)
console.log('\n올리기: npx wrangler deploy   (처음 한 번은 npx wrangler login)')
