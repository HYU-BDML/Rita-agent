# 무료 API 8종의 발급 방법

2026-10-01 작성. 카드 등록 없이 무료로 발급할 수 있는 API 8종의 발급 순서와, 발급한 값을 기록하는 방법을 정리했다. 무료 한도는 2026년 9월 공개 자료 기준이며 각 서비스가 바꿀 수 있으므로 발급할 때 요금표를 다시 확인한다.

## 1. 이름은 발급자 이니셜로 짓는다

발급 과정에서 만드는 앱·프로젝트·키의 이름은 모두 **발급자 이니셜**로 시작한다. 여러 사람이 같은 서비스에서 발급해도 누구의 것인지 바로 구분되고, 문제가 생겼을 때 해당 발급자만 조치하면 되기 때문이다.

| 만드는 것 | 이름 규칙 | 예시(발급자 조유경, 이니셜 JYK) |
|---|---|---|
| 앱·프로젝트 이름 | 이니셜-용도-번호 | JYK-social-01 |
| API 키 이름(서비스 화면에서 붙이는 이름) | 이니셜-서비스-용도 | JYK-youtube-dev |
| 값을 기록하는 줄 이름 | 이니셜_서비스_항목 | JYK_META_APP_ID |

이니셜은 영문 대문자 2~4자로 정하고, 한 사람은 모든 서비스에서 같은 이니셜을 쓴다.

## 2. 발급한 값을 기록하는 방법

발급 사이트가 주는 값은 `1234567890`이나 `abc123…` 같은 긴 문자열이다. 이 값은 본인 컴퓨터의 개인 파일 하나에 **이름=값** 형식으로 한 줄씩 적는다.

```
JYK_META_APP_ID=1234567890123456
JYK_META_APP_SECRET=a1b2c3d4e5f6
JYK_TAVILY_API_KEY=tvly-xxxxxxxx
```

1. 터미널에서 `mkdir -p ~/.config/api-keys && touch ~/.config/api-keys/keys.env && chmod 600 ~/.config/api-keys/keys.env`를 실행해 본인만 읽을 수 있는 빈 파일을 만든다.
2. 텍스트 편집기로 파일을 열어 발급한 값을 한 줄에 하나씩, 따옴표와 앞뒤 공백 없이 적는다.
3. 이 파일은 Git·Drive·Dropbox·채팅·문서에 올리지 않고, 다른 사람과 키를 공유하지 않는다. 시크릿 값이 드러나면 다른 사람이 발급자 명의로 앱을 쓸 수 있다.
4. 한도를 늘리려고 여러 사람의 키를 모아 한 서비스에서 번갈아 쓰지 않는다. YouTube API 정책은 이 방식을 금지하며, 적발되면 발급자의 모든 프로젝트가 정지될 수 있다.

리디렉션 URI(로그인 뒤 돌아올 주소)를 묻는 칸에는 교수님이 알려 주는 주소를 넣는다. 아직 받지 못했다면 비워 두거나 `http://127.0.0.1:3210/callback`을 임시로 넣고, 나중에 앱 설정에서 추가한다.

## 3. 무료 API 8종 한눈에

| 순서 | 서비스 | 쓰는 기능 | 무료 조건 | 기록할 줄 이름(JYK 예시) |
|---|---|---|---|---|
| 1 | Meta 개발자 앱 | Instagram 게시·릴스·댓글·DM·인사이트, Threads | 사용료 없음. 다른 사람 계정 연결은 Meta 앱 심사 필요 | JYK_META_APP_ID, JYK_META_APP_SECRET, JYK_IG_APP_ID, JYK_IG_APP_SECRET |
| 2 | Google Cloud OAuth | YouTube 업로드, Google 로그인 | 사용료 없음. 검수 전 업로드는 비공개 | JYK_GOOGLE_CLIENT_ID, JYK_GOOGLE_CLIENT_SECRET |
| 3 | YouTube Data API 키 | YouTube 영상 정보 가져오기 | 하루 10,000단위(영상 정보 1건 1단위) | JYK_YOUTUBE_API_KEY |
| 4 | TikTok for Developers | TikTok 게시 | 사용료 없음. 심사 전 비공개 게시만 가능 | JYK_TIKTOK_CLIENT_KEY, JYK_TIKTOK_CLIENT_SECRET |
| 5 | 카카오 개발자 | 카카오 로그인 | 월 할당량 안에서 무료 | JYK_KAKAO_REST_KEY, JYK_KAKAO_CLIENT_SECRET |
| 6 | 토스페이먼츠 테스트 키 | 구독 결제 시험 | 테스트 키는 실제 청구 없음 | JYK_TOSS_CLIENT_KEY, JYK_TOSS_SECRET_KEY |
| 7 | Tavily | 웹 검색, 사실 확인 | 월 1,000크레딧 | JYK_TAVILY_API_KEY |
| 8 | Resend | 알림 메일 | 월 3,000통, 하루 100통 | JYK_RESEND_API_KEY, JYK_MAIL_FROM |

