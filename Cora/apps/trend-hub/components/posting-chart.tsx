import type { PostingSeries } from '@/lib/core/series';

/**
 * 게시 시점 분포 (지시서 P5 — 변화 그래프).
 *
 * **폼.** 시간에 따른 한 계열이라 선이다. 계열이 하나뿐이라 범례를 두지 않는다 —
 * 제목이 그 계열의 이름이다. 색은 한 가지(`--up`)만 쓰고 정체가 아니라 크기를 말한다.
 *
 * **점선과 실선.** 왼쪽은 소급으로 역산한 구간이라 관측한 선이 아니다. 검색이 건져 준
 * 표본이지 그 달의 실제 게시량이 아니다. 오른쪽은 우리가 보는 동안 쌓인 것이다.
 * 색으로만 가르지 않는다 — 선꼴이 다르고, 경계에 말이 붙고, 아래에 편수도 적는다.
 *
 * **라이브러리를 안 쓴다.** 점 일곱 개짜리 선에 차트 라이브러리를 물리면 번들만 는다.
 * 호버는 각 점의 `<title>` 로 준다. JS 를 한 줄도 안 싣고 브라우저가 띄워 준다.
 */
const W = 520;
const H = 132;
const PAD = { top: 12, right: 14, bottom: 26, left: 26 };

function monthLabel(m: string): string {
  return `${Number(m.slice(5))}월`;
}

