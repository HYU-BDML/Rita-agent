import {NextRequest} from 'next/server';
import {store} from '@/lib/cora/store';
import {body,json,sameOrigin,user} from '@/lib/cora/http';
import {runOnce,schedulerEnabled} from '@/lib/cora/scheduler-runner';
import type {JobKind} from '@/lib/cora/scheduler';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=180;
const err=(e:unknown)=>{const m=e instanceof Error?e.message:'예약 작업 실패';return json({error:m==='NOT_FOUND'?'예약 작업을 찾을 수 없습니다.':m},m==='NOT_FOUND'?404:400);};
export function GET(req:NextRequest){const u=user(req);if(!u)return json({error:'로그인이 필요합니다.'},401);const id=req.nextUrl.searchParams.get('id');try{const s=store().scheduler;return json(id?{runs:s.runs(u.id,id)}:{jobs:s.list(u.id),background:schedulerEnabled(),aiAutomation:process.env.CORA_SCHEDULER_AI==='1'});}catch(e){return err(e);}}
export async function POST(req:NextRequest){
  if(!sameOrigin(req))return json({error:'허용되지 않은 요청입니다.'},403);const u=user(req);if(!u)return json({error:'로그인이 필요합니다.'},401);
  try{const b=await body(req);const s=store().scheduler;const id=typeof b.id==='string'?b.id.slice(0,80):'';
    if(b.action==='schedule'){
      const kind=b.kind as JobKind;let runAt:number|undefined;
      if(b.runAt!=null){runAt=Date.parse(String(b.runAt));if(!Number.isFinite(runAt))throw new Error('실행 시각을 확인해 주세요.');}
      if(kind==='publication_tick'&&runAt==null){const job=store().publicationQueue.get(u.id,String(b.refId??''));const draft=job?.draft_id?store().publications(u.id,job.draft_id)[0]:null;const at=draft?.scheduledAt?Date.parse(draft.scheduledAt):NaN;if(Number.isFinite(at)&&at>Date.now())runAt=at;}
      const payload=kind==='recipe_run'?{format:['blog','script','ideas'].includes(b.format)?b.format:'blog',material:typeof b.material==='string'?b.material.slice(0,20000):''}:{};
      const r=s.schedule(u.id,{kind,refId:String(b.refId??''),runAt,intervalMs:b.intervalMs==null?(kind==='publication_tick'?10000:null):Number(b.intervalMs),aiAllowed:b.aiAllowed===true,payload});
      return json({...r,jobs:s.list(u.id)},r.created?201:200);
    }
    if(b.action==='pause')return json({changed:s.pause(u.id,id),jobs:s.list(u.id)});
    if(b.action==='resume')return json({changed:s.resume(u.id,id),jobs:s.list(u.id)});
    if(b.action==='cancel')return json({changed:s.cancel(u.id,id),jobs:s.list(u.id)});
    if(b.action==='ai')return json({changed:s.setAiAllowed(u.id,id,b.allowed===true),jobs:s.list(u.id)});
    if(b.action==='run-now'){const results=await runOnce(u.id);return json({results,jobs:s.list(u.id)});}
    throw new Error('지원하지 않는 예약 작업입니다.');
  }catch(e){return err(e);}
}
