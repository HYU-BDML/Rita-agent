import type { Candidate } from './candidate';
import { isBlocked, isFlagged } from './axis';
import { getDiscovery } from './registry';
import { key, listSnapshots, version } from './store';
import { observedDay } from './day';

// 관측일은 잎 모듈로 옮겼다(lib/core/day.ts). 여기서 다시 내보내 부르던 곳을 안 건드린다.
export { observedDay };

/**
 * 회차 간 추이.
 *
 * 후보 표는 회차마다 덮어써진다(upsert). 그래서 지금 남아 있는 건 마지막 값뿐이고,
 * '지난주보다 오른 건가'를 후보 표만 봐서는 알 수 없다.
 *
 * 대신 회차마다 원본을 snapshots 에 남겨 뒀다. 판정기의 normalize 를 다시 돌리면
 * 그 회차의 후보가 그대로 되살아난다 — API 를 다시 부르지 않고. 원래 그 목적으로 둔 것이라
 * 추이를 위해 새로 저장할 것이 없다.
 */

export interface Point {
  runId: string;
  at: string;
  surge: number | null;
  mediaCount: number | null;
  accounts: number | null;
  /** 발굴에서 재는 축. 캐릭터는 급등이 아니라 조회로 본다. */
  views: number | null;
}

export interface Trend {
  points: Point[];
  /**
   * 로그 기울기. 회차 값 전체에 log1p 회귀를 걸어 기운 방향을 본다.
   * 직전 회차 대비 배수는 한 번의 튐에 통째로 흔들린다 — Dify v13.2 가 회귀를 쓴 이유다.
   * GROWTH_MIN 을 넘고 회차가 RUNS_FOR_VERDICT 이상일 때만 '오른다'고 말한다.
   */
  slope: number | null;
  /** 회귀로 판정한 방향. 회차가 모자라면 null — 모른다는 뜻이다. */
  direction: 'up' | 'flat' | 'down' | null;
  /**
   * 직전 회차 대비 증가율. 재는 축이 회차마다 다를 수 있어 순서대로 찾는다.
   * 급등 배수 → 매체 수 → 계정 수. 둘 다 있는 축이 없으면 null 이다.
   */
  growth: number | null;
}

/** v13.2 추이 계산과 같은 값. 기울기가 이보다 작으면 흔들림으로 본다. */
export const GROWTH_MIN = 0.3;
/**
 * 이만큼 쌓이기 전에는 방향을 말하지 않는다. 두 점으로 추세를 그리면 없는 추세가 보인다.
 *
 * **단위는 회차가 아니라 관측일이다.** `allTrends()` 가 같은 날 점을 하나로 접기 때문에
 * `points.length` 가 곧 관측일 수다. 등급(`gradeOf`)도 같은 수를 센다 — 단위가 어긋나면
 * "확정"인데 방향이 안 열리는 후보가 생기고, 화면에서 등급과 방향이 따로 논다.
 */
export const RUNS_FOR_VERDICT = 3;



export type GradeLevel = 'fresh' | 'tentative' | 'confirmed';

export interface Grade {
  level: GradeLevel;
  /** 화면에 그대로 나가는 말. 색만으로 뜻을 전하지 않는다. */
  label: string;
  /** 관측일 수. 회차 수가 아니다. */
  days: number;
  /** 마지막으로 본 날 (KST, YYYY-MM-DD). */
  lastSeen: string | null;
}

const GRADE_LABEL: Record<GradeLevel, string> = {
  fresh: '새로 포착',
  tentative: '잠정',
  confirmed: '확정',
};

/**
 * 판정 등급 3단 (9/20 지시서 T2).
 *
 * **비어 있으면 안 되는 칸이다.** 캐릭터는 급등 축으로 안 보기 때문에 급등 미터가
 * "측정 못 함"으로 뜨는데, 그건 설계지 고장이 아니다. 보는 사람에게는 구분이 안 되므로
 * 그 자리에 "몇 번 봤나"를 대신 적는다.
 *
 * 세는 단위는 **관측일**이다. 09-14 에 5분 간격으로 두 번 돌린 적이 있는데 그걸 두 번 본
 * 것으로 세면, 하루짜리 후보가 "잠정"이 되고 이틀짜리가 "확정"이 된다. 시연에서 등급이
 * 거짓말을 하는 자리다. `allTrends()` 가 이미 접어서 주므로 여기서는 세기만 한다.
 *
 * 점이 없어도 등급은 낸다 — 후보가 있다는 건 최소 한 번 봤다는 뜻이다. 그때 `fallbackAt`
 * (후보의 `origin.runAt`) 을 쓴다. 빈칸을 없애는 게 이 함수의 목적이라 여기서 비우면 안 된다.
 */
export function gradeOf(points: Point[], fallbackAt?: string): Grade {
  const days = [...new Set(points.map((p) => observedDay(p.at)))].sort();
  if (!days.length) {
    const day = fallbackAt ? observedDay(fallbackAt) : null;
    return { level: 'fresh', label: GRADE_LABEL.fresh, days: day ? 1 : 0, lastSeen: day };
  }
  const level: GradeLevel =
    days.length >= RUNS_FOR_VERDICT ? 'confirmed' : days.length >= 2 ? 'tentative' : 'fresh';
  return { level, label: GRADE_LABEL[level], days: days.length, lastSeen: days[days.length - 1] };
}

