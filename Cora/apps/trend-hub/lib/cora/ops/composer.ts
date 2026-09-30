import{randomUUID}from'node:crypto';
import type{CoraStore}from'../store';
import{OpsError,asOpsError}from'./errors';
import{seoulLocalToUtc,toSeoulLocal}from'./time';
import{opsTables}from'./tables';

export type PlanInput={reviewId:unknown;accountLabel:unknown;localDateTime:unknown;note?:unknown;scheduleJob?:unknown};
type PlanRow={id:string;draft_id:string;calendar_id:string;queue_id:string|null;job_id:string|null;note:string;created:string};
const MAX_AHEAD_MS=731*86400_000;

/**
 * F068: approved review + channel label + Seoul time -> publication draft, calendar item and (optionally)
 * a scheduler publication_tick job for the local simulation queue. Nothing is ever sent to an SNS.
 * Every step is idempotent, so repeating the same request returns the same plan (duplicate: true).
 */
export function createScheduledPlan(s:CoraStore,userId:string,input:PlanInput,now=Date.now()){
 try{
  if(typeof input.reviewId!=='string'||!input.reviewId||input.reviewId.length>80)throw new OpsError('승인된 검토를 선택해 주세요.');
  if(typeof input.accountLabel!=='string'||!input.accountLabel.trim()||input.accountLabel.length>100)throw new OpsError('게시 대상 채널 이름을 1~100자로 적어 주세요.');
  const note=input.note==null?'':input.note;if(typeof note!=='string'||note.length>500)throw new OpsError('메모는 500자 이내여야 합니다.');
  if(input.scheduleJob!=null&&typeof input.scheduleJob!=='boolean')throw new OpsError('예약 작업 선택 값이 올바르지 않습니다.');
  const when=seoulLocalToUtc(input.localDateTime),whenMs=Date.parse(when);
  if(whenMs<=now)throw new OpsError('예약 시각은 현재보다 미래여야 합니다.');
  if(whenMs>now+MAX_AHEAD_MS)throw new OpsError('예약 시각은 2년 이내여야 합니다.');
  const review=s.review(userId,input.reviewId);if(!review||review.owner_id!==userId)throw new OpsError('검토 요청을 찾을 수 없습니다.',404);
  const T=opsTables(s),db=T.db,label=input.accountLabel.trim();
  const same=db.prepare('SELECT id,status FROM publication_drafts WHERE user_id=? AND review_id=? AND account_label=? AND scheduled_at=?').get(userId,review.id,label.toLowerCase(),when) as {id:string;status:string}|undefined;
  if(same?.status==='cancelled')throw new OpsError('같은 시각의 취소한 예약이 있습니다. 다른 시각으로 만들어 주세요.',409);
  const pub=s.preparePublication(userId,review.id,label,when);
  let plan=db.prepare('SELECT * FROM ops_plans WHERE draft_id=? AND user_id=?').get(pub.id,userId) as PlanRow|undefined;let duplicate=!!plan;
  if(!plan){
   db.exec('BEGIN IMMEDIATE');
   try{
    plan=db.prepare('SELECT * FROM ops_plans WHERE draft_id=?').get(pub.id) as PlanRow|undefined;duplicate=!!plan;
    if(!plan){
     const cal=s.addItem(userId,'calendar',`${pub.brand} · ${pub.title}`.slice(0,200),{scheduledAt:when,scheduledLocal:toSeoulLocal(whenMs),timezone:'Asia/Seoul',platform:'게시 준비(모의)',caption:pub.caption,accountLabel:label,status:'planned',publicationId:pub.id,reviewId:review.id,note,source:'ops-composer'});
     const id=randomUUID();db.prepare('INSERT INTO ops_plans(id,user_id,draft_id,calendar_id,note,created) VALUES(?,?,?,?,?,?)').run(id,userId,pub.id,cal.id,note,new Date().toISOString());
     plan=db.prepare('SELECT * FROM ops_plans WHERE id=?').get(id) as PlanRow;
    }
    db.exec('COMMIT');
   }catch(e){db.exec('ROLLBACK');throw e;}
  }
  if(input.scheduleJob===true&&!plan.job_id){
   const queueId=s.publicationQueue.enqueue(userId,pub.id);
   const job=s.scheduler.schedule(userId,{kind:'publication_tick',refId:queueId,runAt:whenMs,intervalMs:10000});
   db.prepare('UPDATE ops_plans SET queue_id=?,job_id=? WHERE id=?').run(queueId,job.id,plan.id);
   plan={...plan,queue_id:queueId,job_id:job.id};
  }
  return{duplicate,plan:{id:plan.id,draftId:plan.draft_id,calendarId:plan.calendar_id,queueId:plan.queue_id,jobId:plan.job_id,scheduledAt:when,scheduledLocal:toSeoulLocal(whenMs),timezone:'Asia/Seoul',accountLabel:pub.accountLabel,note:plan.note},publication:pub,simulationOnly:true as const};
 }catch(e){throw asOpsError(e);}
}
export function listPlans(s:CoraStore,userId:string){
 return(opsTables(s).db.prepare('SELECT * FROM ops_plans WHERE user_id=? ORDER BY created DESC LIMIT 100').all(userId) as PlanRow[]).map(p=>({id:p.id,draftId:p.draft_id,calendarId:p.calendar_id,queueId:p.queue_id,jobId:p.job_id,note:p.note,createdAt:p.created}));
}
