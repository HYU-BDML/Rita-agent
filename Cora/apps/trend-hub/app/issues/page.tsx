import Link from 'next/link';
import type { Candidate } from '@/lib/core/candidate';
import { listCandidates, listRuns, productCounts } from '@/lib/core/store';
import { availableDiscoveries, hiddenDiscoveries } from '@/lib/core/registry';
import { runQuota } from '@/lib/core/run-limit';
import { allTrends, gradeOf, trendKey, type Grade } from '@/lib/core/trend';
import { AxisTabs } from '@/components/axis-tabs';
import { CandidateCard } from '@/components/card';
import { FindRow } from '@/components/find-row';
import type { InputField } from '@/lib/core/adapters';
import type { RunQuota as Quota } from '@/lib/core/run-limit';
import { levelOf } from '@/components/surge';
import { axisOf, visibleOnly } from '@/lib/core/axis';
import { FACETS, facetOf, isFacet } from '@/lib/core/facets';

export const dynamic = 'force-dynamic';

/**
 * 첫 화면. 여기서 사람이 할 일은 셋이다 —
 * 새로 찾기, 뜬 것 중 하나 고르기, 그리고 채택해 둔 것을 마저 만들기.
 *
 * 주제와 캐릭터를 한 목록에 섞지 않는다. 재는 축이 아예 다르기 때문이다.
 *   주제   — 여러 매체가 다뤘나 · 검색이 실제로 늘었나
 *   캐릭터 — 몇 계정이 말하나 · 만들어도 되는 권리인가
 * 섞어 놓으면 검색을 잰 적도 없는 캐릭터가 '검색은 평소' 칸에 들어앉는다.
 * 실제로 그랬다 — 그 칸 21건 중 12건이 캐릭터였고, 칸 설명은 그 12건에 거짓말이었다.
 */
/*
 * 갈래를 가르는 규칙은 lib/core/facets.ts 하나다. 홈도 같은 것을 쓴다 —
 * 두 군데 두면 같은 후보를 두 화면이 다른 칸으로 세고, 숫자가 어긋나면
 * 어느 쪽이 맞는지 화면만 봐서는 알 수 없다.
 */
