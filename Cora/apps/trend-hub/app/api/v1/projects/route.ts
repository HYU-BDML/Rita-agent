import { NextRequest, NextResponse } from 'next/server';
import { API_RATE_LIMIT, authenticateApiKey } from '@/lib/cora/apikeys';
import { store } from '@/lib/cora/store';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
/** Read-only. Auth: Authorization: Bearer cora_... ; returns only the key owner's projects. */
export function GET(req: NextRequest) {
  const a = authenticateApiKey(req);
  const base = { 'Cache-Control': 'no-store', 'X-RateLimit-Limit': String(API_RATE_LIMIT) };
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status, headers: { ...base, ...(a.status === 401 ? { 'WWW-Authenticate': 'Bearer' } : { 'Retry-After': String(a.retryAfter ?? 60), 'X-RateLimit-Remaining': '0' }) } });
  return NextResponse.json({ projects: store().list(a.userId) }, { headers: { ...base, 'X-RateLimit-Remaining': String(a.remaining) } });
}
