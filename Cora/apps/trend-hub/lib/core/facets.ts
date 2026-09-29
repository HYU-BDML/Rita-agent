import type { Candidate } from './candidate';
import type { Axis } from './axis';
import { axisOf } from './axis';
import { isNewsCategory, NEWS_CATEGORIES } from '../collect/news-category';
import type { FormatKind } from '../collect/formats';

/**
 * 축 안의 한 단 — **같은 축 안에서 무엇으로 또 가르나.**
 *
 * 축마다 이미 답이 있었는데 화면마다 따로 들고 있었다. 뉴스는 갈래(`/issues`),
 * 캐릭터는 권리·계보(`/characters`), 포맷은 종류(`/memes`). 홈에서도 같은 것으로
 * 가르려면 규칙이 한 곳에 있어야 한다 — 두 군데 두면 홈과 축 화면이 다른 수를 센다.
 *
 * 캐릭터는 **권리**로 가른다. 계보(애니·게임·브랜드·자캐)도 있지만, 만들지 말지를
 * 정하는 것은 권리 쪽이다. 계보는 축 화면에 그대로 남는다.
 */

const FORMAT_LABEL: Record<FormatKind, string> = {
  challenge: '챌린지',
  format: '유행 형식',
  catchphrase: '유행어·말',
  ambiguous: '기타',
};

const RIGHTS_LABEL: Record<string, string> = {
  corporate: '기업 IP',
  individual: '개인 창작',
  disputed: '권리 분쟁',
};

/**
 * 못 가린 것이 가는 칸. 분류기가 "어디에도 안 들어간다"고 답한 것과 **같은 칸에 담는다**
 * (2026-09-22 사용자 결정). 둘을 갈라 `미분류`·`확인 필요`로 따로 두면 화면에 비슷한 말이
 * 늘어서 무엇이 다른지 읽는 데 품이 든다. 안에서는 여전히 갈라져 있다 —
 * 뉴스는 raw.category 가 있는지로, 캐릭터는 rights.ownership 이 있는지로 알 수 있다.
 */
export const OTHER = '기타';

export const FACETS: Record<Axis, readonly string[]> = {
  // NEWS_CATEGORIES 가 이미 '기타' 를 갖고 있다. 두 번 넣지 않는다.
  issue: NEWS_CATEGORIES,
  character: ['기업 IP', '개인 창작', '권리 분쟁', OTHER],
  meme: ['챌린지', '유행 형식', '유행어·말', OTHER],
};

/** 축 이름과 함께 쓰는 말. 칩 위에 붙여 무엇으로 가르는지 알린다. */
export const FACET_NAME: Record<Axis, string> = {
  issue: '갈래',
  character: '권리',
  meme: '종류',
};

export function facetOf(c: Candidate): string {
  switch (axisOf(c)) {
    case 'issue': {
      const raw = c.raw;
      if (raw && typeof raw === 'object' && 'category' in raw) {
        const value = (raw as { category?: unknown }).category;
        if (isNewsCategory(value)) return value;
      }
      return OTHER;
    }
    case 'character':
      return RIGHTS_LABEL[c.rights?.ownership ?? ''] ?? OTHER;
    case 'meme': {
      const raw = c.raw;
      if (raw && typeof raw === 'object' && 'kind' in raw) {
        const value = (raw as { kind?: unknown }).kind;
        if (typeof value === 'string' && value in FORMAT_LABEL) {
          return FORMAT_LABEL[value as FormatKind];
        }
      }
      return FORMAT_LABEL.ambiguous;
    }
  }
}

/** 이 축에 있는 칸인가. 주소창으로 들어온 값을 그대로 믿지 않는다. */
export function isFacet(axis: Axis, value: unknown): value is string {
  return typeof value === 'string' && FACETS[axis].includes(value);
}
