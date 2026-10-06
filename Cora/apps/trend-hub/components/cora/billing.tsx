'use client';
import{useState,useEffect,useCallback}from'react';import s from'./workbench.module.css';
type Account={plan:string;planLabel:string;period:string;periodEnd:string|null;trialEnd:string;trialActive:boolean;trialDaysLeft:number;balance:number;usage:{runs24h:number;runLimit:number;runsLeft:number;creditsSpent24h:number};pending:{plan:string;period:string;effectiveAt:string;note:string}|null};
type Price={feature:string;label:string;credits:number;default:number;overridden:boolean};
type Plan={id:string;label:string;rank:number;monthly:number;yearly:number;credits:number};
type Pack={credits:number;price:number};
type Entry={id:string;kind:'grant'|'spend'|'refund';amount:number;delta:number;reason:string;feature:string|null;balanceAfter:number;createdAt:string};
type Order={orderId:string;label:string;amount:number;status:string;note:string};
type View={account:Account;prices:Price[];plans:Plan[];packs:Pack[];history:Entry[];orders:Order[];payments:{configured:boolean;mode:string};admin:boolean};
const kindLabel={grant:'지급',spend:'사용',refund:'환불'};
const won=(n:number)=>n.toLocaleString('ko-KR')+'원';
async function api(data?:Record<string,unknown>):Promise<Record<string,unknown>&View>{const r=await fetch('/api/cora/billing',{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json'}:undefined,body:data?JSON.stringify(data):undefined});const v=await r.json();if(!r.ok)throw new Error(v.error);return v;}
/** Plan, trial, credit balance, price table, ledger, and test-mode order buttons. Payment confirmation needs Toss TEST keys on the server. */
export function BillingDesk(){
 const[data,setData]=useState<View|null>(null),[order,setOrder]=useState<Order|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[period,setPeriod]=useState<'monthly'|'yearly'>('monthly'),[edit,setEdit]=useState<Record<string,string>>({});
 const refresh=useCallback(async()=>setData(await api()),[]);
 useEffect(()=>{void refresh().catch(e=>setError(e.message));},[refresh]);
 async function run(f:()=>Promise<void>){if(busy)return;setBusy(true);setError('');setNotice('');try{await f();await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const buy=(kind:'plan'|'pack',ref:string)=>run(async()=>{const v=await api({action:'create-order',kind,ref}) as unknown as{order:Order};setOrder(v.order);setNotice('주문을 만들었습니다. 결제 승인은 토스페이먼츠 테스트 키가 서버에 설정된 뒤에만 진행됩니다.');});
 const change=(plan:string)=>run(async()=>{const v=await api({action:'change-plan',plan,period}) as unknown as{action:string;order?:Order;effectiveAt?:string};if(v.order){setOrder(v.order);setNotice('업그레이드 주문을 만들었습니다. 결제가 승인되면 바로 적용됩니다.');}else setNotice(v.action==='scheduled'?`${new Date(v.effectiveAt!).toLocaleDateString('ko-KR')}에 변경이 예약되었습니다.`:'예약된 변경이 없습니다.');});
 if(!data)return <div className={s.root}><h1>사용량과 결제</h1>{error?<p role="alert">{error}</p>:<p>불러오는 중입니다.</p>}</div>;
 const a=data.account;
 return <div className={s.root}><h1>사용량과 결제</h1><p className={s.warning}>토스페이먼츠 테스트 모드입니다. 실제 결제는 일어나지 않으며, 결제 승인 확인에는 서버의 테스트 키(CORA_TOSS_CLIENT_KEY, CORA_TOSS_SECRET_KEY)가 필요합니다. {data.payments.configured?'테스트 키가 설정되어 있습니다.':'현재 테스트 키가 설정되어 있지 않습니다.'}</p>{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  <div className={s.grid}><section className={s.panel}><h2>내 플랜과 체험 기간</h2><h3>{a.planLabel} 플랜{a.periodEnd?` · ${new Date(a.periodEnd).toLocaleDateString('ko-KR')}까지`:''}</h3>
   <p>{a.trialActive?`체험 기간이 ${new Date(a.trialEnd).toLocaleDateString('ko-KR')}에 끝납니다(${a.trialDaysLeft}일 남음).`:`체험 기간은 ${new Date(a.trialEnd).toLocaleDateString('ko-KR')}에 끝났습니다.`}</p>
   <p>남은 크레딧 <strong aria-label="크레딧 잔액">{a.balance.toLocaleString('ko-KR')}</strong>개 · 최근 24시간 AI 실행 {a.usage.runs24h}/{a.usage.runLimit}회 · 최근 24시간 크레딧 사용 {a.usage.creditsSpent24h}개</p>
   {a.pending&&<p className={s.warning}>{a.pending.note}</p>}</section>
  <section className={s.panel}><h2>기능별 크레딧 단가</h2><div className={s.tableWrap}><table><thead><tr><th>기능</th><th>크레딧</th>{data.admin&&<th>변경(관리자)</th>}</tr></thead><tbody>{data.prices.map(p=><tr key={p.feature}><td>{p.label}</td><td>{p.credits}{p.overridden?` (기본 ${p.default})`:''}</td>{data.admin&&<td><input aria-label={`${p.label} 단가`} type="number" min={0} max={1000} value={edit[p.feature]??''} onChange={e=>setEdit({...edit,[p.feature]:e.target.value})} style={{width:80,display:'inline-block'}}/> <button disabled={busy||!(edit[p.feature]??'').trim()} onClick={()=>void run(async()=>{await api({action:'set-price',feature:p.feature,credits:Number(edit[p.feature])});setEdit({...edit,[p.feature]:''});setNotice('단가를 바꿨습니다.');})}>저장</button></td>}</tr>)}</tbody></table></div></section></div>
  <section className={s.panel}><h2>플랜 변경</h2><label>결제 주기<select aria-label="결제 주기" value={period} onChange={e=>setPeriod(e.target.value as 'monthly'|'yearly')}><option value="monthly">월 결제</option><option value="yearly">연 결제</option></select></label>
   <div className={s.cards}>{data.plans.map(p=><article className={s.panel} key={p.id}><h3>{p.label}</h3><p>{p.id==='free'?'무료':won(period==='yearly'?p.yearly:p.monthly)+(period==='yearly'?' / 년':' / 월')} · 월 {p.credits.toLocaleString('ko-KR')}크레딧</p><button className={p.id===a.plan?undefined:s.primary} disabled={busy||(p.id===a.plan&&p.id==='free')} onClick={()=>void change(p.id)}>{p.id===a.plan?'현재 플랜':p.rank>data.plans.find(x=>x.id===a.plan)!.rank?`${p.label}로 업그레이드`:`${p.label}로 변경 예약`}</button></article>)}</div></section>
  <section className={s.panel}><h2>추가 크레딧</h2><div className={s.actions}>{data.packs.map(k=><button key={k.credits} disabled={busy} onClick={()=>void buy('pack',String(k.credits))}>{k.credits.toLocaleString('ko-KR')}크레딧 · {won(k.price)}</button>)}</div>
   {order&&<p role="status">주문 {order.orderId.slice(0,13)}… · {order.label} · {won(order.amount)} · 상태 {order.status}. {order.note} 테스트 결제 승인에는 토스 테스트 키가 필요합니다.</p>}</section>
  <section className={s.panel}><h2>크레딧 사용 기록</h2>{data.history.length===0?<p>기록이 없습니다.</p>:<div className={s.tableWrap}><table><thead><tr><th>시각</th><th>구분</th><th>변동</th><th>잔액</th><th>사유</th></tr></thead><tbody>{data.history.map(h=><tr key={h.id}><td>{new Date(h.createdAt).toLocaleString('ko-KR')}</td><td>{kindLabel[h.kind]}</td><td>{h.delta>0?'+':''}{h.delta}</td><td>{h.balanceAfter}</td><td>{h.reason}</td></tr>)}</tbody></table></div>}</section>
 </div>;
}
