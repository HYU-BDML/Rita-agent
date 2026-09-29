/**
 * 계약 JSON — 카드뉴스 Agent(타인 개발)에게 넘기는 유일한 출구.
 *
 * 지시서 P1. 상대 개발자의 요구는 한 줄이었다:
 *   "트렌드분석으로 받을 거는 이미지랑 관련 내용입니다."
 * 그래서 **대본을 쓰지 않는다.** 카드 문구도 만들지 않는다. 원재료만 넘긴다.
 *
 * 재료 하나에 출구 둘이다 — 이 모양이 그대로 사람이 읽는 줄글의 재료이기도 하다.
 * summary 를 두 곳에서 따로 만들지 말 것.
 *
 * ── 필드 이름의 출처 ────────────────────────────────────────────────
 * 바깥(TrendBrief)은 지시서 P1 초안 그대로다. 상대 개발자가 이미 본 모양이라 바꾸지 않았다.
 * 안(BriefTopic)은 레이더 레코드의 칸 이름에 맞췄다. 대응은 이렇다.
 *
 *   레이더            BriefTopic        Candidate
 *   name              title             subject
 *   verdict           verdict           verdict
 *   trend_why         why_now           why
 *   evidence          sources[]         evidence[]
 *   ownership         rights.ownership  rights.ownership
 *   caveat            rights.note       rights.note
 *
 * 2026-09-17 확정. 세 가지가 '레이더'로 불리는데 단위가 다르다 —
 * `trends.json`(트렌드 하나) · `radar.ts`(그 출력을 읽음) · 교수님 레이더(영상 1편).
 * 여기 칸 이름은 **`trends.json` 에 맞춘 것**이고 단위가 같아서 맞다.
 * 교수님 레이더 항목(첫 3초·장면 흐름·화면 글자·받아쓰기)은 단위가 달라 최상위에 못 섞는다.
 * 나중에 `video_analysis` 하위로 들어간다 — P4.
 */
import type { Candidate } from './candidate';
import type { PostRecord } from './post-record';
import { firstObservedAt, postingSeries } from './series';
import { axisOf } from './axis';

/** 어느 갈래를 돌렸나. 지시서 6-2 — 배타가 아니다. 복수로 걸릴 수 있다. */
export type BriefScope = 'issue' | 'character' | 'meme';

/**
 * 이미지 한 장.
 *
 * `evidence` 는 실제 원본(증거), `material` 은 생성물(카드에 얹을 소재).
 * 상대가 템플릿 어디에 놓을지 판단하는 데 이 구분이 필요하다.
 *
 * **2026-09-17 현재 `material` 은 나오지 않는다.** 이미지 생성 API 를 부르지 않기로 했다.
 * 없을 때는 **항목 자체가 빠진다.** `url: ""` 를 넣지 않는다 — 상대가 깨진 이미지를 그리게 된다.
 * 키가 들어오면 항목이 추가될 뿐, 아래 칸은 하나도 바뀌지 않는다.
 */
export interface BriefImage {
  role: 'evidence' | 'material';
  type: 'thumbnail' | 'generated';
  url: string;
  /** 이 이미지가 실린 게시물·기사 주소. 출처를 댈 때 쓴다. */
  source_url?: string;
  platform?: string;
  /** role=material 일 때만. 무슨 프롬프트로 만들었나. */
  prompt?: string;
}

/** 근거 한 줄. 링크가 없으면 근거가 아니다 (Evidence 와 같은 규칙). */
export interface BriefSource {
  source: string;
  title: string;
  url: string;
  /** 제목 밑의 본문. 이게 비면 상대가 헤드라인만 보고 대본을 쓴다. */
  excerpt?: string;
  metric?: string;
}

/** 시간축 한 점. 지시서 P5 — 소급으로 만든 점과 실측한 점을 섞지 않는다. */
export interface TrendPoint {
  /** 그 달의 첫날 (`YYYY-MM-01`). 한 점은 하루가 아니라 **한 달**이다. */
  at: string;
  /** 그 달에 올라온 게시물 편수. 조회수가 아니다. */
  value: number;
  /**
   * true = 우리가 보기 전 구간(소급). 검색이 건져 준 **표본**이라 그 달의 실제
   * 게시량이 아니다. 화면에서 점선으로 그린다. false = 보는 동안 쌓인 구간.
   */
  estimated: boolean;
}

