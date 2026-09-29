import { NextResponse } from 'next/server';
import { getDiscovery, isMock, newRunId } from '@/lib/core/registry';
import { quotaBlock, runQuota } from '@/lib/core/run-limit';
import { upsertCandidates } from '@/lib/core/store';
import type { RunContext } from '@/lib/core/adapters';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = (await req.json()) as { discoveryId?: string; inputs?: Record<string, string> };
  const d = getDiscovery(body.discoveryId ?? '');
  if (!d) return NextResponse.json({ error: '판정기를 찾을 수 없습니다.' }, { status: 404 });
  if (d.role !== 'produces') {
    return NextResponse.json({ error: '이 판정기는 후보를 낳지 않습니다. 후보 상세에서 붙이세요.' }, { status: 400 });
  }

  const trigger = req.headers.get('x-trend-hub-trigger') === 'automatic' ? 'automatic' : 'manual';

  /*
   * 상한을 **수집 전에** 본다. 이 아래로 내려가면 유료 API 가 이미 나간 뒤다.
   * 배포본에는 인증이 없으므로 여기가 돈이 새는 유일한 문턱이다 (lib/core/run-limit.ts).
   */
  const quota = await runQuota(d.id);
  const blocked = quotaBlock(quota, trigger);
  if (blocked) {
    return NextResponse.json({ error: blocked, quota }, { status: 429 });
  }

  const ctx: RunContext = {
    runId: newRunId(d.id),
    runAt: new Date().toISOString(),
    mock: isMock(d.keyEnv),
  };

  try {
    const raw = await d.run(body.inputs ?? {}, ctx);
    // 목 여부는 어댑터가 아니라 여기서 한 번에 박는다. 어댑터가 깜빡할 자리를 없앤다.
    const candidates = d
      .normalize(raw, ctx)
      .map((c) => ({ ...c, origin: { ...c.origin, mock: ctx.mock } }));
    // 게시물 레코드는 후보로 요약되기 전의 낱개다 (지시서 P2). 구현한 판정기만 낸다.
    const records = d.records?.(raw, ctx, candidates) ?? [];
    const { added, updated } = await upsertCandidates(
      candidates,
      {
        id: ctx.runId,
        discoveryId: d.id,
        at: ctx.runAt,
        input: body.inputs ?? {},
        trigger,
      },
      raw,
      records,
    );
    return NextResponse.json({
      runId: ctx.runId,
      mock: ctx.mock,
      count: candidates.length,
      added,
      updated,
      posts: records.length,
      quota: await runQuota(d.id),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
