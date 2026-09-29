import { collectionSchedule, listRuns } from './store';
import { observedDay } from './trend';

/**
 * 하루 실행 상한.
 *
 * `/api/discover` 는 한 번 누를 때마다 유료 API 를 부른다 — 캐릭터 회차가 인스타·X·틱톡
 * 15콜에 LLM 판정까지 얹는다. 배포본은 주소를 아는 사람이면 누구나 누를 수 있으므로,
 * 인증 대신 **상한**으로 돈을 막는다. 열어 두되 새지는 않게 한다.
 *
 * **판정기별로 센다.** 하나로 합쳐 세면 뉴스를 몇 번 돌린 날 캐릭터를 아예 못 돌린다 —
 * 축마다 잣대도 비용도 다른데 한 통에서 꺼내 쓰니 먼저 누른 쪽이 남의 몫까지 가져간다.
 * 그 위에 전체 천장을 하나 더 둔다. 굶기지 않는 것과 총액을 묶는 것은 다른 일이다.
 *
 * 세는 기준은 저장된 회차 기록이다. 한국 날짜로 자른다 — 서버가 어디에 있든 사람이
 * "오늘"이라고 부르는 날과 같아야 한다 (`observedDay` 와 같은 이유).
 *
 * **성공한 회차만 센다.** 실패한 호출은 기록이 안 남으므로 상한에 안 잡힌다. 실패는
 * 대개 수집 전에 나지만(키 없음·판정기 없음), 수집 뒤 터진 회차는 돈을 쓰고도 칸을
 * 비운다. 그것까지 막으려면 시도 자체를 적어야 하는데, 그러면 회차 화면에 빈 줄이
 * 쌓인다. 지금은 그 값을 치르지 않는다.
 */
export const DEFAULT_MAX_RUNS_PER_DISCOVERY = 3;

/**
 * 전체 천장. 판정기별 상한만 두면 판정기 수만큼 곱해져서 하루 지출이 늘어난다.
 * 굶기지 않는 것은 판정기별 상한이 하고, 총액을 묶는 것은 이쪽이 한다.
 */
export const DEFAULT_MAX_RUNS_PER_DAY = 10;

/** 그중 자동(cron)이 가져갈 수 있는 몫. 나머지는 사람이 누를 자리로 남긴다. */
export const DEFAULT_MAX_AUTOMATIC_RUNS_PER_DAY = 3;

function limitFrom(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

export function maxRunsPerDiscovery(): number {
  return limitFrom(process.env.TREND_HUB_MAX_RUNS_PER_DISCOVERY, DEFAULT_MAX_RUNS_PER_DISCOVERY);
}

export function maxRunsPerDay(): number {
  return limitFrom(process.env.TREND_HUB_MAX_RUNS_PER_DAY, DEFAULT_MAX_RUNS_PER_DAY);
}

export function maxAutomaticRunsPerDay(): number {
  return limitFrom(
    process.env.TREND_HUB_MAX_AUTOMATIC_RUNS_PER_DAY,
    DEFAULT_MAX_AUTOMATIC_RUNS_PER_DAY,
  );
}

export interface RunQuota {
  /** 어느 판정기를 기준으로 센 값인가. 안 주고 물으면 비어 있다. */
  discoveryId?: string;
  /** 그 판정기를 오늘(KST) 몇 번 돌렸나. */
  used: number;
  max: number;
  /** 그 판정기에 남은 횟수. 음수가 되지 않는다. */
  left: number;
  /** 판정기를 가리지 않은 오늘 전체. */
  totalUsed: number;
  totalMax: number;
  totalLeft: number;
  automaticUsed: number;
  automaticMax: number;
}

export async function runQuota(discoveryId?: string, now: Date = new Date()): Promise<RunQuota> {
  const today = observedDay(now.toISOString());
  const [runs, schedule] = await Promise.all([listRuns(), collectionSchedule()]);
  const todays = runs.filter((run) => observedDay(run.at) === today);
  const mine = discoveryId ? todays.filter((run) => run.discoveryId === discoveryId) : todays;

  /*
   * 화면에서 정한 값이 env 를 이긴다. env 는 배포할 때 박아 두는 바닥값이고, 화면 값은
   * 쓰는 사람이 오늘 조인 것이다. `?? ` 를 쓰는 이유는 **0 이 뜻 있는 값**이라서다 —
   * 0 은 "잠근다"이지 "안 정했다"가 아니다.
   */
  const saved = discoveryId ? schedule.limits?.[discoveryId] : schedule.totalLimit;
  const max = saved ?? (discoveryId ? maxRunsPerDiscovery() : maxRunsPerDay());
  const totalMax = schedule.totalLimit ?? maxRunsPerDay();
  return {
    ...(discoveryId ? { discoveryId } : {}),
    used: mine.length,
    max,
    left: Math.max(0, max - mine.length),
    totalUsed: todays.length,
    totalMax,
    totalLeft: Math.max(0, totalMax - todays.length),
    automaticUsed: todays.filter((run) => run.trigger === 'automatic').length,
    automaticMax: maxAutomaticRunsPerDay(),
  };
}

/**
 * 막아야 하면 사람이 읽는 이유를, 통과면 null 을 낸다.
 * 화면에 그대로 나가는 말이라 숫자를 빼놓지 않는다 — "한도 초과"만으로는 언제 풀리는지 모른다.
 *
 * 순서가 뜻을 만든다. **판정기별 상한을 먼저 본다** — 뉴스를 다 썼다는 말과 오늘치를
 * 다 썼다는 말은 사람이 할 일이 다르다. 앞엣것은 다른 축을 돌리면 되고, 뒤엣것은 못 한다.
 */
export function quotaBlock(quota: RunQuota, trigger: 'manual' | 'automatic'): string | null {
  if (quota.discoveryId && quota.used >= quota.max) {
    return quota.totalLeft > 0
      ? `이 판정기는 오늘 ${quota.max}회를 모두 썼습니다. 다른 축은 아직 돌릴 수 있습니다(오늘 전체 ${quota.totalLeft}회 남음).`
      : `이 판정기는 오늘 ${quota.max}회를 모두 썼습니다. 한국시간 자정에 다시 열립니다.`;
  }
  if (quota.totalUsed >= quota.totalMax) {
    return `오늘 전체 실행 한도 ${quota.totalMax}회를 모두 썼습니다. 한국시간 자정에 다시 열립니다.`;
  }
  if (trigger === 'automatic' && quota.automaticUsed >= quota.automaticMax) {
    return `오늘 자동 실행 한도 ${quota.automaticMax}회를 모두 썼습니다. 직접 돌리는 것은 아직 ${quota.totalLeft}회 남았습니다.`;
  }
  return null;
}
