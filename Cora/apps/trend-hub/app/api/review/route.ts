import { NextResponse } from 'next/server';
import { setReview } from '@/lib/core/store';
import type { ReviewState } from '@/lib/core/candidate';

export const dynamic = 'force-dynamic';

const STATES: ReviewState[] = ['pending', 'adopted', 'rejected', 'held'];

export async function POST(req: Request) {
  const body = (await req.json()) as { id?: string; review?: string; note?: string };
  if (!body.id || !STATES.includes(body.review as ReviewState)) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }
  await setReview(body.id, body.review as ReviewState, body.note);
  return NextResponse.json({ ok: true });
}
