'use client';
import {useState} from 'react';
import type {Client,ClientInput,AccessibleClient} from '@/lib/cora/clients';
import s from './workbench.module.css';
const empty:ClientInput={name:'',audience:'',goal:'',voice:'',visualRules:'',pillars:'',avoid:'',accent:'#205b4a'};
export function ClientDesk({clients,onSaved,onCreate}:{clients:AccessibleClient[];onSaved:(client:Client)=>void;onCreate:(client:Client)=>void}){
 const [editing,setEditing]=useState<Client|null>(null),[form,setForm]=useState<ClientInput>({...empty}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 async function save(){setBusy(true);setError('');setNotice('');try{const r=await fetch('/api/cora/clients',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...form,...(editing?{id:editing.id,version:editing.version}:{})})});const v=await r.json();if(!r.ok)throw new Error(v.error);onSaved(v.client);setEditing(v.client);setNotice('고객사 맥락을 저장했습니다.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <div className={s.root}><h1>고객사</h1><p>고객사의 주제와 말투를 저장하고 제작에 적용하세요. 같은 이름도 각각 별도 고객사로 관리됩니다.</p>
 {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}<div className={s.grid}>
 <section className={s.panel}><h2>관리 중인 고객사</h2><button onClick={()=>{setEditing(null);setForm({...empty});setNotice('');}}>새 고객사</button>{clients.map(c=><article className={s.row} key={c.id}><h3>{c.name}</h3><small>고객사 {c.id.slice(0,8)} · v{c.version}</small><p>{c.audience} · {c.goal}</p>{c.access==='editor'?<p>팀 고객사 · {c.ownerEmail} · 맥락 수정은 소유자만 가능합니다.</p>:<button onClick={()=>{setEditing(c);setForm(c);setNotice('');}}>맥락 수정</button>}<button onClick={()=>onCreate(c)}>이 고객사 콘텐츠 만들기</button></article>)}{!clients.length&&<p>첫 고객사를 등록해 주세요.</p>}</section>
 <section className={s.panel}><h2>{editing?'고객사 맥락 수정':'고객사 등록'}</h2><fieldset disabled={busy}>
 {([['name','고객사 이름',80],['audience','주요 고객',160],['goal','콘텐츠 목표',200],['voice','말투와 문장 예시',2000],['visualRules','시각 규칙',2000],['pillars','반복할 주제',2000],['avoid','피할 표현',2000]] as const).map(([key,label,max])=><label key={key}>{label}<textarea aria-label={label} rows={key==='name'?1:2} maxLength={max} value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})}/></label>)}
 <label>고객사 색상<input aria-label="고객사 색상" type="color" value={form.accent} onChange={e=>setForm({...form,accent:e.target.value})}/></label><button className={s.primary} disabled={!form.name.trim()} onClick={()=>void save()}>{busy?'저장 중…':'고객사 저장'}</button>
 </fieldset></section></div></div>;
}

