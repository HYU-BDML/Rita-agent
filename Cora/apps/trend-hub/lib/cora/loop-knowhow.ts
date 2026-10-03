import data from './loop-knowhow-data.json';
import type { PlaybookRule, Source } from './loop-playbook';
import type { ReviewContext, ProposedAction } from './loop';

/**
 * Source-backed know-how from the 2026-10-03 research pass (44 rules), stored in loop-knowhow-data.json.
 * Source types: 'official' = the platform's own pages (creators/about.instagram.com, Meta developer docs,
 * YouTube Help/blog, TikTok newsroom/business); 'press' = news reports of platform statements; 'research'
 * = large-sample studies by tool vendors; 'practitioner' = individual creators. '안정' needs one official
 * source or three independent hosts. Rules without a check are shown as stage checklists.
 */
type Raw = { id: string; stage: 1 | 2 | 3 | 4 | 5; platform: string; rule: string; basis: string; notes: string; stability: '안정' | '미확인'; sources: Source[] };
const DAY = 86400000;
const CHECKS: Record<string, (ctx: ReviewContext) => ProposedAction[]> = {
  // Meta media insights: data can be delayed up to 48 hours.
  R27: ctx => { const early = ctx.rows.filter(r => r.latest?.source === 'instagram' && r.latest.ageDays < 2); return early.length ? [{ kind: 'wait', text: `Instagram에서 받은 게시 2일 미만 수치 ${early.length}건은 판정하지 않고, 48시간이 지난 뒤 다시 점검한다.`, evidence: early.map(r => `${r.post.title}(게시 ${r.latest!.ageDays}일째)`).join(', ') }] : []; },
  // Instagram creators FAQ: creators with the greatest net follower growth post 10+ reels per month on average (observation).
  R18: ctx => {
    const ig = ctx.rows.filter(r => r.post.platform === 'instagram'); if (!ig.length) return [];
    const since = Date.parse(ctx.today) - 30 * DAY; const reels = ig.filter(r => r.post.format === 'reel' && Date.parse(r.post.postedAt) >= since).length;
    return reels < 10 ? [{ kind: 'cadence', preferFormat: 'reel', text: 'Instagram 릴스를 월 10개 이상, 주 2~3개 이상 올리도록 다음 4주 게시 일정을 잡는다.', evidence: `최근 30일 Instagram 릴스 기록 ${reels}개. Instagram 크리에이터 FAQ는 팔로워 증가가 큰 크리에이터가 평균 월 10개 이상 릴스를 올린다고 밝혔다(관찰값).` }] : [];
  },
};
export const KNOWHOW: PlaybookRule[] = (data as Raw[]).map(r => ({
  id: r.id, stage: r.stage, platform: r.platform, title: `${r.id} · ${r.platform === 'all' ? '모든 플랫폼' : r.platform}`, rule: r.rule,
  basis: r.notes ? `${r.basis} 참고: ${r.notes}` : r.basis, sources: r.sources, stability: r.stability, check: CHECKS[r.id],
}));
