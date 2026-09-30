import { NextRequest } from 'next/server';
import { store } from '@/lib/cora/store';
import { validateDraft } from '@/lib/cora/model';
import { json, user, sameOrigin, body } from '@/lib/cora/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };
export async function GET(req: NextRequest, ctx: Ctx) { const u = user(req); if (!u) return json({ error: '로그인이 필요합니다.' }, 401); const p = store().getAccessible(u.id, (await ctx.params).id); return p ? json({ project: p }) : json({ error: '작업을 찾을 수 없습니다.' }, 404); }
export async function PUT(req: NextRequest, ctx: Ctx) {
  if (!sameOrigin(req)) return json({ error: '허용되지 않은 요청입니다.' }, 403);
  const u = user(req); if (!u) return json({ error: '로그인이 필요합니다.' }, 401);
  try { const b = await body(req); if (!Number.isInteger(b.version)) return json({ error: '저장 버전이 필요합니다.' }, 400);
    const id = (await ctx.params).id; const p = store().saveAccessible(u.id, validateDraft(b), id, b.version); return p ? json({ project: store().getAccessible(u.id, id) ?? p }) : json({ error: '작업을 찾을 수 없습니다.' }, 404);
  } catch (e) { return e instanceof Error && e.message === 'CONFLICT' ? json({ error: '다른 창에서 수정했습니다. 이 창의 JSON을 먼저 내려받고 저장본을 다시 열어 주세요.' }, 409) : json({ error: e instanceof Error ? e.message : '저장 실패' }, 400); }
}

export async function DELETE(req:NextRequest,ctx:Ctx){
 if(!sameOrigin(req))return json({error:'허용되지 않은 요청입니다.'},403);
 const u=user(req);if(!u)return json({error:'로그인이 필요합니다.'},401);
 try{const b=await body(req);if(!Number.isInteger(b.version))return json({error:'저장 버전이 필요합니다.'},400);
 return store().delete(u.id,(await ctx.params).id,b.version)?json({deleted:true}):json({error:'작업을 찾을 수 없습니다.'},404);
 }catch(e){return json({error:e instanceof Error&&e.message==='CONFLICT'?'다른 창에서 수정했습니다. 저장본을 다시 열어 주세요.':'삭제 실패'},409);}
}
