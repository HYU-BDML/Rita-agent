# Cora 무료 API 8종의 발급 방법

2026-09-30 작성. 카드 등록 없이 무료로 발급할 수 있는 API 8종의 발급 순서와, 발급한 값을 Cora에 넣는 방법을 정리했다. 무료 한도는 2026년 9월 공개 자료 기준이며 각 서비스가 바꿀 수 있으므로 발급할 때 요금표를 다시 확인한다.

## 1. 발급한 값을 Cora에 넣는 방법

발급 사이트가 주는 값은 `1234567890`이나 `abc123…` 같은 긴 문자열이다. Cora는 이 값을 교수님 Mac의 `~/.config/cora/secrets.env` 파일에서 **이름=값** 형식으로 읽는다. 등호 왼쪽 이름은 Cora 코드가 찾는 이름표(환경 변수 이름)이고, 아래 표의 글자를 대소문자까지 그대로 적어야 한다.

```
CORA_META_APP_ID=1234567890123456
CORA_META_APP_SECRET=a1b2c3d4e5f6
CORA_META_REDIRECT_URI=http://127.0.0.1:3210/api/cora/connect/instagram/callback
```

1. 터미널에서 `mkdir -p ~/.config/cora && touch ~/.config/cora/secrets.env && chmod 600 ~/.config/cora/secrets.env`를 실행해 교수님만 읽을 수 있는 빈 파일을 만든다.
2. 텍스트 편집기로 파일을 열어 발급한 값을 한 줄에 하나씩, 따옴표와 앞뒤 공백 없이 적는다.
3. Cora 폴더의 `apps/trend-hub`에서 `node scripts/run-local.mjs`로 다시 실행한다. 화면에 “외부 연결 설정 n개를 읽었습니다”가 나오고, n은 파일에 적은 줄 수와 같아야 한다.
4. 로그인한 브라우저에서 `http://127.0.0.1:3210/api/cora/integrations`를 열면 연결별 설정 여부(true·false)와 빠진 이름만 나온다. 값은 화면에 나오지 않는다.

아래 리디렉션 URI(`/api/cora/connect/…/callback`)는 키를 받은 뒤 Claude가 만들 계정 연결 화면의 주소이며, 2026-09-30 현재 코드에는 아직 없다. 발급할 때 주소를 미리 등록해 두면 연결 화면을 만든 뒤 설정을 다시 바꾸지 않아도 된다.

이 파일은 Git·Drive·채팅·문서에 올리지 않는다. 시크릿 값이 드러나면 다른 사람이 교수님 명의로 앱을 쓸 수 있다.

## 2. 무료 API 8종 한눈에

| 순서 | 서비스 | 쓰는 기능 | 무료 조건 | 넣을 이름 |
|---|---|---|---|---|
| 1 | Meta 개발자 앱 | Instagram 게시·릴스·댓글·DM·인사이트, Threads | 사용료 없음. 고객 계정 연결은 Meta 앱 심사 필요 | CORA_META_APP_ID, CORA_META_APP_SECRET, CORA_META_REDIRECT_URI |
| 2 | Google Cloud OAuth | YouTube 업로드, Google 로그인 | 사용료 없음. 검수 전 업로드는 비공개 | CORA_GOOGLE_CLIENT_ID, CORA_GOOGLE_CLIENT_SECRET |
| 3 | YouTube Data API 키 | YouTube 영상 정보 가져오기 | 하루 10,000단위(영상 정보 1건 1단위) | YOUTUBE_API_KEY |
| 4 | TikTok for Developers | TikTok 게시 | 사용료 없음. 심사 전 비공개 게시만 가능 | CORA_TIKTOK_CLIENT_KEY, CORA_TIKTOK_CLIENT_SECRET |
| 5 | 카카오 개발자 | 카카오 로그인 | 월 할당량 안에서 무료 | CORA_KAKAO_REST_KEY, CORA_KAKAO_CLIENT_SECRET |
| 6 | 토스페이먼츠 테스트 키 | 구독 결제 시험 | 테스트 키는 실제 청구 없음 | CORA_TOSS_CLIENT_KEY, CORA_TOSS_SECRET_KEY |
| 7 | Tavily | 기획 단계 웹 검색, 영상 사실 확인 | 월 1,000크레딧 | CORA_TAVILY_API_KEY |
| 8 | Resend | 알림 메일, 팀 초대 메일 | 월 3,000통, 하루 100통 | CORA_RESEND_API_KEY, CORA_MAIL_FROM |

