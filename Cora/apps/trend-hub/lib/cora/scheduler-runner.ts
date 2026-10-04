import {productMode} from './release';
import { store } from './store';
import { schedulerHandlers } from './scheduler-handlers';
import { generateText } from './gateway';
import { notifyUser } from './notifier';
import { loopDailyTick } from './loop-service';

/**
 * In-process worker loop. Started once per Node process from instrumentation.ts when
 * CORA_SCHEDULER=1; otherwise jobs only advance through the manual "run now" API action.
 * Leases in the database make an overlapping second process safe; this loop is not a
 * distributed scheduler and must be replaced by a dedicated worker before public operation.
 */
const g=globalThis as unknown as {coraSchedulerTimer?:NodeJS.Timeout;coraSchedulerBusy?:boolean};
export const TICK_MS=Number(process.env.CORA_SCHEDULER_TICK_MS)||15000;
export function handlers(){return schedulerHandlers(store(),{generate:generateText});}
export async function runOnce(user?:string){
  if(productMode()==='focused')return[];
  if(g.coraSchedulerBusy)return[];g.coraSchedulerBusy=true;
  try{const results=await store().scheduler.runDue(handlers(),{user});for(const r of results){if(r.outcome!=='failed')continue;const job=store().scheduler.list(r.userId).find(j=>j.id===r.id);if(job?.state==='failed')notifyUser(r.userId,'schedule_failed',{title:'예약 작업이 3회 실패해 멈췄습니다',body:r.kind==='recipe_run'?'레시피 반복 실행':'모의 게시 자동 진행',link:'/studio'});}try{await loopDailyTick(store());}catch{/* daily loop review must never stop the job loop */}return results;}finally{g.coraSchedulerBusy=false;}
}
export function startScheduler(){
  if(productMode()==='focused')return false;
  if(g.coraSchedulerTimer||process.env.CORA_SCHEDULER!=='1')return false;
  g.coraSchedulerTimer=setInterval(()=>{void runOnce().catch(()=>{/* run log already records per-job failures; never crash the server */});},TICK_MS);
  g.coraSchedulerTimer.unref();return true;
}
export function schedulerEnabled(){return productMode()==='labs'&&process.env.CORA_SCHEDULER==='1';}
