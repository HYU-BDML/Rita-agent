import { inflateSync } from 'node:zlib';
import { outline } from './model';
import type { Brief, Draft } from './model';

/**
 * Minimal, dependency-free PDF text extractor (F004).
 * Handles: classic objects and /ObjStm object streams, uncompressed and FlateDecode content streams,
 * Tj / TJ / ' / " operators, literal and hex strings, and ToUnicode CMaps (bfchar / bfrange) for CID fonts.
 * Does NOT handle: encrypted files, scanned (image-only) pages, LZW/ASCII85/JBIG2 filters, xref-stream-only
 * repair, fonts with custom encodings and no ToUnicode (e.g. non-embedded Korean UHC fonts), reading order
 * of multi-column layouts (text comes out in content-stream order), or tables as tables.
 */
export const MAX_PDF_BYTES = 5 * 1024 * 1024;
export const NO_TEXT_MESSAGE = '이 PDF에서 글자를 찾지 못했습니다. 스캔한 이미지 PDF는 글자 인식(OCR)을 지원하지 않습니다. 글자를 드래그해 선택할 수 있는 PDF를 올리거나 본문을 직접 붙여 넣어 주세요.';
const NO_MAP_MESSAGE = '이 PDF의 글꼴에는 글자 대응표(ToUnicode)가 없어 글자를 읽을 수 없습니다. 다른 방식으로 저장한 PDF를 올리거나 본문을 직접 붙여 넣어 주세요.';

type Obj = { dict: string; data?: Buffer };
type Font = { width: number; cmap?: Map<number, string>; broken?: boolean };
export type PdfText = { text: string; pages: number; unreadableFonts: boolean };

export function decodePdfBase64(value: unknown): Buffer {
  if (typeof value !== 'string' || !value) throw new Error('PDF 파일이 필요합니다.');
  const b64 = value.replace(/^data:application\/pdf;base64,/, '');
  if (b64.length > Math.ceil(MAX_PDF_BYTES * 4 / 3) + 8) throw new Error('PDF는 5MB 이내여야 합니다.');
  if (!/^[A-Za-z0-9+/\s]*={0,2}\s*$/.test(b64)) throw new Error('PDF 파일 형식을 확인해 주세요.');
  const buf = Buffer.from(b64, 'base64');
  if (buf.length > MAX_PDF_BYTES) throw new Error('PDF는 5MB 이내여야 합니다.');
  return buf;
}

const balanced = (d: string, i: number, open: string, close: string) => { let depth = 0; for (let j = i; j < d.length; j++) { if (d.startsWith(open, j)) { depth++; j += open.length - 1; } else if (d.startsWith(close, j)) { depth--; j += close.length - 1; if (!depth) return d.slice(i, j + 1); } } return d.slice(i); };
function val(d: string, key: string): string | null {
  const m = new RegExp('/' + key + '(?![A-Za-z0-9])\\s*').exec(d); if (!m) return null;
  const i = m.index + m[0].length;
  if (d.startsWith('<<', i)) return balanced(d, i, '<<', '>>');
  if (d[i] === '[') return balanced(d, i, '[', ']');
  return /^(\d+\s+\d+\s+R|\/[^\s/<>[\]()]+|[^\s/<>[\]()]+)/.exec(d.slice(i, i + 120))?.[1] ?? null;
}
const refNum = (v: string | null) => { const m = v && /^(\d+)\s+\d+\s+R$/.exec(v.trim()); return m ? Number(m[1]) : null; };
const refs = (v: string | null) => v ? [...v.matchAll(/(\d+)\s+\d+\s+R/g)].map(m => Number(m[1])) : [];

