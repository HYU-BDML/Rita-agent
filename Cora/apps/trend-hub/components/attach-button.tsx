'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function AttachButton({
  candidateId,
  discoveryId,
  name,
  mock,
}: {
  candidateId: string;
  discoveryId: string;
  name: string;
  mock: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();

  async function run() {
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/attach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateId, discoveryId }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) setMsg(json.error);
    else router.refresh();
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={run}
        disabled={busy}
        className="rounded-lg px-3 py-1.5 text-[12px] disabled:opacity-50" style={{ border: '1px solid var(--hairline)', color: 'var(--ink-2)' }}
        title="후보에서 입력을 채워 돌립니다. 주제를 다시 타이핑하지 않습니다."
      >
        {busy ? '…' : `${name} 붙이기`}
        {mock && <span className="ml-1 opacity-60">목</span>}
      </button>
      {msg && <span className="text-[12px]" style={{ color: 'var(--down)' }}>{msg}</span>}
    </span>
  );
}
