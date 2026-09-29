# Mirr 고객 API 작업 부록
2026-09-28 공개 명세 조사. 총 83개는 메서드+경로 조합 수이며, 화면 기능 수나 MCP 도구 수와 다르다. 호출 성공을 검증한 목록이 아니다.
출처: [API 문서](https://www.mirra.my/en/api-reference), [공개 OpenAPI](https://www.mirra.my/api/v1/customer-openapi.json).
Bearer API 키 인증을 사용하는 명세다. 문서의 Standard 이상 조건과 현재 요금제 명칭은 다르므로 실제 이용 자격은 확인해야 한다. 입력 표의 필수/선택은 스키마 표기이며, 별도 비즈니스 검증 조건이 있을 수 있다. document와 plan의 대형 중첩 구조는 핵심 구조 설명으로 대체했다. 응답 예시는 실제 실행 결과가 아니다.

## A001 영상 검토용 문서 생성
`POST /api/v1/video-lab/generate-document` · VideoLab

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| prompt | 필수 | string / 최소 길이: 1 |
| inputOrigin | 선택 | string / 허용: ['manual', 'url', 'url_edited', 'idea', 'bulk', 'agent', 'template'] |
| inputSourceUrl | 선택 | string / 최대 길이: 2048 |
| referenceImages | 선택 | array[string] |
| aspectRatio | 선택 | string / 허용: ['16:9', '9:16', '1:1']; 기본: 9:16 |
| targetDurationSeconds | 선택 | integer / 최소: 0 |
| language | 선택 | string / 최소 길이: 2; 최대 길이: 16; 기본: en |
| style | 선택 | string / 최대 길이: 3000 |
| scriptMode | 선택 | string / 허용: ['rewrite', 'verbatim'] |
| sceneCount | 선택 | integer / 최소: 0 |
| compositionMode | 선택 | string / 허용: ['template', 'authored']; 기본: template |
| generationPipeline | 선택 | string / 허용: ['foundation', 'mixed-media']; 기본: foundation |
| styleProfileId | 선택 | string |
| pinnedSceneTemplateIds | 선택 | array[string] / 최대 항목: 20 |
| voiceId | 선택 | string / 최소 길이: 1; 최대 길이: 256 |
| voiceProvider | 선택 | string / 허용: ['inworld', 'fish-audio', 'typecast'] |
| voiceName | 선택 | string / 최소 길이: 1; 최대 길이: 120 |
| prepareVoiceTiming | 선택 | boolean / 기본: True |
| captionPunchEnabled | 선택 | boolean / 기본: True |
| sourceCaptionPreset | 선택 | string / 허용: ['wordFocus', 'wordPair', 'chunkBar', 'karaokeClean', 'cinematicFocus', 'bigHook', 'buildLine', 'highlighterBox', 'keywordPunch', 'slamPop', 'extrudeStack', 'koVarietyShow', 'jaTelopMinimal', 'arRtlBar', 'cleanLower', 'purpleHighlight', 'underlineShadow', 'lineCard', 'wordPop', 'wordBadge', 'boldYellow', 'whiteBox', 'neonCaption', 'wordCenter'] |
| webSearchEnabled | 선택 | boolean |
| searchSceneAssets | 선택 | boolean / 기본: True |
| resultsPerScene | 선택 | integer / 최소: 1; 최대: 6; 기본: 4 |
| applyFirstResult | 선택 | boolean / 기본: True |
| reviewBeforeFinalize | 선택 | boolean / 기본: False |
| strictTextFit | 선택 | boolean / 기본: False |
| mediaPlanningMode | 선택 | string / 허용: ['legacy-finalize', 'review-selected-1n'] |
| visualModePolicy | 선택 | string / 허용: ['current-binary', 'broll-free', 'best-fit', 'free-only', 'directed-only'] |
| directedBrollContract | 선택 | string / 허용: ['legacy-pixel-dominant', 'story-first', 'text-only'] |
| mediaPlanningBrief | 선택 | string / 최소 길이: 3; 최대 길이: 1200 |
| generateSoundtrack | 선택 | boolean / 기본: False |
| userMedia | 선택 | array[object] / 최대 항목: 30 |
| sourceVideo | 선택 | 선택형 |
| speechSourceMediaUrl | 선택 | string / 형식: uri |
| imageSearchSource | 선택 | string / 허용: ['commercial', 'internet'] |
| mediaType | 선택 | string / 허용: ['all', 'image', 'video'] |
| mediaSource | 선택 | string / 허용: ['internet', 'commercial', 'brand-ai', 'brand-ai-video', 'user-media'] |
| brandReferenceImageUrls | 선택 | array[string] / 최대 항목: 3 |
| aiAvatarReferenceUrl | 선택 | string / 형식: uri |
| aiVisualDirection | 선택 | string / 최대 길이: 2000 |

응답 명세: 200 application/json / generationId, document, fallback, model, brandImageRecords, brandVideosGenerated, workflow

## A002 검토한 영상 초안 확정
`POST /api/v1/video-lab/finalize` · VideoLab

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| generationId | 필수 | string / 최소 길이: 1 |
| document | 선택 | object |
| expectedUpdatedAt | 선택 | string / 형식: date-time |
| generateSoundtrack | 선택 | boolean / 기본: False |
| imageSearchSource | 선택 | string / 허용: ['commercial', 'internet'] |
| mediaType | 선택 | string / 허용: ['all', 'image', 'video'] |

응답 명세: 200 application/json / generationId, document, fallback, model, brandImageRecords, brandVideosGenerated, workflow

## A003 영상 문서 MP4 렌더
`POST /api/v1/video-lab/render` · VideoLab

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| generationId | 선택 | string / 형식: uuid |
| document | 선택 | object |
| watermark | 선택 | boolean / 기본: False |

응답 명세: 200 application/json / queued, videoUrl, generationId, durationSeconds, renderMode

## A004 영상 제작 이력 조회
`GET /api/v1/video-lab/generations` · VideoLab

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| limit | 선택 | query / integer / 최소: 1; 최대: 50; 기본: 20 |
| cursor | 선택 | query / string / 최소 길이: 1 |
| aspectRatio | 선택 | query / string / 허용: ['9:16', '16:9', '1:1'] |
| status | 선택 | query / string / 허용: ['draft', 'document_generated', 'editing', 'completed', 'failed'] |
| q | 선택 | query / string / 최대 길이: 120 |

응답 명세: 200 application/json / generations, total, nextCursor

## A005 AI 없이 빈 영상 또는 원본 영상 문서 생성
`POST /api/v1/video-lab/generations` · VideoLab

이 작업은 별도 입력 본문이 없거나 명세가 입력 세부사항을 생략한다. 상세 입력 없음과 입력 불필요를 동일시하지 않는다.

응답 명세: 200 application/json / generationId, document, fallback, model, brandImageRecords, brandVideosGenerated, workflow

## A006 저장된 영상 문서 조회
`GET /api/v1/video-lab/generations/{id}` · VideoLab

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| id | 필수 | path / string / 형식: uuid |

응답 명세: 200 application/json / generation

## A007 영상 문서 저장·수정
`PATCH /api/v1/video-lab/generations/{id}` · VideoLab

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| id | 필수 | path / string / 형식: uuid |
| document | 필수 | object |
| expectedUpdatedAt | 선택 | string / 형식: date-time |

응답 명세: 200 application/json / generation

## A008 영상 문서 삭제
`DELETE /api/v1/video-lab/generations/{id}` · VideoLab

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| id | 필수 | path / string / 형식: uuid |

응답 명세: 200 application/json / success

## A009 영상 렌더 상태 조회
`GET /api/v1/video-lab/generations/{id}/render-status` · VideoLab

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| id | 필수 | path / string / 형식: uuid |

응답 명세: 200 application/json / generation

## A010 검토 중 영상 초안 수정
`PATCH /api/v1/video-lab/generations/{id}/review` · VideoLab

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| id | 필수 | path / string / 형식: uuid |
| expectedUpdatedAt | 필수 | string / 형식: date-time |
| title | 선택 | string / 최소 길이: 1; 최대 길이: 200 |
| styleProfileId | 선택 | string / null 허용 |
| narration | 선택 | object |
| narration.enabled | 선택 | boolean |
| narration.voiceId | 선택 | string / 최소 길이: 1; 최대 길이: 256 |
| narration.voiceProvider | 선택 | string / 허용: ['inworld', 'fish-audio', 'typecast'] |
| narration.voiceName | 선택 | string / 최소 길이: 1; 최대 길이: 120 |
| narration.speakingRate | 선택 | number / 최소: 0.5; 최대: 2 |
| scenes | 선택 | array[object] / 최소 항목: 1 |

응답 명세: 200 application/json / generation

## A011 자연어로 영상 문서 수정
`POST /api/v1/video-lab/refine` · VideoLab

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| document | 선택 | object |
| inputMedia | 선택 | array[object] / 최대 항목: 30 |
| generationId | 선택 | string / 형식: uuid |
| expectedUpdatedAt | 선택 | string / 형식: date-time |
| scope | 선택 | string / 허용: ['all', 'scene']; 기본: all |
| sceneId | 선택 | string / 최소 길이: 1 |
| editMode | 선택 | string / 허용: ['general', 'motion-graphic-scene']; 기본: general |
| instruction | 필수 | string / 최소 길이: 1; 최대 길이: 2000 |
| plan | 선택 | object |
| expectedDocumentFingerprint | 선택 | string |
| confirmed | 선택 | boolean / 기본: False |
| allowImageReplacement | 선택 | boolean / 기본: False |

응답 명세: 200 application/json / document, changedSceneIds, changed, noChangeReason, unsupportedReason, appliedActions, warnings, generation

## A012 영상 템플릿 목록
`GET /api/v1/video-lab/video-templates` · VideoLab

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| scope | 선택 | query / string / 허용: ['admin', 'user'] |

응답 명세: 200 application/json / templates

## A013 영상 문서를 템플릿으로 저장
`POST /api/v1/video-lab/video-templates` · VideoLab

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| name | 필수 | string / 최소 길이: 1 |
| description | 선택 | string |
| thumbnailUrl | 선택 | string / 형식: uri |
| styleTags | 선택 | array[string] |
| document | 필수 | object |
| scope | 선택 | string / 허용: ['system', 'user'] |
| isVisible | 선택 | boolean |

응답 명세: 200 application/json / id

## A014 템플릿으로 영상 생성
`POST /api/v1/video-lab/video-templates/generate` · VideoLab

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| prompt | 필수 | string / 최소 길이: 1 |
| inputOrigin | 선택 | string / 허용: ['manual', 'url', 'url_edited', 'idea', 'bulk', 'agent', 'template'] |
| inputSourceUrl | 선택 | string / 최대 길이: 2048 |
| referenceImages | 선택 | array[string] |
| aspectRatio | 선택 | string / 허용: ['16:9', '9:16', '1:1']; 기본: 9:16 |
| language | 선택 | string / 최소 길이: 2; 최대 길이: 16; 기본: en |
| style | 선택 | string / 최대 길이: 3000 |
| scriptMode | 선택 | string / 허용: ['rewrite', 'verbatim'] |
| sceneCount | 선택 | integer / 최소: 0 |
| compositionMode | 선택 | string / 허용: ['template', 'authored']; 기본: template |
| generationPipeline | 선택 | string / 허용: ['foundation', 'mixed-media']; 기본: foundation |
| styleProfileId | 선택 | string |
| pinnedSceneTemplateIds | 선택 | array[string] / 최대 항목: 20 |
| voiceId | 선택 | string / 최소 길이: 1; 최대 길이: 256 |
| voiceProvider | 선택 | string / 허용: ['inworld', 'fish-audio', 'typecast'] |
| voiceName | 선택 | string / 최소 길이: 1; 최대 길이: 120 |
| prepareVoiceTiming | 선택 | boolean / 기본: True |
| captionPunchEnabled | 선택 | boolean / 기본: True |
| sourceCaptionPreset | 선택 | string / 허용: ['wordFocus', 'wordPair', 'chunkBar', 'karaokeClean', 'cinematicFocus', 'bigHook', 'buildLine', 'highlighterBox', 'keywordPunch', 'slamPop', 'extrudeStack', 'koVarietyShow', 'jaTelopMinimal', 'arRtlBar', 'cleanLower', 'purpleHighlight', 'underlineShadow', 'lineCard', 'wordPop', 'wordBadge', 'boldYellow', 'whiteBox', 'neonCaption', 'wordCenter'] |
| webSearchEnabled | 선택 | boolean |
| searchSceneAssets | 선택 | boolean / 기본: True |
| resultsPerScene | 선택 | integer / 최소: 1; 최대: 6; 기본: 4 |
| applyFirstResult | 선택 | boolean / 기본: True |
| reviewBeforeFinalize | 선택 | boolean / 기본: False |
| strictTextFit | 선택 | boolean / 기본: False |
| mediaPlanningMode | 선택 | string / 허용: ['legacy-finalize', 'review-selected-1n'] |
| visualModePolicy | 선택 | string / 허용: ['current-binary', 'broll-free', 'best-fit', 'free-only', 'directed-only'] |
| directedBrollContract | 선택 | string / 허용: ['legacy-pixel-dominant', 'story-first', 'text-only'] |
| mediaPlanningBrief | 선택 | string / 최소 길이: 3; 최대 길이: 1200 |
| generateSoundtrack | 선택 | boolean / 기본: False |
| userMedia | 선택 | array[object] / 최대 항목: 30 |
| sourceVideo | 선택 | 선택형 |
| speechSourceMediaUrl | 선택 | string / 형식: uri |
| imageSearchSource | 선택 | string / 허용: ['commercial', 'internet'] |
| mediaType | 선택 | string / 허용: ['all', 'image', 'video'] |
| mediaSource | 선택 | string / 허용: ['internet', 'commercial', 'brand-ai', 'brand-ai-video', 'user-media'] |
| brandReferenceImageUrls | 선택 | array[string] / 최대 항목: 3 |
| aiAvatarReferenceUrl | 선택 | string / 형식: uri |
| aiVisualDirection | 선택 | string / 최대 길이: 2000 |
| templateId | 필수 | string / 최소 길이: 1 |
| soundtrackMode | 선택 | string / 허용: ['none', 'template', 'generate'] |

응답 명세: 200 application/json / generationId, document, fallback, model, brandImageRecords, brandVideosGenerated, workflow

## A015 영상 스타일 목록
`GET /api/v1/video-lab/style-profiles` · VideoLab

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| scope | 선택 | query / string / 허용: ['admin', 'user'] |

응답 명세: 200 application/json / profiles

## A016 영상 스타일 생성 — 관리자 한정
`POST /api/v1/video-lab/style-profiles` · VideoLab

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| name | 필수 | string / 최소 길이: 1 |
| description | 선택 | string |
| styleTags | 선택 | array[string] |
| tokens | 필수 | object |
| tokens.fontFamily | 필수 | string / 최소 길이: 1 |
| tokens.accentColor | 필수 | string / 최소 길이: 1 |
| tokens.backgroundColor | 선택 | string |
| tokens.captionPreset | 선택 | string / 허용: ['wordFocus', 'wordPair', 'chunkBar', 'karaokeClean', 'cinematicFocus', 'bigHook', 'buildLine', 'highlighterBox', 'keywordPunch', 'slamPop', 'extrudeStack', 'koVarietyShow', 'jaTelopMinimal', 'arRtlBar', 'cleanLower', 'purpleHighlight', 'underlineShadow', 'lineCard', 'wordPop', 'wordBadge', 'boldYellow', 'whiteBox', 'neonCaption', 'wordCenter'] |
| tokens.transition | 선택 | object |
| isVisible | 선택 | boolean |

응답 명세: 200 application/json / profile

## A017 블로그 목록 조회
`GET /api/v1/longform` · Longform

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| status | 선택 | query / string / 허용: ['input', 'researching', 'outlining', 'outline_review', 'writing', 'seo_optimizing', 'generating_image', 'draft', 'completed', 'archived', 'failed'] |
| contentType | 선택 | query / string / 허용: ['blog', 'youtube_script'] |
| search | 선택 | query / string |
| createdAfter | 선택 | query / string |
| createdBefore | 선택 | query / string |
| page | 선택 | query / number / 최소: 1; 기본: 1 |
| limit | 선택 | query / number / 최소: 1; 최대: 50; 기본: 20 |

응답 명세: 200 application/json / items, total, page, limit, totalPages

## A018 블로그 조사·개요 생성 시작
`POST /api/v1/longform` · Longform

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| title | 필수 | string / 최소 길이: 1; 최대 길이: 200 |
| contentType | 선택 | string / 허용: ['blog', 'youtube_script']; 기본: blog |
| generationInput | 필수 | object |
| generationInput.topic | 필수 | string / 최소 길이: 1 |
| generationInput.keywords | 선택 | array[string] |
| generationInput.tone | 선택 | string |
| generationInput.targetAudience | 선택 | string |
| generationInput.referenceUrls | 선택 | array[string] |
| generationInput.referenceImages | 선택 | array[object] |
| generationInput.imageSourceMode | 선택 | string / 허용: ['uploaded-only', 'uploaded-with-search', 'none'] |
| generationInput.contentLength | 선택 | number |
| generationInput.locale | 선택 | string |
| generationInput.additionalContext | 선택 | string |
| generationInput.sourceContent | 선택 | string |
| generationInput.ctaText | 선택 | string |
| generationInput.ctaUrl | 선택 | string |
| generationInput.presetId | 선택 | string |
| generationInput.includeSummary | 선택 | boolean |
| generationInput.includeFaq | 선택 | boolean |
| generationInput.includeTips | 선택 | boolean |

응답 명세: 200 application/json / success, longform, triggerRunId

## A019 블로그 내용·진행 조회
`GET /api/v1/longform/{id}` · Longform

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| id | 필수 | path / string / 형식: uuid |

응답 명세: 

## A020 블로그 본문·메타데이터 수정
`PUT /api/v1/longform/{id}` · Longform

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| id | 필수 | path / string / 형식: uuid |
| title | 선택 | string / 최소 길이: 1; 최대 길이: 200 |
| content | 선택 | string |
| contentMarkdown | 선택 | string |
| excerpt | 선택 | string |
| status | 선택 | string / 허용: ['draft', 'completed', 'archived'] |
| generationSteps | 선택 | object |
| generationSteps.quota | 선택 | object |
| generationSteps.research | 선택 | object |
| generationSteps.outline | 선택 | object |
| generationSteps.writing | 선택 | object |
| generationSteps.sectionImages | 선택 | object |
| generationSteps.seo | 선택 | object |
| generationSteps.ogImage | 선택 | object |
| generationSteps.error | 선택 | object |
| metaTitle | 선택 | string |
| metaDescription | 선택 | string |
| metaKeywords | 선택 | string |
| ogImageUrl | 선택 | string |

응답 명세: 200 application/json / id, workspaceId, createdBy, title, content, contentMarkdown, excerpt, contentType, status, generationInput, generationSteps, currentStep, metaTitle, metaDescription, metaKeywords, ogImageUrl, triggerJobId, createdAt, updatedAt, completedAt

## A021 블로그 삭제
`DELETE /api/v1/longform/{id}` · Longform

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| id | 필수 | path / string / 형식: uuid |

응답 명세: 200 application/json / success

## A022 블로그 개요 승인·본문 작성 시작
`PUT /api/v1/longform/{id}/outline` · Longform

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| id | 필수 | path / string / 형식: uuid |
| title | 선택 | string / 최소 길이: 1; 최대 길이: 200 |
| sections | 필수 | array[object] |

응답 명세: 200 application/json / id, workspaceId, createdBy, title, content, contentMarkdown, excerpt, contentType, status, generationInput, generationSteps, currentStep, metaTitle, metaDescription, metaKeywords, ogImageUrl, triggerJobId, createdAt, updatedAt, completedAt

## A023 계정 인사이트 조회
`GET /api/v1/analytics/account-insights` · Analytics

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| accountId | 필수 | query / string / 최소 길이: 1 |
| startDate | 필수 | query / string |
| endDate | 필수 | query / string |

응답 명세: 200 application/json / data

## A024 팔로워 이력 조회
`GET /api/v1/analytics/follower-history` · Analytics

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| accountId | 선택 | query / string / 형식: uuid |
| startDate | 필수 | query / string |
| endDate | 필수 | query / string |

응답 명세: 200 application/json / data

## A025 게시물 인사이트 조회
`GET /api/v1/analytics/post/{id}/insights` · Analytics

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| id | 필수 | path / string / 최소 길이: 1 |

응답 명세: 200 application/json / success, postInsights

## A026 게시물 지표 동기화
`POST /api/v1/analytics/posts/sync` · Analytics

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| postIds | 필수 | array[string] / 최소 항목: 1 |

응답 명세: 200 application/json / success, updatedCount, message

## A027 게시물 성과 및 기간 비교
`GET /api/v1/analytics/posts-performance` · Analytics

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| accountId | 선택 | query / string |
| startDate | 필수 | query / string |
| endDate | 필수 | query / string |
| compareMode | 선택 | query / string / 허용: ['none', 'previous', 'yoy', 'mom', 'wow', 'custom']; 기본: none |
| compareStartDate | 선택 | query / string |
| compareEndDate | 선택 | query / string |

응답 명세: 200 application/json / data, comparison

## A028 전체 계정 통계
`GET /api/v1/analytics/user` · Analytics

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| startDate | 선택 | query / string |
| endDate | 선택 | query / string |

응답 명세: 200 application/json / totalPosts, totalVisibility, totalLikes, totalReplies, totalReposts, totalQuotes, totalShares, accounts

## A029 댓글의 AI 답변 생성
`POST /api/v1/comment-management/ai-generate-replies` · Comment Management

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| comments | 필수 | array[복합형] / 최소 항목: 1 |
| prompt | 필수 | string / 최소 길이: 1 |
| socialAccountId | 선택 | string |

응답 명세: 200 application/json / replies, message

## A030 댓글 답변 일괄 전송
`POST /api/v1/comment-management/send-replies` · Comment Management

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| socialAccountId | 필수 | string / 최소 길이: 1 |
| postId | 선택 | string / 형식: uuid |
| replies | 필수 | array[복합형] / 최소 항목: 1 |

응답 명세: 200 application/json / success, processedReplies, message

## A031 댓글 답변 스냅샷 다운로드
`GET /api/v1/comment-management/download` · Comment Management

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| accountId | 선택 | query / string |
| from | 선택 | query / string |
| to | 선택 | query / string |
| format | 선택 | query / string / 허용: ['csv', 'json']; 기본: csv |

응답 명세: 200 application/json / 복합형 / null 허용

## A032 댓글 답변 단건 전송
`POST /api/v1/comment-management/send-reply` · Comment Management

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| postId | 필수 | string / 최소 길이: 1 |
| commentId | 필수 | string / 최소 길이: 1 |
| text | 필수 | string / 최소 길이: 1 |

응답 명세: 200 application/json / success, replyId, message

## A033 미응답 댓글이 있는 게시물 조회
`GET /api/v1/comment-management/unanswered` · Comment Management

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| accountId | 선택 | query / string |
| from | 선택 | query / string |
| to | 선택 | query / string |
| includeReplied | 선택 | query / 선택형 |

응답 명세: 200 application/json / data

## A034 게시물 댓글 조회
`GET /api/v1/post-comments/{postId}` · Post Comments

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| postId | 필수 | path / string / 형식: uuid |
| socialAccountId | 선택 | query / string / 형식: uuid |
| status | 선택 | query / 선택형 |
| commentType | 선택 | query / string / 허용: ['manual', 'scheduled'] |
| includeRelations | 선택 | query / 선택형 |

응답 명세: 200 application/json / comments

## A035 게시물 댓글 생성
`POST /api/v1/post-comments/{postId}` · Post Comments

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| postId | 필수 | path / string / 형식: uuid |
| socialAccountId | 필수 | string / 형식: uuid |
| commentText | 필수 | string / 최소 길이: 1; 최대 길이: 5000 |
| ctaTemplateId | 선택 | string / 형식: uuid |
| imageUrls | 선택 | array[string] |
| mediaIds | 선택 | array[string] |
| commentType | 필수 | string / 허용: ['manual', 'scheduled'] |
| triggerType | 선택 | string / 허용: ['viewCount', 'timeBased', 'manual'] |
| viewThreshold | 선택 | number / 최소: 0 |
| minutesAfterPublish | 선택 | number / 최소: 0 |
| parentCommentId | 선택 | string |
| quotedPostId | 선택 | string |
| quotedPost | 선택 | object |
| quotedPost.social_post_id | 필수 | string |
| quotedPost.content | 선택 | string |
| quotedPost.author | 선택 | object |

응답 명세: 200 application/json / comment

## A036 즉시 수동 댓글 게시
`POST /api/v1/post-comments/{postId}/manual` · Post Comments

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| postId | 필수 | path / string / 형식: uuid |
| socialAccountId | 필수 | string / 형식: uuid |
| commentText | 필수 | string / 최소 길이: 1; 최대 길이: 5000 |
| ctaTemplateId | 선택 | string / 형식: uuid |
| imageUrls | 선택 | array[string] |
| mediaIds | 선택 | array[string] |
| parentCommentId | 선택 | string |
| quotedPostId | 선택 | string |
| quotedPost | 선택 | object |
| quotedPost.social_post_id | 필수 | string |
| quotedPost.content | 선택 | string |
| quotedPost.author | 선택 | object |

응답 명세: 200 application/json / comment

## A037 조건부 댓글 예약
`POST /api/v1/post-comments/{postId}/scheduled` · Post Comments

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| postId | 필수 | path / string / 형식: uuid |
| socialAccountId | 필수 | string / 형식: uuid |
| commentText | 필수 | string / 최소 길이: 1; 최대 길이: 5000 |
| ctaTemplateId | 선택 | string / 형식: uuid |
| imageUrls | 선택 | array[string] |
| mediaIds | 선택 | array[string] |
| triggerType | 필수 | string / 허용: ['viewCount', 'timeBased', 'manual'] |
| viewThreshold | 선택 | number / 최소: 0 |
| minutesAfterPublish | 선택 | number / 최소: 0 |
| quotedPostId | 선택 | string |
| quotedPost | 선택 | object |
| quotedPost.social_post_id | 필수 | string |
| quotedPost.content | 선택 | string |
| quotedPost.author | 선택 | object |

응답 명세: 200 application/json / comment

## A038 URL 기반 게시물 생성
`POST /api/v1/content-generation/from-url/ai-generate` · Content Generation

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| content | 필수 | string |
| url | 필수 | string / 형식: uri |
| instructions | 선택 | string |
| selectedAccountId | 필수 | string / 형식: uuid |

응답 명세: 200 application/json / mainContent, replies

## A039 URL 원문 추출
`POST /api/v1/content-generation/from-url/extract` · Content Generation

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| url | 필수 | string / 형식: uri |
| language | 선택 | string / 기본: English |

응답 명세: 200 application/json / title, description, content, url, imageUrl, images, media

## A040 기존 AI 콘텐츠 수정
`POST /api/v1/content-generation/ai-modify` · Content Generation

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| socialAccountId | 필수 | string / 형식: uuid |
| currentContent | 필수 | string |
| currentReplies | 선택 | array[string] / 기본: [] |
| modificationInstruction | 필수 | string |
| platform | 선택 | string / 허용: ['threads', 'twitter', 'instagram', 'instagram_fb', 'facebook', 'linkedin', 'youtube', 'tiktok'] |

응답 명세: 200 application/json / mainContent, replies

## A041 AI 텍스트 콘텐츠 생성
`POST /api/v1/content-generation/ai-generate` · Content Generation

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| direction | 필수 | string |
| language | 선택 | string |
| socialAccountId | 선택 | string / 형식: uuid |

응답 명세: 200 application/json / postId, mainContent, replies, message

## A042 아이디어 목록 조회
`GET /api/v1/content-ideation/ideas` · Content Ideation

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| accountId | 선택 | query / string / 형식: uuid |
| status | 선택 | query / string / 허용: ['pending', 'generated', 'completed', 'rejected'] |
| style | 선택 | query / string |
| search | 선택 | query / string |
| dateFrom | 선택 | query / string / 형식: date-time |
| dateTo | 선택 | query / string / 형식: date-time |
| detailLevel | 선택 | query / string / 허용: ['summary', 'content', 'full']; 기본: summary |
| page | 선택 | query / integer / 최소: 0 |
| limit | 선택 | query / integer / 최소: 0; 최대: 100 |

응답 명세: 200 application/json / ideas

## A043 콘텐츠 아이디어 생성
`POST /api/v1/content-ideation/ideas` · Content Ideation

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| accountId | 필수 | string / 형식: uuid |
| ideaCount | 선택 | number |
| manualIdeas | 선택 | array[object] |
| feeling | 선택 | string |
| ideaType | 선택 | object |
| ideaType.style | 선택 | string |
| metadata | 선택 | object |
| metadata.searchInput | 선택 | string |
| metadata.selectedKnowledgeIds | 선택 | array[string] |
| metadata.trendSource | 선택 | object |

응답 명세: 200 application/json / ideas

## A044 아이디어 일괄 삭제
`POST /api/v1/content-ideation/ideas/bulk-delete` · Content Ideation

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| ideaIds | 필수 | array[string] / 최소 항목: 1 |

응답 명세: 200 application/json / success, message

## A045 아이디어 상세 조회
`GET /api/v1/content-ideation/ideas/{id}` · Content Ideation

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| id | 필수 | path / string / 형식: uuid |

응답 명세: 200 application/json / idea

## A046 아이디어 사용 표시
`PATCH /api/v1/content-ideation/ideas/{id}` · Content Ideation

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| id | 필수 | path / string / 형식: uuid |

응답 명세: 200 application/json / idea

## A047 아이디어 삭제
`DELETE /api/v1/content-ideation/ideas/{id}` · Content Ideation

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| id | 필수 | path / string / 형식: uuid |

응답 명세: 200 application/json / success, message

## A048 아이디어 상태 변경
`PUT /api/v1/content-ideation/ideas/{id}/status` · Content Ideation

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| id | 필수 | path / string / 형식: uuid |
| status | 필수 | string / 허용: ['pending', 'generated', 'completed'] |

응답 명세: 200 application/json / success, idea

## A049 아이디어의 콘텐츠 조회
`GET /api/v1/content-ideation/ideas/{id}/to-content` · Content Ideation

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| id | 필수 | path / string / 형식: uuid |

응답 명세: 200 application/json / content

## A050 아이디어에서 콘텐츠 제작
`POST /api/v1/content-ideation/ideas/{id}/to-content` · Content Ideation

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| id | 필수 | path / string / 형식: uuid |

응답 명세: 200 application/json / idea, content, generatedContent

## A051 CTA 템플릿 목록
`GET /api/v1/cta-templates` · CTA Templates

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| socialAccountId | 선택 | query / string / 형식: uuid |
| search | 선택 | query / string |

응답 명세: 200 application/json / array[object]

## A052 CTA 템플릿 저장
`POST /api/v1/cta-templates` · CTA Templates

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| title | 필수 | string |
| content | 필수 | string |
| socialAccountId | 선택 | string / 형식: uuid |
| images | 선택 | array[string] |

응답 명세: 200 application/json / id, workspaceId, projectId, socialAccountId, title, content, images, createdAt, updatedAt

## A053 CTA 템플릿 상세
`GET /api/v1/cta-templates/{id}` · CTA Templates

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| id | 필수 | path / string / 형식: uuid |

응답 명세: 200 application/json / id, workspaceId, projectId, socialAccountId, title, content, images, createdAt, updatedAt

## A054 CTA 템플릿 수정
`PATCH /api/v1/cta-templates/{id}` · CTA Templates

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| id | 필수 | path / string / 형식: uuid |
| title | 선택 | string |
| content | 선택 | string |
| images | 선택 | array[string] |

응답 명세: 200 application/json / id, workspaceId, projectId, socialAccountId, title, content, images, createdAt, updatedAt

## A055 CTA 템플릿 삭제
`DELETE /api/v1/cta-templates/{id}` · CTA Templates

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| id | 필수 | path / string / 형식: uuid |

응답 명세: 200 application/json / success

## A056 CTA 사용 표시
`POST /api/v1/cta-templates/{id}/apply` · CTA Templates

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| id | 필수 | path / string / 형식: uuid |

응답 명세: 200 application/json / success, data

## A057 CTA 템플릿 복제
`POST /api/v1/cta-templates/{id}/clone` · CTA Templates

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| id | 필수 | path / string / 형식: uuid |
| newTitle | 선택 | string |

응답 명세: 200 application/json / id, workspaceId, projectId, socialAccountId, title, content, images, createdAt, updatedAt

## A058 게시물 목록 조회
`GET /api/v1/posts` · Posts

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| status | 선택 | query / string |
| socialAccountId | 선택 | query / string |
| platform | 선택 | query / string |
| projectId | 선택 | query / string |
| search | 선택 | query / string |
| createdAfter | 선택 | query / string |
| createdBefore | 선택 | query / string |
| scheduledAfter | 선택 | query / string |
| scheduledBefore | 선택 | query / string |
| publishedAfter | 선택 | query / string |
| publishedBefore | 선택 | query / string |
| hasMedia | 선택 | query / string / 허용: ['true', 'false'] |
| aiGenerated | 선택 | query / string / 허용: ['true', 'false'] |
| orderBy | 선택 | query / string / 허용: ['createdAt', 'updatedAt', 'scheduledAt', 'publishedAt'] |
| order | 선택 | query / string / 허용: ['asc', 'desc'] |
| page | 선택 | query / string |
| pageSize | 선택 | query / string |
| limit | 선택 | query / string |

응답 명세: 200 application/json / posts, pagination, success

## A059 게시물 초안·예약 생성
`POST /api/v1/posts` · Posts

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| content | 필수 | string |
| description | 선택 | string / null 허용 |
| youtubeTitle | 선택 | string / null 허용 |
| privacyStatus | 선택 | string / 허용: ['public', 'private', 'unlisted']; null 허용 |
| socialAccountId | 필수 | string / 최소 길이: 1 |
| scheduledAt | 선택 | string / null 허용 |
| status | 선택 | string / 허용: ['draft', 'scheduled']; 기본: draft |
| automationWorkflowId | 선택 | string / 형식: uuid; null 허용 |
| images | 선택 | array[string] / null 허용 |
| videos | 선택 | array[string] / null 허용 |
| videoThumbnails | 선택 | array[string] / null 허용 |
| videoUrl | 선택 | string / null 허용 |
| pollOptions | 선택 | object / null 허용 |
| pollOptions.optionA | 필수 | string |
| pollOptions.optionB | 필수 | string |
| pollOptions.optionC | 선택 | string |
| pollOptions.optionD | 선택 | string |
| originalPostId | 선택 | string |
| repostScheduledAt | 선택 | string |
| ideaId | 선택 | string |
| sourceUrl | 선택 | string |
| twitterCommunityId | 선택 | string / null 허용 |
| mediaOrder | 선택 | array[object] / null 허용 |
| tiktokOptions | 선택 | object / null 허용 |
| tiktokOptions.privacyLevel | 선택 | string / 허용: ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY']; null 허용 |
| tiktokOptions.disableComment | 선택 | boolean |
| tiktokOptions.disableDuet | 선택 | boolean |
| tiktokOptions.disableStitch | 선택 | boolean |
| tiktokOptions.brandContentToggle | 선택 | boolean |
| tiktokOptions.brandOrganicToggle | 선택 | boolean |
| tiktokOptions.commercialContentEnabled | 선택 | boolean |
| tiktokOptions.autoAddMusic | 선택 | boolean |
| tiktokOptions.photoCoverIndex | 선택 | integer / 최소: 0 |
| tiktokOptions.photoTitle | 선택 | string / 최대 길이: 90 |
| tiktokOptions.tiktokPostMode | 선택 | string / 허용: ['DIRECT_POST', 'MEDIA_UPLOAD'] |
| instagramOptions | 선택 | object / null 허용 |
| instagramOptions.shareToFeed | 선택 | boolean |
| instagramOptions.collaboratorTags | 선택 | array[string] / 최대 항목: 3 |
| instagramOptions.locationId | 선택 | string / null 허용 |
| instagramOptions.locationName | 선택 | string / null 허용 |
| instagramOptions.firstComment | 선택 | string / null 허용 |
| origin | 선택 | string |
| replies | 선택 | array[object] |

응답 명세: 200 application/json / post, postId, success, message

## A060 게시물 상세 조회
`GET /api/v1/posts/{id}` · Posts

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| id | 필수 | path / string |

응답 명세: 200 application/json / id, content, description, youtubeTitle, privacyStatus, status, scheduledAt, publishedAt, sourceUrl, images, videos, videoThumbnails, pollOptions, socialAccountId, socialPostId, userId, workspaceId, projectId, automationWorkflowId, createdAt, updatedAt, repostScheduledAt, repostStatus, isReposted, repostedAt, originalPostId, ideaId, videoUrl, origin, twitterCommunityId, mediaOrder, tiktokOptions, tiktokPublishId, instagramOptions, socialAccount, quotedPost, replies, postInsights

## A061 게시물 수정
`PUT /api/v1/posts/{id}` · Posts

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| id | 필수 | path / string |
| content | 선택 | string |
| description | 선택 | string / null 허용 |
| youtubeTitle | 선택 | string / null 허용 |
| privacyStatus | 선택 | string / 허용: ['public', 'private', 'unlisted']; null 허용 |
| scheduledAt | 선택 | string / null 허용 |
| status | 선택 | string |
| images | 선택 | array[string] / null 허용 |
| videos | 선택 | array[string] / null 허용 |
| videoThumbnails | 선택 | array[string] / null 허용 |
| videoUrl | 선택 | string / null 허용 |
| pollOptions | 선택 | 복합형 / null 허용 |
| originalPostId | 선택 | string / null 허용 |
| socialAccountId | 선택 | string |
| twitterCommunityId | 선택 | string / null 허용 |
| mediaOrder | 선택 | array[object] / null 허용 |
| tiktokOptions | 선택 | object / null 허용 |
| tiktokOptions.privacyLevel | 선택 | string / 허용: ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY']; null 허용 |
| tiktokOptions.disableComment | 선택 | boolean |
| tiktokOptions.disableDuet | 선택 | boolean |
| tiktokOptions.disableStitch | 선택 | boolean |
| tiktokOptions.brandContentToggle | 선택 | boolean |
| tiktokOptions.brandOrganicToggle | 선택 | boolean |
| tiktokOptions.commercialContentEnabled | 선택 | boolean |
| tiktokOptions.autoAddMusic | 선택 | boolean |
| tiktokOptions.photoCoverIndex | 선택 | integer / 최소: 0 |
| tiktokOptions.photoTitle | 선택 | string / 최대 길이: 90 |
| tiktokOptions.tiktokPostMode | 선택 | string / 허용: ['DIRECT_POST', 'MEDIA_UPLOAD'] |
| instagramOptions | 선택 | object / null 허용 |
| instagramOptions.shareToFeed | 선택 | boolean |
| instagramOptions.collaboratorTags | 선택 | array[string] / 최대 항목: 3 |
| instagramOptions.locationId | 선택 | string / null 허용 |
| instagramOptions.locationName | 선택 | string / null 허용 |
| instagramOptions.firstComment | 선택 | string / null 허용 |

응답 명세: 200 application/json / id, content, description, youtubeTitle, privacyStatus, status, scheduledAt, publishedAt, sourceUrl, images, videos, videoThumbnails, pollOptions, socialAccountId, socialPostId, userId, workspaceId, projectId, automationWorkflowId, createdAt, updatedAt, repostScheduledAt, repostStatus, isReposted, repostedAt, originalPostId, ideaId, videoUrl, origin, twitterCommunityId, mediaOrder, tiktokOptions, tiktokPublishId, instagramOptions

## A062 게시물 삭제
`DELETE /api/v1/posts/{id}` · Posts

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| id | 필수 | path / string |

응답 명세: 200 application/json / success, deletedPost

## A063 스레드 구성 글 조회
`GET /api/v1/posts/{id}/thread-parts` · Posts

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| id | 필수 | path / string |

응답 명세: 200 application/json / parts

## A064 스레드 구성 글 전체 교체
`PUT /api/v1/posts/{id}/thread-parts` · Posts

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| id | 필수 | path / string |
| parts | 필수 | array[object] |

응답 명세: 200 application/json / success

## A065 인용 가능한 게시물 검색
`GET /api/v1/posts/quotable` · Posts

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| limit | 선택 | query / string |
| sort | 선택 | query / string / 허용: ['recent', 'popular'] |
| q | 선택 | query / string |
| socialAccountId | 선택 | query / string |

응답 명세: 200 application/json / posts, success

## A066 게시물 예약
`POST /api/v1/posts/publishing/schedule/{postId}` · Posts

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| postId | 필수 | path / string |
| scheduledFor | 필수 | string / 최소 길이: 1 |

응답 명세: 200 application/json / success, post

## A067 게시물 재게시
`POST /api/v1/posts/publishing/repost/{postId}` · Posts

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| postId | 필수 | path / string |

응답 명세: 200 application/json / success, message, alreadyReposted

## A068 게시물 재게시 예약
`POST /api/v1/posts/publishing/repost/schedule/{postId}` · Posts

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| postId | 필수 | path / string |
| repostScheduledAt | 필수 | string / 최소 길이: 1 |

응답 명세: 200 application/json / success, post

## A069 게시물 즉시 발행 작업 시작
`POST /api/v1/posts/publishing/now/{postId}` · Posts

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| postId | 필수 | path / string |

응답 명세: 200 application/json / success, taskId, message

## A070 계정 보고서 생성
`POST /api/v1/reports/generate` · Reports

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| accountId | 선택 | string |

응답 명세: 200 application/json / success, message, eventId, details

## A071 계정 보고서 조회
`GET /api/v1/reports/{reportId}` · Reports

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| reportId | 필수 | path / string |

응답 명세: 200 application/json / data

## A072 연결 SNS 계정 전체 목록
`GET /api/v1/social-accounts/my-accounts` · Social Accounts

이 작업은 별도 입력 본문이 없거나 명세가 입력 세부사항을 생략한다. 상세 입력 없음과 입력 불필요를 동일시하지 않는다.

응답 명세: 200 application/json / socialAccounts, success

## A073 SNS 계정 조회
`GET /api/v1/social-accounts/{id}` · Social Accounts

이 작업은 별도 입력 본문이 없거나 명세가 입력 세부사항을 생략한다. 상세 입력 없음과 입력 불필요를 동일시하지 않는다.

응답 명세: 200 application/json / socialAccounts, success

## A074 계정 지식자료 조회
`GET /api/v1/social-accounts/{id}/knowledge-base` · Thread Accounts

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| id | 필수 | path / string |

응답 명세: 200 application/json / knowledge, totalFiles, totalChunks, success

## A075 지식자료 업로드 주소 발급
`POST /api/v1/social-accounts/{id}/knowledge/upload-url` · Thread Accounts

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| id | 필수 | path / string / 최소 길이: 1 |
| fileName | 필수 | string / 최소 길이: 1 |
| fileType | 필수 | string / 최소 길이: 1 |
| fileSize | 필수 | integer / 최소: 0 |

응답 명세: 200 application/json / uploadUrl, token, path, storagePath

## A076 업로드한 지식자료 처리
`POST /api/v1/social-accounts/{id}/knowledge/process-uploaded` · Thread Accounts

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| id | 필수 | path / string / 최소 길이: 1 |
| files | 필수 | array[object] / 최소 항목: 1 |

응답 명세: 200 application/json / success, filesProcessed, filesSucceeded, filesFailed, chunksCreated, uploadedFiles, failedFiles, error

## A077 원파일 기준 지식자료 삭제
`POST /api/v1/social-accounts/{id}/knowledge/delete-document` · Thread Accounts

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| id | 필수 | path / string / 최소 길이: 1 |
| sourceFile | 필수 | string / 최소 길이: 1 |

응답 명세: 200 application/json / success

## A078 계정 게시물 조회
`GET /api/v1/social-accounts/{id}/posts` · Thread Accounts

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| id | 필수 | path / string |
| limit | 선택 | query / string |
| sort | 선택 | query / string / 허용: ['recent', 'popular'] |
| include_insights | 선택 | query / string / 허용: ['true', 'false'] |
| q | 선택 | query / string |

응답 명세: 200 application/json / posts, success

## A079 계정 생성·발행 설정 조회
`GET /api/v1/social-accounts/{id}/settings` · Thread Accounts

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| id | 필수 | path / string |

응답 명세: 200 application/json / settings, success

## A080 계정 생성·발행 설정 수정
`PATCH /api/v1/social-accounts/{id}/settings` · Thread Accounts

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| id | 필수 | path / string |
| concept | 선택 | string / null 허용 |
| isAuto | 선택 | boolean |
| isAutopilot | 선택 | boolean |
| targetAudience | 선택 | string / null 허용 |
| language | 선택 | string |
| contentLength | 선택 | string / 허용: ['extra-short', 'short', 'medium', 'long', 'extra-long'] |
| referencePosts | 선택 | array[string] / null 허용 |
| autoGenerationTime | 선택 | string / null 허용 |
| dailyContentCount | 선택 | integer / 최소: 1; 최대: 5 |
| userPrompt | 선택 | string / null 허용 |
| writingStyle | 선택 | string / null 허용 |
| publishTimes | 선택 | array[string] / null 허용 |
| autoPublishTermsAcceptedAt | 선택 | string / null 허용 |
| autopilotCarouselPresetMode | 선택 | string / 허용: ['auto', 'fixed'] |
| autopilotCarouselPresetId | 선택 | string / 형식: uuid; null 허용 |
| autopilotCarouselAspectRatio | 선택 | string / 허용: ['1:1', '3:4', '4:5'] |

응답 명세: 200 application/json / success, message

## A081 외부 Threads 검색
`GET /api/v1/external-communication/search` · External Communication

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| accountId | 필수 | query / string / 최소 길이: 1 |
| q | 필수 | query / string / 최소 길이: 1 |
| type | 선택 | query / string / 허용: ['TOP', 'RECENT']; 기본: TOP |
| after | 선택 | query / string |
| targetCount | 선택 | query / string / 기본: 20 |

응답 명세: 200 application/json / data, paging

## A082 외부 Threads 답글
`POST /api/v1/external-communication/media/{mediaId}/reply` · External Communication

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| mediaId | 필수 | path / string |
| socialAccountId | 필수 | string / 최소 길이: 1 |
| text | 필수 | string / 최소 길이: 1 |

응답 명세: 200 application/json / success, message, replyId, eventId, status

## A083 외부 Threads 재게시
`POST /api/v1/external-communication/media/{mediaId}/repost` · External Communication

| 입력 | 구분 | 타입·범위 |
|---|---|---|
| mediaId | 필수 | path / string |
| socialAccountId | 필수 | string / 최소 길이: 1 |

응답 명세: 200 application/json / success, message, postId, data