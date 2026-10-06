/** Local configuration checks only: never calls Meta or exposes configuration values. */
export type InstagramSetupCheck = { id: string; label: string; ready: boolean; help: string };
export function instagramReadiness(env: Record<string, string | undefined> = process.env) {
  const has = (key: string) => !!env[key]?.trim();
  let callbackValid = false, originMatches = false;
  try {
    const callback = new URL(env.CORA_IG_REDIRECT_URI ?? '');
    callbackValid = callback.protocol === 'https:' && !callback.username && !callback.password && !callback.search && !callback.hash && callback.pathname === '/api/cora/connect/instagram/callback';
    const origin = new URL(env.CORA_ORIGIN ?? '');
    originMatches = callback.origin === origin.origin;
  } catch { /* absent or malformed configuration */ }
  const checks: InstagramSetupCheck[] = [
    { id: 'app', label: 'Instagram 앱 설정', ready: has('CORA_IG_APP_ID') && has('CORA_IG_APP_SECRET'), help: 'Meta 개발자 앱의 Instagram 설정에서 앱 ID와 앱 시크릿을 서버에 저장합니다. 계정 비밀번호가 아닙니다.' },
    { id: 'encryption', label: '연결 정보 암호화', ready: has('CORA_SECRET_KEY'), help: '서버의 토큰 암호화 키를 준비합니다. 이미 연결한 계정이 있으면 키를 임의로 바꾸지 않습니다.' },
    { id: 'callback', label: 'HTTPS 로그인 복귀 주소', ready: callbackValid, help: 'Meta 앱과 서버에 같은 HTTPS 복귀 주소를 등록합니다. 경로는 /api/cora/connect/instagram/callback 입니다.' },
    { id: 'origin', label: 'Cora 접속 주소 일치', ready: originMatches, help: '로그인을 시작하는 Cora 주소와 복귀 주소의 도메인이 같아야 합니다. 로컬 주소에서 시작해 다른 도메인으로 돌아오면 Cora 로그인 세션을 찾지 못합니다.' },
  ];
  return { checks, localConfigReady: checks.every(c => c.ready), accountAuthorizationVerified: false, livePublishingEnabled: false,
    mediaConfigured: ['CORA_S3_ENDPOINT','CORA_S3_BUCKET','CORA_S3_ACCESS_KEY','CORA_S3_SECRET_KEY','CORA_S3_PUBLIC_BASE'].every(has),
    note: '설정 존재와 주소 형식만 점검합니다. 앱 권한·시험 사용자 등록·실제 연결 성공은 Instagram 승인 과정에서 확인합니다.' };
}
