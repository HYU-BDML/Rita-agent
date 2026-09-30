import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

/**
 * Durable background job scheduler on the same SQLite file as the rest of Cora.
 * Jobs survive process restarts, are claimed with short leases so two workers never run
 * the same job at once, back off on failure and stop after a bounded number of attempts.
 * Paid AI work (recipe_run) is opt-in per job AND per process (CORA_SCHEDULER_AI=1); the
 * default run records a 'skipped' outcome instead of calling the gateway.
 */
export type JobKind='publication_tick'|'recipe_run';
export type JobState='active'|'paused'|'done'|'failed'|'cancelled';
export type Outcome='ok'|'failed'|'skipped'|'lease_expired'|'completed';
export type JobRow={id:string;user_id:string;kind:JobKind;ref_id:string;run_at:number;interval_ms:number|null;state:JobState;token:string|null;lease_until:number;attempts:number;max_attempts:number;ai_allowed:number;payload:string;last_run:number|null;last_outcome:string|null;created:number;updated:number};
export type Claim={id:string;userId:string;kind:JobKind;refId:string;token:string;aiAllowed:boolean;payload:Record<string,unknown>;attempts:number};
/** Handler returns 'ok' to keep a recurring job going, 'completed' to finish it, 'skipped' to wait for the next slot, 'failed' (or a throw) to count an attempt. */
export type HandlerOutcome='ok'|'completed'|'skipped'|'failed';
export type Handler=(claim:Claim,now:number)=>Promise<HandlerOutcome|{outcome:HandlerOutcome;detail?:string}>;
export const LEASE_MS=60000, MIN_INTERVAL_MS=10000, MAX_INTERVAL_MS=31*86400000, DEFAULT_MAX_ATTEMPTS=3;
const KINDS:JobKind[]=['publication_tick','recipe_run'];
const safeDetail=(v:unknown)=>String(v??'').replace(/[\r\n]+/g,' ').slice(0,300);

