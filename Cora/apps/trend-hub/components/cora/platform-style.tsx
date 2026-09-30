'use client';
import{useState,useEffect,useCallback}from'react';import s from'./workbench.module.css';
type Stats={samples:number;sentences:number;sentenceLength:{mean:number;median:number;p25:number;p75:number;max:number};sentencesPerParagraph:number;questionRate:number;exclamationRate:number;emojiPerSentence:number;endings:{ending:string;share:number}[]};
type Profile={brand:string;stats:Stats;summary:string;llm:boolean;updatedAt:string};
async function call(data?:Record<string,unknown>){const r=await fetch('/api/cora/platform-style',{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json'}:undefined,body:data?JSON.stringify(data):undefined});const v=await r.json();if(!r.ok)throw new Error(v.error);return v;}
/** 블로그 문체 학습: 샘플 글 1~5편에서 문장 길이 통계(내 컴퓨터 계산)와 AI 문체 요약을 저장. */
export function StylePanel({brand=''}:{brand?:string}){
 const[samples,setSamples]=useState<string[]>(['']),[profiles,setProfiles]=useState<Profile[]>([]),[stats,setStats]=useState<Stats|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const refresh=useCallback(async()=>setProfiles((await call()).profiles),[]);
 useEffect(()=>{void refresh().catch(e=>setError(e.message));},[refresh]);
 const filled=samples.filter(x=>x.trim());
 async function run(f:()=>Promise<void>){if(busy)return;setBusy(true);setError('');setNotice('');try{await f();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <div className={s.root}><h2>블로그 문체 학습{brand?` · ${brand}`:''}</h2><p className={s.warning}>내가 쓴 글 1~5편(편당 100자 이상)을 넣으면 문장 길이와 말끝 통계를 계산하고, AI가 어조와 어휘 규칙을 요약합니다. 통계는 AI 없이도 저장됩니다. AI 요약은 하루 10회 생성 한도에 포함됩니다.</p>
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  <section className={s.panel}>{samples.map((t,i)=><label key={i}>샘플 글 {i+1}<textarea aria-label={`샘플 글 ${i+1}`} rows={5} maxLength={20000} value={t} onChange={e=>setSamples(x=>x.map((y,j)=>j===i?e.target.value:y))}/></label>)}
   <div className={s.actions}>{samples.length<5&&<button disabled={busy} onClick={()=>setSamples(x=>[...x,''])}>샘플 글 추가</button>}
    <button disabled={busy||!filled.length} onClick={()=>void run(async()=>setStats((await call({action:'stats',samples:filled})).stats))}>통계만 계산</button>
    <button className={s.primary} disabled={busy||!filled.length} onClick={()=>void run(async()=>{const v=await call({action:'learn',brand,samples:filled});setNotice(v.notice||'문체 프로필을 저장했습니다.');setStats(v.profile.stats);await refresh();})}>문체 프로필 저장</button></div></section>
  {stats&&<section className={s.panel} aria-label="문체 통계"><h3>계산된 통계</h3><p>문장 {stats.sentences}개 · 길이 중앙값 {stats.sentenceLength.median}자(보통 {stats.sentenceLength.p25}~{stats.sentenceLength.p75}자, 가장 긴 문장 {stats.sentenceLength.max}자) · 문단당 문장 {stats.sentencesPerParagraph}개</p><p>물음표 문장 {Math.round(stats.questionRate*100)}% · 느낌표 문장 {Math.round(stats.exclamationRate*100)}% · 자주 쓰는 문장 끝 {stats.endings.map(e=>`${e.ending} ${Math.round(e.share*100)}%`).join(', ')||'없음'}</p></section>}
  <section className={s.panel}><h3>저장한 문체 프로필</h3>{profiles.map(p=><article className={s.row} key={p.brand}><small>{p.brand||'모든 브랜드'} · 샘플 {p.stats.samples}편 · {p.llm?'AI 요약 포함':'통계만'} · {new Date(p.updatedAt).toLocaleString('ko-KR')}</small><p>문장 길이 중앙값 {p.stats.sentenceLength.median}자</p>{p.summary&&<p style={{whiteSpace:'pre-wrap'}}>{p.summary}</p>}<div className={s.actions}><button disabled={busy} onClick={()=>void run(async()=>{await call({action:'delete',brand:p.brand});await refresh();setNotice('문체 프로필을 삭제했습니다.');})}>삭제</button></div></article>)}{!profiles.length&&<p>저장한 문체 프로필이 없습니다.</p>}</section></div>;
}
