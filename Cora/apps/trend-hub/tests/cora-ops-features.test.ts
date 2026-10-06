import{test}from'node:test';import assert from'node:assert/strict';
import{CoraStore}from'../lib/cora/store';import{outline,ideasFor,sampleBrief}from'../lib/cora/model';
import type{SimulationProvider}from'../lib/cora/publishing/queue';
import{analyzeCSV,comparePeriods,followerTrend,median,normalizedMetrics,rowsOf,aggregateSummary,SMALL_SAMPLE}from'../lib/cora/analytics';
import{createScheduledPlan}from'../lib/cora/ops/composer';import{monthCalendar}from'../lib/cora/ops/calendar';import{republish,republishHistory}from'../lib/cora/ops/republish';
import{createThread,updateThread,listThreads,getThread,attachThread,deleteThread,exportThreadJson,exportThreadText}from'../lib/cora/ops/threads';
import{RECIPE_TEMPLATES,saveRecipeTemplate}from'../lib/cora/ops/recipes';import{askInsight}from'../lib/cora/ops/insights';import{reportBlocks,renderHtml,renderMarkdown}from'../lib/cora/ops/report';
import{seoulLocalToUtc,toSeoulLocal,monthBounds}from'../lib/cora/ops/time';import{OpsError}from'../lib/cora/ops/errors';

const provider:SimulationProvider={async submit(){return{state:'submitted',submissionId:'sub-1'};},async status(id){return{state:'published',submissionId:id,publicUrl:'https://example.test/post'};}};
function setup(){const s=new CoraStore(':memory:'),a=s.signup('ops-a@example.test','password123'),b=s.signup('ops-b@example.test','password123'),c=s.signup('ops-c@example.test','password123');
 const draft=outline(sampleBrief,ideasFor(sampleBrief)[0]),p=s.save(a.id,draft)!,r=s.requestReview(a.id,p.id,1,b.email)!;s.decideReview(b.id,r.id,'approved','OK');return{s,a,b,c,draft,p,r};}
const inDays=(n:number)=>toSeoulLocal(Date.now()+n*86400_000);
const rejects=(fn:()=>unknown,re:RegExp,status?:number)=>assert.throws(fn,(e:unknown)=>{assert.ok(e instanceof OpsError,String(e));assert.match((e as Error).message,re);if(status)assert.equal((e as OpsError).status,status);return true;});

test('Composer validates input and converts Asia/Seoul wall time to UTC',()=>{const f=setup();try{
 assert.equal(seoulLocalToUtc('2035-01-01T09:00'),'2035-01-01T00:00:00.000Z');assert.equal(seoulLocalToUtc('2035-01-01T00:30'),'2034-12-31T15:30:00.000Z');
 for(const bad of['2035-02-30T09:00','2035-01-01 09:00','2035-01-01T09:00:00Z','2035-13-01T09:00',20350101,null])assert.throws(()=>seoulLocalToUtc(bad),OpsError);
 const ok={reviewId:f.r.id,accountLabel:'책방 IG',localDateTime:inDays(3)};
 rejects(()=>createScheduledPlan(f.s,f.a.id,{...ok,localDateTime:inDays(-1)}),/미래/);
 rejects(()=>createScheduledPlan(f.s,f.a.id,{...ok,localDateTime:'2200-01-01T09:00'}),/2년/);
 rejects(()=>createScheduledPlan(f.s,f.a.id,{...ok,accountLabel:'  '}),/채널/);rejects(()=>createScheduledPlan(f.s,f.a.id,{...ok,accountLabel:'x'.repeat(101)}),/채널/);
 rejects(()=>createScheduledPlan(f.s,f.a.id,{...ok,note:'n'.repeat(501)}),/메모/);rejects(()=>createScheduledPlan(f.s,f.a.id,{...ok,scheduleJob:'yes'}),/선택 값/);
 rejects(()=>createScheduledPlan(f.s,f.a.id,{...ok,reviewId:''}),/승인된 검토/);rejects(()=>createScheduledPlan(f.s,f.a.id,{...ok,reviewId:'missing'}),/찾을 수 없습니다/,404);
 assert.equal(f.s.publications(f.a.id).length,0);assert.equal(f.s.items(f.a.id).filter(i=>i.kind==='calendar').length,0);
 // Pending (not approved) review is refused by the existing preparePublication rule.
 const p2=f.s.save(f.a.id,{...f.draft,caption:'other'})!,r2=f.s.requestReview(f.a.id,p2.id,1,f.b.email)!;void p2;
 assert.throws(()=>createScheduledPlan(f.s,f.a.id,{...ok,reviewId:r2.id}),/승인/);
}finally{f.s.close();}});

