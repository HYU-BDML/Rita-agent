import {NextRequest} from 'next/server';
import {store} from '@/lib/cora/store';
import {body,json,sameOrigin,user} from '@/lib/cora/http';
import {notifyUser} from '@/lib/cora/notifier';
export const runtime='nodejs';export const dynamic='force-dynamic';
const err=(e:unknown)=>{const m=e instanceof Error?e.message:'팀 작업 실패';return m==='NOT_FOUND'?json({error:'팀 초대나 멤버를 찾을 수 없습니다.'},404):json({error:m},400);};
function view(id:string){const s=store();return{...s.team.overview(id),sharedProjects:s.sharedProjects(id),reviewerSuggestions:s.team.reviewerSuggestions(id),brands:[...new Set(s.brands(id).map(b=>b.name))]};}
export function GET(req:NextRequest){const u=user(req);if(!u)return json({error:'로그인이 필요합니다.'},401);return json(view(u.id));}
export async function POST(req:NextRequest){
  if(!sameOrigin(req))return json({error:'허용되지 않은 요청입니다.'},403);const u=user(req);if(!u)return json({error:'로그인이 필요합니다.'},401);
  try{const b=await body(req);const t=store().team;const id=typeof b.id==='string'?b.id.slice(0,80):'';
    if(b.action==='invite'){const m=t.invite(u.id,String(b.email??''),String(b.role??''),b.brands);if(m.status==='invited')notifyUser(m.memberId,'team_invite',{title:`${u.email}님이 팀에 초대했습니다`,body:m.role==='editor'?'편집자로 초대':'검토자로 초대',link:'/studio'});return json(view(u.id),201);}
    if(b.action==='accept'||b.action==='decline'){t.respond(u.id,id,b.action==='accept');return json(view(u.id));}
    if(b.action==='update'){t.update(u.id,id,String(b.role??''),b.brands);return json(view(u.id));}
    if(b.action==='remove'){t.remove(u.id,id);return json(view(u.id));}
    throw new Error('지원하지 않는 팀 작업입니다.');
  }catch(e){return err(e);}
}
