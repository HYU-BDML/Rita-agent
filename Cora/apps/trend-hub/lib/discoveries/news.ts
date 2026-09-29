import type { Candidate, Evidence } from '../core/candidate';
import type { Discovery, RunContext } from '../core/adapters';
import { fetchAll, recent, SOURCES, type Article } from '../collect/rss';
import { proposeTopics, verifyTopics, type TopicDraft } from '../collect/topics';
import { classifyNews, type CategoryVerdict } from '../collect/news-category';
import { hasNaver, trendsFor, type Trend } from '../collect/naver';
import { key } from '../core/store';

/**
 * 뉴스 소재 — 앱이 직접 수집하는 첫 판정기. Dify 를 거치지 않는다.
 *
 * 판정축은 '다룬 매체 수' 하나다. 소재 찾기의 축 셋(최근/평소, 작년 대비, 다룬 매체수) 중
 * 유일하게 검색 API 없이 계산되는 축이고, 뉴스 기반 카드뉴스에는 이게 가장 직접적이다.
 *
 * run() 에서만 API 를 부르고 검증은 normalize() 가 한다.
 * 그래서 판정 규칙을 고친 뒤에는 저장된 스냅샷에 다시 돌리면 된다 — 수집도 LLM 도 다시 안 부른다.
 */

interface NewsRaw {
  articles: Article[];
  drafts: TopicDraft[];
  fetched: { source: string; count: number }[];
  failed: { source: string; reason: string }[];
  usage?: { input: number; output: number };
  /** 검색어별 추이. 네이버 키가 없으면 비어 있고, 판정은 매체 수만으로 내려간다. */
  trends?: Record<string, Trend>;
  /**
   * 주제별 갈래 (정치·경제·연예…). 화면에서 '오늘의 소재'를 한 단 더 가른다.
   * **옛 회차에는 없다** — 그때는 이 경로가 없었다. 없으면 칸이 안 나갈 뿐이고,
   * `tests/_categorize.ts` 로 스냅샷에 소급해 채운다.
   */
  categories?: CategoryVerdict[];
}

export const newsDiscovery: Discovery = {
  id: 'news',
  name: '뉴스 소재',
  description:
    '뉴스·공적 채널 RSS 9곳을 직접 훑어 여러 매체가 함께 다루는 주제를 찾습니다. Dify 를 거치지 않습니다.',
  role: 'produces',
  unit: 'topic',
  keyEnv: 'ANTHROPIC_API_KEY',
  inputs: [
    {
      name: 'days',
      label: '며칠치를 볼까요',
      type: 'select',
      required: true,
      default: '7',
      options: ['1', '3', '7', '14'],
      help: 'RSS 는 매체마다 보관 기간이 달라 오래 잡아도 그만큼 안 나올 수 있습니다.',
    },
    {
      name: 'min_sources',
      label: '최소 매체 수',
      type: 'select',
      required: true,
      default: '2',
      options: ['2', '3'],
      help: '3 으로 올리면 확실한 것만 남습니다.',
    },
  ],

  async run(input, ctx): Promise<NewsRaw> {
    const days = Math.max(1, Number(input.days) || 7);
    const report = await fetchAll(SOURCES);
    const articles = recent(report.articles, days);

    if (ctx.mock || !articles.length) {
      // 키가 없어도 수집까지는 된다. 주제 묶기만 건너뛴다.
      return { articles, drafts: [], fetched: report.ok, failed: report.failed };
    }

    const proposed = await proposeTopics(articles);
    // normalize 가 세우는 것과 같은 줄이다. 두 번 세면 판정을 산 주제와 표에 오른 주제가
    // 어긋난다 — 캐릭터 회차에서 실제로 그랬다(character-native.ts 의 verifiedFrom 참고).
    const topics = verifyTopics(proposed.articles, proposed.drafts);

    // 검색추이. 뉴스만 요란하고 사람들은 안 찾는 주제를 여기서 가른다.
    let trends: Record<string, Trend> | undefined;
    if (hasNaver()) {
      const keywords = [
        ...new Set(topics.slice(0, 12).map((t) => t.searchKeyword).filter(Boolean)),
      ];
      const map = await trendsFor(keywords);
      trends = Object.fromEntries(map);
    }

    // 두 번째 LLM 호출. 표에 오를 주제만 한 번에 묻는다 — 주제 수만큼 부르지 않는다.
    const categorized = await classifyNews(
      topics.map((t) => ({
        topic: t.topic,
        why: t.why,
        evidence: t.articles.slice(0, 3).map((a) => `[${a.sourceName}] ${a.title}`),
      })),
    );

    return {
      articles: proposed.articles,
      drafts: proposed.drafts,
      fetched: report.ok,
      failed: report.failed,
      usage: {
        input: (proposed.usage?.input ?? 0) + categorized.usage.input,
        output: (proposed.usage?.output ?? 0) + categorized.usage.output,
      },
      trends,
      categories: categorized.verdicts,
    };
  },

  normalize(raw, ctx): Candidate[] {
    const r = (raw ?? {}) as Partial<NewsRaw>;
    const articles = r.articles ?? [];
    const topics = verifyTopics(articles, r.drafts ?? []);
    const trends = r.trends ?? {};
    // 갈래는 이름으로 잇는다. 후보 id 는 아래에서 만들어지므로 여기서 쓰면 규칙이 두 군데가 된다.
    const categoryOf = new Map((r.categories ?? []).map((c) => [key(c.topic), c.category]));

    return topics.map((t): Candidate => {
      // 매체를 돌아가며 뽑는다. 앞에서부터 자르면 기사 많은 한 곳이 근거를 다 차지해서
      // '여러 곳이 다뤘다'는 판정이 근거에서는 안 보인다(연합뉴스 8건이 실제로 그랬다).
      const evidence: Evidence[] = roundRobin(t.articles, 8).map((a) => ({
        source: a.sourceName,
        title: a.title,
        // 요약을 400자까지 받아 두고도 제목만 넘기고 있었다 — 원고를 쓰는 쪽은
        // 헤드라인 말고 볼 것이 없었다. 링크는 사람이 눌러 볼 때나 열린다.
        excerpt: (a.summary || '').trim() || undefined,
        url: a.url,
        ...(a.thumbnailUrl ? { thumbnailUrl: a.thumbnailUrl } : {}),
        note: a.publishedAt ? a.publishedAt.slice(0, 10) : undefined,
      }));

      // 매체 성격이 한 종류뿐이면(예: 홍보 매체만) '여러 곳이 다뤘다'가 약해진다.
      const oneKind = t.kinds.length < 2;
      const tr = trends[t.searchKeyword];

      return {
        id: `news:${key(t.topic)}`,
        unit: 'topic',
        subject: t.topic,
        verdict: verdictFor(t.sources.length, oneKind, tr),
        why: t.why,
        // 매체 셋 이상이고 성격도 갈리면 근거가 섰다고 본다.
        grounded: t.sources.length >= 3 && !oneKind,
        momentum: {
          mediaCount: t.sources.length,
          surge: tr?.surge ?? null,
          yoy: tr?.yoy ?? null,
          extra: {
            기사수: t.articles.length,
            매체성격: t.kinds.join('·'),
            검색어: t.searchKeyword || null,
            버린기사번호: t.droppedIndexes.length || null,
          },
        },
        // 주제 후보는 IP 권리 판정 대상이 아니다.
        rights: {
          basis: 'not_applicable',
          note: noteFor(oneKind, tr),
        },
        evidence,
        hint: {},
        review: 'pending',
        lifecycle: 'active',
        origin: { discoveryId: 'news', runId: ctx.runId, runAt: ctx.runAt },
        raw: {
          topic: t.topic,
          sources: t.sources,
          kinds: t.kinds,
          dropped: t.droppedIndexes,
          // 밈의 kind 와 같은 자리다. 후보 행에 직접 두지 않아 재정규화가 지우지 않는다.
          ...(categoryOf.has(key(t.topic)) ? { category: categoryOf.get(key(t.topic)) } : {}),
        },
      };
    });
  },
};