test('Composer creates draft + calendar item + optional scheduler job at the scheduled time, and never duplicates',()=>{const f=setup();try{
 const local=inDays(5),whenMs=Date.parse(seoulLocalToUtc(local));
 const first=createScheduledPlan(f.s,f.a.id,{reviewId:f.r.id,accountLabel:'Bookshop IG',localDateTime:local,note:'첫 예약',scheduleJob:false});
 assert.equal(first.duplicate,false);assert.equal(first.plan.jobId,null);assert.equal(first.simulationOnly,true);assert.equal(first.plan.scheduledAt,new Date(whenMs).toISOString());
 assert.equal(f.s.scheduler.list(f.a.id).length,0);
 const cal=f.s.items(f.a.id).filter(i=>i.kind==='calendar');assert.equal(cal.length,1);assert.equal(cal[0].data.status,'planned');assert.equal(cal[0].data.publicationId,first.publication.id);assert.equal(cal[0].data.scheduledAt,new Date(whenMs).toISOString());assert.equal(cal[0].data.note,'첫 예약');
 // Same request with the job ticked: same draft/calendar item, one job added.
 const second=createScheduledPlan(f.s,f.a.id,{reviewId:f.r.id,accountLabel:'  bookshop ig ',localDateTime:local,scheduleJob:true});
 assert.equal(second.duplicate,true);assert.equal(second.publication.id,first.publication.id);assert.equal(second.plan.calendarId,first.plan.calendarId);
 const jobs=f.s.scheduler.list(f.a.id);assert.equal(jobs.length,1);assert.equal(jobs[0].kind,'publication_tick');assert.equal(jobs[0].runAt,whenMs);assert.equal(jobs[0].refId,second.plan.queueId);
 const third=createScheduledPlan(f.s,f.a.id,{reviewId:f.r.id,accountLabel:'Bookshop IG',localDateTime:local,scheduleJob:true});
 assert.equal(third.plan.jobId,jobs[0].id);assert.equal(f.s.scheduler.list(f.a.id).length,1);assert.equal(f.s.items(f.a.id).filter(i=>i.kind==='calendar').length,1);assert.equal(f.s.publications(f.a.id).length,1);
 // A different time is a different plan.
 const other=createScheduledPlan(f.s,f.a.id,{reviewId:f.r.id,accountLabel:'Bookshop IG',localDateTime:inDays(6)});assert.equal(other.duplicate,false);assert.notEqual(other.publication.id,first.publication.id);
 // Cancelled drafts are not silently revived.
 f.s.cancelPublication(f.a.id,other.publication.id);rejects(()=>createScheduledPlan(f.s,f.a.id,{reviewId:f.r.id,accountLabel:'Bookshop IG',localDateTime:inDays(6)}),/취소/,409);
 // Isolation: another account can neither compose from this review nor see the plan.
 rejects(()=>createScheduledPlan(f.s,f.b.id,{reviewId:f.r.id,accountLabel:'x',localDateTime:local}),/찾을 수 없습니다/,404);rejects(()=>createScheduledPlan(f.s,f.c.id,{reviewId:f.r.id,accountLabel:'x',localDateTime:local}),/찾을 수 없습니다/,404);
 assert.equal(f.s.publications(f.c.id).length,0);
}finally{f.s.close();}});

