/**
 * 계약 JSON 출구. 카드뉴스 Agent 가 부르는 유일한 주소.
 *
 *   GET /api/brief?field=캐릭터&scope=character&limit=3
 *
 * **아무것도 수집하지 않고 아무 API 도 부르지 않는다.** 이미 쌓인 후보를 계약 모양으로
 * 옮겨 줄 뿐이다. 수집은 기존 /api/discover 가 한다 — 상대가 언제 불러도 돈이 안 나간다.
 */
import { NextResponse } from 'next/server';
import { listCandidates, listPosts } from '@/lib/core/store';
import { toBrief, type BriefScope } from '@/lib/core/brief';

export const dynamic = 'force-dynamic';

const SCOPES: BriefScope[] = ['issue', 'character', 'meme'];

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;

  const scope = q
    .getAll('scope')
    .flatMap((s) => s.split(','))
    .map((s) => s.trim())
    .filter((s): s is BriefScope => SCOPES.includes(s as BriefScope));

  const rawLimit = Number(q.get('limit'));
  const limit = Number.isFinite(rawLimit) ? Math.min(10, Math.max(0, rawLimit)) : 3;

  const [cands, posts] = await Promise.all([listCandidates(), listPosts()]);
  const brief = toBrief(cands, posts, {
    field: q.get('field') ?? '',
    sources: q.getAll('source').flatMap((s) => s.split(',')).filter(Boolean),
    limit,
    ...(scope.length ? { scope } : {}),
  });

  return NextResponse.json(brief);
}
