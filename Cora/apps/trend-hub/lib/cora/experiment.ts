/** Descriptive evidence for a human-authored next-content hypothesis; no causal scoring. */
export function experimentMaterial(analysis:Record<string,unknown>,hypothesis:unknown){
 if(typeof hypothesis!=='string'||hypothesis.trim().length<10||hypothesis.length>2000)throw new Error('다음 콘텐츠에서 시험할 가설을 10~2,000자로 적어 주세요.');
 if(analysis.source!=='manual-csv'||typeof analysis.summary!=='string'||!Array.isArray(analysis.rows))throw new Error('지원하는 성과 진단 자료가 아닙니다.');
 const warnings=Array.isArray(analysis.warnings)?analysis.warnings.map(String).slice(0,30):[];
 const text=['내부 콘텐츠 실험 기획 — 공개용 완성 문안이 아닙니다.',`관찰한 자료: ${analysis.summary}`,'관찰 차이는 인과효과나 향후 성장 보장이 아닙니다.',`시험할 가설: ${hypothesis.trim()}`,'제작 전에 보완: 대상 독자, 사실 근거, 바꿀 요소 한 가지, 비교 조건, 평가 기간을 직접 확인하세요.','평가 방법: 비슷한 계정·형식·광고 조건에서 다음 게시물의 도달과 저장을 기록하고 다시 비교하세요.',...warnings.map(w=>`자료 한계: ${w}`)].join('\n');
 return{text,hypothesis:hypothesis.trim(),source:'analysis-experiment',format:'experiment',measurement:'저장률(저장/도달), 도달 및 비교 조건 기록',limitations:warnings};
}
