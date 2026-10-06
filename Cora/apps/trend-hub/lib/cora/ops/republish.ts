import{randomUUID}from'node:crypto';
import type{CoraStore}from'../store';
import{OpsError,asOpsError}from'./errors';
import{opsTables}from'./tables';
import{createScheduledPlan}from'./composer';
import{seoulLocalToUtc}from'./time';

type DraftRow={id:string;project_id:string;review_id:string;version:number;account_label:string;scheduled_at:string;snapshot:string;status:string};
const content=(p:Record<string,unknown>)=>JSON.stringify([p.brief,p.slides,p.caption,p.design]);

/**
 * F070: a new publication draft from a completed simulated job. It never reuses or reopens the old job.
 * Refused unless the source review is still approved for the same saved version and the snapshot that
 * was queued, the snapshot that was approved and the current project text are identical.
 */
export function republish(s:CoraStore,userId:string,input:{fromQueueId:unknown;localDateTime:unknown;accountLabel?:unknown;note?:unknown;scheduleJob?:unknown},now=Date.now()){
 try{
  if(typeof input.fromQueueId!=='string'||!input.fromQueueId||input.fromQueueId.length>80)throw new OpsError('다시 게시할 모의 작업을 선택해 주세요.');
  const q=s.publicationQueue.get(userId,input.fromQueueId);if(!q)throw new OpsError('모의 작업을 찾을 수 없습니다.',404);
  if(q.state!=='published')throw new OpsError('모의 게시가 완료된 작업만 다시 게시 예약할 수 있습니다.',409);
  const db=opsTables(s).db;
  const draft=q.draft_id?db.prepare('SELECT * FROM publication_drafts WHERE id=? AND user_id=?').get(q.draft_id,userId) as DraftRow|undefined:undefined;
  if(!draft)throw new OpsError('원본 게시 준비가 삭제되어 다시 게시할 수 없습니다.',409);
  const queued=(db.prepare('SELECT snapshot FROM publication_queue WHERE id=? AND user_id=?').get(q.id,userId) as {snapshot:string}).snapshot;
  const review=s.review(userId,draft.review_id);
  if(!review||review.owner_id!==userId)throw new OpsError('원본 검토를 찾을 수 없어 다시 게시할 수 없습니다.',409);
  if(review.effectiveStatus==='stale')throw new OpsError(`승인 이후 원본이 수정되었습니다(승인 v${review.version}, 현재 v${review.current_version}). 다시 검토를 받은 뒤 예약하세요.`,409);
  if(review.effectiveStatus!=='approved')throw new OpsError('원본 승인이 유효하지 않아 다시 게시할 수 없습니다.',409);
  const approved=content(review.snapshot as unknown as Record<string,unknown>);
  const current=s.get(userId,review.project_id);
  if(!current||content(current as unknown as Record<string,unknown>)!==approved||content(JSON.parse(queued))!==approved||content(JSON.parse(draft.snapshot))!==approved)throw new OpsError('승인한 내용과 달라져 다시 게시할 수 없습니다. 다시 검토를 받으세요.',409);
  const label=typeof input.accountLabel==='string'&&input.accountLabel.trim()?input.accountLabel:draft.account_label;
  if(draft.account_label===label.trim().toLowerCase()&&draft.scheduled_at===seoulLocalToUtc(input.localDateTime))throw new OpsError('원본과 같은 시각입니다. 새 시각을 골라 주세요.',409);
  const plan=createScheduledPlan(s,userId,{reviewId:review.id,accountLabel:label,localDateTime:input.localDateTime,note:input.note,scheduleJob:input.scheduleJob},now);
  if(plan.plan.draftId===draft.id)throw new OpsError('원본과 같은 시각입니다. 새 시각을 골라 주세요.',409);
  db.prepare('INSERT OR IGNORE INTO ops_republish(id,user_id,from_queue_id,from_draft_id,to_draft_id,created) VALUES(?,?,?,?,?,?)').run(randomUUID(),userId,q.id,draft.id,plan.plan.draftId,new Date().toISOString());
  return{...plan,republishedFrom:{queueId:q.id,draftId:draft.id}};
 }catch(e){throw asOpsError(e);}
}
export function republishHistory(s:CoraStore,userId:string){
 return(opsTables(s).db.prepare(`SELECT h.id,h.from_queue_id,h.from_draft_id,h.to_draft_id,h.created,od.scheduled_at as from_at,nd.scheduled_at as to_at,nd.status as to_status,q.state as from_state FROM ops_republish h LEFT JOIN publication_drafts od ON od.id=h.from_draft_id LEFT JOIN publication_drafts nd ON nd.id=h.to_draft_id LEFT JOIN publication_queue q ON q.id=h.from_queue_id WHERE h.user_id=? ORDER BY h.created DESC LIMIT 100`).all(userId) as {id:string;from_queue_id:string;from_draft_id:string|null;to_draft_id:string;created:string;from_at:string|null;to_at:string|null;to_status:string|null;from_state:string|null}[])
  .map(r=>({id:r.id,fromQueueId:r.from_queue_id,fromDraftId:r.from_draft_id,fromScheduledAt:r.from_at,fromState:r.from_state,toDraftId:r.to_draft_id,toScheduledAt:r.to_at,toStatus:r.to_status,createdAt:r.created}));
}
