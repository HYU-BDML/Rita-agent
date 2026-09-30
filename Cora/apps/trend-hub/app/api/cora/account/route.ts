import {NextRequest} from 'next/server';
import {store} from '@/lib/cora/store';
import {body,json,sameOrigin,user,COOKIE} from '@/lib/cora/http';
import {AccountService} from '@/lib/cora/account';
export const runtime='nodejs';export const dynamic='force-dynamic';
const service=()=>store().module('account',db=>new AccountService(db));
/** GET: download everything Cora stores for this account (secrets removed). */
export function GET(req:NextRequest){const u=user(req);if(!u)return json({error:'로그인이 필요합니다.'},401);return new Response(JSON.stringify(service().export(u.id),null,2),{headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="cora-account-export.json"','Cache-Control':'no-store'}});}
/** POST {action:'delete', password, confirm:'탈퇴'}: re-checks the password, deletes the account content, ends the session. */
export async function POST(req:NextRequest){
  if(!sameOrigin(req))return json({error:'허용되지 않은 요청입니다.'},403);const u=user(req);if(!u)return json({error:'로그인이 필요합니다.'},401);
  try{const b=await body(req);if(b.action!=='delete')throw new Error('지원하지 않는 작업입니다.');if(b.confirm!=='탈퇴')throw new Error('확인 문구로 “탈퇴”를 입력해 주세요.');
    try{store().login(u.email,String(b.password??''));}catch{return json({error:'비밀번호가 맞지 않습니다.'},403);}
    const r=await service().delete(u.id);const res=json({ok:true,deleted:r.deleted,retained:r.retained});res.cookies.set(COOKIE,'',{path:'/',maxAge:0});return res;
  }catch(e){return json({error:e instanceof Error?e.message:'탈퇴 처리 실패'},400);}
}
