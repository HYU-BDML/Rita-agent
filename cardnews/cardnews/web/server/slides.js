// 슬라이드 한 장을 인스타에서 받아 창고(R2)에 넣는다.
//
// fetch 를 인자로 받는 것은 시험 때문이다. 진짜 인스타를 부르지 않고
// 가짜를 끼워 넣어 "죽은 엣지 → 두 번째 주소" 같은 길을 확인할 수 있다.

import { isId } from './picks.js'

// 확장자를 믿지 않는다. 인스타 주소가 .heic 여도 실제 응답은 JPEG 인 경우가 있다
// (실측: stp=dst-jpg_e35_tt6 → Content-Type: image/jpeg, 매직바이트 ffd8).
// 인스타가 오류 페이지(HTML)를 200 으로 주는 일도 있어 이 검사가 필요하다.
// 캐러셀에는 영상이 섞여 온다. mp4 는 앞 네 바이트가 상자 크기고 그 다음이 ftyp 다.
// 자리까지 봐야 한다 — ftyp 이 맨 앞에 오는 파일은 mp4 가 아니다.
export function isMedia(bytes) {
  if (!bytes || bytes.length < 4) return false
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return true
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return true
  return (
    bytes.length >= 8 &&
    bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70
  )
}

export function keyOf(id, n, isVideo = false) {
  return `${id}/${String(n).padStart(2, '0')}.${isVideo ? 'mp4' : 'jpg'}`
}

// 주소에서 온 값으로 창고 열쇠를 만든다. 형식이 어긋나면 빈 값을 준다.
export function fileKeyOf(id, name) {
  if (!isId(id) || !/^\d{2}\.(jpg|mp4)$/.test(String(name ?? ''))) return ''
  return `${id}/${name}`
}

// mp4 를 image/jpeg 로 내보내면 브라우저가 재생하지 않는다. 열쇠의 확장자로 고른다.
export function contentTypeOf(key) {
  return String(key).endsWith('.mp4') ? 'video/mp4' : 'image/jpeg'
}

export async function putSlide(bucket, key, tries, fetchImpl = fetch) {
  let why = '받지 못했습니다'
  for (const url of tries) {
    try {
      const res = await fetchImpl(url, {
        headers: { 'user-agent': 'Mozilla/5.0', accept: 'image/*,*/*' },
      })
      if (!res.ok) {
        why = `HTTP ${res.status}`
        continue
      }
      const bytes = new Uint8Array(await res.arrayBuffer())
      if (!isMedia(bytes)) {
        why = '그림도 영상도 아닙니다'
        continue
      }
      await bucket.put(key, bytes, { httpMetadata: { contentType: contentTypeOf(key) } })
      return { ok: true, bytes: bytes.length }
    } catch (e) {
      why = e.name
    }
  }
  return { ok: false, why }
}
