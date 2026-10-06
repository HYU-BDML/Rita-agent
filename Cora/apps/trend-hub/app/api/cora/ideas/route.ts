import {NextRequest} from 'next/server';
import {store} from '@/lib/cora/store';
import {body,json,sameOrigin,user} from '@/lib/cora/http';
import {WorkspaceSettings,IDEA_STATUSES,IDEA_TRANSITIONS} from '@/lib/cora/workspace-settings';
export const runtime='nodejs';export const dynamic='force-dynamic';
const ws=()=>store().module('workspace-settings',db=>new WorkspaceSettings(db));
export function GET(req:NextRequest){const u=user(req);if(!u)return json({error:'로그인이 필요합니다.'},401);
  try{return json({statuses:IDEA_STATUSES,transitions:IDEA_TRANSITIONS,ideas:ws().ideas(u.id,req.nextUrl.searchParams.get('status')||undefined)});}catch(e){return json({error:(e as Error).message},400);}}
export async function POST(req:NextRequest){
  if(!sameOrigin(req))return json({error:'허용되지 않은 요청입니다.'},403);const u=user(req);if(!u)return json({error:'로그인이 필요합니다.'},401);
  try{const b=await body(req);if(b.action!=='set-status')throw new Error('지원하지 않는 작업입니다.');
    const idea=ws().setIdeaStatus(u.id,String(b.id??'').slice(0,80),String(b.status??''));return json({idea});
  }catch(e){const m=e instanceof Error?e.message:'상태 변경 실패';return m==='NOT_FOUND'?json({error:'아이디어를 찾을 수 없습니다.'},404):json({error:m},400);}
}
