import type { Candidate, Evidence, Rights } from '../core/candidate';
import type { Discovery, RunContext } from '../core/adapters';
import { collect, hasTikHub, type Platform, type Post } from '../collect/tikhub';
import { asPost, hasYouTube, searchVideos } from '../collect/youtube';
import { proposeNames, verifyNames, type NameDraft } from '../collect/names';
import { dropAdult, isAdultName } from '../collect/safety';
import { judgeRights, tighten, type RightsVerdict } from '../collect/rights';
import { summarizePosts, type PostSummary } from '../collect/summaries';
import { scoreThumbs } from '../collect/thumb-text';
import type { LineageVerdict } from '../collect/lineage';
import { key } from '../core/store';
import { toRecord, type PostRecord } from '../core/post-record';
import { cut } from '../core/text';

/**
 * 캐릭터 발굴 — 앱이 직접 수집·판정한다. Dify 를 거치지 않는다.
 *
 * TikHub 는 유료라 호출 수를 설계에서 줄인다. 검색어는 5개가 아니라 3개,
 * 플랫폼은 3개 → 호출 9회. (기존 Dify 워크플로우는 회차당 20회를 썼다.)
 *
 * 흐름: 수집 → 이름 제안(LLM) → 원문 대조(코드) → 권리 판정(LLM) → 재조임(코드) → 본문 요약(LLM)
 * API 는 run() 에서만 부른다. 판정 규칙을 고치면 스냅샷에 normalize() 만 다시 돌린다.
 */

/**
 * 검색어 세트. Dify v13.2 의 것을 그대로 되돌렸다 — 옮기면서 호출 수를 아끼려고
 * 세트당 5개를 3개로 줄이고 `전체` 를 통째로 뺐는데, 그게 판정축을 없앴다.
 *
 * `전체` 가 핵심이다. 나머지 세트는 창작자 1인칭 어투라("자캐" = 내 캐릭터)
 * 계정마다 다른 이름이 나오고 교차가 구조적으로 안 생긴다.
 * `전체` 는 3자 관찰자 어투다 — 남이 남의 캐릭터를 말하는 자리라 서로 다른 계정이
 * 같은 이름을 말한다. 기존 IP 도 같이 들어오는데 버리지 않고 대조군으로 쓴다.
 * 대형 IP 대비 이 신인이 어느 정도인지 같은 표에서 보이는 것이 이 세트의 목적이다.
 */
const TRACKS: Record<string, string[]> = {
  전체: ['캐릭터 굿즈', '캐릭터 인형', '요즘 캐릭터', '캐릭터 언박싱', '캐릭터 유행'],
  창작: ['자캐', '오리지널캐릭터', '캐릭터 만들었어요', '캐릭터드로잉', '창작캐릭터'],
  커머스: ['이모티콘 출시', '굿즈 제작', '캐릭터 펀딩', '스티커 제작', '인형 제작'],
  팬아트: ['팬아트', '그려봤어요', '2차창작', '따라그리기', '캐릭터 리메이크'],
  혼합: ['자캐', '오리지널캐릭터', '이모티콘 출시', '굿즈 제작', '팬아트'],
};

/** 세트별 검색어 수. 테스트가 세트가 다시 줄어드는 걸 막는다. */
export const TRACKS_SIZE: Record<string, number> = Object.fromEntries(
  Object.entries(TRACKS).map(([k, v]) => [k, v.length]),
);

/** 최근 며칠까지 볼 것인가. v13.2 의 since30 과 같다. */
export const WINDOW_DAYS = 30;

const PLATFORMS: Platform[] = ['instagram', 'x', 'tiktok'];

/**
 * 이름 하나를 후보로 올리는 데 필요한 서로 다른 계정 수.
 *
 * 1 이다. 이 판정기는 '여러 곳에서 뜨는 것'을 찾는 게 아니라
 * **개인 창작자의 캐릭터를 발굴하고 권리를 판정하는** 도구이기 때문이다.
 * 발굴에서 유효한 단위는 창작자 본인 계정 하나다.
 *
 * 2 로 올려 본 적이 있다. 산출이 0건이 됐다 — 검색어가 '자캐'(자기 캐릭터)라
 * 게시물 142건이 계정 110곳으로 흩어지고, 서로 다른 작가가 같은 캐릭터를 그릴 일이
 * 없어서다. 교차 확인이 필요하면 문턱이 아니라 검색어를 팬아트·2차창작으로 바꿔야 한다.
 * 그건 다른 판정기다.
 *
 * 문턱은 회차 입력칸이 아니라 코드에 둔다. 규칙은 normalize 가 가져야
 * 저장된 원본에 다시 돌릴 수 있다.
 */