test('Month calendar merges records, uses Seoul days and stays per user',()=>{const f=setup();try{
 // 2035-02-01 00:30 in Seoul is still 2035-01-31 in UTC: it must land in February.
 const feb=createScheduledPlan(f.s,f.a.id,{reviewId:f.r.id,accountLabel:'IG',localDateTime:'2035-02-01T00:30',scheduleJob:true},Date.UTC(2034,0,1));
 assert.equal(feb.plan.scheduledAt,'2035-01-31T15:30:00.000Z');
 const jan=monthCalendar(f.s,f.a.id,'2035-01'),febCal=monthCalendar(f.s,f.a.id,'2035-02');
 assert.equal(jan.entryCount,0);assert.equal(febCal.entryCount,1);
 const day=febCal.weeks.flat().find(c=>c.date==='2035-02-01')!;assert.equal(day.entries.length,1);const e=day.entries[0];
 assert.equal(e.type,'publication');assert.ok(e.calendar&&e.publication&&e.simulation&&e.job);assert.equal(e.job!.state,'active');assert.equal(e.simulation!.state,'queued');assert.equal(e.publication!.effectiveStatus,'awaiting_connection');
 // Grid shape: full weeks, Feb 2035 begins on Thursday (index 4), 28 days.
 assert.ok(febCal.weeks.every(w=>w.length===7));assert.equal(febCal.weeks[0].findIndex(c=>c.date==='2035-02-01'),4);assert.equal(febCal.weeks.flat().filter(c=>c.date).length,28);assert.equal(febCal.prevMonth,'2035-01');assert.equal(febCal.nextMonth,'2035-03');assert.equal(febCal.timezone,'Asia/Seoul');
 // Legacy zone-less calendar item is read as Seoul time; an unreadable one is counted, not shown.
 f.s.addItem(f.a.id,'calendar','옛 계획',{scheduledAt:'2035-02-10T23:30',status:'planned',platform:'Instagram'});f.s.addItem(f.a.id,'calendar','깨진 계획',{scheduledAt:'not-a-date',status:'planned'});
 const again=monthCalendar(f.s,f.a.id,'2035-02');assert.equal(again.weeks.flat().find(c=>c.date==='2035-02-10')!.entries[0].title,'옛 계획');assert.equal(again.invalidCalendarItems,1);
 // Thread attached to a date shows up; another user sees nothing.
 const t=createThread(f.s,f.a.id,{title:'연재',posts:['하나','둘']});attachThread(f.s,f.a.id,t.id,'2035-02-14');
 assert.equal(monthCalendar(f.s,f.a.id,'2035-02').weeks.flat().find(c=>c.date==='2035-02-14')!.entries[0].type,'thread');
 assert.equal(monthCalendar(f.s,f.b.id,'2035-02').entryCount,0);
 // Cancelling the draft is reflected in the merged status.
 f.s.cancelPublication(f.a.id,feb.publication.id);assert.equal(monthCalendar(f.s,f.a.id,'2035-02').weeks.flat().find(c=>c.date==='2035-02-01')!.entries[0].status,'cancelled');
 rejects(()=>monthCalendar(f.s,f.a.id,'2035-13'),/YYYY-MM/);rejects(()=>monthCalendar(f.s,f.a.id,'2035-2'),/YYYY-MM/);
 const b=monthBounds('2035-02');assert.equal(new Date(b.startMs).toISOString(),'2035-01-31T15:00:00.000Z');
}finally{f.s.close();}});

async function publishedSource(f:ReturnType<typeof setup>,local=inDays(2)){
 const plan=createScheduledPlan(f.s,f.a.id,{reviewId:f.r.id,accountLabel:'IG',localDateTime:local,scheduleJob:false});const q=f.s.publicationQueue.enqueue(f.a.id,plan.publication.id,0);
 await f.s.publicationQueue.tick(f.a.id,q,provider,1000);await f.s.publicationQueue.tick(f.a.id,q,provider,20000);assert.equal(f.s.publicationQueue.get(f.a.id,q)!.state,'published');return{plan,q};
}
test('Republish creates a new draft from a completed simulated job, links old to new, and is idempotent',async()=>{const f=setup();try{
 const{plan,q}=await publishedSource(f);
 const r=republish(f.s,f.a.id,{fromQueueId:q,localDateTime:inDays(9),scheduleJob:true});
 assert.equal(r.duplicate,false);assert.notEqual(r.plan.draftId,plan.plan.draftId);assert.equal(r.republishedFrom.queueId,q);assert.ok(r.plan.jobId);
 assert.equal(f.s.publications(f.a.id).length,2);assert.equal(f.s.publicationQueue.get(f.a.id,q)!.state,'published');// old job untouched
 const h=republishHistory(f.s,f.a.id);assert.equal(h.length,1);assert.equal(h[0].fromDraftId,plan.plan.draftId);assert.equal(h[0].toDraftId,r.plan.draftId);assert.equal(h[0].fromState,'published');
 const again=republish(f.s,f.a.id,{fromQueueId:q,localDateTime:inDays(9)});assert.equal(again.plan.draftId,r.plan.draftId);assert.equal(republishHistory(f.s,f.a.id).length,1);
 rejects(()=>republish(f.s,f.a.id,{fromQueueId:q,localDateTime:inDays(-1)}),/미래/);
 rejects(()=>republish(f.s,f.a.id,{fromQueueId:q,localDateTime:toSeoulLocal(Date.parse(plan.plan.scheduledAt))}),/같은 시각/,409);
 rejects(()=>republish(f.s,f.b.id,{fromQueueId:q,localDateTime:inDays(10)}),/찾을 수 없습니다/,404);assert.equal(republishHistory(f.s,f.b.id).length,0);
}finally{f.s.close();}});
test('Republish is refused when the job is not completed, or the content changed or approval was revoked after approval',async()=>{
 {const f=setup();try{const plan=createScheduledPlan(f.s,f.a.id,{reviewId:f.r.id,accountLabel:'IG',localDateTime:inDays(2)});const q=f.s.publicationQueue.enqueue(f.a.id,plan.publication.id,0);rejects(()=>republish(f.s,f.a.id,{fromQueueId:q,localDateTime:inDays(9)}),/완료된 작업만/,409);}finally{f.s.close();}}
 {const f=setup();try{const{q}=await publishedSource(f);f.s.save(f.a.id,{...f.draft,caption:'승인 뒤에 바꾼 문구'},f.p.id,1);rejects(()=>republish(f.s,f.a.id,{fromQueueId:q,localDateTime:inDays(9)}),/승인 이후 원본이 수정/,409);assert.equal(f.s.publications(f.a.id).length,1);assert.equal(republishHistory(f.s,f.a.id).length,0);}finally{f.s.close();}}
 {const f=setup();try{const{q}=await publishedSource(f);f.s.cancelReview(f.a.id,f.r.id);rejects(()=>republish(f.s,f.a.id,{fromQueueId:q,localDateTime:inDays(9)}),/승인이 유효하지 않아/,409);}finally{f.s.close();}}
 {const f=setup();try{const{q}=await publishedSource(f);f.s.delete(f.a.id,f.p.id,1);rejects(()=>republish(f.s,f.a.id,{fromQueueId:q,localDateTime:inDays(9)}),/삭제/,409);}finally{f.s.close();}}
});

