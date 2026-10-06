import { NextRequest } from 'next/server';
import { body, json, sameOrigin, user } from '@/lib/cora/http';
import { store } from '@/lib/cora/store';
import { generateText } from '@/lib/cora/gateway';
import { styleProfiles, computeStyleStats, validateSamples } from '@/lib/cora/platform/style';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
export function GET(req: NextRequest) { const u = user(req); if (!u) return json({ error: '로그인이 필요합니다.' }, 401); return json({ profiles: styleProfiles().list(u.id) }); }
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return json({ error: '허용되지 않은 요청입니다.' }, 403);
  const u = user(req); if (!u) return json({ error: '로그인이 필요합니다.' }, 401);
  try {
    const b = await body(req);
    // Local statistics only: no AI call, nothing saved.
    if (b.action === 'stats') return json({ stats: computeStyleStats(validateSamples(b.samples)) });
    if (b.action === 'delete') return styleProfiles().delete(u.id, b.brand) ? json({ deleted: true }) : json({ error: '문체 프로필을 찾을 수 없습니다.' }, 404);
    if (b.action === 'learn') {
      validateSamples(b.samples); // reject before counting an AI run
      const useAi = b.useAi !== false && store().generationCount(u.id) < 10;
      if (useAi) store().addItem(u.id, 'run', '문체 학습 AI 요약', {});
      const profile = await styleProfiles().learn(u.id, b.brand, b.samples, useAi ? async p => (await generateText(u.id, p)).text : undefined);
      return json({ profile, notice: profile.llm ? '' : 'AI 요약 없이 문장 길이 통계만 저장했습니다.' }, 201);
    }
    throw new Error('지원하지 않는 작업입니다.');
  } catch (e) { return json({ error: e instanceof Error ? e.message : '문체 학습 실패' }, 400); }
}
