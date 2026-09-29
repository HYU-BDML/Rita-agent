/**
 * TikHub — 인스타·X·틱톡. 유료(호출당 과금)라 부르는 횟수를 설계에서 줄인다.
 *
 * 플랫폼마다 이름이 사는 곳이 다르다. 하나의 정규식으로 처리하면 안 된다.
 * (필드 위치는 기존 Dify norm 노드가 정리해 둔 그대로다.)
 *
 *   틱톡   태그: text_extra[].hashtag_name      계정명: author.nickname
 *   인스타 태그: caption.hashtags[]             계정명: user.full_name
 *   X      태그: entities.hashtags[].text       계정명: user_info.name
 *
 * 특히 '계정 표시명'이 곧 캐릭터명인 경우가 개인 창작 캐릭터의 전형이다.
 * 해시태그만 보면 이 계열을 통째로 놓친다.
 */

import { cut } from '../core/text';

const BASE = 'https://api.tikhub.io/api/v1';

/** TikHub 가 긁어 오는 곳. `collect()` 가 받는 값이다. */
export type Platform = 'instagram' | 'x' | 'tiktok';

/**
 * 게시물에 붙는 플랫폼 표시. **수집원보다 넓다.**
 * 유튜브는 TikHub 가 아니라 YouTube API 로, 씨앗이 아니라 재검색으로 들어온다.
 */
export type PostPlatform = Platform | 'youtube';

export interface Post {
  sourceId: string;
  platform: PostPlatform;
  authorName: string;
  authorId: string;
  tags: string[];
  title: string;
  text: string;
  views: number;
  reactions: number;
  followers: number;
  url: string;
  postedAt: string | null;
  /**
   * 게시물 썸네일. 수집이 이미 받고 있던 값인데 매핑에서 버려지고 있었다 (지시서 P2).
   *
   * 세 플랫폼 모두 원본 응답으로 칸을 확인하고 채운다(틱톡 09-16 · 인스타/X 09-17).
   * **게시물 이미지만 담는다 — 작성자 아바타를 담지 않는다.** 둘 다 이미지 URL 이라
   * 훑어서 고르면 섞인다. 아바타가 들어가면 카드에 엉뚱한 얼굴이 실린다.
   */
  thumbnail?: string;
  /**
   * 사운드 (2026-09-19, 밈 축). **틱톡만 채워진다** — 인스타는 검색 응답에
   * `clips_metadata.original_sound_info.audio_id` 가 오지만 사용량이 늘 null 이고
   * 12건 중 11건이 계정마다 제각각인 `Original audio` 라 셀 것이 없었다.
   *
   * 이 네 칸이 밈 축의 재료다. 캡션 n-gram 으로는 밈이 안 잡혔다 —
   * 같은 사운드에 각자 다른 말을 얹는 것이 밈이라 캡션에는 공통이 없다.
   */
  sound?: PostSound;
}

export interface PostSound {
  /**
   * **`id_str` 을 쓴다. 숫자로 읽으면 안 된다.**
   * 틱톡 사운드 id 는 19자리라 JSON 숫자(float64)로 파싱하면 끝자리가 뭉개진다.
   * 2026-09-19 에 `…891000` 으로 깨진 id 로 조회해 빈 배열을 받았다.
   */
  id: string;
  title: string;
  /**
   * 그 사운드를 쓴 영상 수. **플랫폼이 세어 준 전역 카운터다.**
   * 우리 표본 안의 반복이 아니라서 회차가 바뀌어도 같은 자로 잰다 —
   * `momentum.views` 를 회차 비교에서 껐던 이유(표본이 바뀌면 값이 갈린다)가
   * 이 값에는 없다.
   */
  userCount: number;
  /** 창작자 본인 오디오인가. true 면 남이 가져다 쓰는 사운드가 아니다. */
  isOriginal: boolean;
}

export function hasTikHub(): boolean {
  return Boolean(process.env.TIKHUB_KEY?.trim());
}

const TAG_RE = /#([0-9A-Za-z가-힣ぁ-んァ-ヶ一-龥_]{2,24})/g;

const int = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
/** X 본문에는 &lt; &amp; 가 그대로 온다. 화면과 원고에 그대로 나가면 안 된다. */
function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');
}

const str = (v: unknown): string => (v == null ? '' : decodeEntities(String(v)));

