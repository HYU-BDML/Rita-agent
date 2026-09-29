import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CoraStore } from '../lib/cora/store';
import { outline, ideasFor, sampleBrief, validateDraft, rendererContract, validateBrand, importDraft } from '../lib/cora/model';
import { artwork, wrap } from '../lib/cora/artwork';
import { zip } from '../lib/cora/export';

function draft(){return outline(sampleBrief,ideasFor(sampleBrief)[0]);}
test('Cora: user ownership, session revocation, version conflict and restart persistence',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'cora-store-test-'));const filename=path.join(dir,'db.sqlite');let s=new CoraStore(filename);
 try {
  const a=s.signup('a@example.test','correct-password-a');const b=s.signup('b@example.test','correct-password-b');
  assert.throws(()=>s.login(a.email,'wrong-password'));
  assert.equal(s.login(a.email,'correct-password-a').id,a.id);
  const token=s.createSession(a.id);assert.equal(s.user(token)?.id,a.id);s.logout(token);assert.equal(s.user(token),undefined);
  const p=s.save(a.id,draft())!;assert.equal(p.version,1);assert.equal(s.get(b.id,p.id),null);assert.equal(s.save(b.id,draft(),p.id,1),null);assert.equal(s.list(b.id).length,0);
  const modified={...draft(),caption:'내가 고친 캡션'};const p2=s.save(a.id,modified,p.id,1)!;assert.equal(p2.version,2);
  assert.throws(()=>s.save(a.id,draft(),p.id,1),/CONFLICT/);assert.equal(s.get(a.id,p.id)?.caption,'내가 고친 캡션');
  s.close();s=new CoraStore(filename);assert.equal(s.get(a.id,p.id)?.version,2);assert.equal(s.get(a.id,p.id)?.caption,'내가 고친 캡션');
 } finally {s.close();rmSync(dir,{recursive:true,force:true});}
});
test('Cora: source text is preserved and image/url inputs cannot inject markup',()=>{
 const d=draft();assert.equal(validateDraft(d).brief.brand,sampleBrief.brand);
 for(const line of sampleBrief.material.split('\n'))assert.ok(d.slides.some(s=>s.body===line));
 assert.throws(()=>validateDraft({...d,postedUrl:'javascript:alert(1)'}));
 assert.throws(()=>validateDraft({...d,slides:[{...d.slides[0],image:'https://evil.test/a.svg'},d.slides[1]]}));
 assert.throws(()=>validateDraft({...d,slides:[d.slides[0],d.slides[0]]}));
 const malicious={...d.slides[0],headline:'<script>alert("x")</script>'};assert.ok(!artwork(malicious,d,0).svg.includes('<script>'));
 assert.equal(wrap('한글 test 123',4).join(''),'한글 test 123');
});
test('Cora: renderer adapter follows the edited order and title',()=>{
 const d=draft();d.slides.reverse();d.slides[0].headline='변경한 표지';const output=rendererContract(d);
 assert.equal(output.deck.slides[0].headline,'변경한 표지');assert.equal(output.deck.slides.length,d.slides.length);assert.equal(output.deck.slides[0].role,'cover');
});
test('Cora: export ZIP has UTF-8 names, a central directory and entry counts',()=>{
 const data=zip([{name:'caption.txt',bytes:new TextEncoder().encode('한국어 캡션')}]);const view=new DataView(data.buffer);
 assert.equal(view.getUint32(0,true),0x04034b50);assert.equal(view.getUint16(6,true),0x800);assert.equal(view.getUint32(data.length-22,true),0x06054b50);assert.equal(view.getUint16(data.length-12,true),1);
});

test('Cora: brand isolation, safe import, review invalidation and versioned deletion',()=>{
 const s=new CoraStore(':memory:');try{
 const a=s.signup('agency@example.test','test-password-a');const b=s.signup('other@example.test','test-password-b');
 const brand=s.saveBrand(a.id,validateBrand({name:'책방',audience:'독자',goal:'모임',accent:'#205b4a',notes:'가격 확인'}));
 assert.equal(s.brands(a.id)[0].id,brand.id);assert.equal(s.brands(b.id).length,0);
 const d=validateDraft({...draft(),workStatus:'ready',reviewNotes:'사실 확인 완료',postedUrl:'https://example.test/post'});
 const p=s.save(a.id,d)!;const imported=importDraft({...p,id:'foreign-id'});assert.equal(imported.workStatus,'draft');assert.equal(imported.postedUrl,'');assert.notEqual(imported.slides[0].id,p.slides[0].id);assert.equal('id' in imported,false);
 assert.equal(s.save(a.id,{...d,caption:'변경'},p.id,1)?.workStatus,'draft');assert.equal(s.delete(b.id,p.id,2),false);
 assert.throws(()=>s.delete(a.id,p.id,1),/CONFLICT/);assert.equal(s.get(a.id,p.id)?.version,2);assert.equal(s.delete(a.id,p.id,2),true);assert.equal(s.get(a.id,p.id),null);
 assert.throws(()=>validateDraft({...d,workStatus:'approved'}));assert.throws(()=>validateDraft({...d,slides:[null,null]}));
 }finally{s.close();}
});
