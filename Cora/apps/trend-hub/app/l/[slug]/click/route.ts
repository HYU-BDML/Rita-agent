import { NextRequest } from 'next/server';
import { Limiter, clientIp } from '@/lib/cora/apikeys';
import { linkPages } from '@/lib/cora/linkpage';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
const limiter = new Limiter(30, 60_000);
const j = (b: unknown, status = 200) => Response.json(b, { status, headers: { 'Cache-Control': 'no-store' } });
/** Public. Accepts the page's form post (answers 303 to the stored link) or JSON {id} (answers JSON). Rate limit: 30/min per IP. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const isForm = !(req.headers.get('content-type') ?? '').includes('application/json');
  let id = ''; try { if (isForm) id = String((await req.formData()).get('id') ?? ''); else id = String(((await req.json()) as { id?: unknown }).id ?? ''); } catch { return j({ error: '요청 형식을 확인해 주세요.' }, 400); }
  const pages = linkPages(); const allowed = limiter.hit(clientIp(req)).allowed;
  if (!allowed) {
    if (!isForm) return j({ error: '요청이 너무 많습니다. 잠시 뒤 다시 시도해 주세요.' }, 429);
    const page = pages.bySlug(String(slug).toLowerCase()); const to = page?.links.find(l => l.id === id)?.url;
    return to ? new Response(null, { status: 303, headers: { Location: to, 'Cache-Control': 'no-store' } }) : j({ error: '링크를 찾을 수 없습니다.' }, 404);
  }
  const to = pages.click(String(slug).toLowerCase(), id); if (!to) return j({ error: '링크를 찾을 수 없습니다.' }, 404);
  return isForm ? new Response(null, { status: 303, headers: { Location: to, 'Cache-Control': 'no-store' } }) : j({ ok: true });
}
