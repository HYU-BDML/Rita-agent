import type { Candidate, Evidence } from '../core/candidate';
import type { Discovery } from '../core/adapters';
import { collect, hasTikHub, searchTikTok, type Platform, type Post } from '../collect/tikhub';
import { proposeFormats, verifyFormats, type FormatDraft, type FormatKind } from '../collect/formats';
import { summarizePosts, type PostSummary } from '../collect/summaries';
import { judgeMemeSafety, type SafetyVerdict } from '../collect/meme-safety';
import { countPhrases, type PhraseReport } from '../collect/phrases';
import { readThumbText } from '../collect/thumb-text';
import { groupNames, type NameGroup } from '../collect/grouping';
import { asPost, hasYouTube, searchVideos } from '../collect/youtube';
import { listCandidates } from '../core/store';
import { dropAdult } from '../collect/safety';
import { key } from '../core/store';
import { toRecord, type PostRecord } from '../core/post-record';
import { cut } from '../core/text';
import { WINDOW_DAYS, withinWindow } from './character-native';

/**
 * 밈 발굴 — **따라 하는 포맷의 이름**을 찾는다. 캐릭터 축과 같은 2단계다.
 *
 *   1) 씨앗 수집 → 캡션과 **썸네일 자막**에서 LLM 이 포맷 이름을 제안
 *   2) 그 이름으로 **다시 검색** → 이름이 캡션에 실제로 있는 계정을 코드가 센다
 *   3) 계정 MIN_MEME_AUTHORS 곳 이상이면 후보
 *
 * ── 왜 이 모양인가 (2026-09-18~19 에 세 번 틀리고 나온 답) ──────────
 *
 * **"같은 문구를 3계정 이상이 썼나"로는 안 된다.** 우리 수집은 계정당 1.03건이라
 * 그 기준이 구조적으로 안 채워진다. 실제로 캡션 n-gram 0건 · 사운드 0건 ·
 * 썸네일 자막 0건이 나왔다. 그런데 **같은 자료 자막에는 `배드챌린지`·`쇼츠 중독 테스트`가
 * 버젓이 있었다.** 없던 게 아니라 세는 방법이 못 세고 있었다.
 *
 * 그래서 문구를 세는 대신 **이름을 뽑아 다시 검색한다.** 우리 표본이 얕아도
 * 플랫폼 전체에는 그 이름으로 찍은 영상이 쌓여 있다. 재검색이 그걸 가져온다.
 *
 * **LLM 의 confidence 로 거르지 않는다.** 2026-09-19 실측 —
 *   confidence 0.90 `쇼츠 중독 테스트` →  0계정
 *   confidence 0.50 `기침챌린지`       → 14계정
 *   confidence 0.30 `유행 막차타기`     →  7계정
 * 확신은 "이름이 분명한가"를 잰 것이지 "남들이 따라 하는가"를 못 잰다.
 * **재검색이 유일한 필터다.** 1단계는 느슨하게 다 제안받는다.
 *
 * **검색 계정 수가 아니라 '이름 대조를 통과한' 계정 수를 쓴다.** 검색은 느슨해서
 * 이름과 무관한 것도 준다 — `썬키스 챌린지` 는 20계정이 나왔는데 이름 대조는 0이었다.
 *
 * n-gram(`phrases.ts`)은 지우지 않고 **보조**로 남겼다. `phrasesFrom()` 으로 언제든
 * 같은 원본에 다시 돌릴 수 있다. 문구가 실제로 겹치는 자료가 들어오면 그때 쓴다.
 */

/** 밈 검색어. 캐릭터 세트와 한 개도 겹치지 않아야 한다 — 겹치면 반향으로 되돌아온다. */
const MEME_QUERIES = ['챌린지', '요즘유행', '밈', '이거뭐야', '따라하기'];