export interface BriefMetrics {
  /** 조회 합계. 안 쟀으면 null. **0 으로 채우지 않는다** — "0" 과 "안 쟀음" 은 다르다. */
  views: number | null;
  accounts: number | null;
  /*
   * 2026-09-17 `scale`·`direction` 을 뺐다. **영구히 null 이었다.**
   * 읽던 키(`momentum.extra['규모']`·`['구간']`)는 레이더 쪽 이름인데 캐릭터·뉴스
   * 판정기는 그 칸을 안 만든다(있는 건 조회합계·확인된자리·계정명일치뿐). 상대는 빈 칸을
   * "아직 안 온 것"으로 읽고 기다리게 된다.
   *
   * 되살리지 말 것. 같은 날 `momentum.views` 기반 direction 을 **못 재는 축이라 껐다**
   * (`comparableAcrossRuns`). 계약에 같은 이름의 칸만 남기면 앞뒤가 안 맞는다.
   * 줄 판단 재료는 따로 있다 — 교차 확인 라벨과 판정 등급.
   */
  /**
   * 월별 게시 편수 (지시서 P5, 2026-09-18 붙음). 한 점이 한 달이다.
   * 게시물 레코드가 없는 후보는 빈 배열 — 0 으로 채운 점을 만들지 않는다.
   */
  trend: TrendPoint[];
  /**
   * 이 주제를 처음 본 날 (`YYYY-MM-DD`, KST). 이 왼쪽이 소급, 오른쪽이 관측 구간이다.
   * 점이 월 단위라 경계가 달 한가운데 떨어질 수 있어 날짜를 따로 싣는다.
   * trend 가 비면 이 칸도 없다.
   */
  observed_from?: string;
}

/**
 * 권리 표시. **차단 조건이 아니라 참고 표시다** (지시서 3-3).
 * 교육 목적 배포이므로 corporate 가 "제작 불가" 로 읽히면 안 된다.
 */
export interface BriefRights {
  ownership: 'individual' | 'corporate' | 'disputed' | 'unknown' | null;
  /** 외형을 그릴 때 공식 레퍼런스를 물려야 하는가. */
  reference_required: boolean;
  note?: string;
}

/**
 * 영상 1편 분석 (교수님 레이더의 6항목). Gemini 가 YouTube URL 을 직접 읽어 채운다.
 *
 * **최상위가 아니라 여기 하위로 들어간다.** 단위가 다르다 —
 * `BriefTopic` 은 트렌드 하나이고 이것은 영상 한 편이다.
 * 키가 없거나 분석하지 않았으면 **칸 자체가 없다.** 빈 객체를 넣지 않는다.
 */
export interface BriefVideoAnalysis {
  url: string;
  first_3s: string;
  /** 장면 흐름 6단계. `at` 은 MM:SS. */
  beats: { at: string; what: string }[];
  why_it_worked: string;
  how_to_apply: string;
  /** 화면 글자. Gemini 문서가 보장하지 않는 항목이라 빈 배열일 수 있다. */
  on_screen_text: string[];
  /** 받아쓰기. 위와 같다. */
  transcript: string;
}

