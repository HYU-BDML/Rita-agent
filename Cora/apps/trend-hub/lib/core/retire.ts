import type { Candidate } from './candidate';
import { observedDay } from './day';

/**
 * 안 뜨는 후보를 목록에서 내린다.
 *
 * 회차 31번에 후보 196건이 쌓였는데 그중 195건이 손도 안 댄 `pending` 이었다.
 * `upsertCandidates` 는 이름이 같으면 갱신하고 다르면 더할 뿐, **회차가 더 이상
 * 그 이름을 안 물어와도 예전 후보는 그 자리에 그대로 남는다.** "이번에 안 잡혔다"는
 * 정보가 버려지고 있었다. 그래서 지난주 뉴스가 오늘 소재와 같은 무게로 앉아 있었다.
 *
 * 자는 잣대가 둘이다.
 *
 *   나이   마지막으로 잡힌 날이 기한을 넘겼나 (`origin.runAt`)
 *   미포착 회차가 돌았는데 못 물어온 날이 이어졌나 (`misses`)
 *
 * 나이는 오늘 바로 듣고, 미포착은 회차가 규칙적으로 돌아야 뜻이 있다. 둘 다 쓰는 이유는
 * 서로 다른 것을 잡아서다 — 나이는 '오래됐다', 미포착은 '더는 안 퍼진다'.
 *
 * **보관한 것은 절대 안 내린다.** 사람이 계속 보겠다고 손으로 누른 것이다.
 * 기한이 지났다고 내리면 그 뜻을 뒤집는 것이 된다.
 *
 * 지우지 않고 `retired` 로 표시만 한다. 관측 이력은 스냅샷에 있으므로(`allTrends`),
 * 나중에 같은 이름이 다시 잡히면 점까지 그대로 이어서 되살아난다.
 */

/** 축마다 소재가 죽는 속도가 다르다. 뉴스는 일주일이면 끝나고 캐릭터는 몇 달 간다. */
export const DEFAULT_MAX_AGE_DAYS: Record<string, number> = {
  news: 7,
  radar: 14,
  'character-native': 30,
  'meme-native': 30,
};

/** 기한을 못 찾은 판정기에 쓰는 값. */
export const FALLBACK_MAX_AGE_DAYS = 30;

/** 연속으로 못 물어온 날이 이만큼이면 내린다. */
export const MAX_MISS_DAYS = 3;

export interface RetireRule {
  /** 판정기별 기한(일). 설정 화면에서 바꾼 값이 들어온다. */
  maxAgeDays?: Record<string, number>;
  maxMissDays?: number;
}

function maxAgeOf(discoveryId: string, rule?: RetireRule): number {
  const set = rule?.maxAgeDays?.[discoveryId];
  if (typeof set === 'number' && Number.isFinite(set) && set >= 0) return set;
  return DEFAULT_MAX_AGE_DAYS[discoveryId] ?? FALLBACK_MAX_AGE_DAYS;
}

function daysBetween(fromIso: string, to: Date): number {
  const from = new Date(fromIso);
  if (Number.isNaN(from.getTime())) return 0;
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

/**
 * 내려야 하면 사유를, 두어야 하면 null 을 낸다.
 * 사유를 말로 내는 이유는 화면과 기록에 그대로 쓰기 위해서다 — 왜 사라졌는지 물으면 답이 있어야 한다.
 */
export function retireReason(c: Candidate, now: Date, rule?: RetireRule): string | null {
  if (c.lifecycle === 'archived') return null;   // 사람이 보관한 것은 건드리지 않는다
  if (c.lifecycle === 'retired') return null;    // 이미 내려가 있다

  const maxAge = maxAgeOf(c.origin.discoveryId, rule);
  if (maxAge > 0) {
    const age = daysBetween(c.origin.runAt, now);
    if (age > maxAge) return `${maxAge}일 넘게 다시 안 잡힘 (마지막 ${observedDay(c.origin.runAt)})`;
  }

  const maxMiss = rule?.maxMissDays ?? MAX_MISS_DAYS;
  if (maxMiss > 0 && (c.misses ?? 0) >= maxMiss) {
    return `회차 ${maxMiss}일 연속 못 물어옴`;
  }
  return null;
}

/**
 * 한 회차가 끝난 뒤 그 판정기의 후보를 훑어 정리한다.
 *
 * 이번에 잡힌 이름(`seen`)은 미포착을 0으로 되돌린다. 안 잡힌 것은 **하루에 한 번만**
 * 센다 — 같은 날 세 번 돌리면 미포착도 세 번이 되어, 손으로 몇 번 눌러 본 것만으로
 * 멀쩡한 후보가 내려간다.
 */
export function sweep(
  candidates: Candidate[],
  input: { discoveryId: string; seen: Set<string>; at: string; rule?: RetireRule },
): { changed: Candidate[]; retired: { id: string; subject: string; why: string }[] } {
  const now = new Date(input.at);
  const day = observedDay(input.at);
  const changed: Candidate[] = [];
  const retired: { id: string; subject: string; why: string }[] = [];

  for (const c of candidates) {
    if (c.origin.discoveryId !== input.discoveryId) continue;
    if (c.lifecycle === 'archived') continue;

    let next = c;
    if (input.seen.has(c.id)) {
      // 이번에 잡혔다. 미포착을 지운다 — 되살리기는 upsert 가 한다.
      if (next.misses || next.missDay) next = { ...next, misses: 0, missDay: undefined };
    } else if (next.missDay !== day) {
      next = { ...next, misses: (next.misses ?? 0) + 1, missDay: day };
    }

    const why = retireReason(next, now, input.rule);
    if (why) {
      next = { ...next, lifecycle: 'retired' };
      retired.push({ id: next.id, subject: next.subject, why });
    }
    if (next !== c) changed.push(next);
  }
  return { changed, retired };
}
