'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * 다시 판정.
 *
 * 저장된 원본에 지금 규칙을 다시 돌린다. 수집도 LLM 도 부르지 않으니 돈이 안 든다.
 * 판정 규칙을 고쳤을 때 회차를 다시 돌리지 않고 표만 갱신하는 자리다.
 *
 * 결과를 숫자로 말한다 — 몇 건이 몇 건이 됐는지. 줄어드는 것도 정상이고,
 * 오히려 줄어드는 게 요점일 때가 있다(문턱을 올렸을 때).
 */
export function RenormButton({
  discoveryId,
  name,
  snapshots,
}: {
  discoveryId: string;
  name: string;
  snapshots: number;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  async function run() {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch('/api/renormalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discoveryId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErr(json.error ?? '알 수 없는 오류');
        return;
      }
      const bits = [`${json.before}건 → ${json.after}건`];
      if (json.orphanedProducts) bits.push(`제작물 ${json.orphanedProducts}개가 붙을 후보를 잃었습니다`);
      setMsg(bits.join(' · '));
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <button
        onClick={run}
        disabled={busy}
        className="rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-50"
        style={{ border: '1px solid var(--hairline)', color: 'var(--ink-2)' }}
        title={`${name} 원본 ${snapshots}회차에 지금 규칙을 다시 돌립니다`}
      >
        {busy ? '다시 판정 중…' : '다시 판정'}
      </button>
      {msg && (
        <span className="num text-[12px]" style={{ color: 'var(--ink-2)' }}>
          {msg}
        </span>
      )}
      {err && (
        <span className="text-[12px]" style={{ color: 'var(--down)' }}>
          {err}
        </span>
      )}
    </div>
  );
}
