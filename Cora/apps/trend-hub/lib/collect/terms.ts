import type { Article } from './rss';

/**
 * 제목에서 낱말을 뽑아 '몇 개 매체가 같은 걸 다뤘나'를 센다.
 *
 * 소재 찾기의 판정축 셋 중 다룬_매체수에 해당한다. 셋 중 유일하게 키 없이 계산된다.
 * 형태소 분석기 없이 하므로 완벽하지 않다. 대신 근거 기사를 항상 같이 들고 다녀서
 * 사람이 표에서 바로 확인할 수 있게 한다 — 추측을 사실로 만들지 않는다.
 */

/** 조사. 붙어 있으면 '카카오가'와 '카카오를'이 다른 낱말이 된다. 긴 것부터 떼야 한다. */
const PARTICLES = [
  '이라는', '라는', '이라고', '라고', '에서는', '에게서', '으로서', '으로써', '이라며', '라며',
  '에서', '에게', '한테', '부터', '까지', '보다', '처럼', '으로', '만큼', '조차', '마저',
  '이나', '이란', '란', '와', '과', '은', '는', '이', '가', '을', '를', '의', '에', '도', '로', '만',
];

/** 뉴스 제목에 늘 끼는 말. 이런 게 상위에 오면 표가 쓸모없어진다. */
const STOP = new Set(
  `기자 종합 속보 단독 알림 동정 인사 부고 신간 오늘 내일 어제 올해 작년 내년 우리 관련 대한 위해 통해
   그리고 하지만 이번 지난 최근 계속 다시 대해 대한민국 한국 서울 정부 국내 해외 세계 사람 경우 문제 상황
   가운데 이후 이전 당시 현재 지금 모두 여러 각각 등등 발표 공개 진행 시작 종료 개최 참석 예정 밝혀 전망
   기업 회사 브랜드 서비스 사업 시장 고객 소비자 이용자 콘텐츠 마케팅 캠페인 광고 영상 사진 기사 뉴스
   출시 선보여 선정 확대 강화 추진 지원 운영 도입 협약 체결 investing news the and for with from that this`
    .split(/\s+/)
    .filter(Boolean),
);

function stripParticle(t: string): string {
  if (!/[가-힣]$/.test(t)) return t;
  for (const p of PARTICLES) {
    if (t.length - p.length >= 2 && t.endsWith(p)) return t.slice(0, -p.length);
  }
  return t;
}

function clean(title: string): string {
  return title
    .replace(/\[[^\]]*\]/g, ' ')   // [알림] [단독] 따위
    .replace(/<[^>]*>/g, ' ')
    .replace(/[“”"'‘’`]/g, ' ')
    .replace(/…|\.{2,}/g, ' ');
}

function tokens(title: string): string[] {
  const out: string[] = [];
  for (const m of clean(title).matchAll(/[가-힣]{2,12}|[A-Za-z][A-Za-z0-9&.+-]{2,19}/g)) {
    const t = stripParticle(m[0]).trim();
    const isHangul = /[가-힣]/.test(t);
    if (isHangul && t.length < 2) continue;
    if (!isHangul && t.length < 3) continue;
    if (STOP.has(t) || STOP.has(t.toLowerCase())) continue;
    out.push(isHangul ? t : t.toLowerCase());
  }
  return out;
}

export interface TermHit {
  term: string;
  /** 서로 다른 매체 수. 이게 판정축이다. */
  sources: string[];
  /** 매체 성격이 몇 종류인가. 같은 성격끼리만 겹치면 약한 신호다. */
  kinds: string[];
  mentions: number;
  articles: Article[];
  /** 구글 트렌드에 그대로 올라온 말인가. */
  onTrends: boolean;
}

export interface ExtractOptions {
  minSources?: number;
  limit?: number;
}

export function extractTerms(articles: Article[], opts: ExtractOptions = {}): TermHit[] {
  const minSources = opts.minSources ?? 2;
  const map = new Map<string, { srcs: Set<string>; kinds: Set<string>; arts: Article[]; hits: number }>();

  // 구글 트렌드 항목은 제목 자체가 검색어다. 쪼개지 않고 통째로 쓴다.
  const trendTerms = new Set(
    articles.filter((a) => a.sourceId === 'gtrends').map((a) => a.title.trim()),
  );

  for (const a of articles) {
    const seen = new Set<string>();
    const list = a.sourceId === 'gtrends' ? [a.title.trim()] : tokens(a.title);
    for (const t of list) {
      if (seen.has(t)) continue;   // 한 기사가 같은 말을 두 번 써도 1회로 센다
      seen.add(t);
      let e = map.get(t);
      if (!e) {
        e = { srcs: new Set(), kinds: new Set(), arts: [], hits: 0 };
        map.set(t, e);
      }
      e.srcs.add(a.sourceName);
      e.kinds.add(a.kind);
      e.hits += 1;
      if (e.arts.length < 8) e.arts.push(a);
    }
  }

  const hits: TermHit[] = [];
  for (const [term, e] of map) {
    const onTrends = trendTerms.has(term);
    // 구글 트렌드에 뜬 말은 매체 하나에만 걸려도 남긴다 — 그 자체가 독립 신호다.
    if (e.srcs.size < minSources && !onTrends) continue;
    hits.push({
      term,
      sources: [...e.srcs],
      kinds: [...e.kinds],
      mentions: e.hits,
      articles: e.arts,
      onTrends,
    });
  }

  hits.sort(
    (a, b) =>
      b.sources.length - a.sources.length ||
      b.kinds.length - a.kinds.length ||
      b.mentions - a.mentions ||
      a.term.localeCompare(b.term),
  );
  return hits.slice(0, opts.limit ?? 40);
}
