# Instagram 시험 계정 준비

## 2026-10-04 Meta 앱 실제 설정 상태

- Meta 개발자 앱 `Cora`와 Instagram 사용 사례가 생성되어 있다.
- `instagram_business_content_publish`, `instagram_business_manage_insights`, `instagram_business_manage_comments` 권한을 추가했다. 새로고침 뒤 세 항목 모두 Meta 화면에서 **테스트 준비 완료**로 확인했다. `instagram_business_basic`과 `instagram_business_manage_messages`도 같은 상태다. 추가 직후 Meta가 일반 오류 팝업을 띄웠지만 저장은 반영되었으므로 재추가할 필요가 없다.
- Instagram 전문가 계정 `@bdm.lab`이 PC Instagram의 **테스터 초대**에서 `Cora-IG`를 2026-10-04 수락했다. Meta 앱 역할 화면에서도 `@bdm.lab` 행의 **대기 중 표시가 사라진 것**을 확인했다. 테스터 역할 승인은 완료됐지만 OAuth 연결·토큰 발급과는 별개다. 모바일 앱에는 테스터 초대 탭이 표시되지 않아 PC 웹에서 수락했다.
- `@bdm.lab`은 실제 운영 계정이다. 최초 공개 게시 시험은 별도 시험 전용 계정에서, 플랫폼별 첫 게시에 대한 사용자 확인을 받은 뒤 실행한다.
- **테스트 준비 완료는 OAuth 연결·토큰 발급·고급 접근 승인·실제 API 성공을 뜻하지 않는다.** HTTPS 복귀 주소 등록, 서버 비밀 설정, 계정 연결 및 읽기 전용 수집은 아직 미검증이다. 실제 게시도 실행하지 않았다.
- Cora의 기본 연결 버튼은 이제 프로필·인사이트 **읽기 권한만 요청**한다. 게시·댓글 권한은 별도 요청 경로에 남겼다. 연결 상태의 범위 표시는 요청 내역이며 실제 허용·API 성공은 별도로 검증해야 한다. 기존 연결 데이터의 권한 범위는 `unknown`으로 표시된다.

## 교수님이 알려줄 것

1. 최초 공개 게시에 쓸 별도 시험 전용 계정의 @사용자명(아직 없으면 “새로 만들 예정”). 읽기 전용 연결을 위한 운영 계정은 `@bdm.lab`으로 확인됐다.
2. 개인 / 크리에이터 / 비즈니스 중 계정 유형. Instagram 로그인 API 연동에는 크리에이터 또는 비즈니스 계정이 필요하다.
3. `@bdm.lab` 테스터 초대는 완료. 다음 사용자 작업은 Instagram 공식 OAuth 승인 화면이 준비되면 계정 소유자가 직접 로그인·권한을 확인하는 것이다.

비밀번호·2단계 인증번호·복구코드를 AI 채팅에 전달하지 않는다. 연결 시 Instagram 공식 화면에서 직접 로그인하고 승인한다. @사용자명만으로 API 연결되는 것은 아니다.

## 운영자와 AI가 함께 준비할 것

- Meta 앱에서 Instagram 로그인 방식을 설정하고 시험 사용자 접근 권한을 준비한다. 대시보드에서 실제로 보이는 권한·역할을 확인하며 진행한다.
- 서버 설정: CORA_IG_APP_ID, CORA_IG_APP_SECRET, CORA_IG_REDIRECT_URI, CORA_SECRET_KEY, CORA_ORIGIN.
- 앱 ID와 시크릿은 Instagram 앱 설정 값이며 계정 비밀번호가 아니다. Meta 상위 앱 ID와 혼동하지 않는다.
- 비밀값은 ~/.config/cora/secrets.env 등 Git·Drive 밖 서버 비밀 설정에만 둔다. 현재 이 지정 파일은 아직 존재하지 않는다(2026-10-03 확인). 기존 키가 다른 곳에 있으면 복제하기 전에 위치만 확인한다.
- 복귀 경로: /api/cora/connect/instagram/callback. HTTPS 배포 또는 개발 연결 주소를 결정한 뒤 Meta와 서버에 정확히 같은 주소를 등록한다. 접속 주소 CORA_ORIGIN도 같은 출처여야 Cora 로그인 쿠키를 찾는다.
- 콘텐츠 순환 → Instagram 시험 계정 연결 안내 → 연결 준비 상태 점검에서 누락 항목을 확인한다. 이는 설정 검사이며 Meta 인증·권한 검증은 아니다.
- 이미지·영상 저장소는 계정 인증 자체에 필요하지 않다. 게시 연결 시험 때 준비한다.

## 이후 순서

Cora 로그인 → Instagram 계정 연결 → 교수님이 Instagram 공식 화면에서 승인 → 연결된 계정 이름 확인 → 읽기 전용 성과 수집 시험 → 게시할 계정·콘텐츠 검토 → 첫 실제 게시 확인.

현재 게시 준비함의 큐는 모의 실행이다. 실제 게시 큐 연결과 실계정 시험을 완료한 것처럼 표시하지 않는다.

공식 참고: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/
Meta 공식 Postman: https://www.postman.com/meta/instagram/folder/1z5vxzu/instagram-api-with-instagram-login
