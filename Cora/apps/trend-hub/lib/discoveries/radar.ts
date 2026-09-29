import { promises as fs, statSync } from 'node:fs';
import path from 'node:path';
import type { Candidate, CandidateUnit, Evidence, Rights } from '../core/candidate';
import type { Discovery, RunContext } from '../core/adapters';
import { key } from '../core/store';
import { cut } from '../core/text';

/**
 * 트렌드 레이더 — 별도 앱이던 판정기를 여기로 들인다.
 *
 * 레이더는 파이썬이고(`C:\Users\mooja\trend-radar`) 이 앱은 Windows node 다.
 * 그래서 프로세스를 부르지 않는다 — 레이더가 회차마다 남기는 `trends.json` 을 읽는다.
 * 수집을 언제 돌릴지는 레이더 쪽 사정으로 남는다.
 *
 * **읽는 길이 둘이다.**
 *   RADAR_BASE 가 있으면  HTTP — `GET {RADAR_BASE}/api/trends-raw`
 *   없으면                파일 — `{RADAR_RUNS_DIR}/<회차>/trends.json`
 *
 * 파일만 있던 때는 두 앱이 **같은 기계에 있어야만** 돌았다. 그래서 배포에서는 레이더가
 * 통째로 내려갔고(held), 화면에 쌓인 회차만 남았다. 레이더에 이미 조회 서버가 있으니
 * (`web/serve.py`, 기본 8420) 주소만 주면 따로 떠 있어도 된다.
 *
 * `view.json`(화면용으로 추린 것)이 아니라 `trends.json`(판정 원본)을 받는다.
 * 이 앱은 제 규칙으로 다시 판정하므로 추려 둔 것을 받으면 그 여지가 사라진다.
 *
 * 이 판정기가 다른 것과 다른 점: **수집을 여기서 하지 않는다.** run() 은 이미 판정까지
 * 끝난 파일을 집어 올 뿐이라 API 도 LLM 도 부르지 않고 돈이 안 든다.
 * 규칙을 고치면 normalize() 만 다시 돌리면 되는 것도 같다 — 원본이 스냅샷에 남는다.
 *
 * 레이더가 재는 축은 이 앱의 다른 판정기와 다르다.
 *   뉴스 소재   : 매체 교차 + 네이버 검색 급등
 *   캐릭터 발굴 : 조회수 + 권리
 *   레이더      : **검색어 없이** 플랫폼이 "지금 뜬다"고 알려준 것 + 7일 곡선 기울기
 * 검색어를 쓰지 않는 게 레이더의 전부다. 검색어를 넣는 순간 발굴이 확인으로 되돌아간다.
 */

/** 레이더 `trends.json` 의 한 줄. 레이더가 쓰는 이름을 그대로 둔다 — 옮겨 적으면 어긋난다. */
interface RadarTrend {
  name?: string;
  kind?: string | null;
  stage?: string | null;
  stage_why?: string | null;
  scale?: string | null;
  scale_value?: number | null;
  direction?: string | null;
  direction_value?: number | null;
  direction_source?: string | null;
  verdict?: string | null;
  trend_why?: string | null;
  evidence?: string | null;
  held?: string | null;
  caveat?: string | null;
  source?: string | null;
  curve?: number[] | null;
  views?: number | null;
  publish_count?: number | null;
  growth?: number | null;
  runs?: number | null;
  spread?: RadarSpread | null;
  news?: RadarNews | null;
  /** 이 후보를 다른 자료에서 찾아볼 때 쓸 짧은 말. 벤치마킹이 이걸로 유튜브를 검색한다. */
  search_keyword?: string | null;
  /** 형상 프롬프트. '모습' 후보에만 있다 — 레이더가 권리 귀속까지 판정한 결과다. */
  profile?: RadarProfile | null;
  ownership?: 'individual' | 'corporate' | 'disputed' | 'unknown' | null;
  creator?: string | null;
}

interface RadarProfile {
  features?: string;
  why_trending?: string;
  trend_grounded?: boolean;
  tone?: string;
  content_angle?: string;
  visual_grounded?: boolean;
  prompt_basis?: 'source_grounded' | 'reference_required' | 'none';
  image_prompt?: string;
  motion_prompt?: string;
  negative_prompt?: string;
  basis_why?: string;
}

/** 3단계 확산 검증 결과. 이게 있어야 근거 링크가 생긴다. */
interface RadarSpread {
  posts?: number;
  authors?: number;
  platforms?: string[];
  views?: number;
  links?: { platform: string; url: string; author: string; text: string; body?: string; views: number }[];
  week_counts?: number[];
  intra_slope?: number | null;
}

