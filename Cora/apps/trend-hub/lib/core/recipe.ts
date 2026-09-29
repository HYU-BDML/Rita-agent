import type { Grammar } from './grammar';

/**
 * 만드는 순서의 갈래. **`Grammar.kind` 와 다르다.**
 *
 * `kind` 는 사용자에게 묻는 말(영상 / 사진·카드뉴스 / 글만)이라 셋이다. 그런데 사진으로
 * 나가는 방식 안에서도 「채울 항목을 채우는 것」(입고 정보)과 「비교축을 정하는 것」
 * (비교·투표)은 만드는 순서가 다르다. 묻는 단위를 줄였다고 순서까지 뭉개면 상세 화면이
 * 두루뭉술해진다 — `docs/PROMPT.md` §5 가 금지하는 일반론이 바로 그것이다.
 *
 * 화면은 그대로 하나고 이 블록만 갈린다 (§10-7).
 */
export type RecipeFrame = 'video' | 'copy' | 'info' | 'compare';

/** 방식마다 어느 갈래를 쓰나. `kind` 로 못 가르는 것만 여기서 가른다. */
const FRAME_OF: Record<string, RecipeFrame> = {
  challenge: 'video',
  reaction: 'video',
  randombox: 'video',
  unboxing: 'video',
  derivative: 'video',
  oc: 'video',
  catchphrase: 'copy',
  spend: 'copy',
  pick: 'compare',
  compare: 'compare',
  event: 'info',
  restock: 'info',
};

export function frameOf(g: Pick<Grammar, 'id' | 'kind'>): RecipeFrame {
  return FRAME_OF[g.id] ?? (g.kind === 'photo' ? 'info' : g.kind);
}

/**
 * 만드는 순서 블록의 **부제**. `docs/WORDS.md` §8 의 넷 그대로다.
 *
 * 단계와 피할 것은 여기 없다 — `lib/core/grammar-steps.ts` 가 방식 12개마다 따로 갖는다.
 * 전에는 이 파일이 `frame` 별 템플릿으로 단계를 만들었는데, 그렇게 나온 단계는 근거를 한
 * 줄도 열지 않고 쓸 수 있는 글쓰기 조언이었다. 틀이 네 개면 방식 열두 개가 네 종류의
 * 조언을 나눠 갖고, 그 조언은 아무 데이터도 안 가리킨다.
 */
export interface Recipe {
  /** 이 틀이 무엇을 정해 주는지. 왼쪽 큰 제목 아래 작은 글씨. */
  frame: string;
}

export const RECIPES: Record<RecipeFrame, Recipe> = {
  video: { frame: '첫 3초 / 장면 흐름 / 길이' },
  copy: { frame: '문구 골격 / 피할 표현' },
  info: { frame: '채울 항목 체크리스트' },
  compare: { frame: '비교축 / 항목 수' },
};

/* 단계는 방식마다 다르다. 부르는 쪽이 한 군데서 다 받게 여기서 다시 내보낸다. */
export { STEPS, stepsOf } from './grammar-steps';
export type { GrammarSteps, Step } from './grammar-steps';

/**
 * 어디까지 써도 되나 — **3단**.
 *
 * "안전합니다"라고 쓰지 않는다. 권리자·문의처·확인이 필요한 구간까지만 말한다.
 * 법률 자문이 아니다.
 *
 * `lib/collect/rights.ts` 의 `basis` 를 여기 끌어오지 않는다. 그건 **이미지 생성 제약**
 * 이다(변수명 `promptBasis`) — `reference_required` 는 "AI 가 외형을 지어내면 안 됨"이라는
 * 뜻이고 법적 사용 가능 여부가 아니다. 그대로 쓰면 틀린 말을 하게 된다.
 */
export interface ScopeRow {
  where: string;
  verdict: string;
  detail: string;
  /** 걸림이 없는 칸만 초록이다. 나머지는 확인이 필요한 칸이다. */
  clear: boolean;
}

export const SCOPE: ScopeRow[] = [
  {
    where: '과제·발표',
    verdict: '가능',
    detail: '학교가 수업목적 보상금을 냅니다 (저작권법 제25조). 일부만 쓸 수 있습니다',
    clear: true,
  },
  {
    where: '개인 공개 계정',
    verdict: '예외 밖',
    detail: '공중송신이라 수업 목적을 벗어납니다. 권리자 확인이 필요합니다',
    clear: false,
  },
  {
    where: '브랜드·상업',
    verdict: '라이선스 필요',
    detail: '권리자와 사용 범위를 확인하세요. 안전 여부는 판단해 드리지 않습니다',
    clear: false,
  },
];
