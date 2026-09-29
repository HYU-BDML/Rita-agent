/** Contract checked 2026-09-30 against Blotato's official posts/accounts docs.
 * Not wired to a public sending route; credentials/account ownership/media hosting
 * must be integrated before enabling a live dispatcher. Never retry POST blindly.
 */
export type PublishObservation={state:'submitted'|'scheduled'|'published'|'failed'|'unknown';submissionId?:string;publicUrl?:string;scheduledTime?:string;reason?:string};
export function instagramPayload(input:{accountId:string;text:string;mediaUrls:string[];scheduledTime?:string},now=Date.now()){
 if(!/^[A-Za-z0-9_-]{1,128}$/.test(input.accountId)||typeof input.text!=='string'||input.text.length>2200)throw new Error('계정 ID 또는 Instagram 캡션을 확인해 주세요.');
 if(!Array.isArray(input.mediaUrls)||!input.mediaUrls.length||input.mediaUrls.length>10)throw new Error('현재 어댑터는 이미지 URL 1~10개를 지원합니다.');
 for(const value of input.mediaUrls){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port||u.hostname==='localhost'||u.hostname.endsWith('.local')||/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname)||u.hostname.includes(':'))throw new Error('검증된 공개 HTTPS 이미지 URL이 필요합니다.');}
 let scheduledTime:string|undefined;if(input.scheduledTime){if(!/(Z|[+-]\d{2}:\d{2})$/.test(input.scheduledTime)||!Number.isFinite(Date.parse(input.scheduledTime))||Date.parse(input.scheduledTime)<=now)throw new Error('시간대가 있는 미래 예약 시각이 필요합니다.');scheduledTime=new Date(input.scheduledTime).toISOString();}
 return{post:{accountId:input.accountId,content:{text:input.text,mediaUrls:[...input.mediaUrls],platform:'instagram'},target:{targetType:'instagram'}},...(scheduledTime?{scheduledTime}:{})};
}
export class BlotatoAdapter{
 constructor(private key:string,private transport:typeof fetch=fetch){if(!key)throw new Error('게시 공급자 연결이 필요합니다.');}
 private request(path:string,method='GET',body?:unknown){return this.transport('https://backend.blotato.com/v2'+path,{method,headers:{'blotato-api-key':this.key,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(20000)});}
 async accounts():Promise<{id:string;platform:string;username:string}[]>{const r=await this.request('/users/me/accounts?platform=instagram');if(!r.ok)throw new Error('게시 계정 조회 실패');const v=await r.json();if(!Array.isArray(v.items))throw new Error('게시 계정 응답 형식 오류');return v.items.filter((x:any)=>x.platform==='instagram'&&typeof x.id==='string'&&typeof x.username==='string').map((x:any)=>({id:x.id,platform:x.platform,username:x.username}));}
 async submit(input:Parameters<typeof instagramPayload>[0]):Promise<PublishObservation>{const payload=instagramPayload(input);try{const r=await this.request('/posts','POST',payload);if(!r.ok)return{state:r.status>=400&&r.status<500&&r.status!==408?'failed':'unknown',reason:`공급자 HTTP ${r.status}; 자동 재전송하지 않음`};const v=await r.json();return typeof v.postSubmissionId==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v.postSubmissionId)?{state:'submitted',submissionId:v.postSubmissionId}:{state:'unknown',reason:'접수 식별자를 확인할 수 없음'};}catch{return{state:'unknown',reason:'요청 결과를 확인할 수 없음. 자동 재전송하지 않음'};}}
 async status(id:string):Promise<PublishObservation>{if(!/^[A-Za-z0-9_-]{1,128}$/.test(id))throw new Error('접수 ID 오류');try{const r=await this.request('/posts/'+encodeURIComponent(id));if(!r.ok)return{state:'unknown',submissionId:id};const v=await r.json();if(v.postSubmissionId!==id)return{state:'unknown',submissionId:id};if(v.status==='published'){try{const u=new URL(v.publicUrl);if(u.protocol!=='https:')throw new Error();return{state:'published',submissionId:id,publicUrl:u.href};}catch{return{state:'unknown',submissionId:id};}}
 if(v.status==='scheduled'&&typeof v.scheduledTime==='string'&&Number.isFinite(Date.parse(v.scheduledTime)))return{state:'scheduled',submissionId:id,scheduledTime:v.scheduledTime};
 if(v.status==='in-progress')return{state:'submitted',submissionId:id};if(v.status==='failed')return{state:'failed',submissionId:id,reason:'공급자에서 게시 실패를 보고함'};return{state:'unknown',submissionId:id};}catch{return{state:'unknown',submissionId:id};}}
}
