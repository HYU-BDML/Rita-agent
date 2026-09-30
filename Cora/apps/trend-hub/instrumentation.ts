/** Next.js instrumentation hook: starts the opt-in Cora background scheduler in the Node runtime only. */
export async function register(){
  if(process.env.NEXT_RUNTIME==='nodejs'&&process.env.CORA_SCHEDULER==='1'){const m=await import('./lib/cora/scheduler-runner');m.startScheduler();}
}
