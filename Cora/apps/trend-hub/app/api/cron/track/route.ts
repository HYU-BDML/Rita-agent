import { NextResponse } from 'next/server';
import { fetchAll, recent, SOURCES } from '@/lib/collect/rss';
import { isBlocked, isFlagged } from '@/lib/core/axis';
import { listCandidates, patchCandidate } from '@/lib/core/store';
import { mergeEvidence } from '@/lib/core/tracking';

export const dynamic = 'force-dynamic';

function matches(text: string, queries: string[]): boolean {
  const haystack = text.normalize('NFKC').toLowerCase();
  return queries.some((query) => {
    const needle = query.normalize('NFKC').toLowerCase().trim();
    return needle.length >= 2 && haystack.includes(needle);
  });
}

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: '자동 실행 인증이 필요합니다.' }, { status: 401 });
  }

  const now = new Date();
  const tracked = (await listCandidates({ lifecycle: 'archived' }))
    .filter((candidate) => candidate.tracking?.enabled !== false)
    .filter((candidate) => !isBlocked(candidate) && !isFlagged(candidate));
  if (!tracked.length) return NextResponse.json({ checked: 0, matched: 0 });

  const report = await fetchAll(SOURCES);
  const articles = recent(report.articles, 7);
  let matched = 0;

  for (const candidate of tracked) {
    const queries = candidate.tracking?.queries?.length ? candidate.tracking.queries : [candidate.subject];
    const hits = articles.filter((article) => matches(`${article.title}\n${article.summary}`, queries));
    // 자르지 않고 전부 넘긴다. 중복을 거른 뒤에 세어야 새 기사를 놓치지 않는다.
    const additions = hits
      .filter((article) => article.url)
      .map((article) => ({
        source: article.sourceName,
        title: article.title,
        url: article.url,
        excerpt: article.summary || undefined,
        note: article.publishedAt ? article.publishedAt.slice(0, 10) : undefined,
        // 재정규화가 이것만 골라 남긴다. 표시가 없으면 원본에 없다는 이유로 지워진다.
        via: 'tracking' as const,
      }));

    // 중복 거르기와 총량 상한을 mergeEvidence 가 함께 본다 (lib/core/tracking.ts).
    const evidence = mergeEvidence(candidate.evidence, additions);
    if (evidence.length !== candidate.evidence.length) matched += 1;
    await patchCandidate(candidate.id, {
      evidence,
      tracking: {
        enabled: true,
        queries,
        lastCheckedAt: now.toISOString(),
        nextCheckAt: new Date(now.getTime() + 86_400_000).toISOString(),
      },
    });
  }

  return NextResponse.json({ checked: tracked.length, matched, articles: articles.length, failed: report.failed });
}