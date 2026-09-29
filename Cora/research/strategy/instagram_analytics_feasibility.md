# Instagram 계정 진단·콘텐츠 추천의 기술적 범위

확인: 2026-09-29. Meta 공식 개발 문서의 현재 공개 본문을 읽었다. 계정 연결·권한 부여·앱 생성·기존 서비스 변경·API 실행은 하지 않았다. 웹 검색 도구에서는 Meta 문서가 429를 반환했지만, 공식 문서의 공개 Markdown 주소를 일반 HTTP로 읽어 본문을 확보했다. 아래 출처는 재판매업체 설명이나 개인 GitHub 복사본이 아닌 Meta 문서다.

## 결론

개인 창작자가 자기 Instagram 성과를 연결하고, 다음 소재와 제작 방향을 제안받는 제품은 기술적으로 가능하다. 다만 **사람으로서 개인 창작자인 것과 Instagram의 Personal 계정 유형은 다르다.** 공식 Insights 연동의 초기 대상은 Business 또는 Creator 유형의 프로페셔널 계정이어야 한다. 일반 Personal 계정을 포함해 누구나 계정명만 넣으면 저장수·도달·시청시간까지 분석한다는 약속은 할 수 없다.

첫 단계는 읽기 전용 연결로 시작하는 편이 맞다. 게시 권한·댓글·DM 권한을 처음부터 요구할 필요가 없다. 분석에서 실제 다음 작업으로 이어지는 편의성을 검증하되, 조회수 상승을 API가 보장하거나 추천 알고리즘의 원인을 알아내는 것처럼 설명하지 않는다.

## 1. 연결 방식·계정 조건

| 항목 | Instagram Login | Facebook Login |
|---|---|---|
| 대상 | Business/Creator 프로페셔널 계정 | Business/Creator 프로페셔널 계정 |
| Facebook 페이지 | 연결 불필요 | 연결된 페이지 필요 |
| 호스트 | `graph.instagram.com` | `graph.facebook.com` |
| Insights 핵심 권한 | `instagram_business_basic`, `instagram_business_manage_insights` | `instagram_basic`, `instagram_manage_insights`, `pages_read_engagement` |
| 추가 고려 | Instagram 중심 최초 연결에 더 단순한 후보 | 페이지를 찾는 흐름에 `pages_show_list` 등 필요. Business Manager를 통해 페이지 역할을 부여받은 경우 공식 Insights 문서는 `ads_management`, `ads_read` 추가 조건도 명시 |

초기 제품은 Instagram Login 한 가지로 제한하는 것을 권고한다. 위 표는 두 방식의 비교이며 두 로그인 구성을 한 앱에서 동시에 구현하라는 제안이 아니다. 광고 집계나 다른 기능이 필요해지면 별도로 검토한다.

