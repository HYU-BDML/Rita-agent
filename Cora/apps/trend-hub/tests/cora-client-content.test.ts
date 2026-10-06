import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {CoraStore} from '../lib/cora/store';
import {LibraryStore,applyTemplate} from '../lib/cora/library';
import {AdCreativeStore} from '../lib/cora/ad-creative';
import {AccountService} from '../lib/cora/account';
import {analyzeCSV} from '../lib/cora/analytics';
import {reportBlocks,renderMarkdown} from '../lib/cora/ops/report';
import {backupDatabase,restoreDatabase,migrateDatabase} from '../lib/cora/database-backup';
import {clientScope} from '../lib/cora/client-scope';
import {outline,ideasFor,sampleBrief} from '../lib/cora/model';
const input={name:'같은 이름',audience:'독자',goal:'저장',voice:'담백하게',visualRules:'여백',pillars:'책',avoid:'과장',accent:'#205b4a'};
const PNG='data:image/png;base64,AA==';
const account={handle:'synthetic_ad',brand:'같은 이름',pillars:['책'],voice:'담백하게',visualRules:'여백',avoid:['과장'],captions:['책 이야기를 합니다.','다음 책을 함께 골라요.','이번 주의 독서입니다.'],accent:'#205b4a'};
const brief={product:'독서 모임',facts:'목요일에 진행합니다.',audience:'독자',goal:'awareness',cta:'저장하세요',disclosure:'광고',landingUrl:''};
const generated=JSON.stringify({concepts:[1,2,3].map(i=>({name:'시안 '+i,hook:'이번 주의 책',caption:'광고 · 책 · 저장하세요',slides:[1,2,3].map(j=>({headline:'책 '+j,body:'목요일 독서 이야기'}))}))});
const csv='date,title,reach,saves,likes,comments\n2026-10-01,합성 게시물,100,3,5,1';
function setup(file=':memory:'){
 const s=new CoraStore(file),owner=s.signup('owner@content.test','synthetic-password'),ed=s.signup('editor@content.test','synthetic-password'),rv=s.signup('reviewer@content.test','synthetic-password'),other=s.signup('other@content.test','synthetic-password');
 const a=s.clients.save(owner.id,input),b=s.clients.save(owner.id,input),foreign=s.clients.save(other.id,input),lib=s.module('library',db=>new LibraryStore(db)),ads=s.module('ads',db=>new AdCreativeStore(db));
 return {s,owner,ed,rv,other,a,b,foreign,lib,ads};
}
function grant(f:ReturnType<typeof setup>,role:'editor'|'reviewer'='editor'){
 const u=role==='editor'?f.ed:f.rv,m=f.s.team.invite(f.owner.id,u.email,role,undefined,[f.a.id]);return f.s.team.respond(u.id,m.id,true,m.version);
}
test('assets: same-name clients, private legacy and other owner rows never merge; editor writes owner workspace',()=>{
 const f=setup();try{
  grant(f);const a=f.lib.forClient(f.a.id),b=f.lib.forClient(f.b.id),t=f.s.withClientAccess(f.ed.id,f.a.id,owner=>a.saveFromBuiltin(owner,'minimal','A only'));
  f.lib.saveFromBuiltin(f.owner.id,'bold','legacy only');b.saveFromBuiltin(f.owner.id,'editorial','B only');
  assert.equal(a.templates(f.owner.id).length,1);assert.equal(b.template(f.owner.id,t.id),null);assert.equal(f.lib.template(f.owner.id,t.id),null);assert.equal(a.template(f.ed.id,t.id),null);
  assert.throws(()=>f.s.withClientAccess(f.ed.id,f.b.id,()=>b.templates(f.owner.id)),/NOT_FOUND/);assert.throws(()=>f.s.withClientAccess(f.other.id,f.a.id,()=>a.templates(f.owner.id)),/NOT_FOUND/);
  const renamed=f.s.clients.save(f.owner.id,{...input,name:'changed'},f.a.id,1);assert.equal(renamed.id,f.a.id);assert.equal(f.s.withClientAccess(f.ed.id,f.a.id,owner=>a.templates(owner))[0].id,t.id);
 }finally{f.s.close();}
});
test('logos and CTAs: defaults, duplicate detection and limits are isolated even for identical brand names',()=>{
 const f=setup();try{const a=f.lib.forClient(f.a.id),b=f.lib.forClient(f.b.id);const a1=a.addLogo(f.owner.id,'A1',PNG,'same'),a2=a.addLogo(f.owner.id,'A2',PNG,'same'),b1=b.addLogo(f.owner.id,'B1',PNG,'same');
  a.setDefaultLogo(f.owner.id,a2.id);assert.equal(b.defaultLogo(f.owner.id,'same')?.id,b1.id);assert.throws(()=>a.setDefaultLogo(f.owner.id,b1.id),/NOT_FOUND/);assert.equal(a.deleteLogo(f.owner.id,b1.id),false);
  a.deleteLogo(f.owner.id,a2.id);assert.equal(a.defaultLogo(f.owner.id,'same')?.id,a1.id);for(let i=0;i<4;i++)a.addLogo(f.owner.id,'A'+i,PNG);assert.throws(()=>a.addLogo(f.owner.id,'over',PNG),/5개/);b.addLogo(f.owner.id,'B2',PNG);
  const ca=a.addCta(f.owner.id,'same phrase','same'),cb=b.addCta(f.owner.id,'same phrase','same');assert.throws(()=>a.addCta(f.owner.id,'same phrase','same'),/이미/);assert.throws(()=>a.useCta(f.owner.id,cb.id),/NOT_FOUND/);assert.equal(b.deleteCta(f.owner.id,ca.id),false);a.useCta(f.owner.id,ca.id);assert.equal(b.ctas(f.owner.id)[0].uses,0);
 }finally{f.s.close();}
});
test('revocation, reviewer and legacy brand-only access cannot read/write new client resources',()=>{
 const f=setup();try{const m=grant(f);grant(f,'reviewer');const a=f.lib.forClient(f.a.id),t=a.saveFromBuiltin(f.owner.id,'minimal');
  f.s.team.update(f.owner.id,m.id,'editor',[],[],m.version);
  for(const u of [f.ed,f.rv,f.other])assert.throws(()=>f.s.withClientAccess(u.id,f.a.id,owner=>a.update(owner,t.id,1,{name:'blocked'})),/NOT_FOUND/);
  assert.equal(a.template(f.owner.id,t.id)?.version,1);const legacy=f.s.team.invite(f.owner.id,f.other.email,'editor',[]);f.s.team.respond(f.other.id,legacy.id,true,legacy.version);assert.throws(()=>f.s.withClientAccess(f.other.id,f.a.id,owner=>a.templates(owner)),/NOT_FOUND/);
 }finally{f.s.close();}
});
test('transaction rollback covers asset create and access revocation in same transaction; nested savepoints do not commit early',()=>{
 const f=setup();try{const m=grant(f),a=f.lib.forClient(f.a.id);
  assert.throws(()=>f.s.withClientAccess(f.ed.id,f.a.id,owner=>{a.saveFromBuiltin(owner,'bold');f.s.module('revoke-inline',db=>db.prepare("UPDATE team_members SET status='removed' WHERE id=?").run(m.id));}),/NOT_FOUND/);
  assert.equal(a.templates(f.owner.id).length,0);assert.ok(f.s.accessibleClient(f.ed.id,f.a.id));
  assert.throws(()=>f.s.withClientAccess(f.ed.id,f.a.id,owner=>{a.addCta(owner,'rollback me');throw new Error('fail');}),/fail/);assert.equal(a.ctas(f.owner.id).length,0);
 }finally{f.s.close();}
});
test('analytics: scoped CSV, report and experiment metadata cannot cross client IDs; scoped list filters before limit',()=>{
 const f=setup();try{grant(f);const result=analyzeCSV(csv),a=f.s.withClientAccess(f.ed.id,f.a.id,owner=>f.s.addScopedItem(owner,f.a.id,'analysis','A analysis',result)),b=f.s.addScopedItem(f.owner.id,f.b.id,'analysis','B analysis',result);
  for(let i=0;i<505;i++)f.s.addItem(f.owner.id,'material','personal',{text:'private'});
  assert.equal(f.s.scopedItems(f.owner.id,f.a.id)[0].id,a.id);assert.equal(f.s.scopedItem(f.owner.id,a.id,null),null);assert.equal(f.s.scopedItem(f.owner.id,b.id,f.a.id),null);
  f.s.addScopedItem(f.owner.id,f.b.id,'material','B interpretation',{format:'insight',analysisId:a.id,text:'B private leak'});
  f.s.addItem(f.owner.id,'material','legacy interpretation',{format:'insight',analysisId:a.id,text:'personal private leak'});
  f.s.addScopedItem(f.owner.id,f.a.id,'material','A interpretation',{format:'insight',analysisId:a.id,text:'A public to editor'});
  const report=f.s.withClientAccess(f.ed.id,f.a.id,owner=>renderMarkdown(reportBlocks(f.s,owner,a.id,undefined,f.a.id)));assert.match(report,/A public to editor/);assert.doesNotMatch(report,/private leak/);
  assert.throws(()=>reportBlocks(f.s,f.owner.id,b.id,undefined,f.a.id),/진단 자료/);assert.throws(()=>f.s.addScopedItem(f.owner.id,f.foreign.id,'analysis','forged',result),/NOT_FOUND/);
 }finally{f.s.close();}
});
test('ads: same handle can have independent profiles; editable drafts and results keep stable client identity',async()=>{
 const f=setup();try{grant(f);const a=f.ads.forClient(f.a.id),b=f.ads.forClient(f.b.id);a.saveProfile(f.owner.id,account);b.saveProfile(f.owner.id,{...account,voice:'B only'});f.ads.saveProfile(f.owner.id,{...account,voice:'legacy only'});
  const owner=f.s.withClientAccess(f.ed.id,f.a.id,id=>id),result=await a.generate(owner,account,brief,async()=>generated,write=>f.s.withClientAccess(f.ed.id,f.a.id,()=>write()));
  assert.equal(result.clientId,f.a.id);assert.ok(result.concepts.every(c=>c.draft.clientId===f.a.id));assert.equal(a.results(f.owner.id).length,1);assert.equal(b.results(f.owner.id).length,0);assert.equal(f.ads.results(f.owner.id).length,0);assert.equal(a.results(f.ed.id).length,0);assert.equal(a.profiles(f.owner.id)[0].voice,'담백하게');assert.equal(b.profiles(f.owner.id)[0].voice,'B only');assert.equal(f.ads.profiles(f.owner.id)[0].voice,'legacy only');
  const draft=applyTemplate(result.concepts[0].draft,f.lib.forClient(f.a.id).saveFromBuiltin(f.owner.id,'bold'));assert.equal(draft.clientId,f.a.id);const p=f.s.saveNewAccessible(f.ed.id,draft);assert.equal(p.clientId,f.a.id);assert.ok(f.s.get(f.owner.id,p.id));
 }finally{f.s.close();}
});
test('ad response after grant revoked on another connection is not persisted or returned',async()=>{
 const dir=mkdtempSync('/tmp/cora-content-race-'),f=setup(dir+'/studio.sqlite'),second=new CoraStore(dir+'/studio.sqlite');try{
  const m=grant(f),a=f.ads.forClient(f.a.id),owner=f.s.withClientAccess(f.ed.id,f.a.id,id=>id);let finish!:(v:string)=>void,calls=0;
  const pending=a.generate(owner,account,brief,async()=>{calls++;return new Promise<string>(r=>finish=r);},write=>f.s.withClientAccess(f.ed.id,f.a.id,()=>write()));
  second.team.update(f.owner.id,m.id,'editor',[],[],m.version);finish(generated);await assert.rejects(pending,/NOT_FOUND/);assert.equal(calls,1);assert.equal(a.results(f.owner.id).length,0);
 }finally{second.close();f.s.close();rmSync(dir,{recursive:true,force:true});}
});
test('permission check before paid generation denies foreign client and reviewer without calling generator',()=>{
 const f=setup();try{grant(f,'reviewer');let calls=0;for(const u of [f.rv,f.other])assert.throws(()=>f.s.withClientAccess(u.id,f.a.id,()=>{calls++;}),/NOT_FOUND/);assert.equal(calls,0);}finally{f.s.close();}
});
test('account export/deletion: shared resources remain owned by agency; removing editor does not delete agency content',async()=>{
 const f=setup();try{grant(f);const a=f.lib.forClient(f.a.id);f.s.withClientAccess(f.ed.id,f.a.id,owner=>a.addCta(owner,'agency owned'));const svc=f.s.module('account',db=>new AccountService(db));assert.equal(svc.export(f.ed.id).tables.library_ctas,undefined);assert.equal(svc.export(f.owner.id).tables.library_ctas.length,1);await svc.delete(f.ed.id);assert.equal(a.ctas(f.owner.id).length,1);assert.throws(()=>f.s.withClientAccess(f.ed.id,f.a.id,owner=>a.ctas(owner)),/NOT_FOUND/);await svc.delete(f.owner.id);assert.equal(a.ctas(f.owner.id).length,0);assert.ok(f.s.clients.get(f.other.id,f.foreign.id));}finally{f.s.close();}
});
test('database-only restore preserves old personal assets and new client bindings across repeated migration',async()=>{
 const dir=mkdtempSync('/tmp/cora-content-backup-'),file=dir+'/studio.sqlite',f=setup(file);try{
  const t=f.lib.saveFromBuiltin(f.owner.id,'minimal','old private'),a=f.lib.forClient(f.a.id),cta=a.addCta(f.owner.id,'A scoped');f.ads.forClient(f.a.id).saveProfile(f.owner.id,account);const item=f.s.addScopedItem(f.owner.id,f.a.id,'analysis','A',analyzeCSV(csv));
  backupDatabase(file,dir+'/backup');restoreDatabase(dir+'/backup',dir+'/restored');migrateDatabase(dir+'/restored/studio.sqlite');const restored=new CoraStore(dir+'/restored/studio.sqlite');try{
   const lib=restored.module('library',db=>new LibraryStore(db));assert.equal(lib.template(f.owner.id,t.id)?.name,'old private');assert.equal(lib.forClient(f.a.id).template(f.owner.id,t.id),null);assert.equal(lib.forClient(f.a.id).ctas(f.owner.id)[0].id,cta.id);assert.equal(restored.scopedItem(f.owner.id,item.id,f.a.id)?.id,item.id);
   assert.equal(restored.module('ads',db=>new AdCreativeStore(db)).forClient(f.a.id).profiles(f.owner.id).length,1);restored.module('check',db=>{assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);return true;});
  }finally{restored.close();}
 }finally{f.s.close();rmSync(dir,{recursive:true,force:true});}
});
test('existing unscoped library/ad/work-item rows migrate additively without assigning same-name client',()=>{
 const dir=mkdtempSync('/tmp/cora-content-old-'),file=dir+'/studio.sqlite';let f=setup(file);const t=f.lib.saveFromBuiltin(f.owner.id,'minimal'),p=f.ads.saveProfile(f.owner.id,account),old=f.s.addItem(f.owner.id,'analysis','legacy',analyzeCSV(csv)),owner=f.owner.id,client=f.a.id;f.s.close();
 // Recreate the historical schema by dropping just newly added columns/tables in this synthetic file.
 const db=new DatabaseSync(file);for(const table of ['library_templates','library_logos','library_ctas','work_items','ad_creatives']){db.exec(`DROP INDEX IF EXISTS ${table}_client;ALTER TABLE ${table} DROP COLUMN client_id`);}db.exec('DROP TABLE ad_client_profiles');db.close();
 const s=new CoraStore(file);try{const lib=s.module('lib',db=>new LibraryStore(db)),ads=s.module('ads',db=>new AdCreativeStore(db));assert.equal(lib.template(owner,t.id)?.id,t.id);assert.equal(lib.forClient(client).templates(owner).length,0);assert.equal(ads.profiles(owner)[0].handle,p.handle);assert.equal(ads.forClient(client).profiles(owner).length,0);assert.equal(s.scopedItem(owner,old.id,null)?.id,old.id);assert.equal(s.scopedItem(owner,old.id,client),null);}finally{s.close();rmSync(dir,{recursive:true,force:true});}
});
test('invalid client scope never silently falls back to personal workspace',()=>{for(const v of [42,{},[],true,' x ','x'.repeat(81)])assert.throws(()=>clientScope(v),/고객사/);assert.equal(clientScope(null),null);assert.equal(clientScope('id'),'id');});
test('explicit personal template/logo/CTA copy preserves original and never reads another scoped client',()=>{
 const f=setup();try{const legacy=f.lib.saveFromBuiltin(f.owner.id,'bold','personal template'),logo=f.lib.addLogo(f.owner.id,'personal logo',PNG),cta=f.lib.addCta(f.owner.id,'personal CTA'),a=f.lib.forClient(f.a.id),b=f.lib.forClient(f.b.id);
  f.s.withClientAccess(f.owner.id,f.a.id,owner=>{a.copyPersonal(owner,'template',legacy.id,legacy.version);a.copyPersonal(owner,'logo',logo.id);a.copyPersonal(owner,'cta',cta.id);});
  assert.equal(f.lib.template(f.owner.id,legacy.id)?.version,1);assert.equal(f.lib.logos(f.owner.id).length,1);assert.equal(f.lib.ctas(f.owner.id)[0].uses,0);assert.equal(a.templates(f.owner.id).length,1);assert.equal(a.logos(f.owner.id).length,1);assert.equal(a.ctas(f.owner.id).length,1);assert.equal(b.templates(f.owner.id).length,0);
  assert.throws(()=>a.copyPersonal(f.owner.id,'template',a.templates(f.owner.id)[0].id,1),/NOT_FOUND/);assert.throws(()=>a.copyPersonal(f.owner.id,'template',legacy.id,0),/CONFLICT/);assert.throws(()=>a.copyPersonal(f.other.id,'logo',logo.id),/NOT_FOUND/);
 }finally{f.s.close();}
});
