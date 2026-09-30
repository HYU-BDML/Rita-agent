import type{NextRequest}from'next/server';
import{NextResponse}from'next/server';
import{store}from'@/lib/cora/store';import{json}from'@/lib/cora/http';import{opsGet,opsPost}from'@/lib/cora/ops/http';import{OpsError}from'@/lib/cora/ops/errors';
import{createThread,updateThread,listThreads,getThread,deleteThread,attachThread,exportThreadText,exportThreadJson}from'@/lib/cora/ops/threads';
export const runtime='nodejs';export const dynamic='force-dynamic';
/** GET -> list; GET ?id=&format=text|json -> export one draft as a file download. Nothing is ever posted. */
export function GET(req:NextRequest){return opsGet(req,u=>{const id=req.nextUrl.searchParams.get('id');if(!id)return json({threads:listThreads(store(),u.id),simulationOnly:true});
 const t=getThread(store(),u.id,id.slice(0,80));if(!t)throw new OpsError('연속 게시물 초안을 찾을 수 없습니다.',404);const format=req.nextUrl.searchParams.get('format')||'json';
 if(format==='text')return new NextResponse(exportThreadText(t),{headers:{'Content-Type':'text/plain; charset=utf-8','Content-Disposition':"attachment; filename*=UTF-8''cora-thread.txt",'Cache-Control':'no-store'}});
 if(format==='json')return new NextResponse(JSON.stringify(exportThreadJson(t),null,2),{headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':"attachment; filename*=UTF-8''cora-thread.json",'Cache-Control':'no-store'}});
 throw new OpsError('내보내기 형식은 text 또는 json입니다.');});}
export function POST(req:NextRequest){return opsPost(req,(u,b)=>{const s=store(),id=typeof b.id==='string'?b.id.slice(0,80):'';
 if(b.action==='create')return json({thread:createThread(s,u.id,b)},201);
 if(b.action==='update')return json({thread:updateThread(s,u.id,id,b)});
 if(b.action==='attach')return json({thread:attachThread(s,u.id,id,b.attachDate??null)});
 if(b.action==='delete')return deleteThread(s,u.id,id)?json({deleted:true}):json({error:'연속 게시물 초안을 찾을 수 없습니다.'},404);
 throw new OpsError('지원하지 않는 작업입니다.');});}
