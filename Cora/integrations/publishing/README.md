# Cora SNS 게시 통합 — Sabrina / n8n 참고

사용자 우선 요구: 본인의 SNS 계정을 연결하고 Cora에서 만든 콘텐츠를 실제 계정에 즉시 또는 예약 게시한다. 파일 다운로드만으로 게시 기능을 완료 처리하지 않는다.

## 원문에서 확인한 구조

출처: https://www.sabrina.dev/p/if-canva-and-n8n-had-a-baby (2025-09-13 글, 2026-09-29 확인).
공식 템플릿 안내 링크: https://help.blotato.com/api/templates/5-automate-instagram-carousels-with-ai-chat

글은 n8n AI 에이전트와 Blotato를 연결해 템플릿을 고르고 캐러셀을 생성한 뒤, 소셜 계정을 선택해 즉시 또는 예약 게시하는 흐름을 설명한다. 실제 게시 연동은 Blotato가 담당한다. 글에는 Blotato API 키가 유료 기능이라고 명시되어 있다. 현재 요금·계정 유형·플랫폼별 지원·외부 생성 이미지 게시 계약은 아직 검증하지 않았다. 템플릿을 다운로드하거나 실행한 상태도 아니다.

## Cora에서 구현할 흐름

브랜드별 SNS 계정 연결 → Cora 카드뉴스/영상의 확정 버전 선택 → 게시 미리보기·캡션 확인 → 대상 계정/시간 확인 → 즉시 게시 또는 예약 → 작업 상태와 게시물 URL 저장.

- 초기 구현 후보는 Cora 제작 결과 → n8n → Blotato 게시다. 기존 카드뉴스 생성기를 그대로 쓰고 게시 부분만 붙일 수 있는지 공식 API 계약으로 검증한다.
- 실제 API 시험 전 미디어 형식·공개/서명 URL 접근·계정 권한·서비스 비용·앱 이용 조건을 확인한다.
- 게시 요청에는 브랜드, 대상 계정, 콘텐츠 버전, 실행 시각/시간대, 중복 방지 식별자를 포함한다.
- 성공/실패/결과 불명 상태를 구분한다. 응답 유실 시 무조건 재시도하지 않고 외부 상태를 대조한다.
- 실패 재시도·예약 변경/취소 가능 범위는 공급자 계약을 확인한 뒤 구현한다.
- 대행사 승인 단계에서는 승인한 버전과 실제 게시한 버전이 같아야 한다.
- 성과 분석은 별도 데이터 연결이다. 자동 게시 성공만으로 분석 지표도 확보됐다고 표시하지 않는다.

## 완료 조건

허가된 테스트 계정 하나에서 Cora로 만든 콘텐츠를 실제 게시하고 외부 게시물과 저장한 URL/상태가 일치해야 한다. 예약 시간대, 중복 클릭, 권한 해제, 실패/응답 유실 시나리오도 확인한다. 계정 연결·외부 공개 게시 승인이 아직 없는 상태이므로 현재는 로컬 준비 기능과 어댑터 계약 시험까지 기록하며 실제 게시 완료로 처리하지 않는다.

기능 구현은 본인·조유경·AI가 주도한다. n8n/Blotato의 현재 적합성이 확인되면 연결하고, 구체적 미해결 항목만 후속 개발자에게 넘긴다.

## 2026-09-29 재확인

Sabrina의 옛 템플릿/API 주소가 이동됐다. 현재 공개 문서는 아래다.

- https://help.blotato.com/integrations-and-automation-templates/templates/5-automate-instagram-carousels-with-ai-chat.md
- https://help.blotato.com/rest-api-reference/api-reference.md

직접 HTTP로 문서를 읽었고, 현재 계정 목록 조회·게시 요청·게시 상태 조회 경로를 확인했다. 아직 실제 계정 연결/키 발급/유료 호출/게시를 수행하지 않았다. 공급사 다고객 SaaS 사용 조건과 계정별 권한 격리는 계약 확인 대상이다. 상세 개발·시험 순서는 docs/Cora_실행과인계/01_사업과제품_실행계획.md 6~8절을 따른다.

## 2026-09-30 구현 상태

승인 버전과 연결한 게시 준비함, 사용자 격리, 중복 준비 방지, 변경 시 재검토를 구현했다. `apps/trend-hub/lib/cora/publishing/blotato.ts`에 계정 조회·게시 요청·상태 조회 어댑터를 작성했다. 예약 시각은 최상위 `scheduledTime`이며 접수 응답을 게시 성공으로 간주하지 않는다. 모의 계약 시험만 수행했고 실제 전송 경로는 아직 노출하지 않았다.

공식 계약: https://help.blotato.com/rest-api-reference/publish-post · https://help.blotato.com/rest-api-reference/publish-post/get-post · https://help.blotato.com/rest-api-reference/accounts

사용자별 자격 증명과 실제 계정 소유권 연결, 승인 미디어 호스팅, 영구 실행 큐 및 결과 대조는 후속 구현이다. 상세 검증과 제한은 `docs/Cora_집중구현_2026-09-30/06_게시준비와_어댑터.md`를 따른다.
