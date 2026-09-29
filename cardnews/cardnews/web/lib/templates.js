// 디자인 틀 저장소를 «그림으로» 고르는 화면.
//
// **이름만으로는 못 고른다.** 틀 이름이 `DNUFIa4NIkK` 이던 시절에는 무엇을
// 고르는지 알 길이 없었고, 별명을 붙여도 「둥근 네모에 노란 강조」를 낱말로
// 적을 수는 없다. 그래서 표지 한 장을 같이 띄운다.
//
// Dify 고르는 칸은 **이름**을 받는다. 그래서 이 화면의 일은 결국 하나다 —
// 보고, 고르고, 그 이름을 가져가게 하는 것.


// **창고를 곧장 안 읽는다.** 브라우저가 딴 집(S3)의 글 파일을 읽으려 하면
// 허락이 없어 `Failed to fetch` 로 끝난다 — 화면이 텅 비어 보이던 진짜 까닭이
// 이것이었다(2026-08-27). 그림은 허락이 필요 없어서 잘 나온다.
//
// 그래서 워커가 중계한다. 서버끼리는 그 규칙이 없다.
// 화면 글자는 한 벌뿐이다 — `수집기말.js`. 여기서 사본을 만들지 않는다.
import { 말하기, 낱말 } from './수집기말.js'

/** 401 은 탈이 아니라 «아직 안 들어왔다» 는 뜻이다 — 할 일을 그대로 적는다. */
export const 잠김말 = (언어) => 말하기(언어)('공_암호먼저')
export const 목록길 = '/api/catalog/templates'
export const 만든것길 = '/api/catalog/made'
export const 말투길 = '/api/catalog/tones'

/** 창고의 틀 목록. 없거나 못 읽으면 빈 목록 — 첫 판이면 없는 게 맞다. */
export async function 목록읽기(fetchFn = fetch, 언어) {
  const res = await fetchFn(`${목록길}?t=${Date.now()}`, { cache: 'no-store' })
  // **401 은 탈이 아니라 «아직 안 들어왔다» 는 뜻이다.** 「못 읽었습니다」로
  // 뭉개면 사람이 무엇을 해야 할지 모른다 — 할 일을 그대로 적는다.
  if (res.status === 401) throw new Error(잠김말(언어))
  if (!res.ok) throw new Error(말하기(언어)('템_못읽음'))
  const 것 = await res.json()
  return Array.isArray(것) ? 것 : []
}

/** 역할 세는 칸(`{훅:1, 사례:4}`)을 사람이 읽는 한 줄로. */
export function 역할줄(역할, 언어) {
  const 것들 = Object.entries(역할 || {}).filter(([, n]) => n > 0)
  if (!것들.length) return ''
  return 것들
    .map(([이름, n]) => [낱말('역할', 이름, 언어), n])
    .map(([이름, n]) => (n > 1 ? `${이름}×${n}` : 이름))
    .join(' · ')
}

/**
 * 목록을 화면에 걸 차례로 손질한다. **새것이 위로 온다** — 방금 라벨한 것을
 * 찾으러 아래까지 훑게 두지 않는다.
 */