function ts(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return new Date(v < 1e11 ? v * 1000 : v).toISOString();
  const n = Number(v);
  if (Number.isFinite(n) && n > 1e8) return new Date(n < 1e11 ? n * 1000 : n).toISOString();
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

async function call(path: string, params: Record<string, string>, timeoutMs = 25_000): Promise<any> {
  const key = process.env.TIKHUB_KEY?.trim();
  if (!key) throw new Error('TIKHUB_KEY 가 없습니다.');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}?${new URLSearchParams(params)}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`TikHub ${res.status}: ${text.slice(0, 200)}`);
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 목록 위치는 엔드포인트마다 다르고, 실제 응답을 찍어 확인한 경로만 쓴다.
 *
 * 전에는 배열이 나올 때까지 트리를 훑는 범용 탐색을 썼다. 그러면 목록이 비었을 때
 * 엉뚱한 중첩 배열(text_extra 같은)을 집어 와서 조용히 쓰레기를 만든다.
 * 경로를 못 찾으면 빈 배열을 주는 편이 낫다.
 */
function at(root: any, path: string): any[] {
  let node = root;
  for (const seg of path.split('.')) {
    if (node == null) return [];
    node = node[seg];
  }
  return Array.isArray(node) ? node : [];
}

function firstList(root: any, paths: string[]): any[] {
  for (const p of paths) {
    const v = at(root, p);
    if (v.length) return v;
  }
  return [];
}

