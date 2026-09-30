'use client';
import{useState}from'react';import s from'./workbench.module.css';
type Item={id:string;kind:string;title:string;data:Record<string,unknown>;createdAt:string};
const label:Record<string,string>={draft:'검토 대기',approved:'승인됨',writing:'본문 작성 중',written:'본문 완료'};
const str=(x:unknown)=>typeof x==='string'?x:'';
/** Outline-first blog flow: AI proposes an outline, a person edits and approves it once, then one body is written from it. */
export function OutlinePanel({items,material,brand,instructions,llm,api,refresh,onBody}:{items:Item[];material:string;brand:string;instructions:string;llm:boolean;api:(b:Record<string,unknown>)=>Promise<any>;refresh:()=>Promise<void>;onBody:(item:Item)=>void}){
 const[openId,setOpenId]=useState(''),[draft,setDraft]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const outlines=items.filter(i=>i.kind==='outline');const open=outlines.find(o=>o.id===openId);
 async function run(f:()=>Promise<void>){if(busy)return;setBusy(true);setError('');setNotice('');try{await f();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 function select(o:Item){setOpenId(o.id);setDraft(str(o.data.text));}
 return <section className={s.panel} aria-label="블로그 개요 승인"><span className={s.eyebrow}>OUTLINE FIRST</span><h2>개요 먼저 승인하고 본문 쓰기</h2><p>AI가 개요만 먼저 만들고, 사람이 고쳐 승인한 개요로 본문을 한 번 씁니다. 승인은 한 번만 되고, 같은 개요로 본문을 두 번 만들지 않습니다.</p>
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  <button className={s.primary} disabled={busy||!llm||!material.trim()} onClick={()=>void run(async()=>{const r=await api({action:'outline',material,brand,instructions});await refresh();select(r.item);setNotice('개요를 만들었습니다. 고친 뒤 승인해 주세요.');})}>현재 소재로 개요 만들기</button>
  {outlines.map(o=><article className={s.row} key={o.id}><small>{label[str(o.data.status)]||str(o.data.status)} · {new Date(o.createdAt).toLocaleString('ko-KR')}</small><h3>{o.title}</h3><div className={s.actions}><button disabled={busy} onClick={()=>select(o)}>개요 열기</button></div></article>)}
  {!outlines.length&&<p>아직 만든 개요가 없습니다.</p>}
  {open&&<div aria-label="열린 개요"><h3>{open.title} · {label[str(open.data.status)]}</h3>{str(open.data.lastError)&&<p role="alert">{str(open.data.lastError)}</p>}
   <label>개요 본문<textarea aria-label="개요 본문" rows={14} value={draft} readOnly={open.data.status!=='draft'} onChange={e=>setDraft(e.target.value)}/></label>
   <div className={s.actions}>
    {open.data.status==='draft'&&<button className={s.primary} disabled={busy||!draft.trim()} onClick={()=>void run(async()=>{await api({action:'approve-outline',id:open.id,expectedText:str(open.data.text),text:draft});await refresh();setNotice('개요를 승인했습니다. 이제 이 개요로 본문을 쓸 수 있습니다.');})}>이 개요 승인</button>}
    {open.data.status==='approved'&&<><button className={s.primary} disabled={busy||!llm} onClick={()=>void run(async()=>{const r=await api({action:'write-from-outline',id:open.id});await refresh();onBody(r.item);setNotice('승인한 개요로 본문을 만들었습니다.');})}>승인한 개요로 본문 쓰기</button><button disabled={busy} onClick={()=>void run(async()=>{await api({action:'reopen-outline',id:open.id});await refresh();setNotice('승인을 취소했습니다. 개요를 고친 뒤 다시 승인해 주세요.');})}>승인 취소</button></>}
    {open.data.status==='written'&&<button disabled={busy} onClick={()=>{const body=items.find(i=>i.id===open.data.bodyItemId);if(body)onBody(body);}}>만든 본문 열기</button>}
   </div></div>}
 </section>;
}
