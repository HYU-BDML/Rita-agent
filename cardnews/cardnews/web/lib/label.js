// 라벨링 화면. 사람이 네모를 긋고 종류를 고른다.
//
// 이 파일은 브라우저로 그대로 내려간다. 서버 코드를 절대 두지 마라.
// 판단하는 부분(좌표 계산)은 순수 함수로 빼서 브라우저 없이 시험한다.
//
// SAM 은 안 부른다. 임베딩이 CPU 에서 155초 걸리는데, 그걸 그리는 사람이
// 기다릴 이유가 없다 — 누끼는 확정 뒤 파이썬이 일괄로 딴다.
//
// **「AI에게 물어보기」도 뺐다**(사람 지시 2026-09-22). 서버 문과 여기 도구는
// 있었는데 **누르는 단추가 화면에 없었다** — 아무도 안 부르는 길이었다.

import { HANDLES, handleAt, resize, move, pick } from './boxedit.js'
// 화면 글자는 `라벨말.js` 한 벌뿐이다. 창고에 적히는 값(KINDS·LEVELS…)은
// 한국어 그대로 두고, **보여 줄 때만** `낱말` 로 갈아 끼운다.
import { 말하기, 도형말, 도형설명, 손잡이말 } from './라벨말.js'
import { 낱말 } from './수집기말.js'
import { 저장된언어, 쓸언어 } from './언어.js'
// 분석은 구글 비전·fal 을 돌린다 — 돈이 나가므로 출입증을 붙인다.
import { 붙여보내기 } from './출입증.js'

// server/labels.js 의 KINDS 와 같은 순서여야 한다. 키보드 1~7 이 이 순서다.
// 「버튼」은 뺐다(2026-08-20 사람 결정) — 장식 안에 들어가는 것이라 따로 둘 이유가 없다.
// **사람이 «고를 수 있는» 종류.** 서버가 «받아 주는» 종류는 이보다 넓다
// (`server/labels.js` 의 KINDS) — 옛 라벨에 남아 있는 «인물» 을 계속 받아야
// 하기 때문이다. 인물은 사진에 합쳤다: 실측(라벨 64개 중 1개)이고, 파이썬 쪽은
// 이미 («사진», «인물») 을 늘 한 묶음으로 다뤄 왔다.
// **「장번호」(2026-09-19)** — 장 번호가 든 배지(반원·원·리본) 둘레에 하나만 긋는다.
// 분석이 그 배지를 떼어 숫자를 지우고, 표지 뺀 모든 장 같은 자리에 1·2·3 을 새로
// 찍는다(`analyze/번호판.py`). 장마다 그을 필요가 없다.
// **「빼기」(2026-09-19)** — 라벨은 하되 그리지도 재지도 않는 칸. 원본에만 있던
// 타임라인·구분선·워터마크 둘레에 긋는다. 분석이 그 자리를 바닥판에서 파내고
// 만든 카드에는 아무것도 안 낸다. «만든 카드에도 나와야 하면 장식, 원본에만
// 있던 거면 빼기».
export const KINDS = ['글자', '사진', '도형', '장식', '로고', '장번호', '빼기']
// 옛 라벨을 읽을 때 갈아 끼우는 표. 다음 저장에서 스스로 낫는다.
export const 옛종류 = { 인물: '사진' }

// 층은 «장식끼리만» 센다. **글자는 언제나 사진·도형 앞이다.**
// 같은 규칙이 세 군데에 있다 — 여기, `web/lib/workbench.js` 의 `장식순서`,
// 그리고 굽는 쪽 `cardnews/render/cardnews_compose._장식순서`.
// **하나만 고치면 화면과 구운 그림이 갈린다.**
export const 장식갈래 = ['사진', '도형', '장식', '로고', '장번호', '빼기']

// 한 장의 장식 칸을 그릴 순서로 세운다 — 칸 목록에서의 «번호» 배열이다.
// `층` 이 모든 장식에 다 있을 때만 그것을 따른다. 하나라도 없으면 목록 차례다.
export function 장식순서(칸들) {
  const 줄 = []
  ;(칸들 || []).forEach((b, i) => { if (장식갈래.includes(b.kind)) 줄.push(i) })
  if (줄.length && 줄.every((i) => typeof 칸들[i].층 === 'number')) {
    줄.sort((a, b) => 칸들[a].층 - 칸들[b].층)
  }
  return 줄
}

// 고른 장식을 한 칸 민다. `방향` 은 +1 이 앞(위), -1 이 뒤(밑).
// 새 층 번호를 0..n-1 로 다시 매겨 돌려준다. 못 밀면 null.
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

// 아래 세 목록도 server/labels.js 와 같아야 한다 — 브라우저는 server/ 를 못 불러오므로
// (build.mjs 의 SKIP_DIRS) 그대로 베껴 둔다. web/test/label-ui.test.js 가 두 쪽을
// 대조해서 어긋나면 시험이 터진다.
export const FONTS = [
  '프리텐다드', '원티드산스', '지마켓산스', '에스코어드림',
  '여기어때잘난체', '검은고딕', '배민도현', '나눔스퀘어라운드', '나눔명조',
]
export const EFFECTS = ['외곽선', '그림자', '밑줄']

// 글자 위계. **기계도 재지만 사람이 못 박을 수 있다** — 규칙(「그 장 Bold 중
// 최대 pt 의 90% 이상이면 제목」)은 실물 일곱 장에서 한 장도 안 틀렸지만, 한
// 장에 제목이 둘이거나 꼬리표가 제목만 한 게시물이 오면 갈릴 수밖에 없다.
// 빈 값이 「자동」이다.
//
// **「번호」는 여기서 뺐다**(사람 지시 2026-09-19). 장 번호는 이제 「장번호」
// 종류로 배지 둘레에 네모 하나만 그으면 되고(`번호판.만들기`), 이 위계로
// 고르던 옛 길(2026-08-30)은 쓸 일이 없어졌다. **서버는 계속 받는다** —
// 옛 라벨이 오면 읽어야 한다(`server/labels.js` 의 LEVELS).
export const LEVELS = ['제목', '본문', '꼬리표']

/**
 * 종류마다 보여 줄 칸. **다 보여 주면 아무것도 안 보여 주는 것과 같다** —
 * 로고에 「글자 위계」가 뜨면 그게 무슨 뜻인지 생각하다 진짜 필요한 칸을 지나친다.
 *
 * | 칸 | 누구에게 | 왜 |
 * |---|---|---|
 * | `위계` | 글자 | 제목·본문·꼬리표는 글자만의 성질이다 |
 * | `모양` | 글자 말고 전부 | 사진도 로고도 원형으로 자른다. 글자도 도형 안에 넣어 함께 잰다 |
 * | `층` | 글자 말고 전부 | **글자는 언제나 맨 앞이라** 층이 없다 |
 * | `각도` | 전부 | 대각선 글자도, 비스듬한 장식도 있다 |
 * | `설명` | 사진·인물·장식 | AI 가 그림을 만들 자리에만. 글자·도형엔 쓸 데가 없다 |
 */
export function 보일칸(kind) {
  const 글자 = kind === '글자'
  return {
    위계: 글자,
    모양: !글자,
    층: !글자,
    각도: true,
    // **AI 가 그릴 자리에만.** 사람이 여기 적은 말이 그림 지시문이 된다
    // (`analyze/사진만들기.지시문짓기`). 로고는 사람이 올리는 것이라 뺀다.
    설명: ['사진', '인물', '장식'].includes(kind),
    // **누끼로 받을지**(사람 지적 2026-09-19: 「누끼뺄건지말건지 맞아?」).
    // 자동은 「배경자리 말고는 다 누끼」인데, 장의 절반 넘게 차지하는 큰 사진
    // 자리가 투명해지면 허전하다(실측: 창고 132자리 중 10곳). 장식은 제 누끼
    // 길이 따로 있어 안 뺀다.
    누끼: ['사진', '인물'].includes(kind),
  }
}
export const TREATS = ['그대로', '어둡게깔기', '밝게깔기', '흐림', '누끼', '테두리']

// server/labels.js 의 MAX_NOTE 와 같아야 한다. 이걸 안 지키면 이 칸 하나 때문에
// 그 장의 저장이 전부(다른 네모까지) '설명이 너무 깁니다' 로 거절된다 — C2 와 같은 모양의 함정.
// KINDS·FONTS·EFFECTS·TREATS 와 같이 내보내 label-ui.test.js 의 대조 시험에 물린다.
export const MAX_NOTE = 500

// server/labels.js 의 MAX_ANGLE 과 같아야 한다(MAX_NOTE 와 같은 이유·같은 시험).
export const MAX_ANGLE = 180

// ───────────────────────────────────────── 설명서
//
// **손놀림이 열 몇 가지가 됐다.** 단축키로만 있는 기능은 없는 기능이고, 있는 줄
// 알아도 뭐였는지 잊는다. 화면에 적어 둔다.
//
// **여기 적힌 것과 실제 키가 갈리면 안 된다.** 종류 키는 `KINDS` 에서 바로
// 뽑는다 — 종류를 더하거나 빼면 설명서가 저절로 따라온다. 나머지는 `keyHandler`
// 와 `pointerdown` 을 보고 손으로 적었고, 시험이 두 쪽을 대조한다.
export function 설명서(언어) {
  const 영 = 쓸언어(언어) === '영어'
  const 고 = (ko, en) => (영 ? en : ko)
  const 종류키 = KINDS.map((k, i) => i + 1).join('·')
  const 종류들 = KINDS.map((k) => 낱말('종류', k, 언어)).join('·')
  return [
    { 묶음: 고('네모 그리기', 'Drawing boxes'), 줄: [
      [고('빈 자리를 끈다', 'Drag empty space'), 고('새 네모', 'A new box')],
      [고('Alt + 끌기', 'Alt + drag'),
        고('큰 네모 «안» 에서도 새로 긋는다', 'Start a new box even inside a big one')],
      [고(`${종류키} 키`, `Keys ${종류키}`),
        고(`종류 고르기 (${종류들}) — 고른 것이 없으면 «앞으로 그을» 종류가 된다`,
          `Pick a kind (${종류들}) — with nothing selected this sets what you draw next`)],
      [고('네모 안을 끈다', 'Drag inside a box'),
        고('옮기기 — 옆 네모와 줄이 맞으면 빨간 점선이 뜨며 딱 붙는다',
          'Move it — a red dashed line appears and it snaps when it lines up with a neighbour')],
      [고('Ctrl + 끌기', 'Ctrl + drag'),
        고('안 붙이고 그대로 둔다 — 옮길 때도 크기 바꿀 때도 (Alt 는 「새로 긋기」라 못 쓴다)',
          'No snapping — while moving or resizing (Alt is taken by «draw new»)')],
      [고('모서리·변 손잡이', 'Corner and edge handles'),
        고('크기 바꾸기 — 이때도 옆 네모에 맞으면 딱 붙는다',
          'Resize — this snaps to neighbours too')],
      [고('위쪽 자루', 'The stem on top'), 고('기울이기', 'Tilt it')],
      [낱말('종류', '장번호', 언어),
        고('원본 장 번호 배지(「01」) 둘레에 한 장만 그으면 된다 — 숫자를 지운 도장을 떠서 모든 장에 다시 찍는다',
          'Draw it once around the original page badge («01») — we lift a stamp with the number erased and re-stamp every slide')],
    ] },
    { 묶음: 고('모양 만들기', 'Making shapes'), 줄: [
      [고('도형 단추', 'Shape buttons'),
        고('원·별·말풍선… 스무 가지 중에서 고른다', 'Pick from twenty — circle, star, speech bubble…')],
      [고('도형 위 동그란 손잡이', 'The round handle on a shape'),
        고('그 도형 안에서 모양을 바꾼다 (손잡이가 있는 도형만)',
          'Reshape within that shape (only shapes that have a handle)')],
      [말하기(언어)('단추_모양없애기'), 고('다시 그냥 네모로', 'Back to a plain box')],
    ] },
    { 묶음: 고('글자', 'Text'), 줄: [
      [말하기(언어)('칸_글자위계'),
        고('제목·본문·꼬리표 — 기계가 잘못 봤을 때만 고른다 (기본은 자동)',
          'Heading, body, tag — only set this when the machine got it wrong (auto by default)')],
    ] },
    { 묶음: 고('여러 개 다루기', 'Working with several'), 줄: [
      [고('Shift + 끌기', 'Shift + drag'), 고('그물로 여러 개 고르기', 'Lasso several at once')],
      [고('Shift + 클릭', 'Shift + click'), 고('하나씩 더하고 빼기', 'Add or remove one at a time')],
      ['Ctrl + C', 고('고른 것 복사', 'Copy what you picked')],
      ['Ctrl + V', 고('다른 장에 «같은 자리» 로 붙이기', 'Paste onto another slide in the same spot')],
      ['Del', 고('고른 것 다 지우기', 'Delete everything picked')],
      ['Ctrl + Z',
        고('이 장에 «마지막으로 더한» 네모 하나를 뺀다 (붙여넣은 것도 하나씩)',
          'Remove the box you added last on this slide (pasted ones go one by one too)')],
    ] },
    { 묶음: 고('장과 마무리', 'Slides and finishing'), 줄: [
      [고('화살표', 'Arrow keys'),
        고('고른 네모를 1px 씩 옮긴다 — 붙이기는 안 걸린다',
          'Nudge the picked box by 1px — snapping does not kick in')],
      [고('Shift + 화살표', 'Shift + arrows'), 고('10px 씩 옮긴다', 'Nudge by 10px')],
      ['← →', 고('장 넘기기 (고른 것이 없을 때. 빈 자리를 눌러 풀면 된다)',
        'Next or previous slide (when nothing is picked — click empty space to unpick)')],
      [`${말하기(언어)('단추_뒤로')} · ${말하기(언어)('단추_앞으로')}`,
        고('겹친 장식의 앞뒤 (글자는 늘 맨 앞)',
          'Front-to-back order of stacked decorations (text is always in front)')],
      [말하기(언어)('단추_확정'),
        고('이 라벨로 분석해도 좋다는 표시', 'Marks that these labels are ready to analyze')],
      [말하기(언어)('칸_이장배경사진'),
        고('기계가 배경을 잘못 봤을 때만 켠다 (보통은 알아서 안다)',
          'Only turn this on when the machine read the background wrong (it usually knows)')],
      [말하기(언어)('단추_분석하기'),
        고('지금 재라 — 1~2분 뒤 템플릿이 나온다', 'Measure it now — a template comes out in 1–2 min')],
    ] },
  ]
}

// **사람에게 더 묻지 않는다.** 글씨체·효과(외곽선·그림자·밑줄)·사진 처리는
// 전부 기계가 잰다(`fontmatch`·`effects`·`tint`). 실측으로 사람은 그 칸들을 거의
// 안 썼고(라벨 64개 중 글씨체 1·효과 0·사진처리 0), 그 하나도 기계가 낸 답과
// 같은 «프리텐다드» 였다 — 빼도 계량표가 한 글자도 안 달라진다.
//
// 두 값이 다 있으면 사람 것이 이기게 되어 있었는데(`layout_labeled.choose_font`),
// 사람이 안 쓰는 규칙은 규칙이 아니라 함정이다. 기계가 글꼴을 못 맞히는 것은
// 실제 약점이지만(실물 17덩이 중 3만 자신 있게 가린다), 고칠 자리는 «글자가
// 실제로 그려진 것을 보면서» 고르는 작업대이지 이 화면이 아니다.
export function propsOf() {
  return []
}


const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

export function normBox(a, w, h) {
  const x0 = clamp(Math.round(Math.min(a[0], a[2])), 0, w)
  const y0 = clamp(Math.round(Math.min(a[1], a[3])), 0, h)
  const x1 = clamp(Math.round(Math.max(a[0], a[2])), 0, w)
  const y1 = clamp(Math.round(Math.max(a[1], a[3])), 0, h)
  return [x0, y0, x1, y1]
}

// 그림은 화면에 맞춰 줄여 보여주므로, 클릭 좌표를 원래 크기로 되돌려야 한다.
export function imgPoint(evt, rect, w, h) {
  return [
    Math.round(((evt.clientX - rect.left) / rect.width) * w),
    Math.round(((evt.clientY - rect.top) / rect.height) * h),
  ]
}

// 끌지 않고 톡 누른 것을 네모로 치면 쓰레기가 쌓인다.
export const tooSmall = (box, min = 12) => box[2] - box[0] < min || box[3] - box[1] < min

// ───────────────────────────────────────── 테두리 재는 도구
//
// **「직접 그리기」는 뺐다**(사람 지시 2026-09-19). 손으로 그린 자취를 도형으로
// 펴 주던 부분(`다듬기`·`솎기`·`공선빼기`)은 그때 같이 지웠다 — 되살리려면
// 그 커밋을 보면 된다. 여기 남은 것은 도형 단추 쪽이 아직 쓰는 계산뿐이다.

