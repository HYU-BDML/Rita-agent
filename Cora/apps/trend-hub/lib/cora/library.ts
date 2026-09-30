import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { defaultDesign, validateStyle } from './model';
import type { Design, Draft, SlideStyle } from './model';

/**
 * Reusable asset library, all rows owned by one user id: card templates (design + per-card styles),
 * brand logos (max 5), and call-to-action phrases. Other users' rows are never visible or writable.
 */
export const MAX_TEMPLATES = 50, MAX_LOGOS = 5, MAX_CTAS = 200, MAX_LOGO_CHARS = 400000, MAX_CTA_CHARS = 200;
export interface Template { id: string; name: string; source: 'project' | 'builtin'; design: Design; styles: SlideStyle[]; slideCount: number; headline: string; body: string; favorite: boolean; version: number; created: string; updated: string }
export interface Logo { id: string; name: string; brand: string; data: string; isDefault: boolean; created: string }
export interface Cta { id: string; text: string; brand: string; uses: number; created: string; lastUsed: string | null }
export interface TemplateInput { name?: unknown; design?: unknown; styles?: unknown; headline?: unknown; body?: unknown; slideCount?: unknown }
type TRow = { id: string; name: string; source: 'project' | 'builtin'; design: string; styles: string; slide_count: number; headline: string; body: string; favorite: number; version: number; created: string; updated: string };
type LRow = { id: string; name: string; brand: string; data: string; is_default: number; created: string };
type CRow = { id: string; text: string; brand: string; uses: number; created: string; last_used: string | null };

export const BUILTIN_TEMPLATES: { id: string; name: string; design: Design; styles: SlideStyle[] }[] = [
  { id: 'editorial', name: '에디토리얼', design: { ...defaultDesign, template: 'editorial' }, styles: [] },
  { id: 'minimal', name: '미니멀', design: { ...defaultDesign, template: 'minimal' }, styles: [] },
  { id: 'bold', name: '볼드', design: { ...defaultDesign, template: 'bold' }, styles: [] },
];
const bad = (m: string) => { throw new Error(m); };
const text = (x: unknown, max: number, label: string, required = false) => { if (typeof x !== 'string' || x.length > max) bad(`${label} 길이를 확인해 주세요.`); const t = (x as string).trim(); if (required && !t) bad(`${label}을 입력해 주세요.`); return t; };
/** Same design rules as validateDraft, usable without a full draft. */
export function validateDesign(value: unknown): Design {
  const d = { ...defaultDesign, ...(value && typeof value === 'object' ? value as Partial<Design> : {}) };
  if (!['4:5', '1:1', '9:16'].includes(d.ratio) || !['editorial', 'minimal', 'bold'].includes(d.template) || !['sans', 'serif'].includes(d.font) || ![.85, 1, 1.15].includes(d.textScale)) bad('디자인 설정을 확인해 주세요.');
  return { ratio: d.ratio, template: d.template, font: d.font, textScale: d.textScale };
}
/** Per-card styles; emphasis words belong to one text and are never stored in a reusable template. */
export function validateStyles(value: unknown): SlideStyle[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 12) bad('카드별 설정은 12개 이내여야 합니다.');
  return (value as unknown[]).map(v => { const { emphasis: _e, ...rest } = validateStyle(v ?? {}); return rest; });
}
export const validLogo = (data: unknown) => typeof data === 'string' && data.length <= MAX_LOGO_CHARS && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(data);

/** Pure: keeps every text/photo of the draft, applies the template design and per-card styles (last style repeats). */
export function applyTemplate(draft: Draft, t: Pick<Template, 'design' | 'styles' | 'headline' | 'body'>): Draft {
  const styles = t.styles;
  return { ...draft, design: { ...t.design }, slides: draft.slides.map((s, i) => {
    const style = styles.length ? styles[Math.min(i, styles.length - 1)] : undefined;
    const { style: _old, ...rest } = s;
    return { ...rest, headline: s.headline || t.headline, body: s.body || t.body, ...(style && Object.keys(style).length ? { style: { ...style } } : {}) };
  }) };
}

