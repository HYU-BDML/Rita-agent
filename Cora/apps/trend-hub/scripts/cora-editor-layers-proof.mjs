// Browser proof for layers, revision history and Figma SVG export. No AI calls, no external network.
// The layer panel and history panel are not mounted in studio.tsx yet (another owner), so layers and restore
// are exercised through the HTTP APIs of the logged-in browser context; the studio then renders the saved layers.
import{createRequire}from'node:module';import{mkdir,writeFile}from'node:fs/promises';import path from'node:path';import assert from'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.CORA_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.CORA_TEST_URL||'http://127.0.0.1:3217',out=process.env.CORA_PROOF_DIR||'test-results/editor-layers';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome'});const ctxA=await browser.newContext({viewport:{width:1440,height:1100}}),ctxB=await browser.newContext(),p=await ctxA.newPage();p.setDefaultTimeout(20000);
const result={checks:[],errors:[],uiMounting:'pending: LayerPanel (components/cora/editor-layers.tsx) and HistoryPanel (components/cora/editor-history.tsx) are not mounted in studio.tsx; proof drives the same APIs and helpers the panels call',passed:false};p.on('pageerror',e=>result.errors.push(e.message));
const IMG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const H={Origin:base};
function unzip(buf){const dv=new DataView(buf.buffer,buf.byteOffset,buf.byteLength),out={};let o=0;while(dv.getUint32(o,true)===0x04034b50){const size=dv.getUint32(o+18,true),nl=dv.getUint16(o+26,true);out[buf.subarray(o+30,o+30+nl).toString('utf8')]=buf.subarray(o+30+nl,o+30+nl+size).toString('utf8');o+=30+nl+size;}return out;}
const layer=(id,z,o={})=>({id,type:'text',x:100,y:900,w:880,h:120,z,text:'레이어 검증 문구',fontSize:48,color:'#b00020',weight:700,align:'left',...o});
try{
await p.goto(base+'/studio');await p.getByLabel('이메일',{exact:true}).fill(`editor-${Date.now()}@example.test`);await p.getByLabel('비밀번호',{exact:true}).fill('Cora-editor-test-123');await p.getByRole('button',{name:'Cora 시작하기'}).click();
await p.getByRole('button',{name:/예시로 먼저/}).click();await p.getByRole('button',{name:/소재 방향 살펴보기/}).click();await p.getByRole('button',{name:/이 방향으로 만들기/}).first().click();
await p.getByLabel('함께 올릴 캡션',{exact:true}).fill('버전 1 캡션');await p.getByRole('button',{name:'작업 저장',exact:true}).click();await p.getByRole('status').filter({hasText:'버전 1 저장 완료'}).waitFor();
const list=(await(await ctxA.request.get(base+'/api/cora/projects')).json()).projects;const id=list[0].id;
let project=(await(await ctxA.request.get(base+'/api/cora/projects/'+id)).json()).project;assert.equal(project.version,1);
result.checks.push('Signed up, ran the example flow and saved version 1 through the UI');
// Layers: PUT with layers, then read back through the existing project GET.
const withLayers={...project,caption:'버전 2 캡션',slides:project.slides.map((s,i)=>i===1?{...s,layers:[layer('top',2,{text:'<b>위 레이어</b> & "q"'}),layer('low',1,{text:'아래 레이어',y:1000}),{id:'sh',type:'shape',x:0,y:0,w:300,h:80,z:0,fill:'#00aa55',radius:16},{id:'im',type:'image',x:700,y:100,w:200,h:200,z:3,src:IMG,opacity:0.8,rotation:10}]}:s)};
let r=await ctxA.request.put(base+'/api/cora/projects/'+id,{headers:H,data:withLayers});assert.equal(r.status(),200,await r.text());
project=(await(await ctxA.request.get(base+'/api/cora/projects/'+id)).json()).project;assert.equal(project.version,2);assert.equal(project.slides[1].layers.length,4);assert.ok(!('layers' in project.slides[0]));assert.deepEqual(project.slides[1].layers.map(l=>l.id).sort(),['im','low','sh','top']);
result.checks.push('PUT with 4 layers (text, text, shape, image) is accepted and returned by GET; a card without layers has no layers key');
for(const [name,bad] of Object.entries({video:{...layer('v',0),type:'video'},'too many':null,'bad color':layer('c',0,{color:'red'}),'huge text':layer('t',0,{text:'x'.repeat(301)}),'bad src':{id:'i',type:'image',x:0,y:0,w:10,h:10,z:0,src:'https://example.test/a.png'}})){
  const layers=name==='too many'?Array.from({length:13},(_,i)=>layer('n'+i,i)):[bad];
  const res=await ctxA.request.put(base+'/api/cora/projects/'+id,{headers:H,data:{...project,slides:project.slides.map((s,i)=>i===1?{...s,layers}:s)}});assert.equal(res.status(),400,name);}
result.checks.push('Video type, 13 layers, bad color, 301-character text and an external image URL are all refused with HTTP 400');
// Studio renders the saved layers through artwork.ts (same renderer as export and video frames).
await p.reload();await p.locator('button',{hasText:/카드 \d+장/}).first().click();await p.getByRole('button',{name:'2번 카드 선택'}).click();
const src=await p.getByRole('img',{name:'2번 카드 미리보기'}).getAttribute('src');const svg=decodeURIComponent(src.replace(/^data:image\/svg\+xml;charset=utf-8,/,''));
assert.match(svg,/data-layer-type="shape"/);assert.ok(svg.includes('&lt;b&gt;위 레이어&lt;/b&gt; &amp; &quot;q&quot;'));assert.ok(!svg.includes('<b>위'));
const order=[...svg.matchAll(/data-layer-id="([^"]+)"/g)].map(m=>m[1]);assert.deepEqual(order,['sh','low','top','im']);
assert.ok(svg.indexOf('data-layer-id="sh"')>svg.indexOf(project.slides[1].headline));
result.checks.push('Studio card preview draws the layers on top of the card in z order (shape, low, top, image) with text escaped; layer ids in preview: '+order.join(','));
await p.screenshot({path:path.join(out,'layers-preview.png'),fullPage:true});
// History.
const revs=(await(await ctxA.request.get(base+'/api/cora/revisions?projectId='+id)).json()).revisions;assert.deepEqual(revs.map(x=>x.version),[2,1]);assert.deepEqual(revs.map(x=>x.current),[true,false]);assert.equal(revs[1].captionPreview,'버전 1 캡션');assert.equal(revs[0].slideCount,project.slides.length);
result.checks.push('GET /api/cora/revisions lists versions [2,1] with slide count and caption preview');
const rest=await ctxA.request.post(base+'/api/cora/revisions',{headers:H,data:{action:'restore',projectId:id,version:1,currentVersion:2}});assert.equal(rest.status(),200);const restored=(await rest.json()).draft;assert.equal(restored.caption,'버전 1 캡션');assert.ok(!restored.slides[1].layers);
assert.equal((await(await ctxA.request.get(base+'/api/cora/projects/'+id)).json()).project.version,2);
result.checks.push('Restore of version 1 returns the old body (caption 버전 1 캡션, no layers) and saves nothing: project stays at version 2');
assert.equal((await ctxA.request.post(base+'/api/cora/revisions',{headers:H,data:{action:'restore',projectId:id,version:1,currentVersion:1}})).status(),409);
r=await ctxA.request.put(base+'/api/cora/projects/'+id,{headers:H,data:{...restored,version:2}});assert.equal(r.status(),200);assert.equal((await r.json()).project.version,3);
assert.equal((await(await ctxA.request.get(base+'/api/cora/revisions?projectId='+id)).json()).revisions.length,3);
result.checks.push('Stale currentVersion gives 409; saving the restored draft creates version 3 and history keeps all 3 versions');
// Second user cannot read the history or restore.
const q=await ctxB.newPage();await q.goto(base+'/studio');await q.getByLabel('이메일',{exact:true}).fill(`other-${Date.now()}@example.test`);await q.getByLabel('비밀번호',{exact:true}).fill('Cora-editor-test-456');await q.getByRole('button',{name:'Cora 시작하기'}).click();await q.getByRole('button',{name:/예시로 먼저/}).waitFor();
assert.equal((await ctxB.request.get(base+'/api/cora/revisions?projectId='+id)).status(),404);
assert.equal((await ctxB.request.post(base+'/api/cora/revisions',{headers:H,data:{action:'restore',projectId:id,version:1,currentVersion:3}})).status(),404);
assert.equal((await ctxB.request.get(base+'/api/cora/export-svg?projectId='+id)).status(),404);
const anon=await browser.newContext();assert.equal((await anon.request.get(base+'/api/cora/revisions?projectId='+id)).status(),401);await anon.close();
result.checks.push('A second signed-in user gets 404 for history, restore and SVG export of the first user\'s project; a signed-out request gets 401');
// Figma export: download as the logged-in user and inspect.
const dl=await ctxA.request.get(base+'/api/cora/export-svg?projectId='+id);assert.equal(dl.status(),200);assert.match(dl.headers()['content-type'],/zip/);const files=unzip(await dl.body());const names=Object.keys(files);
const n=project.slides.length;assert.equal(names.filter(x=>/^cards\/card-\d\d\.svg$/.test(x)).length,n);assert.ok(names.includes('frames.svg')&&names.includes('README.txt'));
const frames=files['frames.svg'];const total=n*1080+(n-1)*80;assert.ok(frames.startsWith('<svg')&&frames.includes(`width="${total}"`));for(let i=0;i<n;i++)assert.ok(frames.includes(`transform="translate(${i*1160} 0)"`));
assert.ok(frames.includes('<text ')&&!frames.includes('<path'));assert.ok(files['README.txt'].includes('Figma'));
const ids=[...frames.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
result.checks.push(`Figma export ZIP has ${n} card SVGs + frames.svg (${total}px wide, 80px gaps) + README.txt; text stays <text>, no <path>, ids unique`);
result.zipEntries=names;
assert.deepEqual(result.errors,[]);result.passed=true;
}catch(e){result.failure=String(e);await p.screenshot({path:path.join(out,'failure.png'),fullPage:true});throw e;}finally{await writeFile(path.join(out,'editor-layers-proof.json'),JSON.stringify(result,null,2));await browser.close();}console.log(result);
