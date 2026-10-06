import {randomUUID,createHash} from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
import {schemaStep} from './schema';
import type {BrandRules} from './brand-rules';
import {validateDraft,type Draft,type Project} from './model';
import {validDay,shiftDay,freshness,type WeeklySource,type MaterialCandidate,type WeekPlan,type WeekSlot,type PresentedPlan} from './weekly-model';
const rec=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const text=(x:unknown,max:number,label:string,min=0)=>{if(typeof x!=='string'||x.length>max||x.trim().length<min)throw new Error(`${label} 입력을 확인해 주세요.`);return x.trim();};
const ids=(x:unknown,min:number,max:number)=>{if(!Array.isArray(x)||x.length<min||x.length>max||x.some(v=>typeof v!=='string'||!v||v.length>80)||new Set(x).size!==x.length)throw new Error('선택한 자료를 확인해 주세요.');return x as string[];};
export function sourceUrl(value:unknown){const v=text(value??'',1500,'출처 URL');if(!v)return '';const u=new URL(v);if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443'))throw new Error('출처는 자격정보 없는 HTTPS 주소여야 합니다.');return u.href;}
export function sourceFingerprint(value:string){return createHash('sha256').update(value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/gu,' ').trim()).digest('hex');}
const ANGLES=['소개와 핵심 안내','독자가 확인할 질문','실무에서 볼 체크 항목','조건을 비교하는 구성','다음 행동 안내'];
/** Evidence-backed editorial directions, not fabricated trends or an LLM result. */
export class WeeklyStore{
 constructor(private db:DatabaseSync,private now=()=>Date.now()){
  schemaStep(db,'weekly-plans-v1',()=>db.exec(`
   CREATE TABLE IF NOT EXISTS weekly_sources(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,body TEXT NOT NULL,created TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS weekly_batches(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,created TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS weekly_candidates(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,batch_id TEXT NOT NULL REFERENCES weekly_batches(id) ON DELETE CASCADE,source_id TEXT NOT NULL REFERENCES weekly_sources(id),body TEXT NOT NULL,created TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS weekly_plans(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,week_start TEXT NOT NULL,body TEXT NOT NULL,version INTEGER NOT NULL,created TEXT NOT NULL,updated TEXT NOT NULL,UNIQUE(user_id,client_id,week_start));
   CREATE TABLE IF NOT EXISTS weekly_plan_revisions(plan_id TEXT NOT NULL REFERENCES weekly_plans(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,version INTEGER NOT NULL,body TEXT NOT NULL,created TEXT NOT NULL,PRIMARY KEY(plan_id,version));
   CREATE INDEX IF NOT EXISTS weekly_source_scope ON weekly_sources(user_id,client_id,created);
   CREATE INDEX IF NOT EXISTS weekly_plan_scope ON weekly_plans(user_id,client_id,week_start);`));
 }
 private own(user:string,client:string){if(!this.db.prepare('SELECT 1 FROM clients WHERE user_id=? AND id=?').get(user,client))throw new Error('NOT_FOUND');}
 sources(user:string,client:string){return (this.db.prepare('SELECT body FROM weekly_sources WHERE user_id=? AND client_id=? ORDER BY rowid DESC LIMIT 100').all(user,client) as {body:string}[]).map(x=>JSON.parse(x.body) as WeeklySource);}
 source(user:string,client:string,id:string){const r=this.db.prepare('SELECT body FROM weekly_sources WHERE user_id=? AND client_id=? AND id=?').get(user,client,id) as {body:string}|undefined;return r?JSON.parse(r.body) as WeeklySource:null;}
 addSource(user:string,client:string,input:unknown,kind:WeeklySource['kind']='manual',truncated=false){
  this.own(user,client);if(!rec(input))throw new Error('자료를 확인해 주세요.');const body=text(input.text,20000,'원문',10),url=sourceUrl(input.url),publishedOn=text(input.publishedOn??'',10,'게시일');if(publishedOn&&!validDay(publishedOn))throw new Error('게시일을 확인해 주세요.');
  const old=this.sources(user,client);if(old.length>=100)throw new Error('고객사별 자료100개 한도입니다.');const fingerprint=sourceFingerprint(body),id=randomUUID(),collectedAt=new Date(this.now()).toISOString();
  const source:WeeklySource={id,clientId:client,title:text(input.title||body.split('\n')[0].slice(0,80),200,'자료 이름',1),text:body,url,publishedOn,collectedAt,kind,truncated,fingerprint,duplicateIds:old.filter(x=>x.fingerprint===fingerprint||(url&&x.url===url)).map(x=>x.id)};
  this.db.prepare('INSERT INTO weekly_sources VALUES(?,?,?,?,?)').run(id,user,client,JSON.stringify(source),collectedAt);return source;
 }
 candidate(user:string,client:string,id:string){const r=this.db.prepare('SELECT body FROM weekly_candidates WHERE user_id=? AND client_id=? AND id=?').get(user,client,id) as {body:string}|undefined;return r?JSON.parse(r.body) as MaterialCandidate:null;}
 candidates(user:string,client:string){const b=this.db.prepare('SELECT id FROM weekly_batches WHERE user_id=? AND client_id=? ORDER BY rowid DESC LIMIT 1').get(user,client) as {id:string}|undefined;return b?(this.db.prepare('SELECT body FROM weekly_candidates WHERE user_id=? AND client_id=? AND batch_id=? ORDER BY rowid').all(user,client,b.id) as {body:string}[]).map(x=>JSON.parse(x.body) as MaterialCandidate):[];}
 createCandidates(user:string,client:string,sourceIds:unknown,rules:BrandRules){
  this.own(user,client);if(rules.clientId!==client)throw new Error('NOT_FOUND');const sources=ids(sourceIds,1,5).map(id=>{const s=this.source(user,client,id);if(!s)throw new Error('NOT_FOUND');return s;});
  const old=(this.db.prepare('SELECT id,body FROM weekly_candidates WHERE user_id=? AND client_id=? ORDER BY rowid DESC LIMIT 250').all(user,client) as {id:string;body:string}[]).map(r=>({id:r.id,c:JSON.parse(r.body) as MaterialCandidate}));
  const count=(this.db.prepare('SELECT COUNT(*) n FROM weekly_batches WHERE user_id=? AND client_id=?').get(user,client) as {n:number}).n;if(count>=50)throw new Error('고객사별 후보 묶음50개 한도입니다.');
  const batchId=randomUUID(),createdAt=new Date(this.now()).toISOString();const out=ANGLES.map((angle,i)=>{const s=sources[i%sources.length],chars=Array.from(s.text),excerpt=chars.slice(0,1200).join('');const matches=rules.pillars.split(/\n+/).map(x=>x.trim()).filter(x=>x.length>=2&&s.text.toLocaleLowerCase().includes(x.toLocaleLowerCase()));
   return {id:randomUUID(),batchId,clientId:client,sourceId:s.id,title:`${s.title.slice(0,50)} · ${angle}`,angle,excerpt,excerptOnly:chars.length>1200||s.truncated,fitReason:`${matches.length?`고객사 주제 표현 일치: ${matches.join(', ').slice(0,200)}`:'주제 적합성은 직접 확인 필요'}. ${rules.goal?`고객사 목표: ${rules.goal}. `:''}${angle}로 같은 사실을 구성하는 편집 제안입니다.`,sourceUrl:s.url,sourceTitle:s.title,publishedOn:s.publishedOn,collectedAt:s.collectedAt,createdAt,freshness:freshness(s.publishedOn,this.now()),fingerprint:s.fingerprint,duplicateIds:old.filter(x=>x.c.fingerprint===s.fingerprint||(s.url&&x.c.sourceUrl===s.url)).map(x=>x.id),sameSourceInBatch:sources.length<5||sources.some(x=>x.id!==s.id&&x.fingerprint===s.fingerprint),brandVersion:rules.version} satisfies MaterialCandidate;});
  this.db.prepare('INSERT INTO weekly_batches VALUES(?,?,?,?)').run(batchId,user,client,createdAt);for(const c of out)this.db.prepare('INSERT INTO weekly_candidates VALUES(?,?,?,?,?,?,?)').run(c.id,user,client,batchId,c.sourceId,JSON.stringify(c),createdAt);return out;
 }
 plan(user:string,client:string,id:string){const r=this.db.prepare('SELECT * FROM weekly_plans WHERE user_id=? AND client_id=? AND id=?').get(user,client,id) as {body:string;id:string;version:number;created:string;updated:string}|undefined;return r?{...JSON.parse(r.body),id:r.id,version:r.version,createdAt:r.created,updatedAt:r.updated} as WeekPlan:null;}
 plans(user:string,client:string){return (this.db.prepare('SELECT id FROM weekly_plans WHERE user_id=? AND client_id=? ORDER BY week_start DESC LIMIT 30').all(user,client) as {id:string}[]).map(r=>this.plan(user,client,r.id)!);}
 history(user:string,client:string,id:string){if(!this.plan(user,client,id))throw new Error('NOT_FOUND');return (this.db.prepare('SELECT version,body,created FROM weekly_plan_revisions WHERE user_id=? AND plan_id=? ORDER BY version DESC LIMIT 30').all(user,id) as {version:number;body:string;created:string}[]).map(r=>({version:r.version,createdAt:r.created,plan:JSON.parse(r.body) as WeekPlan}));}
 private write(user:string,client:string,body:Omit<WeekPlan,'id'|'version'|'createdAt'|'updatedAt'>,id?:string,version?:number){
  const now=new Date(this.now()).toISOString();if(this.db.prepare('SELECT 1 FROM weekly_plans WHERE user_id=? AND client_id=? AND week_start=? AND id!=?').get(user,client,body.weekStart,id??''))throw new Error('CONFLICT');
  if(id){if(!this.db.prepare('UPDATE weekly_plans SET week_start=?,body=?,version=version+1,updated=? WHERE user_id=? AND client_id=? AND id=? AND version=?').run(body.weekStart,JSON.stringify(body),now,user,client,id,version??-1).changes)throw new Error(this.plan(user,client,id)?'CONFLICT':'NOT_FOUND');}
  else{id=randomUUID();this.db.prepare('INSERT INTO weekly_plans VALUES(?,?,?,?,?,?,?,?)').run(id,user,client,body.weekStart,JSON.stringify(body),1,now,now);}
  const p=this.plan(user,client,id)!;this.db.prepare('INSERT INTO weekly_plan_revisions VALUES(?,?,?,?,?)').run(id,user,p.version,JSON.stringify(p),now);return p;
 }
 savePlan(user:string,client:string,input:unknown,eligible:(id:string)=>boolean){
  this.own(user,client);if(!rec(input))throw new Error('주간 계획을 확인해 주세요.');const id=input.id===undefined?undefined:text(input.id,80,'계획 ID',1),old=id?this.plan(user,client,id):null;if(id&&!old)throw new Error('NOT_FOUND');if(id&&input.version!==old!.version)throw new Error('CONFLICT');
  const weekStart=text(input.weekStart,10,'주 시작일');if(!validDay(weekStart)||new Date(weekStart).getUTCDay()!==1)throw new Error('주 시작일은 월요일 날짜입니다.');const goal=text(input.goal,200,'이번 주 목표',1),pool=ids(input.pool,5,5);pool.forEach(c=>{if(!this.candidate(user,client,c))throw new Error('NOT_FOUND');});
  if(!Array.isArray(input.selected)||input.selected.length>3)throw new Error('이번 주 후보는 최대3개를 선택하세요.');const seen=new Set<string>();const selected=input.selected.map((v:unknown):WeekSlot=>{if(!rec(v))throw new Error('선택한 후보를 확인해 주세요.');const candidateId=text(v.candidateId,80,'후보 ID',1);if(!pool.includes(candidateId)||seen.has(candidateId))throw new Error('선택한 후보를 확인해 주세요.');seen.add(candidateId);const reason=text(v.reason??'',500,'선택 이유'),assigneeId=text(v.assigneeId??'',80,'담당자'),deadline=text(v.deadline??'',10,'마감일');if(assigneeId&&!eligible(assigneeId))throw new Error('이 고객사를 편집할 수 있는 담당자를 선택하세요.');if(deadline&&(!validDay(deadline)||deadline<weekStart||deadline>shiftDay(weekStart,6)))throw new Error('마감일은 선택한 주 안의 날짜입니다.');const projectId=old?.selected.find(x=>x.candidateId===candidateId)?.projectId??null;if(v.projectId!==undefined&&v.projectId!==projectId)throw new Error('작업물 연결은 서버가 기록합니다.');return{candidateId,reason,assigneeId,deadline,projectId};});
  return this.write(user,client,{clientId:client,weekStart,goal,pool,selected},id,old?.version);
 }
 present(user:string,client:string,p:WeekPlan,eligible:(id:string)=>boolean):PresentedPlan{
  const candidates=p.pool.map(id=>this.candidate(user,client,id)).filter((c):c is MaterialCandidate=>!!c);const others=this.plans(user,client).filter(x=>x.id!==p.id),overlapWarnings=p.selected.flatMap(slot=>{const c=this.candidate(user,client,slot.candidateId);return c&&others.some(o=>o.selected.some(s=>this.candidate(user,client,s.candidateId)?.fingerprint===c.fingerprint))?[`${c.title}: 다른 주간 계획에도 같은 원문이 있습니다. 같은 게시물인지 직접 확인하세요.`]:[];});
  const slots=p.selected.map(slot=>{const r=slot.projectId?this.db.prepare('SELECT body,version FROM projects WHERE user_id=? AND id=?').get(user,slot.projectId) as {body:string;version:number}|undefined:undefined;const d=r?JSON.parse(r.body) as Draft:undefined;const project=d&&d.clientId===client?{id:slot.projectId!,version:r!.version,title:d.idea,workStatus:d.workStatus??'draft'}:null;return{...slot,assigneeAvailable:!!slot.assigneeId&&eligible(slot.assigneeId),project,missingProject:!!slot.projectId&&!project};});
  return {...p,candidates,slots,prepared:slots.length===3&&slots.every(x=>x.reason&&x.deadline&&x.assigneeAvailable),overlapWarnings};
 }
 duplicate(user:string,client:string,id:string,version:number,weekStart:unknown,eligible:(id:string)=>boolean){
  const p=this.plan(user,client,id);if(!p)throw new Error('NOT_FOUND');if(p.version!==version)throw new Error('CONFLICT');const day=text(weekStart,10,'새 주 시작일');if(!validDay(day)||new Date(day).getUTCDay()!==1||day===p.weekStart)throw new Error('다른 주의 월요일을 선택하세요.');const offset=(Date.parse(day)-Date.parse(p.weekStart))/86400000;
  return this.write(user,client,{clientId:client,weekStart:day,goal:p.goal,pool:[...p.pool],selected:p.selected.map(s=>({...s,projectId:null,assigneeId:eligible(s.assigneeId)?s.assigneeId:'',deadline:s.deadline?shiftDay(s.deadline,offset):''}))});
 }
 createDraft(user:string,client:string,id:string,version:number,candidateId:string,rules:BrandRules,eligible:(id:string)=>boolean,save:(draft:Draft)=>Project){
  const p=this.plan(user,client,id);if(!p)throw new Error('NOT_FOUND');const shown=this.present(user,client,p,eligible),slot=shown.slots.find(x=>x.candidateId===candidateId);if(!slot)throw new Error('NOT_FOUND');
  if(slot.project)return{plan:p,projectId:slot.project.id,reused:true};if(p.version!==version)throw new Error('CONFLICT');if(!shown.prepared)throw new Error('후보3개의 선택 이유·담당자·마감일을 먼저 채워 주세요.');
  const c=this.candidate(user,client,candidateId),source=c?this.source(user,client,c.sourceId):null;if(!c||!source||rules.clientId!==client)throw new Error('NOT_FOUND');
  let excerpt='';for(const ch of source.text){if(excerpt.length+ch.length>1200)break;excerpt+=ch;}const chunks:string[]=[];let part='';for(const ch of excerpt){if(part.length+ch.length>400){chunks.push(part);part='';}part+=ch;}if(part)chunks.push(part);
  const slides=[{id:randomUUID(),headline:c.title.slice(0,80),body:p.goal},...chunks.map((body,i)=>({id:randomUUID(),headline:`자료에서 확인할 내용 ${i+1}`,body})),{id:randomUUID(),headline:'다음에 확인할 내용',body:'원문과 최신 사실을 확인한 뒤 게시 문구를 다듬어 주세요.'}];
  while(slides.length<4)slides.splice(slides.length-1,0,{id:randomUUID(),headline:'원문 확인',body:'근거 링크와 전체 자료는 브리프에 보관합니다. 작성자와 사실을 확인해 주세요.'});
  const draft=validateDraft({clientId:client,brandRules:rules,brief:{brand:rules.name,audience:rules.audience,goal:p.goal,material:source.text,sourceUrl:source.url,accent:rules.accent},idea:c.title,slides,caption:`${c.title}\n\n${excerpt}${source.url?'\n\n참고 자료: '+source.url:''}`,origin:'source-outline',postedUrl:'',workStatus:'draft',reviewNotes:'자료 기반 편집 초안. 원문 발췌이며 AI 생성·고객 승인·사실 확인 결과가 아닙니다. '+(source.publishedOn?`게시일(사용자 입력): ${source.publishedOn}. `:'게시일 미확인. ')+(source.truncated||source.text.length>1200?'카드/캡션은 원문의 일부입니다. 전체 자료는 브리프에 보관합니다. ':'')+`주간 선택 이유: ${slot.reason}`});
  const project=save(draft);const updated=this.write(user,client,{clientId:client,weekStart:p.weekStart,goal:p.goal,pool:p.pool,selected:p.selected.map(x=>x.candidateId===candidateId?{...x,projectId:project.id}:x)},p.id,p.version);return{plan:updated,projectId:project.id,reused:false};
 }
}
