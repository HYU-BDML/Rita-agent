import { NextRequest } from 'next/server';
import { blankBrief, ideasFor, validateDraft } from '@/lib/cora/model';
import type { Brief } from '@/lib/cora/model';
import { json, sameOrigin, user } from '@/lib/cora/http';
import { Limiter } from '@/lib/cora/apikeys';
import { decodePdfBase64, draftFromText, extractPdfText } from '@/lib/cora/pdf-text';
import { YouTubeAdapter, parseYouTubeId, youtubeMaterial } from '@/lib/cora/youtube';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
const limiter = new Limiter(10, 60_000);
/** 5MB PDF as base64 is about 6.7MB, so this route reads its own stream with a 7.5MB bound instead of http.body's 3MB. */
async function readJson(req: NextRequest, limit = 7_500_000) {
  if (!req.headers.get('content-type')?.includes('application/json')) throw new Error('JSON 요청이 필요합니다.');
  const reader = req.body?.getReader(); if (!reader) throw new Error('요청이 비어 있습니다.');
  let total = 0; const chunks: Uint8Array[] = [];
  while (true) { const { value, done } = await reader.read(); if (done) break; total += value.byteLength; if (total > limit) { await reader.cancel(); throw new Error('PDF는 5MB 이내여야 합니다.'); } chunks.push(value); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>; } catch { throw new Error('요청 형식을 확인해 주세요.'); }
}
const text = (x: unknown, max: number, fallback = '') => typeof x === 'string' && x.trim() ? x.trim().slice(0, max) : fallback;
const briefOf = (b: Record<string, unknown>, brand: string, sourceUrl = ''): Brief => ({ ...blankBrief, brand: text(b.brand, 80, brand), audience: text(b.audience, 160), goal: text(b.goal, 200, blankBrief.goal), sourceUrl });
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return json({ error: '허용되지 않은 요청입니다.' }, 403);
  const u = user(req); if (!u) return json({ error: '로그인이 필요합니다.' }, 401);
  if (!limiter.hit(u.id).allowed) return json({ error: '요청이 너무 많습니다. 잠시 뒤 다시 시도해 주세요.' }, 429);
  try {
    const b = await readJson(req);
    if (b.action === 'pdf') {
      const buf = decodePdfBase64(b.file); const ex = extractPdfText(buf);
      const brand = text(b.brand, 80, text(b.filename, 60).replace(/\.pdf$/i, '') || 'PDF 자료'); const brief = briefOf(b, brand);
      const r = draftFromText(brief, ideasFor({ ...brief, brand })[1].title, ex.text);
      const draft = validateDraft(r.draft);
      return json({ draft, pages: ex.pages, chars: r.chars, usedChars: r.usedChars, paragraphs: r.paragraphs.length, totalParagraphs: r.total, truncated: r.truncated, note: r.truncated ? `본문이 ${r.total}개 문단이라 앞의 ${r.paragraphs.length}개 문단만 카드에 담았습니다.` : '' });
    }
    if (b.action === 'youtube') {
      const id = parseYouTubeId(String(b.url ?? '')); const v = await new YouTubeAdapter(process.env.YOUTUBE_API_KEY ?? '').video(id);
      const m = youtubeMaterial(v, typeof b.transcript === 'string' ? b.transcript : '');
      let draft = null;
      if (m.enough) { const brand = text(b.brand, 80, v.channel || v.title.slice(0, 80)); const brief = briefOf(b, brand, v.url); draft = validateDraft(draftFromText(brief, ideasFor({ ...brief, brand })[1].title, m.text).draft); }
      return json({ video: v, material: m.text, hasTranscript: m.hasTranscript, draft, note: m.hasTranscript ? '' : '자막은 API 키로 내려받을 수 없어 제목과 설명만 사용했습니다. 자막 텍스트를 붙여 넣으면 카드에 함께 담깁니다.' });
    }
    throw new Error('지원하지 않는 가져오기 작업입니다.');
  } catch (e) { return json({ error: e instanceof Error ? e.message : '가져오기 실패' }, 400); }
}
