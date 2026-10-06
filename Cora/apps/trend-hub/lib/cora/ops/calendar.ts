import type{CoraStore}from'../store';
import{opsTables}from'./tables';
import{calendarMs,monthBounds,seoulDate,shiftMonth}from'./time';

export type Entry={key:string;type:'publication'|'calendar'|'job'|'thread';date:string;at:string;title:string;status:string;statusLabel:string;accountLabel?:string;note?:string;
 calendar?:{id:string;status:string};publication?:{id:string;status:string;effectiveStatus:string;version:number};simulation?:{id:string;state:string};job?:{id:string;state:string;lastOutcome:string|null;runAt:number};thread?:{id:string;posts:number}};
const SIM:Record<string,string>={queued:'모의 실행 대기',submitting:'모의 접수 중',submitted:'모의 접수됨',scheduled:'모의 예약됨',published:'모의 완료(실제 게시 아님)',failed:'모의 실패',unknown:'결과 불명',blocked:'승인 변경으로 중단',cancelled:'취소됨'};
const PUB:Record<string,string>={awaiting_connection:'게시 준비(연결 전)',needs_review:'재검토 필요',cancelled:'취소됨'};
const JOB:Record<string,string>={active:'자동 진행 예약됨',paused:'자동 진행 일시정지',done:'자동 진행 완료',failed:'자동 진행 실패',cancelled:'자동 진행 취소'};
type PubRow={id:string;version:number;account_label:string;scheduled_at:string;status:string;cur:number;rs:string;title:string;brand:string};
type JobRow={id:string;kind:string;ref_id:string;run_at:number;state:string;last_outcome:string|null;draft_id:string|null;qstate:string|null;qid:string|null};

