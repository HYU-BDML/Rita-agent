// 작업대의 «좌표 계산»만 모았다. 브라우저 API 를 안 쓴다 — 그래야 node 로
// 시험을 돌린다(`web/lib/boxedit.js` 와 같은 이유).
//
// 규칙 하나로 경우의 수가 전부 나온다:
//
//     글이 붙어 있는 변은 움직이지 않는다.
//
// 왼쪽 정렬은 왼쪽 변, 오른쪽 정렬은 오른쪽 변, 가운데 정렬은 중심이 앵커다.
// 세로 앵커는 정렬과 무관하게 언제나 위 변이다 — 굽는 쪽이 y0 에서 아래로
// 줄을 쌓는다(`render-server/cardnews_compose._draw_text_region`).
import { resize, handleAt, insideBox } from './boxedit.js'

export const 줄간격 = 1.32   // cardnews_compose.LINE_SPACING 과 같은 값이라야 한다

// 한 줄의 높이. **재어 온 줄간격이 있으면 그것을 쓴다** — 굽는 쪽
// (`cardnews_compose._draw_text_region`)과 **같은 식이라야** 고칠 때 본 그림과
// 구운 그림이 안 갈린다. 실측 게시물은 장마다 1.26·1.40·1.46 으로 다 다르다.
export function 줄높이(pt, 간격) {
  return pt * (간격 || 줄간격)
}

export function 앵커(align) {
  if (align === '가운데') return 'center'
  if (align === '오른쪽') return 'right'
  return 'left'          // 모르는 값(«단일»·«없음»·undefined)은 왼쪽
}

// 옆면·위아래. 가운데 정렬만 좌우를 대칭으로 벌린다.
export function 옆면조절(box, handle, pt좌표, align, 최소 = 12) {
  const 가로손잡이 = handle === 'e' || handle === 'w'
  if (가로손잡이 && 앵커(align) === 'center') {
    const [x0, , x1] = box
    const 중심합 = x0 + x1                       // 중심 × 2. 정수로 다뤄 반올림을 피한다
    const 반폭 = handle === 'e' ? pt좌표[0] - 중심합 / 2 : 중심합 / 2 - pt좌표[0]
    const 쓸반폭 = Math.max(반폭, 최소 / 2)
    // 홀수가 남으면 왼쪽에 더 준다 — 한 규칙으로 고정해 매번 같게 한다.
    const 새x0 = Math.floor(중심합 / 2 - 쓸반폭)
    const 새x1 = 중심합 - 새x0
    return [새x0, box[1], 새x1, box[3]]
  }
  return resize(box, handle, pt좌표, 최소)
}

// 모서리. 비율을 잠그고 글자 크기를 같은 배수로 움직인다.
export function 비율조절(box, handle, pt좌표, 글자크기, align = '왼쪽', 최소 = 12) {
  const [x0, y0, x1, y1] = box
  const 폭 = x1 - x0
  const 높이 = y1 - y0
  // 잡은 모서리의 «반대 모서리»가 기준점이다. 거기서 마우스까지의 거리를
  // 원래 네모의 대각선에 투영해 배수를 정한다 — 마우스가 삐뚤어져도 모양이
  // 안 변한다.
  const 기준x = handle.includes('w') ? x1 : x0
  const 기준y = handle.includes('n') ? y1 : y0
  const dx = Math.abs(pt좌표[0] - 기준x)
  const dy = Math.abs(pt좌표[1] - 기준y)
  const 배수원 = (dx * 폭 + dy * 높이) / (폭 * 폭 + 높이 * 높이)
  const 배수 = Math.max(배수원, 최소 / Math.min(폭, 높이), 1 / 글자크기)
  const 새폭 = 폭 * 배수
  const 새높이 = 높이 * 배수

  // 세로 앵커는 언제나 위 변. 가로 앵커는 정렬이 정한다.
  const a = 앵커(align)
  let 새x0
  if (a === 'center') 새x0 = (x0 + x1) / 2 - 새폭 / 2
  else if (a === 'right') 새x0 = x1 - 새폭
  else 새x0 = x0
  return { box: [새x0, y0, 새x0 + 새폭, y0 + 새높이], pt: 글자크기 * 배수 }
}

