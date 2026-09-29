/**
 * 직전 회차 대비.
 *
 * 차트가 아니라 숫자다. 회차가 두세 번뿐이고 읽는 사람이 할 일은
 * '지난번보다 올랐나 내렸나, 얼마나'뿐이라 점 세 개짜리 선을 그릴 자리가 아니다.
 * 급등 미터(SurgeMeter)와 같은 판단이다.
 *
 * 색만으로 뜻을 전하지 않는다. 화살표와 배수와 말이 항상 함께 붙는다.
 */
export function GrowthDelta({ growth, runs }: { growth: number | null; runs: number }) {
  if (runs < 2) {
    return (
      <span className="text-[12px]" style={{ color: 'var(--ink-muted)' }}>
        회차 1번 — 비교할 지난 값이 없습니다
      </span>
    );
  }
  if (growth == null) {
    return (
      <span className="text-[12px]" style={{ color: 'var(--ink-muted)' }}>
        지난 회차와 잰 축이 달라 비교하지 못했습니다
      </span>
    );
  }

  // 5% 안쪽은 흔들림으로 본다. 오차를 방향으로 읽으면 없는 추세가 보인다.
  const flat = growth >= 0.95 && growth <= 1.05;
  const up = growth > 1.05;
  const color = flat ? 'var(--ink-2)' : up ? 'var(--up)' : 'var(--down)';

  return (
    <span className="inline-flex items-baseline gap-1.5 text-[12px]">
      <span style={{ color }} aria-hidden>
        {flat ? '→' : up ? '↑' : '↓'}
      </span>
      <span className="num font-medium" style={{ color }}>
        {growth}×
      </span>
      <span style={{ color: 'var(--ink-muted)' }}>
        지난 회차 대비 {flat ? '그대로' : up ? '오름' : '내림'}
      </span>
    </span>
  );
}
