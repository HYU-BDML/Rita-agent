import type { Evidence } from './candidate';

/**
 * 추적이 붙이는 근거를 받아 합친다.
 *
 * 추적은 매일 돈다. 그냥 이어 붙이면 근거가 끝없이 쌓인다 — 후보 하나가 하루 최대
 * 12건씩 받으므로 한 달이면 300건이 넘고, 상세 화면은 그걸 전부 그리고 db.json 은
 * 그만큼 부푼다. 파일 하나로 굴리는 저장소라 이게 곧 전체 쓰기 비용이다.
 *
 * 그렇다고 오래된 것부터 자르면 안 된다. **맨 앞은 수집이 붙인 근거**이고, 그것이
 * 이 후보를 후보로 만든 판정의 밑천이다. 그걸 밀어내면 화면에는 추적으로 주워 온
 * 기사만 남고 왜 후보가 됐는지가 사라진다.
 *
 * 그래서 앞을 고정하고 뒤에서 민다 — 수집 근거 KEEP_FIRST 건은 그대로 두고,
 * 넘치면 그 뒤에서 가장 오래된 것부터 뺀다.
 */
export const KEEP_FIRST = 12;
export const MAX_EVIDENCE = 48;

/** 한 회차가 한 후보에 붙일 수 있는 새 근거 수. 하루치 상한이다. */
export const MAX_NEW_PER_RUN = 12;

/**
 * 이미 있는 url 은 다시 넣지 않는다. 같은 기사가 며칠 연속 잡히기 때문이다.
 *
 * **거르기가 자르기보다 먼저다.** 반대로 하면 이미 아는 기사가 앞을 채운 날
 * 새 기사를 하나도 못 줍는다 — 오래 추적한 후보일수록 그렇게 된다.
 */
export function mergeEvidence(existing: Evidence[], additions: Evidence[]): Evidence[] {
  const known = new Set(existing.map((evidence) => evidence.url));
  const fresh = additions
    .filter((evidence) => evidence.url && !known.has(evidence.url))
    .slice(0, MAX_NEW_PER_RUN);
  const merged = [...existing, ...fresh];
  if (merged.length <= MAX_EVIDENCE) return merged;

  const keep = Math.min(KEEP_FIRST, merged.length);
  const tail = MAX_EVIDENCE - keep;
  return [...merged.slice(0, keep), ...merged.slice(merged.length - tail)];
}

/**
 * 다시 세운 근거에 **추적이 모아 온 것만** 되붙인다.
 *
 * 재정규화는 저장된 원본으로 후보를 새로 세운다. 그게 요점이다 — 규칙을 고치면 표가
 * 따라와야 한다. 그런데 추적이 붙인 기사는 원본에 없어서 그때마다 사라진다.
 * 2026-09-22 갈래를 소급하려고 한 번 돌렸더니 칸라이언즈의 근거가 13건에서 8건이 됐다.
 *
 * 수집이 낸 근거는 새로 세운 것을 쓴다(그래야 규칙 변경이 반영된다). 추적이 낸 것만
 * 뒤에 이어 붙이고, 같은 url 은 새로 세운 쪽을 남긴다.
 */
export function keepTracked(rebuilt: Evidence[], previous: Evidence[]): Evidence[] {
  const tracked = previous.filter((evidence) => evidence.via === 'tracking');
  if (!tracked.length) return rebuilt;
  return mergeEvidence(rebuilt, tracked.slice(-MAX_EVIDENCE));
}
