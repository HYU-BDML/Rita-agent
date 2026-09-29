/**
 * YouTube 수집. 세 워크플로우(소재 찾기·벤치마크·캐릭터)가 각자 복붙해 쓰던 체인을 한 벌로 모은다.
 * 노드 ID 까지 똑같았다 — node_ytsearch · node_ytids · node_ytvideos · node_ytchids · node_ytchan.
 *
 * 쿼터 주의: search.list 는 호출당 100 유닛, videos/channels 는 1 유닛이다.
 * 하루 기본 10,000 유닛이라 검색은 하루 100회가 상한이다. 검색을 아끼는 게 이 파일의 설계 기준.
 */

const BASE = 'https://www.googleapis.com/youtube/v3';

import type { Post } from './tikhub';

export interface Video {
  id: string;
  title: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  views: number;
  likes: number;
  comments: number;
  durationSec: number;
  url: string;
  /**
   * 썸네일. 2026-09-17 실제 응답으로 확인 — snippet.thumbnails 에 6단(default~fhd)이 온다.
   * 카드에 얹을 것이라 큰 쪽부터 고른다.
   */
  thumbnail?: string;
  /** 채널 구독자. channels.list 를 붙인 뒤에 채워진다. */
  subs?: number;
  /** 조회수 / 구독자. 채널 규모 대비 얼마나 터졌나. */
  subRatio?: number | null;
}

/**
 * 유튜브 영상을 공통 게시물 모양으로 옮긴다.
 *
 * 밈·캐릭터 회차가 유튜브를 쓰려면 뒤의 모든 단계(이름 대조·계정 수 세기·썸네일 고르기)가
 * 한 가지 모양만 보면 되게 해야 한다. 칸을 새로 만들지 않고 있는 칸에 맞춘다.
 *
 * `text` 에 제목을 넣는다. 유튜브는 캡션을 따로 안 주므로 이름 대조가 볼 것이 제목뿐이다.
 * **썸네일이 만료되지 않는 유일한 출처**라 이게 밈 축 이미지의 밑천이 된다.
 */
export function asPost(v: Video): Post {
  return {
    sourceId: `yt:${v.id}`,
    platform: 'youtube',
    authorName: v.channelTitle,
    authorId: v.channelId,
    tags: [],
    title: v.title,
    text: v.title,
    views: v.views,
    reactions: v.likes,
    followers: v.subs ?? 0,
    url: v.url,
    postedAt: v.publishedAt || null,
    thumbnail: v.thumbnail,
  };
}

export function hasYouTube(): boolean {
  return Boolean(process.env.YOUTUBE_KEY?.trim());
}

class YouTubeError extends Error {}

