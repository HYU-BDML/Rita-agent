import{NextRequest,NextResponse}from'next/server';
import{store}from'@/lib/cora/store';import{user}from'@/lib/cora/http';import{igOf}from'@/lib/cora/loop-service';
export const runtime='nodejs';export const dynamic='force-dynamic';
/** Instagram redirects here with ?code&state (or ?error). The result is shown on the studio page; tokens never reach the browser. */
export async function GET(req:NextRequest){const back=(q:string)=>NextResponse.redirect(new URL(`/studio?view=loop&instagram=${q}`,req.nextUrl.origin));
 const u=user(req);if(!u)return back('login');const p=req.nextUrl.searchParams;if(p.get('error'))return back('denied');
 try{await igOf(store()).finish(u.id,p.get('code'),p.get('state'));return back('connected');}catch(e){return back(encodeURIComponent(((e as Error).message||'failed').slice(0,120)));}}
