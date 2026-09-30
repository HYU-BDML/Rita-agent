# 무료 API 판단과 조유경 첫 3주 과제

2026-09-30 작성. 교수님이 판단하실 두 가지를 다룬다. 첫째는 어떤 외부 API를 무료로 만들어도 되는지와 유료가 더 유연한 경우이고, 둘째는 무료로 가능한 것 가운데 조유경이 직접 만들 과제다. 무료 한도는 2026년 9월 공개 자료를 기준으로 했으며 각 서비스가 예고 없이 바꿀 수 있으므로, 발급할 때 공식 요금표를 다시 확인해야 한다.

## 1. 결론

무료 등급으로 개발·시험을 끝낼 수 있는 API는 YouTube Data API, Tavily 웹 검색, Gemini(AI Studio), 로컬 받아쓰기(whisper.cpp), Instagram 공식 API, Cloudflare R2, Resend, 카카오 로그인, 토스 테스트 키다. 이 가운데 신용카드 없이 개인 계정으로 발급할 수 있고 인증·결제·실제 게시를 건드리지 않는 네 가지(YouTube, Tavily, Gemini, whisper.cpp)를 조유경 과제로 배정한다. 유료가 더 유연한 곳은 고객 자료를 AI에 넣는 경우(Gemini 무료 등급의 자료 이용 조건), 목소리 복제(ElevenLabs), X 게시, 대량 웹 검색이다.

## 2. 무료로 가능한 것과 유료가 나은 것

| 쓰는 기능 | 무료 선택지와 한도 | 유료로 바꿀 때 얻는 것 | 판단 | 조유경 과제 |
|---|---|---|---|---|
| YouTube 영상 정보 가져오기(F005) | YouTube Data API. 사용료 없음, 프로젝트당 하루 10,000단위, 영상 정보 1건 1단위·검색 1건 100단위 | 공개 유료 등급 없음. 할당량 증액 신청만 가능 | 무료로 충분 | 1주차 |
| 기획 단계 웹 검색(F018), 영상 사실 확인(F040) | Tavily 월 1,000크레딧, 카드 불필요, 기본 검색 1크레딧 | 월 1,000건을 넘는 운영, 속도. 교수님 llmgw의 Perplexity도 이미 있음 | 개발·시험은 무료, 운영 규모가 커지면 유료 | 2주차 |
| 음성 받아쓰기(자막 자동 생성, E207·F005) | whisper.cpp를 교수님·학생 Mac에서 직접 실행. 키·사용료 없음, 한국어 지원 | OpenAI 받아쓰기 API는 설치 없이 빠르지만 사용료 발생 | 무료(로컬)로 충분 | 3주차 |
| 참고 이미지 분석(F011~F013) | Gemini API(AI Studio) 무료 등급, 카드 불필요. 분당 10~15회 수준이며 계정마다 한도가 다름 | 무료 등급은 입력 자료가 서비스 개선에 쓰일 수 있어 고객 자료에는 부적합(약관 확인 필요). 유료는 이 조건과 한도가 풀림 | 공개 이미지 시험은 무료, 고객 이미지는 유료 | 3주차 선택 과제 |
| 기본 음성 합성(F041) | Google Cloud TTS 월 400만 자(표준 음성)·100만 자(WaveNet). 결제 계정 등록 필요 | ElevenLabs는 자연스러움이 높음 | 무료로 시작 가능, 결제 계정은 교수님 명의 | 교수님·AI |
| 내 목소리 학습(F042) | 무료 없음. ElevenLabs 무료는 월 1만 자이고 복제 기능 없음 | 즉시 복제는 Starter 월 6달러부터 | 유료 필요 | 교수님·AI |
| Instagram 게시·댓글·DM·인사이트 | 사용료 없음. 고객 계정 연결에는 Meta 앱 심사, 사용자당 시간 200회 호출 한도 | 유료 등급 없음 | 무료. 앱 소유·심사는 교수님 | 교수님·AI |
| 공개 이미지 저장소 | Cloudflare R2 저장 10GB, 내보내기 트래픽 무료 | 10GB 초과분 | 무료로 충분 | 교수님·AI |
| 알림 메일(F097) | Resend 월 3,000통·하루 100통. 보내는 도메인 인증 필요 | 발송량 증가 | 무료로 충분 | 교수님·AI |
| 카카오 로그인(F098) | 월 할당량 안에서 무료 | 없음 | 무료. 인증이므로 학생 단독 배정 제외 | 교수님·AI |
| 구독 결제(F102) | 토스 테스트 키 무료, 실제 청구 없음 | 실결제는 가맹 계약 | 시험은 무료 | 교수님·AI |
| X 게시(F074) | 2026년 신규 개발자에게 무료 등급 없음, 게시 1건 0.015달러 | 사용량 과금만 있음 | 우선순위 최하 | 제외 |
| 웹 검색 대안 | Brave Search는 2026년부터 신규 무료 등급 폐지(월 5달러 크레딧) | 사용량 과금 | Tavily를 우선 사용 | 제외 |
| 인기 게시물·광고 수집(F008·F009) | Apify 월 5달러 크레딧(교수님 키 있음) | 수집량 증가 | 교수님 키로 시험. 플랫폼 이용약관 검토 필요 | 교수님·AI |

## 3. 조유경에게 배정하는 기준

