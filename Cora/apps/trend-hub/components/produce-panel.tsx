'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { InputField } from '@/lib/core/adapters';

interface Offer {
  id: string;
  name: string;
  description: string;
  ok: boolean;
  reason: string | null;
  extraInputs: InputField[];
  mock: boolean;
  mapped: Record<string, string> | null;
}

/**
 * 후보 → 생성기.
 *
 * 막힌 생성기를 숨기지 않고 '왜 막혔는지'와 함께 보여준다.
 * 권리 판정이 이 앱의 값어치인데, 안 보이면 값어치가 안 보인다.
 */
export function ProducePanel({ candidateId, offers }: { candidateId: string; offers: Offer[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();

  async function produce(offer: Offer) {
    setBusy(true);
    setMsg(null);
    const inputs: Record<string, string> = {};
    for (const f of offer.extraInputs) inputs[f.name] = values[f.name] ?? f.default ?? '';
    const res = await fetch('/api/produce', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateId, producerId: offer.id, inputs }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(json.error);
      return;
    }
    setOpen(null);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {offers.map((o) => (
        <div key={o.id} className="rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
          <div className="flex items-start justify-between gap-4 p-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{o.name}</span>
                {o.mock && <span className="text-xs text-neutral-500">목</span>}
              </div>
              <p className="mt-0.5 text-[12px]" style={{ color: 'var(--ink-2)' }}>{o.description}</p>
              {!o.ok && (
                <p className="mt-2 rounded-md px-2 py-1.5 text-[12px]" style={{ background: 'var(--flat)', color: 'var(--down)' }}>
                  {o.reason}
                </p>
              )}
            </div>
            <button
              onClick={() => setOpen(open === o.id ? null : o.id)}
              disabled={!o.ok}
              className="shrink-0 rounded-lg px-3.5 py-2 text-[13px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-40" style={{ background: 'var(--ink)' }}
            >
              만들기
            </button>
          </div>

          {open === o.id && o.ok && (
            <div className="space-y-3 p-4" style={{ borderTop: '1px solid var(--hairline)' }}>
              {o.extraInputs.length === 0 && (
                <p className="text-xs text-neutral-500">추가로 물을 것이 없습니다. 후보가 전부 채웠습니다.</p>
              )}
              {o.extraInputs.map((f) => (
                <label key={f.name} className="block space-y-1">
                  <span className="text-xs font-medium">{f.label}</span>
                  {f.type === 'select' ? (
                    <select
                      className="w-full rounded-md px-2 py-1.5 text-sm" style={{ background: 'var(--plane)', border: '1px solid var(--hairline)', color: 'var(--ink)' }}
                      value={values[f.name] ?? f.default ?? ''}
                      onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
                    >
                      {(f.options ?? []).map((x) => (
                        <option key={x} value={x}>
                          {x}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="w-full rounded-md px-2 py-1.5 text-sm" style={{ background: 'var(--plane)', border: '1px solid var(--hairline)', color: 'var(--ink)' }}
                      value={values[f.name] ?? f.default ?? ''}
                      onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
                    />
                  )}
                  {f.help && <span className="block text-xs text-neutral-500">{f.help}</span>}
                </label>
              ))}

              {o.mapped && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-neutral-500">
                    후보가 채운 입력 {Object.keys(o.mapped).length}칸 보기
                  </summary>
                  <pre className="mt-2 max-h-56 overflow-auto rounded bg-neutral-50 p-2 dark:bg-neutral-900">
                    {JSON.stringify(o.mapped, null, 2)}
                  </pre>
                </details>
              )}

              <button
                onClick={() => produce(o)}
                disabled={busy}
                className="rounded-lg px-3.5 py-2 text-[13px] font-medium text-white disabled:opacity-50" style={{ background: 'var(--ink)' }}
              >
                {busy ? '도는 중…' : '실행'}
              </button>
              {msg && <p className="text-xs text-rose-600">{msg}</p>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
