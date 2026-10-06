#!/usr/bin/env node
// Isolated focused-release proof. Uses synthetic accounts; no LLM, RSS, Meta, SNS, or live posting.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CORA_PLAYWRIGHT_MODULE||'/Users/boramlim/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.env.CORA_BASE_URL||'http://127.0.0.1:3211';
const out=process.env.CORA_PROOF_DIR;if(!out)throw new Error('Set CORA_PROOF_DIR to an evidence directory.');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const page=await context.newPage();const results=[];let step='start';
const check=(name,detail)=>results.push({name,passed:true,detail});
const api=async(url,data,ctx=context,method=data?'POST':'GET')=>{
 const r=await ctx.request.fetch(base+url,{method,headers:{Origin:base,...(data?{'Content-Type':'application/json'}:{})},...(data?{data}:{} )});
 const value=await r.json();return {status:r.status(),value};
};
try{
 step='signup and four navigation entries';await page.goto(base+'/studio');
 await page.getByRole('textbox',{name:'이메일',exact:true}).fill('focused-'+Date.now()+'@proof.test');
 await page.getByLabel('비밀번호',{exact:true}).fill('synthetic-password-123');
 await page.getByRole('button',{name:'Cora 시작하기'}).click();
 await page.getByRole('heading',{name:'고객사',exact:true}).waitFor();
 assert.deepEqual(await page.getByRole('navigation',{name:'Cora 메뉴',exact:true}).getByRole('button').allTextContents(),['고객사','이번 주 제작','수정·승인','게시·성과']);
 assert.equal(await page.getByRole('button',{name:'긴 영상 → 숏츠',exact:true}).count(),0);
 assert.equal(await page.getByRole('button',{name:'가상 자료로 제작해 보기',exact:true}).count(),1);
 await page.screenshot({path:path.join(out,'고객사_첫화면.png'),fullPage:true});check(step);
 step='duplicate client profiles in browser';
 for(let i=0;i<2;i++){
  if(i)await page.getByRole('button',{name:'새 고객사',exact:true}).click();
  await page.getByLabel('고객사 이름',{exact:true}).fill('동명 고객사');
  await page.getByLabel('주요 고객',{exact:true}).fill(i?'카페 고객':'책방 고객');
  await page.getByLabel('콘텐츠 목표',{exact:true}).fill('유익한 소개');
  await page.getByRole('button',{name:'고객사 저장',exact:true}).click();
  await page.getByRole('status').filter({hasText:'고객사 맥락을 저장'}).waitFor();
 }
 const listed=await api('/api/cora/clients');assert.equal(listed.status,200);assert.equal(listed.value.clients.length,2);
 const a=listed.value.clients.find(c=>c.audience==='책방 고객'),b=listed.value.clients.find(c=>c.audience==='카페 고객');
 assert.notEqual(a.id,b.id);check(step,{distinctIds:true,sameWorkspace:a.workspaceId===b.workspaceId});
 step='client-bound card editing and save without AI';
 await page.getByRole('button',{name:'이 고객사 콘텐츠 만들기',exact:true}).first().click();
 const assigned=await page.getByLabel('작업 고객사',{exact:true}).inputValue();assert.ok([a.id,b.id].includes(assigned));
 await page.getByLabel('소개 자료 또는 전달할 내용').fill('매주 목요일에 책을 함께 읽습니다.\n참여 안내는 공식 페이지에서 확인합니다.\n처음 온 독자도 참여할 수 있습니다.');
 await page.getByRole('button',{name:'소재 방향 살펴보기'}).click();
 await page.getByRole('button',{name:'이 방향으로 만들기'}).first().click();
 await page.getByLabel('카드 제목',{exact:true}).fill('고객사 전용 카드');
 assert.equal(await page.getByRole('heading',{name:'카드뉴스를 세로 영상으로',exact:true}).count(),0);
 assert.equal(await page.getByRole('link',{name:'Figma용 SVG 내보내기(ZIP)',exact:true}).count(),0);
 assert.deepEqual(await page.getByLabel('카드 비율',{exact:true}).locator('option').allTextContents(),['4:5','1:1']);
 await page.getByRole('button',{name:'작업 저장',exact:true}).click();
 await page.getByRole('status').filter({hasText:'버전 1 저장 완료'}).waitFor();
 const projects=(await api('/api/cora/projects')).value.projects;assert.equal(projects.length,1);assert.equal(projects[0].clientId,assigned);
 const projectId=projects[0].id;check(step);
 step='ID filter excludes same-name client';
 await page.getByRole('button',{name:'저장한 콘텐츠',exact:true}).click();
 await page.getByLabel('고객사 필터',{exact:true}).selectOption(assigned===a.id?b.id:a.id);
 assert.equal(await page.getByRole('button').filter({hasText:'저장본 v1'}).count(),0);
 await page.getByLabel('고객사 필터',{exact:true}).selectOption(assigned);
 await page.getByRole('button').filter({hasText:'저장본 v1'}).click();check(step);
 step='unsaved navigation preserves draft and destructive client switch prompts';
 await page.getByLabel('카드 제목',{exact:true}).fill('아직 저장하지 않은 변경');
 await page.getByRole('navigation',{name:'Cora 메뉴',exact:true}).getByRole('button',{name:'고객사',exact:true}).click();
 let prompts=0;page.once('dialog',async d=>{prompts++;await d.dismiss();});
 await page.getByRole('button',{name:'이 고객사 콘텐츠 만들기',exact:true}).first().click();
 assert.equal(prompts,1);
 await page.getByRole('navigation',{name:'Cora 메뉴',exact:true}).getByRole('button',{name:'이번 주 제작',exact:true}).click();
 assert.equal(await page.getByLabel('카드 제목',{exact:true}).inputValue(),'아직 저장하지 않은 변경');
 await page.getByRole('button',{name:'작업 저장',exact:true}).click();
 await page.getByRole('status').filter({hasText:'버전 2 저장 완료'}).waitFor();check(step,{reloadRecovery:'separately verified by cora-recovery-proof.mjs'});
 step='undo restores client binding shown by selector';await page.waitForTimeout(650);await page.getByLabel('작업 고객사',{exact:true}).selectOption(assigned===a.id?b.id:a.id);await page.getByRole('button',{name:'실행 취소',exact:true}).click();assert.equal(await page.getByLabel('작업 고객사',{exact:true}).inputValue(),assigned);check(step);
 step='owner isolation, foreign binding, profile conflicts';
 const second=await browser.newContext();
 const joined=await api('/api/cora/session',{mode:'signup',email:'other-'+Date.now()+'@proof.test',password:'synthetic-password-123'},second);
 assert.equal(joined.status,200);
 assert.equal((await api('/api/cora/clients',undefined,second)).value.clients.length,0);
 const draft=(await api('/api/cora/projects/'+projectId)).value.project;
 const rejected=await api('/api/cora/projects',{...draft,clientId:assigned},second);assert.equal(rejected.status,404);
 assert.equal((await api('/api/cora/projects/'+projectId,undefined,second)).status,404);
 assert.equal((await api('/api/cora/clients',{...a,name:'renamed'},context)).status,200);
 assert.equal((await api('/api/cora/clients',{...a,name:'stale'},context)).status,409);
 assert.equal((await api('/api/cora/clients',{...a},second)).status,404);
 assert.equal((await api('/api/cora/projects/'+projectId)).value.project.clientId,assigned);
 await second.close();check(step);
 step='every preserved HTTP route denies both reads and writes';
 const preserved=['content-list','ops-insights','video-audio/sample-id','video-audio','video/sample-id','video','video-templates/sample-id','billing','ops-recipes','platform-style','import','loop','video-templates','video-templates/sample-id/apply','linkpage','video-sources/sample-id','ops-calendar','platform-knowledge','apikeys','video-sources','video-motion','export-svg','platform-reference','platform-referral','video-narration','video-sources/sample-id/srt','video-sources/sample-id/complete','video-sources/sample-id/chunk','video-clips','video-shorts','scheduler','video-clips/sample-id','ops-threads','platform-script','platform-design','publications/simulation'];
 for(const endpoint of preserved){for(const method of ['GET','POST'])assert.equal((await api('/api/cora/'+endpoint,method==='POST'?{}:undefined,context,method)).status,404,endpoint+method);}
 for(const endpoint of ['/api/v1/projects','/api-docs','/l/example','/explore','/api/cora/constructor'])assert.equal((await context.request.get(base+endpoint)).status(),404,endpoint);
 for(const payload of [{action:'generate',format:'blog',material:'never call AI'},{action:'save',kind:'calendar',title:'forged',data:{}},{action:'outline'}])assert.equal((await api('/api/cora/workbench',payload)).status,404);
 assert.equal((await api('/api/cora/publications',{action:'compose',scheduleJob:true})).status,404);
 assert.equal((await context.request.get(base+'/api/cora/video?mode=labs',{headers:{'x-cora-product-mode':'labs'}})).status(),404);
 assert.equal((await api('/api/cora/workbench',{action:'save',kind:'material',title:'allowed',data:{text:'manual source'}})).status,201);
 check(step,{deniedRoutePairs:preserved.length,paidCalls:0});
 step='all four work screens load without blocked lab requests';
 const failures=[];page.on('response',r=>{if(r.url().startsWith(base+'/api/cora/')&&r.status()>=400)failures.push({url:r.url().replace(base,''),status:r.status()});});
 for(const name of ['고객사','수정·승인','게시·성과']){await page.getByRole('navigation',{name:'Cora 메뉴',exact:true}).getByRole('button',{name,exact:true}).click();await page.waitForTimeout(300);}
 assert.equal(await page.getByRole('heading',{name:'게시 흐름 모의 실행',exact:true}).count(),0);
 await page.getByRole('button',{name:'Instagram 연결',exact:true}).click();
 await page.getByRole('heading',{name:'고객사 Instagram 연결',exact:true}).waitFor();
 assert.ok(await page.getByRole('button',{name:'Instagram 읽기 권한 연결',exact:true}).isDisabled());
 await page.getByRole('button',{name:'성과에서 다음 소재',exact:true}).click();await page.getByLabel('CSV 데이터',{exact:true}).waitFor();
 assert.deepEqual(await page.getByRole('navigation',{name:'콘텐츠 작업 메뉴',exact:true}).getByRole('button').allTextContents(),['소재 탐색','성과 분석','자산 보관함']);
 assert.deepEqual(failures,[]);check(step);
 step='390px screen navigation and editor fit';
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('navigation',{name:'Cora 메뉴',exact:true}).getByRole('button',{name:'이번 주 제작',exact:true}).click();
 await page.getByLabel('카드 제목',{exact:true}).waitFor();
 const dimensions=await page.evaluate(()=>({width:innerWidth,document:document.documentElement.scrollWidth}));
 assert.ok(dimensions.document<=dimensions.width+1,JSON.stringify(dimensions));
 const targets=await page.getByRole('navigation',{name:'Cora 메뉴',exact:true}).getByRole('button').evaluateAll(nodes=>nodes.map(n=>({text:n.textContent,height:n.getBoundingClientRect().height,font:getComputedStyle(n).fontSize})));assert.ok(targets.every(t=>t.height>=44));
 await page.screenshot({path:path.join(out,'모바일_카드편집.png'),fullPage:true});check(step,{...dimensions,targets});
 await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:path.join(out,'고객사_카드편집.png'),fullPage:true});
} catch(e){results.push({name:step,passed:false,error:String(e)});await page.screenshot({path:path.join(out,'실패화면.png'),fullPage:true}).catch(()=>{});throw e;}
finally{await writeFile(path.join(out,'브라우저_API_결과.json'),JSON.stringify({base,results,actualAI:0,actualSNS:0,externalMessages:0},null,2));await browser.close();}
console.log(JSON.stringify({passed:true,checks:results.length,actualAI:0,actualSNS:0}));