export function 늘어놓기(목록) {
  return [...(목록 || [])]
    .filter((x) => x && (x.이름 || x.코드))
    .sort((a, b) => String(b.만든날 || '').localeCompare(String(a.만든날 || '')))
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

/** 틀 한 장의 쪽지. 그림이 없으면 그 자리를 이름으로 메운다. */
export function 카드(줄, 언어) {
  const 말 = 말하기(언어)
  // **화면에 거는 이름과 단추에 싣는 이름이 다르다.** 단추 값은 서버가 틀을
  // 찾는 열쇠라 창고에 적힌 그대로여야 하고, 화면 이름은 영어판이 있으면
  // 그쪽을 쓴다. 한 벌로 묶으면 영어로 골랐을 때 「그런 틀 없다」가 된다.
  const 값이름 = 줄.이름 || 줄.코드
  const 이름 = 보일이름(줄, 언어)
  const 얼굴 = 줄.미리보기
    ? `<img src="${esc(줄.미리보기)}" alt="${esc(이름)}" loading="lazy">`
    : `<div class="tpl-noface">${esc(말('템_표지없음'))}</div>`
  const 역할 = 역할줄(줄.역할, 언어)
  return `<div class="tpl-card" data-name="${esc(값이름)}">
    <div class="tpl-face">${얼굴}</div>
    <div class="tpl-name">${esc(이름)}</div>
    <div class="tpl-meta">${esc(말('결_몇장', 줄.장수 || 0))}${역할 ? ` · ${esc(역할)}` : ''}</div>
    <div class="tpl-meta">${esc(줄.만든날 || '')} · ${esc(낱말('나온곳', 줄.나온곳 || '', 언어))}</div>
    <div class="tpl-row">
      <button class="tpl-make" data-name="${esc(값이름)}"
              data-보임="${esc(이름)}">${esc(말('템_이걸로만들기'))}</button>
      <button class="tpl-copy" data-name="${esc(값이름)}">${esc(말('템_이름복사'))}</button>
      <button class="tpl-rename" data-code="${esc(줄.코드)}"
              data-name="${esc(값이름)}">${esc(말('템_이름바꾸기'))}</button>
      <button class="tpl-peek" data-code="${esc(줄.코드)}"
              data-name="${esc(값이름)}"
              data-보임="${esc(이름)}">${esc(말('템_자세히'))}</button>
    </div>
  </div>`
}

/** 화면에 걸 템플릿 이름. 창고에 영어 이름이 있으면 그것을 쓴다. */
export function 보일이름(줄, 언어) {
  const 기본 = 줄.이름 || 줄.코드
  const 영 = String(줄.이름영어 || '').trim()
  return (String(언어) === '영어' && 영) ? 영 : 기본
}

/** 격자 전체. 빈 목록이면 «왜 비었는지» 를 적는다. */
export function 격자(목록, 언어) {
  const 줄들 = 늘어놓기(목록)
  if (!줄들.length) {
    return `<p class="tpl-empty">${esc(말하기(언어)('템_아직없음'))}</p>`
  }
  return `<div class="tpl-grid">${줄들.map((x) => 카드(x, 언어)).join('')}</div>`
}


// ── 만든 것 ────────────────────────────────────────────────────
//
// **만든 카드뉴스를 다시 찾을 길이 없었다.** 만들 때마다 작업대 주소가 나오는데
// 그 창을 닫으면 끝이었다 — 틀은 목록이 있는데 결과물은 없었다.
//
// 틀 목록과 **같은 결로** 읽는다 — 창고의 글 파일 하나. 새 문이 필요 없다.

/** 만든 카드뉴스 목록. 아직 하나도 없으면 빈 목록 — 첫 판이면 없는 게 맞다. */
export async function 만든것읽기(fetchFn = fetch, 언어) {
  const res = await fetchFn(`${만든것길}?t=${Date.now()}`, { cache: 'no-store' })
  if (res.status === 401) throw new Error(잠김말(언어))
  if (res.status === 404) return []
  if (!res.ok) throw new Error(말하기(언어)('만_못읽음'))
  const 것 = await res.json()
  return Array.isArray(것) ? 것 : []
}

/** 만든 것 한 장의 쪽지. 누르면 그 작업대가 열린다. */
export function 만든칸(줄, 언어) {
  const 말 = 말하기(언어)
  const 제목 = 줄.제목 || 말('만_글없음')
  const 얼굴 = 줄.표지
    ? `<img src="${esc(줄.표지)}" alt="${esc(제목)}" loading="lazy">`
    : `<div class="tpl-noface">${esc(말('템_표지없음'))}</div>`
  return `<a class="tpl-card" href="${esc(줄.주소)}" target="_blank" rel="noopener">
    <div class="tpl-face">${얼굴}</div>
    <div class="tpl-name">${esc(제목)}</div>
    <div class="tpl-meta">${esc(말('결_몇장', 줄.장수 || 0))} · ${esc((줄.만든날 || '').slice(0, 10))}</div>
  </a>`
}

/** 만든 것 격자. 비었으면 «왜 비었는지» 를 적는다. */
export function 만든격자(목록, 언어) {
  const 줄들 = (목록 || []).filter((x) => x && x.주소)
  if (!줄들.length) {
    return `<p class="tpl-empty">${esc(말하기(언어)('만_아직없음'))}</p>`
  }
  return `<div class="tpl-grid">${줄들.map((x) => 만든칸(x, 언어)).join('')}</div>`
}


// ── 말투 ────────────────────────────────────────────────────────
//
// **디자인과 말투는 따로 고른다**(사람 결정 2026-08-27). 여태 둘이 한 덩이라
// 「이 디자인에 저 말투」를 못 골랐다.

/** 저장된 말투 목록. 아직 없으면 빈 목록. */
export async function 말투읽기(fetchFn = fetch, 언어) {
  const res = await fetchFn(`${말투길}?t=${Date.now()}`, { cache: 'no-store' })
  if (res.status === 401) throw new Error(잠김말(언어))
  if (res.status === 404) return []
  if (!res.ok) throw new Error(말하기(언어)('만_말투못읽음'))
  const 것 = await res.json()
  return Array.isArray(것) ? 것 : []
}

// 「이 디자인 그대로」를 뜻하는 값. **빈 글자다** — 서버가 말투를 안 고른 것으로
// 보고 틀에 실린 말투를 따른다.
export const 그대로 = ''

/** 말투 고르는 칸. 첫 줄은 늘 「이 디자인 그대로」다. */
export function 말투칸(목록, 언어) {
  const 줄들 = [`<option value="">${esc(말하기(언어)('만_말투그대로'))}</option>`]
  for (const t of 목록 || []) {
    const 이름 = t.이름 || t.코드
    if (!이름) continue
    // **값은 코드다 — 이름이 아니다.** 이름은 사람이 바꾼다. 화면을 열어 둔
    // 사이에 이름이 바뀌면 옛 이름을 보내게 되고, 서버는 「그런 말투가 없다」로
    // 막는다(실물 2026-08-30: 「DbmjT0Cj8-I 말투」가 「퍼플 화장품 광고 말투」로
    // 바뀐 뒤 옛 쪽에서 고르니 실패했다). 코드는 안 바뀐다.
    // 서버는 이름과 코드를 둘 다 받아 준다(`app.말투찾기`).
    줄들.push(`<option value="${esc(t.코드 || 이름)}">${esc(이름)} — ${esc(t.설명 || '')}</option>`)
  }
  return 줄들.join('')
}

/** 만들기 칸. 고를 것 넷 — 디자인(이미 정해짐)·말투·주제·원고. */
export function 만들기칸(틀이름, 말투목록, 언어) {
  const 말 = 말하기(언어)
  return `<div class="make-box">
    <div class="tpl-name">${esc(말('만_제목', 틀이름))}</div>
    <label class="make-줄">${esc(말('만_주제'))}
      <input id="makeTopic" type="text" placeholder="${esc(말('만_주제예시'))}">
    </label>
    <label class="make-줄">${esc(말('만_말투'))}
      <select id="makeTone">${말투칸(말투목록, 언어)}</select>
    </label>
    <label class="make-줄">${esc(말('만_원고'))}
      <textarea id="makeScript" rows="4"></textarea>
    </label>
    <div class="tpl-row">
      <button id="makeGo">${esc(말('만_만들기'))}</button>
      <button id="makeCancel">${esc(말('만_닫기'))}</button>
      <span id="makeStatus" class="tpl-meta"></span>
    </div>
    <div id="makeOut"></div>
  </div>`
}

/** 다 됐을 때 보여 줄 것 — 표지와 작업대 링크. */
export function 만든결과(result) {
  const 칸들 = (result && result.components) || []
  const 그림 = 칸들.find((c) => c.type === 'image')
  const 링크 = 칸들.find((c) => c.type === 'link')
  return `<div class="make-done">
    ${그림 ? `<img src="${esc(그림.url)}" alt="${esc(그림.alt || '')}">` : ''}
    <p class="tpl-meta">${esc((result && result.content) || '')}</p>
    ${링크 ? `<a href="${esc(링크.url)}" target="_blank" rel="noopener">${esc(링크.label)}</a>` : ''}
  </div>`
}


// ── 틀 들여다보기 ──────────────────────────────────────────────
//
// **틀 파일은 사람이 볼 게 못 된다.** 기계가 읽는 날것이라 숫자만 죽 늘어선다.
// 그런데 그 안에 그림으로 그릴 재료는 다 있다 — 네모 자리, 도형 색, 글자
// 크기·위계·자수. 그걸 장마다 한 장씩 그린다.

export const 틀길 = (코드) => `/api/template/${encodeURIComponent(코드)}`

/** 틀 하나를 읽는다. 창고를 곧장 안 읽는 까닭은 위 `목록길` 과 같다. */
export async function 틀읽기(코드, fetchFn = fetch, 언어) {
  const res = await fetchFn(틀길(코드), { cache: 'no-store' })
  if (res.status === 401) throw new Error(잠김말(언어))
  if (!res.ok) throw new Error(말하기(언어)('템_하나못읽음'))
  return res.json()
}

// 종류마다 색. **도형은 잰 색 그대로 칠한다** — 그게 그 디자인의 알맹이다.
const _자리색 = { 사진: 'rgba(90,120,200,.20)', 인물: 'rgba(90,120,200,.20)',
                로고: 'rgba(150,150,150,.25)', 장식: 'rgba(200,140,60,.22)' }

// 이름을 적어 넣을 만한 크기인가. **몫으로 잰다** — 그림 칸이 150px 라
// 가로 14%·세로 4% 아래면 8px 글자도 안 들어간다(실측).
function _들어가나(box, W, H) {
  const [x0, y0, x1, y1] = box || [0, 0, 0, 0]
  return (x1 - x0) / W >= 0.14 && (y1 - y0) / H >= 0.04
}

// 이름 글자색. **도형은 제 색 위에 얹히므로** 밝기를 보고 고른다 — 검은
// 알약에 검은 글씨를 쓰면 안 보인다.
function _글색(r) {
  if (r.종류 !== '도형' || !r.채움색) return 'rgba(0,0,0,.55)'
  const 색 = String(r.채움색).replace('#', '')
  if (색.length !== 6) return 'rgba(0,0,0,.55)'
  const [빨, 초, 파] = [0, 2, 4].map((i) => parseInt(색.slice(i, i + 2), 16))
  const 밝기 = (빨 * 299 + 초 * 587 + 파 * 114) / 1000
  return 밝기 < 140 ? 'rgba(255,255,255,.8)' : 'rgba(0,0,0,.6)'
}

function _배경칠(배경) {
  const 종류 = (배경 || {}).종류
  if (종류 === '단색') return 배경.hex || '#FFFFFF'
  if (종류 === '그라데이션') {
    const 멈춤 = String(배경.띠 || '').match(/#[0-9A-Fa-f]{6}@[\d.]+%/g) || []
    const 속 = 멈춤.map((x) => x.replace('@', ' ')).join(', ')
    return 속 ? `linear-gradient(180deg, ${속})` : '#FFFFFF'
  }
  return 배경.hex || '#F2F2F4'
}

/** 장 한 칸. 배경 위에 장식과 글자 자리를 그대로 얹는다. */
export function 틀장(장, 캔버스, 언어) {
  const 말 = 말하기(언어)
  const W = (캔버스 || {}).w || 1080
  const H = (캔버스 || {}).h || 1350
  const 몫 = (v, 전체) => `${(v / 전체) * 100}%`
  const 자리 = (box) => {
    const [x0, y0, x1, y1] = box || [0, 0, 0, 0]
    return `left:${몫(x0, W)};top:${몫(y0, H)};width:${몫(x1 - x0, W)};height:${몫(y1 - y0, H)}`
  }
  const 장식 = (장.장식영역 || [])
    // **굽는 쪽과 똑같이 거른다.** 색을 못 잰 도형은 굽을 때 안 그려진다
    // (`cardnews_compose`) — 여기서만 회색으로 그리면 그림과 결과가 어긋난다.
    // 사람이 도형과 글자에 각각 모양을 주면 도형이 둘이 되는데, 그때 색 없는
    // 쪽이 있는 쪽을 덮어 «검은 알약이 회색» 으로 보였다(실물 2026-08-27).
    .filter((r) => r.종류 !== '도형' || r.채움색)
    .map((r) => {
      const 색 = r.종류 === '도형'
        ? r.채움색 : (_자리색[r.종류] || 'rgba(0,0,0,.10)')
      const 둥글 = (r.테두리 || []).length > 8 ? '999px' : '3px'
      // **이름을 적되, 안 들어가면 안 적는다.** 작은 네모에 글자를 욱여넣으면
      // 삐져나와 옆 칸을 덮는다. 못 적을 때도 마우스를 올리면 뜬다(title).
      const 이름 = 낱말('종류', r.종류, 언어)
      return `<div class="pk-칸" style="${자리(r.box)};background:${esc(색)};` +
        `border-radius:${둥글};color:${_글색(r)}" title="${esc(이름)}">` +
        `${_들어가나(r.box, W, H) ? `<i>${esc(이름)}</i>` : ''}</div>`
    }).join('')
  const 글자 = (장.글자슬롯 || []).map((t) => {
    const 작나 = !_들어가나(t.box, W, H)
    const 위계 = t.위계 ? 낱말('위계', t.위계, 언어) : 말('보_글자')
    const 줄 = t.줄수 > 1 ? 말('보_몇줄', t.줄수) : ''
    const 속 = 작나 ? '' : `<b>${esc(위계)}</b>
      <span>${esc(말('보_크기와자수', 줄, t.pt, t.최소, t.최대))}</span>`
    // 마우스를 올렸을 때 뜨는 글에는 줄 수를 안 넣는다 — 원래 그랬다.
    return `<div class="pk-글" style="${자리(t.box)}"
      title="${esc(말('보_칸설명', 위계, '', t.pt, t.최소, t.최대))}">
      ${속}
    </div>`
  }).join('')
  // **판 비율은 이 틀의 캔버스로 정한다.** CSS 에 4:5 로 못박아 두면 1080×1440 틀이
  // 눌려 그려지고, 위에 깐 원본 장과도 높이가 안 맞는다(사람 지적 2026-09-19).
  return `<div class="pk-장">
    <div class="pk-판" style="aspect-ratio:${W}/${H};background:${esc(_배경칠(장.배경))}">${장식}${글자}</div>
    <div class="tpl-meta">${esc(장.index)}. ${esc(낱말('역할', 장.역할 || '', 언어))}</div>
  </div>`
}

/** 틀 하나를 장별 그림으로. */
/** 원본 게시물 그림. 없으면 빈 글자 — 작업대에서 뽑은 틀이 그렇다.
 *
 * 사람 결정 2026-09-19: 「실제 원본 그리고 밑에 템플릿」. 설계도만 보면 무슨
 * 결인지 모른다 — 원본을 봐야 이 템플릿이 무엇이었는지 바로 안다.
 *
 * **낱장을 안 부르고 「한판」 한 장을 쓴다.** 실측 2026-09-19: 낱장은 한 장에
 * 220KB 라 일곱 장이면 1.5MB 고, 다 뜨는 데 10초가 걸렸다. 한판은 그 일곱
 * 장을 이어 붙인 것이고 105KB 다 — 한 번에 온다.
 *
 * 주소가 http 가 아니면 안 싣는다. 여기 오는 값은 창고에서 온 것이지만,
 * `javascript:` 가 섞이면 우리 집 안에서 돈다.
 */
// ── 「한판」을 장별로 자르는 값 ────────────────────────────────────────────
//
// **이 넷은 `analyze/lambda_분석.py` 가 한판을 만들 때 쓴 값 그대로다.**
// 거기가 바뀌면 여기도 바꿔야 한다 — 안 그러면 원본이 한 칸씩 밀려 보인다.
// (같은 값을 두 곳에 두는 이유: 한판 주소만 창고에 실리고 짜임새는 안 실린다.)
const 한판폭 = 240          // 장 하나를 이 폭으로 줄여 붙였다
const 한판틈 = 8            // 장과 장 사이 흰 틈
const 카드비 = 818 / 288    // 판을 이 비율에 맞춰 흰색으로 넓혔다

/** 화면에서 장 한 칸의 폭(px). **이 값을 쓰는 두 화면의 CSS
 * (`.pk-원장`·`.pk-장`·`.pk-판`)와 같아야 한다** — 원본은 여기 값으로 잘리고
 * 설계도는 저기 값으로 그려져서, 어긋나면 위아래 크기가 안 맞는다.
 * `test/templates.test.js` 가 그 세 곳을 실제로 읽어 대조한다. */
export const 칸폭 = 165

/** 한 줄에 몇 장을 넣었나. `lambda_분석._칸수고르기` 와 **같은 규칙**이다 —
 * 장 하나가 제일 크게 보이는 짜임을 고른다. */
function _칸수고르기(장수, 쪽비) {
  let 좋은것 = 1
  let 가장큼 = -1
  for (let 줄 = 1; 줄 <= 장수; 줄 += 1) {
    const 칸 = Math.ceil(장수 / 줄)
    const 보이는폭 = Math.min(818 / 칸, (288 * 쪽비) / 줄)
    if (보이는폭 > 가장큼) { 좋은것 = 칸; 가장큼 = 보이는폭 }
  }
  return 좋은것
}

/**
 * 한판 안에서 장 하나가 놓인 자리 — `{ 판폭, 판높이, 칸높이, 자리: [[x,y],…] }`.
 * 단위는 한판 그림의 픽셀이다. 장수가 0 이면 `null`.
 *
 * **왜 잘라야 하나.** 한판은 일곱 장을 가로로 이어 붙인 **한 장**이고, 그 둘레를
 * 흰색으로 넓혀 RITA 카드 비율(818:288)에 맞춰 놨다. 그대로 깔면 흰 띠가 절반을
 * 차지하고 장은 설계도 칸보다 크게 나온다 — 위아래 크기가 안 맞는다
 * (사람 지적 2026-09-19: 「위에는 원본 아래는 템플릿이잖아 크기 맞춰야지」).
 */
export function 한판자리(장수, 장폭, 장높이) {
  const n = Math.max(0, Math.floor(장수 || 0))
  if (!n || !(장폭 > 0) || !(장높이 > 0)) return null
  const 칸높이 = Math.max(1, Math.round((장높이 * 한판폭) / 장폭))
  const 칸수 = _칸수고르기(n, 한판폭 / 칸높이)
  const 줄수 = Math.ceil(n / 칸수)
  const 속폭 = 칸수 * 한판폭 + (칸수 - 1) * 한판틈
  const 속높이 = 줄수 * 칸높이 + (줄수 - 1) * 한판틈
  const 판폭 = Math.max(속폭, Math.round(속높이 * 카드비))
  const 판높이 = Math.max(속높이, Math.round(판폭 / 카드비))
  const 왼쪽 = Math.floor((판폭 - 속폭) / 2)
  const 위 = Math.floor((판높이 - 속높이) / 2)
  const 자리 = []
  for (let i = 0; i < n; i += 1) {
    자리.push([왼쪽 + (i % 칸수) * (한판폭 + 한판틈),
      위 + Math.floor(i / 칸수) * (칸높이 + 한판틈)])
  }
  return { 판폭, 판높이, 칸높이, 자리 }
}

export function 원본줄(한판, 언어, 장수 = 0, 캔버스 = null) {
  const 주소 = String(한판 || '').trim()
  if (!/^https?:\/\//.test(주소)) return ''
  const 몫 = 한판자리(장수, (캔버스 || {}).w || 1080, (캔버스 || {}).h || 1350)
  const 알트 = esc(말하기(언어)('보_원본'))
  // 짜임새를 못 셈하면 옛 모양대로 통째로 깐다 — 안 보이는 것보다는 낫다.
  if (!몫) {
    return `<div class="pk-원본"><img src="${esc(주소)}" alt="${알트}" loading="lazy"></div>`
  }
  // **설계도와 같은 줄 모양으로 낸다.** 칸 폭·틈이 아래와 같아야 위아래가 맞는다
  // (`.pk-장` 과 `.pk-줄` 의 gap — index.html).
  const 배 = 칸폭 / 한판폭          // 한판 픽셀 → 화면 픽셀
  const 칸 = 몫.자리.map(([x, y], i) => `<div class="pk-원장" role="img"`
    + ` aria-label="${알트} ${i + 1}"`
    + ` style="height:${(몫.칸높이 * 배).toFixed(1)}px;`
    + `background-image:url('${esc(주소)}');`
    + `background-size:${(몫.판폭 * 배).toFixed(1)}px ${(몫.판높이 * 배).toFixed(1)}px;`
    + `background-position:-${(x * 배).toFixed(1)}px -${(y * 배).toFixed(1)}px"></div>`).join('')
  return `<div class="pk-원본줄">${칸}</div>`
}

export function 틀그림(틀, 이름, 언어) {
  const 말 = 말하기(언어)
  const 장들 = (틀 && 틀.슬라이드) || []
  if (!장들.length) return `<p class="tpl-empty">${esc(말('보_장없음'))}</p>`
  const 몸 = 장들.map((s) => 틀장(s, 틀.캔버스, 언어)).join('')
  const 원본 = 원본줄(틀 && 틀.한판, 언어, 장들.length, 틀 && 틀.캔버스)
  return `<div class="peek-box">
    <div class="tpl-row">
      <div class="tpl-name">${esc(말('보_제목', 이름, 장들.length))}</div>
      <button id="peekClose">${esc(말('보_닫기'))}</button>
    </div>
    ${원본 ? `<p class="tpl-meta">${esc(말('보_원본'))}</p>${원본}` : ''}
    <p class="tpl-meta">${esc(말('보_설계도설명'))}</p>
    <div class="pk-줄">${몸}</div>
  </div>`
}
