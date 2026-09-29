import type { Grade } from '@/lib/core/trend';

/**
 * 판정 등급 3단 (9/20 지시서 T2).
 *
 * 이 배지가 있는 이유는 **빈칸을 없애는 것**이다. 캐릭터는 급등 축으로 안 보기 때문에
 * `SurgeMeter` 가 아무것도 안 그리고 지나간다(설계다). 그 자리가 비면 보는 사람은
 * 고장으로 읽는다. 그래서 "얼마나 뜨나" 대신 "몇 번 봤나"를 적는다.
 *
 * 색만으로 뜻을 전하지 않는다 — 말과 날짜가 항상 함께 붙는다. 급등 미터와 같은 규칙이다.
 *
 * **날짜를 꼭 같이 보여준다.** 09-06 에 한 번 보고 열흘째 안 잡힌 것과 오늘 처음 잡힌 것이
 * 같은 "새로 포착" 배지를 달면 오해가 생긴다. 날짜가 옆에 있으면 사람이 구분한다.
 */
const TONE: Record<Grade['level'], { bg: string; fg: string }> = {
  fresh: { bg: 'var(--flat)', fg: 'var(--ink-2)' },
  tentative: { bg: 'color-mix(in srgb, var(--rita-blue) 12%, transparent)', fg: 'var(--ink-2)' },
  // 확정만 그라데이션이다 (네 자리 중 둘째). 제일 귀한 상태라 여기에만 쓴다 —
  // 잠정까지 그라데이션을 주면 둘이 안 갈리고 화면이 무지개가 된다.
  confirmed: { bg: 'var(--grad)', fg: '#fff' },
};

/** 관측일 수를 말로. 배지만 보고도 "몇 번"이 읽혀야 한다. */
function detail(g: Grade): string {
  if (!g.days) return '아직 관측 없음';
  return g.days === 1 ? '1일 관측' : `${g.days}일 관측`;
}

export function GradeBadge({ grade, showDetail = false }: { grade: Grade; showDetail?: boolean }) {
  const tone = TONE[grade.level];
  return (
    <span className="inline-flex items-baseline gap-1.5 text-[12px]">
      <span
        className="rounded px-1.5 py-0.5 text-[11px] font-medium"
        style={{ background: tone.bg, color: tone.fg }}
        title={`${detail(grade)}${grade.lastSeen ? ` · 마지막 ${grade.lastSeen}` : ''}`}
      >
        {grade.label}
      </span>
      {grade.lastSeen && (
        <span className="num" style={{ color: 'var(--ink-muted)' }}>
          {grade.lastSeen.slice(5)}
        </span>
      )}
      {showDetail && (
        <span style={{ color: 'var(--ink-muted)' }}>{detail(grade)}</span>
      )}
    </span>
  );
}