## 4. 서비스별 발급 순서

### 4-1. Meta 개발자 앱

1. developers.facebook.com에 본인 Facebook 계정으로 로그인하고, 처음이면 개발자 계정 등록을 마친다.
2. “내 앱” → “앱 만들기”에서 사용 사례 “Instagram API로 메시지 및 콘텐츠 관리”를 고르고, 앱 이름을 `이니셜-social-01`(예: JYK-social-01)로 적는다.
3. 앱 대시보드의 “앱 설정” → “기본 설정”에서 앱 ID를 `이니셜_META_APP_ID`에, 앱 시크릿 코드(“보기” 클릭)를 `이니셜_META_APP_SECRET`에 적는다.
4. “Instagram” 제품의 Instagram 로그인 API 설정 화면에서 Instagram 앱 ID를 `이니셜_IG_APP_ID`에, Instagram 앱 시크릿을 `이니셜_IG_APP_SECRET`에 적는다. 이 두 값은 3번의 Meta 앱 ID·시크릿과 다른 값이며, Instagram 계정 연결에는 이 두 값이 쓰인다(화면 메뉴 이름은 발급할 때 확인 필요).
5. 같은 화면의 비즈니스 로그인 설정에서 리디렉션 URI 칸에 교수님이 알려 준 주소를 등록한다. Cora의 연결 주소는 `https://(Cora 주소)/api/cora/connect/instagram/callback` 형식이다.
6. “앱 역할” → “역할”에서 시험 전용 Instagram 전문가 계정을 Instagram 테스터로 초대하고, 그 계정의 Instagram 앱 설정에서 초대를 수락한다.

테스터로 등록한 계정은 심사 없이 게시·댓글·인사이트를 시험할 수 있다. 다른 사람의 계정을 연결하려면 Meta 앱 심사(권한별 사용 목적 설명과 화면 녹화)를 받아야 한다.

### 4-2. Google Cloud OAuth

1. console.cloud.google.com에 본인 Google 계정으로 로그인하고, 상단 프로젝트 선택에서 “새 프로젝트”를 `이니셜-social-01`로 만든다.
2. “API 및 서비스” → “라이브러리”에서 “YouTube Data API v3”를 찾아 “사용”을 누른다.
3. “OAuth 동의 화면”에서 사용자 유형 “외부”를 고르고, 앱 이름을 `이니셜-social-01`로, 지원 이메일을 본인 이메일로 적은 뒤, 테스트 사용자에 본인 계정을 추가한다.
4. “사용자 인증 정보” → “사용자 인증 정보 만들기” → “OAuth 클라이언트 ID”에서 유형 “웹 애플리케이션”을 고르고, 이름을 `이니셜-google-login`으로 적은 뒤 승인된 리디렉션 URI에 교수님이 알려 준 주소를 등록한다.
5. 만들어진 클라이언트 ID를 `이니셜_GOOGLE_CLIENT_ID`에, 클라이언트 보안 비밀을 `이니셜_GOOGLE_CLIENT_SECRET`에 적는다.

### 4-3. YouTube Data API 키

