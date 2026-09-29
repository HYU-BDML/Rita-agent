/**
 * 네이버 검색추이(데이터랩). '여러 곳이 다뤘다'에 '사람들이 실제로 찾았나'를 더한다.
 *
 * 뉴스만 요란하고 검색은 안 늘어난 주제가 있다. 그걸 걸러내는 축이다.
 * 소재 찾기의 최근_대_평소 / 작년_대비가 이것이다.
 */

const BASE = 'https://openapi.naver.com/v1/datalab/search';

export interface Trend {
  keyword: string;
  /** 최근 7일 평균 / 이전 8주 평균. 1 보다 크면 평소보다 많이 찾는다는 뜻. */
  surge: number | null;
  /** 최근 7일 평균 / 작년 같은 기간 평균. */
  yoy: number | null;
  /** 네이버가 준 원자료 포인트 수. 0 이면 표본이 없어 판정 불가다. */
  points: number;
}

interface DatalabPoint {
  period: string;
  ratio: number;
}

function credentials(): { id: string; secret: string } | null {
  const id = process.env.NAVER_ID?.trim();
  const secret = process.env.NAVER_SECRET?.trim();
  return id && secret ? { id, secret } : null;
}

export function hasNaver(): boolean {
  return credentials() !== null;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function mean(points: DatalabPoint[]): number | null {
  if (!points.length) return null;
  return points.reduce((s, p) => s + p.ratio, 0) / points.length;
}

/**
 * 비율. 0 에 가까운 값으로 나누면 허수가 나온다.
 *
 * 실제로 '용혜인'이 작년비 134.13 배로 찍혔다. 작년 검색량이 사실상 0 이었을 뿐이고,
 * 134 라는 숫자에는 아무 뜻이 없다. 그런 건 재지 못한 것으로 두는 편이 정직하다.
 *
 * 데이터랩 ratio 는 요청 구간 안에서 0~100 으로 정규화된다. 기준 구간 평균이 1 미만이면
 * 사실상 검색이 없던 말이라 배수를 낼 수 없다.
 */
const BASE_MIN = 1.0;
const RATIO_CAP = 50;

function ratio(recent: number | null, base: number | null): number | null {
  if (recent == null || base == null || base < BASE_MIN) return null;
  const r = recent / base;
  if (!Number.isFinite(r) || r > RATIO_CAP) return null;
  return Math.round(r * 100) / 100;
}

async function callDatalab(
  body: unknown,
  cred: { id: string; secret: string },
  timeoutMs: number,
): Promise<DatalabPoint[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(BASE, {
      method: 'POST',
      headers: {
        'X-Naver-Client-Id': cred.id,
        'X-Naver-Client-Secret': cred.secret,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`네이버 데이터랩 HTTP ${res.status}`);
    const json = (await res.json()) as { results?: { data?: DatalabPoint[] }[] };
    return json.results?.[0]?.data ?? [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 검색어 하나의 추이. 데이터랩은 한 번에 최대 5개 그룹을 받지만
 * 기간이 다른 두 구간을 같이 못 물어서 호출을 둘로 나눈다.
 */
export async function trendFor(keyword: string, timeoutMs = 15_000): Promise<Trend> {
  const cred = credentials();
  if (!cred) return { keyword, surge: null, yoy: null, points: 0 };

  const now = new Date();
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

  const group = { groupName: keyword, keywords: [keyword] };
  const common = { timeUnit: 'date' as const, keywordGroups: [group] };

  // 올해: 최근 9주. 뒤 7일이 '최근', 앞부분이 '평소'.
  const thisYear = await callDatalab(
    { ...common, startDate: ymd(daysAgo(63)), endDate: ymd(daysAgo(0)) },
    cred,
    timeoutMs,
  );

  const recentPts = thisYear.slice(-7);
  const basePts = thisYear.slice(0, -7);
  const recentMean = mean(recentPts);

  let yoy: number | null = null;
  if (recentMean != null) {
    // 작년 같은 주. 데이터랩 ratio 는 요청 구간 안에서 정규화되므로 따로 부르면 비교가 안 된다.
    // 그래서 작년 구간과 올해 최근 구간을 한 요청에 같이 넣는다.
    const spanning = await callDatalab(
      { ...common, startDate: ymd(daysAgo(372)), endDate: ymd(daysAgo(0)) },
      cred,
      timeoutMs,
    );
    if (spanning.length) {
      const lastYear = spanning.filter((p) => {
        const t = Date.parse(p.period);
        return t >= daysAgo(372).getTime() && t <= daysAgo(365).getTime();
      });
      const nowWindow = spanning.slice(-7);
      yoy = ratio(mean(nowWindow), mean(lastYear));
    }
  }

  return {
    keyword,
    surge: ratio(recentMean, mean(basePts)),
    yoy,
    points: thisYear.length,
  };
}

/** 여러 검색어. 네이버 쿼터를 아끼려고 순차로 돌리고, 하나 실패해도 나머지는 살린다. */
export async function trendsFor(keywords: string[], timeoutMs = 15_000): Promise<Map<string, Trend>> {
  const out = new Map<string, Trend>();
  for (const k of keywords) {
    try {
      out.set(k, await trendFor(k, timeoutMs));
    } catch {
      out.set(k, { keyword: k, surge: null, yoy: null, points: 0 });
    }
  }
  return out;
}

/** 테스트 전용 노출. 배수 계산이 이 파일의 유일한 함정이라 따로 검사한다. */
export const __ratioForTest = ratio;
