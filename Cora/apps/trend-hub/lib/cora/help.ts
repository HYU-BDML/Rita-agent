import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { store } from './store';
import { Limiter } from './apikeys';

/** F109 contact inbox. Messages are stored only; no email is sent. The hidden `website` field is a honeypot. */
export const DAILY_CAP = 500;
export type ContactMessage = { id: string; name: string; email: string; message: string; created: string };
export class ContactInbox {
  readonly limiter = new Limiter(5, 10 * 60_000);
  constructor(private db: DatabaseSync) {
    db.exec('CREATE TABLE IF NOT EXISTS contact_messages(id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, message TEXT NOT NULL, created TEXT NOT NULL)');
  }
  /** Returns {stored:false} silently for honeypot hits so bots see the same success answer as people. */
  submit(input: unknown, ip: string, now = Date.now()): { ok: true; stored: boolean } {
    const v = (input ?? {}) as Record<string, unknown>;
    if (typeof v.website === 'string' && v.website.trim()) return { ok: true, stored: false };
    const name = typeof v.name === 'string' ? v.name.trim() : '', email = typeof v.email === 'string' ? v.email.trim() : '', message = typeof v.message === 'string' ? v.message.trim() : '';
    if (!name || name.length > 50) throw new Error('이름은 1~50자로 입력해 주세요.');
    if (email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) throw new Error('이메일 형식을 확인해 주세요.');
    if (message.length < 5 || message.length > 2000) throw new Error('문의 내용은 5~2000자로 입력해 주세요.');
    if (!this.limiter.hit(ip, now).allowed) throw new Error('RATE_LIMIT');
    const since = new Date(now - 86_400_000).toISOString();
    if ((this.db.prepare('SELECT COUNT(*) c FROM contact_messages WHERE created>?').get(since) as { c: number }).c >= DAILY_CAP) throw new Error('오늘 접수할 수 있는 문의 수를 넘었습니다. 내일 다시 보내 주세요.');
    this.db.prepare('INSERT INTO contact_messages VALUES (?,?,?,?,?)').run(randomUUID(), name, email, message, new Date(now).toISOString());
    return { ok: true, stored: true };
  }
  list(limit = 100): ContactMessage[] { return this.db.prepare('SELECT * FROM contact_messages ORDER BY created DESC LIMIT ?').all(Math.min(Math.max(1, limit), 500)) as ContactMessage[]; }
  count() { return (this.db.prepare('SELECT COUNT(*) c FROM contact_messages').get() as { c: number }).c; }
}
export const contactInbox = () => store().module('contact', db => new ContactInbox(db));
