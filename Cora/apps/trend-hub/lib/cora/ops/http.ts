import type{NextRequest}from'next/server';
import{json,user,sameOrigin,body}from'../http';
import{asOpsError}from'./errors';
type U={id:string;email:string};
const fail=(e:unknown)=>{const o=asOpsError(e);return json({error:o.message},o.status);};
export async function opsGet(req:NextRequest,fn:(u:U)=>Response|Promise<Response>){const u=user(req);if(!u)return json({error:'로그인이 필요합니다.'},401);try{return await fn(u);}catch(e){return fail(e);}}
export async function opsPost(req:NextRequest,fn:(u:U,b:Record<string,any>)=>Response|Promise<Response>){ // eslint-disable-line @typescript-eslint/no-explicit-any
 if(!sameOrigin(req))return json({error:'허용되지 않은 요청입니다.'},403);const u=user(req);if(!u)return json({error:'로그인이 필요합니다.'},401);
 try{const b=await body(req);if(!b||typeof b!=='object'||Array.isArray(b))throw new Error('요청 형식을 확인해 주세요.');return await fn(u,b);}catch(e){return fail(e);}
}
