import { NextResponse } from 'next/server';
import { getCandidate, setCandidateTracking } from '@/lib/core/store';
import type { CandidateTracking } from '@/lib/core/candidate';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = (await req.json()) as { id?: string; tracking?: Partial<CandidateTracking> };
  if (!body.id || !body.tracking) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }
  const candidate = await getCandidate(body.id);
  if (!candidate) return NextResponse.json({ error: '소재를 찾을 수 없습니다.' }, { status: 404 });

  const queries = Array.isArray(body.tracking.queries)
    ? body.tracking.queries.map((query) => String(query).trim()).filter(Boolean).slice(0, 8)
    : candidate.tracking?.queries ?? [candidate.subject];
  await setCandidateTracking(body.id, {
    enabled: Boolean(body.tracking.enabled),
    queries: queries.length ? queries : [candidate.subject],
    lastCheckedAt: candidate.tracking?.lastCheckedAt,
    nextCheckAt: candidate.tracking?.nextCheckAt,
  });
  return NextResponse.json({ ok: true });
}