function inflate(data: Buffer): Buffer | null {
  try { return inflateSync(data, { maxOutputLength: 30_000_000 }); } catch { /* truncated stream: keep what decodes */ }
  try { return inflateSync(data, { maxOutputLength: 30_000_000, finishFlush: 2 }); } catch { return null; }
}
function streamOf(o: Obj): Buffer | null {
  if (!o.data) return null;
  const f = val(o.dict, 'Filter'); const names = f ? [...f.matchAll(/\/(\w+)/g)].map(m => m[1]) : [];
  if (!names.length) return o.data;
  return names.length === 1 && names[0] === 'FlateDecode' ? inflate(o.data) : null;
}

function parseObjects(pdf: string, raw: Buffer): Map<number, Obj> {
  const objs = new Map<number, Obj>(); const re = /(\d+)\s+(\d+)\s+obj\b/g; let m: RegExpExecArray | null;
  while ((m = re.exec(pdf))) {
    const start = re.lastIndex; const s = pdf.indexOf('stream', start); const e = pdf.indexOf('endobj', start);
    const num = Number(m[1]);
    if (s !== -1 && (e === -1 || s < e)) {
      const dict = pdf.slice(start, s); let ds = s + 6; if (pdf[ds] === '\r') ds++; if (pdf[ds] === '\n') ds++;
      let de = pdf.indexOf('endstream', ds); if (de === -1) de = e === -1 ? pdf.length : e;
      let end = de; if (pdf[end - 1] === '\n') end--; if (pdf[end - 1] === '\r') end--;
      objs.set(num, { dict, data: raw.subarray(ds, Math.max(ds, end)) }); re.lastIndex = de;
    } else objs.set(num, { dict: pdf.slice(start, e === -1 ? undefined : e) });
  }
  // Object streams hold dictionaries (fonts, pages) in PDF 1.5+ files.
  for (const [, o] of [...objs]) {
    if (!o.data || !/\/Type\s*\/ObjStm/.test(o.dict)) continue;
    const d = streamOf(o); if (!d) continue; const txt = d.toString('latin1');
    const n = Number(val(o.dict, 'N')), first = Number(val(o.dict, 'First')); if (!Number.isFinite(n) || !Number.isFinite(first)) continue;
    const head = txt.slice(0, first).trim().split(/\s+/).map(Number);
    for (let i = 0; i < n && 2 * i + 1 < head.length; i++) { const from = first + head[2 * i + 1], to = i + 1 < n ? first + head[2 * i + 3] : txt.length; if (!objs.has(head[2 * i])) objs.set(head[2 * i], { dict: txt.slice(from, to) }); }
  }
  return objs;
}

const hexBytes = (h: string) => { const c = h.replace(/[^0-9a-fA-F]/g, ''); return Buffer.from(c.length % 2 ? c + '0' : c, 'hex'); };
const utf16 = (b: Buffer) => { let s = ''; for (let i = 0; i + 1 < b.length; i += 2) s += String.fromCharCode(b.readUInt16BE(i)); return s; };
/** ToUnicode CMap: returns code → text and the code width in bytes (from codespacerange, default 2). */
export function parseToUnicode(cmap: string): { map: Map<number, string>; width: number } {
  const map = new Map<number, string>(); let width = 0;
  const cs = /begincodespacerange([\s\S]*?)endcodespacerange/.exec(cmap);
  if (cs) { const h = /<([0-9a-fA-F]+)>/.exec(cs[1]); if (h) width = Math.ceil(h[1].length / 2); }
  for (const blk of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) for (const p of blk[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g)) map.set(parseInt(p[1], 16), utf16(hexBytes(p[2])));
  for (const blk of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const p of blk[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<[0-9a-fA-F]*>|\[[^\]]*\])/g)) {
      const lo = parseInt(p[1], 16), hi = Math.min(parseInt(p[2], 16), lo + 65535);
      if (p[3][0] === '[') { const items = [...p[3].matchAll(/<([0-9a-fA-F]*)>/g)]; for (let c = lo; c <= hi && c - lo < items.length; c++) map.set(c, utf16(hexBytes(items[c - lo][1]))); }
      else { const base = utf16(hexBytes(p[3].slice(1, -1))); if (!base) continue; for (let c = lo; c <= hi; c++) map.set(c, base.slice(0, -1) + String.fromCharCode(base.charCodeAt(base.length - 1) + (c - lo))); }
    }
  }
  return { map, width: width || 2 };
}

