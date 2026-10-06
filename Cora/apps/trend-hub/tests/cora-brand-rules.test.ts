import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {CoraStore} from '../lib/cora/store';
import {ClientStore,validateClient} from '../lib/cora/clients';
import {generateCards} from '../lib/cora/content-generation';
import {AdCreativeStore,validateAdAccount,validateAdBrief} from '../lib/cora/ad-creative';
import {sampleBrief,outline,ideasFor,validateDraft,importDraft} from '../lib/cora/model';
import {brandRulesPrompt,validateBrandRules} from '../lib/cora/brand-rules';
import {AccountService} from '../lib/cora/account';
const profile={name:'같은 이름',audience:'독자',goal:'저장',voice:'담백',visualRules:'여백',pillars:'독서',avoid:'단정',accent:'#205b4a',ruleEvidence:'사용자가 확인한 고객사 지침',changeNote:'강요하지 않는 안내'};
const account={handle:'synthetic_only',brand:'outdated',voice:'판매 강요',visualRules:'빨강',pillars:['판매'],avoid:['다른 말'],captions:['기존 독서 소개','책을 읽는 시간','함께 나누는 책 이야기'],accent:'#ff0000'};
const brief={product:'책 모임',facts:'독서 모임',audience:'독자',goal:'awareness',cta:'일정 보기',disclosure:'광고',landingUrl:''};
const draft=()=>outline(sampleBrief,ideasFor(sampleBrief)[0]);
const concept={name:'합성',hook:'책',caption:'광고 · 독서 · 일정 보기',slides:[1,2,3].map(i=>({headline:'책 '+i,body:'책 모임'}))};
const fakeAds=JSON.stringify({concepts:[concept,concept,concept]});
function setup(){const s=new CoraStore(':memory:'),u=s.signup('brand@synthetic.test','password-123456'),c=s.clients.save(u.id,profile);return {s,u,c};}
test('rule saves and audit snapshots commit together; conflicts and foreign owners leave no audit entries',()=>{
 const {s,u,c}=setup();try{const other=s.signup('other@synthetic.test','password-123456');const v2=s.clients.save(u.id,{...profile,voice:'차분',changeNote:'느낌표를 줄여 주세요'},c.id,1);
 assert.equal(v2.version,2);assert.equal(s.clients.history(u.id,c.id).length,2);assert.ok(s.clients.history(u.id,c.id)[0].changedFields.includes('voice'));assert.equal(s.clients.history(u.id,c.id)[0].authorId,u.id);
 assert.throws(()=>s.clients.save(u.id,profile,c.id,1),/CONFLICT/);assert.throws(()=>s.clients.save(other.id,profile,c.id,2),/NOT_FOUND/);assert.equal(s.clients.history(u.id,c.id).length,2);
 const db=s.module('audit-fault',db=>db);db.exec("CREATE TRIGGER audit_failure BEFORE INSERT ON client_rule_history BEGIN SELECT RAISE(ABORT,'injected audit failure'); END");assert.throws(()=>s.clients.save(u.id,profile,c.id,2),/injected audit failure/);assert.equal(s.clients.get(u.id,c.id)!.version,2);assert.equal(s.clients.history(u.id,c.id).length,2);
 }finally{s.close();}
});
test('both content/ad prompts and drafts use identical canonical version, full long rules and revision notes',async()=>{
 const {s,u,c}=setup();try{const long='시각 '.repeat(490),voice='말투 '.repeat(490),avoid='금지 '+ 'x'.repeat(1800)+'\n꼬리금지';s.clients.save(u.id,{...profile,voice,visualRules:long,avoid,changeNote:'다음 제작에서 꼬리금지 표현을 쓰지 말 것'},c.id,1);
 const rules=s.clients.rules(u.id,c.id);let cp='',ap='';const generated=await generateCards({...draft(),clientId:c.id},'판매 강요',rules,'',async p=>{cp=p;return JSON.stringify({slides:draft().slides.map(x=>({headline:x.headline,body:x.body})),caption:'독서'});});
 const ads=s.module('brand-ads',db=>new AdCreativeStore(db)).forClient(c.id);const result=await ads.generate(u.id,account,brief,async p=>{ap=p;return fakeAds;},write=>write(),rules);
 assert.deepEqual(generated.brandRules,result.brandRules);assert.deepEqual(result.concepts[0].draft.brandRules,rules);assert.ok(cp.includes(brandRulesPrompt(rules)));assert.ok(ap.includes(brandRulesPrompt(rules)));assert.ok(cp.includes(rules.visualRules)&&ap.includes(rules.visualRules));assert.ok(cp.includes('꼬리금지')&&ap.includes('꼬리금지'));assert.equal(result.account.voice,voice.trim());assert.equal(result.account.accent,profile.accent);assert.equal(generated.brief.brand,profile.name);assert.equal(generated.brief.accent,profile.accent);assert.equal(result.account.brand,profile.name);
 const saved=s.saveNewAccessible(u.id,generated)!;s.clients.save(u.id,{...profile,voice:'v3'},c.id,2);assert.deepEqual(s.get(u.id,saved.id)!.brandRules,rules);assert.deepEqual(ads.results(u.id)[0].brandRules,rules);assert.deepEqual(validateDraft(saved).brandRules,rules);
 }finally{s.close();}
});
test('empty optional master rules work for scoped ads; long text accepted without silently truncating and oversized refused',()=>{
 const {s,u,c}=setup();try{s.clients.save(u.id,{...profile,voice:'',visualRules:'',pillars:'',avoid:''},c.id,1);const a=validateAdAccount(account,s.clients.rules(u.id,c.id));assert.deepEqual(a.pillars,[]);assert.equal(a.voice,'');assert.equal(a.visualRules,'');assert.equal(validateAdAccount({...account,voice:'x'.repeat(2000),visualRules:'y'.repeat(2000),pillars:['p'.repeat(2000)],avoid:['a'.repeat(2000)]}).voice.length,2000);
 assert.throws(()=>validateAdAccount({...account,voice:'x'.repeat(2001)}));assert.throws(()=>validateAdAccount({...account,pillars:['x'.repeat(1000),'y'.repeat(1000)]}),/2000/);assert.throws(()=>validateClient({...profile,ruleEvidence:'x'.repeat(1001)}));assert.throws(()=>validateClient({...profile,changeNote:'x'.repeat(501)}));
 }finally{s.close();}
});
test('save replaces caller-forged snapshot with actual history; importing clears client provenance and changing client resets it',()=>{
 const {s,u,c}=setup();try{const r=s.clients.rules(u.id,c.id),saved=s.save(u.id,{...draft(),clientId:c.id,brandRules:{...r,evidence:'FORGED',confirmedBy:'FORGED'}})!;assert.equal(saved.brandRules!.evidence,profile.ruleEvidence);assert.equal(saved.brandRules!.confirmedBy,u.id);
 const fresh=s.save(u.id,{...draft(),clientId:c.id})!;assert.equal(fresh.brandRules!.version,1);const imported=importDraft(saved);assert.equal(imported.brandRules,undefined);assert.equal(imported.clientId,undefined);
 const other=s.clients.save(u.id,{...profile,voice:'other'});const moved=s.save(u.id,{...saved,clientId:other.id},saved.id,saved.version)!;assert.equal(moved.brandRules!.clientId,other.id);assert.equal(moved.brandRules!.voice,'other');assert.throws(()=>validateDraft({...saved,clientId:other.id}),/ID/);
 assert.throws(()=>s.save(u.id,{...draft(),clientId:c.id,brandRules:{...r,version:999}}),/버전/);assert.throws(()=>validateBrandRules({...r,changes:Array(6).fill({version:1,note:''})}));
 }finally{s.close();}
});
test('generation keeps captured rule version if rules change during await, with no retries and no old snapshot mutation',async()=>{
 const {s,u,c}=setup();try{const r=s.clients.rules(u.id,c.id);let calls=0;const result=await generateCards({...draft(),clientId:c.id},'',r,'',async()=>{calls++;s.clients.save(u.id,{...profile,voice:'new'},c.id,1);return JSON.stringify({slides:draft().slides,caption:'독서'});});assert.equal(result.brandRules!.version,1);assert.equal(s.clients.get(u.id,c.id)!.version,2);assert.equal(calls,1);assert.equal(s.save(u.id,result)!.brandRules!.version,1);
 await assert.rejects(generateCards({...draft(),clientId:c.id},'',r,'',async()=>'{"slides":[]}'),/장수/);assert.equal(s.list(u.id).length,1);
 }finally{s.close();}
});
test('legacy history backfill is deterministic, only current version known and reopening does not mutate original bodies',()=>{
 const db=new DatabaseSync(':memory:');try{db.exec("PRAGMA foreign_keys=ON;CREATE TABLE users(id TEXT PRIMARY KEY);INSERT INTO users VALUES('u');CREATE TABLE client_workspaces(id TEXT PRIMARY KEY,owner_id TEXT UNIQUE REFERENCES users(id));CREATE TABLE clients(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),workspace_id TEXT REFERENCES client_workspaces(id),body TEXT,version INTEGER,created TEXT,updated TEXT);INSERT INTO client_workspaces VALUES('w','u');");const id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',body=JSON.stringify(profile);db.prepare('INSERT INTO clients VALUES(?,?,?,?,?,?,?)').run(id,'u','w',body,7,'2020','2021');let cs=new ClientStore(db);const first=JSON.stringify(cs.history('u',id));assert.equal(cs.history('u',id).length,1);assert.equal(cs.rules('u',id).confirmedBy,'legacy-unconfirmed');cs=new ClientStore(db);assert.equal(JSON.stringify(cs.history('u',id)),first);assert.equal((db.prepare('SELECT body FROM clients').get() as {body:string}).body,body);assert.throws(()=>cs.rules('u',id,1),/버전/);
 }finally{db.close();}
});
test('history account export and deletion preserve a different owner and do not export shared customer history to editors',async()=>{
 const {s,u,c}=setup();try{const e=s.signup('editor@brand.test','password-123456');let m=s.team.invite(u.id,e.email,'editor',undefined,[c.id]);s.team.respond(e.id,m.id,true,m.version);assert.ok(s.accessibleClient(e.id,c.id));const svc=s.module('account-brand',db=>new AccountService(db));assert.equal(svc.export(e.id).tables.client_rule_history,undefined);assert.equal(svc.export(u.id).tables.client_rule_history.length,1);const other=s.clients.save(e.id,profile);await svc.delete(u.id);assert.ok(s.clients.get(e.id,other.id));assert.equal(s.clients.get(u.id,c.id),null);assert.equal(svc.export(u.id).tables.client_rule_history,undefined);
 }finally{s.close();}
});
test('restoring old rules creates a new version; production context recalls last five notes and can retrieve old versions after 100 updates',()=>{
 const {s,u,c}=setup();try{const old=s.clients.rules(u.id,c.id);for(let i=1;i<=105;i++)s.clients.save(u.id,{...profile,changeNote:'memo '+i},c.id,i);assert.equal(s.clients.history(u.id,c.id).length,100);assert.equal(s.clients.rules(u.id,c.id).changes.length,5);assert.deepEqual(s.clients.rules(u.id,c.id,1),old);
 const restored=s.clients.save(u.id,{...profile,changeNote:'v1을 다시 적용'},c.id,106);assert.equal(restored.version,107);assert.deepEqual(s.clients.rules(u.id,c.id,1),old);
 }finally{s.close();}
});

test('ad audience limit matches the card draft contract before any generator can run',async()=>{
 const {s,u,c}=setup();try{const ads=s.module('boundary-ads',db=>new AdCreativeStore(db)).forClient(c.id);let calls=0;const r=await ads.generate(u.id,account,{...brief,audience:'x'.repeat(160)},async()=>{calls++;return fakeAds;},write=>write(),s.clients.rules(u.id,c.id));assert.equal(r.concepts[0].draft.brief.audience.length,160);assert.throws(()=>validateAdBrief({...brief,audience:'x'.repeat(161)}),/광고 대상/);await assert.rejects(ads.generate(u.id,account,{...brief,audience:'x'.repeat(161)},async()=>{calls++;return fakeAds;}),/광고 대상/);assert.equal(calls,1);
 }finally{s.close();}
});