조유경이 직접 만드는 API는 네 가지 조건을 모두 만족해야 한다. ①조유경 본인 계정으로 카드 없이 무료 발급된다. ②로그인·결제·실제 게시·다른 사람 자료를 다루지 않는다. ③Cora에 이미 있는 어댑터 방식(가짜 응답 시험 + 실제 키 검증)을 그대로 따라 만들 수 있다. ④실패해도 서비스 운영에 영향이 없다. 키는 조유경 컴퓨터의 `~/.config/cora/secrets.env`에만 두고 교수님 키를 공유하지 않는다.

## 4. 첫 3주 과제 (주 4~5시간)

10주 계획의 1~3주차 과제를 아래와 같이 정한다. 매주 “제품 사용”과 “무료 API 연결”을 함께 해서, 제품을 쓰는 경험과 직접 만드는 경험이 같이 쌓이게 한다.

| 주 | 제품 사용(약 2시간) | 무료 API 연결(약 2.5시간) | 제출물 | 완료 판정 |
|---|---|---|---|---|
| 1주차 | 설치, 예시 자료로 카드 4장 생성·수정·저장, 두 번째 계정으로 검토 승인, 모의 게시 자동 진행까지 전체 흐름 1회 | YouTube Data API 키 발급 → 이미 만든 YouTube 가져오기(F005)를 실제 키로 검증. 공개 한국어 영상 주소 5개(일반·youtu.be·쇼츠·재생목록 포함 주소·삭제된 영상)로 결과와 오류 문구 기록, 발견한 문제 1건을 패치로 수정 | 검수표, 영상 5건 결과표, 패치 1건 | 5건 모두 결과 또는 이유가 적힌 오류가 표시되고, 패치가 빌드·시험을 통과 |
| 2주차 | 가상 대행사 브랜드 3개 설정, 브랜드별 카드뉴스 1건씩 제작하며 건별 소요 시간·고친 카드 수 기록 | Tavily 무료 키 → 기획 단계 웹 검색(F018) 연결. `lib/cora/search/tavily.ts` 어댑터(가짜 응답 시험 포함)와 소재 탐색 탭의 “웹 검색” 결과 표시를 AI와 함께 만들고, 브랜드 3개 주제로 검색 3회 실험 | 사용실험기록 3행, 패치 1건, 검색 결과 비교표 | 가짜 응답 시험과 실제 검색이 모두 통과하고 검색 결과에 출처 URL과 검색 시각이 남음 |
| 3주차 | 개요 먼저 승인하는 블로그 흐름으로 글 2건 작성, 검토·승인·게시 준비까지 진행하고 버그 3건 재현 보고 | whisper.cpp 설치 → 본인이 찍은 30초~1분 영상의 한국어 자막 SRT 생성 → Cora의 장편 영상 클립 기능(E207)에 넣어 클립 만들기. 받아쓰기 정확도(틀린 어절 수/전체 어절 수)를 영상 2개로 측정 | 버그 보고 3건, SRT 2개와 정확도 표, 설치 절차 메모 | SRT가 Cora에서 읽히고, 정확도를 숫자로 기록 |

선택 과제(3주차에 시간이 남거나 whisper 설치가 막힐 때): Gemini 무료 키로 공개 카드뉴스 이미지 5장을 분석해 색·배치·글자 크기 규칙을 JSON으로 받고, Cora 카드 디자인 설정으로 옮겨 비교한다. 고객 이미지는 넣지 않는다. Cora의 AI 호출 규칙상 llmgw를 거쳐야 하므로, 조유경 컴퓨터의 llmgw에 Gemini 키를 넣고 이미지 입력이 되는지 먼저 확인해야 한다(확인 필요).

## 5. 교수님이 먼저 해 주실 일

1. 조유경이 Cora 코드를 내려받을 수 있도록 공개 저장소 주소와 브랜치 이름(`cora/project-bootstrap`)을 전달한다. GitHub 계정은 필요 없다.
2. 조유경의 AI 기능 시험 방식(교수님 명의 DeepSeek 키 추가 발급, 또는 AI 기능은 교수님 컴퓨터에서 주 1회 시험)을 정한다.
3. 1주차가 끝나면 조유경이 올린 패치 파일을 AI가 적용·시험하도록 지시한다.

## 참고 자료

- YouTube Data API 할당량: https://www.getphyllo.com/post/youtube-api-limits-how-to-calculate-api-usage-cost-and-fix-exceeded-api-quota
- Tavily 크레딧: https://docs.tavily.com/documentation/api-credits
- Brave Search 무료 등급 변경: https://www.implicator.ai/brave-drops-free-search-api-tier-puts-all-developers-on-metered-billing/
- Gemini API 한도: https://ai.google.dev/gemini-api/docs/rate-limits
- Google Cloud TTS 요금: https://cloud.google.com/text-to-speech/pricing
- ElevenLabs 요금: https://bigvu.tv/blog/elevenlabs-pricing-2026-plans-credits-commercial-rights-api-costs/
- Instagram API 요금: https://www.outstand.so/blog/instagram-api-pricing
- Cloudflare R2 무료 등급: https://nubbo.app/blog/cloudflare-r2-free-tier/
- Resend 한도: https://resend.com/docs/knowledge-base/account-quotas-and-limits
- X API 요금: https://postproxy.dev/blog/x-api-pricing-2026/
- Apify 무료 등급: https://use-apify.com/docs/what-is-apify/apify-free-plan
- 카카오 API 무료 기준: https://developers.kakao.com/docs/latest/en/getting-started/faq
- 토스 테스트 키: https://docs.tosspayments.com/en/api-guide
- whisper.cpp 로컬 실행: https://localaimaster.com/blog/whisper-local-speech-to-text
