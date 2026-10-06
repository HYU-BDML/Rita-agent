import {validateDraft, type Brief, type Draft} from './model';

export type RecoveryPayload =
 | {kind:'cards';draft:Draft;source:{projectId:string;version:number}|null}
 | {kind:'brief';brief:Brief;clientId?:string};
export type RecoverySummary={id:string;version:number;kind:'cards'|'brief';title:string;brand:string;updatedAt:string};
export const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(v);
/** Partial briefs may be recovered before they are valid generation inputs. */
export function validateRecovery(value:unknown):RecoveryPayload {
 const p=value as RecoveryPayload;
 if(p?.kind==='cards'){
  const draft=validateDraft(p.draft),s=p.source;
  if(s!==null&&(!s||!uuid(s.projectId)||!Number.isSafeInteger(s.version)||s.version<1))throw new Error('초안의 저장본 ID와 버전을 확인해 주세요.');
  return {kind:'cards',draft,source:s?{projectId:s.projectId,version:s.version}:null};
 }
 if(p?.kind!=='brief'||!p.brief)throw new Error('복구 초안 형식을 확인해 주세요.');
 const limits={brand:100,audience:500,goal:500,material:50000,sourceUrl:1500,accent:7};
 const brief={} as Brief;
 for(const [key,max] of Object.entries(limits)){
  const v=p.brief[key as keyof Brief];if(typeof v!=='string'||v.length>max)throw new Error('제작 자료의 길이와 형식을 확인해 주세요.');brief[key as keyof Brief]=v;
 }
 if(!/^#[\da-f]{6}$/i.test(brief.accent))throw new Error('색상 형식을 확인해 주세요.');
 if(brief.sourceUrl){let u:URL;try{u=new URL(brief.sourceUrl);}catch{throw new Error('자료 주소 형식을 확인해 주세요.');}if(!['http:','https:'].includes(u.protocol))throw new Error('자료 주소 형식을 확인해 주세요.');}
 if(p.clientId!==undefined&&!uuid(p.clientId))throw new Error('고객사 ID를 확인해 주세요.');
 return {kind:'brief',brief,...(p.clientId?{clientId:p.clientId}:{})};
}
