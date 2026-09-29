import Link from 'next/link';
import { PickCheck } from '@/components/pick-check';
import { notFound } from 'next/navigation';
import { getCandidate, postsFor, productsFor } from '@/lib/core/store';
import { availableDiscoveries, availableProducers, hiddenProducers, isMock } from '@/lib/core/registry';
import { comparableAcrossRuns, gradeOf, trendFor } from '@/lib/core/trend';
import { cachedHealth } from '@/lib/core/render';
import type { InputField } from '@/lib/core/adapters';
import { SurgeMeter } from '@/components/surge';
import { GradeBadge } from '@/components/grade';
import { PostingChart } from '@/components/posting-chart';
import { firstObservedAt, postingSeries } from '@/lib/core/series';
import { isBlocked } from '@/lib/core/axis';
import { ReviewActions } from '@/components/review-actions';
import { GrowthDelta } from '@/components/growth';
import { ProducePanel } from '@/components/produce-panel';
import { AttachButton } from '@/components/attach-button';
import { CardnewsView } from '@/components/cardnews-view';
import { PosterView } from '@/components/poster-view';
import type { Baked, Card } from '@/lib/producers/cardnews-native';
import type { Poster } from '@/lib/producers/poster-shape';
import { characterImages, formatImages, newsImages } from '@/lib/core/candidate-images';
import { LinkedImagePanel } from '@/components/linked-image-grid';

export const dynamic = 'force-dynamic';