test('Thread drafts: 2-10 posts, 500 characters each, quote flag rules, per-user storage, exports',()=>{const f=setup();try{
 const posts=(n:number,len=10)=>Array.from({length:n},(_,i)=>({text:'가'.repeat(len)+i,quotePrevious:i>0}));
 rejects(()=>createThread(f.s,f.a.id,{title:'t',posts:posts(1)}),/2~10개/);rejects(()=>createThread(f.s,f.a.id,{title:'t',posts:posts(11)}),/2~10개/);rejects(()=>createThread(f.s,f.a.id,{title:'',posts:posts(2)}),/제목/);
 rejects(()=>createThread(f.s,f.a.id,{title:'t',posts:[{text:'a'},{text:'가'.repeat(501)}]}),/500자를 넘습니다/);rejects(()=>createThread(f.s,f.a.id,{title:'t',posts:[{text:'a'},{text:'  '}]}),/비어 있습니다/);
 rejects(()=>createThread(f.s,f.a.id,{title:'t',posts:[{text:'a',quotePrevious:true},{text:'b'}]}),/첫 번째 글/);rejects(()=>createThread(f.s,f.a.id,{title:'t',posts:[{text:'a'},{text:'b',quotePrevious:'yes'}]}),/인용 값/);
 rejects(()=>createThread(f.s,f.a.id,{title:'t',posts:posts(2),platform:'facebook'}),/플랫폼/);rejects(()=>createThread(f.s,f.a.id,{title:'t',posts:posts(2),attachDate:'2035-02-30'}),/달력 날짜/);
 // Exactly 500 counts as valid; an emoji is one character.
 const ok=createThread(f.s,f.a.id,{title:'경계',platform:'x',posts:[{text:'가'.repeat(500)},{text:'😀'.repeat(500),quotePrevious:true}],attachDate:'2035-03-05'});assert.equal(ok.posts.length,2);assert.equal(ok.attachDate,'2035-03-05');
 rejects(()=>createThread(f.s,f.a.id,{title:'t',posts:[{text:'a'},{text:'😀'.repeat(501)}]}),/500자/);
 const t=createThread(f.s,f.a.id,{title:'책방 소개',posts:[{text:'첫 글'},{text:'두 번째',quotePrevious:true},{text:'세 번째'}]});
 const txt=exportThreadText(t);assert.match(txt,/1\/3\n첫 글/);assert.match(txt,/2\/3 \[앞 글 인용\]\n두 번째/);assert.match(txt,/3\/3\n세 번째/);assert.ok(!txt.includes('3/3 [앞'));
 const js=exportThreadJson(t);assert.equal(js.posts.length,3);assert.deepEqual(js.posts.map(p=>p.quotePrevious),[false,true,false]);assert.equal(js.posts[1].length,4);assert.equal(js.simulationOnly,true);JSON.parse(JSON.stringify(js));
 // Update, attach, delete and isolation.
 const up=updateThread(f.s,f.a.id,t.id,{title:'책방 소개 v2',posts:['가','나']});assert.equal(up.posts.length,2);assert.equal(attachThread(f.s,f.a.id,t.id,'2035-04-01').attachDate,'2035-04-01');assert.equal(attachThread(f.s,f.a.id,t.id,null).attachDate,null);rejects(()=>attachThread(f.s,f.a.id,t.id,'2035-4-1'),/YYYY-MM-DD/);
 assert.equal(listThreads(f.s,f.b.id).length,0);assert.equal(getThread(f.s,f.b.id,t.id),null);rejects(()=>updateThread(f.s,f.b.id,t.id,{title:'x',posts:['a','b']}),/찾을 수 없습니다/,404);rejects(()=>attachThread(f.s,f.b.id,t.id,'2035-04-01'),/찾을 수 없습니다/,404);assert.equal(deleteThread(f.s,f.b.id,t.id),false);
 assert.equal(deleteThread(f.s,f.a.id,t.id),true);assert.equal(listThreads(f.s,f.a.id).length,1);
}finally{f.s.close();}});

