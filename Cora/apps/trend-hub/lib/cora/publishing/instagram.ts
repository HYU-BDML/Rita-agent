import type { PublishObservation } from './blotato';

/**
 * Direct Instagram Platform adapter ("Instagram API with Instagram Login").
 * Contract checked 2026-09-30 against developers.facebook.com/docs/instagram-platform/content-publishing:
 * POST /<IG_ID>/media (image_url | is_carousel_item | media_type=CAROUSEL+children) → container id,
 * GET /<CONTAINER_ID>?fields=status_code (IN_PROGRESS|FINISHED|PUBLISHED|ERROR|EXPIRED),
 * POST /<IG_ID>/media_publish creation_id → media id, GET /<MEDIA_ID>?fields=permalink.
 * Images must be JPEG on a public HTTPS URL; 100 API posts per 24h; containers expire after 24h.
 *
 * Mapping to the Cora queue: submit() only creates containers (no post yet) and returns the final
 * container id as submission id. status() publishes a FINISHED container. Instagram refuses to publish
 * the same container twice, so re-polling a FINISHED container after a lost response cannot double-post.
 * A container that is already PUBLISHED without a known media id stays 'unknown' for manual check.
 * Instagram has no native scheduling here: Cora's scheduler starts submit() at the planned time.
 * Not wired to a live route: needs a user token, IG account id and public JPEG hosting.
 */
export const IG_API_VERSION = process.env.CORA_IG_API_VERSION || 'v25.0';
const ID = /^[0-9]{1,40}$/;
/** Images: 1 = single photo, 2~10 = carousel. A videoUrl (and no images) makes a Reel (media_type=REELS, checked 2026-10-03). */
export type InstagramInput = { igUserId: string; caption: string; imageUrls: string[]; videoUrl?: string };
function publicHttps(value: string, label: string) {
  let u: URL; try { u = new URL(value); } catch { throw new Error(`${label} 주소 형식 오류`); }
  if (u.protocol !== 'https:' || u.username || u.password || u.port || u.hostname === 'localhost' || u.hostname.endsWith('.local') || /^\d+\.\d+\.\d+\.\d+$/.test(u.hostname) || u.hostname.includes(':')) throw new Error(`공개 HTTPS ${label} 주소가 필요합니다.`);
  return u;
}