export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string }>;
}) {
  const params = await searchParams;
  const selected = isFacet('issue', params.cat) ? params.cat : null;
  const [candidates, runs, products, trends] = await Promise.all([
    listCandidates(),
    listRuns(),
    productCounts(),
    allTrends(),
  ]);
  const specs = availableDiscoveries()
    // 밈은 unit 이 같지만 다른 화면의 것이다. 여기 버튼이 밈 회차를 돌리면 안 된다.
    .filter((d) => d.role === 'produces' && d.unit === 'topic' && d.id !== 'meme-native')
    .map((d) => ({ id: d.id, name: d.name, inputs: d.inputs }));
  const hiddenCount = hiddenDiscoveries().length;
  // 판정기마다 따로 센다. 상한이 나뉘었으므로 버튼마다 남은 횟수가 다르다.
  const quotas = new Map(
    await Promise.all(specs.map(async (s) => [s.id, await runQuota(s.id)] as const)),
  );

  if (!candidates.length) return <FirstRun specs={specs} hiddenCount={hiddenCount} runs={runs.length} quotas={quotas} />;

  const deco = (c: Candidate): Item => {
    const t = trends.get(trendKey(c));
    return {
      c,
      // 점이 없어도 등급은 낸다 — 후보가 있다는 건 최소 한 번 봤다는 뜻이다.
      grade: gradeOf(t?.points ?? [], c.origin.runAt),
      growth: t?.growth ?? null,
      runs: t?.points.length ?? 0,
      products: products.get(c.id) ?? 0,
    };
  };

  const adopted = candidates.filter((c) => c.review === 'adopted').map(deco);
  const toMake = adopted.filter((x) => x.products === 0);
  const made = adopted.filter((x) => x.products > 0);
  const rejected = candidates.filter((c) => c.review === 'rejected');

  // 아직 판단하지 않은 것만 가른다. 기각한 건 목록에서 내린다.
  // 안전 판정에서 막힌 것은 어느 목록에도 올리지 않는다 (lib/core/axis.ts).
  const open = visibleOnly(
    candidates.filter((c) => c.lifecycle === 'active' && (c.review === 'pending' || c.review === 'held')),
  ).shown.map(deco);
  /*
   * **축으로 가른다. unit 으로 가르지 않는다.** 밈도 unit 이 'topic' 이라
   * unit 으로 거르면 밈이 이 화면의 '검색 급등' 칸으로 흘러든다 —
   * 검색을 잰 적도 없는데 '못 잰 것' 칸에 앉는다. 2026-09-19 에 실제로 그랬다.
   */
  const allTopics = open.filter((x) => axisOf(x.c) === 'issue');
  const subjects = open.filter((x) => axisOf(x.c) === 'character');

  /*
   * 갈래로 한 단 더 가른다. 한 줄로만 쌓이면 연예 소재를 찾는 사람이 환율·정상회담을
   * 지나쳐야 한다. 세는 것은 거르기 전 전체로 한다 — 칩을 눌러 0건이 되면 다른 칩의
   * 숫자까지 0 이 되어 돌아갈 곳이 안 보인다.
   */
  const categoryCounts = new Map<string, number>();
  for (const x of allTopics) {
    const cat = facetOf(x.c);
    categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
  }
  const topics = selected ? allTopics.filter((x) => facetOf(x.c) === selected) : allTopics;

  const rising = topics.filter((x) => ['up-strong', 'up'].includes(levelOf(x.c.momentum.surge)));
  const flat = topics.filter((x) => levelOf(x.c.momentum.surge) === 'flat');
  const cooling = topics.filter((x) => levelOf(x.c.momentum.surge) === 'down');
  // '못 잰 것'을 '평소'와 같은 칸에 두지 않는다. 0 과 안 쟀음이 다른 것과 같은 이유다.
  const unmeasured = topics.filter((x) => levelOf(x.c.momentum.surge) === 'unknown');

  const last = runs[0];

  return (
    <div className="space-y-8 sm:space-y-10">
      {/* 세 갈래 탭. 메뉴에서 내려온 이슈·캐릭터·밈이다 (components/axis-tabs.tsx). */}
      <AxisTabs current="issue" />

      <div className="space-y-5">
        <div className="relative overflow-hidden rounded-2xl px-5 py-5 sm:px-7 sm:py-6" style={{ background: 'var(--rita-ink)' }}>
          <div className="relative z-[1] max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: '#aeb5ff' }}>
              오늘의 발견
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-[28px]">오늘의 소재</h1>
            <p className="mt-2 max-w-xl text-[13px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.72)' }}>
              여러 매체가 함께 다루고 검색이 오르는 주제부터 확인하세요. 마음에 드는 소재는 담아 두고 콘텐츠로 이어갈 수 있습니다.
              {last && (
                <>
                  {' '}
                  마지막 확인 {new Date(last.at).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}.
                </>
              )}
            </p>
          </div>
          <div className="pointer-events-none absolute -right-8 -top-16 h-48 w-48 rounded-full opacity-50" style={{ background: 'var(--grad)', filter: 'blur(1px)' }} />
        </div>

        <div>
        {/*
          할 수 있는 일 두 갈래를 나란히 둔다.
          새로 돌리는 것만 크게 두면 이미 쌓인 회차를 다시 볼 길이 화면에 안 보인다.
          그리고 판정 규칙을 고쳤을 때 필요한 건 새 회차가 아니라 다시 판정이다 — 그쪽이 공짜다.
        */}
        <div className="flex flex-wrap items-center gap-3">
          <FindRow specs={specs} quotas={quotas} />
          <Link
            href="/runs"
            className="rounded-lg px-4 py-2 text-sm transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
            style={{ border: '1px solid var(--hairline)', color: 'var(--ink-2)' }}
          >
            지난 회차 {runs.length}번 보기
            <span className="ml-1.5 text-[12px]" style={{ color: 'var(--ink-muted)' }}>
              · 다시 판정
            </span>
          </Link>
        </div>
      </div>
      </div>

      {/* 채택했는데 아직 안 만든 것이 맨 위다. 여기가 지금 할 일이다. */}
      {(toMake.length > 0 || made.length > 0) && (
        <Group title="할 일">
          <Section title="채택함 — 만들 차례" hint="채택해 두고 아직 아무것도 만들지 않았습니다." items={toMake} />
          <Section title="채택하고 만든 것" hint="제작물이 후보에 붙어 있습니다." items={made} />
        </Group>
      )}

      {allTopics.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="소재 갈래">
          <CategoryChip href="/issues" on={!selected} label="전체" count={allTopics.length} />
          {FACETS.issue.filter((cat) => categoryCounts.get(cat)).map((cat) => (
            <CategoryChip
              key={cat}
              href={`/issues?cat=${encodeURIComponent(cat)}`}
              on={selected === cat}
              label={cat}
              count={categoryCounts.get(cat) ?? 0}
            />
          ))}
        </div>
      )}

      {allTopics.length > 0 && topics.length === 0 && (
        <p className="rounded-xl px-4 py-8 text-center text-[13px]"
           style={{ background: 'var(--surface)', border: '1px dashed var(--line)', color: 'var(--ink-muted)' }}>
          이 갈래에는 검토할 소재가 없습니다. 위에서 다른 갈래를 골라 보세요.
        </p>
      )}

      {topics.length > 0 && (
        <div className="space-y-8">
          <Group
            title="검토 추천"
            lead="여러 매체가 다뤘고 검색도 오르는 중입니다. 오늘 콘텐츠로 검토할 우선순위가 높은 소재입니다."
            count={rising.length}
          >
            <Section title="지금 오르는 소재" hint="검색 상승과 매체 확산이 함께 확인됐습니다." items={rising} />
          </Group>

          <Group
            title="관찰 중"
            lead="여러 매체가 다뤘지만 검색 신호가 아직 강하지 않습니다. 바로 채택하기보다 다음 회차의 변화를 확인하세요."
            count={flat.length + unmeasured.length}
          >
            <Section title="검색은 평소" hint="기사 확산은 있지만 검색량은 평소 수준입니다." items={flat} />
            <Section title="검색 신호 없음" hint="검색추이를 얻지 못했습니다. 평소라는 뜻이 아니라 아직 모른다는 뜻입니다." items={unmeasured} />
          </Group>

          <Group
            title="지나간 흐름"
            lead="검색이 식는 중인 소재입니다. 다시 오르는지 확인할 때까지 우선순위를 낮춥니다."
            count={cooling.length}
          >
            <Section title="식는 중" hint="검색이 이전보다 줄고 있습니다." items={cooling} />
          </Group>
        </div>
      )}

      {subjects.length > 0 && (
        <p className="text-[13px]" style={{ color: 'var(--ink-2)' }}>
          캐릭터 {subjects.length}건은{' '}
          <Link href="/characters" className="underline">
            캐릭터 발굴
          </Link>{' '}
          로 옮겼습니다. 재는 축이 달라서입니다 — 여기는 검색 급등, 저기는 조회수와 권리.
        </p>
      )}

      <div className="space-y-1 pt-2 text-[12px]" style={{ color: 'var(--ink-muted)' }}>
        {rejected.length > 0 && <p>기각한 후보 {rejected.length}건은 목록에서 내렸습니다.</p>}
        {hiddenCount > 0 && <p>키가 없어 쓰지 않는 판정기 {hiddenCount}개가 있습니다. 설정에서 확인하세요.</p>}
      </div>
    </div>
  );
}

