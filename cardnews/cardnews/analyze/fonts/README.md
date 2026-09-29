# 글꼴 — 규칙표의 자수 한계를 재는 자

규칙표(`docs/규칙표_카드뉴스.md`)의 핵심은 **자리마다 몇 자가 들어가나**이고, 그 값은
글꼴마다 다르다. 그래서 **재는 글꼴이 실제로 쓰인 글꼴이어야** 한다 — 프리텐다드로 재고
지마켓산스로 그리면 자수 한계가 틀리고, Dify 의 검증 노드가 잘못된 기준으로 되돌린다.

여기 있는 8종은 `web/server/labels.js` 의 `FONTS` 와 같은 목록이다. 사람이 라벨할 때
그중 하나를 고르고, 안 고르면 계열 기본값(고딕→프리텐다드, 명조→나눔명조)으로 떨어진다.

재는 도구는 `render-server/template_render.py` 의 `_measure_tracked()` 다 — 글자를
하나씩 자간까지 더해 재고 이모지는 따로 잰다.

## 어디서 받았나 (2026-08-19)

| 글씨체 | 파일 | 출처 | 라이선스 |
|---|---|---|---|
| 프리텐다드 | `render-server/fonts/Pretendard-{Bold,Medium}.otf` **(여기 없음)** | 이미 저장소에 있음 | SIL OFL |
| 지마켓 산스 | `GmarketSansTTF{Light,Medium,Bold}.ttf` | [corp.gmarket.com/fonts](https://corp.gmarket.com/fonts/) 공식 | SIL OFL |
| 에스코어 드림 | `SCDream1~9.otf` | [s-core.co.kr/company/font](https://s-core.co.kr/company/font/) 공식 | 무료·재배포 가능, **수정·판매 금지**, 임베딩은 별도 계약 |
| 여기어때 잘난체 | `JalnanGothicTTF.ttf` · `Jalnan2TTF.ttf` | [goodchoice.kr/font](https://www.goodchoice.kr/font) 공식 (framerusercontent CDN) | 상업적 사용 가능, **파일 그대로만**, 수정·재배포 금지 |
| 검은고딕 | `BlackHanSans-Regular.ttf` | [google/fonts](https://github.com/google/fonts) `ofl/blackhansans` | SIL OFL |
| 배민 도현 | `DoHyeon-Regular.ttf` | [google/fonts](https://github.com/google/fonts) `ofl/dohyeon` | SIL OFL |
| 나눔스퀘어 라운드 | `NanumSquareRound{L,R,B,EB}.ttf` | [hangeul.naver.com/font](https://hangeul.naver.com/font) 공식 묶음 | 나눔글꼴 라이선스 (무료 상업용) |
| 나눔명조 | `NanumMyeongjo-{Regular,Bold}.ttf` | [google/fonts](https://github.com/google/fonts) `ofl/nanummyeongjo` | SIL OFL |

**개인이 올린 미러는 안 썼다.** 원본과 다른 판이면 자수 측정이 조용히 틀어진다.

## git 에 넣지 않는다

`.gitignore` 로 뺀다. 이유 둘:

1. **재배포를 금지하는 것이 섞여 있다** — 잘난체는 「어떠한 형태로든 재배포 금지」다.
   저장소에 넣는 것이 재배포로 읽힐 여지를 아예 만들지 않는다.
2. 22개 파일이 수십 MB다. 측정에만 쓰는 자산이라 이력에 쌓을 이유가 없다.

없으면 위 표의 출처에서 다시 받으면 된다.

## 아직 못 하는 것

`ruler/text.py` 의 `_family()` 가 **명조를 한 번도 명조라고 하지 않는다**(2026-08-19 실측:
48px 에서 고딕 0.126 · 명조 0.295 로 문턱 0.45 아래에 둘 다, 100px 에서는 순서가 뒤집힘).
그래서 나눔명조는 받아뒀지만 **자동 판정으로는 도달하지 않는다** — 사람이 라벨에서
직접 골라야만 쓰인다. 계획서 「이 계획 밖에 남는 것」에 적혀 있다.
