import {NextRequest} from 'next/server';
import {store} from '@/lib/cora/store';
import {body,json,sameOrigin,user} from '@/lib/cora/http';
import {requireIntegration} from '@/lib/cora/integrations';
import {billing,PLANS,PACKS} from '@/lib/cora/billing/credits';
import {TossPayments} from '@/lib/cora/billing/toss';
export const runtime='nodejs';export const dynamic='force-dynamic';
const err=(e:unknown)=>{const m=e instanceof Error?e.message:'결제 작업 실패';return m==='NOT_FOUND'?json({error:'주문을 찾을 수 없습니다.'},404):json({error:m},400);};
const isAdmin=(email:string)=>{const a=(process.env.CORA_BILLING_ADMIN_EMAIL??'').trim().toLowerCase();return !!a&&a===email.trim().toLowerCase();};
function view(id:string,email:string){const b=billing(store()),clientKey=process.env.CORA_TOSS_CLIENT_KEY??'';
  return{account:b.account(id),prices:b.prices(id),plans:Object.entries(PLANS).map(([id,p])=>({id,...p})),packs:PACKS,history:b.history(id,50),orders:b.orders(id,10),
    payments:{configured:!!(clientKey.trim()&&process.env.CORA_TOSS_SECRET_KEY?.trim()),mode:'test',clientKey:clientKey.startsWith('test_')?clientKey:''},admin:isAdmin(email)};}
export function GET(req:NextRequest){const u=user(req);if(!u)return json({error:'로그인이 필요합니다.'},401);try{return json(view(u.id,u.email));}catch(e){return err(e);}}
export async function POST(req:NextRequest){
  if(!sameOrigin(req))return json({error:'허용되지 않은 요청입니다.'},403);const u=user(req);if(!u)return json({error:'로그인이 필요합니다.'},401);
  try{const b=await body(req),bs=billing(store());
    if(b.action==='quote'){const credits=bs.quote(u.id,String(b.feature??''));const balance=bs.account(u.id).balance;return json({feature:b.feature,credits,balance,enough:balance>=credits,...(balance<credits?{error:{code:'INSUFFICIENT_CREDITS',needed:credits,balance}}:{})});}
    if(b.action==='create-order'){const kind=b.kind==='pack'?'pack':b.kind==='plan'?'plan':'';if(!kind)throw new Error('주문 종류는 plan 또는 pack입니다.');return json({order:bs.createOrder(u.id,kind,String(b.ref??''))},201);}
    if(b.action==='change-plan'){const r=bs.changePlan(u.id,String(b.plan??''),String(b.period??'monthly'));return json(r,r.action==='order'?201:200);}
    if(b.action==='set-price'){if(!isAdmin(u.email))return json({error:'가격 변경 권한이 없습니다.'},403);
      const c=b.credits===null?null:Number(b.credits);return json({prices:bs.setPrice(u.id,String(b.feature??''),c)});}
    if(b.action==='confirm'){
      const orderId=String(b.orderId??''),order=bs.order(u.id,orderId);if(!order)return json({error:'주문을 찾을 수 없습니다.'},404);
      if(order.status==='paid')return json({order,replay:true,account:bs.account(u.id)});
      if(b.amount!==undefined&&Number(b.amount)!==order.amount)throw new Error('결제 금액이 주문 금액과 다릅니다.');
      try{requireIntegration('payments');}catch(e){return json({error:(e as Error).message,code:'NOT_CONFIGURED'},503);}
      const toss=new TossPayments(process.env.CORA_TOSS_SECRET_KEY!);
      const obs=await toss.confirm({paymentKey:String(b.paymentKey??''),orderId,amount:order.amount});
      const r=bs.completeOrder(u.id,orderId,obs);
      return json({order:r.order,replay:r.replay,payment:{status:obs.status,code:obs.code??null,message:obs.message??null},account:bs.account(u.id)},obs.status==='paid'?200:obs.status==='failed'?402:502);
    }
    throw new Error('지원하지 않는 결제 작업입니다.');
  }catch(e){return err(e);}
}
