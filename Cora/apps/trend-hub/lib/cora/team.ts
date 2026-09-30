import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

/**
 * Workspace team membership. A workspace is one owner account; members are other local accounts.
 * Invitations need the invitee's acceptance before any access is granted. Editors may open and
 * save the owner's projects (optionally limited to named brands); reviewers only appear as
 * suggested reviewers. Delete, review requests and publication stay owner-only by construction,
 * because those store methods still look projects up by the caller's own user id.
 */
export type TeamRole='editor'|'reviewer';
export type MemberStatus='invited'|'active'|'declined'|'removed';
type Row={id:string;owner_id:string;member_id:string;role:TeamRole;brands:string;status:MemberStatus;created:string;updated:string};
export type Member={id:string;ownerId:string;memberId:string;role:TeamRole;brands:string[];status:MemberStatus;created:string;updated:string;ownerEmail:string;memberEmail:string};
const ROLES:TeamRole[]=['editor','reviewer'];
export const MAX_MEMBERS=20;

function cleanBrands(value:unknown):string[]{
  if(value==null)return[];
  if(!Array.isArray(value)||value.length>50)throw new Error('브랜드 목록 형식을 확인해 주세요.');
  const out=[...new Set(value.map(v=>{if(typeof v!=='string'||!v.trim()||v.length>100)throw new Error('브랜드 이름은 1~100자입니다.');return v.trim();}))];
  return out;
}

export class TeamStore{
  constructor(private db:DatabaseSync){db.exec(`
    CREATE TABLE IF NOT EXISTS team_members(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),member_id TEXT NOT NULL REFERENCES users(id),role TEXT NOT NULL CHECK(role IN ('editor','reviewer')),brands TEXT NOT NULL DEFAULT '[]',status TEXT NOT NULL CHECK(status IN ('invited','active','declined','removed')),created TEXT NOT NULL,updated TEXT NOT NULL,UNIQUE(owner_id,member_id));
    CREATE INDEX IF NOT EXISTS team_members_member ON team_members(member_id,status);
  `);}
  private select(where:string){return `SELECT t.*,o.email as owner_email,m.email as member_email FROM team_members t JOIN users o ON o.id=t.owner_id JOIN users m ON m.id=t.member_id WHERE ${where}`;}
  private map(r:Row&{owner_email:string;member_email:string}):Member{return{id:r.id,ownerId:r.owner_id,memberId:r.member_id,role:r.role,brands:JSON.parse(r.brands),status:r.status,created:r.created,updated:r.updated,ownerEmail:r.owner_email,memberEmail:r.member_email};}
  private byId(id:string){const r=this.db.prepare(this.select('t.id=?')).get(id) as (Row&{owner_email:string;member_email:string})|undefined;return r?this.map(r):null;}

  /** Owner view: members of my workspace (excluding removed). Member view: workspaces I was invited to or belong to. */
  overview(userId:string){
    const members=(this.db.prepare(this.select("t.owner_id=? AND t.status!='removed' ORDER BY t.created")).all(userId) as (Row&{owner_email:string;member_email:string})[]).map(r=>this.map(r));
    const memberships=(this.db.prepare(this.select("t.member_id=? AND t.status IN ('invited','active') ORDER BY t.created")).all(userId) as (Row&{owner_email:string;member_email:string})[]).map(r=>this.map(r));
    return{members,memberships};
  }
  invite(ownerId:string,email:string,role:string,brands?:unknown){
    if(typeof email!=='string'||email.length>254)throw new Error('초대할 이메일을 확인해 주세요.');
    if(!ROLES.includes(role as TeamRole))throw new Error('역할은 편집자 또는 검토자입니다.');
    const list=cleanBrands(brands),now=new Date().toISOString();
    this.db.exec('BEGIN IMMEDIATE');try{
      const target=this.db.prepare('SELECT id FROM users WHERE email=?').get(email.trim().toLowerCase()) as {id:string}|undefined;
      if(!target||target.id===ownerId)throw new Error('이미 Cora에 가입한 다른 사람의 이메일이 필요합니다.');
      const prior=this.db.prepare('SELECT id,status FROM team_members WHERE owner_id=? AND member_id=?').get(ownerId,target.id) as {id:string;status:MemberStatus}|undefined;
      let id:string;
      if(prior){
        id=prior.id;
        // Re-inviting an active member only changes role/brands; declined or removed members must accept again.
        const status=prior.status==='active'?'active':'invited';
        this.db.prepare('UPDATE team_members SET role=?,brands=?,status=?,updated=? WHERE id=?').run(role,JSON.stringify(list),status,now,id);
      }else{
        const n=Number((this.db.prepare("SELECT COUNT(*) as n FROM team_members WHERE owner_id=? AND status IN ('invited','active')").get(ownerId) as {n:number}).n);
        if(n>=MAX_MEMBERS)throw new Error(`한 워크스페이스의 팀원은 ${MAX_MEMBERS}명까지입니다.`);
        id=randomUUID();this.db.prepare("INSERT INTO team_members(id,owner_id,member_id,role,brands,status,created,updated) VALUES(?,?,?,?,?,'invited',?,?)").run(id,ownerId,target.id,role,JSON.stringify(list),now,now);
      }
      this.db.exec('COMMIT');return this.byId(id)!;
    }catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  respond(memberId:string,id:string,accept:boolean){
    const n=this.db.prepare("UPDATE team_members SET status=?,updated=? WHERE id=? AND member_id=? AND status='invited'").run(accept?'active':'declined',new Date().toISOString(),id,memberId).changes;
    if(!n)throw new Error('NOT_FOUND');return this.byId(id)!;
  }
  update(ownerId:string,id:string,role:string,brands?:unknown){
    if(!ROLES.includes(role as TeamRole))throw new Error('역할은 편집자 또는 검토자입니다.');
    const n=this.db.prepare("UPDATE team_members SET role=?,brands=?,updated=? WHERE id=? AND owner_id=? AND status IN ('invited','active')").run(role,JSON.stringify(cleanBrands(brands)),new Date().toISOString(),id,ownerId).changes;
    if(!n)throw new Error('NOT_FOUND');return this.byId(id)!;
  }
  /** Owner removes a member, or a member leaves. Access ends immediately. */
  remove(userId:string,id:string){
    const n=this.db.prepare("UPDATE team_members SET status='removed',updated=? WHERE id=? AND (owner_id=? OR member_id=?) AND status IN ('invited','active')").run(new Date().toISOString(),id,userId,userId).changes;
    if(!n)throw new Error('NOT_FOUND');return true;
  }
  /** Active editor grants of this member, keyed by workspace owner. */
  editorGrants(memberId:string){return (this.db.prepare("SELECT owner_id,brands FROM team_members WHERE member_id=? AND status='active' AND role='editor'").all(memberId) as {owner_id:string;brands:string}[]).map(r=>({ownerId:r.owner_id,brands:JSON.parse(r.brands) as string[]}));}
  canEdit(memberId:string,ownerId:string,brand:string){const g=this.editorGrants(memberId).find(x=>x.ownerId===ownerId);return !!g&&(g.brands.length===0||g.brands.includes(brand));}
  reviewerSuggestions(ownerId:string){return (this.db.prepare("SELECT m.email FROM team_members t JOIN users m ON m.id=t.member_id WHERE t.owner_id=? AND t.status='active' ORDER BY t.role DESC,m.email").all(ownerId) as {email:string}[]).map(r=>r.email);}
}