// **모양도 네모를 따라 늘어난다.** `테두리`·`구멍` 의 점은 «칸 왼쪽 위에서 얼마나
// 떨어졌나» 로 읽힌다 — 화면은 %(`clip-path`), 굽는 쪽은 `px - x0`. 둘 다 칸 크기로
// 나누지 않으므로, 네모만 키우면 **칸만 커지고 모양은 원래 크기 그대로 남는다**
// (사람 지적 2026-09-19: 「도형도 크기 조절 잘 되나?」). 네모가 바뀐 배수만큼 점을
// 같이 늘려 둬야 화면과 구운 그림이 둘 다 커진다.
//
// **옮기기에는 안 쓴다.** 점이 칸 기준으로 읽히므로 네모가 옮겨지면 모양은 저절로
// 따라간다 — 여기서 또 옮기면 두 번 옮겨진다.
export function 모양늘리기(점들, 옛, 새) {
  if (!점들 || !점들.length) return 점들
  const sx = (새[2] - 새[0]) / Math.max(1, 옛[2] - 옛[0])
  const sy = (새[3] - 새[1]) / Math.max(1, 옛[3] - 옛[1])
  return 점들.map(([px, py]) => [
    Math.round((새[0] + (px - 옛[0]) * sx) * 100) / 100,
    Math.round((새[1] + (py - 옛[1]) * sy) * 100) / 100,
  ])
}

// 화면 밖으로 나가도 막지 않는다 — 일부러 걸치는 디자인이 있다(실측 1장 인물).
// 그래서 `boxedit.move` 를 안 쓴다. 저것은 캔버스 안으로 가둔다.
export function 옮기기(box, dx, dy) {
  return [box[0] + dx, box[1] + dy, box[2] + dx, box[3] + dy]
}

// 줄폭들은 브라우저가 실제로 잰 값(카드 좌표계)이다. 글자 수로 어림하지 않는다.
export function 넘침(줄폭들, 줄수, box, 글자크기, 간격) {
  const 폭 = box[2] - box[0]
  const 높이 = box[3] - box[1]
  const 가로 = []
  줄폭들.forEach((w, i) => { if (w > 폭) 가로.push(i) })
  return { 가로, 세로: 줄수 * 줄높이(글자크기, 간격) > 높이 }
}

// 줄이 늘어 아래가 모자라면 네모를 **아래로** 늘린다.
//
// **위 변은 안 움직인다** — 굽는 쪽이 `y0` 에서 아래로 줄을 쌓으므로 세로 앵커가
// 위 변이다. 위를 움직이면 글이 통째로 미끄러진다.
//
// **줄이지는 않는다.** 늘리는 것은 «안 그러면 잘린다» 라서 꼭 필요하지만, 줄이는 것은
// 멋일 뿐이다. 넓혔다 좁혔다 할 때마다 네모가 저 혼자 오르내리면 손에 안 붙는다.
// 작게 하고 싶으면 아래 변을 끌면 된다.
export function 높이맞추기(box, 줄수, pt, 간격) {
  if (!줄수) return box
  const 필요 = 줄수 * 줄높이(pt, 간격)
  const 지금 = box[3] - box[1]
  if (지금 >= 필요) return box
  return [box[0], box[1], box[2], box[1] + 필요]
}

// 네모 가운데에서 마우스까지의 방향을 각도(도)로. **시계방향이 양수** —
// CSS `rotate(Ndeg)` 와 같은 부호라야 화면과 결과가 같은 쪽으로 기운다.
// 축도 가운데다(`transform-origin` 기본값).
export function 각도구하기(box, pt좌표, 스냅 = false) {
  const cx = (box[0] + box[2]) / 2
  const cy = (box[1] + box[3]) / 2
  const 도 = Math.atan2(pt좌표[1] - cy, pt좌표[0] - cx) * 180 / Math.PI
  return 스냅 ? Math.round(도 / 15) * 15 : 도
}

