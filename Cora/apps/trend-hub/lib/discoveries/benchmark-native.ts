import type { Candidate, Reference } from '../core/candidate';
import type { AttachingDiscovery, RunContext } from '../core/adapters';
import { hasYouTube, searchVideos, type Video } from '../collect/youtube';
import { toRecord, type PostRecord } from '../core/post-record';

/**
 * 벤치마크 — 후보에 '어떻게 만들까'를 붙인다. Dify 를 거치지 않는다.
 *
 * 원래 워크플로우의 핵심은 '같은 채널 규모끼리 맞대는 것'이었다.
 * 구독자 500만 채널의 50만 조회와 구독자 4천 채널의 3천 조회는 같은 자리에서 비교하면 안 된다.
 * 그래서 규모대(band)로 나눈 뒤 그 안에서 잘된 것과 안 된 것을 고른다.
 *
 * 안 된 것도 같이 준다. 뭘 안 해야 하는지가 뭘 해야 하는지만큼 쓸모 있다.
 */

/** 구독자 규모대. 이 안에서만 서로 비교한다. */
function bandOf(subs: number | undefined): string | null {
  if (!subs || subs <= 0) return null;
  if (subs < 1_000) return '~1천';
  if (subs < 10_000) return '1천~1만';
  if (subs < 100_000) return '1만~10만';
  if (subs < 1_000_000) return '10만~100만';
  return '100만~';
}

const HIT = 1.0;    // 구독자 수만큼 조회가 나왔으면 잘 된 것
const MISS = 0.15;  // 구독자의 15% 도 안 봤으면 안 된 것

export interface BenchRaw {
  keyword: string;
  videos: Video[];
  error?: string;
}

export const benchmarkNativeDiscovery: AttachingDiscovery = {
  id: 'benchmark-native',
  name: '본보기 찾기',
  description:
    '같은 구독자 규모끼리 맞대어 잘된 영상과 안 된 영상을 고릅니다. Dify 를 거치지 않습니다.',
  role: 'attaches',
  unit: 'format',
  keyEnv: 'YOUTUBE_KEY',
  inputs: [{ name: 'keyword', label: '검색어', type: 'text', required: true }],

  /** 후보가 검색어를 들고 있다. 사람이 다시 타이핑하지 않는다. */
  inputsFrom(candidate) {
    const kw = (candidate.momentum.extra?.검색어 as string) || candidate.subject;
    return { keyword: String(kw) };
  },

  async run(input, ctx): Promise<BenchRaw> {
    const keyword = (input.keyword || '').trim();
    if (ctx.mock || !hasYouTube() || !keyword) {
      return { keyword, videos: [], error: keyword ? undefined : '검색어가 없습니다.' };
    }
    try {
      const videos = await searchVideos(keyword, { max: 40, withinDays: 180 });
      return { keyword, videos };
    } catch (e) {
      return { keyword, videos: [], error: e instanceof Error ? e.message : String(e) };
    }
  },

  normalize(): Candidate[] {
    return [];   // 부착기는 후보를 낳지 않는다.
  },

  /**
   * 영상 레코드 (지시서 P2). **새 호출이 없다** — attach 가 보는 바로 그 원본을 본다.
   *
   * 부착기는 후보를 낳지 않지만 **영상은 낳는다.** 후보로 요약되는 것은 references 8건뿐이고
   * 나머지 30여 편은 버려지고 있었다. 그 버려지는 것이 P5 시간축의 재료다 —
   * YouTube 는 영상에 게시일이 박혀 있어 한 번 부르면 6개월치 분포가 통째로 나온다.
   *
   * 잘된 영상만 남기지 않는다. 안 걸린 영상도 그 시점에 그 주제가 있었다는 증거다.
   */
  records(raw, ctx, candidates): PostRecord[] {
    const c = candidates[0];
    // 부착기는 후보 하나에 대해서만 돈다. 없으면 붙일 데가 없다.
    if (!c) return [];
    const r = (raw ?? {}) as Partial<BenchRaw>;

    const out: PostRecord[] = [];
    for (const v of r.videos ?? []) {
      const rec = toRecord(
        {
          sourceId: `yt:${v.id}`,
          platform: 'youtube',
          url: v.url,
          thumbnail: v.thumbnail,
          postedAt: v.publishedAt || null,
          authorName: v.channelTitle,
          authorId: v.channelId,
          views: v.views,
        },
        c.id,
        { runId: ctx.runId, runAt: ctx.runAt, discoveryId: 'benchmark-native' },
      );
      if (rec) out.push(rec);
    }
    return out;
  },

  attach(_candidate, raw) {
    const r = (raw ?? {}) as Partial<BenchRaw>;
    const videos = (r.videos ?? []).filter((v) => v.subRatio != null && bandOf(v.subs));

    // 규모대별로 모아 그 안에서만 잘된 것/안 된 것을 고른다.
    const byBand = new Map<string, Video[]>();
    for (const v of videos) {
      const b = bandOf(v.subs)!;
      const list = byBand.get(b);
      if (list) list.push(v);
      else byBand.set(b, [v]);
    }

    const refs: Reference[] = [];
    for (const [band, list] of [...byBand.entries()].sort((a, b) => b[1].length - a[1].length)) {
      // 한 규모대에 두 편 미만이면 '맞대었다'고 할 수 없다.
      if (list.length < 2) continue;
      const sorted = [...list].sort((a, b) => (b.subRatio ?? 0) - (a.subRatio ?? 0));

      const best = sorted[0];
      if ((best.subRatio ?? 0) >= HIT) refs.push(toRef(best, band, '잘된 쪽'));

      const worst = sorted[sorted.length - 1];
      if (worst.id !== best.id && (worst.subRatio ?? 1) <= MISS) {
        refs.push(toRef(worst, band, '안 된 쪽 — 따라 할 대상이 아님'));
      }
      if (refs.length >= 8) break;
    }

    // 규모대 안에서 아무것도 안 걸리면 전체에서 가장 잘 터진 것만이라도 준다.
    if (!refs.length && videos.length) {
      const top = [...videos].sort((a, b) => (b.subRatio ?? 0) - (a.subRatio ?? 0)).slice(0, 3);
      for (const v of top) refs.push(toRef(v, bandOf(v.subs) ?? '', '참고'));
    }

    return { references: refs };
  },
};

/** 12031초를 '200.5분'이라 쓰면 얼마나 긴지 안 읽힌다. */
function humanDuration(sec: number): string {
  if (sec <= 0) return '';
  if (sec < 60) return `${sec}초`;
  if (sec < 3600) return `${Math.round(sec / 60)}분`;
  return `${Math.round(sec / 360) / 10}시간`;
}

function toRef(v: Video, band: string, takeaway: string): Reference {
  return {
    title: v.title,
    channel: v.channelTitle,
    url: v.url,
    subs: v.subs ?? null,
    views: v.views,
    subRatio: v.subRatio ?? null,
    durationSec: v.durationSec,
    takeaway: [takeaway, `구독 ${band}`, humanDuration(v.durationSec)].filter(Boolean).join(' · '),
  };
}
