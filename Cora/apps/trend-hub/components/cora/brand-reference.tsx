'use client';
import {prohibitedExpressions,type BrandRules} from '@/lib/cora/brand-rules';
export function BrandReference({rules,currentVersion,text=''}:{rules?:BrandRules;currentVersion?:number;text?:string}){
 if(!rules)return <p>사용한 브랜드 규칙 버전이 기록되지 않은 기존 초안입니다. 다음 생성부터 공통 규칙을 적용합니다.</p>;
 const prohibited=prohibitedExpressions(rules,text);
 return <details><summary>참조 브랜드 규칙 · v{rules.version}{currentVersion&&currentVersion!==rules.version?` · 현재 v${currentVersion}, 다시 확인 필요`:''}</summary><p>확인자 {rules.confirmedBy==='legacy-unconfirmed'?'기존 자료 이전 · 당시 확인 기록 없음':rules.confirmedBy.slice(0,8)} · {rules.confirmedAt}</p><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>근거: {rules.evidence||'별도 근거 메모 없음'}</p><dl>{([['말투',rules.voice],['시각 규칙',rules.visualRules],['반복 주제',rules.pillars],['피할 표현',rules.avoid]]).map(([label,value])=><div key={label}><dt>{label}</dt><dd style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{value||'미지정'}</dd></div>)}</dl><p>최근 수정 메모</p><ul>{rules.changes.map(c=><li key={c.version}>v{c.version} · {c.note}</li>)}</ul>{prohibited.length>0&&<p role="alert">피할 표현 일치: {prohibited.join(', ')}. 문구를 수정해 주세요.</p>}<p>규칙 사본은 고객 승인이나 사실·이미지 검증이 아닙니다. 일반 초안은 사람이, AI 결과는 생성 지시와 함께 편집 화면에서 확인하세요.</p></details>;
}
