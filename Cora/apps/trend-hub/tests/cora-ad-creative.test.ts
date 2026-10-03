import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CoraStore } from '../lib/cora/store';
import { AdCreativeStore, adPrompt, checkAdFit, validateAdAccount, validateAdBrief } from '../lib/cora/ad-creative';

const account={handle:'bdm.lab',brand:'BDM Lab',pillars:['데이터로 보는 마케팅','실험과 근거'],voice:'담백하고 근거 중심',visualRules:'검정 배경에 청록 강조, 도표 중심',avoid:['무조건 성공'],captions:[
  '감 대신 근거. 과장 대신 데이터. 알고리즘을 해부하고 구조를 읽습니다.',
  '데이터로 보는 마케팅에서는 관찰과 결론을 구분합니다. 오늘은 실험의 조건을 살펴봅니다.',
  '실험과 근거를 바탕으로 콘텐츠의 다음 질문을 찾아봅니다. 숫자의 맥락을 함께 봅니다.',
],accent:'#205b4a'};
const brief={product:'마케팅 분석 워크숍',facts:'실제 계정의 게시물 사례를 함께 살펴보는 온라인 워크숍입니다.',audience:'SNS 담당자',goal:'leads',cta:'프로필 링크에서 일정 확인',disclosure:'광고',landingUrl:'https://example.test/workshop'};
const concept=(caption='광고 · 데이터로 보는 마케팅. 프로필 링크에서 일정 확인')=>({name:'근거 중심',hook:'감이 아닌 데이터',caption,slides:[
  {headline:'감이 아닌 데이터',body:'실제 계정 사례를 함께 살펴봅니다.'},
  {headline:'실험과 근거',body:'온라인 워크숍에서 사례를 나눕니다.'},
  {headline:'일정 보기',body:'프로필 링크에서 일정 확인'},
]});

test('account-fit ad generation saves three editable drafts for only the requesting user', async()=>{
  const s=new CoraStore(':memory:');const owner=s.signup('ad-owner@example.test','password123').id,other=s.signup('ad-other@example.test','password123').id;
  const ads=s.module('ad-creative',db=>new AdCreativeStore(db));
  const profile=ads.saveProfile(owner,account);assert.equal(profile.handle,'bdm.lab');assert.equal(ads.profiles(other).length,0);
  let prompt='';const result=await ads.generate(owner,account,brief,async p=>{prompt=p;return JSON.stringify({concepts:[concept(),concept(),concept()]});});
  assert.match(prompt,/검정 배경에 청록 강조/);assert.match(prompt,/확인된 상품 사실 밖/);
  assert.equal(result.concepts.length,3);assert.equal(result.concepts[0].draft.brief.brand,'BDM Lab');
  assert.equal(result.concepts[0].draft.workStatus,'draft');assert.equal(result.concepts[0].draft.slides.length,3);
  assert.equal(ads.results(owner).length,1);assert.equal(ads.results(other).length,0);
  assert.equal(result.concepts[0].checks.find(x=>x.id==='visual')?.status,'review');
});

test('account-fit checks flag absent disclosure, prohibited text and unsupported numeric claims without inventing a performance score',()=>{
  const a=validateAdAccount(account),b=validateAdBrief(brief);
  const checks=checkAdFit(a,b,concept('무조건 성공! 데이터로 보는 마케팅에서 99% 성과. 프로필 링크에서 일정 확인'));
  assert.equal(checks.find(x=>x.id==='disclosure')?.status,'block');
  assert.equal(checks.find(x=>x.id==='avoid')?.status,'block');
  assert.equal(checks.find(x=>x.id==='facts')?.status,'review');
  assert.equal(checks.some(x=>x.id==='score'),false);
});

test('ad profiles require account evidence and invalid model output is not saved',async()=>{
  assert.throws(()=>validateAdAccount({...account,captions:['한 개']}),/3~12/);
  assert.throws(()=>validateAdBrief({...brief,landingUrl:'http://example.test'}),/HTTPS/);
  const s=new CoraStore(':memory:');const u=s.signup('ad-bad@example.test','password123').id;
  const ads=s.module('ad-creative',db=>new AdCreativeStore(db));
  await assert.rejects(ads.generate(u,account,brief,async()=>'{"concepts":[]}'),/3개/);
  assert.equal(ads.results(u).length,0);
  assert.ok(adPrompt(validateAdAccount(account),validateAdBrief(brief)).includes('<account_data>'));
});
