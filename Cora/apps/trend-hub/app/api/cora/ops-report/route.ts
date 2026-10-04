import{clientScope}from'@/lib/cora/client-scope';
import type{NextRequest}from'next/server';
import{NextResponse}from'next/server';
import{store}from'@/lib/cora/store';import{opsGet}from'@/lib/cora/ops/http';import{OpsError}from'@/lib/cora/ops/errors';import{reportBlocks,renderHtml,renderMarkdown}from'@/lib/cora/ops/report';
export const runtime='nodejs';export const dynamic='force-dynamic';
/** GET ?analysisId=&format=md|html[&aFrom=&aTo=&bFrom=&bTo=] downloads the report of a saved analysis. */
export function GET(req:NextRequest){return opsGet(req,u=>{const q=req.nextUrl.searchParams,id=(q.get('analysisId')||'').slice(0,80),format=q.get('format')||'md';
 if(!id)throw new OpsError('분석 자료를 선택해 주세요.');if(!['md','html'].includes(format))throw new OpsError('형식은 md 또는 html입니다.');
 const wants=q.get('aFrom')||q.get('aTo')||q.get('bFrom')||q.get('bTo');
 const periods=wants?{a:{from:q.get('aFrom'),to:q.get('aTo')},b:{from:q.get('bFrom'),to:q.get('bTo')}}:undefined;
 const clientId=clientScope(q.get('clientId'));return store().withClientAccess(u.id,clientId,owner=>{const r=reportBlocks(store(),owner,id,periods,clientId);
 return new NextResponse(format==='html'?renderHtml(r):renderMarkdown(r),{headers:{'Content-Type':format==='html'?'text/html; charset=utf-8':'text/markdown; charset=utf-8','Content-Disposition':`attachment; filename*=UTF-8''cora-analysis-report.${format}`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'"}});});});}