// ── 층 (겹친 사진끼리 누가 위냐) ──────────────────────────────────
// **글자는 언제나 사진 앞이다.** 층은 사진·로고 같은 장식끼리만 센다.

// 한 장의 장식 칸을 그릴 순서로 세운다. 장식영역의 «번호» 목록이다.
//
// **`층` 이 모든 장식에 다 있을 때만 그것을 따른다.** 하나라도 없으면 목록에
// 담긴 차례 그대로다. 반쯤 매겨진 설계도를 따르면 화면과 서버가 구운 그림이
// 갈린다. 옛 판을 열어도 그림이 안 바뀐다는 뜻이기도 하다.
export function 장식순서(card) {
  const 칸들 = card.장식영역 || []
  const 줄 = 칸들.map((_, i) => i)
  if (줄.length && 칸들.every((r) => typeof r.층 === 'number')) {
    줄.sort((a, b) => 칸들[a].층 - 칸들[b].층)
  }
  return 줄
}

// 고른 장식을 그리는 순서에서 한 칸 민다. `방향` 은 +1 이 앞(위), -1 이 뒤(밑).
//
// 새 순서를 `[{번호, 층}]` 로, 층까지 0..n-1 로 **다시 매겨** 돌려준다 —
// 부르는 쪽은 그대로 설계도에 박으면 된다. 못 밀면(맨 끝, 없는 칸) null.
export function 층밀기(줄, 번호, 방향) {
  const i = 줄.indexOf(번호)
  if (i < 0) return null
  const j = i + 방향
  if (j < 0 || j >= 줄.length) return null
  const 새 = 줄.slice()
  새[i] = 새[j]
  새[j] = 번호
  return 새.map((n, k) => ({ 번호: n, 층: k }))
}

// 어느 칸을 골랐나. **위에 그려진 것이 먼저 걸린다** — 그리는 순서가
// 배경 → 장식(층 순서) → 글자 이므로, 고르기는 그 반대로 훑는다.
//
// 후보 하나는 `{갈래, 번호, box}` 다. `손잡이반지름` 안에 손잡이가 있으면
// 그 손잡이 이름을, 없고 네모 안이면 손잡이 없이 그 칸을 준다.
// 아무것도 아니면 null.
//
// `순서` 는 `장식순서` 가 낸 장식 번호 목록이다. 안 주면 목록 차례 그대로.
//
// `고른` 을 주면 두 가지가 달라진다.
//   ① **고른 칸의 손잡이가 언제나 먼저 잡힌다** — 덮여 있어도 크기·회전·이동을
//      계속할 수 있다. 안 그러면 뒤로 보낸 순간 손이 안 닿는다.
//   ② `밑으로` 가 참이면 고른 칸 **바로 밑엣것**을 준다(맨 밑이면 도로 맨 위).
//      덮인 것을 집어내는 유일한 길이다.
export function 고를것(장식들, 글자들, 점, 손잡이반지름 = 14, 순서 = null,
                     고른 = null, 밑으로 = false) {
  const 후보 = []
  ;(순서 || 장식들.map((_, i) => i)).forEach((i) => {
    if (장식들[i]) 후보.push({ 갈래: '장식', 번호: i, box: 장식들[i] })
  })
  글자들.forEach((b, i) => 후보.push({ 갈래: '글자', 번호: i, box: b }))

  if (고른) {
    const c = 후보.find((x) => x.갈래 === 고른.갈래 && x.번호 === 고른.번호)
    const h = c && handleAt(c.box, 점, 손잡이반지름)
    if (h) return { ...c, 손잡이: h }
  }

  const 걸린것 = []
  for (let k = 후보.length - 1; k >= 0; k--) {
    const c = 후보[k]
    const h = handleAt(c.box, 점, 손잡이반지름)
    if (h) return { ...c, 손잡이: h }
    if (insideBox(c.box, 점)) 걸린것.push({ ...c, 손잡이: null })
  }
  if (!걸린것.length) return null
  if (밑으로 && 고른 && 걸린것.length > 1) {
    const i = 걸린것.findIndex((x) => x.갈래 === 고른.갈래 && x.번호 === 고른.번호)
    if (i >= 0) return 걸린것[(i + 1) % 걸린것.length]
  }
  return 걸린것[0]
}