function tagsFrom(text: string, explicit: unknown[]): string[] {
  const out = new Set<string>();
  for (const t of explicit) {
    const s = typeof t === 'string' ? t : str((t as any)?.hashtag_name ?? (t as any)?.text ?? (t as any)?.name);
    if (s) out.add(s.replace(/^#/, ''));
  }
  for (const m of text.matchAll(TAG_RE)) out.add(m[1]);
  return [...out].slice(0, 12);
}

export async function searchInstagram(query: string, limit = 20): Promise<Post[]> {
  const raw = await call('/instagram/v2/search_reels', { keyword: query, count: String(limit) });
  // 실제 경로는 data.data.items 다 (data 가 두 겹).
  const list = firstList(raw, ['data.data.items', 'data.items', 'data.reels', 'data']);
  return list.slice(0, limit).map((it: any): Post => {
    const node = it?.media ?? it?.node ?? it;
    const user = node?.user ?? node?.owner ?? {};
    const caption = node?.caption ?? {};
    const text = str(caption?.text ?? node?.caption_text);
    const code = str(node?.code ?? node?.shortcode);
    return {
      sourceId: `ig:${str(node?.id ?? code)}`,
      platform: 'instagram',
      authorName: str(user?.full_name),
      authorId: str(user?.username),
      tags: tagsFrom(text, caption?.hashtags ?? []),
      title: '',
      text: cut(text, 400),
      views: int(node?.play_count ?? node?.view_count),
      reactions: int(node?.like_count),
      followers: int(user?.follower_count),
      url: code ? `https://www.instagram.com/reel/${code}/` : '',
      postedAt: ts(node?.taken_at),
      // 2026-09-17 원본으로 확인. thumbnail_url 이 12건 전원에 있었다.
      // profile_pic_url 은 작성자 아바타다 — 같은 CDN 이라 헷갈리기 쉽다. 쓰지 않는다.
      thumbnail:
        str(node?.thumbnail_url) ||
        str(node?.image_versions?.items?.[0]?.url) ||
        undefined,
    };
  });
}

/** X 응답은 평평하다 — legacy 래퍼가 없고 tweet_id·screen_name·views 가 최상위에 있다. */
export async function searchX(query: string, limit = 20): Promise<Post[]> {
  const raw = await call('/twitter/web/fetch_search_timeline', { keyword: query, search_type: 'Top' });
  const list = firstList(raw, ['data.timeline', 'data.tweets', 'data']);
  return list
    .filter((t: any) => t?.type !== 'user' && (t?.tweet_id || t?.text))
    .slice(0, limit)
    .map((t: any): Post => {
      const user = t?.user_info ?? {};
      const text = str(t?.text ?? t?.full_text);
      const id = str(t?.tweet_id);
      const handle = str(t?.screen_name ?? user?.screen_name);
      return {
        sourceId: `x:${id}`,
        platform: 'x',
        authorName: str(user?.name),
        authorId: handle,
        tags: tagsFrom(text, t?.entities?.hashtags ?? []),
        title: '',
        text: cut(text, 400),
        views: int(t?.views),
        reactions: int(t?.favorites),
        followers: int(user?.followers_count),
        url: handle && id ? `https://x.com/${handle}/status/${id}` : '',
        postedAt: ts(t?.created_at),
        // 2026-09-17 원본으로 확인. entities.media 가 비고 media.video 에만 있는 건이 있어 둘 다 본다.
        // user_info.avatar 는 작성자 얼굴이다. 쓰지 않는다.
        thumbnail: xThumb(t),
      };
    });
}

/**
 * X 게시물의 이미지. 20건 중 1건은 entities.media 가 비고 media.video 에만 있었다.
 * 영상이면 썸네일(amplify_video_thumb), 사진이면 사진 자체가 온다.
 */
function xThumb(t: any): string | undefined {
  const m = t?.media ?? {};
  const first =
    t?.entities?.media?.[0] ??
    m?.photo?.[0] ??
    m?.video?.[0] ??
    m?.animated_gif?.[0];
  return str(first?.media_url_https ?? first?.media_url) || undefined;
}

/** 틱톡은 aweme_list 가 비고 search_item_list[].aweme_info 에 들어오는 경우가 있다. 둘 다 본다. */
/**
 * 검색 결과를 어느 지역으로 볼 것인가.
 *
 * 2026-09-19 까지 안 넘기고 있었다. 넘겨 보니 틱톡 한글 비율이 **42% → 100%** 가 됐다
 * (09-19 회차 99건 중 42건 → 시험 15건 중 15건). 같은 `region` 이 `web/fetch_home_feed`
 * 에서는 무시됐는데 검색에서는 먹는다 — 엔드포인트마다 다르다.
 */
const REGION = 'KR';

/**
 * 며칠 이내에 올라온 것만 받을까.
 *
 * **검색이 1년 넘은 영상을 끌어온다.** 2026-09-18 회차에서 "픽셀 캐릭터 만들기"를
 * 계정 6곳이 따라 한 것이 잡혔는데 전부 **2025년 7월** 영상이었다. 작년 유행이
 * 올해 표에 오를 뻔했고, `withinWindow`(30일)가 정규화 단계에서 걸러 주고 있었다 —
 * 즉 **수집 칸을 옛 영상에 낭비하고 있었다.** 수집 단계에서 미리 자른다.
 *
 * `WINDOW_DAYS`(character-native)와 같은 값이다. 한쪽만 바꾸면 수집은 했는데
 * 정규화가 버리거나, 그 반대가 된다. 2026-09-19 실측: 20건 전부 4~29일 이내.
 */
const PUBLISH_DAYS = '30';

export async function searchTikTok(query: string, limit = 20): Promise<Post[]> {
  const raw = await call('/tiktok/app/v3/fetch_video_search_result', {
    keyword: query,
    count: String(limit),
    region: REGION,
    publish_time: PUBLISH_DAYS,
  });
  const items = firstList(raw, ['data.search_item_list', 'data.aweme_list', 'data.item_list']);
  return items.slice(0, limit).map((it: any): Post => {
    const v = it?.aweme_info ?? it?.item ?? it;
    const author = v?.author ?? {};
    const text = str(v?.desc);
    const id = str(v?.aweme_id ?? v?.id);
    const handle = str(author?.unique_id);
    return {
      sourceId: `tt:${id}`,
      platform: 'tiktok',
      authorName: str(author?.nickname),
      authorId: handle,
      tags: tagsFrom(text, v?.text_extra ?? []),
      title: '',
      text: cut(text, 400),
      views: int(v?.statistics?.play_count),
      reactions: int(v?.statistics?.digg_count),
      followers: int(author?.follower_count),
      url: handle && id ? `https://www.tiktok.com/@${handle}/video/${id}` : '',
      postedAt: ts(v?.create_time),
      // 2026-09-16 원본 1건으로 확인한 자리다. cover 가 없으면 origin_cover 가 온다.
      thumbnail:
        str(v?.video?.cover?.url_list?.[0]) ||
        str(v?.video?.origin_cover?.url_list?.[0]) ||
        undefined,
      sound: soundOf(v),
    };
  });
}

/**
 * 영상에 붙어 온 사운드. 없으면 칸을 만들지 않는다 — `thumbnail` 과 같은 규칙이다.
 * 빈 id 를 넣으면 나중에 그것으로 조회해 빈 배열을 받는다.
 */
function soundOf(v: any): PostSound | undefined {
  const m = v?.added_sound_music_info ?? v?.music;
  // id_str 이 없으면 만들지 않는다. 숫자 id 로 대신하지 않는다 — 뭉개진 값이 들어간다.
  const id = str(m?.id_str);
  if (!id) return undefined;
  return {
    id,
    title: str(m?.title),
    userCount: int(m?.user_count),
    isOriginal: Boolean(m?.is_original_sound ?? m?.is_original),
  };
}

/**
 * 한 사운드를 쓴 영상 목록. **검색어가 없다** — 사운드 id 하나로 깊게 판다.
 *
 * 밈 축의 깊이가 여기서 나온다. 검색 수집은 계정당 1건꼴로 넓고 얕아서 같은 것이
 * 반복되는 걸 볼 수 없었는데(2026-09-18 밈 회차, 253건/243계정), 이 호출은
 * 한 사운드에 대해서만 판다 — 시험에서 영상 12건이 계정 12곳에서 나왔다.
 */
export async function videosBySound(soundId: string, limit = 20): Promise<Post[]> {
  const raw = await call('/tiktok/app/v3/fetch_music_video_list', {
    music_id: soundId,
    count: String(limit),
  });
  const items = firstList(raw, ['data.aweme_list', 'data.item_list', 'data.videos']);
  return items.slice(0, limit).map((it: any): Post => {
    const v = it?.aweme_info ?? it;
    const author = v?.author ?? {};
    const text = str(v?.desc);
    const id = str(v?.aweme_id ?? v?.id);
    const handle = str(author?.unique_id);
    return {
      sourceId: `tt:${id}`,
      platform: 'tiktok',
      authorName: str(author?.nickname),
      authorId: handle,
      tags: tagsFrom(text, v?.text_extra ?? []),
      title: '',
      text: cut(text, 400),
      views: int(v?.statistics?.play_count),
      reactions: int(v?.statistics?.digg_count),
      followers: int(author?.follower_count),
      url: handle && id ? `https://www.tiktok.com/@${handle}/video/${id}` : '',
      postedAt: ts(v?.create_time),
      thumbnail:
        str(v?.video?.cover?.url_list?.[0]) ||
        str(v?.video?.origin_cover?.url_list?.[0]) ||
        undefined,
      sound: soundOf(v),
    };
  });
}

export interface CollectReport {
  posts: Post[];
  ok: { platform: Platform; query: string; count: number }[];
  failed: { platform: Platform; query: string; reason: string }[];
  calls: number;
}

/**
 * 검색어 × 플랫폼. 유료라 호출 수를 그대로 돌려준다 — 얼마나 썼는지 보이지 않으면 안 된다.
 * 한 곳이 죽어도 나머지는 살린다.
 */
export async function collect(queries: string[], platforms: Platform[], limit = 20): Promise<CollectReport> {
  const fns = { instagram: searchInstagram, x: searchX, tiktok: searchTikTok } as const;
  const jobs: { platform: Platform; query: string }[] = [];
  for (const q of queries) for (const p of platforms) jobs.push({ platform: p, query: q });

  const settled = await Promise.allSettled(jobs.map((j) => fns[j.platform](j.query, limit)));
  const report: CollectReport = { posts: [], ok: [], failed: [], calls: jobs.length };
  const seen = new Set<string>();

  settled.forEach((r, i) => {
    const j = jobs[i];
    if (r.status === 'fulfilled') {
      // 검색어가 겹치면 같은 게시물이 여러 번 온다. 한 번만 센다.
      const fresh = r.value.filter((p) => p.sourceId && !seen.has(p.sourceId));
      for (const p of fresh) seen.add(p.sourceId);
      report.posts.push(...fresh);
      report.ok.push({ ...j, count: fresh.length });
    } else {
      report.failed.push({ ...j, reason: r.reason instanceof Error ? r.reason.message : String(r.reason) });
    }
  });
  return report;
}
