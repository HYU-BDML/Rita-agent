import type{NextRequest}from'next/server';
import{store}from'@/lib/cora/store';import{json}from'@/lib/cora/http';import{opsGet}from'@/lib/cora/ops/http';import{monthCalendar}from'@/lib/cora/ops/calendar';import{seoulDate}from'@/lib/cora/ops/time';
export const runtime='nodejs';export const dynamic='force-dynamic';
/** GET ?month=YYYY-MM (Asia/Seoul). Defaults to the current Seoul month. */
export function GET(req:NextRequest){return opsGet(req,u=>json(monthCalendar(store(),u.id,req.nextUrl.searchParams.get('month')||seoulDate(Date.now()).slice(0,7))));}
