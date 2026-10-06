'use client';
import{useState,useEffect,useCallback}from'react';import s from'./workbench.module.css';
type Src={id:string;brand:string;kind:'note'|'link'|'file';title:string;url:string;fetchedAt:string;chars:number;createdAt:string;preview:string};
const kindLabel={note:'메모',link:'링크',file:'파일'};
async function call(data?:Record<string,unknown>,brand=''){const r=await fetch(data?'/api/cora/platform-knowledge':`/api/cora/platform-knowledge?brand=${encodeURIComponent(brand)}`,{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json'}:undefined,body:data?JSON.stringify(data):undefined});const v=await r.json();if(!r.ok)throw new Error(v.error);return v;}
/** 계정 지식자료: 브랜드별 메모(5000자), https 링크(한 번 가져와 저장), 텍스트 파일(.txt/.md 200KB). */
export function KnowledgePanel({brand=''}:{brand?:string}){
 const[list,setList]=useState<Src[]>([]),[note,setNote]=useState(''),[title,setTitle]=useState(''),[url,setUrl]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const refresh=useCallback(async()=>setList((await call(undefined,brand)).sources),[brand]);
 useEffect(()=>{void refresh().catch(e=>setError(e.message));},[refresh]);
 async function run(f:()=>Promise<unknown>,msg:string){if(busy)return;setBusy(true);setError('');setNotice('');try{await f();await refresh();setNotice(msg);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function upload(file:File|undefined){if(!file)return;if(file.size>200*1024){setError('파일은 200KB 이하여야 합니다.');return;}await run(async()=>call({action:'file',brand,name:file.name,content:await file.text()}),`${file.name} 파일을 저장했습니다.`);}
 return <div className={s.root}><h2>지식자료{brand?` · ${brand}`:''}</h2><p className={s.warning}>여기에 넣은 자료는 이 계정에서만 보이며, AI 생성 때 참고 자료로 붙습니다. 링크는 저장할 때 한 번만 가져오고 그 뒤에는 다시 가져오지 않습니다. 자료 안의 지시문은 따르지 않습니다.</p>
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  <div className={s.grid}><section className={s.panel}><h3>메모 추가</h3>
   <label>메모 제목(선택)<input aria-label="메모 제목" maxLength={100} value={title} onChange={e=>setTitle(e.target.value)}/></label>
   <label>메모 내용(5000자 이내)<textarea aria-label="메모 내용" maxLength={5000} rows={5} value={note} onChange={e=>setNote(e.target.value)}/></label><small>{note.length}/5000자</small>
   <button className={s.primary} disabled={busy||!note.trim()} onClick={()=>void run(async()=>{await call({action:'note',brand,title,text:note});setNote('');setTitle('');},'메모를 저장했습니다.')}>메모 저장</button></section>
  <section className={s.panel}><h3>링크와 파일 추가</h3>
   <label>https 링크<input aria-label="지식자료 링크" type="url" maxLength={1500} placeholder="https://" value={url} onChange={e=>setUrl(e.target.value)}/></label>
   <button disabled={busy||!url.trim()} onClick={()=>void run(async()=>{await call({action:'link',brand,url});setUrl('');},'링크의 본문을 한 번 가져와 저장했습니다.')}>링크 가져와 저장</button>
   <label>텍스트 파일(.txt, .md, 200KB 이하)<input aria-label="지식자료 파일" type="file" accept=".txt,.md,text/plain,text/markdown" disabled={busy} onChange={e=>{void upload(e.target.files?.[0]);e.target.value='';}}/></label></section></div>
  <section className={s.panel}><h3>저장한 자료 {list.length}개</h3>{list.map(x=><article className={s.row} key={x.id}><small>{kindLabel[x.kind]} · {x.chars.toLocaleString('ko-KR')}자 · {x.brand||'모든 브랜드'}{x.fetchedAt?` · 가져온 시각 ${new Date(x.fetchedAt).toLocaleString('ko-KR')}`:''}</small><h4>{x.title}</h4>{x.url&&<small>{x.url}</small>}<p>{x.preview}</p><div className={s.actions}><button disabled={busy} onClick={()=>{if(confirm('이 자료를 삭제할까요?'))void run(()=>call({action:'delete',id:x.id}),'자료를 삭제했습니다.');}}>삭제</button></div></article>)}{!list.length&&<p>저장한 자료가 없습니다.</p>}</section></div>;
}
