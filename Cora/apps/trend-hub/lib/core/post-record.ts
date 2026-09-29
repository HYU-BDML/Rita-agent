/**
 * 게시물·영상 레코드 — 후보 아래 접어 넣지 않고 따로 적재한다 (지시서 P2).
 *
 * 왜 따로 두나. 후보는 **요약**이라 게시물 단위 값이 그 과정에서 버려진다.
 * 그런데 그 버려진 값이 뒤에서 세 번 필요하다.
 *
 *   evidence[].url        → P3 게이트
 *   images[role=evidence] → P1 계약의 썸네일
 *   posted_at 분포        → P5 시간축
 *
 * **새 API 호출이 없다.** 수집이 이미 받아 온 값을 후보로 요약하기 전에 한 번 더 적는 것뿐이다.
 *
 * 지시서의 칸 이름과 이 파일의 대응:
 *   thumbnail_url → thumbnailUrl · account/channel → account · round_no → runId
 * 회차를 번호가 아니라 runId 로 세는 건 저장소가 이미 그렇게 세고 있어서다 (`db.runs`).
 */

/** 게시물 한 건. 어느 후보의 근거였고 어느 회차에 들어왔나까지 함께 적는다. */
export interface PostRecord {
  /** 수집기가 준 고유 id (`tt:…` · `ig:…` · `x:…` · `yt:…`). 중복 적재를 막는 열쇠. */
  id: string;
  platform: string;
  url: string;
  /**
   * 썸네일. **틱톡·유튜브만 채워진다** — 인스타·X 는 응답 원본을 아직 안 봐서
   * 칸 이름을 모른다. 지어내지 않고 비워 둔다 (`lib/collect/tikhub.ts` Post.thumbnail 주석).
   */
  thumbnailUrl?: string;
  /** 게시 시각 ISO. 모르면 null — 0 이나 오늘로 채우지 않는다. */
  postedAt: string | null;
  /** 계정 또는 채널 이름. */
  account: string;
  accountId?: string;
  /** 조회수. 안 쟀으면 null. */
  views: number | null;
  /**
   * 이 썸네일에 캐릭터가 크게 보이나 (0·1·2, 2026-09-19).
   *
   * 대표 사진을 고르는 데 쓴다. 최신순으로만 고르면 언박싱 첫 프레임의 **사람 얼굴**이
   * 큰 자리를 먹는다. 안 물어본 장은 칸이 없다 — 0(안 보임)과 다르다.
   */
  charShot?: number;

  /** 어느 후보의 근거였나. */
  candidateId: string;
  /**
   * 어느 판정기가 적었나.
   *
   * 한 후보에 레코드가 **여러 경로로** 붙는다 — 캐릭터 발굴(TikHub)과 본보기 찾기(YouTube)가
   * 같은 후보를 채운다. 다시 세울 때 후보 단위로 갈아엎으면 남의 경로가 적은 것까지 날아간다.
   * 실제로 그랬다: character-native 를 재정규화하자 attach 로 들어온 YouTube 40건이 사라졌다.
   */
  discoveryId: string;
  /** 어느 회차에 들어왔나 (지시서의 round_no). */
  runId: string;
  runAt: string;
}

/** 빈 문자열을 undefined 로. 빈 칸을 "" 로 남기면 나중에 있는 줄 알고 쓰게 된다. */
function opt(v: unknown): string | undefined {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s : undefined;
}

export interface PostLike {
  sourceId?: string;
  platform?: string;
  url?: string;
  thumbnail?: string;
  postedAt?: string | null;
  authorName?: string;
  authorId?: string;
  views?: number;
}

/**
 * 수집기 Post 하나를 레코드로 옮긴다. url 이 없으면 레코드가 아니다 — 근거로 못 쓴다.
 */
export function toRecord(
  p: PostLike,
  candidateId: string,
  run: { runId: string; runAt: string; discoveryId: string },
): PostRecord | null {
  const url = opt(p.url);
  const id = opt(p.sourceId);
  if (!url || !id) return null;
  return {
    id,
    platform: String(p.platform ?? ''),
    url,
    ...(opt(p.thumbnail) ? { thumbnailUrl: opt(p.thumbnail) } : {}),
    postedAt: p.postedAt ?? null,
    account: String(p.authorName ?? ''),
    ...(opt(p.authorId) ? { accountId: opt(p.authorId) } : {}),
    views: typeof p.views === 'number' && Number.isFinite(p.views) ? p.views : null,
    candidateId,
    discoveryId: run.discoveryId,
    runId: run.runId,
    runAt: run.runAt,
  };
}