const MIN_AUTHORS = 1;

/**
 * 한 회차에서 후보로 세울 이름 수의 상한.
 *
 * **12 였다. 2026-09-18 에 16 으로 올렸다.** 12 는 병목이 아니었지만 —
 * 회차가 12~15건밖에 낳지 않아 09-17 은 상한에 닿지도 않았다 — **자르던 3건 중 하나가
 * `토랩이`(계정명이 곧 캐릭터명, 조회 117)였다.** 이 판정기가 찾으려는 것이 개인 창작자
 * 본인 계정인데 상한이 정확히 그것을 자르고 있었다. 조회수로 줄을 세우면 개인 창작자가
 * 대형 IP 밑에 깔린다.
 *
 * 16 위로는 올려도 달라지는 게 없다(20·24·무제한이 전부 같은 결과였다). 확인은
 * `npx tsx --env-file=.env.local tests/_cap.ts` — 저장된 스냅샷으로 세므로 무료다.
 *
 * **run 과 normalize 가 같은 값을 써야 한다.** run 에서만 넓으면 판정을 사 놓고 버리고,
 * normalize 에서만 넓으면 판정 없는 후보가 표에 오른다(실제로 `토랩이` 가 그랬다).
 */
export const MAX_CANDIDATES = 16;

/**
 * 16칸 중 개인 창작자에게 떼어 주는 자리.
 *
 * 2026-09-18 이름 한도를 50 으로 올리자 기업 IP 가 16칸을 다 채우고 **개인 창작자가
 * 표에서 통째로 사라졌다**(토랩이·컬러스틱맨). 정렬 축이 `계정 → 플랫폼 → 조회` 인데
 * 개인 창작자는 본인이 자기 캐릭터를 올리니 **계정이 구조적으로 1곳**이라, 계정 2곳
 * 이상인 기업 IP 에 언제나 진다. 그물을 넓힐수록 더 밀린다.
 *
 * 상한을 또 올리는 것으로는 안 고쳐진다 — 늘린 자리도 기업 IP 가 먼저 가져간다.
 * 그래서 순위가 아니라 **자리**를 뗀다. 이 판정기의 목적이 개인 창작 캐릭터 발굴이다.
 */
export const SELF_NAMED_SLOTS = 4;

/**
 * 상한 안에서 표에 올릴 이름을 고른다. 순위가 기본이되 계정명일치에 자리를 남긴다.
 *
 * 예약분이 상위에 이미 들어 있으면 아무것도 안 한다. 모자랄 때만, 상한 밖에 있는
 * 계정명일치를 끌어올리고 **순위가 가장 낮은 비예약 항목**을 그만큼 내린다.
 * 예약한 자리를 채울 개인 창작자가 없으면 그 자리는 비우지 않고 순위대로 채운다.
 */
export function pickForTable<T extends { name: string; selfNamed: boolean }>(
  verified: T[],
  cap = MAX_CANDIDATES,
  slots = SELF_NAMED_SLOTS,
): T[] {
  const head = verified.slice(0, cap);
  if (head.length < cap) return head; // 자리가 남으면 밀어낼 이유가 없다
  const want = slots - head.filter((n) => n.selfNamed).length;
  if (want <= 0) return head;

  const extras = verified.slice(cap).filter((n) => n.selfNamed).slice(0, want);
  if (!extras.length) return head;

  const drop = new Set(head.filter((n) => !n.selfNamed).slice(-extras.length).map((n) => n.name));
  return [...head.filter((n) => !drop.has(n.name)), ...extras];
}

