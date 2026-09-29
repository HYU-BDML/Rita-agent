'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function ArchiveButton({ id, name, archived }: { id: string; name: string; archived: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function change(action: 'archive' | 'restore') {
    setBusy(true);
    try {
      const res = await fetch('/api/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      if (!res.ok) throw new Error('보관 상태를 바꾸지 못했습니다.');
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label={archived ? `${name} 추적 중지` : `${name} 보관하고 추적하기`}
        title={archived ? '추적 중지' : '보관하고 추적'}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (archived) setOpen(true);
          else void change('archive');
        }}
        className="grid h-11 w-11 place-items-center rounded-full transition-colors hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
        style={{ color: archived ? 'var(--rita-blue)' : 'var(--ink-muted)' }}
      >
        <span className="text-[22px] leading-none" aria-hidden>{archived ? '★' : '☆'}</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 grid place-items-center bg-black/30 px-4"
          role="presentation"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`archive-title-${id}`}
            className="w-full max-w-sm rounded-xl p-5 shadow-xl"
            style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id={`archive-title-${id}`} className="text-[15px] font-semibold">추적을 중지할까요?</h2>
            <p className="mt-2 text-[13px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
              <strong>{name}</strong>을(를) 추적 목록에서 빼고 탐색 후보로 돌려놓습니다.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3.5 py-2 text-[13px]"
                style={{ border: '1px solid var(--line)', color: 'var(--ink-2)' }}
              >
                취소
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void change('restore')}
                className="rounded-lg px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
                style={{ background: 'var(--rita-blue)' }}
              >
                {busy ? '처리 중…' : '추적 중지'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
