'use client';
import { useEffect, useState } from 'react';
import type { AccessibleClient } from '@/lib/cora/clients';
import type { Draft } from '@/lib/cora/model';
import type { AdAccount, AdBrief, AdResult } from '@/lib/cora/ad-creative';
import s from './workbench.module.css';

type AccountForm = Omit<AdAccount,'pillars'|'avoid'|'captions'|'updatedAt'> & {pillars:string;avoid:string;captions:string};
const blank:AccountForm={handle:'',brand:'',pillars:'',voice:'',visualRules:'',avoid:'',captions:'',accent:'#205b4a'};
const briefBlank:AdBrief={product:'',facts:'',audience:'',goal:'awareness',cta:'',disclosure:'광고',landingUrl:''};
const lines=(value:string)=>value.split('\n').map(x=>x.trim()).filter(Boolean);
const samples=(value:string)=>value.split(/\n\s*---\s*\n/g).map(x=>x.trim()).filter(Boolean);
const formOf=(a:AdAccount):AccountForm=>({...a,pillars:a.pillars.join('\n'),avoid:a.avoid.join('\n'),captions:a.captions.join('\n---\n')});
async function request(input?:Record<string,unknown>,clientId=''){const r=await fetch('/api/cora/ad-creative?'+new URLSearchParams({clientId}),{method:input?'POST':'GET',headers:input?{'Content-Type':'application/json'}:undefined,body:input?JSON.stringify({...input,clientId}):undefined});const v=await r.json();if(!r.ok)throw new Error(v.error||'광고 제작 요청 실패');return v;}

