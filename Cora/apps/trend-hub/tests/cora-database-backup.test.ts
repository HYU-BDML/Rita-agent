import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,existsSync,statSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {backupDatabase,restoreDatabase,migrateDatabase} from '../lib/cora/database-backup';
import {CoraStore} from '../lib/cora/store';
import {DraftRecovery} from '../lib/cora/recovery';
import {randomUUID} from 'node:crypto';
import {InstagramConnections} from '../lib/cora/instagram-connect';
import {outline,sampleBrief,ideasFor} from '../lib/cora/model';
const temp=()=>mkdtempSync('/tmp/cora-backup-test-');
function legacy(file:string,team=false){
 const d=new DatabaseSync(file);d.exec(`PRAGMA journal_mode=WAL;CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,salt TEXT NOT NULL,hash TEXT NOT NULL);CREATE TABLE projects(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),body TEXT NOT NULL,version INTEGER NOT NULL,created TEXT NOT NULL,updated TEXT NOT NULL);`);
 d.prepare('INSERT INTO users VALUES(?,?,?,?)').run('owner','owner@synthetic.test','synthetic-salt','synthetic-hash');d.prepare('INSERT INTO users VALUES(?,?,?,?)').run('editor','editor@synthetic.test','synthetic-salt','synthetic-hash');
 const draft=outline(sampleBrief,ideasFor(sampleBrief)[0]);d.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?)').run('old-project','owner',JSON.stringify(draft),7,'old-created','old-updated');
 if(team){d.exec(`CREATE TABLE team_members(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),member_id TEXT NOT NULL REFERENCES users(id),role TEXT NOT NULL,brands TEXT NOT NULL,status TEXT NOT NULL,created TEXT NOT NULL,updated TEXT NOT NULL,UNIQUE(owner_id,member_id));INSERT INTO team_members VALUES('old-team','owner','editor','editor','[]','active','old','old');CREATE TABLE ig_connections(user_id TEXT PRIMARY KEY REFERENCES users(id),ig_user_id TEXT NOT NULL,username TEXT NOT NULL,token TEXT NOT NULL,expires_at INTEGER NOT NULL,connected INTEGER NOT NULL,refreshed INTEGER NOT NULL);INSERT INTO ig_connections VALUES('owner','100','synthetic_account','encrypted-synthetic',100000,1,2);`);}
 return d;
}
test('read-only backup captures committed WAL rows and two legacy versions restore twice without source changes',()=>{
 for(const team of [false,true]){const p=temp(),source=p+'/original.sqlite',writer=legacy(source,team);try{
  assert.ok(existsSync(source+'-wal'));const before=readFileSync(source);const backup=backupDatabase(source,p+'/backup');assert.equal(backup.scope,'database-only');assert.deepEqual(readFileSync(source),before);assert.equal(statSync(p+'/backup/studio.sqlite').mode&0o777,0o600);
  assert.equal(restoreDatabase(p+'/backup',p+'/restored').originalRowsPreserved,true);restoreDatabase(p+'/backup',p+'/restored-again');
  const s=new CoraStore(p+'/restored/studio.sqlite');try{const project=s.get('owner','old-project')!;assert.equal(project.version,7);assert.equal(project.brief.brand,sampleBrief.brand);assert.equal(project.clientId,undefined);assert.equal(s.clients.list('owner').length,0);assert.equal(s.clients.list('editor').length,0);
   if(team){const m=s.team.overview('owner').members[0];assert.equal(m.scope,'legacy');assert.deepEqual(m.clientIds,[]);const ig=s.module('ig',db=>new InstagramConnections(db,{},async()=>{throw new Error('no network');}));assert.equal(ig.accounts('owner')[0].access,'unknown');}
  }finally{s.close();}assert.equal(JSON.stringify(JSON.parse(readFileSync(p+'/backup/manifest.json','utf8'))).includes('encrypted-synthetic'),false);
 }finally{writer.close();rmSync(p,{recursive:true,force:true});}}
});
test('restore never overwrites an existing directory, rejects a corrupted snapshot, and leaves no partial destination',()=>{
 const p=temp(),source=p+'/source.sqlite',d=legacy(source);d.close();try{backupDatabase(source,p+'/backup');assert.throws(()=>restoreDatabase(p+'/backup',p+'/backup'),/new absolute directory/);const original=readFileSync(p+'/backup/studio.sqlite');writeFileSync(p+'/backup/studio.sqlite',Buffer.concat([original,Buffer.from('tampered')]));assert.throws(()=>restoreDatabase(p+'/backup',p+'/target'),/checksum|integrity/);assert.equal(existsSync(p+'/target'),false);writeFileSync(p+'/backup/studio.sqlite',original.subarray(0,100));assert.throws(()=>restoreDatabase(p+'/backup',p+'/target'));assert.equal(existsSync(p+'/target'),false);
 }finally{rmSync(p,{recursive:true,force:true});}
});
test('current schema, explicit grants, versions and unsaved snapshots survive restore unchanged',()=>{
 const p=temp(),s=new CoraStore(p+'/source.sqlite');try{const a=s.signup('a@synthetic.test','synthetic-password'),e=s.signup('e@synthetic.test','synthetic-password'),c=s.clients.save(a.id,{name:'customer',accent:'#205b4a'}),m=s.team.invite(a.id,e.email,'editor',[],[c.id]);s.team.respond(e.id,m.id,true,m.version);const draft={...outline(sampleBrief,ideasFor(sampleBrief)[0]),clientId:c.id};const saved=s.save(a.id,draft)!;const recovery=s.module('recovery',db=>new DraftRecovery(db));const draftId=randomUUID();recovery.put(e.id,draftId,null,{kind:'cards',draft:{...draft,caption:'unsaved synthetic'},source:{projectId:saved.id,version:1}});backupDatabase(p+'/source.sqlite',p+'/backup');restoreDatabase(p+'/backup',p+'/restored');const restored=new CoraStore(p+'/restored/studio.sqlite');try{assert.equal(restored.team.overview(a.id).members[0].version,2);assert.deepEqual(restored.accessibleClients(e.id).map(x=>x.id),[c.id]);assert.equal(restored.list(a.id)[0].clientId,c.id);const recovered=restored.module('recovery',db=>new DraftRecovery(db)).get(e.id,draftId).payload;if(recovered.kind==='cards')assert.equal(recovered.draft.caption,'unsaved synthetic');else assert.fail();}finally{restored.close();}
 }finally{s.close();rmSync(p,{recursive:true,force:true});}
});
test('failed foreign-key validation does not publish a backup',()=>{
 const p=temp(),d=legacy(p+'/source.sqlite');try{d.exec("PRAGMA foreign_keys=OFF;INSERT INTO projects SELECT 'orphan','missing',body,1,'old','old' FROM projects LIMIT 1");assert.throws(()=>backupDatabase(p+'/source.sqlite',p+'/backup'),/foreign key/);assert.equal(existsSync(p+'/backup'),false);}finally{d.close();rmSync(p,{recursive:true,force:true});}
});
test('a killed process rolls back partial DDL; restart reconciles the old schema idempotently',()=>{
 const p=temp(),source=p+'/source.sqlite',d=legacy(source,true);d.close();try{
  const code=`const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync(process.argv[1]);d.exec("BEGIN IMMEDIATE; ALTER TABLE team_members ADD COLUMN scope TEXT NOT NULL DEFAULT 'legacy'; CREATE TABLE interrupted_marker(id TEXT);");process.kill(process.pid,'SIGKILL');`;
  const child=spawnSync(process.execPath,['-e',code,source],{timeout:5000});assert.equal(child.signal,'SIGKILL');const check=new DatabaseSync(source);try{assert.equal(check.prepare("SELECT 1 FROM sqlite_master WHERE name='interrupted_marker'").get(),undefined);assert.ok(!(check.prepare('PRAGMA table_info(team_members)').all() as {name:string}[]).some(c=>c.name==='scope'));}finally{check.close();}
  migrateDatabase(source);migrateDatabase(source);const s=new CoraStore(source);try{assert.equal(s.team.overview('owner').members[0].scope,'legacy');assert.equal(s.get('owner','old-project')!.version,7);}finally{s.close();}
 }finally{rmSync(p,{recursive:true,force:true});}
});
test('conflicting legacy Instagram rows abort an atomic migration instead of dropping tokens',()=>{
 const p=temp(),d=legacy(p+'/source.sqlite',true);try{d.exec(`CREATE TABLE ig_accounts(user_id TEXT NOT NULL REFERENCES users(id),ig_user_id TEXT NOT NULL,username TEXT NOT NULL,token TEXT NOT NULL,expires_at INTEGER NOT NULL,connected INTEGER NOT NULL,refreshed INTEGER NOT NULL,PRIMARY KEY(user_id,ig_user_id));INSERT INTO ig_accounts VALUES('owner','100','other_name','other_encrypted_token',100000,1,2);`);assert.throws(()=>new InstagramConnections(d,{}),/conflict/);assert.ok(d.prepare("SELECT 1 FROM sqlite_master WHERE name='ig_connections'").get());assert.equal((d.prepare("SELECT token FROM ig_connections").get() as {token:string}).token,'encrypted-synthetic');assert.ok(!(d.prepare('PRAGMA table_info(ig_accounts)').all() as {name:string}[]).some(c=>c.name==='scopes'));
 }finally{d.close();rmSync(p,{recursive:true,force:true});}
});
