import{test}from'node:test';import assert from'node:assert/strict';import{deflateSync}from'node:zlib';import type{DatabaseSync}from'node:sqlite';
import{CoraStore}from'../lib/cora/store';import{validateDraft,blankBrief}from'../lib/cora/model';
import{extractPdfText,decodePdfBase64,draftFromText,paragraphsOf,parseToUnicode,MAX_PDF_BYTES}from'../lib/cora/pdf-text';
import{parseYouTubeId,parseDuration,YouTubeAdapter,youtubeMaterial}from'../lib/cora/youtube';
import{LinkPages,renderLinkPage,validateLinkPage,LINK_PAGE_CSP}from'../lib/cora/linkpage';
import{ContactInbox,DAILY_CAP}from'../lib/cora/help';
import{ApiKeys,authenticateApiKey,MAX_ACTIVE_KEYS}from'../lib/cora/apikeys';

// ---- tiny PDF builder: objects are 1-based in array order
const stream=(extra:string,data:string|Buffer,flate:boolean)=>{const raw=Buffer.isBuffer(data)?data:Buffer.from(data,'latin1');const body=flate?deflateSync(raw):raw;return Buffer.concat([Buffer.from(`<< ${extra} ${flate?'/Filter /FlateDecode ':''}/Length ${body.length} >>\nstream\n`,'latin1'),body,Buffer.from('\nendstream','latin1')]);};
function buildPdf(objs:(string|Buffer)[]){const parts:Buffer[]=[Buffer.from('%PDF-1.5\n%\xe2\xe3\xcf\xd3\n','latin1')];objs.forEach((o,i)=>{parts.push(Buffer.from(`${i+1} 0 obj\n`,'latin1'),Buffer.isBuffer(o)?o:Buffer.from(o,'latin1'),Buffer.from('\nendobj\n','latin1'));});parts.push(Buffer.from(`trailer\n<< /Size ${objs.length+1} /Root 1 0 R >>\n%%EOF`,'latin1'));return Buffer.concat(parts);}
const asciiPdf=(content:string,flate=true)=>buildPdf(['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',stream('',content,flate),'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']);
const hex=(s:string)=>Array.from(s).map(c=>c.charCodeAt(0).toString(16).padStart(4,'0')).join('');
const cmapText=`/CIDInit /ProcSet findresource begin 12 dict begin begincmap
1 begincodespacerange <0000> <FFFF> endcodespacerange
2 beginbfchar <0001> <D55C> <0002> <AE00> endbfchar
1 beginbfrange <0003> <0005> <AC00> endbfrange
1 beginbfrange <0006> <0007> [<0041> <0042>] endbfrange
endcmap end end`;
const cjkPdf=(content:string)=>buildPdf(['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',stream('',content,true),'<< /Type /Font /Subtype /Type0 /BaseFont /Batang /Encoding /Identity-H /DescendantFonts [7 0 R] /ToUnicode 6 0 R >>',stream('',cmapText,true),'<< /Type /Font /Subtype /CIDFontType2 /BaseFont /Batang >>']);

