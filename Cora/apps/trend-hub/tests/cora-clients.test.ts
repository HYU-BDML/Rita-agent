import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {CoraStore} from '../lib/cora/store';
import {validateClient} from '../lib/cora/clients';
import {outline,ideasFor,sampleBrief,validateDraft,importDraft} from '../lib/cora/model';
import {AccountService} from '../lib/cora/account';
const input={name:'동일 이름',audience:'독자',goal:'저장',voice:'차분한 말투',visualRules:'여백',pillars:'책',avoid:'과장',accent:'#205b4a'};
test('clients with duplicate names remain independent with stable workspace IDs, owner isolation and optimistic updates',()=>{
 const s=new CoraStore(':memory:');try{
  const a=s.signup('a@clients.test','test-password-long'),b=s.signup('b@clients.test','test-password-long');
  const x=s.clients.save(a.id,input),y=s.clients.save(a.id,input),other=s.clients.save(b.id,input);
  assert.notEqual(x.id,y.id);assert.equal(x.workspaceId,y.workspaceId);assert.notEqual(x.workspaceId,other.workspaceId);
  assert.equal(s.clients.workspace(a.id),x.workspaceId);assert.equal(s.clients.list(a.id).length,2);assert.equal(s.clients.get(b.id,x.id),null);
  assert.throws(()=>s.clients.save(b.id,{...input,name:'hijack'},x.id,1),/NOT_FOUND/);
  const changed=s.clients.save(a.id,{...input,name:'새 이름'},x.id,1);assert.equal(changed.id,x.id);assert.equal(changed.version,2);
  assert.throws(()=>s.clients.save(a.id,input,x.id,1),/CONFLICT/);assert.equal(s.clients.get(a.id,y.id)?.name,input.name);
 }finally{s.close();}
});
test('legacy projects stay unassigned across a database reopen; binding uses ownership and resets ready status',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'cora-client-migration-'));const file=path.join(dir,'store.sqlite');let s=new CoraStore(file);
 try{
  const a=s.signup('a@migration.test','test-password-long'),b=s.signup('b@migration.test','test-password-long');
  const draft=outline(sampleBrief,ideasFor(sampleBrief)[0]),old=s.save(a.id,{...draft,workStatus:'ready'})!;
  const x=s.clients.save(a.id,{...input,name:sampleBrief.brand}),y=s.clients.save(a.id,{...input,name:sampleBrief.brand}),foreign=s.clients.save(b.id,input);
  s.close();s=new CoraStore(file);assert.equal(s.get(a.id,old.id)?.clientId,undefined);assert.equal(s.clients.list(a.id).length,2);
  assert.throws(()=>s.save(a.id,{...draft,clientId:foreign.id}),/고객사/);
  const assigned=s.save(a.id,{...draft,clientId:x.id,workStatus:'ready'},old.id,old.version)!;assert.equal(assigned.workStatus,'draft');assert.equal(assigned.clientId,x.id);
  s.clients.save(a.id,{...input,name:'renamed'},x.id,1);assert.equal(s.get(a.id,old.id)?.clientId,x.id);assert.equal(s.list(a.id)[0].clientId,x.id);assert.notEqual(s.list(a.id)[0].clientId,y.id);
  assert.equal(importDraft(assigned).clientId,undefined);assert.throws(()=>validateDraft({...draft,clientId:'name-instead-of-id'}),/고객사 ID/);
 }finally{s.close();rmSync(dir,{recursive:true,force:true});}
});
test('legacy brand grants do not silently grant access to new client-ID projects or allow assigning them',()=>{
 const s=new CoraStore(':memory:');try{
  const a=s.signup('owner@team-clients.test','test-password-long'),b=s.signup('editor@team-clients.test','test-password-long');
  const invite=s.team.invite(a.id,b.email,'editor',[]);s.team.respond(b.id,invite.id,true);
  const c=s.clients.save(a.id,input),draft=outline(sampleBrief,ideasFor(sampleBrief)[0]),legacy=s.save(a.id,draft)!,bound=s.save(a.id,{...draft,clientId:c.id})!;
  assert.ok(s.getAccessible(b.id,legacy.id));assert.equal(s.getAccessible(b.id,bound.id),null);
  assert.throws(()=>s.saveAccessible(b.id,{...draft,clientId:c.id},legacy.id,legacy.version),/소유자/);
  assert.equal(s.sharedProjects(b.id).some(p=>p.id===bound.id),false);
 }finally{s.close();}
});
test('client validation bounds fields and account export/delete cover new tables',async()=>{
 assert.throws(()=>validateClient({...input,name:''}),/이름/);assert.throws(()=>validateClient({...input,voice:'x'.repeat(2001)}),/길이/);
 const s=new CoraStore(':memory:');try{
  const a=s.signup('delete@clients.test','test-password-long'),b=s.signup('keep@clients.test','test-password-long');
  const x=s.clients.save(a.id,input),y=s.clients.save(b.id,input);
  const account=s.module('account',db=>new AccountService(db));const exported=account.export(a.id);
  assert.equal(exported.tables.clients.length,1);assert.equal(exported.tables.client_workspaces.length,1);
  await account.delete(a.id);assert.equal(s.clients.get(a.id,x.id),null);assert.ok(s.clients.get(b.id,y.id));
 }finally{s.close();}
});