export const EMPTY_TREND: Trend = { points: [], growth: null, slope: null, direction: null };

/**
 * log1p 회귀 기울기. 조회·계정 수는 자릿수가 널뛰어 원값으로 회귀하면 큰 값 하나가 다 먹는다.
 * v13.2 의 slope() 를 그대로 옮겼다.
 */
export function logSlope(values: (number | null)[]): number | null {
  const ys = values.filter((v): v is number => v != null && Number.isFinite(v)).map((v) => Math.log1p(Math.max(0, v)));
  const n = ys.length;
  if (n < 2) return null;
  const mx = (n - 1) / 2;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    num += (i - mx) * (ys[i] - my);
    den += (i - mx) ** 2;
  }
  if (!den) return 0;
  return Math.round((num / den) * 1000) / 1000;
}

/** 재는 축은 회차마다 다를 수 있다. 있는 축을 순서대로 고른다. */
function axis(points: Point[]): (number | null)[] {
  for (const pick of [(p: Point) => p.views, (p: Point) => p.accounts, (p: Point) => p.surge, (p: Point) => p.mediaCount]) {
    const vals = points.map(pick);
    if (vals.filter((v) => v != null).length >= 2) return vals;
  }
  return [];
}

export function directionOf(points: Point[]): { slope: number | null; direction: Trend['direction'] } {
  const slope = logSlope(axis(points));
  if (slope == null || points.length < RUNS_FOR_VERDICT) return { slope, direction: null };
  if (slope >= GROWTH_MIN) return { slope, direction: 'up' };
  if (slope <= -GROWTH_MIN) return { slope, direction: 'down' };
  return { slope, direction: 'flat' };
}

/** a/b. 0 나누기와 없는 값에서 조용히 NaN 이 새지 않게 한 곳에 모은다. */
export function ratio(now: number | null | undefined, before: number | null | undefined): number | null {
  if (now == null || before == null) return null;
  if (!Number.isFinite(now) || !Number.isFinite(before) || before === 0) return null;
  return Math.round((now / before) * 100) / 100;
}

export function growthOf(points: Point[]): number | null {
  if (points.length < 2) return null;
  const now = points[points.length - 1];
  const before = points[points.length - 2];
  return (
    ratio(now.surge, before.surge) ??
    ratio(now.mediaCount, before.mediaCount) ??
    ratio(now.accounts, before.accounts)
  );
}

function pointOf(c: Candidate, runId: string, at: string): Point {
  return {
    runId,
    at,
    surge: c.momentum.surge ?? null,
    mediaCount: c.momentum.mediaCount ?? null,
    accounts: c.momentum.accounts ?? null,
    views: c.momentum.views ?? null,
  };
}

interface Replay {
  runId: string;
  discoveryId: string;
  at: string;
  candidates: Candidate[];
}

/**
 * 저장된 원본을 전부 다시 정규화한다. 추이와 회차 화면이 둘 다 여기서 나온다.
 *
 * 회차 수만큼 normalize 를 돈다. 지금은 세 회차라 무시할 만하고, 늘어나면
 * 여기서 캐시를 걸 자리다 — 원본은 한 번 쌓이면 바뀌지 않으니 캐시가 안전하다.
 */
let replayCache: { v: string; runs: Replay[] } | null = null;

async function replay(): Promise<Replay[]> {
  // 스냅샷을 매 요청마다 다시 정규화하면 6.9MB 를 통째로 훑는다. 회차를 새로
  // 돌리기 전까지 결과가 같으므로 판이 바뀔 때만 다시 만든다.
  const v = await version();
  if (replayCache && replayCache.v === v) return replayCache.runs;
  const built = await buildReplay();
  replayCache = { v, runs: built };
  return built;
}

async function buildReplay(): Promise<Replay[]> {
  const out: Replay[] = [];
  for (const s of await listSnapshots()) {
    const d = getDiscovery(s.discoveryId);
    if (!d) continue;
    try {
      out.push({
        runId: s.runId,
        discoveryId: s.discoveryId,
        at: s.at,
        candidates: d.normalize(s.raw, { runId: s.runId, runAt: s.at, mock: false }),
      });
    } catch {
      // 규칙이 바뀌어 옛 원본을 못 읽는 회차가 있을 수 있다. 그 회차만 건너뛴다.
    }
  }
  return out;
}

