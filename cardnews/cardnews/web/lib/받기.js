// 구운 카드를 내려받는다. **작업대와 결과 쪽이 같이 쓴다.**
//
// 두 쪽 다 창고(S3)에 구워 올리는 쪽이라 `import` 를 못 쓴다 — 굽는 쪽이
// 이 파일을 통째로 쪽 안에 박는다(`render/workbench._박을_스크립트`).
// 그래서 여기에 두 벌이 생기지 않게 한 벌만 둔다.
//
// 그림은 쪽과 **같은 집(S3 통)** 에 살아서 `fetch` 가 막히지 않는다.

import { makeZip, safeName } from './zip.js'

// 이름을 길게 두는 까닭: 작업대 쪽 JS 에 «칸» 을 받는 같은 이름이 이미 있다.
// 짧게 두면 통째로 박힐 때 «이미 선언된 이름» 으로 쪽 전체가 죽는다.
const 영상주소인가 = (u) => /\.mp4(\?|$)/i.test(u)

/** 그 장의 파일 이름. 번호는 1부터 두 자리. */
export function 장이름(주소, i) {
  return String(i + 1).padStart(2, '0') + (영상주소인가(주소) ? '.mp4' : '.png')
}

const 떨구기 = (덩이, 이름) => {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(덩이)
  a.download = 이름
  a.click()
  URL.revokeObjectURL(a.href)
}

/** 한 장만. **압축하지 않는다** — 한 장 받으려고 푸는 것은 번거롭기만 하다. */
export async function 한장받기(주소, i, 앞말 = '카드뉴스') {
  const 덩이 = await fetch(주소).then((r) => r.blob())
  떨구기(덩이, `${safeName(앞말)}-${장이름(주소, i)}`)
}

/** 전부를 **압축 파일 하나로.** 풀면 폴더가 나온다(사람 지시 2026-09-21).
 *
 * 여태는 한 장씩 따로 떨어뜨렸다 — 일곱 장이면 다운로드 폴더에 일곱 개가
 * 다른 파일들 사이로 흩어졌고, 남에게 보내려면 그걸 다시 골라내야 했다.
 *
 * 폴더 이름을 파일 이름 앞에 붙이는 까닭은 **어디서 풀어도 폴더가 생기게**
 * 하기 위해서다. 푸는 프로그램에 따라 통째로 쏟아 놓는 것이 있다.
 *
 * `알림(몇번째, 모두)` 은 받는 동안 단추 글자를 바꾸라고 부른다.
 */
export async function 모아받기(주소들, 폴더이름 = '카드뉴스', 알림 = () => {}) {
  const 폴더 = safeName(폴더이름)
  const files = []
  for (let i = 0; i < 주소들.length; i += 1) {
    알림(i + 1, 주소들.length)
    const 덩이 = await fetch(주소들[i]).then((r) => r.arrayBuffer())
    files.push({ name: `${폴더}/${장이름(주소들[i], i)}`, data: new Uint8Array(덩이) })
  }
  if (!files.length) throw new Error('받을 것이 없습니다')
  떨구기(new Blob([makeZip(files)], { type: 'application/zip' }), `${폴더}.zip`)
  return files.length
}
