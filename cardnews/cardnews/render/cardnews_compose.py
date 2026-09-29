# -*- coding: utf-8 -*-
"""라벨링 기반 카드뉴스(`dify/카드뉴스_생성기.yml`, Task 10) 전용 그리기.

**`composer.py`·`template.json` 을 건드리지 않는다.** 그 둘은 `slide_types`
레지스트리로 "타입 이름 → 정해진 자리표" 를 찾아 채우는 방식인데, 이 카드뉴스는
`카드뉴스_배치검증.py` 가 이미 장마다 box·pt·weight·글자색·줄을 전부 채운
**자기서술형** 데이터(`cards_json`)를 낸다 — 타입을 찾을 필요가 없다. 그래서
기존 레지스트리에 억지로 끼워 맞추는 대신 이 파일 하나로 따로 그린다.

`template_render.py` 의 글꼴·그러데이션·자수 실측 함수(`FontBook`,
`_draw_text_tracked`, `_vertical_gradient`)만 그대로 가져다 쓴다 — 카드뉴스
검증(`카드뉴스_대본검증.py`)이 잰 것과 같은 함수라야, 검증을 통과한 자수가
실제로도 안 넘친다.

**사진·로고 자리** — 장식영역에 `media_url` 이 있으면 그 사진을 받아 자리에
채운다("사진"·"인물"은 자리를 꽉 채우게 잘라서, "로고"는 안 잘리게 안에
맞춰서). `media_url` 이 없거나 못 받으면 `draw_cover_slide` 의 자리표시와
같은 모양(회색 바탕 + "?")을 그린다 — 이 레포에 이미 있는 "여기에 넣으세요"
관례를 그대로 따른다. **사진을 구해오는 Dify 노드는 아직 없다** — 그 노드가
나중에 붙으면 `카드뉴스_배치.py` 가 장식영역마다 `media_url` 을 채워 넣으면
되고, 이 파일은 이미 그걸 받을 준비가 돼 있다.
"""
import re
import urllib.request
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

import template_render as tr
import 주소 as _주소
import edit_store

HERE = Path(__file__).resolve().parent
CANVAS = (1080, 1350)

WEIGHT_TO_FONT = {"Bold": "Pretendard-Bold", "Regular": "Pretendard-Medium"}
"""«Regular」로 적힌 슬롯은 Pretendard-Medium 으로 잰다 — 레포에 Pretendard
Regular 파일이 없어서 `analyze/verify_labeled.font_of` 가 이미 그렇게 대신
쓰고 있다(오류모음 §1, 라벨링 검증이 이미 통과한 가정). 여기서도 같은 대응을
써야 검증 때 잰 폭과 굽기 때 그리는 폭이 어긋나지 않는다.

**이제 이건 «못 알아본 글꼴» 의 물러설 자리다.** 아래 `한글글꼴` 참고."""

# 사람이 라벨에서 고를 수 있는 글씨체(`analyze/fontmatch.FONT_FILES` ·(`analyze/fontmatch.FONT_FILES` ·
# `web/server/labels.js` 의 FONTS)을 굽는 쪽 이름으로 옮긴 표다.
#
# **여태 굽는 쪽은 이 표가 없었다.** `WEIGHT_TO_FONT` 한 줄로 무조건 프리텐다드를
# 그렸다 — 틀에 「검은고딕」이라 적혀 있어도 프리텐다드로 나왔다(사람 지적
# 2026-08-29: 「글씨체 다양하게 받은 거 맞아?」). 분석은 여덟 종으로 재는데
# 굽기는 한 종으로 그렸으니, **재는 자와 그리는 자가 달랐다.**
#
# 굵기가 한 벌뿐인 글꼴(잘난체·검은고딕·도현)은 둘 다 같은 파일이다 — 원래
# 굵은 글꼴이라 Regular 판이 없다.
한글글꼴 = {
    "프리텐다드": ("Pretendard-Bold", "Pretendard-Medium"),
    "원티드산스": ("WantedSans-Bold", "WantedSans-Medium"),
    "지마켓산스": ("GmarketSans-Bold", "GmarketSans-Medium"),
    "에스코어드림": ("SCDream-Bold", "SCDream-Medium"),
    "여기어때잘난체": ("Jalnan", "Jalnan"),
    "검은고딕": ("BlackHanSans", "BlackHanSans"),
    "배민도현": ("DoHyeon", "DoHyeon"),
    "나눔스퀘어라운드": ("NanumSquareRound-Bold", "NanumSquareRound-Medium"),
    "나눔명조": ("NanumMyeongjo-Bold", "NanumMyeongjo-Medium"),
}


def 글꼴이름(슬롯: dict) -> str:
    """이 칸을 어떤 글꼴로 그릴 것인가.

    **못 알아보면 프리텐다드로 물러서되 조용히는 안 한다.** 배경판이 조용히
    사라진 것과 같은 함정이다 — 자국이 없으면 아무도 못 찾는다.
    """
    굵은가 = 슬롯.get("weight") == "Bold"
    적힌것 = (슬롯.get("font") or "").strip()
    한벌 = 한글글꼴.get(적힌것)
    if 한벌 is None:
        if 적힌것 and 적힌것 != "못 가림":
            print(f"!! 모르는 글꼴 «{적힌것}» — 프리텐다드로 그린다")
        한벌 = 한글글꼴["프리텐다드"]
    return 한벌[0] if 굵은가 else 한벌[1]

