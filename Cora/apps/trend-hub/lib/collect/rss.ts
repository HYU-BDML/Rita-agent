/**
 * RSS 수집. 키가 필요 없는 유일한 수집원이라 여기서 시작한다.
 *
 * Dify HTTP 노드로 부를 때 매일경제·플래텀이 403, 고구마팜·매드타임스가 30x 를 뱉는다.
 * 브라우저 UA 와 리다이렉트 추적이 있어야 열린다 — 없으면 조용히 빈손으로 돌아온다.
 */

import { cut } from '../core/text';

export interface Source {
  id: string;
  name: string;
  url: string;
  /** 매체 성격. 같은 성격끼리만 겹치면 '여러 곳이 다뤘다'로 보기 약하다. */
  kind: 'news' | 'trade' | 'trend' | 'pr';
}

export const SOURCES: Source[] = [
  { id: 'yna', name: '연합뉴스', url: 'https://www.yna.co.kr/rss/news.xml', kind: 'news' },
  { id: 'mk', name: '매일경제', url: 'https://www.mk.co.kr/rss/30000001/', kind: 'news' },
  { id: 'brandbrief', name: '브랜드브리프', url: 'https://www.brandbrief.co.kr/rss/allArticle.xml', kind: 'trade' },
  { id: 'madtimes', name: '매드타임스', url: 'https://www.madtimes.org/rss/allArticle.xml', kind: 'trade' },
  { id: 'mobiinside', name: '모비인사이드', url: 'https://www.mobiinside.co.kr/category/trend/feed/', kind: 'trade' },
  { id: 'platum', name: '플래텀', url: 'https://platum.kr/feed', kind: 'trade' },
  { id: 'gogumafarm', name: '고구마팜', url: 'https://gogumafarm.kr/feed', kind: 'trade' },
  { id: 'newswire', name: '뉴스와이어 신제품', url: 'https://api.newswire.co.kr/rss/theme/101', kind: 'pr' },
  { id: 'gtrends', name: '구글 트렌드', url: 'https://trends.google.com/trending/rss?geo=KR', kind: 'trend' },
];

export interface Article {
  sourceId: string;
  sourceName: string;
  kind: Source['kind'];
  title: string;
  url: string;
  publishedAt: string | null;
  summary: string;
  thumbnailUrl?: string;
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');
}

function tag(block: string, name: string): string {
  // <title>, <title type="..."> 둘 다 받는다. 네임스페이스 붙은 것(<dc:date>)은 따로 부른다.
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decodeEntities(m[1]).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
}

function imageUrl(block: string): string | undefined {
  const description = block.match(/<description(?:\s[^>]*)?>([\s\S]*?)<\/description>/i)?.[1] ?? '';
  const candidates = [
    block.match(/<(?:media:content|media:thumbnail)[^>]+url=["']([^"']+)["']/i)?.[1],
    block.match(/<enclosure[^>]+url=["']([^"']+)["']/i)?.[1],
    description.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1],
  ];
  const url = candidates.find((value) => value?.startsWith('http'));
  return url ? decodeEntities(url).trim() : undefined;
}

export function parseFeed(xml: string, source: Source): Article[] {
  const blocks = xml.match(/<(?:item|entry)(?:\s[^>]*)?>[\s\S]*?<\/(?:item|entry)>/gi) ?? [];
  const out: Article[] = [];

  for (const b of blocks) {
    const title = tag(b, 'title');
    if (!title) continue;

    // RSS 는 <link>값</link>, Atom 은 <link href="...">.
    let url = tag(b, 'link');
    if (!url) url = b.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? '';

    const raw = tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date');
    const t = raw ? Date.parse(raw) : NaN;

    out.push({
      sourceId: source.id,
      sourceName: source.name,
      kind: source.kind,
      title,
      url: url.trim(),
      publishedAt: Number.isFinite(t) ? new Date(t).toISOString() : null,
      summary: cut(tag(b, 'description') || tag(b, 'summary') || tag(b, 'content'), 400),
      thumbnailUrl: imageUrl(b),
    });
  }
  return out;
}

export interface FetchReport {
  articles: Article[];
  ok: { source: string; count: number }[];
  failed: { source: string; reason: string }[];
}

async function fetchOne(s: Source, timeoutMs: number): Promise<Article[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(s.url, {
      headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.8' },
      redirect: 'follow',
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    // 일부 국내 매체는 EUC-KR 로 준다. 그대로 UTF-8 로 읽으면 제목이 깨진다.
    const buf = await res.arrayBuffer();
    const ct = res.headers.get('content-type') ?? '';
    let charset = ct.match(/charset=([\w-]+)/i)?.[1];
    if (!charset) {
      const head = new TextDecoder('utf-8').decode(buf.slice(0, 200));
      charset = head.match(/encoding=["']([\w-]+)["']/i)?.[1];
    }
    let xml: string;
    try {
      xml = new TextDecoder(charset || 'utf-8').decode(buf);
    } catch {
      xml = new TextDecoder('utf-8').decode(buf);
    }

    const items = parseFeed(xml, s);
    if (!items.length) throw new Error('항목 없음');
    return items;
  } finally {
    clearTimeout(timer);
  }
}

/** 한 곳이 죽어도 나머지는 살린다. 어디가 죽었는지는 반드시 남긴다. */
export async function fetchAll(sources: Source[] = SOURCES, timeoutMs = 15_000): Promise<FetchReport> {
  const settled = await Promise.allSettled(sources.map((s) => fetchOne(s, timeoutMs)));
  const report: FetchReport = { articles: [], ok: [], failed: [] };

  settled.forEach((r, i) => {
    const s = sources[i];
    if (r.status === 'fulfilled') {
      report.articles.push(...r.value);
      report.ok.push({ source: s.name, count: r.value.length });
    } else {
      report.failed.push({ source: s.name, reason: r.reason instanceof Error ? r.reason.message : String(r.reason) });
    }
  });
  return report;
}

/** 최근 N일치만. publishedAt 이 없는 항목은 버리지 않고 남긴다 — 있는 걸 버리는 쪽이 더 나쁘다. */
export function recent(articles: Article[], days: number): Article[] {
  const cut = Date.now() - days * 86_400_000;
  return articles.filter((a) => !a.publishedAt || Date.parse(a.publishedAt) >= cut);
}
