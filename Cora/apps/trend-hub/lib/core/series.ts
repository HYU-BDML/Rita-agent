import type { PostRecord } from './post-record';
/*
 * `./trend` 이 아니라 `./day` 에서 가져온다. `trend` 는 `store` 를 끌고 오고 `store` 는
 * `node:fs` 를 끌고 온다 — 그러면 이 파일을 쓰는 클라이언트 컴포넌트의 번들이 깨진다
 * ("Reading from node:fs is not handled by plugins"). 날짜를 자르는 일은 아무것에도
 * 기대지 않으므로 잎에서 가져오는 것이 맞다.
 */
import { observedDay } from './day';

/**
 * 게시 시점 분포 — 후보 하나의 변화 그래프 (지시서 P5).
 *
 * **왜 회차를 안 기다려도 되나.** YouTube 는 영상에 게시일이 박혀 있고 과거 검색이 된다.
 * 오늘 처음 발견한 후보라도 손에 든 레코드의 `postedAt` 만 세면 몇 달치 곡선이 즉시 나온다.
 * 리락쿠마는 한 회차 재료로 7개월(03~09월)이 나온다.
 *
 * **축이 하나다.** 「추정 구간과 실측 구간」은 값이 두 종류라는 뜻이 아니라 **시간대가 두
 * 종류**라는 뜻이다. 재는 것은 전 구간 똑같이 '그 달에 올라온 편수'이고, 갈리는 건
 * 우리가 보기 전인가 보는 중인가다. 세로축이 다른 값을 한 그래프에 얹지 않는다.
 *
 * **소급 구간은 관측한 선이 아니다.** 검색이 건져 준 표본이라 그 달의 실제 게시량이 아니다.
 * 그래서 점선으로 긋고 말로도 적는다. 첫 관측일 뒤는 우리가 보는 동안 쌓인 것이라 실선이다.
 */
export interface MonthPoint {
  /** YYYY-MM (한국 날짜 기준) */
  month: string;
  count: number;
  /** 첫 관측일이 지난 달인가. 그 달 안에서 갈리는 건 경계선이 따로 그린다. */
  observed: boolean;
}

export interface PostingSeries {
  months: MonthPoint[];
  /** 첫 관측일 (YYYY-MM-DD, KST). 이 왼쪽이 역산, 오른쪽이 관측 중이다. */
  observedFrom: string;
  /** 역산 구간 편수 · 관측 구간 편수. 선 없이 말로도 읽히게 같이 낸다. */
  backfilled: number;
  observed: number;
  peak: MonthPoint | null;
}

/**
 * 이 후보를 **처음 본 때**. 실선 구간이 여기서 열린다.
 *
 * `candidate.origin.runAt` 을 그대로 쓰면 안 된다. 후보 행은 회차마다 덮어써지므로
 * 그 값은 **마지막으로 본 회차**다 — 첫 관측일이 매일 앞으로 밀려서 관측 구간이
 * 영영 열리지 않는다. 2026-09-18 까지 화면 그래프가 그렇게 그려지고 있었다.
 *
 * 그래서 손에 있는 것 중 가장 이른 때를 쓴다. 게시물 레코드의 `runAt` 은 그 게시물을
 * 어느 회차에 적었는지라, 옛 회차에만 잡힌 게시물이 남아 있으면 그게 첫 회차를 가리킨다.
 * 회차 점(`trend.points[0].at`)을 아는 쪽은 `fromTrend` 로 넘긴다 — 그쪽이 더 정확하고,
 * 둘 다 있으면 이른 쪽을 쓴다. 화면과 계약이 다른 날짜를 그리지 않게 하는 자리다.
 */
export function firstObservedAt(
  posts: PostRecord[],
  originRunAt: string,
  fromTrend?: string,
): string {
  const candidates = [originRunAt, fromTrend, ...posts.map((p) => p.runAt)].filter(
    (v): v is string => Boolean(v),
  );
  return candidates.sort()[0] ?? originRunAt;
}

/** YYYY-MM 을 한 달 뒤로. 빈 달을 0 으로 메우려면 달을 셀 줄 알아야 한다. */
function nextMonth(m: string): string {
  const [y, mo] = m.split('-').map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
}

/**
 * 후보 하나의 월별 게시 편수.
 *
 * **빈 달을 건너뛰지 않는다.** 값이 있는 달만 이어 그리면 넉 달 공백이 옆칸처럼 붙어
 * 곡선이 실제보다 촘촘해 보인다. 0 으로 채워 시간 간격을 지킨다.
 */