# **사진 자리는 속을 안 칠한다**(사람 결정 2026-09-18: 「그냥 투명하게 그리고
# 겉에만 점선, 중앙에 ?」). 회색으로 꽉 채우면 사진을 넣기 전 카드가 회색
# 덩어리로 보인다. 속은 그대로 두어 밑에 깔린 배경이 비치게 하고, 테두리에
# 점선만 두르고 가운데에 물음표를 찍는다.
PLACEHOLDER_MARK_COLOR = "#B4B4B4"
점선두께 = 3
점선칸 = 14        # 점 한 칸의 길이
점선틈 = 10        # 점 사이 빈 길이
LINE_SPACING = 1.32
"""줄간격 실측값(예: 표지 헤드라인 107px·줄간격126, 비율 1.178)이 슬롯마다
다르지만, 이 카드뉴스는 슬롯별 줄간격을 아직 안 잰다(Task 11 재료). 한글
본문이 줄 사이가 좁으면 답답해 보이는 쪽이 넘치는 쪽보다 안전해서, 넉넉한
쪽으로 하나 고정한다 — box 자체가 실측 상한 안에서 여유 있게 잡혀 있어
이 정도로는 밖으로 안 넘친다(§1 표의 "쓸 수 있는 폭"과 별개로 세로는
장식영역과 안 겹치게 배치가 이미 검증한다)."""


def _rgba(hex_color: str) -> tuple[int, int, int, int]:
    h = hex_color.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)


def _parse_gradient(띠: str) -> list[tuple[float, str]]:
    """"#FEFEFE@0% → #F5F5F5@53% → ..." 를 `_vertical_gradient` 의 stops 로."""
    stops = []
    for 조각 in 띠.split("→"):
        m = re.match(r"\s*(#[0-9A-Fa-f]{6})@([\d.]+)%\s*", 조각)
        if not m:
            raise ValueError(f"그러데이션 띠를 못 읽는다: «조각={조각!r}» (전체: {띠!r})")
        stops.append((float(m.group(2)) / 100, m.group(1)))
    return stops


def _draw_background(img: Image.Image, 배경: dict) -> None:
    w, h = img.size
    종류 = 배경.get("종류")
    if 종류 == "그라데이션":
        grad = tr._vertical_gradient(w, h, _parse_gradient(배경["띠"]))
        img.paste(grad, (0, 0))
    elif 종류 == "단색":
        ImageDraw.Draw(img).rectangle([0, 0, w, h], fill=_rgba(배경["hex"]))
    elif 종류 in ("사진", "미측정"):
        # **사진 배경은 여기서 안 그린다.** 어떤 사진인지는 hex 로 못 적는다 —
        # 그래서 틀이 «장 전체를 덮는 사진 자리» 를 하나 깔아 두고(`make_dsl_
        # cardnews` 참고) 그 위에 사람이 사진을 넣는다. 여기서는 그 밑에 깔릴
        # 바닥만 칠한다.
        #
        # 예전엔 여기서 죽었다(`모르는 배경 종류`). 배경이 사진인 게시물의 틀은
        # 만들어지기는 하는데 그 틀로 카드를 만들면 그 자리에서 터졌다.
        ImageDraw.Draw(img).rectangle([0, 0, w, h],
                                      fill=_rgba(배경.get("hex") or "#FFFFFF"))
    else:
        raise ValueError(f"모르는 배경 종류: {배경!r}")
    # **배경판을 그 «위에» 얹는다.** 색·그라데이션을 먼저 칠하고 판을 덮으면,
    # 판에서 뚫린 자리(사람이 그은 네모)로 아래 색이 그대로 비친다. 판에는
    # 색 이름으로 못 담는 것들이 들어 있다 — 구분선·무늬·모서리 장식.
    판주소 = 배경.get("판")
    if 판주소:
        판 = _fetch_media(판주소)
        if 판 is not None:
            # 판은 그 장을 통째로 뜬 것이라 크기가 같아야 한다. 다르면 맞춘다 —
            # 안 맞추면 `paste` 가 왼쪽 위에 붙여 놓고 나머지를 비운다.
            if 판.size != (w, h):
                판 = 판.resize((w, h), Image.LANCZOS)
            img.paste(판, (0, 0), 판 if 판.mode == "RGBA" else None)


# 전체 사진 아래에 까는 음영의 붙박이 값.
#
# **기본으로 깔린다**(사람 결정 2026-09-18). 표지 글자가 흰색이라 밝은 사진
# 위에서는 안 읽힌다 — 원본 카드뉴스들이 다들 그렇게 해 뒀다. 켜고 끄는 값은
# 따로 안 둔다: 진하기 0 이 곧 끄기다.
음영기본색 = "#000000"
음영기본진하기 = 50       # 맨 아래에서 이 색이 얼마나 짙은가 (%)
음영시작 = 0.55           # 위에서 이 지점부터 색이 올라온다 (= 아래 45%)


def _음영얹기(img: Image.Image, region: dict) -> None:
    """**장 전체를 덮는 사진** 위에 아래로 갈수록 짙어지는 띠를 한 겹 덮는다.

    슬라이드 «안» 의 사진 칸에는 안 붙인다 — 붙이면 원본에 없던 그늘이 생겨
    되돌려 그리기 판정이 틀어진다. 판별은 `배경자리` 표로 한다(틀이 그 칸에만
    붙인다, `make_dsl_cardnews._배경자리`).

    글자·도형보다 **먼저** 깔린다 — 이 함수는 장식영역을 도는 중에 불리고
    글자영역은 그 뒤에 그려진다(`draw_card`). 그래서 글자가 음영 위에 온다.
    """
    if not region.get("배경자리"):
        return
    진하기 = region.get("음영진하기")
    진하기 = 음영기본진하기 if 진하기 is None else 진하기
    try:
        진하기 = max(0, min(100, float(진하기)))
    except (TypeError, ValueError):
        진하기 = 음영기본진하기
    if not 진하기:
        return                          # 0 = 끄기
    색 = _rgba(region.get("음영색") or 음영기본색)[:3]
    w, h = img.size
    y0 = int(h * 음영시작)
    높이 = h - y0
    if 높이 < 2:
        return
    꼭대기알파 = 진하기 * 255 / 100
    띠 = Image.new("RGBA", (w, 높이), (0, 0, 0, 0))
    띠d = ImageDraw.Draw(띠)
    for i in range(높이):
        띠d.line([(0, i), (w, i)], fill=색 + (int(꼭대기알파 * i / (높이 - 1)),))
    img.alpha_composite(띠, (0, y0))


