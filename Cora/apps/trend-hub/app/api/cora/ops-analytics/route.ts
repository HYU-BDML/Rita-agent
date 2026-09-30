import type{NextRequest}from'next/server';
import{store}from'@/lib/cora/store';import{json}from'@/lib/cora/http';import{opsGet}from'@/lib/cora/ops/http';import{OpsError}from'@/lib/cora/ops/errors';
import{normalizedMetrics,comparePeriods,followerTrend,rowsOf}from'@/lib/cora/analytics';
export const runtime='nodejs';export const dynamic='force-dynamic';
/** GET ?analysisId=[&aFrom=&aTo=&bFrom=&bTo=]: normalized metrics, follower trend and (when both ranges are given) a period comparison. */
export function GET(req:NextRequest){return opsGet(req,u=>{const q=req.nextUrl.searchParams,id=(q.get('analysisId')||'').slice(0,80),item=id?store().item(u.id,id):null;
 if(!item||item.kind!=='analysis')throw new OpsError('진단 자료를 찾을 수 없습니다.',404);const rows=rowsOf(item.data);
 const wants=q.get('aFrom')||q.get('aTo')||q.get('bFrom')||q.get('bTo');
 return json({normalized:normalizedMetrics(rows),followers:followerTrend(rows),comparison:wants?comparePeriods(rows,{from:q.get('aFrom'),to:q.get('aTo')},{from:q.get('bFrom'),to:q.get('bTo')}):null});});}