export interface BriefTopic {
  id: string;
  scope: BriefScope;
  title: string;
  /**
   * 수집한 본문들의 요약. **재료가 없으면 칸 자체가 없다.**
   *
   * 2026-09-17 까지 여기에 `Candidate.why` 를 넣고 있었는데 그건 요약이 아니라
   * `why_trending` 이다(`character-native.ts:192`). 재료가 얇은 후보는 그 자리에
   * 판정기 메모가 들어앉았고, 그게 로빈 카드 6장에 "독립 출처는 확인되지 않았습니다"로
   * 박혔다. 넘길 물건에 판정 메모가 들어가면 안 된다.
   *
   * 2026-09-18 본문 요약 경로가 붙었다 (`lib/collect/summaries.ts`). 요약이 있는 후보만
   * 이 칸이 생긴다. 빈 문자열을 넣지 않는 건 `images[role=material]` 과 같은 규칙이다 —
   * 상대가 "여기 요약이 있다"고 믿고 템플릿에 꽂는 것이 빈 칸보다 나쁘다.
   * 요약이 없는 후보는 그 경로가 생기기 전에 수집된 회차이거나, 본문에 적을 내용이 없던 것이다.
   */
  summary?: string;
  /**
   * 왜 지금인가 (레이더 `trend_why` = `Candidate.why` = rights 의 `why_trending`).
   *
   * **`hint.angle` 이 아니다.** 2026-09-17 까지 angle 을 먼저 읽고 있었는데 그건 콘텐츠
   * 각도이고 꼬리에 사용 제약이 붙는다 — 로빈 값이 "안내 범위 내에서만 다룰 수 있음"이었다.
   * 위 대응표(`trend_why → why_now → why`)가 처음부터 맞았고 코드가 어긋나 있었다.
   *
   * 판정기 메모거나 비어 있으면 **칸을 뺀다.** summary 와 같은 규칙이다.
   */
  why_now?: string;
  /**
   * 사람이 한 번 보라는 표시 (밈 축). **금지가 아니다.**
   * 블랙 코미디·자조·과장처럼 판단이 갈릴 만한 것에 붙는다.
   * 명확히 위험한 주제는 이 칸이 붙는 대신 **아예 나가지 않는다.**
   */
  safety_note?: string;
  verdict: string;
  images: BriefImage[];
  sources: BriefSource[];
  metrics: BriefMetrics;
  rights: BriefRights;
  /**
   * 이 주제를 대표하는 영상 1편의 분석. 붙였을 때만 칸이 생긴다.
   * 상대는 여기서 '첫 3초'와 '장면 흐름'을 가져가 대본 구조를 잡는다.
   */
  video_analysis?: BriefVideoAnalysis;
}

export interface TrendBrief {
  /** 어느 갈래가 돌았나. 분류가 틀렸을 때 사용자가 알아채야 한다 (지시서 6-2). */
  scope: BriefScope[];
  query: { field: string; sources: string[] };
  generatedAt: string;
  /** **0~3 가변.** 근거가 부족하면 적게 반환하고 note 에 이유를 쓴다. 3안을 억지로 채우지 않는다. */
  topics: BriefTopic[];
  /** 왜 이만큼인가, 무엇이 아직 안 오는가. 상대가 "안 온 것"과 "원래 없는 것"을 구분해야 한다. */
  note: string;
}

/* ── 변환 ──────────────────────────────────────────────────────────── */

/** 어느 판정기가 낳았나로 갈래를 정한다. 지시서 6-2 의 분류기가 붙기 전까지의 임시 규칙. */
/**
 * 계약의 갈래. **화면과 같은 규칙을 쓴다** (`lib/core/axis.ts`).
 *
 * 2026-09-19 까지 여기 규칙이 따로 있었고, `unit === 'topic'` 이면 밈으로 떨어뜨렸다.
 * 그래서 레이더가 낳은 주제(`kind` 가 '사건'이 아닌 것)가 전부 `meme` 으로 나갔다 —
 * 밈이 아니라 주제인데. 판정기로 가르면 그런 일이 없다.
 */
function scopeOf(c: Candidate): BriefScope {
  return axisOf(c);
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s : null;
}

/**
 * 판정기가 "쓸 말이 없다"고 적어 둔 문장. 요약도 까닭도 아니라 **메모**다.
 *
 * `rights.ts` SYSTEM 이 `trend_grounded=false` 일 때 `why_trending` 에 이 문장을 그대로
 * 쓰라고 지시한다(85줄). 실제로 캐릭터 후보 27건 중 9건이 이 문장이고, 10건은 아예 빈
 * 문자열이다. 계약으로 내보내면 상대가 이걸 본문인 줄 알고 카드에 박는다 — 실제로 박혔다.
 *
 * `grounded` 로는 못 가른다. 뉴스 후보도 `grounded=false` 인데 `why` 는 "교육부가 구제
 * 414건 인정…"이라는 멀쩡한 문장이다. 거르는 건 플래그가 아니라 이 문장 자체다.
 */
