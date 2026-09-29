import { grammarsWithEvidence, toView } from '@/lib/core/grammar';
import { listCandidates, listPosts, listRuns } from '@/lib/core/store';
import { GrammarBoard } from '@/components/grammar-board';
import { readForm, readItem } from '@/lib/core/answers';

export const dynamic = 'force-dynamic';

/**
 * 방식 목록 — 층 1 의 새 축 (`docs/PROMPT.md` §4).
 *
 * 보드는 `components/grammar-board.tsx` 를 그대로 쓴다. 브리프(`/`)와 같은 컴포넌트다 —
 * 질문 흐름을 두 곳에 따로 짜면 한쪽만 고쳐지는 날이 온다.
 *
 * 히어로는 여기 없다. 히어로는 브리프의 것이고, 이 화면은 상단바에서 「방식」을 눌러
 * 들어온 사람이 보는 목록이라 한 문장을 다시 읽을 이유가 없다.
 *
 * **당분간 `/` 와 이 화면이 같은 것을 보여준다.** 의도한 것이다 — 세션 4 가 `/` 를
 * 브리프로 바꿀 때까지 비워 두면 그 사이 첫 화면이 빈다.
 */
export default async function Grammars({
  searchParams,
}: {
  searchParams: Promise<{ form?: string; item?: string }>;
}) {
  /* 질문 1·2 의 답은 주소에 있다. 새로고침해도 같은 상태로 열린다. */
  const q = await searchParams;
  const [candidates, posts, runs] = await Promise.all([listCandidates(), listPosts(), listRuns()]);
  /* 신선도의 기준일은 마지막으로 본 날이다. 오늘로 재면 수집이 멈춘 동안 값이 함께 내려간다. */
  const asOf = runs[0]?.at ?? new Date().toISOString();
  const grammars = grammarsWithEvidence(candidates, posts, asOf);

  return (
    <div className="flex flex-col gap-[22px]">
      {/* 상단바의 낱말과 글자까지 같다 (`docs/WORDS.md` §13-1). */}
      <h1 className="text-xl font-semibold tracking-tight">방식</h1>
      <GrammarBoard
        grammars={grammars.map(toView)}
        more="explore"
        form={readForm(q.form)}
        item={readItem(q.item)}
      />
    </div>
  );
}
