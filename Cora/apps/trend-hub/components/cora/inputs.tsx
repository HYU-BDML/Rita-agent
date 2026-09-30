'use client';
import{useState,useEffect,useCallback}from'react';import s from'./workbench.module.css';
async function call<T>(url:string,data?:Record<string,unknown>):Promise<T>{const r=await fetch(url,{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json'}:undefined,body:data?JSON.stringify(data):undefined});const v=await r.json();if(!r.ok)throw new Error(v.error||'요청 실패');return v;}
const toBase64=async(f:File)=>{const b=new Uint8Array(await f.arrayBuffer());let out='';for(let i=0;i<b.length;i+=0x8000)out+=String.fromCharCode(...b.subarray(i,i+0x8000));return btoa(out);};
const dataUrl=(f:File)=>new Promise<string>((ok,no)=>{const r=new FileReader();r.onload=()=>ok(String(r.result));r.onerror=()=>no(new Error('파일을 읽지 못했습니다.'));r.readAsDataURL(f);});
type Msg={error:string;notice:string};
function Notes({m}:{m:Msg}){return<>{m.error&&<p role="alert">{m.error}</p>}{m.notice&&<p role="status">{m.notice}</p>}</>;}

/** PDF 글자 가져오기와 YouTube 영상 정보 가져오기. 결과 초안을 onDraft로 넘긴다(작업실에 붙이는 연결은 별도). */
export function ImportDesk({onDraft}:{onDraft:(d:unknown)=>void}){
 const[brand,setBrand]=useState(''),[url,setUrl]=useState(''),[transcript,setTranscript]=useState(''),[busy,setBusy]=useState(false),[m,setM]=useState<Msg>({error:'',notice:''});
 async function run(f:()=>Promise<{draft:unknown;note?:string}>,ok:string){if(busy)return;setBusy(true);setM({error:'',notice:''});try{const r=await f();if(r.draft){onDraft(r.draft);setM({error:'',notice:[ok,r.note].filter(Boolean).join(' ')});}else setM({error:'',notice:r.note||'초안을 만들기에는 자료가 짧습니다. 자막 텍스트를 붙여 넣어 주세요.'});}catch(e){setM({error:(e as Error).message,notice:''});}finally{setBusy(false);}}
 async function pdf(file:File|undefined){if(!file)return;if(file.size>5*1024*1024){setM({error:'PDF는 5MB 이내여야 합니다.',notice:''});return;}await run(async()=>call('/api/cora/import',{action:'pdf',file:await toBase64(file),filename:file.name,brand}),'PDF에서 글자를 읽어 카드 초안을 만들었습니다.');}
 return <div className={s.root}><h1>자료 가져오기</h1><p className={s.warning}>PDF는 글자를 선택할 수 있는 파일만 읽습니다. 스캔한 이미지 PDF는 글자 인식(OCR)을 지원하지 않습니다. YouTube는 영상의 자막을 내려받을 수 없어 제목·설명과 직접 붙여 넣은 자막만 사용합니다.</p><Notes m={m}/>
  <div className={s.grid}><section className={s.panel}><h2>PDF에서 카드뉴스 만들기</h2>
   <label>브랜드 이름(비우면 파일 이름)<input aria-label="PDF 브랜드 이름" maxLength={80} value={brand} onChange={e=>setBrand(e.target.value)}/></label>
   <label>PDF 파일(5MB 이내)<input aria-label="PDF 파일" type="file" accept="application/pdf,.pdf" disabled={busy} onChange={e=>{void pdf(e.target.files?.[0]);e.target.value='';}}/></label></section>
   <section className={s.panel}><h2>YouTube 영상으로 새 콘텐츠 만들기</h2>
    <label>영상 주소<input aria-label="YouTube 주소" type="url" maxLength={300} placeholder="https://www.youtube.com/watch?v=..." value={url} onChange={e=>setUrl(e.target.value)}/></label>
    <label>자막 텍스트(선택, 직접 붙여 넣기)<textarea aria-label="자막 텍스트" maxLength={20000} rows={6} value={transcript} onChange={e=>setTranscript(e.target.value)}/></label>
    <button type="button" disabled={busy||!url.trim()} onClick={()=>void run(()=>call('/api/cora/import',{action:'youtube',url,transcript,brand}),'영상 정보로 카드 초안을 만들었습니다.')}>영상 정보 가져오기</button></section></div></div>;
}

type Link={id?:string;label:string;url:string};type Page={slug:string;title:string;intro:string;avatar:string;theme:string;links:Link[]};
const emptyPage:Page={slug:'',title:'',intro:'',avatar:'',theme:'#205b4a',links:[]};
/** 프로필 링크 페이지 편집: 제목·소개·사진(200KB)·링크 12개·테마 색상·주소. 링크별 클릭 수를 보여준다. */
export function LinkPageEditor(){
 const[p,setP]=useState<Page>(emptyPage),[clicks,setClicks]=useState<Record<string,number>>({}),[saved,setSaved]=useState(false),[busy,setBusy]=useState(false),[m,setM]=useState<Msg>({error:'',notice:''});
 const load=useCallback(async()=>{const r=await call<{page:Page|null;clicks:Record<string,number>}>('/api/cora/linkpage');if(r.page){setP(r.page);setSaved(true);}setClicks(r.clicks);},[]);
 useEffect(()=>{void load().catch(e=>setM({error:e.message,notice:''}));},[load]);
 const setLink=(i:number,k:'label'|'url',v:string)=>setP(x=>({...x,links:x.links.map((l,j)=>j===i?{...l,[k]:v}:l)}));
 async function act(data:Record<string,unknown>,ok:string){if(busy)return;setBusy(true);setM({error:'',notice:''});try{const r=await call<{page:Page|null;clicks:Record<string,number>}>('/api/cora/linkpage',data);setP(r.page??emptyPage);setClicks(r.clicks);setSaved(!!r.page);setM({error:'',notice:ok});}catch(e){setM({error:(e as Error).message,notice:''});}finally{setBusy(false);}}
 async function avatar(f:File|undefined){if(!f)return;if(f.size>140*1024){setM({error:'프로필 사진은 140KB 이내로 줄여 주세요.',notice:''});return;}try{const a=await dataUrl(f);setP(x=>({...x,avatar:a}));}catch(e){setM({error:(e as Error).message,notice:''});}}
 return <div className={s.root}><h1>프로필 링크 페이지</h1><p className={s.warning}>주소를 아는 누구나 볼 수 있는 공개 페이지입니다. 링크는 https:// 주소만 넣을 수 있습니다.</p><Notes m={m}/>
  <section className={s.panel}>
   <label>페이지 주소(영문 소문자·숫자·하이픈 3~30자)<input aria-label="페이지 주소" maxLength={30} value={p.slug} onChange={e=>setP({...p,slug:e.target.value.toLowerCase()})}/></label>
   <label>제목<input aria-label="페이지 제목" maxLength={60} value={p.title} onChange={e=>setP({...p,title:e.target.value})}/></label>
   <label>소개(300자 이내)<textarea aria-label="페이지 소개" maxLength={300} rows={3} value={p.intro} onChange={e=>setP({...p,intro:e.target.value})}/></label>
   <label>테마 색상<input aria-label="테마 색상" type="color" value={p.theme} onChange={e=>setP({...p,theme:e.target.value})}/></label>
   <label>프로필 사진(PNG·JPEG·WebP, 140KB 이내)<input aria-label="프로필 사진" type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{void avatar(e.target.files?.[0]);e.target.value='';}}/></label>{p.avatar&&<p><img src={p.avatar} alt="프로필 사진 미리보기" width={64} height={64} style={{borderRadius:'50%',objectFit:'cover'}}/> <button type="button" onClick={()=>setP({...p,avatar:''})}>사진 지우기</button></p>}
   <h2>링크({p.links.length}/12)</h2>
   {p.links.map((l,i)=><div key={l.id??i} style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}><input aria-label={`링크 ${i+1} 이름`} placeholder="이름(40자 이내)" maxLength={40} value={l.label} onChange={e=>setLink(i,'label',e.target.value)}/><input aria-label={`링크 ${i+1} 주소`} placeholder="https://" maxLength={500} value={l.url} onChange={e=>setLink(i,'url',e.target.value)}/><span>{l.id&&clicks[l.id]!==undefined?`클릭 ${clicks[l.id]}회`:'클릭 0회'}</span><button type="button" onClick={()=>setP({...p,links:p.links.filter((_,j)=>j!==i)})}>삭제</button></div>)}
   <button type="button" disabled={p.links.length>=12} onClick={()=>setP({...p,links:[...p.links,{label:'',url:'https://'}]})}>링크 추가</button>
   <p><button type="button" disabled={busy} onClick={()=>void act({action:'save',page:p},'저장했습니다.')}>저장</button>{saved&&<> <a href={`/l/${p.slug}`} target="_blank" rel="noreferrer">공개 페이지 열기(/l/{p.slug})</a> <button type="button" disabled={busy} onClick={()=>void act({action:'delete'},'링크 페이지를 삭제했습니다.')}>페이지 삭제</button></>}</p></section></div>;
}

type Key={id:string;name:string;last4:string;created:string;revoked:boolean};
/** 개인 API 키: 만들기(원문은 한 번만 표시), 목록, 폐기. */
export function ApiKeysPanel(){
 const[keys,setKeys]=useState<Key[]>([]),[name,setName]=useState(''),[fresh,setFresh]=useState(''),[busy,setBusy]=useState(false),[m,setM]=useState<Msg>({error:'',notice:''});
 const refresh=useCallback(async()=>setKeys((await call<{keys:Key[]}>('/api/cora/apikeys')).keys),[]);
 useEffect(()=>{void refresh().catch(e=>setM({error:e.message,notice:''}));},[refresh]);
 async function act(data:Record<string,unknown>){if(busy)return;setBusy(true);setM({error:'',notice:''});try{const r=await call<{keys:Key[];created?:{key:string};notice?:string}>('/api/cora/apikeys',data);setKeys(r.keys);setFresh(r.created?.key??'');if(r.created)setName('');setM({error:'',notice:r.notice??'폐기했습니다.'});}catch(e){setM({error:(e as Error).message,notice:''});}finally{setBusy(false);}}
 return <div className={s.root}><h1>API 키</h1><p className={s.warning}>키는 만든 직후 한 번만 보입니다. 서버에는 해시와 끝 4자리만 저장됩니다. 사용법은 <a href="/api-docs">API 문서</a>를 보세요.</p><Notes m={m}/>
  {fresh&&<p role="status"><strong>새 키(지금만 표시)</strong> <code aria-label="새 API 키">{fresh}</code></p>}
  <section className={s.panel}><label>키 이름<input aria-label="API 키 이름" maxLength={60} value={name} onChange={e=>setName(e.target.value)}/></label><button type="button" disabled={busy||!name.trim()} onClick={()=>void act({action:'create',name})}>키 만들기</button>
   <ul>{keys.map(k=><li key={k.id}>{k.name} · cora_…{k.last4} · {k.created.slice(0,10)} · {k.revoked?'폐기됨':<button type="button" disabled={busy} onClick={()=>void act({action:'revoke',id:k.id})}>폐기</button>}</li>)}{!keys.length&&<li>만든 키가 없습니다.</li>}</ul></section></div>;
}

/** 공개 문의 양식. website 칸은 사람에게 보이지 않는 스팸 방지용 함정 칸이다. */
export function ContactForm(){
 const[f,setF]=useState({name:'',email:'',message:'',website:''}),[busy,setBusy]=useState(false),[m,setM]=useState<Msg>({error:'',notice:''});
 async function send(){if(busy)return;setBusy(true);setM({error:'',notice:''});try{const r=await call<{message:string}>('/api/cora/contact',f);setM({error:'',notice:r.message});setF({name:'',email:'',message:'',website:''});}catch(e){setM({error:(e as Error).message,notice:''});}finally{setBusy(false);}}
 return <form onSubmit={e=>{e.preventDefault();void send();}} style={{display:'grid',gap:10,maxWidth:520}}><Notes m={m}/>
  <label>이름<input aria-label="이름" required maxLength={50} value={f.name} onChange={e=>setF({...f,name:e.target.value})}/></label>
  <label>이메일<input aria-label="이메일" type="email" required maxLength={254} value={f.email} onChange={e=>setF({...f,email:e.target.value})}/></label>
  <label>문의 내용(2000자 이내)<textarea aria-label="문의 내용" required minLength={5} maxLength={2000} rows={6} value={f.message} onChange={e=>setF({...f,message:e.target.value})}/></label>
  <div aria-hidden="true" style={{position:'absolute',left:-9999,width:1,height:1,overflow:'hidden'}}><label>웹사이트<input tabIndex={-1} autoComplete="off" name="website" value={f.website} onChange={e=>setF({...f,website:e.target.value})}/></label></div>
  <button type="submit" disabled={busy}>문의 보내기</button></form>;
}