export function PostingChart({ series, subject }: { series: PostingSeries; subject: string }) {
  const { months, observedFrom, backfilled, observed, peak } = series;

  // 점이 둘 이하면 선을 긋지 않는다. 두 점을 이으면 없는 추세가 그럴듯해 보인다.
  if (months.length < 2) {
    return (
      <p className="text-[12px]" style={{ color: 'var(--ink-muted)' }}>
        게시 시점이 한 달 안에 몰려 있어 아직 그릴 선이 없습니다. 지금까지 {backfilled + observed}편.
      </p>
    );
  }

  const max = Math.max(...months.map((m) => m.count), 1);
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (months.length === 1 ? iw / 2 : (i / (months.length - 1)) * iw);
  const y = (v: number) => PAD.top + ih - (v / max) * ih;

  const line = months.map((m, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(m.count).toFixed(1)}`).join(' ');
  const area = `${line} L${x(months.length - 1).toFixed(1)},${(PAD.top + ih).toFixed(1)} L${x(0).toFixed(1)},${(PAD.top + ih).toFixed(1)} Z`;

  /*
   * 경계는 달 안쪽에 떨어진다(첫 관측 09-17 은 9월 한가운데다). 달 눈금에 반올림하면
   * 역산 구간이 그 달만큼 넓어지거나 좁아진다. 날짜 비율로 정확히 찍는다.
   */
  const bMonth = observedFrom.slice(0, 7);
  const bi = months.findIndex((m) => m.month === bMonth);
  const dim = new Date(Number(bMonth.slice(0, 4)), Number(bMonth.slice(5)), 0).getDate();
  const frac = (Number(observedFrom.slice(8)) - 1) / dim;
  const raw = bi < 0 ? (observedFrom < months[0].month ? PAD.left : PAD.left + iw) : x(bi) + frac * (iw / (months.length - 1));
  // 경계가 마지막 달 안쪽이면 그 뒤에 이을 칸이 없어 눈금 밖으로 나간다. 안쪽에 묶는다.
  const bx = Math.max(PAD.left, Math.min(raw, PAD.left + iw));
  /*
   * 첫 관측이 마지막 달 안쪽이면 실선으로 그릴 폭이 사실상 없다. 그게 지금 상태다 —
   * 09-17 에 처음 봤고 오늘이 09-17 이라 관측 구간이 하루도 안 된다. 그런데 설명만
   * "실선 N편"이라고 하면 화면에 없는 선을 가리키게 된다. 말도 같이 바꾼다.
   * 회차가 쌓이고 달이 넘어가면 저절로 풀린다 — 경계는 09-17 에 고정이고 오른쪽이 자란다.
   */
  const solidVisible = PAD.left + iw - bx > 6;

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
        aria-label={`${subject} 월별 게시 편수. 역산 ${backfilled}편, 관측 ${observed}편.`}>
        <defs>
          {/* 한 선을 두 번 그린다 — 경계 왼쪽은 점선, 오른쪽은 실선. */}
          <clipPath id="pc-past"><rect x="0" y="0" width={bx} height={H} /></clipPath>
          <clipPath id="pc-now"><rect x={bx} y="0" width={W - bx} height={H} /></clipPath>
        </defs>

        {/* 눈금은 뒤로 물러나 있어야 한다. 데이터가 앞이다. */}
        <line x1={PAD.left} y1={PAD.top + ih} x2={W - PAD.right} y2={PAD.top + ih}
          stroke="var(--hairline)" strokeWidth="1" />

        <path d={area} fill="var(--up)" opacity="0.08" clipPath="url(#pc-past)" />
        <path d={area} fill="var(--up)" opacity="0.16" clipPath="url(#pc-now)" />
        <path d={line} fill="none" stroke="var(--up)" strokeWidth="2" strokeDasharray="4 3"
          opacity="0.55" clipPath="url(#pc-past)" />
        <path d={line} fill="none" stroke="var(--up)" strokeWidth="2" clipPath="url(#pc-now)" />

        {/* 관측이 시작된 자리. 선 하나로는 안 읽히므로 말을 붙인다. */}
        <line x1={bx} y1={PAD.top - 4} x2={bx} y2={PAD.top + ih} stroke="var(--ink-muted)"
          strokeWidth="1" strokeDasharray="2 2" />
        <text x={Math.min(bx + 4, W - PAD.right - 52)} y={PAD.top + 4} fontSize="9.5" fill="var(--ink-muted)">
          여기부터 관측
        </text>

        {months.map((m, i) => (
          <g key={m.month}>
            {/* 마크는 8px 이상. 서페이스 링을 둘러 선 위에서도 떨어져 보이게 한다. */}
            <circle cx={x(i)} cy={y(m.count)} r="3.5" fill="var(--up)"
              stroke="var(--surface)" strokeWidth="2" opacity={m.observed ? 1 : 0.6}>
              <title>{`${m.month} · ${m.count}편${m.observed ? ' (관측 중)' : ' (역산)'}`}</title>
            </circle>
            <text x={x(i)} y={H - 8} fontSize="10" textAnchor="middle" fill="var(--ink-muted)">
              {monthLabel(m.month)}
            </text>
          </g>
        ))}

        {/* 값은 골라서만 적는다. 점마다 숫자를 찍으면 선이 안 읽힌다. */}
        {peak && (() => {
          // 봉우리가 천장에 붙으면 라벨이 위로 잘린다. 그때는 점 아래에 적는다.
          const py = y(peak.count);
          const above = py - 8 >= 10;
          return (
            <text x={x(months.findIndex((m) => m.month === peak.month))} y={above ? py - 8 : py + 15}
              fontSize="10" textAnchor="middle" fill="var(--ink-2)" className="num">
              {peak.count}
            </text>
          );
        })()}
      </svg>

      <figcaption className="mt-1 text-[12px] leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
        월별 게시 편수. <span style={{ color: 'var(--ink-2)' }}>점선 {backfilled}편</span> 은 영상 게시일에서
        역산한 것이라 관측한 값이 아닙니다 — 검색이 건져 준 표본이지 그 달의 실제 게시량이 아닙니다.{' '}
        {solidVisible ? (
          <>
            <span style={{ color: 'var(--ink-2)' }}>실선 {observed}편</span> 은 {observedFrom.slice(5)} 첫 관측
            이후 쌓인 것입니다.
          </>
        ) : (
          <>
            {observedFrom.slice(5)} 에 처음 봤고 그 뒤로 <span style={{ color: 'var(--ink-2)' }}>{observed}편</span>
            이라, 아직 실선으로 그릴 구간이 없습니다. 회차가 쌓이면 오른쪽부터 실선이 됩니다.
          </>
        )}
      </figcaption>
    </figure>
  );
}