test('Recipe templates: three ready-made recipes saved as the user\'s own automation item',()=>{const f=setup();try{
 assert.deepEqual(RECIPE_TEMPLATES.map(t=>t.title),['주간 소식 요약','시리즈 연재','성과 기반 재가공']);for(const t of RECIPE_TEMPLATES){assert.ok(t.frequency&&t.prompt.length>30&&['blog','script','ideas'].includes(t.format));}
 const r=saveRecipeTemplate(f.s,f.a.id,{templateId:'weekly-digest',brand:'책방'});assert.equal(r.created,true);assert.equal(r.item.kind,'automation');assert.equal(r.item.title,'주간 소식 요약');assert.equal(r.item.data.frequency,'주 1회');assert.equal(r.item.data.brand,'책방');assert.equal(r.item.data.templateId,'weekly-digest');assert.equal(r.item.data.prompt,RECIPE_TEMPLATES[0].prompt);
 assert.equal(f.s.items(f.a.id).filter(i=>i.kind==='automation').length,1);assert.equal(saveRecipeTemplate(f.s,f.a.id,{templateId:'weekly-digest',brand:'책방'}).created,false);assert.equal(f.s.items(f.a.id).filter(i=>i.kind==='automation').length,1);
 const custom=saveRecipeTemplate(f.s,f.a.id,{templateId:'series',title:'내 연재',frequency:'격주'});assert.equal(custom.item.title,'내 연재');assert.equal(custom.item.data.frequency,'격주');
 rejects(()=>saveRecipeTemplate(f.s,f.a.id,{templateId:'nope'}),/찾을 수 없습니다/,404);rejects(()=>saveRecipeTemplate(f.s,f.a.id,{templateId:'series',prompt:'p'.repeat(2001)}),/길이/);rejects(()=>saveRecipeTemplate(f.s,f.a.id,{templateId:'series',title:'  x'.repeat(0)+'y'.repeat(201)}),/길이/);
 assert.equal(f.s.items(f.b.id).filter(i=>i.kind==='automation').length,0);
 // A saved template is a normal recipe: the existing scheduler accepts it, and only its owner.
 assert.equal(f.s.scheduler.schedule(f.a.id,{kind:'recipe_run',refId:r.item.id,intervalMs:86400000}).created,true);assert.throws(()=>f.s.scheduler.schedule(f.b.id,{kind:'recipe_run',refId:r.item.id}),/레시피/);
}finally{f.s.close();}});

