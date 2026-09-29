// 채팅 페이지. 이 위쪽은 DOM 없이 도는 순수 함수라 node 시험이 본다.
// DOM 에 붙이는 mount 는 파일 끝에 있다.
//
// 이 파일과 index.html 어디에도 수집기 파일 이름을 적지 않는다 — 열린 URL 이라
// 이름이 새면 아무나 수집기에 들어간다(사람 결정 2026-09-16).

const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

// 언어 규칙은 `lib/언어.js` 한 벌뿐이다 — 여기서 사본을 만들지 않는다.
import { 언어표, 쓸언어, 다음언어, 저장된언어, 언어남기기 } from './언어.js'
// 종류 이름(글자·사진·장식…)을 보여 줄 때만 영어로 갈아 끼운다. 라벨판이 쓰는
// 표와 **같은 것**이라야 한다 — 예시에서 「Decoration」을 배우고 화면에 와서
// 「장식」을 찾으면 못 찾는다.
import { 낱말 } from './수집기말.js'
// 돈이 나가는 문은 「사람인지 확인」을 지나야 열린다(사람 결정 2026-09-22).
import { 붙여보내기 } from './출입증.js'
// 화풍 목록의 웹 거울(원본 `analyze/화풍.py`). 예시 그림은 `web/hwapung/`.
import { 화풍목록 } from './화풍.js'

export { 언어표, 쓸언어, 다음언어 }

// `고른코드` 를 주면 그 카드에 «고름» 표를 단다 — 띠에서 지금 무엇을 보고
// 있는지가 눈에 보여야 한다(손잡이를 만들면 상태 표시까지).
export function 틀카드html(카드들, 고른코드 = '') {
  const 칸 = (c) => `<button type="button" class="tpl-pick${c.코드 === 고른코드 ? ' 고름' : ''}" data-code="${esc(c.코드)}" data-name="${esc(c.이름 || c.코드)}" title="${esc(c.이름)}">
    <span class="tpl-face">${c.표지 ? `<img src="${esc(c.표지)}" alt="${esc(c.이름)} 표지" loading="lazy">` : '<span class="tpl-noface">표지 없음</span>'}</span>
    <span class="tpl-name">${esc(c.이름)}</span>
  </button>`
  return `<div class="tpl-strip">${(카드들 || []).map(칸).join('')}</div>`
}

// **화풍 카드**(사람 결정 2026-09-29). 봇이 화풍을 물으면 말풍선 밑에 깐다. «알아서» 를
// 맨 앞에 — 고르기 어려운 사람이 누를 곳이다. 그림은 우리가 시험으로 만든 예시다.
export function 화풍카드html(언어) {
  const 영어 = 쓸언어(언어) === '영어'
  const 칸 = (id, 이름, 그림) => `<button type="button" class="hwa-pick" data-화풍="${esc(id)}" data-이름="${esc(이름)}">`
    + `<span class="hwa-face${그림 ? '' : ' hwa-ai'}">${그림 ? `<img src="${esc(그림)}" alt="" loading="lazy">` : 'AI'}</span>`
    + `<span class="hwa-name">${esc(이름)}</span></button>`
  return `<div class="hwa-strip">`
    + 칸('알아서', 말하기(언어)('화풍알아서'), '')
    + 화풍목록.map((x) => 칸(x.id, 영어 ? x.이름영어 : x.이름, x.예시)).join('')
    + `</div>`
}

/** 대화를 다시 불러올 때 깔 카드. 화풍을 묻는 중이었으면 화풍 카드, 아니면 빈 글자.
 *  (2026-09-29 검토: 새로고침하면 물음 글만 남고 카드가 사라져, 이름을 모르는 사람은 막혔다.) */
export function 복원카드html(상태, 언어) {
  return 상태?.물은것?.무엇 === '화풍' ? 화풍카드html(언어) : ''
}

// **받아오는 동안 깔아 둘 뼈대**(사용자 지적 2026-09-24: 「첫 화면이 잠깐 비어
// 있음 — 약 3초 뒤에 템플릿 목록이 뜸」).
//
// 목록은 창고에서 받아오는데, 그때까지 칸이 **아무것도 없이** 비어 있었다. 빈
// 화면은 「고장인가」로 읽힌다 — 같은 크기의 회색 네모를 미리 깔면 「오는 중」으로
// 읽힌다. 개수는 실제와 안 맞아도 된다(모르니까) — 자리를 잡아 주는 것이 몫이다.
export function 뼈대html(몇 = 6) {
  const 칸 = '<span class="tpl-pick 뼈대" aria-hidden="true">'
    + '<span class="tpl-face"></span><span class="tpl-name"></span></span>'
  return `<div class="tpl-strip">${칸.repeat(Math.max(1, 몇))}</div>`
}

// 틀 카드는 여기서 안 그린다. **오른쪽 칸 몫이다**(사람 결정 2026-09-16) — 채팅에도
// 그리면 같은 카드가 두 벌 보인다. 서버가 `틀카드` 를 실어 보내면 그건 «오른쪽에
// 틀 목록을 띄워라» 는 신호로만 쓴다(`mount` 의 보내기).
export function 말칸html(줄) {
  const 글 = esc(줄.말).replace(/\n/g, '<br>')
  return `<div class="msg ${줄.역할 === '사람' ? '사람' : '봇'}"><div class="bubble">${글}</div></div>`
}

// **선택창**(사람 결정 2026-09-19). 봇이 「고르기」를 내면 말풍선 밑에 단추를
// 깐다 — 주제 3안이든 말투 3벌이든 같은 자리 하나로 그린다.
//
// **「직접 입력」을 반드시 같이 둔다.** 셋 밖으로 못 나가면 막다른 길이 된다.
// 그 단추는 아래 입력칸에 초점만 옮기고, 사람이 적어 보내면 평소 길로 간다.
//
// 단추를 누르면 **그 글을 사람이 친 것처럼** 보낸다 — 틀 카드와 같은 길이다.
// 길을 둘로 만들면 한쪽만 고치는 일이 생긴다.
// **주제에는 「다시」를 같이 둔다**(사람 결정 2026-09-19). 셋 다 마음에 안 들면
// 직접 적는 수밖에 없는데, 그건 다시 생각해야 하는 일이라 성가시다. 한 번 더
// 뽑는 값은 딥시크 한 번이라 1원 안팎이다.
//
// 「담기」에는 안 붙인다 — 「네/아니오」를 다시 뽑을 것이 없다.
const 다시붙일것 = ['주제']

// 사진쓰임 단추 둘과 그 값(2026-09-28). **차례가 뜻이다** — 서버·화면·시험이 같은
// 차례를 본다. 모르는 자리는 「그대로」 — 돈 안 드는 쪽.
export const 사진쓰임값 = (i) => (i === 1 ? '참조' : '그대로')
export const 사진쓰임단추 = (언어) => [말하기(언어)('사진그대로'), 말하기(언어)('사진참조')]

/** 사진쓰임을 «도는 채팅 턴이 끝난 뒤» 에 적는다(검토 2026-09-29).
 *
 *  사진과 글을 같이 보내면 턴이 도는 동안 단추가 보인다. 그때 누른 것을 바로 적으면
 *  턴 끝의 «통째 저장» 이 옛 상태로 덮어 선택이 조용히 사라진다. 턴이 실패해도
 *  고른 것은 적는다. */
export async function 사진쓰임적기({ 차례, 도는턴, 적기 }) {
  const 값 = 사진쓰임값(차례)
  if (도는턴) { try { await 도는턴 } catch { /* 턴이 실패해도 고른 것은 적는다 */ } }
  await 적기(값)
  return 값
}

/** 사진과 같이 친 말. **올릴 때마다 새로 적는다** — 글이 없으면 빈 글자로 지운다
 *  (검토 2026-09-29: 안 지우면 옛 바람이 다음 참조 판에 몰래 실린다). */
export const 바람값 = (글) => String(글 || '').trim()

export function 고르기html(무엇, 것들, 언어) {
  const 목록 = (것들 || []).filter((x) => typeof x === 'string' && x.trim())
  if (!목록.length) return ''
  // **로고의 첫 단추는 말을 안 보낸다** — 누르면 파일 고르기가 열린다.
  // 글자가 아니라 **자리**로 가른다(무엇이 「로고」인 선택창의 첫째). 글자로
  // 가르면 언어를 바꿀 때 깨진다 — 「로고 올리기」와 "Upload a logo" 가 같은
  // 단추다. 서버가 그 차례로 보내는 것을 시험이 못 박고 있다.
  const 칸 = (x, i) => `<button type="button" class="pick${무엇 === '로고' && i === 0 ? ' pick-올림' : ''}" `
    + `data-무엇="${esc(무엇)}" data-값="${esc(x)}">${esc(x)}</button>`
  const 꼬리 = []
  if (다시붙일것.includes(무엇)) {
    // 누르면 «다시 뽑아 달라» 는 말을 사람이 친 것처럼 보낸다. 앞서 낸 것들을
    // 같이 실어 보내 딥시크가 겹치는 것을 안 내게 한다.
    꼬리.push(`<button type="button" class="pick pick-again" `
      + `data-앞것="${esc(목록.join(' / '))}">${esc(말하기(언어)('다시뽑기'))}</button>`)
  }
  꼬리.push(`<button type="button" class="pick pick-own">`
    + `${esc(말하기(언어)('직접입력'))}</button>`)
  // **고를 것은 한 줄에 하나씩, 「다시」·「직접 입력」은 그 아래 따로 한 줄.**
  //
  // 여태는 한 묶음에 넣고 흘려서(`flex-wrap`) 자리 남는 대로 옆에 붙었다 —
  // 마지막 고를 것과 「다시」가 같은 줄에 걸렸다(사람 지적 2026-09-19).
  // 고를 것과 «빠져나가는 길» 은 성격이 다르니 줄도 나눈다.
  return `<div class="picks">${목록.map(칸).join('')}</div>`
    + `<div class="picks picks-곁">${꼬리.join('')}</div>`
}

// ── 라벨 예시 (사람 결정 2026-09-22) ──────────────────────────────────
//
// 담기가 끝나면 오른쪽에 라벨판이 곧바로 열린다. 그런데 처음 온 사람은 **무엇을
// 어떤 종류로 그어야 하는지** 모른다 — 화면에 있는 설명서는 단축키만 적혀 있고,
// 「이건 장식인가 빼기인가」 같은 판단은 글로는 안 된다. 그래서 말풍선 밑에
// 이미 라벨해 둔 게시물 셋을 그림으로 깔고, 그 밑에 종류별 한 줄을 붙인다.
//
// 그림은 `analyze/예시굽기.py` 가 구워 `web/` 에 둔 것이다. 장을 **가로 한
// 줄**로 늘어놓았다(사람 결정 2026-09-22) — 말풍선이 가로로 납작해서 세로로 긴
// 장 하나를 그대로 넣으면 위아래가 잘려 아무것도 안 보인다. 대신 작아지므로
// **누르면 커진다**(`예시그림` 클래스를 화면이 잡는다).
//
// **이름은 두 언어로 안 둔다.** 실제 인스타 게시물 표지에 적힌 글을 그대로
// 옮긴 것이라 옮길 말이 아니다 — 영어로 바꾸면 그림 속 글자와 갈린다.
export const 라벨예시목록 = [
  ['/label-example-1.jpg', '요즘은 이 브랜드가 SNS를 잘한대요 7'],
  ['/label-example-2.jpg', 'SNS 담당자가 알아야 할 요즘 카드뉴스 트렌드.zip'],
  ['/label-example-3.jpg', '키키로 배우는 브랜딩 전략'],
]

// 사용법 여덟 줄. **라벨 화면에 적힌 글자와 같아야 한다** — 「이 장은 배경이
// 사진이다」는 그 화면에 실제로 그렇게 적혀 있는 체크칸이다(`lib/라벨말.js` 의
// `칸_이장배경사진`). 다르게 적으면 읽고 와서 그 칸을 못 찾는다.
export const 사용법줄 = [
  ['글자', '글자 덩어리마다 하나씩. 도형 안에 든 글자도 따로 긋습니다',
    'One per block of text. Text inside a shape gets its own box too'],
  ['사진', '사진 자리. 장을 꽉 채우는 배경 사진이면 「이 장은 배경이 사진이다」를 켭니다',
    "Photo slots. If a photo fills the whole slide, tick «This slide's background is a photo»"],
  ['장식', '원본 그림을 그대로 오려 씁니다. 만든 카드에도 나와야 하는 것',
    'Copied straight from the original. Use it for anything that should appear on your card too'],
  ['빼기', '원본에만 있던 것(구분선·워터마크·타임라인). 만든 카드에는 안 나옵니다',
    'Things only the original had (dividers, watermarks, timelines). They never appear on your card'],
  ['도형', '원·별·말풍선은 「도형」 단추로 모양을 고릅니다',
    'For circles, stars and speech bubbles, pick the form with the «Shape» buttons'],
  ['로고', '계정 로고 자리', 'Where the account logo sits'],
  ['장번호', '「01」 배지 둘레에 한 장만 그으면 됩니다. 나머지 장은 알아서 찍습니다',
    'Draw it once around the «01» badge — the rest of the slides are stamped for you'],
  ['마무리', '「저장」 → 「확정」 → 채팅에 「분석해줘」',
    '«Save» → «Confirm» → then tell me «analyze» here'],
]

