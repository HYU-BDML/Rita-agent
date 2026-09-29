/**
 * 어떤 키가 꽂혔고 그게 무엇을 열어주는지.
 *
 * 값은 절대 밖으로 내보내지 않는다. 있다/없다만 본다.
 * (키가 화면에 찍히면 그 순간 브라우저·스크린샷·로그로 새 나간다.)
 */
export interface KeyStatus {
  env: string;
  label: string;
  unlocks: string;
  where: string;
  paid?: boolean;
  set: boolean;
}

const SPEC: Omit<KeyStatus, 'set'>[] = [
  {
    env: 'DIFY_KEY_MATERIAL',
    label: '소재 찾기 (Dify)',
    unlocks: '뉴스·검색추이 기반 주제 판정을 Dify 워크플로우로 실행',
    where: "Dify → 소재 찾기 앱 → 'API 접근' → API 키 생성",
  },
  {
    env: 'DIFY_KEY_CHARACTER',
    label: '캐릭터 발굴 (Dify)',
    unlocks: '캐릭터 후보 발굴과 권리 귀속 판정',
    where: "Dify → 캐릭터 발굴 앱 → 'API 접근' → API 키 생성",
  },
  {
    env: 'DIFY_KEY_BENCHMARK',
    label: '벤치마크 (Dify)',
    unlocks: '후보에 따라 만들 본보기 붙이기',
    where: "Dify → 벤치마크 앱 → 'API 접근' → API 키 생성",
  },
  {
    env: 'DIFY_KEY_CARDNEWS',
    label: '카드뉴스 (Dify)',
    unlocks: '후보를 카드뉴스로 생성',
    where: "Dify → 카드뉴스 앱 → 'API 접근' → API 키 생성",
  },
  {
    env: 'DIFY_KEY_IMAGE',
    label: '이미지·포스터 (Dify)',
    unlocks: '후보의 이미지 프롬프트로 정지 이미지 생성',
    where: "Dify → 이미지 생성 앱 → 'API 접근' → API 키 생성",
  },
  {
    env: 'DIFY_KEY_REELS',
    label: '릴스·모션 (Dify)',
    unlocks: '후보의 모션 프롬프트로 짧은 영상 생성',
    where: "Dify → 릴스 앱 → 'API 접근' → API 키 생성",
  },
  {
    env: 'RENDER_BASE',
    label: '카드뉴스 렌더 서버',
    unlocks: '원고를 틀 8종 × 브랜드 겉모습 37벌로 구움. 없으면 브라우저 시안까지만 됩니다',
    where: '수업 렌더 서버 주소 (https://…onrender.com)',
  },
  {
    env: 'FAL_KEY',
    label: 'fal.ai (FLUX)',
    unlocks: '주제 포스터의 키비주얼 생성 (글자 없는 배경 한 장). 한글 카피는 브라우저가 얹습니다',
    where: 'Dify 이미지 생성 워크플로우 → 환경 변수 → FAL_KEY (또는 fal.ai → Dashboard → Keys)',
    paid: true,
  },
  {
    env: 'NAVER_ID',
    label: '네이버 (ID)',
    unlocks: '검색 급상승 판정 — 최근/평소, 작년 대비',
    where: 'Dify 소재 찾기 워크플로우 → 환경 변수 → NAVER_ID',
  },
  {
    env: 'NAVER_SECRET',
    label: '네이버 (Secret)',
    unlocks: '위와 같음',
    where: 'Dify 소재 찾기 워크플로우 → 환경 변수 → NAVER_SECRET',
  },
  {
    env: 'YOUTUBE_KEY',
    label: '유튜브',
    unlocks: '본보기 영상, 채널 대비 성과 배수',
    where: 'Dify 워크플로우 → 환경 변수 → YOUTUBE_KEY',
  },
  {
    env: 'TIKHUB_KEY',
    label: '틱톡·인스타·X',
    unlocks: '캐릭터 발굴 수집 (소셜 3개 플랫폼)',
    where: 'Dify 캐릭터 발굴 워크플로우 → 환경 변수 → TIKHUB_KEY',
    paid: true,
  },
  {
    env: 'ANTHROPIC_API_KEY',
    label: 'Claude',
    unlocks: '이름 추출·권리 판정 등 LLM 단계를 앱이 직접 실행',
    where: 'console.anthropic.com → API Keys',
    paid: true,
  },
  {
    env: 'KIPRIS_SERVICE_KEY',
    label: '특허청 KIPRIS',
    unlocks: '상표 등록 여부로 권리 귀속 판정 뒷받침 (LLM 추정이 아닌 공적 기록)',
    where: 'plus.kipris.or.kr → 마이페이지 → 인증키',
  },
];

export function keyStatuses(): KeyStatus[] {
  return SPEC.map((s) => ({ ...s, set: Boolean(process.env[s.env]?.trim()) }));
}
