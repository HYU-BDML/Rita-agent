import { NextRequest } from 'next/server';
import { store } from '@/lib/cora/store';
import { validateBrand } from '@/lib/cora/model';
import { json,user,sameOrigin,body } from '@/lib/cora/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
export function GET(req:NextRequest){const u=user(req);return u?json({brands:store().brands(u.id)}):json({error:'로그인이 필요합니다.'},401);}
export async function POST(req:NextRequest){if(!sameOrigin(req))return json({error:'허용되지 않은 요청입니다.'},403);const u=user(req);if(!u)return json({error:'로그인이 필요합니다.'},401);try{return json({brand:store().saveBrand(u.id,validateBrand(await body(req)))},201);}catch(e){return json({error:e instanceof Error?e.message:'브랜드 저장 실패'},400);}}