interface Item {
  c: Candidate;
  grade: Grade;
  growth: number | null;
  /** 관측일 수. 회차 수가 아니다 — 같은 날 두 번 돌린 건 한 번 본 것이다. */
  runs: number;
  products: number;
}

/** 재는 축이 같은 것끼리 묶는 자리. 묶음 제목이 없으면 섹션 제목만으로는 축이 안 보인다. */
function Group({
  title,
  lead,
  count,
  notice,
  children,
}: {
  title: string;
  lead?: string;
  count?: number;
  /** 이 묶음을 그대로 믿으면 안 되는 이유. 있으면 카드보다 먼저 읽혀야 한다. */
  notice?: string | false;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div className="border-b pb-2.5" style={{ borderColor: 'var(--hairline)' }}>
        <h2 className="text-[15px] font-semibold tracking-tight">
          {title}
          {count != null && (
            <span className="num ml-2 text-[13px] font-normal" style={{ color: 'var(--ink-muted)' }}>
              {count}
            </span>
          )}
        </h2>
        {lead && (
          <p className="mt-1 max-w-2xl text-[12px] leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
            {lead}
          </p>
        )}
      </div>
      {notice && (
        <p
          className="rounded-lg px-3 py-2.5 text-[12px] leading-relaxed"
          style={{ background: 'var(--flat)', color: 'var(--ink-2)' }}
        >
          {notice}
        </p>
      )}
      {children}
    </div>
  );
}

