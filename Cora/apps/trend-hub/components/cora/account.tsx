'use client';
import{useState}from'react';import s from'./workbench.module.css';
/** Account data export and deletion. Deletion needs the password and the typed word “탈퇴”. */
export function AccountPanel(){
 const[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function remove(){if(busy)return;setBusy(true);setError('');try{const r=await fetch('/api/cora/account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'delete',password,confirm})});const v=await r.json();if(!r.ok)throw new Error(v.error);window.location.href='/studio';}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <section className={s.panel} aria-label="계정 자료와 탈퇴"><h2>계정 자료와 탈퇴</h2><p>내 계정에 저장된 작업·자산·설정을 JSON 파일로 내려받을 수 있습니다. 비밀번호와 로그인 정보는 파일에 들어가지 않습니다.</p><div className={s.actions}><a href="/api/cora/account" download>내 자료 내려받기(JSON)</a></div>
  <h3>회원 탈퇴</h3><p className={s.warning}>탈퇴하면 내 작업·브랜드·자산·예약·팀 소속이 지워지고 되돌릴 수 없습니다. 크레딧·결제 기록은 정산 근거로 남고, 내가 다른 사람의 작업을 검토한 기록은 상대의 작업 이력으로 남습니다.</p>
  {error&&<p role="alert">{error}</p>}
  <label>비밀번호 확인<input aria-label="탈퇴 비밀번호 확인" type="password" value={password} onChange={e=>setPassword(e.target.value)}/></label>
  <label>확인 문구(“탈퇴” 입력)<input aria-label="탈퇴 확인 문구" value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>
  <button className={s.danger} disabled={busy||!password||confirm!=='탈퇴'} onClick={()=>void remove()}>회원 탈퇴</button></section>;
}