interface CharRaw {
  posts: Post[];
  drafts: NameDraft[];
  verdicts: RightsVerdict[];
  /**
   * 후보별 본문 요약 (지시서 summary). **옛 회차에는 없다** — 그때는 이 경로가 없었다.
   * 없으면 칸이 안 나갈 뿐이고, `tests/_summarize.ts` 로 스냅샷에 소급해 채운다.
   */
  summaries?: PostSummary[];
  /**
   * 출신 분류. **회차가 만들지 않는다** — 요약이 있어야 갈 수 있어서 뒤에 소급으로 붙인다
   * (`tests/_lineage.ts`). 없으면 화면에서 '모름' 칸으로 간다.
   */
  lineages?: LineageVerdict[];
  /** sourceId → 썸네일 점수(0·1·2). 후보 행이 아니라 여기 둬야 재정규화가 안 지운다. */
  shotScores?: Record<string, number>;
  /**
   * 네이버 검색 추이 — **규모 기준선** (2026-09-19). 뉴스 축이 쓰는 잣대를 그대로 쓴다.
   *
   * 회차가 만들지 않는다. 무료지만 이름당 2콜이고 수집과 성격이 달라 소급으로 붙인다
   * (`tests/_naver.ts`). `at` 은 **언제 잰 값인지**다 — surge 는 최근 7일 대비라
   * 시간이 지나면 낡는다.
   */
  trends?: { name: string; surge: number | null; yoy: number | null; points: number; at: string }[];
  queries: string[];
  ok: { platform: string; query: string; count: number }[];
  failed: { platform: string; query: string; reason: string }[];
  calls: number;
  usage?: { input: number; output: number };
}

/**
 * 저장된 원본 → 대조를 통과한 이름들. `normalize`·`records` 가 같은 것을 보게 하는 자리다.
 *
 * 셋(정규화·레코드·소급 요약)이 각자 이 네 줄을 베껴 쓰고 있으면 규칙 하나를 고칠 때
 * 하나를 빠뜨린다. API 를 부르지 않는 순수 함수라 저장된 스냅샷에 몇 번이든 다시 돌린다.
 */
export function verifiedFrom(raw: unknown, runAt: string): ReturnType<typeof verifyNames> {
  const r = (raw ?? {}) as Partial<CharRaw>;
  const fresh = withinWindow(r.posts ?? [], runAt);
  const safe = dropAdult(fresh).kept;
  return verifyNames(safe, r.drafts ?? [], MIN_AUTHORS).filter((n) => !isAdultName(n.name));
}