/** 말풍선 밑에 까는 라벨 예시 + 사용법. 그림은 누르면 커진다. */
export function 라벨예시html(언어) {
  const 영 = 쓸언어(언어) === '영어'
  const 그림 = ([주소, 이름]) => `<figure class="예시">`
    + `<figcaption>${esc(이름)}</figcaption>`
    + `<img class="예시그림" src="${esc(주소)}" alt="${esc(이름)}" `
    + `loading="lazy" title="${esc(말하기(언어)('예시크게'))}"></figure>`
  // **이름도 갈아 끼운다.** 일곱은 라벨판의 종류라 `낱말` 표가 답을 갖고 있고,
  // 「마무리」만 종류가 아니라 순서라 그 표에 없다 — 그것만 화면말에서 꺼낸다.
  const 보일이름 = (이름) => (이름 === '마무리'
    ? 말하기(언어)('사용법마무리') : 낱말('종류', 이름, 언어))
  const 줄 = ([이름, ko, en]) =>
    `<li><b>${esc(보일이름(이름))}</b><span>${esc(영 ? en : ko)}</span></li>`
  return `<div class="라벨예시">${라벨예시목록.map(그림).join('')}`
    + `<div class="사용법"><h4>${esc(말하기(언어)('사용법제목'))}</h4>`
    + `<ul>${사용법줄.map(줄).join('')}</ul></div></div>`
}

/** 올린 사진 띠. **한 장도 없으면 빈 글자** — 화면이 그때 띠를 숨긴다. */
// **막대가 «기어가게» 만든다**(사람 지적 2026-09-20: 「비율 뚝뚝 올리지말고
// 자연스럽게 되어야하는데」).
//
// 서버는 **단계가 바뀔 때만** 값을 준다. 실측에서 30%(「대본을 쓴다」)에
// **2분 38초** 머물렀다가 한 번에 60%로 뛰었다 — 그대로 그리면 2분 38초 동안
// 멈춰 있다가 뚝 뛴다.
//
// **다음 단계가 몇 %인지는 모른다.** 그래서 받은 값에서 `여유` 만큼만, 그것도
// 점점 느려지게 다가간다(끝에 안 닿는다). 오래 걸릴수록 느려지니 「곧 끝날
// 것처럼」 속이지 않는다.
//
// **뒤로는 절대 안 간다.** 서버 값이 62 → 68 로 오르는 사이 화면이 이미 65 를
// 지났을 수 있는데, 거기서 62 로 떨어지면 사람은 「되돌아갔다」고 읽는다.
// **값은 실측에서 나왔다**(2026-09-20). 서버가 주는 단계는 5·12·18·30·60·
// 62·65·66·68·72·78·80·95 인데, 사이가 이렇게 벌어진다:
//
//     30 → 60   158초   ← 「대본을 쓴다」. 여기만 길다
//     72 → 78   323초   ← 사진. **장마다 값이 와서** 17~24초마다 1%씩 오른다
//     그 밖      0~30초
//
// 그래서 규칙이 둘이다.
//
// **① 20초는 안 움직인다.** 사진 구간처럼 자주 갱신되는 데서는 기어갈 필요가
// 없다 — 서버 값이 곧 온다. 기다려도 안 오는 구간만 메운다.
//
// **② 여유는 «남은 거리에 비례» 한다.** 30% 에서는 넉넉히(24%) 기어가도 되지만
// 90% 에서 그러면 100% 에 닿아 버린다. 앞서 12·25 로 재 봤더니 72% 구간에서
// 막대가 97% 까지 가서, 서버가 78·80·95 를 줘도 **마지막 5분이 통째로 멈춘
// 것처럼** 보였다.
const 기어가기전대기 = 20    // 초. 이만큼은 서버 값을 그대로 믿는다
const 기어가는몫 = 0.35      // 남은 거리 중 이만큼까지만 앞서간다
const 기어가는반감 = 60      // 초. 클수록 느리게 다가간다

export function 부드러운값(받은값, 지난초, 보이던값) {
  const 실제 = Math.max(0, Math.min(100, Number(받은값) || 0))
  const 기다린초 = Math.max(0, (Number(지난초) || 0) - 기어가기전대기)
  const 목표 = 실제 + (100 - 실제) * 기어가는몫
  const 찬만큼 = 1 - Math.exp(-기다린초 / 기어가는반감)
  const 새값 = 실제 + (목표 - 실제) * 찬만큼
  return Math.min(100, Math.max(Number(보이던값) || 0, 새값))
}

export function 사진띠html(사진들, 언어, 대기들) {
  const 목록 = (사진들 || []).filter((u) => typeof u === 'string' && u.trim())
  const 기다림 = (대기들 || []).filter((u) => typeof u === 'string' && u.trim())
  if (!목록.length && !기다림.length) return ''
  const 하다 = 말하기(언어)
  const 샷 = (주소, i, 대기) => `<div class="샷${대기 ? ' 대기' : ''}">`
    + `<img src="${esc(주소)}" alt="">`
    + `<button type="button" class="샷빼기" data-${대기 ? '대기차례' : '차례'}="${i}" `
    + `title="${esc(하다('사진뺌'))}">✕</button></div>`
  const 수 = (글) => `<span class="샷수">${esc(글)}</span>`
  return 목록.map((u, i) => 샷(u, i, false)).join('')
    + 기다림.map((u, i) => 샷(u, i, true)).join('')
    + (목록.length ? 수(하다('사진띠수', 목록.length)) : '')
    + (기다림.length ? 수(하다('사진대기수', 기다림.length)) : '')
}

