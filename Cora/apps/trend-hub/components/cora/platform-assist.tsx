'use client';
import{useState}from'react';import s from'./workbench.module.css';
import type{Draft}from'@/lib/cora/model';
async function post(url:string,data:Record<string,unknown>){const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const v=await r.json();if(!r.ok)throw new Error(v.error);return v;}
type Applied={path:string;from:unknown;to:unknown};type Rejected={path:string;reason:string};
/** 자연어 AI 디자인 수정: 요청 한 줄을 허용된 디자인 항목 변경으로만 바꾼다. 카드 문구는 바꾸지 않고, 저장은 호출한 화면이 맡는다. */
export function DesignAssist({draft,onApply}:{draft:Draft;onApply:(d:Draft)=>void}){
 const[ins,setIns]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[res,setRes]=useState<{draft:Draft;applied:Applied[];rejected:Rejected[]}|null>(null);
 async function go(){if(busy)return;setBusy(true);setError('');setRes(null);try{const v=await post('/api/cora/platform-design',{draft,instruction:ins});setRes(v);if(v.applied.length)onApply(v.draft);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <section className={s.panel}><h3>말로 디자인 고치기</h3><p>예: “제목을 가운데 정렬하고 글자 간격을 넓혀 줘”. 색, 글꼴, 비율, 정렬, 사진 위치와 밝기만 바뀌고 카드 문구는 바뀌지 않습니다. 결과는 화면에만 반영되며 저장 버튼을 눌러야 저장됩니다.</p>
  <label>디자인 요청(300자 이내)<input aria-label="디자인 요청" maxLength={300} value={ins} onChange={e=>setIns(e.target.value)}/></label>
  <button className={s.primary} disabled={busy||!ins.trim()} onClick={()=>void go()}>{busy?'적용 중…':'디자인 수정 요청'}</button>
  {error&&<p role="alert">{error}</p>}
  {res&&<div role="status"><h4>적용된 변경 {res.applied.length}개</h4><ul>{res.applied.map((a,i)=><li key={i}>{a.path}: {JSON.stringify(a.from)}에서 {JSON.stringify(a.to)}(으)로 변경</li>)}</ul>{!res.applied.length&&<p>적용된 변경이 없습니다.</p>}
   <h4>거절된 변경 {res.rejected.length}개</h4><ul>{res.rejected.map((r,i)=><li key={i}>{r.path}: {r.reason}</li>)}</ul></div>}</section>;
}
type Idea={title:string;description:string;referenced:string;changed:string};
/** 참고 콘텐츠에서 아이디어 만들기: 공개 https 링크 또는 붙여 넣은 글에서 아이디어 5개를 만들어 자료함에 저장. */
export function ReferenceIdeas({brand=''}:{brand?:string}){
 const[url,setUrl]=useState(''),[text,setText]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[out,setOut]=useState<{ideas:Idea[];item:{id:string;data:{source?:{url:string;fetchedAt:string}}}}|null>(null);
 async function go(){if(busy)return;setBusy(true);setError('');setOut(null);try{setOut(await post('/api/cora/platform-reference',{url:url.trim()||undefined,text:url.trim()?undefined:text,brand}));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <section className={s.panel}><h3>참고 콘텐츠에서 아이디어 만들기</h3><p>링크(https) 또는 글 중 하나만 넣어 주세요. 아이디어 5개마다 무엇을 참고했고 무엇을 바꿨는지 한 줄씩 붙습니다. AI 생성 1회로 계산됩니다.</p>
  <label>참고 링크<input aria-label="참고 링크" type="url" placeholder="https://" value={url} onChange={e=>setUrl(e.target.value)}/></label>
  <label>또는 참고 글(12000자 이내)<textarea aria-label="참고 글" rows={6} maxLength={12000} disabled={!!url.trim()} value={text} onChange={e=>setText(e.target.value)}/></label>
  <button className={s.primary} disabled={busy||(!url.trim()&&!text.trim())} onClick={()=>void go()}>{busy?'만드는 중…':'아이디어 5개 만들기'}</button>
  {error&&<p role="alert">{error}</p>}
  {out&&<div role="status"><p>자료함에 저장했습니다.{out.item.data.source?.url?` 출처 ${out.item.data.source.url} · 가져온 시각 ${new Date(out.item.data.source.fetchedAt).toLocaleString('ko-KR')}`:''}</p>{out.ideas.map((d,i)=><article className={s.row} key={i}><h4>{i+1}. {d.title}</h4><p>{d.description}</p><small>무엇을 참고했고 무엇을 바꿨는지: 참고 - {d.referenced} / 변경 - {d.changed}</small></article>)}</div>}</section>;
}
/** 완성 대본 그대로 쓰기: 번호 또는 빈 줄로 나눈 장면(12개 이하)을 문구 수정 없이 카드로 옮긴다. */
export function ScriptImport({brand='',onDraft}:{brand?:string;onDraft:(d:Draft)=>void}){
 const[script,setScript]=useState(''),[b,setB]=useState(brand),[busy,setBusy]=useState(false),[error,setError]=useState(''),[n,setN]=useState(0);
 async function go(){if(busy)return;setBusy(true);setError('');setN(0);try{const v=await post('/api/cora/platform-script',{script,brand:b});setN(v.scenes);onDraft(v.draft);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <section className={s.panel}><h3>완성 대본을 카드로 가져오기</h3><p>장면을 “1.”, “2.”처럼 번호로 시작하거나 빈 줄로 나누세요(2~12개). 각 장면의 첫 줄이 카드 제목, 나머지가 본문이 되며 글은 고치지 않습니다. 번호 표시만 제목에서 빠집니다.</p>
  <label>브랜드 이름<input aria-label="브랜드 이름" maxLength={80} value={b} onChange={e=>setB(e.target.value)}/></label>
  <label>대본<textarea aria-label="완성 대본" rows={10} maxLength={8000} value={script} onChange={e=>setScript(e.target.value)}/></label>
  <button className={s.primary} disabled={busy||!script.trim()||!b.trim()} onClick={()=>void go()}>카드로 가져오기</button>
  {error&&<p role="alert">{error}</p>}{n>0&&<p role="status">장면 {n}개를 카드 {n}장으로 가져왔습니다.</p>}</section>;
}
