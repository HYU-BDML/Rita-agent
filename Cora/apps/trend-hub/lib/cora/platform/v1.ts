import { NextResponse } from 'next/server';
import { API_RATE_LIMIT, authenticateApiKey } from '../apikeys';
/** Shared read-only v1 handler wrapper: Bearer cora_ key, 60/min per key, same headers as GET /api/v1/projects. */
export function v1Read(req: Parameters<typeof authenticateApiKey>[0], run: (userId: string) => { status?: number; body: unknown }) {
  const a = authenticateApiKey(req);
  const base = { 'Cache-Control': 'no-store', 'X-RateLimit-Limit': String(API_RATE_LIMIT) };
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status, headers: { ...base, ...(a.status === 401 ? { 'WWW-Authenticate': 'Bearer' } : { 'Retry-After': String(a.retryAfter ?? 60), 'X-RateLimit-Remaining': '0' }) } });
  const r = run(a.userId);
  return NextResponse.json(r.body, { status: r.status ?? 200, headers: { ...base, 'X-RateLimit-Remaining': String(a.remaining) } });
}