// **커서 자리에서 줄을 쪼갠다.**
//
// 예전엔 커서가 어디 있든 그 줄 «뒤» 에 빈 줄을 하나 더했다. 그리고 카드를 다시
// 그리면서 커서가 날아갔다 — 빈 줄은 눈에 안 보이니 아무 일도 안 난 것처럼
// 보였다(사람 지적 2026-08-29: 「엔터 눌렀는데 다음 줄로 왜 안 가는 거임?」).
//
// 커서가 줄 끝이면 뒤에 빈 줄이, 맨 앞이면 앞에 빈 줄이 생긴다 — 둘 다 사람이
// 기대하는 그대로다.
export function 줄쪼개기(줄들, k, 커서) {
  const 원본 = (줄들 || []).map((x) => x || '')
  if (k < 0 || k >= 원본.length) return 원본
  const 글 = 원본[k]
  const 자리 = Math.max(0, Math.min(커서 | 0, 글.length))
  const 난것 = [...원본]
  난것.splice(k, 1, 글.slice(0, 자리), 글.slice(자리))
  return 난것
}

// ── 글줄 — 글자 효과는 글자에 붙는다 (사람 지시 여섯 번, 2026-09-28) ──────
//
// 「위치로 구분하면 죽여」. 글자 칸의 `글줄` 은 줄마다 덩어리 목록이고 덩어리마다
// 글과 효과가 있다. **숫자 위치는 저장하지 않는다.** 아래 함수들이 받는 «곳»
// (`{줄, 시작, 끝}`)은 사람이 긁은 **그 순간** 화면에서 읽은 자리이고, 덩어리를
// 자르는 데 한 번 쓰고 버린다. 설계: docs/superpowers/specs/2026-09-28-카드뉴스-글자효과는-글자에-design.md
//
// 글자 자리는 자바스크립트 문자열 칸(UTF-16)이다 — 화면 셀렉션이 세는 것과 같다.

export const 덩어리효과 = ['색', '형광펜', '굵게', '밑줄']

/** 덩어리의 효과만. `_고름`(색 고르개가 열린 동안의 표)은 효과가 아니다. */
export function 효과만(d) {
  const 난것 = {}
  for (const k of 덩어리효과) {
    const v = d && d[k]
    if (v !== undefined && v !== null && v !== false && v !== '') 난것[k] = v
  }
  return 난것
}

export function 같은효과(a, b) {
  const x = 효과만(a)
  const y = 효과만(b)
  const kx = Object.keys(x)
  return kx.length === Object.keys(y).length && kx.every((k) => x[k] === y[k])
}

/** 빈 덩어리를 빼고, 이웃한 두 덩어리의 효과(와 `_고름` 표)가 같으면 합친다. */
export function 덩어리정리(덩어리들) {
  const 난것 = []
  for (const d of 덩어리들 || []) {
    const 글 = String((d && d.글) || '')
    if (!글) continue
    const 앞 = 난것[난것.length - 1]
    if (앞 && 같은효과(앞, d) && !!앞._고름 === !!d._고름) { 앞.글 += 글; continue }
    난것.push({ 글, ...효과만(d), ...(d._고름 ? { _고름: true } : {}) })
  }
  return 난것
}

export function 줄글(줄) { return ((줄 && 줄.덩어리) || []).map((d) => d.글).join('') }

/** `lines` 읽기용 사본 — 서버의 `edit_store.글줄글들` 과 같은 셈이다. */
export function 글줄글들(글줄) { return (글줄 || []).map(줄글) }

// 글자 하나하나에 효과를 붙여 늘어놓는다 — 다시 끊을 때만 잠깐 쓴다(저장 안 함).
function _글자들(덩어리들) {
  const 난것 = []
  for (const d of 덩어리들 || []) {
    const 효과 = { ...효과만(d), ...(d._고름 ? { _고름: true } : {}) }
    for (let i = 0; i < d.글.length; i++) 난것.push({ ch: d.글[i], 효과 })
  }
  return 난것
}
function _덩어리로(글자들) { return 덩어리정리(글자들.map((g) => ({ 글: g.ch, ...g.효과 }))) }
const _같은표 = (a, b) => 같은효과(a, b) && !!a._고름 === !!b._고름

