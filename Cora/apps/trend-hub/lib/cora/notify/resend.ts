import { integrationStatus } from '../integrations';

/**
 * Resend adapter. Contract (checked against https://resend.com/docs/api-reference/emails/send-email on 2026-09-30):
 * POST https://api.resend.com/emails, header Authorization: Bearer <key>, JSON body {from, to (string|string[]), subject, html|text},
 * success 200 {id}. The error body shape is not documented on that page, so failures are reported by HTTP status only (확인 필요: 오류 본문 구조).
 * The transport is injectable so tests never touch the network. The key is read from env at call time and never returned or logged.
 */
export type MailMessage = { to: string; subject: string; text: string };
export type MailResult = { sent: true; id: string } | { sent: false; reason: 'NOT_CONFIGURED' | 'INVALID' | 'HTTP_ERROR' | 'NETWORK'; status?: number };
export type Transport = (url: string, init: { method: 'POST'; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
export const RESEND_URL = 'https://api.resend.com/emails';
const realTransport: Transport = (url, init) => fetch(url, init);

export async function sendResendEmail(msg: MailMessage, opts: { env?: Record<string, string | undefined>; transport?: Transport } = {}): Promise<MailResult> {
  const env = opts.env ?? process.env;
  const email = integrationStatus(env).find(i => i.id === 'email');
  if (!email?.configured) return { sent: false, reason: 'NOT_CONFIGURED' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(msg.to) || !msg.subject.trim() || !msg.text.trim()) return { sent: false, reason: 'INVALID' };
  try {
    const res = await (opts.transport ?? realTransport)(RESEND_URL, { method: 'POST', headers: { Authorization: `Bearer ${env.CORA_RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: env.CORA_MAIL_FROM, to: msg.to, subject: msg.subject, text: msg.text }) });
    if (!res.ok) return { sent: false, reason: 'HTTP_ERROR', status: res.status };
    const v = (await res.json().catch(() => ({}))) as { id?: unknown };
    return { sent: true, id: typeof v.id === 'string' ? v.id : '' };
  } catch { return { sent: false, reason: 'NETWORK' }; }
}
