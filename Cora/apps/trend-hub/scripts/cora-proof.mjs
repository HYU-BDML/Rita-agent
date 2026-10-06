import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CORA_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.CORA_TEST_URL||'http://127.0.0.1:3211';
const out=path.resolve(process.env.CORA_PROOF_DIR||'test-results/cora');await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const errors=[];const report={checks:[],screenshots:[]};
const stamp=Date.now();const password='Cora-proof-password-123!';
async function signup(page,email){await page.goto(`${base}/studio`);await page.getByLabel('이메일',{exact:true}).fill(email);await page.getByLabel('비밀번호',{exact:true}).fill(password);await page.getByRole('button',{name:'Cora 시작하기'}).click();await page.getByRole('button',{name:/예시로 먼저/}).waitFor();}
async function shot(page,name){await page.screenshot({path:path.join(out,name),fullPage:true});report.screenshots.push(name);}
try{
 const ca=await browser.newContext({viewport:{width:1440,height:1050}});const a=await ca.newPage();a.on('pageerror',e=>errors.push(e.message));
 await signup(a,`cora-a-${stamp}@example.test`);report.checks.push('UI signup');
 await a.getByRole('button',{name:/예시로 먼저/}).click();await shot(a,'01-workspace.png');
 await a.getByRole('button',{name:/소재 방향 살펴보기/}).click();await a.getByRole('button',{name:/이 방향으로 만들기/}).first().click();
 await a.getByRole('button',{name:'2번 카드 선택',exact:true}).click();await a.getByLabel('카드 제목',{exact:true}).fill('퇴근 후, 책과 만나는 목요일');await a.getByLabel('카드 본문',{exact:true}).fill('매주 목요일 저녁 7시, 모퉁이 책방에서 함께 책을 읽어요.');
 const img=await a.evaluate(()=>{const c=document.createElement('canvas');c.width=640;c.height=480;const x=c.getContext('2d');x.fillStyle='#d2d8c0';x.fillRect(0,0,640,480);x.fillStyle='#254c3e';x.fillRect(90,90,220,290);x.fillStyle='#ecd0a9';x.fillRect(325,120,190,250);return c.toDataURL('image/png').split(',')[1];});
 await a.locator('label',{hasText:'사진 추가 또는 바꾸기'}).locator('input[type=file]').setInputFiles({name:'owned-test-art.png',mimeType:'image/png',buffer:Buffer.from(img,'base64')});await a.getByRole('button',{name:'사진 빼기'}).waitFor();
 await a.getByRole('button',{name:'카드 뒤로 이동',exact:true}).click();await a.getByLabel('함께 올릴 캡션',{exact:true}).fill('목요일 저녁의 작은 독서 모임. 실제 테스트용 캡션입니다.');
 await a.getByRole('button',{name:'작업 저장',exact:true}).click();await a.getByRole('status').filter({hasText:'버전 1 저장 완료'}).waitFor();
 const listing=await(await ca.request.get(`${base}/api/cora/projects`)).json();const id=listing.projects[0].id;
 let p=(await(await ca.request.get(`${base}/api/cora/projects/${id}`)).json()).project;
 assert.equal(p.slides[2].headline,'퇴근 후, 책과 만나는 목요일');assert.ok(p.slides[2].image?.startsWith('data:image/jpeg'));assert.equal(p.version,1);report.checks.push('UI edit, photo resize, reorder and server save');
 await a.reload();await a.getByRole('button',{name:/콘텐츠 보관함/}).click();await a.getByRole('button').filter({hasText:p.idea}).first().click();await a.getByRole('button',{name:'3번 카드 선택',exact:true}).click();assert.equal(await a.getByLabel('카드 제목',{exact:true}).inputValue(),p.slides[2].headline);report.checks.push('UI reload and reopen preserved edit');await shot(a,'02-editor.png');
 const [download]=await Promise.all([a.waitForEvent('download'),a.getByRole('button',{name:/PNG 묶음 내보내기/}).click()]);await download.saveAs(path.join(out,'cora-export.zip'));report.checks.push('UI PNG ZIP export');
 const stale=await ca.newPage();await stale.goto(`${base}/studio`);await stale.getByRole('button',{name:/콘텐츠 보관함/}).click();await stale.getByRole('button').filter({hasText:p.idea}).first().click();
 await a.getByLabel('함께 올릴 캡션',{exact:true}).fill('새 버전의 캡션');await a.getByRole('button',{name:'작업 저장',exact:true}).click();await a.getByRole('status').filter({hasText:'버전 2 저장 완료'}).waitFor();
 await stale.getByLabel('함께 올릴 캡션',{exact:true}).fill('오래된 창의 캡션');await stale.getByRole('button',{name:'작업 저장',exact:true}).click();await stale.getByRole('alert').filter({hasText:'다른 창에서 수정'}).waitFor();
 p=(await(await ca.request.get(`${base}/api/cora/projects/${id}`)).json()).project;assert.equal(p.caption,'새 버전의 캡션');report.checks.push('Stale UI save rejected without overwriting newer version');
 const cb=await browser.newContext({viewport:{width:1440,height:1050}});const b=await cb.newPage();await signup(b,`cora-b-${stamp}@example.test`);await b.getByRole('button',{name:/콘텐츠 보관함/}).click();await b.getByText('첫 번째 이야기를 기다리고 있어요.').waitFor();
 assert.equal((await cb.request.get(`${base}/api/cora/projects/${id}`)).status(),404);
 assert.equal((await cb.request.put(`${base}/api/cora/projects/${id}`,{headers:{Origin:base},data:{...p,version:2}})).status(),404);
 assert.equal((await ca.request.put(`${base}/api/cora/projects/${id}`,{headers:{Origin:'https://other.example'},data:p})).status(),403);report.checks.push('Account B cannot list/read/write Account A projects; cross-origin mutation blocked');await shot(b,'03-account-isolation.png');
 const anon=await browser.newContext();assert.equal((await anon.request.get(`${base}/api/cora/projects/${id}`)).status(),401);await anon.close();
 await a.getByRole('button',{name:'로그아웃',exact:true}).click();await a.getByLabel('이메일',{exact:true}).waitFor();assert.equal((await ca.request.get(`${base}/api/cora/projects`)).status(),401);
 await a.getByRole('button',{name:/이미 계정이 있나요/}).click();await a.getByLabel('이메일',{exact:true}).fill(`cora-a-${stamp}@example.test`);await a.getByLabel('비밀번호',{exact:true}).fill(password);await a.getByRole('button',{name:'로그인',exact:true}).click();await a.getByRole('button',{name:/예시로 먼저/}).waitFor();report.checks.push('UI logout, revoked session and login');
 await a.setViewportSize({width:390,height:844});await a.goto(base+'/studio');await a.getByRole('button',{name:/예시로 먼저/}).click();assert.ok(await a.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));await shot(a,'04-mobile.png');report.checks.push('390px mobile page fits viewport');
 assert.deepEqual(errors,[]);report.checks.push('No browser page errors');report.passed=true;
}finally{await writeFile(path.join(out,'proof.json'),JSON.stringify({...report,pageErrors:errors},null,2));await browser.close();}
console.log(JSON.stringify(report,null,2));
