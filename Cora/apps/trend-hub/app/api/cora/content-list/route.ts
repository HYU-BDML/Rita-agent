import {NextRequest} from 'next/server';
import {store} from '@/lib/cora/store';
import {json,user} from '@/lib/cora/http';
import {filterContent} from '@/lib/cora/blog-filter';
export const runtime='nodejs';export const dynamic='force-dynamic';
/** F060: GET ?status=초안|수정됨|승인됨&from=YYYY-MM-DD&to=YYYY-MM-DD&brand=&keyword=&kind=blog|script&limit=&cursor= (dates are Asia/Seoul days). */
export function GET(req:NextRequest){const u=user(req);if(!u)return json({error:'로그인이 필요합니다.'},401);
  const p=req.nextUrl.searchParams,g=(k:string)=>p.get(k)??undefined;
  try{return json(filterContent(store().items(u.id),{status:g('status'),from:g('from'),to:g('to'),brand:g('brand'),keyword:g('keyword'),kind:g('kind'),limit:g('limit'),cursor:g('cursor')}));}catch(e){return json({error:(e as Error).message},400);}}
