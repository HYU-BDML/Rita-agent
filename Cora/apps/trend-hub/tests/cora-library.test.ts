import{test}from'node:test';import assert from'node:assert/strict';
import{CoraStore}from'../lib/cora/store';import{outline,ideasFor,sampleBrief,validateDraft}from'../lib/cora/model';
import{LibraryStore,applyTemplate,BUILTIN_TEMPLATES}from'../lib/cora/library';

const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
function setup(){const s=new CoraStore(':memory:'),a=s.signup('lib-a@example.test','password123'),b=s.signup('lib-b@example.test','password123'),lib=s.module('library',db=>new LibraryStore(db));
 const base=outline(sampleBrief,ideasFor(sampleBrief)[0]);const styled={...base,design:{ratio:'1:1' as const,template:'bold' as const,font:'serif' as const,textScale:1.15},slides:base.slides.map((x,i)=>({...x,style:i===0?{align:'center' as const,emphasis:'첫 장',lineHeight:1.75}:{align:'left' as const}}))};
 const project=s.save(a.id,styled)!;return{s,a,b,lib,base,styled,project};}

test('Library: templates are isolated per user (read, edit, favorite, delete)',()=>{const f=setup();try{const t=f.lib.saveFromDraft(f.a.id,f.s.get(f.a.id,f.project.id)!,'내 스타일');
 assert.equal(f.lib.templates(f.a.id).length,1);assert.deepEqual(f.lib.templates(f.b.id),[]);assert.equal(f.lib.template(f.b.id,t.id),null);
 assert.throws(()=>f.lib.update(f.b.id,t.id,1,{name:'탈취'}),/NOT_FOUND/);assert.throws(()=>f.lib.setFavorite(f.b.id,t.id,true),/NOT_FOUND/);assert.equal(f.lib.deleteTemplate(f.b.id,t.id),false);
 assert.equal(f.lib.template(f.a.id,t.id)!.name,'내 스타일');assert.equal(f.lib.template(f.a.id,t.id)!.design.template,'bold');assert.equal(f.lib.template(f.a.id,t.id)!.styles[0].emphasis,undefined);}finally{f.s.close();}});

test('Library: favorite marks and sorts first',()=>{const f=setup();try{const t1=f.lib.saveFromBuiltin(f.a.id,'minimal');const t2=f.lib.saveFromBuiltin(f.a.id,'bold','두번째');assert.equal(t1.source,'builtin');assert.equal(f.lib.templates(f.a.id)[0].id,t2.id);
 assert.equal(f.lib.setFavorite(f.a.id,t1.id,true).favorite,true);assert.equal(f.lib.templates(f.a.id)[0].id,t1.id);assert.equal(f.lib.setFavorite(f.a.id,t1.id,false).favorite,false);assert.throws(()=>f.lib.saveFromBuiltin(f.a.id,'nope'),/NOT_FOUND/);assert.equal(BUILTIN_TEMPLATES.length,3);}finally{f.s.close();}});

test('Library: applyTemplate keeps user text and photos but takes design and styles; result stays a valid draft',()=>{const f=setup();try{
 const src=f.lib.saveFromDraft(f.a.id,f.s.get(f.a.id,f.project.id)!,'적용용');
 const target={...f.base,design:{ratio:'4:5' as const,template:'minimal' as const,font:'sans' as const,textScale:1 as number},slides:f.base.slides.map((x,i)=>({...x,image:i===1?PNG:undefined,style:{align:'right' as const}}))};
 const out=applyTemplate(target,src);assert.deepEqual(out.slides.map(x=>[x.id,x.headline,x.body]),target.slides.map(x=>[x.id,x.headline,x.body]));assert.equal(out.slides[1].image,PNG);
 assert.equal(out.design!.template,'bold');assert.equal(out.design!.ratio,'1:1');assert.equal(out.slides[0].style!.align,'center');assert.equal(out.slides[0].style!.emphasis,undefined);assert.equal(out.slides[2].style!.align,'left');
 assert.equal(target.design!.template,'minimal');assert.equal(target.slides[0].style!.align,'right');validateDraft(out);
 const blank=applyTemplate({...target,slides:target.slides.map(x=>({...x,headline:'',body:''}))},{...src,headline:'제목',body:'본문'});assert.equal(blank.slides[0].headline,'제목');assert.equal(blank.slides[0].body,'본문');}finally{f.s.close();}});

