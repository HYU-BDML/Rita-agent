# -*- coding: utf-8 -*-
"""«통자수» 와 «폭에 맞춰 감기».

사람 결정 2026-09-16(본문)·2026-09-18(모든 칸, 「세로줄은 안 본다니까」): 글자칸은
「한 줄에 몇 자」가 아니라 「통틀어 몇 자」로 본다. 틀의 `최소`·`최대` 가 그 총량이다
(`template_out.넓이상한` — 네모 넓이 ÷ 글자 한 개 넓이). 줄 나누기는 LLM 이 아니라
코드가 **글꼴 폭을 재서** 한다 — 그래야 원본처럼 상자 오른쪽까지 찬다.

실물: 파란 타임라인 5번 장. 상자 폭 892px(원본의 83%)인데 LLM 이 16~21자에서
끊어 오른쪽 35% 가 비었다. 라벨은 맞았다.

**한 곳에 둔다.** 틀 설명·대본 검증·배치 검증이 다른 값을 세면 「설명대로 썼는데
검증이 막는」 일이 난다.
"""
import re
from pathlib import Path

# 굽는 쪽과 같은 글꼴 자리. 상자 안은 `/var/task/dify` → `/var/task/render/fonts`,
# 여기서는 `cardnews/dify` → `cardnews/render/fonts` 가 된다.
글꼴집 = Path(__file__).resolve().parent.parent / "render" / "fonts"

_공백 = re.compile(r"\s+")


def 통자수(슬롯: dict) -> tuple:
    """(통최소, 통최대). 틀의 `최소`·`최대` 가 이미 총량이다 — 곱하지도, 물러서지도 않는다."""
    return int(슬롯["최소"]), int(슬롯["최대"])


def 자분량(슬롯: dict, 글: str) -> float:
    """글이 «몇 자 분량» 인가 — 실제 글꼴 폭을 「가」 한 자 폭으로 나눈 값.

    **글자 수가 아니다**(사람 결정 2026-09-18). 틀의 상한은 「가」 몇 개가 드는
    네모냐로 정해지는데(`template_out.넓이상한`), 영문·숫자·띄어쓰기는 한글의
    절반쯤이라 글자 수로 세면 폭으로는 들어가는 글이 막힌다 — 실측: «마케터 AI
    필수» 는 9자지만 6.7자 분량, «01. ChatAI» 는 10자지만 5.7자 분량.

    글꼴을 못 열면(글꼴 파일이 없는 상자) 글자 수로 물러선다 — 죽는 것보다
    빡빡한 것이 낫다.
    """
    try:
        재기 = 글꼴재기(슬롯)
        한자 = 재기("가")
        return 재기(글) / 한자 if 한자 > 0 else float(len(글))
    except Exception:  # noqa: BLE001 — 글꼴이 없으면 세는 쪽으로
        return float(len(글))


def 한덩어리(글: str) -> str:
    """줄바꿈·겹친 띄어쓰기를 띄어쓰기 하나로. LLM 이 줄을 나눠 보내도 뜻은 그대로다."""
    return _공백.sub(" ", str(글 or "")).strip()


def 폭감기(글: str, 재기, 폭: float) -> list:
    """낱말 단위 탐욕 감기. `재기(글) -> px`. 낱말이 폭보다 길면 글자로 쪼갠다.

    **자르지 않는다.** 줄이 넘쳐도 그대로 낸다 — 넘침은 배치 검증이 막고, 다시 쓰기가
    고친다. 여기서 자르면 원문에 없던 뜻이 된다.
    """
    낱말들 = 한덩어리(글).split(" ") if 한덩어리(글) else []
    줄들, 지금 = [], ""
    for 낱말 in 낱말들:
        후보 = f"{지금} {낱말}" if 지금 else 낱말
        if 재기(후보) <= 폭:
            지금 = 후보
            continue
        if 지금:
            줄들.append(지금)
            지금 = ""
        if 재기(낱말) <= 폭:
            지금 = 낱말
            continue
        # 낱말 하나가 폭보다 길다 — 글자로 쪼갠다.
        조각 = ""
        for 글자 in 낱말:
            if 재기(조각 + 글자) <= 폭 or not 조각:
                조각 += 글자
            else:
                줄들.append(조각)
                조각 = 글자
        지금 = 조각
    if 지금:
        줄들.append(지금)
    return 줄들


def 글꼴재기(슬롯: dict):
    """슬롯의 글꼴·굵기·pt 로 «글의 픽셀 폭» 을 재는 함수를 만든다.

    글꼴 파일 표는 굽기와 같은 것(`analyze/verify_labeled.font_of` → `fontmatch.FONT_FILES`).
    자간 0, 글자마다 `textlength` 를 더한다 — `render/template_render._measure_tracked`
    와 같은 가정이라 「감았을 땐 맞는데 구우면 넘치는」 일이 없다.

    이름을 못 알아보면 굽는 쪽과 같이 프리텐다드로 물러선다 — 아래를 보라.
    """
    from PIL import Image, ImageDraw, ImageFont  # noqa: PLC0415 — 여기서만 쓴다
    import verify_labeled  # noqa: PLC0415 — analyze/ 가 sys.path 에 있다(카드뉴스만들기)

    pt = max(6, int(round(슬롯.get("pt") or 0)))
    굵은가 = 슬롯.get("weight") == "Bold"
    # **모르는 글꼴이면 프리텐다드로 물러선다**(최종 검토 2026-09-17).
    #
    # `font_of` 는 이름을 못 알아보면 기준 글꼴로 떨어지는데, 그 경로가 윈도
    # 것(`malgun.ttf`)이라 상자 안에서는 못 연다 — 배치가 거기서 죽는다.
    # 굽기(`render/cardnews_compose.글꼴이름`)도 모르면 프리텐다드로 물러서니
    # 같은 자리로 맞춘다. 물러섰나는 `_SUBSTITUTED` 에 새 항목이 생기는 것으로 본다.
    앞서댄것 = set(verify_labeled._SUBSTITUTED)
    try:
        font = verify_labeled.font_of({"font": 슬롯.get("font"), "weight": 슬롯.get("weight"),
                                       "pt": 슬롯.get("pt")})
        물러섰다 = verify_labeled._SUBSTITUTED != 앞서댄것
    except Exception:  # noqa: BLE001 — 글꼴을 못 열면 무엇이든 프리텐다드로 간다
        물러섰다 = True
    if 물러섰다:
        이름 = "Pretendard-Bold.otf" if 굵은가 else "Pretendard-Medium.otf"
        font = ImageFont.truetype(str(글꼴집 / 이름), pt)
    자 = ImageDraw.Draw(Image.new("RGB", (8, 8)))

    def 재기(글: str) -> float:
        return sum(자.textlength(ch, font=font) for ch in 글)

    return 재기