# 사진 «바깥» 에 까는 그림자의 붙박이 값.
#
# **기본은 꺼짐이다**(사람 결정 2026-09-18). 음영과 다르다 — 음영은 장 전체를
# 덮는 사진 하나에만 붙지만 그림자는 사진 칸 «전부» 에 붙는다. 기본으로 켜면
# 원본에 그림자가 없던 카드도 생겨 되돌려 그리기 판정이 틀어진다.
그림자기본색 = "#000000"
그림자기본진하기 = 0      # 0 = 꺼짐. 사람이 작업대에서 올려야 붙는다
그림자아래 = 50           # 아래로 미는 거리 (1080 폭 기준)
그림자흐림 = 40           # 가장자리를 뭉개는 폭
# **거리가 흐림보다 커야 그림자가 사진 밖으로 나온다.** 처음엔 아래 12 · 흐림 32
# 였는데 그림자가 거의 사진 뒤에 숨어, 흰 바닥 위에서 밝기 차이가 18 단계뿐이라
# 사람이 「티가 안 난다」고 했다(2026-09-18 실측). 50·40 으로 바꾸니 68 단계다.


def _그림자깔기(img: Image.Image, region: dict, x0: int, y0: int,
                w: int, h: int, 알파=None) -> None:
    """사진 «뒤» 에 모양을 따라가는 그림자를 깐다. **사진을 붙이기 전에 부른다.**

    모양은 사진과 같다 — `테두리` 가 있으면 그 알파를 그대로 쓰고(원형 사진은
    원형 그림자), 없으면 네모다. 그래서 화면 쪽도 `box-shadow` 가 아니라
    `filter: drop-shadow` 를 쓴다: `clip-path` 로 오린 요소에 `box-shadow` 를
    걸면 그림자까지 잘려 안 보인다.

    캔버스만 한 층에 그려서 한 번에 얹는다 — `alpha_composite` 는 음수 좌표를
    안 받는데, 뭉개느라 둔 여유 때문에 그림자는 장 밖으로 삐져나간다.
    """
    진하기 = region.get("그림자진하기")
    진하기 = 그림자기본진하기 if 진하기 is None else 진하기
    try:
        진하기 = max(0, min(100, float(진하기)))
    except (TypeError, ValueError):
        진하기 = 그림자기본진하기
    if not 진하기 or w <= 0 or h <= 0:
        return
    여유 = 그림자흐림 * 2
    판 = Image.new("L", (w + 여유 * 2, h + 여유 * 2), 0)
    if 알파 is not None:
        판.paste(알파, (여유, 여유))
    else:
        ImageDraw.Draw(판).rectangle([여유, 여유, 여유 + w - 1, 여유 + h - 1], fill=255)
    판 = 판.filter(ImageFilter.GaussianBlur(그림자흐림))
    if 진하기 < 100:
        판 = 판.point(lambda v: int(v * 진하기 / 100))
    색 = _rgba(region.get("그림자색") or 그림자기본색)[:3]
    그림자 = Image.new("RGBA", 판.size, 색 + (0,))
    그림자.putalpha(판)
    층 = Image.new("RGBA", img.size, (0, 0, 0, 0))
    층.paste(그림자, (x0 - 여유, y0 - 여유 + 그림자아래), 그림자)
    img.alpha_composite(층)


def _아스키주소(url: str) -> str:
    """**주소는 아스키만 담는다.** 까닭과 실제 셈은 `주소.다듬기` 에 있다.

    여기서 조용해지면 아무도 못 찾는다 — 아래 `_fetch_media` 가 모든 예외를
    삼키므로, 배경판이 한 장도 안 붙은 채 넘어갔다(실물 2026-08-29).
    """
    return _주소.다듬기(url)

def _fetch_media(url: str) -> Image.Image | None:
    """실패하면(주소가 죽었거나, 그림이 아니거나) None — 카드 한 장 전체를
    죽이지 않는다. User-Agent 를 꼭 넣는다 — 파이썬 기본값은 일부 CDN 이
    봇으로 보고 막는다(`app.py` 의 `_fetch` 와 같은 이유).

    **삼키는 자리라 들어가기 전에 주소를 다듬는다**(`_아스키주소`). 여기서
    조용해지면 아무도 못 찾는다.
    """
    # **위험한 주소는 아예 안 연다**(2026-09-23). 굽는 문은 초안을 «우리가 낸
    # 것» 으로 믿고 칸을 안 거르므로, 꾸민 요청 하나면 우리 서버가 내부망이나
    # `169.254.169.254`(아마존 열쇠가 있는 자리)를 두드리게 만들 수 있었다.
    #
    # **막으면 반드시 적는다.** 이 함수는 모든 예외를 삼키는 자리라, 조용히
    # 넘기면 사진이 왜 비었는지 아무도 못 찾는다(실물 2026-08-29 에 그랬다).
    다듬은것 = _아스키주소(url)
    if not _주소.안전한가(다듬은것):
        print(f"!! 안전하지 않은 주소라 안 받아왔다: {str(다듬은것)[:120]}")
        return None
    try:
        req = urllib.request.Request(다듬은것,
                                     headers={"User-Agent": "cardnews-render/1.0"})
        with urllib.request.urlopen(req, timeout=20) as r:
            return Image.open(BytesIO(r.read())).convert("RGBA")
    except Exception:
        return None


def _cover_fit(im: Image.Image, w: int, h: int) -> Image.Image:
    """자리를 꽉 채우게 자른다(사진·인물) — 남는 쪽을 가운데 기준으로 잘라낸다."""
    sw, sh = im.size
    scale = max(w / sw, h / sh)
    rw, rh = round(sw * scale), round(sh * scale)
    im = im.resize((rw, rh), Image.LANCZOS)
    x0, y0 = (rw - w) // 2, (rh - h) // 2
    return im.crop((x0, y0, x0 + w, y0 + h))