test('Library: built-in copy is editable with validation; stale edit is CONFLICT',()=>{const f=setup();try{const t=f.lib.saveFromBuiltin(f.a.id,'editorial','내 에디토리얼');
 const u1=f.lib.update(f.a.id,t.id,1,{name:'바꾼 이름',design:{ratio:'9:16',template:'editorial',font:'serif',textScale:.85},styles:[{align:'center',lineHeight:1.55}]});assert.equal(u1.version,2);assert.equal(u1.design.font,'serif');
 assert.throws(()=>f.lib.update(f.a.id,t.id,1,{name:'오래된 창'}),/CONFLICT/);assert.equal(f.lib.template(f.a.id,t.id)!.name,'바꾼 이름');
 assert.throws(()=>f.lib.update(f.a.id,t.id,2,{design:{ratio:'2:1'}}),/디자인/);assert.throws(()=>f.lib.update(f.a.id,t.id,2,{styles:[{align:'middle'}]}),/카드 문자/);assert.throws(()=>f.lib.update(f.a.id,t.id,2,{name:' '}),/이름/);assert.equal(f.lib.template(f.a.id,t.id)!.version,2);}finally{f.s.close();}});

test('Library: logos accept only small png/jpeg/webp data URLs, max 5, isolated, default per brand',()=>{const f=setup();try{
 for(const bad of['http://x.test/a.png','data:image/svg+xml;base64,PHN2Zz4=','data:image/png;base64,***','data:image/png;base64,'+'A'.repeat(400000),42,null])assert.throws(()=>f.lib.addLogo(f.a.id,'로고',bad),/로고는 400KB/);
 const l1=f.lib.addLogo(f.a.id,'A1',PNG,'책방');assert.equal(l1.isDefault,true);const l2=f.lib.addLogo(f.a.id,'A2',PNG,'책방');assert.equal(l2.isDefault,false);
 f.lib.setDefaultLogo(f.a.id,l2.id);assert.deepEqual(f.lib.logos(f.a.id).map(l=>l.isDefault),[false,true]);assert.equal(f.lib.defaultLogo(f.a.id,'책방')!.id,l2.id);
 assert.throws(()=>f.lib.setDefaultLogo(f.b.id,l1.id),/NOT_FOUND/);assert.equal(f.lib.deleteLogo(f.b.id,l1.id),false);assert.deepEqual(f.lib.logos(f.b.id),[]);
 f.lib.deleteLogo(f.a.id,l2.id);assert.equal(f.lib.defaultLogo(f.a.id,'책방')!.id,l1.id);
 for(let i=0;i<4;i++)f.lib.addLogo(f.a.id,'L'+i,PNG);assert.equal(f.lib.logos(f.a.id).length,5);assert.throws(()=>f.lib.addLogo(f.a.id,'여섯째',PNG),/5개까지/);f.lib.addLogo(f.b.id,'B1',PNG);}finally{f.s.close();}});

test('Library: CTA length limit, brand filter, usage count, isolation, duplicates',()=>{const f=setup();try{
 assert.throws(()=>f.lib.addCta(f.a.id,'가'.repeat(201)),/길이/);assert.throws(()=>f.lib.addCta(f.a.id,'   '),/입력/);f.lib.addCta(f.a.id,'가'.repeat(200));
 const c1=f.lib.addCta(f.a.id,'프로필 링크에서 신청하세요','책방');const c2=f.lib.addCta(f.a.id,'저장하고 다시 보세요','카페');assert.throws(()=>f.lib.addCta(f.a.id,'저장하고 다시 보세요','카페'),/이미/);
 assert.deepEqual(f.lib.ctas(f.a.id,'책방').map(c=>c.id),[c1.id]);assert.equal(f.lib.ctas(f.a.id).length,3);assert.equal(c1.uses,0);
 f.lib.useCta(f.a.id,c2.id);assert.equal(f.lib.useCta(f.a.id,c2.id).uses,2);assert.equal(f.lib.ctas(f.a.id)[0].id,c2.id);assert.notEqual(f.lib.ctas(f.a.id)[0].lastUsed,null);
 assert.throws(()=>f.lib.useCta(f.b.id,c2.id),/NOT_FOUND/);assert.equal(f.lib.deleteCta(f.b.id,c2.id),false);assert.deepEqual(f.lib.ctas(f.b.id),[]);assert.equal(f.lib.deleteCta(f.a.id,c2.id),true);}finally{f.s.close();}});
