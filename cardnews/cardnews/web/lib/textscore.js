// 표지에 글자가 얹혀 있는지 어림잡는다.
//
// 글자는 매끈한 바탕 위에 진한 경계가 몰려 있다. 종이에 잉크로 쓴 모양이다.
// 사진은 경계가 화면 전체에 고루 퍼지고 매끈한 데가 거의 없다.
// 그래서 (경계 비율 × 평탄 비율) 이 둘을 가른다.
//
// 사진에 찍힌 간판 글자와 편집자가 얹은 글자는 구분하지 못한다. 픽셀만
// 봐서는 같은 모양이기 때문이다. 그건 이 방법의 한계다.
export const SIZE = 256
const EDGE_MIN = 45 // 이보다 진한 경계만 센다
const FLAT_MAX = 6 // 3×3 안의 밝기 차이가 이보다 작으면 매끈하다고 본다

// 실측 표본에서 글자 있는 표지의 최저 점수는 0.023이었다. 놓치는 쪽이
// 헛잡는 쪽보다 나쁘므로 그 절반 아래에 선을 둔다.
export const TEXT_THRESHOLD = 0.01

export function toGray(rgba, w, h) {
  const g = new Float32Array(w * h)
  for (let i = 0, p = 0; i < g.length; i += 1, p += 4) {
    g[i] = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2]
  }
  return g
}

export function scoreGray(gray, w, h) {
  if (w < 3 || h < 3) return 0
  let edge = 0
  for (let y = 0; y < h - 1; y += 1) {
    for (let x = 0; x < w - 1; x += 1) {
      const i = y * w + x
      const dx = gray[i + 1] - gray[i]
      const dy = gray[i + w] - gray[i]
      if (Math.hypot(dx, dy) > EDGE_MIN) edge += 1
    }
  }
  let flat = 0
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      let lo = 255
      let hi = 0
      for (let j = -1; j <= 1; j += 1) {
        for (let k = -1; k <= 1; k += 1) {
          const v = gray[(y + j) * w + (x + k)]
          if (v < lo) lo = v
          if (v > hi) hi = v
        }
      }
      if (hi - lo < FLAT_MAX) flat += 1
    }
  }
  return (edge / ((w - 1) * (h - 1))) * (flat / ((w - 2) * (h - 2)))
}

export const hasText = (score) => score === null || score >= TEXT_THRESHOLD

// 브라우저 전용. 썸네일로 이미 받아온 그림을 다시 쓰므로 추가 요청이 없다.
export async function scoreCover(url) {
  const img = new Image()
  img.crossOrigin = 'anonymous' // 이게 없으면 canvas가 오염돼 픽셀을 못 읽는다
  await new Promise((resolve, reject) => {
    img.onload = resolve
    img.onerror = () => reject(new Error('표지를 불러오지 못했습니다'))
    img.src = url
  })
  const w = SIZE
  const h = Math.max(3, Math.round((SIZE * img.naturalHeight) / img.naturalWidth))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0, w, h)
  const { data } = ctx.getImageData(0, 0, w, h)
  return scoreGray(toGray(data, w, h), w, h)
}