test('PDF: ASCII text from a Flate stream and from an uncompressed stream, with escapes, TJ gaps and line breaks',()=>{
 const c='BT /F1 12 Tf 72 700 Td (Hello Cora world.) Tj 0 -14 Td [(Second ) -300 (line \\(escaped\\) \\101) ] TJ ET';
 for(const flate of[true,false]){const r=extractPdfText(asciiPdf(c,flate));assert.equal(r.pages,1);assert.match(r.text,/Hello Cora world\./);assert.match(r.text,/Second\s+line \(escaped\) A/);assert.ok(r.text.includes('\n'));}
});
test('PDF: hex strings and the quote operators',()=>{const r=extractPdfText(asciiPdf("BT /F1 12 Tf 14 TL 72 700 Td <48656C6C6F> Tj (next line) ' ET"));assert.match(r.text,/Hello\nnext line/);});
test('PDF: CJK text through a Type0 font with a ToUnicode CMap (bfchar, bfrange, bfrange array)',()=>{
 const r=extractPdfText(cjkPdf(`BT /F1 12 Tf 72 700 Td <${'0001000200030004000500060007'}> Tj ET`));assert.equal(r.text,'한글가각갂AB');
 const p=parseToUnicode(cmapText);assert.equal(p.width,2);assert.equal(p.map.get(3),'가');assert.equal(p.map.get(5),'갂');
});
test('PDF: a CID font with no ToUnicode map is reported honestly, not garbled',()=>{
 const pdf=buildPdf(['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',stream('','BT /F1 12 Tf <00010002> Tj ET',true),'<< /Type /Font /Subtype /Type0 /Encoding /Identity-H >>']);
 assert.throws(()=>extractPdfText(pdf),/ToUnicode/);
});
test('PDF: scanned (image-only) pages give the Korean OCR-not-supported error; non-PDF and encrypted files are refused',()=>{
 const scanned=asciiPdf('q 600 0 0 800 0 0 cm /Im0 Do Q');assert.throws(()=>extractPdfText(scanned),/OCR/);
 assert.throws(()=>extractPdfText(Buffer.from('hello world')),/PDF 파일이 아닙니다/);
 assert.throws(()=>extractPdfText(Buffer.from('%PDF-1.4\ntrailer << /Encrypt 9 0 R >>')),/암호/);
});
test('PDF: size limit is 5MB on the decoded bytes; bad base64 is refused',()=>{
 const big=Buffer.alloc(MAX_PDF_BYTES+1,65).toString('base64');assert.throws(()=>decodePdfBase64(big),/5MB/);
 assert.equal(decodePdfBase64(Buffer.alloc(1000,65).toString('base64')).length,1000);
 assert.equal(decodePdfBase64('data:application/pdf;base64,'+Buffer.from('%PDF-1.4').toString('base64')).length,8);
 assert.throws(()=>decodePdfBase64('***'),/형식/);assert.throws(()=>decodePdfBase64(''),/필요/);
});
test('PDF to Draft: at most 10 paragraphs through outline(), card bodies hold real text, remainder reported and result passes validateDraft',()=>{
 const sentences=Array.from({length:150},(_,i)=>`이것은 ${i+1}번째 문장이며 카드에 그대로 담기는 내용입니다.`);
 const short=draftFromText({...blankBrief,brand:'테스트'},'테스트 소재',sentences.slice(0,3).join(' '));
 assert.equal(short.truncated,false);assert.equal(short.draft.slides.length,1+1+1);assert.equal(short.draft.slides[1].body,sentences.slice(0,3).join(' '));
 const long=draftFromText({...blankBrief,brand:'테스트'},'테스트 소재',sentences.join(' '));
 assert.equal(long.truncated,true);assert.equal(long.paragraphs.length,10);assert.ok(long.total>10);assert.equal(long.draft.slides.length,12);
 assert.ok(long.draft.slides.slice(1,-1).every(s=>s.body.length>60&&s.body.length<=500));validateDraft(long.draft);
 const p=paragraphsOf('A. B. C.');assert.deepEqual(p.paragraphs,['A. B. C.']);
 const r=draftFromText({...blankBrief,brand:'PDF'},'소재',extractPdfText(asciiPdf('BT /F1 12 Tf 72 700 Td (First sentence here. Second sentence here.) Tj ET')).text);validateDraft(r.draft);
});