export const 타원점수 = 48           // 타원을 몇 각형으로 낼까 — 1080폭에서 눈에 안 보인다

export const 테두리네모 = (점들) => [
  Math.min(...점들.map((p) => p[0])), Math.min(...점들.map((p) => p[1])),
  Math.max(...점들.map((p) => p[0])), Math.max(...점들.map((p) => p[1])),
]

const 중앙값 = (값들) => {
  const v = [...값들].sort((a, b) => a - b)
  const m = v.length >> 1
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

/**
 * 점들에 제일 잘 맞는 축정렬 타원 — `{ cx, cy, rx, ry, 잔차 }`.
 *
 * **딱 맞는 네모를 그대로 쓰면 안 된다.** 네모는 «제일 튀어나온 점» 둘로
 * 정해지는데, 손으로 그린 선은 바로 그 튀어나온 점들이 떨림이다. 실측:
 * 반지름 200 에 ±9 로 떤 원이 네모로는 반지름 209 가 되고, 그러면 점 대부분이
 * 타원 «안» 으로 들어가 잔차가 0.045 를 넘어 원인데도 원이 아니라고 나온다.
 *
 * 그래서 중심은 무게중심, 크기는 «점들의 중앙값» 으로 한 번 더 조인다 —
 * 중앙값은 떨림의 꼭짓점 몇 개에 안 끌려간다.
 */
export function 타원맞춤(점들) {
  const 빈값 = { cx: 0, cy: 0, rx: 0, ry: 0, 잔차: Infinity }
  if (!점들 || 점들.length < 3) return 빈값
  const [x0, y0, x1, y1] = 테두리네모(점들)
  let rx = (x1 - x0) / 2; let ry = (y1 - y0) / 2
  if (!(rx > 0) || !(ry > 0)) return 빈값
  const cx = 점들.reduce((a, p) => a + p[0], 0) / 점들.length
  const cy = 점들.reduce((a, p) => a + p[1], 0) / 점들.length
  const 배 = (a, b) => 점들.map(([x, y]) => Math.hypot((x - a) / rx, (y - b) / ry))
  const k = 중앙값(배(cx, cy)) || 1
  rx *= k; ry *= k
  const 합 = 배(cx, cy).reduce((a, t) => a + Math.abs(t - 1), 0)
  return { cx, cy, rx, ry, 잔차: 합 / 점들.length }
}

export const 타원잔차 = (점들) => 타원맞춤(점들).잔차

// ───────────────────────────────────────── 네모 안에서 도형 고르기
//
// **목록은 밑그림이고, 진짜 모양은 사람이 손잡이로 맞춘다.**
//
// 점을 자유롭게 옮기면 원이 «찌그러진 다각형» 이 된다. 그건 대개 사람이 바라는
// 게 아니다 — 원을 만지면 타원이 되기를 바라지 우그러지기를 바라지 않는다.
// 그래서 손잡이는 꼭짓점이 아니라 **그 도형 식구 안의 값** 을 바꾼다.
//
// 이러면 목록이 짧아진다. 「알약」은 둥근네모의 둥글기를 끝까지 민 것이라 항목이
// 필요 없고, 「타원」은 애초에 없었다(도형이 네모에 내접하니 가로로 긴 네모를
// 그리면 원이 곧 타원이다).
//
// 방향은 여기서 안 정한다 — 기울기 손잡이가 이미 있으니 고르고 돌리면 된다.

const 둥근 = (v) => Math.round(v * 10) / 10
const 조이기 = (v, a, b) => Math.min(b, Math.max(a, v))

// 단위 좌표를 네모 안으로 옮긴다. **먼저 제 딱 맞는 네모로 정규화한다** —
// 정다각형은 단위 «원» 에 내접하느라 네모를 안 채운다(정삼각형의 가로 반지름은
// 0.866, 세로는 1). 사람은 도형 둘레에 바짝 네모를 긋는데 그 안에서 도형이
// 헐렁하면 자리가 어긋난다. 정규화하면 사방에 닿는다 — 대신 네모가 정사각형이
// 아니면 «정»삼각형은 아니게 된다. 그게 맞다: 여기서 고르는 것은 「정n각형」이
// 아니라 「n각형 실루엣」이고, 네모가 크기와 비율을 정한다.
const 펴기 = (점들, box) => {
  const [x0, y0, x1, y1] = box
  const us = 점들.map((p) => p[0]); const vs = 점들.map((p) => p[1])
  const u0 = Math.min(...us); const u1 = Math.max(...us)
  const v0 = Math.min(...vs); const v1 = Math.max(...vs)
  const su = u1 - u0 || 1; const sv = v1 - v0 || 1
  return 점들.map(([u, v]) => [
    둥근(x0 + ((u - u0) / su) * (x1 - x0)),
    둥근(y0 + ((v - v0) / sv) * (y1 - y0)),
  ])
}

const 원점 = (n, 시작 = 0, 반지름 = () => 1) => Array.from({ length: n }, (_, i) => {
  const t = 시작 + (i / n) * Math.PI * 2
  const r = 반지름(i)
  return [r * Math.cos(t), r * Math.sin(t)]
})

const 정다각형 = (n) => 원점(n, -Math.PI / 2)
const 별 = (n, 안) => 원점(n * 2, -Math.PI / 2, (i) => (i % 2 ? 조이기(안, 0.05, 0.95) : 1))

// 둥근 모서리 네모. `둥글기` 1 이면 짧은 쪽 절반이 반지름 — 그게 알약이다.
const 마디 = 8
const 호 = (cx, cy, r, 시작) => Array.from({ length: 마디 + 1 }, (_, i) => {
  const t = 시작 + (i / 마디) * (Math.PI / 2)
  return [둥근(cx + r * Math.cos(t)), 둥근(cy + r * Math.sin(t))]
})
const 둥근네모 = (box, 둥글기) => {
  const [x0, y0, x1, y1] = box
  const r = (Math.min(x1 - x0, y1 - y0) / 2) * 조이기(둥글기, 0, 1)
  if (r <= 0.5) return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
  return [...호(x1 - r, y0 + r, r, -Math.PI / 2), ...호(x1 - r, y1 - r, r, 0),
    ...호(x0 + r, y1 - r, r, Math.PI / 2), ...호(x0 + r, y0 + r, r, Math.PI)]
}

const 하트 = () => Array.from({ length: 60 }, (_, i) => {
  const t = (i / 60) * Math.PI * 2
  return [(16 * Math.sin(t) ** 3) / 17,
    -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17]
})

// 아래는 원, 위는 한 점. **접선을 실제로 풀어서 잇는다** — 눈대중으로 자르면 꺾인다.
const 물방울 = (통통, n = 34) => {
  const r = 조이기(통통, 0.3, 0.92)
  const cy = 1 - r
  const th = Math.acos(조이기(r / (cy + 1), -1, 1))
  const 시작 = -Math.PI / 2 + th
  return [[0, -1], ...Array.from({ length: n + 1 }, (_, i) => {
    const t = 시작 + (i / n) * (Math.PI * 2 - 2 * th)
    return [r * Math.cos(t), cy + r * Math.sin(t)]
  })]
}

const 십자 = (두께) => {
  const a = 조이기(두께, 0.08, 0.92)
  return [[-a, -1], [a, -1], [a, -a], [1, -a], [1, a], [a, a],
    [a, 1], [-a, 1], [-a, a], [-1, a], [-1, -a], [-a, -a]]
}

const 화살표 = (머리, 두께) => {
  const m = 조이기(머리, 0.05, 0.95)          // 머리가 차지하는 가로 몫
  const t = 조이기(두께, 0.05, 0.95)          // 몸통 두께(반)
  const x = 1 - 2 * m
  return [[-1, -t], [x, -t], [x, -1], [1, 0], [x, 1], [x, t], [-1, t]]
}

// 윗변 0 이면 삼각형, 1 이면 네모. 그 사이가 사다리꼴이다.
const 사다리꼴 = (윗변) => {
  const w = 조이기(윗변, 0.001, 1)
  return [[-w, -1], [w, -1], [1, 1], [-1, 1]]
}
const 평행사변형 = (기울기) => {
  const k = 조이기(기울기, 0, 0.9)
  return [[-1 + k, -1], [1, -1], [1 - k, 1], [-1, 1]]
}

// 위가 둥글고 아래가 평평하다. `밑변` 은 **밑변이 네모 폭의 몇 몫인가** —
// 1 이면 딱 반원, 줄일수록 밑을 살짝 자른 원에 가까워진다.
//
// **값을 「눈에 보이는 길이」로 잡았다.** 처음엔 각도(볼록함)로 잡았는데,
// 손잡이가 값 앞쪽에서는 0.1px 씩 기다가 뒤에서 훅 움직였다 — 값과 화면이
// 비선형으로 묶여 있으면 끄는 사람이 「고장 났나」 싶다. 밑변 길이로 잡으면
// 손잡이 x 가 값에 정비례한다.
//
// 밑변 = cos(a) 이고 자르는 높이 c = sin(a) 다(a 는 끝점의 각). 그래서
// c = sqrt(1 - 밑변²) — 따로 각을 안 거치고 바로 나온다.
const 반원 = (밑변, n = 30) => {
  const b = 조이기(밑변, 0.15, 1)
  const c = Math.sqrt(Math.max(0, 1 - b * b))
  const a = Math.asin(조이기(c, -1, 1))
  const t0 = Math.PI - a; const t1 = Math.PI * 2 + a
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = t0 + (i / n) * (t1 - t0)
    return [Math.cos(t), Math.sin(t)]
  })
}

// 꼬리는 밑변 «중간» 에 끼워 넣는다 — 끝에 덧붙이면 선이 몸통을 가로지른다.
const 말풍선 = (box, 둥글기, 꼬리) => {
  const [x0, y0, x1, y1] = box
  const w = x1 - x0; const h = y1 - y0
  const 밑 = y1 - h * 0.24
  const r = (Math.min(w, 밑 - y0) / 2) * 조이기(둥글기, 0, 1)
  const 꼭 = x0 + w * 조이기(꼬리, 0.03, 0.9)
  const 꼬오 = Math.min(x1 - r - 1, 꼭 + w * 0.16)
  const 꼬왼 = Math.max(x0 + r + 1, 꼭 + w * 0.02)
  const 끝 = 꼬왼 < 꼬오
    ? [[둥근(꼬오), 둥근(밑)], [둥근(꼭), y1], [둥근(꼬왼), 둥근(밑)]] : []
  return [...호(x1 - r, y0 + r, r, -Math.PI / 2), ...호(x1 - r, 밑 - r, r, 0), ...끝,
    ...호(x0 + r, 밑 - r, r, Math.PI / 2), ...호(x0 + r, y0 + r, r, Math.PI)]
}

// 손잡이 자리는 «만든 테두리의 어느 점» 으로 잡는다. 그래야 화면에 보이는 모양과
// 손잡이가 절대 안 갈린다.
const 몇번째 = (i) => (테) => (i < 0 ? 테[테.length + i] : 테[i])

/**
 * **표에 한 줄이 도형 하나다.**
 *
 * - `기본` — 처음 고를 때의 값
 * - `손잡이` — 캔버스에서 끌 수 있는 값. `점` 이 어느 자리에 붙을지 정한다
 * - `단위`/`상자` — 단위 좌표(-1..1)를 내거나(`펴기` 가 맞춘다) 네모를 직접 받는다
 */
export const 도형들 = [
  { 이름: '원', 설명: '네모를 늘리면 타원이 된다', 단위: () => 원점(타원점수) },
  { 이름: '반원',
    // 손잡이는 밑변의 왼쪽 끝이다 — 밑변을 따라 «가로로» 미끄러진다.
    // 첫 점이 늘 그 자리라 자리를 따로 셈하지 않는다.
    설명: '반원 — 손잡이를 밀면 밑을 살짝 자른 원이 된다',
    기본: { 밑변: 1 },
    손잡이: [{ 키: '밑변', 최소: 0.15, 최대: 1, 점: 몇번째(0) }],
    단위: (값) => 반원(값.밑변) },
  { 이름: '네모', 설명: '각진 네모',
    상자: (b) => [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]] },
  { 이름: '둥근네모',
    설명: '손잡이를 끝까지 밀면 알약이 된다',
    기본: { 둥글기: 0.3 },
    손잡이: [{ 키: '둥글기', 최소: 0, 최대: 1, 점: 몇번째(-1) }],
    상자: (b, 값) => 둥근네모(b, 값.둥글기) },
  { 이름: '삼각형', 설명: '위를 향한 삼각형', 단위: () => 정다각형(3) },
  { 이름: '마름모', 설명: '위아래가 뾰족한 사각', 단위: () => 정다각형(4) },
  { 이름: '오각형', 설명: '오각형', 단위: () => 정다각형(5) },
  { 이름: '육각형', 설명: '육각형', 단위: () => 정다각형(6) },
  { 이름: '팔각형', 설명: '팔각형', 단위: () => 정다각형(8) },
  { 이름: '사다리꼴',
    설명: '윗변을 끌면 삼각형에서 네모까지',
    기본: { 윗변: 0.55 },
    손잡이: [{ 키: '윗변', 최소: 0.001, 최대: 1, 점: 몇번째(0) }],
    단위: (값) => 사다리꼴(값.윗변) },
  { 이름: '평행사변형',
    설명: '얼마나 기울일지',
    기본: { 기울기: 0.3 },
    손잡이: [{ 키: '기울기', 최소: 0, 최대: 0.9, 점: 몇번째(0) }],
    단위: (값) => 평행사변형(값.기울기) },
  { 이름: '4각별', 설명: '반짝이 — 손잡이로 뾰족하게', 기본: { 안쪽: 0.32 },
    손잡이: [{ 키: '안쪽', 최소: 0.08, 최대: 0.9, 점: 몇번째(1) }],
    단위: (값) => 별(4, 값.안쪽) },
  { 이름: '5각별', 설명: '별 — 통통하게·뾰족하게', 기본: { 안쪽: 0.382 },
    손잡이: [{ 키: '안쪽', 최소: 0.08, 최대: 0.9, 점: 몇번째(1) }],
    단위: (값) => 별(5, 값.안쪽) },
  { 이름: '6각별', 설명: '여섯 갈래', 기본: { 안쪽: 0.5 },
    손잡이: [{ 키: '안쪽', 최소: 0.08, 최대: 0.9, 점: 몇번째(1) }],
    단위: (값) => 별(6, 값.안쪽) },
  { 이름: '8각별', 설명: '여덟 갈래', 기본: { 안쪽: 0.5 },
    손잡이: [{ 키: '안쪽', 최소: 0.08, 최대: 0.9, 점: 몇번째(1) }],
    단위: (값) => 별(8, 값.안쪽) },
  { 이름: '하트', 설명: '하트', 단위: 하트 },
  { 이름: '물방울', 설명: '손잡이로 뾰족하게·통통하게', 기본: { 통통: 0.62 },
    // 손잡이는 «접점»(첫 호 점)이다. 처음엔 「제일 왼쪽 점」으로 잡았는데,
    // 그건 표본점 중 하나라 값이 조금 바뀔 때마다 이웃 점으로 튀어 손잡이가
    // 제자리걸음을 했다 — 자리는 값에 따라 «매끄럽게» 움직이는 점이어야 한다.
    손잡이: [{ 키: '통통', 최소: 0.3, 최대: 0.92, 점: 몇번째(1) }],
    단위: (값) => 물방울(값.통통) },
  { 이름: '십자', 설명: '팔 두께를 끌 수 있다', 기본: { 두께: 1 / 3 },
    손잡이: [{ 키: '두께', 최소: 0.08, 최대: 0.92, 점: 몇번째(1) }],
    단위: (값) => 십자(값.두께) },
  { 이름: '화살표', 설명: '머리 크기와 몸통 두께', 기본: { 머리: 0.4, 두께: 0.35 },
    손잡이: [{ 키: '머리', 최소: 0.05, 최대: 0.95, 점: 몇번째(2) },
      { 키: '두께', 최소: 0.05, 최대: 0.95, 점: 몇번째(0) }],
    단위: (값) => 화살표(값.머리, 값.두께) },
  { 이름: '말풍선', 설명: '모서리와 꼬리 자리', 기본: { 둥글기: 0.45, 꼬리: 0.2 },
    손잡이: [{ 키: '둥글기', 최소: 0, 최대: 1, 점: 몇번째(-1) },
      { 키: '꼬리', 최소: 0.03, 최대: 0.9, 점: 몇번째(19) }],
    상자: (b, 값) => 말풍선(b, 값.둥글기, 값.꼬리) },
]

export const 도형찾기 = (이름) => 도형들.find((d) => d.이름 === 이름) || null
export const 도형기본값 = (이름) => ({ ...(도형찾기(이름)?.기본 || {}) })

/** 이 모양 단추가 «지금 걸린 모양» 인가 — 단추를 파랗게 칠할지 정한다. */
export function 도형단추눌림(target, 이름) {
  return !!(target && target.도형 && target.도형.이름 === 이름)
}

