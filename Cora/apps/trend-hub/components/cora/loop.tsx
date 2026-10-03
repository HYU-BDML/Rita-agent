'use client';
import{useCallback,useEffect,useState}from'react';import s from'./workbench.module.css';import l from'./loop.module.css';
import type{Brief}from'@/lib/cora/model';
type Slide={headline:string;body:string};
type Cand={id:string;idx:number;hook:string;format:string;angle:string;draft:{idea:string;slides:Slide[];caption:string};status:'proposed'|'selected'|'rejected';reasonTags:string[];note:string;projectId:string|null};
type Batch={id:string;mode:string;format:string;fromActionId:string|null;createdAt:string};
type Post={id:string;candidateId:string|null;title:string;platform:string;accountLabel:string;postedAt:string;url:string;mediaId:string;hook:string|null;format:string|null};
type Snap={postId:string;day:string;ageDays:number;source:string;reach:number|null;views:number|null;likes:number|null;comments:number|null;saves:number|null;shares:number|null;follows:number|null};
type Action={id:string;reviewDay:string;ruleId:string;stage:number;kind:string;text:string;evidence:string;status:'proposed'|'accepted'|'dismissed';note:string};
type Cmp={label:string;mine:number|null;median:number|null;ratio:number|null;n:number;status:string};
type Review={day:string;posts:{id:string;title:string;ageNow:number;missingToday:boolean;compare:null|{ageDays:number;reach:Cmp;saveRate:Cmp;shareRate:Cmp}}[];hooks:{key:string;label:string;n:number;saveRate:number|null;shareRate:number|null;small:boolean}[];notes:string[]};
type Rule={id:string;stage:number;title:string;rule:string;basis:string;stability:string;automatic:boolean;sources:{url:string;publisher:string;type:string;popularity:string}[]};
type IGAccount={igUserId:string;username:string;expiresAt:string;active:boolean};
type IG={configured:boolean;missing:string[];connected:boolean;accounts:IGAccount[];username:string|null;expiresAt:string|null};
type State={instagram:IG;batches:Batch[];current:Batch|null;candidates:Cand[];posts:Post[];snapshots:Snap[];actions:Action[];playbook:Rule[];options:{hooks:Record<string,string>;formats:Record<string,string>;pickTags:string[];rejectTags:string[];metrics:string[]}};
async function call(data?:Record<string,unknown>,query=''){const r=await fetch('/api/cora/loop'+query,{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json'}:undefined,body:data?JSON.stringify(data):undefined});const v=await r.json().catch(()=>({}));if(!r.ok)throw new Error(v.error||'요청 실패');return v;}
const STAGES=['','① 후보 생산','② 사람의 선정','③ 게시','④ 매일 성과 분석','⑤ 점검과 다음 결정'];
const METRIC_LABEL:Record<string,string>={reach:'도달',views:'조회',likes:'좋아요',comments:'댓글',saves:'저장',shares:'공유',follows:'팔로우'};
const pct=(v:number|null)=>v===null?'–':`${(v*100).toFixed(2)}%`;
const STATUS:Record<string,string>={above:'기준보다 높음',below:'기준보다 낮음',similar:'기준과 비슷함',insufficient:'비교 부족'};
const today=()=>new Date().toISOString().slice(0,10);
const SOURCE_TYPE:Record<string,string>={official:'플랫폼 공식',press:'보도',research:'대규모 조사',practitioner:'실무자',cora:'Cora 기준'};

/** Cora's core loop on one screen: candidates → human choice → post record → daily metrics → review and next action. */
export function ContentLoopStudio({brief:initial,onOpen}:{brief?:Brief;onOpen?:(id:string)=>void}){
 const[st,setSt]=useState<State|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const[brief,setBrief]=useState({brand:initial?.brand??'',audience:initial?.audience??'',goal:initial?.goal??'',material:initial?.material??''});
 const[format,setFormat]=useState('carousel'),[count,setCount]=useState(3),[instructions,setInstructions]=useState(''),[fromAction,setFromAction]=useState<Action|null>(null);
 const[tags,setTags]=useState<Record<string,string[]>>({}),[notes,setNotes]=useState<Record<string,string>>({});
 const[post,setPost]=useState({candidateId:'',title:'',platform:'instagram',accountLabel:'',postedAt:'',url:'',mediaId:''});
 const[metrics,setMetrics]=useState<Record<string,Record<string,string>>>({}),[csv,setCsv]=useState(''),[review,setReview]=useState<Review|null>(null),[actNote,setActNote]=useState<Record<string,string>>({});
 // When the studio has no brief open (e.g. after a reload), continue from the latest batch's brief instead of empty fields.
 const load=useCallback(async(batchId?:string)=>{const v:State=await call(undefined,batchId?`?batchId=${batchId}`:'');setSt(v);const b=(v.current as (Batch&{brief?:Brief})|null)?.brief;if(b)setBrief(x=>x.brand.trim()||x.material.trim()?x:{brand:b.brand,audience:b.audience,goal:b.goal,material:b.material});},[]);
 useEffect(()=>{void load().catch(e=>setError(e.message));const q=new URLSearchParams(window.location.search).get('instagram');if(q)setNotice(q==='connected'?'Instagram 계정을 연결했습니다.':q==='denied'?'Instagram 권한 허용이 취소됐습니다.':`Instagram 연결 실패: ${decodeURIComponent(q)}`);},[load]);
 async function run(f:()=>Promise<void>){if(busy)return;setBusy(true);setError('');setNotice('');try{await f();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const fullBrief=()=>({brand:brief.brand,audience:brief.audience,goal:brief.goal,material:brief.material,sourceUrl:initial?.sourceUrl??'',accent:initial?.accent??'#205b4a'});
 const generate=(mode:'rules'|'ai')=>run(async()=>{const r=await call({action:'generate',mode,brief:fullBrief(),format,count,instructions,fromActionId:fromAction?.id});await load(r.batch.id);setFromAction(null);setNotice(`${mode==='ai'?'AI가':'규칙으로'} 후보 ${r.candidates.length}개를 만들었습니다.${r.rejected?.length?` 형식이 맞지 않아 뺀 후보: ${r.rejected.join(' / ')}`:''}`);});
 const decide=(c:Cand,kind:'select'|'reject')=>run(async()=>{const r=await call({action:kind,candidateId:c.id,tags:tags[c.id+kind]??[],note:notes[c.id+kind]??''});await load(st?.current?.id);if(kind==='select'){setPost(p=>({...p,candidateId:c.id,title:r.candidate.draft.idea}));setNotice('후보를 골랐습니다. 편집 화면에서 다듬은 뒤 ③에서 게시 기록을 남기세요.');}else setNotice('후보를 버렸습니다. 버린 이유는 다음 후보를 만들 때 반영됩니다.');});
 const toggle=(key:string,t:string)=>setTags(m=>({...m,[key]:(m[key]??[]).includes(t)?(m[key]??[]).filter(x=>x!==t):[...(m[key]??[]),t]}));
 const savePost=()=>run(async()=>{if(!post.postedAt)throw new Error('게시 시각을 입력해 주세요.');await call({action:'post',...post,candidateId:post.candidateId||undefined,postedAt:new Date(post.postedAt).toISOString()});await load(st?.current?.id);setPost(p=>({...p,candidateId:'',title:'',url:'',mediaId:''}));setNotice('게시 기록을 남겼습니다. 다음 날부터 ④에 매일 성과를 기록하세요.');});
 const saveMetrics=(p:Post)=>run(async()=>{const m=metrics[p.id]??{};await call({action:'metrics',postId:p.id,day:m.day||today(),...Object.fromEntries((st?.options.metrics??[]).map(k=>[k,m[k]??'']))});await load(st?.current?.id);setMetrics(x=>({...x,[p.id]:{}}));setNotice(`“${p.title}”의 ${m.day||today()} 성과를 기록했습니다.`);});
 const runReview=()=>run(async()=>{const r=await call({action:'review'});setReview(r.review);await load(st?.current?.id);setNotice(`${r.review.day} 점검을 마쳤습니다. 제안한 할 일 ${r.review.actions.filter((a:Action)=>a.status==='proposed').length}개를 확인하세요.`);});
 const decideAction=(a:Action,status:'accepted'|'dismissed')=>run(async()=>{await call({action:'decide',actionId:a.id,status,note:actNote[a.id]??''});await load(st?.current?.id);setNotice(status==='accepted'?'할 일을 채택했습니다.':'할 일을 보류했습니다.');});
 if(!st)return <section className={s.panel} aria-label="콘텐츠 순환"><p>불러오는 중입니다.</p>{error&&<p role="alert">{error}</p>}</section>;
 const selected=st.candidates.filter(c=>c.status==='selected');const snapsOf=(id:string)=>st.snapshots.filter(x=>x.postId===id);
 const proposed=st.actions.filter(a=>a.status==='proposed'),accepted=st.actions.filter(a=>a.status==='accepted').slice(0,5);
 return <section className={`${s.panel} ${l.loop}`} aria-label="콘텐츠 순환"><span className={s.eyebrow}>CONTENT LOOP</span><h2>후보를 만들고, 사람이 고르고, 매일 성과를 보고 다음을 정합니다</h2>
  <p>AI가 같은 자료로 후보를 여러 개 만들면 사람이 고르고 고친 뒤 게시합니다. 게시 뒤에는 하루 단위로 성과를 기록하고, 같은 계정의 다른 게시물과 같은 경과일끼리 비교한 점검 결과로 다음에 만들 것을 정합니다. 고르는 일과 다음 할 일의 채택은 사람이 합니다.</p>
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}

  <div className={s.row} id="loop-stage-1"><h3>{STAGES[1]}</h3>
   {fromAction&&<p className={s.warning}>채택한 할 일을 반영해 만듭니다: {fromAction.text} <button onClick={()=>setFromAction(null)}>반영 취소</button></p>}
   <div className={s.grid}><div>
    <label>브랜드<input aria-label="순환 브랜드" value={brief.brand} onChange={e=>setBrief({...brief,brand:e.target.value})}/></label>
    <label>대상<input aria-label="순환 대상" value={brief.audience} onChange={e=>setBrief({...brief,audience:e.target.value})}/></label>
    <label>목표<input aria-label="순환 목표" value={brief.goal} onChange={e=>setBrief({...brief,goal:e.target.value})}/></label>
   </div><div>
    <label>자료(사실만 적습니다)<textarea aria-label="순환 자료" rows={6} value={brief.material} onChange={e=>setBrief({...brief,material:e.target.value})}/></label>
    <label>형식<select aria-label="순환 형식" value={format} onChange={e=>setFormat(e.target.value)}>{Object.entries(st.options.formats).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
    <label>후보 수<input aria-label="순환 후보 수" type="number" min={2} max={5} value={count} onChange={e=>setCount(Number(e.target.value))}/></label>
    <label>이번 회차 지시(선택)<input aria-label="순환 지시" value={instructions} onChange={e=>setInstructions(e.target.value)}/></label>
   </div></div>
   <div className={s.actions}><button disabled={busy} onClick={()=>generate('rules')}>규칙으로 후보 만들기(AI 없음)</button><button className={l.primary} disabled={busy} onClick={()=>generate('ai')}>AI로 후보 만들기</button></div>
   <p className={s.muted}>AI 없이 만든 후보는 카드 구성과 첫 장 제목만 다르고 본문은 입력한 자료 그대로입니다. AI 후보는 1회 호출로 여러 개를 만들며 하루 생성 한도에 포함됩니다.</p>
  </div>

  <div className={s.row}><h3>{STAGES[2]}</h3>
   {st.batches.length>1&&<label>후보 묶음<select aria-label="후보 묶음" value={st.current?.id??''} onChange={e=>void run(()=>load(e.target.value))}>{st.batches.map(b=><option key={b.id} value={b.id}>{new Date(b.createdAt).toLocaleString('ko-KR')} · {b.mode==='ai'?'AI':'규칙'}{b.fromActionId?' · 할 일 반영':''}</option>)}</select></label>}
   {!st.candidates.length?<p className={s.muted}>아직 후보가 없습니다. ①에서 후보를 만드세요.</p>:<div className={s.grid}>{st.candidates.map(c=><article key={c.id} className={s.panel} aria-label={`후보 ${c.idx+1}`}>
    <b>후보 {c.idx+1} · {st.options.hooks[c.hook]}</b> <span className={s.muted}>{st.options.formats[c.format]} · {c.status==='proposed'?'결정 전':c.status==='selected'?'선택함':'버림'}</span>
    <p>{c.angle}</p><ol>{c.draft.slides.map((x,i)=><li key={i}><b>{x.headline}</b>{i===0?null:<span className={s.muted}> {x.body.slice(0,60)}{x.body.length>60?'…':''}</span>}</li>)}</ol>
    {c.status==='proposed'?<>
     <fieldset><legend>고른 이유</legend>{st.options.pickTags.map(t=><label key={t}><input type="checkbox" aria-label={`후보 ${c.idx+1} 고른 이유 ${t}`} checked={(tags[c.id+'select']??[]).includes(t)} onChange={()=>toggle(c.id+'select',t)}/>{t}</label>)}<input aria-label={`후보 ${c.idx+1} 고른 이유 메모`} placeholder="직접 적기" value={notes[c.id+'select']??''} onChange={e=>setNotes({...notes,[c.id+'select']:e.target.value})}/></fieldset>
     <button className={l.primary} disabled={busy} onClick={()=>decide(c,'select')}>후보 {c.idx+1}로 결정</button>
     <fieldset><legend>버린 이유</legend>{st.options.rejectTags.map(t=><label key={t}><input type="checkbox" aria-label={`후보 ${c.idx+1} 버린 이유 ${t}`} checked={(tags[c.id+'reject']??[]).includes(t)} onChange={()=>toggle(c.id+'reject',t)}/>{t}</label>)}<input aria-label={`후보 ${c.idx+1} 버린 이유 메모`} placeholder="직접 적기" value={notes[c.id+'reject']??''} onChange={e=>setNotes({...notes,[c.id+'reject']:e.target.value})}/></fieldset>
     <button disabled={busy} onClick={()=>decide(c,'reject')}>후보 {c.idx+1} 버리기</button></>
    :<p className={s.muted}>이유: {[...c.reasonTags,c.note].filter(Boolean).join(', ')}{c.projectId&&onOpen?<> · <button onClick={()=>onOpen(c.projectId!)}>편집 화면에서 열기</button></>:null}</p>}
   </article>)}</div>}
  </div>

  <div className={s.row}><h3>{STAGES[3]}</h3>
   <div className={s.panel} aria-label="Instagram 연결 상태">{!st.instagram.configured?<><b>Instagram 연결 준비 전</b> <span className={s.muted}>Meta 앱을 발급해 서버 설정({st.instagram.missing.join(', ')})을 넣으면 연결 버튼이 생깁니다. 그 전까지는 성과를 직접 입력하거나 CSV로 올립니다.</span></>:<><b>{st.instagram.accounts.length?`연결된 Instagram 계정 ${st.instagram.accounts.length}개`:'Instagram 계정이 연결되지 않았습니다.'}</b>{st.instagram.accounts.map(a=><div key={a.igUserId}>@{a.username} <span className={s.muted}>{a.active?`토큰 만료 ${a.expiresAt.slice(0,10)} · 만료 7일 전부터 자동 갱신`:'만료됨, 다시 연결 필요'}</span> <button disabled={busy} onClick={()=>run(async()=>{const r=await fetch('/api/cora/connect/instagram',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'disconnect',igUserId:a.igUserId})});if(!r.ok)throw new Error('연결 해제 실패');await load(st.current?.id);setNotice(`@${a.username} 연결을 해제했습니다.`);})}>연결 해제</button></div>)} <a className={l.primary} href="/api/cora/connect/instagram">{st.instagram.accounts.length?'다른 계정 추가 연결':'Instagram 계정 연결'}</a> <span className={s.muted}>여러 계정을 연결하면 게시 기록의 계정 이름(@아이디)으로 성과를 가져올 계정을 고릅니다. 비밀번호는 Cora에 입력하지 않고 Instagram 화면에서 직접 로그인합니다.</span></>}</div>
   <p className={s.muted}>실제 게시는 “게시 준비”에서 승인한 뒤 진행합니다. Instagram 계정을 연결하기 전에는 직접 올린 게시물을 여기 기록합니다. Instagram 게시물 ID를 적으면 연결 후 매일 성과를 자동으로 가져올 수 있습니다.</p>
   <div className={s.grid}><div>
    <label>고른 후보<select aria-label="게시한 후보" value={post.candidateId} onChange={e=>{const c=st.candidates.find(x=>x.id===e.target.value);setPost({...post,candidateId:e.target.value,title:c?c.draft.idea:post.title});}}><option value="">후보 없이 기록</option>{selected.map(c=><option key={c.id} value={c.id}>후보 {c.idx+1} · {st.options.hooks[c.hook]}</option>)}</select></label>
    <label>게시물 제목<input aria-label="게시물 제목" value={post.title} onChange={e=>setPost({...post,title:e.target.value})}/></label>
    <label>플랫폼<select aria-label="게시 플랫폼" value={post.platform} onChange={e=>setPost({...post,platform:e.target.value})}><option value="instagram">Instagram</option><option value="youtube">YouTube</option><option value="tiktok">TikTok</option><option value="blog">블로그</option><option value="other">기타</option></select></label>
   </div><div>
    <label>계정 이름<input aria-label="게시 계정" value={post.accountLabel} onChange={e=>setPost({...post,accountLabel:e.target.value})}/></label>
    <label>게시 시각<input aria-label="게시 시각" type="datetime-local" value={post.postedAt} onChange={e=>setPost({...post,postedAt:e.target.value})}/></label>
    <label>게시물 주소(선택)<input aria-label="게시물 주소" value={post.url} onChange={e=>setPost({...post,url:e.target.value})}/></label>
    <label>Instagram 게시물 ID(선택)<input aria-label="Instagram 게시물 ID" value={post.mediaId} onChange={e=>setPost({...post,mediaId:e.target.value})}/></label>
   </div></div>
   <div className={s.actions}><button className={l.primary} disabled={busy} onClick={savePost}>게시 기록 남기기</button></div>
  </div>

  <div className={s.row}><h3>{STAGES[4]}</h3>
   <p className={s.muted}>게시 다음 날부터 매일 같은 시각에 기록합니다. 모르는 칸은 비워 두면 0이 아닌 “없음”으로 처리합니다.</p>
   {!st.posts.length?<p className={s.muted}>게시 기록이 없습니다.</p>:st.posts.map(p=>{const list=snapsOf(p.id),m=metrics[p.id]??{};return <div key={p.id} className={s.panel} aria-label={`성과 ${p.title}`}>
    <b>{p.title}</b> <span className={s.muted}>{p.platform} · {p.accountLabel} · {new Date(p.postedAt).toLocaleString('ko-KR')} 게시 · 기록 {list.length}일</span>
    {list.length>0&&<table><thead><tr><th>날짜</th><th>경과일</th>{st.options.metrics.map(k=><th key={k}>{METRIC_LABEL[k]}</th>)}<th>출처</th></tr></thead><tbody>{list.slice(-7).map(x=><tr key={x.day}><td>{x.day}</td><td>{x.ageDays}</td>{st.options.metrics.map(k=><td key={k}>{(x as unknown as Record<string,number|null>)[k]??'–'}</td>)}<td>{x.source}</td></tr>)}</tbody></table>}
    <div className={l.metricRow}><label>날짜<input aria-label={`${p.title} 기록 날짜`} type="date" value={m.day??today()} onChange={e=>setMetrics({...metrics,[p.id]:{...m,day:e.target.value}})}/></label>{st.options.metrics.map(k=><label key={k}>{METRIC_LABEL[k]}<input aria-label={`${p.title} ${METRIC_LABEL[k]}`} inputMode="numeric" size={6} value={m[k]??''} onChange={e=>setMetrics({...metrics,[p.id]:{...m,[k]:e.target.value}})}/></label>)}<button disabled={busy} onClick={()=>saveMetrics(p)}>기록</button></div>
   </div>;})}
   {st.instagram.connected&&<div className={s.actions}><button className={l.primary} disabled={busy} onClick={()=>run(async()=>{const r=await call({action:'collect'});await load(st.current?.id);setNotice(`Instagram 성과 ${r.saved}건을 가져왔습니다.${r.results.length>r.saved?` 실패 ${r.results.length-r.saved}건: ${r.results.filter((x:{ok:boolean})=>!x.ok).map((x:{detail:string})=>x.detail).join(' / ')}`:''}`);})}>Instagram에서 오늘 성과 가져오기</button></div>}
   <details><summary>CSV로 한꺼번에 기록</summary><p className={s.muted}>열 이름: post_id, day, reach, views, likes, comments, saves, shares, follows. 한 행이라도 틀리면 아무것도 저장하지 않습니다. 게시물 ID: {st.posts.map(p=>`${p.title}=${p.id}`).join(', ')||'없음'}</p><textarea aria-label="성과 CSV" rows={4} value={csv} onChange={e=>setCsv(e.target.value)}/><button disabled={busy||!csv.trim()} onClick={()=>run(async()=>{const r=await call({action:'import',csv});await load(st.current?.id);setCsv('');setNotice(`${r.saved}행을 기록했습니다.`);})}>CSV 기록</button></details>
  </div>

  <div className={s.row}><h3>{STAGES[5]}</h3>
   <div className={s.actions}><button className={l.primary} disabled={busy} onClick={runReview}>오늘 점검 실행</button></div>
   {review&&<>
    <table aria-label="게시물별 점검"><thead><tr><th>게시물</th><th>비교 경과일</th><th>저장률</th><th>공유율</th><th>도달</th></tr></thead><tbody>{review.posts.map(p=><tr key={p.id}><td>{p.title}{p.missingToday?' (오늘 기록 없음)':''}</td>{p.compare?<><td>{p.compare.ageDays}일째</td>{[p.compare.saveRate,p.compare.shareRate].map((c,i)=><td key={i}>{pct(c.mine)} · 중앙값 {pct(c.median)} · {c.ratio===null?'–':`${c.ratio.toFixed(2)}배`} · {STATUS[c.status]} (비교 {c.n}개)</td>)}<td>{p.compare.reach.mine??'–'} · {STATUS[p.compare.reach.status]}</td></>:<td colSpan={4}>성과 기록 없음</td>}</tr>)}</tbody></table>
    {review.hooks.length>0&&<table aria-label="시작 방식별 비교"><thead><tr><th>시작 방식</th><th>게시물 수</th><th>저장률 중앙값</th><th>공유율 중앙값</th></tr></thead><tbody>{review.hooks.map(h=><tr key={h.key}><td>{h.label}</td><td>{h.n}{h.small?' (3개 미만)':''}</td><td>{pct(h.saveRate)}</td><td>{pct(h.shareRate)}</td></tr>)}</tbody></table>}
    <ul>{review.notes.map(n=><li key={n} className={s.muted}>{n}</li>)}</ul>
   </>}
   <h3>제안된 다음 할 일</h3>
   {!proposed.length?<p className={s.muted}>결정을 기다리는 할 일이 없습니다. 점검을 실행하세요.</p>:proposed.map(a=><div key={a.id} className={s.panel} aria-label={`할 일 ${a.text}`}><b>{STAGES[a.stage]}</b><p>{a.text}</p><p className={s.muted}>근거 수치: {a.evidence} · 규칙 {a.ruleId}</p>
    <input aria-label={`할 일 메모 ${a.ruleId}`} placeholder="보류할 때는 이유를 적습니다" value={actNote[a.id]??''} onChange={e=>setActNote({...actNote,[a.id]:e.target.value})}/>
    <div className={s.actions}><button className={l.primary} disabled={busy} onClick={()=>decideAction(a,'accepted')}>채택</button><button disabled={busy} onClick={()=>decideAction(a,'dismissed')}>보류</button></div></div>)}
   {accepted.length>0&&<><h3>채택한 할 일</h3>{accepted.map(a=><p key={a.id}>{a.text} {a.stage===5&&<button disabled={busy} onClick={()=>{setFromAction(a);document.getElementById('loop-stage-1')?.scrollIntoView({behavior:'smooth'});}}>이 할 일로 다음 후보 만들기</button>}</p>)}</>}
  </div>

  <details className={s.row}><summary>순환 규칙과 근거 {st.playbook.length}개</summary>
   {[1,2,3,4,5].map(n=>{const rules=st.playbook.filter(r=>r.stage===n);return rules.length?<div key={n}><h3>{STAGES[n]}</h3>{rules.map(r=><div key={r.id}><b>{r.title}</b> <span className={s.muted}>{r.stability}{r.automatic?' · 점검 때 자동 적용':' · 확인 목록'}</span><p>{r.rule}</p><p className={s.muted}>{r.basis} {r.sources.filter(x=>x.url).map(x=><span key={x.url}> · <a href={x.url} target="_blank" rel="noreferrer">{x.publisher}</a> ({SOURCE_TYPE[x.type]??x.type})</span>)}</p></div>)}</div>:null;})}
  </details>
 </section>;
}