test('YouTube: URL forms (watch, youtu.be, shorts), id validation, host allowlist',()=>{
 const id='dQw4w9WgXcQ';
 for(const u of[`https://www.youtube.com/watch?v=${id}&t=10`,`https://youtu.be/${id}?si=x`,`https://www.youtube.com/shorts/${id}`,`https://m.youtube.com/watch?v=${id}`])assert.equal(parseYouTubeId(u),id);
 assert.throws(()=>parseYouTubeId('https://www.youtube.com/watch?v=short'),/11자/);assert.throws(()=>parseYouTubeId('https://evil.example/watch?v='+id),/youtube\.com/);
 assert.throws(()=>parseYouTubeId('https://www.youtube.com.evil.example/watch?v='+id),/youtube\.com/);assert.throws(()=>parseYouTubeId('not a url'),/형식/);assert.throws(()=>parseYouTubeId('https://www.youtube.com/channel/abc'),/11자/);
 assert.equal(parseDuration('PT1H2M3S'),3723);assert.equal(parseDuration('PT45S'),45);assert.equal(parseDuration('P1DT1M'),86460);assert.equal(parseDuration('garbage'),0);
});
test('YouTube: adapter calls videos.list with part, id and key through an injected transport and maps the fields',async()=>{
 const seen:string[]=[];const ok=(async(u:string|URL|Request)=>{seen.push(String(u));return new Response(JSON.stringify({items:[{snippet:{title:'제목',description:'설명 '.repeat(20),channelTitle:'채널',channelId:'UC1'},contentDetails:{duration:'PT3M5S'}}]}),{status:200});})as typeof fetch;
 const v=await new YouTubeAdapter('KEY',ok).video('dQw4w9WgXcQ');assert.equal(v.title,'제목');assert.equal(v.channel,'채널');assert.equal(v.seconds,185);
 const u=new URL(seen[0]);assert.equal(u.pathname,'/youtube/v3/videos');assert.equal(u.searchParams.get('part'),'snippet,contentDetails');assert.equal(u.searchParams.get('id'),'dQw4w9WgXcQ');assert.equal(u.searchParams.get('key'),'KEY');
 const empty=(async()=>new Response('{"items":[]}',{status:200}))as typeof fetch;await assert.rejects(new YouTubeAdapter('K',empty).video('dQw4w9WgXcQ'),/찾지 못/);
 const quota=(async()=>new Response(JSON.stringify({error:{errors:[{reason:'quotaExceeded'}]}}),{status:403}))as typeof fetch;await assert.rejects(new YouTubeAdapter('K',quota).video('dQw4w9WgXcQ'),/사용량/);
 const bad=(async()=>new Response('{}',{status:400}))as typeof fetch;await assert.rejects(new YouTubeAdapter('K',bad).video('dQw4w9WgXcQ'),/키가 거부/);
 const down=(async()=>{throw new Error('net');})as typeof fetch;await assert.rejects(new YouTubeAdapter('K',down).video('dQw4w9WgXcQ'),/연결하지 못/);
 assert.throws(()=>new YouTubeAdapter(''),/YOUTUBE_API_KEY/);await assert.rejects(new YouTubeAdapter('K',ok).video('bad'),/ID/);
});
test('YouTube material: title + description + optional pasted transcript, short material flagged',()=>{
 const a=youtubeMaterial({title:'짧은 제목',description:''});assert.equal(a.enough,false);assert.equal(a.hasTranscript,false);
 const b=youtubeMaterial({title:'제목',description:'설명'},'자막 문장입니다. '.repeat(10));assert.equal(b.enough,true);assert.equal(b.hasTranscript,true);assert.ok(b.text.startsWith('제목\n설명\n'));
 assert.throws(()=>youtubeMaterial({title:'a',description:''},'x'.repeat(20001)),/20,000/);
 validateDraft(draftFromText({...blankBrief,brand:'채널'},'소재',b.text).draft);
});