/**
 * 후보로 세울 문턱 — 이름 대조를 통과한 **서로 다른 계정 수**.
 *
 * 캐릭터는 `MIN_AUTHORS=1` 이다. 개인 창작자 한 명이 자기 캐릭터를 올린 것도
 * 발굴 대상이기 때문이다. **밈은 반대다** — 여럿이 따라 하는 것이 정의라 1이면
 * 아무 뜻이 없다. 5 는 한 번에 20건 받는 검색에서 너무 빡빡하다. 그래서 3이다.
 */
export const MIN_MEME_AUTHORS = 3;

/** 재검색할 이름 수의 상한. 이름 하나에 1콜이라 여기가 곧 비용이다. */
export const MAX_RESEARCH = 30;
/** 표에 올릴 후보 수. */
export const MAX_MEMES = 16;

const PLATFORMS: Platform[] = ['instagram', 'x', 'tiktok'];

interface SearchHit {
  name: string;
  kind: FormatKind;
  /** 같은 것으로 묶인 다른 표기. 재검색 대조와 화면 검색이 함께 쓴다. */
  aliases?: string[];
  /** 합치지는 않았지만 같은 트렌드에서 갈라진 것. */
  related?: string[];
  /** 이름이 캡션에 실제로 있던 것만. 검색이 준 전부가 아니다. */
  posts: Post[];
  /** 검색이 준 건수 — 이름 대조와 얼마나 벌어지는지 보면 이름의 힘이 보인다. */
  searched: number;
}

interface MemeRaw {
  posts: Post[];
  /** sourceId → 썸네일 자막. 포맷 이름이 여기서 많이 나온다. */
  ocr: Record<string, string>;
  drafts: FormatDraft[];
  searches: SearchHit[];
  summaries?: PostSummary[];
  /** 안전 판정 3단. 문턱을 넘은 것만 묻는다 — 표에 안 오를 것을 판정해 봐야 버린다. */
  safety?: SafetyVerdict[];
  queries: string[];
  ok: { platform: string; query: string; count: number }[];
  failed: { platform: string; query: string; reason: string }[];
  calls: number;
  usage?: { input: number; output: number };
}

const compact = (s: string): string =>
  s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/** 저장된 원본 → 문턱을 넘은 밈. 순수 함수라 스냅샷에 몇 번이든 다시 돌린다. */
export function memesFrom(raw: unknown, runAt: string): SearchHit[] {
  const r = (raw ?? {}) as Partial<MemeRaw>;
  return (r.searches ?? [])
    .map((s) => ({ ...s, posts: dropAdult(withinWindow(s.posts ?? [], runAt)).kept }))
    .filter((s) => new Set(s.posts.map((p) => p.authorId || p.authorName)).size >= MIN_MEME_AUTHORS)
    .sort((a, b) => {
      const ac = new Set(a.posts.map((p) => p.authorId)).size;
      const bc = new Set(b.posts.map((p) => p.authorId)).size;
      return bc - ac;
    });
}

/** 보조 축 — 같은 원본에 n-gram 을 돌린다. 후보를 만들지 않는다. */
export function phrasesFrom(raw: unknown, runAt: string): PhraseReport {
  const r = (raw ?? {}) as Partial<MemeRaw>;
  const posts = dropAdult(withinWindow(r.posts ?? [], runAt)).kept.map((p) => {
    const t = r.ocr?.[p.sourceId];
    return t ? { ...p, text: `${p.text} ${t}` } : p;
  });
  return countPhrases(posts, { queries: r.queries ?? MEME_QUERIES, names: [] });
}

