/**
 * 검색 급등 표시.
 *
 * 형태: 값 하나를 기준선(1.0 = 평소)에 대고 보는 것이라 diverging 미터다.
 * 차트가 아니라 미터인 이유 — 한 후보당 값이 하나뿐이고, 읽는 사람이 할 일은
 * '평소보다 위인가 아래인가, 얼마나'뿐이다. 막대 하나짜리 차트를 그릴 자리가 아니다.
 *
 * 색만으로 뜻을 전하지 않는다. 항상 숫자와 말이 함께 붙는다.
 */

export type SurgeLevel = 'up-strong' | 'up' | 'flat' | 'down' | 'unknown';

export function levelOf(surge: number | null | undefined): SurgeLevel {
  if (surge == null) return 'unknown';
  if (surge >= 3) return 'up-strong';
  if (surge >= 1.5) return 'up';
  if (surge <= 0.8) return 'down';
  return 'flat';
}

const LABEL: Record<SurgeLevel, string> = {
  'up-strong': '크게 오름',
  up: '오르는 편',
  flat: '평소와 비슷',
  down: '식는 중',
  unknown: '측정 못 함',
};

/**
 * 미터. 1.0 을 가운데 두고 좌우로 뻗는다.
 * 배수는 상한이 없어서 그대로 그리면 14배짜리 하나가 나머지를 다 눌러버린다.
 * 로그로 눌러 담되, 눈금 대신 숫자를 직접 붙여 왜곡을 보정한다.
 */
function widthFor(surge: number): { side: 'up' | 'down'; pct: number } {
  const side = surge >= 1 ? 'up' : 'down';
  const mag = side === 'up' ? surge : 1 / Math.max(surge, 0.05);
  // 1배 = 0%, 10배 = 100%
  const pct = Math.min(100, (Math.log10(mag) / 1) * 100);
  return { side, pct: Math.max(mag > 1.02 ? 6 : 0, pct) };
}

export function SurgeMeter({ surge }: { surge: number | null | undefined }) {
  const level = levelOf(surge);

  /*
   * 2026-09-17 (지시서 3-2) 못 잰 것은 화면에서 지운다.
   *
   * **전면으로 끄지 않는다.** surge 는 뉴스 후보 27/35 에서 실제로 측정된다.
   * 빈 미터에 '측정 못 함'을 붙이면 고장으로 읽히는데, 캐릭터를 surge 축으로
   * 안 보기로 한 설계일 뿐이다. 그래서 잰 것은 그대로 그리고 못 잰 것만 빠진다.
   *
   * 측정을 구현하지 말 것. 아래 코드와 LABEL.unknown 은 되돌릴 수 있게 남겨 둔다.
   */
  if (surge == null) return null;

  const { side, pct } = widthFor(surge);
  const color = side === 'up' ? 'var(--up)' : 'var(--down)';

  return (
    <div className="flex items-center gap-2">
      {/* 트랙 96px, 가운데가 1.0 */}
      <div className="relative h-1.5 w-24 rounded-full" style={{ background: 'var(--track)' }}>
        {/* 기준선 */}
        <div
          className="absolute top-[-2px] bottom-[-2px] w-px"
          style={{ left: '50%', background: 'var(--ink-muted)', opacity: 0.5 }}
        />
        <div
          className="absolute top-0 h-1.5"
          style={{
            background: color,
            width: `${pct / 2}%`,
            // 4px 둥근 데이터 끝, 기준선 쪽은 각지게
            ...(side === 'up'
              ? { left: '50%', borderRadius: '0 4px 4px 0' }
              : { right: '50%', borderRadius: '4px 0 0 4px' }),
          }}
        />
      </div>
      <span className="num text-xs font-medium" style={{ color: 'var(--ink-2)' }}>
        {surge}×
      </span>
      <span className="text-xs" style={{ color: 'var(--ink-muted)' }}>
        {LABEL[level]}
      </span>
    </div>
  );
}

/** 목록 앞머리의 작은 신호등. 미터를 못 놓는 좁은 자리에 쓴다. */
export function SurgeDot({ surge }: { surge: number | null | undefined }) {
  // 미터와 같은 규칙 (지시서 3-2). 못 잰 것에 회색 점을 찍으면 '식음'으로 읽힌다.
  if (surge == null) return null;
  const level = levelOf(surge);
  const bg =
    level === 'up-strong' || level === 'up'
      ? 'var(--up)'
      : level === 'down'
        ? 'var(--down)'
        : 'var(--flat)';
  return (
    <span
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ background: bg, outline: '2px solid var(--surface)' }}
      title={LABEL[level]}
      aria-label={LABEL[level]}
    />
  );
}

export { LABEL as SURGE_LABEL };
