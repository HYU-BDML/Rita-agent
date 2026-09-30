/**
 * YouTube Data API v3 adapter for F005 (YouTube -> new content).
 * Endpoint checked 2026-09-30 against developers.google.com/youtube/v3/docs/videos/list:
 * GET https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=<id>&key=<API key>, quota 1 unit,
 * response items[] with snippet.{title,description,channelId} and contentDetails. Not confirmed on that page fetch and
 * therefore marked 확인 필요: snippet.channelTitle and the ISO 8601 form of contentDetails.duration (both are parsed
 * defensively and missing values become empty / 0).
 * A plain API key cannot download captions (captions.download needs OAuth as the video owner), so the material is
 * title + description + a transcript the user pastes.
 */
const ID = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtu.be']);
export type YouTubeVideo = { id: string; title: string; description: string; channel: string; channelId: string; seconds: number; url: string };

export function parseYouTubeId(input: string): string {
  let u: URL; try { u = new URL(String(input).trim()); } catch { throw new Error('YouTube 주소 형식을 확인해 주세요.'); }
  if (!['https:', 'http:'].includes(u.protocol) || !HOSTS.has(u.hostname.toLowerCase()) || u.username || u.password) throw new Error('youtube.com 또는 youtu.be 주소만 사용할 수 있습니다.');
  const parts = u.pathname.split('/').filter(Boolean);
  let id: string | undefined;
  if (u.hostname.toLowerCase().endsWith('youtu.be')) id = parts[0];
  else if (parts[0] === 'watch') id = u.searchParams.get('v') ?? undefined;
  else if (parts[0] === 'shorts') id = parts[1];
  if (!id || !ID.test(id)) throw new Error('영상 ID(11자)를 찾지 못했습니다. watch?v=, youtu.be/, /shorts/ 형식의 주소를 붙여 넣어 주세요.');
  return id;
}
/** ISO 8601 duration (PT1H2M3S, P1DT2H) to seconds; anything unparsable is 0. */
export function parseDuration(iso: unknown): number {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(iso ?? '')); if (!m) return 0;
  return Number(m[1] || 0) * 86400 + Number(m[2] || 0) * 3600 + Number(m[3] || 0) * 60 + Number(m[4] || 0);
}

export class YouTubeAdapter {
  constructor(private key: string, private transport: typeof fetch = fetch, private host = 'https://www.googleapis.com') {
    if (!key) throw new Error('YouTube API 키(YOUTUBE_API_KEY)가 설정되지 않았습니다. 제목과 설명을 직접 붙여 넣어 주세요.');
  }
  async video(id: string): Promise<YouTubeVideo> {
    if (!ID.test(id)) throw new Error('영상 ID(11자)를 확인해 주세요.');
    const url = new URL(`${this.host}/youtube/v3/videos`); url.searchParams.set('part', 'snippet,contentDetails'); url.searchParams.set('id', id); url.searchParams.set('key', this.key);
    let res: Response;
    try { res = await this.transport(url.toString(), { method: 'GET', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) }); }
    catch { throw new Error('YouTube에 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.'); }
    const data = await res.json().catch(() => ({})) as { items?: { snippet?: { title?: string; description?: string; channelTitle?: string; channelId?: string }; contentDetails?: { duration?: string } }[]; error?: { errors?: { reason?: string }[] } };
    if (!res.ok) {
      const reason = data.error?.errors?.[0]?.reason;
      if (reason === 'quotaExceeded' || reason === 'rateLimitExceeded') throw new Error('YouTube API 하루 사용량을 넘었습니다. 내일 다시 시도해 주세요.');
      if (res.status === 400 || res.status === 403) throw new Error('YouTube API 키가 거부되었습니다. 키와 API 사용 설정을 확인해 주세요.');
      throw new Error(`YouTube 요청이 실패했습니다(${res.status}).`);
    }
    const item = data.items?.[0]; if (!item?.snippet?.title) throw new Error('영상을 찾지 못했습니다. 비공개이거나 삭제된 영상일 수 있습니다.');
    return { id, title: String(item.snippet.title), description: String(item.snippet.description ?? ''), channel: String(item.snippet.channelTitle ?? ''), channelId: String(item.snippet.channelId ?? ''), seconds: parseDuration(item.contentDetails?.duration), url: `https://www.youtube.com/watch?v=${id}` };
  }
}

/** Material = title + description + optional pasted transcript. Returns which parts were present. */
export function youtubeMaterial(v: Pick<YouTubeVideo, 'title' | 'description'>, transcript = '') {
  const t = String(transcript ?? '').replace(/\r/g, '').trim(); if (t.length > 20000) throw new Error('자막 텍스트는 20,000자 이내로 붙여 넣어 주세요.');
  const parts = [v.title.trim(), v.description.replace(/\r/g, '').trim(), t].filter(Boolean);
  const text = parts.join('\n');
  return { text, hasDescription: !!v.description.trim(), hasTranscript: !!t, enough: text.length >= 80 };
}