1. 4-2에서 만든 프로젝트의 “사용자 인증 정보” → “사용자 인증 정보 만들기” → “API 키”를 누른다.
2. 만든 키의 이름을 `이니셜-youtube-dev`로 바꾸고, “키 제한”에서 API 제한을 “YouTube Data API v3”로만 설정한다.
3. 값을 `이니셜_YOUTUBE_API_KEY`에 적는다.

한 사람은 프로젝트를 하나만 쓴다. 한도를 늘리려고 프로젝트를 여러 개 만들면 YouTube API 정책 위반이다.

### 4-4. TikTok for Developers

1. developers.tiktok.com에 본인 TikTok 계정으로 로그인하고 개발자 등록을 마친다.
2. “Manage apps” → “Connect an app”으로 앱을 `이니셜-social-01`로 만들고, 제품 목록에서 “Content Posting API”와 “Login Kit”을 추가한다.
3. Login Kit 설정의 Redirect URI에 교수님이 알려 준 주소를 등록한다.
4. 앱 정보의 Client key를 `이니셜_TIKTOK_CLIENT_KEY`에, Client secret을 `이니셜_TIKTOK_CLIENT_SECRET`에 적는다.

심사(audit) 전에는 게시물이 본인만 보는 비공개로 올라간다. 공개 게시는 앱 심사를 통과해야 한다.

### 4-5. 카카오 개발자

1. developers.kakao.com에 본인 카카오 계정으로 로그인하고 “내 애플리케이션” → “애플리케이션 추가하기”로 앱을 `이니셜-social-01`로 만든다.
2. “앱 키”의 REST API 키를 `이니셜_KAKAO_REST_KEY`에 적는다.
3. “제품 설정” → “카카오 로그인”을 활성화하고 Redirect URI에 교수님이 알려 준 주소를 등록한다.
4. “보안”에서 Client Secret 코드를 생성하고 활성화한 뒤, 값을 `이니셜_KAKAO_CLIENT_SECRET`에 적는다.

### 4-6. 토스페이먼츠 테스트 키

1. developers.tosspayments.com에 가입하고 개발자센터에 로그인한다. 상점 이름을 묻는 칸에는 `이니셜-test`를 적는다.
2. “API 키” 메뉴에서 `test_ck_`로 시작하는 테스트 클라이언트 키를 `이니셜_TOSS_CLIENT_KEY`에, `test_sk_`로 시작하는 테스트 시크릿 키를 `이니셜_TOSS_SECRET_KEY`에 적는다.

실제 결제용 `live_` 키는 발급하지 않는다. 실결제 전환은 가맹 계약 뒤 교수님이 결정한다.

### 4-7. Tavily

1. tavily.com에 본인 이메일로 가입한다(카드 불필요).
2. 대시보드의 API Keys에서 새 키를 만들어 이름을 `이니셜-search-dev`로 붙이고, 값을 `이니셜_TAVILY_API_KEY`에 적는다.

### 4-8. Resend

1. resend.com에 본인 이메일로 가입한다(카드 불필요).
2. “Domains” → “Add Domain”에 메일을 보낼 도메인을 넣고, 안내하는 DNS 레코드(SPF·DKIM)를 도메인 관리 화면에 추가한 뒤 인증을 기다린다.
3. “API Keys” → “Create API Key”로 키를 만들어 이름을 `이니셜-mail-dev`로 붙이고, 값을 `이니셜_RESEND_API_KEY`에 적는다.
4. 인증한 도메인의 보낼 주소(예: `noreply@인증한도메인`)를 `이니셜_MAIL_FROM`에 적는다.

도메인 DNS를 수정할 권한이 필요하다. 권한이 없으면 이 서비스는 발급하지 않아도 된다.

## 5. 권장 발급 순서

Meta 앱(4-1)을 가장 먼저 발급한다. Instagram 계정 연결, 실제 게시, 릴스 게시, 댓글·DM이 모두 이 앱에 달려 있다. 그다음은 Google OAuth(4-2)와 YouTube 키(4-3), TikTok(4-4), 나머지 순서로 발급한다. 발급을 마치면 교수님께 “어느 서비스를 어떤 이니셜 이름으로 발급했는지”만 알리고, 키 값은 보내지 않는다.
