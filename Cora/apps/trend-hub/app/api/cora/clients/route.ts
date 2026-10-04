import {NextRequest} from 'next/server';
import {store} from '@/lib/cora/store';
import {body,json,sameOrigin,user} from '@/lib/cora/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
export function GET(req:NextRequest){const u=user(req);if(!u)return json({error:'로그인이 필요합니다.'},401);const s=store();return json({workspaceId:s.clients.workspace(u.id),clients:s.accessibleClients(u.id)});}
export async function POST(req:NextRequest){
 if(!sameOrigin(req))return json({error:'허용되지 않은 요청입니다.'},403);
 const u=user(req);if(!u)return json({error:'로그인이 필요합니다.'},401);
 try{const b=await body(req);if(b.id!==undefined&&(typeof b.id!=='string'||!Number.isInteger(b.version)))throw new Error('고객사 ID와 버전을 확인해 주세요.');
 return json({client:store().clients.save(u.id,b,typeof b.id==='string'?b.id:undefined,b.version as number|undefined)});
 }catch(e){const message=(e as Error).message;return json({error:message==='NOT_FOUND'?'고객사를 찾을 수 없습니다.':message==='CONFLICT'?'다른 곳에서 수정한 고객사입니다. 새로고침해 주세요.':message},message==='NOT_FOUND'?404:message==='CONFLICT'?409:400);}
}