/**
 * 뉴스 교차 확인 결과. 레이더가 RSS 9곳을 훑어 붙인다.
 *
 * 확산 검증(3단계)은 TikHub 건당 과금이라 회차마다 돌지 않는다. 뉴스는 키가 없어
 * 공짜라 늘 돈다 — 그래서 근거 링크의 하한선이 여기서 생긴다. '왜 지금 퍼지나'도
 * 이쪽에서만 온다. SNS 급상승 목록은 무엇이 뜨는지만 말하고 왜인지는 말하지 않는다.
 */
interface RadarNews {
  sources?: string[];
  kinds?: string[];
  kind_labels?: string[];
  articles?: number;
  one_kind?: boolean;
  why?: string;
  links?: { source: string; title: string; url: string; summary?: string; posted_at: number }[];
  matched?: boolean;
}

export interface RadarRaw {
  runId: string;
  runDir: string;
  trends: RadarTrend[];
}

/** 레이더 회차 폴더. 윈도우/WSL 어느 쪽에서 띄워도 같은 곳을 보게 env 로 뺀다. */
function runsDir(): string {
  return process.env.RADAR_RUNS_DIR || path.join(process.cwd(), '..', 'trend-radar', 'runs');
}

/** 레이더 조회 서버 주소. 있으면 파일 대신 이쪽을 읽는다. */
function radarBase(): string {
  return (process.env.RADAR_BASE || '').trim().replace(/\/+$/, '');
}

/**
 * HTTP 로 회차를 집어 온다. 레이더가 따로 떠 있어도 되게 하는 길이다.
 *
 * 실패를 삼키지 않는다 — 레이더가 안 떠 있는 것과 회차가 없는 것은 사람이 할 일이
 * 다르다. 앞엣것은 서버를 띄우면 되고 뒤엣것은 레이더에서 한 회차를 돌려야 한다.
 */
async function fetchRun(base: string, runId: string): Promise<RadarRaw> {
  const url = `${base}/api/trends-raw${runId ? `?run=${encodeURIComponent(runId)}` : ''}`;
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  } catch (e) {
    throw new Error(
      `레이더 서버에 닿지 못했습니다: ${url}\n` +
        `레이더 쪽에서 \`python3 -c "import web.serve; web.serve.serve()"\` 로 띄우거나 RADAR_BASE 를 고치세요. (${
          e instanceof Error ? e.message : String(e)
        })`,
    );
  }
  const body = (await res.json().catch(() => null)) as { run?: string; trends?: RadarTrend[]; error?: string } | null;
  if (!res.ok || !body) {
    throw new Error(`레이더가 회차를 주지 않았습니다 (${res.status}): ${body?.error ?? url}`);
  }
  if (!Array.isArray(body.trends)) throw new Error(`레이더 응답에 trends 배열이 없습니다: ${url}`);
  return { runId: body.run || runId || 'radar', runDir: url, trends: body.trends };
}

/**
 * 레이더가 붙인 유형 → 이 앱의 산출 단위.
 *
 * 생성기가 이걸로 갈린다. 포스터는 topic 만, 이미지는 subject 만 받는다.
 * '모습'만 subject 인 이유는 레이더에서도 그 유형에만 권리 귀속 판정이 붙기 때문이다
 * (config.kinds.모습.rights_required). 나머지는 따라 만드는 대상이 아니라 다룰 주제다.
 */
function unitOf(kind: string | null | undefined): CandidateUnit {
  return kind === '모습' ? 'subject' : 'topic';
}

const PLATFORM_LABEL: Record<string, string> = {
  tiktok: '틱톡',
  instagram: '인스타',
  x: 'X',
  youtube: '유튜브',
  reddit: '레딧',
};

/**
 * 구간 키 → 이 앱에서 보여줄 말.
 *
 * 레이더가 판정이 내는 값을 키(seed·now·down·gone)로 바꿨다 — 표시 이름은 레이더
 * config.labels.zones 가 정하고 레이더 화면이 붙인다. 여기는 그 화면이 아니므로
 * 같은 키를 이 앱의 말로 옮긴다. 모르는 키가 오면 키를 그대로 보여준다 —
 * 조용히 빈칸이 되는 것보다 낫다.
 */
const ZONE_LABEL: Record<string, string> = {
  seed: '지금 선점',
  now: '한창',
  down: '식는 중',
  gone: '끝남',
};