YouTube Data API 키(3번)는 교수님 llmgw 설정에 이미 있어 새로 발급하지 않아도 된다. 실행 스크립트가 llmgw 설정에서 이 이름만 골라 Cora에 전달한다.

## 3. 서비스별 발급 순서

### 3-1. Meta 개발자 앱

1. developers.facebook.com에 교수님 Facebook 계정으로 로그인하고, 처음이면 개발자 계정 등록을 마친다.
2. “내 앱” → “앱 만들기”에서 사용 사례 “Instagram API로 메시지 및 콘텐츠 관리”를 고르고 앱 이름(예: Cora)을 적는다.
3. 앱 대시보드의 “앱 설정” → “기본 설정”에서 앱 ID를 `CORA_META_APP_ID`에, 앱 시크릿 코드(“보기” 클릭)를 `CORA_META_APP_SECRET`에 적는다.
4. “Instagram” → “API 설정” → “Instagram 로그인 설정”의 리디렉션 URI 칸에 `http://127.0.0.1:3210/api/cora/connect/instagram/callback`을 등록하고, 같은 주소를 `CORA_META_REDIRECT_URI`에 적는다.
5. “앱 역할” → “역할”에서 시험 전용 Instagram 전문가 계정을 Instagram 테스터로 초대하고, 그 계정의 Instagram 앱 설정에서 초대를 수락한다.

테스터로 등록한 계정은 심사 없이 게시·댓글·인사이트를 시험할 수 있다. 고객사의 계정을 연결하려면 이후 Meta 앱 심사(권한별 사용 목적 설명과 화면 녹화)를 받아야 한다.

### 3-2. Google Cloud OAuth

1. console.cloud.google.com에 교수님 Google 계정으로 로그인하고, 상단 프로젝트 선택에서 “새 프로젝트”(예: cora)를 만든다.
2. “API 및 서비스” → “라이브러리”에서 “YouTube Data API v3”를 찾아 “사용”을 누른다.
3. “OAuth 동의 화면”에서 사용자 유형 “외부”를 고르고 앱 이름·지원 이메일을 적은 뒤, 테스트 사용자에 교수님 계정과 조유경 계정을 추가한다.
4. “사용자 인증 정보” → “사용자 인증 정보 만들기” → “OAuth 클라이언트 ID”에서 유형 “웹 애플리케이션”을 고르고, 승인된 리디렉션 URI에 `http://127.0.0.1:3210/api/cora/connect/google/callback`을 등록한다.
5. 만들어진 클라이언트 ID를 `CORA_GOOGLE_CLIENT_ID`에, 클라이언트 보안 비밀을 `CORA_GOOGLE_CLIENT_SECRET`에 적는다.

### 3-3. YouTube Data API 키 (새로 필요할 때만)

1. 3-2의 프로젝트에서 “사용자 인증 정보” → “사용자 인증 정보 만들기” → “API 키”를 누른다.
2. 만든 키의 “키 제한”에서 API 제한을 “YouTube Data API v3”로만 설정한다.
3. 값을 `YOUTUBE_API_KEY`에 적는다.

한도를 늘리려고 프로젝트를 여러 개 만들어 한 서비스에 쓰면 YouTube API 정책 위반이며 모든 프로젝트가 정지될 수 있다. 학생은 각자 본인 계정으로 발급해 본인 컴퓨터에서만 쓴다.

