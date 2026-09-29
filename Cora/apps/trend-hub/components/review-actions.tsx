'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ReviewState } from '@/lib/core/candidate';

const OPTIONS: { value: ReviewState; label: string }[] = [
  { value: 'adopted', label: '채택' },
  { value: 'held', label: '보류' },
  { value: 'rejected', label: '기각' },
  { value: 'pending', label: '되돌리기' },
];

/**
 * 사람 검토. Dify 워크플로우에는 없던 것이고, 있어야 다음 회차가 좋아진다.
 * 새 회차가 같은 후보를 다시 낳아도 이 판단은 덮어쓰지 않는다(store.upsertCandidates).
 */
export function ReviewActions({ id, current, note }: { id: string; current: ReviewState; note: string }) {
  const [value, setValue] = useState(note);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function save(review: ReviewState) {
    setBusy(true);
    await fetch('/api/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, review, note: value }),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <section className="space-y-2.5 rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
      <h2 className="text-[13px] font-semibold">이 후보를 어떻게 할까요</h2>
      <textarea
        rows={2}
        placeholder="판단 메모 (선택)"
        className="w-full rounded-md px-3 py-2 text-sm" style={{ background: 'var(--plane)', border: '1px solid var(--hairline)', color: 'var(--ink)' }}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            onClick={() => save(o.value)}
            disabled={busy}
            className="rounded-lg px-3 py-1.5 text-[13px] transition-colors disabled:opacity-50"
            style={
              current === o.value
                ? { background: 'var(--ink)', color: 'var(--surface)' }
                : { border: '1px solid var(--hairline)', color: 'var(--ink-2)' }
            }
          >
            {o.label}
          </button>
        ))}
      </div>
    </section>
  );
}