/** F067: month grid (Asia/Seoul days) merging calendar items, publication drafts, simulation queue state and scheduler jobs. */
export function monthCalendar(s:CoraStore,userId:string,month:string){
 const b=monthBounds(month),db=opsTables(s).db;
 const startIso=new Date(b.startMs).toISOString(),endIso=new Date(b.endMs).toISOString();
 const pubs=db.prepare(`SELECT d.id,d.version,d.account_label,d.scheduled_at,d.status,p.version as cur,r.status as rs,json_extract(d.snapshot,'$.idea') as title,json_extract(d.snapshot,'$.brief.brand') as brand FROM publication_drafts d JOIN projects p ON p.id=d.project_id JOIN reviews r ON r.id=d.review_id WHERE d.user_id=? AND d.scheduled_at>=? AND d.scheduled_at<? ORDER BY d.scheduled_at`).all(userId,startIso,endIso) as PubRow[];
 const unscheduled=Number((db.prepare("SELECT COUNT(*) n FROM publication_drafts WHERE user_id=? AND scheduled_at=''").get(userId) as {n:number}).n);
 const jobs=db.prepare(`SELECT j.id,j.kind,j.ref_id,j.run_at,j.state,j.last_outcome,q.draft_id,q.state as qstate,q.id as qid FROM scheduled_jobs j LEFT JOIN publication_queue q ON j.kind='publication_tick' AND q.id=j.ref_id AND q.user_id=j.user_id WHERE j.user_id=?`).all(userId) as JobRow[];
 const queues=db.prepare('SELECT id,draft_id,state FROM publication_queue WHERE user_id=? AND draft_id IS NOT NULL').all(userId) as {id:string;draft_id:string;state:string}[];
 const queueByDraft=new Map(queues.map(q=>[q.draft_id,q]));const jobByDraft=new Map<string,JobRow>();for(const j of jobs)if(j.kind==='publication_tick'&&j.draft_id){const p=jobByDraft.get(j.draft_id);if(!p||p.state!=='active')jobByDraft.set(j.draft_id,j);}
 const items=s.items(userId).filter(i=>i.kind==='calendar');const calByPub=new Map<string,typeof items[number]>();for(const i of items)if(typeof i.data.publicationId==='string')calByPub.set(i.data.publicationId,i);
 const entries:Entry[]=[];const usedCal=new Set<string>();
 for(const p of pubs){
  const eff=p.status==='cancelled'?'cancelled':p.version!==p.cur||p.rs!=='approved'?'needs_review':p.status;
  const q=queueByDraft.get(p.id),j=jobByDraft.get(p.id),cal=calByPub.get(p.id);if(cal)usedCal.add(cal.id);
  const label=eff==='cancelled'||eff==='needs_review'?PUB[eff]:q?SIM[q.state]??q.state:j?JOB[j.state]??j.state:PUB[eff]??eff;
  const at=p.scheduled_at;entries.push({key:'pub:'+p.id,type:'publication',date:seoulDate(Date.parse(at)),at,title:`${p.brand} · ${p.title}`,status:eff,statusLabel:label,accountLabel:p.account_label,note:typeof cal?.data.note==='string'?cal.data.note:undefined,
   ...(cal?{calendar:{id:cal.id,status:String(cal.data.status)}}:{}),publication:{id:p.id,status:p.status,effectiveStatus:eff,version:p.version},
   ...(q?{simulation:{id:q.id,state:q.state}}:{}),...(j?{job:{id:j.id,state:j.state,lastOutcome:j.last_outcome,runAt:j.run_at}}:{})});
 }
 let invalidCalendarItems=0;
 for(const i of items){if(usedCal.has(i.id))continue;const ms=calendarMs(i.data.scheduledAt);if(!Number.isFinite(ms)){invalidCalendarItems++;continue;}if(ms<b.startMs||ms>=b.endMs)continue;
  entries.push({key:'cal:'+i.id,type:'calendar',date:seoulDate(ms),at:new Date(ms).toISOString(),title:i.title,status:String(i.data.status??'planned'),statusLabel:'내부 발행 계획',accountLabel:typeof i.data.accountLabel==='string'?i.data.accountLabel:undefined,note:typeof i.data.note==='string'?i.data.note:undefined,calendar:{id:i.id,status:String(i.data.status??'planned')}});}
 const recipeTitles=new Map(s.items(userId).filter(i=>i.kind==='automation').map(i=>[i.id,i.title]));
 for(const j of jobs){if(j.kind!=='recipe_run')continue;if(j.run_at<b.startMs||j.run_at>=b.endMs)continue;
  entries.push({key:'job:'+j.id,type:'job',date:seoulDate(j.run_at),at:new Date(j.run_at).toISOString(),title:`레시피 실행 · ${recipeTitles.get(j.ref_id)??'삭제된 레시피'}`,status:j.state,statusLabel:JOB[j.state]??j.state,job:{id:j.id,state:j.state,lastOutcome:j.last_outcome,runAt:j.run_at}});}
 // Publication jobs that no longer point at a listed draft (draft deleted) are still shown so a running job is never invisible.
 for(const j of jobs){if(j.kind!=='publication_tick'||j.draft_id||j.run_at<b.startMs||j.run_at>=b.endMs)continue;
  entries.push({key:'job:'+j.id,type:'job',date:seoulDate(j.run_at),at:new Date(j.run_at).toISOString(),title:'모의 게시 자동 진행(원본 삭제됨)',status:j.state,statusLabel:JOB[j.state]??j.state,job:{id:j.id,state:j.state,lastOutcome:j.last_outcome,runAt:j.run_at}});}
 const threads=db.prepare('SELECT id,title,attach_date,posts FROM ops_threads WHERE user_id=? AND attach_date>=? AND attach_date<?').all(userId,`${month}-01`,`${shiftMonth(month,1)}-01`) as {id:string;title:string;attach_date:string;posts:string}[];
 for(const t of threads){const n=(JSON.parse(t.posts) as unknown[]).length;entries.push({key:'thread:'+t.id,type:'thread',date:t.attach_date,at:'',title:`연속 게시물 · ${t.title}`,status:'draft',statusLabel:`${n}개 글 내부 초안`,thread:{id:t.id,posts:n}});}
 // Jobs of publication drafts outside this month but running inside it are not shown twice: their draft entry lives in its own month.
 entries.sort((a,c)=>a.date===c.date?a.at.localeCompare(c.at):a.date.localeCompare(c.date));
 const byDate=new Map<string,Entry[]>();for(const e of entries)(byDate.get(e.date)??byDate.set(e.date,[]).get(e.date)!).push(e);
 const cells:{date:string|null;entries:Entry[]}[]=[];for(let i=0;i<b.firstWeekday;i++)cells.push({date:null,entries:[]});
 for(let d=1;d<=b.daysInMonth;d++){const date=`${month}-${String(d).padStart(2,'0')}`;cells.push({date,entries:byDate.get(date)??[]});}
 while(cells.length%7)cells.push({date:null,entries:[]});
 const weeks:typeof cells[]=[];for(let i=0;i<cells.length;i+=7)weeks.push(cells.slice(i,i+7));
 return{month,timezone:'Asia/Seoul',weekStartsOn:'sunday' as const,prevMonth:shiftMonth(month,-1),nextMonth:shiftMonth(month,1),weeks,entryCount:entries.length,unscheduledPublications:unscheduled,invalidCalendarItems,simulationOnly:true as const};
}