export const characterNativeDiscovery: Discovery = {
  id: 'character-native',
  name: '캐릭터 발굴',
  description:
    '인스타·X·틱톡에서 캐릭터 후보를 찾고, 원문 대조로 걸러낸 뒤 권리 귀속을 판정합니다. Dify 를 거치지 않습니다.',
  role: 'produces',
  unit: 'subject',
  keyEnv: 'TIKHUB_KEY',
  inputs: [
    {
      name: 'track',
      label: '어느 계열을 볼까요',
      type: 'select',
      required: true,
      default: '전체',
      options: ['전체', '창작', '커머스', '팬아트', '혼합'],
      help: '전체 = 남이 남의 캐릭터를 말하는 자리를 봅니다. 기존 IP 도 대조군으로 함께 담고 권리는 판정으로 가립니다.',
    },
    {
      name: 'seed',
      label: '추가 검색어 (선택)',
      type: 'text',
      help: '적으면 맨 앞에 붙고 세트의 마지막 하나가 밀려납니다.',
    },
  ],

  async run(input, ctx): Promise<CharRaw> {
    const seed = (input.seed ?? '').trim();
    const set = TRACKS[input.track] ?? TRACKS.전체;
    // 검색어는 5개까지. 시드를 주면 맨 앞에 오고 마지막 하나가 밀려난다.
    const queries = (seed ? [seed, ...set] : set).slice(0, 5);
    const empty: CharRaw = { posts: [], drafts: [], verdicts: [], queries, ok: [], failed: [], calls: 0 };

    if (ctx.mock || !hasTikHub()) return empty;

    const report = await collect(queries, PLATFORMS, 20);

    /*
     * **유튜브도 같은 검색어로 본다.**
     *
     * 키를 꽂아 두고도 캐릭터 후보 73건의 근거 101건 중 유튜브가 0건이었다. 유튜브는
     * `본보기 찾기`(attaches)에만 있어서 사람이 후보 상세에서 하나씩 붙여야 했기 때문이다.
     * 씨앗으로 같이 받으면 자동 수집에 유튜브가 들어온다.
     *
     * 값이 다르다 — TikHub 는 호출마다 돈이 나가지만 유튜브는 일일 할당량 안이라 공짜다.
     * 그래서 `calls`(유료 호출 수)에 세지 않는다. 죽어도 TikHub 결과는 살린다.
     */
    const fromYouTube: Post[] = [];
    const ytOk: { platform: string; query: string; count: number }[] = [];
    if (hasYouTube()) {
      for (const q of queries) {
        try {
          const videos = await searchVideos(q, { max: 20, withinDays: WINDOW_DAYS });
          fromYouTube.push(...videos.map(asPost));
          ytOk.push({ platform: 'youtube', query: q, count: videos.length });
        } catch {
          /* 한 검색어가 죽어도 나머지는 계속한다 */
        }
      }
    }
    const collected = [...report.posts, ...fromYouTube];
    const ok = [...report.ok, ...ytOk];
    if (!collected.length) {
      return { ...empty, ok, failed: report.failed, calls: report.calls };
    }

    // 19금은 LLM 에 넣기 전에 버린다. 여기서 버려야 토큰도 돈도 안 나간다.
    // 원본에는 거른 뒤의 게시물만 남긴다 — 다시 판정할 때도 같은 것을 보게.
    const safe = dropAdult(collected);

    const named = await proposeNames(safe.kept);
    /*
     * **normalize 와 글자 그대로 같은 것을 본다.** 여기서 `verifiedFrom` 을 쓰는 이유다.
     *
     * 2026-09-19 까지 run 은 `safe.kept`(수집 전체)로, normalize 는 30일 창을 걸고
     * 줄을 세웠다. 두 줄이 달라 판정을 산 16건과 표에 오른 16건이 어긋났고,
     * 회차마다 '판정 전' 후보가 남았다 — 09-19 회차에서도 5건이 그랬다.
     * 소급(`tests/_rejudge.ts`)으로 때울 수 있지만 그건 회차마다 돈을 다시 쓰는 길이다.
     *
     * 원본에는 거르기 전의 게시물을 그대로 남긴다 — 규칙을 고쳐 다시 세울 여지를 남긴다.
     */
    const picked = pickForTable(
      verifiedFrom({ posts: safe.kept, drafts: named.drafts }, ctx.runAt),
    );
    const judged = await judgeRights(picked);
    // 세 번째 LLM 호출. 대조를 통과한 후보만 묶어 한 번에 묻는다 — 후보 수만큼 부르지 않는다.
    const summed = await summarizePosts(picked.map((n) => ({ name: n.name, posts: n.posts })));

    /*
     * 네 번째 LLM 호출 — 대표 사진 고르기 (charShot).
     *
     * **회차가 이걸 만들지 않고 있었다.** `records()` 는 `raw.shotScores` 를 읽는데
     * 그 칸을 채우는 곳이 `tests/_thumb_score.ts`(수동 소급) 뿐이었다. 그래서 새 회차의
     * 게시물은 점수가 전부 비었고, 대표 사진이 다시 최신순으로 돌아간다 — 언박싱 영상의
     * 첫 프레임, 곧 사람 얼굴이 대표가 된다. 고치려고 만든 점수가 새 회차에는 안 걸렸다.
     *
     * 표에 오를 후보의 게시물만 본다. 수집 전체(200건 넘는다)를 물으면 쓰지도 않을 장에
     * 돈을 쓴다. 같은 게시물이 여러 이름에 걸릴 수 있어 sourceId 로 한 번 접는다.
     * Haiku 에 8장씩 묶어 묻는다 — 회차당 몇 콜이고 값은 회차 전체에 비하면 잔돈이다.
     */
    const shotTargets = [...new Map(picked.flatMap((n) => n.posts).map((p) => [p.sourceId, p])).values()];
    const shots = await scoreThumbs(shotTargets);

    return {
      posts: safe.kept,
      drafts: named.drafts,
      verdicts: judged.verdicts,
      summaries: summed.summaries,
      shotScores: Object.fromEntries(shots.scores),
      queries,
      ok,
      failed: report.failed,
      calls: report.calls,
      usage: {
        input: named.usage.input + judged.usage.input + summed.usage.input + shots.usage.input,
        output: named.usage.output + judged.usage.output + summed.usage.output + shots.usage.output,
      },
    };
  },

  normalize(raw, ctx): Candidate[] {
    /* 아래 withinWindow 참고 — 날짜를 모르는 게시물은 버리지 않고 남긴다. */
    const r = (raw ?? {}) as Partial<CharRaw>;
    // 규칙은 verifiedFrom 이 갖는다. 그래야 저장된 옛 원본에도 지금 기준이 걸리고,
    // records·소급 요약이 보는 것과 어긋나지 않는다.
    // 30일 창을 안 걸면 몇 년 전 게시물이 '지금 뜨는 캐릭터'로 들어온다. v13.2 의 since30 이다.
    const verified = verifiedFrom(raw, ctx.runAt);
    const byName = new Map((r.verdicts ?? []).map((v) => [key(v.name), v]));
    // 요약도 이름으로 잇는다. 후보 id 는 아래에서 만들어지므로 여기서 쓰면 규칙이 두 군데가 된다.
    const sumByName = new Map((r.summaries ?? []).map((s) => [key(s.name), s.summary.trim()]));
    const linByName = new Map((r.lineages ?? []).map((l) => [key(l.name), l]));
    const trendByName = new Map((r.trends ?? []).map((t) => [key(t.name), t]));

    return pickForTable(verified).map((n): Candidate => {
      const rawV = byName.get(key(n.name));
      const v = rawV ? tighten(rawV, n) : undefined;

      const evidence: Evidence[] = n.posts
        .filter((p) => p.url)
        .slice(0, 8)
        .map((p) => {
          const body = p.text.replace(/\s+/g, ' ').trim();
          const title = cut(body, 80) || `${p.authorName} 게시물`;
          return {
            source: p.platform,
            title,
            // 제목은 본문을 80자로 자른 것이다. 더 길 때만 본문을 따로 싣는다 —
            // 같은 말을 두 번 싣지 않으면서 원고 쓸 재료는 남긴다.
            excerpt: body.length > title.length ? body : undefined,
            url: p.url,
            note: p.authorName ? `계정 ${p.authorName}` : undefined,
            metric: p.views ? `조회 ${p.views.toLocaleString('ko-KR')}` : undefined,
          };
        });

      const rights: Rights = {
        basis: v?.promptBasis ?? 'none',
        ownership: v?.ownership ?? 'unknown',
        confidence: v?.confidence,
        note: noteFor(v, n),
      };

      return {
        id: `character:${key(n.name)}`,
        unit: 'subject',
        subject: n.name,
        aliases: n.aliases,
        verdict: verdictFor(v, n),
        why: v?.whyTrending ?? '',
        // 빈 요약은 칸을 만들지 않는다. why 를 여기 넣지 말 것 — 묻는 것이 다르다.
        ...(sumByName.get(key(n.name)) ? { summary: sumByName.get(key(n.name)) } : {}),
        ...(linByName.has(key(n.name))
          ? {
              lineage: (({ name: _n, ...rest }) => rest)(linByName.get(key(n.name))!),
            }
          : {}),
        // 계정 하나짜리는 근거가 얇다. 숨기지 않고 드러낸다.
        grounded: Boolean(v?.trendGrounded) && n.authors.length >= 2,
        momentum: {
          accounts: n.authors.length,
          platforms: n.platforms,
          /*
           * 규모 기준선. **점이 0개면 null 로 둔다** — 0배로 적으면 거짓말이다.
           * 개인 창작 캐릭터는 검색량이 데이터랩 임계 미만이라 값이 안 온다.
           * `SurgeMeter` 는 null 이면 아무것도 안 그린다 — 그게 '못 잼'이다.
           */
          ...(trendByName.get(key(n.name))?.surge != null
            ? { surge: trendByName.get(key(n.name))!.surge }
            : {}),
          ...(trendByName.get(key(n.name))?.yoy != null
            ? { yoy: trendByName.get(key(n.name))!.yoy }
            : {}),
          // 발굴에서 재는 축은 교차가 아니라 조회수다. extra 에만 두면 정렬에 못 쓴다.
          views: n.views,
          extra: {
            조회합계: n.views,
            확인된자리: n.hits.join('·'),
            계정명일치: n.selfNamed ? '예' : '아니오',
          },
        },
        evidence,
        rights,
        hint: {
          angle: v?.contentAngle || undefined,
          tone: v?.tone || undefined,
          features: v?.features || undefined,
          imagePrompt: v?.imagePrompt || undefined,
          motionPrompt: v?.motionPrompt || undefined,
          negativePrompt: v?.negativePrompt || undefined,
        },
        review: 'pending',
        lifecycle: 'active',
        origin: { discoveryId: 'character-native', runId: ctx.runId, runAt: ctx.runAt },
        raw: { hits: n.hits, authors: n.authors.length, selfNamed: n.selfNamed },
      };
    });
  },

  /**
   * 게시물 레코드 (지시서 P2). **새 호출이 없다** — normalize 가 보는 바로 그 원본을 본다.
   *
   * 후보 id 를 normalize 와 같은 규칙(`character:${key(name)}`)으로 만들지 않고
   * 넘겨받은 candidates 에서 찾는다. 규칙을 두 군데 두면 언젠가 어긋난다.
   */
  records(raw, ctx, candidates): PostRecord[] {
    const scores = ((raw ?? {}) as Partial<CharRaw>).shotScores ?? {};
    const verified = verifiedFrom(raw, ctx.runAt);
    const idOf = new Map(candidates.map((c) => [key(c.subject), c.id]));

    const out: PostRecord[] = [];
    for (const n of verified) {
      const candidateId = idOf.get(key(n.name));
      // 후보가 안 된 이름의 게시물은 적지 않는다. 근거로 쓸 자리가 없다.
      if (!candidateId) continue;
      for (const post of n.posts) {
        const rec = toRecord(post, candidateId, {
          runId: ctx.runId,
          runAt: ctx.runAt,
          discoveryId: 'character-native',
        });
        if (!rec) continue;
        const sc = scores[post.sourceId];
        out.push(sc === undefined ? rec : { ...rec, charShot: sc });
      }
    }
    return out;
  },
};