export function postingSeries(posts: PostRecord[], firstRunAt: string): PostingSeries {
  const days = posts
    .map((p) => p.postedAt)
    .filter((d): d is string => !!d)
    .map(observedDay)
    .sort();
  const observedFrom = observedDay(firstRunAt);
  if (!days.length) {
    return { months: [], observedFrom, backfilled: 0, observed: 0, peak: null };
  }

  const counts = new Map<string, number>();
  for (const d of days) {
    const m = d.slice(0, 7);
    counts.set(m, (counts.get(m) ?? 0) + 1);
  }

  const months: MonthPoint[] = [];
  const last = days[days.length - 1].slice(0, 7);
  for (let m = days[0].slice(0, 7); ; m = nextMonth(m)) {
    months.push({ month: m, count: counts.get(m) ?? 0, observed: m > observedFrom.slice(0, 7) });
    if (m === last) break;
  }

  const observed = days.filter((d) => d >= observedFrom).length;
  const peak = months.reduce<MonthPoint | null>(
    (best, m) => (!best || m.count > best.count ? m : best),
    null,
  );
  return { months, observedFrom, backfilled: days.length - observed, observed, peak };
}

/** 최근 며칠을 "신선"으로 보나. */
export const FRESH_WINDOW_DAYS = 30;
/** 이 미만이면 비중을 내지 않는다. */
export const FRESH_MIN_POSTS = 10;

/** YYYY-MM-DD 에서 n 일 전. 달·해 경계를 Date 에 맡긴다 (08-25 는 09-24 의 30 일 전이다). */
function minusDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() - n);
  return t.toISOString().slice(0, 10);
}

/**
 * 신선도 — 이 후보의 게시물 중 **최근 30일에 올라온 비중**(%).
 *
 * **왜 있나.** 캐릭터 축에는 급등 신호가 없다. `구간·규모·기울기`는 radar 12건에만 붙고,
 * 캐릭터는 관측일 수로 대체돼 있는데 그건 신선도가 아니라 **유명도 대리지표**다. 코난과
 * 짱구가 둘 다 5일 관측인데 신선도는 34% 대 92% 다 — 코난은 옛 게시물이 계속 검색에
 * 걸리는 것이고, 짱구는 지금 올라오는 중이다. 관측일 수로는 이 둘이 갈리지 않는다.
 *
 * **10건 미만이면 `null` 이다. `0` 이 아니다.** 게시물 3건 중 1건이 최근이면 33% 가
 * 나오지만 그 33% 는 아무 뜻이 없다 — 한 건만 달라도 0% 나 67% 로 튄다. 모르는 것을
 * 0 으로 적으면 화면에서 "신선하지 않음"으로 읽힌다. 실제로 후보 196건 중 138건이
 * 여기 걸린다. 부르는 쪽이 `null` 을 보고 칸을 비울지 후보를 뺄지 정한다.
 *
 * **`postedAt` 이 없는 게시물은 분모에서도 빠진다.** 시점을 모르는 것을 "최근이 아님"
 * 쪽에 넣으면 인스타·X(게시일 미수집)가 섞인 후보만 신선도가 내려간다.
 *
 * 경계는 한국 날짜로 자른다 (`observedDay`) — 서버 위치에 따라 하루가 밀지 않게.
 *
 * **`asOf` 는 필수다. 선택으로 바꾸지 마라.** 기본값을 오늘로 두면 수집이 멈춰 있는 동안
 * 경계가 매일 뒤로 밀려서 주간 비교가 깨진다. 값이 내려간 게 아니라 우리가 안 본 것인데,
 * 화면에는 식은 것으로 나온다. 실제로 갈린다 — 수집이 09-24 에 멈춘 지금:
 *
 *     asOf 2026-09-24   짱구 92 · 코난 34 · 리락쿠마 33 · 치이카와 72
 *     asOf 2026-09-27   짱구 92 · 코난 29 · 리락쿠마 30 · 치이카와 68
 *
 * 부르는 쪽이 **마지막 회차 날짜**를 넘긴다 (`listRuns()[0].at`). 재는 시점을 화면이
 * 알고 있어야 "마지막 확인 2026-09-24" 를 같이 적을 수 있다.
 */
export function freshness(posts: PostRecord[], asOf: string): number | null {
  const days = posts
    .map((p) => p.postedAt)
    .filter((d): d is string => !!d)
    .map(observedDay);
  if (days.length < FRESH_MIN_POSTS) return null;
  const cutoff = minusDays(observedDay(asOf), FRESH_WINDOW_DAYS);
  const recent = days.filter((d) => d >= cutoff).length;
  return Math.round((recent / days.length) * 100);
}
