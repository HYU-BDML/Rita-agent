import Link from 'next/link';
import type { Candidate } from '@/lib/core/candidate';
import { listCandidates, listPosts, productCounts } from '@/lib/core/store';
import { availableDiscoveries } from '@/lib/core/registry';
import { runQuota } from '@/lib/core/run-limit';
import { AxisTabs } from '@/components/axis-tabs';
import { CandidateCard } from '@/components/card';
import { allTrends, gradeOf, trendKey, type Grade } from '@/lib/core/trend';
import { FindButton } from '@/components/find-button';
import { axisOf, visibleOnly } from '@/lib/core/axis';
import { MIN_MEME_AUTHORS } from '@/lib/discoveries/meme-native';
import type { FormatKind } from '@/lib/collect/formats';
import { formatImages, type CandidateImage } from '@/lib/core/candidate-images';
import type { PostRecord } from '@/lib/core/post-record';

export const dynamic = 'force-dynamic';

/**
 * 밈 발굴.
 *
 * 이슈·캐릭터에서 떼어 냈다. 재는 축이 다르기 때문이다.
 *   이슈   — 여러 매체가 다뤘나 · 검색이 늘었나
 *   캐릭터 — 몇 계정이 말하나 · 만들어도 되는 **권리**인가
 *   여기   — 몇 계정이 **따라 하나** · 만들어도 되는 **내용**인가
 *
 * 그래서 이 화면은 급등도 권리도 보여 주지 않는다. 대신 둘을 보여 준다 —
 * 따라 한 계정 수, 그리고 안전 판정.
 */
const KIND_LABEL: Record<FormatKind | 'all', string> = {
  all: '전체',
  challenge: '챌린지',
  format: '유행 형식',
  catchphrase: '유행어·말',
  ambiguous: '기타',
};

function kindOf(c: Candidate): FormatKind {
  const raw = c.raw;
  if (raw && typeof raw === 'object' && 'kind' in raw) {
    const kind = (raw as { kind?: string }).kind;
    if (kind === 'challenge' || kind === 'format' || kind === 'catchphrase' || kind === 'ambiguous') return kind;
  }
  return 'ambiguous';
}