const JUDGE_MEMOS = ['최근 확산 원인을 단정할 독립 출처가 부족함'];

/** 내보낼 만한 말인가. 비었거나 판정 메모면 칸을 만들지 않는다. */
function usable(v: unknown): string | null {
  const t = str(v);
  return t && !JUDGE_MEMOS.includes(t) ? t : null;
}

/**
 * 후보 하나를 계약 한 항목으로 옮긴다. **API 를 부르지 않는다.** 있는 값만 옮긴다.
 *
 * 이미지는 P2 레코드에서 온다. `role: 'evidence'` 뿐이다 —
 * 생성 이미지(`material`)는 키를 넣기 전까지 부르지 않기로 했다 (지시서 P4-3).
 * 썸네일이 없는 레코드는 **항목을 만들지 않는다.** url:"" 을 넣으면 상대가 깨진 이미지를 그린다.
 */
export function toTopic(c: Candidate, posts: PostRecord[] = []): BriefTopic {
  const sources: BriefSource[] = (c.evidence ?? []).map((e) => ({
    source: e.source,
    title: e.title,
    url: e.url,
    ...(e.excerpt ? { excerpt: e.excerpt } : {}),
    ...(e.metric ? { metric: e.metric } : {}),
  }));

  /*
   * **이 후보의 레코드만 담는다.** 부르는 쪽이 이미 갈라서 넘기는 게 원래 약속이었는데
   * (`toBrief` 가 그렇게 한다) 그 전제가 시그니처에 안 드러나 있었다. 전체를 넘기면
   * 남의 썸네일이 조용히 섞여 나가고, 실제로 그렇게 됐다 — 치이카와와 로빈의 images 가
   * 글자 그대로 같은 6장이었다. 값이 틀린 게 아니라 **틀린 걸 알 방법이 없는 게** 문제다.
   *
   * 여기서 한 번 더 거른다. 두 번 거르는 비용보다 조용히 새는 비용이 크다.
   * 큰 그림이 먼저 오게 최신 게시물부터. 한 후보에 6장까지만 — 카드에 다 못 쓴다.
   */
  const mine = posts.filter((p) => p.candidateId === c.id);

  const images: BriefImage[] = mine
    .filter((p) => p.thumbnailUrl)
    /*
     * **캐릭터가 크게 보이는 장부터 넘긴다** (charShot, 2026-09-19).
     * 상대는 앞쪽 몇 장을 카드에 쓴다 — 사람 얼굴이 1번으로 가면 그게 카드 표지가 된다.
     * 안 물어본 장은 1로 본다. 부르는 쪽이 이미 최신순으로 넘기므로 동점은 그 순서다.
     */
    .sort((a, b) => (b.charShot ?? 1) - (a.charShot ?? 1))
    .slice(0, 6)
    .map((p) => ({
      role: 'evidence' as const,
      type: 'thumbnail' as const,
      url: p.thumbnailUrl!,
      source_url: p.url,
      platform: p.platform,
    }));

  /*
   * 시간축 (지시서 P5). **새 호출이 없다** — 화면의 변화 그래프와 같은 함수를 쓴다.
   * 한 점이 한 달이고 `at` 은 그 달의 첫날, `value` 는 그 달에 올라온 편수다.
   *
   * `estimated: true` 는 **우리가 보기 전 구간**이다. 검색이 건져 준 표본이라 그 달의
   * 실제 게시량이 아니다 — 상대가 "3월에 1편뿐이었다"로 읽으면 안 된다. 화면에서
   * 점선으로 긋는 그 구간이고, 여기서도 같은 뜻으로 나간다.
   *
   * 레코드가 없는 후보(뉴스 등)는 빈 배열이다. 0 으로 채운 점을 만들지 않는다.
   */
  const series = postingSeries(mine, firstObservedAt(mine, c.origin.runAt));
  const trend: TrendPoint[] = series.months.map((m) => ({
    at: `${m.month}-01`,
    value: m.count,
    estimated: !m.observed,
  }));

  const why = usable(c.why);
  // 판정 메모가 요약 자리에 앉는 걸 why_now 와 같은 장치로 막는다. 둘은 만드는 곳이 다르지만
  // 걸러야 할 것은 같다 — "독립 출처가 부족함" 류는 요약이 아니라 메모다.
  const summary = usable(c.summary);
  // 애매한 판정만 실린다. blocked 는 위에서 아예 빠지므로 여기 올 일이 없다.
  const safetyNote =
    c.safety?.level === 'flagged'
      ? [c.safety.reason, c.safety.evidence ? `근거: "${c.safety.evidence}"` : '']
          .filter(Boolean)
          .join(' ')
      : null;
  const topic: BriefTopic = {
    id: c.id,
    scope: scopeOf(c),
    title: c.subject,
    // summary 는 본문 요약(summaries.ts)만 채운다. why 를 여기 넣지 말 것 — 묻는 것이 다르다.
    ...(summary ? { summary } : {}),
    ...(why ? { why_now: why } : {}),
    ...(safetyNote ? { safety_note: safetyNote } : {}),
    verdict: c.verdict,
    images,
    sources,
    metrics: {
      views: num(c.momentum?.views),
      accounts: num(c.momentum?.accounts),
      trend,
      // 점선과 실선이 갈리는 날. 상대가 화면과 같은 경계선을 그을 수 있어야 한다.
      // 한 달 안에서 갈리는 경우가 있어 월별 점만으로는 그 자리를 찍을 수 없다.
      ...(trend.length ? { observed_from: series.observedFrom } : {}),
    },
    rights: {
      ownership: c.rights?.ownership ?? null,
      reference_required: c.rights?.basis === 'reference_required',
      ...(c.rights?.note ? { note: c.rights.note } : {}),
    },
  };

  /*
   * 2026-09-17 최상위 `caveat` 을 뺐다. `rights.note` 와 **글자 그대로 같은 문자열**이라
   * 상대가 같은 경고를 두 번 쓰게 된다. 남긴 쪽은 `rights.note` 다 — 조심할 이유가
   * 권리 판정에서 나오므로 그 밑에 있는 게 맞고, grounded 여부와 무관하게 늘 실린다.
   */
  return topic;
}

