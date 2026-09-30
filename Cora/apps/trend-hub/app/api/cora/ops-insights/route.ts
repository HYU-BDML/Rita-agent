import type{NextRequest}from'next/server';
import{store}from'@/lib/cora/store';import{json}from'@/lib/cora/http';import{opsPost}from'@/lib/cora/ops/http';import{askInsight}from'@/lib/cora/ops/insights';import{generateText}from'@/lib/cora/gateway';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=180;
/** POST {analysisId, question, periods?:{a:{from,to},b:{from,to}}}. Paid AI call: same daily limit (10) as the workbench generate route. */
export function POST(req:NextRequest){return opsPost(req,async(u,b)=>json(await askInsight(store(),u.id,{analysisId:b.analysisId,question:b.question,periods:b.periods},generateText),201));}
