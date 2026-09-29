import type { Candidate } from './candidate';
import type { PostRecord } from './post-record';

/**
 * 근거 카드에 들어가는 값 (`docs/WORDS.md` §19).
 *
 * 전에는 `{이름} / 계정 N곳이 따라 했습니다` 한 줄이었다. 읽어도 그게 뭔지 모른다 —
 * **데이터에 썸네일과 캡션과 조회수가 다 있는데 쓰지 않고 있었다.**
 *
 * 카드에 들어가는 모든 것이 db 에서 나온다. 요약도 의역도 생성 문장도 없다.
 * 없는 값은 **그 줄을 비운다.** 자리 표시자나 회색 박스를 두지 않는다 — 빈 상자는
 * "아직 안 불러왔나" 로 읽혀서 없는 것보다 나쁘다.
 */
export interface EvidenceCard {
  candidateId: string;
  subject: string;
  /** 원문 링크. 근거를 확인할 길이 없으면 근거가 아니다. */
  url: string;
  /** 이 소재 게시물 중 최고 조회수. 전부 없으면 `null` 이고 「최고 …」 토막을 뺀다. */
  topViews: number | null;
  /** 실제 저장된 고유 계정 수. */
  accounts: number;
  /** 조회 높은 순 썸네일 세 장까지. 0 장이면 그 줄을 안 그린다. */
  thumbs: string[];
  /** 대표 캡션. 없으면 `null` 이고 그 줄을 안 그린다. */
  caption: string | null;
}

/** 조회수를 만 단위로. 2,510,234 → `251만`. */
export function manCount(views: number): string {
  return `${Math.round(views / 10000).toLocaleString('ko-KR')}만`;
}

/**
 * 대표 캡션을 고른다.
 *
 * **소재 이름을 온전히 포함한 캡션 중 조회 최고.** 느슨하게 찾으면 관계없는 글이
 * 딸려온다 — 「틱톡 성장 챌린지」를 형태소로 쪼개 찾았더니 "2022년 뇌절 밈 모음" 과
 * "절대 잊을 수 없는 고양이들" 이 붙었다. 부분 일치도 형태소 분해도 하지 않는다.
 *
 * 공백만 무시한다. 캡션은 `#권루트챌린지` 처럼 이름을 붙여 쓰고 소재 이름은
 * `권루트챌린지` 처럼 떼어 쓰는 일이 많아서, 공백을 남기면 있는 캡션을 못 찾는다.
 */
function pickCaption(
  subject: string,
  evidence: { title?: string; url?: string }[],
  viewsByUrl: Map<string, number>,
): string | null {
  const needle = subject.replace(/\s+/g, '').toLowerCase();
  if (!needle) return null;
  const hits = evidence
    .map((e) => ({ title: String(e.title ?? '').trim(), url: String(e.url ?? '') }))
    .filter((e) => e.title && e.title.replace(/\s+/g, '').toLowerCase().includes(needle))
    .sort((a, b) => (viewsByUrl.get(b.url) ?? 0) - (viewsByUrl.get(a.url) ?? 0));
  return hits[0]?.title ?? null;
}

/**
 * 후보 하나를 근거 카드로.
 *
 * `posts` 는 그 후보의 게시물만 받는다. 캡션은 `posts` 에 없어서 `candidate.evidence[]`
 * 의 `title` 에서 온다 — 수집기가 본문을 거기 적어 두고 게시물 레코드에는 안 옮긴다.
 */
export function evidenceCard(c: Candidate, posts: PostRecord[], url: string): EvidenceCard {
  const byViews = [...posts].sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
  const top = byViews.find((p) => typeof p.views === 'number' && p.views > 0)?.views ?? null;

  const viewsByUrl = new Map<string, number>();
  for (const p of posts) if (typeof p.views === 'number') viewsByUrl.set(p.url, p.views);

  return {
    candidateId: c.id,
    subject: c.subject,
    url,
    topViews: top,
    /*
     * 저장된 고유 계정을 센다. `raw.accounts` 는 검증 전 값이라 쓰지 않는다
     * (`docs/PROMPT.md` §11) — 권루트챌린지는 raw 16 인데 실제로 저장된 계정이 31 이다.
     */
    accounts: new Set(posts.map((p) => p.accountId || p.account).filter(Boolean)).size,
    thumbs: byViews
      .map((p) => p.thumbnailUrl)
      .filter((u): u is string => Boolean(u))
      .slice(0, 3),
    caption: pickCaption(c.subject, c.evidence ?? [], viewsByUrl),
  };
}