/** 네모 안에 내접하는 도형의 테두리. 모르는 이름이면 `null`. */
export function 도형테두리(이름, box, 값) {
  const [x0, y0, x1, y1] = box
  if (!(x1 - x0 > 0) || !(y1 - y0 > 0)) return null
  const d = 도형찾기(이름)
  if (!d) return null
  const v = { ...(d.기본 || {}), ...(값 || {}) }
  return d.상자 ? d.상자(box, v) : 펴기(d.단위(v), box)
}

/** 지금 값에서 손잡이들이 놓일 자리. `[{키, x, y}]` — 손잡이가 없으면 빈 배열. */
export function 손잡이들(이름, box, 값) {
  const d = 도형찾기(이름)
  if (!d || !d.손잡이) return []
  const 테 = 도형테두리(이름, box, 값)
  if (!테) return []
  return d.손잡이.map((h) => {
    const p = h.점(테) || [0, 0]
    return { 키: h.키, x: p[0], y: p[1] }
  })
}

/**
 * 손잡이를 `pt` 로 끌었을 때의 새 값.
 *
 * **거꾸로 푸는 식을 도형마다 쓰지 않는다.** 정규화(`펴기`) 때문에 값과 화면
 * 좌표의 관계가 도형마다 다르고, 어떤 것은 아예 닫힌 식이 없다. 대신 값을 훑어
 * 보며 «손잡이가 포인터에 제일 가까워지는 값» 을 고른다 — 도형이 몇이든 이 한
 * 함수로 끝나고, 화면에 보이는 모양과 절대 안 갈린다. 예순 번 남짓 계산하는데
 * 한 번이 점 예순 개짜리라 사람 손놀림에는 티가 안 난다.
 */
export function 손잡이끌기(이름, box, 값, 키, pt) {
  const d = 도형찾기(이름)
  const h = d && d.손잡이 && d.손잡이.find((x) => x.키 === 키)
  if (!h) return 값
  const 거리 = (v) => {
    const 자리 = 손잡이들(이름, box, { ...값, [키]: v }).find((z) => z.키 === 키)
    return 자리 ? (자리.x - pt[0]) ** 2 + (자리.y - pt[1]) ** 2 : Infinity
  }
  let 최선 = 값[키]; let 가장가까움 = Infinity
  const 훑기 = (a, b, n) => {
    for (let i = 0; i <= n; i++) {
      const v = a + ((b - a) * i) / n
      const dd = 거리(v)
      if (dd < 가장가까움) { 가장가까움 = dd; 최선 = v }
    }
  }
  훑기(h.최소, h.최대, 40)
  const 폭 = (h.최대 - h.최소) / 40
  훑기(Math.max(h.최소, 최선 - 폭), Math.min(h.최대, 최선 + 폭), 20)
  return { ...값, [키]: Math.round(최선 * 1000) / 1000 }
}

/**
 * 두 네모가 겹치나. 그물(Shift+드래그)에 무엇이 걸렸는지 가릴 때 쓴다.
 *
 * **닿기만 해도 걸린다.** 통째로 감싸야 걸리게 하면 큰 네모를 고르려고 화면
 * 밖까지 끌어야 한다 — 카드뉴스 라벨은 사진 자리가 장의 절반을 넘는 일이 흔하다.
 */
export const 겹치나 = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]

// ───────────────────────────────────────── 맞춰 붙이기 (스마트 가이드)
//
// **파워포인트의 「스마트 가이드」와 같은 것이다**(사람 지시 2026-09-19). 네모를
// 끌다가 옆 네모와 변이나 가운데가 얼추 맞으면 **딱 붙이고** 그 자리에 점선을
// 띄운다. 눈대중으로 맞추면 1~2px 씩 어긋나는데, 그 어긋남이 그대로 틀에 실려
// 만든 카드에서 보인다.
//
// **변만 본다** — 왼쪽 변·오른쪽 변(위아래도 같다). 가운데끼리 맞추는 것은
// 사람이 빼라고 했다(2026-09-19). 파워포인트의 «같은 간격» 안내선도 안 넣었다.

/**
 * 이 거리(**화면 픽셀**) 안이면 붙는다.
 *
 * **그림 픽셀로 재면 안 된다**(사람 지적 2026-09-19: 「딱 맞는 듯한 느낌이
 * 덜함」). 그림은 1080 폭인데 화면에는 그때그때 다른 크기로 줄여 보여 준다 —
 * 실측으로 배율이 0.145 까지 내려갔고, 그때 6 그림픽셀은 **손끝에서 0.9px**
 * 이었다. 그 안에 우연히 들어가야만 붙으니 붙어도 붙은 줄 모른다.
 * 화면 기준으로 재면 크게 보든 작게 보든 손끝 느낌이 같다.
 *
 * **8 에서 5 로 줄였다**(사람 지적 2026-09-19: 「너무 멀리서부터 리액션이
 * 시작되는데 조금만 줄일수있나」). 8 은 그림 위에서 17px 쯤 되는 거리라,
 * 아직 한참 떨어져 있는데도 벌써 끌려가는 것처럼 느껴졌다.
 */
export const 붙임문턱 = 5

/**
 * **붙은 뒤에는 이 배수만큼 벗어나야 떨어진다.** 이 «끈적함» 이 「딱」 의
 * 정체다 — 없으면 붙자마자 1px 만 움직여도 떨어져서, 붙었다 떨어졌다를
 * 되풀이할 뿐 붙은 느낌이 안 난다. 파워포인트도 이렇게 버틴다.
 */
export const 붙임버팀 = 1.6

// **변만 본다. 가운데는 안 본다**(사람 지시 2026-09-19: 「맞추는거 중심부는
// 필요없을거 같아」). 예전엔 앞·가운데·뒤 셋이었는데, 가운데까지 보면 걸리는
// 자리가 네모마다 세 개라 아무 데서나 붙는 것처럼 느껴진다. 장 전체도 견줄
// 것에 들어 있어서 화면 한가운데에도 걸렸다 — 그것도 같이 빠진다.
const _맞출자리 = (a, b) => [a, b]

/**
 * 한 축에서 붙을 자리를 고른다. 옮기기와 크기 조정이 이 하나를 같이 쓴다.
 *
 * @param {number[]} 내값들 내가 맞출 후보 좌표. 옮기기는 셋(앞·가운데·뒤),
 *   크기 조정은 «끌고 있는 그 변» 하나뿐이다.
 * @param {number[][]} 남들 견줄 네모들
 * @param {(b:number[])=>number[]} 골라 네모에서 이 축의 `[앞, 뒤]` 를 꺼낸다
 * @param {number} 문턱 이 거리 안이면 붙는다(그림 픽셀)
 * @param {number|null} 버틸값 **직전에 붙어 있던 줄.** 그 줄은 더 버틴다.
 */
function _한축붙이기(내값들, 남들, 골라, 문턱, 버틸값) {
  let 제일좋음 = Infinity
  let 옮김 = 0
  let 이긴값 = null
  for (const 남 of 남들) {
    for (const 남값 of _맞출자리(...골라(남))) {
      // **붙어 있던 줄은 문턱을 넓게 준다.** 이 «끈적함» 이 「딱」 의 정체다 —
      // 없으면 붙자마자 1px 만 움직여도 떨어져, 붙었다 떨어졌다만 되풀이한다.
      const 버티나 = 버틸값 !== null && 남값 === 버틸값
      const 이문턱 = 버티나 ? 문턱 * 붙임버팀 : 문턱
      for (const 내값 of 내값들) {
        const 차 = 남값 - 내값
        const 거리 = Math.abs(차)
        if (거리 > 이문턱) continue
        // 붙어 있던 줄에 가산점을 준다 — 안 그러면 조금만 가까운 옆 줄로
        // 갈아타면서 네모가 두 자리 사이를 오간다.
        const 점수 = 버티나 ? 거리 / 붙임버팀 : 거리
        // 같은 점수면 먼저 본 것을 둔다. 끌 때마다 답이 흔들리면 안 된다.
        if (점수 >= 제일좋음) continue
        제일좋음 = 점수; 옮김 = 차; 이긴값 = 남값
      }
    }
  }
  // **점선은 한 축에 하나만 긋는다.** 폭이 같은 네모끼리는 앞·가운데·뒤가
  // 한꺼번에 맞아서, 안 걸러 내면 나란한 점선 셋이 뜬다. 이긴 그 줄에 걸친
  // 네모들만 모아 선 하나로 잇는다.
  const 걸린것 = 이긴값 === null ? []
    : 남들.filter((남) => _맞출자리(...골라(남)).some((v) => v === 이긴값))
  return { 옮김, 값: 이긴값, 걸린것 }
}

const _가로골라 = (b) => [b[0], b[2]]
const _세로골라 = (b) => [b[1], b[3]]

/**
 * 끌고 있는 네모를 옆 네모들에 맞춰 붙인다 — 파워포인트 「스마트 가이드」.
 *
 * @param {number[]} 끌네모 `[x0,y0,x1,y1]` — 붙이기 «전» 자리
 * @param {number[][]} 남들 견줄 네모들. 끌고 있는 것 자신은 빼고 넣어라.
 *   장 전체(`[0,0,w,h]`)를 같이 넣으면 화면 가장자리·한가운데에도 붙는다.
 * @param {{문턱?:number, 버틴값?:{가로:number|null,세로:number|null},
 *          손잡이?:string|null}} 옵션
 *   - `문턱` 은 **그림 픽셀**이다. 부르는 쪽이 화면 배율로 나눠서 넣는다.
 *   - `버틴값` 은 직전 프레임에 붙어 있던 줄. 넣으면 그 줄이 더 버틴다.
 *   - `손잡이` 를 주면 **크기 조정**이다(`nw`·`n`·`e`… ). 그 손잡이가 잡은
 *     변만 움직이고 나머지 변은 그대로다. 안 주면 통째로 옮기기다.
 * @returns {{box:number[], 선:object[], 붙은값:{가로:number|null,세로:number|null}}}
 */
export function 맞춰붙이기(끌네모, 남들, 옵션 = {}) {
  const { 문턱 = 붙임문턱, 버틴값 = {}, 손잡이 = null } = 옵션 || {}
  const [x0, y0, x1, y1] = 끌네모
  const 것들 = (남들 || []).filter((b) => Array.isArray(b) && b.length === 4)
  // 크기 조정이면 «끌고 있는 변» 만 후보다. 옮기기면 앞·가운데·뒤 셋 다.
  const 서쪽 = 손잡이 ? 손잡이.includes('w') : false
  const 동쪽 = 손잡이 ? 손잡이.includes('e') : false
  const 북쪽 = 손잡이 ? 손잡이.includes('n') : false
  const 남쪽 = 손잡이 ? 손잡이.includes('s') : false
  const 가로후보 = 손잡이 ? [서쪽 ? x0 : null, 동쪽 ? x1 : null].filter((v) => v !== null)
    : _맞출자리(x0, x1)
  const 세로후보 = 손잡이 ? [북쪽 ? y0 : null, 남쪽 ? y1 : null].filter((v) => v !== null)
    : _맞출자리(y0, y1)
  const 가로 = 가로후보.length
    ? _한축붙이기(가로후보, 것들, _가로골라, 문턱, 버틴값.가로 ?? null)
    : { 옮김: 0, 값: null, 걸린것: [] }
  const 세로 = 세로후보.length
    ? _한축붙이기(세로후보, 것들, _세로골라, 문턱, 버틴값.세로 ?? null)
    : { 옮김: 0, 값: null, 걸린것: [] }

  let 새네모
  if (손잡이) {
    // 잡은 변만 민다. 반대쪽은 못이 박힌 듯 그대로 — 크기 조정의 뜻이 그것이다.
    새네모 = [
      서쪽 ? x0 + 가로.옮김 : x0,
      북쪽 ? y0 + 세로.옮김 : y0,
      동쪽 ? x1 + 가로.옮김 : x1,
      남쪽 ? y1 + 세로.옮김 : y1,
    ]
    // **뒤집히거나 사라지면 안 붙인다.** 붙이려다 폭이 0 이 되면 그 네모는
    // 화면에서 사라지고 서버도 거절한다.
    if (새네모[2] - 새네모[0] < 1 || 새네모[3] - 새네모[1] < 1) {
      return { box: [...끌네모], 선: [], 붙은값: { 가로: null, 세로: null } }
    }
  } else {
    새네모 = [x0 + 가로.옮김, y0 + 세로.옮김, x1 + 가로.옮김, y1 + 세로.옮김]
  }

  // 점선은 **맞은 네모들을 잇는 만큼만** 긋는다 — 화면을 가로지르게 그으면
  // 어느 네모에 맞은 것인지 안 보인다(파워포인트도 이렇게 한다).
  const 선 = []
  if (가로.걸린것.length) {
    선.push({
      방향: '세로',
      값: 가로.값,
      부터: Math.min(새네모[1], ...가로.걸린것.map((b) => b[1])),
      까지: Math.max(새네모[3], ...가로.걸린것.map((b) => b[3])),
    })
  }
  if (세로.걸린것.length) {
    선.push({
      방향: '가로',
      값: 세로.값,
      부터: Math.min(새네모[0], ...세로.걸린것.map((b) => b[0])),
      까지: Math.max(새네모[2], ...세로.걸린것.map((b) => b[2])),
    })
  }
  return { box: 새네모, 선, 붙은값: { 가로: 가로.값, 세로: 세로.값 } }
}

/**
 * Shift+클릭 한 번의 결과 — `{sel, 여럿}`.
 *
 * **한 네모가 sel 과 여럿에 «둘 다» 들어가면 안 된다.** 옮길 때 두 번 세어져
 * 그 네모만 두 배로 달아난다. 그래서 여럿에 든 것을 다시 클릭하면 «맞바꾼다» —
 * 그것이 주인이 되고 옛 주인이 여럿으로 내려간다.
 */
export function 고르기토글(sel, 여럿, 맞은것) {
  if (맞은것 === sel) return { sel: 여럿[0] ?? null, 여럿: 여럿.slice(1) }
  if (여럿.includes(맞은것)) {
    const 남 = 여럿.filter((b) => b !== 맞은것)
    return { sel: 맞은것, 여럿: sel ? [sel, ...남] : 남 }
  }
  return sel ? { sel, 여럿: [...여럿, 맞은것] } : { sel: 맞은것, 여럿: [...여럿] }
}

/** 그물에 걸린 네모들. 목록 차례를 그대로 지킨다. */
export const 그물에걸린것 = (칸들, 그물) => 칸들.filter((b) => 겹치나(b.box, 그물))

/**
 * 붙여넣을 네모 하나를 만든다. **id 는 새로 받는다** — 같은 id 가 둘이면
 * 누끼 PNG 이름이 부딪히고, 서버가 둘 중 하나만 남긴다.
 *
 * 모양을 이루는 것은 다 따라간다: 종류·자리·기울기·층·도형(만드는 법)·테두리.
 * 도형과 테두리는 **깊게 베낀다** — 얕게 두면 붙여넣은 것의 손잡이를 끌 때
 * 원본까지 같이 움직인다.
 */
export function 네모베끼기(b, 새id) {
  const 것 = { id: 새id, kind: b.kind, box: [...b.box] }
  if (b.angle) 것.angle = b.angle
  if (Number.isInteger(b.층)) 것.층 = b.층
  if (b.도형) 것.도형 = { 이름: b.도형.이름, 값: { ...b.도형.값 } }
  if (b.테두리) 것.테두리 = b.테두리.map((q) => [...q])
  if (b.cut) 것.cut = true
  // **이게 빠져 있었다.** 사람이 위계를 골라 놓고 다음 장에 붙이면, 모양은
  // 따라가는데 위계만 조용히 풀렸다. 붙여넣기의 뜻은 «이것과 같게» 다.
  if (b.위계) 것.위계 = b.위계
  return 것
}

/**
 * 도형 아이콘 칸 크기 `[w, h]`. **늘 정사각형이다.**
 *
 * 예전에는 고른 네모의 비율을 따라갔다(2:1 까지). 알약과 둥근네모를 갈라 보이게
 * 하려던 것인데, 가로로 긴 네모를 고르면 스무 개가 다 납작해져 보였다.
 * 사람이 그 화면을 보고 **「납작하게 하지마」**(2026-09-19) 라고 했다.
 *
 * 대신 알약과 둥근네모는 단추에 마우스를 올렸을 때 뜨는 이름·설명(`title`)으로 가린다.
 *
 * `최대비` 는 1 이 기본이라 네모를 안 본다. 값을 키우면 옛 동작으로 돌아간다.
 */
export function 아이콘칸(box, 최대 = 34, 최대비 = 1) {
  const w = Math.max(1, box[2] - box[0])
  const h = Math.max(1, box[3] - box[1])
  const 비 = 조이기(w / h, 1 / 최대비, 최대비)
  return 비 >= 1
    ? [최대, Math.round(최대 / 비)]
    : [Math.round(최대 * 비), 최대]
}