// 글줄을 문장으로 묶는다 — 문장은 `새문장` 줄에서 시작한다.
function _문장들(글줄) {
  const 난것 = []
  for (const 줄 of 글줄 || []) {
    if (줄.새문장 || !난것.length) 난것.push([줄])
    else 난것[난것.length - 1].push(줄)
  }
  return 난것
}

/**
 * **다시 끊는다.** 문장마다 글자를 효과째 늘어놓고, 폭에 맞춰 띄어쓰기에서 끊는다.
 * 엔터 줄(문장 첫 줄)은 그대로이고 넘어온 줄만 바뀐다. 글머리·정렬은 문장 첫 줄에 남는다.
 *
 * 넘어온 자리에는 띄어쓰기 하나가 있었다(끊을 때 먹혔다) — 앞뒤 글자의 효과가 같으면
 * 그 띄어쓰기도 그 효과를 받는다(형광펜 띠가 안 끊긴다). 겹친 띄어쓰기는 하나로 준다.
 * **낱말을 쪼개지 않는다** — 한 낱말이 폭보다 길면 그 줄은 넘친다(「넘침」 이 알린다).
 * `잰다(덩어리들)` 는 한 줄 폭 — 굵은 덩어리는 굵은 글꼴로 재야 한다.
 */
export function 다시끊기(글줄, 폭, 잰다) {
  const 난것 = []
  for (const 줄들 of _문장들(글줄)) {
    const 첫 = 줄들[0]
    const 문장칸 = {}
    for (const k of ['글머리', '정렬']) if (첫[k] !== undefined) 문장칸[k] = 첫[k]
    const 글자들 = []
    줄들.forEach((줄, i) => {
      const 이번 = _글자들(줄.덩어리)
      if (i > 0 && 글자들.length && 이번.length) {
        const 앞 = 글자들[글자들.length - 1].효과
        글자들.push({ ch: ' ', 효과: _같은표(앞, 이번[0].효과) ? { ...앞 } : {} })
      }
      글자들.push(...이번)
    })
    const 낱말들 = []
    let 지금 = null
    let 띄움 = null
    for (const g of 글자들) {
      if (/\s/.test(g.ch)) {
        if (지금) { 낱말들.push(지금); 지금 = null }
        if (띄움 === null) 띄움 = g.효과
        continue
      }
      if (!지금) { 지금 = { 글자들: [], 앞띄움: 낱말들.length ? (띄움 || {}) : null }; 띄움 = null }
      지금.글자들.push(g)
    }
    if (지금) 낱말들.push(지금)
    const 줄글자들 = []
    let 한줄 = []
    for (const w of 낱말들) {
      const 붙인것 = 한줄.length ? [...한줄, { ch: ' ', 효과: w.앞띄움 || {} }, ...w.글자들] : [...w.글자들]
      if (한줄.length && 잰다(_덩어리로(붙인것)) > 폭) { 줄글자들.push(한줄); 한줄 = [...w.글자들] } else 한줄 = 붙인것
    }
    if (한줄.length) 줄글자들.push(한줄)
    if (!줄글자들.length) 줄글자들.push([])
    줄글자들.forEach((gs, i) => 난것.push({ 새문장: i === 0, ...(i === 0 ? 문장칸 : {}), 덩어리: _덩어리로(gs) }))
  }
  return 난것
}

/** 그 줄의 `자리`(글자 칸)에서 덩어리를 자른다. 합치지 않는다 — 곧바로 효과를 걸려고 자르는 것이다. */
export function 경계내기(줄, 자리) {
  const 난것 = []
  let 흐른 = 0
  for (const d of 줄.덩어리 || []) {
    const 끝 = 흐른 + d.글.length
    if (흐른 < 자리 && 자리 < 끝) 난것.push({ ...d, 글: d.글.slice(0, 자리 - 흐른) }, { ...d, 글: d.글.slice(자리 - 흐른) })
    else 난것.push({ ...d })
    흐른 = 끝
  }
  return { ...줄, 덩어리: 난것 }
}

