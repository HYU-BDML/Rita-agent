import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
test('focused MCP advertises no tools and rejects calls before credentials or HTTP access',()=>{
 const messages=[{jsonrpc:'2.0',id:1,method:'tools/list'},{jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'list_projects',arguments:{}}}];
 const p=spawnSync(process.execPath,[path.join(process.cwd(),'scripts/cora-mcp.mjs')],{env:{...process.env,CORA_PRODUCT_MODE:'focused',CORA_BASE_URL:'http://127.0.0.1:1',CORA_API_KEY:'synthetic'},input:messages.map(m=>JSON.stringify(m)).join('\n')+'\n',encoding:'utf8',timeout:5000});
 assert.equal(p.status,0,p.stderr);const out=p.stdout.trim().split('\n').map(s=>JSON.parse(s));
 assert.deepEqual(out[0].result.tools,[]);assert.match(out[1].error.message,/disabled/);
});
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {productMode,releaseDenial,needsReleaseBody} from '../lib/cora/release';
import {CoraStore} from '../lib/cora/store';
import {schedulerHandlers} from '../lib/cora/scheduler-handlers';
import {outline,ideasFor,sampleBrief} from '../lib/cora/model';

test('release defaults fail closed, opt-in labs preserves modules and cannot be selected with a URL',()=>{
 for(const value of ['',undefined,'Labs','quality','focused'])assert.equal(productMode(value),'focused');
 assert.equal(productMode('labs'),'labs');
 for(const p of ['/api/cora/video','/api/cora/loop','/api/cora/billing','/api/cora/platform-script','/api/cora/scheduler','/api/v1/projects','/api-docs','/l/example','/explore','/api/cora/future-module','/api/cora/constructor','/api/cora/__proto__']){
  assert.ok(releaseDenial(p,'GET',undefined,'focused'),p);assert.equal(releaseDenial(p,'GET',undefined,'labs'),null);
 }
 assert.ok(releaseDenial('/api/cora/video?mode=labs','GET',undefined,'focused'));
 assert.equal(releaseDenial('/api/cora/projects/valid-id','GET',undefined,'focused'),null);
 assert.ok(releaseDenial('/api/cora/projects/valid-id/future','GET',undefined,'focused'));
});
test('release rejects archived POST actions before effects, including unknown actions and forged saving kinds',()=>{
 for(const action of ['generate','outline','write-from-outline','approve-outline','delete','edit-text']){
  assert.ok(releaseDenial('/api/cora/workbench','POST',{action},'focused'));
 }
 for(const kind of ['blog','script','calendar','automation',null])assert.ok(releaseDenial('/api/cora/workbench','POST',{action:'save',kind},'focused'));
 assert.equal(releaseDenial('/api/cora/workbench','POST',{action:'save',kind:'material'},'focused'),null);
 for(const action of ['compose','republish','enqueue','anything'])assert.ok(releaseDenial('/api/cora/publications','POST',{action},'focused'));
 assert.equal(releaseDenial('/api/cora/publications','POST',{action:'prepare'},'focused'),null);
 assert.ok(needsReleaseBody('/api/cora/workbench','POST','focused'));assert.equal(needsReleaseBody('/api/cora/workbench','POST','labs'),false);
 assert.ok(releaseDenial('/api/cora/integrations','POST',{},'focused'));
});
test('every current API route has an explicit first-release classification; additions fail this inventory check',()=>{
 const base=path.join(process.cwd(),'app/api/cora');
 const walk=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):e.name==='route.ts'?[path.relative(base,path.join(dir,e.name)).replace(/\/route.ts$/,'').replace(/^route.ts$/,'')]:[]);
 const allowed=new Set(['recovery','session','projects','projects/[id]','client-accounts','clients','brands','generate','reviews','team','library','ideas','revisions','workbench','publications','settings','account','contact','integrations','ad-creative','ops-analytics','ops-report','connect/instagram','connect/instagram/callback']);
 const preserved=new Set(['content-list','ops-insights','video-audio/[id]','video-audio','video/[id]','video','video-templates/[id]','billing','ops-recipes','platform-style','import','loop','video-templates','video-templates/[id]/apply','linkpage','video-sources/[id]','ops-calendar','platform-knowledge','apikeys','video-sources','video-motion','export-svg','platform-reference','platform-referral','video-narration','video-sources/[id]/srt','video-sources/[id]/complete','video-sources/[id]/chunk','video-clips','video-shorts','scheduler','video-clips/[id]','ops-threads','platform-script','platform-design','publications/simulation']);
 for(const route of walk(base)){
  assert.ok(allowed.has(route)||preserved.has(route),'Classify new route: '+route);
  const file=readFileSync(path.join(base,route,'route.ts'),'utf8');
  const method=/export (?:async )?function GET/.test(file)?'GET':'POST';
  assert.equal(releaseDenial('/api/cora/'+route.replace('[id]','sample-id'),method,undefined,'focused')===null,allowed.has(route),route);
 }
});
test('preserved worker handlers skip before any generation or provider call, retaining the queue',async()=>{
 const s=new CoraStore(':memory:');try{
  const a=s.signup('owner@release.test','long-test-password'),reviewer=s.signup('review@release.test','long-test-password');
  const p=s.save(a.id,outline(sampleBrief,ideasFor(sampleBrief)[0]))!;
  const review=s.requestReview(a.id,p.id,p.version,reviewer.email)!;s.decideReview(reviewer.id,review.id,'approved','');
  const pub=s.preparePublication(a.id,review.id,'test account',''),queueId=s.publicationQueue.enqueue(a.id,pub.id,0);
  const recipe=s.addItem(a.id,'automation','recipe',{brand:'example',prompt:'preserved'});
  let calls=0;const h=schedulerHandlers(s,{mode:'focused',aiEnabled:true,generate:async()=>{calls++;throw new Error('must not call');}});
  s.scheduler.schedule(a.id,{kind:'publication_tick',refId:queueId,intervalMs:10000},0);
  const job=s.scheduler.schedule(a.id,{kind:'recipe_run',refId:recipe.id,intervalMs:10000,payload:{format:'blog',material:'some material to generate'}},0);s.scheduler.setAiAllowed(a.id,job.id,true);
  const results=await s.scheduler.runDue(h,{now:0});assert.equal(calls,0);assert.equal(results.length,2);assert.ok(results.every(r=>r.outcome==='skipped'));
  assert.equal(s.publicationQueue.get(a.id,queueId)!.state,'queued');assert.ok(s.item(a.id,recipe.id));
 }finally{s.close();}
});