/**
 * 네모가 움직이거나 늘어나면 테두리도 «같이» 간다.
 *
 * 테두리는 늘 그 네모에 딱 맞게 잡아 두므로(`테두리네모`), 옛 네모 안에서의
 * 상대 자리를 새 네모에 그대로 옮기면 정확히 맞는다. 안 옮기면 사람이 네모를
 * 조금 밀었을 뿐인데 모양만 제자리에 남아 둘이 어긋난다.
 */
export function 테두리옮기기(테두리, 옛네모, 새네모) {
  const [ax0, ay0, ax1, ay1] = 옛네모
  const [bx0, by0, bx1, by1] = 새네모
  const sx = ax1 - ax0 ? (bx1 - bx0) / (ax1 - ax0) : 1
  const sy = ay1 - ay0 ? (by1 - by0) / (ay1 - ay0) : 1
  return 테두리.map(([x, y]) => [
    Math.round((bx0 + (x - ax0) * sx) * 10) / 10,
    Math.round((by0 + (y - ay0) * sy) * 10) / 10,
  ])
}


// 손잡이를 화면 밖까지 끌면 좌표가 음수/초과가 된다. boxedit.js 의 resize() 는 최소
// 크기만 지키지 화면 경계는 안 본다(새로 긋기·이동은 이미 지킨다) — 그대로 두면 서버가
// '네모가 화면 밖입니다' 로 그 장의 저장을 통째로 거절해, 그 뒤 그은 네모가 전부 안 나간다.
// 시험이 이 함수를 직접 붙잡는다 — pointermove 안에서만 조합하면 그 코드가 지워져도
// 시험은 안 죽는다.
export const resizeIn = (box, handle, pt, w, h) => normBox(resize(box, handle, pt), w, h)

// ── 기울기 ──────────────────────────────────────────────────────────────────
// 대각선 글자는 자동으로 각도를 재지 않는다(2026-08-20 사람 지시) — 표본이 없어
// 검증도 안 되는 자동 판정 대신, 그은 사람이 아는 값을 그대로 받는다.
//
// angle 은 네모 «가운데» 를 축으로 한 회전이다(도, 시계 방향). box[x0,y0,x1,y1] 은
// 지금까지와 똑같은 «안 기운» 네모고, angle 은 그걸 돌려서 보여줄 뿐이다 —
// angle 이 없는 네모는 오늘과 완전히 같게 돈다(아래 함수들이 전부 falsy 를 그대로 통과시킨다).
const toRad = (deg) => (deg * Math.PI) / 180

export const centerOf = (box) => [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2]

// 점 하나를 c 둘레로 deg 만큼 돌린다. 캔버스는 y 가 아래로 자라므로 +deg 가 시계 방향이다.
export function spin(pt, c, deg) {
  const s = Math.sin(toRad(deg))
  const k = Math.cos(toRad(deg))
  const dx = pt[0] - c[0]
  const dy = pt[1] - c[1]
  return [c[0] + dx * k - dy * s, c[1] + dx * s + dy * k]
}

// 화면 좌표를 그 네모의 «안 기운» 좌표계로 되돌린다. 고르기·손잡이 잡기·크기 조절은
// 전부 이 되돌린 점으로 한다 — 그래야 boxedit.js 의 순수 함수를 하나도 안 고치고 쓴다.
export const toLocal = (b, pt) => (b.angle ? spin(pt, centerOf(b.box), -b.angle) : pt)

// -180 < a <= 180 으로 접고 소수 첫째 자리까지 남긴다. 서버가 받는 범위와 같다.
export function normAngle(deg) {
  if (!Number.isFinite(deg)) return 0
  let a = deg % 360
  if (a > MAX_ANGLE) a -= 360
  if (a <= -MAX_ANGLE) a += 360
  const r = Math.round(a * 10) / 10
  return r === 0 ? 0 : r        // -0 을 0 으로. JSON 은 같아도 시험의 strictEqual 은 다르다
}

// 0 이면 칸 자체를 지운다 — 안 기운 네모는 예전과 «글자 하나까지 같은» 모양으로 저장된다.
export function setAngle(b, deg) {
  const a = normAngle(deg)
  if (a === 0) delete b.angle
  else b.angle = a
  return b
}

// 캔버스를 그 네모의 «가운데» 둘레로 기울여 놓는다. 부른 쪽이 g.save()/g.restore() 로 감싼다.
// 따로 뺀 이유는 시험 때문이다 — 이 파일에서 캔버스를 직접 만지는 건 draw() 뿐인데
// 시험에는 DOM 이 없어, 여기만 가짜 컨텍스트로 「무엇을 어느 점 둘레로 돌리는지」를 붙잡는다.
export function spinCanvas(g, box, angle) {
  if (!angle) return
  const c = centerOf(box)
  g.translate(c[0], c[1])
  g.rotate(toRad(angle))
  g.translate(-c[0], -c[1])
}

// 기울기 손잡이는 위쪽 변 바깥에 둔다. 네모 안에 두면 이동·크기 조절과 겹친다.
export const GRIP_UP = 28
// 도형 손잡이의 반경. 캔버스는 1080폭 그림을 화면 폭에 맞춰 줄여 그리므로
// 그림 좌표에서는 넉넉해야 손끝으로 잡힌다.
export const 손잡이반경 = 11
export const GRIP_R = 10

export function gripPoint(box, angle = 0) {
  const c = centerOf(box)
  const p = [c[0], box[1] - GRIP_UP]
  return angle ? spin(p, c, angle) : p
}

// 기울기 손잡이를 끌 때의 각도. 손잡이가 «위» 에 있으므로 90 을 더해 위쪽이 0도가 되게 한다.
export const angleFrom = (box, pt) => {
  const c = centerOf(box)
  return normAngle((Math.atan2(pt[1] - c[1], pt[0] - c[0]) * 180) / Math.PI + 90)
}

// 옛날엔 넓은 것부터 그렸다 (설계 0절 z-order 결론) — 사람이 「어느 게 위냐」를 적을
// 자리가 없어 기계가 넓이로 대신 정했었다. 이제 층이 있으면 층을 따른다(draw() 참고).

// **`KINDS` 에 종류를 더하면 여기 색도 같이 더한다.** 빠뜨리면 그 종류의 네모가
// 색 없이 그려져 화면에서 안 보인다 — 「장번호」·「빼기」가 실제로 그랬다(2026-09-19).
// 아래 시험이 빠진 것을 잡는다. 「인물」은 이제 못 고르지만 옛 라벨에 남아 있어 둔다.
export const COLORS = {
  글자: '#2CB7B1', 사진: '#F2A93B', 인물: '#E5556E', 도형: '#5A8CFF',
  장식: '#A45AFF', 로고: '#37B24D', 장번호: '#FFD43B', 빼기: '#868E96',
}

// 손잡이 8개의 화면 좌표. boxedit.js 는 맞았는지(hit-test)만 알려주지 그리는 좌표는
// 안 주므로, 여기서 같은 기하로 다시 구한다 (모서리 4 + 변 가운데 4).
// 기운 네모면 여덟 점을 다 같이 돌린다 — 손잡이가 테두리에서 떨어져 나가면
// 「여기를 잡으면 저기가 늘어나는」 화면이 된다.
export function handlePoints(box, angle = 0) {
  const [x0, y0, x1, y1] = box
  const mx = (x0 + x1) / 2
  const my = (y0 + y1) / 2
  const p = { nw: [x0, y0], n: [mx, y0], ne: [x1, y0], e: [x1, my],
    se: [x1, y1], s: [mx, y1], sw: [x0, y1], w: [x0, my] }
  if (!angle) return p
  const c = [mx, my]
  return Object.fromEntries(Object.entries(p).map(([k, v]) => [k, spin(v, c, angle)]))
}

// 분석 상태를 사람 말로. 라벨 상태(「라벨 끝」 등)는 이 단추가 알릴 것이 아니다.
export function 상태글(state, 언어) {
  const 말 = 말하기(언어)
  if (state === '분석중') return 말('상태_분석중')
  if (state === '분석 끝') return 말('상태_분석끝')
  if (state === '분석 실패') return 말('상태_분석실패')
  return ''
}

// 「분석하기」를 누른 뒤 상태를 몇 초마다 물어본다. 바뀔 때마다 onState, 끝나면 멈춘다.
// 여태는 「분석 거는 중 — 1~2분」에서 멈춰 끝났는지 알 길이 없었다(사람 결정 2026-09-16).
export async function 분석지켜보기({ id, api, onState, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), 한도 = 60 }) {
  let 이전 = null
  for (let n = 0; n < 한도; n += 1) {
    let 지금 = null
    try {
      지금 = (await api.status())?.[id] ?? null
    } catch { /* 그물이 잠깐 끊긴 것. 다음 번에 다시 묻는다 */ }
    if (지금 && 지금 !== 이전) {
      이전 = 지금
      onState(지금)
    }
    if (지금 === '분석 끝' || 지금 === '분석 실패') return 지금
    await sleep(5000)
  }
  return '시간 초과'
}

// 통신 층. 출입증은 쿠키로 이미 붙어 있다 (사람이 로그인한 뒤에 여는 화면이라).
//
// 누가 그었는지는 남기지 않는다. 이 앱은 이름 없이 공용 암호 하나만 쓰고,
// 사람이 정한 네모는 누가 그었든 정답으로 취급하기로 했다(2026-08-18 확정).
//
// **SAM 통로는 서버에서도 뺐다**(사람 지시 2026-09-22). 이 화면이 안 불렀고,
// 열쇠도 Cloudflare 에 안 넣혀 있었다 — 부르면 어차피 죽던 길이다. 누끼는
// 확정 뒤 파이썬이 일괄로 딴다(fal, 안 되면 `outline` 흘려채우기).
// **서버가 거절할 때 돌려주는 말도 화면에 그대로 뜬다**(`failed`·`confirmFailed`).
// 그래서 부를 때마다 «지금 어느 언어인지» 를 같이 보낸다 — 안 보내면 영어로
// 쓰다가 저장이 막힐 때 거기서만 한국어가 튀어나온다.
//
// 저장소에서 바로 읽는다(`저장된언어`). 부르는 쪽이 매번 넘기게 하면 한 자리만
// 빠뜨려도 그 길만 한국어가 된다.
const 말꼬리 = (주소) => `${주소}${주소.includes('?') ? '&' : '?'}언어=${encodeURIComponent(저장된언어())}`

export const api = {
  get: (id) => fetch(말꼬리(`/api/labels/${id}`)).then((r) => r.json()),
  put: (id, idx, doc) =>
    fetch(말꼬리(`/api/labels/${id}/${idx}`), { method: 'PUT', body: JSON.stringify(doc) })
      .then((r) => r.json()),
  // 분석을 «실제로» 건다. 워커가 작업대 Lambda 로 중계한다.
  analyze: (id) =>
    붙여보내기(말꼬리(`/api/analyze/${encodeURIComponent(id)}`), { method: 'POST' })
      .then((r) => r.json()),
  // 게시물별 상태. 분석 Lambda 가 써 넣은 «분석중·분석 끝·분석 실패» 가 여기 있다.
  // **여기만 값을 그대로 쓴다** — 화면이 `상태글` 로 갈아 끼우므로 서버 말이 아니다.
  status: () => fetch('/api/labels/~status', { cache: 'no-store' }).then((r) => r.json()),
  confirm: (id, on) =>
    fetch(말꼬리(`/api/labels/~confirm/${id}`), { method: on ? 'PUT' : 'DELETE' })
      .then((r) => r.json()),
}

// 키보드는 화면 전체에서 받는다. 캔버스에 붙이면 먼저 눌러 초점을 줘야 해서 불편하다.
// 두 번 붙으면 키 한 번에 두 번 반응하므로 이전 것을 떼고 붙인다.
let keyHandler = null
// **장이 바뀌어도 남는다.** 복사·붙여넣기의 요점이 «다른 장에 같은 것을»
// 이기 때문이다. 그래서 mountLabeler 안이 아니라 여기 둔다.
let 클립 = []

