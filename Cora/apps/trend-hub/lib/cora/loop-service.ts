import type { CoraStore } from './store';
import { ContentLoop, ruleCandidates, candidatePrompt, parseCandidates, FORMATS, HOOKS, PICK_TAGS, REJECT_TAGS, METRIC_KEYS, type Format } from './loop';
import { playbookFor } from './loop-playbook';
import { validateDraft, type Brief } from './model';
import { OpsError, asOpsError } from './ops/errors';

export type LoopGenerate = (userId: string, prompt: string) => Promise<{ text: string; provider: string; model: string; cost: null }>;
export const LOOP_DAILY_AI_LIMIT = 10;
export const loopOf = (s: CoraStore) => s.module('content-loop', db => new ContentLoop(db));

function briefOf(value: unknown): Brief {
  // Reuses the draft validator so the loop accepts exactly the briefs the editor accepts.
  return validateDraft({ brief: value, idea: 'brief', origin: 'source-outline', postedUrl: '', caption: '', slides: [{ id: 'a', headline: '', body: '' }, { id: 'b', headline: '', body: '' }] }).brief;
}

export function loopState(s: CoraStore, user: string, batchId?: string | null) {
  const loop = loopOf(s); const batches = loop.batches(user, 10);
  const current = batchId ? loop.batch(user, batchId) : batches[0] ?? null;
  return {
    batches, current, candidates: current ? loop.candidates(user, current.id) : [],
    posts: loop.posts(user), snapshots: loop.snapshots(user), actions: loop.actions(user),
    playbook: playbookFor(), options: { hooks: HOOKS, formats: FORMATS, pickTags: PICK_TAGS, rejectTags: REJECT_TAGS, metrics: METRIC_KEYS },
  };
}

/** One dispatcher for the loop UI. Paid AI is used only for action 'generate' with mode 'ai', inside the shared daily limit. */
export async function loopAction(s: CoraStore, user: string, b: Record<string, unknown>, generate: LoopGenerate) {
  const loop = loopOf(s);
  try {
    switch (b.action) {
      case 'generate': {
        const brief = briefOf(b.brief);
        const format: Format = typeof b.format === 'string' && b.format in FORMATS ? b.format as Format : 'carousel';
        const count = Number(b.count ?? 3); if (!Number.isInteger(count) || count < 2 || count > 5) throw new OpsError('후보 수는 2~5개입니다.');
        const action = typeof b.fromActionId === 'string' && b.fromActionId ? loop.action(user, b.fromActionId) : null;
        if (b.fromActionId && !action) throw new OpsError('다음 할 일을 찾을 수 없습니다.', 404);
        if (action && action.status !== 'accepted') throw new OpsError('채택한 할 일로만 다음 후보를 만들 수 있습니다.');
        const extra = [typeof b.instructions === 'string' ? b.instructions.slice(0, 1000) : '', action ? action.text : ''].filter(Boolean).join(' ');
        if (b.mode === 'ai') {
          if (s.generationCount(user) >= LOOP_DAILY_AI_LIMIT) throw new OpsError(`로컬 시험용 하루 ${LOOP_DAILY_AI_LIMIT}회 한도입니다.`, 429);
          const slides = Math.min(8, Math.max(4, Number(b.slides ?? 6) || 6));
          s.addItem(user, 'run', 'AI 후보 여러 개 생성', { format: 'loop-candidates', count });
          const r = await generate(user, candidatePrompt(brief, count, slides, format, action?.preferHook ?? null, action?.avoidHook ?? null, extra));
          const parsed = parseCandidates(r.text, brief, count, slides);
          return { ...loop.addBatch(user, { brief, format, mode: 'ai', fromActionId: action?.id ?? null, candidates: parsed.candidates }), rejected: parsed.rejected, provider: r.provider, model: r.model };
        }
        return { ...loop.addBatch(user, { brief, format, mode: 'rules', fromActionId: action?.id ?? null, candidates: ruleCandidates(brief, count, action?.preferHook ?? null, action?.avoidHook ?? null) }), rejected: [] };
      }
      case 'select': return { candidate: loop.select(user, String(b.candidateId ?? ''), b.tags, b.note, draft => s.save(user, { ...draft, workStatus: 'draft' })!.id) };
      case 'reject': return { candidate: loop.reject(user, String(b.candidateId ?? ''), b.tags, b.note) };
      case 'post': return { post: loop.registerPost(user, b) };
      case 'metrics': return { snapshot: loop.recordMetrics(user, String(b.postId ?? ''), b) };
      case 'import': return loop.importMetricsCSV(user, String(b.csv ?? ''));
      case 'review': return { review: loop.review(user) };
      case 'decide': return { action: loop.decideAction(user, String(b.actionId ?? ''), b.status, b.note) };
      default: throw new OpsError('지원하지 않는 요청입니다.');
    }
  } catch (e) { throw asOpsError(e); }
}
