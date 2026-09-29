import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Draft, Project, BrandProfile } from './model';

type ProjectRow = { id: string; version: number; body: string; created: string; updated: string };
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export class CoraStore {
  private db: DatabaseSync;
  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), body TEXT NOT NULL, version INTEGER NOT NULL, created TEXT NOT NULL, updated TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS work_items(id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), kind TEXT NOT NULL, title TEXT NOT NULL, data TEXT NOT NULL, created TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS brands(id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS revisions(project_id TEXT REFERENCES projects(id) ON DELETE CASCADE, version INTEGER, body TEXT NOT NULL, created TEXT NOT NULL, PRIMARY KEY(project_id,version));`);
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
  list(userId: string) { return (this.db.prepare('SELECT id,version,created,updated,body FROM projects WHERE user_id=? ORDER BY updated DESC').all(userId) as ProjectRow[]).map(r => { const b = JSON.parse(String(r.body)) as Draft; return { id: String(r.id), version: Number(r.version), brand: b.brief.brand, title: b.idea, count: b.slides.length, workStatus: b.workStatus ?? 'draft', updatedAt: String(r.updated) }; }); }
  get(userId: string, id: string): Project | null {
    const r = this.db.prepare('SELECT * FROM projects WHERE id=? AND user_id=?').get(id, userId) as ProjectRow | undefined;
    return r ? { ...JSON.parse(String(r.body)), id: String(r.id), version: Number(r.version), createdAt: String(r.created), updatedAt: String(r.updated) } : null;
  }
  save(userId: string, body: Draft, id?: string, version?: number): Project | null {
    const time = new Date().toISOString(); let encoded = JSON.stringify(body);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (id) {
        const current = this.get(userId, id);
        if (!current) { this.db.exec('ROLLBACK'); return null; }
        if (current.version !== version) throw new Error('CONFLICT');
        if(current.workStatus==='ready' && JSON.stringify([current.brief,current.slides,current.caption,current.design])!==JSON.stringify([body.brief,body.slides,body.caption,body.design])){body={...body,workStatus:'draft'};encoded=JSON.stringify(body);}
        this.db.prepare('UPDATE projects SET body=?,version=version+1,updated=? WHERE id=? AND user_id=?').run(encoded, time, id, userId);
      } else {
        id = randomUUID(); this.db.prepare('INSERT INTO projects VALUES (?,?,?,?,?,?)').run(id, userId, encoded, 1, time, time);
      }
      const result = this.get(userId, id)!;
      this.db.prepare('INSERT INTO revisions VALUES (?,?,?,?)').run(id, result.version, encoded, time);
      this.db.exec('COMMIT'); return result;
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  items(userId:string):{id:string;kind:string;title:string;data:Record<string,unknown>;createdAt:string}[]{return (this.db.prepare('SELECT * FROM work_items WHERE user_id=? ORDER BY rowid DESC LIMIT 500').all(userId) as {id:string;kind:string;title:string;data:string;created:string}[]).map(r=>({id:r.id,kind:r.kind,title:r.title,data:JSON.parse(r.data),createdAt:r.created}));}
  addItem(userId:string,kind:string,title:string,data:Record<string,unknown>){const id=randomUUID(),createdAt=new Date().toISOString();this.db.prepare('INSERT INTO work_items VALUES (?,?,?,?,?,?)').run(id,userId,kind,title,JSON.stringify(data),createdAt);return {id,kind,title,data,createdAt};}
  updateItem(userId:string,id:string,data:Record<string,unknown>){this.db.prepare('UPDATE work_items SET data=? WHERE id=? AND user_id=?').run(JSON.stringify(data),id,userId);}
  item(userId:string,id:string){const r=this.db.prepare('SELECT * FROM work_items WHERE id=? AND user_id=?').get(id,userId) as {id:string;kind:string;title:string;data:string;created:string}|undefined;return r?{id:r.id,kind:r.kind,title:r.title,data:JSON.parse(r.data),createdAt:r.created}:null;}
  removeItem(userId:string,id:string){return this.db.prepare('DELETE FROM work_items WHERE id=? AND user_id=?').run(id,userId).changes>0;}
  generationCount(userId:string){return Number((this.db.prepare("SELECT COUNT(*) as n FROM work_items WHERE user_id=? AND kind='run' AND created>=?").get(userId,new Date(Date.now()-86400000).toISOString()) as {n:number}).n);}
  brands(userId:string):BrandProfile[] {return (this.db.prepare('SELECT id,body FROM brands WHERE user_id=? ORDER BY rowid DESC').all(userId) as {id:string;body:string}[]).map(r=>({...JSON.parse(String(r.body)),id:String(r.id)}));}
  saveBrand(userId:string,body:Omit<BrandProfile,'id'>):BrandProfile {const id=randomUUID();this.db.prepare('INSERT INTO brands VALUES (?,?,?)').run(id,userId,JSON.stringify(body));return {...body,id};}
  delete(userId:string,id:string,version:number):boolean {
    this.db.exec('BEGIN IMMEDIATE');try{const p=this.get(userId,id);if(!p){this.db.exec('ROLLBACK');return false;}if(p.version!==version)throw new Error('CONFLICT');this.db.prepare('DELETE FROM projects WHERE id=? AND user_id=?').run(id,userId);this.db.exec('COMMIT');return true;}catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  close() { this.db.close(); }
}
const globalStore = globalThis as typeof globalThis & { coraStore?: CoraStore };
export function store() { return globalStore.coraStore ??= new CoraStore(path.join(process.env.CORA_DATA_DIR || path.join(process.cwd(), 'data', 'cora'), 'studio.sqlite')); }
