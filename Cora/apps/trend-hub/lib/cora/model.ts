import { deckFromCards } from '../producers/deck';

export interface Brief { brand: string; audience: string; goal: string; material: string; sourceUrl: string; accent: string }
export interface Idea { id: string; title: string; description: string; structure: string }
/** Per-card text and photo settings. Every field is optional so older saved projects stay valid. */
export interface SlideStyle { align?:'left'|'center'|'right'; emphasis?:string; letterSpacing?:number; lineHeight?:number; imageFit?:'cover'|'contain'; imagePosition?:'top'|'center'|'bottom'; imageBrightness?:number }
export const LINE_HEIGHTS=[1.3,1.45,1.55,1.75,2] as const;
/**
 * Free-form elements drawn on top of a card (coordinates in the 1080px-wide canvas, top-left origin).
 * Static cards support text, image, logo and shape layers. Video elements are NOT layers: they belong to
 * the video batch (per-scene motion/clip settings) and are intentionally not part of this type.
 */
export type LayerType='text'|'image'|'logo'|'shape';
export interface Layer { id:string; type:LayerType; x:number; y:number; w:number; h:number; z:number; rotation?:number; opacity?:number; locked?:boolean; hidden?:boolean;
  text?:string; fontSize?:number; color?:string; weight?:400|500|600|700|800; align?:'left'|'center'|'right';
  src?:string; fill?:string; radius?:number }
