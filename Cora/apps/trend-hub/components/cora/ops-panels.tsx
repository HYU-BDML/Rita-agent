'use client';
import{useEffect,useState}from'react';import s from'./workbench.module.css';import type{FollowerTrend,NormalizedMetrics}from'@/lib/cora/analytics';
type Template={id:string;title:string;frequency:string;format:string;description:string};
type Stat={available:boolean;label:string;n:number;missing:number;median:number|null;weighted:number|null;smallSample:boolean;note:string};
type Thread={id:string;title:string;platform:'threads'|'x';posts:{text:string;quotePrevious:boolean}[];attachDate:string|null;updatedAt:string};
async function call(url:string,data?:Record<string,unknown>){const r=await fetch(url,{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json'}:undefined,body:data?JSON.stringify(data):undefined});const v=await r.json().catch(()=>({}));if(!r.ok)throw new Error(v.error||'요청 실패');return v;}
const pct=(x:number|null)=>x==null?'계산 안 함':`${(x*100).toFixed(2)}%`;
function useRun(){const[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');return{busy,error,notice,setNotice,run:async(f:()=>Promise<void>)=>{if(busy)return;setBusy(true);setError('');setNotice('');try{await f();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}};}

/** F065: three example automation recipes saved as the user's own recipe. */
export function RecipeTemplates({onSaved}:{onSaved?:()=>void}){
 const[list,setList]=useState<Template[]>([]),[brand,setBrand]=useState('');const r=useRun();
 useEffect(()=>{void call('/api/cora/ops-recipes').then(v=>setList(v.templates)).catch(()=>{});},[]);
 return <section className={s.panel} aria-label="자동화 예시 레시피"><h2>자동화 예시 세 가지</h2><p>예시를 내 레시피로 저장한 뒤 지시문을 고쳐 쓰세요. 저장하면 “저장한 레시피” 목록에 나타납니다.</p>{r.error&&<p role="alert">{r.error}</p>}{r.notice&&<p role="status">{r.notice}</p>}
  <label>레시피에 넣을 브랜드<input aria-label="예시 레시피 브랜드" value={brand} onChange={e=>setBrand(e.target.value)}/></label>
  {list.map(t=><article className={s.row} key={t.id}><small>{t.frequency} · {t.format}</small><h3>{t.title}</h3><p>{t.description}</p><button disabled={r.busy} onClick={()=>void r.run(async()=>{await call('/api/cora/ops-recipes',{templateId:t.id,brand});r.setNotice(`“${t.title}”을 내 레시피로 저장했습니다.`);onSaved?.();})}>내 레시피로 저장</button></article>)}
 </section>;
}

/** F071: ordered thread drafts (2–10 posts, ≤500 chars each) with export. Nothing is posted. */
export function ThreadComposer(){
 const[items,setItems]=useState<Thread[]>([]),[title,setTitle]=useState(''),[platform,setPlatform]=useState<'threads'|'x'>('threads'),[posts,setPosts]=useState([{text:'',quotePrevious:false},{text:'',quotePrevious:false}]),[date,setDate]=useState('');const r=useRun();
 const load=async()=>setItems((await call('/api/cora/ops-threads')).threads??[]);
 useEffect(()=>{void load().catch(()=>{});},[]);
 const set=(i:number,v:Partial<{text:string;quotePrevious:boolean}>)=>setPosts(p=>p.map((x,j)=>j===i?{...x,...v}:x));
 return <section className={s.panel} aria-label="연속 게시물 초안"><h2>연속 게시물 초안</h2><p>Threads·X용으로 2~10개 글을 순서대로 적습니다. 저장·내보내기만 하며 실제 게시는 하지 않습니다.</p>{r.error&&<p role="alert">{r.error}</p>}{r.notice&&<p role="status">{r.notice}</p>}
  <label>초안 제목<input aria-label="연속 게시물 제목" value={title} onChange={e=>setTitle(e.target.value)}/></label>
  <label>플랫폼<select aria-label="연속 게시물 플랫폼" value={platform} onChange={e=>setPlatform(e.target.value as 'threads'|'x')}><option value="threads">Threads</option><option value="x">X</option></select></label>
  {posts.map((p,i)=><div key={i} className={s.row}><label>{i+1}번째 글 ({Array.from(p.text).length}/500)<textarea aria-label={`연속 게시물 ${i+1}번째 글`} rows={3} value={p.text} onChange={e=>set(i,{text:e.target.value})}/></label>{i>0&&<label style={{display:'flex',gap:8,alignItems:'center'}}><input type="checkbox" style={{width:'auto'}} aria-label={`${i+1}번째 글에서 앞 글 인용`} checked={p.quotePrevious} onChange={e=>set(i,{quotePrevious:e.target.checked})}/>앞 글 인용</label>}</div>)}
  <div className={s.actions}><button disabled={posts.length>=10} onClick={()=>setPosts(p=>[...p,{text:'',quotePrevious:false}])}>글 추가</button><button disabled={posts.length<=2} onClick={()=>setPosts(p=>p.slice(0,-1))}>마지막 글 빼기</button></div>
  <label>달력에 붙일 날짜(선택)<input aria-label="연속 게시물 날짜" type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
  <button className={s.primary} disabled={r.busy} onClick={()=>void r.run(async()=>{await call('/api/cora/ops-threads',{action:'create',title,platform,posts,attachDate:date||null});await load();r.setNotice('연속 게시물 초안을 저장했습니다.');})}>초안 저장</button>
  {items.map(t=><article className={s.row} key={t.id}><small>{t.platform} · 글 {t.posts.length}개{t.attachDate?` · ${t.attachDate}`:''}</small><h3>{t.title}</h3><div className={s.actions}><a href={`/api/cora/ops-threads?id=${t.id}&format=text`} download>텍스트로 내보내기</a><a href={`/api/cora/ops-threads?id=${t.id}&format=json`} download>JSON으로 내보내기</a><button className={s.danger} disabled={r.busy} onClick={()=>void r.run(async()=>{await call('/api/cora/ops-threads',{action:'delete',id:t.id});await load();})}>삭제</button></div></article>)}
 </section>;
}

/** F087·F088·F089·F086 for one saved CSV analysis: normalized rates, period comparison, report download, AI question. */
export function AnalysisTools({analysisId,llm}:{analysisId:string;llm:boolean}){
 const[data,setData]=useState<{normalized:NormalizedMetrics;followers:FollowerTrend|null;comparison:unknown}|null>(null);
 const[p,setP]=useState({aFrom:'',aTo:'',bFrom:'',bTo:''}),[question,setQuestion]=useState(''),[answer,setAnswer]=useState('');const r=useRun();
 const load=()=>r.run(async()=>{const q=new URLSearchParams({analysisId,...Object.fromEntries(Object.entries(p).filter(([,v])=>v))});setData(await call('/api/cora/ops-analytics?'+q));});
 useEffect(()=>{void load();},[analysisId]);// eslint-disable-line react-hooks/exhaustive-deps
 const period=p.aFrom&&p.aTo&&p.bFrom&&p.bTo?{a:{from:p.aFrom,to:p.aTo},b:{from:p.bFrom,to:p.bTo}}:undefined;
 const range=`&aFrom=${p.aFrom}&aTo=${p.aTo}&bFrom=${p.bFrom}&bTo=${p.bTo}`;
 return <section className={s.panel} aria-label="지표 정규화와 기간 비교"><h2>지표 정규화와 기간 비교</h2>{r.error&&<p role="alert">{r.error}</p>}{r.notice&&<p role="status">{r.notice}</p>}
  {data&&<><p>입력 {data.normalized.sample.inputRows}행 · 중복 {data.normalized.sample.duplicateRows}행 · 도달 빈칸·0 {data.normalized.sample.reachMissingOrZero}행 · 비율 계산 {data.normalized.sample.reachEligibleRows}행</p>
   <div style={{overflowX:'auto'}}><table><thead><tr><th>지표</th><th>표본</th><th>빈칸</th><th>중앙값</th><th>가중 비율</th></tr></thead><tbody>{Object.entries(data.normalized.metrics).map(([k,m])=><tr key={k}><td>{m.label}</td><td>{m.available?m.n:'열 없음'}{m.smallSample&&m.available?' (작은 표본)':''}</td><td>{m.missing}</td><td>{pct(m.median)}</td><td>{pct(m.weighted)}</td></tr>)}</tbody></table></div>
   {data.followers?.available&&data.followers.first&&data.followers.last?<p>팔로워 {data.followers.first.followers} ({data.followers.first.date}) → {data.followers.last.followers} ({data.followers.last.date}), 변화 {(data.followers.change??0)>=0?'+':''}{data.followers.change}</p>:data.followers?.reason?<p>{data.followers.reason}</p>:null}
   <ul>{data.normalized.notes.map(n=><li key={n}>{n}</li>)}</ul></>}
  <h3>두 기간 비교</h3><div className={s.actions}>{(['aFrom','aTo','bFrom','bTo'] as const).map(k=><label key={k}>{{aFrom:'A 시작',aTo:'A 끝',bFrom:'B 시작',bTo:'B 끝'}[k]}<input aria-label={`기간 ${k}`} type="date" value={p[k]} onChange={e=>setP({...p,[k]:e.target.value})}/></label>)}</div>
  <button disabled={r.busy} onClick={()=>void load()}>기간 비교 계산</button>
  {data?.comparison!=null&&<pre className={s.pre} aria-label="기간 비교 결과">{JSON.stringify(data.comparison,null,2)}</pre>}
  <h3>리포트 내려받기</h3><div className={s.actions}><a href={`/api/cora/ops-report?analysisId=${analysisId}&format=md${period?range:''}`} download>Markdown 리포트</a><a href={`/api/cora/ops-report?analysisId=${analysisId}&format=html${period?range:''}`} download>HTML 리포트</a></div>
  <h3>AI에게 성과 질문</h3><p>집계표만 AI에 보내며 게시물별 원자료는 보내지 않습니다. 답은 인과 판단이 아닌 해석이고, 하루 10회 AI 한도에 포함됩니다.</p>
  <label>질문<input aria-label="성과 질문" maxLength={500} value={question} onChange={e=>setQuestion(e.target.value)} placeholder="예: 저장률이 높은 게시물의 공통점은?"/></label>
  <button disabled={r.busy||!llm||!question.trim()} onClick={()=>void r.run(async()=>{const v=await call('/api/cora/ops-insights',{analysisId,question,periods:period});setAnswer(String(v.item?.data?.text??v.answer??''));r.setNotice('AI 해석을 소재 보관함에 저장했습니다.');})}>AI 해석 받기</button>
  {answer&&<p className={s.pre}>{answer}</p>}
 </section>;
}
