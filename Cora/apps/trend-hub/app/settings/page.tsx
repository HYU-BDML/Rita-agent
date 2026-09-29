import Link from 'next/link';
import { keyStatuses } from '@/lib/core/keys';
import { availableDiscoveries, heldDiscoveries, heldProducers } from '@/lib/core/registry';
import { maxRunsPerDay, maxRunsPerDiscovery } from '@/lib/core/run-limit';
import { DEFAULT_MAX_AGE_DAYS, MAX_MISS_DAYS } from '@/lib/core/retire';
import { collectionSchedule, listCandidates } from '@/lib/core/store';
import type { Candidate } from '@/lib/core/candidate';
import { isBlocked, isFlagged } from '@/lib/core/axis';
import { ScheduleControls } from '@/components/schedule-controls';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const keys = keyStatuses();
  const schedule = await collectionSchedule();
  /*
   * 안전 판정에서 막힌 후보. **이 앱에서 내용을 볼 수 있는 유일한 자리다.**
   * 목록·상세·계약에서는 다 뺐다 — 일하다 마주칠 자리가 아니기 때문이다.
   * 그래도 볼 수 있어야 한다: 오판을 풀려면 무엇을 보고 막았는지 알아야 한다.
   */
  const cands = await listCandidates();
  const blocked = cands.filter(isBlocked);
  const flagged = cands.filter(isFlagged);
  // 키를 넣어도 안 열리는 것들. 키 없음과 섞어 두면 사람이 헛되이 키를 찾으러 간다.
  const held = [
    ...heldDiscoveries().map((d) => ({ kind: '판정기', name: d.name, id: d.id, why: d.held ?? '' })),
    ...heldProducers().map((p) => ({ kind: '생성기', name: p.name, id: p.id, why: p.held ?? '' })),
  ];
  const set = keys.filter((k) => k.set).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">설정</h1>
        {/* 추적은 운영자 기능이라 상단바가 아니라 여기서 들어간다. */}
        <p className="mt-1 text-[12.5px]">
          <Link href="/settings/tracking" className="underline" style={{ color: 'var(--rita-blue)' }}>
            추적 — 수집이 매일 새 기사를 붙일 대상 고르기
          </Link>
        </p>
        <p className="mt-1 text-[13px]" style={{ color: 'var(--ink-2)' }}>
          {set}/{keys.length} 꽂힘. 없어도 앱은 돕니다 — 그 기능만 목 데이터가 됩니다.
        </p>
      </div>

      <ScheduleControls
        initial={schedule}
        discoveries={availableDiscoveries()
          .filter((d) => d.role === 'produces')
          .map((d) => ({ id: d.id, name: d.name }))}
        defaults={{
          perDiscovery: maxRunsPerDiscovery(),
          total: maxRunsPerDay(),
          maxAgeDays: DEFAULT_MAX_AGE_DAYS,
          maxMissDays: MAX_MISS_DAYS,
        }}
      />

      <section className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
        <h2 className="text-[13px] font-semibold">
          키가 필요 없는 것
        </h2>
        <p className="mt-1 text-[13px]" style={{ color: 'var(--ink-2)' }}>
          뉴스 RSS 9곳(연합뉴스 · 매일경제 · 플래텀 · 고구마팜 · 모비인사이드 · 매드타임스 ·
          브랜드브리프 · 뉴스와이어 · 구글 트렌드)은 아무것도 안 넣어도 바로 됩니다.
        </p>
      </section>

      <section className="space-y-5">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight">연결 상태</h2>
          <p className="mt-1 text-[12px] leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
            외부 서비스 연결 여부와 키를 넣는 방법을 한 곳에서 확인합니다. 키 값 자체는 표시하지 않습니다.
          </p>
        </div>

        <div className="space-y-3">
          <h3 className="text-[13px] font-semibold">키 넣는 법</h3>
        <ol className="list-decimal space-y-1.5 pl-5 text-[13px]" style={{ color: 'var(--ink-2)' }}>
          <li>
            메모장이나 VS Code 로{' '}
            <code className="rounded px-1 py-0.5 text-[12px]" style={{ background: 'var(--flat)' }}>
              C:\Users\mooja\trend-hub\.env.local
            </code>{' '}
            을 엽니다. (이미 만들어 뒀습니다)
          </li>
          <li>
            해당 줄의 <code className="rounded px-1 py-0.5 text-[12px]" style={{ background: 'var(--flat)' }}>=</code>{' '}
            오른쪽에 값만 붙여넣습니다. 따옴표·띄어쓰기 없이.
          </li>
          <li>
            저장하면 앱이 알아서 다시 읽습니다. 이 화면을 새로고침해서 초록으로 바뀌면 된 겁니다.
            (안 바뀌면 서버를 껐다 켜세요.)
          </li>
        </ol>
        <pre className="overflow-x-auto rounded-lg p-3 text-[12px]" style={{ background: 'var(--flat)' }}>{`YOUTUBE_KEY=AIzaSyABC123...     ← 이렇게
YOUTUBE_KEY="AIzaSyABC123..."   ← 따옴표 넣지 마세요
YOUTUBE_KEY = AIzaSyABC123...   ← = 옆에 띄어쓰기 넣지 마세요`}</pre>
        <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
          이 파일은 서버에서만 읽힙니다. 브라우저로 나가지 않고, git 에도 올라가지 않습니다.
        </p>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
        <table className="w-full text-sm">
          <thead className="text-left text-[11px]" style={{ background: 'var(--plane)', color: 'var(--ink-muted)' }}>
            <tr>
              <th className="px-4 py-2 font-medium">상태</th>
              <th className="px-4 py-2 font-medium">키</th>
              <th className="px-4 py-2 font-medium">넣으면 열리는 것</th>
              <th className="px-4 py-2 font-medium">어디서 얻나</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
            {keys.map((k) => (
              <tr key={k.env} className={k.set ? '' : 'opacity-70'}>
                <td className="whitespace-nowrap px-4 py-3">
                  {k.set ? (
                    <span className="rounded px-1.5 py-0.5 text-[11px] font-medium text-white" style={{ background: 'var(--up)' }}>
                      꽂힘
                    </span>
                  ) : (
                    <span className="rounded px-1.5 py-0.5 text-[11px] font-medium" style={{ background: 'var(--flat)', color: 'var(--ink-muted)' }}>
                      비어 있음
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium">
                    {k.label}
                    {k.paid && <span className="ml-1.5 text-xs font-normal text-amber-600">유료</span>}
                  </div>
                  <code className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>{k.env}</code>
                </td>
                <td className="px-4 py-3" style={{ color: 'var(--ink-2)' }}>{k.unlocks}</td>
                <td className="px-4 py-3 text-xs text-neutral-500">{k.where}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
        키 값은 이 화면에 절대 표시되지 않습니다. 꽂혔는지 여부만 봅니다.
      </p>

      {held.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-[13px] font-semibold">
              세워 둔 것
              <span className="num ml-2 font-normal" style={{ color: 'var(--ink-muted)' }}>{held.length}</span>
            </h2>
            <p className="mt-0.5 text-[12px]" style={{ color: 'var(--ink-muted)' }}>
              키를 넣어도 열리지 않습니다. 고쳐야 열립니다. 그래서 화면에서 내렸습니다 —
              되는 것과 안 되는 것이 같은 목록에 섞이면 화면이 거짓말을 합니다.
            </p>
          </div>
          <ul className="space-y-2">
            {held.map((h) => (
              <li
                key={`${h.kind}:${h.id}`}
                className="rounded-lg px-3.5 py-3"
                style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
              >
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-[13px] font-medium">{h.name}</span>
                  <span className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>{h.kind}</span>
                  <code className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>{h.id}</code>
                </div>
                <p className="mt-1 text-[12px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>{h.why}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(blocked.length > 0 || flagged.length > 0) && (
        <details className="rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-[13px] font-semibold">
            <span>안전 필터 및 검토 기록<span className="num ml-2 font-normal" style={{ color: 'var(--ink-muted)' }}>{blocked.length + flagged.length}건</span></span>
            <span className="text-[12px] font-normal" style={{ color: 'var(--ink-muted)' }}>필요할 때 열기</span>
          </summary>
          <div className="border-t px-4 pb-4 pt-3" style={{ borderColor: 'var(--hairline)' }}>
            <p className="text-[12px] leading-relaxed" style={{ color: 'var(--ink-muted)' }}>목록에서 제외되거나 확인이 필요한 후보입니다. 판정한 <strong>근거 문장을 그대로</strong> 두었으니 오판이면 여기서 확인하세요.</p>
            {blocked.length > 0 && <SafetyGroup title="제외 — 만들지 않습니다" hint="사람이 다친 사건·자해·성적 표현. 상세 페이지도 열리지 않고 계약으로도 나가지 않습니다." items={blocked} tone={{ background: '#fee2e2', color: '#7f1d1d' }} />}
            {flagged.length > 0 && <SafetyGroup title="확인 필요 — 막지는 않았습니다" hint="블랙 코미디·자조·과장처럼 판단이 갈릴 만한 것. 상세는 열리고 계약에는 safety_note 를 달고 나갑니다." items={flagged} tone={{ background: '#fef3c7', color: '#78350f' }} />}
          </div>
        </details>
      )}
    </div>
  );
}

/**
 * 안전 판정 묶음. **차단과 표시를 한 화면에 두되 섞지 않는다** —
 * 목록에서 빠지는 것은 같고 그 뒤 처리가 달라서, 구분이 안 되면 사람이 잘못 푼다.
 */
function SafetyGroup({
  title,
  hint,
  items,
  tone,
}: {
  title: string;
  hint: string;
  items: Candidate[];
  tone: { background: string; color: string };
}) {
  return (
    <div className="mt-4">
      <h3 className="rounded px-2 py-1 text-[12px] font-semibold" style={tone}>
        {title}
        <span className="num ml-2 font-normal">{items.length}</span>
      </h3>
      <p className="mt-1 text-[12px]" style={{ color: 'var(--ink-muted)' }}>
        {hint}
      </p>
      <ul className="mt-2 space-y-2">
        {items.map((c) => (
          <li
            key={c.id}
            className="rounded-lg px-3 py-2.5 text-[12px] leading-relaxed"
            style={{ background: 'var(--plane)', border: '1px solid var(--hairline)' }}
          >
            <div className="flex items-baseline gap-2">
              {/* 차단은 상세가 안 열리므로 링크를 걸지 않는다. 표시는 열린다. */}
              {c.safety?.level === 'flagged' ? (
                <Link href={`/candidates/${encodeURIComponent(c.id)}`} className="text-[13px] font-semibold underline">
                  {c.subject}
                </Link>
              ) : (
                <strong className="text-[13px]">{c.subject}</strong>
              )}
              <span style={{ color: 'var(--ink-muted)' }}>{c.verdict}</span>
            </div>
            <p className="mt-1">{c.safety?.reason}</p>
            {c.safety?.evidence && (
              <p className="mt-1" style={{ color: 'var(--ink-muted)' }}>
                그렇게 본 캡션: “{c.safety.evidence}”
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
