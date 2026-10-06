import { NextRequest } from 'next/server';
import { json, body } from '@/lib/cora/http';
import { store } from '@/lib/cora/store';
import { auth, fail } from '@/lib/cora/video/http';
import { videoStore } from '@/lib/cora/video/db';
import { settingsFromRender, validateTemplateName, validateTemplateSettings } from '@/lib/cora/video/template';
import { LIMITS } from '@/lib/cora/video/clips';
export const runtime = 'nodejs';
export async function GET(req: NextRequest) { const a = auth(req, false); if ('res' in a) return a.res; return json({ templates: videoStore().listTemplates(a.u.id) }); }
/** F045/F046: POST {name, settings} or {name, fromVideoId} (settings taken from that rendered video's saved render settings). */
export async function POST(req: NextRequest) {
  const a = auth(req, true); if ('res' in a) return a.res;
  try {
    const b = await body(req); const name = validateTemplateName(b.name);
    if (videoStore().listTemplates(a.u.id).length >= LIMITS.templates) throw new Error(`템플릿은 ${LIMITS.templates}개까지 저장합니다.`);
    let settings, from: string | null = null;
    if (b.fromVideoId !== undefined) { const it = typeof b.fromVideoId === 'string' ? store().item(a.u.id, b.fromVideoId) : null; if (!it || it.kind !== 'video' || it.data.status !== 'ready') throw new Error('템플릿으로 만들 영상을 찾을 수 없습니다.'); settings = settingsFromRender(it.data); from = it.id; }
    else settings = validateTemplateSettings(b.settings);
    if (settings.bgm && !videoStore().getAudio(a.u.id, settings.bgm.id)) throw new Error('템플릿에 쓴 배경음악을 찾을 수 없습니다.');
    return json({ template: videoStore().addTemplate(a.u.id, name, settings, from) }, 201);
  } catch (e) { return fail(e); }
}
