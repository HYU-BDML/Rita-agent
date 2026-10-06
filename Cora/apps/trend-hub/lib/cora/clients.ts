import {validateBrandRules,type BrandRules} from './brand-rules';
import {schemaStep} from './schema';
import {randomUUID} from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
export interface ClientInput {name:string;audience:string;goal:string;voice:string;visualRules:string;pillars:string;avoid:string;accent:string;ruleEvidence?:string;changeNote?:string}
export interface Client extends ClientInput {id:string;workspaceId:string;version:number;createdAt:string;updatedAt:string}
export interface AccessibleClient extends Client {access:'owner'|'editor';ownerEmail?:string}
export function validateClient(value:unknown):ClientInput {
 const v=value as Record<string,unknown>;if(!v||typeof v!=='object')throw new Error('고객사 정보를 확인해 주세요.');
 const text=(key:string,max:number)=>{const x=v[key]??'';if(typeof x!=='string'||x.length>max)throw new Error('고객사 입력 길이를 확인해 주세요.');return x.trim();};
 const c={name:text('name',80),audience:text('audience',160),goal:text('goal',200),voice:text('voice',2000),visualRules:text('visualRules',2000),pillars:text('pillars',2000),avoid:text('avoid',2000),accent:text('accent',7)||'#205b4a',ruleEvidence:text('ruleEvidence',1000),changeNote:text('changeNote',500)};
 if(!c.name||!/^#[\da-f]{6}$/i.test(c.accent))throw new Error('고객사 이름과 색상을 확인해 주세요.');
 return c;
}
/** Additive schema: never infer identity or merge legacy brands by name. */
export interface ClientRevision {version:number;client:ClientInput;authorId:string;confirmedAt:string;imported:boolean;changedFields:string[]}
export class ClientStore {
 constructor(private db:DatabaseSync){
    schemaStep(db,'clients-v1',()=>{
  db.exec(`CREATE TABLE IF NOT EXISTS client_workspaces(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE);
   CREATE TABLE IF NOT EXISTS clients(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,workspace_id TEXT NOT NULL REFERENCES client_workspaces(id) ON DELETE CASCADE,body TEXT NOT NULL,version INTEGER NOT NULL,created TEXT NOT NULL,updated TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS clients_owner ON clients(user_id);`);
    });
    schemaStep(db,'client-rule-history-v1',()=>{
     db.exec(`CREATE TABLE IF NOT EXISTS client_rule_history(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,version INTEGER NOT NULL,body TEXT NOT NULL,author_id TEXT NOT NULL REFERENCES users(id),confirmed TEXT NOT NULL,imported INTEGER NOT NULL,changed_fields TEXT NOT NULL,PRIMARY KEY(client_id,version));`);
     // Only the extant version is known. Never invent earlier history or confirmations.
     db.exec(`INSERT OR IGNORE INTO client_rule_history SELECT user_id,id,version,body,user_id,updated,1,'[]' FROM clients`);
    });
 }
 workspace(userId:string){
  const old=this.db.prepare('SELECT id FROM client_workspaces WHERE owner_id=?').get(userId) as {id:string}|undefined;
  if(old)return old.id;
  const id=randomUUID();this.db.prepare('INSERT OR IGNORE INTO client_workspaces VALUES (?,?)').run(id,userId);
  return (this.db.prepare('SELECT id FROM client_workspaces WHERE owner_id=?').get(userId) as {id:string}).id;
 }
 private decode(value:unknown):Client{const row=value as Record<string,unknown>;return {...JSON.parse(String(row.body)),id:String(row.id),workspaceId:String(row.workspace_id),version:Number(row.version),createdAt:String(row.created),updatedAt:String(row.updated)};}
 list(userId:string){return this.db.prepare('SELECT * FROM clients WHERE user_id=? ORDER BY updated DESC,id').all(userId).map(row=>this.decode(row));}
 get(userId:string,id:string){const row=this.db.prepare('SELECT * FROM clients WHERE user_id=? AND id=?').get(userId,id);return row?this.decode(row):null;}
 owner(id:string){return (this.db.prepare('SELECT user_id FROM clients WHERE id=?').get(id) as {user_id:string}|undefined)?.user_id??null;}
 history(userId:string,id:string):ClientRevision[]{
  if(!this.get(userId,id))throw new Error('NOT_FOUND');
  return (this.db.prepare('SELECT * FROM client_rule_history WHERE user_id=? AND client_id=? ORDER BY version DESC LIMIT 100').all(userId,id) as Record<string,unknown>[]).map(r=>({version:Number(r.version),client:JSON.parse(String(r.body)),authorId:String(r.author_id),confirmedAt:String(r.confirmed),imported:!!r.imported,changedFields:JSON.parse(String(r.changed_fields))}));
 }
 rules(userId:string,id:string,version?:number):BrandRules{
  const c=this.get(userId,id);if(!c)throw new Error('NOT_FOUND');
  const row=this.db.prepare('SELECT * FROM client_rule_history WHERE user_id=? AND client_id=? AND version=?').get(userId,id,version??c.version) as Record<string,unknown>|undefined;if(!row)throw new Error('브랜드 규칙 버전이 없습니다.');
  const r={client:JSON.parse(String(row.body)) as ClientInput,version:Number(row.version),imported:!!row.imported,authorId:String(row.author_id),confirmedAt:String(row.confirmed)};
  const history=(this.db.prepare("SELECT version,body FROM client_rule_history WHERE user_id=? AND client_id=? AND version<=? AND length(COALESCE(json_extract(body,'$.changeNote'),''))>0 ORDER BY version DESC LIMIT 5").all(userId,id,r.version) as {version:number;body:string}[]).map(x=>({version:x.version,client:JSON.parse(x.body) as ClientInput}));
  return validateBrandRules({...r.client,clientId:id,version:r.version,evidence:r.client.ruleEvidence??'',confirmedBy:r.imported?'legacy-unconfirmed':r.authorId,confirmedAt:r.confirmedAt,changes:history.filter(x=>x.version<=r.version&&x.client.changeNote).slice(0,5).map(x=>({version:x.version,note:x.client.changeNote!}))});
 }
 save(userId:string,value:unknown,id?:string,version?:number){
  const input=validateClient(value),now=new Date().toISOString();
  this.db.exec('BEGIN IMMEDIATE');
  try{
   const old=id?this.get(userId,id):null;
   if(id){
    const changed=this.db.prepare('UPDATE clients SET body=?,version=version+1,updated=? WHERE user_id=? AND id=? AND version=?').run(JSON.stringify(input),now,userId,id,version??-1).changes;
    if(!changed){if(!old)throw new Error('NOT_FOUND');throw new Error('CONFLICT');}
   }else{id=randomUUID();this.db.prepare('INSERT INTO clients VALUES (?,?,?,?,?,?,?)').run(id,userId,this.workspace(userId),JSON.stringify(input),1,now,now);}
   const saved=this.get(userId,id)!;
   const changedFields=Object.keys(input).filter(k=>k!=='changeNote'&&input[k as keyof ClientInput]!==old?.[k as keyof ClientInput]);
   this.db.prepare('INSERT INTO client_rule_history VALUES (?,?,?,?,?,?,?,?)').run(userId,id,saved.version,JSON.stringify(input),userId,now,0,JSON.stringify(changedFields));
   this.db.exec('COMMIT');return saved;
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
}
