import Link from 'next/link';

/**
 * 회차 상태 줄 — 목록 맨 위 흰 카드 한 줄 (docs/UI-지시서.md 2장).
 *
 * 있어야 하는 이유는 **회차가 데이터의 나이를 정하기 때문**이다. 목록에 68건이
 * 떠 있으면 사람은 그게 지금 값이라고 읽는다. 마지막 회차가 사흘 전이면 사흘 전
 * 값이다. 그 차이를 목록 위에 한 줄로 적지 않으면 어디에도 적을 자리가 없다.
 *
 * **지시서 5장(자동 실행)은 아직 없다.** 없는 것을 있는 척 적지 않는다 — 회색 점에
 * "자동 실행 꺼짐"으로 두고, 켜지면 이 컴포넌트에 요일·시각을 넘기면 된다.
 * 초록 점(#3fb27a)은 그때 쓴다.
 */
export function RunStatus({
  lastAt,
  count,
}: {
  /** 마지막 회차 시각 (ISO). 회차가 한 번도 없으면 null. */
  lastAt: string | null;
  /** 지금 목록에 살아 있는 건수. */
  count: number;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5"
      style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 13 }}
    >
      <span
        className="inline-block shrink-0 rounded-full"
        style={{ width: 7, height: 7, background: 'var(--dim)' }}
        aria-hidden
      />
      <span className="text-[12.5px]" style={{ color: 'var(--ink-2)' }}>
        자동 실행 꺼짐 — 지금은 <strong className="font-semibold">캐릭터 찾기</strong>를 눌러야 돕니다
      </span>
      <span className="num ml-auto text-[12px]" style={{ color: 'var(--mute)' }}>
        {lastAt ? `마지막 회차 ${when(lastAt)}` : '아직 돌린 회차가 없습니다'}
        {'  ·  '}
        {count}건
      </span>
      <Link
        href="/runs"
        className="shrink-0 text-[12px] font-medium underline underline-offset-2"
        style={{ color: 'var(--rita-blue)' }}
      >
        회차 기록
      </Link>
    </div>
  );
}

/** 서울 기준 "09-19 02:20". 연도는 뺀다 — 한 줄에 들어가야 하고 올해 것만 본다. */
function when(at: string): string {
  const t = new Date(at);
  if (Number.isNaN(t.getTime())) return at.slice(5, 16).replace('T', ' ');
  /*
   * 부분으로 받아 직접 잇는다. 로캘 문자열을 정규식으로 다듬으면 "09. 19. 02:20"
   * 의 점 두 개가 같이 걸려 "09-19-02:20" 이 된다 — 실제로 그랬다.
   */
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .formatToParts(t)
      .map((x) => [x.type, x.value]),
  );
  return `${p.month}-${p.day} ${p.hour}:${p.minute}`;
}
