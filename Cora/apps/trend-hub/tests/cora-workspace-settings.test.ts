import{test}from'node:test';import assert from'node:assert/strict';
import{CoraStore}from'../lib/cora/store';import{WorkspaceSettings}from'../lib/cora/workspace-settings';
import{filterContent,contentStatus,type ContentItem}from'../lib/cora/blog-filter';
import{sendResendEmail}from'../lib/cora/notify/resend';import{t}from'../lib/cora/i18n';

type Opts=ConstructorParameters<typeof WorkspaceSettings>[1];
function setup(opts?:Opts){const s=new CoraStore(':memory:'),a=s.signup('ws-a@example.test','password123'),b=s.signup('ws-b@example.test','password123');const w=s.module('ws',db=>new WorkspaceSettings(db,opts));return{s,a,b,w};}
const idea=(s:CoraStore,uid:string,title='아이디어')=>s.addItem(uid,'material',title,{format:'ideas',text:`${title} 본문`});
const CFG={CORA_RESEND_API_KEY:'re_test_key',CORA_MAIL_FROM:'Cora <noreply@example.test>'};

test('Ideas: default status, valid lifecycle with history, invalid transitions rejected, filter',()=>{const{s,a,w}=setup();try{
 const i=idea(s,a.id),j=idea(s,a.id,'둘째');s.addItem(a.id,'material','일반 소재',{format:'blog'});
 assert.equal(w.ideas(a.id).length,2);assert.equal(w.ideas(a.id)[0].status,'새 아이디어');
 assert.throws(()=>w.setIdeaStatus(a.id,i.id,'제작 완료'),/옮길 수 없습니다/);assert.throws(()=>w.setIdeaStatus(a.id,i.id,'새 아이디어'),/옮길 수 없습니다/);assert.throws(()=>w.setIdeaStatus(a.id,i.id,'엉뚱'),/알 수 없는/);
 w.setIdeaStatus(a.id,i.id,'검토 중');w.setIdeaStatus(a.id,i.id,'제작 예정');const done=w.setIdeaStatus(a.id,i.id,'제작 완료');
 assert.equal(done.status,'제작 완료');assert.deepEqual(done.history.map(h=>`${h.from}>${h.to}`),['새 아이디어>검토 중','검토 중>제작 예정','제작 예정>제작 완료']);assert.ok(done.history.every(h=>h.by===a.id&&h.at));
 assert.throws(()=>w.setIdeaStatus(a.id,i.id,'보류'),/옮길 수 없습니다/);
 w.setIdeaStatus(a.id,j.id,'보류');assert.deepEqual(w.ideas(a.id,'보류').map(x=>x.id),[j.id]);assert.deepEqual(w.ideas(a.id,'제작 완료').map(x=>x.id),[i.id]);assert.equal(w.ideas(a.id,'새 아이디어').length,0);
 assert.equal(w.setIdeaStatus(a.id,j.id,'새 아이디어').status,'새 아이디어');
 const other=s.addItem(a.id,'material','일반',{format:'blog'});assert.throws(()=>w.setIdeaStatus(a.id,other.id,'검토 중'),/NOT_FOUND/);
}finally{s.close();}});

test('Ideas: isolation between users and cascade delete',()=>{const{s,a,b,w}=setup();try{
 const i=idea(s,a.id);assert.deepEqual(w.ideas(b.id),[]);assert.throws(()=>w.setIdeaStatus(b.id,i.id,'검토 중'),/NOT_FOUND/);
 w.setIdeaStatus(a.id,i.id,'검토 중');assert.equal(w.ideas(a.id)[0].status,'검토 중');
 s.removeItem(a.id,i.id);assert.deepEqual(w.ideas(a.id),[]);
}finally{s.close();}});

const mk=(id:string,createdAt:string,o:Partial<ContentItem>&{data?:Record<string,unknown>}={}):ContentItem=>({id,kind:'blog',title:`글 ${id}`,createdAt,...o,data:{text:`본문 ${id}`,...(o.data??{})}});