const db=(s:CoraStore)=>(s as unknown as{db:DatabaseSync}).db;
const good={slug:'my-page',title:'내 링크',intro:'소개',theme:'#112233',links:[{label:'블로그',url:'https://example.com/a?b=1'}]};
test('Link page: owner saves, slugs are unique across accounts, reserved and malformed slugs refused, owners are isolated',()=>{
 const s=new CoraStore(':memory:');try{const a=s.signup('a@example.test','password123'),b=s.signup('b@example.test','password123');const lp=s.module('lp',d=>new LinkPages(d));
  const saved=lp.save(a.id,good);assert.equal(saved.links.length,1);assert.match(saved.links[0].id,/^[0-9a-f]{8}$/);
  assert.throws(()=>lp.save(b.id,good),/이미 사용 중/);
  for(const slug of['admin','api','help','l','studio','api-docs'])assert.throws(()=>lp.save(b.id,{...good,slug}),/사용할 수 없는 주소|3~30자/);
  for(const slug of['ab','UPPER_case','has space','a'.repeat(31),'한글주소','x/y'])assert.throws(()=>lp.save(b.id,{...good,slug:slug==='UPPER_case'?'UPPER_case':slug}),/주소/);
  assert.equal(lp.get(b.id).page,null);assert.equal(lp.get(a.id).page?.slug,'my-page');
  const again=lp.save(a.id,{...good,title:'수정',links:[{...saved.links[0],label:'수정한 이름'}]});assert.equal(again.links[0].id,saved.links[0].id);
  assert.equal(lp.bySlug('my-page')?.title,'수정');assert.equal(lp.bySlug('nope'),null);assert.equal(lp.bySlug('../x'),null);
  assert.ok(lp.remove(a.id));assert.equal(lp.bySlug('my-page'),null);lp.save(b.id,good);
 }finally{s.close();}
});
test('Link page validation: https-only links, label and count limits, colour, avatar size and format',()=>{
 for(const url of['http://example.com','javascript:alert(1)','data:text/html,<script>1</script>','ftp://x.example','//example.com','https://user:pw@example.com','not a url'])assert.throws(()=>validateLinkPage({...good,links:[{label:'x',url}]}),/https|형식/,url);
 assert.throws(()=>validateLinkPage({...good,links:[{label:'가'.repeat(41),url:'https://example.com'}]}),/40자/);
 assert.throws(()=>validateLinkPage({...good,links:Array.from({length:13},(_,i)=>({label:`l${i}`,url:'https://example.com'}))}),/12개/);
 assert.equal(validateLinkPage({...good,links:Array.from({length:12},(_,i)=>({label:`l${i}`,url:'https://example.com'}))}).links.length,12);
 assert.throws(()=>validateLinkPage({...good,theme:'red'}),/색상/);assert.throws(()=>validateLinkPage({...good,theme:'#12345'}),/색상/);assert.throws(()=>validateLinkPage({...good,title:''}),/제목/);assert.throws(()=>validateLinkPage({...good,intro:'x'.repeat(301)}),/300자/);
 const png='data:image/png;base64,'+'A'.repeat(1000);assert.equal(validateLinkPage({...good,avatar:png}).avatar,png);
 assert.throws(()=>validateLinkPage({...good,avatar:'data:image/png;base64,'+'A'.repeat(200*1024)}),/200KB/);
 for(const av of['https://example.com/a.png','data:image/svg+xml;base64,PHN2Zz4=','data:image/png;base64,"><script>alert(1)</script>','javascript:alert(1)'])assert.throws(()=>validateLinkPage({...good,avatar:av}),/200KB|PNG/,av);
});
test('Link page HTML: hostile user text is escaped, no script or event handlers, CSP constant is the strict policy',()=>{
 const hostile={slug:'evil-page',title:'<script>alert(1)</script>',intro:`"><img src=x onerror=alert(2)> & 'q'`,theme:'#205b4a',links:[{label:'</button><script>alert(3)</script>',url:'https://example.com/?a=1&b="2"'}]};
 const s=new CoraStore(':memory:');try{const u=s.signup('h@example.test','password123');const lp=s.module('lp',d=>new LinkPages(d));const page=lp.save(u.id,hostile);
  const html=renderLinkPage(page);
  assert.ok(!/<script/i.test(html));assert.ok(!/<img[^>]*onerror/i.test(html));const tags=[...html.matchAll(/<\/?([a-z0-9]+)/gi)].map(m=>m[1].toLowerCase());assert.ok(tags.every(t=>['html','head','meta','title','style','body','main','img','h1','p','ul','li','form','input','button','footer'].includes(t)),tags.join());assert.equal(tags.filter(t=>t==='img').length,0);
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));assert.ok(html.includes('&quot;&gt;&lt;img src=x onerror=alert(2)&gt; &amp; &#39;q&#39;'));
  assert.ok(html.includes('action="/l/evil-page/click"'));assert.ok(!html.includes('https://example.com'));// destination stays server-side
  const withAvatar=renderLinkPage({...page,avatar:'data:image/png;base64,AAAA'});assert.ok(withAvatar.includes('<img class="av" src="data:image/png;base64,AAAA"'));
  const tampered=renderLinkPage({...page,avatar:'x" onerror="1',theme:'red;}</style><script>1</script>'});assert.ok(!/<script/i.test(tampered));assert.ok(!tampered.includes('onerror="1')&&!tampered.includes('src="x'));
  assert.equal(LINK_PAGE_CSP,"default-src 'none'; img-src data: https:; style-src 'unsafe-inline'");
 }finally{s.close();}
});
test('Link page clicks: counted per link, only known links resolve, removed links drop their count, owner sees totals',()=>{
 const s=new CoraStore(':memory:');try{const a=s.signup('c@example.test','password123'),b=s.signup('d@example.test','password123');const lp=s.module('lp',d=>new LinkPages(d));
  const pg=lp.save(a.id,{...good,slug:'click-me',links:[{label:'A',url:'https://a.example/'},{label:'B',url:'https://b.example/'}]});const[A,B]=pg.links;
  assert.equal(lp.click('click-me',A.id),'https://a.example/');lp.click('click-me',A.id);lp.click('click-me',B.id);
  assert.equal(lp.click('click-me','deadbeef'),null);assert.equal(lp.click('missing',A.id),null);assert.equal(lp.click('click-me','../../x'),null);
  assert.deepEqual(lp.get(a.id).clicks,{[A.id]:2,[B.id]:1});assert.deepEqual(lp.get(b.id).clicks,{});
  lp.save(a.id,{...good,slug:'click-me',links:[{...A}]});assert.deepEqual(lp.get(a.id).clicks,{[A.id]:2});
 }finally{s.close();}
});