function verdictFor(v: RightsVerdict | undefined, n: ReturnType<typeof verifyNames>[number]): string {
  if (!v) return '판정 전';
  switch (v.ownership) {
    case 'individual':
      return v.promptBasis === 'source_grounded' ? '개인 창작 — 제작 가능(허락 확인 후)' : '개인 창작 — 근거 보강 필요';
    case 'corporate':
      return '기업 IP — 라이선스 필요';
    case 'disputed':
      return '권리 분쟁 — 보류';
    default:
      return n.authors.length <= 1 ? '표본 부족 — 확인 필요' : '권리자 확인 필요';
  }
}

function noteFor(v: RightsVerdict | undefined, n: ReturnType<typeof verifyNames>[number]): string | undefined {
  const bits: string[] = [];
  if (v?.handle) bits.push(`원작자 추정 ${v.handle}. 실제 권리와 허락 범위를 확인하세요.`);
  if (v?.ownership === 'corporate') bits.push('기업 권리자와 정식 라이선스·사용 범위 확인이 필요합니다.');
  if (n.authors.length <= 1) bits.push('언급 계정이 하나뿐이라 확산으로 보기 어렵습니다.');
  if (v && !v.visualGrounded) bits.push('시각 근거가 자료에 없어 외형을 지어내지 않았습니다.');
  return bits.length ? bits.join(' ') : undefined;
}

/**
 * 최근 WINDOW_DAYS 안의 게시물만.
 *
 * postedAt 을 파싱해 두고 쓰지 않고 있었다. 그래서 오래된 게시물이 그대로 후보가 됐다.
 * 날짜를 못 읽은 게시물(postedAt: null)은 버리지 않는다 — 플랫폼마다 날짜가 안 오는
 * 경우가 있어서, 버리면 그 플랫폼이 통째로 사라진다.
 */
export function withinWindow<T extends { postedAt: string | null }>(posts: T[], runAt: string): T[] {
  const end = Date.parse(runAt);
  if (!Number.isFinite(end)) return posts;
  const start = end - WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return posts.filter((p) => {
    if (!p.postedAt) return true;
    const t = Date.parse(p.postedAt);
    return !Number.isFinite(t) || t >= start;
  });
}
