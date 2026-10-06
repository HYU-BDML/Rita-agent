import {NextRequest} from 'next/server';
import {json,user} from '@/lib/cora/http';
import {integrationStatus} from '@/lib/cora/integrations';
export const runtime='nodejs';export const dynamic='force-dynamic';
/** Which external services are configured on this server. Names and booleans only; never values. */
export function GET(req:NextRequest){if(!user(req))return json({error:'로그인이 필요합니다.'},401);return json({integrations:integrationStatus()});}
