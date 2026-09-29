/**
 * 공통 후보(Candidate) — 이 앱의 유일한 계약.
 *
 * 판정기(발굴기)가 무엇이든 이 모양으로 내놓고, 생성기는 이 모양만 먹는다.
 * 그래서 판정기를 늘려도 생성기를 안 건드리고, 생성기를 늘려도 판정기를 안 건드린다.
 *
 * 필드는 Dify 워크플로우 두 개가 이미 각자 만들어 둔 것에서 그대로 뽑았다.
 *   소재 찾기 for_next  : 고른_주제 · 판정 · 최근_대_평소 · 작년_대비 · 다룬_매체수 · 한_줄_까닭 · 근거_링크 · 따라만들_본보기
 *   캐릭터 발굴 profile : name · why_trending · tone · content_angle · image_prompt · motion_prompt · prompt_basis
 * 어휘가 달랐을 뿐 뼈대가 같았다.
 */

import type { MemeSafety } from '../collect/meme-safety';
import type { Lineage } from '../collect/lineage';

/** 판정하는 단위. 판정기마다 다르다. */
export type CandidateUnit =
  | 'topic'    // 주제      — 소재 찾기.   "이 주제로 들어가도 되나"
  | 'subject'  // 대상/IP   — 캐릭터 발굴. "이 캐릭터를 써도 되나"
  | 'format';  // 포맷      — 벤치마크.    "어떻게 만들어야 하나"

/** 근거 한 줄. 링크가 없으면 근거가 아니다. */
export interface Evidence {
  source: string;   // 출처 (연합뉴스 / instagram / youtube …)
  title: string;
  url: string;
  /** 기사·게시물 대표 이미지. 없으면 이미지 없이 링크만 보존한다. */
  thumbnailUrl?: string;
  note?: string;    // 왜 쓸모있나
  /**
   * 이 근거가 **수집 회차가 아니라 추적으로** 붙은 것인가.
   *
   * 재정규화는 저장된 원본에서 후보를 다시 세운다. 원본에 없는 근거는 그때 사라지는데,
   * 추적이 모아 온 기사가 바로 그렇다 — 2026-09-22 재정규화 한 번에 다섯 건이 날아갔다.
   * 표시가 있어야 다시 세울 때 그것만 골라 남길 수 있다.
   */
  via?: 'tracking';
  metric?: string;  // 숫자 (조회 12만 / 구독대비 8.3배 …)
  /**
   * 제목 밑의 본문. 기사 요약이나 게시물 캡션이다.
   *
   * 없어도 되는 칸이 아니다 — 이게 비면 원고를 쓰는 LLM 이 **헤드라인만 보고** 쓴다.
   * 실제로 그랬다: 수집은 기사 요약 400자·게시물 본문 280자까지 해 두고 제목만
   * 넘기고 있었다. 링크는 사람이 눌러 볼 때나 열리지, 생성기는 못 읽는다.
   */
  excerpt?: string;
}

/**
 * 추이. 판정기마다 근거로 삼는 축이 달라서 전부 optional 이다.
 * 없는 축을 0 으로 채우지 않는다 — "0" 과 "안 쟀음" 은 다르다.
 */
export interface Momentum {
  surge?: number | null;       // 최근 대비 평소   (소재 찾기)
  yoy?: number | null;         // 작년 대비        (소재 찾기)
  mediaCount?: number | null;  // 다룬 매체 수     (소재 찾기)
  accounts?: number | null;    // 언급 계정 수     (캐릭터)
  platforms?: string[];        // 나온 플랫폼      (캐릭터)
  growth?: number | null;      // 회차 대비 증가율 (캐릭터 delta)
  subRatio?: number | null;    // 구독 대비 배수   (벤치마크)
  views?: number | null;       // 조회 합계        (캐릭터 발굴)
  extra?: Record<string, string | number | null>;
}

/**
 * 권리. 이 앱의 차별점이라 후보에 1급 필드로 둔다.
 *
 * basis 가 생성 가능 여부를 가른다 — 캐릭터 발굴 profile 의 prompt_basis 를 그대로 쓴다.
 *   source_grounded    : 자료에 시각 근거가 있음. 그대로 생성 가능
 *   reference_required : 외형을 지어내면 안 됨. 공식 레퍼런스를 물려야만 생성
 *   none               : 생성 불가. 기획까지만
 *   not_applicable     : 권리 판정 대상이 아님 (주제 후보 등)
 */
export interface Rights {
  basis: 'source_grounded' | 'reference_required' | 'none' | 'not_applicable';
  ownership?: 'individual' | 'corporate' | 'disputed' | 'unknown';
  confidence?: number;
  note?: string;
}

/** 따라 만들 본보기. 벤치마크 판정기가 후보에 붙인다. */
export interface Reference {
  title: string;
  channel?: string;
  url: string;
  subs?: number | null;
  views?: number | null;
  subRatio?: number | null;
  durationSec?: number | null;
  takeaway?: string;   // 무엇이 달랐나
}

/** 제작 힌트. 생성기가 사람에게 다시 묻지 않으려고 존재하는 필드들. */
export interface ProductionHint {
  angle?: string;           // 콘텐츠 각도 (content_angle / 한 줄 까닭)
  tone?: string;
  features?: string;        // 확인된 특징
  imagePrompt?: string;
  motionPrompt?: string;
  negativePrompt?: string;
  references?: Reference[]; // 벤치마크가 붙임
}

