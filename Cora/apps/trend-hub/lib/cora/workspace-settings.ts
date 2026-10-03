import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { sendResendEmail, type Transport } from './notify/resend';
import { isLang, type Lang } from './i18n';

/**
 * Workspace operations: idea status lifecycle (F007), in-app notifications with per-event preferences and optional email (F097),
 * per-user language (F099). Owns idea_states, notifications, notification_prefs, user_settings. Never modifies work_items.
 */
export const IDEA_STATUSES = ['새 아이디어', '검토 중', '제작 예정', '제작 완료', '보류'] as const;
export type IdeaStatus = (typeof IDEA_STATUSES)[number];
/** Allowed moves. 제작 완료 is final; 보류 can be reopened. */
export const IDEA_TRANSITIONS: Record<IdeaStatus, IdeaStatus[]> = { '새 아이디어': ['검토 중', '보류'], '검토 중': ['제작 예정', '보류'], '제작 예정': ['제작 완료', '검토 중', '보류'], '제작 완료': [], '보류': ['새 아이디어', '검토 중'] };
export const isIdeaStatus = (v: unknown): v is IdeaStatus => (IDEA_STATUSES as readonly string[]).includes(v as string);
export const NOTIFY_KINDS = ['review_requested', 'review_decided', 'publish_result', 'schedule_failed', 'team_invite', 'credit_low', 'loop_review'] as const;
export type NotifyKind = (typeof NOTIFY_KINDS)[number];
export const isNotifyKind = (v: unknown): v is NotifyKind => (NOTIFY_KINDS as readonly string[]).includes(v as string);
export type HistoryEntry = { from: IdeaStatus; to: IdeaStatus; by: string; at: string };
export type NotifyResult = { inapp: boolean; email: 'skipped' | 'sent' | 'not_configured' | 'failed'; error?: string };
export type Notification = { id: string; kind: NotifyKind; title: string; body: string; link: string; read: boolean; created: string };
const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

