import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type { PublishObservation } from './blotato';
import type { Project } from '../model';

type State = 'queued'|'submitting'|'submitted'|'scheduled'|'published'|'failed'|'unknown'|'blocked'|'cancelled';
type Row = {id:string;user_id:string;draft_id:string|null;state:State;submission_id:string|null;snapshot:string;token:string|null;lease_until:number;next_poll:number;attempts:number;public_url:string|null;created:number;updated:number};
export interface SimulationProvider {
  submit(snapshot:Project):Promise<PublishObservation>;
  status(id:string):Promise<PublishObservation>;
}
/** Durable local simulation queue. No credentials, media upload or real adapter is wired here. */
export class PublicationQueue {
  constructor(private db:DatabaseSync){db.exec(`
    CREATE TABLE IF NOT EXISTS publication_queue(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),draft_id TEXT UNIQUE REFERENCES publication_drafts(id) ON DELETE SET NULL,mode TEXT NOT NULL CHECK(mode='simulation'),state TEXT NOT NULL,submission_id TEXT,snapshot TEXT NOT NULL,token TEXT,lease_until INTEGER NOT NULL DEFAULT 0,next_poll INTEGER NOT NULL DEFAULT 0,attempts INTEGER NOT NULL DEFAULT 0,public_url TEXT,created INTEGER NOT NULL,updated INTEGER NOT NULL);
    CREATE TRIGGER IF NOT EXISTS redact_deleted_publication_snapshot BEFORE DELETE ON publication_drafts BEGIN UPDATE publication_queue SET snapshot='{}' WHERE draft_id=OLD.id; END;
    CREATE TABLE IF NOT EXISTS publication_events(id INTEGER PRIMARY KEY AUTOINCREMENT,job_id TEXT NOT NULL REFERENCES publication_queue(id),state TEXT NOT NULL,event TEXT NOT NULL,created INTEGER NOT NULL);
  `);}
  private row(user:string,id:string){return this.db.prepare('SELECT * FROM publication_queue WHERE id=? AND user_id=?').get(id,user) as Row|undefined;}
  private event(id:string,state:State,event:string,now:number){this.db.prepare('INSERT INTO publication_events(job_id,state,event,created) VALUES(?,?,?,?)').run(id,state,event,now);}
  private valid(user:string,draft:string|null){if(!draft)return false;return !!this.db.prepare("SELECT d.id FROM publication_drafts d JOIN projects p ON p.id=d.project_id JOIN reviews r ON r.id=d.review_id WHERE d.id=? AND d.user_id=? AND d.status='awaiting_connection' AND d.version=p.version AND r.status='approved'").get(draft,user);}
  list(user:string){return (this.db.prepare('SELECT id,draft_id,state,submission_id,attempts,public_url,created,updated FROM publication_queue WHERE user_id=? ORDER BY created DESC LIMIT 50').all(user) as Pick<Row,'id'|'draft_id'|'state'|'submission_id'|'attempts'|'public_url'|'created'|'updated'>[]).map(r=>({...r,mode:'simulation'}));}
  get(user:string,id:string){const r=this.row(user,id);return r?{id:r.id,draft_id:r.draft_id,state:r.state,submission_id:r.submission_id,attempts:r.attempts,public_url:r.public_url,next_poll:r.next_poll,mode:'simulation' as const}:null;}
  history(user:string,id:string){if(!this.row(user,id))throw new Error('NOT_FOUND');return this.db.prepare('SELECT state,event,created FROM publication_events WHERE job_id=? ORDER BY id').all(id);}
  enqueue(user:string,draft:string,now=Date.now()){
    this.db.exec('BEGIN IMMEDIATE');try{
      if(!this.valid(user,draft))throw new Error('현재 승인된 게시 준비만 모의 실행할 수 있습니다.');
      const prior=this.db.prepare('SELECT id FROM publication_queue WHERE user_id=? AND draft_id=?').get(user,draft) as {id:string}|undefined;
      if(prior){this.db.exec('COMMIT');return prior.id;}
      const source=this.db.prepare('SELECT snapshot FROM publication_drafts WHERE id=?').get(draft) as {snapshot:string};const id=randomUUID();
      this.db.prepare("INSERT INTO publication_queue(id,user_id,draft_id,mode,state,snapshot,created,updated) VALUES(?,?,?,'simulation','queued',?,?,?)").run(id,user,draft,source.snapshot,now,now);this.event(id,'queued','enqueued',now);this.db.exec('COMMIT');return id;
    }catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  cancel(user:string,id:string,now=Date.now()){
    this.db.exec('BEGIN IMMEDIATE');try{const n=this.db.prepare("UPDATE publication_queue SET state='cancelled',updated=? WHERE id=? AND user_id=? AND state='queued'").run(now,id,user).changes;if(n)this.event(id,'cancelled','cancelled_before_submission',now);this.db.exec('COMMIT');return n>0;}catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  private claim(user:string,id:string,now:number){
    this.db.exec('BEGIN IMMEDIATE');try{
      const r=this.row(user,id);if(!r)throw new Error('NOT_FOUND');
      if(r.state==='submitting'&&r.lease_until<=now){this.db.prepare("UPDATE publication_queue SET state='unknown',token=NULL,lease_until=0,updated=? WHERE id=?").run(now,id);this.event(id,'unknown','submission_lease_expired_no_retry',now);this.db.exec('COMMIT');return null;}
      if(r.token&&r.lease_until>now){this.db.exec('COMMIT');return null;}
      const send=r.state==='queued';const poll=['submitted','scheduled','unknown'].includes(r.state)&&!!r.submission_id&&r.next_poll<=now;
      if(!send&&!poll){this.db.exec('COMMIT');return null;}
      if(send&&!this.valid(user,r.draft_id)){this.db.prepare("UPDATE publication_queue SET state='blocked',updated=? WHERE id=?").run(now,id);this.event(id,'blocked','approval_or_source_changed',now);this.db.exec('COMMIT');return null;}
      const token=randomUUID(),state=send?'submitting':r.state;
      this.db.prepare('UPDATE publication_queue SET state=?,token=?,lease_until=?,attempts=attempts+?,updated=? WHERE id=?').run(state,token,now+30000,send?1:0,now,id);this.event(id,state,send?'submission_claimed':'reconciliation_claimed',now);this.db.exec('COMMIT');return{...r,token,send};
    }catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  private finish(user:string,id:string,token:string,observation:PublishObservation,now:number){
    this.db.exec('BEGIN IMMEDIATE');try{
      const r=this.row(user,id);if(!r||r.token!==token){this.db.exec('COMMIT');return;}
      let state:State=observation.state;let sid=observation.submissionId||r.submission_id;
      if(!['submitted','scheduled','published','failed','unknown'].includes(state))state='unknown';
      if(sid&&!/^[A-Za-z0-9_-]{1,128}$/.test(sid)){sid=r.submission_id;state='unknown';}
      if(r.submission_id&&observation.submissionId!==r.submission_id){sid=r.submission_id;state='unknown';}
      if(['submitted','scheduled','published'].includes(state)&&!sid)state='unknown';
      let url:string|null=null;if(state==='published'){try{const u=new URL(observation.publicUrl!);if(u.protocol!=='https:'||u.username||u.password)throw new Error();url=u.href;}catch{state='unknown';}}
      this.db.prepare('UPDATE publication_queue SET state=?,submission_id=?,public_url=?,token=NULL,lease_until=0,next_poll=?,updated=? WHERE id=?').run(state,sid??null,url,now+10000,now,id);this.event(id,state,'provider_observed',now);this.db.exec('COMMIT');
    }catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  async tick(user:string,id:string,provider:SimulationProvider,now=Date.now()){
    const claim=this.claim(user,id,now);if(!claim)return;
    let result:PublishObservation;try{result=claim.send?await provider.submit(JSON.parse(claim.snapshot)):await provider.status(claim.submission_id!);}catch{result={state:'unknown',...(claim.submission_id?{submissionId:claim.submission_id}:{})};}
    this.finish(user,id,claim.token,result,now);
  }
}
/** Deliberately deterministic, network-free provider used by the local UI only. */
export const localSimulation:SimulationProvider={
  async submit(){return{state:'submitted',submissionId:'sim-'+randomUUID()};},
  async status(id){return{state:'published',submissionId:id,publicUrl:'https://example.invalid/cora-simulation/'+id};},
};