export default async function CandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await getCandidate(decodeURIComponent(id));
  if (!c) notFound();

  /*
   * 안전 판정에서 막힌 후보는 **상세를 열지 않는다.**
   *
   * 배지만 붙이고 본문을 그대로 두면 제지가 아니다 — `야차룰` 은 요약에 사망 사건
   * 내용이 적혀 있어서 화면을 여는 순간 그게 읽혔다. 요약·근거·썸네일을 통째로
   * 렌더하지 않는다. 지우는 것은 아니다. 무엇이 막혔는지는 설정에서 본다.
   */
  if (isBlocked(c)) return <Blocked />;
  const products = await productsFor(c.id);
  // 후보 표는 회차마다 덮어써진다. 지난 회차 값은 남겨 둔 원본에서 되살린다.
  const trend = await trendFor(c);
  // 점이 없어도 등급은 낸다 — 후보가 있다는 건 최소 한 번 봤다는 뜻이다.
  const grade = gradeOf(trend.points, c.origin.runAt);
  // 변화 그래프 (지시서 P5). 저장된 레코드의 게시일만 센다 — API 를 부르지 않는다.
  // 첫 관측일은 origin.runAt 이 아니다 — 후보 행은 회차마다 덮어써진다(firstObservedAt 주석).
  const myPosts = await postsFor(c.id);
  const series = postingSeries(myPosts, firstObservedAt(myPosts, c.origin.runAt, trend.points[0]?.at));

  /*
   * 틀·겉모습 목록은 코드에 박지 않고 렌더 서버에서 받아 채운다.
   * 박아 두면 서버에 없는 것을 고를 수 있게 되고, 그건 굽는 순간에야 드러난다.
   * 서버가 자고 있으면 undefined 가 오고 기본값 하나만 남는다 — 화면은 그대로 돈다.
   */
  const 서버목록 = await cachedHealth();
  const 채우기 = (f: InputField): InputField => {
    if (!서버목록) return f;
    if (f.name === 'style' && 서버목록.styles.length) return { ...f, options: 서버목록.styles };
    if (f.name === 'template' && 서버목록.templates.length) return { ...f, options: 서버목록.templates };
    return f;
  };

  // 권리 게이트는 서버에서 계산해 넘긴다. 화면에서 버튼만 감추는 건 막은 게 아니다.
  const offers = availableProducers().map((p) => {
    const unitOk = p.accepts.includes(c.unit);
    const gate = unitOk ? p.gate(c) : ({ ok: false, reason: `${p.name}는 이 종류의 후보를 받지 않습니다.` } as const);
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      ok: gate.ok,
      reason: gate.ok ? null : gate.reason,
      extraInputs: p.extraInputs.map(채우기),
      mock: isMock(p.keyEnv),
      mapped: gate.ok ? p.mapInputs(c) : null,
    };
  });

  const attachers = availableDiscoveries()
    .filter((d) => d.role === 'attaches')
    .map((d) => ({ id: d.id, name: d.name, mock: isMock(d.keyEnv) }));

  const hiddenNames = hiddenProducers().map((p) => p.name);
  const sources = [...new Set(c.evidence.map((e) => e.source))];
  const visualImages = c.origin.discoveryId === 'news'
    ? newsImages(c)
    : c.origin.discoveryId === 'character-native'
      ? characterImages(myPosts, c.subject)
    : c.origin.discoveryId === 'meme-native'
      ? formatImages(myPosts, c.subject)
      : [];
  const visualTitle = c.origin.discoveryId === 'news'
    ? '대표 사진'
    : c.origin.discoveryId === 'character-native'
      ? '대표 이미지'
      : '포맷 예시';

  return (
    <div className="space-y-7">
      {/*
        「지금 뜨는 것」은 없어진 낱말이고 `/` 는 이제 브리프다. 소재 상세의 부모는
        탐색이다 (`docs/WORDS.md` §2).
      */}
      <Link href="/explore" className="inline-block text-[12px] hover:underline" style={{ color: 'var(--ink-muted)' }}>
        ← 탐색
      </Link>

      {/* 머리 — 무엇이, 왜, 얼마나 */}
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{c.subject}</h1>
          {c.origin.mock && (
            <span className="rounded px-1.5 py-0.5 text-[11px] font-medium" style={{ background: '#fef3c7', color: '#78350f' }}>
              목 데이터
            </span>
          )}
          {/* 담기는 브라우저에만 저장된다. 서버의 추적(archived)과 다른 축이다. */}
          <span className="ml-auto">
            <PickCheck id={c.id} name={c.subject} variant="inline" />
          </span>
        </div>
        {c.why && (
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
            {c.why}
          </p>
        )}
        <LinkedImagePanel
          images={visualImages}
          title={visualTitle}
          caption={c.origin.discoveryId === 'news'
            ? '기사를 대표하는 사진입니다. 이미지를 누르면 원문 기사로 이동합니다.'
            : '수집된 게시물의 이미지입니다. 이미지를 누르면 원문 게시물로 이동합니다.'}
        />
        {/*
          안전 판정 (밈 축). 상세에서는 **근거 문장을 펴서 보인다** — 오판을 눈으로
          잡으라고 받은 값이라 접어 두면 받은 뜻이 없어진다.
        */}
        {/*
          `flagged` 만 여기 온다 — `blocked` 는 위에서 페이지 자체를 안 연다.
          근거 문장을 접지 않고 펴는 이유는 오판을 눈으로 잡으라고 받은 값이라서다.
        */}
        {c.safety?.level === 'flagged' && (
          <div
            className="mt-3 max-w-2xl rounded-lg px-3.5 py-3 text-[13px] leading-relaxed"
            style={{ background: '#fef3c7', color: '#78350f' }}
          >
            <strong>⚠ 확인 필요 — 막지는 않았습니다</strong>
            <p className="mt-1">{c.safety.reason}</p>
            {c.safety.evidence && (
              <p className="mt-1.5 opacity-80">그렇게 본 캡션: “{c.safety.evidence}”</p>
            )}
          </div>
        )}

        {/*
          '왜 지금인가'(위)와 '무슨 내용인가'(아래)는 다른 칸이다. 나란히 두되 제목을 달아
          구분한다 — 제목이 없으면 같은 말을 두 번 쓴 것처럼 읽힌다.
          요약이 없는 후보는 칸 자체가 없다. "요약 없음" 같은 빈 줄을 만들지 않는다.
        */}
        {c.summary && (
          <div
            className="mt-3 max-w-2xl rounded-lg border px-3.5 py-3"
            style={{ background: 'var(--plane)', borderColor: 'var(--hairline)' }}
          >
            <h2 className="text-[12px] font-semibold" style={{ color: 'var(--ink-muted)' }}>
              무슨 내용인가
            </h2>
            <p className="mt-1 text-[14px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
              {c.summary}
            </p>
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
          {/* 상세에서는 관측일 수까지 편다. 배지만으로는 "몇 번"이 안 읽힌다. */}
          <GradeBadge grade={grade} showDetail />
          <SurgeMeter surge={c.momentum.surge} />
          <span className="num text-[12px]" style={{ color: 'var(--ink-muted)' }}>
            {/* 주제는 매체 수로, 캐릭터는 계정 수로 센다. 재는 것이 다르다. */}
            {c.momentum.accounts != null
              ? `계정 ${c.momentum.accounts}`
              : `매체 ${c.momentum.mediaCount ?? sources.length}곳`}
            {c.momentum.platforms?.length ? ` · ${c.momentum.platforms.join('·')}` : ''}
            {c.momentum.yoy != null && ` · 작년 대비 ${c.momentum.yoy}×`}
          </span>
        </div>

        {series.months.length > 0 && (
          <div className="mt-5 max-w-2xl">
            <h2 className="text-[13px] font-semibold">언제 올라온 것들인가</h2>
            <p className="mb-2 mt-0.5 text-[12px]" style={{ color: 'var(--ink-muted)' }}>
              이 후보의 근거가 된 게시물을 올라온 달로 세었습니다.
            </p>
            <PostingChart series={series} subject={c.subject} />
          </div>
        )}

        {/*
          회차 간 비교는 재는 축이 성립할 때만 편다. 캐릭터는 momentum.views 가 회차마다
          다른 표본이라 비교가 안 된다 — comparableAcrossRuns 주석에 왜 껐는지 적어 뒀다.
          관측 시점은 위 그래프의 경계선이 대신 말한다.
        */}
        {trend.points.length > 1 && comparableAcrossRuns(c.unit) && (
          <div className="mt-3 space-y-1.5">
            <GrowthDelta growth={trend.growth} runs={trend.points.length} />
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px]" style={{ color: 'var(--ink-muted)' }}>
              {trend.points.map((p) => (
                <li key={p.runId} className="num">
                  {new Date(p.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  <span className="ml-1.5" style={{ color: 'var(--ink-2)' }}>
                    {p.surge != null ? `${p.surge}\u00d7` : '\u2014'}
                  </span>
                </li>
              ))}
            </ul>
            <Link href="/runs" className="inline-block text-[12px] hover:underline" style={{ color: 'var(--ink-muted)' }}>
              회차 전체 보기 →
            </Link>
          </div>
        )}

        {c.rights.note && (
          <p className="mt-3 rounded-lg px-3 py-2 text-[12px]" style={{ background: 'var(--flat)', color: 'var(--ink-2)' }}>
            {c.rights.note}
          </p>
        )}
      </div>

      {/* 만들기 — 이 화면에 온 이유 */}
      <section className="space-y-3">
        <div>
          <h2 className="text-[13px] font-semibold">이걸로 만들기</h2>
          <p className="mt-0.5 text-[12px]" style={{ color: 'var(--ink-muted)' }}>
            아래 근거가 그대로 원고에 실립니다. 주제나 출처를 다시 적을 필요 없습니다.
          </p>
        </div>
        {offers.length ? (
          <ProducePanel candidateId={c.id} offers={offers} />
        ) : (
          <p className="rounded-lg px-3 py-3 text-[13px]" style={{ background: 'var(--surface)', border: '1px dashed var(--hairline)', color: 'var(--ink-muted)' }}>
            쓸 수 있는 생성기가 없습니다{hiddenNames.length ? ` (${hiddenNames.join(' · ')} 는 키가 없어 숨김)` : ''}.
          </p>
        )}
      </section>

      {/* 근거 */}
      <section className="space-y-3">
        <h2 className="text-[13px] font-semibold">
          근거 <span className="num font-normal" style={{ color: 'var(--ink-muted)' }}>{c.evidence.length}</span>
        </h2>
        {c.evidence.length ? (
          <ul className="space-y-1.5">
            {c.evidence.map((e) => (
              <li key={e.url}>
                <a
                  href={e.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-baseline gap-2.5 rounded-lg px-3 py-2.5 transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
                  style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
                >
                  <span className="shrink-0 text-[11px] font-medium" style={{ color: 'var(--ink-muted)' }}>
                    {e.source}
                  </span>
                  <span className="text-[13px] leading-snug">{e.title}</span>
                  {e.note && (
                    <span className="num ml-auto shrink-0 text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                      {e.note}
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px]" style={{ color: 'var(--ink-muted)' }}>
            근거 링크가 없습니다. 이 후보로 만든 것은 출처를 댈 수 없습니다.
          </p>
        )}
      </section>

      {/* 본보기 — 붙일 수 있을 때만 */}
      {(attachers.length > 0 || (c.hint.references?.length ?? 0) > 0) && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-semibold">따라 만들 본보기</h2>
            <div className="flex gap-2">
              {attachers.map((a) => (
                <AttachButton key={a.id} candidateId={c.id} discoveryId={a.id} name={a.name} mock={a.mock} />
              ))}
            </div>
          </div>
          {c.hint.references?.length ? (
            <ul className="space-y-1.5">
              {c.hint.references.map((r) => (
                <li key={r.url}>
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-lg px-3 py-2.5 text-[13px] transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
                    style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
                  >
                    {r.title}
                    <span className="num ml-2 text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                      {[r.channel, r.subRatio != null ? `구독대비 ${r.subRatio}배` : null].filter(Boolean).join(' · ')}
                    </span>
                    {r.takeaway && (
                      <span className="mt-1 block text-[12px]" style={{ color: 'var(--ink-muted)' }}>{r.takeaway}</span>
                    )}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      )}

      {/* 만든 것 */}
      {products.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[13px] font-semibold">
            만든 것 <span className="num font-normal" style={{ color: 'var(--ink-muted)' }}>{products.length}</span>
          </h2>
          {products.map((p) => (
            <details key={p.id} open className="rounded-lg" style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
              <summary className="cursor-pointer px-3 py-2.5 text-[13px] font-medium">
                {p.title}
                <span className="num ml-2 text-[11px] font-normal" style={{ color: 'var(--ink-muted)' }}>
                  {new Date(p.createdAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </summary>
              <div className="px-3 py-3" style={{ borderTop: '1px solid var(--hairline)' }}>
                {isPoster(p.output) ? (
                  // 포스터도 글이 아니라 한 장이다. 프롬프트를 읽게 하면 판단이 안 된다.
                  <PosterView
                    poster={(p.output as { poster: Poster }).poster}
                    서버={(p.output as { 서버?: Parameters<typeof PosterView>[0]['서버'] }).서버}
                  />
                ) : isCardnews(p.output) ? (
                  // 카드뉴스는 글이 아니라 카드다. 시안으로 그려야 판단이 된다.
                  <CardnewsView
                    cards={(p.output as { cards: Card[] }).cards}
                    caption={(p.output as { caption?: string }).caption ?? ''}
                    account={(p.output as { account?: string }).account}
                    서버={(p.output as { 서버?: Baked }).서버}
                  />
                ) : (
                  p.preview && (
                    <pre className="overflow-auto text-[12px] leading-relaxed" style={{ maxHeight: '28rem' }}>
                      {p.preview.value}
                    </pre>
                  )
                )}
              </div>
            </details>
          ))}
        </section>
      )}

      <ReviewActions id={c.id} current={c.review} note={c.reviewNote ?? ''} />

      <p className="num text-[11px]" style={{ color: 'var(--ink-muted)' }}>
        {c.origin.discoveryId} · {new Date(c.origin.runAt).toLocaleString('ko-KR')}
      </p>
    </div>
  );
}

/** 저장된 제작물이 카드뉴스인지. 모양으로 판별한다 — 생성기 id 는 늘어날 수 있다. */
function isCardnews(output: unknown): boolean {
  const o = output as { cards?: unknown } | null;
  return Boolean(o && Array.isArray(o.cards) && o.cards.length);
}

function isPoster(output: unknown): boolean {
  const o = output as { poster?: { headline?: unknown } } | null;
  return Boolean(o && o.poster && typeof o.poster.headline === 'string');
}

/**
 * 막힌 후보 자리. **무엇이 막혔는지도 여기서는 말하지 않는다** — 이름과 요약이
 * 곧 그 내용이라 적는 순간 막은 뜻이 없어진다. 사유는 설정에서만 본다.
 */
function Blocked() {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <p className="text-[15px] font-semibold">안전 사유로 제외된 항목입니다</p>
      <p className="mt-2 text-[13px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
        사람이 다친 사건·자해·성적 표현이 얽힌 것으로 판정돼 목록과 계약에서 뺐습니다.
        내용은 화면에 띄우지 않습니다.
      </p>
      <p className="mt-4 text-[13px]">
        <Link href="/settings" className="underline">설정</Link> 에서 판정 사유와 근거를 볼 수 있습니다.
        오판으로 보이면 거기서 확인하세요.
      </p>
    </div>
  );
}