async function call(path: string, params: Record<string, string>, timeoutMs = 15_000): Promise<any> {
  const key = process.env.YOUTUBE_KEY?.trim();
  if (!key) throw new YouTubeError('YOUTUBE_KEY 가 없습니다.');

  const qs = new URLSearchParams({ ...params, key });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}/${path}?${qs}`, { signal: ctrl.signal });
    const json = await res.json();
    if (!res.ok) {
      const msg = json?.error?.message ?? `HTTP ${res.status}`;
      // 쿼터 초과는 흔하고 원인이 분명하므로 따로 말해 준다.
      throw new YouTubeError(/quota/i.test(msg) ? 'YouTube 하루 쿼터를 다 썼습니다. 내일 다시 되거나 할당량을 늘려야 합니다.' : msg);
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

/** ISO8601 재생시간(PT1M30S)을 초로. */
export function durationToSec(iso: string): number {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || '');
  if (!m) return 0;
  const [, d, h, mi, s] = m;
  return Number(d ?? 0) * 86400 + Number(h ?? 0) * 3600 + Number(mi ?? 0) * 60 + Number(s ?? 0);
}

/**
 * 배수 반올림. 소수 둘째 자리로 자르면 0.0034 가 0 이 되어 '구독대비 0배'로 표시된다.
 * 작은 값일수록 자릿수를 더 준다 — 잘 안 된 정도도 정보다.
 */
function round2sig(x: number): number {
  if (!Number.isFinite(x) || x <= 0) return 0;
  if (x >= 1) return Math.round(x * 100) / 100;
  if (x >= 0.1) return Math.round(x * 1000) / 1000;
  return Number(x.toPrecision(2));
}

const int = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * 검색 → 통계 → 채널까지 한 번에. 검색 1회 + 통계 1회 + 채널 1회 = 102 유닛.
 * withinDays 를 주면 최근 것만 본다.
 */
export async function searchVideos(
  query: string,
  opts: { max?: number; withinDays?: number } = {},
): Promise<Video[]> {
  const max = Math.min(50, opts.max ?? 25);
  const params: Record<string, string> = {
    part: 'snippet',
    q: query,
    type: 'video',
    maxResults: String(max),
    order: 'relevance',
    regionCode: 'KR',
    relevanceLanguage: 'ko',
  };
  if (opts.withinDays) {
    params.publishedAfter = new Date(Date.now() - opts.withinDays * 86_400_000).toISOString();
  }

  const found = await call('search', params);
  const ids: string[] = (found.items ?? [])
    .map((i: any) => i?.id?.videoId)
    .filter((x: unknown): x is string => typeof x === 'string');
  if (!ids.length) return [];

  const stats = await call('videos', {
    part: 'statistics,contentDetails,snippet',
    id: ids.join(','),
  });

  const videos: Video[] = (stats.items ?? []).map((v: any) => ({
    id: v.id,
    title: v.snippet?.title ?? '',
    channelId: v.snippet?.channelId ?? '',
    channelTitle: v.snippet?.channelTitle ?? '',
    publishedAt: v.snippet?.publishedAt ?? '',
    views: int(v.statistics?.viewCount),
    likes: int(v.statistics?.likeCount),
    comments: int(v.statistics?.commentCount),
    durationSec: durationToSec(v.contentDetails?.duration ?? ''),
    url: `https://www.youtube.com/watch?v=${v.id}`,
    thumbnail: pickThumb(v.snippet?.thumbnails),
  }));

  // 채널 구독자. 이게 있어야 '채널 규모 대비'를 말할 수 있다.
  const channelIds = [...new Set(videos.map((v) => v.channelId).filter(Boolean))];
  if (channelIds.length) {
    const chans = await call('channels', { part: 'statistics', id: channelIds.slice(0, 50).join(',') });
    const subsById = new Map<string, number>(
      (chans.items ?? []).map((c: any) => [c.id as string, int(c.statistics?.subscriberCount)]),
    );
    for (const v of videos) {
      const s = subsById.get(v.channelId);
      v.subs = s;
      // 구독자를 숨긴 채널은 0 으로 온다. 0 으로 나누지 않고 못 잰 것으로 둔다.
      v.subRatio = s && s > 0 ? round2sig(v.views / s) : null;
    }
  }

  return videos;
}

/**
 * 썸네일 한 장을 고른다. 큰 쪽부터 — 카드에 얹을 것이라 작으면 깨진다.
 * 영상마다 있는 단이 다르다(maxres 는 없을 수 있다). 있는 것 중 가장 큰 것을 쓴다.
 *
 * **fhd 는 쓰지 않는다** (2026-09-22). API 가 칸을 주지만 그 주소는 서지 않는다 —
 * 저장된 fhddefault 229장을 확인했고 표본 40장이 전부 404 였다. 같은 영상의
 * maxresdefault 는 전부 200 이다. 있다고 준 것을 믿고 골라서 16%가 조용히 깨져 있었다.
 */
function pickThumb(t: any): string | undefined {
  for (const k of ['maxres', 'standard', 'high', 'medium', 'default']) {
    const u = t?.[k]?.url;
    if (typeof u === 'string' && u) return u;
  }
  return undefined;
}
