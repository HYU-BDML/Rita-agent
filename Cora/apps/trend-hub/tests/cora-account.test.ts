import{test}from'node:test';import assert from'node:assert/strict';import{mkdtempSync,rmSync,mkdirSync,writeFileSync,existsSync}from'node:fs';import{tmpdir}from'node:os';import path from'node:path';
import{CoraStore}from'../lib/cora/store';import{outline,ideasFor,sampleBrief}from'../lib/cora/model';import{AccountService}from'../lib/cora/account';import{BillingStore}from'../lib/cora/billing/credits';
test('Account: export omits secrets; deletion removes owned data, keeps billing records and reviews done for others, and blocks login',async()=>{const dir=mkdtempSync(path.join(tmpdir(),'cora-account-'));const prev=process.env.CORA_DATA_DIR;process.env.CORA_DATA_DIR=dir;const s=new CoraStore(':memory:');try{
 const a=s.signup('acct-a@example.test','password123'),b=s.signup('acct-b@example.test','password123');const draft=outline(sampleBrief,ideasFor(sampleBrief)[0]);
 const pa=s.save(a.id,draft)!;s.save(a.id,{...draft,caption:'v2'},pa.id,1);const pb=s.save(b.id,draft)!;s.saveBrand(a.id,{name:'책방',audience:'x',goal:'y',accent:'#205b4a',notes:''});s.addItem(a.id,'blog','글',{text:'a'});
 const ra=s.requestReview(a.id,pa.id,2,b.email)!;s.decideReview(b.id,ra.id,'approved','ok');const rb=s.requestReview(b.id,pb.id,1,a.email)!;s.decideReview(a.id,rb.id,'approved','ok');const pubB=s.preparePublication(b.id,rb.id,'brand','');
 s.team.respond(b.id,s.team.invite(a.id,b.email,'editor').id,true);s.createSession(a.id);
 const bill=s.module('billing',db=>new BillingStore(db));bill.account(a.id);
 mkdirSync(path.join(dir,'videos',a.id,'v1'),{recursive:true});writeFileSync(path.join(dir,'videos',a.id,'v1','video.mp4'),'x');
 const acct=s.module('account',db=>new AccountService(db));const exp=acct.export(a.id);const text=JSON.stringify(exp);assert.ok(exp.tables.projects&&exp.tables.work_items&&exp.tables.brands);assert.ok(!('sessions'in exp.tables));assert.ok(!/"(salt|hash|token)"/.test(text));
 const r=await acct.delete(a.id);assert.ok(r.deleted.projects>=1);assert.throws(()=>s.login('acct-a@example.test','password123'));assert.equal(s.list(a.id).length,0);assert.equal(s.items(a.id).length,0);assert.equal(s.brands(a.id).length,0);assert.equal(s.review(b.id,ra.id),null);
 assert.ok(s.review(b.id,rb.id),'review A did for B stays in B history');assert.equal(s.publications(b.id)[0].id,pubB.id);assert.equal(s.list(b.id).length,1);assert.equal(s.team.overview(b.id).memberships.length,0);
 assert.ok(bill.history(a.id).length>=1,'billing ledger retained');const fk=(s as unknown as {module:typeof s.module}).module('fkcheck',db=>db.prepare('PRAGMA foreign_key_check').all());assert.deepEqual(fk,[]);assert.equal(existsSync(path.join(dir,'videos',a.id)),false);
}finally{s.close();process.env.CORA_DATA_DIR=prev;rmSync(dir,{recursive:true,force:true});}});
