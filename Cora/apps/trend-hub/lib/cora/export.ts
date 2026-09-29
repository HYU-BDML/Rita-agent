import {timeline,subtitles} from './timeline';
import { artwork, png } from './artwork';
import { rendererContract, type Draft } from './model';
const encoder = new TextEncoder();
function crc32(bytes: Uint8Array) { let crc = 0xffffffff; for (const b of bytes) { crc ^= b; for (let i=0;i<8;i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }
/** ZIP STORED entries; exports are generated locally and never sent to an image service. */
export function zip(entries: { name: string; bytes: Uint8Array }[]) {
  const local: Uint8Array[] = []; const central: Uint8Array[] = []; let offset = 0; let cdSize = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name); const size = entry.bytes.length; const crc = crc32(entry.bytes);
    const h = new Uint8Array(30+name.length); const v = new DataView(h.buffer);
    v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,33,true);v.setUint32(14,crc,true);v.setUint32(18,size,true);v.setUint32(22,size,true);v.setUint16(26,name.length,true);h.set(name,30);
    const c = new Uint8Array(46+name.length); const d = new DataView(c.buffer);
    d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(8,0x800,true);d.setUint16(14,33,true);d.setUint32(16,crc,true);d.setUint32(20,size,true);d.setUint32(24,size,true);d.setUint16(28,name.length,true);d.setUint32(42,offset,true);c.set(name,46);
    local.push(h,entry.bytes);central.push(c);offset+=h.length+size;cdSize+=c.length;
  }
  const end=new Uint8Array(22);const v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,entries.length,true);v.setUint16(10,entries.length,true);v.setUint32(12,cdSize,true);v.setUint32(16,offset,true);
  const output=new Uint8Array(offset+cdSize+22);let p=0;for(const b of [...local,...central,end]){output.set(b,p);p+=b.length;}return output;
}
export function download(bytes: Uint8Array, filename: string, type: string) {
  const url=URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer],{type}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
export function exportJson(d: Draft) { download(encoder.encode(JSON.stringify(d,null,2)), 'cora-project.json','application/json'); }
export async function exportPack(d: Draft) {
  const entries: {name:string;bytes:Uint8Array}[]=[];
  for (const [i,s] of d.slides.entries()) { const a=artwork(s,d,i);if(a.overflow)throw new Error(`${i+1}번 카드의 글이 넘칩니다. 문구를 줄이거나 사진을 빼 주세요.`);entries.push({name:`slide-${String(i+1).padStart(2,'0')}.png`,bytes:await png(a.svg)}); }
  entries.push({name:'caption.txt',bytes:encoder.encode(d.caption)},{name:'project.json',bytes:encoder.encode(JSON.stringify(d,null,2))},{name:'renderer-contract.json',bytes:encoder.encode(JSON.stringify(rendererContract(d),null,2))});
  const safe=d.brief.brand.replace(/[^\p{L}\p{N}_-]/gu,'_').slice(0,40)||'cards';download(zip(entries),`${safe}-cora.zip`,'application/zip');
}

export function exportSubtitles(d:Draft){const text=subtitles(timeline(d.slides.length,d.slides.map(s=>({seconds:s.seconds??3,subtitle:s.subtitle??''}))));if(!text)throw new Error('먼저 장면 자막을 입력해 주세요.');download(encoder.encode(text),'cora-subtitles.srt','application/x-subrip;charset=utf-8');}