const SOURCE_LABEL: Record<string, string> = {
  tiktok_ads_hashtags: '틱톡 해시태그 순위',
  tiktok_daily_words: '틱톡 급상승어',
  twitter_trending: 'X 트렌드',
  youtube_trending: '유튜브 인기',
  reddit_trending: '레딧 급상승',
  instagram_reels: '인스타 릴스 추천',
};

/**
 * 회차 폴더가 있나. **모듈이 처음 읽힐 때 한 번만 본다** — 화면을 그릴 때마다
 * 파일시스템을 찌르지 않으려고 동기로 확인한다. env 를 주면 그 경로를 본다.
 */
function hasRuns(): boolean {
  try {
    return statSync(runsDir()).isDirectory();
  } catch {
    return false;
  }
}

export const radarDiscovery: Discovery = {
  id: 'radar',
  name: '트렌드 레이더',
  description:
    '검색어 없이 6개 플랫폼의 급상승 목록만 받아 유형을 나누고 2축 4구간으로 판정합니다. ' +
    '레이더가 남긴 회차 파일을 읽어 옵니다 — 여기서 수집하지 않습니다.',
  role: 'produces',
  // 보드('지금 뜨는 것')에 실행 단추를 둔다. 후보 자체는 유형에 따라 topic·subject 로 갈린다.
  unit: 'topic',
  /*
   * 회차 폴더가 없으면 화면에서 내려간다 (2026-09-18, 배포 대비).
   *
   * 이 판정기는 수집을 하지 않는다 — 로컬 파이썬 앱(`trend-radar`)이 남긴 폴더를 읽을
   * 뿐이다. 배포 환경에는 그 폴더가 없어서, 단추를 그대로 두면 눌렀을 때만 에러가 난다.
   * 눌러 보기 전에는 되는 줄 아는 것이 안 되는 줄 아는 것보다 나쁘다.
   *
   * **지우는 게 아니라 내리는 것이다.** RADAR_RUNS_DIR 을 주면 그대로 돌아오고,
   * 이미 쌓인 레이더 회차와 후보는 held 여부와 무관하게 표에 그대로 남는다.
   */
  // RADAR_BASE 가 있으면 폴더가 없어도 된다 — 레이더가 따로 떠 있다는 뜻이다.
  // 닿는지는 눌러 봐야 알지만, 주소를 준 사람에게 '없다'고 말하는 것이 더 틀리다.
  held: radarBase() || hasRuns()
    ? undefined
    : 'RADAR_RUNS_DIR 도 RADAR_BASE 도 없습니다. 레이더는 로컬 앱이 남긴 회차를 읽는 판정기라 이 환경에서는 새 회차를 돌릴 수 없습니다. 쌓인 회차는 그대로 보입니다.',
  inputs: [
    {
      name: 'runId',
      label: '회차',
      type: 'text',
      help: '비우면 가장 최근 회차를 가져옵니다. 폴더 이름을 그대로 적으면 그 회차를 읽습니다.',
    },
  ],

  async run(input): Promise<RadarRaw> {
    const runIdInput = (input.runId || '').trim();
    const base = radarBase();
    if (base) return fetchRun(base, runIdInput);

    const dir = runsDir();
    let runId = runIdInput;

    if (!runId) {
      let entries: string[];
      try {
        entries = (await fs.readdir(dir, { withFileTypes: true }))
          .filter((e) => e.isDirectory())
          .map((e) => e.name)
          .sort()
          .reverse();
      } catch {
        throw new Error(
          `레이더 회차 폴더를 못 찾았습니다: ${dir}\n` +
            'RADAR_RUNS_DIR 을 .env.local 에 넣거나 레이더를 먼저 한 회차 돌리세요.',
        );
      }
      // 판정까지 끝난 회차만 고른다. 수집만 하다 만 폴더가 섞여 있다.
      for (const name of entries) {
        try {
          await fs.access(path.join(dir, name, 'trends.json'));
          runId = name;
          break;
        } catch {
          /* 다음 회차를 본다 */
        }
      }
      if (!runId) throw new Error(`${dir} 안에 trends.json 을 가진 회차가 없습니다.`);
    }

    const file = path.join(dir, runId, 'trends.json');
    let text: string;
    try {
      text = await fs.readFile(file, 'utf8');
    } catch {
      throw new Error(`회차 파일을 못 읽었습니다: ${file}`);
    }

    const trends = JSON.parse(text) as RadarTrend[];
    if (!Array.isArray(trends)) throw new Error(`${file} 이 배열이 아닙니다.`);
    return { runId, runDir: path.join(dir, runId), trends };
  },

  /**
   * 레이더는 회차 폴더를 읽는다. 같은 폴더를 여러 번 읽었으면 마지막 것만이 완성본이다 —
   * 레이더가 판정 도중에도 trends.json 을 덮어쓰기 때문에 중간 상태가 섞인다.
   */
  snapshotKey(raw: unknown): string | null {
    return (raw as RadarRaw)?.runId ?? null;
  },

  normalize(raw, ctx: RunContext): Candidate[] {
    const r = raw as RadarRaw;
    const trends = Array.isArray(r?.trends) ? r.trends : [];

    return trends
      .filter((t) => (t.name || '').trim())
      // 상시어로 내린 것은 후보가 아니다. 레이더 화면에서도 카드에서 내려간다.
      .filter((t) => !t.held)
      // 구간을 못 낸 것(기울기 미측정)은 판정이 안 끝난 것이다. 보드에 올리면 253개가 덮는다.
      .filter((t) => Boolean(t.stage))
      .map((t): Candidate => {
        const spread = t.spread ?? null;
        const links = spread?.links ?? [];

        // 근거는 링크가 있는 것만이다. 확산 검증 게시물과 뉴스 기사 둘 다 받는다 —
        // 둘 다 없으면 비어 있고 생성기 게이트가 막는다. 그게 맞는 동작이라 채워 넣지 않는다.
        const news = t.news ?? null;
        const evidence: Evidence[] = [
          ...links.map((l) => ({
            source: PLATFORM_LABEL[l.platform] || l.platform,
            title: cut((l.text || '').trim(), 80) || `${l.author || '계정 미상'} 게시물`,
            // 제목은 본문의 앞부분을 자른 것이라, 본문이 더 길 때만 따로 싣는다.
            excerpt: bodyOf(l.body || l.text, l.text),
            url: l.url,
            note: l.author ? `계정 ${l.author}` : undefined,
            metric: l.views ? `조회 ${l.views.toLocaleString('ko-KR')}` : undefined,
          })),
          ...(news?.links ?? []).map((a) => ({
            source: a.source,
            title: cut((a.title || '').trim(), 80) || '(제목 없음)',
            excerpt: (a.summary || '').trim() || undefined,
            url: a.url,
            note: a.posted_at ? new Date(a.posted_at * 1000).toISOString().slice(0, 10) : undefined,
          })),
        ].filter((e) => e.url);

        const unit = unitOf(t.kind);
        const profile = t.profile ?? null;
        const rights: Rights = rightsFor(unit, t, profile);

        return {
          id: `radar:${key(t.name!)}`,
          unit,
          subject: t.name!.trim(),
          verdict: verdictFor(t),
          // '왜 지금'은 뉴스에서만 온다. 없으면 분류 근거로 대신한다 — 지어내지 않는다.
          why: (news?.why || t.evidence || t.stage_why || '').trim(),
          // 링크가 있고 기울기 출처가 있어야 근거가 섰다고 본다. 다만 '여럿이 말한다'를
          // 확인하는 길이 둘이다 — 확산 검증 계정 2곳 이상, 또는 성격이 다른 매체 3곳 이상.
          // 한 종류 매체만 다룬 것(one_kind)은 교차 확인으로 치지 않는다.
          grounded:
            evidence.length > 0 &&
            Boolean(t.direction_source) &&
            ((spread?.authors ?? 0) >= 2 ||
              ((news?.sources?.length ?? 0) >= 3 && !news?.one_kind)),
          momentum: {
            views: t.views ?? null,
            growth: t.growth ?? null,
            // 서로 다른 계정 수는 3단계를 돌아야 안다. 없으면 없다고 둔다 —
            // 게시물 수(publish_count)를 계정 수로 채우지 않는다. 그게 레이더에 있던 실수다.
            accounts: spread?.authors ?? null,
            platforms: (spread?.platforms ?? []).map((p) => PLATFORM_LABEL[p] || p),
            extra: {
              구간: t.stage ? ZONE_LABEL[t.stage] || t.stage : null,
              규모: t.scale ?? null,
              기울기: t.direction_value ?? null,
              기울기출처: t.direction_source ?? null,
              게시물수: t.publish_count ?? null,
              급상승출처: SOURCE_LABEL[t.source || ''] || t.source || null,
              유형: t.kind ?? null,
              확산검증: spread ? `계정 ${spread.authors ?? 0} · 게시물 ${spread.posts ?? 0}` : null,
              뉴스: news ? `매체 ${news.sources?.length ?? 0}곳 · 기사 ${news.articles ?? 0}건` : null,
              // 벤치마킹(본보기 찾기)이 이 칸을 읽는다. 없으면 후보 이름으로 검색하는데,
              // 뉴스 주제는 이름이 긴 제목이라 유튜브가 엉뚱한 걸 물어온다.
              검색어: (t.search_keyword || '').trim() || t.name!.trim(),
            },
          },
          evidence,
          rights,
          // 레이더가 판정한 것을 그대로 넘긴다. 이 칸이 비어 있어서 이미지 생성기가
          // '채우는 경로가 없다'는 사유로 세워져 있었다 — 경로가 여기다.
          hint: {
            angle: profile?.content_angle || undefined,
            tone: profile?.tone || undefined,
            features: profile?.features || undefined,
            imagePrompt: profile?.image_prompt || undefined,
            motionPrompt: profile?.motion_prompt || undefined,
            negativePrompt: profile?.negative_prompt || undefined,
          },
          review: 'pending',
          lifecycle: 'active',
          origin: { discoveryId: 'radar', runId: r.runId || ctx.runId, runAt: ctx.runAt },
          raw: {
            stage: t.stage,
            news: news ? { sources: news.sources, articles: news.articles, oneKind: news.one_kind } : null,
            stageWhy: t.stage_why,
            trendWhy: t.trend_why,
            caveat: t.caveat,
            curve: t.curve,
            weekCounts: spread?.week_counts,
          },
        };
      })
      /*
       * 근거 레코드가 0건인 것은 후보로 세우지 않는다 (지시서 P3-1, 2026-09-17).
       *
       * 이 9건이 카드뉴스·포스터 게이트를 막고 있던 전부였다. 게이트는 제대로 동작한
       * 것이라 해제하지 않고, 후보로 올라오는 것 자체를 막는다. 채울 링크가 애초에 없다 —
       * 레이더가 준 건 틱톡 해시태그 순위 한 줄(게시물수 699)뿐이고 게시물도 기사도 없다.
       *
       * **라벨(`kind: 미분류`)로 거르지 않는다.** 미분류는 증상이고 원인은 근거 부재다.
       * 실측: 미분류로 걸면 4건, 근거 0건으로 걸면 9건이고 미분류는 그 안에 전부 포함된다.
       * 라벨에만 기대면 `hypic`·`캡컷`(둘 다 앱 이름인데 `kind: 모습`) 과
       * `코드컵에서 나온 세계 1위의 레전드 플레이`(영상 제목인데 `kind: 사건`)가 새어 나간다.
       *
       * 지우는 것이 아니라 규칙이다. 원본은 스냅샷에 그대로 있고 이 줄만 빼면 되돌아온다.
       */
      .filter((c) => c.evidence.length > 0);
  },
};


