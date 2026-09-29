import type { GrammarEvidence, GrammarWithEvidence } from './grammar';
import type { PostRecord } from './post-record';
import { observedDay } from './day';

/**
 * 브리프 한 장에 들어가는 값.
 *
 * **전부 계산값이다.** 화면에 숫자를 문자열로 적지 않는다 — db 가 계속 바뀐다.
 * 권루트챌린지 하나가 하룻밤에 게시물 34건에서 48건이 됐고 최고 조회와 계정 수가 함께
 * 움직였다. 적어 두면 그 다음 날부터 화면이 틀린 값을 말한다.
 *
 * **추이를 내지 않는다.** 주별 기울기나 상승·하락 표시를 만들지 않는다. 수집 회차가
 * 과거 2주까지만 닿아서 그보다 오래된 주는 무조건 낮게 나온다 — 그리면 무엇이든 전부
 * 상승으로 보인다. 관측이 열흘뿐인 데이터로 예측을 말하지 않는다.
 */
export interface Weekly {
  /** 기준일 (KST). 신선도를 언제 기준으로 잰 값인지. */
  asOfDay: string;
  /** 관측일 수. 회차 수가 아니라 날 수다. */
  days: number;
  /** 근거 합집합. 같은 게시물은 방식이 달라도 한 건이다. */
  sources: number;
  /** 이번 주 방식 하나. 근거가 가장 많은 것, 동점이면 신선도 높은 쪽. */
  top: GrammarWithEvidence;
  /** 그 방식의 근거 중 최고 조회 한 건. */
  lead: GrammarEvidence;
  /** 그 방식에 글을 올린 고유 계정 수. */
  accounts: number;
  /**
   * 그 방식 게시물 조회수의 하위 25% 값.
   *
   * 평균이 아니라 하위 사분위를 낸다. 최고 조회 한 건만 보면 "이 방식은 천만이 나온다"로
   * 읽히는데, 같은 방식으로 올린 넷 중 하나는 이 값을 넘지 못했다. 넓게 퍼진 것과 내가
   * 올려서 될 것은 다른 이야기다.
   *
   * **조회수가 붙은 게시물이 10건 미만이면 `null` 이다.** 표본이 적을 때 나오는 사분위는
   * 한 건만 달라도 크게 튄다 — `freshness` 가 10건 미만을 `null` 로 내는 것과 같은 이유다.
   */
  p25: number | null;
}

/** 이 미만이면 사분위를 내지 않는다. */
export const P25_MIN_POSTS = 10;

/** 오름차순으로 놓고 하위 4분의 1 자리. */
function quartile(values: number[]): number | null {
  if (values.length < P25_MIN_POSTS) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.25)];
}

/**
 * 이번 주 한 장.
 *
 * 근거가 하나도 없으면 `null` 이다 — 부르는 쪽이 빈 상태 문구를 낸다. 억지로 채우거나
 * 얇은 방식을 끌어올리지 않는다.
 */
export function weekly(
  grammars: GrammarWithEvidence[],
  posts: PostRecord[],
  asOf: string,
  runAts: string[],
): Weekly | null {
  const withEvidence = grammars.filter((g) => g.evidence.length > 0);
  if (!withEvidence.length) return null;

  /* 근거가 가장 많은 것. 동점이면 신선도 높은 쪽. 신선도를 모르는 것은 뒤로. */
  const top = [...withEvidence].sort(
    (a, b) => b.evidence.length - a.evidence.length || (b.freshness ?? -1) - (a.freshness ?? -1),
  )[0];

  const lead = [...top.evidence].sort((a, b) => (b.topViews ?? 0) - (a.topViews ?? 0))[0];

  const ids = new Set(top.evidence.map((e) => e.candidateId));
  const mine = posts.filter((p) => ids.has(p.candidateId));

  return {
    asOfDay: observedDay(asOf),
    days: new Set(runAts.map(observedDay)).size,
    sources: new Set(grammars.flatMap((g) => g.evidence.map((e) => e.url))).size,
    top,
    lead,
    accounts: new Set(mine.map((p) => p.accountId || p.account).filter(Boolean)).size,
    p25: quartile(
      mine.map((p) => p.views).filter((v): v is number => typeof v === 'number' && v > 0),
    ),
  };
}
