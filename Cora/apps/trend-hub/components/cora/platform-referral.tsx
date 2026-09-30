'use client';
import{useState,useEffect}from'react';import s from'./workbench.module.css';
type Sum={code:string;rewardedCount:number;creditsEarned:number;cap:number;referrerCredits:number;referredCredits:number;usedCode:boolean};
async function call(data?:Record<string,unknown>){const r=await fetch('/api/cora/platform-referral',{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json'}:undefined,body:data?JSON.stringify(data):undefined});const v=await r.json();if(!r.ok)throw new Error(v.error);return v;}
/** 추천 링크와 보상: 내 코드 보기, 받은 코드 입력. 보상 크레딧은 시험 기본값이며 출시 전 확인 필요. */
export function ReferralPanel(){
 const[sum,setSum]=useState<Sum|null>(null),[code,setCode]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const load=()=>call().then(setSum).catch(e=>setError(e.message));
 useEffect(()=>{void load();},[]);
 const link=sum&&typeof window!=='undefined'?`${window.location.origin}/studio?ref=${sum.code}`:'';
 async function claim(){if(busy)return;setBusy(true);setError('');setNotice('');try{const v=await call({action:'claim',code});setNotice(`추천 보상으로 ${v.credits.referred}크레딧을 받았습니다.`);setCode('');await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <div className={s.root}><h2>추천 링크와 보상</h2>{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {sum&&<div className={s.grid}><section className={s.panel}><h3>내 추천 코드</h3><p style={{fontSize:24,letterSpacing:2}} aria-label="내 추천 코드">{sum.code}</p><small>{link}</small><p>친구가 새 계정으로 가입해 이 코드를 입력하면 나와 친구 모두 크레딧을 받습니다(나 {sum.referrerCredits}, 친구 {sum.referredCredits}). 계정마다 한 번만 받을 수 있고, 내 코드로 보상받을 수 있는 친구는 {sum.cap}명까지입니다. 크레딧 수치는 시험 기본값입니다.</p><p>보상받은 친구 {sum.rewardedCount}명 · 받은 크레딧 {sum.creditsEarned}</p></section>
   <section className={s.panel}><h3>받은 추천 코드 입력</h3>{sum.usedCode?<p>이 계정은 이미 추천 코드를 사용했습니다.</p>:<><label>추천 코드<input aria-label="받은 추천 코드" maxLength={8} value={code} onChange={e=>setCode(e.target.value.toUpperCase())}/></label><button className={s.primary} disabled={busy||code.length!==8} onClick={()=>void claim()}>코드 사용</button><p>첫 작업을 저장하기 전의 새 계정에서만 쓸 수 있습니다.</p></>}</section></div>}</div>;
}
