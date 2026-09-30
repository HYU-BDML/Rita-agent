import { NextRequest } from 'next/server';
import { LINK_PAGE_CSP, linkPages, renderLinkPage } from '@/lib/cora/linkpage';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
const headers = (extra: Record<string, string> = {}) => ({ 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': LINK_PAGE_CSP, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...extra });
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const page = linkPages().bySlug(String(slug).toLowerCase());
  if (!page) return new Response('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>페이지를 찾을 수 없습니다</title><body style="font:16px system-ui;padding:40px"><p>이 주소의 링크 페이지가 없습니다.</p></body></html>', { status: 404, headers: headers({ 'Cache-Control': 'no-store' }) });
  return new Response(renderLinkPage(page), { status: 200, headers: headers({ 'Cache-Control': 'public, max-age=60' }) });
}
