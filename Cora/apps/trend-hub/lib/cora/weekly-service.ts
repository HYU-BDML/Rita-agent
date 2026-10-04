import type {CoraStore} from './store';
import {WeeklyStore} from './weekly';
import {clientScope} from './client-scope';
import {fetchPublic} from './source';
const weeklyOf=(s:CoraStore)=>s.module('weekly',db=>new WeeklyStore(db));
const selectedClient=(x:unknown)=>{const id=clientScope(x);if(!id)throw new Error('먼저 고객사를 선택하세요.');return id;};
const identifier=(v:unknown)=>{if(typeof v!=='string'||!v||v.length>80)throw new Error('ID를 확인해 주세요.');return v;};
const eligible=(s:CoraStore,owner:string,client:string)=>(id:string)=>id===owner||s.team.canEditClient(id,owner,client);
function actors(s:CoraStore,owner:string,client:string){
 const stmt=s.module('weekly-actor-query',db=>db.prepare('SELECT id,email FROM users WHERE id=?'));const user=stmt.get(owner) as {id:string;email:string};
 return [user,...s.team.overview(owner).members.filter(m=>m.status==='active'&&m.role==='editor'&&s.team.canEditClient(m.memberId,owner,client)).map(m=>({id:m.memberId,email:m.memberEmail}))];
}
export function weeklyState(s:CoraStore,actor:string,clientIn:unknown,planId?:string|null){
 const client=selectedClient(clientIn),w=weeklyOf(s);
 return s.withClientAccess(actor,client,owner=>{const plans=w.plans(owner,client),p=planId?w.plan(owner,client,planId):plans[0];if(planId&&!p)throw new Error('NOT_FOUND');
 return {clientId:client,client:s.clients.get(owner,client),sources:w.sources(owner,client),candidates:w.candidates(owner,client),plans:plans.map(x=>({id:x.id,version:x.version,weekStart:x.weekStart,goal:x.goal})),current:p?w.present(owner,client,p,eligible(s,owner,client)):null,history:p?w.history(owner,client,p.id):[],actors:actors(s,owner,client),mode:'source-directions',materialItems:s.scopedItems(owner,client).filter(x=>x.kind==='material'&&typeof x.data.text==='string').map(x=>({id:x.id,title:x.title}))};});
}
/** Inject source transport for contract tests. Every await is outside a transaction; grants are checked again before writing. */
export async function weeklyAction(s:CoraStore,actor:string,b:Record<string,unknown>,fetchSource:typeof fetchPublic=fetchPublic){
 const client=selectedClient(b.clientId),w=weeklyOf(s),owner=s.withClientAccess(actor,client,id=>id),canAssign=eligible(s,owner,client);
 if(b.action==='source'){
  let input:unknown=b.source,kind:'manual'|'url'|'material'='manual',truncated=false;
  if(b.materialId!==undefined){const m=s.withClientAccess(actor,client,id=>s.scopedItem(id,identifier(b.materialId),client));if(!m||m.kind!=='material'||typeof m.data.text!=='string')throw new Error('NOT_FOUND');input={title:m.title,text:m.data.text,url:typeof m.data.url==='string'?m.data.url:'',publishedOn:''};kind='material';}
  else if(b.url!==undefined){if(typeof b.url!=='string'||b.url.length>1500)throw new Error('주소를 확인해 주세요.');const source=await fetchSource(b.url);input={title:source.title.slice(0,200),text:source.text,url:source.url,publishedOn:b.publishedOn??''};kind='url';truncated=!!source.truncated;}
  return s.withClientAccess(actor,client,id=>{if(id!==owner)throw new Error('NOT_FOUND');return{source:w.addSource(id,client,input,kind,truncated)};});
 }
 return s.withClientAccess(actor,client,(id,save)=>{
  if(id!==owner)throw new Error('NOT_FOUND');
  if(b.action==='candidates')return{candidates:w.createCandidates(owner,client,b.sourceIds,s.clients.rules(owner,client)),mode:'source-directions'};
  if(b.action==='plan')return{plan:w.savePlan(owner,client,b.plan,canAssign)};
  if(b.action==='duplicate'){if(!Number.isSafeInteger(b.version))throw new Error('버전을 확인해 주세요.');return{plan:w.duplicate(owner,client,identifier(b.id),Number(b.version),b.weekStart,canAssign)};}
  if(b.action==='draft'){if(!Number.isSafeInteger(b.version))throw new Error('버전을 확인해 주세요.');return w.createDraft(owner,client,identifier(b.id),Number(b.version),identifier(b.candidateId),s.clients.rules(owner,client),canAssign,save);}
  throw new Error('지원하지 않는 주간 작업입니다.');
 });
}
