'use client';
import{useState,useEffect,useCallback}from'react';import s from'./workbench.module.css';
import{t}from'@/lib/cora/i18n';
type Idea={id:string;title:string;text:string;status:string;updated:string;history:{from:string;to:string;at:string}[];next:string[]};
type Row={id:string;kind:string;title:string;status:string;brand:string;createdAt:string;snippet:string};
type List={total:number;items:Row[];nextCursor:string|null};
const STATUSES=['새 아이디어','검토 중','제작 예정','제작 완료','보류'];
async function get(url:string){const r=await fetch(url);const v=await r.json();if(!r.ok)throw new Error(v.error);return v;}
async function post(url:string,data:Record<string,unknown>){const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const v=await r.json();if(!r.ok)throw new Error(v.error);return v;}
/** F007 idea status board and F060 blog/script progress + period filter. */
export function IdeasBoard(){
 const[lang,setLang]=useState('ko'),[ideas,setIdeas]=useState<Idea[]>([]),[filter,setFilter]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const[q,setQ]=useState({status:'',from:'',to:'',brand:'',keyword:'',kind:''}),[list,setList]=useState<List|null>(null);
 const loadIdeas=useCallback(async()=>setIdeas((await get('/api/cora/ideas'+(filter?`?status=${encodeURIComponent(filter)}`:''))).ideas),[filter]);
 const search=useCallback(async(cursor?:string,append?:boolean)=>{const p=new URLSearchParams();Object.entries(q).forEach(([k,v])=>v&&p.set(k,v));if(cursor)p.set('cursor',cursor);const v:List=await get('/api/cora/content-list?'+p);setList(append&&list?{...v,items:[...list.items,...v.items]}:v);},[q,list]);
 useEffect(()=>{get('/api/cora/settings').then(v=>setLang(v.language)).catch(()=>{});},[]);
 useEffect(()=>{loadIdeas().catch(e=>setError(e.message));},[loadIdeas]);
 useEffect(()=>{search().catch(e=>setError(e.message));},[]); // eslint-disable-line react-hooks/exhaustive-deps
 async function run(f:()=>Promise<void>){if(busy)return;setBusy(true);setError('');try{await f();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const stLabel=(v:string)=>t(lang,`status.${v}`);const ctLabel=(v:string)=>t(lang,v==='초안'?'content.draft':v==='수정됨'?'content.edited':'content.approved');
 return <div className={s.root}><h1>{t(lang,'ideas.title')}</h1>{error&&<p role="alert">{error}</p>}
  <nav className={s.tabs} aria-label={t(lang,'ideas.title')}><button className={filter===''?s.active:''} onClick={()=>setFilter('')}>{t(lang,'ideas.all')}</button>{STATUSES.map(v=><button key={v} className={filter===v?s.active:''} onClick={()=>setFilter(v)}>{stLabel(v)}</button>)}</nav>
  <div className={s.cards}>{ideas.map(i=><article className={s.panel} key={i.id}><small>{stLabel(i.status)} · {new Date(i.updated).toLocaleDateString(lang==='en'?'en-US':'ko-KR')}</small><h3>{i.title}</h3><p>{i.text.slice(0,160)}</p>
   <div className={s.actions}>{i.next.map(n=><button key={n} disabled={busy} aria-label={`${i.title} → ${stLabel(n)}`} onClick={()=>void run(async()=>{await post('/api/cora/ideas',{action:'set-status',id:i.id,status:n});await loadIdeas();})}>{stLabel(n)}</button>)}</div>
   {!!i.history.length&&<details><summary>{t(lang,'ideas.history')} ({i.history.length})</summary><ul>{i.history.map((h,k)=><li key={k}>{stLabel(h.from)} → {stLabel(h.to)} · {new Date(h.at).toLocaleString(lang==='en'?'en-US':'ko-KR')}</li>)}</ul></details>}</article>)}
   {!ideas.length&&<p>{t(lang,'ideas.empty')}</p>}</div>
  <section className={s.panel}><h2>{t(lang,'content.title')}</h2>
   <label>{t(lang,'content.status')}<select aria-label={t(lang,'content.status')} value={q.status} onChange={e=>setQ({...q,status:e.target.value})}><option value="">{t(lang,'ideas.all')}</option>{['초안','수정됨','승인됨'].map(v=><option key={v} value={v}>{ctLabel(v)}</option>)}</select></label>
   <label>{t(lang,'content.from')}<input aria-label={t(lang,'content.from')} type="date" value={q.from} onChange={e=>setQ({...q,from:e.target.value})}/></label>
   <label>{t(lang,'content.to')}<input aria-label={t(lang,'content.to')} type="date" value={q.to} onChange={e=>setQ({...q,to:e.target.value})}/></label>
   <label>{t(lang,'content.brand')}<input aria-label={t(lang,'content.brand')} value={q.brand} onChange={e=>setQ({...q,brand:e.target.value})}/></label>
   <label>{t(lang,'content.keyword')}<input aria-label={t(lang,'content.keyword')} value={q.keyword} onChange={e=>setQ({...q,keyword:e.target.value})}/></label>
   <button className={s.primary} disabled={busy} onClick={()=>void run(()=>search())}>{t(lang,'content.search')}</button>
   {list&&<p>{t(lang,'content.total')}: {list.total}</p>}
   {list?.items.map(r=><article className={s.row} key={r.id}><small>{r.kind==='blog'?'블로그':'영상 대본'} · {ctLabel(r.status)} · {r.brand||'-'} · {new Date(r.createdAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}</small><h3>{r.title}</h3><p>{r.snippet}</p></article>)}
   {list&&!list.items.length&&<p>{t(lang,'content.empty')}</p>}
   {list?.nextCursor&&<button disabled={busy} onClick={()=>void run(()=>search(list.nextCursor!,true))}>{t(lang,'content.more')}</button>}</section></div>;
}
