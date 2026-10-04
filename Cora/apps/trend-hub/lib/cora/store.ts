import {schemaStep} from './schema';
import { DatabaseSync } from 'node:sqlite';
import { PublicationQueue } from './publishing/queue';
import { JobScheduler } from './scheduler';
import { TeamStore } from './team';
import { ClientStore, type AccessibleClient } from './clients';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Draft, Project, BrandProfile } from './model';

type ReviewRow={id:string;project_id:string;owner_id:string;reviewer_id:string;version:number;current_version:number;snapshot:string;status:string;comment:string;created:string;decided:string|null;owner_email:string;reviewer_email:string};
type ProjectRow = { id: string; version: number; body: string; created: string; updated: string };
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export class CoraStore {
  private db: DatabaseSync;
  readonly publicationQueue: PublicationQueue;
  readonly scheduler: JobScheduler;
  readonly team: TeamStore;
  readonly clients: ClientStore;
  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    try{
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000');
    schemaStep(this.db,'core-v1',()=>this.db.exec(`
      CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), body TEXT NOT NULL, version INTEGER NOT NULL, created TEXT NOT NULL, updated TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS work_items(id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), kind TEXT NOT NULL, title TEXT NOT NULL, data TEXT NOT NULL, created TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS brands(id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS reviews(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, owner_id TEXT NOT NULL REFERENCES users(id), reviewer_id TEXT NOT NULL REFERENCES users(id), version INTEGER NOT NULL, snapshot TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', comment TEXT NOT NULL DEFAULT '', created TEXT NOT NULL, decided TEXT, UNIQUE(project_id,version,reviewer_id));
      CREATE TABLE IF NOT EXISTS publication_drafts(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE, version INTEGER NOT NULL, account_label TEXT NOT NULL, scheduled_at TEXT NOT NULL, snapshot TEXT NOT NULL, status TEXT NOT NULL, created TEXT NOT NULL, UNIQUE(project_id,version,account_label,scheduled_at));
      CREATE TABLE IF NOT EXISTS revisions(project_id TEXT REFERENCES projects(id) ON DELETE CASCADE, version INTEGER, body TEXT NOT NULL, created TEXT NOT NULL, PRIMARY KEY(project_id,version));`));
    this.publicationQueue = new PublicationQueue(this.db);
    this.scheduler = new JobScheduler(this.db);
    this.clients = new ClientStore(this.db);
    this.team = new TeamStore(this.db);
    schemaStep(this.db,'work-items-client-v1',()=>{
      if(!(this.db.prepare('PRAGMA table_info(work_items)').all() as {name:string}[]).some(c=>c.name==='client_id'))this.db.exec('ALTER TABLE work_items ADD COLUMN client_id TEXT REFERENCES clients(id)');
      this.db.exec('CREATE INDEX IF NOT EXISTS work_items_client ON work_items(user_id,client_id)');
    });
    }catch(e){this.db.close();throw e;}
  }
  signup(email: string, password: string) {
    const salt = randomBytes(16).toString('hex'); const hash = scryptSync(password, salt, 64).toString('hex');
    const id = randomUUID();
    try { this.db.prepare('INSERT INTO users VALUES (?,?,?,?)').run(id, email, salt, hash); }
    catch { throw new Error('이 이메일로 가입할 수 없습니다. 기존 계정으로 로그인해 주세요.'); }
    return { id, email };
  }
  login(email: string, password: string) {
    const row = this.db.prepare('SELECT * FROM users WHERE email=?').get(email) as { id: string; email: string; salt: string; hash: string } | undefined;
    const actual = scryptSync(password, row?.salt ?? 'invalid-account', 64);
    if (!row || !timingSafeEqual(actual, Buffer.from(row.hash, 'hex'))) throw new Error('이메일 또는 비밀번호를 확인해 주세요.');
    return { id: row.id, email: row.email };
  }
  createSession(userId: string) {
    const token = randomBytes(32).toString('hex');
    this.db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
    this.db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(digest(token), userId, Date.now() + 7 * 86400000);
    return token;
  }
  user(token: string) { return this.db.prepare('SELECT u.id,u.email FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>?').get(digest(token), Date.now()) as { id: string; email: string } | undefined; }
  logout(token: string) { this.db.prepare('DELETE FROM sessions WHERE token=?').run(digest(token)); }
  list(userId: string) { return (this.db.prepare('SELECT id,version,created,updated,body FROM projects WHERE user_id=? ORDER BY updated DESC').all(userId) as ProjectRow[]).map(r => { const b = JSON.parse(String(r.body)) as Draft; return { id: String(r.id), version: Number(r.version), clientId:b.clientId, brand: b.brief.brand, title: b.idea, count: b.slides.length, workStatus: b.workStatus ?? 'draft', updatedAt: String(r.updated) }; }); }
  get(userId: string, id: string): Project | null {
    const r = this.db.prepare('SELECT * FROM projects WHERE id=? AND user_id=?').get(id, userId) as ProjectRow | undefined;
    return r ? { ...JSON.parse(String(r.body)), id: String(r.id), version: Number(r.version), createdAt: String(r.created), updatedAt: String(r.updated) } : null;
  }
  /** Owner of a project, or null. Used to resolve team editor access without widening get()/save(). */
  private projectOwner(id: string) { return (this.db.prepare('SELECT user_id FROM projects WHERE id=?').get(id) as { user_id: string } | undefined)?.user_id ?? null; }
  /** Own project, or a teammate's project this user may edit (active editor, brand allowed). */
  getAccessible(userId: string, id: string): (Project & { access: 'owner' | 'editor'; ownerEmail?: string }) | null {
    const own = this.get(userId, id); if (own) return { ...own, access: 'owner' };
    const owner = this.projectOwner(id); if (!owner) return null;
    const p = this.get(owner, id); if (!p || !this.mayEdit(userId, owner, p)) return null;
    const email = (this.db.prepare('SELECT email FROM users WHERE id=?').get(owner) as { email: string }).email;
    return { ...p, access: 'editor', ownerEmail: email };
  }
  private mayEdit(userId:string,ownerId:string,p:Draft){return p.clientId?this.team.canEditClient(userId,ownerId,p.clientId):this.team.canEdit(userId,ownerId,p.brief.brand);}
  private atomic<T>(fn:()=>T):T {this.db.exec('BEGIN IMMEDIATE');try{const result=fn();this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  /** Check grants inside the same write transaction. An editor cannot reassign/unassign client identity. */
  saveAccessible(userId:string,body:Draft,id:string,version:number) {
    return this.atomic(()=>{
      const owner=this.projectOwner(id);if(!owner)return null;
      const p=this.get(owner,id);if(!p)return null;
      if(owner!==userId){
        if(!this.mayEdit(userId,owner,p))return null;
        if(body.clientId!==p.clientId)throw new Error('고객사 변경은 소유자만 할 수 있습니다.');
        if(!p.clientId&&!this.team.canEdit(userId,owner,body.brief.brand))throw new Error('권한이 없는 브랜드로 옮길 수 없습니다.');
      }
      this.writeDraft(owner,body,id,version);return this.getAccessible(userId,id);
    });
  }
  /** Shared creation stays in the client's owner workspace; a request cannot supply a new owner. */
  saveNewAccessible(userId:string,body:Draft) {
    return this.atomic(()=>{
      const owner=body.clientId?this.clients.owner(body.clientId):userId;
      if(!owner||(owner!==userId&&(!body.clientId||!this.team.canEditClient(userId,owner,body.clientId))))throw new Error('NOT_FOUND');
      const p=this.writeDraft(owner,body)!;return this.getAccessible(userId,p.id)!;
    });
  }
  accessibleClient(userId:string,id:string):AccessibleClient|null {
    const owner=this.clients.owner(id);if(!owner)return null;
    if(owner!==userId&&!this.team.canEditClient(userId,owner,id))return null;
    const client=this.clients.get(owner,id);if(!client)return null;
    const email=(this.db.prepare('SELECT email FROM users WHERE id=?').get(owner) as {email:string}).email;
    return {...client,access:owner===userId?'owner':'editor',...(owner===userId?{}:{ownerEmail:email})};
  }
  /** Synchronous only: resolve current grant while holding the same write lock as the mutation.
   * Never hold this transaction across a network/LLM await. Missing scope means own legacy rows only. */
  withClientAccess<T>(actorId:string,clientId:string|null,fn:(ownerId:string)=>T):T {
    return this.atomic(()=>{
      const c=clientId?this.accessibleClient(actorId,clientId):null;
      if(clientId&&!c)throw new Error('NOT_FOUND');
      const result=fn(c?this.clients.owner(c.id)!:actorId);
      if(result&&typeof (result as {then?:unknown}).then==='function')throw new Error('ASYNC_TRANSACTION');
      if(clientId&&!this.accessibleClient(actorId,clientId))throw new Error('NOT_FOUND');
      return result;
    });
  }
  scopedItems(ownerId:string,clientId:string|null){
    return (this.db.prepare('SELECT id FROM work_items WHERE user_id=? AND client_id IS ? ORDER BY rowid DESC LIMIT 500').all(ownerId,clientId) as {id:string}[]).map(r=>({...this.item(ownerId,r.id)!,clientId}));
  }
  scopedItem(ownerId:string,id:string,clientId:string|null){
    return this.db.prepare('SELECT 1 FROM work_items WHERE user_id=? AND id=? AND client_id IS ?').get(ownerId,id,clientId)?{...this.item(ownerId,id)!,clientId}:null;
  }
  addScopedItem(ownerId:string,clientId:string|null,kind:string,title:string,data:Record<string,unknown>){
    if(clientId&&!this.clients.get(ownerId,clientId))throw new Error('NOT_FOUND');
    const id=randomUUID(),createdAt=new Date().toISOString();
    this.db.prepare('INSERT INTO work_items(id,user_id,kind,title,data,created,client_id) VALUES (?,?,?,?,?,?,?)').run(id,ownerId,kind,title,JSON.stringify(data),createdAt,clientId);
    return {id,kind,title,data,createdAt,clientId};
  }
  accessibleClients(userId:string):AccessibleClient[] {
    const own=this.clients.list(userId).map(c=>({...c,access:'owner' as const}));
    const shared=this.team.editorGrants(userId).flatMap(g=>g.scope==='clients'?g.clientIds.map(id=>this.accessibleClient(userId,id)).filter((c):c is AccessibleClient=>!!c):[]);
    return [...own,...shared];
  }
  sharedProjects(userId:string) {
    return this.team.editorGrants(userId).flatMap(g=>{
      const email=(this.db.prepare('SELECT email FROM users WHERE id=?').get(g.ownerId) as {email:string}).email;
      return this.list(g.ownerId).filter(p=>p.clientId?g.scope==='clients'&&g.clientIds.includes(p.clientId):g.scope==='legacy'&&(g.brands.length===0||g.brands.includes(p.brand))).map(p=>({...p,access:'editor' as const,ownerEmail:email}));
    });
  }
  save(userId:string,body:Draft,id?:string,version?:number):Project|null {return this.atomic(()=>this.writeDraft(userId,body,id,version));}
  /** Caller must hold a write transaction, and already have resolved owner/grants. */
  private writeDraft(userId:string,body:Draft,id?:string,version?:number):Project|null {
    const time=new Date().toISOString();
    const previous=id?this.get(userId,id):null;if(previous&&previous.clientId!==body.clientId)body={...body,brandRules:undefined};
    if(body.clientId&&!this.clients.get(userId,body.clientId))throw new Error('고객사를 찾을 수 없습니다.');
    // Persist canonical historical rules, never a caller-forged evidence/confirmation snapshot.
    if(body.clientId){if(body.brandRules&&body.brandRules.clientId!==body.clientId)throw new Error('브랜드 규칙과 고객사 ID가 다릅니다.');body={...body,brandRules:this.clients.rules(userId,body.clientId,body.brandRules?.version)};}else if(body.brandRules)throw new Error('브랜드 규칙과 고객사 ID가 다릅니다.');
    let encoded=JSON.stringify(body);
    if(id){
      const current=this.get(userId,id);if(!current)return null;
      if(current.version!==version)throw new Error('CONFLICT');
      if(current.workStatus==='ready'&&JSON.stringify([current.clientId,current.brief,current.slides,current.caption,current.design,current.brandRules])!==JSON.stringify([body.clientId,body.brief,body.slides,body.caption,body.design,body.brandRules])){body={...body,workStatus:'draft'};encoded=JSON.stringify(body);}
      this.db.prepare('UPDATE projects SET body=?,version=version+1,updated=? WHERE id=? AND user_id=?').run(encoded,time,id,userId);
    }else{id=randomUUID();this.db.prepare('INSERT INTO projects VALUES (?,?,?,?,?,?)').run(id,userId,encoded,1,time,time);}
    const result=this.get(userId,id)!;
    this.db.prepare('INSERT INTO revisions VALUES (?,?,?,?)').run(id,result.version,encoded,time);return result;
  }
  items(userId:string):{id:string;kind:string;title:string;data:Record<string,unknown>;createdAt:string}[]{return (this.db.prepare('SELECT * FROM work_items WHERE user_id=? ORDER BY rowid DESC LIMIT 500').all(userId) as {id:string;kind:string;title:string;data:string;created:string}[]).map(r=>({id:r.id,kind:r.kind,title:r.title,data:JSON.parse(r.data),createdAt:r.created}));}
  addItem(userId:string,kind:string,title:string,data:Record<string,unknown>){const id=randomUUID(),createdAt=new Date().toISOString();this.db.prepare('INSERT INTO work_items(id,user_id,kind,title,data,created) VALUES (?,?,?,?,?,?)').run(id,userId,kind,title,JSON.stringify(data),createdAt);return {id,kind,title,data,createdAt};}
  updateItem(userId:string,id:string,data:Record<string,unknown>){this.db.prepare('UPDATE work_items SET data=? WHERE id=? AND user_id=?').run(JSON.stringify(data),id,userId);}
  item(userId:string,id:string){const r=this.db.prepare('SELECT * FROM work_items WHERE id=? AND user_id=?').get(id,userId) as {id:string;kind:string;title:string;data:string;created:string}|undefined;return r?{id:r.id,kind:r.kind,title:r.title,data:JSON.parse(r.data),createdAt:r.created}:null;}
  editItemText(userId:string,id:string,expectedText:string,text:string){
    if(typeof expectedText!=='string'||typeof text!=='string'||!text.trim()||text.length>50000||expectedText.length>50000)throw new Error('본문은 1~50,000자입니다.');
    this.db.exec('BEGIN IMMEDIATE');try{const item=this.item(userId,id);if(!item||!['blog','script','material'].includes(item.kind))throw new Error('NOT_FOUND');if(typeof item.data.text!=='string')throw new Error('편집할 본문이 없습니다.');if(item.data.text!==expectedText)throw new Error('CONFLICT');this.updateItem(userId,id,{...item.data,text,editedAt:new Date().toISOString(),humanEdited:true});const result=this.item(userId,id)!;this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  /** Atomic status change on a work item: only when kind and current status match, else NOT_FOUND / CONFLICT. `check` may veto with its own error. */
  transitionItem(userId:string,id:string,kind:string,from:string[],patch:Record<string,unknown>,check?:(data:Record<string,unknown>)=>void){
    this.db.exec('BEGIN IMMEDIATE');try{const item=this.item(userId,id);if(!item||item.kind!==kind)throw new Error('NOT_FOUND');if(!from.includes(String(item.data.status)))throw new Error('CONFLICT');check?.(item.data);this.updateItem(userId,id,{...item.data,...patch});const r=this.item(userId,id)!;this.db.exec('COMMIT');return r;}catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  removeItem(userId:string,id:string){return this.db.prepare('DELETE FROM work_items WHERE id=? AND user_id=?').run(id,userId).changes>0;}
  generationCount(userId:string){return Number((this.db.prepare("SELECT COUNT(*) as n FROM work_items WHERE user_id=? AND kind='run' AND created>=?").get(userId,new Date(Date.now()-86400000).toISOString()) as {n:number}).n);}
  brands(userId:string):BrandProfile[] {return (this.db.prepare('SELECT id,body FROM brands WHERE user_id=? ORDER BY rowid DESC').all(userId) as {id:string;body:string}[]).map(r=>({...JSON.parse(String(r.body)),id:String(r.id)}));}
  saveBrand(userId:string,body:Omit<BrandProfile,'id'>):BrandProfile {const id=randomUUID();this.db.prepare('INSERT INTO brands VALUES (?,?,?)').run(id,userId,JSON.stringify(body));return {...body,id};}
  delete(userId:string,id:string,version:number):boolean {
    this.db.exec('BEGIN IMMEDIATE');try{const p=this.get(userId,id);if(!p){this.db.exec('ROLLBACK');return false;}if(p.version!==version)throw new Error('CONFLICT');this.db.prepare('DELETE FROM projects WHERE id=? AND user_id=?').run(id,userId);this.db.exec('COMMIT');return true;}catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  requestReview(ownerId:string,projectId:string,version:number,email:string){
    this.db.exec('BEGIN IMMEDIATE');try{
      const project=this.get(ownerId,projectId);if(!project)throw new Error('NOT_FOUND');if(project.version!==version)throw new Error('CONFLICT');
      const reviewer=this.db.prepare('SELECT id FROM users WHERE email=?').get(email.trim().toLowerCase()) as {id:string}|undefined;
      if(!reviewer||reviewer.id===ownerId)throw new Error('이미 가입한 다른 검토자의 이메일이 필요합니다.');
      if(project.clientId&&!this.team.canReviewClient(reviewer.id,ownerId,project.clientId))throw new Error('이 고객사의 초대를 수락한 검토자를 선택해 주세요.');
      const existing=this.db.prepare('SELECT id FROM reviews WHERE project_id=? AND version=? AND reviewer_id=?').get(projectId,version,reviewer.id) as {id:string}|undefined;
      if(existing){const prior=this.review(ownerId,existing.id);if(prior?.status==='cancelled')throw new Error('공유를 회수한 버전입니다. 새 버전을 저장한 뒤 다시 요청하세요.');this.db.exec('COMMIT');return prior;}
      const id=randomUUID();this.db.prepare('INSERT INTO reviews(id,project_id,owner_id,reviewer_id,version,snapshot,created) VALUES (?,?,?,?,?,?,?)').run(id,projectId,ownerId,reviewer.id,version,JSON.stringify(project),new Date().toISOString());
      this.db.exec('COMMIT');return this.review(ownerId,id);
    }catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  reviews(userId:string){
    const rows=this.db.prepare(`SELECT r.id,r.project_id,r.owner_id,r.reviewer_id,r.version,r.status,r.comment,r.created,r.decided,json_extract(r.snapshot,'$.clientId') as client_id,json_extract(r.snapshot,'$.brief.brand') as brand,json_extract(r.snapshot,'$.idea') as title,p.version as current_version,o.email as owner_email,u.email as reviewer_email FROM reviews r JOIN projects p ON p.id=r.project_id JOIN users o ON o.id=r.owner_id JOIN users u ON u.id=r.reviewer_id WHERE r.owner_id=? OR (r.reviewer_id=? AND r.status!='cancelled') ORDER BY r.created DESC LIMIT 200`).all(userId,userId) as (Omit<ReviewRow,'snapshot'>&{client_id:string|null})[];
    return rows.filter(r=>r.owner_id===userId||!r.client_id||this.team.canReviewClient(userId,r.owner_id,r.client_id)).map(r=>({...r,effectiveStatus:r.status==='cancelled'?'cancelled':r.version!==r.current_version?'stale':r.status}));
  }
  review(userId:string,id:string){
    const row=this.db.prepare(`SELECT r.*,p.version as current_version,o.email as owner_email,u.email as reviewer_email FROM reviews r JOIN projects p ON p.id=r.project_id JOIN users o ON o.id=r.owner_id JOIN users u ON u.id=r.reviewer_id WHERE r.id=? AND (r.owner_id=? OR (r.reviewer_id=? AND r.status!='cancelled'))`).get(id,userId,userId) as ReviewRow|undefined;
    if(!row)return null;const snapshot=JSON.parse(String(row.snapshot)) as Project;
    if(row.owner_id!==userId&&snapshot.clientId&&!this.team.canReviewClient(userId,row.owner_id,snapshot.clientId))return null;
    return {...row,snapshot,effectiveStatus:row.status==='cancelled'?'cancelled':row.version!==row.current_version?'stale':row.status};
  }
  decideReview(userId:string,id:string,status:string,comment:string){
    if(!['approved','changes_requested'].includes(status)||typeof comment!=='string'||comment.length>3000)throw new Error('검토 결과 형식을 확인해 주세요.');
    if(status==='changes_requested'&&!comment.trim())throw new Error('수정할 내용을 적어 주세요.');
    this.db.exec('BEGIN IMMEDIATE');try{
      const r=this.review(userId,id);if(!r||r.reviewer_id!==userId)throw new Error('NOT_FOUND');
      if(r.status!=='pending'||r.effectiveStatus==='stale')throw new Error('CONFLICT');
      this.db.prepare('UPDATE reviews SET status=?,comment=?,decided=? WHERE id=?').run(status,comment.trim(),new Date().toISOString(),id);
      this.db.exec('COMMIT');return this.review(userId,id);
    }catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  cancelReview(userId:string,id:string){return this.db.prepare("UPDATE reviews SET status='cancelled' WHERE id=? AND owner_id=? AND status!='cancelled'").run(id,userId).changes>0;}
  preparePublication(userId:string,reviewId:string,accountLabel:string,scheduledAt:string){
    if(typeof accountLabel!=='string'||!accountLabel.trim()||accountLabel.length>100||typeof scheduledAt!=='string')throw new Error('게시 대상과 시각을 확인해 주세요.');
    let when='';if(scheduledAt){if(!/(Z|[+-]\d{2}:\d{2})$/.test(scheduledAt)||!Number.isFinite(Date.parse(scheduledAt))||Date.parse(scheduledAt)<=Date.now())throw new Error('시간대가 있는 미래 시각이 필요합니다.');when=new Date(scheduledAt).toISOString();}
    const account=accountLabel.trim().toLowerCase();this.db.exec('BEGIN IMMEDIATE');try{
      const r=this.review(userId,reviewId);if(!r||r.owner_id!==userId)throw new Error('NOT_FOUND');if(r.effectiveStatus!=='approved')throw new Error('현재 저장 버전에 대한 다른 검토자의 승인이 필요합니다.');
      const prior=this.db.prepare('SELECT id,status FROM publication_drafts WHERE project_id=? AND version=? AND account_label=? AND scheduled_at=?').get(r.project_id,r.version,account,when) as {id:string;status:string}|undefined;
      if(prior){if(prior.status==='cancelled')throw new Error('취소한 준비 작업입니다. 새 버전으로 준비하세요.');this.db.exec('COMMIT');return this.publications(userId,prior.id)[0]!;}
      const id=randomUUID();this.db.prepare('INSERT INTO publication_drafts VALUES (?,?,?,?,?,?,?,?,?,?)').run(id,userId,r.project_id,reviewId,r.version,account,when,JSON.stringify(r.snapshot),'awaiting_connection',new Date().toISOString());
      this.db.exec('COMMIT');return this.publications(userId,id)[0]!;
    }catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  publications(userId:string,id=''){
    type Row={id:string;project_id:string;review_id:string;version:number;current_version:number;account_label:string;scheduled_at:string;snapshot:string;status:string;review_status:string;created:string};
    const rows=this.db.prepare("SELECT d.*,p.version as current_version,r.status as review_status FROM publication_drafts d JOIN projects p ON p.id=d.project_id JOIN reviews r ON r.id=d.review_id WHERE d.user_id=? AND (?='' OR d.id=?) ORDER BY d.created DESC LIMIT 50").all(userId,id,id) as Row[];
    return rows.map(r=>({id:r.id,projectId:r.project_id,reviewId:r.review_id,version:r.version,currentVersion:r.current_version,accountLabel:r.account_label,scheduledAt:r.scheduled_at,status:r.status,effectiveStatus:r.status==='cancelled'?'cancelled':r.version!==r.current_version||r.review_status!=='approved'?'needs_review':r.status,title:(JSON.parse(r.snapshot) as Project).idea,brand:(JSON.parse(r.snapshot) as Project).brief.brand,caption:(JSON.parse(r.snapshot) as Project).caption,createdAt:r.created}));
  }
  cancelPublication(userId:string,id:string){return this.db.prepare("UPDATE publication_drafts SET status='cancelled' WHERE id=? AND user_id=? AND status='awaiting_connection'").run(id,userId).changes>0;}
  private modules = new Map<string, unknown>();
  /** Feature modules own their tables: store().module('name', db => new Feature(db)) creates once per connection. */
  module<T>(name: string, factory: (db: DatabaseSync) => T): T { if (!this.modules.has(name)) this.modules.set(name, factory(this.db)); return this.modules.get(name) as T; }
  /** User id for an existing account email, or null. For feature modules that address other accounts. */
  userIdByEmail(email: string) { return (this.db.prepare('SELECT id FROM users WHERE email=?').get(String(email).trim().toLowerCase()) as { id: string } | undefined)?.id ?? null; }
  close() { this.db.close(); }
}
const globalStore = globalThis as typeof globalThis & { coraStore?: CoraStore };
export function store() { return globalStore.coraStore ??= new CoraStore(path.join(process.env.CORA_DATA_DIR || path.join(process.cwd(), 'data', 'cora'), 'studio.sqlite')); }
