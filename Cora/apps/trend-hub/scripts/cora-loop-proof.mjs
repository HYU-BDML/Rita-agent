// Browser proof for the core content loop: candidates → human choice → post record → daily metrics → review → accepted action → next batch.
// One real cora_test AI call (AI candidates); everything else is local. Past posts are seeded through the same API the screen uses.
import{createRequire}from'node:module';import{mkdir,writeFile}from'node:fs/promises';import path from'node:path';import assert from'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.CORA_PLAYWRIGHT_MODULE||'playwright');const base=process.env.CORA_TEST_URL||'http://127.0.0.1:3211',out=process.env.CORA_PROOF_DIR||'test-results/loop';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome'});const ctx=await browser.newContext({viewport:{width:1440,height:1200}}),p=await ctx.newPage();p.setDefaultTimeout(30000);const result={checks:[],errors:[],aiCalls:0,passed:false};p.on('pageerror',e=>result.errors.push(e.message));
const api=async(data)=>{const r=await ctx.request.post(base+'/api/cora/loop',{headers:{Origin:base},data,timeout:200000});const v=await r.json();if(!r.ok())throw new Error(`${data.action}: ${v.error}`);return v;};
const DAY=86400000;
try{
 await p.goto(base+'/studio');await p.getByLabel('이메일',{exact:true}).fill(`loop-${Date.now()}@example.test`);await p.getByLabel('비밀번호',{exact:true}).fill('Cora-loop-test-123');await p.getByRole('button',{name:'Cora 시작하기'}).click();await p.getByRole('button',{name:/예시로 먼저/}).waitFor();
 await p.getByRole('button',{name:/콘텐츠 순환/}).click();await p.getByRole('heading',{name:/사람이 고르고/}).waitFor();
 await p.getByText('Instagram 시험 계정 연결 안내',{exact:true}).click();
 await p.getByRole('button',{name:'연결 준비 상태 점검',exact:true}).click();
 await p.getByLabel('Instagram 연결 준비 점검 결과').waitFor();
 assert.match(await p.getByLabel('Instagram 연결 준비 점검 결과').innerText(),/설정 존재와 주소 형식만 점검/);
 const anonymous=await browser.newContext();assert.equal((await anonymous.request.get(base+'/api/cora/connect/instagram?setup=1')).status(),401);await anonymous.close();
 result.checks.push('Instagram 준비 안내·서버 설정 점검 화면과 비로그인 점검 차단');
 await p.getByLabel('순환 브랜드').fill('모퉁이 책방');await p.getByLabel('순환 대상').fill('퇴근 후 조용한 시간을 찾는 직장인');await p.getByLabel('순환 목표').fill('책 모임 참여 안내');
 await p.getByLabel('순환 자료').fill('모퉁이 책방은 독립출판물을 소개하는 작은 동네 책방입니다.\n매주 목요일 저녁 7시에 함께 책을 읽는 모임을 엽니다.\n책 모임은 책방의 예약 페이지에서 신청할 수 있습니다.');
 // ① rules, then one real AI call
 await p.getByLabel('Instagram 연결 상태').filter({hasText:/연결 준비 전|연결되지 않았습니다|연결됨/}).waitFor();result.checks.push('③ Instagram 연결 상태 표시: '+(await p.getByLabel('Instagram 연결 상태').innerText()).slice(0,40));
 await p.getByLabel('순환 후보 수').fill('3');await p.getByRole('button',{name:'규칙으로 후보 만들기(AI 없음)'}).click();await p.getByRole('status').filter({hasText:'규칙으로 후보 3개'}).waitFor();
 assert.equal(await p.getByRole('article').count(),3);result.checks.push('① 규칙으로 서로 다른 시작 방식의 후보 3개 생성(AI 없음)');
 if(process.env.CORA_PROOF_SKIP_AI!=='1'){await p.getByRole('button',{name:'AI로 후보 만들기'}).click();result.aiCalls++;await p.getByRole('status').filter({hasText:/AI가 후보 \d개/}).waitFor({timeout:200000});
 const aiState=await(await ctx.request.get(base+'/api/cora/loop')).json();assert.equal(aiState.current.mode,'ai');const hooks=aiState.candidates.map(c=>c.hook);assert.equal(new Set(hooks).size,hooks.length,'distinct hooks');assert.ok(aiState.candidates.length>=2);result.aiCandidates=aiState.candidates.map(c=>({hook:c.hook,first:c.draft.slides[0].headline}));
 result.checks.push(`① 실제 AI 1회 호출로 후보 ${aiState.candidates.length}개 생성, 시작 방식이 모두 다름(${hooks.join(', ')})`);}
 // ② human choice with a reason; rejection with a reason
 await p.getByRole('button',{name:'후보 1로 결정'}).click();await p.getByRole('alert').filter({hasText:'고른 이유'}).waitFor();
 await p.getByLabel('후보 1 고른 이유 첫 문장이 강함').check();await p.getByRole('button',{name:'후보 1로 결정'}).click();await p.getByRole('status').filter({hasText:'후보를 골랐습니다'}).waitFor();
 await p.getByLabel('후보 2 버린 이유 사실 확인 필요').check();await p.getByRole('button',{name:'후보 2 버리기'}).click();await p.getByRole('status').filter({hasText:'후보를 버렸습니다'}).waitFor();
 const chosen=(await(await ctx.request.get(base+'/api/cora/loop')).json()).candidates.find(c=>c.status==='selected');assert.ok(chosen.projectId);const proj=await ctx.request.get(base+`/api/cora/projects/${chosen.projectId}`);assert.equal(proj.status(),200);
 result.checks.push('② 이유 없이 결정하면 거부되고, 이유를 표시하면 결정·편집 가능한 작업으로 저장됨. 버린 후보도 이유가 기록됨');
 // ③ post record from the chosen candidate (posted 2 days ago)
 const local=new Date(Date.now()-2*DAY-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
 await p.getByLabel('게시한 후보').selectOption(chosen.id);await p.getByLabel('게시 계정').fill('@corner_books');await p.getByLabel('게시 시각').fill(local);await p.getByRole('button',{name:'게시 기록 남기기'}).click();await p.getByRole('status').filter({hasText:'게시 기록을 남겼습니다'}).waitFor();
 let st=await(await ctx.request.get(base+'/api/cora/loop')).json();const mine=st.posts[0];assert.equal(mine.candidateId,chosen.id);assert.equal(mine.hook,chosen.hook);
 result.checks.push('③ 고른 후보로 게시 기록을 남기면 시작 방식·형식이 게시물에 이어짐');
 // Four earlier posts with ordinary results, recorded at day 1 (seeded through the API).
 for(let i=0;i<4;i++){const at=new Date(Date.now()-(i+3)*DAY).toISOString();const r=await api({action:'post',title:`지난 게시물 ${i+1}`,platform:'instagram',accountLabel:'@corner_books',postedAt:at,hook:'question',format:'carousel'});await api({action:'metrics',postId:r.post.id,day:new Date(Date.parse(at)+DAY).toISOString().slice(0,10),reach:1000,saves:20,shares:8,likes:50});}
 // ④ daily metric for the chosen post through the screen, day 1 after posting, saves well above the others
 await p.reload();await p.getByRole('button',{name:/콘텐츠 순환/}).click();await p.getByRole('heading',{name:/사람이 고르고/}).waitFor();
 const day1=new Date(Date.parse(mine.postedAt)+DAY).toISOString().slice(0,10);const t=mine.title;
 await p.getByLabel(`${t} 기록 날짜`).fill(day1);await p.getByLabel(`${t} 도달`).fill('1000');await p.getByLabel(`${t} 저장`).fill('64');await p.getByLabel(`${t} 공유`).fill('30');await p.getByLabel(`${t} 좋아요`).fill('');
 await p.locator(`[aria-label="성과 ${t}"]`).getByRole('button',{name:'기록'}).click();await p.getByRole('status').filter({hasText:'성과를 기록했습니다'}).waitFor();
 st=await(await ctx.request.get(base+'/api/cora/loop')).json();const snap=st.snapshots.find(x=>x.postId===mine.id);assert.equal(snap.ageDays,1);assert.equal(snap.likes,null);assert.equal(snap.saves,64);
 result.checks.push('④ 화면에서 게시 1일째 성과 기록, 빈칸은 0이 아닌 없음으로 저장');
 // ⑤ review → proposed action → accept → next batch starts from the chosen hook
 await p.getByRole('button',{name:'오늘 점검 실행'}).click();await p.getByRole('status').filter({hasText:'점검을 마쳤습니다'}).waitFor();
 const row=p.getByRole('table',{name:'게시물별 점검'}).getByRole('row').filter({hasText:t});await row.filter({hasText:'기준보다 높음'}).waitFor();const rowText=await row.innerText();assert.match(rowText,/3\.20배/);
 const action=p.locator('[aria-label^="할 일 "]').filter({hasText:'시작 방식'}).first();await action.waitFor();await action.getByRole('button',{name:'채택'}).click();await p.getByRole('status').filter({hasText:'할 일을 채택했습니다'}).waitFor();
 result.checks.push('⑤ 점검이 같은 경과일의 다른 게시물 4개와 비교해 저장률 3.20배를 “기준보다 높음”으로 표시하고, 시작 방식을 다시 쓰라는 할 일을 제안, 사람이 채택');
 await p.getByRole('button',{name:'이 할 일로 다음 후보 만들기'}).first().click();await p.locator('p').filter({hasText:'채택한 할 일을 반영해 만듭니다'}).waitFor();
 await p.getByLabel('순환 후보 수').fill('2');await p.getByRole('button',{name:'규칙으로 후보 만들기(AI 없음)'}).click();await p.getByRole('status').filter({hasText:'규칙으로 후보 2개'}).waitFor();
 st=await(await ctx.request.get(base+'/api/cora/loop')).json();assert.ok(st.current.fromActionId);assert.equal(st.candidates[0].hook,chosen.hook,'next batch starts from the accepted hook');
 result.checks.push(`순환 완료: 채택한 할 일로 만든 다음 후보 묶음이 이전에 성과가 높았던 시작 방식(${chosen.hook})부터 시작`);
 await p.screenshot({path:path.join(out,'loop.png'),fullPage:true});assert.deepEqual(result.errors,[]);result.passed=true;
}catch(e){result.failure=String(e);await p.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});throw e;}finally{await writeFile(path.join(out,'loop-proof.json'),JSON.stringify(result,null,2));await browser.close();}console.log(result);