출처: [Instagram Login](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login), [Overview](https://developers.facebook.com/documentation/instagram-platform/overview), [Insights 요구사항](https://developers.facebook.com/documentation/instagram-platform/insights).

## 2. 자체 계정 테스트와 외부 고객 서비스는 다르다

공식 Overview는 소유·관리하는 계정의 제한적 개발·테스트에는 Standard Access를 설명하고, 앱 역할이 없는 외부 이용자의 계정을 서비스하려면 Advanced Access와 App Review, Business Verification이 필요하다고 명시한다. 개발자 계정으로 한 번 조회에 성공한 상태를 일반 고객용 연동 완료로 볼 수 없다.

App Review 준비물에는 외부에서 실행 가능한 앱, 개인정보처리방침 주소, 권한별 사용 목적, 검토자가 따라 할 수 있는 시험 절차·필요한 테스트 계정, 각 권한 사용을 보여주는 화면 녹화가 포함된다. 실제로 쓰지 않는 권한까지 요청하면 승인되지 않을 수 있다. 승인 소요 일수는 이번 확인 자료만으로 보장할 수 없다.

신청을 제출한 것과 승인을 받은 것, 승인을 받은 것과 정상 고객이 연결·해제·재연결까지 완료한 것은 각각 다른 상태로 기록한다. 검토가 늦어지면 제품 출시 범위와 유료 이용 시작일을 그에 맞춰 조정해야 한다.

출처: [Overview — Access levels / Business verification](https://developers.facebook.com/documentation/instagram-platform/overview), [App Review for Instagram API](https://developers.facebook.com/documentation/instagram-platform/app-review).

## 3. 가져올 수 있는 지표와 중요한 제한

### 계정 단위

계정 Insights에는 도달, 조회, 참여 계정, 좋아요·댓글·저장·공유, 팔로우/언팔로우, 일부 인구통계 등이 정의되어 있다. 지표마다 `period`, `metric_type`, `breakdown` 조합이 다르므로 한 요청으로 모든 지표를 같은 방식으로 받는다고 가정하면 안 된다.

정확한 100명 조건:

- 제한 목록은 `follower_count`, `online_followers`에 팔로워 100명 미만 제한을 명시한다.
- 지표 표는 `follows_and_unfollows`, `follower_demographics`도 100명 미만이면 반환하지 않는다고 명시한다.
- `engaged_audience_demographics`는 해당 기간 참여 100건 미만이면 반환하지 않는 조건이다. 팔로워 100명 조건과 다르다.
- 따라서 **100명 미만은 연동 전체 불가가 아니라 일부 분석 자료 부족**으로 표시한다.
- 프로필의 현재 총팔로워 필드 `followers_count`와 Insights의 `follower_count`는 다른 필드다. 위 Insights 제한을 총팔로워 필드에 그대로 복사하지 않는다.

계정 지표는 안내상 최대 90일 보관이며, `online_followers`는 최근 30일 한정이다. 인구통계는 상위 45개 결과와 인구통계가 알려진 이용자만 포함하므로 합계가 총팔로워와 맞지 않을 수 있다. 지표 데이터는 최대 48시간 지연될 수 있다. 빈 응답은 0과 구분한다.

인구통계 표에는 오래된 `last_14_days` 등의 값과 v20부터 해당 값 중단이라는 주석이 함께 남아 있다. 초기에 `this_week`/`this_month` 등 사용할 조합을 API 버전과 실응답으로 확인해야 한다.

출처: [Instagram Account Insights](https://developers.facebook.com/documentation/instagram-platform/api-reference/instagram-user/insights), [Get Started — 프로필 필드](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/get-started), [Insights — 보관 범위](https://developers.facebook.com/documentation/instagram-platform/insights).

### 게시물 단위

공식 Media Insights 표를 기준으로 초기 후보는 다음과 같다. 표에 존재하더라도 대상 계정·미디어·버전에서 실제 반환되는지 확인해야 한다.

| 구분 | 후보 지표 | 제품 설명에서 지킬 경계 |
|---|---|---|
| 공통 성과 | `views`, `reach`, `shares`, `total_interactions` | 도달은 추정 지표. 숫자가 누구에게 보였는지 개인 명단은 아님 |
| 피드·릴스 | `likes`, `comments`, `saved` | 계정 집계의 `saves`와 게시물 필드 `saved`를 혼동하지 않음 |
| 릴스 시청 | `ig_reels_avg_watch_time`, `ig_reels_video_view_total_time` | 평균·총시청시간은 전체 구간별 시청 유지 곡선과 다름 |
| 릴스 초반 이탈 | `reels_skip_rate` | 첫 3초에 건너뛴 초기 조회 비율. 추정·개발 중 지표로 표시 |
| 피드·스토리 | `profile_visits`, `profile_activity` 등 | 모든 지표가 릴스에도 제공된다고 가정하지 않음 |

미디어 지표는 최대 2년 보관 안내가 있지만 스토리는 24시간 제한이 따로 있다. 캐러셀 내부 각각의 카드에는 Insights가 제공되지 않으므로 '3번째 카드에서 이탈했다'는 진단은 이 API만으로 할 수 없다. Instagram Login의 Insights webhook은 지원하지 않는다고 명시되어 있어 초기 수집은 제한된 주기 조회로 설계한다. 제공되지 않는 미디어·지표는 결측으로 표시한다.

게시물 `comments`·`likes`·`views`·`total_interactions` 등은 유기적 반응 기준이며, 광고/부스팅을 포함한 `total_comments`·`total_likes`·`total_views`는 Facebook Login 전용으로 명시되어 있다. 두 로그인 방식이나 원본 앱 화면의 숫자를 무조건 같은 수치로 취급하지 않는다.

출처: [Instagram Media Insights](https://developers.facebook.com/documentation/instagram-platform/reference/instagram-media/insights).

### 기간 비교에서 하지 말아야 할 약속

계정의 기간 집계와 개별 게시물의 누적 성과는 다른 자료다. Media Insights 문서는 일반 `period` 선택지와 응답의 `lifetime` 고정 설명이 함께 있어, 임의 기간별 게시물 이력을 모두 조회할 수 있다고 설계하면 안 된다. 원칙은 계정별 실응답 확인 후 누적값을 시점별로 저장하는 것이다.

과거 게시물의 '게시 24시간 후 성과'는 당시 스냅샷이 없으면 지금 누적 조회수만 보고 복원할 수 없다. 연결 후부터 48시간/7일 같은 같은 경과 시점의 스냅샷을 쌓고, 수집 지연과 실제 관측시각을 표시한다. 초기에 과거 게시물 비교를 한다면 게시 후 경과일과 비교 불완전성을 함께 보여준다.

## 4. 오래된 예제와 현재 지표를 구분

공식 변경 기록은 2025-01-21에 Instagram Login의 계정·미디어 Insights 도입을 알렸으며, `views` 도입과 `plays`, `clips_replays_count`, `ig_reels_aggregated_all_plays_count`, `impressions` 중단을 설명한다. 따라서 예전 블로그나 남아 있는 공식 개요 예제의 `impressions/engagement/plays`를 그대로 복사해 신규 제품을 설계하지 않는다. 개별 예외가 있는 과거 미디어와 신규 미디어를 구분한다.

실제로 App Review의 권한 목록은 현재 endpoint 문서보다 덜 갱신되어 Insights 권한을 빠뜨리고 있으며, publishing 권한 철자도 다른 곳이 있다. **구체 기능의 최신 endpoint 요구사항과 실제 App Dashboard를 기준으로 재확인**해야 한다. 오늘 확인한 Account/Media Insights 문서는 `instagram_business_manage_insights`를 명시한다.

출처: [Instagram Platform Changelog](https://developers.facebook.com/documentation/instagram-platform/changelog), [Account Insights](https://developers.facebook.com/documentation/instagram-platform/api-reference/instagram-user/insights), [App Review](https://developers.facebook.com/documentation/instagram-platform/app-review).

## 5. 읽기와 발행을 분리

계정 진단에는 게시 권한이 필요하지 않다. 발행은 `instagram_business_content_publish` 등 별도 권한, 미디어 컨테이너 생성→준비 상태 확인→게시, 게시 가능 형식, 실패 복구를 구현해야 한다. 현재 카드뉴스 PNG 렌더 결과도 API가 받는 형식으로 변환하는 단계가 필요하다. 공식 가이드는 이미지 게시를 JPEG로 제한한다.

Facebook 페이지 기반 연결에서는 PPA가 필요한 페이지라면 완료 전 게시할 수 없는 조건이 있다. 공식 publishing 문서의 일반 상한은 이동 24시간당 100회지만 같은 문서의 캐러셀 절에는 50회가 남아 있으므로 숫자를 하드코딩하지 않고 `content_publishing_limit`과 실제 오류를 처리해야 한다. 초기 진단 제품에서는 이런 발행 복잡도를 떠안을 이유가 없다.

출처: [Content Publishing](https://developers.facebook.com/documentation/instagram-platform/content-publishing).

## 6. 학생 자원으로 가능한 순서

기존 8주 제품의 학생 개발시간 36시간 안에 계정 연결·진단·소재 발굴·영상 편집·발행을 모두 추가하는 것은 제안하지 않는다. 크리에이터 직접사용을 검증한다면 기존 개발 범위 일부를 이 단계로 교환해야 한다.

1. **고객 자료로 진단·다음 작업을 시험한다.** 고객이 실제 내보낸 CSV 또는 명시적으로 제공한 지표/화면으로 최근 콘텐츠를 정리한다. 데이터 원본·추출일·누락을 표시하고, 정식 API 연결 또는 실시간 대시보드라고 부르지 않는다. 스크린샷에서 확인되지 않은 저장·시청·도달 값을 추정해 채우지 않는다.
2. **허용된 자체 테스트 계정 하나로 읽기 전용 증명.** 프로필→미디어 목록→형식에 맞는 몇 개 지표를 조회·저장하고 연결 해제·오류/권한 부족을 시험한다. 테스트 역할 계정을 외부 고객용 승인 대체물로 쓰지 않는다.
3. **외부 고객 연결을 위한 앱 심사·사업 확인 준비.** 진단 UI가 실제로 어떤 권한을 쓰는지 보여 주고 승인 후 제한된 고객을 초대한다. 기다리는 동안 1단계가 분석 가치 검증을 계속한다.
4. **초기 제품은 한 계정·최근 게시물·한 가지 다음 행동.** 요약 지표 나열보다 '다음 주 시도할 3가지 주제와 그중 하나의 제작안'을 제공하고, 고객이 채택·수정·게시했는지 확인한다. 영상 편집은 우선 이미 있는 도구로 가져갈 대본·컷 지시·자막 초안까지 좁힌다. 편집기를 새로 만드는 일은 후속 범위다.

기간은 승인 대기와 개발 시간을 분리해 관리한다. 토큰 보관·회수·재연결·고객별 권한을 다루는 숙련 개발자가 필요하며, 추가 투입은 기존 16–24시간 견적 가정 안에 자동 포함하지 않는다. 현행 코드·로그인 골격·API 승인 상태를 본 뒤 다시 산정해야 한다.

수락조건: 실제 권한 계정 ID가 화면에 보임, 요청/수집시각 표시, 미지원/미수집/0 구분, 계정 연결 해제 후 재조회 중단, 다른 고객 자료 접근 거절, 토큰이 브라우저/로그에 노출되지 않음, API 오류를 '성장 하락'으로 오해하지 않음.

## 7. 계정 점검에서 유료 가치로 이어지는 제안 규칙

분석 자체는 무료 원본 앱에도 있으므로 우리 가설은 '내 계정에서 관측한 결과를 다음 제작 행동으로 쉽게 바꿔 준다'이다. 다음 순서를 권고한다.

- 최근 28일 등 정해진 창의 게시물을 형식·주제·목적별로 분류한다. 분류가 AI 추정이면 사용자가 수정할 수 있게 한다.
- 같은 계정·같은 형식·비슷한 게시 후 경과 시간의 기준선과 비교한다. 광고·공동 게시·프로모션 여부를 확인할 수 없으면 그 한계를 표시한다.
- 저장률은 저장/도달, 공유율은 공유/도달처럼 분모를 명시하고 표본이 적으면 단정하지 않는다. 여러 게시물의 reach를 더한 수치를 고유 도달 인원이라 부르지 않는다.
- '이런 소재가 최근 잘 됐다'는 관측과 '다음에 이것을 해 보자'는 가설을 다른 영역으로 표시한다. '인스타 알고리즘이 이 계정을 억제한다', '이 시간에 올리면 반드시 성장한다'는 원인 진단을 하지 않는다.
- 다음 제작에 한 번에 여러 요소를 바꾸기보다 가능한 한 주제/첫 문장/길이 등 한 가지를 바꿔 실험한다. 게시 7일 등 같은 시점으로 결과를 다시 관찰한다.
- API만으로는 볼 수 없는 요소도 있다. 소재 적합성, 첫 장의 가독성, 영상의 구간별 맥락은 결과물 자체를 읽고 편집자 기준으로 평가해야 한다. 이 평가는 정량 지표와 분리한다.

**후속 지표:** 추천 채택, 실제 제작 완료, 게시까지 걸린 시간, 다음 주 재사용, 재결제. 초기 몇 건의 조회수 상승을 제품이 만들어 낸 인과 효과로 표시하지 않는다.

## 8. 확인 자료와 남은 검증

원문을 보관한 내부 파일: `meta_insights_source.txt`, `meta_account.txt`, `meta_media.txt`, `meta_login.txt`, `meta_overview.txt`, `meta_review.txt`, `meta_getstarted.txt`, `meta_publish.txt`, `meta_changes.txt`. 모두 `work/strategy/` 아래에 있다. 최종 고객 문서에는 원문 전체 대신 위 공식 링크와 요약만 전달한다.

이번 조사로 확인하지 않은 것: 사용자의 실제 Instagram 계정 유형·권한·기존 Meta 앱·Business Verification·Advanced Access 상태, 특정 계정의 지표 반환 여부, 승인 예상일, API 호출량 한도의 실제 값, 연결/갱신/게시 동작. 따라서 지금 '연동 준비 완료' 또는 '개인 계정 전부 자동 진단 가능'이라고 말할 수 없다.
