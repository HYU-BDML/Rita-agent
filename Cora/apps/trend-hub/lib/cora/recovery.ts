import {schemaStep} from './schema';
import type {DatabaseSync} from 'node:sqlite';
import {validateRecovery,uuid,type RecoveryPayload,type RecoverySummary} from './recovery-model';
import type {Draft} from './model';

type Row={id:string;user_id:string;body:string;version:number;state:string;created:string;updated:string};
const RETENTION=30*86400000,MAX_ACTIVE=30,MAX_USER_BYTES=30_000_000;
/** Re-evaluated for reads, writes AND account export. Revoked grants never expose cached content. */
export function recoveryAllowed(db:DatabaseSync,userId:string,p:RecoveryPayload):boolean {
 const draft=p.kind==='cards'?p.draft:null,clientId=draft?.clientId??(p.kind==='brief'?p.clientId:undefined);
 const editor=(owner:string,client:string)=>!!db.prepare("SELECT t.id FROM team_members t JOIN team_client_grants g ON g.team_id=t.id AND g.owner_id=t.owner_id WHERE t.member_id=? AND t.owner_id=? AND t.role='editor' AND t.status='active' AND t.scope='clients' AND g.client_id=?").get(userId,owner,client);
 if(clientId){const c=db.prepare('SELECT user_id FROM clients WHERE id=?').get(clientId) as {user_id:string}|undefined;if(!c||(c.user_id!==userId&&!editor(c.user_id,clientId)))return false;}
 if(p.kind==='cards'&&p.source){
  const r=db.prepare('SELECT user_id,body FROM projects WHERE id=?').get(p.source.projectId) as {user_id:string;body:string}|undefined;if(!r)return false;
  const saved=JSON.parse(r.body) as Draft;
  if(r.user_id!==userId){
   if(saved.clientId!==draft!.clientId)return false;
   if(saved.clientId){if(!editor(r.user_id,saved.clientId))return false;}
   else {const t=db.prepare("SELECT brands FROM team_members WHERE owner_id=? AND member_id=? AND role='editor' AND status='active' AND scope='legacy'").get(r.user_id,userId) as {brands:string}|undefined;if(!t)return false;const brands=JSON.parse(t.brands) as string[];if(brands.length&&(!brands.includes(saved.brief.brand)||!brands.includes(draft!.brief.brand)))return false;}
  }
 }
 return true;
}
export class DraftRecovery {
 constructor(private db:DatabaseSync,private now=()=>Date.now()){
    schemaStep(db,'draft-recovery-v1',()=>{
  db.exec(`CREATE TABLE IF NOT EXISTS recovery_drafts(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,body TEXT NOT NULL,version INTEGER NOT NULL,state TEXT NOT NULL CHECK(state IN ('active','cleared')),created TEXT NOT NULL,updated TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS recovery_user ON recovery_drafts(user_id,state,updated);`);
    });
 }
 private atomic<T>(fn:()=>T):T{this.db.exec('BEGIN IMMEDIATE');try{const v=fn();this.db.exec('COMMIT');return v;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 private row(user:string,id:string){return this.db.prepare('SELECT * FROM recovery_drafts WHERE id=? AND user_id=?').get(id,user) as Row|undefined;}
 private active(r:Row|undefined,user:string):r is Row{return !!r&&r.state==='active'&&Date.parse(r.updated)>=this.now()-RETENTION&&recoveryAllowed(this.db,user,JSON.parse(r.body));}
 private summary(r:Row):RecoverySummary{const p=JSON.parse(r.body) as RecoveryPayload;return {id:r.id,version:Number(r.version),kind:p.kind,title:p.kind==='cards'?p.draft.idea:'제작 자료',brand:p.kind==='cards'?p.draft.brief.brand:p.brief.brand,updatedAt:r.updated};}
 list(user:string){return (this.db.prepare("SELECT * FROM recovery_drafts WHERE user_id=? AND state='active' ORDER BY updated DESC").all(user) as Row[]).filter(r=>this.active(r,user)).map(r=>this.summary(r));}
 get(user:string,id:string){const r=this.row(user,id);if(!this.active(r,user))throw new Error('NOT_FOUND');return {...this.summary(r),payload:JSON.parse(r.body) as RecoveryPayload};}
 put(user:string,id:string,version:number|null,value:unknown){
  if(!uuid(id)||(version!==null&&(!Number.isSafeInteger(version)||version<1)))throw new Error('초안 ID와 버전을 확인해 주세요.');
  const payload=validateRecovery(value),body=JSON.stringify(payload);if(Buffer.byteLength(body)>2_900_000)throw new Error('복구 초안은 2.9MB 이하로 보관할 수 있습니다. JSON 백업을 내려받아 주세요.');
  return this.atomic(()=>{
   if(!recoveryAllowed(this.db,user,payload))throw new Error('NOT_FOUND');
   const r=this.row(user,id);
   if(r){if(!this.active(r,user))throw new Error('NOT_FOUND');if(r.version!==version)throw new Error('CONFLICT');}
   else if(version!==null)throw new Error('CONFLICT');
   // Expired entries become small tombstones. Never reuse an ID after discard/save.
   this.db.prepare("UPDATE recovery_drafts SET state='cleared',body='{}',version=version+1 WHERE user_id=? AND state='active' AND updated<?").run(user,new Date(this.now()-RETENTION).toISOString());
   const usage=this.db.prepare("SELECT COUNT(*) AS n,COALESCE(SUM(length(CAST(body AS BLOB))),0) AS bytes FROM recovery_drafts WHERE user_id=? AND state='active'").get(user) as {n:number;bytes:number};
   if((!r&&usage.n>=MAX_ACTIVE)||usage.bytes-(r?Buffer.byteLength(r.body):0)+Buffer.byteLength(body)>MAX_USER_BYTES)throw new Error('복구함이 가득 찼습니다. 불필요한 초안을 버린 뒤 다시 보관해 주세요.');
   const time=new Date(this.now()).toISOString();
   if(r)this.db.prepare('UPDATE recovery_drafts SET body=?,version=version+1,updated=? WHERE id=? AND user_id=?').run(body,time,id,user);
   else this.db.prepare("INSERT INTO recovery_drafts VALUES(?,?,?,1,'active',?,?)").run(id,user,body,time,time);
   return this.get(user,id);
  });
 }
 /** Keeps a tombstone so a delayed autosave cannot resurrect a discarded draft. */
 clear(user:string,id:string,version:number){
  if(!uuid(id)||!Number.isSafeInteger(version)||version<1)throw new Error('현재 복구 버전이 필요합니다.');
  return this.atomic(()=>{const r=this.row(user,id);if(!this.active(r,user))throw new Error('NOT_FOUND');if(r.version!==version)throw new Error('CONFLICT');this.db.prepare("UPDATE recovery_drafts SET state='cleared',body='{}',version=version+1,updated=? WHERE id=? AND user_id=?").run(new Date(this.now()).toISOString(),id,user);return true;});
 }
}