/** Manual account evidence first; approved Instagram read access can supply real samples later. */
export function AdCreativeDesk({onDraft,clientId='',client}:{clientId?:string;client?:AccessibleClient;onDraft:(draft:Draft)=>void}) {
  const call=(input?:Record<string,unknown>)=>request(input,clientId);
  const [personalProfiles,setPersonalProfiles]=useState<AdAccount[]>([]);const [account,setAccount]=useState<AccountForm>(client?{...blank,brand:client.name,voice:client.voice,visualRules:client.visualRules,pillars:client.pillars,avoid:client.avoid,accent:client.accent}:blank),[brief,setBrief]=useState<AdBrief>({...briefBlank,audience:client?.audience??''}),[profiles,setProfiles]=useState<AdAccount[]>([]),[results,setResults]=useState<AdResult[]>([]),[selected,setSelected]=useState<AdResult|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  useEffect(()=>{let active=true;void call().then(v=>{if(active){setProfiles(v.profiles);setPersonalProfiles(v.personalProfiles||[]);setResults(v.results);}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[clientId]);
  const data=()=>({handle:account.handle,brand:account.brand,pillars:lines(account.pillars),voice:account.voice,visualRules:account.visualRules,avoid:lines(account.avoid),captions:samples(account.captions),accent:account.accent});
  async function run(f:()=>Promise<void>){if(busy)return;setBusy(true);setError('');setNotice('');try{await f();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  const update=(key:keyof AccountForm,value:string)=>setAccount(a=>({...a,[key]:value}));
  const updateBrief=(key:keyof AdBrief,value:string)=>setBrief(b=>({...b,[key]:value}));
  return <div className={s.root}><h1>계정에 어울리는 광고 만들기</h1><p>{clientId?`고객사: ${client?.name??clientId} · 광고안과 결과도 이 고객사에 저장됩니다.`:'고객사 미지정 개인 작업입니다. 고객사 광고는 먼저 고객사를 선택하세요.'}</p><p>평소 게시물의 주제·말투·시각 규칙을 먼저 기록하고, 광고 목적과 확인된 상품 사실을 넣어 광고안 3개를 만듭니다. 계정 적합성 점검은 편집 판단을 돕는 규칙 검사이며 성과 예측이 아닙니다.</p>
    {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    <section className={s.panel}><h2>1. 광고가 올라갈 계정의 평소 모습</h2><p>현재는 계정 운영자가 제공한 예시로만 분석합니다. Instagram에 로그인해 게시물을 가져온 것으로 표시하지 않습니다.</p>
      {personalProfiles.length>0&&<label>개인 계정 스타일에서 가져오기<select aria-label="개인 광고 계정 스타일 가져오기" defaultValue="" onChange={e=>{const p=personalProfiles.find(x=>x.handle===e.target.value);if(p){setAccount(formOf(p));setNotice('개인 스타일을 입력란에 가져왔습니다. 고객사와 실제 계정을 확인한 뒤 저장하세요.');}}}><option value="">선택 후 검토·저장</option>{personalProfiles.map(p=><option key={p.handle} value={p.handle}>@{p.handle} · {p.brand}</option>)}</select></label>}
      {profiles.length>0&&<label>저장한 계정<select aria-label="저장한 광고 계정" defaultValue="" onChange={e=>{const p=profiles.find(x=>x.handle===e.target.value);if(p)setAccount(formOf(p));}}><option value="">새 계정 입력</option>{profiles.map(p=><option key={p.handle} value={p.handle}>@{p.handle} · {p.brand}</option>)}</select></label>}
      <label>Instagram 사용자명<input aria-label="광고 계정 사용자명" maxLength={31} value={account.handle} onChange={e=>update('handle',e.target.value)} placeholder="예: bdm.lab"/></label>
      <label>브랜드 이름<input aria-label="광고 브랜드" maxLength={80} value={account.brand} onChange={e=>update('brand',e.target.value)}/></label>
      <label>계정의 반복 주제 — 한 줄에 하나<textarea aria-label="계정 주제" rows={3} maxLength={400} value={account.pillars} onChange={e=>update('pillars',e.target.value)} placeholder="예: 데이터로 보는 마케팅\n실험과 근거"/></label>
      <label>평소 말투와 세계관<textarea aria-label="계정 말투" rows={3} maxLength={500} value={account.voice} onChange={e=>update('voice',e.target.value)} placeholder="예: 담백하고 근거 중심, 과장된 판매 문구를 쓰지 않음"/></label>
      <label>사진·색·폰트·구도 규칙<textarea aria-label="계정 시각 규칙" rows={3} maxLength={800} value={account.visualRules} onChange={e=>update('visualRules',e.target.value)} placeholder="예: 어두운 배경, 작은 청록색 강조, 도표 중심"/></label>
      <label>피할 표현 — 한 줄에 하나<textarea aria-label="광고에서 피할 표현" rows={2} maxLength={1000} value={account.avoid} onChange={e=>update('avoid',e.target.value)} placeholder="예: 무조건 성공"/></label>
      <label>기존 게시물 캡션 3~12개 — 캡션 사이에 --- 한 줄<textarea aria-label="계정 기존 캡션" rows={9} maxLength={12100} value={account.captions} onChange={e=>update('captions',e.target.value)} placeholder={'첫 번째 캡션\n---\n두 번째 캡션\n---\n세 번째 캡션'}/></label>
      <label>강조색<input aria-label="광고 강조색" type="color" value={account.accent} onChange={e=>update('accent',e.target.value)}/></label>
      <button disabled={busy} onClick={()=>void run(async()=>{const v=await call({action:'profile',account:data()});setProfiles(p=>[v.profile,...p.filter(x=>x.handle!==v.profile.handle)]);setNotice('계정 스타일을 저장했습니다.');})}>계정 스타일 저장</button>
    </section>
    <section className={s.panel}><h2>2. 이번 광고의 기획</h2><p>광고안을 만들 때 입력한 기존 캡션과 상품 사실을 설정된 AI 모델에 전송합니다. 고객 비밀정보나 공개할 수 없는 자료는 입력하지 마세요.</p>
      <label>상품·서비스<input aria-label="광고 상품" maxLength={150} value={brief.product} onChange={e=>updateBrief('product',e.target.value)}/></label>
      <label>확인된 사실만 입력<textarea aria-label="광고 사실 자료" rows={5} maxLength={3000} value={brief.facts} onChange={e=>updateBrief('facts',e.target.value)} placeholder="가격·효과·후기 등 확인되지 않은 주장은 넣지 마세요."/></label>
      <label>광고 대상<input aria-label="광고 대상" maxLength={200} value={brief.audience} onChange={e=>updateBrief('audience',e.target.value)}/></label>
      <label>목표<select aria-label="광고 목표" value={brief.goal} onChange={e=>updateBrief('goal',e.target.value)}><option value="awareness">인지</option><option value="traffic">사이트 방문</option><option value="leads">문의</option><option value="sales">구매</option></select></label>
      <label>행동 안내<input aria-label="광고 행동 안내" maxLength={160} value={brief.cta} onChange={e=>updateBrief('cta',e.target.value)} placeholder="예: 프로필 링크에서 자료 보기"/></label>
      <label>광고 표기 문구<input aria-label="광고 표기" maxLength={80} value={brief.disclosure} onChange={e=>updateBrief('disclosure',e.target.value)}/></label>
      <label>연결 주소 (선택)<input aria-label="광고 연결 주소" type="url" maxLength={1500} value={brief.landingUrl} onChange={e=>updateBrief('landingUrl',e.target.value)} placeholder="https://..."/></label>
      <button className={s.primary} disabled={busy} onClick={()=>void run(async()=>{const v=await call({action:'generate',account:data(),brief});setSelected(v.result);setResults(r=>[v.result,...r]);setNotice('광고안 3개를 만들었습니다. 각 안의 계정 적합성과 사실 관계를 확인해 주세요.');})}>{busy?'제작 중…':'계정 맞춤 광고안 3개 만들기'}</button>
    </section>
    {results.length>0&&<section className={s.panel}><h2>저장된 광고 기획</h2><label>결과 선택<select aria-label="광고 결과 선택" value={selected?.id??''} onChange={e=>setSelected(results.find(r=>r.id===e.target.value)??null)}><option value="">결과 선택</option>{results.map(r=><option key={r.id} value={r.id}>@{r.account.handle} · {r.brief.product} · {new Date(r.createdAt).toLocaleString('ko-KR')}</option>)}</select></label></section>}
    {selected&&<section className={s.panel}><h2>3. 계정 적합성 검토 후 편집</h2><p>입력한 기존 캡션 {selected.account.captions.length}개와 계정 규칙을 근거로 점검했습니다. 사진·영상은 아직 검사하지 못했으므로 편집 화면에서 반드시 비교하세요.</p>{selected.concepts.map(({concept,checks,draft},i)=><article key={i} className={s.row}><h3>{i+1}. {concept.name}</h3><p><b>첫 장:</b> {concept.hook}</p><p style={{whiteSpace:'pre-wrap'}}>{concept.caption}</p><details><summary>카드 {concept.slides.length}장과 적합성 점검</summary>{concept.slides.map((slide,j)=><p key={j}>{j+1}장. <b>{slide.headline}</b> — {slide.body}</p>)}<ul>{checks.map(c=><li key={c.id}><b>{c.status==='block'?'수정 필요':c.status==='review'?'직접 확인':'확인됨'}</b> · {c.detail}</li>)}</ul></details><button disabled={busy} onClick={()=>onDraft(draft)}>이 광고안을 카드 편집기로 가져오기</button></article>)}</section>}
  </div>;
}
