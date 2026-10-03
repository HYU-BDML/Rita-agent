import { NextRequest } from 'next/server';
import { body, json, sameOrigin, user } from '@/lib/cora/http';
import { store } from '@/lib/cora/store';
import { AdCreativeStore, validateAdAccount, validateAdBrief } from '@/lib/cora/ad-creative';
import { generateText } from '@/lib/cora/gateway';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic'; export const maxDuration = 180;
const ads = () => store().module('ad-creative', db => new AdCreativeStore(db));
export function GET(req: NextRequest) { const u=user(req);return u?json({profiles:ads().profiles(u.id),results:ads().results(u.id)}):json({error:'로그인이 필요합니다.'},401); }
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return json({error:'허용되지 않은 요청입니다.'},403);
  const u=user(req); if (!u) return json({error:'로그인이 필요합니다.'},401);
  try {
    const b=await body(req);
    if (b.action==='profile') return json({profile:ads().saveProfile(u.id,b.account)},201);
    if (b.action==='generate') {
      const account=validateAdAccount(b.account),brief=validateAdBrief(b.brief);
      if (store().generationCount(u.id)>=10) return json({error:'하루 10회 로컬 생성 한도입니다.'},429);
      store().addItem(u.id,'run','계정 맞춤 광고안 생성',{handle:account.handle});
      const result=await ads().generate(u.id,account,brief,async prompt=>(await generateText(u.id,prompt)).text);
      return json({result},201);
    }
    return json({error:'지원하지 않는 작업입니다.'},400);
  } catch(e) { return json({error:e instanceof Error?e.message:'광고 제작에 실패했습니다.'},400); }
}
