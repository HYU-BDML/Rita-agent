// Browser/API proof for batch D (PDF import, YouTube guard, link page, help+contact, API keys). No paid AI, no real YouTube call.
// UI mounting of ImportDesk / LinkPageEditor / ApiKeysPanel in the studio is pending: this proof drives the HTTP routes and the public pages.
import{createRequire}from'node:module';import{mkdir,writeFile}from'node:fs/promises';import path from'node:path';import assert from'node:assert/strict';import{deflateSync}from'node:zlib';
const require=createRequire(import.meta.url),{chromium}=require(process.env.CORA_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.CORA_TEST_URL||'http://127.0.0.1:3215',out=process.env.CORA_PROOF_DIR||'test-results/inputs';await mkdir(out,{recursive:true});
const result={checks:[],errors:[],passed:false};const ok=(name,detail={})=>{result.checks.push({name,...detail});};
const stream=(data)=>{const b=deflateSync(Buffer.from(data,'latin1'));return Buffer.concat([Buffer.from(`<< /Filter /FlateDecode /Length ${b.length} >>\nstream\n`),b,Buffer.from('\nendstream')]);};
const pdf=(objs)=>Buffer.concat([Buffer.from('%PDF-1.5\n'),...objs.flatMap((o,i)=>[Buffer.from(`${i+1} 0 obj\n`),Buffer.isBuffer(o)?o:Buffer.from(o),Buffer.from('\nendobj\n')]),Buffer.from('trailer\n<< /Root 1 0 R >>\n%%EOF')]);
const page=(content,font)=>[ '<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',stream(content),font];
const asciiPdf=pdf(page('BT /F1 12 Tf 72 700 Td (Cora imports text from PDF files. Each sentence becomes card text.) Tj 0 -16 Td (Second paragraph stays editable.) Tj ET','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'));
const cmap='begincmap 1 begincodespacerange <0000> <FFFF> endcodespacerange 3 beginbfchar <0001> <D55C> <0002> <AE00> <0003> <0020> endbfchar endcmap';
const cjkPdf=pdf([...page('BT /F1 12 Tf 72 700 Td <000100020003000100020003> Tj ET','<< /Type /Font /Subtype /Type0 /Encoding /Identity-H /DescendantFonts [7 0 R] /ToUnicode 6 0 R >>'),stream(cmap),'<< /Type /Font /Subtype /CIDFontType2 >>']);
const scannedPdf=pdf(page('q 600 0 0 800 0 0 cm /Im0 Do Q','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'));
const browser=await chromium.launch({channel:'chrome'});
try{
 const owner=await browser.newContext({viewport:{width:1000,height:900}}),anon=await browser.newContext({viewport:{width:480,height:900}}),other=await browser.newContext();
 const post=(c,url,data,extra={})=>c.request.post(base+url,{headers:{Origin:base,...extra},data,maxRedirects:0});
 const n=Date.now(),email=`inputs-${n}@example.test`,email2=`inputs2-${n}@example.test`;
 assert.equal((await post(owner,'/api/cora/session',{mode:'signup',email,password:'Cora-inputs-test-123'})).status(),200);assert.equal((await post(other,'/api/cora/session',{mode:'signup',email:email2,password:'Cora-inputs-test-123'})).status(),200);ok('signup two accounts');
 // F004 PDF import
 let r=await post(owner,'/api/cora/import',{action:'pdf',file:asciiPdf.toString('base64'),filename:'brochure.pdf'});let j=await r.json();assert.equal(r.status(),200,JSON.stringify(j));
 assert.ok(j.draft.slides[1].body.includes('Cora imports text from PDF files.'));ok('pdf ascii to draft',{cards:j.draft.slides.length,paragraphs:j.paragraphs,firstBody:j.draft.slides[1].body.slice(0,60)});
 r=await post(owner,'/api/cora/import',{action:'pdf',file:cjkPdf.toString('base64'),brand:'한글 브랜드'});j=await r.json();assert.equal(r.status(),200,JSON.stringify(j));assert.equal(j.draft.slides[1].body,'한글 한글');ok('pdf CJK ToUnicode to draft',{body:j.draft.slides[1].body});
 r=await post(owner,'/api/cora/import',{action:'pdf',file:scannedPdf.toString('base64')});j=await r.json();assert.equal(r.status(),400);assert.match(j.error,/OCR/);ok('scanned pdf refused',{error:j.error});
 r=await post(owner,'/api/cora/import',{action:'pdf',file:Buffer.alloc(5*1024*1024+10,65).toString('base64')});j=await r.json();assert.equal(r.status(),400);assert.match(j.error,/5MB/);ok('>5MB refused',{error:j.error});
 r=await owner.request.post(base+'/api/cora/import',{data:{action:'pdf',file:asciiPdf.toString('base64')}});assert.equal(r.status(),403);ok('import needs same origin');
 r=await post(anon,'/api/cora/import',{action:'pdf',file:asciiPdf.toString('base64')});assert.equal(r.status(),401);ok('import needs login');
 // F005 guard paths only (real YouTube is not called)
 r=await post(owner,'/api/cora/import',{action:'youtube',url:'https://evil.example/watch?v=dQw4w9WgXcQ'});j=await r.json();assert.equal(r.status(),400);ok('youtube foreign host refused',{error:j.error});
 r=await post(owner,'/api/cora/import',{action:'youtube',url:'https://youtu.be/dQw4w9WgXcQ'});j=await r.json();assert.equal(r.status(),400);assert.match(j.error,/YOUTUBE_API_KEY|YouTube/);ok('youtube without key gives Korean setup error',{error:j.error});
 // F092 link page
 const slug=`proof-${n}`.toLowerCase().slice(0,30);const hostile={slug,title:'<script>window.__x=1</script>제목',intro:'"><img src=x onerror=window.__y=1> & 소개',theme:'#2a6f97',links:[{label:'</button><script>1</script>',url:'https://example.com/a?x=1&y=2'},{label:'두번째',url:'https://example.org/'}]};
 r=await post(owner,'/api/cora/linkpage',{action:'save',page:{...hostile,links:[{label:'x',url:'javascript:alert(1)'}]}});assert.equal(r.status(),400);ok('javascript: link refused');
 r=await post(owner,'/api/cora/linkpage',{action:'save',page:{...hostile,slug:'admin'}});assert.equal(r.status(),400);ok('reserved slug refused');
 r=await post(owner,'/api/cora/linkpage',{action:'save',page:hostile});j=await r.json();assert.equal(r.status(),200,JSON.stringify(j));const links=j.page.links;
 r=await post(other,'/api/cora/linkpage',{action:'save',page:{...hostile,title:'남의 것'}});assert.equal(r.status(),400);ok('slug already taken by another account');
 const ap=await anon.newPage();ap.on('pageerror',e=>result.errors.push(e.message));const resp=await ap.goto(`${base}/l/${slug}`);assert.equal(resp.status(),200);
 const csp=resp.headers()['content-security-policy'];assert.equal(csp,"default-src 'none'; img-src data: https:; style-src 'unsafe-inline'");
 assert.equal(await ap.evaluate(()=>window.__x===undefined&&window.__y===undefined),true);assert.equal(await ap.locator('script').count(),0);assert.equal(await ap.locator('h1').innerText(),'<script>window.__x=1</script>제목');assert.equal(await ap.locator('button').count(),2);
 await ap.screenshot({path:path.join(out,'link-page.png'),fullPage:true});ok('public link page anonymous, escaped, strict CSP, no script',{csp,buttons:2,title:await ap.title()});
 r=await post(anon,`/l/${slug}/click`,{id:links[0].id});assert.equal(r.status(),200);r=await post(anon,`/l/${slug}/click`,{id:links[0].id});
 const form=await anon.request.post(`${base}/l/${slug}/click`,{form:{id:links[1].id},headers:{Origin:base},maxRedirects:0});assert.equal(form.status(),303);assert.equal(form.headers().location,'https://example.org/');
 r=await post(anon,`/l/${slug}/click`,{id:'deadbeef'});assert.equal(r.status(),404);
 const owned=await(await owner.request.get(base+'/api/cora/linkpage')).json();assert.equal(owned.clicks[links[0].id],2);assert.equal(owned.clicks[links[1].id],1);ok('click counter',{clicks:owned.clicks});
 assert.equal((await(await other.request.get(base+'/api/cora/linkpage')).json()).page,null);assert.equal((await anon.request.get(base+'/api/cora/linkpage')).status(),401);ok('owner-only edit API');
 let last=0;for(let i=0;i<40;i++){last=(await post(anon,`/l/${slug}/click`,{id:links[0].id},{'x-forwarded-for':'203.0.113.7'})).status();}assert.equal(last,429);ok('click rate limit per IP -> 429');
 assert.equal((await anon.request.get(`${base}/l/no-such-page`)).status(),404);
 // F109 help + contact
 const hp=await anon.newPage();hp.on('pageerror',e=>result.errors.push(e.message));await hp.goto(base+'/help');await hp.getByRole('heading',{name:'Cora 소개와 도움말'}).waitFor();await hp.getByText('실제로 작동하는 것과 모의로 작동하는 것').waitFor();await hp.getByText('개인정보 안내').waitFor();
 await hp.getByLabel('이름',{exact:true}).fill('방문자');await hp.getByLabel('이메일',{exact:true}).fill('visitor@example.test');await hp.getByLabel('문의 내용').fill('도움말 페이지에서 보낸 문의입니다.');await hp.getByRole('button',{name:'문의 보내기'}).click();await hp.getByRole('status').filter({hasText:'접수되었습니다'}).waitFor();
 await hp.screenshot({path:path.join(out,'help.png'),fullPage:true});ok('help page renders and contact form submits');
 r=await post(anon,'/api/cora/contact',{name:'봇',email:'bot@example.test',message:'스팸 문의 내용입니다.',website:'http://spam.example'},{'x-forwarded-for':'198.51.100.1'});assert.equal(r.status(),201);ok('honeypot answers success but is not stored (unit test verifies storage)');
 r=await post(anon,'/api/cora/contact',{name:'',email:'x',message:'a'});assert.equal(r.status(),400);
 // F106 API keys
 assert.equal((await anon.request.get(base+'/api/v1/projects')).status(),401);
 const d=(await(await post(owner,'/api/cora/import',{action:'pdf',file:asciiPdf.toString('base64'),filename:'mine'})).json()).draft;assert.equal((await post(owner,'/api/cora/projects',d)).status(),201);
 r=await post(owner,'/api/cora/apikeys',{action:'create',name:'proof key'});j=await r.json();assert.equal(r.status(),201);const key=j.created.key;assert.match(key,/^cora_/);assert.ok(!JSON.stringify(j.keys).includes(key));
 let api=await anon.request.get(base+'/api/v1/projects',{headers:{Authorization:`Bearer ${key}`}});j=await api.json();assert.equal(api.status(),200);assert.equal(j.projects.length,1);assert.equal(api.headers()['x-ratelimit-limit'],'60');ok('Bearer key lists owner projects',{count:j.projects.length,remaining:api.headers()['x-ratelimit-remaining']});
 const k2=(await(await post(other,'/api/cora/apikeys',{action:'create',name:'other'})).json()).created.key;api=await anon.request.get(base+'/api/v1/projects',{headers:{Authorization:`Bearer ${k2}`}});assert.equal((await api.json()).projects.length,0);ok('other account key sees none of the owner projects');
 const keyId=(await(await owner.request.get(base+'/api/cora/apikeys')).json()).keys[0].id;assert.equal((await post(other,'/api/cora/apikeys',{action:'revoke',id:keyId})).status(),404);
 assert.equal((await post(owner,'/api/cora/apikeys',{action:'revoke',id:keyId})).status(),200);api=await anon.request.get(base+'/api/v1/projects',{headers:{Authorization:`Bearer ${key}`}});assert.equal(api.status(),401);ok('revoked key -> 401');
 const rl=[];for(let i=0;i<62;i++)rl.push((await anon.request.get(base+'/api/v1/projects',{headers:{Authorization:`Bearer ${k2}`}})).status());assert.equal(rl.filter(s=>s===200).length,59);assert.equal(rl.at(-1),429);ok('60/min per key then 429 (1 call already used above)');
 const dp=await anon.newPage();await dp.goto(base+'/api-docs');await dp.getByRole('heading',{name:'GET /api/v1/projects'}).waitFor();await dp.screenshot({path:path.join(out,'api-docs.png'),fullPage:true});ok('api-docs renders');
 assert.deepEqual(result.errors,[]);result.passed=true;
}catch(e){result.failure=String(e);throw e;}finally{await writeFile(path.join(out,'inputs-proof.json'),JSON.stringify({...result,base,note:'UI mounting of ImportDesk/LinkPageEditor/ApiKeysPanel in studio is pending; proof drives the routes and public pages. YouTube is only exercised on guard paths (no real API call).'},null,2));await browser.close();}
