import type { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { store } from './store';

/**
 * F092 profile link page (link-in-bio). One page per account, public at /l/<slug>.
 * The public HTML has no script: link buttons are small POST forms to /l/<slug>/click, which counts the click and
 * answers 303 to the stored https URL (the URL is looked up by link id, never taken from the request).
 */
export const RESERVED_SLUGS = new Set(['admin', 'api', 'api-docs', 'help', 'l', 'studio', 'login', 'logout', 'signup', 'cora', 'www', 'static', 'assets', 'settings', 'app', 'about', 'terms', 'privacy', 'contact', 'explore', 'library', 'candidates', 'characters', 'grammars', 'issues', 'memes', 'runs', 'null', 'undefined', 'root', 'support', 'test']);
export const MAX_LINKS = 12;
export type LinkItem = { id: string; label: string; url: string };
export type LinkPage = { slug: string; title: string; intro: string; avatar: string; theme: string; links: LinkItem[]; updatedAt: string };
type Row = { user_id: string; slug: string; title: string; intro: string; avatar: string; theme: string; links: string; updated: string };
const lid = () => randomBytes(5).toString('hex').slice(0, 8);
const LID = /^[0-9a-f]{8}$/;

export function validateLinkPage(input: unknown, existingIds: Set<string> = new Set()): Omit<LinkPage, 'updatedAt'> {
  const v = (input ?? {}) as Record<string, unknown>;
  const str = (x: unknown, max: number, label: string, required = false) => { if (x == null) x = ''; if (typeof x !== 'string' || x.length > max) throw new Error(`${label}은(는) ${max}자 이내로 입력해 주세요.`); const t = x.trim(); if (required && !t) throw new Error(`${label}을(를) 입력해 주세요.`); return t; };
  const slug = str(v.slug, 30, '주소', true).toLowerCase();
  if (!/^[a-z0-9-]{3,30}$/.test(slug)) throw new Error('주소는 영문 소문자, 숫자, 하이픈(-)으로 3~30자여야 합니다.');
  if (RESERVED_SLUGS.has(slug)) throw new Error('사용할 수 없는 주소입니다. 다른 주소를 골라 주세요.');
  const title = str(v.title, 60, '제목', true), intro = str(v.intro, 300, '소개');
  const avatar = typeof v.avatar === 'string' ? v.avatar : ''; if (avatar) { if (avatar.length > 200 * 1024 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(avatar)) throw new Error('프로필 사진은 200KB 이내의 PNG, JPEG, WebP여야 합니다.'); }
  const theme = str(v.theme ?? '#205b4a', 7, '테마 색상'); if (!/^#[0-9a-f]{6}$/i.test(theme)) throw new Error('테마 색상은 #205b4a 같은 6자리 색상 코드여야 합니다.');
  if (v.links != null && !Array.isArray(v.links)) throw new Error('링크 목록 형식을 확인해 주세요.');
  const raw = (v.links ?? []) as unknown[]; if (raw.length > MAX_LINKS) throw new Error(`링크는 ${MAX_LINKS}개까지 넣을 수 있습니다.`);
  const used = new Set<string>();
  const links = raw.map(x => {
    const l = (x ?? {}) as Record<string, unknown>; const label = str(l.label, 40, '링크 이름', true); const urlText = str(l.url, 500, '링크 주소', true);
    let u: URL; try { u = new URL(urlText); } catch { throw new Error(`링크 주소 형식을 확인해 주세요: ${label}`); }
    if (u.protocol !== 'https:' || u.username || u.password) throw new Error(`링크는 https:// 주소만 넣을 수 있습니다: ${label}`);
    let id = typeof l.id === 'string' && LID.test(l.id) && existingIds.has(l.id) && !used.has(l.id) ? l.id : lid(); while (used.has(id)) id = lid(); used.add(id);
    return { id, label, url: u.href };
  });
  return { slug, title, intro, avatar, theme: theme.toLowerCase(), links };
}

export class LinkPages {
  constructor(private db: DatabaseSync) {
    db.exec(`CREATE TABLE IF NOT EXISTS link_pages(user_id TEXT PRIMARY KEY REFERENCES users(id), slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL, intro TEXT NOT NULL, avatar TEXT NOT NULL, theme TEXT NOT NULL, links TEXT NOT NULL, updated TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS link_clicks(user_id TEXT NOT NULL REFERENCES users(id), link_id TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(user_id,link_id));`);
  }
  private shape(r: Row): LinkPage { return { slug: r.slug, title: r.title, intro: r.intro, avatar: r.avatar, theme: r.theme, links: JSON.parse(r.links) as LinkItem[], updatedAt: r.updated }; }
  /** Owner view: the page plus click totals per link id. */
  get(userId: string): { page: LinkPage | null; clicks: Record<string, number> } {
    const r = this.db.prepare('SELECT * FROM link_pages WHERE user_id=?').get(userId) as Row | undefined; if (!r) return { page: null, clicks: {} };
    const clicks: Record<string, number> = {}; for (const c of this.db.prepare('SELECT link_id,n FROM link_clicks WHERE user_id=?').all(userId) as { link_id: string; n: number }[]) clicks[c.link_id] = c.n;
    return { page: this.shape(r), clicks };
  }
  save(userId: string, input: unknown): LinkPage {
    const prior = this.db.prepare('SELECT links FROM link_pages WHERE user_id=?').get(userId) as { links: string } | undefined;
    const ids = new Set(prior ? (JSON.parse(prior.links) as LinkItem[]).map(l => l.id) : []);
    const p = validateLinkPage(input, ids); const now = new Date().toISOString();
    try {
      this.db.prepare('INSERT INTO link_pages VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET slug=excluded.slug,title=excluded.title,intro=excluded.intro,avatar=excluded.avatar,theme=excluded.theme,links=excluded.links,updated=excluded.updated')
        .run(userId, p.slug, p.title, p.intro, p.avatar, p.theme, JSON.stringify(p.links), now);
    } catch (e) { if (/UNIQUE/i.test(String((e as Error).message))) throw new Error('이미 사용 중인 주소입니다. 다른 주소를 골라 주세요.'); throw e; }
    const keep = p.links.map(l => l.id);
    this.db.prepare(`DELETE FROM link_clicks WHERE user_id=? ${keep.length ? `AND link_id NOT IN (${keep.map(() => '?').join(',')})` : ''}`).run(userId, ...keep);
    return { ...p, updatedAt: now };
  }
  remove(userId: string) { this.db.prepare('DELETE FROM link_clicks WHERE user_id=?').run(userId); return this.db.prepare('DELETE FROM link_pages WHERE user_id=?').run(userId).changes > 0; }
  /** Public read: no owner identity is exposed. */
  bySlug(slug: string): LinkPage | null {
    if (!/^[a-z0-9-]{3,30}$/.test(slug)) return null;
    const r = this.db.prepare('SELECT * FROM link_pages WHERE slug=?').get(slug) as Row | undefined; return r ? this.shape(r) : null;
  }
  /** Counts one click and returns the stored destination, or null when the slug/link does not exist. */
  click(slug: string, linkId: string): string | null {
    if (!/^[a-z0-9-]{3,30}$/.test(slug) || !LID.test(linkId)) return null;
    const r = this.db.prepare('SELECT user_id,links FROM link_pages WHERE slug=?').get(slug) as { user_id: string; links: string } | undefined; if (!r) return null;
    const link = (JSON.parse(r.links) as LinkItem[]).find(l => l.id === linkId); if (!link) return null;
    this.db.prepare('INSERT INTO link_clicks VALUES (?,?,1) ON CONFLICT(user_id,link_id) DO UPDATE SET n=n+1').run(r.user_id, linkId);
    return link.url;
  }
}
export const linkPages = () => store().module('linkpages', db => new LinkPages(db));

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const textOn = (hex: string) => { const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; return (0.299 * r + 0.587 * g + 0.114 * b) > 160 ? '#111111' : '#ffffff'; };
export const LINK_PAGE_CSP = "default-src 'none'; img-src data: https:; style-src 'unsafe-inline'";
/** Static HTML, every user string escaped, no script. Theme and avatar are re-validated by shape, not trusted. */
export function renderLinkPage(p: LinkPage): string {
  const theme = /^#[0-9a-f]{6}$/i.test(p.theme) ? p.theme : '#205b4a', ink = textOn(theme);
  const avatar = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(p.avatar) ? `<img class="av" src="${esc(p.avatar)}" alt="">` : '';
  const items = p.links.map(l => `<li><form method="post" action="/l/${esc(p.slug)}/click"><input type="hidden" name="id" value="${esc(l.id)}"><button type="submit">${esc(l.label)}</button></form></li>`).join('');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(p.title)}</title><style>
body{margin:0;background:#f7f5ef;color:#1d1d1b;font:16px/1.6 system-ui,-apple-system,'Apple SD Gothic Neo',sans-serif}main{max-width:480px;margin:0 auto;padding:40px 20px;text-align:center}
.av{width:96px;height:96px;border-radius:50%;object-fit:cover;border:3px solid ${theme}}h1{font-size:22px;margin:12px 0 4px}p{margin:0 0 24px;white-space:pre-wrap;color:#444}ul{list-style:none;margin:0;padding:0;display:grid;gap:12px}
button{width:100%;padding:14px 16px;border:0;border-radius:12px;background:${theme};color:${ink};font:inherit;font-weight:600;cursor:pointer}footer{margin-top:32px;font-size:12px;color:#777}</style></head><body><main>${avatar}<h1>${esc(p.title)}</h1><p>${esc(p.intro)}</p><ul>${items}</ul><footer>Cora 프로필 링크</footer></main></body></html>`;
}
