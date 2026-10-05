// Mounted UI check with a synthetic import response; no real YouTube request.
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CORA_PLAYWRIGHT_MODULE || '/Users/boramlim/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const runtime=process.env.CORA_REVIEW_RUNTIME;
if(!runtime) throw new Error('CORA_REVIEW_RUNTIME is required; use a disposable test copy.');
const {youtubeMaterial,youtubeNote}=await import(pathToFileURL(path.join(runtime,'lib/cora/youtube.ts')).href);
const origin=process.env.CORA_TEST_URL||'http://127.0.0.1:3226';
const out=process.env.CORA_PROOF_DIR;
if(!out) throw new Error('CORA_PROOF_DIR is required.');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome'});
const context=await browser.newContext({viewport:{width:1440,height:1100}});
const page=await context.newPage();
const proof={checks:[],errors:[],passed:false,fixture:'synthetic title/description; intercepted import HTTP; no real provider call'};
page.setDefaultTimeout(20000);
page.on('pageerror',e=>proof.errors.push(e.message));
try {
  await page.goto(origin+'/studio');
  await page.getByLabel('이메일',{exact:true}).fill(`w01-review-${Date.now()}@example.test`);
  await page.getByLabel('비밀번호',{exact:true}).fill('Synthetic-review-only-123');
  await page.getByRole('button',{name:'Cora 시작하기',exact:true}).click();
  await page.getByRole('button',{name:'PDF·YouTube 가져오기',exact:true}).click();
  proof.checks.push('labs import view mounts after synthetic local login');
  let calls=0;
  await page.route('**/api/cora/import',async route=>{
    calls++;
    const body=route.request().postDataJSON();
    assert.equal(body.action,'youtube');
    const material=youtubeMaterial({title:'짧은 영상 제목',description:'#shorts'},body.transcript||'');
    assert.equal(material.enough,false);
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({draft:null,material:material.text,hasTranscript:material.hasTranscript,note:youtubeNote(material)})});
  });
  await page.getByLabel('YouTube 주소',{exact:true}).fill('https://www.youtube.com/shorts/aaaaaaaaaaa');
  await page.getByRole('button',{name:'영상 정보 가져오기',exact:true}).click();
  const status=page.getByRole('status').filter({hasText:'제목과 설명이 짧아 카드 초안을 만들지 못했습니다'});
  await status.waitFor();
  assert.ok(!(await status.textContent()).includes('제목과 설명만 사용했습니다'));
  assert.equal(calls,1);
  proof.checks.push('no draft displays insufficiency and paste-transcript action; does not claim a draft was made');
  assert.equal(await page.getByLabel('YouTube 주소',{exact:true}).inputValue(),'https://www.youtube.com/shorts/aaaaaaaaaaa');
  assert.equal(await page.getByRole('button',{name:'영상 정보 가져오기',exact:true}).isEnabled(),true);
  proof.checks.push('failed draft attempt preserves input and re-enables the import button');
  assert.deepEqual(proof.errors,[]);
  await page.screenshot({path:path.join(out,'shorts-note-after.png'),fullPage:true});
  proof.passed=true;
} catch(e) { proof.failure=String(e); throw e; }
finally { await writeFile(path.join(out,'shorts-ui-proof.json'),JSON.stringify(proof,null,2)); await browser.close(); }
console.log(JSON.stringify(proof));