test('Contact: honeypot is silently not stored; field limits; per-IP rate limit; daily cap',()=>{
 const s=new CoraStore(':memory:');try{const inbox=s.module('contact',d=>new ContactInbox(d));const ok={name:'홍길동',email:'hong@example.com',message:'문의 내용입니다. 확인 부탁드립니다.'};
  assert.deepEqual(inbox.submit({...ok,website:'http://spam.example'},'1.1.1.1'),{ok:true,stored:false});assert.equal(inbox.count(),0);
  assert.deepEqual(inbox.submit(ok,'1.1.1.2'),{ok:true,stored:true});assert.equal(inbox.count(),1);assert.equal(inbox.list()[0].email,'hong@example.com');
  assert.throws(()=>inbox.submit({...ok,name:''},'2.2.2.2'),/이름/);assert.throws(()=>inbox.submit({...ok,name:'가'.repeat(51)},'2.2.2.2'),/이름/);
  assert.throws(()=>inbox.submit({...ok,email:'nope'},'2.2.2.2'),/이메일/);assert.throws(()=>inbox.submit({...ok,message:'짧음'},'2.2.2.2'),/5~2000/);assert.throws(()=>inbox.submit({...ok,message:'가'.repeat(2001)},'2.2.2.2'),/5~2000/);
  assert.equal(inbox.submit({...ok,message:'가'.repeat(2000)},'2.2.2.3').stored,true);
  const t=Date.parse('2026-01-01T00:00:00Z');for(let i=0;i<5;i++)inbox.submit(ok,'9.9.9.9',t);assert.throws(()=>inbox.submit(ok,'9.9.9.9',t+1000),/RATE_LIMIT/);
  assert.equal(inbox.submit(ok,'9.9.9.9',t+11*60_000).stored,true);assert.equal(inbox.submit(ok,'8.8.8.8',t+1000).stored,true);
  const n=inbox.count();for(let i=0;i<DAILY_CAP-n;i++)inbox.submit(ok,`10.0.${i}.1`,t+20*60_000);assert.throws(()=>inbox.submit(ok,'7.7.7.7',t+20*60_000),/내일/);
 }finally{s.close();}
});

