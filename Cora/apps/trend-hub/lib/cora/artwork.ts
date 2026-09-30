import { defaultDesign, type Draft, type Slide, type Layer } from './model';
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
export function wrap(s: string, units: number): string[] {
  const lines: string[] = [];
  for (const paragraph of s.split('\n')) {
    let line = ''; let width = 0;
    for (const char of Array.from(paragraph)) {
      const w = /[\x00-\x7f]/.test(char) ? .58 : 1;
      if (width + w > units && line) { lines.push(line); line = ''; width = 0; }
      line += char; width += w;
    }
    lines.push(line);
  }
  return lines;
}
/** Layers are drawn after the card, ordered by z (ties keep array order), and clipped to the canvas. Hidden layers are skipped. */
function layersSvg(layers: Layer[] | undefined, height: number, fam: string): string {
  const shown = (layers ?? []).map((l, i) => ({ l, i })).filter(({ l }) => !l.hidden).sort((a, b) => a.l.z - b.l.z || a.i - b.i);
  if (!shown.length) return '';
  const fmt = (n: number) => String(Math.round(n * 100) / 100);
  const body = shown.map(({ l, i }, order) => {
    const cx = l.x + l.w / 2, cy = l.y + l.h / 2;
    const attrs = `id="layer-${order + 1}" data-layer-id="${escape(l.id)}" data-layer-type="${l.type}"${l.rotation ? ` transform="rotate(${fmt(l.rotation)} ${fmt(cx)} ${fmt(cy)})"` : ''}${l.opacity !== undefined && l.opacity !== 1 ? ` opacity="${fmt(l.opacity)}"` : ''}`;
    if (l.type === 'shape') return `<g ${attrs}><rect x="${fmt(l.x)}" y="${fmt(l.y)}" width="${fmt(l.w)}" height="${fmt(l.h)}" rx="${fmt(Math.min(l.radius ?? 0, l.w / 2, l.h / 2))}" fill="${l.fill}"/></g>`;
    if (l.type === 'text') {
      const size = l.fontSize ?? 48; const rows = wrap(l.text ?? '', l.w / size);
      const anchor = l.align === 'center' ? 'middle' : l.align === 'right' ? 'end' : 'start';
      const tx = l.align === 'center' ? l.x + l.w / 2 : l.align === 'right' ? l.x + l.w : l.x;
      return `<g ${attrs}>${rows.map((row, r) => `<text x="${fmt(tx)}" y="${fmt(l.y + size + r * size * 1.3)}" text-anchor="${anchor}" fill="${l.color}" font-size="${fmt(size)}" font-weight="${l.weight ?? 700}">${escape(row)}</text>`).join('')}</g>`;
    }
    const clip = `layer-clip-${order + 1}`;
    return `<g ${attrs}><defs><clipPath id="${clip}"><rect x="${fmt(l.x)}" y="${fmt(l.y)}" width="${fmt(l.w)}" height="${fmt(l.h)}"/></clipPath></defs><image href="${escape(l.src ?? '')}" x="${fmt(l.x)}" y="${fmt(l.y)}" width="${fmt(l.w)}" height="${fmt(l.h)}" preserveAspectRatio="${l.type === 'logo' ? 'xMidYMid meet' : 'xMidYMid slice'}" clip-path="url(#${clip})"/></g>`;
  }).join('');
  return `<defs><clipPath id="canvas-clip"><rect width="1080" height="${height}"/></clipPath></defs><g clip-path="url(#canvas-clip)" font-family="${fam}">${body}</g>`;
}
export function artwork(slide: Slide, draft: Draft, index: number) {
  const design={...defaultDesign,...draft.design};const height=design.ratio==='1:1'?1080:design.ratio==='9:16'?1920:1350;const photoHeight=height===1080?220:340;const bottom=height-160;
  const cover = design.template==='bold'||(index === 0&&design.template!=='minimal'); const accent = /^#[\da-f]{6}$/i.test(draft.brief.accent) ? draft.brief.accent : '#205b4a';
  const st=slide.style??{};const ls=st.letterSpacing??0;const lh=st.lineHeight??1.55;
  const x=st.align==='center'?540:st.align==='right'?992:88;const anchor=st.align==='center'?'middle':st.align==='right'?'end':'start';
  // Letter spacing widens every character, so the wrap width shrinks by the same amount per character.
  let titleSize = (cover ? 88 : 72)*design.textScale; let title = wrap(slide.headline, 890 / (titleSize+ls));
  while (title.length > 4 && titleSize > 42) { titleSize -= 2; title = wrap(slide.headline, 890 / (titleSize+ls)); }
  const titleEnd = 230 + title.length * titleSize * 1.28;
  const imageY = titleEnd + 30; const bodyY = slide.image ? imageY + photoHeight+45 : titleEnd + 85;
  let bodySize = 44*design.textScale; let lines = wrap(slide.body, 875 / (bodySize+ls));
  while (bodyY + lines.length * bodySize * lh > bottom-20 && bodySize > 26) { bodySize -= 2; lines = wrap(slide.body, 875 / (bodySize+ls)); }
  const overflow = bodyY + lines.length * bodySize * lh > bottom;
  const fg = cover ? '#ffffff' : '#193b32'; const muted = cover ? '#dbebe3' : '#53665c';
  const mark = cover ? '#eab895' : accent; const em = st.emphasis ?? '';
  // Emphasis colours every occurrence of the chosen phrase inside a wrapped line; a phrase split across two lines is not joined.
  const spans = (line: string) => { if (!em || !line.includes(em)) return escape(line); return line.split(em).map(escape).join(`<tspan fill="${mark}" font-weight="800">${escape(em)}</tspan>`); };
  const text = (rows: string[], y: number, size: number, color: string, weight: number, lineHeight: number) => rows.map((line,i) => `<text x="${x}" y="${y+i*size*lineHeight}" text-anchor="${anchor}" letter-spacing="${ls}" fill="${color}" font-size="${size}" font-weight="${weight}">${spans(line)}</text>`).join('');
  const fitAttr = st.imageFit==='contain' ? 'xMidYMid meet' : `xMid${st.imagePosition==='top'?'YMin':st.imagePosition==='bottom'?'YMax':'YMid'} slice`;
  const bright = st.imageBrightness && st.imageBrightness !== 1 ? st.imageBrightness : 0;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1080" height="${height}" viewBox="0 0 1080 ${height}"><rect width="1080" height="${height}" fill="${cover ? accent : '#f7f5ef'}"/><circle cx="1040" cy="70" r="250" fill="${cover ? '#fff' : accent}" opacity=".07"/><g font-family="${design.font==='serif'?'Georgia, AppleMyungjo, Batang, serif':'Arial, Apple SD Gothic Neo, Malgun Gothic, sans-serif'}"><text x="88" y="106" fill="${muted}" font-size="27" letter-spacing="2">${escape(draft.brief.brand)}</text><rect x="88" y="154" width="58" height="6" rx="3" fill="${cover ? '#eab895' : accent}"/>${text(title,230,titleSize,fg,700,1.28)}${slide.image ? `<defs><clipPath id="photo"><rect x="88" y="${imageY}" width="904" height="${photoHeight}" rx="20"/></clipPath>${bright?`<filter id="bright"><feComponentTransfer><feFuncR type="linear" slope="${bright}"/><feFuncG type="linear" slope="${bright}"/><feFuncB type="linear" slope="${bright}"/></feComponentTransfer></filter>`:''}</defs>${st.imageFit==='contain'?`<rect x="88" y="${imageY}" width="904" height="${photoHeight}" rx="20" fill="${cover?'#ffffff22':'#e9e6dc'}"/>`:''}<image href="${escape(slide.image)}" x="88" y="${imageY}" width="904" height="${photoHeight}" preserveAspectRatio="${fitAttr}" clip-path="url(#photo)"${bright?' filter="url(#bright)"':''}/>` : ''}${text(lines,bodyY,bodySize,muted,400,lh)}<line x1="88" y1="${height-120}" x2="992" y2="${height-120}" stroke="${muted}" opacity=".25"/><text x="88" y="${height-70}" fill="${muted}" font-size="23">${escape(draft.brief.brand)}</text><text x="992" y="${height-70}" text-anchor="end" fill="${muted}" font-size="23">${String(index+1).padStart(2,'0')} / ${String(draft.slides.length).padStart(2,'0')}</text></g>${layersSvg(slide.layers,height,design.font==='serif'?'Georgia, AppleMyungjo, Batang, serif':'Arial, Apple SD Gothic Neo, Malgun Gothic, sans-serif')}</svg>`;
  return { svg, overflow, url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` };
}
export async function png(svg: string): Promise<Uint8Array> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image(); img.src = url; await img.decode();
    const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('이미지 내보내기를 지원하지 않는 브라우저입니다.');
    ctx.drawImage(img,0,0);
    const blob = await new Promise<Blob>((resolve,reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('PNG 변환에 실패했습니다.')), 'image/png'));
    return new Uint8Array(await blob.arrayBuffer());
  } finally { URL.revokeObjectURL(url); }
}