const H='date,title,reach,saves,likes,comments,shares,followers\n';
const CSV=H+['2026-08-03,A1,1000,50,100,10,5,1000','2026-08-10,A2,500,10,0,,,1010','2026-08-17,A3,,7,7,7,7,','2026-08-24,A4,200,4,20,2,0,1040','2026-09-07,B1,1000,100,200,20,10,1100','2026-09-14,B2,400,8,40,4,,1150','2026-09-14,B2,400,8,40,4,,1150','2026-09-21,B3,300,3,3,3,3,1300'].join('\n');
test('Analytics: reach-normalized rates treat blanks as missing (not 0), report samples, medians and weighted rates',()=>{
 const a=analyzeCSV(CSV);assert.equal(a.quality.duplicateRows,1);assert.equal(a.columns.shares,true);assert.equal(a.columns.followers,true);assert.equal(a.quality.missing.shares,3);
 const n=normalizedMetrics(rowsOf(a));assert.deepEqual(n.sample,{inputRows:8,duplicateRows:1,uniqueRows:7,reachMissingOrZero:1,reachEligibleRows:6});
 assert.equal(n.metrics.likes.n,6);assert.equal(n.metrics.likes.missing,0);
 // likes/reach: .1, 0, .1, .2, .1, .01 -> a zero is a real value; median of [0,.01,.1,.1,.1,.2] = .1
 assert.ok(Math.abs(n.metrics.likes.median!-0.1)<1e-12);assert.ok(Math.abs(n.metrics.likes.weighted!-(100+0+20+200+40+3)/(1000+500+200+1000+400+300))<1e-12);
 // comments: A2 blank -> missing (n=5), not zero. rates .01,.01,.02,.01,.01 median .01
 assert.equal(n.metrics.comments.n,5);assert.equal(n.metrics.comments.missing,1);assert.ok(Math.abs(n.metrics.comments.median!-0.01)<1e-12);
 // shares: A2 and B2 blank -> n=4; A4 has a real 0.
 assert.equal(n.metrics.shares.n,4);assert.equal(n.metrics.shares.missing,2);assert.ok(n.metrics.shares.smallSample);assert.match(n.metrics.shares.note,/미만/);assert.equal(n.smallSampleThreshold,SMALL_SAMPLE);
 assert.equal(n.perPost.length,6);assert.equal(n.perPost.find(p=>p.title==='A2')!.shareRate,null);assert.equal(n.perPost.find(p=>p.title==='A4')!.shareRate,0);
 assert.equal(median([]),null);assert.equal(median([3,1,2,10]),2.5);
 // Column absent -> unavailable, never filled with zeros.
 const legacy=normalizedMetrics(rowsOf(analyzeCSV('date,title,reach,saves,likes,comments\n2026-09-01,a,100,10,5,1')));assert.equal(legacy.metrics.shares.available,false);assert.equal(legacy.metrics.shares.median,null);assert.equal(legacy.metrics.saves.n,1);
 // saves above reach stay visible but out of the rate.
 const odd=normalizedMetrics(rowsOf(analyzeCSV('date,title,reach,saves,likes,comments\n2026-09-01,a,10,11,5,1\n2026-09-02,b,100,10,5,1')));assert.equal(odd.metrics.saves.inconsistent,1);assert.equal(odd.metrics.saves.n,1);
 // Existing behavior is intact: extra columns do not change the save-rate summary logic.
 assert.match(a.summary,/개 게시물 중/);assert.equal(analyzeCSV(H+'2026-09-01,a,100,10,1,1,,\n2026-09-01,a,100,10,1,1,,').quality.duplicateRows,1);assert.equal(analyzeCSV(H+'2026-09-01,a,100,10,1,1,1,\n2026-09-01,a,100,10,1,1,2,').quality.duplicateRows,0);
});
test('Analytics: period comparison reports counts, medians, sample sizes and small-sample warnings without p-values',()=>{
 const rows=rowsOf(analyzeCSV(CSV));const c=comparePeriods(rows,{from:'2026-08-01',to:'2026-08-31'},{from:'2026-09-01',to:'2026-09-30'});
 assert.equal(c.a.posts,4);assert.equal(c.b.posts,3);assert.equal(c.a.reachMissing,1);assert.equal(c.b.reachMissing,0);assert.equal(c.a.reachMedian,500);assert.equal(c.b.reachMedian,400);
 assert.equal(c.a.metrics.saves.n,3);assert.equal(c.b.metrics.saves.n,3);
 // saves/reach A: .05,.02,.02 (A3 has no reach) median .02 ; B: .1,.02,.01 median .02
 assert.ok(Math.abs(c.a.metrics.saves.median!-0.02)<1e-12);assert.ok(Math.abs(c.b.metrics.saves.median!-0.02)<1e-12);assert.ok(Math.abs(c.differences.saves.medianDiff!)<1e-12);
 assert.equal(c.differences.saves.nA,3);assert.equal(c.differences.saves.nB,3);assert.ok(c.differences.saves.smallSample);assert.ok(c.warnings.some(w=>/표본이 A 3개, B 3개/.test(w)));assert.ok(c.warnings.some(w=>/p값/.test(w)&&/인과/.test(w)));
 assert.ok(!JSON.stringify(c).includes('pValue'));
 // Missing on one side stays null, not 0.
 const one=comparePeriods(rows,{from:'2026-08-01',to:'2026-08-31'},{from:'2027-01-01',to:'2027-01-31'});assert.equal(one.b.posts,0);assert.equal(one.differences.saves.medianDiff,null);assert.ok(one.warnings.some(w=>/게시물이 없어/.test(w)));
 for(const[a,b]of[[{from:'2026-08-01',to:'2026-08-20'},{from:'2026-08-20',to:'2026-08-31'}],[{from:'2026-09-02',to:'2026-09-01'},{from:'2026-10-01',to:'2026-10-02'}],[{from:'2026-8-1',to:'2026-08-31'},{from:'2026-09-01',to:'2026-09-30'}],[{from:'2026-02-30',to:'2026-03-05'},{from:'2026-09-01',to:'2026-09-30'}],[undefined,{from:'2026-09-01',to:'2026-09-30'}]])assert.throws(()=>comparePeriods(rows,a,b));
});
test('Analytics: follower trend needs a followers column, ignores blanks and duplicates, and states thin data',()=>{
 const t=followerTrend(rowsOf(analyzeCSV(CSV)));assert.equal(t.available,true);assert.equal(t.pointCount,6);assert.equal(t.first!.followers,1000);assert.equal(t.last!.followers,1300);assert.equal(t.change,300);assert.ok(Math.abs(t.changePct!-0.3)<1e-12);assert.equal(t.missingRows,1);assert.ok(t.points.every((p,i,a)=>i===0||a[i-1].date<p.date));
 const none=followerTrend(rowsOf(analyzeCSV('date,title,reach,saves,likes,comments\n2026-09-01,a,100,10,5,1')));assert.equal(none.available,false);assert.match(none.reason!,/followers 열이 없어/);
 const thin=followerTrend(rowsOf(analyzeCSV('date,title,reach,saves,likes,comments,followers\n2026-09-01,a,100,10,5,1,500\n2026-09-02,b,100,10,5,1,')));assert.equal(thin.change,null);assert.ok(thin.notes.some(n=>/1개뿐/.test(n)));
 const conflict=followerTrend(rowsOf(analyzeCSV('date,title,reach,saves,likes,comments,followers\n2026-09-01,a,100,10,5,1,500\n2026-09-01,b,100,10,5,1,510')));assert.equal(conflict.conflictingDates,1);assert.equal(conflict.last!.followers,510);
});

