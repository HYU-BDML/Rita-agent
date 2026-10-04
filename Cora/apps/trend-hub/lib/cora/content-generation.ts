import {randomUUID} from 'node:crypto';
import {brandRulesPrompt,type BrandRules} from './brand-rules';
import {validateDraft,type Draft} from './model';
/** Shared orchestration accepts an injected generator for isolated contract tests; no retries. */
export async function generateCards(base:Draft,instructions:string,rules:BrandRules|undefined,extra:string,generate:(prompt:string)=>Promise<string>):Promise<Draft>{
 if(rules&&rules.clientId!==base.clientId)throw new Error('브랜드 규칙과 고객사 ID가 다릅니다.');
 const prompt=`제공 자료로 한국어 카드뉴스 ${base.slides.length}장을 작성하세요. JSON만 출력: {"slides":[{"headline":"80자 이내","body":"300자 이내"}],"caption":"게시 캡션"}. 첫 장은 표지, 마지막 장은 CTA. 사실을 지어내지 마세요.\n브랜드:${rules?.name??base.brief.brand}\n대상:${base.brief.audience}\n목표:${base.brief.goal}\n사용자 제작 지시:${instructions}\n${extra}\n${brandRulesPrompt(rules)}\n<material>${JSON.stringify(base.brief.material)}</material>`;
 const raw=await generate(prompt),parsed=JSON.parse(raw.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim());
 if(!Array.isArray(parsed.slides)||parsed.slides.length!==base.slides.length)throw new Error('AI 카드 장수가 맞지 않습니다. 기존 초안은 유지합니다.');
 return validateDraft({...base,brandRules:rules,brief:{...base.brief,...(rules?{brand:rules.name,accent:rules.accent}:{})},origin:'llmgw',slides:parsed.slides.map((s:{headline:string;body:string})=>({...s,id:randomUUID()})),caption:parsed.caption,workStatus:'draft'});
}