test('Blog filter: derived status, brand, keyword, kind',()=>{
 const items=[mk('a','2026-03-01T00:00:00Z'),mk('b','2026-03-02T00:00:00Z',{data:{humanEdited:true,brand:'모퉁이 책방'}}),mk('c','2026-03-03T00:00:00Z',{kind:'script',data:{humanEdited:true,approvedAt:'2026-03-03T01:00:00Z',brand:'골목 카페'}}),mk('d','2026-03-04T00:00:00Z',{kind:'material'})];
 assert.deepEqual(['a','b','c'].map(id=>contentStatus(items.find(i=>i.id===id)!)),['초안','수정됨','승인됨']);
 assert.deepEqual(filterContent(items).items.map(i=>i.id),['c','b','a']);
 assert.deepEqual(filterContent(items,{status:'수정됨'}).items.map(i=>i.id),['b']);assert.deepEqual(filterContent(items,{brand:'카페'}).items.map(i=>i.id),['c']);
 assert.deepEqual(filterContent(items,{keyword:'본문 A'}).items.map(i=>i.id),['a']);assert.deepEqual(filterContent(items,{kind:'script'}).items.map(i=>i.id),['c']);
 assert.throws(()=>filterContent(items,{status:'없음'}),/진행 상태/);assert.throws(()=>filterContent(items,{kind:'material'}),/종류/);
});

test('Blog filter: date range uses Asia/Seoul day boundaries (inclusive from, inclusive to-day)',()=>{
 const items=[mk('before','2026-03-01T14:59:59.999Z'),mk('start','2026-03-01T15:00:00.000Z'),mk('end','2026-03-02T14:59:59.999Z'),mk('after','2026-03-02T15:00:00.000Z')];
 // KST 3/2 = 2026-03-01T15:00Z .. 2026-03-02T14:59:59.999Z
 assert.deepEqual(filterContent(items,{from:'2026-03-02',to:'2026-03-02'}).items.map(i=>i.id),['end','start']);
 assert.deepEqual(filterContent(items,{from:'2026-03-03'}).items.map(i=>i.id),['after']);assert.deepEqual(filterContent(items,{to:'2026-03-01'}).items.map(i=>i.id),['before']);
 assert.throws(()=>filterContent(items,{from:'2026-03-05',to:'2026-03-01'}),/늦습니다/);assert.throws(()=>filterContent(items,{from:'2026-02-30'}),/존재하지/);assert.throws(()=>filterContent(items,{from:'3/1'}),/YYYY-MM-DD/);
});

test('Blog filter: limit clamps to 50 and cursor pages are stable under inserts, no dup/skip',()=>{
 const items=Array.from({length:120},(_,n)=>mk(`i${String(n).padStart(3,'0')}`,new Date(Date.UTC(2026,0,1)+Math.floor(n/2)*60000).toISOString()));// pairs share a timestamp
 assert.equal(filterContent(items,{limit:999}).items.length,50);assert.equal(filterContent(items,{limit:'x'}).items.length,20);assert.equal(filterContent(items,{limit:0}).items.length,20);
 const seen:string[]=[];let cur:string|undefined,pages=0;
 for(;;){const r=filterContent(items,{limit:7,cursor:cur});seen.push(...r.items.map(i=>i.id));pages++;
  if(pages===2)items.push(mk('new','2027-01-01T00:00:00Z'));// newest insert mid-pagination must not shift later pages
  if(!r.nextCursor)break;cur=r.nextCursor;}
 assert.equal(seen.length,120);assert.equal(new Set(seen).size,120);assert.ok(!seen.includes('new'));
 assert.throws(()=>filterContent(items,{cursor:'%%'}),/커서/);
});

test('Notify: respects prefs (in-app default on, email default off), unread ordering, mark read, isolation',async()=>{const{s,a,b,w}=setup();try{
 assert.deepEqual(w.prefs(a.id).map(p=>[p.kind,p.inapp,p.email]),[['review_requested',true,false],['review_decided',true,false],['publish_result',true,false],['schedule_failed',true,false],['team_invite',true,false],['credit_low',true,false],['loop_review',true,false]]);
 assert.deepEqual(await w.notify(a.id,'review_requested',{title:'검토 요청',link:'/studio'}),{inapp:true,email:'skipped'});
 w.setPref(a.id,'publish_result',{inapp:false});assert.deepEqual(await w.notify(a.id,'publish_result',{title:'게시 완료'}),{inapp:false,email:'skipped'});
 await w.notify(a.id,'credit_low',{title:'크레딧 부족',link:'https://evil.example/x'});
 const list=w.notifications(a.id);assert.equal(list.length,2);assert.equal(list.find(n=>n.kind==='credit_low')!.link,'');assert.equal(list.find(n=>n.kind==='review_requested')!.link,'/studio');
 assert.equal(w.unreadCount(a.id),2);assert.equal(w.markRead(b.id,list[0].id),false);assert.equal(w.markRead(a.id,list[0].id),true);assert.equal(w.markRead(a.id,list[0].id),false);
 assert.equal(w.notifications(a.id)[0].read,false);assert.equal(w.notifications(a.id)[1].read,true);assert.deepEqual(w.notifications(b.id),[]);
 assert.equal(w.markAllRead(a.id),1);assert.equal(w.unreadCount(a.id),0);
 assert.throws(()=>w.setPref(a.id,'nope',{inapp:true}),/알림 종류/);assert.throws(()=>w.setPref(a.id,'credit_low',{email:'yes'}),/true 또는 false/);
}finally{s.close();}});

