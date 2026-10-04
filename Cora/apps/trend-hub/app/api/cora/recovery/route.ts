import {NextRequest} from 'next/server';
import {store} from '@/lib/cora/store';
import {DraftRecovery} from '@/lib/cora/recovery';
import {body,json,sameOrigin,user} from '@/lib/cora/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const service=()=>store().module('recovery',db=>new DraftRecovery(db));
export function GET(req:NextRequest){const u=user(req);if(!u)return json({error:'로그인이 필요합니다.'},401);try{const expected=req.nextUrl.searchParams.get('actorId');if(expected&&expected!==u.id)return json({error:'로그인 사용자가 바뀌었습니다. 다시 열어 주세요.'},409);const id=req.nextUrl.searchParams.get('id');return json(id?{draft:service().get(u.id,id)}:{drafts:service().list(u.id)});}catch{return json({error:'초안을 찾을 수 없거나 권한이 없습니다.'},404);}}
export async function POST(req:NextRequest){
 if(!sameOrigin(req))return json({error:'허용되지 않은 요청입니다.'},403);
 const u=user(req);if(!u)return json({error:'로그인이 필요합니다.'},401);
 try{const b=await body(req);
  // A request queued by a previous browser login must not write into a new account.
  if(b.actorId!==u.id)return json({error:'로그인 사용자가 바뀌었습니다. 다시 열어 주세요.'},409);
  if(b.action==='put')return json({draft:service().put(u.id,b.id,b.version,b.payload)});
  if(b.action==='clear')return json({cleared:service().clear(u.id,b.id,b.version)});
  return json({error:'지원하지 않는 복구 작업입니다.'},400);
 }catch(e){const m=e instanceof Error?e.message:'복구 실패';return json({error:m==='NOT_FOUND'?'초안을 찾을 수 없거나 권한이 없습니다.':m==='CONFLICT'?'다른 창에서 초안이 바뀌었습니다. 복구함을 다시 확인해 주세요.':m},m==='NOT_FOUND'?404:m==='CONFLICT'?409:400);}
}