export class WorkspaceSettings {
  constructor(private db: DatabaseSync, private opts: { env?: Record<string, string | undefined>; transport?: Transport } = {}) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS idea_states(item_id TEXT PRIMARY KEY REFERENCES work_items(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id), status TEXT NOT NULL, updated TEXT NOT NULL, history TEXT NOT NULL DEFAULT '[]');
      CREATE INDEX IF NOT EXISTS idea_states_user ON idea_states(user_id,status);
      CREATE TABLE IF NOT EXISTS notifications(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', link TEXT NOT NULL DEFAULT '', read INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id,read,created);
      CREATE TABLE IF NOT EXISTS notification_prefs(user_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL, inapp INTEGER NOT NULL DEFAULT 1, email INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(user_id,kind));
      CREATE TABLE IF NOT EXISTS user_settings(user_id TEXT PRIMARY KEY REFERENCES users(id), language TEXT NOT NULL DEFAULT 'ko', updated TEXT NOT NULL);`);
  }
  // ---- F007 ideas ----
  /** Ideas = the user's material items with data.format==='ideas'. Status defaults to 새 아이디어 until first moved. */
  ideas(userId: string, status?: string) {
    if (status && !isIdeaStatus(status)) throw new Error('알 수 없는 아이디어 상태입니다.');
    const rows = this.db.prepare(`SELECT w.id,w.title,w.data,w.created,s.status,s.updated,s.history FROM work_items w LEFT JOIN idea_states s ON s.item_id=w.id AND s.user_id=w.user_id WHERE w.user_id=? AND w.kind='material' ORDER BY w.rowid DESC LIMIT 500`).all(userId) as { id: string; title: string; data: string; created: string; status: string | null; updated: string | null; history: string | null }[];
    return rows.map(r => ({ r, d: JSON.parse(r.data) as Record<string, unknown> })).filter(x => x.d.format === 'ideas').map(({ r, d }) => ({ id: r.id, title: r.title, text: typeof d.text === 'string' ? d.text : '', createdAt: r.created, status: (r.status as IdeaStatus | null) ?? '새 아이디어', updated: r.updated ?? r.created, history: JSON.parse(r.history ?? '[]') as HistoryEntry[], next: IDEA_TRANSITIONS[(r.status as IdeaStatus | null) ?? '새 아이디어'] })).filter(i => !status || i.status === status);
  }
  setIdeaStatus(userId: string, itemId: string, to: string) {
    if (!isIdeaStatus(to)) throw new Error('알 수 없는 아이디어 상태입니다.');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const w = this.db.prepare("SELECT data FROM work_items WHERE id=? AND user_id=? AND kind='material'").get(itemId, userId) as { data: string } | undefined;
      if (!w || (JSON.parse(w.data) as Record<string, unknown>).format !== 'ideas') throw new Error('NOT_FOUND');
      const cur = this.db.prepare('SELECT status,history FROM idea_states WHERE item_id=? AND user_id=?').get(itemId, userId) as { status: IdeaStatus; history: string } | undefined;
      const from = cur?.status ?? '새 아이디어';
      if (!IDEA_TRANSITIONS[from].includes(to)) throw new Error(`'${from}'에서 '${to}'(으)로 옮길 수 없습니다. 가능한 상태: ${IDEA_TRANSITIONS[from].join(', ') || '없음'}.`);
      const at = new Date().toISOString(), history = [...(cur ? (JSON.parse(cur.history) as HistoryEntry[]) : []), { from, to, by: userId, at }];
      this.db.prepare('INSERT INTO idea_states(item_id,user_id,status,updated,history) VALUES(?,?,?,?,?) ON CONFLICT(item_id) DO UPDATE SET status=excluded.status,updated=excluded.updated,history=excluded.history').run(itemId, userId, to, at, JSON.stringify(history));
      this.db.exec('COMMIT'); return this.ideas(userId).find(i => i.id === itemId)!;
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  // ---- F099 language ----
  language(userId: string): Lang { const r = this.db.prepare('SELECT language FROM user_settings WHERE user_id=?').get(userId) as { language: string } | undefined; return isLang(r?.language) ? r.language : 'ko'; }
  setLanguage(userId: string, lang: unknown): Lang {
    if (!isLang(lang)) throw new Error('지원하는 언어는 ko, en입니다.');
    this.db.prepare('INSERT INTO user_settings(user_id,language,updated) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET language=excluded.language,updated=excluded.updated').run(userId, lang, new Date().toISOString()); return lang;
  }
  // ---- F097 notifications ----
  /** Every event kind with its channels; unset kinds default to in-app on, email off. */
  prefs(userId: string) {
    const rows = this.db.prepare('SELECT kind,inapp,email FROM notification_prefs WHERE user_id=?').all(userId) as { kind: string; inapp: number; email: number }[], m = new Map(rows.map(r => [r.kind, r]));
    return NOTIFY_KINDS.map(kind => ({ kind, inapp: m.has(kind) ? !!m.get(kind)!.inapp : true, email: m.has(kind) ? !!m.get(kind)!.email : false }));
  }
  setPref(userId: string, kind: unknown, ch: { inapp?: unknown; email?: unknown }) {
    if (!isNotifyKind(kind)) throw new Error('알 수 없는 알림 종류입니다.');
    if ((ch.inapp !== undefined && typeof ch.inapp !== 'boolean') || (ch.email !== undefined && typeof ch.email !== 'boolean')) throw new Error('채널 값은 true 또는 false입니다.');
    const cur = this.prefs(userId).find(p => p.kind === kind)!;
    this.db.prepare('INSERT INTO notification_prefs(user_id,kind,inapp,email) VALUES(?,?,?,?) ON CONFLICT(user_id,kind) DO UPDATE SET inapp=excluded.inapp,email=excluded.email').run(userId, kind, (ch.inapp ?? cur.inapp) ? 1 : 0, (ch.email ?? cur.email) ? 1 : 0);
    return this.prefs(userId);
  }
  /** Unread first, then newest first. */
  notifications(userId: string, limit = 50): Notification[] {
    return (this.db.prepare('SELECT id,kind,title,body,link,read,created FROM notifications WHERE user_id=? ORDER BY read ASC,created DESC,rowid DESC LIMIT ?').all(userId, Math.min(Math.max(1, limit), 50)) as (Omit<Notification, 'read'> & { read: number })[]).map(r => ({ ...r, read: !!r.read }));
  }
  unreadCount(userId: string) { return Number((this.db.prepare('SELECT COUNT(*) n FROM notifications WHERE user_id=? AND read=0').get(userId) as { n: number }).n); }
  markRead(userId: string, id: string) { return this.db.prepare('UPDATE notifications SET read=1 WHERE id=? AND user_id=? AND read=0').run(id, userId).changes > 0; }
  markAllRead(userId: string) { return Number(this.db.prepare('UPDATE notifications SET read=1 WHERE user_id=? AND read=0').run(userId).changes); }
  /**
   * Records an event for one user according to that user's preferences. In-app rows are written synchronously (before the first await);
   * email is sent only when the user enabled it AND the email integration is configured. Never throws: failures come back in the result.
   */
  async notify(userId: string, kind: string, payload: { title: string; body?: string; link?: string }): Promise<NotifyResult> {
    const out: NotifyResult = { inapp: false, email: 'skipped' };
    try {
      if (!isNotifyKind(kind)) return { ...out, error: 'unknown kind' };
      const title = clip(payload?.title, 200); if (!title) return { ...out, error: 'empty title' };
      const body = clip(payload?.body, 2000), raw = clip(payload?.link, 500), link = raw.startsWith('/') && !raw.startsWith('//') ? raw : '';
      const p = this.prefs(userId).find(x => x.kind === kind)!;
      if (p.inapp) { this.db.prepare('INSERT INTO notifications(id,user_id,kind,title,body,link,read,created) VALUES(?,?,?,?,?,?,0,?)').run(randomUUID(), userId, kind, title, body, link, new Date().toISOString()); out.inapp = true; }
      if (p.email) {
        const to = (this.db.prepare('SELECT email FROM users WHERE id=?').get(userId) as { email: string } | undefined)?.email ?? '';
        const env = this.opts.env ?? process.env, origin = env.CORA_ORIGIN ?? '';
        const r = await sendResendEmail({ to, subject: title, text: [body, link && origin ? `${origin}${link}` : ''].filter(Boolean).join('\n\n') || title }, this.opts);
        out.email = r.sent ? 'sent' : r.reason === 'NOT_CONFIGURED' ? 'not_configured' : 'failed';
      }
    } catch (e) { out.error = e instanceof Error ? e.message : 'notify failed'; }
    return out;
  }
}
