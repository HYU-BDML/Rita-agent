import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

export type TeamRole = 'editor' | 'reviewer';
export type MemberStatus = 'invited' | 'active' | 'declined' | 'removed';
type Scope = 'legacy' | 'clients';
type Row = {id:string;owner_id:string;member_id:string;role:TeamRole;brands:string;scope:Scope;version:number;status:MemberStatus;created:string;updated:string;owner_email:string;member_email:string};
export type Member = {id:string;ownerId:string;memberId:string;role:TeamRole;brands:string[];scope:Scope;clientIds:string[];clients:{id:string;name:string}[];version:number;status:MemberStatus;created:string;updated:string;ownerEmail:string;memberEmail:string};
const ROLES:TeamRole[] = ['editor','reviewer'];
export const MAX_MEMBERS = 20;
function cleanBrands(value:unknown):string[] {
  if(value==null)return [];
  if(!Array.isArray(value)||value.length>50)throw new Error('브랜드 목록 형식을 확인해 주세요.');
  return [...new Set(value.map(v=>{if(typeof v!=='string'||!v.trim()||v.length>100)throw new Error('브랜드 이름은 1~100자입니다.');return v.trim();}))];
}
/** Accepted, explicit client grants never inherit legacy name-based access. Empty client scope grants nothing. */
export class TeamStore {
  constructor(private db:DatabaseSync) {
    db.exec(`CREATE TABLE IF NOT EXISTS team_members(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),member_id TEXT NOT NULL REFERENCES users(id),role TEXT NOT NULL CHECK(role IN ('editor','reviewer')),brands TEXT NOT NULL DEFAULT '[]',status TEXT NOT NULL CHECK(status IN ('invited','active','declined','removed')),created TEXT NOT NULL,updated TEXT NOT NULL,UNIQUE(owner_id,member_id));
      CREATE INDEX IF NOT EXISTS team_members_member ON team_members(member_id,status);`);
    const cols=db.prepare('PRAGMA table_info(team_members)').all() as {name:string}[];
    if(!cols.some(c=>c.name==='scope'))db.exec("ALTER TABLE team_members ADD COLUMN scope TEXT NOT NULL DEFAULT 'legacy'");
    if(!cols.some(c=>c.name==='version'))db.exec('ALTER TABLE team_members ADD COLUMN version INTEGER NOT NULL DEFAULT 1');
    db.exec(`CREATE TABLE IF NOT EXISTS team_client_grants(team_id TEXT NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,owner_id TEXT NOT NULL REFERENCES users(id),PRIMARY KEY(team_id,client_id));`);
  }
  private select(where:string){return `SELECT t.*,o.email as owner_email,m.email as member_email FROM team_members t JOIN users o ON o.id=t.owner_id JOIN users m ON m.id=t.member_id WHERE ${where}`;}
  private granted(id:string,ownerId:string){return this.db.prepare("SELECT c.id,json_extract(c.body,'$.name') as name FROM team_client_grants g JOIN clients c ON c.id=g.client_id AND c.user_id=g.owner_id WHERE g.team_id=? AND g.owner_id=? ORDER BY c.id").all(id,ownerId) as {id:string;name:string}[];}
  private map(r:Row):Member {
    const clients=this.granted(r.id,r.owner_id);
    return {id:r.id,ownerId:r.owner_id,memberId:r.member_id,role:r.role,brands:JSON.parse(r.brands),scope:r.scope,clientIds:clients.map(c=>c.id),clients,version:Number(r.version),status:r.status,created:r.created,updated:r.updated,ownerEmail:r.owner_email,memberEmail:r.member_email};
  }
  private byId(id:string){const row=this.db.prepare(this.select('t.id=?')).get(id) as Row|undefined;return row?this.map(row):null;}
  private atomic<T>(fn:()=>T):T {this.db.exec('BEGIN IMMEDIATE');try{const result=fn();this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  private clientIds(ownerId:string,value:unknown):string[] {
    if(!Array.isArray(value)||value.length>50)throw new Error('허용할 고객사를 목록으로 선택해 주세요.');
    const ids=[...new Set(value.map(v=>{if(typeof v!=='string'||!/^[\da-f-]{36}$/i.test(v))throw new Error('고객사 ID를 확인해 주세요.');return v;}))];
    for(const id of ids)if(!this.db.prepare('SELECT id FROM clients WHERE id=? AND user_id=?').get(id,ownerId))throw new Error('NOT_FOUND');
    return ids;
  }
  private setGrants(id:string,ownerId:string,ids:string[]) {
    this.db.prepare('DELETE FROM team_client_grants WHERE team_id=?').run(id);
    for(const clientId of ids)this.db.prepare('INSERT INTO team_client_grants VALUES (?,?,?)').run(id,clientId,ownerId);
  }
  overview(userId:string) {
    const members=(this.db.prepare(this.select("t.owner_id=? AND t.status!='removed' ORDER BY t.created")).all(userId) as Row[]).map(r=>this.map(r));
    const memberships=(this.db.prepare(this.select("t.member_id=? AND t.status IN ('invited','active') ORDER BY t.created")).all(userId) as Row[]).map(r=>this.map(r));
    return {members,memberships};
  }
  invite(ownerId:string,email:string,role:string,brands?:unknown,clientIds?:unknown) {
    if(typeof email!=='string'||email.length>254)throw new Error('초대할 이메일을 확인해 주세요.');
    if(!ROLES.includes(role as TeamRole))throw new Error('역할은 편집자 또는 검토자입니다.');
    const list=cleanBrands(brands),now=new Date().toISOString();
    return this.atomic(()=>{
      const scope:Scope=clientIds===undefined?'legacy':'clients';
      const ids=scope==='clients'?this.clientIds(ownerId,clientIds):[];
      const target=this.db.prepare('SELECT id FROM users WHERE email=?').get(email.trim().toLowerCase()) as {id:string}|undefined;
      if(!target||target.id===ownerId)throw new Error('이미 Cora에 가입한 다른 사람의 이메일이 필요합니다.');
      const prior=this.db.prepare('SELECT id,status,scope FROM team_members WHERE owner_id=? AND member_id=?').get(ownerId,target.id) as {id:string;status:MemberStatus;scope:Scope}|undefined;
      // Client grants must use versioned update, never an unversioned repeat invitation.
      if(prior&&(scope==='clients'||prior.scope==='clients')&&['active','invited'].includes(prior.status))throw new Error('CONFLICT');
      if(prior?.scope==='clients'&&clientIds===undefined)throw new Error('허용할 고객사를 명시해 주세요.');
      if(!prior||!['active','invited'].includes(prior.status)){
        const n=Number((this.db.prepare("SELECT COUNT(*) as n FROM team_members WHERE owner_id=? AND status IN ('invited','active')").get(ownerId) as {n:number}).n);
        if(n>=MAX_MEMBERS)throw new Error(`한 워크스페이스의 팀원은 ${MAX_MEMBERS}명까지입니다.`);
      }
      const id=prior?.id??randomUUID();
      if(prior)this.db.prepare('UPDATE team_members SET role=?,brands=?,scope=?,version=version+1,status=?,updated=? WHERE id=?').run(role,JSON.stringify(list),scope,prior.status==='active'?'active':'invited',now,id);
      else this.db.prepare("INSERT INTO team_members(id,owner_id,member_id,role,brands,scope,status,created,updated) VALUES(?,?,?,?,?,?,'invited',?,?)").run(id,ownerId,target.id,role,JSON.stringify(list),scope,now,now);
      this.setGrants(id,ownerId,ids);return this.byId(id)!;
    });
  }
  private mutable(userId:string,id:string,side:'owner_id'|'member_id'|'either',version?:number,statuses:MemberStatus[]=['invited','active']) {
    const m=this.byId(id);
    if(!m||!statuses.includes(m.status)||(side==='owner_id'?m.ownerId!==userId:side==='member_id'?m.memberId!==userId:m.ownerId!==userId&&m.memberId!==userId))throw new Error('NOT_FOUND');
    if(m.scope==='clients'&&version===undefined)throw new Error('현재 팀 권한 버전이 필요합니다.');
    if(version!==undefined&&version!==m.version)throw new Error('CONFLICT');
    return m;
  }
  respond(memberId:string,id:string,accept:boolean,version?:number) {
    return this.atomic(()=>{this.mutable(memberId,id,'member_id',version,['invited']);this.db.prepare('UPDATE team_members SET status=?,version=version+1,updated=? WHERE id=?').run(accept?'active':'declined',new Date().toISOString(),id);return this.byId(id)!;});
  }
  update(ownerId:string,id:string,role:string,brands?:unknown,clientIds?:unknown,version?:number) {
    if(!ROLES.includes(role as TeamRole))throw new Error('역할은 편집자 또는 검토자입니다.');
    return this.atomic(()=>{
      const prior=this.mutable(ownerId,id,'owner_id',version),list=cleanBrands(brands);
      // An old caller cannot downgrade explicit grants to implicit legacy access.
      if(prior.scope==='clients'&&clientIds===undefined)throw new Error('허용할 고객사를 명시해 주세요.');
      const scope:Scope=clientIds===undefined?'legacy':'clients',ids=scope==='clients'?this.clientIds(ownerId,clientIds):[];
      this.db.prepare('UPDATE team_members SET role=?,brands=?,scope=?,version=version+1,updated=? WHERE id=?').run(role,JSON.stringify(list),scope,new Date().toISOString(),id);
      this.setGrants(id,ownerId,ids);return this.byId(id)!;
    });
  }
  remove(userId:string,id:string,version?:number) {
    return this.atomic(()=>{this.mutable(userId,id,'either',version,['invited','active','declined']);this.db.prepare("UPDATE team_members SET status='removed',version=version+1,updated=? WHERE id=?").run(new Date().toISOString(),id);return true;});
  }
  editorGrants(memberId:string) {
    return (this.db.prepare(this.select("t.member_id=? AND t.status='active' AND t.role='editor'")).all(memberId) as Row[]).map(r=>({ownerId:r.owner_id,brands:JSON.parse(r.brands) as string[],scope:r.scope,clientIds:this.granted(r.id,r.owner_id).map(c=>c.id)}));
  }
  canEdit(memberId:string,ownerId:string,brand:string){const g=this.editorGrants(memberId).find(x=>x.ownerId===ownerId);return !!g&&g.scope==='legacy'&&(g.brands.length===0||g.brands.includes(brand));}
  private clientGrant(memberId:string,ownerId:string,clientId:string,editor:boolean) {
    return !!this.db.prepare(`SELECT t.id FROM team_members t JOIN team_client_grants g ON g.team_id=t.id AND g.owner_id=t.owner_id JOIN clients c ON c.id=g.client_id AND c.user_id=t.owner_id WHERE t.member_id=? AND t.owner_id=? AND t.status='active' AND t.scope='clients' AND g.client_id=? ${editor?"AND t.role='editor'":''}`).get(memberId,ownerId,clientId);
  }
  canEditClient(memberId:string,ownerId:string,clientId:string){return this.clientGrant(memberId,ownerId,clientId,true);}
  canReviewClient(memberId:string,ownerId:string,clientId:string){return this.clientGrant(memberId,ownerId,clientId,false);}
  reviewerSuggestions(ownerId:string,clientId?:string) {
    return (this.db.prepare("SELECT t.member_id,m.email FROM team_members t JOIN users m ON m.id=t.member_id WHERE t.owner_id=? AND t.status='active' ORDER BY t.role DESC,m.email").all(ownerId) as {member_id:string;email:string}[]).filter(r=>!clientId||this.canReviewClient(r.member_id,ownerId,clientId)).map(r=>r.email);
  }
}
