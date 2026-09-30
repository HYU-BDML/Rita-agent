import { NextRequest } from 'next/server';
import { json, body } from '@/lib/cora/http';
import { auth, fail } from '@/lib/cora/video/http';
import { videoStore } from '@/lib/cora/video/db';
import { applyTemplate } from '@/lib/cora/video/template';
export const runtime = 'nodejs';
/** POST {sceneCount} -> render settings (ratio, seconds per scene, subtitle style, bgm) to merge into the render request. Reads only; templateVersion lets the caller detect later edits. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const a = auth(req, true); if ('res' in a) return a.res;
  try { const b = await body(req); if (!Number.isInteger(b.sceneCount) || b.sceneCount < 2 || b.sceneCount > 12) throw new Error('장면 수는 2~12입니다.');
    const t = videoStore().getTemplate(a.u.id, (await ctx.params).id); if (!t) return json({ error: '템플릿을 찾을 수 없습니다.' }, 404);
    const warnings: string[] = []; const applied = applyTemplate(t.settings, b.sceneCount);
    if (applied.bgm && !videoStore().getAudio(a.u.id, applied.bgm.id)) { warnings.push('템플릿의 배경음악이 삭제되어 제외했습니다.'); applied.bgm = null; }
    return json({ templateId: t.id, templateVersion: t.version, settings: applied, warnings }); } catch (e) { return fail(e); }
}
