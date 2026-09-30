'use client';
import{useCallback,useEffect,useState}from'react';import s from'./workbench.module.css';
type Source={id:string;name:string;status:string;duration:number;hasAudio:boolean;segmentCount:number};
type Theme={id:string;label:string;guide:string};
type Cand={startIndex:number;endIndex:number;start:number;end:number;duration:number;title:string;hook:string;reason:string;keyword:string;score:number};
type Plan={id:string;mode:string;theme:string;candidates:Cand[];rejected:string[];provider:string|null};
type Audio={id:string;name:string;license:string;duration:number};
type Made={url:string;duration:number;title:string;bgm:{name:string;license:string}|null};
async function call(url:string,data?:Record<string,unknown>){const r=await fetch(url,{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json'}:undefined,body:data?JSON.stringify(data):undefined});const v=await r.json().catch(()=>({}));if(!r.ok)throw new Error(v.error||'요청 실패');return v;}
const mmss=(t:number)=>`${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')}`;
const b64=(f:File)=>new Promise<string>((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result).split(',')[1]??'');r.onerror=()=>rej(new Error('파일을 읽지 못했습니다.'));r.readAsDataURL(f);});

/** Long video → themed vertical shorts: pick a purpose, get snapped segment suggestions (AI or rules), edit, then render with subtitles, hook card and background music. */
export function ShortsStudio(){
 const[sources,setSources]=useState<Source[]>([]),[themes,setThemes]=useState<Theme[]>([]),[whisper,setWhisper]=useState(false),[audio,setAudio]=useState<Audio[]>([]);
 const[sourceId,setSourceId]=useState(''),[theme,setTheme]=useState('highlight'),[custom,setCustom]=useState(''),[count,setCount]=useState(3),[minSec,setMinSec]=useState(20),[maxSec,setMaxSec]=useState(55),[audience,setAudience]=useState('');
 const[plan,setPlan]=useState<Plan|null>(null),[picked,setPicked]=useState<Cand[]>([]),[keep,setKeep]=useState<boolean[]>([]);
 const[fit,setFit]=useState<'crop'|'blur'>('crop'),[burn,setBurn]=useState(true),[hookCard,setHookCard]=useState(true),[bgmId,setBgmId]=useState(''),[bgmVolume,setBgmVolume]=useState(0.18),[license,setLicense]=useState('');
 const[made,setMade]=useState<Made[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const load=useCallback(async()=>{const [src,sh,au]=await Promise.all([call('/api/cora/video-sources'),call('/api/cora/video-shorts'),call('/api/cora/video-audio')]);const ready=(src.sources as Source[]).filter(x=>x.status==='ready');setSources(ready);setThemes(sh.themes);setWhisper(sh.whisper);setAudio(au.audio);setSourceId(id=>id||ready[0]?.id||'');},[]);
 useEffect(()=>{void load().catch(e=>setError(e.message));},[load]);
 async function run(f:()=>Promise<void>){if(busy)return;setBusy(true);setError('');setNotice('');try{await f();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const src=sources.find(x=>x.id===sourceId);
 function applyPlan(p:Plan){setPlan(p);setPicked(p.candidates.map(c=>({...c})));setKeep(p.candidates.map(c=>c.score>=70));}
 const edit=(i:number,v:Partial<Cand>)=>setPicked(list=>list.map((c,j)=>j===i?{...c,...v,duration:Math.round(((v.end??c.end)-(v.start??c.start))*10)/10}:c));
 return <section className={s.panel} aria-label="긴 영상 숏츠 만들기"><span className={s.eyebrow}>LONG VIDEO → SHORTS</span><h2>긴 영상을 목적에 맞는 숏츠로 나누기</h2>
  <p>아래 “원본 영상 올리기”에서 영상과 자막을 올린 뒤 이곳에서 목적을 고릅니다. AI(또는 규칙)가 자막 맥락을 읽고 문장이 끊기지 않게 구간을 추천하고, 사람이 고친 구간만 세로 9:16 숏츠로 만듭니다.</p>
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  <div className={s.grid}><div>
   <label>원본 영상<select aria-label="숏츠 원본 영상" value={sourceId} onChange={e=>{setSourceId(e.target.value);setPlan(null);setMade([]);}}><option value="">업로드를 마친 영상 선택</option>{sources.map(x=><option key={x.id} value={x.id}>{x.name} · {mmss(x.duration)} · 자막 {x.segmentCount}줄</option>)}</select></label>
   {src&&!src.segmentCount&&<p className={s.warning}>이 영상에는 자막이 없습니다. 아래에서 SRT를 붙이거나{whisper?' 로컬 받아쓰기를 실행하세요.':' 로컬 받아쓰기(whisper.cpp)를 설치하면 자동으로 만들 수 있습니다.'}</p>}
   {src&&whisper&&<button disabled={busy} onClick={()=>void run(async()=>{const v=await call('/api/cora/video-shorts',{action:'transcribe',sourceId});await load();setNotice(`받아쓰기로 자막 ${v.segments}줄을 만들었습니다.`);})}>로컬 받아쓰기로 자막 만들기</button>}
   <label>숏츠 목적<select aria-label="숏츠 목적" value={theme} onChange={e=>setTheme(e.target.value)}>{themes.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}<option value="custom">직접 입력</option></select></label>
   {theme==='custom'?<label>원하는 목적<input aria-label="숏츠 목적 직접 입력" value={custom} onChange={e=>setCustom(e.target.value)} placeholder="예: 신제품 가격 이야기만 모아서"/></label>:<small>{themes.find(t=>t.id===theme)?.guide}</small>}
   <label>보여 줄 시청자(선택)<input aria-label="숏츠 시청자" value={audience} onChange={e=>setAudience(e.target.value)} placeholder="예: 20대 직장인"/></label>
   <div className={s.actions}><label>개수<input aria-label="숏츠 개수" type="number" min={1} max={8} value={count} onChange={e=>setCount(Number(e.target.value))}/></label><label>최소 초<input aria-label="숏츠 최소 길이" type="number" min={8} max={90} value={minSec} onChange={e=>setMinSec(Number(e.target.value))}/></label><label>최대 초<input aria-label="숏츠 최대 길이" type="number" min={10} max={180} value={maxSec} onChange={e=>setMaxSec(Number(e.target.value))}/></label></div>
   <div className={s.actions}><button className={s.primary} disabled={busy||!src?.segmentCount} onClick={()=>void run(async()=>{const v=await call('/api/cora/video-shorts',{action:'plan',mode:'ai',sourceId,theme,custom,count,minSec,maxSec,audience});applyPlan(v.plan);setNotice(`AI가 구간 ${v.plan.candidates.length}개를 추천했습니다. 확인하고 고쳐 주세요.`);})}>AI로 구간 추천</button><button disabled={busy||!src?.segmentCount} onClick={()=>void run(async()=>{const v=await call('/api/cora/video-shorts',{action:'plan',mode:'rules',sourceId,theme,custom,count,minSec,maxSec,audience});applyPlan(v.plan);setNotice(`규칙 기반으로 구간 ${v.plan.candidates.length}개를 추천했습니다(AI 사용 안 함).`);})}>규칙으로 추천(AI 없음)</button></div>
  </div><div>
   <h3>배경음악</h3>
   <label>음악 선택<select aria-label="숏츠 배경음악" value={bgmId} onChange={e=>setBgmId(e.target.value)}><option value="">배경음악 없음</option>{audio.map(a=><option key={a.id} value={a.id}>{a.name} · {a.license}</option>)}</select></label>
   <label>음악 크기 {Math.round(bgmVolume*100)}%<input aria-label="숏츠 배경음악 크기" type="range" min={0} max={60} step={2} value={Math.round(bgmVolume*100)} onChange={e=>setBgmVolume(Number(e.target.value)/100)}/></label>
   <label>새 음악의 이용 조건 메모<input aria-label="숏츠 음악 이용 조건" value={license} onChange={e=>setLicense(e.target.value)} placeholder="예: 직접 제작, YouTube 오디오 보관함 무료"/></label>
   <label>음악 파일 올리기(mp3·m4a·wav, 10MB)<input aria-label="숏츠 음악 파일" type="file" accept="audio/mpeg,audio/mp4,audio/wav,.mp3,.m4a,.wav" disabled={busy||!license.trim()} onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void run(async()=>{const v=await call('/api/cora/video-audio',{name:f.name,data:await b64(f),license});await load();setBgmId(v.audio.id);setNotice('배경음악을 올렸습니다.');});}}/></label>
   <h3>화면 설정</h3>
   <label>세로 맞춤<select aria-label="숏츠 세로 맞춤" value={fit} onChange={e=>setFit(e.target.value as 'crop'|'blur')}><option value="crop">가운데를 잘라 화면 채우기</option><option value="blur">전체를 보이고 위아래는 흐린 배경</option></select></label>
   <label style={{display:'flex',gap:8,alignItems:'center'}}><input type="checkbox" style={{width:'auto'}} aria-label="숏츠 자막 새기기" checked={burn} onChange={e=>setBurn(e.target.checked)}/>자막을 화면에 새기고 강조 단어 색칠</label>
   <label style={{display:'flex',gap:8,alignItems:'center'}}><input type="checkbox" style={{width:'auto'}} aria-label="숏츠 첫 화면 문구" checked={hookCard} onChange={e=>setHookCard(e.target.checked)}/>첫 2초에 도입 문구 크게 표시</label>
  </div></div>
  {plan&&<><h3>추천 구간 ({plan.mode==='ai'?`AI · ${plan.provider}`:'규칙 기반'})</h3>{plan.rejected.length>0&&<small>제외: {plan.rejected.slice(0,4).join(' / ')}</small>}
   {picked.map((c,i)=><article className={s.row} key={i} aria-label={`추천 구간 ${i+1}`}><label style={{display:'flex',gap:8,alignItems:'center'}}><input type="checkbox" style={{width:'auto'}} aria-label={`구간 ${i+1} 만들기`} checked={keep[i]??false} onChange={e=>setKeep(k=>k.map((x,j)=>j===i?e.target.checked:x))}/><b>{mmss(c.start)}~{mmss(c.end)} · {c.duration}초 · 점수 {c.score}{c.score<70?' · 약한 추천(기본 선택 안 함)':''}</b></label>
    <p>{c.reason}</p>
    <div className={s.actions}><label>제목<input aria-label={`구간 ${i+1} 제목`} value={c.title} onChange={e=>edit(i,{title:e.target.value})}/></label><label>첫 화면 문구<input aria-label={`구간 ${i+1} 도입 문구`} value={c.hook} onChange={e=>edit(i,{hook:e.target.value})}/></label><label>강조 단어<input aria-label={`구간 ${i+1} 강조 단어`} value={c.keyword} onChange={e=>edit(i,{keyword:e.target.value})}/></label></div>
    <div className={s.actions}><label>시작(초)<input aria-label={`구간 ${i+1} 시작`} type="number" step={0.5} value={c.start} onChange={e=>edit(i,{start:Number(e.target.value)})}/></label><label>끝(초)<input aria-label={`구간 ${i+1} 끝`} type="number" step={0.5} value={c.end} onChange={e=>edit(i,{end:Number(e.target.value)})}/></label></div>
   </article>)}
   <button className={s.primary} disabled={busy||!keep.some(Boolean)} onClick={()=>void run(async()=>{const items=picked.filter((_,i)=>keep[i]).map(c=>({start:c.start,end:c.end,title:c.title,hook:c.hook,keyword:c.keyword}));const v=await call('/api/cora/video-shorts',{action:'render',sourceId,items,fit,burn,hookCard,bgmId,bgmVolume});setMade(v.shorts);setNotice(`숏츠 ${v.shorts.length}개를 만들었습니다.`);})}>선택한 구간을 숏츠로 만들기</button></>}
  {made.length>0&&<><h3>만든 숏츠</h3>{made.map((m,i)=><article className={s.row} key={m.url}><h4>{m.title||`숏츠 ${i+1}`} · {m.duration}초{m.bgm?` · 음악 ${m.bgm.name}`:''}</h4><video controls src={m.url} style={{maxWidth:240,borderRadius:8}} aria-label={`만든 숏츠 ${i+1}`}/><div className={s.actions}><a href={m.url} download={`cora-short-${i+1}.mp4`}>MP4 다운로드</a></div></article>)}<p className={s.hint}>실제 SNS 업로드는 Instagram·YouTube·TikTok 연결을 마친 뒤 게시 준비함에서 이어집니다. 지금은 다운로드해 직접 올리거나 모의 게시로 흐름을 확인합니다.</p></>}
 </section>;
}
