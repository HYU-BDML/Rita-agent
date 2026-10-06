import { NextRequest } from 'next/server';
import { json, body } from '@/lib/cora/http';
import { store } from '@/lib/cora/store';
import { generateText } from '@/lib/cora/gateway';
import { auth, fail } from '@/lib/cora/video/http';
import { withUserLock } from '@/lib/cora/video/lock';
import { THEMES, planShorts, renderShort, shortsPlans, transcribe, validatePlanInput, validateShortOptions, whisperConfigured, type ShortRender } from '@/lib/cora/video/shorts';
export const runtime = 'nodejs'; export const maxDuration = 900;
/** GET ?sourceId= : saved plans, theme presets and whether local transcription is available. */
export function GET(req: NextRequest) { const a = auth(req, false); if ('res' in a) return a.res; return json({ plans: shortsPlans().list(a.u.id, req.nextUrl.searchParams.get('sourceId') ?? undefined), themes: Object.entries(THEMES).map(([id, t]) => ({ id, label: t.label, guide: t.guide })), whisper: whisperConfigured() }); }
/**
 * POST {action:'plan', sourceId, mode:'ai'|'rules', theme, custom?, count, minSec, maxSec, audience?}
 * POST {action:'render', sourceId, items:[{start,end,title?,keyword?,hook?}], fit?, burn?, hookCard?, bgmId?, bgmVolume?, voiceVolume?, fadeOut?}
 * POST {action:'transcribe', sourceId, lang?}
 */
export async function POST(req: NextRequest) {
  const a = auth(req, true); if ('res' in a) return a.res; const u = a.u;
  try {
    const b = await body(req); if (typeof b.sourceId !== 'string') throw new Error('원본 영상이 필요합니다.');
    if (b.action === 'plan') {
      const input = validatePlanInput(b); const mode = b.mode === 'rules' ? 'rules' : 'ai';
      if (mode === 'ai') { if (store().generationCount(u.id) >= 10) return json({ error: '로컬 시험용 하루 10회 AI 한도입니다. 규칙 기반 추천은 계속 쓸 수 있습니다.' }, 429); store().addItem(u.id, 'run', 'AI 숏츠 구간 추천', { sourceId: b.sourceId }); }
      return json({ plan: await planShorts(u.id, b.sourceId, input, mode, generateText) }, 201);
    }
    if (b.action === 'render') {
      if (!Array.isArray(b.items) || !b.items.length || b.items.length > 8) throw new Error('만들 숏츠 구간을 1~8개 골라 주세요.');
      const items = (b.items as Record<string, unknown>[]).map(x => ({ start: Number(x.start), end: Number(x.end), title: typeof x.title === 'string' ? x.title.slice(0, 30) : '', keyword: typeof x.keyword === 'string' ? x.keyword.slice(0, 20) : '', hook: typeof x.hook === 'string' ? x.hook.slice(0, 40) : '' })) as ShortRender[];
      const options = validateShortOptions(b);
      return await withUserLock(u.id, async () => { const results = []; for (const it of items) { const r = await renderShort(u.id, b.sourceId as string, it, options); results.push({ ...r, url: `/api/cora/video-clips/${r.clip.id}` }); } return json({ shorts: results }, 201); });
    }
    if (b.action === 'transcribe') return await withUserLock(u.id, async () => json({ segments: (await transcribe(u.id, b.sourceId as string, typeof b.lang === 'string' ? b.lang : 'ko')).length }));
    throw new Error('지원하지 않는 숏츠 작업입니다.');
  } catch (e) { return fail(e); }
}