type Tok = { t: 's'; b: Buffer } | { t: 'n'; v: string } | { t: 'd'; v: number } | { t: 'o'; v: string } | { t: 'a'; v: Tok[] };
function tokenize(s: string): Tok[] {
  const root: Tok[] = []; const stack: Tok[][] = [root]; let i = 0; const top = () => stack[stack.length - 1];
  const delim = /[\s()<>[\]{}/%]/;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '%') { while (i < s.length && s[i] !== '\n' && s[i] !== '\r') i++; continue; }
    if (c === '(') {
      let depth = 1; const bytes: number[] = []; i++;
      while (i < s.length && depth) {
        const ch = s[i];
        if (ch === '\\') { const nx = s[i + 1]; i += 2;
          if (nx === 'n') bytes.push(10); else if (nx === 'r') bytes.push(13); else if (nx === 't') bytes.push(9); else if (nx === 'b') bytes.push(8); else if (nx === 'f') bytes.push(12);
          else if (nx >= '0' && nx <= '7') { let o = nx; while (o.length < 3 && s[i] >= '0' && s[i] <= '7') o += s[i++]; bytes.push(parseInt(o, 8) & 255); }
          else if (nx === '\r') { if (s[i] === '\n') i++; } else if (nx !== '\n' && nx !== undefined) bytes.push(nx.charCodeAt(0) & 255);
          continue; }
        if (ch === '(') depth++; else if (ch === ')') { depth--; if (!depth) { i++; break; } }
        bytes.push(ch.charCodeAt(0) & 255); i++;
      }
      top().push({ t: 's', b: Buffer.from(bytes) }); continue;
    }
    if (c === '<') { if (s[i + 1] === '<') { i += 2; top().push({ t: 'o', v: '<<' }); continue; } const e = s.indexOf('>', i); const end = e === -1 ? s.length : e; top().push({ t: 's', b: hexBytes(s.slice(i + 1, end)) }); i = end + 1; continue; }
    if (c === '>') { i += s[i + 1] === '>' ? 2 : 1; top().push({ t: 'o', v: '>>' }); continue; }
    if (c === '[') { const a: Tok[] = []; top().push({ t: 'a', v: a }); stack.push(a); i++; continue; }
    if (c === ']') { if (stack.length > 1) stack.pop(); i++; continue; }
    if (c === '/') { let j = i + 1; while (j < s.length && !delim.test(s[j])) j++; top().push({ t: 'n', v: s.slice(i + 1, j) }); i = j; continue; }
    let j = i; while (j < s.length && !delim.test(s[j])) j++; if (j === i) { i++; continue; }
    const w = s.slice(i, j); i = j;
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(w)) top().push({ t: 'd', v: Number(w) });
    else if (w === 'ID') { const m = /[\s]EI(?=[\s]|$)/.exec(s.slice(i)); i = m ? i + m.index + m[0].length : s.length; top().push({ t: 'o', v: 'EI' }); }
    else top().push({ t: 'o', v: w });
  }
  return root;
}

