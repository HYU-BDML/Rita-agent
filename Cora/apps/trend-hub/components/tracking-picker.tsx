'use client';

import { useMemo, useState } from 'react';
import { fold } from '@/lib/core/search';
import { ArchiveButton } from './archive-button';
import { TrackingControls } from './tracking-controls';

/**
 * 추적 걸기 — **운영자 화면이다.**
 *
 * 전에는 이 별표가 소재 카드 우상단에 있었다. 그 자리에서 사람이 누르는 것은 "내가
 * 나중에 볼 것"인데 실제로 하는 일은 **서버에 수집 대상을 등록하는 것**이었다. 배포본
 * 에서는 A 가 누른 별표가 B 화면에도 별표로 뜨고, Render 무료 플랜은 디스크를 못 붙여
 * 재배포하면 그 목록이 말없이 비워진다. 실제로 그랬다 — 지금 archived 가 0 건이다.
 *
 * 그래서 두 축을 갈랐다. 담기는 브라우저(`components/pick.tsx`), 추적은 여기다.
 * **기능을 없앤 것이 아니다.** 수집이 매일 새 기사를 붙일 대상을 서버가 알아야 하므로
 * `lifecycle: 'archived'` 와 `/api/archive` 는 그대로 살아 있고, 누르는 자리만 옮겼다.
 *
 * 카드에서 별표를 떼면 추적을 새로 걸 길이 사라지므로, 여기서 걸 수 있어야 한다.
 * 그래서 이 화면은 추적 중인 것만 보여주지 않고 **걸 수 있는 것도 함께** 낸다.
 *
 * 문구는 `docs/WORDS.md` 가 덮지 않는 영역이다 (§16 — 운영자가 보는 자리에서는 `회차`
 * `판정기` 가 오히려 정확하다). 사용자 화면의 금지어 규칙을 여기에 적용하지 않는다.
 */
export interface TrackRow {
  id: string;
  subject: string;
  axis: string;
  archived: boolean;
  queries: string[];
  enabled: boolean;
  lastCheckedAt?: string;
}

/** 한 번에 그리는 줄 수. 149건을 다 펼치면 훑을 수가 없다. */
const PAGE = 40;

export function TrackingPicker({ rows }: { rows: TrackRow[] }) {
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);

  const tracked = useMemo(() => rows.filter((r) => r.archived), [rows]);
  const rest = useMemo(() => {
    const needle = fold(q.trim());
    const pool = rows.filter((r) => !r.archived);
    if (!needle) return pool;
    return pool.filter((r) => fold(r.subject).includes(needle));
  }, [rows, q]);

  const shown = all ? rest : rest.slice(0, PAGE);

  return (
    <div className="space-y-7">
      <section className="space-y-3">
        <h2 className="text-[15px] font-semibold tracking-tight">
          추적 중 <span className="num font-normal" style={{ color: 'var(--ink-muted)' }}>{tracked.length}</span>
        </h2>
        {tracked.length ? (
          <ul className="space-y-2">
            {tracked.map((r) => (
              <li
                key={r.id}
                className="rounded-xl p-3"
                style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <ArchiveButton id={r.id} name={r.subject} archived />
                  <strong className="text-[14px]">{r.subject}</strong>
                  <span className="text-[12px]" style={{ color: 'var(--ink-muted)' }}>
                    {r.axis}
                  </span>
                </div>
                <div className="mt-2">
                  <TrackingControls
                    id={r.id}
                    name={r.subject}
                    enabled={r.enabled}
                    queries={r.queries}
                    lastCheckedAt={r.lastCheckedAt}
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p
            className="rounded-xl px-4 py-6 text-center text-[13px]"
            style={{ background: 'var(--surface)', border: '1px dashed var(--line)', color: 'var(--ink-muted)' }}
          >
            추적 중인 소재가 없습니다. 아래에서 별표를 눌러 등록하세요.
            {/* 재배포하면 이 목록이 비워진다. 무료 플랜은 디스크를 못 붙인다. */}
            <br />
            재배포하면 이 목록은 초기화됩니다 (무료 플랜은 디스크를 붙일 수 없습니다).
          </p>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="text-[15px] font-semibold tracking-tight">
            추적 걸기 <span className="num font-normal" style={{ color: 'var(--ink-muted)' }}>{rest.length}</span>
          </h2>
          <label className="text-[12px]" style={{ color: 'var(--ink-muted)' }}>
            <span className="sr-only">소재 이름으로 걸러내기</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="이름으로 걸러내기"
              className="rounded-lg px-2.5 py-1.5 text-[12.5px] outline-none"
              style={{ background: 'var(--plane)', border: '1px solid var(--line)', color: 'var(--ink)' }}
            />
          </label>
        </div>
        <ul className="space-y-1.5">
          {shown.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center gap-2 rounded-lg px-3 py-2"
              style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
            >
              <ArchiveButton id={r.id} name={r.subject} archived={false} />
              <strong className="text-[13.5px]">{r.subject}</strong>
              <span className="text-[12px]" style={{ color: 'var(--ink-muted)' }}>
                {r.axis}
              </span>
            </li>
          ))}
        </ul>
        {!all && rest.length > PAGE && (
          <button
            type="button"
            onClick={() => setAll(true)}
            className="rounded-lg px-3 py-2 text-[12.5px]"
            style={{ border: '1px solid var(--line)', color: 'var(--ink-2)' }}
          >
            나머지 <span className="num">{rest.length - PAGE}</span>건 더 보기
          </button>
        )}
      </section>
    </div>
  );
}
