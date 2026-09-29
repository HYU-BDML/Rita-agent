import type { Candidate } from './candidate';
import type { PostRecord } from './post-record';

/** 목록과 상세가 함께 쓰는, 클릭 가능한 대표 이미지. */
export interface CandidateImage {
  src: string;
  href: string;
  alt: string;
}

function unique(images: CandidateImage[], limit: number): CandidateImage[] {
  const seen = new Set<string>();
  const out: CandidateImage[] = [];
  for (const image of images) {
    const key = `${image.src}\n${image.href}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(image);
    if (out.length >= limit) break;
  }
  return out;
}

/** 뉴스는 근거 순서를 존중해 처음 사진 한 장을 대표로 쓴다. */
export function newsImages(c: Candidate): CandidateImage[] {
  if (c.origin.discoveryId !== 'news') return [];
  const evidence = c.evidence.find((item) => item.thumbnailUrl);
  return evidence?.thumbnailUrl
    ? [{ src: evidence.thumbnailUrl, href: evidence.url, alt: `${c.subject} 기사 대표 사진` }]
    : [];
}

/**
 * 대표가 될 만한 순서로 세운다 — 크게 보이는 장(charShot)이 먼저, 동점이면 최신.
 *
 * 점수가 없는 장은 1 로 친다. 0(사람 얼굴)보다는 앞이고 2(캐릭터가 주인공)보다는 뒤다.
 * "안 물어봤다"를 "나쁘다"로 깎으면 아직 점수가 없는 새 회차가 통째로 뒤로 밀린다.
 */
export function bestShotFirst(posts: PostRecord[]): PostRecord[] {
  const rank = (value?: number) => (value === undefined ? 1 : value);
  return [...posts]
    .filter((post) => post.thumbnailUrl)
    .sort(
      (a, b) =>
        rank(b.charShot) - rank(a.charShot) ||
        (b.postedAt ?? '').localeCompare(a.postedAt ?? ''),
    );
}

/**
 * 캐릭터는 크게 보이는 장(charShot), 동점이면 최신 게시물 순으로 세운다.
 *
 * **한 장만 내지 않고 몇 장을 낸다.** 화면은 첫 장만 그리지만(`max`), 그 장이 죽으면
 * 다음 장이 그 자리에 들어선다 — 뒤엣것은 그리기 위한 것이 아니라 **대비책**이다.
 *
 * 한 장만 내던 때는 대비책이 없었다. 대표로 뽑힌 틱톡 주소가 만료되면 카드가 통째로
 * 비었는데, 살아 있는 유튜브 장이 뒤에 있어도 화면에 올라올 길이 없었다.
 * 2026-09-24 기준 캐릭터 후보 73건 중 2건이 그 상태였다.
 */
export function characterImages(posts: PostRecord[], subject: string): CandidateImage[] {
  const sorted = bestShotFirst(posts).map((post) => ({
    src: post.thumbnailUrl!,
    href: post.url,
    alt: `${subject} 게시물 대표 이미지`,
  }));
  return unique(sorted, 4);
}

/**
 * 유행 포맷은 실제 게시물 썸네일을 최대 세 장 보여 준다.
 * **플랫폼을 돌아가며 뽑는다** — 앞에서부터 최신순으로 자르지 않는다.
 *
 * 최신순으로만 고르면 세 장이 한 플랫폼에서 나온다. 그게 틱톡이면 며칠 뒤 세 장이
 * 한꺼번에 죽는다 — 서명 주소라 만료되기 때문이다. 유튜브 썸네일은 만료되지 않는데,
 * 방금 올라온 틱톡이 살아 있는 유튜브를 뒤로 밀어 카드가 통째로 빈다.
 * 2026-09-23 회차 직후 `헤그매전 챌린지` 가 그랬다 — 살아 있는 장 열 개가 뒤에 있었다.
 *
 * 어느 주소가 죽었는지는 서버가 모른다(눌러 봐야 안다). 그래서 **섞어서 건다** —
 * 뉴스 근거를 매체별로 돌아가며 뽑는 것과 같은 생각이다. 한 곳이 죽어도 나머지가 뜬다.
 */
export function formatImages(posts: PostRecord[], subject: string): CandidateImage[] {
  const lanes = new Map<string, PostRecord[]>();
  for (const post of posts) {
    if (!post.thumbnailUrl) continue;
    lanes.set(post.platform, [...(lanes.get(post.platform) ?? []), post]);
  }
  for (const lane of lanes.values()) {
    lane.sort((a, b) => (b.postedAt ?? '').localeCompare(a.postedAt ?? ''));
  }

  // 줄이 긴 플랫폼부터 돈다. 한 장뿐인 곳이 앞자리를 먹고 끝나지 않게.
  const ordered = [...lanes.values()].sort((a, b) => b.length - a.length);
  const picked: PostRecord[] = [];
  for (let row = 0; picked.length < 3; row += 1) {
    let added = false;
    for (const lane of ordered) {
      if (!lane[row]) continue;
      picked.push(lane[row]);
      added = true;
      if (picked.length >= 3) break;
    }
    if (!added) break;
  }

  return unique(
    picked.map((post) => ({
      src: post.thumbnailUrl!,
      href: post.url,
      alt: `${subject} 포맷 예시`,
    })),
    3,
  );
}