const SECRET_A='SECRET_TITLE_ALPHA_' ,SECRET_B='SECRET_TITLE_BRAVO_';
function withAnalysis(f:ReturnType<typeof setup>,csv=CSV.replace('A1',SECRET_A+'1').replace('B1',SECRET_B+'1')){return f.s.addItem(f.a.id,'analysis','수동 자료 진단',analyzeCSV(csv));}
test('AI insight prompt holds only the aggregate table and question, uses the injected generator and saves a disclaimed item',async()=>{const f=setup();try{
 const an=withAnalysis(f);let prompts:string[]=[];const generate=async(uid:string,prompt:string)=>{assert.equal(uid,f.a.id);prompts.push(prompt);return{text:'저장률 중앙값은 2.00%입니다. 표본이 작습니다.',provider:'fake',model:'fake-1',cost:null};};
 const r=await askInsight(f.s,f.a.id,{analysisId:an.id,question:'저장률이 어떤가요?',periods:{a:{from:'2026-08-01',to:'2026-08-31'},b:{from:'2026-09-01',to:'2026-09-30'}}},generate);
 assert.equal(prompts.length,1);const p=prompts[0];
 assert.ok(p.includes('<aggregate_table>')&&p.includes('저장률이 어떤가요?')&&p.includes('표본 수'));assert.ok(p.includes('10.00%'));assert.ok(/기간 비교/.test(p)&&/팔로워 추이/.test(p));
 for(const raw of[SECRET_A,SECRET_B,'A2','A3','B3','2026-08-10','2026-08-17','2026-09-07'])assert.ok(!p.includes(raw),'prompt leaked '+raw);
 assert.equal(r.item.kind,'material');assert.equal(r.item.data.format,'insight');assert.equal(r.item.data.analysisId,an.id);assert.equal(r.item.data.causal,false);assert.match(String(r.item.data.disclaimer),/AI 해석, 인과 아님/);assert.equal(r.item.data.question,'저장률이 어떤가요?');assert.ok(r.item.data.aggregates&&r.item.data.aggregateTable);assert.ok(!JSON.stringify(r.item.data).includes(SECRET_A));
 assert.equal(f.s.items(f.a.id).filter(i=>i.kind==='run').length,1);
 // Validation and isolation. No further paid call may happen for these.
 const never=async()=>{throw new Error('must not be called');};
 for(const q of['',' abc','x'.repeat(501),null])await assert.rejects(()=>askInsight(f.s,f.a.id,{analysisId:an.id,question:q},never),OpsError);
 await assert.rejects(()=>askInsight(f.s,f.b.id,{analysisId:an.id,question:'다른 사람 자료 질문'},never),(e:unknown)=>(e as OpsError).status===404);
 const notAnalysis=f.s.addItem(f.a.id,'blog','글',{text:'x'});await assert.rejects(()=>askInsight(f.s,f.a.id,{analysisId:notAnalysis.id,question:'글에 대해 질문'},never),(e:unknown)=>(e as OpsError).status===404);
 assert.equal(f.s.items(f.a.id).filter(i=>i.kind==='run').length,1);
 // A failing generator still counts as a run and saves nothing.
 await assert.rejects(()=>askInsight(f.s,f.a.id,{analysisId:an.id,question:'실패하는 질문입니다'},async()=>{throw new Error('boom');}),/boom/);assert.equal(f.s.items(f.a.id).filter(i=>i.kind==='run').length,2);assert.equal(f.s.items(f.a.id).filter(i=>i.kind==='material').length,1);
 // Daily limit: 429 before any generator call, like the workbench generate route.
 for(let i=f.s.generationCount(f.a.id);i<10;i++)f.s.addItem(f.a.id,'run','AI 실행 요청',{});
 let called=0;await assert.rejects(()=>askInsight(f.s,f.a.id,{analysisId:an.id,question:'한도를 넘는 질문'},async()=>{called++;return{text:'x',provider:'p',model:'m',cost:null};}),(e:unknown)=>(e as OpsError).status===429);assert.equal(called,0);
}finally{f.s.close();}});

