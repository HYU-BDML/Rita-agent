import Link from 'next/link';
import type { Candidate } from '@/lib/core/candidate';
import type { Axis } from '@/lib/core/axis';
import { axisOf, axisOfDiscovery, visibleOnly } from '@/lib/core/axis';
import { availableDiscoveries } from '@/lib/core/registry';
import { runQuota } from '@/lib/core/run-limit';
import { FindRow } from '@/components/find-row';
import { listCandidates, listPosts, productCounts } from '@/lib/core/store';
import { allTrends, gradeOf, trendKey } from '@/lib/core/trend';
import { characterImages, formatImages } from '@/lib/core/candidate-images';
import { search } from '@/lib/core/search';
import { FACETS, FACET_NAME, facetOf, isFacet } from '@/lib/core/facets';
import { CandidateCard } from '@/components/card';

export const dynamic = 'force-dynamic';

const AXES: { id: Axis | 'all'; label: string; href: string }[] = [
  { id: 'all', label: '전체', href: '/explore' },
  { id: 'issue', label: '뉴스·사건', href: '/issues' },
  { id: 'character', label: '캐릭터·굿즈', href: '/characters' },
  { id: 'meme', label: '유행 포맷', href: '/memes' },
];

export default async function Explore({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; axis?: string; sub?: string }>;
}) {
  const params = await searchParams;
  const query = (params.q ?? '').trim();
  const selectedAxis = isAxis(params.axis) ? params.axis : 'all';
  /*
   * 세부는 축을 고른 뒤에만 뜬다. 셋을 한꺼번에 늘어놓으면 칩이 열일곱 개가 되고,
   * 뉴스의 '정치'와 캐릭터의 '기업 IP'가 한 줄에 섞여 무엇의 하위인지 안 읽힌다.
   */
  const selectedFacet =
    selectedAxis !== 'all' && isFacet(selectedAxis, params.sub) ? params.sub : null;
  /*
   * 축마다 제 발굴 버튼을 낸다. 축을 고르면 그 축의 것만, 전체면 넷이 다 나온다.
   * 수집은 축 화면에 있어야 한다고 두었더니 홈에서 무엇을 돌릴 수 있는지가 안 보였다.
   */
  const specs = availableDiscoveries()
    .filter((d) => d.role === 'produces')
    .filter((d) => selectedAxis === 'all' || axisOfDiscovery(d) === selectedAxis)
    .map((d) => ({ id: d.id, name: d.name, inputs: d.inputs }));
  // 판정기마다 따로 센다. 상한이 나뉘었으므로 버튼마다 남은 횟수가 다르다.
  const quotas = new Map(
    await Promise.all(specs.map(async (s) => [s.id, await runQuota(s.id)] as const)),
  );

  const [all, posts, products, trends] = await Promise.all([
    listCandidates(),
    listPosts(),
    productCounts(),
    allTrends(),
  ]);

  const visible = visibleOnly(all.filter((candidate) => candidate.review !== 'rejected')).shown;
  /*
   * **검색에는 추적 중인 것도 넣는다.** 빼 두면 이미 담아 둔 이름을 검색했을 때
   * 옆 후보만 나오고 정작 그것이 안 나온다 — '마이멜로디'를 추적하면서 검색하면
   * 쿠로미·시나모롤만 네 건 나왔다. 추천에서만 뺀다. 이미 담은 것을 또 권할 이유는 없다.
   */
  /*
   * 추천에는 지금 표에 있는 것만 올린다. 검색에는 내려간 것도 남긴다 — 이름을 아는
   * 사람이 찾을 때 "없다"고 말하면 거짓이다. 내려간 것에는 카드가 '지나감'을 단다.
   */
  const untracked = visible.filter((candidate) => candidate.lifecycle === 'active');
  const pool = query ? visible : untracked;
  const inAxis = selectedAxis === 'all'
    ? pool
    : pool.filter((candidate) => axisOf(candidate) === selectedAxis);
  const scoped = selectedFacet ? inAxis.filter((candidate) => facetOf(candidate) === selectedFacet) : inAxis;
  const found = query ? search(scoped, query).slice(0, 24) : recommend(scoped, 12);

  const postsByCandidate = new Map<string, typeof posts>();
  for (const post of posts) {
    if (!post.thumbnailUrl) continue;
    postsByCandidate.set(post.candidateId, [...(postsByCandidate.get(post.candidateId) ?? []), post]);
  }

  /*
   * 탭 숫자는 **지금 화면이 세는 것과 같은 것**을 센다. 검색 중에 전체 후보 수를 그대로
   * 두면 결과 9건 옆에서 '캐릭터 66'이라고 말한다. 눌러 보면 두 건이다. 검색 중에는
   * 그 검색어의 축별 결과 수를 센다.
   */
  const counted = query ? search(pool, query) : pool;
  const counts = new Map<Axis, number>();
  for (const candidate of counted) {
    const axis = axisOf(candidate);
    counts.set(axis, (counts.get(axis) ?? 0) + 1);
  }

  /*
   * 세부 칩의 수는 **세부를 고르기 전** 줄에서 센다. 고른 칸으로 걸러 놓고 세면
   * 나머지 칩이 전부 0 이 되어 돌아갈 곳이 안 보인다.
   */
  const facetPool = selectedAxis === 'all'
    ? []
    : (query ? search(inAxis, query) : inAxis);
  const facetCounts = new Map<string, number>();
  for (const candidate of facetPool) {
    const facet = facetOf(candidate);
    facetCounts.set(facet, (facetCounts.get(facet) ?? 0) + 1);
  }

  return (
    <div className="space-y-8">
      <section
        className="overflow-hidden rounded-2xl px-5 py-7 sm:px-8 sm:py-9"
        style={{ background: 'var(--rita-ink)', color: '#fff' }}
      >
        {/*
          히어로가 질문이면 처음 온 사람이 답할 수 없다. 여기는 이름을 아는 사람이 오는
          화면이라 무엇을 보는 곳인지만 적는다 (`docs/WORDS.md` §13).
        */}
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">소재 전체 보기</h1>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.76)' }}>
          수집된 소재를 분야별로 찾아봅니다. 검색하거나 새로 수집할 수 있습니다.
        </p>
        <form action="/explore" className="mt-5 flex max-w-2xl gap-2">
          {selectedAxis !== 'all' && <input type="hidden" name="axis" value={selectedAxis} />}
          <label htmlFor="explore-search" className="sr-only">소재 검색</label>
          <input
            id="explore-search"
            name="q"
            defaultValue={query}
            placeholder="예: 아시안게임, 치이카와, 챌린지"
            className="min-w-0 flex-1 rounded-xl px-4 py-3 text-[14px] outline-none focus:ring-2"
            style={{ background: '#fff', color: '#15163a', boxShadow: '0 8px 24px rgba(0,0,0,0.16)' }}
          />
          <button
            type="submit"
            className="shrink-0 rounded-xl px-5 py-3 text-[13px] font-semibold text-white"
            style={{ background: 'var(--rita-blue)' }}
          >
            검색
          </button>
        </form>
      </section>

      <section>
        <div className="flex flex-wrap items-center gap-1.5" aria-label="탐색 분야">
          {AXES.map((axis) => {
            const activeAxis = selectedAxis === axis.id;
            // 축을 바꾸면 세부는 떨군다. '정치'는 캐릭터 축에서 뜻이 없다.
            const href = query
              ? `/explore?q=${encodeURIComponent(query)}${axis.id === 'all' ? '' : `&axis=${axis.id}`}`
              : axis.id === 'all' ? '/explore' : `/explore?axis=${axis.id}`;
            const count = axis.id === 'all' ? counted.length : counts.get(axis.id) ?? 0;
            return (
              <Link
                key={axis.id}
                href={href}
                aria-current={activeAxis ? 'page' : undefined}
                className="rounded-full px-3 py-1.5 text-[12.5px] font-medium"
                style={activeAxis
                  ? { background: 'var(--rita-ink)', color: '#fff' }
                  : { background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink-2)' }}
              >
                {axis.label} <span className="num ml-1 opacity-70">{count}</span>
              </Link>
            );
          })}
        </div>

        {selectedAxis !== 'all' && facetPool.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label={`${FACET_NAME[selectedAxis]} 고르기`}>
            <span className="mr-0.5 text-[11.5px]" style={{ color: 'var(--ink-muted)' }}>
              {FACET_NAME[selectedAxis]}
            </span>
            <SubChip href={facetHref(query, selectedAxis, null)} on={!selectedFacet} label="전체" count={facetPool.length} />
            {FACETS[selectedAxis]
              .filter((facet) => facetCounts.get(facet))
              .map((facet) => (
                <SubChip
                  key={facet}
                  href={facetHref(query, selectedAxis, facet)}
                  on={selectedFacet === facet}
                  label={facet}
                  count={facetCounts.get(facet) ?? 0}
                />
              ))}
          </div>
        )}

        <div className="mt-3.5 border-t pt-3.5" style={{ borderColor: 'var(--hairline)' }}>
          <p className="mb-2 text-[11.5px]" style={{ color: 'var(--ink-muted)' }}>
            {selectedAxis === 'all'
              ? '새로 찾기 — 분야를 고르면 그 분야만 돌릴 수 있습니다'
              : `새로 찾기 — ${AXES.find((a) => a.id === selectedAxis)?.label}`}
          </p>
          <FindRow
            specs={specs}
            quotas={quotas}
            empty="이 분야에는 지금 돌릴 수 있는 판정기가 없습니다. 설정에서 키를 넣어 주세요."
          />
          {/* 설정은 상단바에서 내렸다(components/nav.tsx). 수집 도구는 수집 화면에 있는 것이 맞다. */}
          <p className="mt-2.5 text-[11.5px]">
            <Link href="/settings" className="underline" style={{ color: 'var(--ink-muted)' }}>
              수집 주기·상한·키 설정
            </Link>
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold">
              {query ? `“${query}” 검색 결과` : '자동 추천'}
              <span className="num ml-2 font-normal" style={{ color: 'var(--ink-muted)' }}>{found.length}</span>
            </h2>
            <p className="mt-0.5 text-[12px]" style={{ color: 'var(--ink-muted)' }}>
              {query
                ? '이미 수집된 뉴스·캐릭터·포맷의 이름·별칭·설명과 근거에서 찾았습니다. 추적 중인 소재도 함께 나옵니다.'
                : '최근 자동 수집에서 들어온 세 분야의 후보를 고르게 보여 줍니다.'}
            </p>
          </div>
          {!query && (
            <div className="flex gap-3 text-[12px]">
              <Link href="/issues" className="underline" style={{ color: 'var(--ink-2)' }}>오늘의 소재 보기</Link>
              <Link href="/library" className="underline" style={{ color: 'var(--ink-2)' }}>추적 중 보기</Link>
            </div>
          )}
        </div>

        {found.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {found.map((candidate) => {
              const mine = postsByCandidate.get(candidate.id) ?? [];
              const images = axisOf(candidate) === 'character'
                ? characterImages(mine, candidate.subject)
                : axisOf(candidate) === 'meme'
                  ? formatImages(mine, candidate.subject)
                  : [];
              return (
                <CandidateCard
                  key={candidate.id}
                  c={candidate}
                  images={images}
                  grade={gradeOf(trends.get(trendKey(candidate))?.points ?? [], candidate.origin.runAt)}
                  products={products.get(candidate.id) ?? 0}
                />
              );
            })}
          </div>
        ) : (
          <div
            className="rounded-xl px-4 py-10 text-center"
            style={{ background: 'var(--surface)', border: '1px dashed var(--line)' }}
          >
            <p className="text-[14px] font-medium">
              {selectedFacet
                ? `'${selectedFacet}' 에는 보여 줄 소재가 없습니다`
                : '저장된 소재에서 일치하는 결과가 없습니다'}
            </p>
            <p className="mt-1 text-[12px]" style={{ color: 'var(--ink-muted)' }}>
              {selectedFacet
                ? '위에서 다른 칸을 고르거나 전체로 돌아가 보세요.'
                : '검색어를 줄여 보세요.'}
            </p>
          </div>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {AXES.filter((axis) => axis.id !== 'all').map((axis) => (
          <Link
            key={axis.id}
            href={axis.href}
            className="rounded-xl p-4 transition-shadow hover:shadow-sm"
            style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}
          >
            <strong className="text-[14px]">{axis.label}</strong>
            <span className="mt-1 block text-[12px]" style={{ color: 'var(--ink-muted)' }}>
              분야별 판정 기준과 전체 후보 보기 →
            </span>
          </Link>
        ))}
      </section>
    </div>
  );
}