/**
 * **엔터** — 줄 k 의 `자리` 에서 문장을 둘로 나눈다. 뒤쪽은 새 문장이 되고 글머리·정렬은
 * 안 붙는다(앞 문장이 가진다 — 만든 뒤엔 규칙이 끼어들지 않는다). 효과는 양쪽 글자에 그대로다.
 * 문장 맨 앞에서 치면 빈 줄을 위에 끼운다(글머리는 글과 남는다). 줄 수는 부르는 쪽이 `다시끊기` 로 맞춘다.
 */
export function 문장나누기(글줄, k, 자리) {
  if (자리 === 0 && 글줄[k] && 글줄[k].새문장) return [...글줄.slice(0, k), { 새문장: true, 덩어리: [] }, ...글줄.slice(k)]
  const 줄 = 경계내기(글줄[k], 자리)
  const 앞 = []
  const 뒤 = []
  let 흐른 = 0
  for (const d of 줄.덩어리) { (흐른 < 자리 ? 앞 : 뒤).push(d); 흐른 += d.글.length }
  let 끝 = k + 1
  while (끝 < 글줄.length && !글줄[끝].새문장) 끝++
  return [...글줄.slice(0, k), { ...줄, 덩어리: 덩어리정리(앞) }, { 새문장: true, 덩어리: 덩어리정리(뒤) },
    ...글줄.slice(k + 1, 끝), ...글줄.slice(끝)]
}

function _긁은데자르기(글줄, 곳들) {
  const 새 = 글줄.map((줄) => ({ ...줄, 덩어리: (줄.덩어리 || []).map((d) => ({ ...d })) }))
  for (const 곳 of 곳들 || []) if (새[곳.줄]) 새[곳.줄] = 경계내기(경계내기(새[곳.줄], 곳.시작), 곳.끝)
  return 새
}
// 없는 줄을 가리키는 곳은 든 덩어리가 없다 — 건너뛴다(`_긁은데자르기` 와 같다).
function _든덩어리(줄, 시작, 끝) {
  const 난것 = []
  let 흐른 = 0
  ;((줄 && 줄.덩어리) || []).forEach((d, i) => {
    const 뒤 = 흐른 + d.글.length
    if (시작 <= 흐른 && 뒤 <= 끝 && 뒤 > 흐른) 난것.push(i)
    흐른 = 뒤
  })
  return 난것
}
const _정리 = (글줄) => 글줄.map((줄) => ({ ...줄, 덩어리: 덩어리정리(줄.덩어리) }))

/** 글자색 — 긁은 글자에만. 칸 색과 같은 색(또는 빈 색)이면 뺀다 — 되돌릴 길이다. */
export function 색걸기(글줄, 곳들, 새색, 칸색) {
  const 새 = _긁은데자르기(글줄, 곳들)
  for (const 곳 of 곳들 || []) {
    for (const i of _든덩어리(새[곳.줄], 곳.시작, 곳.끝)) {
      const d = 새[곳.줄].덩어리[i]
      if (!새색 || 새색 === 칸색) delete d.색
      else d.색 = 새색
    }
  }
  return _정리(새)
}

/**
 * 형광펜·굵게·밑줄 — **토글이다**(지금 규칙 그대로). 긁은 곳에 그 효과가 조금이라도
 * 걸려 있으면 그 줄에서 이어진 묶음을 «통째로» 뺀다. 아니면 긁은 글자에 건다.
 */
