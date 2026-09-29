import{NextRequest,NextResponse}from'next/server';
import{user,sameOrigin}from'./lib/cora/http';
import{isCoraPublicPath,legacyAccess}from'./lib/cora/legacy-access';
export function middleware(req:NextRequest){
 if(isCoraPublicPath(req.nextUrl.pathname))return NextResponse.next();
 const operator=process.env.CORA_LEGACY_OPERATOR_ID;
 const denied=legacyAccess(operator,operator?user(req)?.id:undefined,req.method,sameOrigin(req));
 if(!denied)return NextResponse.next();
 const headers={'Cache-Control':'private, no-store','Vary':'Cookie'};
 if(req.nextUrl.pathname.startsWith('/api/'))return NextResponse.json({error:denied.error},{status:denied.status,headers});
 return new NextResponse(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Cora · 트렌드 작업실</title><body style="font:18px/1.8 system-ui;background:#f7f5ef;color:#205b4a;padding:60px"><h1>Cora 트렌드 작업실</h1><p>${denied.error}</p><a href="/studio">Cora 소재·제작 작업실로 돌아가기</a></body></html>`,{status:denied.status,headers:{...headers,'Content-Type':'text/html; charset=utf-8'}});
}
// Node runtime is required for the same persistent session verifier used by Cora APIs.
export const config={runtime:'nodejs',matcher:['/((?!_next/static|_next/image|favicon.ico).*)']};
