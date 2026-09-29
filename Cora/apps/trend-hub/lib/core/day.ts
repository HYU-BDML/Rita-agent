/**
 * 날짜 한 조각. **아무것도 import 하지 않는다.**
 *
 * `trend.ts` 안에 있던 것을 떼어 왔다. 거기 두면 `store` 가 이것을 쓰려는 순간
 * `store → retire → trend → store` 로 고리가 생긴다. 실제로 생겼고, 판정기 등록이
 * 초기화 전에 불려 테스트 절반이 통째로 안 돌았다.
 *
 * 날짜를 자르는 일은 아무것에도 기대지 않으므로 잎에 두는 것이 맞다.
 */

/**
 * 관측일 (Asia/Seoul).
 *
 * 저장값은 UTC ISO 라 그대로 잘라 쓰면 안 된다. 실제로 걸린다 — 09-05 회차는
 * `15:56Z` 라서 UTC 로는 09-05 지만 한국에서는 **09-06 00:56** 에 돌린 것이다.
 * 사람이 "언제 봤나"를 읽는 값이므로 사람이 있는 시간대로 자른다.
 *
 * 서버 시간대에 기대지 않는다. 배포 위치가 바뀌면 조용히 하루가 밀린다.
 */
export function observedDay(at: string): string {
  const t = new Date(at);
  if (Number.isNaN(t.getTime())) return at.slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(t);
}