def _contain_fit(im: Image.Image, w: int, h: int) -> Image.Image:
    """안 잘리게 안에 맞춘다(로고) — 남는 자리는 투명."""
    sw, sh = im.size
    scale = min(w / sw, h / sh)
    rw, rh = max(1, round(sw * scale)), max(1, round(sh * scale))
    im = im.resize((rw, rh), Image.LANCZOS)
    캔버스 = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    캔버스.paste(im, ((w - rw) // 2, (h - rh) // 2), im)
    return 캔버스


def _돌려담기(img: Image.Image, 그리기, box, 각도: float) -> None:
    """`그리기(층, d)` 가 캔버스 크기 투명 층에 «절대 좌표로» 그리게 하고,
    각도가 있으면 **네모 가운데를 축으로** 돌려서 본 그림에 얹는다.

    **왜 캔버스 크기 층인가.** 네모 크기로 잘라 그리면 네모를 넘치는 글자가
    잘려 나간다 — 지금은 넘쳐도 그대로 그리는 것이 맞는 동작이다(사람이 보고
    고친다). 캔버스 크기로 두면 자를 일이 없고, `rotate(center=…)` 가 자리를
    알아서 맞춰 준다.

    **부호를 뒤집는다.** PIL `rotate` 는 반시계, CSS `rotate(Ndeg)` 는 시계로
    돈다. 작업대 화면이 CSS 로 그리므로 서버가 `-각도` 로 맞춘다 — 안 맞추면
    화면과 결과가 **반대로** 기운다(손 계산·시험은 `test_cardnews_compose.py`
    의 `test_양수_각도는_시계방향으로_돈다` 참고).
    """
    층 = Image.new("RGBA", img.size, (0, 0, 0, 0))
    그리기(층, ImageDraw.Draw(층))
    if 각도:
        x0, y0, x1, y1 = box
        층 = 층.rotate(-float(각도), resample=Image.BICUBIC,
                      center=((x0 + x1) / 2, (y0 + y1) / 2))
    img.alpha_composite(층)


# ── 테두리(둘레에 두르는 선) ──────────────────────────────────────
#
# **`테두리` 키와 다른 것이다.** `테두리` 는 도형 «모양» 을 이루는 점 목록이고,
# 여기 `선색`·`선굵기` 는 그 둘레에 두르는 «눈에 보이는 선» 이다. 이름이 비슷해
# 헷갈리기 쉬워 키를 아예 다르게 뒀다 (사람 요청 2026-09-19).
#
# **없으면 아무것도 안 그린다.** 옛 카드에는 이 키가 없다 — 기본값으로 선을
# 두르면 여태 만든 카드가 전부 달라진다.
def _선그리기(img: Image.Image, d: ImageDraw.ImageDraw, region: dict) -> None:
    색 = str(region.get("선색") or "").strip()
    if not 색:
        return
    try:
        굵기 = int(round(float(region.get("선굵기") or 0)))
    except (TypeError, ValueError):
        return
    if 굵기 <= 0:
        return
    칠 = _rgba(색)
    테 = region.get("테두리")
    if 테 and len(테) >= 3:
        # **모양이 있으면 그 모양을 따라, 안쪽으로 긋는다.** 화면은 오려낸
        # (`clip-path`) 칸 안에 SVG 를 넣어 그리므로 선의 바깥 절반이 잘린다 —
        # 여기서도 같게 하려고 두 배로 긋고 모양으로 오려 낸다. 안 맞추면
        # 화면과 구운 그림의 선 굵기가 두 배 차이 난다.
        x0, y0, x1, y1 = (round(v) for v in region["box"])
        층 = Image.new("RGBA", img.size, (0, 0, 0, 0))
        점들 = [(float(px), float(py)) for px, py in 테]
        ImageDraw.Draw(층).line(점들 + [점들[0]], fill=칠, width=굵기 * 2,
                               joint="curve")
        알파 = _테두리알파(region, x1 - x0, y1 - y0, x0, y0)
        if 알파 is not None:
            칸 = Image.new("L", img.size, 0)
            칸.paste(알파, (x0, y0))
            층.putalpha(ImageChops.multiply(층.getchannel("A"), 칸))
        img.alpha_composite(층)
        return
    # 네모는 **안쪽으로** 긋는다 — 화면의 `box-shadow: inset` 과 같다.
    x0, y0, x1, y1 = (round(v) for v in region["box"])
    d.rectangle([x0, y0, x1, y1], outline=칠, width=굵기)


def _draw_decoration(img: Image.Image, d: ImageDraw.ImageDraw, fonts: tr.FontBook,
                      region: dict) -> None:
    # **영상 자리는 안 돌린다.** 돌리면 투명 층에 뚫는 꼴이 되어 구멍이 안 생긴다
    # (검토 2026-09-16). 설계도 검사(edit_store)가 영상 자리의 각도를 막지만, 그 검사를
    # 안 거치는 길(/render/cardnews)도 있으니 여기서도 각도를 무시하고 바로 뚫는다.
    if 영상인가(region):
        _decoration_속(img, d, fonts, region)
        return
    각도 = float(region.get("각도") or 0)
    if not 각도:
        _decoration_속(img, d, fonts, region)
        return
    _돌려담기(img, lambda 층, 층d: _decoration_속(층, 층d, fonts, region),
             region["box"], 각도)


def _테두리알파(region: dict, w: int, h: int, x0: int, y0: int):
    """`테두리` 로 알파 마스크를 만든다. 없으면 None(네모 그대로).

    좌표는 카드 좌표계라 조각 기준으로 옮겨서 그린다. `구멍` 은 파낸다 —
    도넛처럼 속이 뚫린 도형이다.

    **크기(w, h)는 부르는 쪽이 정한다 — 길마다 관례가 다르다(R22).**
    Pillow 의 `d.rectangle([x0,y0,x1,y1])` 은 **끝점을 포함**해서
    `(x1-x0+1) × (y1-y0+1)` 을 칠하지만, `Image.new("L", (w, h))` 는
    **끝점을 제외**한다 — 둘을 섞으면 오른쪽·아래에 1px 이음매가 생긴다
    (실측: 옛 `d.rectangle` 로 (x1, y1) 화소 → (217,217,217,255) 칠해짐,
    `Image.new(w, h)` 그대로면 → (255,255,255,255) 안 칠해짐).
    자리표시·채움색 길은 옛 코드가 `d.rectangle` 로 그렸으므로 **끝점 포함**
    (`w+1, h+1`) 크기를 받아야 옛 카드와 화소가 안 어긋난다. 사진·로고 길은
    A11 이전부터 `_cover_fit`/`_contain_fit` 이 **끝점 제외**(`w, h`)로
    잘라 왔으므로 그대로 `w, h` 를 받는다 — 여기를 바꾸면 사진 쪽 옛 카드가
    달라진다.
    """
    테 = region.get("테두리")
    if not 테:
        return None
    from PIL import ImageDraw as _ID
    m = Image.new("L", (w, h), 0)
    d = _ID.Draw(m)
    d.polygon([(px - x0, py - y0) for px, py in 테], fill=255)
    for 구멍 in region.get("구멍") or []:
        if len(구멍) >= 3:
            d.polygon([(px - x0, py - y0) for px, py in 구멍], fill=0)
    return m


def _decoration_속(img: Image.Image, d: ImageDraw.ImageDraw, fonts: tr.FontBook,
                    region: dict) -> None:
    """칠하고 나서 테두리를 두른다. **여기서 둘러야 기운 자리도 같이 돈다** —
    `_돌려담기` 가 이 함수째로 층을 돌리기 때문이다."""
    _decoration_칠(img, d, fonts, region)
    _선그리기(img, d, region)


def _decoration_칠(img: Image.Image, d: ImageDraw.ImageDraw, fonts: tr.FontBook,
                    region: dict) -> None:
    # **네모는 정수로 받는다.** 작업대에서 모서리를 끌면 `비율조절` 이 배수를 곱해
    # `500.26` 같은 소수를 남긴다. 여기서 그림판을 뜨는 길(`Image.new`)이 여럿인데
    # 그것들은 정수만 받아서, 소수가 그대로 오면 500 이 났다 — 「저장을 못 했습니다」
    # (실물 2026-09-19: 도형 모서리를 끌고 저장하니 `'float' object cannot be
    # interpreted as an integer`). 글자 쪽은 Pillow 가 소수를 받으므로 안 건드린다.
    x0, y0, x1, y1 = (round(v) for v in region["box"])
    w, h = x1 - x0, y1 - y0
    종류 = region.get("종류")

    media_url = (region.get("media_url") or "").strip()
    # **영상 자리는 뚫는다**(사람 결정 2026-09-16). 사진 대신 알파 0 을 찍어 두면
    # 그 뒤 층(글자·도형)은 그대로 위에 그려지고, `영상굽기` 가 이 png 를 영상
    # 위에 덮는다. 테두리가 있으면 그 모양만 뚫린다 — 사진 오리기와 같은 규칙.
    if 영상인가(region):
        알파 = _테두리알파(region, w, h, x0, y0)
        구멍 = 알파 if 알파 is not None else Image.new("L", (w, h), 255)
        img.paste((0, 0, 0, 0), (x0, y0, x0 + w, y0 + h), 구멍)
        return

    # **사람이 손으로 올린 것이 자동으로 딴 것보다 앞선다**(2026-09-17 최종
    # 검토 지적 ①). 작업대는 장식영역 어디에나 사진을 떨어뜨릴 수 있는데,
    # 그 자리에 자동 누끼 `그림` 이 이미 있으면 media_url 이 조용히 무시됐다.
    if media_url:
        원본 = _fetch_media(media_url)
        if 원본 is not None:
            맞춘것 = _contain_fit(원본, w, h) if 종류 == "로고" else _cover_fit(원본, w, h)
            # **테두리가 있으면 그 모양으로 오려 붙인다.** 원형 크롭이 원으로 나온다.
            # 없으면 예전처럼 네모다 — 옛 카드가 달라지면 안 된다.
            # 사진·로고는 «끝점 제외»(w, h) 관례를 그대로 쓴다(위 _테두리알파 참고).
            알파 = _테두리알파(region, w, h, x0, y0)
            _그림자깔기(img, region, x0, y0, w, h, 알파)
            if 알파 is not None:
                맞춘것 = 맞춘것.copy()
                맞춘것.putalpha(Image.composite(
                    맞춘것.getchannel("A"), Image.new("L", (w, h), 0), 알파))
            img.alpha_composite(맞춘것, (x0, y0))
            _음영얹기(img, region)
            return   # 사진을 받았으면 자리표시는 안 그린다

    # **장식은 원본 그대로 그린다**(사람 결정 2026-09-17). 라벨 안 한 조각이
    # 배경판에 얼어붙어 옮기지도 못하고, 사진 배경 장에서는 통째로 사라지던
    # 것을 제 층으로 올렸다. 테두리 모양은 PNG 의 투명 칸에 이미 들어 있으므로
    # 여기서 알파를 또 씌우지 않는다. 주소를 못 받으면 아래로 흘러 예전처럼
    # 빈 자리가 된다.
    그림주소 = (region.get("그림") or "").strip()
    if 그림주소:
        원본 = _fetch_media(그림주소)
        if 원본 is not None:
            img.alpha_composite(
                원본.convert("RGBA").resize((w, h), Image.LANCZOS), (x0, y0))
            return

    # **자리표시·채움색은 «끝점 포함»(w+1, h+1) 이다.** 옛 코드가 이 자리를
    # `d.rectangle([x0,y0,x1,y1])` 로 그렸기 때문이다 — Pillow rectangle 은
    # 끝점을 포함해 칠하므로, 여기서도 (w+1, h+1) 을 써야 (x1, y1) 화소까지
    # 칠해져서 옛 카드와 1px 도 어긋나지 않는다(위 _테두리알파 docstring 실측 참고).
    fw, fh = w + 1, h + 1
    알파 = _테두리알파(region, fw, fh, x0, y0)

    # **도형은 잰 색으로 칠한다.** 검은 알약이 검은 알약으로 나오는 자리다.
    # 예전엔 여기서도 회색 자리표시를 그렸다(2026-08-26 이전).
    채움 = region.get("채움색") if 종류 == "도형" else None
    if 채움:
        칠 = Image.new("RGBA", (fw, fh), _rgba(채움))
        if 알파 is not None:
            칠.putalpha(알파)
        img.alpha_composite(칠, (x0, y0))
        return

    # **색을 못 잰 도형은 아예 안 그린다.**
    #
    # 자리표시는 「여기에 사진이 들어올 것이다」는 뜻이다. 도형은 다르다 —
    # 도형은 그 자체가 디자인이고, 색을 못 쟀다는 건 «나중에 채운다» 가 아니라
    # «우리가 모른다» 는 뜻이다. 회색으로 칠하면 없는 것을 지어내는 셈이고,
    # 실제로 그 회색이 밑에 있는 검은 알약을 덮어 글자가 안 보이게 만들었다
    # (실물 2026-08-27: 사람이 도형과 글자에 각각 모양을 줘서 도형이 둘이 됐고,
    # 색이 없는 쪽이 있는 쪽을 덮었다).
    if 종류 == "도형":
        return

    # **누끼가 실패한 장식도 아예 안 그린다**(2026-09-17 최종 검토 지적 ②).
    #
    # 장식은 자동 누끼 갈래라 대개 PNG 가 나오지만, 찬몫이 창 밖이거나
    # 테두리따기가 실패하면 `그림`(자동)도 `media_url`(사람이 올린 것)도
    # 없다. 그럴 때 회색 자리표시를 그리면 이어 그린 배경 위를 덮어 버린다
    # — 도형과 같은 대우다. 이어 그린 배경이 그대로 보이는 편이 낫다.
    if 종류 == "장식":
        return

    # **배경 자리는 아무것도 안 그린다**(사람 결정 2026-09-01).
    #
    # 배경이 사진인 장에는 «장 전체를 덮는 사진 자리» 하나가 깔린다
    # (`make_dsl_cardnews._배경자리`). 이 자리는 다른 사진 자리와 다르다 —
    # 그 자체가 장 전체다.
    #
    # 회색으로 칠하면 카드가 통째로 회색 판이 된다. 색으로 칠해도 안 된다 —
    # 그러면 자리표시가 배경 노릇을 하게 되어, 자리를 옮기거나 지우면 배경이
    # 같이 사라진다. **색은 배경에 있다**(`_draw_background` 가 `배경.hex` 로
    # 칠한다. 그 값은 원본 사진의 평균색이다).
    #
    # 물음표도 안 찍는다. 구운 그림은 결과물이라 장 한가운데 물음표가 박히면
    # 못 쓴다 — 여기가 사진 넣는 자리라는 것은 작업대가 알려 준다.
    if region.get("배경자리"):
        return

    # **한 층에 그려서 얹는다.** 바로 그리면 각도 마스크(`알파`)를 못 탄다 —
    # 기울어진 사진 자리가 안 기운다.
    테 = region.get("테두리")
    자리표 = Image.new("RGBA", (fw, fh), (0, 0, 0, 0))
    if 테 and len(테) >= 3:
        # **모양 둘레를 따라 두른다** — 오려 낼 것이 없으니 알파를 안 곱한다.
        _점선둘레(ImageDraw.Draw(자리표), 테, x0, y0)
    else:
        _점선네모(ImageDraw.Draw(자리표), 0, 0, fw, fh)
        if 알파 is not None:
            # 알파를 갈아치우면 점선 밖 빈 곳까지 불투명해진다 — 곱해서 겹친다.
            자리표.putalpha(ImageChops.multiply(자리표.getchannel("A"), 알파))
    img.alpha_composite(자리표, (x0, y0))
    크기 = max(24, min(w, h) // 3)
    f = fonts.get("Pretendard-Bold", 크기)
    표 = "?"
    qw = d.textlength(표, font=f)
    # **모양 가운데에 찍는다.** 네모 가운데는 모양 밖일 수 있다.
    cx, cy = (_둘레가운데(테) if 테 and len(테) >= 3
              else ((x0 + x1) / 2, (y0 + y1) / 2))
    d.text((cx - qw / 2, cy - 크기 / 2), 표, font=f, fill=_rgba(PLACEHOLDER_MARK_COLOR))


def _둘레가운데(테: list) -> tuple:
    """테두리 점들의 가운데. **네모 가운데가 아니다.**

    동그라미 사진 자리는 네모 안에 딱 맞게 들어가므로 둘은 거의 같지만, 반달·
    물방울처럼 한쪽으로 치우친 모양은 크게 갈린다 — 그때 네모 가운데에 물음표를
    찍으면 모양 밖에 찍힌다.
    """
    return (sum(p[0] for p in 테) / len(테), sum(p[1] for p in 테) / len(테))


def _점선둘레(d, 테: list, x0: int, y0: int) -> None:
    """**모양 둘레를 따라** 점선을 찍는다(사람 지적 2026-09-24).

    여태 자리표시는 늘 `_점선네모` 였다. 그러고 나서 모양 마스크로 오려 냈으니,
    **동그라미 자리는 점선이 원호 조각으로 끊겨** 남고 네모 부분이 제목을 덮었다
    (실물: 「대학생 시험」 1장 — 사진 네모가 제목과 95,328px 겹쳤다).
    사용자: 「사진 라벨링할때 원으로 했는데 적용이 안되나?」

    **사진을 넣으면 진작부터 모양대로 나왔다**(`_테두리알파`). 비었을 때만
    네모였다.

    걸음마다 점을 찍는 대신 **둘레를 1px 씩 걸으며** 찍는다 — 점 사이 간격이
    곡선에서도 고르게 나온다.
    """
    색 = _rgba(PLACEHOLDER_MARK_COLOR)
    걸음 = 점선칸 + 점선틈
    반 = 점선두께 / 2
    닫힌 = list(테) + [테[0]]
    간 = 0.0
    for (ax, ay), (bx, by) in zip(닫힌, 닫힌[1:]):
        길이 = ((bx - ax) ** 2 + (by - ay) ** 2) ** 0.5
        if 길이 <= 0:
            continue
        걸음수 = max(1, int(길이))
        for i in range(걸음수):
            t = i / 걸음수
            if (간 + i) % 걸음 < 점선칸:
                x = ax + (bx - ax) * t - x0
                y = ay + (by - ay) * t - y0
                d.rectangle([x - 반, y - 반, x + 반, y + 반], fill=색)
        간 += 길이


def _점선네모(d, x0: int, y0: int, x1: int, y1: int) -> None:
    """네모 둘레에 점선을 두른다 — 속은 안 칠한다(위 `점선칸` 참고)."""
    색 = _rgba(PLACEHOLDER_MARK_COLOR)
    걸음 = 점선칸 + 점선틈
    for x in range(int(x0), int(x1), 걸음):
        끝 = min(x + 점선칸, x1)
        d.rectangle([x, y0, 끝, y0 + 점선두께 - 1], fill=색)
        d.rectangle([x, y1 - 점선두께, 끝, y1 - 1], fill=색)
    for y in range(int(y0), int(y1), 걸음):
        끝 = min(y + 점선칸, y1)
        d.rectangle([x0, y, x0 + 점선두께 - 1, 끝], fill=색)
        d.rectangle([x1 - 점선두께, y, x1 - 1, 끝], fill=색)


def _draw_text_region(img: Image.Image, d: ImageDraw.ImageDraw, fonts: tr.FontBook,
                       region: dict, 강조색: str) -> None:
    # **글자 효과는 글자에 붙는다**(2026-09-28). 옛 모양이 와도 여기서 바꿔 그린다 —
    # 옛 규칙(출처 «지금 마지막 줄»·줄색·줄굵기)은 바꿀 때 한 번 쓰고 끝난다.
    region = edit_store.글줄로(region)
    def 그리기(층, 층d):
        _text_속(층, 층d, fonts, region, 강조색)
        _선그리기(층, 층d, region)
    각도 = float(region.get("각도") or 0)
    if not 각도:
        그리기(img, d)
        return
    _돌려담기(img, 그리기, region["box"], 각도)


# 글머리기호 — **도형으로 직접 그린다.**
#
# **글자로 찍으면 글꼴에 따라 빈 네모가 나온다**(2026-09-19 실측): 검은고딕에는
# ● ○ ■ ★ → • · 가 하나도 없고, `•`(흔한 불릿)은 아홉 종 중 다섯에만 있다.
# 원·네모·줄표는 그려서 쓰고, 번호만 글자로 찍는다(숫자는 어느 글꼴에나 있다).
글머리자리 = 1.1     # 기호가 차지하는 폭 — 글자 크기의 몇 배인가
글머리갈래 = ("원", "네모", "줄표", "번호")


def _글머리찍기(d, x: float, y: float, 크기: float, 갈래: str, 색, 몇째: int,
                폰트) -> None:
    """줄 앞에 기호 하나. `x` 는 글자가 시작될 자리이고, 기호는 그 «왼쪽» 에 온다.

    세로 가운데는 글자 높이의 절반쯤(`0.52`)이다 — 글꼴마다 기준선이 달라도
    눈에는 가운데로 보인다.
    """
    가운데 = y + 크기 * 0.52
    왼쪽 = x - 크기 * 글머리자리
    복판 = 왼쪽 + 크기 * 글머리자리 * 0.42
    if 갈래 == "원":
        r = 크기 * 0.16
        d.ellipse([복판 - r, 가운데 - r, 복판 + r, 가운데 + r], fill=색)
    elif 갈래 == "네모":
        r = 크기 * 0.15
        d.rectangle([복판 - r, 가운데 - r, 복판 + r, 가운데 + r], fill=색)
    elif 갈래 == "줄표":
        d.rectangle([복판 - 크기 * 0.24, 가운데 - 크기 * 0.045,
                     복판 + 크기 * 0.24, 가운데 + 크기 * 0.045], fill=색)
    elif 갈래 == "번호":
        d.text((왼쪽, y), f"{몇째}.", font=폰트, fill=색)


def _text_속(img: Image.Image, d: ImageDraw.ImageDraw, fonts: tr.FontBook,
              region: dict, 강조색: str) -> None:
    """글줄을 그린다 — 줄마다 덩어리를 차례로, 덩어리마다 제 효과로.

    **덩어리 폭은 글자 하나씩 잰 합이다**(`tr._measure_tracked`) — 그래서 한 줄을
    덩어리로 나눠 재도 통째로 잰 것과 같고, 옛 카드가 화소까지 같다(Task 1 금판).
    굵은 덩어리는 `WEIGHT_TO_FONT["Bold"]` 로 그린다(옛 구간 굵기와 같다).
    """
    x0, y0, x1, y1 = region["box"]
    font_name = 글꼴이름(region)
    f = fonts.get(font_name, region["pt"])
    굵은f = fonts.get(WEIGHT_TO_FONT.get("Bold", font_name), region["pt"])
    기본색 = region["글자색"]
    # **재어 온 줄간격이 있으면 그것을 쓴다.** 없으면 붙박이 값이다.
    line_h = region["pt"] * float(region.get("줄간격") or LINE_SPACING)
    칸정렬 = region.get("align")
    # 옛 `효과: ["밑줄"]` 은 칸 전체를 긋는 뜻이라 그대로 받는다 — 덩어리마다 긋는다.
    칸밑줄 = "밑줄" in (region.get("효과") or [])
    글줄 = region.get("글줄") or []
    y = y0
    # **도형에서 온 글자칸은 세로 가운데부터 그린다.**
    if region.get("세로가운데") and 글줄:
        글높이 = line_h * (len(글줄) - 1) + region["pt"]
        y = y0 + max(0, ((y1 - y0) - 글높이) / 2)
    문장정렬 = None
    번호 = 0
    두께 = max(1, round(f.size * 0.06))
    for 줄 in 글줄:
        if 줄.get("새문장"):
            문장정렬 = 줄.get("정렬")
        조각들 = [(dd["글"], 굵은f if dd.get("굵게") else f, dd.get("색") or 기본색, dd)
                for dd in (줄.get("덩어리") or [])]
        폭들 = [tr._measure_tracked(d, 글, 폰트) for 글, 폰트, _색, _dd in 조각들]
        폭 = sum(폭들)
        # 정렬 셋을 다 그린다. **모르는 값은 왼쪽**이다.
        이정렬 = 문장정렬 or 칸정렬
        if 이정렬 == "가운데":
            x = x0 + max(0, ((x1 - x0) - 폭) / 2)
        elif 이정렬 == "오른쪽":
            x = x0 + max(0, (x1 - x0) - 폭)
        else:
            x = x0
        # **글머리기호는 문장 첫 줄 앞에 찍고 글을 그만큼 민다.**
        글머리 = 줄.get("글머리") if 줄.get("새문장") else None
        if 글머리 in 글머리갈래:
            x += f.size * 글머리자리
        # 형광펜 띠 — 글보다 먼저 깐다.
        쓰는x = x
        for (글, 폰트, _색, dd), w in zip(조각들, 폭들):
            형 = dd.get("형광펜")
            if 형:
                d.rectangle([쓰는x, y, 쓰는x + w, y + f.size * 1.1],
                            fill=_rgba(형 if isinstance(형, str) else 강조색))
            쓰는x += w
        if 글머리 in 글머리갈래:
            if 글머리 == "번호":
                번호 += 1
            # 기호 색은 그 줄 첫 글자 색을 따른다.
            첫색 = 조각들[0][2] if 조각들 else 기본색
            _글머리찍기(d, x, y, f.size, 글머리, _rgba(첫색), 번호, f)
        쓰는x = x
        for (글, 폰트, 색, _dd), w in zip(조각들, 폭들):
            tr._draw_text_tracked(d, img, (쓰는x, y), 글, 폰트, _rgba(색))
            쓰는x += w
        # **밑줄은 그 줄 글자를 다 그린 뒤에 긋는다** — 옛 굽는 쪽 차례 그대로다.
        # 덩어리마다 번갈아 그으면 뒤 덩어리 글자가 앞 밑줄 위에 찍혀 옛 카드와
        # 화소가 갈릴 수 있다.
        # **밑줄은 그 글자 색으로 긋는다**(2026-09-28 — 작업대 화면과 같게).
        밑 = y + f.size * 1.02
        쓰는x = x
        for (_글, _폰트, 색, dd), w in zip(조각들, 폭들):
            if (칸밑줄 or dd.get("밑줄")) and w > 0:
                d.rectangle([쓰는x, 밑, 쓰는x + w, 밑 + 두께], fill=_rgba(색))
            쓰는x += w
        y += line_h


def _장식순서(card: dict) -> list:
    """겹친 장식(사진·로고)을 **그릴 순서**로 세운다.

    **글자는 언제나 사진 앞이다.** 그래서 층은 장식끼리만 센다.

    **`층` 이 모든 장식에 다 있을 때만 그것을 따른다.** 하나라도 없으면 목록에
    담긴 차례 그대로다. 반쯤 매겨진 설계도를 따르면 작업대 화면과 여기서 구운
    그림이 갈린다. 옛 판을 열어도 그림이 안 바뀐다는 뜻이기도 하다.
    `web/lib/workbench.js` 의 `장식순서` 와 **같은 규칙이다 — 같이 고쳐라.**
    """
    칸들 = list(card.get("장식영역") or [])
    if 칸들 and all(isinstance(r.get("층"), int) and not isinstance(r.get("층"), bool)
                   for r in 칸들):
        칸들.sort(key=lambda r: r["층"])
    return 칸들


def 영상인가(region: dict) -> bool:
    return str((region or {}).get("media_url") or "").strip().lower().endswith(".mp4")


def 영상자리(card: dict):
    """그 장의 영상 장식영역. 없으면 None. 둘 이상은 설계도 검사가 막는다(edit_store)."""
    for r in card.get("장식영역") or []:
        if 영상인가(r):
            return r
    return None


def draw_card(card: dict, fonts: tr.FontBook, 강조색: str) -> Image.Image:
    img = Image.new("RGBA", CANVAS, (255, 255, 255, 255))
    _draw_background(img, card["배경"])
    d = ImageDraw.Draw(img)
    for region in _장식순서(card):
        _draw_decoration(img, d, fonts, region)
    for region in card.get("글자영역") or []:
        _draw_text_region(img, d, fonts, region, 강조색)
    return img


def build(body: dict, fonts: tr.FontBook) -> list:
    """`body = {"slides": [...cards_json 그대로...], "강조색": "#RRGGBB"}`."""
    카드들 = body.get("slides")
    if not 카드들:
        raise ValueError("slides 가 비어 있다 — 배치 검증이 장을 하나도 안 내놨다")
    # **이름 둘을 다 받는다.** DSL 「굽기」 노드가 `accent_color` 로 보내는데 여기서는
    # `강조색` 만 읽고 있었다 — 이름이 안 맞아 언제나 붙박이 기본값으로 떨어졌다
    # (2026-08-25 발견). 실측 게시물 강조색이 마침 그 값이라 아무도 못 봤다.
    강조색 = body.get("강조색") or body.get("accent_color") or "#C9FC95"
    난것 = []
    for c in 카드들:
        img = draw_card(c, fonts, 강조색)
        영 = 영상자리(c)
        # 영상 장은 «뚫린 그림 + 영상 주소 + 자리» 로 낸다. 굽는 것은 app.build_cardnews 가
        # `영상굽기` 로 한다 — 여기는 그림만 안다.
        난것.append({"그림": img, "영상": 영["media_url"], "box": list(영["box"])} if 영 else img)
    return 난것
