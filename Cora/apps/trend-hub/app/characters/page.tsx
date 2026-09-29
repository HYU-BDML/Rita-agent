import Link from 'next/link';
import type { Candidate } from '@/lib/core/candidate';
import { listCandidates, listPosts, listRuns } from '@/lib/core/store';
import { availableDiscoveries, getDiscovery } from '@/lib/core/registry';
import { runQuota } from '@/lib/core/run-limit';
import { allTrends, gradeOf, observedDay, trendKey, RUNS_FOR_VERDICT } from '@/lib/core/trend';
import { FindButton } from '@/components/find-button';
import { AxisTabs } from '@/components/axis-tabs';
import { RunStatus } from '@/components/run-status';
import { ThumbCard } from '@/components/thumb-card';
import { visibleOnly } from '@/lib/core/axis';
import { LINEAGE_KINDS, type LineageKind } from '@/lib/collect/lineage';
import { characterImages, type CandidateImage } from '@/lib/core/candidate-images';
import type { PostRecord } from '@/lib/core/post-record';

export const dynamic = 'force-dynamic';

/**
 * 캐릭터 발굴 — 목록 (2026-09-19 재설계).
 *
 * 바뀐 것 넷.
 *   1. **썸네일.** 갖고 있으면서 한 장도 안 쓰고 있었다. 캐릭터는 생긴 것이 먼저 읽힌다
 *   2. **요약을 뺐다.** 카드가 길어지면 격자가 안 된다. 요약은 상세로
 *   3. **한 줄에 넷.** 세로로 나열하면 68건을 훑을 수가 없다
 *   4. **발굴 버튼을 아래로.** 7분짜리라 자주 누르는 것이 아니다. 위쪽 자리를 목록에 준다
 *
 * 구획(애니·만화/게임/…) 대신 **칩으로 거른다.** 다섯 구획으로 나누면 한 화면에
 * 다섯 제목이 들어가 정작 카드가 안 보인다. 거르면 한 갈래를 통째로 훑을 수 있다.
 */

/**
 * 한 번에 몇 장 보일까. **3칸 격자**라 여섯 장이면 두 줄이다.
 * 4칸은 설명 한 줄이 들어갈 폭이 안 나온다 — 지시서 2장에서 못 박았다.
 */
const PAGE = 6;

