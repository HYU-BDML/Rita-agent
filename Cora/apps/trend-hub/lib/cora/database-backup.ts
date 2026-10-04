import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {chmodSync,closeSync,copyFileSync,existsSync,lstatSync,mkdtempSync,mkdirSync,rmdirSync,openSync,readFileSync,readSync,renameSync,rmSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {CoraStore} from './store';
import {InstagramConnections} from './instagram-connect';
import {ClientAccounts} from './client-accounts';
import {LibraryStore} from './library';
import {AdCreativeStore} from './ad-creative';
import {WeeklyStore} from './weekly';
import {DraftRecovery} from './recovery';

// Runtime readOnly option is supported by the declared Node minimum; pinned Node typings predate it.
const readonlyOptions={readOnly:true} as ConstructorParameters<typeof DatabaseSync>[1];
const quote=(v:string)=>'"'+v.replace(/"/g,'""')+'"';
type TableProof={columns:string[];count:number;digest:string};
type Manifest={format:'cora-sqlite-v1';createdAt:string;sha256:string;tables:Record<string,TableProof>;scope:'database-only'};
const digest=(v:string)=>createHash('sha256').update(v).digest('hex');
function fileHash(file:string){const h=createHash('sha256'),fd=openSync(file,'r'),buf=Buffer.alloc(1024*1024);try{let n;while((n=readSync(fd,buf,0,buf.length,null))>0)h.update(buf.subarray(0,n));return h.digest('hex');}finally{closeSync(fd);}}
function regular(file:string){if(!path.isAbsolute(file)||!lstatSync(file).isFile()||lstatSync(file).isSymbolicLink())throw new Error('Specify an absolute regular file, not a symlink.');}
function valid(db:DatabaseSync){
 const rows=db.prepare('PRAGMA integrity_check').all() as Record<string,unknown>[];if(rows.length!==1||Object.values(rows[0])[0]!=='ok')throw new Error('SQLite integrity check failed.');
 if(db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('SQLite foreign key check failed.');
}
function tables(db:DatabaseSync){return (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as {name:string}[]).map(r=>r.name);}
function columns(db:DatabaseSync,t:string){return (db.prepare(`PRAGMA table_info(${quote(t)})`).all() as {name:string}[]).map(c=>c.name);}
function hashes(db:DatabaseSync,t:string,cols:string[]){
 const stmt=db.prepare(`SELECT ${cols.map(quote).join(',')} FROM ${quote(t)}`);stmt.setReadBigInts(true);
 return (stmt.all() as Record<string,unknown>[]).map(r=>digest(JSON.stringify(cols.map(c=>r[c]),(_,v)=>typeof v==='bigint'?{integer:v.toString()}:v instanceof Uint8Array?{blob:Buffer.from(v).toString('base64')}:v))).sort();
}
function proof(db:DatabaseSync):Record<string,TableProof>{return Object.fromEntries(tables(db).map(t=>{const cols=columns(db,t),h=hashes(db,t,cols);return [t,{columns:cols,count:h.length,digest:digest(JSON.stringify(h))}];}));}
/** Hashes/counts only: manifests never include content, credentials or encrypted tokens. */
function verify(file:string,m:Manifest){const db=new DatabaseSync(file,readonlyOptions);try{valid(db);if(fileHash(file)!==m.sha256||JSON.stringify(proof(db))!==JSON.stringify(m.tables))throw new Error('Backup checksum or logical rows changed.');}finally{db.close();}}
function stage(target:string){if(!path.isAbsolute(target)||existsSync(target))throw new Error('Destination must be a new absolute directory; existing data is never overwritten.');const dir=mkdtempSync(path.join(path.dirname(target),'.cora-restore-stage-'));chmodSync(dir,0o700);return dir;}
function publish(dir:string,target:string){
 // Reserve a new destination exclusively. A concurrent creator causes EEXIST, never replacement.
 mkdirSync(target,{mode:0o700});try{renameSync(dir,target);}catch(e){try{rmdirSync(target);}catch{/* Preserve anything another process placed here. */}throw e;}
}
export function backupDatabase(source:string,target:string){
 regular(source);const dir=stage(target),file=path.join(dir,'studio.sqlite');let db:DatabaseSync|undefined;
 try{
  db=new DatabaseSync(source,readonlyOptions);valid(db);
  // A SQLite snapshot includes committed WAL rows; raw file copying would lose them.
  db.prepare('VACUUM INTO ?').run(file);db.close();db=undefined;chmodSync(file,0o600);
  const snapshot=new DatabaseSync(file,readonlyOptions);let manifest:Manifest;
  try{valid(snapshot);manifest={format:'cora-sqlite-v1',createdAt:new Date().toISOString(),sha256:fileHash(file),tables:proof(snapshot),scope:'database-only'};}finally{snapshot.close();}
  verify(file,manifest);writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600});publish(dir,target);
  return {directory:target,sha256:manifest.sha256,tableCount:Object.keys(manifest.tables).length,scope:manifest.scope};
 }catch(e){db?.close();rmSync(dir,{recursive:true,force:true});throw e;}
}
/** Offline bootstrap only. Constructors migrate schemas without starting workers or contacting providers. */
export function migrateDatabase(file:string){
 const s=new CoraStore(file);try{
  const ig=s.module('instagram',db=>new InstagramConnections(db,{},async()=>{throw new Error('Network forbidden during migration.');}));
  s.module('client-accounts',db=>new ClientAccounts(db,s,ig));s.module('recovery',db=>new DraftRecovery(db));s.module('library',db=>new LibraryStore(db));s.module('ad-creative',db=>new AdCreativeStore(db));s.module('weekly',db=>new WeeklyStore(db));
 }finally{s.close();}
}
function preserved(source:string,target:string){
 const a=new DatabaseSync(source,readonlyOptions),b=new DatabaseSync(target,readonlyOptions);
 try{for(const t of tables(a)){
  const dest=t==='ig_connections'?'ig_accounts':t;if(!tables(b).includes(dest))throw new Error('Original table missing after migration: '+t);
  const cols=columns(a,t),before=hashes(a,t,cols),after=hashes(b,dest,cols);
  // Only schema markers and the legacy Instagram merge may add rows to an existing table.
  if(!['cora_schema_steps','ig_accounts','ig_connections'].includes(t)&&before.length!==after.length)throw new Error('Original row count changed: '+t);
  const counts=new Map<string,number>();for(const h of after)counts.set(h,(counts.get(h)??0)+1);
  for(const h of before){const n=counts.get(h)??0;if(n<1)throw new Error('Original row changed or missing: '+t);counts.set(h,n-1);}
 }}finally{a.close();b.close();}
}
export function restoreDatabase(backupDirectory:string,target:string){
 if(!path.isAbsolute(backupDirectory))throw new Error('Specify an absolute backup directory.');
 const source=path.join(backupDirectory,'studio.sqlite'),manifestFile=path.join(backupDirectory,'manifest.json');regular(source);regular(manifestFile);
 if(lstatSync(manifestFile).size>1_000_000)throw new Error('Manifest too large.');
 const m=JSON.parse(readFileSync(manifestFile,'utf8')) as Manifest;if(m.format!=='cora-sqlite-v1'||m.scope!=='database-only'||!/^[\da-f]{64}$/.test(m.sha256))throw new Error('Unsupported backup manifest.');
 verify(source,m);const dir=stage(target),file=path.join(dir,'studio.sqlite');
 try{
  copyFileSync(source,file);chmodSync(file,0o600);verify(file,m);
  migrateDatabase(file);preserved(source,file);
  const first=new DatabaseSync(file,readonlyOptions);let baseline:Record<string,TableProof>;try{valid(first);baseline=proof(first);}finally{first.close();}
  // Repeat the full bootstrap: prove it cannot widen grants, duplicate content, or change rows.
  migrateDatabase(file);const second=new DatabaseSync(file,readonlyOptions);try{valid(second);if(JSON.stringify(proof(second))!==JSON.stringify(baseline))throw new Error('Migration was not idempotent.');}finally{second.close();}
  preserved(source,file);verify(source,m);
  const report={restoredAt:new Date().toISOString(),backupSha256:m.sha256,originalRowsPreserved:true,migrationRepeated:true,scope:'database-only',filesAndEncryptionKeyRestored:false};
  writeFileSync(path.join(dir,'restore-report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});publish(dir,target);return {directory:target,...report};
 }catch(e){rmSync(dir,{recursive:true,force:true});throw e;}
}
