import Link from 'next/link';
import { listCandidates, listRuns, listSnapshots } from '@/lib/core/store';
import { getDiscovery } from '@/lib/core/registry';
import { runDigests } from '@/lib/core/trend';
import { GrowthDelta } from '@/components/growth';
import { RenormButton } from '@/components/renorm-button';
import { SurgeDot } from '@/components/surge';

export const dynamic = 'force-dynamic';

/**
 * 회차.
 *
 * 후보 표는 회차마다 덮어써져서 지금 값만 남는다. 그래서 '언제부터 뜬 건지',
 * '지난번엔 어땠는지'가 후보 화면에서 사라진다. 그걸 여기서 되살린다.
 * 저장된 원본을 다시 정규화해 만든 화면이라 새로 쌓아 둔 데이터가 없다.
 */
export default async function RunsPage() {
  const [runs, digests, candidates, snapshots] = await Promise.all([
    listRuns(),
    runDigests(),
    listCandidates(),
    listSnapshots(),
  ]);

  // 판정기별로 남아 있는 원본 수. 이게 다시 판정할 수 있는 밑천이다.
  const stock = new Map<string, number>();
  for (const s of snapshots) stock.set(s.discoveryId, (stock.get(s.discoveryId) ?? 0) + 1);
  const hasRadar = runs.some((run) => run.discoveryId === 'radar');

  // 지금 후보 표에 살아 있는 이름만 링크를 건다. 옛 회차에만 있던 건 글씨로만 둔다.
  const live = new Map(candidates.map((c) => [c.subject, c.id]));

  if (!runs.length) {
    return (
      <div className="py-10 text-center text-[13px]" style={{ color: 'var(--ink-muted)' }}>
        아직 돌린 회차가 없습니다.{' '}
        <Link href="/" className="underline">
          지금 뜨는 것
        </Link>{' '}
        에서 한 번 찾아보세요.
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <div>
        {/* 상단바의 낱말과 같다 (`docs/WORDS.md` §13-1). 본문은 운영자 화면이라 §16 이 그대로 두라고 했다. */}
        <h1 className="text-xl font-semibold tracking-tight">지난 기록</h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
          찾기를 돌린 기록 {runs.length}번. 회차마다 남겨 둔 원본을 다시 읽어 그때 뜬 것을 되살렸습니다.
          같은 이름이 다시 나오면 후보 표에서는 덮어써지지만, 여기서는 회차별로 남습니다.
        </p>
      </div>

      {hasRadar && (
        <section className="rounded-xl px-4 py-3.5" style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
          <h2 className="text-[13px] font-semibold">트렌드 레이더는 무엇을 하나요?</h2>
          <p className="mt-1 text-[12px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
            별도 레이더가 여러 플랫폼의 급상승 목록을 넓게 포착하고, 이 앱은 그 결과 파일을 읽어 소재 후보로 정리합니다.
            뉴스·캐릭터·유행 포맷처럼 여기서 새로 수집하는 기능이 아니라, 외부에서 들어오는 소재 출처입니다.
          </p>
        </section>
      )}

      {stock.size > 0 && (
        <section className="space-y-3 rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
          <div>
            <h2 className="text-[13px] font-semibold">저장된 원본으로 다시 판정</h2>
            <p className="mt-0.5 max-w-2xl text-[12px] leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
              판정 규칙을 고쳤을 때 씁니다. 새 수집이나 LLM 호출 없이 저장된 원본만 다시 읽어 몇 초 안에 정리합니다.
              후보 표가 지금 규칙으로 새로 세워지고, 채택·기각 같은 사람의 판단은 그대로 물려받습니다.
            </p>
          </div>
          <ul className="space-y-2">
            {[...stock].map(([id, n]) => {
              const d = getDiscovery(id);
              return (
                <li key={id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <span className="text-[13px]">
                    {d?.name ?? id}
                    {id === 'radar' && (
                      <span className="ml-2 rounded px-1.5 py-0.5 text-[10.5px]" style={{ background: 'var(--flat)', color: 'var(--ink-2)' }}>
                        외부 레이더 결과
                      </span>
                    )}
                    <span className="num ml-2 text-[12px]" style={{ color: 'var(--ink-muted)' }}>
                      원본 {n}회차
                    </span>
                    {d?.held && (
                      <span
                        className="ml-2 rounded px-1.5 py-0.5 text-[10.5px]"
                        style={{ background: 'var(--flat)', color: 'var(--ink-2)' }}
                      >
                        세워 둠
                      </span>
                    )}
                  </span>
                  <RenormButton discoveryId={id} name={d?.name ?? id} snapshots={n} />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {digests.length === 0 && (
        <p className="rounded-lg px-3 py-3 text-[13px]" style={{ background: 'var(--surface)', border: '1px dashed var(--hairline)', color: 'var(--ink-muted)' }}>
          회차 기록은 있는데 원본이 남아 있지 않습니다. 원본 없이 돌린 회차는 되살릴 수 없습니다.
        </p>
      )}

      {digests.map((d) => {
        const name = getDiscovery(d.discoveryId)?.name ?? d.discoveryId;
        return (
          <section key={d.runId} className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[13px] font-semibold">
                {name}
                {d.discoveryId === 'radar' && (
                  <span className="ml-2 rounded px-1.5 py-0.5 text-[10.5px] font-normal" style={{ background: 'var(--flat)', color: 'var(--ink-2)' }}>
                    외부 레이더 포착
                  </span>
                )}
                <span className="num ml-2 font-normal" style={{ color: 'var(--ink-muted)' }}>
                  {new Date(d.at).toLocaleString('ko-KR', {
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </h2>
              <span className="num text-[12px]" style={{ color: 'var(--ink-muted)' }}>
                {d.items.length}건 중 처음 나온 것 {d.freshCount}건
              </span>
            </div>

            <ul className="overflow-hidden rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
              {d.items.map((it) => {
                const id = live.get(it.subject);
                const inner = (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2.5">
                    <SurgeDot surge={it.surge} />
                    <span className="text-[13px]">{it.subject}</span>
                    {it.fresh && (
                      <span
                        className="rounded px-1.5 py-0.5 text-[10.5px] font-medium"
                        style={{ background: 'var(--flat)', color: 'var(--ink-2)' }}
                      >
                        처음
                      </span>
                    )}
                    {/* 못 잰 것은 칸째 빠진다 (지시서 3-2). 지우지 않고 조건만 건다. */}
                    {it.surge != null && (
                      <span className="num ml-auto text-[12px]" style={{ color: 'var(--ink-2)' }}>
                        {`${it.surge}×`}
                      </span>
                    )}
                    {!it.fresh && (
                      <span className="w-full sm:w-auto sm:shrink-0">
                        <GrowthDelta growth={it.growth} runs={2} />
                      </span>
                    )}
                  </div>
                );
                return (
                  <li key={it.subject} style={{ borderTop: '1px solid var(--hairline)' }} className="first:border-t-0">
                    {id ? (
                      <Link
                        href={`/candidates/${encodeURIComponent(id)}`}
                        className="block transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
                      >
                        {inner}
                      </Link>
                    ) : (
                      inner
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
