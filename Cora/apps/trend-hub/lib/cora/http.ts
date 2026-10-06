import { NextRequest, NextResponse } from 'next/server';
import { store } from './store';
export const COOKIE = 'cora_session';
export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export function user(req: NextRequest) { return store().user(req.cookies.get(COOKIE)?.value ?? ''); }
export function sameOrigin(req: NextRequest) {
  const origin = req.headers.get('origin'); if (!origin) return false;
  if (process.env.CORA_ORIGIN) return origin === process.env.CORA_ORIGIN;
  // Next may normalize req.url to localhost; the browser's Host is the actual target.
  try { const parsed = new URL(origin); return ['http:', 'https:'].includes(parsed.protocol) && parsed.host === req.headers.get('host'); } catch { return false; }
}
export async function body(req: Request) {
  if (!req.headers.get('content-type')?.includes('application/json')) throw new Error('JSON 요청이 필요합니다.');
  // Bound the stream itself, not just the caller-controlled Content-Length header.
  const reader = req.body?.getReader(); if (!reader) throw new Error('요청이 비어 있습니다.');
  let total = 0; const chunks: Uint8Array[] = [];
  while (true) { const { value, done } = await reader.read(); if (done) break; total += value.byteLength; if (total > 3_000_000) { await reader.cancel(); throw new Error('사진을 줄여 주세요. 요청은 3MB 이내여야 합니다.'); } chunks.push(value); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
// Local beta throttle. Shared/distributed rate limiting is required before public operation.
const attempts = new Map<string, { n: number; until: number }>();
export function allowAuth(req: NextRequest) {
  const key = req.headers.get('x-forwarded-for')?.split(',')[0] || 'local';
  const now = Date.now(); for (const [k,v] of attempts) if (v.until < now) attempts.delete(k);
  const a = attempts.get(key) || { n: 0, until: now + 60000 }; a.n++; attempts.set(key, a); return a.n <= 15;
}
