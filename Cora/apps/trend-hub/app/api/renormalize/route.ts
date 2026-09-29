import { NextResponse } from 'next/server';
import { getDiscovery } from '@/lib/core/registry';
import { renormalize } from '@/lib/core/store';

export const dynamic = 'force-dynamic';

/**
 * 저장된 원본에 지금 규칙을 다시 돌린다. 수집도 LLM 도 부르지 않는다 — 공짜다.
 *
 * 세워 둔(held) 판정기도 다시 판정은 된다. 새로 돌리는 게 막힌 것이지
 * 옛 원본을 지금 규칙으로 다시 읽는 건 오히려 세워 둔 뒤에 해야 하는 일이다.
 */
export async function POST(req: Request) {
  const body = (await req.json()) as { discoveryId?: string };
  const d = getDiscovery(body.discoveryId ?? '');
  if (!d) return NextResponse.json({ error: '판정기를 찾을 수 없습니다.' }, { status: 404 });

  try {
    const r = await renormalize(
      d.id,
      (raw, ctx) => d.normalize(raw, ctx),
      // 게시물 레코드도 같이 다시 세운다 (지시서 P2). 구현 안 한 판정기면 undefined 다.
      d.records ? (raw, ctx, cands) => d.records!(raw, ctx, cands) : undefined,
      // 같은 회차를 여러 번 읽었으면 마지막 것만 쓴다 (레이더). 구현 안 한 판정기면 undefined.
      d.snapshotKey ? (raw) => d.snapshotKey!(raw) : undefined,
    );
    return NextResponse.json({ ok: true, name: d.name, ...r });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