function Section({ title, hint, items }: { title: string; hint: string; items: Item[] }) {
  if (!items.length) return null;
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-[13px] font-semibold">
          {title}
          <span className="num ml-2 font-normal" style={{ color: 'var(--ink-muted)' }}>
            {items.length}
          </span>
        </h3>
        <p className="mt-0.5 text-[12px]" style={{ color: 'var(--ink-muted)' }}>
          {hint}
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((x) => (
          <CandidateCard
            key={x.c.id}
            c={x.c}
            grade={x.grade}
            growth={x.growth}
            runs={x.runs}
            products={x.products}
          />
        ))}
      </div>
    </section>
  );
}

function CategoryChip({ href, on, label, count }: { href: string; on: boolean; label: string; count: number }) {
  return (
    <Link
      href={href}
      aria-current={on ? 'page' : undefined}
      className="rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors"
      style={on
        ? { background: 'var(--rita-ink)', color: '#fff' }
        : { background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink-2)' }}
    >
      {label} <span className="num ml-1 opacity-70">{count}</span>
    </Link>
  );
}

function FirstRun({
  specs,
  hiddenCount,
  runs,
  quotas,
}: {
  specs: { id: string; name: string; inputs: unknown[] }[];
  hiddenCount: number;
  /** 회차는 돌았는데 후보가 없을 수 있다 — 문턱을 올린 뒤 다시 판정하면 그렇게 된다. */
  runs: number;
  /** 판정기별 남은 실행 횟수. 첫 화면에서도 한도를 숨기지 않는다. */
  quotas: Map<string, Quota>;
}) {
  return (
    <div className="mx-auto max-w-xl py-10 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">지금 뭘 만들지 찾아드립니다</h1>
      <p className="mx-auto mt-3 max-w-md text-[14px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
        연합뉴스·매일경제·플래텀 등 9곳을 훑어 <strong>여러 매체가 함께 다루는 주제</strong>를 찾고,
        네이버 검색이 <strong>실제로 늘었는지</strong>까지 확인합니다.
        고른 주제는 근거 링크를 그대로 달고 카드뉴스 원고로 넘어갑니다.
      </p>

      <div className="mt-7 flex flex-wrap items-start justify-center gap-3">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <FindRow specs={specs as any} quotas={quotas} big />
      </div>
      <p className="mt-3 text-[12px]" style={{ color: 'var(--ink-muted)' }}>
        처음 한 번은 40초쯤 걸립니다.
      </p>

      {runs > 0 && (
        <p className="mt-6 text-[13px]" style={{ color: 'var(--ink-2)' }}>
          회차는 {runs}번 돌았는데 지금 규칙을 통과한 후보가 없습니다.{' '}
          <Link href="/runs" className="underline">
            지난 회차 보기
          </Link>{' '}
          에서 그때 뭐가 나왔는지 보거나, 규칙을 고친 뒤 다시 판정할 수 있습니다.
        </p>
      )}

      {hiddenCount > 0 && (
        <p className="mt-8 text-[12px]" style={{ color: 'var(--ink-muted)' }}>
          키가 없어 쓰지 않는 판정기 {hiddenCount}개가 있습니다.
        </p>
      )}
    </div>
  );
}