export class LibraryStore {
  constructor(private db: DatabaseSync) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS library_templates(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),name TEXT NOT NULL,source TEXT NOT NULL,design TEXT NOT NULL,styles TEXT NOT NULL,slide_count INTEGER NOT NULL,headline TEXT NOT NULL DEFAULT '',body TEXT NOT NULL DEFAULT '',favorite INTEGER NOT NULL DEFAULT 0,version INTEGER NOT NULL DEFAULT 1,created TEXT NOT NULL,updated TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS library_templates_user ON library_templates(user_id,favorite,updated);
    CREATE TABLE IF NOT EXISTS library_logos(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),name TEXT NOT NULL,brand TEXT NOT NULL DEFAULT '',data TEXT NOT NULL,is_default INTEGER NOT NULL DEFAULT 0,created TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS library_logos_user ON library_logos(user_id,brand);
    CREATE TABLE IF NOT EXISTS library_ctas(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),text TEXT NOT NULL,brand TEXT NOT NULL DEFAULT '',uses INTEGER NOT NULL DEFAULT 0,created TEXT NOT NULL,last_used TEXT);
    CREATE INDEX IF NOT EXISTS library_ctas_user ON library_ctas(user_id,brand);`);
  }
  private tx<T>(f: () => T): T { this.db.exec('BEGIN IMMEDIATE'); try { const r = f(); this.db.exec('COMMIT'); return r; } catch (e) { this.db.exec('ROLLBACK'); throw e; } }
  private mapT(r: TRow): Template { return { id: r.id, name: r.name, source: r.source, design: JSON.parse(r.design), styles: JSON.parse(r.styles), slideCount: r.slide_count, headline: r.headline, body: r.body, favorite: !!r.favorite, version: r.version, created: r.created, updated: r.updated }; }

  // ---- templates (F022, F027)
  templates(userId: string): Template[] { return (this.db.prepare('SELECT * FROM library_templates WHERE user_id=? ORDER BY favorite DESC,updated DESC').all(userId) as TRow[]).map(r => this.mapT(r)); }
  template(userId: string, id: string): Template | null { const r = this.db.prepare('SELECT * FROM library_templates WHERE id=? AND user_id=?').get(id, userId) as TRow | undefined; return r ? this.mapT(r) : null; }
  /** Snapshot a project (or any draft) into a personal template. */
  saveFromDraft(userId: string, draft: Draft, name: string, opts: { headline?: unknown; body?: unknown } = {}): Template {
    return this.insert(userId, { name, design: draft.design ?? defaultDesign, styles: draft.slides.map(s => s.style ?? {}), slideCount: draft.slides.length, headline: opts.headline ?? '', body: opts.body ?? '' }, 'project');
  }
  /** Copy one of the 3 built-in designs into an editable personal template. */
  saveFromBuiltin(userId: string, builtinId: string, name?: unknown): Template {
    const b = BUILTIN_TEMPLATES.find(x => x.id === builtinId); if (!b) throw new Error('NOT_FOUND');
    return this.insert(userId, { name: name ?? `${b.name} 내 버전`, design: b.design, styles: b.styles, slideCount: 6 }, 'builtin');
  }
  private insert(userId: string, v: TemplateInput, source: 'project' | 'builtin'): Template {
    const name = text(v.name, 60, '템플릿 이름', true), design = validateDesign(v.design), styles = validateStyles(v.styles);
    const headline = text(v.headline ?? '', 80, '제목 자리표시'), body = text(v.body ?? '', 500, '본문 자리표시');
    const count = Number(v.slideCount ?? styles.length); if (!Number.isInteger(count) || count < 1 || count > 12) bad('카드 수는 1~12장입니다.');
    return this.tx(() => {
      if (Number((this.db.prepare('SELECT COUNT(*) n FROM library_templates WHERE user_id=?').get(userId) as { n: number }).n) >= MAX_TEMPLATES) bad(`템플릿은 ${MAX_TEMPLATES}개까지 보관할 수 있습니다.`);
      const id = randomUUID(), now = new Date().toISOString();
      this.db.prepare('INSERT INTO library_templates(id,user_id,name,source,design,styles,slide_count,headline,body,favorite,version,created,updated) VALUES(?,?,?,?,?,?,?,?,?,0,1,?,?)').run(id, userId, name, source, JSON.stringify(design), JSON.stringify(styles), count, headline, body, now, now);
      return this.template(userId, id)!;
    });
  }
  /** Edit with optimistic locking: a stale `version` throws CONFLICT. Omitted fields keep their value. */
  update(userId: string, id: string, version: number, patch: TemplateInput): Template {
    return this.tx(() => {
      const cur = this.template(userId, id); if (!cur) throw new Error('NOT_FOUND'); if (cur.version !== version) throw new Error('CONFLICT');
      const name = patch.name === undefined ? cur.name : text(patch.name, 60, '템플릿 이름', true);
      const design = patch.design === undefined ? cur.design : validateDesign(patch.design), styles = patch.styles === undefined ? cur.styles : validateStyles(patch.styles);
      const headline = patch.headline === undefined ? cur.headline : text(patch.headline, 80, '제목 자리표시'), body = patch.body === undefined ? cur.body : text(patch.body, 500, '본문 자리표시');
      const count = patch.slideCount === undefined ? cur.slideCount : Number(patch.slideCount); if (!Number.isInteger(count) || count < 1 || count > 12) bad('카드 수는 1~12장입니다.');
      this.db.prepare('UPDATE library_templates SET name=?,design=?,styles=?,slide_count=?,headline=?,body=?,version=version+1,updated=? WHERE id=? AND user_id=?').run(name, JSON.stringify(design), JSON.stringify(styles), count, headline, body, new Date().toISOString(), id, userId);
      return this.template(userId, id)!;
    });
  }
  setFavorite(userId: string, id: string, favorite: boolean): Template {
    if (this.db.prepare('UPDATE library_templates SET favorite=? WHERE id=? AND user_id=?').run(favorite ? 1 : 0, id, userId).changes === 0) throw new Error('NOT_FOUND');
    return this.template(userId, id)!;
  }
  deleteTemplate(userId: string, id: string): boolean { return this.db.prepare('DELETE FROM library_templates WHERE id=? AND user_id=?').run(id, userId).changes > 0; }

  // ---- logos (F095)
  logos(userId: string): Logo[] { return (this.db.prepare('SELECT * FROM library_logos WHERE user_id=? ORDER BY created,rowid').all(userId) as LRow[]).map(r => ({ id: r.id, name: r.name, brand: r.brand, data: r.data, isDefault: !!r.is_default, created: r.created })); }
  addLogo(userId: string, name: unknown, data: unknown, brand: unknown = ''): Logo {
    const n = text(name, 60, '로고 이름', true), b = text(brand ?? '', 80, '브랜드 이름');
    if (!validLogo(data)) bad('로고는 400KB 이하의 PNG, JPEG, WebP 이미지여야 합니다.');
    return this.tx(() => {
      if (Number((this.db.prepare('SELECT COUNT(*) n FROM library_logos WHERE user_id=?').get(userId) as { n: number }).n) >= MAX_LOGOS) bad(`로고는 ${MAX_LOGOS}개까지 보관할 수 있습니다. 하나를 삭제한 뒤 추가해 주세요.`);
      const id = randomUUID(), first = !this.db.prepare('SELECT 1 FROM library_logos WHERE user_id=? AND brand=?').get(userId, b);
      this.db.prepare('INSERT INTO library_logos(id,user_id,name,brand,data,is_default,created) VALUES(?,?,?,?,?,?,?)').run(id, userId, n, b, data as string, first ? 1 : 0, new Date().toISOString());
      return this.logos(userId).find(l => l.id === id)!;
    });
  }
  /** Deleting a brand's default promotes the oldest remaining logo of that brand. */
  deleteLogo(userId: string, id: string): boolean {
    return this.tx(() => {
      const r = this.db.prepare('SELECT brand,is_default FROM library_logos WHERE id=? AND user_id=?').get(id, userId) as { brand: string; is_default: number } | undefined; if (!r) return false;
      this.db.prepare('DELETE FROM library_logos WHERE id=? AND user_id=?').run(id, userId);
      if (r.is_default) this.db.prepare('UPDATE library_logos SET is_default=1 WHERE id=(SELECT id FROM library_logos WHERE user_id=? AND brand=? ORDER BY created,rowid LIMIT 1)').run(userId, r.brand);
      return true;
    });
  }
  setDefaultLogo(userId: string, id: string): Logo[] {
    this.tx(() => {
      const r = this.db.prepare('SELECT brand FROM library_logos WHERE id=? AND user_id=?').get(id, userId) as { brand: string } | undefined; if (!r) throw new Error('NOT_FOUND');
      this.db.prepare('UPDATE library_logos SET is_default=0 WHERE user_id=? AND brand=?').run(userId, r.brand);
      this.db.prepare('UPDATE library_logos SET is_default=1 WHERE id=? AND user_id=?').run(id, userId);
    });
    return this.logos(userId);
  }
  defaultLogo(userId: string, brand = ''): Logo | null { return this.logos(userId).find(l => l.brand === brand && l.isDefault) ?? null; }

  // ---- CTA phrases (F078)
  ctas(userId: string, brand?: string): Cta[] {
    const rows = (brand === undefined ? this.db.prepare('SELECT * FROM library_ctas WHERE user_id=? ORDER BY uses DESC,created DESC').all(userId) : this.db.prepare('SELECT * FROM library_ctas WHERE user_id=? AND brand=? ORDER BY uses DESC,created DESC').all(userId, brand)) as CRow[];
    return rows.map(r => ({ id: r.id, text: r.text, brand: r.brand, uses: r.uses, created: r.created, lastUsed: r.last_used }));
  }
  addCta(userId: string, phrase: unknown, brand: unknown = ''): Cta {
    const t = text(phrase, MAX_CTA_CHARS, 'CTA 문구', true), b = text(brand ?? '', 80, '브랜드 이름');
    return this.tx(() => {
      if (Number((this.db.prepare('SELECT COUNT(*) n FROM library_ctas WHERE user_id=?').get(userId) as { n: number }).n) >= MAX_CTAS) bad(`CTA 문구는 ${MAX_CTAS}개까지 보관할 수 있습니다.`);
      if (this.db.prepare('SELECT 1 FROM library_ctas WHERE user_id=? AND brand=? AND text=?').get(userId, b, t)) bad('같은 브랜드에 이미 저장한 문구입니다.');
      const id = randomUUID(); this.db.prepare('INSERT INTO library_ctas(id,user_id,text,brand,uses,created) VALUES(?,?,?,?,0,?)').run(id, userId, t, b, new Date().toISOString());
      return this.ctas(userId).find(c => c.id === id)!;
    });
  }
  useCta(userId: string, id: string): Cta {
    if (this.db.prepare('UPDATE library_ctas SET uses=uses+1,last_used=? WHERE id=? AND user_id=?').run(new Date().toISOString(), id, userId).changes === 0) throw new Error('NOT_FOUND');
    return this.ctas(userId).find(c => c.id === id)!;
  }
  deleteCta(userId: string, id: string): boolean { return this.db.prepare('DELETE FROM library_ctas WHERE id=? AND user_id=?').run(id, userId).changes > 0; }
}
