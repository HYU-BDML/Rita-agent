import type { ReviewContext, ProposedAction, Hook } from './loop';
import { KNOWHOW } from './loop-knowhow';

/**
 * Playbook rules used by the daily review (stage ⑤) and shown as checklists in stages ①–④.
 * `stability`: '안정' = official platform source or ≥3 independent sources agree; '미확인' = one source or
 * contested; 'Cora 기준' = Cora's own operating rule (data hygiene, comparison method), not a platform claim.
 * Rules with `check` produce proposed actions from data; rules without `check` are guidance only.
 */
export type Source = { url: string; publisher: string; type: 'official' | 'research' | 'practitioner' | 'cora'; popularity: string; accessed: string };
export type PlaybookRule = { id: string; stage: 1 | 2 | 3 | 4 | 5; platform: string; title: string; rule: string; basis: string; sources: Source[]; stability: '안정' | '미확인' | 'Cora 기준'; check?: (ctx: ReviewContext) => ProposedAction[] };

const CORA: Source = { url: '', publisher: 'Cora 운영 기준', type: 'cora', popularity: '내부 기준', accessed: '2026-10-03' };
const pct = (v: number | null) => v === null ? '없음' : `${(v * 100).toFixed(2)}%`;
const times = (v: number | null) => v === null ? '계산 불가' : `${v.toFixed(2)}배`;
// Same labels as HOOKS in loop.ts; kept here so this module has no runtime import cycle with loop.ts.
const HOOK_LABEL: Record<Hook, string> = { question: '질문형', number: '숫자형', result: '결과 먼저', story: '장면·이야기형', contrast: '대비형' };

export const CORE_RULES: PlaybookRule[] = [
  {
    id: 'C4-daily-record', stage: 4, platform: 'all', stability: 'Cora 기준', sources: [CORA],
    title: '게시물마다 매일 같은 시각에 성과를 기록',
    rule: '게시 다음 날부터 오늘 기록이 없는 게시물이 있으면, 그 게시물의 오늘 수치를 기록하도록 알린다.',
    basis: '같은 게시 경과일끼리 비교하려면 하루 단위 기록이 빠짐없이 있어야 한다. 지난 날짜의 수치는 플랫폼에서 다시 받을 수 없는 경우가 많다.',
    check: ctx => { const miss = ctx.rows.filter(r => r.missingToday); return miss.length ? [{ kind: 'collect', text: `오늘 성과 기록이 없는 게시물 ${miss.length}개의 수치를 기록한다.`, evidence: miss.slice(0, 5).map(r => `${r.post.title}(게시 ${r.ageNow}일째)`).join(', ') + (miss.length > 5 ? ` 외 ${miss.length - 5}개` : '') }] : []; },
  },
  {
    id: 'C5-repeat-above', stage: 5, platform: 'all', stability: 'Cora 기준', sources: [CORA],
    title: '기준선보다 높은 게시물은 한 요소만 바꿔 다시 시험',
    rule: '저장률이나 공유율이 같은 계정의 같은 경과일 중앙값보다 1.2배 이상 높은 게시물이 있으면, 다음 후보 중 하나는 그 게시물의 시작 방식을 유지하고 나머지 한 요소만 바꾼다.',
    basis: '한 번 높게 나온 결과는 우연일 수 있으므로, 같은 시작 방식을 한 번 더 써서 다시 높게 나오는지 확인한다. 여러 요소를 동시에 바꾸면 어느 요소 때문인지 알 수 없다.',
    check: ctx => ctx.rows.filter(r => r.compare && r.post.hook && (r.compare.saveRate.status === 'above' || r.compare.shareRate.status === 'above')).slice(0, 3).map(r => {
      const c = r.compare!; const hook = r.post.hook as Hook;
      return { kind: 'repeat', preferHook: hook, text: `“${r.post.title}”의 시작 방식(${HOOK_LABEL[hook]})을 다음 후보 하나에 다시 쓰고, 주제나 형식 중 한 가지만 바꾼다.`, evidence: `게시 ${c.ageDays}일째 저장률 ${pct(c.saveRate.mine)}(중앙값 ${pct(c.saveRate.median)}, ${times(c.saveRate.ratio)}, 비교 ${c.saveRate.n}개), 공유율 ${pct(c.shareRate.mine)}(중앙값 ${pct(c.shareRate.median)}, ${times(c.shareRate.ratio)}, 비교 ${c.shareRate.n}개)` };
    }),
  },
  {
    id: 'C5-reduce-low-group', stage: 5, platform: 'all', stability: 'Cora 기준', sources: [CORA],
    title: '3개 이상 모은 시작 방식이 계속 낮으면 비중을 줄임',
    rule: '같은 시작 방식의 게시물이 3개 이상이고 그 저장률 중앙값이 전체 시작 방식 중앙값의 0.8배 이하이면, 다음 후보에서 그 시작 방식을 맨 뒤로 보낸다.',
    basis: '게시물 1~2개의 결과로는 판단하지 않고, 같은 방식이 3번 이상 반복해서 낮을 때만 비중을 줄인다.',
    check: ctx => {
      const all = ctx.hooks.filter(g => !g.small && g.saveRate !== null); if (all.length < 2) return [];
      const mid = all.map(g => g.saveRate as number).sort((a, b) => a - b)[Math.floor(all.length / 2)];
      return all.filter(g => mid > 0 && (g.saveRate as number) / mid <= 0.8).map(g => ({ kind: 'reduce', avoidHook: g.key as Hook, text: `시작 방식 “${g.label}”을 다음 후보에서 맨 뒤로 보낸다.`, evidence: `${g.label} 게시물 ${g.n}개의 저장률 중앙값 ${pct(g.saveRate)}, 시작 방식별 중앙값 ${pct(mid)}` }));
    },
  },
  {
    id: 'C2-reject-pattern', stage: 2, platform: 'all', stability: 'Cora 기준', sources: [CORA],
    title: '사람이 반복해서 버린 이유를 다음 후보 지시에 반영',
    rule: '사람이 후보를 버린 이유 가운데 같은 이유가 3번 이상 나오면, 다음 후보를 만들 때 그 이유를 피하라는 지시를 넣는다.',
    basis: '사람의 선정 이유는 이 계정만의 기준이며, 플랫폼 자료로는 얻을 수 없는 정보다.',
    check: ctx => Object.entries(ctx.selections.tags).filter(([k, n]) => k.startsWith('rejected:') && n >= 3).map(([k, n]) => ({ kind: 'instruct', text: `다음 후보 지시에 “${k.slice(9)}” 문제를 피하라는 문장을 넣는다.`, evidence: `지금까지 후보를 버린 이유로 “${k.slice(9)}”가 ${n}번 선택됨` })),
  },
];

export const PLAYBOOK: PlaybookRule[] = [...CORE_RULES, ...KNOWHOW];
export function playbookFor(stage?: number) { return PLAYBOOK.filter(r => !stage || r.stage === stage).map(({ check, ...r }) => ({ ...r, automatic: !!check })); }
