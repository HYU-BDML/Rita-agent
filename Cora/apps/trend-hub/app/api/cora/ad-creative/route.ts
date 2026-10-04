import {clientScope} from '@/lib/cora/client-scope';
import { NextRequest } from 'next/server';
import { body, json, sameOrigin, user } from '@/lib/cora/http';
import { store } from '@/lib/cora/store';
import { AdCreativeStore, validateAdAccount, validateAdBrief } from '@/lib/cora/ad-creative';
import { generateText } from '@/lib/cora/gateway';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic'; export const maxDuration = 180;
const ads = () => store().module('ad-creative', db => new AdCreativeStore(db));
const fail=(e:unknown)=>{const m=e instanceof Error?e.message:'광고 제작에 실패했습니다.';return json({error:m==='NOT_FOUND'?'항목을 찾을 수 없습니다.':m},m==='NOT_FOUND'?404:400);};
export function GET(req:NextRequest){const u=user(req);if(!u)return json({error:'로그인이 필요합니다.'},401);try{const clientId=clientScope(req.nextUrl.searchParams.get('clientId')),a=ads().forClient(clientId);return store().withClientAccess(u.id,clientId,owner=>json({...(clientId&&owner===u.id?{personalProfiles:ads().profiles(owner)}:{}),clientId,profiles:a.profiles(owner),results:a.results(owner)}));}catch(e){return fail(e);}}
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return json({error:'허용되지 않은 요청입니다.'},403);
  const u=user(req); if (!u) return json({error:'로그인이 필요합니다.'},401);
  try {
    const b=await body(req),clientId=clientScope(b.clientId),a=ads().forClient(clientId);const owner=store().withClientAccess(u.id,clientId,id=>id),rules=clientId?store().clients.rules(owner,clientId):undefined;
    if (b.action==='profile') return store().withClientAccess(u.id,clientId,id=>json({profile:a.saveProfile(id,b.account,rules),clientId},201));
    if (b.action==='generate') {
      const account=validateAdAccount(b.account,rules),brief=validateAdBrief(b.brief);
      if (store().generationCount(u.id)>=10) return json({error:'하루 10회 로컬 생성 한도입니다.'},429);
      store().addItem(u.id,'run','계정 맞춤 광고안 생성',{handle:account.handle});
      const result=await a.generate(owner,account,brief,async prompt=>(await generateText(u.id,prompt)).text,write=>store().withClientAccess(u.id,clientId,id=>{if(id!==owner)throw new Error('NOT_FOUND');return write();}),rules);
      return json({result,brandRulesChanged:!!rules&&store().clients.get(owner,rules.clientId)!.version!==rules.version},201);
    }
    return json({error:'지원하지 않는 작업입니다.'},400);
  } catch(e) { return fail(e); }
}
