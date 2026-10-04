import {NextRequest} from 'next/server';
import {store} from '@/lib/cora/store';
import {body,json,user,sameOrigin} from '@/lib/cora/http';
import {weeklyState,weeklyAction} from '@/lib/cora/weekly-service';
import {asOpsError} from '@/lib/cora/ops/errors';
import {releaseDenial} from '@/lib/cora/release';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=60;
const fail=(e:unknown)=>{const err=asOpsError(e);return json({error:err.message},err.status);};
export function GET(req:NextRequest){const u=user(req);if(!u)return json({error:'로그인이 필요합니다.'},401);try{return json(weeklyState(store(),u.id,req.nextUrl.searchParams.get('clientId'),req.nextUrl.searchParams.get('planId')));}catch(e){return fail(e);}}
export async function POST(req:NextRequest){if(!sameOrigin(req))return json({error:'허용되지 않은 요청입니다.'},403);const u=user(req);if(!u)return json({error:'로그인이 필요합니다.'},401);try{const b=await body(req),denied=releaseDenial('/api/cora/weekly','POST',b);if(denied)return json({error:denied},404);return json(await weeklyAction(store(),u.id,b),b.action==='source'||b.action==='candidates'||b.action==='duplicate'?201:200);}catch(e){return fail(e);}}
