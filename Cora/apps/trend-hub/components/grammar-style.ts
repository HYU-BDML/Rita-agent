/**
 * 방식 화면의 색 한 벌.
 *
 * 목업(`docs/ui/*.html`)이 쓴 값을 그대로 옮긴다. `globals.css` 의 `--rita-ink`(#15163a)
 * 와 몇 단계 다른데, 목업 세 장이 한 톤으로 맞춰져 있어 여기서 끌어다 쓰면 카드 테두리와
 * 히어로의 관계가 어긋난다. 방식 화면 셋만 이 벌을 공유한다.
 *
 * `globals.css` 에 넣지 않은 까닭: 이 색들은 **아직 확정이 아니다**. 화면 문구와 함께
 * 사람이 정할 몫이라(`docs/HANDOVER.md` §6-1) 전역 토큰으로 굳히지 않는다.
 */
export const HERO = '#1B1B3A';
export const STEP_BG = '#26264C';
export const SUB = '#C9C7E8';
export const INK = '#14142B';
export const BODY = '#3A3A5C';
export const MUTED = '#5A5978';
export const FAINT = '#8B89A6';
export const ACCENT = '#6C5CE0';
export const LINKC = '#4C3FBF';
export const CARD_LINE = '#E4E2F4';
export const INNER_LINE = '#EFEDF7';
export const CHIP_LINE = '#DCDAF0';
export const OFF_BG = '#F0EFF6';
export const OFF_LINE = '#E8E6F2';
export const OFF_INK = '#A5A3BC';
export const CHIP_INK = '#2A2A4A';
export const WARN = '#8A3009';
export const WARN_LINE = '#B4530A';
export const OK = '#14563F';
export const OK_LINE = '#1E7A5A';

/**
 * 카드·상세의 작은 배지. 확정 아님 (`docs/PROMPT.md` §12-1).
 *
 * 질문 1 의 「사진·카드뉴스」는 배지에서 「카드뉴스형」으로 줄여 쓴다 (`docs/WORDS.md` §6).
 * 배지는 카드 위 작은 글자라 여덟 자가 들어가지 않는다.
 */
export const KIND_LABEL = {
  video: '영상형',
  photo: '카드뉴스형',
  copy: '카피형',
} as const;

/**
 * 「뭘로 만들 거예요?」 의 답. 칩에 붙는 이유도 이 낱말이다.
 *
 * 배지(`KIND_LABEL`)와 다르다. 사용자가 고르는 것은 결과물이라 「영상」이고, 카드에
 * 붙는 분류는 「영상형」이다. 목업이 둘을 나눠 쓴다.
 */
export const KIND_ASK = {
  video: '영상',
  photo: '사진·카드뉴스',
  copy: '글만',
} as const;

/**
 * 카드 묶음 제목 — 질문 1 의 답에 따라 바뀐다 (`docs/WORDS.md` §4).
 *
 * **조사를 붙여 계산하지 않고 문장째 적는다.** 「영상」은 받침이 있어 `으로`, 「사진·
 * 카드뉴스」는 받침이 없어 `로`, 「글」은 받침이 ㄹ 이라 `으로`가 아니라 `로` 다. 규칙이
 * 셋으로 갈리는데 그걸 코드로 고르면 낱말이 하나 늘 때마다 틀린다.
 *
 * 「글만」은 제목에서 「글」로 쓴다 — 「글만으로 만들 수 있는」은 "이것만으로도 된다"로
 * 읽혀서 묶음 제목이 아니라 변명처럼 들린다.
 */
const TITLE: Record<keyof typeof KIND_ASK, string> = {
  video: '영상으로 만들 수 있는 방식',
  photo: '사진·카드뉴스로 만들 수 있는 방식',
  copy: '글로 만들 수 있는 방식',
};

/** 아직 안 골랐을 때. 12개가 다 나오는 상태다. */
export const NO_FORM_TITLE = '지금 할 수 있는 방식';

export function boardTitle(form?: keyof typeof KIND_ASK): string {
  return form ? TITLE[form] : NO_FORM_TITLE;
}
