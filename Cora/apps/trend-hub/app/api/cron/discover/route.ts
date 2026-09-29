import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = req.headers.get('authorization');
  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: '자동 실행 인증이 필요합니다.' }, { status: 401 });
  }

  const body = (await req.json()) as { discoveryId?: string; inputs?: Record<string, string> };
  if (!body.discoveryId) {
    return NextResponse.json({ error: 'discoveryId가 필요합니다.' }, { status: 400 });
  }

  /*
   * 하루 상한은 여기서 세지 않는다. `/api/discover` 가 자동·수동을 한자리에서 세고
   * 429 를 낸다 (lib/core/run-limit.ts). 두 곳에서 세면 날짜 자르는 기준이 갈라진다 —
   * 여기 있던 셈은 UTC 로 잘라서 한국 자정과 아홉 시간 어긋나 있었다.
   */
  const response = await fetch(new URL('/api/discover', req.url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-trend-hub-trigger': 'automatic' },
    body: JSON.stringify({ discoveryId: body.discoveryId, inputs: body.inputs ?? {} }),
  });
  const result = await response.json();
  return NextResponse.json(result, { status: response.status });
}