export function mountLabeler(root, opts) {
  // **언어는 안 받아도 된다.** 채팅이 고른 것이 같은 브라우저 저장소에 있고,
  // 라벨판은 같은 출처의 iframe 이라 그대로 읽힌다(`수집기말.js` 머리말과
  // 같은 길). 시험이 갈아 끼울 수 있게 받는 길도 열어 둔다.
  const { id, slides, api, 언어 = 저장된언어() } = opts   // slides: [{index, w, h, src}]
  const 말 = 말하기(언어)
  /** 창고 값 하나를 보여 줄 글자로. **값은 안 바뀐다.** */
  const 보일낱말 = (갈래, 값) => 낱말(갈래, 값, 언어)
  let at = 0
  let boxes = []
  let sel = null          // 고른 네모. 방금 그은 네모는 자동으로 sel 이 된다
  let drag = null         // 새로 긋는 중인 네모의 임시 좌표
  let mode = null         // null | 'draw' | 'move' | 'resize'
  let handle = null       // resize 중일 때 잡은 손잡이 이름
  // **끌기 «시작» 자리다. 중간에 안 고쳐 쓴다.** 예전엔 직전 좌표를 담고 프레임마다
  // 새로 썼는데, 맞춰 붙이기(`맞춰붙이기`)를 넣으면 그 방식은 못 쓴다 — 붙은 자리가
  // 다음 프레임의 기준이 돼서, 한번 붙으면 손을 움직여도 안 떨어진다.
  let start = null
  // 끌기 시작할 때의 네모 자리들 — `[{칸, box}]`. 매 프레임 여기서 다시 셈한다.
  let 끌시작 = []
  let 붙임선 = []         // 지금 떠 있는 맞춤 점선. 손을 떼면 지운다.
  // **직전 프레임에 붙어 있던 줄.** 그 줄은 더 버틴다(`붙임버팀`) — 이 끈적함이
  // 「딱」 의 정체다. 손을 떼면 턴다.
  let 붙은값 = { 가로: null, 세로: null }
  let moved = false       // 눌렀다가 안 끌고 뗀 것(고르기만)은 저장할 게 없다
  let seq = 0
  // **다음에 그을 네모의 종류.** 종류 단추는 「고른 것을 바꾼다」이면서 동시에
  // 「앞으로 이걸로 긋는다」이다 — 도형을 누르고 네모를 그으면 도형이 나와야지
  // 글자가 나오면 안 된다(사람 지적 2026-08-27). 그 전에는 그은 것이 늘 글자라,
  // 도형 열 개를 그으면 종류를 열 번 다시 골라야 했다.
  let 그릴종류 = KINDS[0]
  let 여럿 = []          // sel 말고 «같이» 고른 네모들. Shift 로 넓힌다
  let 그물 = null        // Shift+드래그로 치는 중인 그물의 임시 좌표
  // **이 장의 배경이 사진인가.** 기계가 «남는 자리» 로 알아서 판정하는데
  // (실측 15장 중 15장 맞음) 조용히 틀릴 자리가 있다 — 흐릿한 하늘처럼 거의
  // 한 색인 사진 배경은 「단색」으로 보고, 그러면 카드가 평평한 색으로 나오는데
  // JSON 은 멀쩡해 보인다. 사람이 못 박을 길을 둔다(사람 결정 2026-08-27).
  let 배경사진 = false
  // 배경이 사진인 장에서 «어떤 사진인지». AI 가 그 배경을 그릴 때 따른다
  // (사람 지시 2026-09-19). 장 하나에 하나라 네모가 아니라 여기 있다.
  let 배경설명 = ''
  let 잡은손잡이 = null   // 끌고 있는 도형 손잡이의 키
  let 다듬은말 = null    // 방금 무엇으로 다듬었는지 — 사람에게 보여 준다
  let saving = Promise.resolve()
  let failed = null        // 읽기·긋기 저장 실패 — 이게 뜨면 그림이 안 남는 중이다
  // failed 가 저장 실패로 뜬 건지(save()) 읽기·decode 실패로 뜬 건지 구분한다. load() 가
  // 장을 넘겨 새로 잘 읽었다고 failed 를 지울 때, 저장 실패는 절대 같이 지우면 안 된다 —
  // 그건 "화면엔 있는데 서버엔 없는" 라벨이 아직 그대로라는 뜻이고, M4 가 확정을 막는
  // 근거이기도 하다(지워지면 확정이 그 라벨을 서버 것으로 착각하고 통과한다).
  let failedIsSave = false
  let confirmFailed = null // 확정 실패 — 따로 둔다. 확정이 성공했다고 저장 실패 경고가
                            // 지워지거나, 저장이 성공했다고 확정 실패 경고가 지워지면 안 된다
  // 서버가 실제로 아는 상태(analysis 표)는 여기서 안 읽는다 — get() 응답에 안 실려 온다.
  // 이 세션 안에서 확정 단추를 성공적으로 눌렀는지만 기억한다. save() 가 성공하면 서버가
  // afterEdit 로 '분석 대기'를 지우므로(설계 그대로) 여기서도 같이 내린다 — 안 그러면
  // 화면은 "확정됨"이라 하는데 서버는 이미 확정이 풀린 채로 다음 저장을 받는다.
  let confirmed = false
  let ready = false

  const canvas = document.createElement('canvas')
  const bar = document.createElement('div')
  const barText = document.createElement('span')
  const confirmBtn = document.createElement('button')
  confirmBtn.type = 'button'
  confirmBtn.textContent = 말('단추_확정')
  // **라벨링을 끝낸 사람이 여기 있다.** 분석하려고 목록으로 되돌아가게 하면
  // 그 단추를 못 찾는다(2026-08-27 실제로 못 찾았다). 끝낸 자리에 둔다.
  const 분석Btn = document.createElement('button')
  분석Btn.type = 'button'
  분석Btn.textContent = 말('단추_분석하기')

  // 설명서. 오른쪽 위에 둔다 — 손놀림이 열 몇 가지라 외울 수가 없다.
  const 설명Btn = document.createElement('button')
  설명Btn.type = 'button'
  설명Btn.textContent = 말('단추_설명서')
  설명Btn.style.marginLeft = 'auto'      // 띠의 오른쪽 끝으로 민다
  const 설명판 = document.createElement('div')
  설명판.hidden = true
  // **읽히게 만드는 것이 이 판의 일이다**(사람 지적 2026-09-19: 「설명서가
  // 가독성이 너무너무 없어」). 답답했던 까닭 넷을 고쳤다:
  //
  //   ① 폭 420px 에 왼쪽 칸이 «40%» 라 긴 이름이 두세 줄로 접혔다
  //      → 판을 넓히고 왼쪽 칸을 **글자 수에 맞는 고정 폭**으로 바꿨다
  //   ② 줄과 줄 사이가 0 이라 스물다섯 줄이 한 덩어리로 보였다
  //      → 줄마다 위아래 여백과 **가는 가름선**을 뒀다
  //   ③ 설명 글까지 `code`(고정폭 글꼴)로 찍혀 읽기 나빴다
  //      → 왼쪽 «누르는 것» 만 알약으로 두고 글꼴은 본문과 같이 간다
  //   ④ 묶음 제목이 본문과 굵기만 달라 덩어리가 안 갈렸다
  //      → 흐린 색 + 밑줄로 층을 냈다
  설명판.style.cssText = [
    'position:fixed', 'top:48px', 'right:12px', 'z-index:50',
    'max-width:min(560px,94vw)', 'max-height:80vh', 'overflow:auto',
    'padding:4px 18px 18px', 'border:1px solid #bbb', 'border-radius:12px',
    'background:#fff', 'color:#111', 'box-shadow:0 8px 28px rgba(0,0,0,.22)',
    'font-size:14px', 'line-height:1.55',
  ].join(';')
  const 설명그리기 = () => {
    설명판.replaceChildren()
    let 첫묶음 = true
    for (const { 묶음, 줄 } of 설명서(언어)) {
      const h = document.createElement('div')
      h.textContent = 묶음
      h.style.cssText = 'font-weight:700;font-size:12px;color:#7a7a7a;'
        + 'letter-spacing:.04em;text-transform:uppercase;'
        + `margin:${첫묶음 ? 14 : 22}px 0 2px;padding-bottom:6px;`
        // **붙박이(sticky)로 두지 않는다.** 묶음이 다섯이라 스크롤 중에 제목
        // 둘이 겹쳐 보인다(실물 2026-09-19: 「MAKING SHAPES」가 「TEXT」 뒤에
        // 깔렸다). 목록이 짧아 굳이 머리를 붙들고 있을 까닭이 없다.
        + 'border-bottom:1px solid #e4e4e6;'
      설명판.append(h)
      첫묶음 = false
      let 첫줄 = true
      for (const [키, 뜻] of 줄) {
        const r = document.createElement('div')
        r.style.cssText = 'display:flex;gap:14px;align-items:flex-start;padding:8px 0;'
          + (첫줄 ? '' : 'border-top:1px solid #f1f1f3;')
        첫줄 = false
        const k = document.createElement('span')
        k.textContent = 키
        // **글꼴은 본문 것을 쓴다.** 「빈 자리를 끈다」는 누르는 키가 아니라
        // 문장이라, 고정폭으로 찍으면 그것부터 읽기 나쁘다.
        k.style.cssText = 'flex:0 0 152px;background:#f4f4f6;border:1px solid #e7e7ea;'
          + 'border-radius:6px;padding:3px 8px;font-size:13px;color:#2b2b2b;'
          + 'line-height:1.45;word-break:keep-all;'
        const v = document.createElement('span')
        v.textContent = 뜻
        v.style.cssText = 'flex:1;min-width:0;word-break:keep-all;'
        r.append(k, v)
        설명판.append(r)
      }
    }
  }
  설명Btn.addEventListener('click', () => {
    설명판.hidden = !설명판.hidden
    if (!설명판.hidden) 설명그리기()
  })

  bar.style.display = 'flex'
  bar.style.alignItems = 'center'
  bar.style.gap = '8px'
  bar.append(barText, confirmBtn, 분석Btn, 설명Btn)

  const kindBar = document.createElement('div')
  kindBar.id = '종류칸'
  const kindBtns = KINDS.map((k) => {
    const btn = document.createElement('button')
    btn.type = 'button'
    // **글자는 갈아 끼우고 값은 `dataset` 에 둔다.** 여태는 단추 글자가 곧
    // 값이라 아래 `renderProps` 가 `btn.textContent === 지금` 으로 견줬는데,
    // 영어로 바꾸면 그 견줌이 언제나 거짓이 되어 **어느 종류가 걸렸는지 파랗게
    // 안 뜬다.** 값으로 견주게 고쳤다.
    btn.textContent = 보일낱말('종류', k)
    btn.dataset.값 = k
    btn.addEventListener('click', () => setSelKind(k))
    kindBar.append(btn)
    return btn
  })

  const propsPanel = document.createElement('div')
  propsPanel.id = '속성칸'

  const img = new Image()
  const 무대 = document.createElement('div')
  무대.id = '무대'
  무대.append(bar, canvas)
  const 조작판 = document.createElement('aside')
  조작판.id = '조작판'
  조작판.append(kindBar, propsPanel)
  root.replaceChildren(무대, 조작판, 설명판)

  // 이 끌기·고침이 어느 장의 것인지 지금 붙잡아 둔다. save() 는 줄을 서서 나가므로,
  // 그 사이 사람이 장을 넘기면 boxes·at 이 다른 장을 가리키게 된다 — 그대로 쓰면
  // 방금 그은 네모가 저장 안 되고 조용히 사라지거나(설계에서 이미 겪은 버그),
  // 남의 장 목록을 이 장에 덮어쓴다.
  const snap = () => ({ index: slides[at].index, list: boxes,
    w: canvas.width, h: canvas.height, 배경사진, 배경설명 })

  const draw = () => {
    const s = slides[at]
    canvas.width = s.w
    canvas.height = s.h
    const g = canvas.getContext('2d')
    g.drawImage(img, 0, 0, s.w, s.h)
    const 네모그리기 = (b) => {
      // 기운 네모는 캔버스를 그 네모 가운데 둘레로 돌려 놓고 «똑같은 좌표로» 그린다 —
      // 테두리도 종류 글씨도 같이 돌아간다. 안 기운 네모면 spinCanvas 가 아무것도 안 해서
      // 아래 다섯 줄이 오늘 그리는 것과 한 획도 안 달라진다.
      g.save()
      spinCanvas(g, b.box, b.angle)
      g.strokeStyle = COLORS[b.kind]
      g.lineWidth = b === sel ? 6 : 3
      if (b.테두리?.length >= 3) {
        // **사람이 그린 모양이 주인공이다.** 네모는 옅게만 남긴다 — 아주 지우면
        // 손잡이가 어디 붙어 있는지 안 보여 옮기고 늘리기가 어려워진다.
        g.globalAlpha = 0.28
        g.strokeRect(b.box[0], b.box[1], b.box[2] - b.box[0], b.box[3] - b.box[1])
        g.globalAlpha = 1
        g.beginPath()
        b.테두리.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
        g.closePath()
        g.stroke()
      } else {
        g.strokeRect(b.box[0], b.box[1], b.box[2] - b.box[0], b.box[3] - b.box[1])
      }
      g.fillStyle = COLORS[b.kind]
      g.font = 'bold 22px sans-serif'
      // **그림 위 이름표도 갈아 끼운다.** 색(`COLORS[b.kind]`)은 값으로 고른다 —
      // 여기까지 안 하면 영어 화면인데 네모에만 「사진」이 찍힌다(실물 2026-09-19).
      g.fillText(보일낱말('종류', b.kind), b.box[0] + 6, b.box[1] + 26)
      g.restore()
    }
    // **층이 있으면 그 순서로 그린다.** 없으면 목록 차례 그대로다 —
    // 사람이 아직 층을 안 정한 게시물이 그대로 보이게 하려는 것이다.
    // 글자는 언제나 맨 앞이라 장식을 다 그린 뒤에 그린다.
    const 순서 = 장식순서(boxes)
    for (const i of 순서) 네모그리기(boxes[i])
    boxes.forEach((b, i) => { if (!장식갈래.includes(b.kind)) 네모그리기(b) })
    // 손잡이와 새로 긋는 점선은 «어떤 배경 위에서도» 보여야 한다. 흰색 하나로만 그리면
    // 흰 카드나 밝은 배경 위에서 사라진다 (7번 장 프로필 카드에서 실제로 안 보였다).
    // 그래서 둘 다 어두운 것을 먼저 깔고 흰 것을 위에 얹는다 — 밝은 배경에서는 검정이,
    // 어두운 배경에서는 흰색이 보인다.
    // 같이 고른 것들. 주된 것(sel)은 굵은 테두리로 이미 드러나므로 여기서는
    // 「이것도 골랐다」만 표가 나면 된다 — 안쪽을 옅게 덮는다.
    for (const b of 여럿) {
      g.save()
      spinCanvas(g, b.box, b.angle)
      g.fillStyle = COLORS[b.kind]
      g.globalAlpha = 0.22
      g.fillRect(b.box[0], b.box[1], b.box[2] - b.box[0], b.box[3] - b.box[1])
      g.restore()
    }

    // 맞춤 점선(파워포인트 「스마트 가이드」). **네모를 다 그린 뒤에 얹는다** —
    // 먼저 그으면 네모 바탕칠에 덮여 안 보인다. 어느 줄에 맞았는지가 이 선의
    // 전부라서, 가려지면 없는 것과 같다.
    // 그물·손잡이와 같이 두 겹이다. 어떤 배경에서도 보여야 한다.
    for (const 줄 of 붙임선) {
      const [ax, ay, bx, by] = 줄.방향 === '세로'
        ? [줄.값, 줄.부터, 줄.값, 줄.까지]
        : [줄.부터, 줄.값, 줄.까지, 줄.값]
      for (const [색, 굵기] of [['#fff', 3], ['#FF3B30', 1.5]]) {
        g.strokeStyle = 색
        g.lineWidth = 굵기
        g.setLineDash([7, 5])
        g.beginPath()
        g.moveTo(ax, ay)
        g.lineTo(bx, by)
        g.stroke()
      }
      g.setLineDash([])
    }

    // 치고 있는 그물. 어떤 배경에서도 보이게 두 겹으로 그린다.
    if (그물) {
      const [gx0, gy0, gx1, gy1] = normBox(그물, canvas.width, canvas.height)
      for (const [색, 굵기] of [['#111', 4], ['#fff', 2]]) {
        g.strokeStyle = 색
        g.lineWidth = 굵기
        g.setLineDash([10, 8])
        g.strokeRect(gx0, gy0, gx1 - gx0, gy1 - gy0)
      }
      g.setLineDash([])
    }

    // 도형 손잡이. 네모 손잡이(네모난 흰 칸)와 «생김새를 다르게» 한다 — 하는 일이
    // 달라서다. 네모 손잡이는 자리·크기를, 이건 모양을 바꾼다.
    if (sel && sel.도형) {
      for (const h of 손잡이들(sel.도형.이름, sel.box, sel.도형.값)) {
        for (const [색, r] of [['#111', 손잡이반경], ['#fff', 손잡이반경 - 3]]) {
          g.fillStyle = 색
          g.beginPath()
          g.arc(h.x, h.y, r, 0, Math.PI * 2)
          g.fill()
        }
        g.fillStyle = COLORS[sel.kind]
        g.beginPath()
        g.arc(h.x, h.y, 손잡이반경 - 6, 0, Math.PI * 2)
        g.fill()
      }
    }

    if (sel) {
      const pts = handlePoints(sel.box, sel.angle)
      for (const h of HANDLES) {
        const [hx, hy] = pts[h]
        g.fillStyle = '#fff'
        g.fillRect(hx - 5, hy - 5, 10, 10)
        g.strokeStyle = '#111'
        g.lineWidth = 2
        g.strokeRect(hx - 5, hy - 5, 10, 10)
      }
      // 기울기 손잡이. 위쪽 변에서 자루가 뻗어 나온 모양이라 「돌리는 것」임이 보인다.
      // 자루도 손잡이와 같은 두 겹(어두운 것 위에 흰 것)으로 그린다.
      const [gx, gy] = gripPoint(sel.box, sel.angle)
      const [nx, ny] = pts.n
      for (const [color, width] of [['#111', 4], ['#fff', 2]]) {
        g.strokeStyle = color
        g.lineWidth = width
        g.beginPath()
        g.moveTo(nx, ny)
        g.lineTo(gx, gy)
        g.stroke()
      }
      g.beginPath()
      g.arc(gx, gy, 6, 0, Math.PI * 2)
      g.fillStyle = '#fff'
      g.fill()
      g.strokeStyle = '#111'
      g.lineWidth = 2
      g.stroke()
    }
    if (drag) {
      const [dx, dy, dw, dh] = [drag[0], drag[1], drag[2] - drag[0], drag[3] - drag[1]]
      g.lineWidth = 2
      g.strokeStyle = '#111'
      g.strokeRect(dx, dy, dw, dh)
      g.setLineDash([8, 6])
      g.strokeStyle = '#fff'
      g.strokeRect(dx, dy, dw, dh)
      g.setLineDash([])
    }
    // 저장이 안 되고 있으면 반드시 보여야 한다. 모르고 계속 그으면 그 동안 그은 게 전부 날아간다.
    // failed 와 confirmFailed 를 한 줄에 같이 보여주되, 서로 다른 원인이라 따로 지운다(C6).
    // 확정도 마찬가지로 보여야 한다 — 눌러도 화면이 그대로면(예전엔 정말 그랬다) 사람은
    // 확정 안 된 줄 알고 네모를 고쳐 조용히 확정을 풀거나(afterEdit), 확정된 줄 모르고
    // 창을 닫아 그 게시물이 파이썬 일괄 대상에서 빠진다.
    barText.textContent = 말('머리_몇장', at + 1, slides.length, boxes.length)
      + (confirmed ? ' · 확정됨' : '')
      + (failed ? ` · ⚠ ${failed}` : '')
      + (confirmFailed ? ` · ⚠ 확정 실패: ${confirmFailed}` : '')
    confirmBtn.textContent = 말(confirmed ? '단추_확정풀기' : '단추_확정')
  }

  // sel 이 바뀌거나 sel 의 종류가 바뀔 때만 부른다. draw() 처럼 자주 부르면
  // 손이 가 있는 칸(기울기 숫자)이 통째로 새로 생겨서 초점·커서가 날아간다.
  const renderProps = () => {
    for (const btn of kindBtns) {
      // 고른 것이 있으면 그 종류를, 없으면 «앞으로 그을» 종류를 파랗게 채운다 — 어느
      // 쪽이든 지금 어떤 종류가 걸려 있는지가 눈에 보여야 한다. 예전엔 굵기만 바꿨는데
      // 작은 단추에서는 멀리서 표가 안 났다(2026-09-19). 바탕을 칠하는 것은 작업대와 같다.
      const 지금 = sel ? sel.kind : 그릴종류
      btn.classList.toggle('눌림', btn.dataset.값 === 지금)
    }
    // **고른 것이 없어도 칸을 그린다.** 예전에는 네모를 골라야만 아래가 떴다 —
    // 무슨 기능이 있는지 보려면 일단 네모부터 그어 봐야 했다(사람 지적
    // 2026-08-27). 장 단위 값(배경)과 「앞으로 그을 종류」는 고른 것과 상관없고,
    // 네모의 성질들은 자리만 잡아 두고 «고른 것이 없다» 고 알린다.
    const 고른것없음 = !sel
    // **허수아비 네모를 준다.** 고른 것이 없어도 칸을 그리는데, 도형 아이콘은
    // 「고른 네모의 비율」로 그려서 `box` 가 없으면 그 자리에서 터진다 — 그러면
    // 칸이 통째로 안 그려진다(실제로 그랬다). 아래 칸들은 어차피 «잠그기» 로
    // 막혀 있어 이 허수아비에 뭔가 쓰일 일은 없다.
    const target = sel || { kind: 그릴종류, box: [0, 0, 120, 90] }

    // `target` 은 이 칸들이 «어느 네모의 것인지» 를 지금 붙잡아 둔 것이다 —
    // snap() 과 같은 이유. sel 은 그 사이(change 는 blur 에서 뒤늦게 온다) 사람이
    // 다른 네모를 클릭하면 바뀌어 있을 수 있다. 그때 sel 을 그대로 쓰면 이 칸의
    // 값이 엉뚱한 네모에 쓰인다.
    // **고른 것이 없으면 아무 말도 안 한다**(사람 지적 2026-09-19: 「네모를
    // 고르면 아래를 만질 수 있다 · 앞으로 그을 종류: 사진 — 이 말 자체가
    // 어색하다」). 「앞으로 그을 종류」는 **종류 단추가 파랗게 차서 이미
    // 보여 주고 있다**(위 `renderProps` 의 `눌림`) — 같은 것을 글로 또
    // 적을 까닭이 없다.
    const rows = []
    if (!고른것없음) {
      const head = document.createElement('div')
      head.textContent = 말('고른것_하나', 보일낱말('종류', target.kind))
      rows.push(head)
    }
    // **도형 칸은 «종류» 로 보이고 숨는다. 네모를 골랐는지는 켜고 끄기만 한다.**
    //
    // 2026-08-27 에는 반대로 했다 — 네모를 골라야 아예 보였다. 흐리게 잠가 두니
    // 만질 수 없는 칸이 열 몇 개 깔려서 정작 늘 만질 「이 장은 배경이 사진이다」가
    // 그 밑에 파묻혔기 때문이다. **그 까닭이 사라졌다**(2026-09-19): 조작부가 그림
    // 아래 가로줄에서 오른쪽 세로 판으로 옮겨 가면서 배경 체크가 판 맨 위로 올라갔다.
    // 밑에 무엇이 깔려도 안 파묻힌다. 사람 지시: 「글자 누를 때만 안 보이게」.
    //
    // 잠글 때 단추를 끄는 것이 핵심이다 — 보이는데 눌러도 아무 일이 안 나면
    // 그게 제일 헷갈린다. 왜 못 만지는지는 바로 위 `head` 한 줄이 말해 준다.
    const 잠그기 = (el) => {
      if (!고른것없음) return el
      el.style.opacity = '0.45'
      for (const x of el.querySelectorAll('button, input, select')) x.disabled = true
      return el
    }


    // 기울기는 종류를 안 가린다(대각선 글자도, 비스듬한 장식도 있다) — 늘 보인다.
    // 손잡이로 돌리는 게 주고 이 칸은 «지금 몇 도인지 읽고, 0 으로 되돌리고, 아는 값을
    // 그대로 박는» 자리다. 손잡이만 있으면 값이 화면 어디에도 안 보이고 정확히 0 으로
    // 되돌릴 방법도 없다.
    const angRow = document.createElement('label')
    angRow.append(말('칸_기울기') + ' ')
    const angInput = document.createElement('input')
    angInput.type = 'number'
    angInput.step = '0.1'
    angInput.min = String(-MAX_ANGLE)
    angInput.max = String(MAX_ANGLE)
    angInput.value = String(target.angle ?? 0)
    angInput.addEventListener('change', () => {
      // 빈 칸·글자는 Number 가 0·NaN 을 주고 normAngle 이 둘 다 0 으로 만든다 — 「되돌리기」다.
      // 범위 밖 숫자도 여기서 접히므로 서버가 그 장을 통째로 거절하는 일이 없다(C2 와 같은 함정).
      setAngle(target, Number(angInput.value))
      angInput.value = String(target.angle ?? 0)
      draw()
      void commit()
    })
    angRow.append(angInput, '°')
    if (!고른것없음) rows.push(angRow)



    // ── 글자 위계 ────────────────────────────────────────────
    // 기계가 붙이지만(`layout_labeled.levels_of`) 사람이 못 박을 수 있다.
    // 빈 값이 「자동」 — 안 고르면 기계가 하던 대로 한다.
    const 보임 = 보일칸(target.kind)
    if (!고른것없음 && 보임.위계) {
      const 위계줄 = document.createElement('label')
      위계줄.append(말('칸_글자위계') + ' ')
      const 위계Sel = document.createElement('select')
      const 빔 = document.createElement('option')
      빔.value = ''
      빔.textContent = 말('칸_자동')
      위계Sel.append(빔, ...LEVELS.map((v) => new Option(보일낱말('위계', v), v)))
      위계Sel.value = target.위계 ?? ''
      위계Sel.addEventListener('change', () => {
        if (위계Sel.value) target.위계 = 위계Sel.value
        else delete target.위계
        void commit()
      })
      위계줄.append(위계Sel)
      rows.push(잠그기(위계줄))
    }

    // ── 배경 빼기 ──────────────────────────────────────────────
    // **기본은 «안 뺌». 체크해야 뺀다**(사람 지시 2026-09-19: 「기계가 정함
    // 이건 빼 그냥 기본으로는 안빼고 체크해야 뺌」).
    //
    // 처음엔 「배경자리 말고는 다 누끼」로 기계가 정하게 했는데, 창고 사진
    // 자리 163개 중 132개가 그 대상이고 그중 10곳은 장의 절반 넘게 차지한다 —
    // 그런 자리가 투명해지면 휑하다. 기계가 못 가리는 것은 안 가리는 게 낫다.
    if (!고른것없음 && 보임.누끼) {
      const 누끼줄 = document.createElement('label')
      const 누끼체크 = document.createElement('input')
      누끼체크.type = 'checkbox'
      누끼체크.checked = target.누끼 === true
      누끼체크.title = 말('칸_배경빼기설명')
      누끼체크.addEventListener('change', () => {
        if (누끼체크.checked) target.누끼 = true
        else delete target.누끼
        void commit()
      })
      누끼줄.append(누끼체크, ' ' + 말('칸_배경빼기'))
      rows.push(잠그기(누끼줄))
    }

    // ── 사진 설명 ──────────────────────────────────────────────
    // **여기 적은 말이 그림 지시문이 된다**(사람 지시 2026-09-19).
    // AI 가 이 자리를 그릴 때 이 글을 먼저 보고, 없으면 그 장의 글로 알아서
    // 짓는다(`analyze/사진만들기.지시문짓기`).
    //
    // **위치·방향을 적으라고 일러 준다** — 사람 지적: 「오른쪽 사진 3개 쪽으로
    // 프레젠테이션 포즈 해야지」. 그건 재서 알 수 없고 사람만 아는 것이다.
    if (!고른것없음 && 보임.설명) {
      const 설명줄 = document.createElement('label')
      설명줄.append(말('칸_사진설명') + ' ')
      const 설명칸 = document.createElement('textarea')
      설명칸.rows = 2
      설명칸.maxLength = MAX_NOTE
      설명칸.placeholder = 말('넣는곳_사진설명')
      설명칸.title = 말('넣는곳_사진설명도움')
      설명칸.value = target.note ?? ''
      설명칸.addEventListener('change', () => {
        const 글 = 설명칸.value.trim()
        if (글) target.note = 글
        else delete target.note
        void commit()
      })
      설명줄.append(설명칸)
      rows.push(잠그기(설명줄))
    }

    if (보임.모양) {
    // ── 도형 고르기 ────────────────────────────────────────────
    // **모양은 이 스무 개가 전부다.** 손으로 긋는 「직접 그리기」는 뺐다(2026-09-19).
    //
    // **단추 그림을 도형 만드는 그 함수로 그린다.** 아이콘을 따로 그려 두면
    // 보이는 것과 나오는 것이 갈릴 수 있다 — 여기서는 갈릴 수가 없다.
    const 도형줄 = document.createElement('div')
    for (const { 이름, 설명 } of 도형들) {
      const btn = document.createElement('button')
      btn.type = 'button'
      // 값은 `이름` 그대로 쓰고(도형을 찾는 열쇠다) 보이는 글자만 갈아 끼운다.
      btn.title = `${도형말(이름, 언어)} — ${도형설명(이름, 언어)}`
      btn.setAttribute('aria-label', 도형말(이름, 언어))
      // **지금 걸린 모양은 파랗게.** 안 그러면 「도형은 왜 체크가 안 돼 있어?」
      // (사용자 2026-09-28) — 값은 둥근네모로 저장돼 있는데 스무 개 단추 어느 것도
      // 눌린 표가 없었다. 종류 단추와 같은 `눌림` 이다(`renderProps` 위쪽).
      btn.classList.toggle('눌림', 도형단추눌림(target, 이름))
      // **늘 정사각형으로 그린다**(`아이콘칸`). 예전엔 고른 네모의 비율을 따라가
      // 가로로 긴 네모에서는 스무 개가 다 납작해 보였다 — 사람이 그 화면을 보고
      // 「납작하게 하지마」 했다(2026-09-19). 알약과 둥근네모처럼 정사각형에서
      // 비슷해지는 둘은 마우스를 올렸을 때 뜨는 이름·설명(`title`)으로 가린다.
      const 아이콘 = 아이콘칸(target.box)
      const 미리 = 도형테두리(이름, [1, 1, 아이콘[0] - 1, 아이콘[1] - 1],
        도형기본값(이름)) || []
      btn.innerHTML = `<svg width="${아이콘[0]}" height="${아이콘[1]}"`
        + ` viewBox="0 0 ${아이콘[0]} ${아이콘[1]}" aria-hidden="true">`
        + `<polygon points="${미리.map(([x, y]) => `${x},${y}`).join(' ')}"`
        + ` fill="currentColor" opacity="0.85"/></svg>`
      btn.addEventListener('click', () => {
        const 값 = 도형기본값(이름)
        const 테 = 도형테두리(이름, target.box, 값)
        if (!테) return
        // **만드는 법을 같이 남긴다.** 점 목록만 남기면 「이게 원이었다」는 사실이
        // 사라져 다시 못 고친다. 분석·틀·굽는 쪽은 `테두리` 만 읽으므로
        // 이 칸이 늘어도 그쪽은 한 줄도 안 바뀐다.
        target.도형 = { 이름, 값 }
        target.테두리 = 테
        // 네모는 그대로 둔다 — 도형이 «그 네모에 내접» 하므로 이미 딱 맞는다.
        // **여기서 안내 한 줄을 안 띄운다**(사람 지시 2026-09-19). 무엇으로 맞췄는지는
        // 그림에 바로 보여서, 판 밑에 글까지 남으면 그때부터 안 지워지는 군더더기다.
        // 앞서 뜬 말(직접 그리기 안내 같은)은 여기서 지운다 — 안 지우면 그게 남는다.
        다듬은말 = null
        draw()
        renderProps()
        void commit()
      })
      도형줄.append(btn)
    }
    rows.push(잠그기(도형줄))

    // ── 모양 없애기 ────────────────────────────────────────────
    // **「직접 그리기」는 뺐다**(사람 지시 2026-09-19). 손으로 긋는 길을 없앴으니
    // 모양은 위 단추 스무 개로만 정한다. 누끼는 안 죽는다 — 파이썬은 `테두리` 만
    // 있으면 오리고(`cutout.py`), 그 테두리는 단추가 만들어 준다.
    const 그린것있음 = target.테두리?.length >= 3
    if (그린것있음) {
      const 그리기줄 = document.createElement('div')
      const 지움Btn = document.createElement('button')
      지움Btn.type = 'button'
      지움Btn.textContent = 말('단추_모양없애기')
      지움Btn.addEventListener('click', () => {
        delete target.테두리
        delete target.도형
        다듬은말 = null
        draw()
        renderProps()
        void commit()
      })
      그리기줄.append(지움Btn)
      rows.push(잠그기(그리기줄))
    }
    }   // 모양 묶음 끝
    if (다듬은말) {
      const 말 = document.createElement('div')
      말.textContent = 다듬은말
      rows.push(말)
    }

    if (!고른것없음 && 보임.층) {
    // ── 층 (겹친 장식 중 누가 위냐) ─────────────────────────────
    // 작업대(`web/lib/workbench.js`)와 같은 손놀림으로 맞춘다. `boxes` 는 이 장의
    // 네모 배열(이 파일이 이미 쓰는 이름, 203줄) — 새 상태를 만들지 않는다.
    const 층줄 = document.createElement('div')
    const 뒤로 = document.createElement('button')
    뒤로.type = 'button'
    뒤로.textContent = 말('단추_뒤로')
    const 앞으로 = document.createElement('button')
    앞으로.type = 'button'
    앞으로.textContent = 말('단추_앞으로')
    const 층표 = document.createElement('span')
    층줄.append(뒤로, 앞으로, 층표)

    const 층그리기 = () => {
      const 순서 = 장식순서(boxes)
      const i = 순서.indexOf(boxes.indexOf(target))
      뒤로.disabled = i <= 0
      앞으로.disabled = i < 0 || i === 순서.length - 1
      층표.textContent = i < 0 ? ''
        : `${i + 1}/${순서.length}` + (순서.length < 2 ? ''
            : i === 순서.length - 1 ? ' ' + 말('칸_층_맨앞') : i === 0 ? ' ' + 말('칸_층_맨뒤') : '')
      층줄.hidden = i < 0        // 글자 칸에는 층이 없다
    }

    const 밀기 = (방향) => {
      const 새줄 = 층밀기(장식순서(boxes), boxes.indexOf(target), 방향)
      if (!새줄) return
      // **모든 장식에 다시 매긴다.** 반쯤 매겨진 것은 읽는 쪽이 통째로 무시한다.
      for (const x of 새줄) boxes[x.번호].층 = x.층
      층그리기()
      draw()
      void commit()
    }
    뒤로.addEventListener('click', () => 밀기(-1))
    앞으로.addEventListener('click', () => 밀기(+1))
    층그리기()
    rows.push(층줄)
    }   // 층 묶음 끝

    // **여기 있던 안내 두 줄은 설명서로 옮겼다.** 같은 말이 두 군데 있으면 한쪽만
    // 고쳐지고 갈린다 — 그리고 칸마다 안내가 붙으면 정작 만질 것이 안 보인다
    // (사람 지적 2026-08-27). 손놀림 설명은 오른쪽 위 「설명서」 한 곳에 있다.
    //
    // 다만 «지금 상태» 는 남긴다 — 몇 개 골랐는지는 설명서가 대신 말해 줄 수 없다.
    if (여럿.length) {
      const 고른수 = document.createElement('div')
      고른수.textContent = 말('고른것_여럿', 여럿.length + 1)
      rows.push(고른수)
    }

    // **장마다 하나인 값이라 고른 네모와 상관없이 늘 보인다.** 아래 칸들은
    // 「고른 네모」의 성질인데 이것만 「이 장」의 성질이다 — 맨 위에 따로 둔다.
    const 배경줄 = document.createElement('div')
    배경줄.style.cssText = 'padding-bottom:6px;margin-bottom:6px;border-bottom:1px solid var(--테);'
    const 배경칸 = document.createElement('label')
    const 배경체크 = document.createElement('input')
    배경체크.type = 'checkbox'
    배경체크.checked = 배경사진
    배경체크.addEventListener('change', () => {
      배경사진 = 배경체크.checked
      if (!ready) return
      const s2 = snap()
      save(s2.index, s2.w, s2.h, s2.list, s2.배경사진)
    })
    배경칸.append(배경체크, ' ' + 말('칸_이장배경사진'))
    배경줄.append(배경칸)
    // **배경이 사진일 때만 설명 칸을 보인다.** 아니면 적을 데가 없는 칸이
    // 늘 떠 있어 무엇을 적으라는 건지 헷갈린다.
    if (배경사진) {
      const 배경설명칸 = document.createElement('textarea')
      배경설명칸.rows = 2
      배경설명칸.maxLength = MAX_NOTE
      배경설명칸.placeholder = 말('넣는곳_배경설명')
      배경설명칸.title = 말('넣는곳_배경설명도움')
      배경설명칸.value = 배경설명
      배경설명칸.addEventListener('change', () => {
        배경설명 = 배경설명칸.value.trim()
        if (!ready) return
        const s3 = snap()
        save(s3.index, s3.w, s3.h, s3.list, s3.배경사진, s3.배경설명)
      })
      배경줄.append(배경설명칸)
    }
    propsPanel.replaceChildren(배경줄, ...rows)
  }

  // 지금 고른 것 전부. `sel` 이 «주된» 하나다 — 속성 칸과 손잡이는 그것을 따른다.
  const 고른모두 = () => (sel ? [sel, ...여럿] : [...여럿])
  const 하나만고르기 = (b) => { sel = b; 여럿 = [] }

  // 네모가 바뀌었을 때 테두리를 따라가게 한다.
  //
  // **도형은 «다시 만든다».** 점을 늘려 옮기면 원을 세로로 늘렸을 때 위아래
  // 모서리가 뭉개진다 — 도형은 늘 그 네모에 내접해야 하므로 새 네모로 다시
  // 만드는 것이 맞다. 손으로 그린 것은 식구가 없으니 점을 그대로 옮긴다.
  const 테두리따라가기 = (b, 옛네모) => {
    if (!b.테두리) return
    if (b.도형) {
      const 테 = 도형테두리(b.도형.이름, b.box, b.도형.값)
      if (테) { b.테두리 = 테; return }
    }
    b.테두리 = 테두리옮기기(b.테두리, 옛네모, b.box)
  }

  // 지금 고른 네모에 종류를 매긴다. 단추·숫자 키가 같이 쓴다.
  function setSelKind(k) {
    // **고른 것이 없어도 받는다.** 「앞으로 이걸로 긋는다」는 뜻이 있어서다.
    그릴종류 = k
    if (!sel) { draw(); renderProps(); return }
    sel.kind = k
    // **옛 라벨에 남은 사람 값은 여기서 털어 낸다.** 이제 화면에 그 칸이 없으니
    // 값만 서버에 남는데, 파이썬은 아직 그것을 읽고 «기계보다 우선» 으로 친다
    // (`layout_labeled.choose_font`·`choose_effects`). 화면에 안 보이는 값이 결과를
    // 좌우하는 것이 제일 나쁘다 — 종류를 다시 매길 때 같이 지운다.
    // **설명(`note`)은 안 지운다**(2026-09-19). 종류를 사진↔인물로 바꿔도
    // 「무엇을 찍은 사진인지」는 그대로다 — 지우면 사람이 다시 적어야 한다.
    for (const key of ['font', 'effects', 'treat']) delete sel[key]
    // **글자로 바꾸면 모양도 같이 턴다 — 네모로 돌아간다.** 글자에는 도형 칸이
    // 아예 없어서(`보일칸`), 별을 씌운 채 글자로 바꾸면 별이 그림에 그대로 남는데
    // 「모양 없애기」 단추가 같이 사라져 없앨 길이 화면에서 끊긴다(사람 지적
    // 2026-09-19). `cut`(오려내기)은 손으로 그린 테두리와 한 짝이라 같이 지운다.
    if (k === '글자') for (const key of ['도형', '테두리', 'cut']) delete sel[key]
    draw()
    renderProps()
    void commit()
  }

  // 저장을 한 줄로 세운다. 그냥 겹쳐 보내면 늦게 떠난 요청이 먼저 닿을 수 있고,
  // 서버는 마지막에 온 것을 그대로 쓰므로(ON CONFLICT DO UPDATE) 네모가 적은 쪽이
  // 많은 쪽을 덮어쓴다.
  //
  // 실패를 반드시 여기서 붙잡아야 한다. 거절된 promise 에 이어 붙인 .then 은 건너뛰므로,
  // 한 번 실패한 채로 두면 그 뒤 저장이 **전부 조용히 안 나간다** — 1,400개를 긋는 동안
  // 아무 말 없이 하나도 안 저장되는 상태가 된다. 붙잡아서 줄을 살리고 사람한테 알린다.
  const save = (index, w, h, list, 배경 = 배경사진, 설명 = 배경설명) => {
    saving = saving
      // **빈 설명도 보낸다.** 안 보내면 서버에 있던 옛 글이 그대로 남아,
      // 지웠는데 다시 들어오면 되살아난다 — 돌려주기 시작한 2026-09-20 부터
      // 실제로 보이는 문제다. 서버는 빈 글자를 정상으로 받는다(`checkLabels`).
      .then(() => api.put(id, index, { canvas: { w, h }, boxes: list, 배경사진: 배경,
        배경설명: 설명 }))
      .then((r) => {
        failed = r?.ok ? null : (r?.why || 말('탈_알수없음'))
        failedIsSave = !r?.ok
        // 서버는 저장이 성공하면 afterEdit 로 확정을 실제로 풀어 버린다(labels.js 참고) —
        // 여기서 안 내리면 화면은 계속 "확정됨"이라 거짓말한다.
        if (r?.ok) confirmed = false
        // 채팅 페이지가 이 화면을 오른쪽 칸에 끼워 두고 있으면 «저장했다» 고 알린다.
        // 같은 집(origin)에만 보낸다.
        if (r?.ok && window.parent !== window) {
          window.parent.postMessage({ 라벨판: '저장', id }, location.origin)
        }
      })
      .catch((e) => { failed = e.message; failedIsSave = true })
      .then(draw)
    return saving
  }

  // 지금 sel 이 속한 장 기준으로 저장한다. 속성 칸 편집은 늘 sel 이 있을 때만 일어나므로
  // snap() 을 그대로 쓴다.
  const commit = () => {
    if (!ready) return Promise.resolve()
    const s = snap()
    return save(s.index, s.w, s.h, s.list, s.배경사진)
  }

  // **화살표로 잘게 옮길 때는 저장을 모아서 한 번 보낸다.** 키를 누르고 있으면
  // 초당 수십 번 눌린 것으로 오는데, 그때마다 서버에 보내면 줄이 길어져 마지막
  // 값이 늦게 닿는다. 마지막으로 누른 뒤 이만큼 잠잠하면 그때 한 번 보낸다.
  const 모아저장늦춤 = 300
  let 저장타이머 = null
  const 나중에저장 = () => {
    if (저장타이머) clearTimeout(저장타이머)
    저장타이머 = setTimeout(() => { 저장타이머 = null; void commit() }, 모아저장늦춤)
  }
  /** 모아 두고 기다리던 저장이 있으면 **지금 바로** 보낸다. 장을 넘기기 전에
   * 반드시 불러야 한다 — 안 그러면 넘긴 뒤에 타이머가 깨어나 «새 장» 의 목록을
   * 저장하고, 방금 옮긴 것은 조용히 사라진다. */
  const 저장밀기 = () => {
    if (!저장타이머) return
    clearTimeout(저장타이머)
    저장타이머 = null
    void commit()
  }

  // 화살표를 연달아 누르면 load 가 여러 개 동시에 돈다. 늦게 시작한 것이 먼저 끝나면
  // boxes 는 A 장 것인데 at 은 B 장을 가리키는 상태가 되고, 그다음 그은 네모가 A 장의
  // 목록을 B 장에 덮어써 B 장 라벨이 통째로 날아간다. 세대 표식으로 늦게 온 결과를 버린다.
  let gen = 0
  const load = async () => {
    // **모아 두고 기다리던 저장을 먼저 내보낸다.** 화살표로 옮기자마자 장을
    // 넘기면, 타이머가 넘어간 «새 장» 에서 깨어나 그 장의 목록을 저장한다 —
    // 방금 옮긴 것은 서버에 안 닿고 조용히 사라진다.
    저장밀기()
    const mine = (gen += 1)
    // 이 네 줄은 반드시 아래 await **앞**에 있어야 한다 — 뒤로 밀면 at 은 이미 새 장인데
    // ready 는 아직 true(옛 장 것)인 창이 생긴다. 그 창 안에서 pointerup·Delete·Ctrl+Z·
    // 숫자 키 중 하나라도 걸리면 snap() 이 {index: 새 장, list: boxes(옛 장)} 을 섞어
    // 만들고, 그게 그대로 저장돼 새 장의 행을 옛 장의 목록으로 덮어쓴다 — 서버는 ok 를
    // 주니 failed 도 안 뜨는 조용한 유실이다(재검토에서 실제로 잡힌 자리).
    drag = null       // 끌던 것이 남으면 다음 장에 엉뚱한 자리로 그려진다
    mode = null        // 손잡이를 잡거나 옮기던 중이었어도 장이 바뀌면 그 몸짓은 버린다
    sel = null         // 이전 장의 네모를 가리킨 채로 남으면 안 된다
    // **여럿도 같이 턴다.** 안 털면 옛 장의 네모를 가리킨 채 남아서, 다음 장에서
    // Del 을 누르면 «이 장에 없는» 것을 지우려 들고(splice 가 -1 이라 아무 일도
    // 안 일어난 척한다) Ctrl+C 는 옛 장 것을 복사한다. 화면에는 아무 표시도 없다.
    // `클립` 은 일부러 안 턴다 — 다른 장에 붙이는 게 복사의 요점이다.
    여럿 = []
    그물 = null        // 그물을 치다 장을 넘기면 점선이 다음 장까지 따라다닌다
    ready = false     // 다 읽기 전에 그은 네모는 저장하지 않는다
    // 줄 서 있는 PUT 이 이 GET 보다 늦게 서버에 닿으면, 방금 그은 네모가 안 실린 옛
    // 목록을 이 GET 이 받아 boxes 를 덮어쓴다 — 저장은 성공했으니 failed 도 안 뜬다.
    // PUT 이 먼저 끝나길 기다렸다가 읽는다. 실패해도(failed 는 이미 거기서 잡혔다) 여기선
    // 그냥 넘어간다 — 이 await 은 순서만 보장하면 되지 실패 자체를 다루는 자리가 아니다.
    await saving.catch(() => {})
    const s = slides[at]
    let got = null
    try {
      got = await api.get(id)
    } catch (e) {
      failed = e.message
    }
    if (mine !== gen) return   // 그새 또 넘겼다. 이 결과는 버린다
    if (!Array.isArray(got)) {
      failed = failed || 말('탈_라벨못읽음')
      draw()
      renderProps()
      return                   // ready 가 false 로 남아 저장이 막힌다
    }
    const 이장 = got.find((x) => x.index === s.index)
    boxes = 이장?.boxes ?? []
    배경사진 = Boolean(이장?.배경사진)
    // **설명도 여기서 채운다.** 안 채우면 장을 넘겼다 오거나 화면을 다시 열 때마다
    // 빈 글자로 돌아가, 적어 둔 것이 사라진 것처럼 보인다(사람 지적 2026-09-20).
    배경설명 = String(이장?.배경설명 ?? '')
    // 옛 종류를 갈아 끼운다. 다음 저장에서 서버 것도 스스로 낫는다 — 여기서만
    // 바꾸고 저장을 안 하면 화면과 서버가 계속 어긋난 채로 남는다.
    for (const b of boxes) if (옛종류[b.kind]) b.kind = 옛종류[b.kind]
    // 이 장은 정상적으로 읽었다 — 여기서 낡은 실패를 지운다. 예전엔 '라벨을 못
    // 불러왔습니다' 라는 딱 그 문구일 때만 지웠는데, 그러면 다른 장에서 남은
    // '그림을 못 열었습니다'·'다른 네모로 옮겨서 AI 답을 버렸습니다' 같은 낡은 경고가
    // 이 장을 잘 읽은 뒤에도 안 지워진 채 남아 확정을 계속 막는다(M4). 단, 저장 실패
    // (failedIsSave)는 다르다 — 이 장을 잘 읽었다는 사실과 "화면의 라벨이 아직 서버에
    // 없다"는 사실은 서로 무관하다. 여기서 지우면 그 경고가 사라지고 확정도 통과해
    // 버려 M4 가 막으려던 구멍이 그대로 다시 열린다. 저장 실패가 아닐 때만 지운다 —
    // 바로 아래 decode 가 이 장에서 실패하면 곧바로 다시 채우므로, 지금 지워도 그
    // 실패는 안 숨는다.
    if (!failedIsSave) failed = null
    img.src = s.src
    try {
      await img.decode()
    } catch {
      failed = 말('탈_그림못엶')
    }
    if (mine !== gen) return
    ready = true
    draw()
    renderProps()
  }

  canvas.addEventListener('pointerdown', (e) => {
    // 캔버스 밖에서 손을 떼도 pointerup 이 여기로 오게 한다. 안 그러면 끌던 상태가
    // 남아서 다음 장까지 점선이 따라다닌다.
    canvas.setPointerCapture(e.pointerId)
    const p = imgPoint(e, canvas.getBoundingClientRect(), canvas.width, canvas.height)

    // **Alt 는 「무조건 새로 긋기」다.** 큰 네모가 장을 덮고 있으면 그 안을 끌어도
    // 그 네모가 움직일 뿐 새 네모를 못 긋는다 — 표지처럼 사진이 장을 거의 덮는
    // 경우에 실제로 막힌다(2026-08-27 사람이 짚었다). Shift 가 「고르기」인 것과
    // 짝을 맞춰 Alt 를 「긋기」로 둔다.
    if (e.altKey) {
      sel = null
      여럿 = []
      mode = 'draw'
      drag = [p[0], p[1], p[0], p[1]]
      draw()
      renderProps()
      return
    }

    // **Shift 는 「고르기」다.** 네모 위면 하나씩 더하고 빼고, 빈 자리면 그물을 친다.
    // 그냥 드래그는 «새 네모 긋기» 라 그대로 두고 다른 손놀림으로 가른다.
    if (e.shiftKey) {
      const 맞은것 = pick(boxes, p, toLocal)
      if (맞은것) {
        ({ sel, 여럿 } = 고르기토글(sel, 여럿, 맞은것))
        mode = null
        draw()
        renderProps()
        return
      }
      mode = '그물'
      그물 = [p[0], p[1], p[0], p[1]]
      draw()
      return
    }

    // 도형 손잡이 → 값 바꾸기. 네모 손잡이보다 먼저 본다 — 도형 손잡이는 네모
    // «안» 에 있어서 나중에 보면 네모 안쪽 누르기(이동)에 먹힌다.
    if (sel && sel.도형) {
      const 잡을것 = 손잡이들(sel.도형.이름, sel.box, sel.도형.값)
        .find((h) => Math.abs(p[0] - h.x) <= 손잡이반경 && Math.abs(p[1] - h.y) <= 손잡이반경)
      if (잡을것) {
        mode = '도형손잡이'
        잡은손잡이 = 잡을것.키
        moved = false
        return
      }
    }

    // 기울기 손잡이 → 돌리기, 손잡이 → 리사이즈, 네모 안 → 이동, 빈 자리 → 새로 긋기.
    // 기울기 손잡이를 제일 먼저 본다 — 네모 밖(위)에 있어 다른 것과 겹치지 않는다.
    if (sel) {
      const [gx, gy] = gripPoint(sel.box, sel.angle)
      if (Math.abs(p[0] - gx) <= GRIP_R && Math.abs(p[1] - gy) <= GRIP_R) {
        mode = 'rotate'
        moved = false
        return
      }
    }
    // 기운 네모는 점을 그 네모만큼 거꾸로 돌려서 본다(toLocal) — 손잡이도 고르기도
    // 눈에 보이는 «기운» 모양 기준으로 맞아야 한다.
    const h = sel && handleAt(sel.box, toLocal(sel, p))
    if (h) { mode = 'resize'; handle = h; moved = false; return }
    const hit = pick(boxes, p, toLocal)
    if (hit) {
      // 이미 고른 것 안을 잡았으면 고른 것을 그대로 두고 통째로 옮긴다 —
      // 여기서 하나로 줄이면 여럿을 고른 뜻이 사라진다. 잡은 것이 주인이 되게
      // 맞바꾸되 겹치지 않게 한다(겹치면 그것만 두 배로 움직인다).
      if (!고른모두().includes(hit)) 하나만고르기(hit)
      else if (hit !== sel) ({ sel, 여럿 } = 고르기토글(sel, 여럿, hit))
      mode = 'move'
      start = p
      끌시작 = 고른모두().map((칸) => ({ 칸, box: [...칸.box] }))
      moved = false
      draw()
      renderProps()
      return
    }
    sel = null
    여럿 = []
    mode = 'draw'
    drag = [p[0], p[1], p[0], p[1]]
    draw()
    renderProps()
  })

  /**
   * 끌고 있는 네모를 옆 네모에 맞춰 붙여 본다. 옮기기와 크기 조정이 같이 쓴다.
   * 붙을 데가 없거나 Ctrl 을 누르고 있으면 준 것을 그대로 돌려준다.
   *
   * **문턱은 화면 픽셀로 잰다.** 그림은 1080 폭인데 화면에는 그때그때 다른
   * 크기로 줄여 보여 준다 — 그림 픽셀로 재면 크게 볼 땐 너무 잘 붙고 작게 볼
   * 땐 거의 안 붙는다(실측 배율 0.145에서 6그림px = 손끝 0.9px).
   *
   * @param {number[]} 네모 붙이기 전 자리
   * @param {PointerEvent} e Ctrl 을 봤다
   * @param {string|null} 손잡이 크기 조정이면 그 손잡이 키, 옮기기면 null
   */
  const 붙여보기 = (네모, e, 손잡이) => {
    붙임선 = []
    // **Ctrl 을 누르면 안 붙는다.** 일부러 살짝 어긋나게 두고 싶을 때가 있다.
    // 파워포인트는 이 자리에 Alt 를 쓰지만 여기서는 못 쓴다 — Alt 는 이미
    // 「무조건 새로 긋기」다(pointerdown). Alt 로 해 보니 옮기기가 아니라 새
    // 네모가 하나 생겼다(실물 2026-09-19).
    if (e.ctrlKey || e.metaKey) { 붙은값 = { 가로: null, 세로: null }; return 네모 }
    const 배율 = (canvas.getBoundingClientRect().width || canvas.width) / canvas.width
    // 견줄 것: 이 장의 «안 고른» 네모들 + 장 전체(가장자리·한가운데).
    const 고른것 = 고른모두()
    const 남들 = boxes.filter((b) => !고른것.includes(b)).map((b) => b.box)
    남들.push([0, 0, canvas.width, canvas.height])
    const 붙임 = 맞춰붙이기(네모, 남들, {
      문턱: 붙임문턱 / (배율 > 0 ? 배율 : 1),
      버틴값: 붙은값,
      손잡이,
    })
    // 붙이다 화면 밖으로 나가면 안 된다 — 서버가 그 장의 저장을 통째로 거절한다.
    // 접은 뒤 크기가 달라졌으면 안 붙인 것으로 친다.
    const 접은것 = normBox(붙임.box, canvas.width, canvas.height)
    if (접은것[2] - 접은것[0] !== 붙임.box[2] - 붙임.box[0]
      || 접은것[3] - 접은것[1] !== 붙임.box[3] - 붙임.box[1]) {
      붙은값 = { 가로: null, 세로: null }
      return 네모
    }
    붙임선 = 붙임.선
    붙은값 = 붙임.붙은값
    return 접은것
  }

  canvas.addEventListener('pointermove', (e) => {
    if (!mode) return
    const p = imgPoint(e, canvas.getBoundingClientRect(), canvas.width, canvas.height)
    if (mode === '그물') {
      그물[2] = p[0]
      그물[3] = p[1]
      draw()
      return
    }
    if (mode === '도형손잡이') {
      sel.도형.값 = 손잡이끌기(sel.도형.이름, sel.box, sel.도형.값, 잡은손잡이, p)
      const 테 = 도형테두리(sel.도형.이름, sel.box, sel.도형.값)
      if (테) sel.테두리 = 테
      moved = true
      draw()
      return
    }
    if (mode === 'draw') {
      drag[2] = p[0]
      drag[3] = p[1]
      draw()
      return
    }
    if (mode === 'rotate') {
      setAngle(sel, angleFrom(sel.box, p))
      moved = true
      draw()
      return
    }
    if (mode === 'resize') {
      // 기운 네모는 되돌린 점으로 늘린다 — box 는 계속 «안 기운» 네모라 그래야 앞뒤가 맞는다.
      // 회전축이 가운데라 반대쪽 변도 조금 따라 움직이지만, 이 화면이 실제로 쓰는 각도는
      // 대각선 글자 정도(몇 도)라 눈에 띄지 않는다. 앵커 보정은 안 넣는다.
      const 옛네모 = sel.box
      // **크기 조정도 붙는다**(사람 지시 2026-09-19: 「크기 조정할때도 맞으면 딱」).
      // 잡은 그 변만 옆 네모의 변·가운데에 붙고, 반대쪽 변은 그대로다.
      sel.box = 붙여보기(
        resizeIn(sel.box, handle, toLocal(sel, p), canvas.width, canvas.height),
        e, handle,
      )
      테두리따라가기(sel, 옛네모)
      moved = true
      draw()
      return
    }
    // move — 고른 것을 «다 같이» 옮긴다. 옮긴 양은 주된 것이 실제로 간 만큼으로
    // 맞춘다(화면 끝에서 잘릴 수 있어서다) — 안 그러면 벽에 붙는 순간 서로 흩어진다.
    //
    // **끌기 시작 자리에서 매번 다시 셈한다.** 직전 자리에 더해 가면 한번 붙은
    // 뒤로는 그 자리가 기준이 돼서 손을 움직여도 안 떨어진다.
    const 처음 = 끌시작.find((x) => x.칸 === sel)
    const 밑자리 = 처음 ? 처음.box : sel.box
    let 새것 = move(밑자리, p[0] - start[0], p[1] - start[1], canvas.width, canvas.height)
    // **Ctrl 을 누르면 안 붙는다.** 일부러 살짝 어긋나게 두고 싶을 때가 있다.
    //
    // 파워포인트는 이 자리에 Alt 를 쓰지만 **여기서는 못 쓴다** — Alt 는 이미
    // 「무조건 새로 긋기」다(pointerdown). Alt 를 누른 채 네모 안을 끌면 옮기기가
    // 아니라 새 네모 긋기로 가서, 안 붙기는커녕 엉뚱한 네모가 하나 생긴다
    // (실물 2026-09-19에 그렇게 나왔다).
    새것 = 붙여보기(새것, e, null)
    const 옛네모 = sel.box
    sel.box = 새것
    const dx = sel.box[0] - 옛네모[0]; const dy = sel.box[1] - 옛네모[1]
    테두리따라가기(sel, 옛네모)
    for (const b of 여럿) {
      const 옛 = b.box
      b.box = move(b.box, dx, dy, canvas.width, canvas.height)
      테두리따라가기(b, 옛)
    }
    moved = true
    draw()
  })

  // 포인터 스트림이 중간에 취소되면(터치가 다른 몸짓으로 뺏기는 경우 등) pointerup 이
  // 안 온다. mode 가 'move'/'resize' 로 남으면 그 뒤 모든 pointermove(단순 hover 포함)가
  // 이미 저장된 네모(sel.box)를 계속 고쳐 쓰고, 다음 commit() 이 그 뒤틀린 좌표를 그대로
  // 저장한다 — 예전엔 그냥 점선(drag)만 남아 다음 끌기가 버리는 정도였지만 지금은 아니다.
  canvas.addEventListener('pointercancel', () => {
    mode = null; drag = null; handle = null; 잡은손잡이 = null
    붙임선 = []; 붙은값 = { 가로: null, 세로: null }
    그물 = null; draw()
  })

  canvas.addEventListener('pointerup', () => {
    if (mode === '그물') {
      const 친것 = normBox(그물, canvas.width, canvas.height)
      그물 = null
      mode = null
      // 아무것도 안 걸렸으면 «고른 것 없음» 이 맞다 — 빈 데를 긁었는데 옛 선택이
      // 그대로 남으면 그 다음 Del·Ctrl+C 가 엉뚱한 것을 집는다.
      const 걸린것 = 그물에걸린것(boxes, 친것)
      sel = 걸린것[0] ?? null
      여럿 = 걸린것.slice(1)
      draw()
      renderProps()
      return
    }
    if (mode === '도형손잡이') {
      mode = null
      잡은손잡이 = null
      if (moved) { renderProps(); void commit() }
      return
    }
    if (mode === 'draw') {
      const box = normBox(drag, canvas.width, canvas.height)
      drag = null
      mode = null
      // 이 장을 아직 못 읽었으면 지금 있는 boxes 가 어느 장 것인지 알 수 없다.
      // 그대로 저장하면 남의 장 목록을 이 장에 덮어쓴다.
      if (!ready) { failed = 말('탈_장못읽음'); return draw() }
      if (tooSmall(box)) return draw()
      const s = snap()
      // id 는 영숫자만 쓴다 — 장식 PNG 파일 이름에 그대로 들어가고 서버가 그 모양만 받는다.
      // 종류는 KINDS[0] 으로 두고 사람이 그은 뒤 단추로 고른다 — "그은 뒤 종류 고르기".
      const b = { id: `b${Date.now()}${seq += 1}`, kind: 그릴종류, box }
      s.list.push(b)
      sel = b
      draw()
      renderProps()
      save(s.index, s.w, s.h, s.list, s.배경사진)
      return
    }
    if (mode === 'move' || mode === 'resize' || mode === 'rotate') {
      const wasRotate = mode === 'rotate'
      mode = null
      handle = null
      start = null
      끌시작 = []
      // **맞춤 점선은 손을 떼면 지운다.** 남겨 두면 다음에 무엇을 끌든 옛 줄이 떠 있다.
      const 선있었나 = 붙임선.length > 0
      붙임선 = []
      붙은값 = { 가로: null, 세로: null }
      if (선있었나) draw()
      // 돌린 뒤에는 속성 칸의 기울기 숫자도 새로 그려야 한다 — draw() 는 캔버스만 다시 그린다.
      if (wasRotate) renderProps()
      // 클릭만 해서 고르기만 한 것이면(안 끌었으면) 바뀐 게 없으니 저장을 걸지 않는다 —
      // 네모마다 한 번씩 눌러 속성을 볼 텐데, 그때마다 서버에 같은 값을 다시 써 보낼 이유가 없다.
      if (moved) void commit()
    }
  })

  if (keyHandler) document.removeEventListener('keydown', keyHandler)
  keyHandler = (e) => {
    // 설명 칸(또는 글씨체·사진처리 드롭다운)에 타자 치는 중에는 단축키가 아니다 —
    // 이게 없으면 오타를 고치려 Del 을 누른 순간 네모가 지워져 저장되고, Ctrl+Z 는
    // 보고 있지도 않은 마지막 네모를 지우고, 숫자가 든 설명은 한 글자마다 종류가 바뀌어
    // 칸이 통째로 다시 그려지며(반쯤 쓴 글이 날아간다), 화살표는 장을 넘겨 sel 을 지운다.
    // 체크박스(효과·누끼)는 여기서 뺀다 — 텍스트를 안 받으니 막을 이유가 없고, 막으면
    // 체크박스를 누른 뒤 화살표·숫자·Del 이 캔버스를 다시 클릭할 때까지 아무 말 없이
    // 안 먹는 것처럼 보인다.
    const t = e.target
    if (t?.matches?.('select, textarea') || (t?.matches?.('input') && t.type !== 'checkbox')) return
    const n = Number(e.key)
    if (n >= 1 && n <= KINDS.length) return setSelKind(KINDS[n - 1])
    if ((e.key === 'c' || e.key === 'C') && (e.ctrlKey || e.metaKey)) {
      const 고른것 = 고른모두()
      if (!고른것.length) return
      // **베낀 «값» 을 들고 있는다.** 원본을 가리키고 있으면 그새 원본을 고치거나
      // 지웠을 때 붙여넣기가 딴것을 낳는다.
      클립 = 고른것.map((b) => 네모베끼기(b, ''))
      다듬은말 = 말('복사했다', 클립.length)
      renderProps()
      return
    }
    if ((e.key === 'v' || e.key === 'V') && (e.ctrlKey || e.metaKey)) {
      if (!ready || !클립.length) return
      const s = snap()
      const 새것 = 클립.map((b) => 네모베끼기(b, `b${Date.now()}${(seq += 1)}`))
      s.list.push(...새것)
      sel = 새것[0]
      여럿 = 새것.slice(1)
      다듬은말 = 말('붙였다', 새것.length)
      draw()
      renderProps()
      return save(s.index, s.w, s.h, s.list, s.배경사진)
    }
    if (e.key === 'Delete' && 고른모두().length) {
      if (!ready) return
      const s = snap()
      for (const b of 고른모두()) {
        const i = s.list.indexOf(b)
        if (i >= 0) s.list.splice(i, 1)
      }
      sel = null
      여럿 = []
      draw()
      renderProps()
      return save(s.index, s.w, s.h, s.list, s.배경사진)
    }
    if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
      if (!ready) return
      const index = slides[at].index
      const popped = boxes.pop()
      if (popped === sel) { sel = null; renderProps() }
      여럿 = 여럿.filter((b) => b !== popped)   // 지운 게 고른 것이었으면 흔적을 남기지 않는다
      draw()
      return save(index, canvas.width, canvas.height, boxes)
    }
    // ── 화살표 ────────────────────────────────────────────────────────
    // **고른 것이 있으면 네모를 옮기고, 없으면 장을 넘긴다**(파워포인트와 같다,
    // 사람 지시 2026-09-19). 손으로 끌면 아무리 살살 해도 1~2px 씩 튀는데,
    // 화살표는 정확히 1px 이다. 장을 넘기려면 빈 자리를 눌러 고른 것을 푼다.
    //
    // **여기서는 안 붙인다.** 화살표의 뜻이 「딱 이만큼만」 이라서다 — 1px 을
    // 눌렀는데 옆 줄로 붙어 버리면 잘게 맞출 방법이 아예 없어진다.
    const 화살 = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
    if (화살[e.key] && 고른모두().length) {
      if (!ready) return
      // 화면이 같이 스크롤되면 네모가 어디로 갔는지 놓친다.
      e.preventDefault()
      const 걸음 = e.shiftKey ? 10 : 1
      const [ux, uy] = 화살[e.key]
      for (const b of 고른모두()) {
        const 옛 = b.box
        b.box = move(b.box, ux * 걸음, uy * 걸음, canvas.width, canvas.height)
        테두리따라가기(b, 옛)
      }
      draw()
      나중에저장()
      return
    }
    if (e.key === 'ArrowRight' && at < slides.length - 1) { at += 1; return load() }
    if (e.key === 'ArrowLeft' && at > 0) { at -= 1; return load() }
  }
  document.addEventListener('keydown', keyHandler)

  confirmBtn.addEventListener('click', async () => {
    // 줄 서 있는 저장이 확정 뒤에 서버에 닿으면, saveLabels 의 afterEdit 가 '분석 대기'를
    // 도로 지운다(고치면 확정이 풀리는 것과 같은 규칙이라서) — 화면은 확정된 줄 알지만
    // 실제로는 확정이 안 된 채로 남는다. 먼저 끝내고 나서 확정을 보낸다.
    // saving 은 .catch() 뒤에 .then(draw) 가 붙어 있어(위 save() 참고), draw() 안에서
    // 뭔가 던지면 saving 자체가 거절된 채로 끝난다 — 그냥 await 하면 여기서 다시 던져
    // 확정 단추가 조용히 아무 일도 안 하는 것처럼 보인다.
    await saving.catch(() => {})
    // 마지막 저장이 실패한 채면 화면에는 있는 네모가 서버에는 없다 — 그 상태로
    // '분석 대기'를 걸면 파이썬은 화면이 아니라 서버에 남은(더 옛) 라벨을 분석한다.
    if (failed) { confirmFailed = 말('탈_저장실패라확정못함', failed); draw(); return }
    // 단추 하나로 확정↔확정 풀기를 오간다 — 확정 뒤 오타를 봐서 되돌리는 것이
    // 설계가 약속한 동작이다(3-2절 "잘못 눌렀으면 풀 수 있다").
    const on = !confirmed
    const r = await api.confirm(id, on).catch((e) => ({ ok: false, why: e.message }))
    // failed(저장 실패)는 안 건드린다 — 확정이 잘 됐다고 그림이 아직 안 저장됐다는
    // 경고까지 같이 지우면 안 된다(C6).
    confirmFailed = r?.ok ? null : (r?.why || 말('탈_확정못함'))
    if (r?.ok) confirmed = on
    draw()
  })

  분석Btn.addEventListener('click', async () => {
    // 확정과 같은 조심을 그대로 한다 — 줄 서 있는 저장이 뒤에 닿으면 서버에 남은
    // «더 옛» 라벨이 분석된다. 화면은 다 그려 놓고 분석은 옛것을 재는 꼴이다.
    await saving.catch(() => {})
    if (failed) { confirmFailed = 말('탈_저장실패라분석못함', failed); draw(); return }
    분석Btn.disabled = true
    분석Btn.textContent = 말('분석_거는중')
    // **확정을 늘 다시 건다.** 「이 라벨로 해라」와 「지금 재라」를 사람이 두 번 누를
    // 이유는 없지만, 확정(setConfirm)은 상태 칸을 «분석 대기» 로 되돌리는 **유일한**
    // 부름이다 — /api/analyze 는 상태를 안 쓰고, «분석중» 은 Lambda 가 돌아와야 찍힌다.
    // 이미 확정됐다고 건너뛰면, 두 번째로 누른 분석에서 지켜보기가 지난 판의 «분석 끝»
    // 을 그대로 읽어 몇 초 만에 「분석 끝」이라 답한다(실물 검토 2026-09-16).
    // 분석이 도는 중이면 서버가 알아서 막아 준다(setConfirm 의 «분석중» 갈래).
    const c = await api.confirm(id, true).catch((e) => ({ ok: false, why: e.message }))
    if (c?.ok) confirmed = true
    const r = await api.analyze(id).catch((e) => ({ ok: false, why: e.message }))
    confirmFailed = r?.ok
      ? null
      : (r?.why || 말('탈_분석못검'))
    분석Btn.disabled = false
    분석Btn.textContent = 말(r?.ok ? '분석_걸렸다' : '단추_분석하기')
    draw()
    if (r?.ok) {
      const 끝 = await 분석지켜보기({ id, api, onState: (s) => { 분석Btn.textContent = 상태글(s, 언어) || 분석Btn.textContent } })
      if (끝 === '시간 초과') 분석Btn.textContent = 말('분석_오래')
      if (끝 === '분석 끝' || 끝 === '분석 실패') 분석Btn.textContent = 상태글(끝, 언어)
    }
  })

  return load()
}