export class JobScheduler {
  constructor(private db:DatabaseSync){db.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_jobs(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL CHECK(kind IN ('publication_tick','recipe_run')),ref_id TEXT NOT NULL,run_at INTEGER NOT NULL,interval_ms INTEGER,state TEXT NOT NULL,token TEXT,lease_until INTEGER NOT NULL DEFAULT 0,attempts INTEGER NOT NULL DEFAULT 0,max_attempts INTEGER NOT NULL DEFAULT 3,ai_allowed INTEGER NOT NULL DEFAULT 0,payload TEXT NOT NULL DEFAULT '{}',last_run INTEGER,last_outcome TEXT,created INTEGER NOT NULL,updated INTEGER NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS scheduled_jobs_active ON scheduled_jobs(user_id,kind,ref_id) WHERE state IN ('active','paused');
    CREATE INDEX IF NOT EXISTS scheduled_jobs_due ON scheduled_jobs(state,run_at);
    CREATE TABLE IF NOT EXISTS scheduled_runs(id INTEGER PRIMARY KEY AUTOINCREMENT,job_id TEXT NOT NULL REFERENCES scheduled_jobs(id) ON DELETE CASCADE,started INTEGER NOT NULL,finished INTEGER,outcome TEXT NOT NULL,detail TEXT NOT NULL DEFAULT '');
  `);}
  private row(user:string,id:string){return this.db.prepare('SELECT * FROM scheduled_jobs WHERE id=? AND user_id=?').get(id,user) as JobRow|undefined;}
  private record(id:string,started:number,finished:number|null,outcome:Outcome,detail=''){this.db.prepare('INSERT INTO scheduled_runs(job_id,started,finished,outcome,detail) VALUES(?,?,?,?,?)').run(id,started,finished,outcome,safeDetail(detail));}

  /** Registers a job; an active job with the same (user, kind, ref) is returned instead of duplicated. */
  schedule(user:string,input:{kind:JobKind;refId:string;runAt?:number;intervalMs?:number|null;aiAllowed?:boolean;payload?:Record<string,unknown>;maxAttempts?:number},now=Date.now()){
    if(!KINDS.includes(input.kind))throw new Error('지원하지 않는 예약 작업 종류입니다.');
    if(typeof input.refId!=='string'||!input.refId||input.refId.length>80)throw new Error('예약 대상 식별자가 필요합니다.');
    const interval=input.intervalMs==null?null:Number(input.intervalMs);
    if(interval!=null&&(!Number.isFinite(interval)||interval<MIN_INTERVAL_MS||interval>MAX_INTERVAL_MS))throw new Error(`반복 간격은 ${MIN_INTERVAL_MS/1000}초 이상 31일 이하여야 합니다.`);
    const runAt=input.runAt==null?now:Number(input.runAt);if(!Number.isFinite(runAt))throw new Error('실행 시각을 확인해 주세요.');
    const payload=JSON.stringify(input.payload??{});if(payload.length>100000)throw new Error('예약 작업 자료가 너무 큽니다.');
    const maxAttempts=Math.min(10,Math.max(1,Math.trunc(input.maxAttempts??DEFAULT_MAX_ATTEMPTS)));
    this.db.exec('BEGIN IMMEDIATE');try{
      if(input.kind==='publication_tick'&&!this.db.prepare('SELECT id FROM publication_queue WHERE id=? AND user_id=?').get(input.refId,user))throw new Error('모의 게시 큐 작업을 찾을 수 없습니다.');
      if(input.kind==='recipe_run'&&!this.db.prepare("SELECT id FROM work_items WHERE id=? AND user_id=? AND kind='automation'").get(input.refId,user))throw new Error('자동화 레시피를 찾을 수 없습니다.');
      const prior=this.db.prepare("SELECT id FROM scheduled_jobs WHERE user_id=? AND kind=? AND ref_id=? AND state IN ('active','paused')").get(user,input.kind,input.refId) as {id:string}|undefined;
      if(prior){this.db.exec('COMMIT');return{id:prior.id,created:false};}
      const id=randomUUID();
      this.db.prepare("INSERT INTO scheduled_jobs(id,user_id,kind,ref_id,run_at,interval_ms,state,max_attempts,ai_allowed,payload,created,updated) VALUES(?,?,?,?,?,?,'active',?,?,?,?,?)").run(id,user,input.kind,input.refId,Math.max(runAt,0),interval,maxAttempts,input.aiAllowed?1:0,payload,now,now);
      this.db.exec('COMMIT');return{id,created:true};
    }catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  list(user:string){return (this.db.prepare('SELECT id,kind,ref_id,run_at,interval_ms,state,attempts,max_attempts,ai_allowed,last_run,last_outcome,created,updated FROM scheduled_jobs WHERE user_id=? ORDER BY created DESC LIMIT 100').all(user) as Omit<JobRow,'token'|'lease_until'|'payload'>[]).map(r=>({id:r.id,kind:r.kind,refId:r.ref_id,runAt:r.run_at,intervalMs:r.interval_ms,state:r.state,attempts:r.attempts,maxAttempts:r.max_attempts,aiAllowed:r.ai_allowed===1,lastRun:r.last_run,lastOutcome:r.last_outcome,created:r.created,updated:r.updated}));}
  runs(user:string,id:string){if(!this.row(user,id))throw new Error('NOT_FOUND');return this.db.prepare('SELECT started,finished,outcome,detail FROM scheduled_runs WHERE job_id=? ORDER BY id DESC LIMIT 50').all(id) as {started:number;finished:number|null;outcome:Outcome;detail:string}[];}
  private transition(user:string,id:string,from:JobState[],to:JobState,now:number,extra=''){const n=this.db.prepare(`UPDATE scheduled_jobs SET state=?,updated=? ${extra} WHERE id=? AND user_id=? AND state IN (${from.map(()=>'?').join(',')})`).run(to,now,id,user,...from).changes;return n>0;}
  pause(user:string,id:string,now=Date.now()){return this.transition(user,id,['active'],'paused',now);}
  resume(user:string,id:string,now=Date.now()){return this.transition(user,id,['paused','failed'],'active',now,`,attempts=0,run_at=MAX(run_at,${Math.trunc(now)})`);}
  cancel(user:string,id:string,now=Date.now()){return this.transition(user,id,['active','paused','failed'],'cancelled',now);}
  /** Only the owner may allow paid AI on a recipe job; the process-wide switch is checked at run time. */
  setAiAllowed(user:string,id:string,allowed:boolean,now=Date.now()){return this.db.prepare("UPDATE scheduled_jobs SET ai_allowed=?,updated=? WHERE id=? AND user_id=? AND kind='recipe_run' AND state IN ('active','paused')").run(allowed?1:0,now,id,user).changes>0;}

  /** Atomically leases due jobs. Expired leases are recorded and counted as a failed attempt before re-claiming. */
  claimDue(now=Date.now(),limit=10,user?:string):Claim[]{
    this.db.exec('BEGIN IMMEDIATE');try{
      const rows=this.db.prepare(`SELECT * FROM scheduled_jobs WHERE state='active' AND run_at<=? AND (token IS NULL OR lease_until<=?) ${user?'AND user_id=?':''} ORDER BY run_at LIMIT ?`).all(...(user?[now,now,user,limit]:[now,now,limit])) as JobRow[];
      const claims:Claim[]=[];
      for(const r of rows){
        let attempts=r.attempts;
        if(r.token){attempts+=1;this.record(r.id,r.lease_until-LEASE_MS,now,'lease_expired','이전 실행이 응답 없이 끝났습니다.');
          if(attempts>=r.max_attempts){this.db.prepare("UPDATE scheduled_jobs SET state='failed',token=NULL,lease_until=0,attempts=?,last_outcome='lease_expired',updated=? WHERE id=?").run(attempts,now,r.id);continue;}}
        const token=randomUUID();
        this.db.prepare('UPDATE scheduled_jobs SET token=?,lease_until=?,attempts=?,updated=? WHERE id=?').run(token,now+LEASE_MS,attempts,now,r.id);
        claims.push({id:r.id,userId:r.user_id,kind:r.kind,refId:r.ref_id,token,aiAllowed:r.ai_allowed===1,payload:JSON.parse(r.payload),attempts});
      }
      this.db.exec('COMMIT');return claims;
    }catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  /** Releases a lease and schedules the next slot. A stale token (lease already expired and re-claimed) is ignored. */
  finish(claim:Claim,result:{outcome:HandlerOutcome;detail?:string},started:number,now=Date.now()){
    this.db.exec('BEGIN IMMEDIATE');try{
      const r=this.db.prepare('SELECT * FROM scheduled_jobs WHERE id=?').get(claim.id) as JobRow|undefined;
      if(!r||r.token!==claim.token){this.db.exec('COMMIT');return false;}
      this.record(r.id,started,now,result.outcome,result.detail);
      let state:JobState=r.state,attempts=r.attempts,runAt=r.run_at;
      if(result.outcome==='failed'){attempts+=1;if(attempts>=r.max_attempts)state='failed';else runAt=now+Math.min(r.interval_ms??3600000,LEASE_MS*2**attempts);}
      else if(result.outcome==='completed'||r.interval_ms==null){state='done';attempts=0;}
      else{attempts=0;const step=r.interval_ms;runAt=r.run_at+step*Math.max(1,Math.ceil((now-r.run_at+1)/step));}
      this.db.prepare('UPDATE scheduled_jobs SET state=?,token=NULL,lease_until=0,attempts=?,run_at=?,last_run=?,last_outcome=?,updated=? WHERE id=?').run(state,attempts,runAt,now,result.outcome,now,r.id);
      this.db.exec('COMMIT');return true;
    }catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  /** One worker pass: claim, run each handler, finish. Handler errors never leak provider details into the run log. */
  async runDue(handlers:Partial<Record<JobKind,Handler>>,opts:{now?:number;user?:string}={}){
    const clock=()=>opts.now??Date.now();const started=clock();
    const claims=this.claimDue(started,10,opts.user);const results:{id:string;outcome:string}[]=[];
    for(const claim of claims){
      const handler=handlers[claim.kind];let outcome:HandlerOutcome='failed',detail='';
      if(!handler)detail='이 작업 종류를 실행할 처리기가 없습니다.';
      else try{const v=await handler(claim,started);if(typeof v==='string'){outcome=v;}else{outcome=v.outcome;detail=v.detail??'';}}catch(e){outcome='failed';detail=e instanceof Error?e.message:'실행 실패';}
      this.finish(claim,{outcome,detail},started,clock());results.push({id:claim.id,outcome});
    }
    return results;
  }
}
