import { NextRequest } from 'next/server';
import { json, user, sameOrigin } from '../http';
import { BusyError } from './lock';
import { VersionConflict } from './db';
/** Auth for video routes: login always, same-origin for anything that changes data. */
export function auth(req: NextRequest, mutating: boolean) {
  if (mutating && !sameOrigin(req)) return { res: json({ error: '허용되지 않은 요청입니다.' }, 403) } as const;
  const u = user(req); if (!u) return { res: json({ error: '로그인이 필요합니다.' }, 401) } as const; return { u } as const;
}
/** Reads a request body with a hard byte cap, enforced on the stream and not only on Content-Length. */
export async function readBytes(req: NextRequest, max: number) {
  const reader = req.body?.getReader(); if (!reader) throw new Error('요청이 비어 있습니다.');
  let total = 0; const chunks: Uint8Array[] = [];
  while (true) { const { value, done } = await reader.read(); if (done) break; total += value.byteLength; if (total > max) { await reader.cancel(); throw new Error(`요청이 너무 큽니다. ${Math.floor(max / 1048576)}MB 이내로 보내 주세요.`); } chunks.push(value); }
  return Buffer.concat(chunks);
}
export async function bigJson(req: NextRequest, max: number) {
  if (!req.headers.get('content-type')?.includes('application/json')) throw new Error('JSON 요청이 필요합니다.');
  const b = JSON.parse((await readBytes(req, max)).toString('utf8')); if (!b || typeof b !== 'object' || Array.isArray(b)) throw new Error('JSON 객체가 필요합니다.'); return b as Record<string, unknown>;
}
/** Maps domain errors to statuses: busy -> 409, stale edit -> 409 with the current version, everything else -> 400. */
export function fail(e: unknown, fallback = '요청을 처리하지 못했습니다.') {
  if (e instanceof VersionConflict) return json({ error: e.message, code: 'VERSION_CONFLICT', currentVersion: e.current }, 409);
  if (e instanceof BusyError) return json({ error: e.message }, 409);
  return json({ error: e instanceof Error ? e.message : fallback }, 400);
}
export const versionOf = (value: unknown) => { if (!Number.isInteger(value) || (value as number) < 0) throw new Error('expectedVersion(불러온 시점의 버전)이 필요합니다.'); return value as number; };
