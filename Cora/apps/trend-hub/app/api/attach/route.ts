import { NextResponse } from 'next/server';
import { getAttaching, isMock, newRunId } from '@/lib/core/registry';
import { getCandidate, patchCandidate, upsertPosts } from '@/lib/core/store';
import type { RunContext } from '@/lib/core/adapters';

export const dynamic = 'force-dynamic';

/** 부착기(벤치마크)를 후보 하나에 대해 돌린다. 입력은 후보에서 채운다. */
export async function POST(req: Request) {
  const body = (await req.json()) as { candidateId?: string; discoveryId?: string };
  const d = getAttaching(body.discoveryId ?? '');
  if (!d) return NextResponse.json({ error: '부착기를 찾을 수 없습니다.' }, { status: 404 });

  const c = await getCandidate(body.candidateId ?? '');
  if (!c) return NextResponse.json({ error: '후보를 찾을 수 없습니다.' }, { status: 404 });

  const ctx: RunContext = {
    runId: newRunId(d.id),
    runAt: new Date().toISOString(),
    mock: isMock(d.keyEnv),
  };

  try {
    const raw = await d.run(d.inputsFrom(c), ctx);
    const patch = d.attach(c, raw, ctx);
    await patchCandidate(c.id, { hint: { ...c.hint, ...patch } });

    // 부착기도 게시물 레코드를 낸다 (지시서 P2). 부착기가 보는 후보는 이 하나뿐이다.
    // 이게 없으면 YouTube 영상이 어디에도 안 남아 P5 시간축에 쓸 것이 없다.
    const posts = await upsertPosts(d.records?.(raw, ctx, [c]) ?? []);

    return NextResponse.json({
      ok: true,
      mock: ctx.mock,
      added: patch.references?.length ?? 0,
      posts,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