const req=(auth?:string)=>({headers:new Headers(auth?{authorization:auth}:{})});
test('API keys: plaintext shown once, only sha256 + last4 stored, list never leaks, revoke stops auth, other users isolated',()=>{
 const s=new CoraStore(':memory:');try{const a=s.signup('k1@example.test','password123'),b=s.signup('k2@example.test','password123');const keys=s.module('ak',d=>new ApiKeys(d));
  const made=keys.create(a.id,'내 스크립트');assert.match(made.key,/^cora_[A-Za-z0-9_-]{30,}$/);assert.equal(made.last4,made.key.slice(-4));
  const rows=db(s).prepare('SELECT * FROM api_keys').all() as Record<string,string>[];assert.equal(rows.length,1);
  assert.ok(!JSON.stringify(rows).includes(made.key));assert.match(rows[0].hash,/^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(keys.list(a.id)).includes(made.key));assert.ok(!('hash' in keys.list(a.id)[0]));assert.deepEqual(keys.list(b.id),[]);
  const ok=authenticateApiKey(req(`Bearer ${made.key}`),keys);assert.ok(ok.ok&&ok.userId===a.id);
  for(const h of[undefined,'',`Bearer`,`Bearer cora_wrong`,`Basic ${made.key}`,made.key,`Bearer ${made.key}x`])assert.equal(authenticateApiKey(req(h),keys).ok,false,String(h));
  assert.equal(keys.revoke(b.id,made.id),false);assert.ok(authenticateApiKey(req(`Bearer ${made.key}`),keys).ok);
  assert.equal(keys.revoke(a.id,made.id),true);const dead=authenticateApiKey(req(`Bearer ${made.key}`),keys);assert.ok(!dead.ok&&dead.status===401);assert.equal(keys.revoke(a.id,made.id),false);assert.equal(keys.list(a.id)[0].revoked,true);
  assert.throws(()=>keys.create(a.id,''),/키 이름/);
  for(let i=0;i<MAX_ACTIVE_KEYS;i++)keys.create(a.id,`k${i}`);assert.throws(()=>keys.create(a.id,'초과'),/까지/);
 }finally{s.close();}
});
test('API keys: 60 requests per minute per key, then 429 with Retry-After seconds; window resets; keys are limited separately',()=>{
 const s=new CoraStore(':memory:');try{const a=s.signup('r1@example.test','password123');const keys=s.module('ak',d=>new ApiKeys(d));const k1=keys.create(a.id,'one').key,k2=keys.create(a.id,'two').key;const t=1_000_000;
  for(let i=0;i<60;i++){const r=authenticateApiKey(req(`Bearer ${k1}`),keys,t+i);assert.ok(r.ok);if(i===59&&r.ok)assert.equal(r.remaining,0);}
  const over=authenticateApiKey(req(`Bearer ${k1}`),keys,t+100);assert.ok(!over.ok&&over.status===429&&(over.retryAfter??0)>0);
  assert.ok(authenticateApiKey(req(`Bearer ${k2}`),keys,t+100).ok);assert.ok(authenticateApiKey(req(`Bearer ${k1}`),keys,t+61_000).ok);
 }finally{s.close();}
});
test('API keys: the projects listing that GET /api/v1/projects returns contains only the key owner projects',()=>{
 const s=new CoraStore(':memory:');try{const a=s.signup('p1@example.test','password123'),b=s.signup('p2@example.test','password123');const keys=s.module('ak',d=>new ApiKeys(d));
  const d=draftFromText({...blankBrief,brand:'A브랜드'},'A 소재','첫 문장입니다. 둘째 문장입니다.').draft;s.save(a.id,d);s.save(b.id,{...d,brief:{...d.brief,brand:'B브랜드'}});
  const auth=authenticateApiKey(req(`Bearer ${keys.create(a.id,'x').key}`),keys);assert.ok(auth.ok);if(auth.ok){const list=s.list(auth.userId);assert.equal(list.length,1);assert.equal(list[0].brand,'A브랜드');}
 }finally{s.close();}
});
