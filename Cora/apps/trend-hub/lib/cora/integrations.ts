/**
 * Registry of external services Cora can call. Only environment variable NAMES live here; values are read
 * from process.env at run time (loaded by scripts/run-local.mjs from ~/.config/cora/secrets.env, outside Git).
 * status() reports configured/not configured and never returns a value.
 * `llmgw` entries are served through the existing local gateway (~/.config/llmgw), not through Cora env vars.
 */
export type Integration = { id: string; label: string; env: string[]; via?: 'llmgw'; features: string[]; note: string };
export const INTEGRATIONS: Integration[] = [
  { id: 'meta', label: 'Meta 개발자 앱(Instagram·Threads)', env: ['CORA_META_APP_ID', 'CORA_META_APP_SECRET', 'CORA_META_REDIRECT_URI'], features: ['F093', 'F072', 'F075', 'F076', 'F077', 'F080', 'F081', 'F082', 'F083', 'F084', 'F079', 'F085', 'F086', 'F087', 'F088', 'F089'], note: 'Instagram 로그인으로 계정 연결, 게시·댓글·DM·인사이트, Threads' },
  { id: 'media', label: '공개 이미지·영상 저장소(Cloudflare R2 등 S3 호환)', env: ['CORA_S3_ENDPOINT', 'CORA_S3_BUCKET', 'CORA_S3_ACCESS_KEY', 'CORA_S3_SECRET_KEY', 'CORA_S3_PUBLIC_BASE'], features: ['F093', 'F072', 'F073', 'F074'], note: 'SNS가 내려받을 공개 HTTPS 주소' },
  { id: 'tiktok', label: 'TikTok for Developers 앱', env: ['CORA_TIKTOK_CLIENT_KEY', 'CORA_TIKTOK_CLIENT_SECRET'], features: ['F073'], note: '심사 전 앱은 비공개 게시만 가능' },
  { id: 'google', label: 'Google Cloud OAuth 클라이언트', env: ['CORA_GOOGLE_CLIENT_ID', 'CORA_GOOGLE_CLIENT_SECRET'], features: ['F074', 'F098'], note: 'YouTube 업로드와 Google 로그인' },
  { id: 'kakao', label: '카카오 로그인 앱', env: ['CORA_KAKAO_REST_KEY', 'CORA_KAKAO_CLIENT_SECRET'], features: ['F098'], note: '카카오 로그인' },
  { id: 'payments', label: '토스페이먼츠 테스트 키', env: ['CORA_TOSS_CLIENT_KEY', 'CORA_TOSS_SECRET_KEY'], features: ['F102', 'F105'], note: '구독 결제(테스트 모드)' },
  { id: 'voice', label: 'ElevenLabs(내 목소리 학습)', env: ['CORA_ELEVENLABS_API_KEY'], features: ['F042'], note: '목소리 복제. 기본 음성은 OpenAI로 처리' },
  { id: 'x', label: 'X(트위터) API', env: ['CORA_X_CLIENT_ID', 'CORA_X_CLIENT_SECRET'], features: ['F074'], note: '게시 가능 요금제 확인 필요' },
  { id: 'email', label: '메일 발송(Resend 등)', env: ['CORA_RESEND_API_KEY', 'CORA_MAIL_FROM'], features: ['F097', 'E201'], note: '알림·초대 메일' },
  { id: 'openai', label: 'OpenAI(음성 합성·받아쓰기·이미지 분석)', env: [], via: 'llmgw', features: ['F041', 'F005', 'F011', 'F012', 'F013'], note: '기존 llmgw 키 사용' },
  { id: 'perplexity', label: 'Perplexity(웹 검색)', env: [], via: 'llmgw', features: ['F018', 'F040', 'F010'], note: '기존 llmgw 키 사용' },
  { id: 'apify', label: 'Apify(인기 게시물·광고 수집)', env: ['APIFY_API_TOKEN'], features: ['F008', 'F009'], note: 'llmgw 설정에 이미 있는 토큰을 실행 스크립트가 이름으로 전달' },
  { id: 'youtube', label: 'YouTube Data API 키', env: ['YOUTUBE_API_KEY'], features: ['F005'], note: 'llmgw 설정에 이미 있는 키를 실행 스크립트가 이름으로 전달' },
];
export function integrationStatus(env: NodeJS.ProcessEnv = process.env) {
  return INTEGRATIONS.map(i => ({ id: i.id, label: i.label, features: i.features, note: i.note, via: i.via ?? 'cora', configured: i.via === 'llmgw' ? null : i.env.every(k => typeof env[k] === 'string' && env[k]!.trim() !== ''), missing: i.via === 'llmgw' ? [] : i.env.filter(k => !env[k]?.trim()) }));
}
export function requireIntegration(id: string, env: NodeJS.ProcessEnv = process.env) {
  const s = integrationStatus(env).find(x => x.id === id); if (!s) throw new Error('알 수 없는 연결입니다.');
  if (s.configured === false) throw Object.assign(new Error(`${s.label} 연결 정보가 없습니다. 발급 목록 문서(18_API_발급목록.md)를 참고해 설정해 주세요.`), { code: 'NOT_CONFIGURED', missing: s.missing });
  return s;
}
