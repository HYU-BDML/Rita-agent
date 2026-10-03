// API-level proof for workspace settings (F007/F060/F097/F099) through a logged-in browser context. UI mounting is pending: SettingsDesk/IdeasBoard are not yet mounted in the app shell, so this script does not drive them.
import{createRequire}from'node:module';import{mkdir,writeFile}from'node:fs/promises';import path from'node:path';import assert from'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.CORA_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.CORA_TEST_URL||'http://127.0.0.1:3214',out=process.env.CORA_PROOF_DIR||'test-results/settings';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome'}),result={checks:[],uiMounted:false,note:'UI 화면 연결 전이라 API만 검증함',passed:false};
const ctx=async()=>browser.newContext({timezoneId:'Asia/Seoul'});const[A,B]=await Promise.all([ctx(),ctx()]);
const post=(c,u,d)=>c.request.post(base+u,{headers:{Origin:base},data:d});const get=async(c,u)=>c.request.get(base+u);
async function signup(c,email){const r=await post(c,'/api/cora/session',{mode:'signup',email,password:'Cora-settings-123'});assert.equal(r.status(),200);}
try{const n=Date.now();await signup(A,`ws-a-${n}@example.test`);await signup(B,`ws-b-${n}@example.test`);
 assert.equal((await get(await browser.newContext(),'/api/cora/settings')).status(),401);result.checks.push('로그인 없는 설정 조회는 401');
 // workbench save creates ideas/blog items
 const save=(c,kind,title,data)=>post(c,'/api/cora/workbench',{action:'save',kind,title,data});
 const r1=await save(A,'material','아이디어 하나',{format:'ideas',text:'본문'});assert.equal(r1.status(),201,await r1.text());
 await save(A,'blog','글 하나',{text:'커피 이야기',brand:'골목 카페'});await save(A,'blog','글 둘',{text:'책 이야기',brand:'모퉁이 책방',humanEdited:true});
 let ideas=(await(await get(A,'/api/cora/ideas')).json()).ideas;assert.equal(ideas.length,1);assert.equal(ideas[0].status,'새 아이디어');const id=ideas[0].id;
 assert.equal((await post(A,'/api/cora/ideas',{action:'set-status',id,status:'제작 완료'})).status(),400);result.checks.push('허용되지 않은 상태 이동(새 아이디어 → 제작 완료)은 400');
 assert.equal((await post(A,'/api/cora/ideas',{action:'set-status',id,status:'검토 중'})).status(),200);
 ideas=(await(await get(A,'/api/cora/ideas?status=검토 중')).json()).ideas;assert.equal(ideas.length,1);assert.equal(ideas[0].history.length,1);result.checks.push('상태 이동과 이동 기록 저장, 상태별 조회');
 assert.equal((await post(B,'/api/cora/ideas',{action:'set-status',id,status:'보류'})).status(),404);assert.equal((await(await get(B,'/api/cora/ideas')).json()).ideas.length,0);result.checks.push('다른 계정은 내 아이디어를 보지도 바꾸지도 못함');
 const list=await(await get(A,'/api/cora/content-list?status=수정됨&from=2000-01-01')).json();assert.equal(list.total,1);assert.equal(list.items[0].title,'글 둘');
 assert.equal((await get(A,'/api/cora/content-list?from=2026-02-30')).status(),400);assert.equal((await(await get(B,'/api/cora/content-list')).json()).total,0);result.checks.push('블로그 진행 상태·기간 필터, 잘못된 날짜 400, 계정 분리');
 const s0=await(await get(A,'/api/cora/settings')).json();assert.equal(s0.language,'ko');assert.equal(s0.prefs.length,7);assert.ok(s0.prefs.some(p=>p.kind==='loop_review'));
 assert.equal((await post(A,'/api/cora/settings',{action:'set-language',language:'en'})).status(),200);assert.equal((await post(A,'/api/cora/settings',{action:'set-language',language:'fr'})).status(),400);
 assert.equal((await(await get(A,'/api/cora/settings')).json()).language,'en');assert.equal((await(await get(B,'/api/cora/settings')).json()).language,'ko');result.checks.push('언어 설정은 계정별로 저장, 미지원 언어 400');
 const p=await(await post(A,'/api/cora/settings',{action:'set-pref',kind:'credit_low',inapp:false,email:true})).json();assert.deepEqual(p.prefs.find(x=>x.kind==='credit_low'),{kind:'credit_low',inapp:false,email:true});
 assert.equal((await post(A,'/api/cora/settings',{action:'set-pref',kind:'bogus',inapp:true})).status(),400);assert.equal((await post(A,'/api/cora/settings',{action:'mark-read',id:'nope'})).status(),404);result.checks.push('알림 설정 저장, 잘못된 종류 400, 없는 알림 읽음 처리 404');
 result.checks.push('알림 생성(notify)은 아직 공유 코드에서 호출되지 않아 API로 알림 목록 내용은 검증하지 못함 (단위 테스트로 검증)');
 assert.equal((await A.request.post(base+'/api/cora/settings',{headers:{Origin:'http://evil.example'},data:{action:'mark-all-read'}})).status(),403);result.checks.push('다른 출처의 POST는 403');
 result.passed=true;
}catch(e){result.failure=String(e);throw e;}finally{await writeFile(path.join(out,'settings-proof.json'),JSON.stringify(result,null,2));await browser.close();}