function pageText(content: string, fonts: Map<string, Font>, flags: { broken: boolean }): string[] {
  const lines: string[] = []; let cur = ''; let font: Font | undefined; let stackOps: Tok[] = []; let lastY: number | null = null;
  const nl = () => { if (cur.trim()) lines.push(cur.replace(/\s+/g, ' ').trim()); cur = ''; };
  const show = (b: Buffer) => {
    if (font?.broken) { flags.broken = true; return; }
    if (font?.cmap) { const w = font.width; for (let i = 0; i + w <= b.length; i += w) { let code = 0; for (let k = 0; k < w; k++) code = code * 256 + b[i + k]; cur += font.cmap.get(code) ?? ''; } }
    else cur += b.toString('latin1').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');
  };
  for (const t of tokenize(content)) {
    if (t.t !== 'o') { stackOps.push(t); continue; }
    const o = stackOps; const num = (k: number) => { const x = o[k]; return x && x.t === 'd' ? x.v : 0; };
    switch (t.v) {
      case 'Tf': { const n = o[0]; font = n && n.t === 'n' ? fonts.get(n.v) : undefined; break; }
      case 'Tj': { const a = o[o.length - 1]; if (a?.t === 's') show(a.b); break; }
      case 'TJ': { const a = o[o.length - 1]; if (a?.t === 'a') for (const e of a.v) { if (e.t === 's') show(e.b); else if (e.t === 'd' && e.v < -200 && cur && !cur.endsWith(' ')) cur += ' '; } break; }
      case "'": { nl(); const a = o[o.length - 1]; if (a?.t === 's') show(a.b); break; }
      case '"': { nl(); const a = o[o.length - 1]; if (a?.t === 's') show(a.b); break; }
      case 'Td': case 'TD': if (Math.abs(num(1)) > 0.1) nl(); else if (num(0) > 0 && cur && !cur.endsWith(' ')) cur += ' '; break;
      case 'T*': case 'ET': nl(); break;
      case 'Tm': { const y = num(5); if (lastY !== null && Math.abs(y - lastY) > 0.1) nl(); else if (cur && !cur.endsWith(' ')) cur += ' '; lastY = y; break; }
      case 'BT': lastY = null; break;
    }
    stackOps = [];
  }
  nl(); return lines;
}

export function extractPdfText(buf: Buffer): PdfText {
  if (buf.length > MAX_PDF_BYTES) throw new Error('PDF는 5MB 이내여야 합니다.');
  if (buf.subarray(0, 1024).indexOf('%PDF-') === -1) throw new Error('PDF 파일이 아닙니다. 확장자가 .pdf인 파일을 올려 주세요.');
  const pdf = buf.toString('latin1');
  if (/\/Encrypt\s*(<<|\d+\s+\d+\s+R)/.test(pdf)) throw new Error('암호가 걸린 PDF는 읽을 수 없습니다. 암호를 해제한 파일을 올려 주세요.');
  const objs = parseObjects(pdf, buf);
  const fontCache = new Map<number, Font>();
  const loadFont = (n: number): Font | undefined => {
    if (fontCache.has(n)) return fontCache.get(n); const o = objs.get(n); if (!o) return undefined;
    const type0 = /\/Subtype\s*\/Type0/.test(o.dict); const tu = objs.get(refNum(val(o.dict, 'ToUnicode')) ?? -1); const cm = tu && streamOf(tu);
    let f: Font;
    if (cm) { const p = parseToUnicode(cm.toString('latin1')); f = { width: p.width, cmap: p.map }; }
    else f = { width: type0 ? 2 : 1, broken: type0 };
    fontCache.set(n, f); return f;
  };
  const resolve = (v: string | null): string | null => { if (!v) return null; const n = refNum(v); return n !== null ? objs.get(n)?.dict ?? null : v; };
  const fontsFor = (pageDict: string): Map<string, Font> => {
    let d: string | null = pageDict; let res: string | null = null;
    for (let depth = 0; d && depth < 12 && !res; depth++) { res = resolve(val(d, 'Resources')); if (!res) d = resolve(val(d, 'Parent')); }
    const out = new Map<string, Font>(); const fd = res && resolve(val(res, 'Font')); if (!fd) return out;
    for (const m of fd.matchAll(/\/([^\s/<>[\]()]+)\s+(\d+)\s+\d+\s+R/g)) { const f = loadFont(Number(m[2])); if (f) out.set(m[1], f); }
    return out;
  };
  // Page order: follow /Kids from the root /Pages node; fall back to object number order.
  const isPage = (o: Obj) => /\/Type\s*\/Page(?![A-Za-z])/.test(o.dict);
  const pageNums: number[] = []; const seen = new Set<number>();
  const walk = (n: number, depth = 0) => { const o = objs.get(n); if (!o || seen.has(n) || depth > 20) return; seen.add(n); if (isPage(o)) pageNums.push(n); else for (const k of refs(val(o.dict, 'Kids'))) walk(k, depth + 1); };
  const root = [...objs].find(([, o]) => /\/Type\s*\/Pages(?![A-Za-z])/.test(o.dict) && !/\/Parent/.test(o.dict));
  if (root) walk(root[0]);
  for (const [n, o] of [...objs].sort((a, b) => a[0] - b[0])) if (isPage(o) && !pageNums.includes(n)) pageNums.push(n);
  const flags = { broken: false }; const all: string[] = [];
  for (const n of pageNums.slice(0, 300)) {
    const o = objs.get(n)!; const fonts = fontsFor(o.dict);
    const content = refs(val(o.dict, 'Contents')).map(r => { const co = objs.get(r); const s = co && streamOf(co); return s ? s.toString('latin1') : ''; }).join('\n');
    all.push(...pageText(content, fonts, flags));
  }
  if (!pageNums.length) { // no page tree found (damaged file): scan every stream that looks like page content
    for (const [, o] of objs) { const s = o.data && !/\/Type\s*\/(XObject|ObjStm|XRef|Font)/.test(o.dict) ? streamOf(o) : null; if (s && /\bBT\b/.test(s.toString('latin1', 0, 100000))) all.push(...pageText(s.toString('latin1'), new Map(), flags)); }
  }
  const text = all.join('\n').trim();
  if (!text.replace(/\s/g, '')) throw new Error(flags.broken ? NO_MAP_MESSAGE : NO_TEXT_MESSAGE);
  return { text, pages: pageNums.length, unreadableFonts: flags.broken };
}