export function 효과바꾸기(글줄, 곳들, 이름, 값 = true) {
  const 새 = _긁은데자르기(글줄, 곳들)
  for (const 곳 of 곳들 || []) {
    const 줄 = 새[곳.줄]
    const 든것 = _든덩어리(줄, 곳.시작, 곳.끝)
    if (든것.some((i) => 줄.덩어리[i][이름])) {
      const 뺄것 = new Set()
      for (const i of 든것) {
        if (!줄.덩어리[i][이름]) continue
        let a = i
        let b = i
        while (a - 1 >= 0 && 줄.덩어리[a - 1][이름]) a--
        while (b + 1 < 줄.덩어리.length && 줄.덩어리[b + 1][이름]) b++
        for (let j = a; j <= b; j++) 뺄것.add(j)
      }
      for (const j of 뺄것) delete 줄.덩어리[j][이름]
    } else {
      for (const i of 든것) 줄.덩어리[i][이름] = 값
    }
  }
  return _정리(새)
}

/** 안 긁고 형광펜 색을 바꾸면 이미 칠한 형광펜의 색만 바꾼다(지금 규칙). */
export function 형광색바꾸기(글줄, 새색) {
  return _정리(글줄.map((줄) => ({ ...줄, 덩어리: (줄.덩어리 || []).map((d) => (d.형광펜 ? { ...d, 형광펜: 새색 } : { ...d })) })))
}

/** 글머리 — `줄들`(0부터)이 든 문장들에. 그 문장들이 다 이 갈래면 뺀다. `줄들` 이 비면 모든 문장. */
export function 글머리바꾸기(글줄, 줄들, 갈래) {
  const 첫줄 = (k) => { let a = k; while (a > 0 && !글줄[a].새문장) a--; return a }
  const 대상 = new Set((줄들 && 줄들.length ? 줄들 : 글줄.map((_, k) => k)).map(첫줄))
  const 다있나 = [...대상].every((k) => 글줄[k].글머리 === 갈래)
  return 글줄.map((줄, k) => {
    if (!대상.has(k)) return { ...줄 }
    const 새줄 = { ...줄 }
    if (다있나) delete 새줄.글머리
    else 새줄.글머리 = 갈래
    return 새줄
  })
}

/** 긁은 데가 전부 그 효과인가 — 단추를 파랗게 할지(손잡이엔 상태 표시까지). */
export function 덮였나(글줄, 곳들, 이름) {
  if (!곳들 || !곳들.length) return false
  const 새 = _긁은데자르기(글줄, 곳들)
  return 곳들.every((곳) => {
    const 든것 = _든덩어리(새[곳.줄], 곳.시작, 곳.끝)
    return 든것.length > 0 && 든것.every((i) => 새[곳.줄].덩어리[i][이름])
  })
}

/**
 * **색 고르개가 열린 동안 긁은 글자를 기억한다** — 숫자가 아니라 그 덩어리에 표(`_고름`)를
 * 단다. 색을 한 번 걸고 다시 그려도 표가 따라가서 두 번째 색도 같은 글자에 걸린다.
 * 합치지 않는다 — 합치면 표가 번진다(`덩어리정리` 는 표가 같을 때만 합친다).
 */
export function 고름표달기(글줄, 곳들) {
  const 새 = _긁은데자르기(글줄, 곳들)
  for (const 곳 of 곳들 || []) for (const i of _든덩어리(새[곳.줄], 곳.시작, 곳.끝)) 새[곳.줄].덩어리[i]._고름 = true
  return 새
}
export function 고름표떼기(글줄) {
  return (글줄 || []).map((줄) => ({ ...줄, 덩어리: 덩어리정리((줄.덩어리 || []).map(({ _고름, ...d }) => d)) }))
}
/** 표 단 글자들의 곳 — 이 순간 한 번 쓰려고 센다. */
export function 고름곳들(글줄) {
  const 난것 = []
  ;(글줄 || []).forEach((줄, k) => {
    let 흐른 = 0
    for (const d of 줄.덩어리 || []) {
      const 뒤 = 흐른 + d.글.length
      if (d._고름) {
        const 앞 = 난것[난것.length - 1]
        if (앞 && 앞.줄 === k && 앞.끝 === 흐른) 앞.끝 = 뒤
        else 난것.push({ 줄: k, 시작: 흐른, 끝: 뒤 })
      }
      흐른 = 뒤
    }
  })
  return 난것
}
