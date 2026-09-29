// 배포 전 확인용 서버. Cloudflare 에 올라갈 web/_worker.js 를 그대로 불러 쓴다.
// 중계 로직을 두 벌 두면 로컬에서 되던 것이 배포에서 안 되는 일이 생긴다.
import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import worker from './cardnews/web/_worker.js'

const ROOT = fileURLToPath(new URL('./cardnews/web/', import.meta.url))
const PORT = Number(process.argv[2] || 8788)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
}

// Cloudflare 가 정적 파일을 내주는 자리를 흉내낸다
const ASSETS = {
  async fetch(request) {
    let path = decodeURIComponent(new URL(request.url).pathname)
    if (path.endsWith('/')) path += 'index.html'
    const file = resolve(ROOT, '.' + path)
    if (file !== ROOT.replace(/[/\\]$/, '') && !file.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep)) {
      return new Response('경로를 벗어났습니다', { status: 403 })
    }
    try {
      const body = await readFile(file)
      return new Response(body, {
        headers: {
          'content-type': MIME[extname(file)] || 'application/octet-stream',
          'cache-control': 'no-store', // 고친 파일이 바로 반영되게 한다
        },
      })
    } catch {
      return new Response('없는 파일입니다', { status: 404 })
    }
  },
}

/** 요청 몸통을 통째로 읽는다. 스트림으로 넘기면 Node 가 duplex 를 요구한다. */
function 몸읽기(req) {
  return new Promise((되, 안) => {
    const 조각 = []
    req.on('data', (c) => 조각.push(c))
    req.on('end', () => 되(조각.length ? Buffer.concat(조각) : undefined))
    req.on('error', 안)
  })
}

http
  .createServer(async (req, res) => {
    // 헤더를 안 넘기면 워커가 Range 도 쿠키도 못 본다 — 배포에서는 되는 영상 탐색이
    // 로컬에서만 죽는다. 길이·연결 관련 헤더는 우리가 다시 만드는 값이라 뺀다.
    const skip = ['host', 'connection', 'content-length', 'transfer-encoding']
    const headers = new Headers()
    for (const [k, v] of Object.entries(req.headers)) {
      if (skip.includes(k)) continue
      headers.set(k, Array.isArray(v) ? v.join(', ') : v)
    }
    // **몸통을 같이 넘긴다.** 여태 안 넘겨서 로컬에서는 POST 가 늘 빈 몸으로
    // 도착했다 — 채팅에 무슨 말을 쳐도 「말이 비었습니다」만 나왔다. 배포에서는
    // 멀쩡하니 눈으로는 안 잡히고, 로컬로 시험해 보려다 막힌다.
    const 몸 = ['GET', 'HEAD'].includes(req.method) ? undefined : await 몸읽기(req)
    const request = new Request(`http://localhost:${PORT}${req.url}`,
      { method: req.method, headers, body: 몸 })
    let out
    try {
      out = await worker.fetch(request, { ASSETS })
    } catch (e) {
      out = new Response(`worker 오류: ${e.message}`, { status: 500 })
    }
    res.writeHead(out.status, Object.fromEntries(out.headers))
    res.end(Buffer.from(await out.arrayBuffer()))
  })
  .listen(PORT, () => console.log(`http://localhost:${PORT} — web/_worker.js 로 서빙 중`))
