import type { Draft, Slide } from './model';
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
export function artwork(slide: Slide, draft: Draft, index: number) {
  const cover = index === 0; const accent = /^#[\da-f]{6}$/i.test(draft.brief.accent) ? draft.brief.accent : '#205b4a';
  let titleSize = cover ? 88 : 72; let title = wrap(slide.headline, 890 / titleSize);
  while (title.length > 4 && titleSize > 42) { titleSize -= 2; title = wrap(slide.headline, 890 / titleSize); }
  const titleEnd = 230 + title.length * titleSize * 1.28;
  const imageY = titleEnd + 30; const bodyY = slide.image ? imageY + 385 : titleEnd + 85;
  let bodySize = 44; let lines = wrap(slide.body, 875 / bodySize);
  while (bodyY + lines.length * bodySize * 1.55 > 1170 && bodySize > 26) { bodySize -= 2; lines = wrap(slide.body, 875 / bodySize); }
  const overflow = bodyY + lines.length * bodySize * 1.55 > 1190;
  const fg = cover ? '#ffffff' : '#193b32'; const muted = cover ? '#dbebe3' : '#53665c';
  const text = (ls: string[], y: number, size: number, color: string, weight: number, lineHeight: number) => ls.map((line,i) => `<text x="88" y="${y+i*size*lineHeight}" fill="${color}" font-size="${size}" font-weight="${weight}">${escape(line)}</text>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1080" height="1350" viewBox="0 0 1080 1350"><rect width="1080" height="1350" fill="${cover ? accent : '#f7f5ef'}"/><circle cx="1040" cy="70" r="250" fill="${cover ? '#fff' : accent}" opacity=".07"/><g font-family="Arial, Apple SD Gothic Neo, Malgun Gothic, sans-serif"><text x="88" y="106" fill="${muted}" font-size="27" letter-spacing="2">${escape(draft.brief.brand)}</text><rect x="88" y="154" width="58" height="6" rx="3" fill="${cover ? '#eab895' : accent}"/>${text(title,230,titleSize,fg,700,1.28)}${slide.image ? `<defs><clipPath id="photo"><rect x="88" y="${imageY}" width="904" height="340" rx="20"/></clipPath></defs><image href="${escape(slide.image)}" x="88" y="${imageY}" width="904" height="340" preserveAspectRatio="xMidYMid slice" clip-path="url(#photo)"/>` : ''}${text(lines,bodyY,bodySize,muted,400,1.55)}<line x1="88" y1="1230" x2="992" y2="1230" stroke="${muted}" opacity=".25"/><text x="88" y="1280" fill="${muted}" font-size="23">${escape(draft.brief.brand)}</text><text x="992" y="1280" text-anchor="end" fill="${muted}" font-size="23">${String(index+1).padStart(2,'0')} / ${String(draft.slides.length).padStart(2,'0')}</text></g></svg>`;
  return { svg, overflow, url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` };
}
export async function png(svg: string): Promise<Uint8Array> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image(); img.src = url; await img.decode();
    const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1350;
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('이미지 내보내기를 지원하지 않는 브라우저입니다.');
    ctx.drawImage(img,0,0);
    const blob = await new Promise<Blob>((resolve,reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('PNG 변환에 실패했습니다.')), 'image/png'));
    return new Uint8Array(await blob.arrayBuffer());
  } finally { URL.revokeObjectURL(url); }
}
