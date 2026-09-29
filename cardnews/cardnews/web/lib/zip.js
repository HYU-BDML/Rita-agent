// 슬라이드를 파일 하나로 묶는다. 압축 없이 담기만 한다(method 0).
// JPEG 는 이미 압축돼 있어서 다시 압축해봐야 줄지 않고 시간만 든다.
// 라이브러리를 쓰지 않는 이유는 이 앱이 의존성 0 으로 도는 것이 전제이기 때문이다.

const TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let c = i
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[i] = c >>> 0
  }
  return t
})()

export function crc32(bytes) {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i += 1) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// 압축 파일에는 만든 시각이 들어간다. 고정해두면 같은 입력에 같은 파일이 나온다.
const DOS_TIME = 0 // 00:00:00
const DOS_DATE = ((2020 - 1980) << 9) | (1 << 5) | 1 // 2020-01-01

class Writer {
  constructor() {
    this.parts = []
    this.length = 0
  }
  bytes(b) {
    this.parts.push(b)
    this.length += b.length
    return this
  }
  u16(n) {
    return this.bytes(new Uint8Array([n & 0xff, (n >>> 8) & 0xff]))
  }
  u32(n) {
    return this.bytes(new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]))
  }
  join() {
    const out = new Uint8Array(this.length)
    let at = 0
    for (const p of this.parts) {
      out.set(p, at)
      at += p.length
    }
    return out
  }
}

// files: [{ name, data: Uint8Array }] → Uint8Array (zip)
export function makeZip(files) {
  const enc = new TextEncoder()
  const w = new Writer()
  const entries = []

  for (const f of files) {
    const name = enc.encode(f.name)
    const crc = crc32(f.data)
    entries.push({ name, crc, size: f.data.length, offset: w.length })
    w.u32(0x04034b50) // 로컬 헤더
    w.u16(20) // 필요한 버전
    w.u16(0x0800) // 이름이 UTF-8 이라는 표시. 한글 파일명이 깨지지 않게 한다
    w.u16(0) // 압축 안 함
    w.u16(DOS_TIME).u16(DOS_DATE)
    w.u32(crc).u32(f.data.length).u32(f.data.length)
    w.u16(name.length).u16(0)
    w.bytes(name).bytes(f.data)
  }

  const dirAt = w.length
  for (const e of entries) {
    w.u32(0x02014b50) // 중앙 목록
    w.u16(20).u16(20)
    w.u16(0x0800).u16(0)
    w.u16(DOS_TIME).u16(DOS_DATE)
    w.u32(e.crc).u32(e.size).u32(e.size)
    w.u16(e.name.length).u16(0).u16(0)
    w.u16(0).u16(0).u32(0)
    w.u32(e.offset)
    w.bytes(e.name)
  }
  const dirSize = w.length - dirAt

  w.u32(0x06054b50) // 끝 기록
  w.u16(0).u16(0)
  w.u16(entries.length).u16(entries.length)
  w.u32(dirSize).u32(dirAt).u16(0)
  return w.join()
}

// 파일 이름에 쓸 수 없는 글자를 털어낸다
export function safeName(text, fallback = 'cardnews') {
  const cleaned = String(text || '')
    .replace(/[\\/:*?"<>|\n\r\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
  return cleaned || fallback
}
