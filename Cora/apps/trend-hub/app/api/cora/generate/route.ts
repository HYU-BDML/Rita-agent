import{productMode}from'@/lib/cora/release';
import{NextRequest}from'next/server';import{json,user,sameOrigin,body}from'@/lib/cora/http';import{store}from'@/lib/cora/store';import{generateText}from'@/lib/cora/gateway';import{validateDraft}from'@/lib/cora/model';import{knowledgeContext}from'@/lib/cora/platform/knowledge';import{generateCards}from'@/lib/cora/content-generation';
export const runtime='nodejs';export const maxDuration=180;
export async function POST(req:NextRequest){if(!sameOrigin(req))return json({error:'허용되지 않은 요청입니다.'},403);const u=user(req);if(!u)return json({error:'로그인이 필요합니다.'},401);
 try{const b=await body(req),base=validateDraft(b.draft),s=store();const rules=s.withClientAccess(u.id,base.clientId??null,owner=>base.clientId?s.clients.rules(owner,base.clientId):undefined);
 if(b.instructions!==undefined&&(typeof b.instructions!=='string'||b.instructions.length>2000))throw new Error('브랜드 지시는 2000자 이내입니다.');if(s.generationCount(u.id)>=10)return json({error:'하루 10회 로컬 생성 한도입니다.'},429);s.addItem(u.id,'run','AI 카드 생성',{});
 let generation:Awaited<ReturnType<typeof generateText>>|undefined;
 const draft=await generateCards(base,b.instructions??'',rules,productMode()==='labs'&&!rules?knowledgeContext(u.id,base.brief.brand,3000):'',async prompt=>{generation=await generateText(u.id,prompt);return generation.text;});
 return s.withClientAccess(u.id,base.clientId??null,owner=>json({draft,provider:generation!.provider,model:generation!.model,cost:generation!.cost,brandRulesChanged:!!rules&&s.clients.get(owner,rules.clientId)!.version!==rules.version}));
 }catch(e){const m=e instanceof Error?e.message:'AI 생성 실패';return json({error:m==='NOT_FOUND'?'고객사를 찾을 수 없습니다.':m},m==='NOT_FOUND'?404:400);}
}
