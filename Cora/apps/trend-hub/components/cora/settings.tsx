'use client';
import{useState,useEffect,useCallback}from'react';import s from'./workbench.module.css';
import{t,LANGS}from'@/lib/cora/i18n';
type Pref={kind:string;inapp:boolean;email:boolean};
type Note={id:string;kind:string;title:string;body:string;link:string;read:boolean;created:string};
type View={language:string;prefs:Pref[];notifications:Note[];unread:number};
async function api(data?:Record<string,unknown>):Promise<View>{const r=await fetch('/api/cora/settings',{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json'}:undefined,body:data?JSON.stringify(data):undefined});const v=await r.json();if(!r.ok)throw new Error(v.error);return v;}
/** Language, per-event notification channels, and the in-app notification center. */
export function SettingsDesk({onLanguage}:{onLanguage?:(lang:string)=>void}={}){
 const[data,setData]=useState<View|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const lang=data?.language??'ko';
 const refresh=useCallback(async()=>{const v=await api();setData(v);onLanguage?.(v.language);},[onLanguage]);
 useEffect(()=>{void refresh().catch(e=>setError(e.message));},[refresh]);
 async function run(d:Record<string,unknown>){if(busy)return;setBusy(true);setError('');setNotice('');try{const v=await api(d);setData(v);onLanguage?.(v.language);setNotice(t(v.language,'settings.saved'));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <div className={s.root}><h1>{t(lang,'settings.title')}</h1>{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  <div className={s.grid}><section className={s.panel}><h2>{t(lang,'settings.language')}</h2><p>{t(lang,'settings.language.hint')}</p>
   <label>{t(lang,'settings.language')}<select aria-label={t(lang,'settings.language')} value={lang} disabled={busy||!data} onChange={e=>void run({action:'set-language',language:e.target.value})}>{LANGS.map(l=><option key={l} value={l}>{l==='ko'?'한국어':'English'}</option>)}</select></label></section>
  <section className={s.panel}><h2>{t(lang,'settings.prefs')}</h2><p>{t(lang,'settings.email.unconfigured')}</p>
   {data?.prefs.map(p=><div className={s.row} key={p.kind}><h3>{t(lang,`event.${p.kind}`)}</h3>
    {(['inapp','email'] as const).map(ch=><label key={ch} style={{display:'flex',flexDirection:'row',alignItems:'center',gap:8}}><input type="checkbox" style={{width:'auto',margin:0}} aria-label={`${t(lang,`event.${p.kind}`)} ${t(lang,`settings.channel.${ch}`)}`} checked={p[ch]} disabled={busy} onChange={e=>void run({action:'set-pref',kind:p.kind,[ch]:e.target.checked})}/>{t(lang,`settings.channel.${ch}`)}</label>)}</div>)}</section></div>
  <section className={s.panel}><h2>{t(lang,'settings.center')}{data&&data.unread>0?` (${data.unread})`:''}</h2>
   <button disabled={busy||!data?.unread} onClick={()=>void run({action:'mark-all-read'})}>{t(lang,'settings.markAll')}</button>
   {data?.notifications.map(n=><article className={s.row} key={n.id} style={{opacity:n.read?0.6:1}}><small>{t(lang,`event.${n.kind}`)} · {new Date(n.created).toLocaleString(lang==='en'?'en-US':'ko-KR')}{n.read?'':` · ${t(lang,'settings.unread')}`}</small><h3>{n.title}</h3>{n.body&&<p>{n.body}</p>}
    <div className={s.actions}>{n.link&&<a href={n.link}>{n.title}</a>}{!n.read&&<button disabled={busy} onClick={()=>void run({action:'mark-read',id:n.id})}>{t(lang,'settings.markRead')}</button>}</div></article>)}
   {data&&!data.notifications.length&&<p>{t(lang,'settings.empty')}</p>}</section></div>;
}
