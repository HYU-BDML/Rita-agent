import type { CoraStore } from '../store';
import { validateDraft, type Draft } from '../model';

export interface RevisionSummary { version: number; created: string; slideCount: number; captionPreview: string; current: boolean }
type Row = { version: number; created: string; body: string };
/** Read-only access to the revisions table, opened once through store().module() because store.ts is not edited. */
export const revisionsReader = (s: CoraStore) => s.module('revisions-reader', db => ({
  list: (projectId: string) => db.prepare('SELECT version,created,body FROM revisions WHERE project_id=? ORDER BY version DESC LIMIT 200').all(projectId) as Row[],
  get: (projectId: string, version: number) => db.prepare('SELECT version,created,body FROM revisions WHERE project_id=? AND version=?').get(projectId, version) as Row | undefined,
}));

/** Versions of a project the user may open (owner or team editor). Others get NOT_FOUND, never a hint that the project exists. */
export function listRevisions(s: CoraStore, userId: string, projectId: string): RevisionSummary[] {
  const project = typeof projectId === 'string' ? s.getAccessible(userId, projectId) : null;
  if (!project) throw new Error('NOT_FOUND');
  return revisionsReader(s).list(projectId).map(r => {
    let slideCount = 0, caption = '';
    try { const b = JSON.parse(r.body) as Draft; slideCount = b.slides.length; caption = b.caption; } catch { /* unreadable body is listed without details */ }
    return { version: Number(r.version), created: String(r.created), slideCount, captionPreview: Array.from(caption).slice(0, 60).join(''), current: Number(r.version) === project.version };
  });
}
/**
 * Returns an old version as an unsaved draft. Nothing is written: the client saves it as a new version.
 * Approval state is not carried over (workStatus becomes 'draft').
 */
export function restoreRevision(s: CoraStore, userId: string, projectId: string, version: number, currentVersion: number): { draft: Draft; restoredVersion: number } {
  const project = typeof projectId === 'string' ? s.getAccessible(userId, projectId) : null;
  if (!project) throw new Error('NOT_FOUND');
  if (!Number.isInteger(version) || version < 1) throw new Error('복원할 버전을 확인해 주세요.');
  if (currentVersion !== project.version) throw new Error('CONFLICT');
  const row = revisionsReader(s).get(projectId, version);
  if (!row) throw new Error('NOT_FOUND');
  const draft = validateDraft(JSON.parse(row.body));
  return { draft: { ...draft, workStatus: 'draft' }, restoredVersion: version };
}
