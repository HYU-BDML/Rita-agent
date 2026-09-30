import{execFileSync}from'node:child_process';
import{createRequire}from'node:module';import{mkdir,writeFile,readFile}from'node:fs/promises';import path from'node:path';import assert from'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.CORA_PLAYWRIGHT_MODULE||'playwright');const base=process.env.CORA_TEST_URL||'http://127.0.0.1:3216',out=process.env.CORA_PROOF_DIR||'test-results/video-features';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome'});const a=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Seoul'}),b=await browser.newContext(),p=await a.newPage();
const result={uiMounted:false,uiNote:'Studio mounting of components/cora/video-features.tsx is pending (lead mounts it); this proof drives the same APIs from the logged-in browser context.',checks:[],media:{},errors:[],passed:false};p.setDefaultTimeout(20000);p.on('pageerror',e=>result.errors.push(e.message));
const post=(ctx,url,data)=>ctx.request.post(base+url,{headers:{Origin:base},data});
const probe=f=>JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','stream=codec_name,codec_type,width,height:stream_tags=language:format=duration','-of','json',f],{encoding:'utf8'}));
const ff=args=>execFileSync('ffmpeg',['-v','error','-y',...args]);
const dur=x=>Number(x.format.duration),has=(x,t)=>x.streams.some(s=>s.codec_type===t);
async function save(r,name){const f=path.join(out,name);await writeFile(f,await r.body());return f;}
try{const n=Date.now();
 await p.goto(base+'/studio');await p.getByLabel('이메일',{exact:true}).fill(`video-${n}@example.test`);await p.getByLabel('비밀번호',{exact:true}).fill('Cora-publication-test-123');await p.getByRole('button',{name:'Cora 시작하기'}).click();await p.getByRole('button',{name:/예시로 먼저/}).waitFor();
 await p.getByRole('button',{name:/예시로 먼저/}).click();await p.getByRole('button',{name:/소재 방향 살펴보기/}).click();await p.getByRole('button',{name:/이 방향으로 만들기/}).first().click();await p.getByRole('button',{name:'작업 저장',exact:true}).click();await p.getByRole('status').filter({hasText:'버전 1 저장 완료'}).waitFor();
 const projects=(await(await a.request.get(base+'/api/cora/projects')).json()).projects;const project=(await(await a.request.get(base+'/api/cora/projects/'+projects[0].id)).json()).project;const N=project.slides.length;assert.ok(N>=2);result.checks.push(`Signed up via UI and created a project through the example flow (${N} cards)`);
 // frames: one PNG per card built with FFmpeg lavfi (the UI's canvas export is not part of this proof)
 const frames=[];for(let i=0;i<N;i++){const f=path.join(out,`card-${i}.png`);ff(['-f','lavfi','-i',`testsrc=size=540x960:rate=1:duration=1`,'-vf',`hue=h=${i*40}`,'-frames:v','1',f]);frames.push('data:image/png;base64,'+(await readFile(f)).toString('base64'));}
 // bgm
 const mp3=path.join(out,'bgm.mp3');ff(['-f','lavfi','-i','sine=frequency=440:duration=3','-c:a','libmp3lame',mp3]);const bgm64=(await readFile(mp3)).toString('base64');
 assert.equal((await post(a,'/api/cora/video-audio',{name:'bgm.mp3',data:bgm64,license:''})).status(),400);
 const up=await post(a,'/api/cora/video-audio',{name:'bgm.mp3',data:bgm64,license:'자체 생성 사인파, 상업 이용 가능'});assert.equal(up.status(),200);const audio=(await up.json()).audio;result.checks.push('BGM upload refused without license note (400) and stored with it (200)');
 assert.equal((await b.request.get(base+'/api/cora/video-audio')).status(),401);
 // strict manifest
 const scenes=frames.map((_,i)=>({seconds:2,subtitle:i===0?'봄 신상 최대 30% 할인':i===1?'지금 바로 시작':'',...(i===0?{keyword:'30%'}:{})}));
 const licensed=frames.map(()=>({source:'generated',license:'Cora 카드 생성 이미지'}));
 const refused=await post(a,'/api/cora/video',{frames,scenes,ratio:'1:1',strict:true});assert.equal(refused.status(),400);assert.match((await refused.json()).error,/라이선스/);
 result.checks.push('Strict render refuses card images without license note (400)');
 // 1:1 render: bgm + burned keyword + eng track
 const r1=await post(a,'/api/cora/video',{frames,scenes,ratio:'1:1',lang:'eng',subtitles:{track:true,burn:true},bgm:{id:audio.id,volume:.5,fadeOut:1},strict:true,media:licensed});assert.equal(r1.status(),200);const v1=await r1.json();
 const mp4=await save(await a.request.get(base+v1.url),'ratio-1x1-bgm-burn.mp4');const p1=probe(mp4);const vs=p1.streams.find(s=>s.codec_type==='video');
 assert.deepEqual([vs.width,vs.height],[1080,1080]);assert.ok(Math.abs(dur(p1)-N*2)<.2);assert.ok(has(p1,'audio'));assert.equal(p1.streams.find(s=>s.codec_type==='subtitle').tags.language,'eng');
 const srtRes=await a.request.get(base+v1.url+'?format=srt');assert.match(srtRes.headers()['content-disposition'],/cora-subtitles\.eng\.srt/);
 const info=await(await a.request.get(base+v1.url+'?format=info')).json();assert.equal(info.manifest.length,N+1);assert.ok(info.manifest.every(m=>m.license));assert.equal(info.settingsVersion,1);
 const frame=path.join(out,'burn-frame.png');ff(['-ss','0.5','-i',mp4,'-frames:v','1',frame]);result.media.render=probe(mp4);
 result.checks.push('1:1 render with bgm (3 s loop, fade-out), burned keyword subtitle and eng track: 1080x1080, duration '+dur(p1).toFixed(2)+' s, audio present, subtitle language eng, SRT file name cora-subtitles.eng.srt, manifest of '+(N+1)+' items stored');
 // narration warning (never applied)
 const nar=await(await post(a,'/api/cora/video-narration',{scenes:[{seconds:1,subtitle:'가'.repeat(35)},{seconds:3,subtitle:'짧은 문장'}]})).json();assert.equal(nar.applied,false);assert.deepEqual(nar.suggestedSeconds,[5,3]);assert.equal(nar.warnings.length,1);result.checks.push('Narration check warns scene 1 (1 s vs about 5 s of speech) and suggests [5,3] without applying');
 // templates
 const t=(await(await post(a,'/api/cora/video-templates',{name:'1:1 배경음악 템플릿',fromVideoId:v1.id})).json()).template;assert.equal(t.settings.ratio,'1:1');assert.equal(t.settings.burn,true);assert.equal(t.settings.bgm.id,audio.id);assert.deepEqual(t.settings.secondsPattern,scenes.map(s=>s.seconds));
 const ap=await(await post(a,'/api/cora/video-templates/'+t.id+'/apply',{sceneCount:N+2})).json();assert.equal(ap.settings.seconds.length,N+2);
 const patch=await a.request.patch(base+'/api/cora/video-templates/'+t.id,{headers:{Origin:base},data:{expectedVersion:1,name:'수정본'}});assert.equal(patch.status(),200);
 const staleT=await a.request.patch(base+'/api/cora/video-templates/'+t.id,{headers:{Origin:base},data:{expectedVersion:1,name:'오래된 편집'}});assert.equal(staleT.status(),409);
 assert.equal((await b.request.get(base+'/api/cora/video-templates/'+t.id)).status(),401);
 assert.equal((await a.request.delete(base+'/api/cora/video-templates/'+t.id,{headers:{Origin:base}})).status(),200);assert.equal((await(await a.request.get(base+'/api/cora/video-templates')).json()).templates.length,0);
 result.checks.push('Template saved from rendered video (ratio 1:1, burn on, bgm, seconds pattern), applied to '+(N+2)+' scenes, edited with version 1 -> 2, stale edit 409, deleted');
 // optimistic version on render settings
 const r2=await post(a,'/api/cora/video',{frames,scenes,ratio:'4:5',videoId:v1.id,expectedVersion:1,media:licensed});assert.equal(r2.status(),200);assert.equal((await r2.json()).settingsVersion,2);
 const stale=await post(a,'/api/cora/video',{frames,scenes,ratio:'9:16',videoId:v1.id,expectedVersion:1});assert.equal(stale.status(),409);assert.equal((await stale.json()).currentVersion,2);
 result.checks.push('Re-render with current version succeeds (settingsVersion 2, 4:5); stale expectedVersion 1 is rejected with 409');
 // motion
 const mo=await post(a,'/api/cora/video-motion',{title:'가을 신메뉴 출시',lines:['따뜻한 라테','30% 할인','9월 30일까지'],seconds:6,ratio:'4:5',bgm:{id:audio.id,volume:.3,fadeOut:1}});assert.equal(mo.status(),200);const mj=await mo.json();
 const mmp4=await save(await a.request.get(base+mj.url),'motion.mp4');const pm=probe(mmp4);assert.deepEqual([pm.streams.find(s=>s.codec_type==='video').width,pm.streams.find(s=>s.codec_type==='video').height],[1080,1350]);assert.ok(Math.abs(dur(pm)-6)<.2);assert.ok(has(pm,'audio'));result.media.motion=pm;
 assert.equal((await post(a,'/api/cora/video-motion',{title:'x',seconds:3})).status(),400);
 result.checks.push('Motion graphic 4:5, 6 s, title + 3 lines, with bgm: ffprobe 1080x1350, duration '+dur(pm).toFixed(2)+' s; 3 s request rejected');
 // clip from own video
 const src=path.join(out,'own.mp4');ff(['-f','lavfi','-i','testsrc=size=320x240:rate=24:duration=12','-f','lavfi','-i','sine=frequency=500:duration=12','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',src]);const bytes=await readFile(src);
 const begin=await(await post(a,'/api/cora/video-sources',{name:'강의.mp4',size:bytes.length})).json();const sid=begin.source.id,half=Math.floor(bytes.length/2);
 for(const [off,part]of[[0,bytes.subarray(0,half)],[half,bytes.subarray(half)]]){const c=await a.request.post(base+`/api/cora/video-sources/${sid}/chunk?offset=${off}`,{headers:{Origin:base,'Content-Type':'application/octet-stream'},data:part});assert.equal(c.status(),200);}
 assert.equal((await post(a,`/api/cora/video-sources/${sid}/complete`,{})).status(),200);
 const srtText='1\n00:00:01,000 --> 00:00:03,000\n첫 구간\n\n2\n00:00:04,000 --> 00:00:06,500\n둘째 구간 핵심\n\n3\n00:00:09,000 --> 00:00:11,000\n셋째 구간\n';
 const sr=await a.request.post(base+`/api/cora/video-sources/${sid}/srt`,{headers:{Origin:base,'Content-Type':'text/plain'},data:srtText});assert.equal(sr.status(),200);assert.equal((await sr.json()).segments.length,3);
 assert.equal((await b.request.get(base+`/api/cora/video-sources/${sid}`)).status(),401);
 const cr=await post(a,'/api/cora/video-clips',{sourceId:sid,segments:[2,3],burn:true,track:true,lang:'kor'});assert.equal(cr.status(),201);const cj=await cr.json();
 const cmp4=await save(await a.request.get(base+cj.url),'clip.mp4');const pc=probe(cmp4);assert.ok(Math.abs(dur(pc)-7)<.2);assert.ok(has(pc,'audio'));assert.equal(pc.streams.find(s=>s.codec_type==='subtitle').tags.language,'kor');result.media.clip=pc;
 // second logged-in user cannot see or cut it
 const c2=await b.newPage();await c2.goto(base+'/studio');await c2.getByLabel('이메일',{exact:true}).fill(`video-other-${n}@example.test`);await c2.getByLabel('비밀번호',{exact:true}).fill('Cora-publication-test-123');await c2.getByRole('button',{name:'Cora 시작하기'}).click();await c2.getByRole('button',{name:/예시로 먼저/}).waitFor();
 assert.equal((await b.request.get(base+`/api/cora/video-sources/${sid}`)).status(),404);assert.equal((await b.request.get(base+cj.url)).status(),404);assert.equal((await post(b,'/api/cora/video-clips',{sourceId:sid,segments:[1]})).status(),400);assert.equal((await b.request.delete(base+`/api/cora/video-sources/${sid}`,{headers:{Origin:base}})).status(),404);
 assert.equal((await a.request.delete(base+cj.url,{headers:{Origin:base}})).status(),200);assert.equal((await a.request.delete(base+`/api/cora/video-sources/${sid}`,{headers:{Origin:base}})).status(),200);
 result.checks.push('Own 12 s video uploaded in 2 chunks, SRT (3 segments) attached, segments 2-3 cut with burned + kor track: duration '+dur(pc).toFixed(2)+' s (expected 7), aac audio; other user gets 404 and cannot cut; owner deletes clip and source');
 assert.equal((await post(a,'/api/cora/video-audio/'+audio.id,{})).status(),405);assert.equal((await a.request.delete(base+'/api/cora/video-audio/'+audio.id,{headers:{Origin:base}})).status(),200);
 await p.screenshot({path:path.join(out,'studio.png'),fullPage:true});assert.deepEqual(result.errors,[]);result.passed=true;
}catch(e){result.failure=String(e);await p.screenshot({path:path.join(out,'failure.png'),fullPage:true});throw e;}finally{await writeFile(path.join(out,'video-features-proof.json'),JSON.stringify(result,null,2));await browser.close();}console.log(JSON.stringify(result,null,2));
