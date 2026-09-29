// 이미 그은 네모를 손잡이로 고쳐 그리는 계산만 모았다.
//
// 캔버스·이벤트를 끌어들이면 브라우저 없이 시험을 못 돌린다. 좌표만 다루는
// 순수 함수로 빼서, label.js 는 이 결과를 캔버스에 그리기만 하면 되게 한다.

export const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

// 손잡이는 네모 변 위의 점이다. 각 손잡이가 x·y 축에서 어디 있는지(0=시작 쪽, 0.5=가운데, 1=끝 쪽).
const AT = {
  nw: [0, 0], n: [0.5, 0], ne: [1, 0], e: [1, 0.5],
  se: [1, 1], s: [0.5, 1], sw: [0, 1], w: [0, 0.5],
}

// 반지름 r 안에 손잡이가 있으면 그 이름을, 없으면 null 을 준다.
export function handleAt(box, pt, r = 10) {
  const [x0, y0, x1, y1] = box
  for (const h of HANDLES) {
    const [fx, fy] = AT[h]
    const hx = x0 + (x1 - x0) * fx
    const hy = y0 + (y1 - y0) * fy
    if (Math.abs(pt[0] - hx) <= r && Math.abs(pt[1] - hy) <= r) return h
  }
  return null
}

export function insideBox(box, pt) {
  const [x0, y0, x1, y1] = box
  return pt[0] >= x0 && pt[0] <= x1 && pt[1] >= y0 && pt[1] <= y1
}

// 손잡이 이름의 글자로 어느 변을 움직일지 정한다: n→y0, s→y1, w→x0, e→x1.
// 움직인 뒤 폭·높이가 min 보다 작아지면, 잡은 변을 반대쪽에서 min 만큼 뗀 자리로
// 되돌린다 — 그래야 좌표가 뒤집혀 서버의 "네모가 뒤집혔습니다" 거절로 저장 전체가
// 실패하는 일이 없다.
export function resize(box, handle, pt, min = 12) {
  let [x0, y0, x1, y1] = box
  if (handle.includes('w')) x0 = pt[0]
  if (handle.includes('e')) x1 = pt[0]
  if (handle.includes('n')) y0 = pt[1]
  if (handle.includes('s')) y1 = pt[1]

  if (x1 - x0 < min) {
    if (handle.includes('w')) x0 = x1 - min
    else if (handle.includes('e')) x1 = x0 + min
  }
  if (y1 - y0 < min) {
    if (handle.includes('n')) y0 = y1 - min
    else if (handle.includes('s')) y1 = y0 + min
  }
  return [x0, y0, x1, y1]
}

// 화면(0..w, 0..h) 밖으로 안 나가게 통째로 밀어 옮긴다. 폭·높이는 그대로 둔다.
export function move(box, dx, dy, w, h) {
  const [x0, y0, x1, y1] = box
  const bw = x1 - x0
  const bh = y1 - y0
  const nx0 = Math.min(Math.max(x0 + dx, 0), w - bw)
  const ny0 = Math.min(Math.max(y0 + dy, 0), h - bh)
  return [nx0, ny0, nx0 + bw, ny0 + bh]
}

// 점을 담은 네모 중 가장 작은 것을 고른다. 큰 배경 도형 위에 작은 번호칩이
// 얹혀 있는 게 흔한데, 큰 것부터 고르면 칩은 영영 못 집는다 — 그리는 순서
// (면적 내림차순)의 반대다.
//
// local 은 「이 네모의 좌표계로 점을 되돌리는 함수」다. 기울인 네모(angle)를 집으려면
// 점을 그 네모만큼 거꾸로 돌려서 봐야 하는데, 그 계산은 label.js 것이라 여기 안 둔다.
// 기본값은 그대로 두기라 안 넘기면 오늘과 똑같이 돈다.
export function pick(boxes, pt, local = (_b, p) => p) {
  let best = null
  let bestArea = Infinity
  for (const b of boxes) {
    if (!insideBox(b.box, local(b, pt))) continue
    const [x0, y0, x1, y1] = b.box
    const area = (x1 - x0) * (y1 - y0)
    if (area < bestArea) { best = b; bestArea = area }
  }
  return best
}