export default async function CharactersPage({
  searchParams,
}: {
  searchParams: Promise<{ lineage?: string; rights?: string; n?: string; tn?: string }>;
}) {
  const q = await searchParams;
  // 필터·페이지를 주소에 둔다. 클라이언트 상태로 두면 새로 고치면 풀리고 공유도 안 된다.
  const kind = LINEAGE_KINDS.find((k) => k === q.lineage);
  const onlyIndividual = q.rights === 'individual';
  const limit = Math.max(PAGE, Number(q.n) || PAGE);
  const topLimit = Math.max(PAGE, Number(q.tn) || PAGE);

  const [all, posts, trends, runs] = await Promise.all([
    listCandidates(),
    listPosts(),
    allTrends(),
    listRuns(),
  ]);
  const specs = availableDiscoveries()
    .filter((d) => d.role === 'produces' && d.unit === 'subject')
    .map((d) => ({ id: d.id, name: d.name, inputs: d.inputs }));
  // 판정기마다 따로 센다. 상한이 나뉘었으므로 버튼마다 남은 횟수가 다르다.
  const quotas = new Map(
    await Promise.all(specs.map(async (s) => [s.id, await runQuota(s.id)] as const)),
  );

  const open = visibleOnly(
    all
      // 내려간 것(retired)도 뺀다. 목록은 '지금 표에 있는 것'만 보여 준다.
      .filter((c) => c.unit === 'subject' && c.lifecycle === 'active')
      .filter((c) => c.review !== 'rejected'),
  ).shown;

  /*
   * 후보별 썸네일. 레코드를 한 번만 읽고 묶는다 — 후보마다 postsFor 를 부르면 68번 훑는다.
   * 최신 게시물부터 담아 큰 자리에 최근 것이 오게 한다.
   */
  const postsByCandidate = new Map<string, PostRecord[]>();
  const shots = new Map<string, CandidateImage[]>();
  const shotCounts = new Map<string, number>();
  /** 월별 게시 편수 — 카드의 '눈에 띄는 것' 태그를 여기서 만든다. */
  const months = new Map<string, Map<string, number>>();
  for (const p of posts) {
    if (p.thumbnailUrl) {
      postsByCandidate.set(p.candidateId, [...(postsByCandidate.get(p.candidateId) ?? []), p]);
      shotCounts.set(p.candidateId, (shotCounts.get(p.candidateId) ?? 0) + 1);
    }
    if (!p.postedAt) continue;
    const m = months.get(p.candidateId) ?? new Map<string, number>();
    const k = p.postedAt.slice(0, 7);
    m.set(k, (m.get(k) ?? 0) + 1);
    months.set(p.candidateId, m);
  }
  for (const c of open) {
    shots.set(c.id, characterImages(postsByCandidate.get(c.id) ?? [], c.subject));
  }

  /*
   * 눈에 띄는 것 하나. **스파크라인 대신이다** — 26px 안에 일곱 점을 그리면 깨져 보인다
   * (지시서 6장). 직전 달의 두 배가 넘게 올라왔을 때만 붙이고, 아니면 안 붙인다.
   * 없는 신호를 지어내지 않는다.
   */
  const noteOf = (id: string): string | undefined => {
    const m = months.get(id);
    if (!m || m.size < 2) return undefined;
    const keys = [...m.keys()].sort();
    const last = keys[keys.length - 1];
    const prev = keys[keys.length - 2];
    const a = m.get(last) ?? 0;
    const b = m.get(prev) ?? 0;
    if (b === 0 || a < b * 2) return undefined;
    return `${Number(last.slice(5))}월에 ${Math.round(a / b)}배`;
  };

  const counts = new Map<LineageKind, number>();
  for (const c of open) {
    const k = (c.lineage?.kind ?? '모름') as LineageKind;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  /*
   * **계정 수 → 관측일 → 조회수.** 조회수를 앞에 두면 계정 1곳짜리 공식 홍보글이
   * 1위가 된다(로빈 182만, 붕괴 스타레일 공식 계정 한 곳). 조회는 그 계정이 큰 것이지
   * 여러 곳에서 뜬 것이 아니다. 여럿이 말한 것 → 여러 날 본 것 → 그다음이 크기다.
   */
  const days = (c: Candidate) => trends.get(trendKey(c))?.points.length ?? 0;
  const byWeight = (a: Candidate, b: Candidate) =>
    (b.momentum.accounts ?? 0) - (a.momentum.accounts ?? 0) ||
    days(b) - days(a) ||
    (b.momentum.views ?? -1) - (a.momentum.views ?? -1);

  const filtered = open
    .filter((c) => !kind || (c.lineage?.kind ?? '모름') === kind)
    .filter((c) => !onlyIndividual || c.rights.ownership === 'individual')
    .sort(byWeight);

  /*
   * **오늘 들어온 것** (지시서 2장). 68건을 한 덩어리로 두면 이번 회차에서 무엇이
   * 바뀌었는지가 안 읽힌다 — 목록을 여는 사람이 제일 먼저 알고 싶은 것이 그것이다.
   *
   * 올리는 기준은 둘뿐이다: **새로 잡혔거나, 등급이 올랐거나.** 마지막 회차에 그냥
   * 다시 보인 것은 올리지 않는다. 그건 소식이 아니다.
   *
   * 기준 날짜는 "오늘"이 아니라 **마지막으로 관측한 날**이다. 사흘 전에 돌린 회차를
   * 보고 있으면 그 사흘 전 회차가 '오늘 들어온 것'이다. 달력 날짜로 자르면 회차를
   * 안 돌린 날에는 이 구획이 통째로 비어 화면이 고장난 것처럼 보인다.
   */
  const daysOf = (c: Candidate): string[] => {
    const pts = trends.get(trendKey(c))?.points ?? [];
    const ds = [...new Set(pts.map((p) => observedDay(p.at)))].sort();
    // 점이 없어도 후보가 있다는 건 최소 한 번 봤다는 뜻이다 (gradeOf 와 같은 규칙).
    return ds.length ? ds : [observedDay(c.origin.runAt)];
  };
  /** 관측일 수 → 등급. `gradeOf` 와 같은 문턱을 쓴다. 어긋나면 배지와 구획이 따로 논다. */
  const levelAt = (n: number) =>
    n >= RUNS_FOR_VERDICT ? 'confirmed' : n >= 2 ? 'tentative' : 'fresh';

  let latestDay = '';
  for (const c of open) {
    const d = daysOf(c).at(-1) ?? '';
    if (d > latestDay) latestDay = d;
  }

  /** 이 후보가 마지막 회차의 소식인가. 아니면 undefined — 없는 소식을 지어내지 않는다. */
  const freshOf = (c: Candidate): '새로 포착' | '등급 오름' | undefined => {
    const d = daysOf(c);
    if (!latestDay || !d.includes(latestDay)) return undefined;
    if (d.length === 1) return '새로 포착';
    return levelAt(d.length) !== levelAt(d.length - 1) ? '등급 오름' : undefined;
  };

  /*
   * 소식도 같은 필터를 탄다. 출신 칩을 눌러 '게임'만 보는 사람에게 위쪽만 전체를
   * 보여주면 두 구획의 잣대가 달라져 건수가 안 맞는다.
   */
  const freshList = filtered.map((c) => [c, freshOf(c)] as const).filter((x) => x[1]);
  const topPage = freshList.slice(0, topLimit);
  const topMore = freshList.length - topPage.length;

  const page = filtered.slice(0, limit);
  const more = filtered.length - page.length;
  const individuals = open.filter((c) => c.rights.ownership === 'individual').length;

  /*
   * **캐릭터 회차만 센다.** `listRuns()[0]` 은 밈·이슈까지 섞인 전체 최신이라,
   * 밈을 방금 돌리면 캐릭터 목록이 "마지막 회차 04:22" 라고 말한다 — 두 시간 앞선
   * 거짓말이다(2026-09-19 실측: 캐릭터 02:20, 밈 04:22). 이 줄이 하는 일은 화면에
   * 뜬 68건이 언제 값인지 알려주는 것이므로, 그 68건을 낳은 회차만 봐야 한다.
   */
  const lastCharRun =
    runs.find((r) => getDiscovery(r.discoveryId)?.unit === 'subject')?.at ?? null;

  const href = (next: { lineage?: string; rights?: string; n?: number; tn?: number }) => {
    const p = new URLSearchParams();
    const l = next.lineage === '' ? undefined : (next.lineage ?? kind);
    const r =
      next.rights === '' ? undefined : (next.rights ?? (onlyIndividual ? 'individual' : undefined));
    if (l) p.set('lineage', l);
    if (r) p.set('rights', r);
    /*
     * 펼친 수는 이어 간다. 아래 '전체'를 더 펼쳤다고 위 '오늘 들어온 것'이 도로
     * 접히면, 두 버튼이 서로를 되돌리는 꼴이 된다.
     */
    const n = next.n ?? (Number(q.n) || undefined);
    const tn = next.tn ?? (Number(q.tn) || undefined);
    if (n) p.set('n', String(n));
    if (tn) p.set('tn', String(tn));
    const s = p.toString();
    return s ? `/characters?${s}` : '/characters';
  };

  return (
    <div className="space-y-5">
      {/* 세 갈래 탭. 메뉴에서 내려온 이슈·캐릭터·밈이다 (components/axis-tabs.tsx). */}
      <AxisTabs current="character" />

      <div>
        <h1 className="text-xl font-semibold tracking-tight">캐릭터·굿즈</h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
          소셜에서 캐릭터를 찾아 <strong>어디서 왔는지</strong>와 <strong>만들어도 되는 권리인지</strong>를
          가립니다. <strong>여러 계정이 말한 순서</strong>입니다 — 조회수가 아닙니다. 검색추이(급등)는 재지 않습니다 —
          그건 <Link href="/issues" className="underline">뉴스·사건</Link> 쪽 잣대입니다.
        </p>
      </div>

      {/*
        회차 상태 줄 (지시서 2장). 목록 맨 위 — 여기 68건이 언제 값인지를 먼저 알려야 한다.
      */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <RunStatus lastAt={lastCharRun} count={open.length} />
        <div className="flex flex-wrap items-start gap-3">
          {specs.map((s) => (
            <FindButton key={s.id} spec={s} quota={quotas.get(s.id)} />
          ))}
        </div>
      </div>

      {/*
        구획 하나 — **오늘 들어온 것.** 이번 회차의 소식만 올린다. 비면 통째로 안 그린다:
        "소식 0건" 이라는 빈 카드를 남겨 두면 화면 위쪽을 빈칸이 먹는다.
      */}
      {freshList.length > 0 && (
        <section>
          <SectionHead
            title="오늘 들어온 것"
            count={freshList.length}
            hint="마지막 회차에서 새로 잡혔거나 등급이 오른 것만 올립니다."
          />
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {topPage.map(([c, flag]) => (
              <ThumbCard
                key={c.id}
                c={c}
                grade={gradeOf(trends.get(trendKey(c))?.points ?? [], c.origin.runAt)}
                thumbs={shots.get(c.id) ?? []}
                shots={shotCounts.get(c.id) ?? 0}
                note={noteOf(c.id)}
                flag={flag}
              />
            ))}
          </div>
          {topMore > 0 && (
            <Link
              href={href({ tn: topLimit + PAGE * 3 })}
              className="num mt-3 inline-block rounded-lg px-3.5 py-2 text-[13px] font-medium transition-colors"
              style={{ background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink-2)' }}
            >
              {topMore}건 더
            </Link>
          )}
        </section>
      )}

      {/* 두 구획을 가르는 실선. 위는 소식, 아래는 재고다. */}
      {freshList.length > 0 && <hr style={{ border: 0, borderTop: '1px solid var(--line)' }} />}

      <section>
        <SectionHead
          title="전체"
          count={filtered.length}
          hint="어디서 온 캐릭터인지로 갈랐습니다. 여러 계정이 말한 순서입니다."
        />

        {/* 출신 칩. 선택된 것만 파랑 배경에 흰 글씨 — 어느 갈래를 보고 있는지가 한눈에 읽혀야 한다. */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Chip href={href({ lineage: '' })} on={!kind} label="전체" count={open.length} />
          {LINEAGE_KINDS.filter((k) => counts.get(k)).map((k) => (
            <Chip key={k} href={href({ lineage: k })} on={kind === k} label={k} count={counts.get(k) ?? 0} />
          ))}
          {individuals > 0 && (
            <>
              <span className="mx-1 h-4 w-px" style={{ background: 'var(--line)' }} />
              <Chip
                href={onlyIndividual ? href({ rights: '' }) : href({ rights: 'individual' })}
                on={onlyIndividual}
                label="개인 창작만"
                count={individuals}
                tone="magenta"
              />
            </>
          )}
        </div>

        {page.length === 0 ? (
          <p
            className="mt-3 px-3 py-10 text-center text-[13px]"
            style={{
              background: 'var(--surface)',
              border: '1px dashed var(--line)',
              borderRadius: 14,
              color: 'var(--ink-muted)',
            }}
          >
            이 조건에 맞는 캐릭터가 없습니다.
            {specs.length === 0 && ' 설정에서 TikHub 키를 넣어 주세요.'}
          </p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {page.map((c) => {
              const t = shots.get(c.id) ?? [];
              return (
                <ThumbCard
                  key={c.id}
                  c={c}
                  grade={gradeOf(trends.get(trendKey(c))?.points ?? [], c.origin.runAt)}
                  thumbs={t}
                  shots={shotCounts.get(c.id) ?? 0}
                  note={noteOf(c.id)}
                />
              );
            })}
          </div>
        )}
      </section>

      {/* 목록을 더 펼치는 동작은 목록 끝에 둔다. 발굴은 상단 상태 줄에서 시작한다. */}
      <div className="flex items-center justify-start gap-3 pt-1">
        {more > 0 ? (
          <Link
            href={href({ n: limit + PAGE * 3 })}
            className="num rounded-lg px-3.5 py-2 text-[13px] font-medium transition-colors"
            style={{ background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink-2)' }}
          >
            {more}건 더
          </Link>
        ) : (
          <span className="num text-[12px]" style={{ color: 'var(--ink-muted)' }}>
            {filtered.length}건을 모두 보고 있습니다
          </span>
        )}
      </div>

      <p className="text-[12px]" style={{ color: 'var(--ink-muted)' }}>
        수집 단계에서 19금 게시물은 버립니다. 글자만 보고 거르는 것이라 완벽하지 않습니다 —
        이상한 것이 보이면 기각해 주세요. 출신에 <strong>추정</strong>이 붙은 것은 자료에 없고
        모델이 아는 것이라 확인이 필요합니다.
      </p>
    </div>
  );
}

/**
 * 구획 제목 한 줄 (지시서 2장). 제목 + 건수 + 한 줄 설명.
 *
 * 건수를 제목 옆에 붙이는 이유는 **두 구획의 크기를 견주게 하려는 것**이다.
 * 68건 중 22건이 이번 소식이라는 게 숫자 두 개로 바로 읽혀야 한다.
 */
function SectionHead({ title, count, hint }: { title: string; count: number; hint: string }) {
  return (
    <div>
      <h2 className="text-[15px] font-semibold tracking-tight">
        {title}
        <span className="num ml-2 text-[13px] font-medium" style={{ color: 'var(--mute)' }}>
          {count}건
        </span>
      </h2>
      <p className="mt-0.5 text-[12.5px]" style={{ color: 'var(--mute)' }}>
        {hint}
      </p>
    </div>
  );
}

/** 알약 칩. 링크라서 클라이언트 컴포넌트가 필요 없다. */
function Chip({
  href,
  on,
  label,
  count,
  tone = 'blue',
}: {
  href: string;
  on: boolean;
  label: string;
  count: number;
  tone?: 'blue' | 'magenta';
}) {
  const active =
    tone === 'magenta'
      ? { background: '#8f2a86', color: '#fff' }
      : { background: 'var(--rita-blue)', color: '#fff' };
  return (
    <Link
      href={href}
      className="rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors"
      style={on ? active : { background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink-2)' }}
    >
      {label} <span className="num opacity-70">{count}</span>
    </Link>
  );
}