export type ReviewState = 'pending' | 'adopted' | 'rejected' | 'held';
/**
 * 후보가 목록에서 어디에 있나.
 *
 *   active    지금 표에 있다
 *   archived  사람이 보관해 추적 중이다. **여기 있는 것은 절대 자동으로 안 내린다**
 *   retired   회차가 더 이상 안 물어와 내려갔다. 지우는 게 아니라 내리는 것이다
 *
 * `retired` 가 없던 때는 후보가 사라지는 길이 사람 손뿐이었다. 회차 31번에 196건이
 * 쌓였고 그중 195건이 손도 안 댄 채였다 — 지난주 뉴스가 오늘 소재인 척 같은 줄에 앉았다.
 *
 * **지우지 않는 이유**: 관측 이력은 후보 행이 아니라 스냅샷에 있다(`allTrends`).
 * 행을 지우면 다음에 같은 이름이 다시 잡혔을 때 "예전에 떴었다"를 못 말한다.
 * 내려만 두면 이름으로 다시 찾아 되살릴 수 있고 점도 그대로 이어진다.
 */
export type CandidateLifecycle = 'active' | 'archived' | 'retired';

export interface CandidateTracking {
  enabled: boolean;
  queries: string[];
  lastCheckedAt?: string;
  nextCheckAt?: string;
}

export interface Origin {
  discoveryId: string;  // 어느 판정기가 낳았나
  runId: string;        // 어느 회차
  runAt: string;        // ISO
  /**
   * 목(가짜) 데이터로 만들어진 후보인가.
   *
   * 키가 없는 판정기는 목으로 도는데, 그렇게 만들어진 후보가 진짜와 같은 표에
   * 섞이면 구분이 안 된다. 가짜를 보고 판단하는 것보다 나쁜 건 없으므로 후보에 박아 둔다.
   */
  mock?: boolean;
}

export interface Candidate {
  id: string;
  unit: CandidateUnit;

  subject: string;       // 대상 — 캐릭터명 또는 주제
  aliases?: string[];

  verdict: string;       // 판정 한 줄 ("지금 오르는" / "창작자 주도" …)
  why: string;           // 왜 그렇게 봤나 한 줄
  /**
   * 수집한 게시물 본문의 요약 — **무슨 내용인가**. `why` 와 칸이 다르다.
   *
   *   why      묻는 것: 왜 지금 뜨나    만드는 곳: rights.ts (판정기)
   *   summary  묻는 것: 무슨 내용인가   만드는 곳: summaries.ts (본문 요약)
   *
   * 재료가 없으면 **칸 자체가 없다.** 빈 문자열을 넣지 않는다 — 계약 JSON 에서
   * `images[role=material]` 과 같은 규칙이다. 여기에 `why` 를 넣지 말 것.
   */
  summary?: string;
  /** 근거가 부족하면 숨기지 않고 이 플래그로 드러낸다. 두 워크플로우 모두 이 개념을 갖고 있었다. */
  grounded: boolean;

  /**
   * 안전 판정 (밈 축, 2026-09-19). **권리가 아니라 안전이다.**
   *
   * 캐릭터는 `rights` 가 "만들면 안 되는 것"을 가리는데, 밈은 권리 문제가 아니라
   * 사람이 다친 사건·자해·성적 표현이 얽히는 문제라 그 자리를 이 칸이 맡는다.
   *
   * 3단이다 — `blocked`(명확히 위험) · `flagged`(애매, 표시만) · `ok`.
   * **애매하면 막지 않고 표시한다.** 블랙 코미디를 자해로 오판하는 일이 제일 흔하고,
   * 막아서 잃는 것이 표시해서 잃는 것보다 크다.
   */
  safety?: MemeSafety;

  /**
   * 출신 — **어디서 온 캐릭터인가** (애니·만화 / 게임 / 브랜드 / 자캐 / 모름).
   *
   * 이름이 `origin` 이 아닌 이유: 그 칸은 이미 **어느 회차가 낳았나**를 쓰고 있다.
   * `rights` 와도 다르다 — 출신은 "어디서 왔나", 권리는 "누구 것인가"다.
   * 그래서 갈래 이름도 `개인 창작` 이 아니라 `자캐` 다.
   *
   * `basis:'지식'` 은 자료에 없고 모델이 아는 것이라는 뜻이라, 화면에서 "추정"이 붙는다.
   */
  lineage?: Lineage;

  momentum: Momentum;
  evidence: Evidence[];
  rights: Rights;
  hint: ProductionHint;

  review: ReviewState;
  reviewNote?: string;
  /** 사람이 내린 검토 결과와 별개로, 현재 운영 목록에 보일지 결정한다. */
  lifecycle: CandidateLifecycle;
  /** 보관된 소재를 다음 자동 분석에서 다시 찾기 위한 추적 상태. */
  tracking?: CandidateTracking;

  /**
   * 회차가 돌았는데 이 후보를 못 물어온 날 수 (`lib/core/retire.ts`).
   *
   * 회차가 아니라 **날**로 센다. 같은 날 세 번 돌리면 미포착도 세 번이 되는데,
   * 그러면 손으로 몇 번 눌러 본 것만으로 멀쩡한 후보가 내려간다.
   */
  misses?: number;
  /** 미포착을 마지막으로 센 날 (YYYY-MM-DD, KST). 같은 날 두 번 세지 않으려고 둔다. */
  missDay?: string;
  /** 내려갔다가 다시 잡힌 날. 있으면 화면에 '다시 잡힘'을 단다 — 드문 일이라 신호가 세다. */
  revivedAt?: string;

  origin: Origin;
  /** 정규화 전 원본. 판정기 규칙을 고친 뒤 다시 정규화할 때 쓴다 (API 재호출 없이). */
  raw?: unknown;
}
