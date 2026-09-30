/**
 * F060 blog/script progress and period filter (pure).
 * Status is derived, highest first: 승인됨 = data.approvedAt is a non-empty string or data.status==='approved';
 * 수정됨 = data.humanEdited===true (a person edited the AI text); otherwise 초안.
 * Dates are ISO calendar dates (YYYY-MM-DD) read as Asia/Seoul days: from is inclusive at 00:00+09:00, to is inclusive through 23:59:59.999+09:00.
 * Sort: newest createdAt first, ties by id descending. Cursor = position (createdAt ms + id) of the last row returned, so inserts elsewhere never shift a page.
 */
export type ContentItem = { id: string; kind: string; title: string; data: Record<string, unknown>; createdAt: string };
export type ContentStatus = '초안' | '수정됨' | '승인됨';
export const CONTENT_STATUSES: ContentStatus[] = ['초안', '수정됨', '승인됨'];
export type ContentQuery = { status?: string; from?: string; to?: string; brand?: string; keyword?: string; kind?: string; limit?: number | string; cursor?: string };
export const MAX_LIMIT = 50, DEFAULT_LIMIT = 20, DAY = 86400000;
const str = (v: unknown) => (typeof v === 'string' ? v : '');
export function contentStatus(item: Pick<ContentItem, 'data'>): ContentStatus {
  const d = item.data; if (str(d.approvedAt).trim() || d.status === 'approved') return '승인됨'; return d.humanEdited === true ? '수정됨' : '초안';
}
export function kstDayStart(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('날짜는 YYYY-MM-DD 형식입니다.');
  const ms = Date.parse(`${date}T00:00:00+09:00`); if (!Number.isFinite(ms) || new Date(ms + 9 * 3600000).toISOString().slice(0, 10) !== date) throw new Error('존재하지 않는 날짜입니다.'); return ms;
}
const enc = (ms: number, id: string) => Buffer.from(`${ms}|${id}`).toString('base64url');
function dec(c: string): [number, string] { try { const s = Buffer.from(c, 'base64url').toString(); const i = s.indexOf('|'); const ms = Number(s.slice(0, i)); if (i > 0 && Number.isFinite(ms)) return [ms, s.slice(i + 1)]; } catch { /* fall through */ } throw new Error('커서 형식을 확인해 주세요.'); }
export function filterContent(items: ContentItem[], q: ContentQuery = {}) {
  const status = q.status?.trim() || ''; if (status && !CONTENT_STATUSES.includes(status as ContentStatus)) throw new Error('진행 상태는 초안·수정됨·승인됨입니다.');
  const kinds: string[] = q.kind ? [q.kind] : ['blog', 'script']; if (kinds.some(k => k !== 'blog' && k !== 'script')) throw new Error('종류는 blog 또는 script입니다.');
  const from = q.from ? kstDayStart(q.from) : -Infinity, to = q.to ? kstDayStart(q.to) + DAY : Infinity; if (from >= to) throw new Error('시작일이 종료일보다 늦습니다.');
  const n = Number(q.limit ?? DEFAULT_LIMIT), limit = Number.isFinite(n) && n >= 1 ? Math.min(MAX_LIMIT, Math.floor(n)) : DEFAULT_LIMIT;
  const brand = (q.brand ?? '').trim().toLowerCase(), kw = (q.keyword ?? '').trim().toLowerCase();
  const rows = items.filter(i => kinds.includes(i.kind)).map(i => ({ i, ms: Date.parse(i.createdAt) })).filter(({ i, ms }) => {
    if (!Number.isFinite(ms) || ms < from || ms >= to) return false;
    if (status && contentStatus(i) !== status) return false;
    if (brand && !str(i.data.brand).toLowerCase().includes(brand)) return false;
    if (kw && !`${i.title}\n${str(i.data.text)}`.toLowerCase().includes(kw)) return false;
    return true;
  }).sort((a, b) => b.ms - a.ms || (a.i.id < b.i.id ? 1 : a.i.id > b.i.id ? -1 : 0));
  let start = 0;
  if (q.cursor) { const [cms, cid] = dec(q.cursor); start = rows.findIndex(r => r.ms < cms || (r.ms === cms && r.i.id < cid)); if (start < 0) start = rows.length; }
  const page = rows.slice(start, start + limit), last = page[page.length - 1];
  return { total: rows.length, items: page.map(({ i }) => ({ id: i.id, kind: i.kind, title: i.title, status: contentStatus(i), brand: str(i.data.brand), createdAt: i.createdAt, snippet: str(i.data.text).slice(0, 120) })), nextCursor: last && start + limit < rows.length ? enc(last.ms, last.i.id) : null };
}
