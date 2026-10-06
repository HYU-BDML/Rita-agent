import { NextRequest } from 'next/server';
import { json, body } from '@/lib/cora/http';
import { auth, fail, versionOf } from '@/lib/cora/video/http';
import { videoStore } from '@/lib/cora/video/db';
import { validateTemplateName, validateTemplateSettings } from '@/lib/cora/video/template';
export const runtime = 'nodejs';
type Ctx = { params: Promise<{ id: string }> };
export async function GET(req: NextRequest, ctx: Ctx) { const a = auth(req, false); if ('res' in a) return a.res; const t = videoStore().getTemplate(a.u.id, (await ctx.params).id); return t ? json({ template: t }) : json({ error: '템플릿을 찾을 수 없습니다.' }, 404); }
/** F052: PATCH {expectedVersion, name?, settings?}. The write only succeeds when expectedVersion equals the stored version; otherwise 409 with currentVersion. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const a = auth(req, true); if ('res' in a) return a.res;
  try { const b = await body(req); const expected = versionOf(b.expectedVersion); if (b.name === undefined && b.settings === undefined) throw new Error('바꿀 내용이 없습니다.');
    const settings = b.settings === undefined ? undefined : validateTemplateSettings(b.settings); if (settings?.bgm && !videoStore().getAudio(a.u.id, settings.bgm.id)) throw new Error('템플릿에 쓴 배경음악을 찾을 수 없습니다.');
    const t = videoStore().updateTemplate(a.u.id, (await ctx.params).id, expected, { name: b.name === undefined ? undefined : validateTemplateName(b.name), settings });
    return t ? json({ template: t }) : json({ error: '템플릿을 찾을 수 없습니다.' }, 404); } catch (e) { return fail(e); }
}
export async function DELETE(req: NextRequest, ctx: Ctx) { const a = auth(req, true); if ('res' in a) return a.res; return videoStore().deleteTemplate(a.u.id, (await ctx.params).id) ? json({ deleted: true }) : json({ error: '템플릿을 찾을 수 없습니다.' }, 404); }
