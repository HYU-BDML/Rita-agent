import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {CoraStore} from '../lib/cora/store';
import {DraftRecovery} from '../lib/cora/recovery';
import {AccountService} from '../lib/cora/account';
import {outline,ideasFor,sampleBrief,blankBrief} from '../lib/cora/model';
import {validateRecovery} from '../lib/cora/recovery-model';
function setup(){
 const s=new CoraStore(':memory:'),u=s.signup('owner@recovery.test','synthetic-password'),ed=s.signup('editor@recovery.test','synthetic-password'),rv=s.signup('reviewer@recovery.test','synthetic-password'),other=s.signup('other@recovery.test','synthetic-password');
 const c=s.clients.save(u.id,{name:'customer',accent:'#205b4a'}),d={...outline(sampleBrief,ideasFor(sampleBrief)[0]),clientId:c.id},p=s.save(u.id,d)!;
 let now=Date.now();const r=s.module('recovery',db=>new DraftRecovery(db,()=>now)),a=s.module('account',db=>new AccountService(db));
 const payload={kind:'cards' as const,draft:{...d,caption:'unsaved private caption'},source:{projectId:p.id,version:p.version}};
 return {s,u,ed,rv,other,c,d,p,r,a,payload,advance:()=>{now+=31*86400000;}};
}
test('recovery preserves card content, photos and design without changing saved versions or reviews',()=>{
 const f=setup();try{const id=randomUUID(),value={...f.payload,draft:{...f.payload.draft,design:{ratio:'1:1' as const,template:'bold' as const,font:'serif' as const,textScale:1.15},slides:f.d.slides.map((x,i)=>i?x:{...x,image:'data:image/png;base64,aGVsbG8='})}};
 const result=f.r.put(f.u.id,id,null,value);assert.equal(result.version,1);assert.equal(result.payload.kind,'cards');if(result.payload.kind==='cards'){assert.equal(result.payload.draft.caption,value.draft.caption);assert.deepEqual(result.payload.draft.design,value.draft.design);assert.equal(result.payload.draft.slides[0].image,value.draft.slides[0].image);}
 assert.equal(f.s.get(f.u.id,f.p.id)?.version,1);assert.equal(f.s.reviews(f.u.id).length,0);assert.equal(f.r.list(f.u.id).length,1);
 }finally{f.s.close();}
});
test('partial briefing recovery is bounded and cannot smuggle ownership, unsafe URL or approval fields',()=>{
 const value=validateRecovery({kind:'brief',brief:{...blankBrief,material:'partial source'},ownerId:'forged'});assert.deepEqual(value,{kind:'brief',brief:{...blankBrief,material:'partial source'}});
 assert.throws(()=>validateRecovery({kind:'brief',brief:{...blankBrief,material:'x'.repeat(50001)}}));assert.throws(()=>validateRecovery({kind:'brief',brief:{...blankBrief,sourceUrl:'javascript:alert(1)'}}));assert.throws(()=>validateRecovery({kind:'cards',draft:{},source:null}));
});
test('CAS, create-only IDs and discard tombstones stop delayed or stale autosaves',()=>{
 const f=setup();try{const id=randomUUID();f.r.put(f.u.id,id,null,f.payload);assert.throws(()=>f.r.put(f.u.id,id,null,f.payload),/CONFLICT/);const next=f.r.put(f.u.id,id,1,{...f.payload,draft:{...f.d,caption:'new'}});assert.equal(next.version,2);assert.throws(()=>f.r.clear(f.u.id,id,1),/CONFLICT/);f.r.clear(f.u.id,id,2);assert.throws(()=>f.r.put(f.u.id,id,2,f.payload),/NOT_FOUND/);assert.throws(()=>f.r.put(f.u.id,id,null,f.payload),/NOT_FOUND/);assert.equal(f.r.list(f.u.id).length,0);
 }finally{f.s.close();}
});
test('multi-tab snapshots coexist; a saved revision conflict never silently overwrites a project',()=>{
 const f=setup();try{const a=randomUUID(),b=randomUUID();f.r.put(f.u.id,a,null,f.payload);f.r.put(f.u.id,b,null,{...f.payload,draft:{...f.d,caption:'tab B'}});f.s.save(f.u.id,{...f.d,caption:'saved elsewhere'},f.p.id,1);
 const restored=f.r.get(f.u.id,a).payload;assert.equal(f.r.list(f.u.id).length,2);if(restored.kind==='cards'){assert.equal(restored.source?.version,1);assert.throws(()=>f.s.saveAccessible(f.u.id,restored.draft,f.p.id,restored.source!.version),/CONFLICT/);}assert.equal(f.s.get(f.u.id,f.p.id)?.caption,'saved elsewhere');
 }finally{f.s.close();}
});
test('revoked client editor loses recovery list, read, write and account export; reviewer never gets editable recovery',()=>{
 const f=setup();try{const m=f.s.team.invite(f.u.id,f.ed.email,'editor',[],[f.c.id]),active=f.s.team.respond(f.ed.id,m.id,true,m.version),id=randomUUID();f.r.put(f.ed.id,id,null,f.payload);assert.ok(f.a.export(f.ed.id).tables.recovery_drafts);assert.throws(()=>f.r.put(f.rv.id,randomUUID(),null,f.payload),/NOT_FOUND/);
 f.s.team.remove(f.u.id,active.id,active.version);assert.equal(f.r.list(f.ed.id).length,0);assert.throws(()=>f.r.get(f.ed.id,id),/NOT_FOUND/);assert.throws(()=>f.r.put(f.ed.id,id,1,f.payload),/NOT_FOUND/);assert.equal(f.a.export(f.ed.id).tables.recovery_drafts,undefined);assert.equal(f.r.list(f.u.id).length,0);
 }finally{f.s.close();}
});
test('another account and foreign client/source IDs never reveal or write a recovery',()=>{
 const f=setup();try{const id=randomUUID();f.r.put(f.u.id,id,null,f.payload);assert.throws(()=>f.r.get(f.other.id,id),/NOT_FOUND/);assert.throws(()=>f.r.clear(f.other.id,id,1),/NOT_FOUND/);assert.throws(()=>f.r.put(f.other.id,randomUUID(),null,f.payload),/NOT_FOUND/);assert.throws(()=>f.r.put(f.u.id,randomUUID(),null,{...f.payload,source:{projectId:randomUUID(),version:1}}),/NOT_FOUND/);
 }finally{f.s.close();}
});
test('client reassignment cannot be undone by a shared editor through old recovery',()=>{
 const f=setup();try{const b=f.s.clients.save(f.u.id,{name:'customer',accent:'#205b4a'}),m=f.s.team.invite(f.u.id,f.ed.email,'editor',[],[f.c.id,b.id]);f.s.team.respond(f.ed.id,m.id,true,m.version);const id=randomUUID();f.r.put(f.ed.id,id,null,f.payload);f.s.save(f.u.id,{...f.d,clientId:b.id},f.p.id,1);assert.throws(()=>f.r.get(f.ed.id,id),/NOT_FOUND/);assert.equal(f.a.export(f.ed.id).tables.recovery_drafts,undefined);
 }finally{f.s.close();}
});
test('retention and quota are explicit, do not evict active work or reuse discarded IDs',()=>{
 const f=setup();try{for(let i=0;i<30;i++)f.r.put(f.u.id,randomUUID(),null,{kind:'brief',brief:{...blankBrief,material:'partial '+i}});assert.throws(()=>f.r.put(f.u.id,randomUUID(),null,{kind:'brief',brief:blankBrief}),/가득/);assert.equal(f.r.list(f.u.id).length,30);const id=f.r.list(f.u.id)[0].id;f.advance();assert.equal(f.r.list(f.u.id).length,0);assert.throws(()=>f.r.get(f.u.id,id),/NOT_FOUND/);assert.throws(()=>f.r.put(f.u.id,id,null,f.payload),/NOT_FOUND/);f.r.put(f.u.id,randomUUID(),null,f.payload);assert.equal(f.r.list(f.u.id).length,1);
 }finally{f.s.close();}
});
