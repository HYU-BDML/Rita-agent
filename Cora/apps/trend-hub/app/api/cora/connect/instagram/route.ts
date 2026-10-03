import{NextRequest,NextResponse}from'next/server';
import{store}from'@/lib/cora/store';import{json,user,sameOrigin}from'@/lib/cora/http';import{igOf}from'@/lib/cora/loop-service';
export const runtime='nodejs';export const dynamic='force-dynamic';
/** GET → redirect to Instagram's consent page (?json=1 returns {url, status} instead). Needs CORA_IG_APP_ID, CORA_IG_APP_SECRET, CORA_IG_REDIRECT_URI, CORA_SECRET_KEY. */
export function GET(req:NextRequest){const u=user(req);if(!u)return json({error:'로그인이 필요합니다.'},401);const ig=igOf(store());
 if(req.nextUrl.searchParams.get('status')==='1')return json(ig.status(u.id));
 try{const url=ig.start(u.id);return req.nextUrl.searchParams.get('json')==='1'?json({url}):NextResponse.redirect(url);}catch(e){return json({error:(e as Error).message},(e as {status?:number}).status??400);}}
/** POST {action:'disconnect'} removes the stored token. */
export async function POST(req:NextRequest){if(!sameOrigin(req))return json({error:'허용되지 않은 요청입니다.'},403);const u=user(req);if(!u)return json({error:'로그인이 필요합니다.'},401);
 const b=await req.json().catch(()=>({}));if(b?.action!=='disconnect')return json({error:'지원하지 않는 요청입니다.'},400);return json({disconnected:igOf(store()).disconnect(u.id)});}