/**
 * 회차 간 비교가 성립하는 축인가.
 *
 * **캐릭터(unit=subject)는 성립하지 않는다 — 끈다.** `momentum.views` 는 "그 회차가 우연히
 * 건진 게시물의 조회 합계"다. 회차마다 다른 글을 잡으면 값이 통째로 갈린다. 실제로 그랬다:
 *
 *   치이카와  09-14 조회 2,750,839(인스타 대형)  →  09-17 조회 268(X 소형)   slope -9.2
 *   리락쿠마  09-14 조회   196,604              →  09-17 조회  27          slope -8.9
 *
 * 식은 게 아니라 **표본이 바뀐 것이다.** 둘 다 그때 제일 뜨거운 후보였다(극장판·CU 신상).
 * 점이 셋이 되면 `directionOf` 가 열려 화면에 "식는 중"이라고 적는다. 그 전에 끊는다.
 *
 * **지우지 않는다.** `growthOf`·`directionOf` 와 그 테스트는 그대로 두고 부르지만 않는다.
 * 축을 게시물 레코드 누적 수로 바꾸면(P5 (c) 안) 이 함수 하나만 풀면 된다.
 *
 * 주제(unit=topic)는 그대로 둔다 — 매체 수·검색 급등은 회차마다 같은 자로 잰다.
 */
export function comparableAcrossRuns(unit: Candidate['unit']): boolean {
  return unit !== 'subject';
}

export async function allTrends(): Promise<Map<string, Trend>> {
  const byKey = new Map<string, { points: Point[]; unit: Candidate['unit'] }>();
  for (const r of await replay()) {
    for (const c of r.candidates) {
      const k = `${r.discoveryId}:${key(c.subject)}`;
      const at = byKey.get(k) ?? { points: [], unit: c.unit };
      at.points.push(pointOf(c, r.runId, r.at));
      byKey.set(k, at);
    }
  }

  const out = new Map<string, Trend>();
  for (const [k, { points: raw, unit }] of byKey) {
    raw.sort((a, b) => a.at.localeCompare(b.at));
    /*
     * **같은 날 점은 하나로 접는다.** 09-14 에 5분 간격으로 두 번 돌린 적이 있고, 그걸 두
     * 점으로 두면 하루 본 것이 두 번 본 것이 된다. 그 위에서 도는 것이 전부 어긋난다 —
     * 등급이 "잠정"으로 오르고, `directionOf` 가 관측 이틀짜리에 방향을 열고,
     * `growthOf` 가 5분 간격을 "직전 회차 대비"라며 배수로 적는다.
     *
     * 남기는 건 그날 마지막 회차다. 같은 날이면 나중 값이 그날의 값이다.
     * 회차 화면(`runDigests`)은 접지 않는다 — 거기서는 회차 하나하나가 읽는 대상이다.
     */
    const points = [...new Map(raw.map((p) => [observedDay(p.at), p])).values()];
    // 못 재는 축이면 점만 남기고 판단은 비운다. 모른다는 뜻이 null 이다.
    out.set(
      k,
      comparableAcrossRuns(unit)
        ? { points, growth: growthOf(points), ...directionOf(points) }
        : { points, growth: null, slope: null, direction: null },
    );
  }
  return out;
}

/** 회차 화면 한 줄. 그 회차에 무엇이 나왔고, 그중 무엇이 처음 나온 것인가. */
export interface RunItem {
  subject: string;
  surge: number | null;
  fresh: boolean;
  growth: number | null;
}

export interface RunDigest {
  runId: string;
  discoveryId: string;
  at: string;
  items: RunItem[];
  freshCount: number;
}

/** 최근 회차가 위. 회차마다 '새로 뜬 것'이 몇 개였는지가 이 화면의 요점이다. */
export async function runDigests(): Promise<RunDigest[]> {
  const runs = await replay();
  const seen = new Set<string>();
  const prev = new Map<string, Point>();
  const digests: RunDigest[] = [];

  for (const r of runs) {
    const items: RunItem[] = [];
    for (const c of r.candidates) {
      // 안전 검토 대상은 외부 기록 화면에서도 숨긴다. 설정에서만 확인한다.
      if (isBlocked(c) || isFlagged(c)) continue;
      const k = `${r.discoveryId}:${key(c.subject)}`;
      const now = pointOf(c, r.runId, r.at);
      const before = prev.get(k);
      items.push({
        subject: c.subject,
        surge: now.surge,
        fresh: !seen.has(k),
        // 회차 화면도 같은 자를 쓴다. 한 화면에서만 끄면 다른 화면이 같은 거짓말을 한다.
        growth: before && comparableAcrossRuns(c.unit) ? growthOf([before, now]) : null,
      });
      seen.add(k);
      prev.set(k, now);
    }
    items.sort((a, b) => (b.surge ?? -1) - (a.surge ?? -1));
    digests.push({
      runId: r.runId,
      discoveryId: r.discoveryId,
      at: r.at,
      items,
      freshCount: items.filter((i) => i.fresh).length,
    });
  }
  return digests.reverse();
}

/** 후보 하나를 추이 표에서 찾는 열쇠. 후보 id 는 회차마다 달라질 수 있어 이름으로 맞춘다. */
export function trendKey(c: Candidate): string {
  return `${c.origin.discoveryId}:${key(c.subject)}`;
}

export async function trendFor(c: Candidate): Promise<Trend> {
  return (await allTrends()).get(trendKey(c)) ?? EMPTY_TREND;
}