export const memeNativeDiscovery: Discovery = {
  id: 'meme-native',
  name: '밈 발굴',
  description:
    '인스타·X·틱톡에서 따라 하는 포맷의 이름을 찾습니다. 캡션과 썸네일 자막에서 이름을 뽑고, ' +
    `그 이름으로 다시 검색해 서로 다른 계정 ${MIN_MEME_AUTHORS}곳 이상이 실제로 하는 것만 세웁니다.`,
  role: 'produces',
  unit: 'topic',
  keyEnv: 'TIKHUB_KEY',
  inputs: [
    {
      name: 'seed',
      label: '추가 검색어 (선택)',
      type: 'text',
      help: `적으면 맨 앞에 붙고 세트의 마지막 하나가 밀려납니다. 기본 세트: ${MEME_QUERIES.join(' · ')}`,
    },
  ],

  async run(input, ctx): Promise<MemeRaw> {
    const seed = (input.seed ?? '').trim();
    const queries = (seed ? [seed, ...MEME_QUERIES] : MEME_QUERIES).slice(0, 5);
    const empty: MemeRaw = { posts: [], ocr: {}, drafts: [], searches: [], queries, ok: [], failed: [], calls: 0 };
    if (ctx.mock || !hasTikHub()) return empty;

    // 1단계 — 씨앗 수집
    const report = await collect(queries, PLATFORMS, 20);
    if (!report.posts.length) return { ...empty, ok: report.ok, failed: report.failed, calls: report.calls };
    const safe = dropAdult(report.posts);
    const fresh = withinWindow(safe.kept, ctx.runAt);

    // 썸네일 자막. 포맷 이름은 캡션보다 자막에 있는 경우가 많다 — 만든 사람이 제목처럼 박는다.
    const ocr = await readThumbText(fresh);

    // 2단계 — 이름 제안. **confidence 로 거르지 않는다.** 재검색이 유일한 필터다.
    const named = await proposeFormats(fresh, ocr);
    const verified = verifyFormats(fresh, ocr, named.drafts);

    /*
     * 2.5단계 — 같은 것끼리 묶기. **자르기(MAX_RESEARCH) 앞에 둔다.**
     * 뒤에 두면 상한 서른 자리를 중복이 나눠 먹는다. `BAD 챌린지` 와 `배드 챌린지` 가
     * 각각 한 자리씩 쓰고 재검색도 두 번 나갔다 (2026-09-22 회차에서 네 쌍이 그랬다).
     */
    /*
     * 표에 이미 있는 이름도 같이 묻는다. 중복은 회차 안이 아니라 **회차를 건너뛰며** 생긴다 —
     * `BAD 챌린지` 와 `배드 챌린지` 는 서로 다른 회차가 냈다. 회차 안만 보면 안 묶인다.
     */
    const settled = (await listCandidates())
      .filter((c) => c.origin.discoveryId === 'meme-native' && c.lifecycle !== 'archived')
      .map((c) => c.subject);
    const freshNames = new Set(verified.map((v) => v.draft.name));
    const groups = await groupNames([
      ...verified.map((v) => ({ name: v.draft.name, hint: v.draft.why })),
      ...settled.filter((s) => !freshNames.has(s)).map((s) => ({ name: s, existing: true })),
    ]);
    const byName = new Map(verified.map((v) => [v.draft.name, v]));
    /*
     * 이번 회차가 낸 이름이 하나도 없는 그룹은 건너뛴다 — 표에만 있던 것이라 다시 살 이유가
     * 없다. 대표가 표에 있던 이름이면 그 이름으로 재검색해서 **기존 줄에 붙게** 한다.
     */
    const targets = groups.groups
      .map((g) => {
        const own = [g.canonical, ...g.aliases].find((n) => byName.has(n));
        return own ? { group: g, v: byName.get(own)! } : null;
      })
      .filter((t): t is { group: NameGroup; v: (typeof verified)[number] } => t !== null)
      .slice(0, MAX_RESEARCH);

    // 3단계 — 이름으로 다시 검색. 이름이 캡션에 실제로 있는 것만 센다.
    const searches: SearchHit[] = [];
    let calls = report.calls;
    for (const { group, v } of targets) {
      /*
       * **틱톡과 유튜브 둘 다 찾는다.**
       *
       * 틱톡만 보던 때는 씨앗을 인스타·X·틱톡 세 곳에서 모아 놓고 근거는 전부 틱톡에서
       * 나왔다 — 밈 후보 27건의 근거 176건이 한 곳이었다. 그리고 틱톡 썸네일은 서명
       * 주소라 며칠이면 전멸한다. 09-22 회차 직후 살아 있던 표본 12장이 이튿날 0장이 됐다.
       * **유튜브 썸네일은 만료되지 않는다** — 이미지가 남으려면 여기가 필요하다.
       *
       * 한쪽이 죽어도 다른 쪽은 살린다. 둘 다 죽을 때만 그 이름을 건너뛴다.
       *
       * 유튜브 검색은 일일 할당량을 쓴다 — search 100 + videos.list 1 = 이름당 101 단위.
       * 기본 할당량 10,000 이면 이름 서른 개짜리 회차가 3,030 이다. 하루 세 번까지는
       * 캐릭터 회차(검색어당 101 × 5)를 더해도 남는다. 넘으면 그 이름만 조용히 비고,
       * 틱톡 결과는 그대로 남는다.
       */
      let found: Post[] = [];
      let reached = false;
      try {
        found = await searchTikTok(group.canonical, 20);
        calls += 1;
        reached = true;
      } catch {
        /* 틱톡이 죽어도 유튜브는 해 본다 */
      }
      if (hasYouTube()) {
        try {
          const videos = await searchVideos(group.canonical, { max: 20, withinDays: WINDOW_DAYS });
          found = [...found, ...videos.map(asPost)];
          reached = true;
        } catch {
          /* 유튜브가 죽어도 틱톡 결과는 살린다 */
        }
      }
      if (!reached) continue; // 한 이름이 죽어도 나머지는 계속한다
      /*
       * 대조는 **별칭까지 본다.** 대표 이름으로 검색해도 캡션에는 다른 표기가 적혀 있다 —
       * `배드 챌린지` 로 찍은 영상의 캡션에 `BAD` 만 있으면 대표 이름만 보던 때는 버려졌다.
       */
      const keys = [group.canonical, ...group.aliases].map(compact).filter((k) => k.length >= 2);
      searches.push({
        name: group.canonical,
        kind: v.draft.kind,
        ...(group.aliases.length ? { aliases: group.aliases } : {}),
        ...(group.related.length ? { related: group.related } : {}),
        searched: found.length,
        posts: found.filter((p) => {
          const text = compact(p.text);
          return keys.some((k) => text.includes(k));
        }),
      });
    }

    // 본문 요약 — 재검색으로 받은 캡션을 묶어 "무슨 내용인가"를 만든다.
    const picked = searches.filter(
      (s) => new Set(s.posts.map((p) => p.authorId || p.authorName)).size >= MIN_MEME_AUTHORS,
    );
    const summed = picked.length
      ? await summarizePosts(picked.map((s) => ({ name: s.name, posts: s.posts })))
      : { summaries: [], usage: { input: 0, output: 0 } };

    /*
     * 안전 판정. 이 판정기는 사람이 따라 하는 것을 찾으므로 **따라 하면 안 되는 것**도
     * 같이 올라온다. 첫 회차 1위가 사람이 죽은 폭력 유행(`야차룰`)이었다.
     */
    const judged = picked.length
      ? await judgeMemeSafety(picked.map((s) => ({ name: s.name, posts: s.posts })))
      : { verdicts: [], usage: { input: 0, output: 0 } };

    return {
      posts: safe.kept,
      ocr: Object.fromEntries(ocr),
      drafts: named.drafts,
      searches,
      summaries: summed.summaries,
      safety: judged.verdicts,
      queries,
      ok: report.ok,
      failed: report.failed,
      calls,
      usage: {
        input: groups.usage.input + named.usage.input + summed.usage.input + judged.usage.input,
        output: groups.usage.output + named.usage.output + summed.usage.output + judged.usage.output,
      },
    };
  },

  normalize(raw, ctx): Candidate[] {
    const r = (raw ?? {}) as Partial<MemeRaw>;
    const sumByName = new Map((r.summaries ?? []).map((s) => [key(s.name), s.summary.trim()]));
    const safeByName = new Map((r.safety ?? []).map((s) => [key(s.name), s]));

    return memesFrom(raw, ctx.runAt)
      .slice(0, MAX_MEMES)
      .map((m): Candidate => {
        const accounts = [...new Set(m.posts.map((p) => p.authorId || p.authorName))];
        const evidence: Evidence[] = m.posts
          .filter((p) => p.url)
          .slice(0, 8)
          .map((p) => {
            const body = p.text.replace(/\s+/g, ' ').trim();
            const title = cut(body, 80) || `${p.authorName} 게시물`;
            return {
              source: p.platform,
              title,
              excerpt: body.length > title.length ? body : undefined,
              url: p.url,
              note: p.authorName ? `계정 ${p.authorName}` : undefined,
              metric: p.views ? `조회 ${p.views.toLocaleString('ko-KR')}` : undefined,
            };
          });

        const summary = sumByName.get(key(m.name));
        const sf = safeByName.get(key(m.name));
        return {
          id: `meme:${key(m.name)}`,
          unit: 'topic',
          // 이름이 그대로 제목이 된다. 사운드 축에서 겪은 제목 문제(오리지널 사운드 - 𝒦₊⊹)가
          // 여기서는 없다 — `기침챌린지` 는 카드뉴스 주제로 그대로 쓴다.
          subject: m.name,
          // 묶인 표기를 후보에 싣는다. 화면 검색이 별칭까지 훑으므로 'BAD' 로도 찾힌다.
          ...(m.aliases?.length ? { aliases: m.aliases } : {}),
          verdict: `${accounts.length}개 계정이 따라 함`,
          // why 는 비운다. 이 판정기는 "왜 뜨는지"를 묻지 않는다 — 계약에서 칸이 빠진다.
          why: '',
          ...(summary ? { summary } : {}),
          // 판정이 없으면 칸을 만들지 않는다. 옛 회차에는 이 경로가 없었다.
          ...(sf ? { safety: { level: sf.level, reason: sf.reason, evidence: sf.evidence } } : {}),
          grounded: accounts.length >= MIN_MEME_AUTHORS,
          momentum: {
            accounts: accounts.length,
            platforms: [...new Set(m.posts.map((p) => p.platform))],
            views: m.posts.reduce((s, p) => s + (p.views || 0), 0),
            extra: {
              유형: m.kind,
              // 검색이 준 것과 이름 대조를 통과한 것의 차이. 벌어지면 이름이 약한 것이다.
              이름대조: `${m.posts.length}/${m.searched}`,
              확인된자리: '재검색 캡션',
              ...(m.aliases?.length ? { 같은이름: m.aliases.join(' · ') } : {}),
              ...(m.related?.length ? { 갈라진것: m.related.join(' · ') } : {}),
            },
          },
          evidence,
          // 포맷 이름에는 권리 귀속을 매기지 않는다. 판정하지 않은 것을 unknown 으로 둔다.
          rights: { basis: 'none', ownership: 'unknown' },
          hint: {},
          review: 'pending',
          lifecycle: 'active',
          origin: { discoveryId: 'meme-native', runId: ctx.runId, runAt: ctx.runAt },
          raw: { accounts: accounts.length, kind: m.kind, searched: m.searched },
        };
      });
  },

  /** 게시물 레코드 — 재검색으로 받은 영상들. 계약의 images(썸네일)와 시간축이 여기서 나온다. */
  records(raw, ctx, candidates): PostRecord[] {
    const idOf = new Map(candidates.map((c) => [key(c.subject), c.id]));
    const out: PostRecord[] = [];
    for (const m of memesFrom(raw, ctx.runAt)) {
      const candidateId = idOf.get(key(m.name));
      if (!candidateId) continue;
      for (const post of m.posts) {
        const rec = toRecord(post, candidateId, {
          runId: ctx.runId,
          runAt: ctx.runAt,
          discoveryId: 'meme-native',
        });
        if (rec) out.push(rec);
      }
    }
    return out;
  },
};
