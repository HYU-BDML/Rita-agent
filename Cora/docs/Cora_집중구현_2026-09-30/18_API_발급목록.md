# Cora 외부 연결용 API 발급 목록과 입력 위치

2026-09-30 작성. 교수님이 직접 발급해 한 파일에 넣으면, Cora 실행 스크립트가 그 값을 읽어 기능을 연결한다. 키 값은 채팅·문서·Git·Drive에 올리지 않는다.

## 키를 넣는 파일

교수님 Mac의 `~/.config/cora/secrets.env` 한 파일에 `이름=값` 형식으로 한 줄씩 적는다. 이 폴더는 Git과 Drive 동기화 폴더 밖이다. 파일을 만든 뒤 터미널에서 `chmod 600 ~/.config/cora/secrets.env`로 본인만 읽게 한다. Cora를 `node scripts/run-local.mjs`로 다시 시작하면 “외부 연결 설정 n개를 읽었습니다”가 표시되고, 로그인한 화면에서 `/api/cora/integrations`를 열면 연결별로 설정 여부(true·false)와 빠진 이름만 나온다.

```
CORA_META_APP_ID=
CORA_META_APP_SECRET=
CORA_META_REDIRECT_URI=http://127.0.0.1:3210/api/cora/connect/instagram/callback
```

## 새로 발급할 것 (우선순위 순)

| 순서 | 서비스 | 발급 위치 | 발급할 것 | 넣을 이름 | 쓰는 기능 | 비용 |
|---|---|---|---|---|---|---|
| 1 | Meta 개발자 앱 | developers.facebook.com → 앱 만들기 → 사용 사례 “Instagram API로 메시지 및 콘텐츠 관리” | 앱 ID, 앱 시크릿, 리디렉션 URI 등록 | CORA_META_APP_ID, CORA_META_APP_SECRET, CORA_META_REDIRECT_URI | Instagram 게시·댓글·DM·인사이트(F072·F075~F084·F085~F089·F093), Threads(F079) | 없음. 교수님 계정이 아닌 고객 계정을 연결하려면 Meta 앱 심사 필요 |
| 2 | Cloudflare R2(또는 S3 호환 저장소) | dash.cloudflare.com → R2 → 버킷 만들기 → 공개 접근 허용 → API 토큰 | 엔드포인트, 버킷 이름, 접근 키, 비밀 키, 공개 주소 | CORA_S3_ENDPOINT, CORA_S3_BUCKET, CORA_S3_ACCESS_KEY, CORA_S3_SECRET_KEY, CORA_S3_PUBLIC_BASE | SNS가 이미지·영상을 내려받을 공개 주소(모든 실제 게시의 전제) | 무료 구간이 있으나 금액 확인 필요 |
| 3 | Google Cloud OAuth 클라이언트 | console.cloud.google.com → API 및 서비스 → YouTube Data API v3 사용 → OAuth 동의 화면 → 사용자 인증 정보 | 클라이언트 ID, 클라이언트 보안 비밀 | CORA_GOOGLE_CLIENT_ID, CORA_GOOGLE_CLIENT_SECRET | YouTube 업로드(F074), Google 로그인(F098) | 없음. 검수 전 앱의 업로드는 비공개로만 올라감 |
| 4 | TikTok for Developers | developers.tiktok.com → 앱 만들기 → Content Posting API | 클라이언트 키, 클라이언트 시크릿 | CORA_TIKTOK_CLIENT_KEY, CORA_TIKTOK_CLIENT_SECRET | TikTok 게시(F073) | 없음. 심사 전 앱은 비공개 게시만 가능 |
| 5 | 토스페이먼츠 | developers.tosspayments.com → 테스트 키 | 테스트 클라이언트 키, 테스트 시크릿 키 | CORA_TOSS_CLIENT_KEY, CORA_TOSS_SECRET_KEY | 구독 결제(F102·F105) | 테스트 모드는 없음. 실결제 전환은 계약 필요 |
| 6 | 카카오 개발자 | developers.kakao.com → 내 애플리케이션 → 카카오 로그인 | REST API 키, Client Secret | CORA_KAKAO_REST_KEY, CORA_KAKAO_CLIENT_SECRET | 카카오 로그인(F098) | 없음 |
| 7 | ElevenLabs | elevenlabs.io → API Keys | API 키 | CORA_ELEVENLABS_API_KEY | 내 목소리 학습(F042) | 유료 요금제 필요(금액 확인 필요) |
| 8 | 메일 발송(Resend) | resend.com → API Keys, 보낼 도메인 인증 | API 키, 보내는 주소 | CORA_RESEND_API_KEY, CORA_MAIL_FROM | 알림 설정(F097), 팀 초대 메일(E201) | 무료 구간 있음(확인 필요) |
| 9 | X API | developer.x.com → 프로젝트·앱 | OAuth 2.0 클라이언트 ID·시크릿 | CORA_X_CLIENT_ID, CORA_X_CLIENT_SECRET | X 게시(F074) | 게시 가능한 요금제와 금액 확인 필요. 우선순위 가장 낮음 |

## 이미 있어 새로 발급하지 않는 것

교수님의 llmgw 설정(`~/.config/llmgw/.env`)에 이미 있는 키로 처리한다. YouTube Data API 키와 Apify 토큰은 실행 스크립트가 이름으로만 골라 Cora에 전달한다.

| 키 | 쓰는 기능 |
|---|---|
| DeepSeek(cora_test) | 카드·글·대본 생성(기존) |
| Perplexity | 기획 단계 웹 검색(F018), 영상 사실 검색(F040), 참고 콘텐츠 조사(F010) |
| OpenAI | 기본 음성 합성과 미리 듣기(F041), YouTube·영상 받아쓰기(F005), 참고 이미지 분석(F011~F013) |
| Gemini | 영상 분석(ask_video) |
| YouTube Data API | YouTube 영상 정보·자막 목록 조회(F005) |
| Apify | 인기 게시물(F009)·광고 소재(F008) 수집 |
| FAL | 이미지·영상 생성 보조(필요 시) |

OpenAI 음성 합성·받아쓰기와 이미지 분석은 llmgw에 아직 함수가 없다. 해당 기능을 만들 때 llmgw에 함수를 추가하되 기존 함수의 동작은 바꾸지 않는다.

## 발급 없이 구현하는 것

PDF→카드뉴스(F004)는 로컬 PDF 읽기로, Figma 내보내기(F024)는 Figma가 직접 불러올 수 있는 SVG 파일 내보내기로, 배경음악(F043)은 사용자가 올린 음원과 사용권 메모로, 원격 MCP(F107)·API 키 문서(F106)·크레딧 기록(F103·F104)·링크 페이지(F092)는 Cora 안에서 구현한다.

## 비용과 안전 규칙

- 실제 AI 생성 검수는 실행당 최대 3건, 자동 재시도·고급 모델 전환 없음 규칙을 유지한다.
- 실제 게시는 시험 전용 계정에만 하고, 플랫폼별 첫 실제 게시는 교수님이 화면에서 확인한 뒤 실행한다.
- 결제는 테스트 키로만 시험하고, 실제 결제 전환은 교수님 결정 뒤에 한다.
- 표에 “확인 필요”로 적은 금액은 각 서비스의 현재 요금표에서 교수님이 확인해야 한다.