function facetHref(query: string, axis: Axis, facet: string | null): string {
  const p = new URLSearchParams();
  if (query) p.set('q', query);
  p.set('axis', axis);
  if (facet) p.set('sub', facet);
  return `/explore?${p.toString()}`;
}

function SubChip({ href, on, label, count }: { href: string; on: boolean; label: string; count: number }) {
  return (
    <Link
      href={href}
      aria-current={on ? 'page' : undefined}
      className="rounded-full px-2.5 py-1 text-[12px] font-medium"
      style={on
        ? { background: 'var(--rita-blue)', color: '#fff' }
        : { background: 'var(--plane)', border: '1px solid var(--hairline)', color: 'var(--ink-2)' }}
    >
      {label} <span className="num ml-0.5 opacity-70">{count}</span>
    </Link>
  );
}

function isAxis(value?: string): value is Axis | 'all' {
  return value === 'all' || value === 'issue' || value === 'character' || value === 'meme';
}

/** 세 분야가 한쪽에 묻히지 않도록 최신 후보를 한 장씩 돌아가며 추천한다. */
function recommend(candidates: Candidate[], limit: number): Candidate[] {
  const sorted = [...candidates].sort((a, b) => b.origin.runAt.localeCompare(a.origin.runAt));
  const lanes = (['issue', 'character', 'meme'] as const).map((axis) =>
    sorted.filter((candidate) => axisOf(candidate) === axis),
  );
  const out: Candidate[] = [];
  let row = 0;
  while (out.length < limit) {
    let added = false;
    for (const lane of lanes) {
      if (!lane[row]) continue;
      out.push(lane[row]);
      added = true;
      if (out.length >= limit) break;
    }
    if (!added) break;
    row += 1;
  }
  return out;
}
