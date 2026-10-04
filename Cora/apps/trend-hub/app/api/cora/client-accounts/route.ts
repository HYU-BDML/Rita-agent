import {NextRequest} from 'next/server';
import {body,json,sameOrigin,user} from '@/lib/cora/http';
import {store} from '@/lib/cora/store';
import {igOf} from '@/lib/cora/loop-service';
import {ClientAccounts,validateBindingVersion} from '@/lib/cora/client-accounts';
export const runtime='nodejs';export const dynamic='force-dynamic';
function service(){const s=store(),ig=igOf(s);return s.module('client-accounts',db=>new ClientAccounts(db,s,ig));}
function clientId(value:unknown){if(typeof value!=='string'||!/^[\da-f-]{36}$/i.test(value))throw new Error('고객사 ID를 확인해 주세요.');return value;}
function failure(e:unknown){const m=e instanceof Error?e.message:'계정 연결 실패';return json({error:m==='NOT_FOUND'?'고객사나 계정을 찾을 수 없습니다.':m==='CONFLICT'?'계정 연결이 변경되었습니다. 새로고침 후 다시 선택해 주세요.':m},m==='NOT_FOUND'?404:m==='CONFLICT'?409:400);}
export function GET(req:NextRequest){const u=user(req);if(!u)return json({error:'로그인이 필요합니다.'},401);try{return json(service().view(u.id,clientId(req.nextUrl.searchParams.get('clientId'))));}catch(e){return failure(e);}}
export async function POST(req:NextRequest){
 if(!sameOrigin(req))return json({error:'허용되지 않은 요청입니다.'},403);const u=user(req);if(!u)return json({error:'로그인이 필요합니다.'},401);
 try{const b=await body(req),id=clientId(b.clientId),s=service(),expected=validateBindingVersion(b.expectedBinding);
  if(b.action==='bind')s.bind(u.id,id,b.igUserId as string,expected);
  else if(b.action==='unbind'){if(!expected)throw new Error('해제할 연결 ID와 버전이 필요합니다.');s.unbind(u.id,id,expected);}
  else throw new Error('지원하지 않는 계정 작업입니다.');
  return json(s.view(u.id,id));
 }catch(e){return failure(e);}
}
