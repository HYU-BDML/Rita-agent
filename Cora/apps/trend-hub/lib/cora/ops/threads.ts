import{randomUUID}from'node:crypto';
import type{CoraStore}from'../store';
import{OpsError,asOpsError}from'./errors';
import{opsTables}from'./tables';

export const THREAD_MIN=2,THREAD_MAX=10,POST_MAX_CHARS=500,THREADS_PER_USER=200;
export const PLATFORMS=['threads','x'] as const;
export type ThreadPost={text:string;quotePrevious:boolean};
export type Thread={id:string;title:string;platform:typeof PLATFORMS[number];posts:ThreadPost[];attachDate:string|null;createdAt:string;updatedAt:string};
type Row={id:string;user_id:string;title:string;platform:string;posts:string;attach_date:string|null;created:string;updated:string};
const chars=(t:string)=>Array.from(t).length;
const validDay=(d:unknown):d is string=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;

/** Validates a thread draft. Text is trimmed; each post is 1..500 characters (Unicode code points). */
export function validateThread(input:{title?:unknown;platform?:unknown;posts?:unknown;attachDate?:unknown}){
 if(typeof input.title!=='string'||!input.title.trim()||input.title.length>100)throw new OpsError('연재 제목을 1~100자로 적어 주세요.');
 const platform=(input.platform??'threads') as string;if(!(PLATFORMS as readonly string[]).includes(platform))throw new OpsError('플랫폼은 threads 또는 x 형식이어야 합니다.');
 if(!Array.isArray(input.posts)||input.posts.length<THREAD_MIN||input.posts.length>THREAD_MAX)throw new OpsError(`연속 게시물은 ${THREAD_MIN}~${THREAD_MAX}개여야 합니다.`);
 const posts=input.posts.map((p,i):ThreadPost=>{const o=(typeof p==='string'?{text:p}:p) as {text?:unknown;quotePrevious?:unknown};
  if(typeof o?.text!=='string'||!o.text.trim())throw new OpsError(`${i+1}번째 글이 비어 있습니다.`);
  const text=o.text.trim();if(chars(text)>POST_MAX_CHARS)throw new OpsError(`${i+1}번째 글이 ${POST_MAX_CHARS}자를 넘습니다(${chars(text)}자).`);
  if(o.quotePrevious!=null&&typeof o.quotePrevious!=='boolean')throw new OpsError(`${i+1}번째 글의 인용 값이 올바르지 않습니다.`);
  if(o.quotePrevious===true&&i===0)throw new OpsError('첫 번째 글은 앞 글을 인용할 수 없습니다.');
  return{text,quotePrevious:o.quotePrevious===true};});
 const attachDate=input.attachDate==null||input.attachDate===''?null:input.attachDate;if(attachDate!==null&&!validDay(attachDate))throw new OpsError('달력 날짜는 YYYY-MM-DD 형식(한국 날짜)이어야 합니다.');
 return{title:input.title.trim(),platform:platform as Thread['platform'],posts,attachDate};
}
const map=(r:Row):Thread=>({id:r.id,title:r.title,platform:r.platform as Thread['platform'],posts:JSON.parse(r.posts),attachDate:r.attach_date,createdAt:r.created,updatedAt:r.updated});
export function createThread(s:CoraStore,userId:string,input:Parameters<typeof validateThread>[0]){
 try{const v=validateThread(input),db=opsTables(s).db;
  if(Number((db.prepare('SELECT COUNT(*) n FROM ops_threads WHERE user_id=?').get(userId) as {n:number}).n)>=THREADS_PER_USER)throw new OpsError(`연속 게시물 초안은 ${THREADS_PER_USER}개까지 저장할 수 있습니다.`,409);
  const id=randomUUID(),now=new Date().toISOString();db.prepare('INSERT INTO ops_threads(id,user_id,title,platform,posts,attach_date,created,updated) VALUES(?,?,?,?,?,?,?,?)').run(id,userId,v.title,v.platform,JSON.stringify(v.posts),v.attachDate,now,now);
  return getThread(s,userId,id)!;}catch(e){throw asOpsError(e);}
}
export function updateThread(s:CoraStore,userId:string,id:string,input:Parameters<typeof validateThread>[0]){
 try{const v=validateThread(input),db=opsTables(s).db;
  const n=db.prepare('UPDATE ops_threads SET title=?,platform=?,posts=?,attach_date=?,updated=? WHERE id=? AND user_id=?').run(v.title,v.platform,JSON.stringify(v.posts),v.attachDate,new Date().toISOString(),id,userId).changes;
  if(!n)throw new OpsError('연속 게시물 초안을 찾을 수 없습니다.',404);return getThread(s,userId,id)!;}catch(e){throw asOpsError(e);}
}
export function getThread(s:CoraStore,userId:string,id:string){const r=opsTables(s).db.prepare('SELECT * FROM ops_threads WHERE id=? AND user_id=?').get(id,userId) as Row|undefined;return r?map(r):null;}
export function listThreads(s:CoraStore,userId:string){return(opsTables(s).db.prepare('SELECT * FROM ops_threads WHERE user_id=? ORDER BY updated DESC LIMIT 200').all(userId) as Row[]).map(map);}
export function deleteThread(s:CoraStore,userId:string,id:string){return opsTables(s).db.prepare('DELETE FROM ops_threads WHERE id=? AND user_id=?').run(id,userId).changes>0;}
export function attachThread(s:CoraStore,userId:string,id:string,date:unknown){
 if(date!==null&&!validDay(date))throw new OpsError('달력 날짜는 YYYY-MM-DD 형식(한국 날짜)이어야 합니다.');
 const n=opsTables(s).db.prepare('UPDATE ops_threads SET attach_date=?,updated=? WHERE id=? AND user_id=?').run(date,new Date().toISOString(),id,userId).changes;
 if(!n)throw new OpsError('연속 게시물 초안을 찾을 수 없습니다.',404);return getThread(s,userId,id)!;
}
export function exportThreadText(t:Thread){
 const n=t.posts.length;
 return[`${t.title}`,`(${t.platform==='x'?'X':'Threads'} 형식 초안 · 게시되지 않은 내부 초안)`,...(t.attachDate?[`달력 날짜: ${t.attachDate} (한국 시간)`]:[]),'',...t.posts.map((p,i)=>`${i+1}/${n}${p.quotePrevious?' [앞 글 인용]':''}\n${p.text}`).flatMap((x,i,a)=>i<a.length-1?[x,'']:[x])].join('\n')+'\n';
}
export function exportThreadJson(t:Thread){
 return{format:'cora-thread-v1',title:t.title,platform:t.platform,attachDate:t.attachDate,simulationOnly:true,posts:t.posts.map((p,i)=>({index:i+1,text:p.text,length:chars(p.text),quotePrevious:p.quotePrevious}))};
}
