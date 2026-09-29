import Link from 'next/link';
import { notFound } from 'next/navigation';
import { NEED_LABEL, grammarById, grammarsWithEvidence } from '@/lib/core/grammar';
import { RECIPES, SCOPE, frameOf, stepsOf } from '@/lib/core/recipe';
import { EvidenceCard } from '@/components/evidence-card';
import { listCandidates, listPosts, listRuns } from '@/lib/core/store';
import {
  ACCENT,
  BODY,
  CARD_LINE,
  INK,
  INNER_LINE,
  KIND_ASK,
  KIND_LABEL,
  LINKC,
  MUTED,
  OK,
  OK_LINE,
  WARN,
  WARN_LINE,
} from '@/components/grammar-style';

export const dynamic = 'force-dynamic';

/**
 * 방식 상세 — **화면은 하나다.**
 *
 * `kind` 에 따라 「만드는 순서」 블록의 내용만 바뀐다. 화면을 네 개 만들지 않는다 —
 * 라우트가 이미 여덟 개고 그게 복잡함의 원인이었다.
 */
export default async function GrammarDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const base = grammarById(id);
  if (!base) notFound();

  const [candidates, posts, runs] = await Promise.all([listCandidates(), listPosts(), listRuns()]);
  const asOf = runs[0]?.at ?? new Date().toISOString();
  const g = grammarsWithEvidence(candidates, posts, asOf).find((x) => x.id === id)!;
  const recipe = RECIPES[frameOf(g)];
  const steps = stepsOf(g.id);
  /*
   * 단계가 적어 둔 소재 이름을 **지금 근거 목록의 자리 번호**로 바꾼다.
   * 순서는 신선도에 따라 데이터가 정하므로 번호를 적어 둘 수 없다. 목록에서 빠진
   * 소재는 번호가 없으니 조용히 뺀다 — 없는 번호를 가리키면 근거가 아니라 소음이다.
   */
  const at = new Map(g.evidence.map((e, i) => [e.subject, i + 1]));
  const refs = (names: string[]): number[] =>
    names.map((n) => at.get(n)).filter((v): v is number => typeof v === 'number');

  return (
    <div className="flex flex-col gap-5">
      {/* 「이번 주 방식」은 없어진 낱말이다 (`docs/WORDS.md` §15). 이 화면의 부모는 방식 목록이다. */}
      <Link href="/grammars" className="text-[14px]" style={{ color: MUTED }}>
        ← 방식
      </Link>

      <header>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[30px] font-bold tracking-[-1px] sm:text-[38px]" style={{ color: INK }}>
            {g.name}
          </h1>
          <span
            className="rounded-[5px] px-2.5 py-1 text-[11px] font-semibold"
            style={{ background: '#EFEDFB', color: LINKC }}
          >
            {KIND_LABEL[g.kind]}
          </span>
          <span className="text-[13px]" style={{ color: MUTED }}>
            근거 <span className="num">{g.evidence.length}</span>건
            {g.freshness !== null && <> · 최근 한 달 <span className="num">{g.freshness}</span>%</>}
          </span>
        </div>
        <p className="mt-2.5 max-w-[860px] text-[16px] leading-[1.65]" style={{ color: BODY }}>
          {g.desc}
        </p>
        {/* 무엇으로 만드나 + 물건이 있어야 하나. 질문 1·2 와 같은 말이다. */}
        <div className="mt-3.5 flex flex-wrap gap-2">
          <span
            className="rounded-full px-3 py-1.5 text-[12px] font-bold"
            style={{ background: '#E6E1FA', color: LINKC }}
          >
            {KIND_ASK[g.kind]}으로 만듭니다
          </span>
          <span
            className="rounded-full px-3 py-1.5 text-[12px]"
            style={
              g.need.item
                ? { background: '#E6E1FA', color: LINKC, fontWeight: 700 }
                : { background: '#EFEFF6', color: '#8B89A6' }
            }
          >
            소개할 {NEED_LABEL.item}·가게 {g.need.item ? '필요' : '불필요'}
          </span>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-[13px] p-6" style={{ background: '#fff', border: `1px solid ${CARD_LINE}` }}>
          <div className="flex flex-wrap items-baseline gap-2.5">
            <h2 className="text-[17px] font-bold" style={{ color: INK }}>
              만드는 순서
            </h2>
            <span className="text-[13px]" style={{ color: MUTED }}>
              {recipe.frame}
            </span>
          </div>
          {steps ? (
            <>
              <ol className="mt-4 flex flex-col gap-3.5">
                {steps.steps.map((st, i) => (
                  <li key={i} className="flex gap-3">
                    <span
                      className="mt-0.5 flex h-[21px] w-[21px] shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white"
                      style={{ background: ACCENT }}
                    >
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-[15px] leading-[1.6]" style={{ color: INK }}>
                        {st.do}
                      </p>
                      {/* 줄마다 근거가 붙는다. 번호는 오른쪽 근거 목록의 자리다. */}
                      <p className="mt-1 text-[13px] leading-[1.55]" style={{ color: MUTED }}>
                        {st.cite}
                        {refs(st.from).length > 0 && (
                          <> — 근거 <span className="num">{refs(st.from).join('·')}</span></>
                        )}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="mt-4 border-t pt-4" style={{ borderColor: INNER_LINE }}>
                <div className="mb-1.5 text-[13px] font-bold" style={{ color: WARN }}>
                  피할 것
                </div>
                <p className="text-[14px] leading-[1.6]" style={{ color: BODY }}>
                  {steps.avoid.text}
                  {refs(steps.avoid.from).length > 0 && (
                    <span style={{ color: MUTED }}>
                      {' '}— 근거 <span className="num">{refs(steps.avoid.from).join('·')}</span>
                    </span>
                  )}
                </p>
              </div>
            </>
          ) : (
            /* 만드는 순서를 낼 만큼 원문이 없을 때. 그 섹션만 이 문구로 대체한다 (WORDS.md §17). */
            <p className="mt-4 text-[14px]" style={{ color: MUTED }}>
              근거가 아직 얇습니다
            </p>
          )}
        </section>

        <section>
          <h2 className="mb-3.5 text-[17px] font-bold" style={{ color: INK }}>
            지금 이걸 하고 있는 것
          </h2>
          <div className="flex flex-col gap-3.5">
            {g.evidence.map((e) => (
              <EvidenceCard key={e.candidateId} e={e} />
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-[13px] px-6 py-5" style={{ background: '#fff', border: `1px solid ${CARD_LINE}` }}>
        <div className="mb-3.5 flex flex-wrap items-baseline gap-3">
          <h2 className="text-[17px] font-bold" style={{ color: INK }}>
            어디까지 써도 되나
          </h2>
          <p className="text-[13px]" style={{ color: MUTED }}>
            방식 자체는 형식이라 저작권 대상이 아닙니다. 아래는 위 근거의{' '}
            <b style={{ color: INK }}>캐릭터를 그대로 쓸 때</b>의 이야기입니다
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {SCOPE.map((row) => (
            <div
              key={row.where}
              className="pl-3.5"
              style={{ borderLeft: `3px solid ${row.clear ? OK_LINE : WARN_LINE}` }}
            >
              <div
                className="mb-1.5 text-[14px] font-bold"
                style={{ color: row.clear ? OK : WARN }}
              >
                {row.where} — {row.verdict}
              </div>
              <p className="text-[13px] leading-[1.55]" style={{ color: BODY }}>
                {row.detail}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