export function validateInstagramInput(input: InstagramInput) {
  if (!ID.test(input.igUserId)) throw new Error('Instagram 계정 ID를 확인해 주세요.');
  if (typeof input.caption !== 'string' || input.caption.length > 2200) throw new Error('Instagram 캡션은 2,200자 이내입니다.');
  if ((input.caption.match(/#/g) || []).length > 30) throw new Error('Instagram 해시태그는 30개 이내입니다.');
  if (input.videoUrl !== undefined) {
    if (Array.isArray(input.imageUrls) && input.imageUrls.length) throw new Error('릴스는 영상 하나만 올립니다. 이미지와 함께 보낼 수 없습니다.');
    const u = publicHttps(input.videoUrl, '영상');
    if (!/\.(mp4|mov)$/i.test(u.pathname)) throw new Error('릴스 영상은 MP4 또는 MOV 파일 주소여야 합니다.');
    return input;
  }
  if (!Array.isArray(input.imageUrls) || !input.imageUrls.length || input.imageUrls.length > 10) throw new Error('이미지 1~10개가 필요합니다.');
  for (const value of input.imageUrls) {
    let u: URL; try { u = new URL(value); } catch { throw new Error('이미지 주소 형식 오류'); }
    if (u.protocol !== 'https:' || u.username || u.password || u.port || u.hostname === 'localhost' || u.hostname.endsWith('.local') || /^\d+\.\d+\.\d+\.\d+$/.test(u.hostname) || u.hostname.includes(':')) throw new Error('공개 HTTPS 이미지 주소가 필요합니다.');
    if (!/\.jpe?g$/i.test(u.pathname)) throw new Error('Instagram API는 JPEG 이미지만 게시합니다. PNG는 JPEG로 변환해 올려 주세요.');
  }
  return input;
}

export class InstagramAdapter {
  constructor(private token: string, private transport: typeof fetch = fetch, private host = 'https://graph.instagram.com') {
    if (!token) throw new Error('Instagram 계정 연결이 필요합니다.');
  }
  private async call(path: string, method: 'GET' | 'POST', params: Record<string, string> = {}) {
    const url = new URL(`${this.host}/${IG_API_VERSION}/${path}`);
    // Token travels in the Authorization header, never in logs or in the URL.
    const init: RequestInit = { method, headers: { Authorization: `Bearer ${this.token}` }, redirect: 'error', signal: AbortSignal.timeout(20000) };
    if (method === 'GET') for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    else { init.body = new URLSearchParams(params); }
    const r = await this.transport(url.href, init);
    let body: any = null; try { body = await r.json(); } catch { /* non-JSON */ }
    return { ok: r.ok, status: r.status, body };
  }
  private async container(igUserId: string, params: Record<string, string>) {
    const r = await this.call(`${igUserId}/media`, 'POST', params);
    if (!r.ok || typeof r.body?.id !== 'string' || !ID.test(r.body.id)) throw Object.assign(new Error('container'), { status: r.status });
    return r.body.id as string;
  }
  /** Creates containers only. Returns submitted with the publishable container id; nothing is visible on Instagram yet. */
  async submit(input: InstagramInput): Promise<PublishObservation> {
    const v = validateInstagramInput(input);
    try {
      let id: string;
      if (v.videoUrl) id = await this.container(v.igUserId, { media_type: 'REELS', video_url: v.videoUrl, caption: v.caption });
      else if (v.imageUrls.length === 1) id = await this.container(v.igUserId, { image_url: v.imageUrls[0], caption: v.caption });
      else {
        const children: string[] = [];
        for (const u of v.imageUrls) children.push(await this.container(v.igUserId, { image_url: u, is_carousel_item: 'true' }));
        id = await this.container(v.igUserId, { media_type: 'CAROUSEL', children: children.join(','), caption: v.caption });
      }
      return { state: 'submitted', submissionId: `${v.igUserId}_${id}` };
    } catch (e) {
      const status = (e as { status?: number }).status;
      // Container creation posts nothing publicly, so a 4xx is a definite failure; anything else stays unknown.
      return { state: status && status >= 400 && status < 500 && status !== 408 && status !== 429 ? 'failed' : 'unknown', reason: status ? `Instagram HTTP ${status}; 자동 재전송하지 않음` : 'Instagram 응답을 확인할 수 없음; 자동 재전송하지 않음' };
    }
  }
  /** Reconciles one container; publishes it exactly when Instagram reports FINISHED. */
  async status(submissionId: string): Promise<PublishObservation> {
    const m = /^([0-9]{1,40})_([0-9]{1,40})$/.exec(submissionId); if (!m) throw new Error('접수 ID 오류');
    const [, igUserId, containerId] = m; const same = { submissionId };
    try {
      const s = await this.call(containerId, 'GET', { fields: 'status_code' });
      if (!s.ok) return { state: 'unknown', ...same };
      const code = s.body?.status_code;
      if (code === 'IN_PROGRESS') return { state: 'submitted', ...same };
      if (code === 'ERROR' || code === 'EXPIRED') return { state: 'failed', ...same, reason: `Instagram 컨테이너 ${code}` };
      if (code === 'PUBLISHED') return { state: 'unknown', ...same, reason: '이미 게시된 컨테이너이나 게시물 ID를 받지 못함. Instagram에서 직접 확인 필요' };
      if (code !== 'FINISHED') return { state: 'unknown', ...same };
      const p = await this.call(`${igUserId}/media_publish`, 'POST', { creation_id: containerId });
      if (!p.ok || typeof p.body?.id !== 'string' || !ID.test(p.body.id)) return { state: p.ok ? 'unknown' : p.status >= 400 && p.status < 500 && p.status !== 429 ? 'failed' : 'unknown', ...same, reason: `Instagram 게시 HTTP ${p.status}` };
      const link = await this.call(p.body.id, 'GET', { fields: 'permalink' });
      try { const u = new URL(link.body?.permalink); if (u.protocol !== 'https:' || !/(^|\.)instagram\.com$/.test(u.hostname)) throw new Error(); return { state: 'published', ...same, publicUrl: u.href }; }
      catch { return { state: 'unknown', ...same, reason: `게시됨(미디어 ${p.body.id}), 게시물 주소 확인 실패` }; }
    } catch { return { state: 'unknown', ...same }; }
  }
  /** Remaining quota in the 24h window, for the UI and preflight checks. */
  async quota(igUserId: string) {
    if (!ID.test(igUserId)) throw new Error('Instagram 계정 ID를 확인해 주세요.');
    const r = await this.call(`${igUserId}/content_publishing_limit`, 'GET', { fields: 'quota_usage,config' });
    const d = r.body?.data?.[0]; if (!r.ok || !d) throw new Error('게시 한도를 확인할 수 없습니다.');
    return { used: Number(d.quota_usage), total: Number(d.config?.quota_total ?? 100) };
  }
}
