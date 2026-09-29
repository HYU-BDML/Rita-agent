import { NextResponse } from 'next/server';
import { archiveCandidate, getCandidate, restoreCandidate } from '@/lib/core/store';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = (await req.json()) as { id?: string; action?: string };
  if (!body.id || !['archive', 'restore'].includes(body.action ?? '')) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const candidate = await getCandidate(body.id);
  if (!candidate) return NextResponse.json({ error: '소재를 찾을 수 없습니다.' }, { status: 404 });

  if (body.action === 'archive') await archiveCandidate(body.id);
  else await restoreCandidate(body.id);

  return NextResponse.json({ ok: true });
}