/** 제목이 이미 본문의 앞부분이면 같은 말을 두 번 싣지 않는다. */
function bodyOf(body: string | undefined, title: string | undefined): string | undefined {
  const b = (body || '').trim();
  const t = (title || '').trim();
  if (!b || b === t) return undefined;
  return b;
}

function verdictFor(t: RadarTrend): string {
  const zone = t.stage ? ZONE_LABEL[t.stage] || t.stage : null;
  const bits = [zone, t.scale ? `규모 ${t.scale}` : null].filter(Boolean);
  return bits.join(' · ') || '판정 전';
}

/**
 * 레이더가 판정한 권리 귀속을 그대로 집행한다.
 *
 * 2026-09-15 이전에는 레이더 `collect` 경로가 권리를 판정하지 않아 무조건 `none` 이었다.
 * 이제 '모습' 카드에 한해 권리 귀속(attr) → 특징·프롬프트(profile) 를 돌린다.
 * **없는 판정을 있는 척하지 않는 규칙은 그대로다** — 프로필이 없으면 여전히 `none` 이고,
 * 그러면 형상 생성기가 막는다. 그게 맞는 동작이다.
 */
function rightsFor(unit: CandidateUnit, t: RadarTrend, profile: RadarProfile | null): Rights {
  if (unit !== 'subject') {
    return { basis: 'not_applicable', note: '주제 후보는 IP 권리 판정 대상이 아닙니다.' };
  }
  if (!profile?.prompt_basis) {
    return {
      basis: 'none',
      ownership: 'unknown',
      note:
        '이 회차에서는 권리 귀속을 판정하지 않았습니다. ' +
        '누구 것인지 모르는 채로 외형을 만들 수 없어 기획까지만 가능합니다.',
    };
  }
  return {
    basis: profile.prompt_basis,
    ownership: t.ownership ?? 'unknown',
    note: profile.basis_why || undefined,
  };
}
