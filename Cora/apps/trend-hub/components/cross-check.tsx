import type { CrossCheckLabel } from '@/lib/core/cross-check';

/**
 * 교차 확인 배지. 색만으로 뜻을 전하지 않는다 — 말이 먼저고 색은 거들 뿐이다.
 *
 * 얇은 쪽을 빨갛게 칠하지 않는다. 고장이 아니라 **아직 확인이 덜 된 상태**다.
 * 경고색을 쓰면 사람이 그걸 오류로 읽고, 실제로는 멀쩡한 개인 창작자 후보가 불량품처럼 보인다.
 */
const TONE: Record<CrossCheckLabel['level'], { bg: string; fg: string }> = {
  multi: { bg: 'color-mix(in srgb, var(--up) 16%, transparent)', fg: 'var(--ink)' },
  brand: { bg: 'var(--flat)', fg: 'var(--ink-2)' },
  single: { bg: 'var(--flat)', fg: 'var(--ink-muted)' },
};

export function CrossCheckBadge({ cross }: { cross: CrossCheckLabel }) {
  const tone = TONE[cross.level];
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[11px] font-medium"
      style={{ background: tone.bg, color: tone.fg }}
      title={cross.detail}
    >
      {cross.label}
    </span>
  );
}
