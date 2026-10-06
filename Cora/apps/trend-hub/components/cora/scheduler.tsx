'use client';
import{useState,useEffect,useCallback}from'react';import s from'./workbench.module.css';
export type ScheduledJob={id:string;kind:'publication_tick'|'recipe_run';refId:string;runAt:number;intervalMs:number|null;state:string;attempts:number;maxAttempts:number;aiAllowed:boolean;lastRun:number|null;lastOutcome:string|null};
type Run={started:number;finished:number|null;outcome:string;detail:string};
const stateLabel:Record<string,string>={active:'예약 중',paused:'일시정지',done:'종료',failed:'실패 후 중단',cancelled:'취소됨'};
const outcomeLabel:Record<string,string>={ok:'실행 성공',completed:'작업 종료',skipped:'건너뜀',failed:'실패',lease_expired:'응답 없이 종료'};
const kindLabel={publication_tick:'모의 게시 자동 진행',recipe_run:'레시피 반복 실행'};
export async function schedulerApi(data?:Record<string,unknown>,id?:string){const r=await fetch('/api/cora/scheduler'+(id?`?id=${encodeURIComponent(id)}`:''),{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json'}:undefined,body:data?JSON.stringify(data):undefined});const v=await r.json();if(!r.ok)throw new Error(v.error);return v;}
export function fmtInterval(ms:number|null){if(ms==null)return'1회';if(ms%86400000===0)return`${ms/86400000}일마다`;if(ms%3600000===0)return`${ms/3600000}시간마다`;if(ms%60000===0)return`${ms/60000}분마다`;return`${ms/1000}초마다`;}
/** Shared list of durable background jobs for one kind. Refreshes on demand; `onChange` lets the parent refresh its own data after a run. */
export function ScheduledJobs({kind,names,onChange}:{kind:ScheduledJob['kind'];names?:Record<string,string>;onChange?:()=>Promise<void>|void}){
 const[jobs,setJobs]=useState<ScheduledJob[]>([]),[background,setBackground]=useState(false),[aiAutomation,setAiAutomation]=useState(false),[runs,setRuns]=useState<Record<string,Run[]>>({}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const refresh=useCallback(async()=>{const v=await schedulerApi();setJobs(v.jobs.filter((j:ScheduledJob)=>j.kind===kind));setBackground(v.background);setAiAutomation(v.aiAutomation);},[kind]);
 useEffect(()=>{void refresh().catch(e=>setError(e.message));},[refresh]);
 async function run(f:()=>Promise<void>){if(busy)return;setBusy(true);setError('');setNotice('');try{await f();await refresh();await onChange?.();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const act=(action:string,id:string,extra:Record<string,unknown>={})=>run(async()=>{await schedulerApi({action,id,...extra});});
 return <section className={s.panel} aria-label={`${kindLabel[kind]} 예약 목록`}><h2>{kindLabel[kind]} 예약</h2><p>{background?'서버 백그라운드 실행이 켜져 있어 예약 시각에 자동으로 진행합니다.':'서버 백그라운드 실행(CORA_SCHEDULER=1)이 꺼져 있습니다. 아래 지금 실행 버튼으로만 진행합니다.'}{kind==='recipe_run'&&(aiAutomation?' 유료 AI 자동 호출은 서버에서 허용됐고, 예약별 허용도 필요합니다.':' 유료 AI 자동 호출은 서버(CORA_SCHEDULER_AI)에서 꺼져 있어 예약이 돌아도 건너뜁니다.')}</p>
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  <div className={s.actions}><button disabled={busy} onClick={()=>run(async()=>{const v=await schedulerApi({action:'run-now'});setNotice(v.results.length?`예약 ${v.results.length}건을 지금 실행했습니다.`:'지금 실행할 예약이 없습니다.');})}>실행 시각이 된 예약 지금 실행</button><button disabled={busy} onClick={()=>run(async()=>{})}>예약 새로고침</button></div>
  {jobs.map(j=><article className={s.row} key={j.id}><small>{stateLabel[j.state]||j.state} · {fmtInterval(j.intervalMs)} · 시도 {j.attempts}/{j.maxAttempts}{kind==='recipe_run'&&(j.aiAllowed?' · AI 허용':' · AI 미허용')}</small><h3>{names?.[j.refId]||j.refId}</h3><p>다음 실행 {new Date(j.runAt).toLocaleString('ko-KR')}{j.lastRun?` · 마지막 ${new Date(j.lastRun).toLocaleString('ko-KR')} ${outcomeLabel[j.lastOutcome||'']||j.lastOutcome||''}`:''}</p>
   <div className={s.actions}>{j.state==='active'&&<button disabled={busy} onClick={()=>act('pause',j.id)}>일시정지</button>}{(j.state==='paused'||j.state==='failed')&&<button disabled={busy} onClick={()=>act('resume',j.id)}>다시 시작</button>}{['active','paused','failed'].includes(j.state)&&<button disabled={busy} className={s.danger} onClick={()=>act('cancel',j.id)}>예약 취소</button>}{kind==='recipe_run'&&['active','paused'].includes(j.state)&&<button disabled={busy} onClick={()=>act('ai',j.id,{allowed:!j.aiAllowed})}>{j.aiAllowed?'AI 자동 호출 끄기':'AI 자동 호출 허용'}</button>}<button disabled={busy} onClick={()=>run(async()=>{const v=await schedulerApi(undefined,j.id);setRuns(r=>({...r,[j.id]:v.runs}));})}>실행 기록</button></div>
   {runs[j.id]&&<ul>{runs[j.id].length?runs[j.id].map((r,i)=><li key={i}>{new Date(r.started).toLocaleString('ko-KR')} · {outcomeLabel[r.outcome]||r.outcome}{r.detail?` · ${r.detail}`:''}</li>):<li>아직 실행 기록이 없습니다.</li>}</ul>}
  </article>)}{!jobs.length&&<p>등록한 예약이 없습니다.</p>}
 </section>;
}
