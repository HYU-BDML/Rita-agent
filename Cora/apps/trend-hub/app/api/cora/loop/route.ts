import type{NextRequest}from'next/server';
import{store}from'@/lib/cora/store';import{json}from'@/lib/cora/http';import{opsGet,opsPost}from'@/lib/cora/ops/http';import{generateText}from'@/lib/cora/gateway';import{loopState,loopAction}from'@/lib/cora/loop-service';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=180;
/** GET ?batchId= → candidates of a batch (latest by default), posts, daily snapshots, next actions, playbook. */
export function GET(req:NextRequest){return opsGet(req,u=>json(loopState(store(),u.id,req.nextUrl.searchParams.get('batchId'))));}
/** POST {action: generate|select|reject|post|metrics|import|review|decide, ...}. Only generate with mode 'ai' calls the paid gateway. */
export function POST(req:NextRequest){return opsPost(req,async(u,b)=>json(await loopAction(store(),u.id,b,generateText),b.action==='generate'||b.action==='post'?201:200));}
