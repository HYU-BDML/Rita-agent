/** Next.js instrumentation hook: starts the opt-in Cora background scheduler in the Node runtime only. */
export async function register(){
  if(process.env.NEXT_RUNTIME==='nodejs'&&process.env.CORA_SCHEDULER==='1'&&process.env.CORA_PRODUCT_MODE==='labs'){const m=await import('./lib/cora/scheduler-runner');m.startScheduler();}
}
