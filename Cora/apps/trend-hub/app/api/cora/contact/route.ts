import { NextRequest } from 'next/server';
import { body, json, sameOrigin, user } from '@/lib/cora/http';
import { clientIp } from '@/lib/cora/apikeys';
import { contactInbox } from '@/lib/cora/help';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
/** Public contact form (no login). GET is limited to the operator account named in CORA_LEGACY_OPERATOR_ID. */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return json({ error: '허용되지 않은 요청입니다.' }, 403);
  try { const r = contactInbox().submit(await body(req), clientIp(req)); return json({ ok: r.ok, message: '문의가 접수되었습니다. 이메일 답장은 자동으로 보내지 않으니, 답변은 적어 주신 이메일로 직접 드립니다.' }, 201); }
  catch (e) { const m = e instanceof Error ? e.message : '접수 실패'; return m === 'RATE_LIMIT' ? json({ error: '문의를 너무 자주 보냈습니다. 10분 뒤 다시 시도해 주세요.' }, 429) : json({ error: m }, 400); }
}
export function GET(req: NextRequest) {
  const u = user(req); if (!u) return json({ error: '로그인이 필요합니다.' }, 401);
  if (!process.env.CORA_LEGACY_OPERATOR_ID || u.id !== process.env.CORA_LEGACY_OPERATOR_ID) return json({ error: '운영자만 볼 수 있습니다.' }, 403);
  return json({ messages: contactInbox().list(100) });
}
