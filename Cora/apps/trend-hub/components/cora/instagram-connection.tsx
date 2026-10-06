'use client';
import {useEffect,useState} from 'react';
import type {ClientAccountBinding} from '@/lib/cora/client-accounts';
import s from './workbench.module.css';
type View={clientId:string;access:'owner'|'editor';binding:ClientAccountBinding|null;accounts:{igUserId:string;username:string;active:boolean;access:string;expiresAt:string;boundClientId:string|null}[]};
type Setup={localConfigReady:boolean;checks:{id:string;label:string;ready:boolean;help:string}[]};
async function request(url:string,data?:unknown){const r=await fetch(url,{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json'}:undefined,body:data?JSON.stringify(data):undefined});const v=await r.json();if(!r.ok)throw new Error(v.error);return v;}
export function InstagramConnection({clientId='',focused=true}:{clientId?:string;focused?:boolean}){
 const [data,setData]=useState<View|null>(null),[setup,setSetup]=useState<Setup|null>(null),[selected,setSelected]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const url='/api/cora/client-accounts?clientId='+encodeURIComponent(clientId);
 useEffect(()=>{
  let cancelled=false;setData(null);setSetup(null);setSelected('');setError('');setNotice('');
  const load=async()=>{
   if(focused&&!clientId)return;
   const view:View=focused?await request(url):{clientId:'',access:'owner',binding:null,accounts:(await request('/api/cora/connect/instagram?status=1')).accounts};
   const ready=view.access==='owner'?await request('/api/cora/connect/instagram?setup=1'):null;
   if(!cancelled){setData(view);setSelected(view.binding?.igUserId??'');setSetup(ready);}
  };void load().catch(e=>{if(!cancelled)setError(e.message);});return()=>{cancelled=true;};
 },[clientId,focused,url]);
 async function mutate(action:'bind'|'unbind'){
  if(busy||!data)return;setBusy(true);setError('');setNotice('');
  try{const next=await request('/api/cora/client-accounts',{action,clientId,igUserId:selected,expectedBinding:data.binding?{accountId:data.binding.accountId,version:data.binding.version}:null});setData(next);setSelected(next.binding?.igUserId??'');setNotice(action==='bind'?'선택한 계정을 이 고객사에 지정했습니다.':'고객사 연결 지정을 해제했습니다. Instagram 승인 연결은 유지됩니다.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <section className={s.panel}><h2>고객사 Instagram 연결</h2><p>소유자가 공식 승인으로 연결한 계정을 고객사에 직접 지정합니다. 계정 이름으로 자동 연결하지 않습니다. 연결 지정을 저장해도 실제 게시하거나 성과를 수집하지 않습니다.</p>{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
 {focused&&!clientId&&<p>상단에서 고객사를 먼저 선택해 주세요.</p>}
 {data&&<>{data.binding?<p>지정 계정 @{data.binding.username} · {data.binding.active?'유효한 연결':'연결 만료'} · 연결 v{data.binding.version} · {data.binding.access==='read'?'읽기 권한 요청':data.binding.access==='manage'?'운영 권한 요청':'요청 범위 확인 필요'}</p>:<p>이 고객사에 지정한 계정이 없습니다.</p>}
 <p>표시한 권한은 승인 화면에서 요청한 범위입니다. Meta의 실제 권한 허용이나 게시 가능 여부는 별도 검증이 필요합니다.</p>
 {data.access==='editor'?<p>편집자는 이 고객사의 지정 계정만 확인할 수 있습니다. 연결 변경은 소유자가 합니다.</p>:<>
 {focused&&<><label>고객사에 지정할 계정<select aria-label="고객사에 지정할 계정" disabled={busy} value={selected} onChange={e=>setSelected(e.target.value)}><option value="">계정 선택</option>{data.accounts.map(a=><option key={a.igUserId} value={a.igUserId} disabled={!a.active||!!a.boundClientId&&a.boundClientId!==clientId}>@{a.username} · {a.igUserId}{!a.active?' · 만료':a.boundClientId&&a.boundClientId!==clientId?' · 다른 고객사에 지정됨':''}</option>)}</select></label><button disabled={busy||!selected} onClick={()=>void mutate('bind')}>선택 계정을 고객사에 지정</button>{data.binding&&<button disabled={busy} onClick={()=>{if(window.confirm('고객사 계정 지정을 해제할까요?'))void mutate('unbind');}}>고객사 연결 지정 해제</button>}</>}
 {!data.accounts.length&&<p>먼저 공식 승인으로 Instagram 계정을 연결해 주세요. 비밀번호를 Cora에 입력하지 않습니다.</p>}
 {setup&&!setup.localConfigReady&&<details><summary>설정 담당자용 준비 상태</summary>{setup.checks.map(c=><p key={c.id}>{c.ready?'준비됨':'준비 필요'} · {c.label}<br/><small>{c.help}</small></p>)}</details>}
 <button disabled={busy||!setup?.localConfigReady} onClick={()=>void request('/api/cora/connect/instagram?json=1&access=read').then(v=>window.location.assign(v.url)).catch(e=>setError(e.message))}>Instagram 읽기 권한 연결</button></>}
 <button disabled={busy} onClick={()=>{setError('');void request(focused?url:'/api/cora/connect/instagram?status=1').then(v=>{const next:View=focused?v:{...data,accounts:v.accounts};setData(next);setSelected(next.binding?.igUserId??'');}).catch(e=>{setData(null);setError(e.message);});}}>계정 연결 새로고침</button></>}
 </section>;
}
