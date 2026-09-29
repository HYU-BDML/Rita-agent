import{NextRequest}from'next/server';import{store}from'@/lib/cora/store';import{json,user,sameOrigin,body}from'@/lib/cora/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
export function GET(req:NextRequest){const u=user(req);if(!u)return json({error:'로그인이 필요합니다.'},401);const id=req.nextUrl.searchParams.get('id');if(!id)return json({reviews:store().reviews(u.id)});const review=store().review(u.id,id);return review?json({review}):json({error:'검토 요청을 찾을 수 없습니다.'},404);}
export async function POST(req:NextRequest){if(!sameOrigin(req))return json({error:'허용되지 않은 요청입니다.'},403);const u=user(req);if(!u)return json({error:'로그인이 필요합니다.'},401);
 try{const b=await body(req);const id=(v:unknown)=>{if(typeof v!=='string'||v.length>80||!v)throw new Error('식별자를 확인해 주세요.');return v;};
 if(b.action==='request'){if(typeof b.email!=='string'||b.email.length>254||!Number.isInteger(b.version))throw new Error('검토자 이메일과 저장 버전이 필요합니다.');return json({review:store().requestReview(u.id,id(b.projectId),b.version,b.email)},201);}
 if(b.action==='decide')return json({review:store().decideReview(u.id,id(b.id),b.status,b.comment)});
 if(b.action==='cancel')return store().cancelReview(u.id,id(b.id))?json({cancelled:true}):json({error:'검토 요청을 찾을 수 없습니다.'},404);
 throw new Error('지원하지 않는 작업입니다.');
 }catch(e){const msg=e instanceof Error?e.message:'검토 처리 실패';return json({error:msg==='NOT_FOUND'?'검토 요청 또는 작업을 찾을 수 없습니다.':msg==='CONFLICT'?'저장 버전이나 검토 상태가 변경됐습니다. 새로 불러와 주세요.':msg},msg==='NOT_FOUND'?404:msg==='CONFLICT'?409:400);}
}