export const MAX_LAYERS=12;
export interface Slide { id: string; headline: string; body: string; image?: string; seconds?:number; subtitle?:string; keyword?:string; style?:SlideStyle; layers?:Layer[] }
export type WorkStatus = 'draft' | 'review' | 'ready';
export interface Design { ratio: '4:5'|'1:1'|'9:16'; template:'editorial'|'minimal'|'bold'; font:'sans'|'serif'; textScale:number }
export const defaultDesign:Design={ratio:'4:5',template:'editorial',font:'sans',textScale:1};
export interface Draft { design?:Design; brief: Brief; idea: string; slides: Slide[]; caption: string; origin: 'source-outline' | 'llmgw'; postedUrl: string; workStatus?: WorkStatus; reviewNotes?: string }
export interface Project extends Draft { id: string; version: number; createdAt: string; updatedAt: string }
export const blankBrief: Brief = { brand: '', audience: '', goal: '저장하고 다시 보는 콘텐츠', material: '', sourceUrl: '', accent: '#205b4a' };
export const sampleBrief: Brief = { ...blankBrief, brand: '모퉁이 책방', audience: '퇴근 후 조용한 시간을 찾는 직장인', material: '모퉁이 책방은 독립출판물을 소개하는 작은 동네 책방입니다.\n매주 목요일 저녁 7시에 함께 책을 읽는 모임을 엽니다.\n책 모임은 책방의 예약 페이지에서 신청할 수 있습니다.\n책을 읽은 뒤 마음에 남은 문장을 나누는 시간을 갖습니다.', goal: '책 모임을 소개하고 참여를 안내하기' };
export function ideasFor(b: Brief): Idea[] {
  return [
    { id: 'introduce', title: `${b.brand}을 만나는 첫 장면`, description: '브랜드 소개부터 핵심 안내까지, 처음 보는 사람도 이해하도록.', structure: '소개 → 핵심 정보 → 다음 행동' },
    { id: 'guide', title: `${b.brand}, 알아두면 좋은 이야기`, description: '입력한 자료를 짧은 정보 카드로 나눠 저장하기 쉽게.', structure: '한눈에 보기 → 정보 1·2·3 → 정리' },
    { id: 'invite', title: `${b.brand}에서 시작하는 시간`, description: '브랜드가 제공하는 경험과 참여 방법을 순서대로.', structure: '초대 → 경험 소개 → 참여 안내' },
  ];
}
export function outline(b: Brief, idea: Idea): Draft {
  const chunks = b.material.split(/\n+|(?<=[.!?。])\s+/u).map(x => x.trim()).filter(Boolean);
  // Preserve every input character: each excerpt becomes editable cards, not a fabricated summary.
  const parts = chunks.flatMap(chunk => {
    const chars = Array.from(chunk); const out = [];
    for (let i = 0; i < chars.length; i += 200) out.push(chars.slice(i, i + 200).join(''));
    return out;
  });
  if (parts.length > 10) throw new Error('자료를 10개의 짧은 문단 이내로 정리해 주세요. 원문을 생략하지 않고 카드에 담습니다.');
  return { brief: { ...b }, idea: idea.title, origin: 'source-outline', postedUrl: '',
    slides: [
      { id: crypto.randomUUID(), headline: idea.title, body: b.goal },
      ...parts.map((body, i) => ({ id: crypto.randomUUID(), headline: `${b.brand} · ${i + 1}`, body })),
      { id: crypto.randomUUID(), headline: '더 궁금한 이야기가 있나요?', body: `${b.brand}의 이야기를 저장해 두세요.` },
    ], caption: `${idea.title}\n\n${b.material}${b.sourceUrl ? `\n\n참고 자료: ${b.sourceUrl}` : ''}` };
}
export function rendererContract(d: Draft) {
  return deckFromCards(d.slides.map((s, i) => ({ no: i + 1, kind: i === 0 ? '표지' : i === d.slides.length - 1 ? '마지막장' : '본문', headline: s.headline, body: s.body })), { template: 'explain_box', style: 'gogumafarm', account: d.brief.brand, kicker: '순서' });
}
export function validateStyle(value:unknown):SlideStyle{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('카드 문자·이미지 설정을 확인해 주세요.');
 const v=value as Record<string,unknown>,out:SlideStyle={};
 const oneOf=<T extends string>(k:string,allowed:readonly T[])=>{if(v[k]===undefined)return;if(!allowed.includes(v[k] as T))throw new Error('카드 문자·이미지 설정을 확인해 주세요.');return v[k] as T;};
 const num=(k:string,ok:(n:number)=>boolean)=>{if(v[k]===undefined)return;const n=v[k];if(typeof n!=='number'||!Number.isFinite(n)||!ok(n))throw new Error('카드 문자·이미지 설정을 확인해 주세요.');return n;};
 const align=oneOf('align',['left','center','right'] as const);if(align)out.align=align;
 if(v.emphasis!==undefined){if(typeof v.emphasis!=='string'||v.emphasis.length>40)throw new Error('강조할 단어는 40자 이내입니다.');if(v.emphasis.trim())out.emphasis=v.emphasis.trim();}
 const ls=num('letterSpacing',n=>Number.isInteger(n)&&n>=-2&&n<=8);if(ls!==undefined)out.letterSpacing=ls;
 const lh=num('lineHeight',n=>(LINE_HEIGHTS as readonly number[]).includes(n));if(lh!==undefined)out.lineHeight=lh;
 const fit=oneOf('imageFit',['cover','contain'] as const);if(fit)out.imageFit=fit;
 const pos=oneOf('imagePosition',['top','center','bottom'] as const);if(pos)out.imagePosition=pos;
 const br=num('imageBrightness',n=>n>=0.5&&n<=1.5);if(br!==undefined)out.imageBrightness=Math.round(br*100)/100;
 return out;
}
const LAYER_ERR='요소 설정을 확인해 주세요.';
const IMAGE_SRC=/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
/** Strict layer validation. Unknown types are refused; unknown keys are dropped so only known fields are stored. */
export function validateLayers(value:unknown):Layer[]{
 if(!Array.isArray(value)||value.length>MAX_LAYERS)throw new Error(`요소는 ${MAX_LAYERS}개 이하여야 합니다.`);
 const ids=new Set<string>();
 return value.map(raw=>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error(LAYER_ERR);
  const v=raw as Record<string,unknown>;
  if(typeof v.type!=='string'||!['text','image','logo','shape'].includes(v.type))throw new Error('지원하지 않는 요소 종류입니다.');
  if(typeof v.id!=='string'||!v.id||v.id.length>80||ids.has(v.id))throw new Error('요소 번호가 비었거나 중복되었습니다.');ids.add(v.id);
  const num=(k:string,lo:number,hi:number,int=false)=>{const n=v[k];if(typeof n!=='number'||!Number.isFinite(n)||n<lo||n>hi||(int&&!Number.isInteger(n)))throw new Error(LAYER_ERR);return n;};
  const opt=(k:string,lo:number,hi:number,int=false)=>v[k]===undefined?undefined:num(k,lo,hi,int);
  const hex=(k:string)=>{const c=v[k];if(typeof c!=='string'||!/^#[\da-f]{6}$/i.test(c))throw new Error(LAYER_ERR);return c;};
  const flag=(k:string)=>{if(v[k]===undefined)return undefined;if(typeof v[k]!=='boolean')throw new Error(LAYER_ERR);return v[k] as boolean;};
  const type=v.type as LayerType;
  const l:Layer={id:v.id,type,x:num('x',-1080,3240),y:num('y',-1920,3840),w:num('w',1,4320),h:num('h',1,4320),z:num('z',0,999,true)};
  const rot=opt('rotation',-360,360);if(rot!==undefined)l.rotation=rot;
  const op=opt('opacity',0,1);if(op!==undefined)l.opacity=op;
  const lk=flag('locked');if(lk!==undefined)l.locked=lk;const hd=flag('hidden');if(hd!==undefined)l.hidden=hd;
  if(type==='text'){
   if(typeof v.text!=='string'||v.text.length>300)throw new Error('요소 문구는 300자 이내입니다.');l.text=v.text;
   l.fontSize=num('fontSize',8,400);l.color=hex('color');
   if(![400,500,600,700,800].includes(v.weight as number))throw new Error(LAYER_ERR);l.weight=v.weight as Layer['weight'];
   if(!['left','center','right'].includes(v.align as string))throw new Error(LAYER_ERR);l.align=v.align as Layer['align'];
  }else if(type==='shape'){
   l.fill=hex('fill');l.radius=num('radius',0,2000);
  }else{
   if(typeof v.src!=='string'||v.src.length>400000||!IMAGE_SRC.test(v.src))throw new Error('사진 크기 또는 형식을 확인해 주세요.');l.src=v.src;
  }
  return l;
 });
}
export function validateDraft(value: unknown): Draft {
  const v = value as Partial<Draft>;
  const str = (x: unknown, max: number, label: string) => { if (typeof x !== 'string' || x.length > max) throw new Error(`${label} 형식을 확인해 주세요.`); return x; };
  if (!v || typeof v !== 'object' || !v.brief || !Array.isArray(v.slides) || v.slides.length < 2 || v.slides.length > 12) throw new Error('카드는 2~12장이어야 합니다.');
  const b = v.brief;
  const brief: Brief = { brand: str(b.brand, 80, '브랜드'), audience: str(b.audience, 160, '대상'), goal: str(b.goal, 200, '목표'), material: str(b.material, 20000, '자료'), sourceUrl: str(b.sourceUrl, 1500, '출처'), accent: str(b.accent, 7, '색상') };
  if (!brief.brand.trim() || !brief.material.trim() || !/^#[\da-f]{6}$/i.test(brief.accent)) throw new Error('브랜드·자료·색상을 확인해 주세요.');
  for (const url of [brief.sourceUrl, v.postedUrl]) { if (url && (typeof url !== 'string' || !/^https?:\/\//i.test(url))) throw new Error('링크는 http 또는 https 주소여야 합니다.'); }
  const ids = new Set<string>();
  const slides = v.slides.map(s => {
    if (!s || typeof s !== 'object') throw new Error('카드 형식을 확인해 주세요.');
    const slide: Slide = { id: str(s.id, 80, '카드 번호'), headline: str(s.headline, 80, '제목'), body: str(s.body, 500, '본문') };
    if (!slide.id || ids.has(slide.id)) throw new Error('중복된 카드 번호입니다.'); ids.add(slide.id);
    if (s.image) { if (typeof s.image !== 'string' || s.image.length > 400000 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s.image)) throw new Error('사진 크기 또는 형식을 확인해 주세요.'); slide.image = s.image; }
    if(s.seconds!==undefined){if(!Number.isInteger(s.seconds)||s.seconds<1||s.seconds>10)throw new Error('장면 길이는 1~10초입니다.');slide.seconds=s.seconds;}
    if(s.subtitle!==undefined)slide.subtitle=str(s.subtitle,200,'장면 자막');
    if(s.keyword!==undefined&&s.keyword!==''){const k=str(s.keyword,30,'강조 단어').trim();if(k&&!(slide.subtitle??'').includes(k))throw new Error('영상 강조 단어는 그 장면 자막에 들어 있어야 합니다.');if(k)slide.keyword=k;}
    if(s.style!==undefined)slide.style=validateStyle(s.style);
    if(s.layers!==undefined)slide.layers=validateLayers(s.layers);
    return slide;
  });
  if (v.workStatus !== undefined && !['draft','review','ready'].includes(v.workStatus)) throw new Error('작업 상태를 확인해 주세요.');
  const design={...defaultDesign,...v.design};if(!['4:5','1:1','9:16'].includes(design.ratio)||!['editorial','minimal','bold'].includes(design.template)||!['sans','serif'].includes(design.font)||![.85,1,1.15].includes(design.textScale))throw new Error('디자인 설정을 확인해 주세요.');
  return { design, workStatus: v.workStatus ?? 'draft', reviewNotes: str(v.reviewNotes ?? '', 3000, '검토 메모'), brief, slides, idea: str(v.idea, 200, '소재'), caption: str(v.caption, 5000, '캡션'), origin: v.origin==='llmgw'?'llmgw':'source-outline', postedUrl: str(v.postedUrl ?? '', 1500, '게시 링크') };
}

export interface BrandProfile { id:string; name:string; audience:string; goal:string; accent:string; notes:string }
export function validateBrand(value: unknown): Omit<BrandProfile,'id'> {
 const v=value as Partial<BrandProfile>;
 if(!v || typeof v!=='object') throw new Error('브랜드 정보를 확인해 주세요.');
 const take=(x:unknown,max:number)=>{if(typeof x!=='string'||x.length>max)throw new Error('브랜드 입력 길이를 확인해 주세요.');return x.trim();};
 const b={name:take(v.name,80),audience:take(v.audience,160),goal:take(v.goal,200),accent:take(v.accent,7),notes:take(v.notes??'',2000)};
 if(!b.name||!/^#[\da-f]{6}$/i.test(b.accent))throw new Error('브랜드 이름과 색상을 확인해 주세요.');return b;
}
// Restoring or copying never imports ownership, approval or publication provenance.
export function importDraft(value:unknown):Draft {
 const d=validateDraft(value);return {...d,workStatus:'draft',postedUrl:'',slides:d.slides.map(s=>({...s,id:crypto.randomUUID()}))};
}
