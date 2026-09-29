import Link from 'next/link';
import { grammarsWithEvidence } from '@/lib/core/grammar';
import { weekly } from '@/lib/core/weekly';
import { listCandidates, listPosts, listRuns } from '@/lib/core/store';
import { EvidenceCard } from '@/components/evidence-card';
import {
  BODY,
  CARD_LINE,
  HERO,
  INK,
  KIND_LABEL,
  LINKC,
  MUTED,
  SUB,
} from '@/components/grammar-style';

export const dynamic = 'force-dynamic';

/**
 * 브리프 — **한 장.**
 *
 * 전에는 이 자리가 `/grammars` 와 같은 방식 목록이었다. 처음 온 사람이 12칸 메뉴를 먼저
 * 받는다 — 무엇을 고를지 모르는 사람에게 고르라고 하는 화면이었다. 목록은 `/grammars` 에
 * 그대로 있고 상단바의 「방식」이 거기로 간다.
 *
 * **이 화면은 하나만 말한다.** 이번 주에 가장 넓게 퍼진 방식 하나, 그 근거 한 장, 그리고
 * 그 숫자가 나에게 뜻하는 것. 목록도 만드는 순서도 여기 없다.
 *
 * **예측을 말하지 않는다.** 「이번 주 뜨는」·「추천」·「곧 뜰」 같은 말을 쓰지 않는다.
 * 관측이 열흘이다. 주별 추이나 상승·하락도 그리지 않는다 — 수집 회차가 과거 2주까지만
 * 닿아서 그보다 오래된 주가 무조건 낮게 나오고, 그리면 무엇이든 전부 상승으로 보인다.
 */
