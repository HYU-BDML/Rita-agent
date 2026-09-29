'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArchiveButton } from './archive-button';
import { TrackingControls } from './tracking-controls';

/**
 * 보관함 목록 — 담은 것만 골라 그린다.
 *
 * 담은 목록은 브라우저에만 있고 서버는 모른다. 그래서 **서버가 모든 후보의 요약을
 * 내려보내고 여기서 거른다.** 담은 id 를 서버에 넘겨 다시 받아 오면 왕복이 한 번 더
 * 생기고, 그 사이 화면이 비어 "보관함이 날아갔나" 싶은 순간이 생긴다.
 */
export interface LibraryItem {
  id: string;
  subject: string;
  axis: '뉴스·사건' | '캐릭터·굿즈' | '유행 포맷';
  blurb: string;
  thumb?: string;
  rights?: string;
  shots: number;
  tracking: { enabled: boolean; queries: string[]; lastCheckedAt?: string; nextCheckAt?: string };
}

export function LibraryList({ items }: { items: LibraryItem[] }) {
  const [axis, setAxis] = useState<LibraryItem['axis'] | 'all'>('all');
  const visible = axis === 'all' ? items : items.filter((item) => item.axis === axis);
  const counts = new Map<LibraryItem['axis'], number>();
  for (const item of items) counts.set(item.axis, (counts.get(item.axis) ?? 0) + 1);

  if (items.length === 0) {
    return (
      <div
        className="px-4 py-12 text-center"
        style={{ background: 'var(--surface)', border: '1px dashed var(--line)', borderRadius: 14 }}
      >
        <p className="text-[14px] font-medium">아직 추적 중인 소재가 없습니다</p>
        <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
          탐색 카드의 별표를 누르면 보관과 추적이 함께 시작됩니다. 카드를 누르면 상세 내용을 볼 수 있습니다.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block rounded-lg px-4 py-2 text-[13px] font-semibold"
          style={{ background: 'var(--grad)', color: '#fff' }}
        >
          탐색하기
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-[13px]" style={{ color: 'var(--ink-2)' }}>
          <strong className="num font-semibold">{items.length}건</strong> 추적 중
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="보관함 분류">
        <FilterTab active={axis === 'all'} count={items.length} onClick={() => setAxis('all')}>
          전체
        </FilterTab>
        {(['뉴스·사건', '캐릭터·굿즈', '유행 포맷'] as const).map((name) => (
          <FilterTab
            key={name}
            active={axis === name}
            count={counts.get(name) ?? 0}
            onClick={() => setAxis(name)}
          >
            {name}
          </FilterTab>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl px-4 py-10 text-center text-[13px]" style={{ background: 'var(--surface)', border: '1px dashed var(--line)', color: 'var(--ink-muted)' }}>
          이 분류에는 보관한 소재가 없습니다.
        </p>
      ) : (
        <ol className="space-y-2">
          {visible.map((x, i) => (
            <LibraryRow key={x.id} item={x} index={i} />
          ))}
        </ol>
      )}
    </div>
  );
}

function FilterTab({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors"
      style={active ? { background: 'var(--rita-ink)', color: '#fff' } : { background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink-2)' }}
    >
      {children} <span className="num ml-1 opacity-70">{count}</span>
    </button>
  );
}

function LibraryRow({ item: x, index: i }: { item: LibraryItem; index: number }) {
  return (
    <li
      className="flex items-center gap-3 p-3"
      style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 13 }}
    >
      <span className="num w-5 shrink-0 text-center text-[12px]" style={{ color: 'var(--dim)' }}>
        {i + 1}
      </span>
      {x.thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={x.thumb}
          alt=""
          loading="lazy"
          style={{ width: 52, height: 52, borderRadius: 8, objectFit: 'cover', flexShrink: 0, background: 'var(--line2)' }}
        />
      ) : (
        <span
          style={{ width: 52, height: 52, borderRadius: 8, flexShrink: 0, background: 'var(--line2)' }}
          aria-hidden
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link
            href={`/candidates/${encodeURIComponent(x.id)}`}
            className="truncate text-[14.5px] font-semibold hover:underline"
          >
            {x.subject}
          </Link>
          <span
            className="rounded px-1.5 py-0.5 text-[11px] font-medium"
            style={{ background: 'var(--line2)', color: 'var(--ink-2)' }}
          >
            {x.axis}
          </span>
          {x.rights && (
            <span className="text-[11.5px]" style={{ color: 'var(--mute)' }}>
              {x.rights}
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-[12.5px]" style={{ color: 'var(--ink-muted)' }}>
          {x.blurb || '요약이 아직 없습니다'}
        </p>
        <TrackingControls id={x.id} name={x.subject} enabled={x.tracking.enabled} queries={x.tracking.queries} lastCheckedAt={x.tracking.lastCheckedAt} />
      </div>
      <ArchiveButton id={x.id} name={x.subject} archived />
    </li>
  );
}