test('Notify: email adapter is called only when the user enabled email AND integration is configured',async()=>{
 const calls:{url:string;init:{headers:Record<string,string>;body:string}}[]=[];
 const transport=async(url:string,init:{method:'POST';headers:Record<string,string>;body:string})=>{calls.push({url,init});return{ok:true,status:200,json:async()=>({id:'m1'})};};
 // configured, email pref off -> no call
 let f=setup({env:CFG,transport});try{await f.w.notify(f.a.id,'team_invite',{title:'초대'});assert.equal(calls.length,0);
  f.w.setPref(f.a.id,'team_invite',{email:true});assert.deepEqual(await f.w.notify(f.a.id,'team_invite',{title:'초대 도착',body:'본문'}),{inapp:true,email:'sent'});
  assert.equal(calls.length,1);assert.equal(calls[0].url,'https://api.resend.com/emails');assert.equal(calls[0].init.headers.Authorization,'Bearer re_test_key');
  assert.deepEqual(JSON.parse(calls[0].init.body),{from:CFG.CORA_MAIL_FROM,to:'ws-a@example.test',subject:'초대 도착',text:'본문'});
 }finally{f.s.close();}
 // not configured, email pref on -> no call, in-app still recorded
 calls.length=0;f=setup({env:{},transport});try{f.w.setPref(f.a.id,'team_invite',{email:true});assert.deepEqual(await f.w.notify(f.a.id,'team_invite',{title:'초대'}),{inapp:true,email:'not_configured'});assert.equal(calls.length,0);assert.equal(f.w.notifications(f.a.id).length,1);}finally{f.s.close();}
 assert.deepEqual(await sendResendEmail({to:'x@example.test',subject:'s',text:'t'},{env:{CORA_RESEND_API_KEY:'k'},transport}),{sent:false,reason:'NOT_CONFIGURED'});assert.equal(calls.length,0);
});

test('Notify never throws: transport failure, HTTP error, unknown kind/user, bad payload',async()=>{
 const boom=async()=>{throw new Error('network down');};const f=setup({env:CFG,transport:boom});try{
  f.w.setPref(f.a.id,'credit_low',{email:true});assert.deepEqual(await f.w.notify(f.a.id,'credit_low',{title:'부족'}),{inapp:true,email:'failed'});
  const bad=setup({env:CFG,transport:async()=>({ok:false,status:422,json:async()=>({})})});try{bad.w.setPref(bad.a.id,'credit_low',{email:true});assert.equal((await bad.w.notify(bad.a.id,'credit_low',{title:'x'})).email,'failed');}finally{bad.s.close();}
  assert.equal((await f.w.notify(f.a.id,'unknown',{title:'x'})).inapp,false);
  const ghost=await f.w.notify('no-such-user','credit_low',{title:'x'});assert.equal(ghost.inapp,false);assert.ok(ghost.error);
  await assert.doesNotReject(f.w.notify(f.a.id,'credit_low',undefined as never));await assert.doesNotReject(f.w.notify(f.a.id,'credit_low',{title:''}));
 }finally{f.s.close();}
});

test('Language: per-user, default ko, invalid rejected; i18n falls back to ko then key',()=>{const{s,a,b,w}=setup();try{
 assert.equal(w.language(a.id),'ko');w.setLanguage(a.id,'en');assert.equal(w.language(a.id),'en');assert.equal(w.language(b.id),'ko');assert.throws(()=>w.setLanguage(a.id,'fr'),/ko, en/);assert.equal(w.language(a.id),'en');
 assert.equal(t('en','nav.team'),'Team');assert.equal(t('ko','nav.team'),'팀 관리');assert.equal(t('fr','nav.team'),'팀 관리');assert.equal(t('en','no.such.key'),'no.such.key');
}finally{s.close();}});
