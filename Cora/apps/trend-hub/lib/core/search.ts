import type { Candidate } from './candidate';

/**
 * 저장된 후보 안에서 찾기.
 *
 * 외부 플랫폼에 묻지 않는다 — 검색창에 글자가 들어갈 때마다 유료 수집을 부를 수는 없다.
 * 이미 들어와 있는 것에서 먼저 찾고, 밖으로 나가는 것은 사람이 따로 눌러야 한다.
 */

/**
 * 표기 흔들림을 지운 뒤 견준다. `store.key()` 와 같은 생각인데 여기서는 공백을 살린다 —
 * 낱말 단위로 끊어 찾기 때문이다.
 *
 * NFKC 를 거치지 않으면 전각으로 적힌 이름이 반각 검색어에 안 걸린다. 지금 저장된 후보
 * 중 116건이 NFKC 로 글자가 바뀐다. 아직 검색 결과가 갈린 적은 없지만, 걸리는 날에는
 * '왜 안 나오지'로 보이고 원인이 보이지 않는다.
 */
export function fold(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('ko-KR');
}

/** 검색이 훑는 자리. **별칭을 빼면 안 된다** — 'chiikawa' 로 치이카와가 안 나왔다. */
function haystackOf(candidate: Candidate): string {
  return fold(
    [
      candidate.subject,
      ...(candidate.aliases ?? []),
      candidate.why,
      candidate.summary,
      ...candidate.evidence.flatMap((evidence) => [evidence.source, evidence.title, evidence.excerpt]),
    ]
      .filter(Boolean)
      .join(' '),
  );
}

/** 관련도순, 같으면 최신순. 자르지 않는다 — 몇 건인지 세는 쪽도 이 결과를 쓴다. */
export function search(candidates: Candidate[], query: string): Candidate[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  return candidates
    .filter((candidate) => {
      const haystack = haystackOf(candidate);
      return words.every((word) => haystack.includes(word));
    })
    .sort((a, b) => searchRank(b, query) - searchRank(a, query) || b.origin.runAt.localeCompare(a.origin.runAt));
}

export function searchRank(candidate: Candidate, query: string): number {
  const needle = fold(query);
  // 별칭도 이름이다. '먼작귀'로 찾은 사람에게 치이카와는 정확히 그것이다.
  const names = [candidate.subject, ...(candidate.aliases ?? [])].map(fold);
  if (names.some((name) => name === needle)) return 3;
  if (names.some((name) => name.startsWith(needle))) return 2;
  if (names.some((name) => name.includes(needle))) return 1;
  return 0;
}
