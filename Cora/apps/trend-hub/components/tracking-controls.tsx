'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function TrackingControls({
  id,
  name,
  enabled,
  queries,
  lastCheckedAt,
}: {
  id: string;
  name: string;
  enabled: boolean;
  queries: string[];
  lastCheckedAt?: string;
}) {
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState(enabled);
  const [value, setValue] = useState(queries.join(', '));
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function save(nextOn = on) {
    setBusy(true);
    try {
      const nextQueries = value.split(',').map((query) => query.trim()).filter(Boolean);
      const res = await fetch('/api/tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, tracking: { enabled: nextOn, queries: nextQueries } }),
      });
      if (!res.ok) throw new Error('추적 설정을 저장하지 못했습니다.');
      setOn(nextOn);
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-1">
      <div className="flex items-center gap-2 text-[11px]" style={{ color: on ? 'var(--rita-blue)' : 'var(--ink-muted)' }}>
        <span>{on ? `추적 준비 · ${queries.join(' · ')}` : '추적 꺼짐'}{on && lastCheckedAt ? ` · 마지막 ${new Date(lastCheckedAt).toLocaleDateString('ko-KR')}` : ''}</span>
        <button type="button" onClick={() => setOpen(!open)} className="underline" aria-expanded={open}>
          설정
        </button>
      </div>
      {open && (
        <div className="mt-2 rounded-lg p-3" style={{ background: 'var(--plane)', border: '1px solid var(--line)' }}>
          <label className="block text-[11px] font-medium" htmlFor={`tracking-${id}`}>
            이 소재를 찾을 키워드
          </label>
          <input
            id={`tracking-${id}`}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="mt-1 w-full rounded-md px-2.5 py-2 text-[12px]"
            style={{ background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink)' }}
          />
          <p className="mt-1 text-[11px]" style={{ color: 'var(--ink-muted)' }}>쉼표로 나누세요. 최대 8개.</p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <button type="button" disabled={busy} onClick={() => void save(!on)} className="text-[12px] underline">
              {on ? '추적 끄기' : '추적 켜기'}
            </button>
            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={() => setOpen(false)} className="rounded-md px-2.5 py-1.5 text-[12px]" style={{ border: '1px solid var(--line)' }}>
                취소
              </button>
              <button type="button" disabled={busy} onClick={() => void save()} className="rounded-md px-2.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-60" style={{ background: 'var(--rita-blue)' }}>
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}