# Instagram 공식 API 직접 연결과 게시 공급자 선택

2026-09-30 Claude(Opus) 구현. 실제 Instagram 호출 0회, 토큰 사용 0회, 유료 호출 0회.

## 게시 공급자 결정

Cora의 첫 실제 게시 연결은 Blotato 대신 Instagram 공식 API(Instagram API with Instagram Login) 직접 연결로 정했다. 판단 근거는 세 가지다.

1. **고객 계정 연결의 주체**: Cora의 첫 고객은 여러 고객사 브랜드 계정을 운영하는 대행사다. Blotato는 Blotato 가입자가 자기 계정을 연결해 쓰는 구조여서, Cora 고객이 각자 Blotato에 가입해 키를 넣어야 한다. 공식 API는 Cora 앱 이름으로 고객이 자기 Instagram 계정을 연결한다.
2. **비용 구조**: 공개 비교 자료(2026년 확인, 금액은 공급사 공지로 재확인 필요)에 따르면 Blotato는 API 키를 만드는 즉시 월 29달러 요금제가 시작되고, 대행사용 요금제는 월 499달러다. Instagram 공식 API 게시는 사용료가 없고 계정당 24시간 100건의 게시 한도가 있다.
3. **이미 만든 코드의 재사용**: 게시 큐(`PublicationQueue`)와 스케줄러는 공급자에 독립적인 접수·결과 대조 구조여서, 공급자만 바꿔 끼우면 된다. Blotato 어댑터는 삭제하지 않고 대안으로 남긴다.

TikTok·YouTube·X·Threads 등 나머지 플랫폼은 공식 API마다 앱 심사 조건이 달라, Instagram 시험을 마친 뒤 공식 API 직접 연결과 통합 게시 API(Upload-Post, bundle.social, Ayrshare, Blotato 등) 가운데 플랫폼별로 정한다. 이 판단은 사용자가 “Blotato가 최선인가”를 물은 뒤 내린 구현 결정이며, 비용이 드는 공급자 가입은 사용자 확인 뒤에만 한다.

## 추가한 코드

`lib/cora/publishing/instagram.ts`의 `InstagramAdapter`는 공식 문서(developers.facebook.com/docs/instagram-platform/content-publishing, 예시 버전 v25.0)의 두 단계 게시 절차를 게시 큐의 두 단계에 맞춘다.

- 접수 단계(`submit`)는 이미지 컨테이너만 만든다. 이미지 1장이면 컨테이너 1개, 2~10장이면 카루셀 항목 컨테이너와 카루셀 컨테이너를 만든다. 이 단계에서는 Instagram에 아무것도 공개되지 않는다.
- 대조 단계(`status`)는 컨테이너 상태를 읽는다. 처리 중(IN_PROGRESS)이면 기다리고, 준비 완료(FINISHED)이면 그때 한 번 게시(`media_publish`)한 뒤 게시물 주소(permalink)를 받아 `published`로 기록한다. 오류(ERROR)나 24시간 만료(EXPIRED)는 실패로 기록한다.
- 게시 응답이 끊겨도 같은 컨테이너는 Instagram이 두 번 게시하지 않는다. 이미 게시된(PUBLISHED) 컨테이너인데 게시물 ID를 받지 못한 경우는 `unknown`으로 남겨 사람이 Instagram에서 확인하게 한다.
- 입력은 공개 HTTPS 주소의 JPEG 이미지 1~10장, 캡션 2,200자·해시태그 30개 이내로 제한한다. 토큰은 Authorization 헤더로만 보내고 URL·기록에 남기지 않는다. 24시간 게시 한도 조회(`quota`)도 있다.
- Instagram API에는 이 방식의 예약 게시가 없으므로, 예약은 Cora 스케줄러가 예정 시각에 접수 단계를 시작하는 방식으로 처리한다.

## 검증

계약 시험 `tests/cora-instagram.test.ts` 6개가 가짜 전송 함수로 입력 제한, 단일·카루셀 컨테이너 생성, 토큰 위치, 오류 분류(4xx 실패, 429·5xx·네트워크 결과 불명), 오류 원문 비노출, 상태별 처리, 준비 완료 시 1회 게시와 주소 반환, 게시 응답 유실 뒤 재게시 없음, Instagram 외 주소 거부, 게시 한도 조회를 확인한다. 전체 단위시험은 369개 중 368개가 통과했고, 기존 자료 의존 시험 1개는 이전과 같이 제외했다. 실제 Instagram 서버에는 요청하지 않았다.

## 실제 게시 전에 남은 일

1. **시험 계정과 앱**: 사용자가 시험 전용 Instagram 전문가 계정을 제공한다. 그 계정을 Meta 개발자 앱의 테스터로 등록하면 앱 심사 없이 시험할 수 있다. 다른 사람의 계정을 연결하려면 Meta 앱 심사가 필요하다.
2. **계정 연결 화면**: Instagram 로그인으로 사용자 토큰을 받아 암호화 저장하고, 브랜드와 계정을 연결하는 OAuth 화면이 아직 없다.
3. **공개 이미지 보관 장소**: Cora는 로컬 컴퓨터에서 돌아가므로 Instagram이 내려받을 수 있는 공개 HTTPS 주소가 없다. 카드 PNG를 JPEG로 바꿔 올릴 저장소(예: Cloudflare R2나 S3 같은 공개 버킷)가 필요하다.
4. **큐 연결**: 위 세 가지가 준비되면 `publication_queue`의 모드 제한(`simulation`만 허용)을 풀고 실제 공급자 모드를 추가한다. 첫 실제 게시는 사용자가 화면에서 확인한 뒤 실행한다.