export interface BriefOptions {
  field?: string;
  sources?: string[];
  /** 최대 몇 개까지. 지시서는 3안. 모자라면 모자란 채로 낸다. */
  limit?: number;
  scope?: BriefScope[];
}

/**
 * 후보 목록을 계약 JSON 으로 만든다.
 *
 * 근거가 없는 후보는 **내보내지 않는다.** 상대는 이걸로 대본을 쓴다 —
 * 출처를 댈 수 없는 항목을 넘기면 상대가 출처 없는 카드를 만들게 된다.
 */
export function toBrief(
  all: Candidate[],
  posts: PostRecord[] = [],
  opts: BriefOptions = {},
): TrendBrief {
  const limit = opts.limit ?? 3;
  const wanted = opts.scope;

  const usable = all
    .filter((c) => (c.evidence?.length ?? 0) > 0)
    .filter((c) => !c.origin?.mock)
    /*
     * 안전 판정에서 막힌 후보는 **넘기지 않는다.** 상대는 이걸로 카드를 만든다 —
     * 사람이 죽은 폭력 유행을 넘기면 그 유행에 올라타는 카드가 만들어진다.
     * `flagged`(애매)는 넘긴다. 막는 게 아니라 사람이 한 번 보라는 표시라서다.
     */
    .filter((c) => c.safety?.level !== 'blocked')
    .filter((c) => c.review !== 'rejected')
    .filter((c) => !wanted || wanted.includes(scopeOf(c)));

  // 근거가 많은 것부터. 조회수는 축이 판정기마다 달라 1차 정렬에 쓰지 않는다.
  // 후보별로 레코드를 미리 모아 둔다. 후보마다 전체를 훑으면 O(후보×게시물) 이 된다.
  const byCandidate = new Map<string, PostRecord[]>();
  for (const p of posts) {
    const list = byCandidate.get(p.candidateId);
    if (list) list.push(p);
    else byCandidate.set(p.candidateId, [p]);
  }
  for (const list of byCandidate.values()) {
    list.sort((a, b) => (b.postedAt ?? '').localeCompare(a.postedAt ?? ''));
  }

  const picked = [...usable]
    .sort((a, b) => (b.evidence?.length ?? 0) - (a.evidence?.length ?? 0))
    .slice(0, limit)
    .map((c) => toTopic(c, byCandidate.get(c.id) ?? []));

  const notes: string[] = [];
  if (picked.length < limit) {
    notes.push(
      `근거 있는 후보가 ${usable.length}건이라 ${picked.length}건만 냅니다. ` +
        `억지로 ${limit}안을 채우지 않았습니다.`,
    );
  }
  const shots = picked.reduce((n, t) => n + t.images.length, 0);
  if (!shots) {
    notes.push(
      'images 가 비어 있습니다. 썸네일 칸은 붙었지만(P2) 이 회차들은 그 칸이 생기기 전에 ' +
        '수집된 것이라 비어 있습니다. 다음 수집부터 채워집니다.',
    );
  }
  notes.push(
    '생성 이미지(role=material)는 키를 넣기 전까지 만들지 않습니다(P4-3). ' +
      '키가 들어오면 images 에 항목이 추가될 뿐 다른 칸은 바뀌지 않습니다.',
  );
  const flagged = picked.filter((t) => t.safety_note).length;
  if (flagged) {
    notes.push(
      `safety_note 가 붙은 주제가 ${flagged}건 있습니다. 판정이 애매해 사람이 한 번 보라는 ` +
        '표시이고 금지가 아닙니다. 명확히 위험한 것은 아예 넘기지 않습니다.',
    );
  }

  const noSummary = picked.filter((t) => !t.summary).length;
  if (noSummary) {
    notes.push(
      `summary 가 없는 주제가 ${noSummary}건 있습니다. 게시물 본문에 적을 내용이 없었거나, ` +
        '본문 요약 경로(2026-09-18)가 생기기 전에 수집된 회차입니다. 빈 문자열이나 판정 메모로 ' +
        '채우지 않으므로 그 주제에는 칸 자체가 없습니다.',
    );
  }
  notes.push(
    'why_now 는 근거가 얇은 후보에서 빠집니다. 판정기가 "독립 출처가 부족함" 같은 메모를 ' +
      '쓴 자리인데 그건 까닭이 아니라 메모라 내보내지 않습니다. 빠진 것은 "아직 안 온 것"이 ' +
      '아니라 "댈 말이 없는 것"입니다.',
  );
  notes.push(
    'metrics 에서 scale·direction 을 뺐습니다. 이 판정기들이 만들지 않는 칸이라 늘 ' +
      'null 이었습니다. 규모·방향 대신 rights 와 sources 수를 보세요.',
  );
  const withTrend = picked.filter((t) => t.metrics.trend.length).length;
  if (withTrend) {
    notes.push(
      'metrics.trend 는 월별 게시 편수입니다. 한 점이 한 달이고 at 은 그 달의 첫날, ' +
        'value 는 그 달에 올라온 편수(조회수 아님)입니다. estimated:true 인 점은 저희가 ' +
        '보기 전 구간이라 검색이 건져 준 표본이고 그 달의 실제 게시량이 아닙니다 — ' +
        '그래프로 그리실 때 점선으로 두세요. 점선과 실선이 갈리는 날짜는 ' +
        'metrics.observed_from 에 있습니다 — 경계가 달 한가운데 떨어질 수 있어 ' +
        '월별 점만으로는 그 자리를 찍을 수 없습니다.',
    );
  }
  if (withTrend < picked.length) {
    notes.push(
      `metrics.trend 가 빈 주제가 ${picked.length - withTrend}건 있습니다. 게시물 레코드가 ` +
        '없는 갈래(뉴스 등)입니다. 0 으로 채운 점을 만들지 않았습니다.',
    );
  }

  return {
    scope: [...new Set(picked.map((t) => t.scope))],
    query: { field: opts.field ?? '', sources: opts.sources ?? [] },
    generatedAt: new Date().toISOString(),
    topics: picked,
    note: notes.join(' '),
  };
}