/** Sentence-aware packing into at most 10 paragraphs of at most 300 characters (card body limit is 500). */
export function paragraphsOf(text: string, maxParagraphs = 10, maxChars = 300) {
  const flow = text.replace(/\s+/g, ' ').trim();
  const sentences = flow.split(/(?<=[.!?。])\s+/u).flatMap(s => { const c = Array.from(s); const out: string[] = []; for (let i = 0; i < c.length; i += maxChars) out.push(c.slice(i, i + maxChars).join('')); return out; }).filter(Boolean);
  const all: string[] = []; let cur = '';
  for (const s of sentences) { if (cur && Array.from(cur + ' ' + s).length > maxChars) { all.push(cur); cur = s; } else cur = cur ? cur + ' ' + s : s; }
  if (cur) all.push(cur);
  const paragraphs = all.slice(0, maxParagraphs);
  return { paragraphs, total: all.length, truncated: all.length > maxParagraphs, chars: Array.from(flow).length, usedChars: paragraphs.reduce((n, p) => n + Array.from(p).length, 0) };
}

/**
 * Draft through model.outline(): outline() splits at every sentence, so it is called with one short placeholder
 * line per paragraph (keeping its 10-paragraph rule and card structure), then each card body receives the real
 * paragraph text. The extracted text is never summarised; when it is longer than 10 paragraphs the rest is dropped and reported.
 */
export function draftFromText(brief: Brief, ideaTitle: string, text: string) {
  const p = paragraphsOf(text); if (!p.paragraphs.length) throw new Error(NO_TEXT_MESSAGE);
  const draft: Draft = outline({ ...brief, material: p.paragraphs.map((_, i) => `문단 ${i + 1}`).join('\n') }, { id: 'import', title: ideaTitle, description: '', structure: '' });
  p.paragraphs.forEach((body, i) => { draft.slides[i + 1].body = body; });
  const material = p.paragraphs.join('\n');
  draft.brief.material = material;
  draft.caption = `${ideaTitle}\n\n${material}${brief.sourceUrl ? `\n\n참고 자료: ${brief.sourceUrl}` : ''}`.slice(0, 5000);
  return { draft, ...p };
}