export function 오른쪽주소(오른쪽) {
  if (!오른쪽) return ''
  if (오른쪽.종류 === '라벨판' && 오른쪽.코드) return `/label.html?id=${encodeURIComponent(오른쪽.코드)}`
  // 이 주소는 iframe 에 끼운다 — javascript: 가 오면 우리 집 안에서 돈다.
  if (오른쪽.종류 === '작업대' && /^https?:\/\//.test(오른쪽.주소 || '')) return String(오른쪽.주소)
  return ''
}

const 링크 = (봉투) => ((봉투?.result?.components) || []).find((c) => c.type === 'link')

// 화면이 스스로 내놓는 봇 말. **람다가 써 보낸 말은 여기 없다** — 그건 봉투에
// 실려 오는 그대로 보여 준다(`봉투.result.content`). 그래서 카드가 다 됐을 때
// 나오는 한 줄은 아직 한국어다.
//
// 열쇠마다 두 언어를 나란히 둔다. 한쪽만 있으면 그 자리만 한국어로 튀어나온다.
export const 화면말 = {
  // 쪽 제목·보내기 단추·넣는 칸. **처음에 빠뜨렸던 셋이다**(실물 2026-09-19:
  // 영어로 열었는데 「보내기」만 한국어였다).
  쪽제목: { 한국어: () => '카드뉴스 에이전트', 영어: () => 'Card News Agent' },
  보내기: { 한국어: () => '보내기', 영어: () => 'Send' },
  크게열기: { 한국어: () => '새 창에서 크게 열기 ↗', 영어: () => 'Open larger in a new tab ↗' },
  // ── 라벨 예시 (사람 결정 2026-09-22) ─────────────────────────────
  사용법제목: { 한국어: () => '라벨 이렇게 칩니다', 영어: () => 'How to label' },
  예시크게: { 한국어: () => '눌러서 크게 보기', 영어: () => 'Click to enlarge' },
  예시닫기: { 한국어: () => '닫기', 영어: () => 'Close' },
  // 사용법 마지막 줄의 이름. 나머지 일곱은 라벨판의 종류라 `낱말` 표가 옮긴다.
  사용법마무리: { 한국어: () => '마무리', 영어: () => 'Finish' },
  // ── 건의 (교수님 요청 2026-09-21) ───────────────────────────────
  //
  // **문구는 교수님이 정해 주신 그대로다** — 「사용할때마다 불편한점이나
  // 개선점들을 남겨주세요」.
  건의: { 한국어: () => '건의', 영어: () => 'Feedback' },
  건의설명: {
    한국어: () => '쓰면서 불편했던 점을 남깁니다 — 이름은 안 받습니다',
    영어: () => 'Tell us what was awkward — no name required',
  },
  건의제목: {
    한국어: () => '사용할 때마다 불편한 점이나 개선점을 남겨주세요',
    영어: () => 'Every time you use it, tell us what was awkward or could be better',
  },
  건의넣는곳: {
    한국어: () => '무엇이 불편했는지, 어떻게 되면 좋겠는지',
    영어: () => 'What was awkward, and what would be better',
  },
  건의닫기: { 한국어: () => '닫기', 영어: () => 'Close' },
  건의보내기: { 한국어: () => '보내기', 영어: () => 'Send' },
  건의보내는중: { 한국어: () => '보내는 중…', 영어: () => 'Sending…' },
  건의고마움: { 한국어: () => '남겨 주셔서 고맙습니다.', 영어: () => 'Thank you — got it.' },
  건의비었음: { 한국어: () => '내용을 적어 주세요.', 영어: () => 'Please write something.' },
  건의못보냄: { 한국어: (왜) => `못 보냈습니다: ${왜}`, 영어: (왜) => `Could not send: ${왜}` },
  넣는곳: {
    한국어: () => '템플릿 이름, 인스타 주소, 또는 만들 주제를 적어 주세요',
    영어: () => 'A template name, an Instagram link, or what to make it about',
  },
  // 선택창의 마지막 단추. **셋 밖으로 나가는 길**이라 반드시 있어야 한다.
  직접입력: { 한국어: () => '직접 입력', 영어: () => 'Type my own' },
  다시뽑기: { 한국어: () => '다시', 영어: () => 'Try others' },
  // 화풍 카드의 «알아서»(2026-09-29). 서버는 이 글이 아니라 몸의 `화풍: '알아서'` 로 알아듣는다.
  화풍알아서: { 한국어: () => '알아서 (AI가 고름)', 영어: () => 'Let AI pick' },
  // 「다시」를 누르면 사람 말로 이것이 간다. 앞서 낸 것들을 같이 실어 보내
  // 딥시크가 겹치는 것을 안 내게 한다.
  다시말: { 한국어: (앞것) => `다른 주제로 다시 보여 주세요 (이건 빼고: ${앞것})`,
          영어: (앞것) => `Show me different ones (not these: ${앞것})` },
  실패했음: { 한국어: () => '실패했습니다', 영어: () => 'It failed.' },
  // ── 채팅창에 사진 올리기 (사람 결정 2026-09-19) ──────────────────
  사진올리기: { 한국어: () => '사진', 영어: () => 'Photos' },
  사진올리는중: { 한국어: (n) => `사진 ${n}장을 올리는 중이에요…`,
              영어: (n) => `Uploading ${n} photo(s)…` },
  // **몇 장인지 말해 준다.** 자리보다 적으면 남은 자리를 두고 다시 묻게 된다.
  사진받음: { 한국어: (n) => `사진 ${n}장을 받았어요. 만들 때 자리에 넣을게요.`,
           영어: (n) => `Got ${n} photo(s). I'll place them when making.` },
  사진못올림: { 한국어: (왜) => `사진을 못 올렸어요: ${왜}`,
            영어: (왜) => `I couldn't upload that: ${왜}` },
  사진뺌: { 한국어: () => '빼기', 영어: () => 'Remove' },
  사진띠수: { 한국어: (n) => `올린 사진 ${n}장`, 영어: (n) => `${n} photo(s)` },
  // **아직 안 올린 사진**(사람 지시 2026-09-20: 「엔터 눌러야 들어가야함」).
  사진대기수: { 한국어: (n) => `대기 ${n}장 — 엔터를 누르면 올라갑니다`,
    영어: (n) => `${n} waiting — press Enter to upload` },
  // ── 사진을 어떻게 쓸까 (사람 결정 2026-09-28) ─────────────────────
  // **자리로 가른다** — 첫째가 「그대로」, 둘째가 「참조」. 글자로 가르면 언어를
  // 바꿀 때 깨진다(로고 단추와 같은 결).
  사진쓰임물음: { 한국어: () => '올린 사진 전부를 어떻게 쓸까요? 그대로 넣을 수도 있고, '
                              + '그 사진 속 사람·물건으로 AI 가 새 장면을 만들 수도 있어요.',
    영어: () => 'How should I use all the photos you uploaded? Place them as-is, or have AI build new scenes around the people or things in them.' },
  사진그대로: { 한국어: () => '그대로 넣기', 영어: () => 'Place as-is' },
  사진참조: { 한국어: () => '참조해서 만들기', 영어: () => 'Use as reference' },
  그대로갑니다: { 한국어: () => '올린 사진을 그대로 자리에 넣을게요.',
    영어: () => "I'll place your photos as they are." },
  참조로갑니다: { 한국어: () => '올린 사진을 참조해서 AI 가 장면을 만들게요. 사진과 함께 적은 말이 있으면 그대로 따를게요.',
    영어: () => "I'll use your photos as references and have AI build the scenes. Anything you typed with them will be followed." },
  // **주소를 글로 안 찍는다**(사용자 지적 2026-09-24: 「작업대 주소가 날것 그대로
  // 찍힘」). 누를 수 있는 링크 단추가 이미 옆에 붙는다(`링크칸`) — 글에 한 번 더
  // 적으면 긴 주소가 말풍선을 채운다.
  작업대: { 한국어: () => '오른쪽 작업대에서 고칠 수 있어요 — 「크게 열기」로 새 탭에서도 볼 수 있어요.',
          영어: () => 'Edit it in the workbench on the right — "Open large" opens it in a new tab.' },
  // **초안을 되살린 판에만 쓴다** — 그때는 오른쪽이 미리보기라 작업대 칸을 안 쓰므로
  // 글이 구운 것으로 가는 유일한 길이다.
  작업대링크: { 한국어: (주소) => `구운 것은 여기 있어요: ${주소}`,
            영어: (주소) => `Your carousel is here: ${주소}` },
  // **여기서 처음으로 돈이 나간다** — 사람이 초안을 보고 단추를 누른 뒤다.
  // **사진을 만드나 안 만드나로 갈린다**(실측 2026-09-20).
  //
  // 람다 자국: 굽기 **361초(6분 1초)** — 사진 일곱 장에 대부분을 썼다
  // (한 장에 17~24초, 그중 한 장은 3분 48초). **사진을 안 만들면 21초**다
  // — 대본은 이미 있고 그림만 구우면 되니까. 한 문구로는 둘 다 틀린다.
  //
  // 진행 막대가 실제 상황을 보여 주므로 여기서는 «어느 쪽인지» 만 말한다.
  // **실측으로 적는다**(2026-09-24). 사진 없는 굽기는 CloudWatch 로 재니 가운데
  // **10초**다 — 「1분 안」도 넉넉한 말이었는데 사용자가 「10초 만에 끝남」을 재
  // 왔다. 사진을 만드는 판은 가운데 4~6분이라 「3~7분」이 맞다.
  이제굽는다: {
    한국어: (사진만드나) => (사진만드나
      ? '이제 만들게요. 사진까지 만드느라 3~7분쯤 걸려요.'
      : '이제 만들게요 (10초쯤).'),
    영어: (사진만드나) => (사진만드나
      ? 'Making it now — with photos, so it takes about 3–7 min.'
      : 'Making it now (about 10 seconds).'),
  },
  분석중: { 한국어: () => '분석 시작했어요 (1~2분)',
          영어: () => 'Started analyzing (1–2 min).' },
  분석끝: { 한국어: () => '분석 끝났어요! 이 템플릿으로 만들까요?',
          영어: () => 'Analysis done. Want to use this template?' },
  분석실패: { 한국어: () => '분석에 실패했어요. 라벨판에서 다시 해 주세요.',
           영어: () => 'Analysis failed. Please try again from the label board.' },
  서버묵묵: { 한국어: () => '서버가 답을 안 줍니다', 영어: () => 'The server is not answering.' },
  못보냄: { 한국어: (왜) => `보내지 못했어요: ${왜}`,
          영어: (왜) => `I couldn't send that: ${왜}` },
  생각중: { 한국어: () => '생각 중…', 영어: () => 'Thinking…' },
  // **첫 화면의 인사말.** 처음 온 사람이 제일 먼저 읽는 글이라 두 줄로 나눈다 —
  // 1줄은 «여기가 뭘 하는 곳인지», 2줄은 «그래서 뭘 하면 되는지».
  //
  // 옛 글은 한 줄에 셋이 섞여 있었다(무엇을 하는 곳인지 없이 바로 시키고, 두
  // 갈래를 한꺼번에 줬다). 그리고 「카드뉴스」가 네 번, 「마음에 드는」이 두 번
  // 되풀이됐다(사람 지적 2026-09-19: 「좀 이상한데」).
  //
  // **「3분이면 됩니다」 같은 약속은 안 넣는다** — 실제로는 60~180초라 지키기
  // 애매하고, 안 지키면 첫인상만 나빠진다.
  //
  // **「링크만 주면 바꿔 준다」 고 쓰지 않는다**(사람 지시 2026-09-28). 인스타 게시물이
  // 템플릿이 되려면 사람이 장마다 글자·사진 자리에 네모를 쳐야 한다(라벨링).
  뭐로만들까: {
    한국어: () => '준비된 템플릿을 골라도 되고, 마음에 드는 인스타 카드뉴스 주소를 붙여 넣고 '
                + '장마다 글자·사진 자리에 직접 네모를 쳐서 나만의 템플릿을 만들 수도 있어요.\n\n'
                + '템플릿 위에 원하는 주제를 얹어 나만의 카드뉴스를 '
                + '쉽고 재미있게 시작해 볼까요?',
    영어: () => 'Pick a ready-made template, or paste the link of an Instagram carousel '
              + 'you like and draw boxes around the text and photos on each slide '
              + 'yourself to make it your own template.\n\n'
              + 'Put your own topic on a template and make your own carousel, '
              + 'the easy and fun way. Shall we start?',
  },
  목록으로: { 한국어: () => '← 템플릿 목록', 영어: () => '← Templates' },
  읽는중: { 한국어: () => '템플릿을 읽는 중…', 영어: () => 'Loading the template…' },
  // 「이 템플릿으로 만들기」(사람 결정 2026-09-28). 템플릿을 누르면 구경만 하고
  // 고르는 것은 이 단추다. 이미 고른 것을 보고 있으면 그렇다고 보여 준다.
  이템플릿으로: { 한국어: () => '이 템플릿으로 만들기', 영어: () => 'Use this template' },
  고른템플릿: { 한국어: () => '✓ 고른 템플릿', 영어: () => '✓ Selected' },
  // 「그만두기」 (2026-09-24). **무엇이 남는지까지 적는다** — 눌러도 지금까지
  // 만든 사진은 그대로 구워 나온다는 것을 사람이 알아야 고를 수 있다.
  그만두기: { 한국어: () => '그만두기', 영어: () => 'Stop' },
  그만두는중: { 한국어: () => '그만두는 중…', 영어: () => 'Stopping…' },
  그만뒀다: { 한국어: () => '그만뒀습니다. 지금까지 만든 사진으로 카드뉴스를 냈어요.',
           영어: () => 'Stopped. The card news was made with the photos finished so far.' },
  만들기오래: { 한국어: () => '너무 오래 걸리네요. 잠시 뒤 다시 열어 봐 주세요.',
             영어: () => "This is taking too long. Please reopen in a little while." },
  새틀생김: { 한국어: (이름) => `새 템플릿 「${이름}」 이 생겼어요.`,
            영어: (이름) => `A new template "${이름}" is ready.` },
  // **이름을 묻는다**(사람 결정 2026-09-19). 웹 채팅 길은 이름을 안 물어서
  // 갓 만든 템플릿의 이름이 게시물 코드가 됐다 — 목록에 「DHqCBQnRAjW」 가
  // 뜨고, 그 카드를 누르면 사람 말풍선에도 그 코드가 찍혔다. 수집기 화면과
  // RITA 채팅은 이미 묻는다. 셋째 길만 안 묻고 있었다.
  이름물음: { 한국어: () => '이 템플릿을 뭐라고 부를까요? 「여행」처럼 짧은 이름이 목록에서 고르기 좋아요.',
            영어: () => 'What should we call this template? A short name like "Travel" is easiest to pick from the list.' },
  이름붙임: { 한국어: (이름) => `「${이름}」 으로 저장했어요.`,
            영어: (이름) => `Saved as "${이름}".` },
  이름못붙임: { 한국어: (왜) => `이름을 못 바꿨어요: ${왜}. 목록에서 「이름 바꾸기」로 다시 해 보세요.`,
             영어: (왜) => `Could not rename it: ${왜}. Try "Rename" in the list.` },
  분석오래: { 한국어: () => '분석이 오래 걸리네요. 라벨판에서 상태를 봐 주세요.',
            영어: () => 'Analysis is taking a while. Check its status on the labeling board.' },
  라벨저장됨: { 한국어: () => '라벨이 저장됐어요. 다 그었으면 라벨판의 「분석하기」를 눌러 주세요.',
             영어: () => 'Labels saved. When you’re done marking, press Analyze on the labeling board.' },
  // 로고 올리기(사람 지시 2026-09-19). **봇이 하는 말과 따로다** — 이건 화면이
  // 스스로 내놓는 말이라 서버를 안 거친다.
  로고올리는중: { 한국어: () => '로고를 올리는 중이에요…', 영어: () => 'Uploading the logo…' },
  로고받음: { 한국어: () => '로고 받았어요.', 영어: () => 'Got the logo.' },
  // 올린 뒤 **사람이 친 것처럼** 보내는 말. 이 말을 받아야 봇이 만들기로 넘어간다.
  로고올렸음: { 한국어: () => '로고 올렸어요', 영어: () => 'I uploaded the logo' },
  로고못올림: { 한국어: (왜) => `로고를 못 올렸어요: ${왜}`,
             영어: (왜) => `I couldn't upload the logo: ${왜}` },
}

const 말하기 = (언어) => (열쇠, ...값) => 화면말[열쇠][쓸언어(언어)](...값)

/** 오른쪽 위 띠의 「이 템플릿으로 만들기」 단추. **템플릿을 볼 때만** 뜬다(null 이면 숨긴다). */
export function 고르기단추(오른쪽, 고른코드, 언어) {
  if (오른쪽?.종류 !== '틀' || !오른쪽.코드) return null
  const 고름 = 오른쪽.코드 === 고른코드
  return { 글: 말하기(언어)(고름 ? '고른템플릿' : '이템플릿으로'), 고름 }
}

/** **기다리는 동안 띄우는 말풍선**(사람 지시 2026-09-22: 「그 생각중일때 좀
 * 돌고있는표시 추가하는게 좋을듯」).
 *
 * 여태 기다리는 동안 하는 일은 **보내기 단추를 회색으로 끄는 것 하나** 였다.
 * 단추는 글 칸 옆이라 눈이 안 가서, 몇 초 동안 화면이 멈춘 것처럼 보였다.
 *
 * **말풍선 «안» 에 넣는다.** 굽기 진행줄(`.진행줄`)처럼 줄로 빼면 봇이 말할
 * 자리와 어긋나 답이 올 때 자리가 튄다. `생각중` 은 지울 때 찾는 표다.
 */
export function 생각중html(언어) {
  return '<div class="msg 봇 생각중"><div class="bubble">'
    + `<span class="숨쉬는글">${말하기(언어)('생각중')}</span></div></div>`
}

// ── 새 대화 ────────────────────────────────────────────────────────
//
// **옛 대화를 지우지 않는다.** 지우면 되돌릴 수 없다. 화면에서 손을 떼고 새
// 번호로 시작할 뿐이라, 주소에 `?c=옛번호` 를 넣으면 다시 열린다.

const _새대화말 = {
  한국어: () => '새 대화',
  영어: () => 'New chat',
}

/** 단추 글자. 고른 언어를 탄다. */
export function 새대화말(언어) {
  return _새대화말[쓸언어(언어)]()
}

/** 새로 시작할 때 화면이 되돌아갈 자리. */
export function 새대화상태() {
  // **`구울것` 은 미리보기를 보는 동안 들고 있는 칸이다** — 사진 갈래와 로고.
  // 초안 짓는 데는 안 쓰고 「이대로 만들기」 때 `/api/bake` 로 보낸다.
  return { 대화: '', 상태: { 틀: null, 지켜보기: null, 오른쪽: null, 일: null, 구울것: null, 사진들: [] } }
}

// 일(담김·만들기)이 끝났을 때 채팅에 적을 말과 오른쪽에 띄울 것.
// **사진이 오는 대로 초안에 꽂는다** (2026-09-24).
//
// 여태는 사진이 «다» 끝나야 한 번에 나왔다 — 일곱 장이면 3분을 빈 자리만 보고
// 기다렸다. 람다가 한 장 꽂을 때마다 번호표에 그 주소를 적어 주므로(`사진들`),
// 5초마다 보는 그 길에서 새로 온 것만 화면에 꽂는다.
//
// 열쇠는 `"{장}-{자리}"` 다 — `밑그림.카드[장].장식영역[자리]` 를 가리킨다
// (`analyze/lambda_분석._사진꽂기`).
//
// **`밑그림` 에도 적는다.** 화면만 고치면 새로고침에 날아가고, 끝난 뒤 다시
// 그릴 때도 빈 자리로 돌아간다.
export function 사진꽂을것(사진들, 이미꽂은것) {
  const 낼것 = []
  for (const [열, 주소] of Object.entries(사진들 || {})) {
    if (!주소 || 이미꽂은것?.has?.(열)) continue
    const m = /^(\d+)-(\d+)$/.exec(열)
    if (!m) continue
    if (!/^https?:\/\//.test(String(주소))) continue
    낼것.push({ 열, 장: Number(m[1]), 자리: Number(m[2]), 주소: String(주소) })
  }
  return 낼것
}

export function 일끝처리(종류, 봉투, 언어) {
  const 말하다 = 말하기(언어)
  if (봉투?.status === 'failed') return { 말: 봉투?.error?.message || 말하다('실패했음') }
  const 말 = String(봉투?.result?.content || '')
  const l = 링크(봉투)
  if (종류 === '담김') {
    const m = /[?&]id=([A-Za-z0-9_-]+)/.exec(l?.url || '')
    if (!m) return { 말 }
    return { 말, 오른쪽: { 종류: '라벨판', 코드: m[1] }, 코드: m[1] }
  }
  if (종류 === '만들기' && l?.url) {
    // **사진이 덜 만들어졌으면 초안을 되살린다**(2026-09-24).
    //
    // 구운 것은 이미 나왔다. 그런데 오른쪽을 작업대로 덮어 버리면
    // **「이대로 만들기」 단추가 사라진다.**
    // 그러면 빈 사진 자리를 채울 길이 없어 처음부터 다시 만들어야 하고,
    // 이미 만든 사진값이 통째로 또 나간다.
    //
    // 되살린 초안의 카드에는 **이번에 만든 사진이 박혀 있다**(람다가 실어
    // 보낸다). 다시 누르면 `채우기` 가 그 자리를 건너뛰므로 **빈 자리에만**
    // 값이 나간다.
    if (봉투?.result?.밑그림) {
      // **이때만 주소를 글에 적는다.** 오른쪽이 미리보기로 가므로 작업대 칸을
      // 안 쓴다 — 글에서도 빼면 구운 것을 볼 길이 아예 없어진다.
      return { 말: `${말}\n${말하다('작업대링크', l.url)}`,
        오른쪽: { 종류: '미리보기', 밑그림: 봉투.result.밑그림 } }
    }
    // 오른쪽 칸에 작업대가 그대로 뜨고 「크게 열기」로 새 탭도 된다 — 주소를
    // 글에 또 적지 않는다(사용자 지적 2026-09-24: 「주소가 날것 그대로 찍힘」).
    return { 말: `${말}\n${말하다('작업대')}`,
      오른쪽: { 종류: '작업대', 주소: l.url } }
  }
  // **초안이 끝난 자리 — 아직 아무것도 안 구웠다**(사람 결정 2026-09-19).
  //
  // 밑그림을 통째로 오른쪽에 얹는다. 그러면 `봇적기` 가 그것을 대화 상태에
  // 그대로 저장하므로(설계 §8: 새 저장소를 안 만든다) **새로고침해도 살아
  // 있다.** 굽는 것은 사람이 「이대로 만들기」를 누를 때다.
  if (종류 === '미리보기' && 봉투?.result?.밑그림) {
    return { 말, 오른쪽: { 종류: '미리보기', 밑그림: 봉투.result.밑그림 } }
  }
  return { 말 }
}

// **`state` 값은 파이썬이 보내는 한국어 그대로다** — 그건 안 바꾼다. 여기서
// 바뀌는 것은 사람에게 보여 줄 말뿐이다.
export function 분석알림(state, 언어) {
  const 말하다 = 말하기(언어)
  if (state === '분석중') return 말하다('분석중')
  if (state === '분석 끝') return 말하다('분석끝')
  if (state === '분석 실패') return 말하다('분석실패')
  return ''
}

// ── DOM 붙이기 ──────────────────────────────────────────────────
import * as templates from './templates.js'
// 내가 만든 템플릿은 이 브라우저에만 적어 둔다 — 서로 안 보이게.
import { 내것더하기, 보일것 } from './내템플릿.js'
import { 미리보기html, 셈 as 자수세기, 사진옮기기, 사진빼기,
  말 as 미리보기말, 화풍안내 } from './미리보기.js'

const $ = (id) => document.getElementById(id)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const 기억 = {
  get: () => { try { return localStorage.getItem('chat.대화') || '' } catch { return '' } },
  set: (v) => { try { localStorage.setItem('chat.대화', v) } catch { /* 사생활 창 */ } },
}

// **엔터 하나를 둘이 나눠 쓴다.** 우리한테는 「보내기」지만, 한글 입력기한테는
// 「지금 만들던 글자 확정」이기도 하다. 맥에서는 우리 차례가 «먼저» 와서,
// 「안녕」을 보내고 칸을 비운 뒤에 입력기가 만들던 「녕」을 도로 써넣었다
// (사람 신고 2026-09-22). 그래서 만드는 중이면 이 엔터는 입력기 몫으로 넘긴다.
//
// `isComposing` 이 만드는 중인지 알려준다. 그걸 안 주는 브라우저를 위해
// `keyCode === 229`(= 입력기가 이 키를 가져갔다) 도 같이 본다.
export function 엔터로보내나(e) {
  if (e.key !== 'Enter' || e.shiftKey) return false
  return !e.isComposing && e.keyCode !== 229
}

export function mount() {
  const msgs = $('msgs'), say = $('say'), send = $('send'), pane = $('pane'), paneOpen = $('paneOpen')
  const paneBack = $('paneBack')   // 「← 틀 목록」 — 틀 목록이 아닐 때만 보인다
  const paneStrip = $('paneStrip') // 고른 뒤에도 남는 템플릿 띠
  const paneUse = $('paneUse')     // 「이 템플릿으로 만들기」 — 템플릿을 볼 때만 보인다
  let 대화 = new URLSearchParams(location.search).get('c') || 기억.get()
  let 상태 = { 틀: null, 지켜보기: null, 오른쪽: null, 일: null, 구울것: null, 사진들: [] }
  let 지켜보는중 = null   // 코드. 겹쳐 돌지 않게
  // 갓 만든 템플릿의 이름을 기다리는 중이면 그 코드. 다음 한 마디를 «이름» 으로
  // 받는다. **딥시크에 안 보낸다** — 「여행」 한 마디를 여섯 할 일 중 하나로
  // 가르라고 하면 「되묻기」로 떨어진다. 이름은 가릴 것이 없다.
  let 이름묻는중 = null
  // 두 번 누르면 대화가 둘로 갈라진다(대화 번호가 아직 없을 때 서버가 둘 다 새 번호를 찍는다).
  let 보내는중 = false

  // **스위치 하나가 둘을 정한다** — 봇이 하는 말과 만들어지는 카드의 언어
  // (사람 결정 2026-09-18). 고른 것은 이 브라우저에 남겨 다시 열어도 그대로다.
  // 저장이 막힌 창(사생활 보호 창)에서도 죽지 않게 감싼다.
  const 언어단추 = $('langBtn')
  let 언어 = 저장된언어()
  const 언어그리기 = () => {
    if (!언어단추) return
    const 지금 = 언어표.find((x) => x.값 === 언어)
    언어단추.textContent = 지금.보임
    // **설명도 고른 언어로 쓴다.** 영어를 골랐는데 설명만 한국어면 그것부터
    // 「안 바뀌었나」 싶다.
    언어단추.title = 언어 === 언어표[1].값
      ? 'Replies and card news are in English — click to switch'
      : '한국어로 답하고 한국어로 만듭니다 — 눌러서 바꾸기'
    // 글자를 JS 가 채우므로 마크업에는 이름이 없다. 읽어 주는 도구가 빈 단추로
    // 보지 않게 여기서 붙인다.
    언어단추.setAttribute('aria-label', 언어단추.title)
    언어단추.setAttribute('aria-pressed', String(언어 === 언어표[1].값))
  }
  // 새 대화 단추. 옛 대화는 **안 지운다** — 화면에서 손을 뗄 뿐이다.
  const 새단추 = $('newBtn')
  const 새대화그리기 = () => {
    if (!새단추) return
    새단추.textContent = 새대화말(언어)
    새단추.title = 새단추.textContent
    새단추.setAttribute('aria-label', 새단추.textContent)
    // 뒤로가기 글자도 같이 — 한 곳에서 다시 그린다.
    paneBack.textContent = 말하기(언어)('목록으로')
    // **쪽 제목·보내기·넣는 칸도 여기서.** 따로 두었더니 언어를 바꿔도 이 셋만
    // 한국어로 남았다(실물 2026-09-19).
    const 말 = 말하기(언어)
    document.title = 말('쪽제목')
    const 보냄 = $('send')
    if (보냄) 보냄.textContent = 말('보내기')
    const 사진단추글 = $('photoBtn')
    if (사진단추글) {
      사진단추글.textContent = 말('사진올리기')
      // 셋 다 되는 자리라는 것을 설명에 적는다 — 단추만 보면 끌어다 놓아도
      // 되는 줄 모른다.
      사진단추글.title = 언어 === 언어표[1].값
        ? 'Upload photos — you can also drag and drop, or paste'
        : '사진 올리기 — 끌어다 놓거나 붙여넣어도 됩니다'
      사진단추글.setAttribute('aria-label', 사진단추글.title)
    }
    say.placeholder = 말('넣는곳')
    paneOpen.textContent = 말('크게열기')
    // 건의 쪽지창. **단추도 창 안의 글자도 여기서 같이 간다** — 따로 두면
    // 언어를 바꿨을 때 창 안만 한국어로 남는다(사진 단추에서 한 번 겪었다).
    const 건의단추 = $('paneSuggest')
    if (건의단추) {
      건의단추.textContent = 말('건의')
      건의단추.title = 말('건의설명')
    }
    const 채우기 = (id, 글) => { const el = $(id); if (el) el.textContent = 글 }
    채우기('건의제목', 말('건의제목'))
    채우기('건의닫기', 말('건의닫기'))
    채우기('건의보내기', 말('건의보내기'))
    const 건의글칸 = $('건의글')
    if (건의글칸) 건의글칸.placeholder = 말('건의넣는곳')
  }
  // **「새 대화」는 리셋이다**(사람 지시 2026-09-22: 「새 대화라는 게 리셋임 모든게
  // 리셋(로고까지)」). 그 대화에서 올린 사진과 로고를 **창고에서도** 지운다.
  //
  // **주소를 안 보낸다.** 대화 번호만 보내고 서버가 그 대화에 적힌 목록을 읽는다 —
  // 주소를 받는 문이면 남의 사진 주소를 아는 사람이 지울 수 있다.
  //
  // **기다리지 않는다.** 지우기가 늦거나 실패해도 새 대화는 바로 시작돼야 한다.
  const 올린것지우기 = (번호) => {
    if (!번호) return
    fetch(`/api/conversation/${encodeURIComponent(번호)}/uploads`, { method: 'DELETE' })
      .catch(() => {})
  }

  const 새로시작 = () => {
    // **먼저 챙긴다** — 바로 아래에서 `대화` 를 비운다.
    올린것지우기(대화)
    const ㅅ = 새대화상태()
    대화 = ㅅ.대화
    상태 = ㅅ.상태
    // **아직 안 올린 것도 리셋이다.** 안 비우면 새 대화인데 띠에 옛 사진이 남는다.
    for (const x of 대기사진) URL.revokeObjectURL(x.보기)
    대기사진 = []
    사진띠그리기()
    지켜보는중 = null
    기억.set('')
    history.replaceState(null, '', location.pathname)
    msgs.innerHTML = ''
    pane.innerHTML = ''
    paneOpen.hidden = true
    paneBack.hidden = true
    say.value = ''
    say.focus()
    // **지운 뒤에는 반드시 다시 그린다.** 예전에는 여기서 끝나서 인사말도
    // 템플릿 목록도 없는 «흰 화면» 이 남았다(실물 2026-09-19 배포본). 처음 온
    // 사람은 여기가 무엇을 하는 곳인지 다시 볼 길이 없었다.
    첫화면그리기()
  }
  if (새단추) {
    새단추.addEventListener('click', 새로시작)
    새대화그리기()
  }

  if (언어단추) {
    언어단추.addEventListener('click', async () => {
      언어 = 다음언어(언어)
      언어남기기(언어)
      언어그리기()
      새대화그리기()
      // **오른쪽 칸도 다시 그린다.** 단추 글자만 바꾸면 이미 그려 둔 틀 목록·
      // 설계도가 옛 언어로 남는다(실물 2026-09-19: 한국어로 되돌렸는데 설계도
      // 설명만 영어였다). 지나간 말풍선은 **안 건드린다** — 그때 한 말이다.
      if (상태.오른쪽) await 오른쪽띄우기(상태.오른쪽)
      사진띠그리기()
    })
    언어그리기()
  }

  const 적기 = (줄) => {
    msgs.insertAdjacentHTML('beforeend', 말칸html(줄))
    msgs.scrollTop = msgs.scrollHeight
  }
  // **하나만 뜬다.** 두 번 불려도 둘이 쌓이면 안 된다.
  const 생각중켜기 = () => {
    if (msgs.querySelector('.생각중')) return
    msgs.insertAdjacentHTML('beforeend', 생각중html(언어))
    msgs.scrollTop = msgs.scrollHeight
  }
  // **여러 번 불러도 괜찮아야 한다** — 답이 와도 끄고, 터져도 `finally` 가 끈다.
  const 생각중끄기 = () => { msgs.querySelector('.생각중')?.remove() }
  // **말은 안 남기고 상태만 저장한다**(사람 결정 2026-09-19: 미리보기에서 고치기).
  //
  // 대본 한 칸 고칠 때마다 말풍선을 하나씩 남길 수는 없다. 그렇다고 안 남기면
  // 새로고침에 고친 것이 날아간다 — 그 사이엔 모델도 번호표도 안 낀다.
  const 상태저장 = async (패치) => {
    상태 = { ...상태, ...패치 }
    if (!대화) return
    await fetch(`/api/conversation/${encodeURIComponent(대화)}`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 상태: 패치 }) }).catch(() => {})
  }

  const 봇적기 = async (말, 상태패치 = null) => {
    적기({ 역할: '봇', 말 })
    if (상태패치) 상태 = { ...상태, ...상태패치 }
    if (대화) {
      await fetch(`/api/conversation/${encodeURIComponent(대화)}`, { method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 말, 상태: 상태패치 || {} }) }).catch(() => {})
    }
  }

  // 오른쪽 칸. 틀목록·틀은 HTML 로 그리고, 라벨판·작업대는 iframe 으로 끼운다.
  // **목록은 한 번만 받아 둔다.** 띠와 큰 격자가 같은 것을 쓰므로, 고를 때마다
  // 다시 받으면 누를 때마다 기다림이 생긴다. 새 템플릿이 생기면 `목록비우기` 로
  // 지운다.
  let 목록캐시 = null
  const 목록가져오기 = async () => {
    if (!목록캐시) 목록캐시 = 보일것(await templates.목록읽기(fetch, 언어))
    return 목록캐시
  }
  const 목록비우기 = () => { 목록캐시 = null }

  // **고른 뒤에도 목록이 보이게 위에 띠를 남긴다**(사람 결정 2026-09-19).
  // 여태는 하나를 고르면 오른쪽 칸이 상세로 통째로 바뀌어 목록이 사라졌고,
  // 다시 보려면 「목록으로」를 눌러야 했다. 목록 화면일 때는 아래 큰 격자가
  // 그 몫을 하므로 띠를 숨긴다 — 같은 것을 두 벌 보여 주지 않는다.
  const 띠그리기 = async (오른쪽) => {
    const 목록화면 = !오른쪽 || 오른쪽.종류 === '틀목록'
    if (목록화면) { paneStrip.hidden = true; paneStrip.innerHTML = ''; return }
    try {
      const 목록 = await 목록가져오기()
      if (!목록.length) { paneStrip.hidden = true; paneStrip.innerHTML = ''; return }
      paneStrip.innerHTML = 틀카드html(목록.map((t) => ({
        코드: t.코드, 이름: templates.보일이름(t, 언어), 표지: t.미리보기 || '',
      })), 오른쪽.코드 || 상태.틀?.코드 || '')
      paneStrip.hidden = false
    } catch {
      // 띠는 곁다리다 — 못 받아도 상세는 그대로 보여야 한다.
      paneStrip.hidden = true
      paneStrip.innerHTML = ''
    }
  }

  const 오른쪽띄우기 = async (오른쪽) => {
    상태.오른쪽 = 오른쪽
    await 띠그리기(오른쪽)
    const 주소 = 오른쪽주소(오른쪽)
    paneOpen.hidden = !주소
    paneBack.hidden = !오른쪽 || 오른쪽.종류 === '틀목록'
    const 단추 = 고르기단추(오른쪽, 상태.틀?.코드 || '', 언어)
    if (paneUse) {
      paneUse.hidden = !단추
      if (단추) { paneUse.textContent = 단추.글; paneUse.disabled = 단추.고름 }
    }
    paneOpen.href = 주소 || '#'
    if (주소) {
      pane.innerHTML = `<iframe src="${주소.replace(/"/g, '&quot;')}" title="${오른쪽.종류}"></iframe>`
      return
    }
    if (오른쪽?.종류 === '틀') {
      pane.innerHTML = `<p class="muted">${esc(말하기(언어)('읽는중'))}</p>`
      // **보고 있는 템플릿의 이름을 쓴다.** 여태는 고른 것(`상태.틀`)의 이름을
      // 썼다 — 누르면 곧 고르던 때는 둘이 같았지만, 구경하는 지금은 다르다.
      let 이름 = 오른쪽.코드
      try {
        const t = (await 목록가져오기()).find((x) => x.코드 === 오른쪽.코드)
        if (t) 이름 = templates.보일이름(t, 언어)
      } catch { /* 목록을 못 읽으면 코드로 둔다 */ }
      if (paneUse) { paneUse.dataset.code = 오른쪽.코드; paneUse.dataset.name = 이름 }
      try {
        const 틀 = await templates.틀읽기(오른쪽.코드, fetch, 언어)
        pane.innerHTML = templates.틀그림(틀, 이름, 언어)
      } catch (e) {
        pane.innerHTML = `<p class="muted">${esc(e.message)}</p>`
      }
      return
    }
    // **굽기 전에 멈춘 자리**(사람 결정 2026-09-19 「항상 거친다」).
    //
    // iframe 이 아니라 HTML 로 그린다 — 틀목록과 같은 길이다. 여기서 누를 수
    // 있는 것은 「이대로 만들기」 하나뿐이고, 그것을 눌러야 돈이 나간다.
    if (오른쪽?.종류 === '미리보기') {
      // **사진 갈래를 같이 넘긴다.** 안 넘기면 「비워 두기」를 고른 사람에게도
      // 「AI가 만들 사진」이라고 적힌다 — 미리보기가 거짓말을 한다.
      // **사진 자리 판은 목록에서 찾는다**(사람 지시 2026-09-22). 밑그림에는
      // 안 실려 온다 — 그건 이 판에 쓸 대본과 카드일 뿐이다. 목록을 못 읽어도
      // 미리보기는 떠야 하므로 실패는 빈 글자로 삼킨다.
      let 자리판 = ''
      try {
        const 틀코드 = 상태.틀?.코드 || ''
        if (틀코드) {
          자리판 = (await 목록가져오기()).find((t) => t.코드 === 틀코드)?.자리판 || ''
        }
      } catch { /* 판이 없으면 그냥 안 그린다 */ }
      // **굽는 중이면 단추를 꺼서 그린다**(2026-09-29) — 다시 그려도 되살아나지 않게.
      pane.innerHTML = 미리보기html(오른쪽.밑그림, 언어, 상태.구울것?.사진 || '', 자리판,
        상태.일?.종류 === '만들기')
      const 단추 = pane.querySelector('#bakeGo')
      if (단추) 단추.addEventListener('click', () => 굽기걸기(오른쪽.밑그림, 단추))
      // **타자 칠 때는 자수만, 손 뗄 때 한 번 저장한다**(설계 §6.3). 글자마다
      // 저장하면 한 칸 고치는 사이에 요청이 수십 번 나간다.
      for (const 칸 of pane.querySelectorAll('.미리-글칸')) {
        칸.addEventListener('input', () => 자수그리기(칸))
        칸.addEventListener('change', () => 대본고치기(오른쪽, 칸))
      }
      // 사진 설명도 같은 잣대다 — 손 뗄 때 한 번 저장한다.
      for (const 칸 of pane.querySelectorAll('.미리-설명칸')) {
        칸.addEventListener('change', () => 사진설명고치기(오른쪽, 칸))
      }
      // 판 전체의 사진 결도 같은 잣대다 — 손 뗄 때 한 번 저장한다.
      const 결칸 = pane.querySelector('.미리-결칸')
      if (결칸) 결칸.addEventListener('change', () => 사진결고치기(오른쪽, 결칸))
      const 화풍칸 = pane.querySelector('.미리-화풍칸')
      if (화풍칸) 화풍칸.addEventListener('change', () => 화풍고치기(오른쪽, 화풍칸))
      사진손잡이(오른쪽)
      return
    }
    // 틀목록 (기본)
    // **먼저 뼈대를 깐다.** `목록가져오기` 를 기다리는 동안 칸이 비어 있었다.
    pane.innerHTML = 뼈대html()
    try {
      // **이름은 `보일이름` 을 거친다.** 여기서 `t.이름` 을 그냥 쓰면 이 칸만
      // 한국어로 남는다 — 서버가 실어 보내는 카드는 이미 거치고 있었다.
      // **공용 전부 + 내가 만든 것.** 남이 만든 개인 템플릿은 여기서 걸러진다.
      const 목록 = await 목록가져오기()
      pane.innerHTML = 틀카드html(목록.map((t) => ({
        코드: t.코드, 이름: templates.보일이름(t, 언어), 표지: t.미리보기 || '',
      })), 상태.틀?.코드 || '')
    } catch (e) {
      pane.innerHTML = `<p class="muted">${esc(e.message)}</p>`
    }
  }

  // 고친 자수를 그 자리에서 다시 그린다. **넘치면 표를 하나 더 단다** —
  // 넘친 채로 「이대로 만들기」를 누르면 굽기 전에 막힌다(배치 검증).
  const 자수그리기 = (칸) => {
    const 표 = 칸.parentElement?.querySelector('.미리-자수')
    const 최대 = Number(칸.dataset['최대']) || 0
    if (!표 || !최대) return
    const 이제 = 자수세기(칸.value)
    const 넘침 = 이제 > 최대
    표.textContent = 미리보기말.자수[쓸언어(언어)](이제, 최대)
      + (넘침 ? ` ${미리보기말.넘침[쓸언어(언어)]()}` : '')
    표.classList.toggle('넘침', 넘침)
  }

  // 고친 글을 **대본** 에 되돌려 넣는다. 카드가 아니다 — 카드의 줄 나눔·강조는
  // 이 글에서 계산된 값이라, 굽는 쪽이 이 글로 **다시 얹는다**.
  //
  // `오른쪽.밑그림` 은 `상태.오른쪽` 안의 바로 그 묶음이다. 여기서 고치면 상태가
  // 곧 고쳐진 것이라, 남은 일은 저장뿐이다.
  const 대본고치기 = async (오른쪽, 칸) => {
    const 장 = Number(칸.dataset['장'])
    const 칸번호 = Number(칸.dataset['칸'])
    const 블록 = 오른쪽?.밑그림?.슬라이드?.[장]?.blocks
    if (!Array.isArray(블록) || 블록[칸번호] === 칸.value) return
    블록[칸번호] = 칸.value
    await 상태저장({ 오른쪽: 상태.오른쪽 })
  }

  // 사람이 적은 사진 설명을 **카드의 그 자리** 에 되돌려 넣는다(사람 지시
  // 2026-09-22). 대본과 달리 카드 쪽이다 — 그림을 만드는 쪽이 보는 것이
  // `장식영역[자리].설명` 이기 때문이다(`analyze/사진만들기.지시문짓기`).
  //
  // **빈 글도 그대로 넣는다.** 지운 것은 「기본으로 돌아가라」는 뜻이라,
  // 안 넣으면 한 번 적은 뒤에는 지울 방법이 없어진다.
  const 사진설명고치기 = async (오른쪽, 칸) => {
    const 장 = Number(칸.dataset['장'])
    const 자리 = Number(칸.dataset['자리'])
    const 것 = 오른쪽?.밑그림?.카드?.[장]?.장식영역?.[자리]
    if (!것 || String(것.설명 ?? '') === 칸.value) return
    것.설명 = 칸.value
    await 상태저장({ 오른쪽: 상태.오른쪽 })
  }

  // 판 전체의 사진 결(2026-09-28). 설명 칸과 같은 결로 밑그림에 적고 저장한다.
  const 사진결고치기 = async (오른쪽, 칸) => {
    if (!오른쪽?.밑그림 || String(오른쪽.밑그림.사진결 ?? '') === 칸.value) return
    오른쪽.밑그림.사진결 = 칸.value
    await 상태저장({ 오른쪽: 상태.오른쪽 })
  }

  // 화풍(2026-09-29). 밑그림에 적고 **예시 그림과 안내 두 곳만** 갈아 끼운 뒤 저장한다.
  // 통째로 다시 그리면 굽는 중에 「이대로 만들기」 단추가 켜진 채로 되살아나, 다시 눌러
  // 사진값이 두 번 나갈 수 있었다(검토 I-2).
  const 화풍고치기 = async (오른쪽, 칸) => {
    if (!오른쪽?.밑그림 || 오른쪽.밑그림.화풍 === 칸.value) return
    오른쪽.밑그림.화풍 = 칸.value
    const 값 = 화풍안내(오른쪽.밑그림, 언어)
    const 그림 = pane.querySelector('.미리-화풍그림')
    if (그림) 그림.src = 값.그림
    const 안내 = pane.querySelector('.미리-화풍안내')
    if (안내) 안내.textContent = 값.안내
    await 상태저장({ 오른쪽: 상태.오른쪽 })
  }

  // ── 미리보기에서 사진 만지기 (사람 지시 2026-09-20) ────────────
  //
  // 「이 부분은 좀 안 맞네 하면 뺄수도 있는 칸 혹은 다른 칸이랑 바꿀수도 있는」
  //
  // 끌어다 놓기와 ✕ 둘 다 **같은 함수 하나**로 모인다(`미리보기.사진옮기기`) —
  // 빼기는 「자리 → 안 쓴 사진」으로 옮기는 것일 뿐이다.

  /** 화면 요소에서 «어느 곳인가» 를 읽는다. 자리이거나 안 쓴 사진 한 칸이다. */
  const 곳읽기 = (엘) => {
    if (!엘) return null
    if (엘.dataset['안쓴통']) return { 안쓴: true }
    if (엘.dataset['안쓴'] != null) return { 안쓴: Number(엘.dataset['안쓴']) }
    if (엘.dataset['장'] != null) {
      return { 장: Number(엘.dataset['장']), 자리: Number(엘.dataset['자리']) }
    }
    return null
  }

  const 사진고침저장 = async (오른쪽) => {
    await 상태저장({ 오른쪽: 상태.오른쪽 })
    // **다시 그린다.** 사진이 오갔으니 ✕ 자리도 「안 쓴 사진」 칸도 달라진다.
    await 오른쪽띄우기(오른쪽)
  }

  const 사진손잡이 = (오른쪽) => {
    const 밑그림 = 오른쪽 && 오른쪽.밑그림
    if (!밑그림) return

    for (const 단추 of pane.querySelectorAll('.미리-빼기')) {
      단추.addEventListener('click', async (e) => {
        e.stopPropagation()
        if (사진빼기(밑그림, 곳읽기(단추))) await 사진고침저장(오른쪽)
      })
    }

    for (const 것 of pane.querySelectorAll('.미리-끌것')) {
      것.addEventListener('dragstart', (e) => {
        // **곳을 글자로 실어 보낸다.** 브라우저가 끌고 다니는 동안 자바스크립트
        // 변수를 믿을 수 없다(다른 창으로 나갔다 올 수 있다).
        e.dataTransfer.setData('text/plain', JSON.stringify(곳읽기(것)))
        e.dataTransfer.effectAllowed = 'move'
        것.classList.add('끄는중')
      })
      것.addEventListener('dragend', () => 것.classList.remove('끄는중'))
    }

    // 놓을 곳 — 사진 칸(찬 것·빈 것)과 「안 쓴 사진」 통.
    for (const 곳 of pane.querySelectorAll('.미리-사진, .미리-안쓴')) {
      곳.addEventListener('dragover', (e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        곳.classList.add('받는중')
      })
      곳.addEventListener('dragleave', () => 곳.classList.remove('받는중'))
      곳.addEventListener('drop', async (e) => {
        e.preventDefault()
        곳.classList.remove('받는중')
        let 어디서 = null
        try { 어디서 = JSON.parse(e.dataTransfer.getData('text/plain')) } catch { return }
        if (사진옮기기(밑그림, 어디서, 곳읽기(곳))) await 사진고침저장(오른쪽)
      })
    }
  }

  // 「이대로 만들기」 — **여기서 처음으로 돈이 나간다.**
  //
  // 사진 갈래와 로고는 초안을 걸 때 `상태.구울것` 에 적어 뒀다(`server/chat.js`).
  // 사람이 초안을 보는 사이에 바꿀 수 있는 값이라 초안 봉투에 안 실었다.
  const 굽기걸기 = async (밑그림, 단추) => {
    const 되돌릴글 = 단추?.textContent
    if (단추) { 단추.disabled = true; 단추.textContent = 미리보기말.굽는중[쓸언어(언어)]() }
    const 답 = await 붙여보내기('/api/bake', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 밑그림,
        사진: 상태.구울것?.사진 || '', 로고: 상태.구울것?.로고 || '' }),
    }).then((r) => r.json()).catch(() => null)
    if (!답?.job_id) {
      // **단추를 되살린다.** 안 되살리면 사람이 다시 누를 길이 없다 — 초안은
      // 멀쩡한데 화면만 얼어붙는다.
      if (단추) { 단추.disabled = false; 단추.textContent = 되돌릴글 }
      await 봇적기(말하기(언어)('못보냄', 답?.why || 말하기(언어)('서버묵묵')))
      return
    }
    const 일 = { 번호: 답.job_id, 종류: '만들기' }
    // **빈 사진 자리에 「만들고 있다」를 보인다**(2026-09-24). 사진을 만드는
    // 판일 때만 — 「비워 두기」를 고른 판에서 돌아가는 동그라미를 보이면
    // 화면이 거짓말을 한다.
    if ((상태.구울것?.사진 || '').trim() === '만듦') {
      pane.querySelectorAll('.미리-사진빔').forEach((e) => e.classList.add('만들것'))
    }
    await 봇적기(말하기(언어)('이제굽는다', !!(상태.구울것?.사진 || '').trim()), { 일 })
    일기다리기(일)
  }

  // 일(담김·만들기)을 끝날 때까지 5초마다 물어본다.
  // **기다리는 동안 «어디까지 왔는지» 를 보여 준다**(사람 지시 2026-09-20:
  // 「기다리는 표시 예를들어 얼마나 되고있는지 퍼센트를 나타내주는거」).
  //
  // **말풍선으로 쌓지 않는다.** 5초마다 도는 고리라 3분이면 서른여섯 개가
  // 쌓인다. 서버에도 안 남긴다 — 대화 기록이 진행률로 뒤덮인다. 그래서 줄
  // «하나» 를 두고 그 안 글자만 갈아 끼운다.
  // 막대가 기어가게 하는 값들. **`진행그리기` 를 여러 번 불러도 이어진다.**
  let 진행받은값 = 0
  let 진행받은때 = 0
  let 진행보임 = 0
  let 진행시계 = null

  const 진행칠하기 = (말) => {
    const 줄 = msgs.querySelector('.진행줄')
    if (!줄) return
    진행보임 = 부드러운값(진행받은값, (Date.now() - 진행받은때) / 1000, 진행보임)
    const 바 = 줄.querySelector('.진행바 i')
    const 글 = 줄.querySelector('.진행글')
    if (바) 바.style.width = `${진행보임.toFixed(1)}%`
    if (글 && 말 !== undefined) 글.textContent = `${Math.round(진행보임)}%${말 ? ` · ${말}` : ''}`
  }

  const 진행그리기 = (봉투, 번호) => {
    let 줄 = msgs.querySelector('.진행줄')
    if (!봉투) {
      if (진행시계) { clearInterval(진행시계); 진행시계 = null }
      진행받은값 = 0; 진행보임 = 0; 진행받은때 = 0
      if (줄) 줄.remove()
      return
    }
    if (!줄) {
      msgs.insertAdjacentHTML('beforeend',
        '<div class="말칸 봇 진행줄"><div class="진행바"><i></i></div>'
        + '<div class="진행아래"><div class="진행글"></div>'
        + `<button type="button" class="진행그만">${esc(말하기(언어)('그만두기'))}</button>`
        + '</div></div>')
      줄 = msgs.querySelector('.진행줄')
      if (번호) 줄.dataset.번호 = 번호
      // **「그만두기」.** 줄에서 기다리는 사진을 fal 에서 빼므로 값을 아낀다 —
      // 이미 그리는 중인 것은 못 되돌린다. 만든 것까지는 그대로 구워 낸다.
      줄?.querySelector('.진행그만')?.addEventListener('click', async (e) => {
        const 단추 = e.currentTarget
        단추.disabled = true
        단추.textContent = 말하기(언어)('그만두는중')
        const 번호 = 줄?.dataset?.번호 || ''
        if (!번호) return
        await 붙여보내기(`/api/jobs/${encodeURIComponent(번호)}/stop`, { method: 'POST' })
          .catch(() => null)
      })
      줄 = msgs.querySelector('.진행줄')
      msgs.scrollTop = msgs.scrollHeight
    }
    const 퍼 = Number.isFinite(봉투.progress) ? Math.max(0, Math.min(100, 봉투.progress)) : null
    const 말 = String(봉투.말 || '').trim()
    if (퍼 !== null && 퍼 !== 진행받은값) { 진행받은값 = 퍼; 진행받은때 = Date.now() }
    if (!진행받은때) 진행받은때 = Date.now()
    진행칠하기(말)
    // **5초 폴링 사이를 메운다.** 서버 값은 단계가 바뀔 때만 오는데, 그 사이가
    // 2분 38초인 구간도 있다(실측). 0.5초마다 다시 칠해 기어가게 한다.
    if (진행시계) clearInterval(진행시계)
    진행시계 = setInterval(() => 진행칠하기(말), 500)
  }

  // 이미 꽂은 자리 — 5초마다 도는 고리가 같은 것을 또 그리지 않게.
  let 꽂은것 = new Set()

  const 사진채우기 = (봉투) => {
    const 밑그림 = 상태.오른쪽?.밑그림
    if (!밑그림) return
    for (const { 열, 장, 자리, 주소 } of 사진꽂을것(봉투?.사진들, 꽂은것)) {
      // **밑그림에도 적는다.** 화면만 고치면 새로고침에 날아가고, 끝난 뒤
      // 다시 그릴 때 빈 자리로 돌아간다.
      const 것 = 밑그림.카드?.[장]?.장식영역?.[자리]
      if (것) 것.media_url = 주소
      꽂은것.add(열)
      // 자리를 통째로 다시 안 그린다 — 사람이 설명 칸에 적던 글이 날아간다.
      // 그림 하나만 갈아 끼우고, 끌기·빼기 손잡이는 끝난 뒤 다시 그릴 때 붙는다.
      const 칸 = pane.querySelector(`.미리-사진[data-장="${장}"][data-자리="${자리}"]`)
      if (!칸) continue
      칸.classList.add('미리-갓온것')
      칸.innerHTML = `<img src="${주소.replace(/"/g, '&quot;')}" alt="">`
    }
  }

  const 일기다리기 = async (일) => {
    const 시작 = Date.now()
    꽂은것 = new Set()
    while (Date.now() - 시작 < 15 * 60 * 1000) {
      await sleep(5000)
      const 봉투 = await fetch(`/api/jobs/${encodeURIComponent(일.번호)}`).then((r) => r.json()).catch(() => null)
      // **`status` 가 없으면 «이번 판은 모른다» 다.** 중계가 답을 못 읽었을 때
      // 워커가 빈 것을 준다(`_worker.js`) — 그것을 실패로 읽으면 안 된다.
      if (!봉투 || !봉투.status) continue
      if (봉투.status === 'succeeded' || 봉투.status === 'failed') {
        진행그리기(null)
        const r = 일끝처리(일.종류, 봉투, 언어)
        // 끝난 일은 상태에서 지운다 — 안 지우면 새로고침할 때마다 다시 기다린다.
        await 봇적기(r.말, { ...(r.오른쪽 ? { 오른쪽: r.오른쪽 } : {}), 일: null })
        // **담긴 직후에만 깐다.** 오른쪽에 라벨판이 열리는 바로 그 자리다 —
        // 사람이 네모를 긋기 전에 예시를 본다. 대화 상태에는 안 남긴다:
        // 새로고침해서 다시 뜨면 지나간 말풍선 사이에 예시가 끼어든다.
        if (일.종류 === '담김' && r.코드) {
          msgs.insertAdjacentHTML('beforeend', 라벨예시html(언어))
          msgs.scrollTop = msgs.scrollHeight
        }
        if (r.오른쪽) await 오른쪽띄우기(r.오른쪽)
        if (일.종류 === '담김' && r.코드) 분석지켜보기(r.코드)
        return
      }
      진행그리기(봉투, 일.번호)
      사진채우기(봉투)
    }
    진행그리기(null)
    await 봇적기(말하기(언어)('만들기오래'), { 일: null })
  }

  // 라벨판에서 분석을 걸면 상태가 바뀐다. 5초마다 보고 바뀔 때마다 말한다. 5분 한도.
  const 분석지켜보기 = async (코드) => {
    if (지켜보는중 === 코드) return
    지켜보는중 = 코드
    let 이전 = null
    for (let n = 0; n < 60 && 지켜보는중 === 코드; n += 1) {
      await sleep(5000)
      const 전부 = await fetch('/api/labels/~status', { cache: 'no-store' }).then((r) => r.json()).catch(() => null)
      const 지금 = 전부?.[코드] ?? null
      if (지금 && 지금 !== 이전) {
        이전 = 지금
        // 설계서 §6 은 「5분 넘게 그대로면」 그만두라 한다 — 담긴 때가 아니라
        // 마지막으로 바뀐 때부터 세야 하므로, 바뀌면 시계를 0 으로 되돌린다.
        n = -1
        const 말 = 분석알림(지금, 언어)
        if (말) await 봇적기(말)
      }
      if (지금 === '분석 끝') {
        // **띠가 들고 있던 옛 목록을 버린다.** 안 버리면 방금 만든 템플릿이
        // 띠에 안 뜬다 — 새로고침해야 보이는 꼴이 된다.
        목록비우기()
        const 목록 = await templates.목록읽기(fetch, 언어).catch(() => [])
        const 틀 = 목록.find((t) => t.코드 === 코드)
        if (틀) {
          // **내 것으로 적어 둔다.** 이 줄이 없으면 방금 만든 템플릿이 다음
          // 목록에서 사라진다 — 개인 것은 적어 둔 사람에게만 보이기 때문이다.
          내것더하기(코드)
          // 화면에 거는 이름이다. 람다로 보내는 값은 서버가 창고에서 다시 집는다.
          상태.틀 = { 코드: 틀.코드, 이름: templates.보일이름(틀, 언어) }
          await 봇적기(말하기(언어)('새틀생김', 상태.틀.이름), { 틀: 상태.틀, 지켜보기: null })
          await 오른쪽띄우기({ 종류: '틀', 코드 })
          // **이름이 코드 그대로면 묻는다.** 분석은 이름을 안 받았을 때 게시물
          // 코드를 이름 자리에 넣는다(`make_dsl_cardnews.틀_쓰기`). 여기서
          // 묻지 않으면 그 코드가 목록에도 말풍선에도 계속 나온다.
          if ((틀.이름 || '') === 틀.코드) {
            이름묻는중 = 코드
            await 봇적기(말하기(언어)('이름물음'))
          }
        }
        지켜보는중 = null
        return
      }
      if (지금 === '분석 실패') { 지켜보는중 = null; return }
    }
    if (지켜보는중 === 코드) {
      지켜보는중 = null
      await 봇적기(말하기(언어)('분석오래'))
    }
  }

  /** 기다리던 이름을 받아 창고의 이름을 바꾼다. 분석을 다시 안 돌린다 —
   *  이름만 고치자고 다시 재는 것은 값도 시간도 아깝다(`app.js` 와 같은 길). */
  const 이름붙이기 = async (코드, 이름) => {
    이름묻는중 = null
    try {
      const res = await fetch('/api/template/rename', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 코드, 이름 }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || j.ok === false) throw new Error(j.why || '')
      const 붙은것 = j.이름 || 이름
      if (상태.틀 && 상태.틀.코드 === 코드) 상태.틀 = { ...상태.틀, 이름: 붙은것 }
      await 봇적기(말하기(언어)('이름붙임', 붙은것), { 틀: 상태.틀 })
      // 목록이 들고 있던 옛 이름을 버린다 — 안 버리면 띠에 코드가 그대로 남는다.
      목록비우기()
      await 오른쪽띄우기({ 종류: '틀목록' })
    } catch (e) {
      await 봇적기(말하기(언어)('이름못붙임', e.message || ''))
    }
  }

  // **지금 도는 채팅 턴의 약속.** 사진쓰임 단추가 이것을 기다렸다가 적는다 —
  // 턴 끝의 «통째 저장» 이 그 선택을 덮지 않게(검토 2026-09-29).
  let 도는턴 = null
  const 보내기 = (말, 더 = {}) => {
    const 턴 = _보내기(말, 더).finally(() => { if (도는턴 === 턴) 도는턴 = null })
    도는턴 = 턴
    return 턴
  }

  // `더` 는 몸통에 얹을 여벌 칸이다 — 지금은 「다시」 하나뿐이다.
  const _보내기 = async (말, 더 = {}) => {
    if (보내는중 || !말.trim()) return
    적기({ 역할: '사람', 말 })
    say.value = ''
    보내는중 = true
    send.disabled = true
    생각중켜기()
    try {
      const res = await 붙여보내기('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 대화, 말, 언어, ...더 }) })
      const 답 = await res.json()
      // **봇 말풍선보다 «먼저» 끈다** — 뒤에 끄면 답이 한 칸 아래에 떴다가 올라온다.
      생각중끄기()
      if (!res.ok) { 적기({ 역할: '봇', 말: 답.why || 말하기(언어)('서버묵묵') }); return }
      if (답.대화 && 답.대화 !== 대화) {
        대화 = 답.대화
        기억.set(대화)
        history.replaceState(null, '', `?c=${대화}`)
      }
      상태 = 답.상태 || 상태
      적기({ 역할: '봇', 말: 답.말 })
      // **선택창** — 봇이 「고르기」를 냈으면 그 말풍선 밑에 단추를 깐다.
      if (답.고를것 && 답.고를것.length) {
        msgs.insertAdjacentHTML('beforeend', 고르기html(답.무엇, 답.고를것, 언어))
        msgs.scrollTop = msgs.scrollHeight
      }
      // **화풍 물음이면 카드를 깐다**(사람 결정 2026-09-29).
      if (답.무엇 === '화풍') {
        msgs.insertAdjacentHTML('beforeend', 화풍카드html(언어))
        msgs.scrollTop = msgs.scrollHeight
      }
      // 서버가 틀 카드를 실어 보냈으면(틀보기·없는 틀·틀 없이 만들기) 오른쪽에 목록을 띄운다.
      if (답.오른쪽) await 오른쪽띄우기(답.오른쪽)
      else if (답.틀카드) await 오른쪽띄우기({ 종류: '틀목록' })
      if (답.일) 일기다리기(답.일)
    } catch (e) {
      적기({ 역할: '봇', 말: 말하기(언어)('못보냄', e.message) })
    } finally {
      // 그물. 위에서 이미 껐으면 아무 일도 안 한다.
      생각중끄기()
      보내는중 = false
      send.disabled = false
      say.focus()
    }
  }

  // ── 로고 올리기 ────────────────────────────────────────────────
  //
  // **이 길은 딥시크를 안 거친다.** 그림은 말이 아니라서 「여섯 중 무엇인가」를
  // 물어볼 것이 없다 — 파일을 부치고, 받은 주소를 이 대화의 상태에 적고, 그
  // 다음에야 평소 길로 한 마디 보낸다.
  const 로고칸 = $('logoFile')
  let 로고올리는중 = false
  const 로고고르기 = () => {
    if (!로고칸 || 로고올리는중) return
    로고칸.value = ''   // 같은 파일을 다시 골라도 `change` 가 뜨게
    로고칸.click()
  }
  if (로고칸) {
    로고칸.addEventListener('change', async () => {
      const 파일 = 로고칸.files && 로고칸.files[0]
      if (!파일 || 로고올리는중) return
      로고올리는중 = true
      적기({ 역할: '봇', 말: 말하기(언어)('로고올리는중') })
      try {
        // 칸 이름은 `logo` 다 — 저쪽(`render/app.upload_media`)이 그 이름으로 찾는다.
        const 짐 = new FormData()
        짐.append('logo', 파일, 파일.name)
        const res = await 붙여보내기('/api/upload', { method: 'POST', body: 짐 })
        const 난것 = await res.json().catch(() => null)
        if (!res.ok || !난것 || !난것.ok || !난것.주소) {
          throw new Error((난것 && 난것.why) || 말하기(언어)('서버묵묵'))
        }
        // **주소를 먼저 적고 말을 보낸다.** 순서가 바뀌면 서버가 아직 로고를
        // 모른 채 만들기를 보고 또 묻는다.
        await 봇적기(말하기(언어)('로고받음'), { 로고: 난것.주소 })
        await 보내기(말하기(언어)('로고올렸음'))
      } catch (err) {
        적기({ 역할: '봇', 말: 말하기(언어)('로고못올림', err.message) })
      } finally {
        로고올리는중 = false
      }
    })
  }

  // ── 채팅창에 사진 올리기 (사람 결정 2026-09-19) ────────────────
  //
  // **길은 셋, 문은 하나다** — 단추·끌어다 놓기·붙여넣기가 다 `사진올리기` 로
  // 모인다. 셋을 따로 만들면 한쪽만 고치게 된다.
  //
  // **한 장씩 따로 올린다.** 사진을 안 줄이기로 했으므로(사람 지시: 「품질
  // 중요해… 타협하지마」) 여러 장을 한 봉투에 묶으면 게이트웨이가 10MB 에서
  // 끊는다. 한 장씩이면 그 한계에 안 닿는다.
  //
  // **받는 동안은 아무것도 안 만든다**(사람 결정). 주소만 상태에 쌓아 두었다가
  // 사람이 「만들어줘」 할 때 그때 자리에 꽂는다.
  const 사진칸 = $('photoFile')
  const 사진띠 = $('shots')
  let 사진올리는중 = false
  // **아직 안 올린 파일**(사람 지시 2026-09-20: 「컨트롤 v 하면 사진이 바로
  // 들어가거든? … 엔터 눌러야 들어가야함」). 붙여넣기·끌어다 놓기·단추 셋이
  // 여기에 «담기만» 하고, 보내기에서 그때 올린다.
  //
  // `{파일, 보기}` 쌍으로 둔다 — `보기` 는 `URL.createObjectURL` 이 만든 로컬
  // 주소다. 띠에 그리려면 주소가 있어야 하는데 아직 서버 주소가 없다.
  let 대기사진 = []

  const 사진띠그리기 = () => {
    if (!사진띠) return
    사진띠.innerHTML = 사진띠html(상태.사진들, 언어, 대기사진.map((x) => x.보기))
    사진띠.hidden = !사진띠.innerHTML
  }

  // **담기만 한다. 안 올린다.**
  const 사진담기 = (파일들) => {
    const 것들 = [...(파일들 || [])].filter((f) => f && f.type.startsWith('image/'))
    if (!것들.length) return
    for (const 파일 of 것들) {
      대기사진.push({ 파일, 보기: URL.createObjectURL(파일) })
    }
    사진띠그리기()
  }

  // 대기에서 한 장 뺀다. **만든 주소를 거둔다** — 안 거두면 화면이 그 그림을
  // 계속 붙들고 있는다.
  const 대기빼기 = (차례) => {
    if (차례 < 0 || 차례 >= 대기사진.length) return
    const [뺀것] = 대기사진.splice(차례, 1)
    if (뺀것) URL.revokeObjectURL(뺀것.보기)
    사진띠그리기()
  }

  const 사진올리기 = async (파일들) => {
    const 것들 = [...(파일들 || [])].filter((f) => f && f.type.startsWith('image/'))
    if (!것들.length || 사진올리는중) return
    사진올리는중 = true
    적기({ 역할: '봇', 말: 말하기(언어)('사진올리는중', 것들.length) })
    const 받은것 = []
    try {
      for (const 파일 of 것들) {
        // 칸 이름은 `photos` 다 — 저쪽(`render/app.upload_media`)이 그 이름으로 찾는다.
        const 짐 = new FormData()
        짐.append('photos', 파일, 파일.name || 'photo.png')
        const res = await 붙여보내기('/api/upload', { method: 'POST', body: 짐 })
        const 난것 = await res.json().catch(() => null)
        if (!res.ok || !난것 || !난것.ok || !(난것.사진들 || []).length) {
          throw new Error((난것 && 난것.why) || 말하기(언어)('서버묵묵'))
        }
        받은것.push(...난것.사진들)
      }
    } catch (err) {
      적기({ 역할: '봇', 말: 말하기(언어)('사진못올림', err.message) })
    } finally {
      사진올리는중 = false
    }
    if (!받은것.length) return
    // **한 장이라도 받았으면 그것만은 살린다.** 셋째 장에서 막혔다고 앞의 둘을
    // 버리면 사람이 다시 올려야 한다.
    상태.사진들 = [...(상태.사진들 || []), ...받은것]
    사진띠그리기()
    // **쓰임은 대화에 하나뿐이라 새로 올리면 되돌린다**(검토 2026-09-29). 안 되돌리면
    // 앞 묶음에서 고른 것이 새 묶음에 몰래 이어진다. 묻는 말도 「전부」라고 한다.
    await 봇적기(말하기(언어)('사진받음', 상태.사진들.length),
              { 사진들: 상태.사진들, 사진쓰임: '' })
    // **어떻게 쓸지 묻는다**(사람 결정 2026-09-28). 단추 둘 — 누르면 말을 안 보내고
    // 상태에만 적는다(선택창 클릭 참고).
    await 봇적기(말하기(언어)('사진쓰임물음'))
    msgs.insertAdjacentHTML('beforeend', 고르기html('사진쓰임', 사진쓰임단추(언어), 언어))
    msgs.scrollTop = msgs.scrollHeight
  }

  const 사진빼기 = async (차례) => {
    const 목록 = [...(상태.사진들 || [])]
    if (차례 < 0 || 차례 >= 목록.length) return
    목록.splice(차례, 1)
    상태.사진들 = 목록
    사진띠그리기()
    await 상태저장({ 사진들: 목록 })
  }

  if (사진칸) {
    사진칸.addEventListener('change', async () => {
      const 것들 = [...(사진칸.files || [])]
      사진칸.value = ''   // 같은 파일을 다시 골라도 `change` 가 뜨게
      사진담기(것들)
    })
  }
  const 사진단추 = $('photoBtn')
  if (사진단추) {
    사진단추.addEventListener('click', () => {
      if (사진칸 && !사진올리는중) 사진칸.click()
    })
  }
  if (사진띠) {
    사진띠.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('.샷빼기')
      if (!b) return
      // **`false` 가 아니라 `undefined` 로 갈린다** — `data-차례="0"` 은 있는
      // 값이고 `0` 은 거짓이라, 값이 있나 없나로 봐야 한다.
      if (b.dataset['대기차례'] !== undefined) 대기빼기(Number(b.dataset['대기차례']))
      else 사진빼기(Number(b.dataset['차례']))
    })
  }

  // 끌어다 놓기 — 채팅 칸 전체가 받는 자리다. **기본 동작을 막아야** 브라우저가
  // 그 그림으로 페이지를 갈아 치우지 않는다.
  // **`$('chat')` 로 직접 집는다.** 같은 이름의 `chat` 변수는 이 아래에서
  // `const` 로 선언된다 — 여기서 그 이름을 쓰면 아직 못 쓰는 자리(TDZ)라
  // 화면이 통째로 죽는다.
  const 채팅칸 = $('chat')
  if (채팅칸) {
    const 끌기표 = (켤까) => 채팅칸.classList.toggle('끌기중', 켤까)
    채팅칸.addEventListener('dragover', (e) => { e.preventDefault(); 끌기표(true) })
    채팅칸.addEventListener('dragleave', (e) => {
      if (e.target === 채팅칸) 끌기표(false)
    })
    채팅칸.addEventListener('drop', async (e) => {
      e.preventDefault()
      끌기표(false)
      사진담기(e.dataTransfer && e.dataTransfer.files)
    })
  }

  // 붙여넣기 — 화면 캡처를 바로 붙일 수 있게. 글자를 붙이는 것은 안 건드린다.
  if (say) {
    say.addEventListener('paste', (e) => {
      const 것들 = [...((e.clipboardData && e.clipboardData.files) || [])]
      if (!것들.length) return
      e.preventDefault()
      사진담기(것들)
    })
  }

  // **사람이 직접 친 말만 이름으로 받는다.** 카드 단추가 만든 말(`템플릿 …`)
  // 까지 가로채면 「템플릿 키키」가 이름이 돼 버린다. 카드를 눌렀다는 것은
  // 이름 붙이기를 그만두었다는 뜻이라 그때는 물음을 접는다 — 이름은 목록의
  // 「이름 바꾸기」로 언제든 붙일 수 있다.
  const 친말보내기 = async (글) => {
    if (보내는중) return
    // **대기 사진을 «먼저» 올리고 끝까지 기다린다**(사람 지시 2026-09-20).
    //
    // 안 기다리면 조용히 깨진다 — 주문이 먼저 서버에 닿아서 `상태.사진들` 이
    // 빈 채로 읽히고, 「사진 자리가 N개 있어요」를 또 묻거나 초안에 사람 사진이
    // 한 장도 안 꽂힌다. **오류는 안 난다.**
    if (대기사진.length) {
      const 올릴것 = 대기사진.map((x) => x.파일)
      for (const x of 대기사진) URL.revokeObjectURL(x.보기)
      대기사진 = []
      사진띠그리기()
      await 사진올리기(올릴것)
      // **사진과 같이 친 말은 «바람» 이다**(2026-09-28). 참조 판에서 계획이 따른다.
      // 말 자체는 그대로 흘린다 — 주제일 수도 있다. **글이 없으면 빈 글자로 지운다**
      // — 안 지우면 옛 바람이 다음 참조 판에 몰래 실린다(검토 2026-09-29).
      await 상태저장({ 바람: 바람값(글) })
    }
    // **글이 비어도 사진만 보낼 수 있다**(사람 지적 2026-09-20: 「주제는 내가
    // 왜 적냐?」). 위에서 이미 올렸으니 여기서 그냥 끝낸다.
    if (!String(글 || '').trim()) return
    if (이름묻는중) {
      const 코드 = 이름묻는중
      적기({ 역할: '사람', 말: 글.trim() })
      say.value = ''
      await 이름붙이기(코드, 글.trim())
      return
    }
    await 보내기(글)
  }
  send.addEventListener('click', () => 친말보내기(say.value))
  // 뒤로 = 틀 목록으로. 미리보기·라벨판·작업대 어디서든 목록으로 돌아온다(사람 지적 2026-09-16).
  paneBack.addEventListener('click', () => 오른쪽띄우기({ 종류: '틀목록' }))

  // ── 예시 그림 크게 보기 (사람 결정 2026-09-22) ────────────────────
  //
  // 예시는 장 일곱을 가로로 이어 붙인 것이라 말풍선 안에서는 작다. 눌러서
  // 키우지 못하면 「무슨 네모가 어디 그어졌는지」를 못 본다 — 그럼 예시를 깐
  // 뜻이 없다.
  //
  // **말풍선에 손잡이를 하나씩 안 단다.** 예시는 대화 도중에 생기므로, 그때
  // 다시 달아야 한다. 늘 있는 `msgs` 하나에 달고 눌린 것을 가려낸다.
  const 크게창 = document.createElement('div')
  크게창.className = '예시크게창'
  크게창.hidden = true
  document.body.appendChild(크게창)
  const 크게닫기 = () => { 크게창.hidden = true; 크게창.innerHTML = '' }
  크게창.addEventListener('click', 크게닫기)
  // **Esc 로도 닫는다.** 그림이 화면을 다 덮어서, 닫는 길이 하나뿐이면 갇힌
  // 것처럼 느낀다.
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') 크게닫기() })
  // **말풍선과 오른쪽 칸 둘 다 건다.** 라벨 예시는 말풍선에, 사진 자리 판은
  // 미리보기(오른쪽 칸)에 있다 — 둘 다 작게 보여서 눌러 키워야 읽힌다.
  const 크게보기 = (e) => {
    const 그림 = e.target.closest('.예시그림, .미리-자리판 img')
    if (!그림) return
    크게창.innerHTML = `<img src="${esc(그림.getAttribute('src'))}" alt="${esc(그림.getAttribute('alt') || '')}">`
      + `<button type="button" class="예시닫기">${esc(말하기(언어)('예시닫기'))}</button>`
    크게창.hidden = false
  }
  msgs.addEventListener('click', 크게보기)
  pane.addEventListener('click', 크게보기)

  // ── 건의 (교수님 요청 2026-09-21) ────────────────────────────────
  //
  // **어디서 눌렀는지를 같이 보낸다.** 글만 쌓이면 「이상해요」가 무엇을 두고
  // 한 말인지 영영 모른다. 이름은 안 받는다(사람 결정: 익명).
  const 건의창 = $('건의창')
  if (건의창) {
    const 건의글칸 = $('건의글')
    const 건의말칸 = $('건의말')
    $('paneSuggest').addEventListener('click', () => {
      건의글칸.value = ''
      건의말칸.textContent = ''
      건의창.showModal()
      건의글칸.focus()
    })
    $('건의닫기').addEventListener('click', () => 건의창.close())
    $('건의보내기').addEventListener('click', async () => {
      const 말 = 말하기(언어)
      const 글 = 건의글칸.value.trim()
      if (!글) { 건의말칸.textContent = 말('건의비었음'); return }
      const 단추 = $('건의보내기')
      단추.disabled = true
      건의말칸.textContent = 말('건의보내는중')
      try {
        const res = await fetch('/api/suggest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            글,
            화면: 상태.오른쪽?.종류 || '틀목록',
            카드뉴스: 상태.오른쪽?.주소 || '',
          }),
        })
        const j = await res.json().catch(() => ({}))
        if (!res.ok || j.ok === false) throw new Error(j.why || `HTTP ${res.status}`)
        건의말칸.textContent = 말('건의고마움')
        // 고맙다는 말을 읽을 틈을 준다. 바로 닫으면 보냈는지 모른다.
        setTimeout(() => 건의창.close(), 900)
      } catch (e) {
        건의말칸.textContent = 말('건의못보냄', e.message)
      }
      단추.disabled = false
    })
  }
  say.addEventListener('keydown', (e) => { if (엔터로보내나(e)) { e.preventDefault(); 친말보내기(say.value) } })
  // **틀 카드를 누르면 구경만 한다**(사람 결정 2026-09-28). 여태는 누르면 곧
  // 골라져서 왼쪽에서 봇이 말을 걸었다 — 「템플릿 좀 보게 해주세요」(사용자 제보).
  // 오른쪽에 구성만 띄우고, 고르는 것은 위 띠의 「이 템플릿으로 만들기」다.
  // 뼈대 카드(받아오는 동안 깔아 둔 회색 네모)에는 코드가 없다 — 그건 안 연다.
  const 구경하기 = (b) => { if (b.dataset.code) 오른쪽띄우기({ 종류: '틀', 코드: b.dataset.code }) }
  // **고를 때는 이름으로 말하고 코드를 같이 싣는다.** 말풍선에는 이름이 찍혀야
  // 한다(사람 지시 2026-09-19: 「템플릿 DHqCBQnRAjW 라고 부르는데 싫어」). 서버는
  // 실려 온 코드로 모델 없이 고른다 — 이름이 게시물 제목이라 모델이 주제로 읽었다.
  if (paneUse) {
    paneUse.addEventListener('click', () => {
      const 코드 = paneUse.dataset.code
      if (!코드) return
      이름묻는중 = null
      보내기(`템플릿 "${paneUse.dataset.name || 코드}"`, { 틀코드: 코드 })
    })
  }
  msgs.addEventListener('click', async (e) => {
    const b = e.target.closest('.tpl-pick')
    if (b) { 구경하기(b); return }
    // **화풍 카드** — 고른 이름을 사람이 친 것처럼 보내고 번호를 같이 싣는다(2026-09-29).
    // 고른 것에 표를 단다(손잡이엔 상태 표시까지).
    const h = e.target.closest('.hwa-pick')
    if (h) {
      const 줄 = h.closest('.hwa-strip')
      if (줄) for (const x of 줄.querySelectorAll('.hwa-pick.고름')) x.classList.remove('고름')
      h.classList.add('고름')
      보내기(h.dataset['이름'] || '', { 화풍: h.dataset['화풍'] || '' })
      return
    }
    // **선택창 단추** — 고른 글을 사람이 친 것처럼 보낸다(틀 카드와 같은 길).
    const p = e.target.closest('.pick')
    if (!p) return
    // 「직접 입력」은 보내지 않는다. 입력칸으로 초점만 옮겨 사람이 적게 한다.
    if (p.classList.contains('pick-own')) { say.focus(); return }
    // 「로고 올리기」도 말을 안 보낸다 — 파일 고르기를 연다. 올라가고 나서야
    // 말이 나간다(`로고고름`).
    if (p.classList.contains('pick-올림')) {
      const 겹0 = p.closest('.picks')
      if (겹0 && 겹0.nextElementSibling) 겹0.nextElementSibling.remove()
      if (겹0) 겹0.remove()
      로고고르기()
      return
    }
    // 「다시」 — 앞서 낸 것들을 빼고 다시 뽑아 달라고 말한다.
    if (p.classList.contains('pick-again')) {
      const 겹1 = p.closest('.picks')
      if (겹1) 겹1.remove()
      // **「다시」라고 서버에 알린다.** 안 알리면 서버가 앞서 낸 셋을 그대로
      // 다시 보여 줘서 이 단추가 하는 일이 없어진다(`server/chat.js` 의 `다시`).
      보내기(말하기(언어)('다시말', p.dataset['앞것'] || ''), { 다시: true })
      return
    }
    // **사진쓰임은 말을 안 보낸다**(2026-09-28). 상태에만 적는다 — 딥시크가 「그대로
    // 넣기」를 주제로 읽을 까닭이 없다. 고른 것에 표를 단다.
    if (p.dataset['무엇'] === '사진쓰임') {
      const 겹2 = p.closest('.picks')
      const 차례 = 겹2 ? [...겹2.querySelectorAll('.pick')].indexOf(p) : 0
      if (겹2) {
        for (const x of 겹2.querySelectorAll('.pick.고름')) x.classList.remove('고름')
        p.classList.add('고름')
      }
      // 도는 턴이 있으면 끝난 뒤에 적는다 — 턴 끝 저장이 덮지 않게.
      await 사진쓰임적기({ 차례, 도는턴,
        적기: (값) => 봇적기(말하기(언어)(값 === '참조' ? '참조로갑니다' : '그대로갑니다'),
                          { 사진쓰임: 값 }) })
      return
    }
    // **고르고 나서도 그대로 둔다**(사람 지시 2026-09-19: 「선택하면 없어지더라고
    // 그러지말고 계속 유지했으면 좋겠어」). 여태는 누른 선택창을 지웠다 — 세
    // 갈래를 받아 하나를 고르면 나머지 둘이 사라져서, 무엇 중에 골랐는지도
    // 마음을 바꿀 길도 없어졌다.
    //
    // **대신 고른 것에 표를 단다.** 남겨 두기만 하면 무엇을 눌렀는지 안 보인다
    // (손잡이를 만들면 상태 표시까지). 같은 묶음의 옛 표는 지우고 새로 단다 —
    // 마음을 바꿔 다른 것을 누르면 표도 따라가야 한다.
    const 겹 = p.closest('.picks')
    if (겹) {
      for (const x of 겹.querySelectorAll('.pick.고름')) x.classList.remove('고름')
      p.classList.add('고름')
    }
    보내기(p.dataset['값'] || p.textContent || '')
  })
  pane.addEventListener('click', (e) => {
    const b = e.target.closest('.tpl-pick')
    if (b) 구경하기(b)
  })
  // 띠에서 눌러도 같은 창구·같은 길이다 — 길을 둘로 만들면 한쪽만 고치게 된다.
  paneStrip.addEventListener('click', (e) => {
    const b = e.target.closest('.tpl-pick')
    if (b) 구경하기(b)
  })
  // 라벨판(iframe)이 저장하면 알려 온다.
  // 라벨판은 상자 하나 옮길 때마다 알려 오므로 코드당 한 번만 말한다.
  const 저장알림함 = new Set()
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || e.data?.라벨판 !== '저장') return
    const id = e.data.id || ''
    if (!저장알림함.has(id)) {
      저장알림함.add(id)
      봇적기(말하기(언어)('라벨저장됨'))
    }
    if (id) 분석지켜보기(id)
  })

  // 가운데 경계를 끌어 폭을 바꾼다.
  const split = $('split'), chat = $('chat')
  let 끄는중 = false
  split.addEventListener('pointerdown', (e) => { 끄는중 = true; split.setPointerCapture(e.pointerId) })
  split.addEventListener('pointerup', () => { 끄는중 = false })
  split.addEventListener('pointermove', (e) => {
    if (!끄는중) return
    const w = Math.min(Math.max(e.clientX, 280), window.innerWidth - 320)
    chat.style.width = `${w}px`
  })

  // **첫 화면 — 인사 한 마디와 틀 목록.** 딥시크를 안 부른다.
  //
  // 「새 대화」도 여기로 온다. 지우는 곳과 그리는 곳을 갈라 두면 한쪽만 고치게
  // 되고, 실제로 그래서 「새 대화」가 흰 화면을 남겼다(2026-09-19).
  const 첫화면그리기 = async () => {
    적기({ 역할: '봇', 말: 말하기(언어)('뭐로만들까') })
    await 오른쪽띄우기({ 종류: '틀목록' })
  }

  // 처음: 이어지는 대화가 있으면 그대로, 없으면 첫 화면.
  ;(async () => {
    if (대화) {
      const got = await fetch(`/api/conversation/${encodeURIComponent(대화)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      if (got) {
        상태 = { 틀: null, 지켜보기: null, 오른쪽: null, 일: null, 구울것: null, 사진들: [], ...got.state }
        for (const 줄 of got.messages) 적기(줄)
        // 화풍을 묻는 중이었으면 카드를 다시 깐다(2026-09-29) — 물음 글만 남으면 막힌다.
        const 되살릴카드 = 복원카드html(상태, 언어)
        if (되살릴카드) msgs.insertAdjacentHTML('beforeend', 되살릴카드)
        사진띠그리기()
        await 오른쪽띄우기(상태.오른쪽 || { 종류: '틀목록' })
        if (상태.지켜보기?.코드) 분석지켜보기(상태.지켜보기.코드)
        // 아직 도는 일이 있으면 이어서 기다린다 — 안 그러면 작업대 주소를 잃는다.
        if (상태.일?.번호) 일기다리기(상태.일)
        return
      }
      대화 = ''
      기억.set('')
      history.replaceState(null, '', location.pathname)
    }
    await 첫화면그리기()
  })()
}
