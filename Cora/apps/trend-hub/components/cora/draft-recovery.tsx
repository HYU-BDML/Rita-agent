'use client';
import {useEffect,useRef,useState} from 'react';
import type {RecoveryPayload,RecoverySummary} from '@/lib/cora/recovery-model';
import styles from './studio.module.css';

type Slot={actor:string;key:string;id:string;version:number|null;encoded:string;queue:Promise<void>;cancelled:boolean};
async function request(actor:string,action:string,id:string,version:number|null,payload?:RecoveryPayload){
 const r=await fetch('/api/cora/recovery',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({actorId:actor,action,id,version,payload})});const b=await r.json();if(!r.ok)throw new Error(b.error||'초안을 보관하지 못했습니다.');return b;
}
/** Content stays on the authenticated server. No customer material enters browser storage. */
export function useDraftRecovery(actor:string|null,payload:RecoveryPayload|null,key:string,dirty:boolean){
 const slot=useRef<Slot|null>(null),currentActor=useRef(actor),timer=useRef<ReturnType<typeof setTimeout>|null>(null),latest=useRef({payload,dirty}),consumed=useRef<{actor:string;id:string;version:number;key:string}|null>(null);
 const [status,setStatus]=useState(''),[drafts,setDrafts]=useState<RecoverySummary[]>([]),[problem,setProblem]=useState('');
 currentActor.current=actor;latest.current={payload,dirty};
 function fresh(){const s:Slot={actor:actor!,key,id:crypto.randomUUID(),version:null,encoded:'',queue:Promise.resolve(),cancelled:false};slot.current=s;return s;}
 function active(s:Slot){return !s.cancelled&&slot.current===s&&currentActor.current===s.actor;}
 async function refresh(){const a=actor;if(!a){setDrafts([]);return;}const r=await fetch('/api/cora/recovery?actorId='+encodeURIComponent(a));const b=await r.json();if(currentActor.current!==a)return;if(!r.ok)throw new Error(b.error);setDrafts(b.drafts);}
 function checkpoint():Promise<void>{
  if(timer.current){clearTimeout(timer.current);timer.current=null;}
  const value=latest.current;if(!actor||!value.dirty||!value.payload)return Promise.resolve();
  let s=slot.current;if(!s||s.actor!==actor||s.key!==key||s.cancelled)s=fresh();const target=s,encoded=JSON.stringify(value.payload);
  if(target.encoded===encoded)return target.queue;
  setStatus('초안 보관 중…');setProblem('');
  // Each slot serializes its writes; an old tab cannot overwrite a newer CAS version.
  const task=target.queue.then(async()=>{
   if(!active(target)||target.encoded===encoded)return;
   const b=await request(target.actor,'put',target.id,target.version,value.payload!);
   target.version=b.draft.version;target.encoded=encoded;
   if(active(target)){if(JSON.stringify(latest.current.payload)===encoded){setStatus(`복구용 초안 보관됨 · ${new Date(b.draft.updatedAt).toLocaleTimeString('ko-KR')}`);setProblem('');}else setStatus('미저장 변경 · 최신 내용을 보관하는 중입니다.');await refresh().catch(e=>setProblem('초안은 보관됐지만 목록 갱신에 실패했습니다. '+e.message));}
  });
  target.queue=task.catch(()=>{});
  return task.catch(e=>{if(active(target)){setStatus('초안 보관 실패 · 작업 저장 또는 JSON 백업이 필요합니다.');setProblem(e.message);}throw e;});
 }
 useEffect(()=>{if(slot.current)slot.current.cancelled=true;slot.current=null;consumed.current=null;setStatus('');setProblem('');setDrafts([]);void refresh().catch(e=>setProblem(e.message));return()=>{if(timer.current)clearTimeout(timer.current);if(slot.current)slot.current.cancelled=true;};},[actor]);
 useEffect(()=>{
  if(!actor||!dirty||!payload)return;
  setStatus('미저장 변경 · 곧 복구용 초안을 보관합니다.');
  timer.current=setTimeout(()=>{timer.current=null;void checkpoint().catch(()=>{});},800);
  return()=>{if(timer.current){clearTimeout(timer.current);timer.current=null;}};
 },[actor,key,dirty,JSON.stringify(payload)]);
 async function saved(encodedPayload:string){
  if(timer.current){clearTimeout(timer.current);timer.current=null;}
  const s=slot.current;if(!s||s.actor!==actor)return;
  await s.queue;
  // A user edit made during manual save must remain recoverable.
  if(JSON.stringify(latest.current.payload)!==encodedPayload)return;
  s.cancelled=true;slot.current=null;
  try{if(s.version!==null)await request(s.actor,'clear',s.id,s.version);const prior=consumed.current;consumed.current=null;if(prior?.actor===s.actor&&prior.key===s.key)await request(prior.actor,'clear',prior.id,prior.version);if(currentActor.current===s.actor){setStatus('정식 저장 완료');await refresh();}}
  catch(e){if(currentActor.current===s.actor)setProblem('정식 저장은 완료됐지만 복구함 정리는 실패했습니다. '+(e instanceof Error?e.message:''));}
 }
 async function load(id:string){const a=actor;if(!a)throw new Error('로그인이 필요합니다.');const r=await fetch('/api/cora/recovery?id='+encodeURIComponent(id)+'&actorId='+encodeURIComponent(a));const b=await r.json();if(currentActor.current!==a)throw new Error('로그인 사용자가 바뀌었습니다.');if(!r.ok)throw new Error(b.error);consumed.current={actor:a,id,version:b.draft.version,key:''};return b.draft.payload as RecoveryPayload;}
 async function discard(d:RecoverySummary){if(!actor)return;await request(actor,'clear',d.id,d.version);await refresh();}
 function attach(key:string){if(consumed.current?.actor===actor)consumed.current.key=key;}
 return {attach,status,problem,drafts:drafts.filter(d=>d.id!==slot.current?.id),checkpoint,saved,load,discard,refresh};
}
export function RecoveryPanel({recovery,busy,onRestore}:{recovery:ReturnType<typeof useDraftRecovery>;busy:boolean;onRestore:(id:string,asNew:boolean)=>void}){
 const [error,setError]=useState('');
 return <section className={[styles.panel,styles.recoveryPanel].join(' ')} aria-label="미저장 초안 복구">
  <p role="status">{recovery.status||'복구함 · 서버에 확인된 초안만 복구할 수 있습니다.'}</p>
  <small>입력 후 잠시 뒤 복구용으로 보관합니다. 마지막 보관 표시 전에는 새로고침하지 마세요. 30일간 복구 가능 · 정식 저장·승인과는 별개입니다.</small>
  {(recovery.problem||error)&&<p role="alert">{recovery.problem||error}</p>}
  <div className={styles.actions}><button className={styles.secondary} disabled={busy} onClick={()=>{setError('');void recovery.checkpoint().catch(e=>setError(e.message));}}>지금 초안 보관</button><button className={styles.textButton} disabled={busy} onClick={()=>void recovery.refresh().catch(e=>setError(e.message))}>복구함 새로고침</button></div>
  {recovery.drafts.length>0&&<details><summary>복구 가능한 초안 {recovery.drafts.length}개</summary>{recovery.drafts.map(d=><div key={d.id} className={styles.panel}><b>{d.brand||'브랜드 미입력'} · {d.title}</b><p>{new Date(d.updatedAt).toLocaleString('ko-KR')}</p><div className={styles.actions}><button disabled={busy} className={styles.secondary} onClick={()=>onRestore(d.id,false)}>초안 복구</button>{d.kind==='cards'&&<button disabled={busy} className={styles.secondary} onClick={()=>onRestore(d.id,true)}>새 사본으로 복구</button>}<button disabled={busy} className={styles.textButton} onClick={()=>{if(!window.confirm('이 복구 초안만 버릴까요? 정식 저장본은 유지됩니다.'))return;void recovery.discard(d).catch(e=>setError(e.message));}}>복구 초안 버리기</button></div></div>)}</details>}
 </section>;
}