/**
 * 판정. 축이 둘이다 — 매체가 다뤘나, 그리고 사람들이 실제로 찾았나.
 *
 * 둘을 나눠 보는 게 요점이다. 로또는 매체 3곳이 다뤘지만 검색은 평소와 같았다(1.00배).
 * 늘 기사가 나오는 소재라서 그렇다. 그런 걸 '지금 오르는'으로 부르면 표가 거짓말을 한다.
 */
function verdictFor(sources: number, oneKind: boolean, tr?: Trend): string {
  const spread = sources >= 4 ? '여러 곳이 크게' : sources >= 3 ? '여러 곳이' : '두 곳이';

  if (tr?.surge != null) {
    if (tr.surge >= 3) return `지금 오르는 (검색 ${tr.surge}배)`;
    if (tr.surge >= 1.5) return `오르는 편 (검색 ${tr.surge}배)`;
    if (tr.surge <= 0.8) return `${spread} 다뤘지만 검색은 식는 중`;
    return `${spread} 다뤘지만 검색은 평소`;
  }
  // 검색추이를 못 잰 경우. 매체 수만으로 말하고, 잰 척하지 않는다.
  if (sources >= 4) return '여러 곳이 크게 다룸';
  if (sources >= 3) return oneKind ? '같은 성격 매체 3곳' : '여러 곳이 다룸';
  return oneKind ? '두 곳이 다룸 (같은 성격)' : '두 곳이 다룸';
}

function noteFor(oneKind: boolean, tr?: Trend): string | undefined {
  const bits: string[] = [];
  if (oneKind) bits.push('한 종류의 매체에서만 다뤘습니다. 교차 확인이 약합니다.');
  if (tr && tr.surge == null) bits.push('검색추이를 잴 표본이 부족해 매체 수만으로 판정했습니다.');
  return bits.length ? bits.join(' ') : undefined;
}

/** 매체별로 한 건씩 돌아가며 고른다. 매체 다양성이 근거 목록에서 바로 보이게. */
function roundRobin(articles: Article[], limit: number): Article[] {
  const bySource = new Map<string, Article[]>();
  for (const a of articles) {
    const list = bySource.get(a.sourceName);
    if (list) list.push(a);
    else bySource.set(a.sourceName, [a]);
  }
  const queues = [...bySource.values()];
  const out: Article[] = [];
  let round = 0;
  while (out.length < limit) {
    let took = false;
    for (const q of queues) {
      if (round >= q.length) continue;
      out.push(q[round]);
      took = true;
      if (out.length >= limit) break;
    }
    if (!took) break;
    round += 1;
  }
  return out;
}
