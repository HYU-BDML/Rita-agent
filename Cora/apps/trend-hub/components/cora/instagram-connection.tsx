'use client';
import {useEffect,useState} from 'react';
import s from './workbench.module.css';
export function InstagramConnection(){
 const [status,setStatus]=useState<{configured:boolean;connected:boolean;accounts:{igUserId:string;username:string;active:boolean;access:string;expiresAt:string}[]}|null>(null),[setup,setSetup]=useState<{localConfigReady:boolean;checks:{id:string;label:string;ready:boolean;help:string}[]}|null>(null),[error,setError]=useState('');
 async function read(query:string){const r=await fetch('/api/cora/connect/instagram?'+query);const v=await r.json();if(!r.ok)throw new Error(v.error);return v;}
 useEffect(()=>{Promise.all([read('status=1'),read('setup=1')]).then(([a,b])=>{setStatus(a);setSetup(b);}).catch(e=>setError(e.message));},[]);
 return <section className={s.panel}><h2>Instagram 연결 준비</h2><p>공식 Instagram 승인 화면에서 읽기 권한을 허용합니다. 비밀번호를 Cora에 입력하지 않습니다. 연결은 게시 권한의 검증이나 자동 게시를 뜻하지 않습니다.</p>{error&&<p role="alert">{error}</p>}
 {status&&<><p>{status.connected?'연결된 계정이 있습니다.':'아직 연결된 계정이 없습니다.'}</p>{status.accounts.map(a=><p key={a.igUserId}>@{a.username} · {a.active?'유효한 연결':'연결 만료'} · {a.access==='read'?'읽기 권한 요청':a.access==='manage'?'운영 권한 요청':'요청 범위 확인 필요'} · 만료 {new Date(a.expiresAt).toLocaleDateString('ko-KR')}</p>)}</>}
 {setup&&!setup.localConfigReady&&<><p>연결을 시작하기 전에 서버 설정을 준비해야 합니다.</p><details><summary>설정 담당자용 준비 상태</summary>{setup.checks.map(c=><p key={c.id}>{c.ready?'준비됨':'준비 필요'} · {c.label}<br/><small>{c.help}</small></p>)}</details></>}
 <button disabled={!setup?.localConfigReady} onClick={()=>void read('json=1&access=read').then(v=>{window.location.assign(v.url);}).catch(e=>setError(e.message))}>Instagram 읽기 권한 연결</button></section>;
}