### 3-4. TikTok for Developers

1. developers.tiktok.com에 교수님 TikTok 계정으로 로그인하고 개발자 등록을 마친다.
2. “Manage apps” → “Connect an app”으로 앱을 만들고, 제품 목록에서 “Content Posting API”와 “Login Kit”을 추가한다.
3. Login Kit 설정의 Redirect URI에 `http://127.0.0.1:3210/api/cora/connect/tiktok/callback`을 등록한다.
4. 앱 정보의 Client key를 `CORA_TIKTOK_CLIENT_KEY`에, Client secret을 `CORA_TIKTOK_CLIENT_SECRET`에 적는다.

심사(audit) 전에는 게시물이 본인만 보는 비공개로 올라간다. 공개 게시는 앱 심사를 통과해야 한다.

### 3-5. 카카오 개발자

1. developers.kakao.com에 교수님 카카오 계정으로 로그인하고 “내 애플리케이션” → “애플리케이션 추가하기”로 앱을 만든다.
2. “앱 키”의 REST API 키를 `CORA_KAKAO_REST_KEY`에 적는다.
3. “제품 설정” → “카카오 로그인”을 활성화하고 Redirect URI에 `http://127.0.0.1:3210/api/cora/connect/kakao/callback`을 등록한다.
4. “보안”에서 Client Secret 코드를 생성하고 활성화한 뒤, 값을 `CORA_KAKAO_CLIENT_SECRET`에 적는다.

### 3-6. 토스페이먼츠 테스트 키

1. developers.tosspayments.com에 가입하고 개발자센터에 로그인한다.
2. “API 키” 메뉴에서 `test_ck_`로 시작하는 테스트 클라이언트 키를 `CORA_TOSS_CLIENT_KEY`에, `test_sk_`로 시작하는 테스트 시크릿 키를 `CORA_TOSS_SECRET_KEY`에 적는다.

Cora는 `test_`로 시작하는 키만 받도록 막아 두었다. 실제 결제용 `live_` 키는 가맹 계약 뒤에 교수님이 결정한다.

### 3-7. Tavily

1. tavily.com에 가입한다(카드 불필요).
2. 대시보드의 API Keys에서 기본 키를 복사해 `CORA_TAVILY_API_KEY`에 적는다.

조유경 2주차 과제는 조유경 본인 계정의 키로 한다. 교수님 키를 학생과 공유하지 않는다.

### 3-8. Resend

1. resend.com에 가입한다(카드 불필요).
2. “Domains” → “Add Domain”에 메일을 보낼 도메인(예: 연구실 도메인)을 넣고, 안내하는 DNS 레코드(SPF·DKIM)를 도메인 관리 화면에 추가한 뒤 인증을 기다린다.
3. “API Keys” → “Create API Key”로 키를 만들어 `CORA_RESEND_API_KEY`에 적는다.
4. 인증한 도메인의 보낼 주소(예: `cora@인증한도메인`)를 `CORA_MAIL_FROM`에 적는다.

도메인 DNS를 수정할 권한이 필요하다. 권한이 없으면 메일 알림은 미뤄도 되고, 앱 안 알림은 그대로 동작한다.

## 4. 권장 발급 순서

Meta 앱(3-1)을 가장 먼저 발급한다. Instagram 계정 연결, 실제 게시, 릴스 숏츠 게시, 댓글·DM이 모두 이 앱에 달려 있다. 다만 실제 게시에는 SNS가 이미지를 가져갈 공개 저장소(Cloudflare R2)도 필요한데, R2는 무료 구간이 있어도 결제수단 등록이 필요할 수 있어 이 문서의 8종에서 뺐다(18_API_발급목록.md 참고). 그다음은 Google OAuth(3-2), TikTok(3-4), 나머지 순서로 발급한다.