test('Account report exports Markdown and HTML with normalized metrics, comparison and limits; user text is escaped',async()=>{const f=setup();try{
 const evil='<script>alert(1)</script> "q" & \'';const an=f.s.addItem(f.a.id,'analysis','진단',analyzeCSV(CSV.replace('A1','"'+evil.replace(/"/g,'""')+'"').replace('A2','x|y')));
 await askInsight(f.s,f.a.id,{analysisId:an.id,question:'요약해 주세요'},async()=>({text:'<img src=x onerror=alert(1)> 해석',provider:'p',model:'m',cost:null}));
 const r=reportBlocks(f.s,f.a.id,an.id,{a:{from:'2026-08-01',to:'2026-08-31'},b:{from:'2026-09-01',to:'2026-09-30'}});const html=renderHtml(r),md=renderMarkdown(r);
 for(const h of['표본과 결측','노출 대비 반응 비율','팔로워 추이','기간 비교','게시물별 노출 대비 비율','저장된 AI 해석','한계'])assert.ok(html.includes(`<h2>${h}</h2>`)&&md.includes(`## ${h}`),h);
 assert.ok(html.startsWith('<!doctype html>'));assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img'));assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt; &quot;q&quot; &amp; &#39;'));assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));assert.ok(/AI 해석, 인과 아님/.test(html));
 assert.ok(!md.includes('<script>')&&!md.includes('<img'));assert.ok(md.includes('x\\|y'));assert.ok(!/^\|.*\|\s*$/m.test('')||true);
 const mdTableRows=md.split('\n').filter(l=>l.startsWith('| ')&&l.includes('x\\|y'));assert.ok(mdTableRows.length>=1);
 assert.match(md,/p값/);assert.match(md,/표본이 A/);assert.ok(md.startsWith('# 계정 분석 리포트'));
 assert.throws(()=>reportBlocks(f.s,f.b.id,an.id),(e:unknown)=>(e as OpsError).status===404);
 const legacy=f.s.addItem(f.a.id,'analysis','옛 진단',{source:'manual-csv',summary:'옛',rows:[{date:'2026-09-01',title:'t',reach:100,saves:5,likes:5,comments:1,duplicate:false,saveRate:0.05}],warnings:[]});assert.ok(renderHtml(reportBlocks(f.s,f.a.id,legacy.id)).includes('열 없음'));
 const agg=aggregateSummary(an.data);assert.equal(agg.comparison,null);
}finally{f.s.close();}});
