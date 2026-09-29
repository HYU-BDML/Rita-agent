import { NextResponse } from 'next/server';
import { getProducer, isMock, newRunId } from '@/lib/core/registry';
import { addProduct, getCandidate } from '@/lib/core/store';
import type { RunContext } from '@/lib/core/adapters';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = (await req.json()) as {
    candidateId?: string;
    producerId?: string;
    inputs?: Record<string, string>;
  };
  const p = getProducer(body.producerId ?? '');
  if (!p) return NextResponse.json({ error: '생성기를 찾을 수 없습니다.' }, { status: 404 });

  const c = await getCandidate(body.candidateId ?? '');
  if (!c) return NextResponse.json({ error: '후보를 찾을 수 없습니다.' }, { status: 404 });

  if (!p.accepts.includes(c.unit)) {
    return NextResponse.json({ error: `${p.name}는 이 종류의 후보를 받지 않습니다.` }, { status: 400 });
  }
  // 권리 게이트는 서버에서 다시 본다. 화면에서 버튼을 감추는 것만으로는 막은 게 아니다.
  const gate = p.gate(c);
  if (!gate.ok) return NextResponse.json({ error: gate.reason, gated: true }, { status: 409 });

  const ctx: RunContext = {
    runId: newRunId(p.id),
    runAt: new Date().toISOString(),
    mock: isMock(p.keyEnv),
  };

  try {
    const inputs = { ...p.mapInputs(c), ...(body.inputs ?? {}) };
    const result = await p.run(inputs, c, ctx);
    const product = {
      ...result,
      id: `${p.id}:${c.id}:${ctx.runId}`,
      producerId: p.id,
      candidateId: c.id,
      createdAt: ctx.runAt,
    };
    await addProduct(product);
    return NextResponse.json({ ok: true, mock: ctx.mock, product });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
