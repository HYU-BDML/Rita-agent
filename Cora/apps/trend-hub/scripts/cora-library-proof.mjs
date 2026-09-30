// Browser-context API proof for the asset library: templates, logos, CTA phrases, user isolation. No AI calls.
// UI mounting of LibraryDesk (studio view '자산 라이브러리') is pending, so this drives the API through logged-in browser contexts.
import{createRequire}from'node:module';import{mkdir,writeFile}from'node:fs/promises';import path from'node:path';import assert from'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.CORA_PLAYWRIGHT_MODULE||'playwright');const base=process.env.CORA_TEST_URL||'http://127.0.0.1:3212',out=process.env.CORA_PROOF_DIR||'test-results/library';await mkdir(out,{recursive:true});const browser=await chromium.launch({channel:'chrome'});
const ctx=async()=>browser.newContext({viewport:{width:1440,height:1100},timezoneId:'Asia/Seoul'});const[A,B]=await Promise.all([ctx(),ctx()]);const[pa,pb]=await Promise.all([A.newPage(),B.newPage()]);const result={checks:[],errors:[],uiMounted:false,note:'UI mounting pending: LibraryDesk not reachable from studio yet; verified through API in logged-in browser contexts.',passed:false};for(const p of[pa,pb]){p.setDefaultTimeout(20000);p.on('pageerror',e=>result.errors.push(e.message));}
async function signup(page,email){await page.goto(base+'/studio');await page.getByLabel('이메일',{exact:true}).fill(email);await page.getByLabel('비밀번호',{exact:true}).fill('Cora-library-test-123');await page.getByRole('button',{name:'Cora 시작하기'}).click();await page.getByRole('button',{name:/예시로 먼저/}).waitFor();}
const post=(c,data,origin=base)=>c.request.post(base+'/api/cora/library',{headers:{Origin:origin},data});const get=async(c,q='')=>(await c.request.get(base+'/api/cora/library'+q)).json();
const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
try{const n=Date.now();await signup(pa,`lib-a-${n}@example.test`);await signup(pb,`lib-b-${n}@example.test`);
 assert.equal((await (await fetch(base+'/api/cora/library')).status),401);
 // project with a bold/serif design and per-card styles
 await pa.getByRole('button',{name:/예시로 먼저/}).click();await pa.getByRole('button',{name:/소재 방향 살펴보기/}).click();await pa.getByRole('button',{name:/이 방향으로 만들기/}).first().click();await pa.getByRole('button',{name:'작업 저장',exact:true}).click();await pa.getByRole('status').filter({hasText:'버전 1 저장 완료'}).waitFor();
 const own=(await (await A.request.get(base+'/api/cora/projects')).json()).projects[0];const book=(await (await A.request.get(base+'/api/cora/projects/'+own.id)).json()).project;
 const styled={...book,design:{ratio:'1:1',template:'bold',font:'serif',textScale:1.15},slides:book.slides.map((s,i)=>({...s,style:i===0?{align:'center',lineHeight:1.75}:{align:'left'}}))};
 const saved=await A.request.post(base+'/api/cora/projects',{headers:{Origin:base},data:styled});assert.equal(saved.status(),201,await saved.text());const proj=(await saved.json()).project;
 // templates
 let r=await post(A,{action:'save-template',projectId:proj.id,name:'굵은 명조'});assert.equal(r.status(),201,await r.text());let v=await r.json();const t=v.templates[0];assert.equal(t.design.template,'bold');assert.equal(t.styles[0].align,'center');assert.equal(v.builtins.length,3);
 r=await post(A,{action:'save-template',builtin:'minimal'});assert.equal(r.status(),201);v=await r.json();assert.equal(v.templates.length,2);
 r=await post(A,{action:'favorite',id:t.id,favorite:true});v=await r.json();assert.equal(v.templates[0].id,t.id);assert.equal(v.templates[0].favorite,true);
 r=await post(A,{action:'update-template',id:t.id,version:1,name:'굵은 명조 v2'});assert.equal(r.status(),200);r=await post(A,{action:'update-template',id:t.id,version:1,name:'오래된 창'});assert.equal(r.status(),409);
 result.checks.push('Template saved from project, built-in copied, favorited, edited; stale edit returns 409');
 const draftIn={...book,design:{ratio:'4:5',template:'minimal',font:'sans',textScale:1}};r=await post(A,{action:'apply-template',templateId:t.id,draft:draftIn});assert.equal(r.status(),200,await r.text());const applied=(await r.json()).draft;assert.equal(applied.design.template,'bold');assert.equal(applied.slides[0].headline,book.slides[0].headline);assert.equal(applied.slides[0].style.align,'center');result.checks.push('apply-template keeps user text and applies design and styles');
 // isolation
 v=await get(B);assert.deepEqual([v.templates.length,v.logos.length,v.ctas.length],[0,0,0]);for(const d of[{action:'update-template',id:t.id,version:2,name:'탈취'},{action:'favorite',id:t.id},{action:'delete-template',id:t.id},{action:'apply-template',templateId:t.id,draft:book},{action:'save-template',projectId:proj.id,name:'훔침'}])assert.equal((await post(B,d)).status(),404);result.checks.push('Second account sees nothing and gets 404 on every template action against the first account');
 // logos
 r=await post(A,{action:'add-logo',name:'나쁜 로고',data:'data:image/svg+xml;base64,PHN2Zz4='});assert.equal(r.status(),400);
 for(let i=0;i<5;i++){r=await post(A,{action:'add-logo',name:'로고'+i,brand:'모퉁이 책방',data:PNG});assert.equal(r.status(),201);}v=await r.json();assert.equal(v.logos.length,5);assert.equal(v.logos.filter(l=>l.isDefault).length,1);
 assert.equal((await post(A,{action:'add-logo',name:'여섯째',data:PNG})).status(),400);
 r=await post(A,{action:'set-default-logo',id:v.logos[3].id});v=await r.json();assert.equal(v.logos.find(l=>l.isDefault).id,v.logos[3].id);
 assert.equal((await post(B,{action:'delete-logo',id:v.logos[0].id})).status(),404);assert.equal((await post(B,{action:'set-default-logo',id:v.logos[0].id})).status(),404);
 r=await post(A,{action:'delete-logo',id:v.logos[0].id});v=await r.json();assert.equal(v.logos.length,4);result.checks.push('Invalid logo 400, 6th logo 400, default per brand switches, other account 404, delete works');
 // ctas
 assert.equal((await post(A,{action:'add-cta',text:'가'.repeat(201)})).status(),400);
 r=await post(A,{action:'add-cta',text:'프로필 링크에서 신청하세요',brand:'모퉁이 책방'});assert.equal(r.status(),201);await post(A,{action:'add-cta',text:'저장하고 다시 보세요',brand:'골목 카페'});v=await get(A,'?brand='+encodeURIComponent('골목 카페'));assert.equal(v.ctas.length,1);const cid=v.ctas[0].id;
 await post(A,{action:'use-cta',id:cid});r=await post(A,{action:'use-cta',id:cid});v=await r.json();assert.equal(v.used.uses,2);assert.equal((await post(B,{action:'use-cta',id:cid})).status(),404);assert.equal((await post(B,{action:'delete-cta',id:cid})).status(),404);
 assert.equal((await post(A,{action:'add-cta',text:'x'},'https://evil.example')).status(),403);result.checks.push('CTA length 400, brand filter, usage count 2, other account 404, cross-origin POST 403');
 assert.deepEqual(result.errors,[]);result.passed=true;
}catch(e){result.failure=String(e);await pa.screenshot({path:path.join(out,'failure-a.png'),fullPage:true}).catch(()=>{});throw e;}finally{await writeFile(path.join(out,'library-proof.json'),JSON.stringify(result,null,2));await browser.close();}console.log(result);
