# 카드뉴스 에이전트

주제 한 줄만 적으면, 잘 만든 인스타그램 카드뉴스의 디자인을 빌려 장마다 글과 사진을 채워 주는 카드뉴스 제작 에이전트입니다.

- 서비스: https://cardnews.david112702.workers.dev/ (리타에서도 이 주소로 띄웁니다)
- 사용설명서: https://cardnews.david112702.workers.dev/manual
- 이 코드는 2026-09-29 서비스 중인 판입니다(원래 저장소 기록 `53121dc`).

## 폴더 구성

원래 저장소와 같은 모양으로 넣어서 설정 파일 속 경로를 고치지 않았습니다. 안쪽 `cardnews/` 폴더가 코드이고, 바깥 파일 다섯은 웹 설정입니다.

| 경로 | 하는 일 |
|---|---|
| `cardnews/web/` | 채팅 화면·라벨판·수집기 화면과 Cloudflare Worker 서버 코드(`_worker.js`, `server/`) |
| `cardnews/render/` | 작업대 람다: 카드 완성(Pillow·ffmpeg), 작업대·결과 화면, 사진·영상 올리기 |
| `cardnews/analyze/` | 분석 람다: 대본 짓기, 사진 계획·만들기, 인스타 게시물 가져오기, 템플릿 분석 |
| `cardnews/dify/` | 대본 지시문과 틀 고르기 코드(분석 람다가 불러 씁니다) |
| `wrangler.jsonc` · `package.json` · `package-lock.json` · `build.mjs` · `dev-server.mjs` | 웹(Cloudflare Worker) 설정, 빌드, 로컬 확인 서버 |

## 작동 원리

브라우저(리타 화면 안) → Cloudflare Worker(채팅 판정, 템플릿 목록, 사진 올리기, 대화 저장) → AWS API Gateway → 람다 둘(작업대·분석) → AWS S3 창고

몇 분씩 걸리는 일(대본, 사진, 템플릿 분석, 카드 완성)은 람다가 뒤에서 하고, 화면은 번호표로 5초마다 진행을 확인합니다.

## 쓰는 외부 서비스

| 무엇에 | 서비스 · 모델 |
|---|---|
| 채팅 판정 | DeepSeek `deepseek-chat` |
| 대본, 사진 계획, 말투 | DeepSeek `deepseek-v4-pro` |
| 올린 사진 읽기 | DeepSeek `deepseek-flash` |
| 사진 만들기, 장식 오리기, 바닥판 | fal.ai `openai/gpt-image-2.5` (text-to-image · edit) |
| 템플릿 글자 읽기 | OpenRouter `openai/gpt-5.6-luna` |
| 인스타 게시물 가져오기 | Apify `apify~instagram-scraper` |
| 사람 확인 | Cloudflare Turnstile |
| 저장 | Cloudflare D1 · R2, AWS S3 |

## 필요한 설정값 (이름만)

- Worker: `DEEPSEEK_API_KEY`, `TURNSTILE_SECRET`, `WEB_SECRET`, `BOARD_PASSWORD` — 바인딩 `DB`·`SHOTS`·`ASSETS` 는 `wrangler.jsonc`
- 작업대 람다: `BUCKET`, `ANALYZE_FN`, `WEB_SECRET`, `RITA_AGENT_SECRET`
- 분석 람다: `DEEPSEEK_API_KEY`, `FAL_KEY`, `OPENROUTER_API_KEY`, `APIFY_TOKEN`, `BUCKET`, `BOARD_URL`, `BOARD_PASSWORD`, `CARDNEWS_DATA`, `CARDNEWS_RECIPES`

## 올리는 법

- 웹: 이 폴더에서 `npm install` 뒤 `npm run deploy` (`build.mjs` 로 `dist/` 를 만든 뒤 `wrangler deploy`)
- 작업대 람다: `bash cardnews/render/deploy.sh`
- 분석 람다: `bash cardnews/analyze/deploy.sh`

## 이 판에서 뺀 것

- **글꼴 파일**: 재배포가 금지된 글꼴이 섞여 있어 모두 뺐습니다. 받는 곳과 라이선스는 `cardnews/analyze/fonts/README.md`, `cardnews/render/fonts/README.md` 에 있습니다.
- **실제 인스타그램 자료가 든 시험 자료**(`cardnews/web/test/fixtures`): 다른 사람 계정 자료라 뺐습니다. 이 자료를 쓰는 시험 몇 개는 이 판에서 돌지 않습니다.
- 작업 중에 쌓인 확인 화면, 분석 자료, 캐시, 내부 메모 문서.
