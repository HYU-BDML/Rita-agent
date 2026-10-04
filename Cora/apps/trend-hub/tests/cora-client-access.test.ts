import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {CoraStore} from '../lib/cora/store';
import {outline,ideasFor,sampleBrief} from '../lib/cora/model';
import {InstagramConnections,IG_READ_SCOPES,seal} from '../lib/cora/instagram-connect';
import {ClientAccounts,validateBindingVersion} from '../lib/cora/client-accounts';
import {AccountService} from '../lib/cora/account';
const input={name:'同名 고객사',audience:'독자',goal:'저장',voice:'차분하게',visualRules:'여백',pillars:'책',avoid:'과장',accent:'#205b4a'};
function setup(file=':memory:'){
 const s=new CoraStore(file),owner=s.signup('owner@client-access.test','synthetic-password'),ed=s.signup('editor@client-access.test','synthetic-password'),rv=s.signup('reviewer@client-access.test','synthetic-password'),other=s.signup('other@client-access.test','synthetic-password');
 const a=s.clients.save(owner.id,input),b=s.clients.save(owner.id,input),foreign=s.clients.save(other.id,input),draft=outline(sampleBrief,ideasFor(sampleBrief)[0]);
 const p=s.save(owner.id,{...draft,clientId:a.id})!,q=s.save(owner.id,{...draft,clientId:b.id})!;
 return {s,owner,ed,rv,other,a,b,foreign,draft,p,q};
}
function accepted(f:ReturnType<typeof setup>,role:'editor'|'reviewer'='editor',ids=[f.a.id]){const user=role==='editor'?f.ed:f.rv,m=f.s.team.invite(f.owner.id,user.email,role,undefined,ids);return f.s.team.respond(user.id,m.id,true,m.version);}
function accounts(f:ReturnType<typeof setup>){
 let calls=0;
 const ig=f.s.module('test-ig',db=>new InstagramConnections(db,{},async()=>{calls++;throw new Error('network forbidden');}));
 f.s.module('seed-ig',db=>{
  const now=Date.now();for(const [user,id,username,expires] of [[f.owner.id,'101','same_name',now+86400000],[f.owner.id,'102','same_name',now+86400000],[f.owner.id,'103','expired',now-1000],[f.other.id,'201','foreign',now+86400000]] as const)db.prepare('INSERT INTO ig_accounts VALUES (?,?,?,?,?,?,?,?)').run(user,id,username,seal('synthetic-token-'+id,'synthetic-encryption-key'),expires,now,now,IG_READ_SCOPES.join(','));
  return true;
 });
 const service=f.s.module('client-accounts',db=>new ClientAccounts(db,f.s,ig));
 return {ig,service,calls:()=>calls};
}
test('explicit grants isolate duplicate names, require acceptance, and empty selection grants nothing',()=>{
 const f=setup();try{
  const inv=f.s.team.invite(f.owner.id,f.ed.email,'editor',[],[f.a.id]);
  assert.equal(f.s.accessibleClient(f.ed.id,f.a.id),null);assert.equal(f.s.getAccessible(f.ed.id,f.p.id),null);
  f.s.team.respond(f.ed.id,inv.id,true,inv.version);
  assert.equal(f.s.accessibleClient(f.ed.id,f.a.id)?.access,'editor');assert.equal(f.s.accessibleClient(f.ed.id,f.b.id),null);
  assert.equal(f.s.getAccessible(f.ed.id,f.p.id)?.access,'editor');assert.equal(f.s.getAccessible(f.ed.id,f.q.id),null);
  assert.deepEqual(f.s.sharedProjects(f.ed.id).map(p=>p.id),[f.p.id]);assert.deepEqual(f.s.accessibleClients(f.ed.id).map(c=>c.id),[f.a.id]);
  const active=f.s.team.overview(f.owner.id).members[0];f.s.team.update(f.owner.id,active.id,'editor',[],[],active.version);
  assert.deepEqual(f.s.sharedProjects(f.ed.id),[]);assert.equal(f.s.getAccessible(f.ed.id,f.p.id),null);assert.deepEqual(f.s.accessibleClients(f.ed.id),[]);
 }finally{f.s.close();}
});
test('client editor creates and saves in owner workspace with conflict checks; cannot reassign or use owner actions',()=>{
 const f=setup();try{
  accepted(f,'editor',[f.a.id,f.b.id]);const saved=f.s.saveAccessible(f.ed.id,{...f.p,caption:'team edit'},f.p.id,1)!;
  assert.equal(saved.access,'editor');assert.equal(saved.ownerEmail,f.owner.email);assert.equal(f.s.get(f.owner.id,f.p.id)?.caption,'team edit');
  assert.throws(()=>f.s.saveAccessible(f.ed.id,f.p,f.p.id,1),/CONFLICT/);
  assert.throws(()=>f.s.saveAccessible(f.ed.id,{...saved,clientId:f.b.id},f.p.id,2),/소유자/);
  assert.throws(()=>f.s.saveAccessible(f.ed.id,{...saved,clientId:undefined},f.p.id,2),/소유자/);
  const created=f.s.saveNewAccessible(f.ed.id,{...f.draft,clientId:f.a.id});assert.equal(created.access,'editor');assert.ok(f.s.get(f.owner.id,created.id));assert.equal(f.s.list(f.ed.id).length,0);
  assert.throws(()=>f.s.saveNewAccessible(f.rv.id,{...f.draft,clientId:f.a.id}),/NOT_FOUND/);
  assert.throws(()=>f.s.clients.save(f.ed.id,input,f.a.id,1),/NOT_FOUND/);
  assert.equal(f.s.delete(f.ed.id,f.p.id,2),false);assert.throws(()=>f.s.requestReview(f.ed.id,f.p.id,2,f.rv.email),/NOT_FOUND/);
 }finally{f.s.close();}
});
test('grant mutations reject foreign IDs, stale versions and reinvitation shortcuts without altering current access',()=>{
 const f=setup();try{
  assert.throws(()=>f.s.team.invite(f.owner.id,f.ed.email,'editor',[],[f.foreign.id]),/NOT_FOUND/);assert.equal(f.s.team.overview(f.owner.id).members.length,0);
  const active=accepted(f);
  assert.throws(()=>f.s.team.update(f.other.id,active.id,'editor',[],[f.a.id],active.version),/NOT_FOUND/);
  assert.throws(()=>f.s.team.update(f.owner.id,active.id,'editor',[],[f.foreign.id],active.version),/NOT_FOUND/);
  assert.throws(()=>f.s.team.update(f.owner.id,active.id,'editor',[],[],1),/CONFLICT/);
  assert.throws(()=>f.s.team.invite(f.owner.id,f.ed.email,'editor',[],[f.b.id]),/CONFLICT/);
  assert.throws(()=>f.s.team.invite(f.owner.id,f.ed.email,'editor',[]),/CONFLICT/);
  assert.throws(()=>f.s.team.update(f.owner.id,active.id,'editor',[]),/버전|명시/);
  assert.throws(()=>f.s.team.update(f.owner.id,active.id,'editor',[],[f.b.id]),/버전/);assert.throws(()=>f.s.team.remove(f.owner.id,active.id),/버전/);
  assert.ok(f.s.getAccessible(f.ed.id,f.p.id));assert.equal(f.s.getAccessible(f.ed.id,f.q.id),null);
 }finally{f.s.close();}
});
test('reviewers see designated snapshots only; revoking client access blocks reads, lists and decisions',()=>{
 const f=setup();try{
  const m=accepted(f,'reviewer');assert.equal(f.s.accessibleClient(f.rv.id,f.a.id),null);assert.equal(f.s.getAccessible(f.rv.id,f.p.id),null);
  assert.throws(()=>f.s.requestReview(f.owner.id,f.p.id,1,f.other.email),/초대/);
  const review=f.s.requestReview(f.owner.id,f.p.id,1,f.rv.email)!;assert.equal(f.s.review(f.rv.id,review.id)?.snapshot.clientId,f.a.id);assert.equal(f.s.review(f.ed.id,review.id),null);
  assert.throws(()=>f.s.requestReview(f.owner.id,f.q.id,1,f.rv.email),/초대/);
  f.s.team.update(f.owner.id,m.id,'reviewer',[],[],m.version);
  assert.equal(f.s.review(f.rv.id,review.id),null);assert.deepEqual(f.s.reviews(f.rv.id),[]);assert.throws(()=>f.s.decideReview(f.rv.id,review.id,'approved',''),/NOT_FOUND/);
  assert.equal(f.s.review(f.owner.id,review.id)?.status,'pending');
  const account=f.s.module('account',db=>new AccountService(db));assert.equal(account.export(f.rv.id).tables.reviews,undefined);assert.equal(account.export(f.owner.id).tables.reviews.length,1);
 }finally{f.s.close();}
});
test('rename preserves grants; reassignment removes editor access and invalidates previous review version',()=>{
 const f=setup();try{
  accepted(f);accepted(f,'reviewer');const review=f.s.requestReview(f.owner.id,f.p.id,1,f.rv.email)!;
  f.s.clients.save(f.owner.id,{...input,name:'new name'},f.a.id,1);assert.ok(f.s.getAccessible(f.ed.id,f.p.id));
  assert.equal(f.s.team.overview(f.ed.id).memberships[0].clients[0].name,'new name');
  f.s.save(f.owner.id,{...f.p,clientId:f.b.id},f.p.id,1);assert.equal(f.s.getAccessible(f.ed.id,f.p.id),null);
  assert.equal(f.s.review(f.rv.id,review.id)?.effectiveStatus,'stale');assert.throws(()=>f.s.decideReview(f.rv.id,review.id,'approved',''),/CONFLICT/);
 }finally{f.s.close();}
});
test('another database connection revokes grants before subsequent saves and rejects stale permission edits',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'cora-grant-race-')),f=setup(path.join(dir,'store.sqlite'));const second=new CoraStore(path.join(dir,'store.sqlite'));
 try{const active=accepted(f);second.team.update(f.owner.id,active.id,'editor',[],[],active.version);assert.equal(f.s.saveAccessible(f.ed.id,f.p,f.p.id,1),null);assert.throws(()=>f.s.team.update(f.owner.id,active.id,'editor',[],[f.a.id],active.version),/CONFLICT/);assert.equal(f.s.get(f.owner.id,f.p.id)?.version,1);}finally{second.close();f.s.close();rmSync(dir,{recursive:true,force:true});}
});
test('old team table gains additive version/scope fields and never inherits a new client grant on restart',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'cora-old-team-')),file=path.join(dir,'store.sqlite'),db=new DatabaseSync(file);
 db.exec("CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,salt TEXT NOT NULL,hash TEXT NOT NULL); CREATE TABLE team_members(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),member_id TEXT NOT NULL REFERENCES users(id),role TEXT NOT NULL,brands TEXT NOT NULL,status TEXT NOT NULL,created TEXT NOT NULL,updated TEXT NOT NULL,UNIQUE(owner_id,member_id)); INSERT INTO users VALUES ('owner','legacy-owner@test.invalid','salt','hash'),('editor','legacy-editor@test.invalid','salt','hash'); INSERT INTO team_members VALUES ('membership','owner','editor','editor','[]','active','old','old');");db.close();let s=new CoraStore(file);
 try{const c=s.clients.save('owner',input),p=s.save('owner',{...outline(sampleBrief,ideasFor(sampleBrief)[0]),clientId:c.id})!;assert.equal(s.team.overview('editor').memberships[0].scope,'legacy');assert.equal(s.team.overview('editor').memberships[0].version,1);assert.equal(s.getAccessible('editor',p.id),null);s.close();s=new CoraStore(file);assert.equal(s.getAccessible('editor',p.id),null);assert.equal(s.clients.get('owner',c.id)?.id,c.id);}finally{s.close();rmSync(dir,{recursive:true,force:true});}
});
test('Instagram binding uses numeric account ID, stable UUID and version; duplicates cannot be assigned twice',()=>{
 const f=setup();try{const {service,calls}=accounts(f);const x=service.bind(f.owner.id,f.a.id,'101',null);assert.equal(x.username,'same_name');assert.equal(x.access,'read');
  f.s.clients.save(f.owner.id,{...input,name:'renamed'},f.a.id,1);assert.equal(service.view(f.owner.id,f.a.id).binding?.accountId,x.accountId);
  assert.throws(()=>service.bind(f.owner.id,f.b.id,'101',null),/다른 고객사/);
  const changed=service.bind(f.owner.id,f.a.id,'102',x);assert.equal(changed.accountId,x.accountId);assert.equal(changed.version,2);
  assert.throws(()=>service.bind(f.owner.id,f.a.id,'101',x),/CONFLICT/);assert.throws(()=>service.unbind(f.owner.id,f.a.id,x),/CONFLICT/);
  service.bind(f.owner.id,f.b.id,'101',null);assert.equal(calls(),0);
 }finally{f.s.close();}
});
test('Instagram ownership blocks foreign accounts/clients, expired connections and editor binding mutations',()=>{
 const f=setup();try{const {service}=accounts(f);accepted(f);
  assert.throws(()=>service.bind(f.owner.id,f.a.id,'201',null),/NOT_FOUND/);assert.throws(()=>service.bind(f.other.id,f.a.id,'201',null),/NOT_FOUND/);
  assert.throws(()=>service.bind(f.owner.id,f.a.id,'103',null),/만료/);assert.throws(()=>service.bind(f.ed.id,f.a.id,'101',null),/NOT_FOUND/);
  assert.throws(()=>validateBindingVersion(undefined),/버전/);assert.throws(()=>service.bind(f.owner.id,f.a.id,'same_name',null),/ID/);
 }finally{f.s.close();}
});
test('shared editor receives only bound account metadata; token/other choices hidden, revocation immediate',()=>{
 const f=setup();try{const {service,calls}=accounts(f);const active=accepted(f);service.bind(f.owner.id,f.a.id,'101',null);service.bind(f.owner.id,f.b.id,'102',null);
  const view=service.view(f.ed.id,f.a.id);assert.equal(view.access,'editor');assert.equal(view.binding?.igUserId,'101');assert.deepEqual(view.accounts,[]);
  assert.doesNotMatch(JSON.stringify(view),/synthetic-token|"token"|"igUserId":"102"|foreign/);assert.throws(()=>service.view(f.ed.id,f.b.id),/NOT_FOUND/);assert.throws(()=>service.view(f.rv.id,f.a.id),/NOT_FOUND/);
  f.s.team.remove(f.owner.id,active.id,active.version);assert.throws(()=>service.view(f.ed.id,f.a.id),/NOT_FOUND/);assert.equal(calls(),0);
 }finally{f.s.close();}
});
test('disconnect cascades binding; new binding identity prevents stale unbind ABA even at same version',()=>{
 const f=setup();try{const {ig,service}=accounts(f);const old=service.bind(f.owner.id,f.a.id,'101',null);ig.disconnect(f.owner.id,'101');assert.equal(service.view(f.owner.id,f.a.id).binding,null);
  const next=service.bind(f.owner.id,f.a.id,'102',null);assert.notEqual(next.accountId,old.accountId);assert.equal(next.version,old.version);assert.throws(()=>service.unbind(f.owner.id,f.a.id,old),/CONFLICT/);assert.equal(service.view(f.owner.id,f.a.id).binding?.accountId,next.accountId);
  service.unbind(f.owner.id,f.a.id,next);assert.equal(service.view(f.owner.id,f.a.id).binding,null);assert.equal(ig.accounts(f.owner.id).some(a=>a.igUserId==='102'),true);
 }finally{f.s.close();}
});
test('account export strips tokens and deleted memberships/bindings do not leave orphan grants',async()=>{
 const f=setup();try{const {service}=accounts(f);accepted(f);service.bind(f.owner.id,f.a.id,'101',null);
  const account=f.s.module('account',db=>new AccountService(db));const exported=account.export(f.owner.id);assert.equal(exported.tables.client_instagram_bindings.length,1);assert.equal(exported.tables.team_client_grants.length,1);assert.doesNotMatch(JSON.stringify(exported),/synthetic-token|v1\./);
  await account.delete(f.ed.id);assert.equal(f.s.team.canEditClient(f.ed.id,f.owner.id,f.a.id),false);assert.equal(account.export(f.owner.id).tables.team_client_grants,undefined);assert.ok(service.view(f.owner.id,f.a.id).binding);
  await account.delete(f.owner.id);assert.equal(f.s.clients.get(f.owner.id,f.a.id),null);assert.ok(f.s.clients.get(f.other.id,f.foreign.id));
 }finally{f.s.close();}
});
