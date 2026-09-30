/** E210: hand-written validator for the Cora agent task envelope. Mirrors integrations/rita/contract.schema.json (no dependency). */
export const CONTRACT_VERSION = 'cora.agent-task/1';
export const AGENTS = ['card', 'blog', 'script', 'video', 'publish-sim', 'diagnose'] as const;
export const STATUSES = ['queued', 'running', 'needs_approval', 'succeeded', 'failed', 'cancelled'] as const;
export const ORIGINS = ['llmgw', 'source-outline', 'human', 'simulated'] as const;
export const APPROVAL_STATES = ['not_required', 'pending', 'approved', 'rejected'] as const;
export const SOURCE_KINDS = ['url', 'note', 'file', 'upload', 'work-item'] as const;
export type AgentName = typeof AGENTS[number];
export type TaskEnvelope = {
  schemaVersion: typeof CONTRACT_VERSION; taskId: string; agent: AgentName; status: typeof STATUSES[number]; createdAt: string; updatedAt: string;
  input: { brand: string; instruction: string; refs: { kind: string; ref: string }[] };
  output: null | { kind: string; ref: string; summary: string };
  cost: { credits: number; feature: string | null; ledgerEntryId: string | null; provider: string | null; model: string | null };
  provenance: { origin: typeof ORIGINS[number]; sources: { kind: typeof SOURCE_KINDS[number]; ref: string; fetchedAt?: string }[]; humanEdited: boolean };
  approval: { required: boolean; state: typeof APPROVAL_STATES[number]; approver?: string; decidedAt?: string; comment?: string };
  error?: { code: string; message: string };
};
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const iso = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));
export function validateTaskEnvelope(v: unknown): { ok: true; value: TaskEnvelope } | { ok: false; errors: string[] } {
  const e: string[] = []; const add = (p: string, m: string) => e.push(`${p}: ${m}`);
  if (!isObj(v)) return { ok: false, errors: ['$: 객체여야 합니다'] };
  const known = (o: Record<string, unknown>, keys: string[], p: string) => { for (const k of Object.keys(o)) if (!keys.includes(k)) add(`${p}${k}`, '정의되지 않은 항목입니다'); };
  const str = (o: Record<string, unknown>, k: string, p: string, max: number, min = 1) => { const x = o[k]; if (typeof x !== 'string' || x.length < min || x.length > max) { add(p + k, `${min}~${max}자 문자열이어야 합니다`); return false; } return true; };
  known(v, ['schemaVersion', 'taskId', 'agent', 'status', 'createdAt', 'updatedAt', 'input', 'output', 'cost', 'provenance', 'approval', 'error'], '$.');
  if (v.schemaVersion !== CONTRACT_VERSION) add('$.schemaVersion', `${CONTRACT_VERSION} 이어야 합니다`);
  if (typeof v.taskId !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/.test(v.taskId)) add('$.taskId', '8~80자의 영문·숫자·-·_ 이어야 합니다');
  if (!(AGENTS as readonly unknown[]).includes(v.agent)) add('$.agent', `${AGENTS.join('|')} 중 하나여야 합니다`);
  if (!(STATUSES as readonly unknown[]).includes(v.status)) add('$.status', `${STATUSES.join('|')} 중 하나여야 합니다`);
  if (!iso(v.createdAt)) add('$.createdAt', 'ISO 8601 시각이어야 합니다'); if (!iso(v.updatedAt)) add('$.updatedAt', 'ISO 8601 시각이어야 합니다');
  if (iso(v.createdAt) && iso(v.updatedAt) && Date.parse(v.updatedAt as string) < Date.parse(v.createdAt as string)) add('$.updatedAt', 'createdAt보다 앞설 수 없습니다');
  if (!isObj(v.input)) add('$.input', '객체여야 합니다');
  else { known(v.input, ['brand', 'instruction', 'refs'], '$.input.'); str(v.input, 'brand', '$.input.', 80, 0); str(v.input, 'instruction', '$.input.', 5000, 0);
    if (!Array.isArray(v.input.refs) || v.input.refs.length > 50) add('$.input.refs', '50개 이하 배열이어야 합니다');
    else v.input.refs.forEach((r, i) => { if (!isObj(r)) return add(`$.input.refs[${i}]`, '객체여야 합니다'); known(r, ['kind', 'ref'], `$.input.refs[${i}].`); str(r, 'kind', `$.input.refs[${i}].`, 40); str(r, 'ref', `$.input.refs[${i}].`, 1500); }); }
  if (v.output !== null) { if (!isObj(v.output)) add('$.output', '객체 또는 null이어야 합니다'); else { known(v.output, ['kind', 'ref', 'summary'], '$.output.'); str(v.output, 'kind', '$.output.', 40); str(v.output, 'ref', '$.output.', 200); str(v.output, 'summary', '$.output.', 2000, 0); } }
  if (v.status === 'succeeded' && v.output === null) add('$.output', 'succeeded 상태에는 output이 필요합니다');
  if (v.status === 'failed' && !isObj(v.error)) add('$.error', 'failed 상태에는 error가 필요합니다');
  if (isObj(v.error)) { known(v.error, ['code', 'message'], '$.error.'); str(v.error, 'code', '$.error.', 60); str(v.error, 'message', '$.error.', 1000); }
  if (!isObj(v.cost)) add('$.cost', '객체여야 합니다');
  else { known(v.cost, ['credits', 'feature', 'ledgerEntryId', 'provider', 'model'], '$.cost.'); if (!Number.isInteger(v.cost.credits) || (v.cost.credits as number) < 0 || (v.cost.credits as number) > 1_000_000) add('$.cost.credits', '0 이상의 정수여야 합니다');
    for (const k of ['feature', 'ledgerEntryId', 'provider', 'model']) { const x = (v.cost as Record<string, unknown>)[k]; if (x !== null && (typeof x !== 'string' || !x || x.length > 120)) add(`$.cost.${k}`, '문자열 또는 null이어야 합니다'); } }
  if (!isObj(v.provenance)) add('$.provenance', '객체여야 합니다');
  else { const p = v.provenance; known(p, ['origin', 'sources', 'humanEdited'], '$.provenance.'); if (!(ORIGINS as readonly unknown[]).includes(p.origin)) add('$.provenance.origin', `${ORIGINS.join('|')} 중 하나여야 합니다`);
    if (typeof p.humanEdited !== 'boolean') add('$.provenance.humanEdited', 'true/false여야 합니다');
    if (!Array.isArray(p.sources) || p.sources.length > 50) add('$.provenance.sources', '50개 이하 배열이어야 합니다');
    else p.sources.forEach((s, i) => { const b = `$.provenance.sources[${i}].`; if (!isObj(s)) return add(b.slice(0, -1), '객체여야 합니다'); known(s, ['kind', 'ref', 'fetchedAt'], b); if (!(SOURCE_KINDS as readonly unknown[]).includes(s.kind)) add(b + 'kind', `${SOURCE_KINDS.join('|')} 중 하나여야 합니다`); str(s, 'ref', b, 1500); if (s.fetchedAt !== undefined && !iso(s.fetchedAt)) add(b + 'fetchedAt', 'ISO 8601 시각이어야 합니다'); if (s.kind === 'url' && s.fetchedAt === undefined) add(b + 'fetchedAt', 'url 출처에는 가져온 시각이 필요합니다'); }); }
  if (!isObj(v.approval)) add('$.approval', '객체여야 합니다');
  else { const a = v.approval; known(a, ['required', 'state', 'approver', 'decidedAt', 'comment'], '$.approval.'); if (typeof a.required !== 'boolean') add('$.approval.required', 'true/false여야 합니다');
    if (!(APPROVAL_STATES as readonly unknown[]).includes(a.state)) add('$.approval.state', `${APPROVAL_STATES.join('|')} 중 하나여야 합니다`);
    if (a.required === true && a.state === 'not_required') add('$.approval.state', 'required가 true이면 not_required일 수 없습니다');
    if (a.required === false && a.state !== 'not_required') add('$.approval.state', 'required가 false이면 not_required여야 합니다');
    if (a.state === 'approved' || a.state === 'rejected') { if (typeof a.approver !== 'string' || !a.approver) add('$.approval.approver', '결정한 사람이 필요합니다'); if (!iso(a.decidedAt)) add('$.approval.decidedAt', '결정 시각이 필요합니다'); }
    if (a.comment !== undefined && (typeof a.comment !== 'string' || a.comment.length > 3000)) add('$.approval.comment', '3000자 이하 문자열이어야 합니다'); }
  if (v.agent === 'publish-sim' && isObj(v.provenance) && v.provenance.origin !== 'simulated') add('$.provenance.origin', 'publish-sim 작업은 simulated여야 합니다(실제 게시가 아닙니다)');
  if (v.agent === 'publish-sim' && isObj(v.approval) && v.approval.required !== true) add('$.approval.required', 'publish-sim 작업은 사람 승인이 필요합니다');
  if (v.status === 'succeeded' && isObj(v.approval) && v.approval.required === true && v.approval.state !== 'approved') add('$.status', '승인이 필요한 작업은 approved 전에 succeeded가 될 수 없습니다');
  return e.length ? { ok: false, errors: e } : { ok: true, value: v as unknown as TaskEnvelope };
}