export default async function MemesPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const q = await searchParams;
  const selectedKind = q.kind && q.kind in KIND_LABEL ? (q.kind as FormatKind | 'all') : 'all';
  const [all, products, trends, posts] = await Promise.all([listCandidates(), productCounts(), allTrends(), listPosts()]);
  const specs = availableDiscoveries()
    .filter((d) => d.id === 'meme-native')
    .map((d) => ({ id: d.id, name: d.name, inputs: d.inputs }));
  // 판정기마다 따로 센다. 상한이 나뉘었으므로 버튼마다 남은 횟수가 다르다.
  const quotas = new Map(
    await Promise.all(specs.map(async (s) => [s.id, await runQuota(s.id)] as const)),
  );

  const memes = all.filter((c) => axisOf(c) === 'meme');
  const notRejected = memes.filter((c) => c.review !== 'rejected' && c.lifecycle === 'active');
  const rejected = memes.length - notRejected.length;
  // 막힌 것은 여기서 통째로 빠진다. 카드도 요약도 만들지 않는다.
  const { shown: visible, hidden } = visibleOnly(notRejected);
  const open = selectedKind === 'all' ? visible : visible.filter((c) => kindOf(c) === selectedKind);
  const postsByCandidate = new Map<string, PostRecord[]>();
  for (const post of posts) {
    if (!post.thumbnailUrl) continue;
    postsByCandidate.set(post.candidateId, [...(postsByCandidate.get(post.candidateId) ?? []), post]);
  }

  // 따라 한 계정 수로 줄 세운다. 이 축의 유일한 잣대다.
  const byAccounts = (a: Candidate, b: Candidate) =>
    (b.momentum.accounts ?? 0) - (a.momentum.accounts ?? 0);

  /*
   * 안전 판정이 붙은 것(blocked·flagged)은 위에서 이미 빠졌다.
   * 구획으로 올려 두지도 않는다 — '확인 필요' 를 맨 위에 두니 **애매한 것이 제일
   * 먼저 보였다.** 표시하려던 것이 강조가 됐다. 숫자만 아래에 남기고 설정에서 본다.
   */
  const clear = [...open].sort(byAccounts);

  const item = (c: Candidate) => ({
    c,
    images: formatImages(postsByCandidate.get(c.id) ?? [], c.subject),
    products: products.get(c.id) ?? 0,
    grade: gradeOf(trends.get(trendKey(c))?.points ?? [], c.origin.runAt),
  });

  return (
    <div className="space-y-8">
      {/* 세 갈래 탭. 메뉴에서 내려온 이슈·캐릭터·밈이다 (components/axis-tabs.tsx). */}
      <AxisTabs current="meme" />

      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">유행 포맷</h1>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
            캡션과 <strong>영상 첫 화면 자막</strong>에서 따라 하는 포맷의 이름을 뽑고,
            그 이름으로 다시 검색해 <strong>서로 다른 계정 {MIN_MEME_AUTHORS}곳 이상</strong>이
            실제로 하는 것만 세웁니다. 검색 급등은 재지 않습니다 —
            그건 <Link href="/issues" className="underline">뉴스·사건</Link> 쪽 잣대입니다.
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-3">
          {specs.map((s) => (
            <FindButton key={s.id} spec={s} quota={quotas.get(s.id)} />
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="유행 포맷 유형">
          {(Object.keys(KIND_LABEL) as (FormatKind | 'all')[]).map((kind) => (
            <Link
              key={kind}
              href={kind === 'all' ? '/memes' : `/memes?kind=${kind}`}
              role="tab"
              aria-selected={selectedKind === kind}
              className="rounded-full px-3 py-1.5 text-[12.5px] font-medium"
              style={selectedKind === kind ? { background: 'var(--rita-ink)', color: '#fff' } : { background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink-2)' }}
            >
              {KIND_LABEL[kind]}
              <span className="num ml-1 opacity-70">
                {kind === 'all' ? visible.length : visible.filter((c) => kindOf(c) === kind).length}
              </span>
            </Link>
          ))}
        </div>
      </div>

      {open.length === 0 ? (
        <p
          className="rounded-lg px-3 py-6 text-center text-[13px]"
          style={{ background: 'var(--surface)', border: '1px dashed var(--hairline)', color: 'var(--ink-muted)' }}
        >
          아직 찾은 밈이 없습니다.
          {specs.length === 0 && ' 설정에서 TikHub 키를 넣어 주세요.'}
        </p>
      ) : (
        <>
          <Section
            title="따라 하는 포맷"
            hint="이름으로 다시 검색해 여러 계정이 실제로 하는 것이 확인된 유행입니다. 따라 한 계정이 많은 순서입니다."
            items={clear.map(item)}
          />
        </>
      )}

      <p className="text-[12px]" style={{ color: 'var(--ink-muted)' }}>
        계정 수는 <strong>이름이 캡션에 실제로 있는</strong> 것만 셉니다. 검색이 준 건수와 다릅니다 —
        카드의 &lsquo;이름대조&rsquo;가 그 차이입니다.
        {rejected > 0 && ` 기각한 ${rejected}건은 목록에서 내렸습니다.`}
        {hidden > 0 && (
          <>
            {' '}안전 사유로 제외 <span className="num">{hidden}</span>건 —{' '}
            <Link href="/settings" className="underline">설정</Link>에서 확인합니다.
          </>
        )}
      </p>
    </div>
  );
}

function Section({
  title,
  hint,
  items,
}: {
  title: string;
  hint: string;
  items: { c: Candidate; images: CandidateImage[]; products: number; grade: Grade }[];
}) {
  if (!items.length) return null;
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-[13px] fontonsemibold font-semibold">
          {title}
          <span className="num ml-2 font-normal" style={{ color: 'var(--ink-muted)' }}>
            {items.length}
          </span>
        </h2>
        <p className="mt-0.5 text-[12px]" style={{ color: 'var(--ink-muted)' }}>
          {hint}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((x) => (
          <CandidateCard key={x.c.id} c={x.c} images={x.images} grade={x.grade} products={x.products} />
        ))}
      </div>
    </section>
  );
}
