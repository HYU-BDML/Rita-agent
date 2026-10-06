import {NextRequest} from 'next/server';
import {store} from '@/lib/cora/store';
import {body,json,sameOrigin,user} from '@/lib/cora/http';
import {WorkspaceSettings} from '@/lib/cora/workspace-settings';
export const runtime='nodejs';export const dynamic='force-dynamic';
const ws=()=>store().module('workspace-settings',db=>new WorkspaceSettings(db));
const view=(id:string)=>{const w=ws();return{language:w.language(id),prefs:w.prefs(id),notifications:w.notifications(id,50),unread:w.unreadCount(id)};};
export function GET(req:NextRequest){const u=user(req);if(!u)return json({error:'로그인이 필요합니다.'},401);return json(view(u.id));}
export async function POST(req:NextRequest){
  if(!sameOrigin(req))return json({error:'허용되지 않은 요청입니다.'},403);const u=user(req);if(!u)return json({error:'로그인이 필요합니다.'},401);
  try{const b=await body(req),w=ws();
    if(b.action==='set-language')w.setLanguage(u.id,b.language);
    else if(b.action==='set-pref')w.setPref(u.id,b.kind,{inapp:b.inapp,email:b.email});
    else if(b.action==='mark-read'){if(typeof b.id!=='string'||!w.markRead(u.id,b.id.slice(0,80)))return json({error:'알림을 찾을 수 없습니다.'},404);}
    else if(b.action==='mark-all-read')w.markAllRead(u.id);
    else throw new Error('지원하지 않는 설정 작업입니다.');
    return json(view(u.id));
  }catch(e){return json({error:e instanceof Error?e.message:'설정 저장 실패'},400);}
}
