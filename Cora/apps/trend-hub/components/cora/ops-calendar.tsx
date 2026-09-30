'use client';
import{useEffect,useState}from'react';import s from'./workbench.module.css';
type Entry={key:string;type:string;date:string;at:string;title:string;status:string;statusLabel:string;accountLabel?:string;note?:string;calendar?:{id:string};publication?:{id:string};simulation?:{id:string;state:string};job?:{id:string;state:string}};
type Cal={month:string;prevMonth:string;nextMonth:string;weeks:{date:string|null;entries:Entry[]}[][];entryCount:number;unscheduledPublications:number;invalidCalendarItems:number};
const days=['일','월','화','수','목','금','토'];
const seoulMonth=()=>new Date(Date.now()+9*3600_000).toISOString().slice(0,7);
const time=(iso:string)=>iso?new Date(new Date(iso).getTime()+9*3600_000).toISOString().slice(11,16):'';
/** F067 month grid (Asia/Seoul). Read-only: it shows plans, publication drafts and scheduled jobs; nothing here publishes. */
export function OpsCalendar(){
 const[month,setMonth]=useState(seoulMonth()),[cal,setCal]=useState<Cal|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 useEffect(()=>{let live=true;setLoading(true);setError('');fetch('/api/cora/ops-calendar?month='+month).then(async r=>{const v=await r.json();if(!r.ok)throw new Error(v.error);if(live)setCal(v);}).catch(e=>{if(live)setError((e as Error).message);}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[month]);
 return <section className={s.panel} aria-label="월간 발행 달력"><h2>월간 발행 달력 (한국 시간)</h2><p className={s.warning}>게시 준비, 내부 발행 계획, 모의 큐 자동 진행 예약을 한 화면에 모았습니다. 실제 SNS에는 게시되지 않습니다.</p>
  <div className={s.actions}><button aria-label="이전 달" onClick={()=>cal&&setMonth(cal.prevMonth)} disabled={!cal||loading}>이전 달</button><strong role="status" aria-live="polite">{month.replace('-','년 ')}월</strong><button aria-label="다음 달" onClick={()=>cal&&setMonth(cal.nextMonth)} disabled={!cal||loading}>다음 달</button><button onClick={()=>setMonth(seoulMonth())}>이번 달</button></div>
  {error&&<p role="alert">{error}</p>}{loading&&<p>불러오는 중입니다.</p>}
  {cal&&<><p>이 달 항목 {cal.entryCount}개{cal.unscheduledPublications?` · 시각 미정 게시 준비 ${cal.unscheduledPublications}개(달력에 표시되지 않음)`:''}{cal.invalidCalendarItems?` · 일시를 읽지 못한 발행 계획 ${cal.invalidCalendarItems}개`:''}</p>
  <div role="grid" aria-label={`${month} 달력`} style={{display:'grid',gridTemplateColumns:'repeat(7,minmax(0,1fr))',gap:4}}>
   {days.map(d=><div key={d} role="columnheader" style={{fontWeight:600,textAlign:'center'}}>{d}</div>)}
   {cal.weeks.flat().map((c,i)=><div key={c.date??'x'+i} role="gridcell" aria-label={c.date??'빈 칸'} style={{minHeight:88,border:'1px solid #ccc',borderRadius:6,padding:4,fontSize:12,background:c.date?undefined:'transparent',overflow:'hidden'}}>
    {c.date&&<div style={{fontWeight:600}}>{Number(c.date.slice(8))}</div>}
    {c.entries.map(e=><div key={e.key} data-entry-type={e.type} title={`${e.title} · ${e.statusLabel}`} style={{marginTop:2,padding:'1px 3px',borderRadius:4,border:'1px solid #bbb',wordBreak:'break-word'}}>{e.at&&<small>{time(e.at)} </small>}{e.title}<br/><small>{e.statusLabel}{e.job&&e.type==='publication'?` · 예약 작업 ${e.job.state}`:''}</small></div>)}
   </div>)}
  </div></>}
 </section>;
}
