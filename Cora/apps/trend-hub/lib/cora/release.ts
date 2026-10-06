/** First-release surface. Only server configuration can open preserved lab modules. */
export type ProductMode = 'focused' | 'labs';
export function productMode(value = process.env.CORA_PRODUCT_MODE): ProductMode { return value === 'labs' ? 'labs' : 'focused'; }
const methods: Record<string, string[]> = {
 weekly:['GET','POST'], recovery:['GET','POST'], session:['GET','POST','DELETE'], projects:['GET','POST'], clients:['GET','POST'],
 brands:['GET','POST'], generate:['POST'], reviews:['GET','POST'], team:['GET','POST'],
 library:['GET','POST'], ideas:['GET','POST'], revisions:['GET','POST'],
 workbench:['GET','POST'], publications:['GET','POST'], settings:['GET','POST'],
 account:['GET','POST'], contact:['GET','POST'], integrations:['GET'],
 'ad-creative':['GET','POST'], 'ops-analytics':['GET'], 'ops-report':['GET'],
 'client-accounts':['GET','POST'], 'connect/instagram':['GET','POST'], 'connect/instagram/callback':['GET'],
};
const actions: Record<string, string[]> = {
 weekly:['source','candidates','plan','duplicate','draft'], recovery:['put','clear'], workbench:['discover','fetch','save','analyze','experiment','copy-personal'],
 'client-accounts':['bind','unbind'], publications:['prepare','cancel'], 'connect/instagram':['disconnect'],
};
/** null = permitted by scope only. Route authentication/ownership/CSRF checks still apply. */
export function releaseDenial(path: string, method: string, payload?: unknown, mode: ProductMode = productMode()) {
 if(mode==='labs')return null;
 if(path==='/'||path==='/studio'||path==='/help'||path==='/favicon.ico'||path.startsWith('/_next/'))return null;
 if(!path.startsWith('/api/'))return '이 화면은 후속 기능으로 보존되어 있습니다.';
 const relative=path.replace(/^\/api\/cora\//,'');
 let allowed=Object.hasOwn(methods,relative)?methods[relative]:undefined;
 if(/^projects\/[A-Za-z0-9-]{1,80}$/.test(relative))allowed=['GET','PUT','DELETE'];
 if(!path.startsWith('/api/cora/')||!allowed||!allowed.includes(method))return '이 기능은 첫 출시 범위에서 제공하지 않습니다.';
 if(method==='POST'&&actions[relative]){
   if(payload===undefined)return null; // middleware reads bounded JSON before the second decision
   const p=payload as Record<string,unknown>|null;
   if(!p||typeof p!=='object'||!actions[relative].includes(String(p.action)))return '이 작업은 첫 출시 범위에서 제공하지 않습니다.';
   if(relative==='workbench'&&p.action==='save'&&p.kind!=='material')return '첫 출시에서는 소재만 이 경로로 저장합니다.';
 }
 return null;
}
export function needsReleaseBody(path:string,method:string,mode:ProductMode=productMode()){
 return mode==='focused'&&method==='POST'&&Object.hasOwn(actions,path.replace(/^\/api\/cora\//,''));
}