export default async function Home() {
  const [candidates, posts, runs] = await Promise.all([listCandidates(), listPosts(), listRuns()]);
  /* 신선도의 기준일은 마지막으로 본 날이다. 오늘로 재면 수집이 멈춘 동안 값이 내려간다. */
  const asOf = runs[0]?.at ?? new Date().toISOString();
  const grammars = grammarsWithEvidence(candidates, posts, asOf);
  const w = weekly(grammars, posts, asOf, runs.map((r) => r.at));

  if (!w) {
    /* `docs/WORDS.md` §12. 억지로 채우거나 얇은 방식을 끌어올리지 않는다. */
    return (
      <p className="text-[14px]" style={{ color: MUTED }}>
        근거가 아직 얇습니다
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-[22px]">
      {/*
        히어로 — `docs/WORDS.md` §3 그대로. 「방식」 한 단어만 보라색이다.

        흐름 3칸은 여기 없다. §3 이 그것을 「질문 위」에 두라고 했고 질문은 `/grammars` 에
        있다. 질문 없는 화면에 흐름만 놓으면 다음에 무엇을 누를지 가리키지 않는다.
      */}
      <section className="rounded-[14px] px-6 py-8 sm:px-9" style={{ background: HERO }}>
        <p className="text-[13px] font-bold" style={{ color: '#A79BF5' }}>
          {weekLabel(w.asOfDay)}
        </p>
        <h1 className="mt-2.5 text-[24px] font-bold leading-[1.4] tracking-[-0.4px] text-white sm:text-[31px]">
          뜨는 캐릭터는 빌릴 수 없습니다.
          <br />
          뜨는 <em className="not-italic" style={{ color: '#A79BF5' }}>방식</em>은 빌릴 수 있습니다.
        </h1>
        <p className="mt-3 max-w-[800px] text-[14px] leading-[1.65] sm:text-[15px]" style={{ color: SUB }}>
          캐릭터를 쓰려면 라이선스가 필요하지만, 그 캐릭터가 소비되는 <b>방식</b>은 누구나 그대로 씁니다.
          지금 작동하는 방식에 이름을 붙여 근거와 함께 드립니다.
        </p>
      </section>

      {/* 1 기준 줄 — 하단 한 줄과 같은 값을 맨 위에도 놓는다 (`docs/WORDS.md` §11). */}
      <p className="text-[13px]" style={{ color: MUTED }}>
        <span className="num">{w.asOfDay}</span> 기준 · 관측 <span className="num">{w.days}</span>일 ·
        근거 <span className="num">{w.sources}</span>건
      </p>

      <section
        className="flex flex-col gap-[18px] rounded-[13px] px-6 py-6"
        style={{ background: '#fff', border: `1px solid ${CARD_LINE}` }}
      >
        {/* 2 이번 주 방식 하나 — 근거가 가장 많은 것. 동점이면 신선도 높은 쪽. */}
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1
              className="text-[30px] font-bold leading-[1.2] tracking-[-0.8px]"
              style={{ color: INK }}
            >
              {w.top.name}
            </h1>
            <span
              className="rounded-[5px] px-2.5 py-1 text-[11px] font-semibold"
              style={{ background: '#EFEDFB', color: LINKC }}
            >
              {KIND_LABEL[w.top.kind]}
            </span>
          </div>
          <p className="mt-2.5 text-[16px] leading-[1.65]" style={{ color: BODY }}>
            {w.top.desc}
          </p>
        </div>

        {/* 3 그 방식의 근거 한 장 — §19 컴포넌트를 그대로 쓴다. 최고 조회 한 건. */}
        <EvidenceCard e={w.lead} />

        {/* 4 숫자 두 줄. 전부 계산값이다 — 화면에 수치를 문자열로 적지 않는다. */}
        <div className="flex flex-col gap-1.5">
          <p className="text-[15px] leading-[1.6]" style={{ color: INK }}>
            {/*
              「이 방식 전체로는」을 앞에 붙인다. 바로 위 근거 카드에도 「계정 N곳」이 있어서
              그냥 두면 같은 수의 다른 값이 두 줄에 붙어 어느 쪽이 무엇인지 안 읽힌다 —
              카드는 그 소재 하나, 이 줄은 방식 전체다.
            */}
            이 방식 전체로는 계정 <span className="num font-semibold">{w.accounts}</span>곳이 같은
            형식으로 올렸습니다
          </p>
          {/*
            조회수가 붙은 게시물이 10건 미만이면 이 줄이 없다. 표본이 적을 때 나오는
            사분위는 한 건만 달라도 크게 튄다.
          */}
          {w.p25 !== null && (
            <p className="text-[15px] leading-[1.6]" style={{ color: INK }}>
              넷 중 하나는 <span className="num font-semibold">{w.p25.toLocaleString('ko-KR')}</span>
              회를 넘지 못했습니다
            </p>
          )}
        </div>

        {/* 5 이어 주는 한 줄과 버튼. */}
        <div className="flex flex-col gap-3.5 border-t pt-5" style={{ borderColor: CARD_LINE }}>
          <p className="text-[15px] leading-[1.6]" style={{ color: BODY }}>
            넓게 퍼졌다는 건 경쟁자가 많다는 뜻이기도 합니다. 무엇으로 만들 수 있는지 골라 보세요
          </p>
          {/*
            「탐색」은 `/explore`(소재 목록)를 가리키는 말이다. 이 버튼은 `/grammars` 로
            가므로 상단바 §2 의 「방식」과 같은 낱말을 쓴다.
          */}
          <Link
            href="/grammars"
            className="self-start rounded-[9px] px-6 py-3 text-[15px] font-bold text-white"
            style={{ background: '#6C5CE0' }}
          >
            방식 고르기
          </Link>
        </div>
      </section>
    </div>
  );
}

/**
 * 「2026년 9월 넷째 주」 (`docs/WORDS.md` §3).
 *
 * 그 달의 1 일이 낀 주를 첫째 주로 센다. 달을 넘기면 다시 첫째 주다 — 사람이 "이번 주"
 * 라고 말할 때 뜻하는 것이 그것이고, ISO 주차(53주까지 가는 번호)가 아니다.
 */
function weekLabel(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const NAMES = ['첫째', '둘째', '셋째', '넷째', '다섯째', '여섯째'];
  const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  return `${y}년 ${m}월 ${NAMES[Math.floor((d + firstDow - 1) / 7)] ?? '마지막'} 주`;
}
