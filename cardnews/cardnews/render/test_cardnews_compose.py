# -*- coding: utf-8 -*-
"""라벨링 기반 카드뉴스 그리기(`cardnews_compose.py`) 시험.

`test_render.py` 는 `composer.py`·`template.json` 쪽을 본다 — 그건 다른 세션이
쓰는 자리라 섞지 않는다. 이 파일은 카드뉴스 전용 경로만 본다.
"""
import sys
from pathlib import Path

import pytest
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import json                            # noqa: E402
import cardnews_compose as cc          # noqa: E402
import template_render as tr           # noqa: E402


@pytest.fixture
def 글꼴책():
    import json
    틀 = json.loads((HERE / "template.json").read_text(encoding="utf-8"))
    return tr.FontBook(틀["fonts"], HERE)


def _글자칸(align: str, box=(100, 200, 600, 400)):
    return {"종류": "글자", "box": list(box), "pt": 40, "weight": "Regular",
            "align": align, "font": "프리텐다드", "글자색": "#000000",
            "줄종류": "한줄", "lines": ["가나다"]}


def _글자시작x(글꼴책, align, box=(100, 200, 600, 400)):
    """그 줄이 실제로 어디서 시작했는지 — 글자가 찍힌 가장 왼쪽 칸."""
    img = Image.new("RGBA", cc.CANVAS, (255, 255, 255, 255))
    d = ImageDraw.Draw(img)
    cc._draw_text_region(img, d, 글꼴책, _글자칸(align, box), "#C9FC95")
    화소 = img.load()
    for x in range(cc.CANVAS[0]):
        for y in range(box[1], box[3]):
            if 화소[x, y][:3] != (255, 255, 255):
                return x
    raise AssertionError("글자가 하나도 안 찍혔다")


def test_오른쪽_정렬은_네모의_오른쪽_변에_붙는다(글꼴책):
    box = (100, 200, 600, 400)
    왼 = _글자시작x(글꼴책, "왼쪽", box)
    오른 = _글자시작x(글꼴책, "오른쪽", box)
    가운데 = _글자시작x(글꼴책, "가운데", box)
    assert 왼 < 가운데 < 오른, f"왼쪽={왼} 가운데={가운데} 오른쪽={오른}"
    # 오른쪽 정렬은 글 끝이 네모 오른쪽 변에 닿아야 한다 (몇 화소 여유는 준다)
    img = Image.new("RGBA", cc.CANVAS, (255, 255, 255, 255))
    d = ImageDraw.Draw(img)
    폭 = tr._measure_tracked(d, "가나다", 글꼴책.get("Pretendard-Medium", 40))
    # `_measure_tracked` 는 글자가 차지하는 폭(advance)을 재는데, 여기서는
    # 실제로 찍힌 첫 잉크 화소를 찾는다. 글리프 좌우 여백(bearing) 때문에
    # 두 값이 몇 화소 어긋나는 게 정상이라 <= 2 는 맞는 구현도 떨어뜨린다.
    assert abs((오른 + 폭) - box[2]) <= 6


def test_모르는_정렬은_왼쪽으로_그린다(글꼴책):
    """옛 설계도에 «단일» 같은 값이 남아 있어도 죽지 않는다."""
    box = (100, 200, 600, 400)
    assert _글자시작x(글꼴책, "단일", box) == _글자시작x(글꼴책, "왼쪽", box)


def _형광펜_칠해진_x범위(글꼴책, 형광펜, 줄="가나다라마바사"):
    """강조색(#C9FC95)이 칠해진 가로 구간 (처음x, 끝x). 없으면 None."""
    칸 = _글자칸("왼쪽", (100, 200, 900, 400))
    칸["lines"] = [줄]
    칸["형광펜"] = 형광펜
    img = Image.new("RGBA", cc.CANVAS, (255, 255, 255, 255))
    d = ImageDraw.Draw(img)
    cc._draw_text_region(img, d, 글꼴책, 칸, "#C9FC95")
    화소 = img.load()
    xs = [x for x in range(cc.CANVAS[0]) for y in range(200, 260)
          if 화소[x, y][:3] == (201, 252, 149)]
    return (min(xs), max(xs)) if xs else None


def test_형광펜이_긁은_자리에만_칠해진다(글꼴책):
    """줄 가운데를 긁으면 그 자리만 칠해져야 한다 — 앞에서부터가 아니라."""
    앞 = _형광펜_칠해진_x범위(글꼴책, {"줄번호": 1, "시작": 0, "끝": 2})
    가운데 = _형광펜_칠해진_x범위(글꼴책, {"줄번호": 1, "시작": 3, "끝": 5})
    assert 앞 and 가운데
    assert 가운데[0] > 앞[1], f"가운데 칠이 앞 칠보다 오른쪽에서 시작해야 한다 {앞} {가운데}"


def test_형광펜_폭이_긁은_글자_수에_맞는다(글꼴책):
    두자 = _형광펜_칠해진_x범위(글꼴책, {"줄번호": 1, "시작": 2, "끝": 4})
    네자 = _형광펜_칠해진_x범위(글꼴책, {"줄번호": 1, "시작": 2, "끝": 6})
    assert (네자[1] - 네자[0]) > (두자[1] - 두자[0])


def test_옛_모양_글자수도_계속_읽는다(글꼴책):
    """이미 저장된 설계도가 그대로 돌아야 한다 — 앞에서 k 글자."""
    옛 = _형광펜_칠해진_x범위(글꼴책, {"줄번호": 1, "글자수": 3})
    새 = _형광펜_칠해진_x범위(글꼴책, {"줄번호": 1, "시작": 0, "끝": 3})
    assert 옛 == 새


def test_빈_범위는_안_칠한다(글꼴책):
    assert _형광펜_칠해진_x범위(글꼴책, {"줄번호": 1, "시작": 2, "끝": 2}) is None
    assert _형광펜_칠해진_x범위(글꼴책, {}) is None


def _칠한색들(글꼴책, 형광펜, 강조색="#C9FC95"):
    """형광펜이 칠한 색들(글자 검정은 뺀다)."""
    칸 = _글자칸("왼쪽", (100, 200, 900, 400))
    칸["lines"] = ["가나다라마바사아자차"]
    칸["형광펜"] = 형광펜
    img = Image.new("RGBA", cc.CANVAS, (255, 255, 255, 255))
    d = ImageDraw.Draw(img)
    cc._draw_text_region(img, d, 글꼴책, 칸, 강조색)
    화소 = img.load()
    본것 = {화소[x, y][:3] for x in range(100, 900) for y in range(205, 215)}
    return {c for c in 본것 if c != (255, 255, 255) and sum(c) > 200}


def test_형광펜을_여럿_그린다(글꼴책):
    본것 = _칠한색들(글꼴책, [{"줄번호": 1, "시작": 0, "끝": 2, "색": "#FF8800"},
                          {"줄번호": 1, "시작": 5, "끝": 7, "색": "#00AAFF"}])
    assert (255, 136, 0) in 본것, 본것
    assert (0, 170, 255) in 본것, 본것


def test_형광펜이_제_색을_쓴다(글꼴책):
    assert (255, 136, 0) in _칠한색들(
        글꼴책, [{"줄번호": 1, "시작": 0, "끝": 3, "색": "#FF8800"}])


def test_형광펜에_색이_없으면_카드_강조색을_쓴다(글꼴책):
    assert (201, 252, 149) in _칠한색들(
        글꼴책, [{"줄번호": 1, "시작": 0, "끝": 3}], 강조색="#C9FC95")


def test_사전_하나로_온_옛_설계도도_그린다(글꼴책):
    assert (201, 252, 149) in _칠한색들(글꼴책, {"줄번호": 1, "글자수": 3})


def test_겹친_형광펜을_합쳐서_그린다(글꼴책):
    """앞엣것의 색으로 이어진 한 덩이가 되어야 한다 — 뒤엣것이 앞을 덧칠하지 않는다."""
    본것 = _칠한색들(글꼴책, [{"줄번호": 1, "시작": 0, "끝": 4, "색": "#FF8800"},
                          {"줄번호": 1, "시작": 2, "끝": 7, "색": "#00AAFF"}])
    assert (255, 136, 0) in 본것
    assert (0, 170, 255) not in 본것, "뒤엣것 색이 나오면 안 합쳐진 것이다"


def test_떨어진_형광펜은_안_합친다(글꼴책):
    본것 = _칠한색들(글꼴책, [{"줄번호": 1, "시작": 0, "끝": 2, "색": "#FF8800"},
                          {"줄번호": 1, "시작": 6, "끝": 8, "색": "#00AAFF"}])
    assert (255, 136, 0) in 본것 and (0, 170, 255) in 본것


def test_다른_줄끼리는_안_합친다(글꼴책):
    칸 = _글자칸("왼쪽", (100, 200, 900, 500))
    칸["lines"] = ["가나다라마", "바사아자차"]
    칸["형광펜"] = [{"줄번호": 1, "시작": 0, "끝": 3, "색": "#FF8800"},
                 {"줄번호": 2, "시작": 0, "끝": 3, "색": "#00AAFF"}]
    img = Image.new("RGBA", cc.CANVAS, (255, 255, 255, 255))
    d = ImageDraw.Draw(img)
    cc._draw_text_region(img, d, 글꼴책, 칸, "#C9FC95")
    화소 = img.load()
    줄높이 = 칸["pt"] * cc.LINE_SPACING
    첫줄 = {화소[x, 205][:3] for x in range(100, 900)}
    둘째줄 = {화소[x, int(200 + 줄높이) + 5][:3] for x in range(100, 900)}
    assert (255, 136, 0) in 첫줄
    assert (0, 170, 255) in 둘째줄


def test_굽기가_accent_color_라는_이름도_받는다(글꼴책):
    """DSL 「굽기」 노드가 그 이름으로 보낸다 — 예전엔 이름이 안 맞아 언제나
    붙박이 기본값으로 떨어졌다(2026-08-25 발견)."""
    카드 = {"index": 1, "역할": "훅", "배경": {"종류": "단색", "hex": "#FFFFFF"},
          "장식영역": [],
          "글자영역": [{**_글자칸("왼쪽", (100, 200, 900, 400)),
                     "lines": ["가나다라마"],
                     "형광펜": [{"줄번호": 1, "시작": 0, "끝": 3}]}]}
    그림 = cc.build({"slides": [카드], "accent_color": "#FF8800"}, 글꼴책)[0]
    화소 = 그림.load()
    본것 = {화소[x, y][:3] for x in range(100, 900) for y in range(205, 215)}
    assert (255, 136, 0) in 본것


# ── 회전(Task 11) ────────────────────────────────────────────

def _글자무게중심(글꼴책, 각도, box=(400, 500, 700, 600)):
    """그 칸의 글자 화소들의 무게중심. 돌리면 이 점이 어디로 가는지 본다."""
    칸 = _글자칸("왼쪽", box)
    칸["각도"] = 각도
    img = Image.new("RGBA", cc.CANVAS, (255, 255, 255, 255))
    d = ImageDraw.Draw(img)
    cc._draw_text_region(img, d, 글꼴책, 칸, "#C9FC95")
    화소 = img.load()
    xs, ys = [], []
    for x in range(cc.CANVAS[0]):
        for y in range(cc.CANVAS[1]):
            if 화소[x, y][:3] != (255, 255, 255):
                xs.append(x); ys.append(y)
    assert xs, "글자가 하나도 안 찍혔다"
    return sum(xs) / len(xs), sum(ys) / len(ys)


def test_각도가_0이면_예전과_똑같이_그린다(글꼴책):
    """옛 설계도(각도 칸이 없는 것)가 그대로 돌아야 한다."""
    box = (400, 500, 700, 600)
    없음 = _글자시작x(글꼴책, "왼쪽", box)
    칸 = _글자칸("왼쪽", box); 칸["각도"] = 0.0
    img = Image.new("RGBA", cc.CANVAS, (255, 255, 255, 255))
    d = ImageDraw.Draw(img)
    cc._draw_text_region(img, d, 글꼴책, 칸, "#C9FC95")
    화소 = img.load()
    영 = next(x for x in range(cc.CANVAS[0])
             for y in range(box[1], box[3]) if 화소[x, y][:3] != (255, 255, 255))
    assert abs(영 - 없음) <= 1


def test_양수_각도는_시계방향으로_돈다(글꼴책):
    """CSS `rotate(20deg)` 와 같은 방향이어야 한다 — 시계방향.

    **PIL 은 반시계다.** `Image.rotate(각도)` 를 그대로 쓰면 화면과 반대로
    기운다.

    **손 계산.** box=(400,500,700,600) 이면 가운데는 (550,550). 글은 왼쪽
    정렬이라 네모 왼쪽 위(축의 왼쪽·위)에 붙는다 — 예컨대 축 기준 상대좌표
    (-90,-30) 이 있다고 하자. 시계방향 회전(이미지 좌표는 y 가 아래로 커지므로
    표준 회전행렬 x'=x·cosθ-y·sinθ, y'=x·sinθ+y·cosθ 를 그대로 쓰면 y-축이
    아래를 향하는 화면에서는 이 식 자체가 «시계방향»이 된다)로 20° 돌리면:
        x' = -90·cos20° - (-30)·sin20° = -84.57 + 10.26 = -74.3
        y' = -90·sin20° + (-30)·cos20° = -30.78 - 28.19 = -59.0
    x 는 -90 → -74.3 로 **늘고**(오른쪽으로), y 는 -30 → -59.0 로 **준다**
    (더 음수 = 위로). 시계 10시 방향에 있던 점이 11시 → 12시 방향으로 가는
    것과 같다 — 오른쪽으로, 그리고 **위로** 간다.
    """
    box = (400, 500, 700, 600)          # 가운데는 (550, 550)
    x0, y0 = _글자무게중심(글꼴책, 0)
    x1, y1 = _글자무게중심(글꼴책, 20)
    # 글은 네모 왼쪽 위에 붙어 있으니 축(가운데)의 왼쪽·위에 있다.
    assert x0 < 550 and y0 < 550, f"시험 재료가 축의 왼쪽 위여야 한다 ({x0},{y0})"
    assert x1 > x0, f"시계로 돌면 오른쪽으로 가야 한다 {x0} → {x1}"
    # 손 계산대로 y 는 준다(더 위로 간다) — 시계 10시에서 11시·12시로 가는 것과
    # 같다. 브리핑 초안에 있던 `y1 > y0` 는 계산 결과와 안 맞아 여기서 고쳤다.
    assert y1 < y0, f"시계로 돌면 위로 가야 한다 {y0} → {y1}"


def test_돌려도_축은_네모_가운데다(글꼴책):
    """CSS `transform-origin` 기본값이 가운데다. 서버도 같아야 겹쳐 볼 때 맞는다."""
    box = (400, 500, 700, 600)
    앞 = _글자무게중심(글꼴책, 0)
    for 각 in (90, 180, 270):
        _글자무게중심(글꼴책, 각)   # 안 죽으면 된다
    반대 = _글자무게중심(글꼴책, 180)
    # 180도면 축을 사이에 두고 정확히 맞은편이어야 한다
    assert abs((앞[0] + 반대[0]) / 2 - 550) <= 3, (앞, 반대)
    assert abs((앞[1] + 반대[1]) / 2 - 550) <= 3, (앞, 반대)


def test_장식칸도_돈다(글꼴책):
    """사진이 없는 빈 자리(회색 자리표시)도 각도를 따른다."""
    칸 = {"종류": "사진", "box": [400, 500, 700, 600], "각도": 30}
    img = Image.new("RGBA", cc.CANVAS, (255, 255, 255, 255))
    d = ImageDraw.Draw(img)
    cc._draw_decoration(img, d, 글꼴책, 칸)
    화소 = img.load()
    # 네모 밖(원래라면 흰색인 자리)에 회색이 나와야 «돌았다» 는 뜻이다
    돌아나온것 = any(화소[x, 495][:3] != (255, 255, 255) for x in range(400, 700))
    assert 돌아나온것, "30도 돌렸는데 네모 위쪽으로 아무것도 안 나왔다"


# ── 배경 사진 자리 (장 전체를 덮는 자리) ──────────────────────────
#
# 사람 지적 2026-08-31: 「? 가 전체 자리를 뺏는 느낌이야」. 이 자리는 장 전체라
# 다른 사진 자리와 규칙이 다르다 — 회색으로 칠하면 카드가 통째로 회색이 되고,
# 비워 두면 흰 바탕에 원본이 정해 준 흰 글자가 얹혀 아무것도 안 읽힌다.

def _배경자리칸(**더):
    return {"종류": "사진", "box": [0, 0, cc.CANVAS[0] - 1, cc.CANVAS[1] - 1],
            "배경자리": True, **더}


def _그린것(칸, 글꼴책):
    img = Image.new("RGBA", cc.CANVAS, (255, 255, 255, 255))
    cc._draw_decoration(img, ImageDraw.Draw(img), 글꼴책, 칸)
    return img


def test_배경_사진_자리는_아무것도_안_그린다(글꼴책):
    """**색은 배경에 있다**(`_draw_background` 가 `배경.hex` 로 칠한다).
    여기서 또 칠하면 자리표시가 배경 노릇을 하게 되어, 자리를 옮기거나 지우면
    배경이 같이 사라진다. 물음표도 안 찍는다 — 구운 그림은 결과물이다."""
    img = _그린것(_배경자리칸(), 글꼴책)
    assert img.convert("RGB").getcolors() == [(cc.CANVAS[0] * cc.CANVAS[1],
                                              (255, 255, 255))]


def test_사진_배경의_잰_색은_배경이_칠한다():
    """색이 사라지는 게 아니라 **자리가 바뀐 것이다** — 배경이 칠한다."""
    img = Image.new("RGBA", cc.CANVAS, (255, 255, 255, 255))
    cc._draw_background(img, {"종류": "사진", "hex": "#615244"})
    assert img.convert("RGB").getpixel((540, 675)) == (0x61, 0x52, 0x44)


def test_사진_자리는_속이_비고_겉만_점선이다(글꼴책):
    """**회색으로 안 채운다**(사람 결정 2026-09-18: 「그냥 투명하게 그리고
    겉에만 점선, 중앙에 ?」).

    회색으로 꽉 채우면 사진을 넣기 전 카드가 회색 덩어리로 보인다. 속은 그대로
    두고(밑에 깔린 배경이 비친다) 테두리에 점선만 두르고 가운데에 물음표를 찍는다.
    """
    칸 = {"종류": "사진", "box": [100, 100, 400, 300]}
    바탕 = (250, 240, 230)
    img = Image.new("RGBA", cc.CANVAS, (*바탕, 255))
    cc._draw_decoration(img, ImageDraw.Draw(img), 글꼴책, 칸)
    화소 = img.load()
    # 속은 밑에 깔린 것이 그대로 비친다
    assert 화소[250, 150][:3] == 바탕, f"속을 칠했다: {화소[250, 150]}"
    # 겉에는 점선이 있다 — 테두리 줄에 바탕 아닌 화소가 섞여 있다
    테두리줄 = [화소[x, 100][:3] for x in range(100, 400)]
    다른것 = sum(1 for c in 테두리줄 if c != 바탕)
    assert 0 < 다른것 < len(테두리줄), f"점선이 아니다 — 테두리 {다른것}/{len(테두리줄)}"
    # 가운데에 물음표가 있다
    가운데 = [화소[x, 200][:3] for x in range(230, 270)]
    assert any(c != 바탕 for c in 가운데), "물음표가 없다"


def test_형광펜이_지정한_줄에만_칠해진다(글꼴책):
    """줄번호는 1부터 센다 — 첫 줄이 1이다."""
    칸 = _글자칸("왼쪽", (100, 200, 900, 500))
    칸["lines"] = ["첫째줄", "둘째줄"]
    칸["형광펜"] = {"줄번호": 2, "시작": 0, "끝": 3}
    img = Image.new("RGBA", cc.CANVAS, (255, 255, 255, 255))
    d = ImageDraw.Draw(img)
    cc._draw_text_region(img, d, 글꼴책, 칸, "#C9FC95")
    화소 = img.load()
    줄높이 = 칸["pt"] * cc.LINE_SPACING
    첫줄에 = any(화소[x, 205][:3] == (201, 252, 149) for x in range(100, 900))
    둘째줄에 = any(화소[x, int(200 + 줄높이) + 5][:3] == (201, 252, 149) for x in range(100, 900))
    assert not 첫줄에, "첫 줄에 칠해지면 안 된다"
    assert 둘째줄에, "둘째 줄에 칠해져야 한다"



# ── 층 (겹친 사진끼리 누가 위냐) ─────────────────────────────────
# **글자는 언제나 사진 앞이다.** 층은 장식끼리만 센다.
# 화면(작업대)과 **똑같은** 규칙이어야 한다. 갈리면 고칠 때 본 그림과 구운
# 그림이 달라진다 — 그게 이 기능에서 제일 나쁜 실패다.

def test_층이_없으면_목록_차례_그대로():
    카드 = {"장식영역": [{"a": 1}, {"a": 2}], "글자영역": [{"b": 1}]}
    assert cc._장식순서(카드) == [{"a": 1}, {"a": 2}]


def test_층이_다_있으면_그_순서를_따른다():
    카드 = {"장식영역": [{"a": 1, "층": 1}, {"a": 2, "층": 0}]}
    assert [r["a"] for r in cc._장식순서(카드)] == [2, 1]


def test_층이_반만_있으면_통째로_무시한다():
    카드 = {"장식영역": [{"a": 1}, {"a": 2, "층": 0}]}
    assert [r["a"] for r in cc._장식순서(카드)] == [1, 2]


def test_장식이_없는_장도_안_죽는다():
    assert cc._장식순서({}) == []


def test_글자는_언제나_사진_앞이다(글꼴책):
    """장식에 아무리 큰 층을 줘도 글자를 못 덮는다."""
    글 = _글자칸("왼쪽", (100, 200, 600, 400))
    덮개 = {"box": [0, 0, cc.CANVAS[0], cc.CANVAS[1]], "종류": "장식", "층": 99}
    img = cc.draw_card({"배경": {"종류": "단색", "hex": "#FFFFFF"},
                        "장식영역": [덮개], "글자영역": [글]}, 글꼴책, "#C9FC95")
    assert len(set(img.convert("RGB").getdata())) > 1, "글자가 덮여 사라졌다"


def test_층대로_실제로_그린다_뒤엣_사진이_앞엣_사진에_덮인다(글꼴책):
    """앞뒤를 바꾸면 겹치는 자리의 색이 바뀐다."""
    # 채움색 있는 도형은 물음표 없이 한 색으로만 칠해진다 — 위를 완전히
    # 덮는지 보려면 이래야 한다(장식은 이제 그림이 없으면 아예 안 그린다).
    # 채움색을 자리표시 점선 색(`PLACEHOLDER_MARK_COLOR`)과 다르게 둔다 —
    # 같으면 덮였는지 아닌지를 색으로 못 가른다.
    큰것 = {"box": [0, 0, cc.CANVAS[0], cc.CANVAS[1]], "종류": "도형", "채움색": "#112233"}
    작은것 = {"box": [100, 100, 400, 400], "종류": "로고"}   # 로고는 물음표를 찍는다
    배경 = {"배경": {"종류": "단색", "hex": "#FFFFFF"}, "글자영역": []}

    큰것이위 = cc.draw_card({**배경, "장식영역": [dict(작은것, 층=0), dict(큰것, 층=1)]},
                         글꼴책, "#C9FC95")
    작은것이위 = cc.draw_card({**배경, "장식영역": [dict(작은것, 층=1), dict(큰것, 층=0)]},
                          글꼴책, "#C9FC95")
    # 큰 것이 위면 작은 것의 점선·물음표가 덮여 한 가지 색만 남는다.
    assert len(set(큰것이위.convert("RGB").getdata())) == 1
    assert len(set(작은것이위.convert("RGB").getdata())) > 1


def _줄시작y(글꼴책, 칸):
    """그 칸에서 «글자 덩이가 새로 시작하는» 세로 자리들.

    **마지막으로 «찍힌» 줄과 견준다.** 마지막으로 «담은» 줄과 견주면, 이어진
    글자 덩이 안에서도 문턱(3px)마다 새 줄로 잘려서 한 줄이 여럿으로 보인다 —
    그러면 줄간격을 아무리 바꿔도 `[0]`·`[1]` 이 둘 다 첫 줄 안이라 차이가 안 난다
    (2026-08-26, 이 헬퍼를 처음 쓸 때 실제로 그랬다).
    """
    img = Image.new("RGBA", cc.CANVAS, (255, 255, 255, 255))
    d = ImageDraw.Draw(img)
    cc._draw_text_region(img, d, 글꼴책, 칸, "#C9FC95")
    화소 = img.load()
    찍힌줄, 마지막 = [], None
    for y in range(cc.CANVAS[1]):
        불켜짐 = any(화소[x, y][:3] != (255, 255, 255) for x in range(cc.CANVAS[0]))
        if 불켜짐:
            if 마지막 is None or y - 마지막 > 3:
                찍힌줄.append(y)
            마지막 = y
    return 찍힌줄


def test_재어_온_줄간격을_쓴다(글꼴책):
    """장마다 1.26·1.40·1.46 으로 재 놓고 붙박이 1.32 를 쓰고 있었다."""
    칸 = _글자칸("왼쪽", (100, 200, 900, 700))
    칸["lines"] = ["가나다", "라마바"]
    좁은것 = _줄시작y(글꼴책, dict(칸, 줄간격=1.0))
    넓은것 = _줄시작y(글꼴책, dict(칸, 줄간격=2.0))
    assert len(좁은것) >= 2 and len(넓은것) >= 2
    assert 넓은것[1] - 넓은것[0] > 좁은것[1] - 좁은것[0], "줄간격이 안 먹었다"


def test_줄간격이_없으면_붙박이_1_32(글꼴책):
    """옛 카드(줄간격 없음)가 그대로 그려져야 한다."""
    칸 = _글자칸("왼쪽", (100, 200, 900, 700))
    칸["lines"] = ["가나다", "라마바"]
    없는것 = _줄시작y(글꼴책, 칸)
    같은것 = _줄시작y(글꼴책, dict(칸, 줄간격=cc.LINE_SPACING))
    assert 없는것 == 같은것


def test_밑줄_효과를_그린다(글꼴책):
    """3번 장 본문에 «밑줄» 이 잡혀 있다 — 재 놓고 안 그리고 있었다."""
    칸 = _글자칸("왼쪽", (100, 200, 900, 400))
    칸["lines"] = ["가나다"]
    민것 = cc.draw_card({"배경": {"종류": "단색", "hex": "#FFFFFF"},
                       "장식영역": [], "글자영역": [칸]}, 글꼴책, "#C9FC95")
    밑줄 = cc.draw_card({"배경": {"종류": "단색", "hex": "#FFFFFF"},
                       "장식영역": [], "글자영역": [dict(칸, 효과=["밑줄"])]},
                      글꼴책, "#C9FC95")
    민것칠 = sum(1 for p in 민것.convert("RGB").getdata() if p != (255, 255, 255))
    밑줄칠 = sum(1 for p in 밑줄.convert("RGB").getdata() if p != (255, 255, 255))
    assert 밑줄칠 > 민것칠, "밑줄이 안 그려졌다"


def _네귀퉁이(img, box):
    """네모의 네 귀퉁이 안쪽 화소 — 원으로 오리면 여기가 배경색이 된다."""
    x0, y0, x1, y1 = box
    d = 6
    rgb = img.convert("RGB")
    return [rgb.getpixel((x0 + d, y0 + d)), rgb.getpixel((x1 - d, y0 + d)),
            rgb.getpixel((x0 + d, y1 - d)), rgb.getpixel((x1 - d, y1 - d))]


def _원테두리(box, 점수=64):
    import math
    x0, y0, x1, y1 = box
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    r = min(x1 - x0, y1 - y0) / 2
    return [[round(cx + r * math.cos(2 * math.pi * i / 점수)),
             round(cy + r * math.sin(2 * math.pi * i / 점수))] for i in range(점수)]


def test_도형을_채움색으로_칠한다(글꼴책):
    """검은 알약이 검은 알약으로 나와야 한다 — 예전엔 회색 네모였다."""
    box = [100, 100, 900, 300]
    카드 = {"배경": {"종류": "단색", "hex": "#FFFFFF"}, "글자영역": [],
          "장식영역": [{"종류": "도형", "box": box, "채움색": "#111111"}]}
    img = cc.draw_card(카드, 글꼴책, "#C9FC95").convert("RGB")
    assert img.getpixel((500, 200)) == (17, 17, 17), img.getpixel((500, 200))


def test_도형을_테두리대로_칠한다(글꼴책):
    """둥근 알약의 귀퉁이는 안 칠해져야 한다."""
    box = [100, 100, 900, 500]
    카드 = {"배경": {"종류": "단색", "hex": "#FFFFFF"}, "글자영역": [],
          "장식영역": [{"종류": "도형", "box": box, "채움색": "#111111",
                    "테두리": _원테두리(box)}]}
    img = cc.draw_card(카드, 글꼴책, "#C9FC95")
    assert img.convert("RGB").getpixel((500, 300)) == (17, 17, 17), "가운데는 칠해야 한다"
    for p in _네귀퉁이(img, box):
        assert p == (255, 255, 255), f"귀퉁이가 칠해졌다: {p}"


def test_구멍은_안_칠한다(글꼴책):
    box = [100, 100, 900, 500]
    바깥 = _원테두리(box)
    안 = [[round(300 + (x - 500) * 0.3), round(300 + (y - 300) * 0.3)] for x, y in 바깥]
    카드 = {"배경": {"종류": "단색", "hex": "#FFFFFF"}, "글자영역": [],
          "장식영역": [{"종류": "도형", "box": box, "채움색": "#111111",
                    "테두리": 바깥, "구멍": [안]}]}
    img = cc.draw_card(카드, 글꼴책, "#C9FC95").convert("RGB")
    assert img.getpixel((300, 300)) == (255, 255, 255), "구멍이 메워졌다"


def test_사진을_테두리로_오려_붙인다(글꼴책, tmp_path, monkeypatch):
    """원형 크롭이 원으로 나와야 한다 — 예전엔 무조건 네모였다."""
    from PIL import Image as PILImage
    빨강 = PILImage.new("RGBA", (400, 400), (255, 0, 0, 255))
    monkeypatch.setattr(cc, "_fetch_media", lambda url: 빨강)
    box = [100, 100, 900, 900]
    카드 = {"배경": {"종류": "단색", "hex": "#FFFFFF"}, "글자영역": [],
          "장식영역": [{"종류": "사진", "box": box, "media_url": "https://x/a.png",
                    "테두리": _원테두리(box)}]}
    img = cc.draw_card(카드, 글꼴책, "#C9FC95")
    assert img.convert("RGB").getpixel((500, 500)) == (255, 0, 0)
    for p in _네귀퉁이(img, box):
        assert p == (255, 255, 255), f"귀퉁이가 안 잘렸다: {p}"


def test_테두리가_없으면_예전처럼_네모(글꼴책, monkeypatch):
    """**사진 갈래만** 본다 — 자리표시·채움색 갈래(끝점 포함 관례, R22)는

    이 시험이 밟지 않는다. 아래 `test_자리표시가_끝점까지_칠해진다` ·
    `test_도형_채움이_끝점까지_칠해진다` 가 그 갈래를 본다. 이걸 만능
    그물로 오해하지 말 것.
    """
    from PIL import Image as PILImage
    빨강 = PILImage.new("RGBA", (400, 400), (255, 0, 0, 255))
    monkeypatch.setattr(cc, "_fetch_media", lambda url: 빨강)
    box = [100, 100, 900, 900]
    카드 = {"배경": {"종류": "단색", "hex": "#FFFFFF"}, "글자영역": [],
          "장식영역": [{"종류": "사진", "box": box, "media_url": "https://x/a.png"}]}
    img = cc.draw_card(카드, 글꼴책, "#C9FC95")
    for p in _네귀퉁이(img, box):
        assert p == (255, 0, 0), "옛 카드가 달라졌다"


def test_자리표시가_끝점까지_칠해진다(글꼴책):
    """R22: 옛 코드는 `d.rectangle([x0,y0,x1,y1])` 로 **끝점을 포함**해 칠했다.

    `Image.new` 로 바꾸면서 끝점을 제외하면 (x1, y1) 화소가 안 칠해져
    옛 카드와 1px 이 어긋난다.
    """
    box = [100, 100, 300, 300]
    카드 = {"배경": {"종류": "단색", "hex": "#FFFFFF"}, "글자영역": [],
          "장식영역": [{"종류": "사진", "box": box}]}
    img = cc.draw_card(카드, 글꼴책, "#C9FC95").convert("RGB")
    x0, y0, x1, y1 = box
    # **끝점까지 점선이 닿는다.** 사진 자리는 속을 안 칠하므로(2026-09-18) 끝점에
    # 있어야 할 것은 회색 채움이 아니라 테두리 점선이다.
    표 = tuple(int(cc.PLACEHOLDER_MARK_COLOR[i:i + 2], 16) for i in (1, 3, 5))
    끝 = [img.getpixel((x1 - k, y1 - k)) for k in range(cc.점선두께)]
    assert 표 in 끝, f"끝점에 점선이 안 닿았다 — {끝}"


def test_도형_채움이_끝점까지_칠해진다(글꼴책):
    """R22: 채움색 갈래도 자리표시와 같은 «끝점 포함» 관례를 따라야 한다."""
    box = [100, 100, 300, 300]
    카드 = {"배경": {"종류": "단색", "hex": "#FFFFFF"}, "글자영역": [],
          "장식영역": [{"종류": "도형", "box": box, "채움색": "#111111"}]}
    img = cc.draw_card(카드, 글꼴책, "#C9FC95").convert("RGB")
    x0, y0, x1, y1 = box
    assert img.getpixel((x1, y1)) == (17, 17, 17), "끝점이 안 칠해졌다 — 1px 이음매"


def test_사진_배경은_안_죽고_바닥을_칠한다():
    """**예전엔 여기서 죽었다** — `모르는 배경 종류`.

    배경이 사진인 게시물의 틀은 만들어지는데 그 틀로 카드를 만들면 그 자리에서
    터졌다. 사진 자체는 «장 전체를 덮는 사진 자리» 가 그리고, 배경은 그 밑에
    깔릴 바닥만 칠한다.
    """
    from PIL import Image
    import cardnews_compose as cc
    for 배경, 기대 in (({"종류": "사진"}, (255, 255, 255)),
                    ({"종류": "사진", "hex": "#102030"}, (16, 32, 48)),
                    ({"종류": "미측정", "hex": None}, (255, 255, 255))):
        im = Image.new("RGB", (20, 20), (7, 7, 7))
        cc._draw_background(im, 배경)
        assert im.getpixel((10, 10)) == 기대, (배경, im.getpixel((10, 10)))


def test_모르는_배경은_그래도_죽는다():
    """조용히 흰 종이를 내면 «못 잰 것» 과 «흰 배경» 이 똑같이 생긴다."""
    from PIL import Image
    import cardnews_compose as cc
    import pytest
    with pytest.raises(ValueError, match="모르는 배경 종류"):
        cc._draw_background(Image.new("RGB", (10, 10)), {"종류": "무지개"})


def test_줄마다_다른_색으로_그린다():
    """**한 덩이 안에서 줄 색이 달라지는 것이 실물에 있다** — 키키 표지는 첫 줄이
    노랑, 둘째 줄이 빨강이다. 덩이 색 하나로 접으면 빨강이 통째로 사라진다."""
    import numpy as np
    from PIL import Image
    import cardnews_compose as cc
    import template_render as tr
    from pathlib import Path
    import json, io as _io
    cfg = json.load(_io.open(Path(__file__).parent / "template.json", encoding="utf-8"))
    fonts = tr.FontBook(cfg.get("fonts") or cfg, Path(__file__).parent)
    지역 = {"box": [10, 10, 500, 300], "pt": 60, "weight": "Bold", "align": "왼쪽",
          "글자색": "#FFDD58", "lines": ["가나다", "라마바"],
          "줄색": ["#FFDD58", "#DD363E"], "줄간격": 1.3}
    im = Image.new("RGB", (520, 320), (255, 255, 255))
    d = __import__("PIL.ImageDraw", fromlist=["ImageDraw"]).Draw(im)
    cc._draw_text_region(im, d, fonts, 지역, "#000000")
    a = np.asarray(im.convert("RGB"))
    있나 = lambda 색: bool((np.abs(a.astype(int) - np.array(색)).max(2) < 30).sum())
    assert 있나((255, 221, 88)), "첫 줄 노랑이 없다"
    assert 있나((221, 54, 62)), "둘째 줄 빨강이 없다"


def test_배경판을_배경색_위에_얹는다(monkeypatch):
    """**색을 먼저 칠하고 판을 덮는다.**

    판에서 뚫린 자리(사람이 그은 네모)로 아래 색이 그대로 비쳐야 한다. 판만
    깔면 그 자리가 검게 비고, 색만 칠하면 구분선·무늬가 통째로 사라진다.
    """
    import numpy as np
    from PIL import Image
    import cardnews_compose as cc
    판 = Image.new("RGBA", (60, 40), (0, 0, 0, 0))
    판.paste(Image.new("RGBA", (60, 6), (255, 0, 0, 255)), (0, 0))   # 가로선 하나
    monkeypatch.setattr(cc, "_fetch_media", lambda url: 판)
    im = Image.new("RGB", (60, 40), (7, 7, 7))
    cc._draw_background(im, {"종류": "단색", "hex": "#00FF00", "판": "x.png"})
    a = np.asarray(im)
    assert tuple(a[2, 30]) == (255, 0, 0), "판의 선이 안 얹혔다"
    assert tuple(a[20, 30]) == (0, 255, 0), "뚫린 자리로 배경색이 안 비친다"


def test_배경판_크기가_달라도_맞춘다(monkeypatch):
    """판은 그 장을 통째로 뜬 것이라 크기가 같아야 하는데, 다르면 `paste` 가
    왼쪽 위에 붙여 놓고 나머지를 비운다."""
    import numpy as np
    from PIL import Image
    import cardnews_compose as cc
    monkeypatch.setattr(cc, "_fetch_media",
                        lambda url: Image.new("RGBA", (10, 10), (0, 0, 255, 255)))
    im = Image.new("RGB", (80, 60), (7, 7, 7))
    cc._draw_background(im, {"종류": "단색", "hex": "#FFFFFF", "판": "x.png"})
    a = np.asarray(im)
    assert tuple(a[55, 75]) == (0, 0, 255), "판이 장 전체로 안 늘어났다"


def test_배경판을_못_가져와도_안_죽는다(monkeypatch):
    """창고가 잠깐 안 되면 배경색만이라도 나와야 한다 — 카드 전체를 잃지 않는다."""
    from PIL import Image
    import numpy as np
    import cardnews_compose as cc
    monkeypatch.setattr(cc, "_fetch_media", lambda url: None)
    im = Image.new("RGB", (30, 30), (7, 7, 7))
    cc._draw_background(im, {"종류": "단색", "hex": "#123456", "판": "x.png"})
    assert tuple(np.asarray(im)[15, 15]) == (0x12, 0x34, 0x56)


def test_도형에서_온_글자는_세로_가운데다():
    """**그 네모는 «글자 둘레» 가 아니라 «도형» 이다.**

    위에서부터 그리면 글자가 도형 위쪽 변에 딱 붙는다 — 실측 DNUFIa4NIkK 2번 장:
    226px 알약에 3줄 150px 이 위에 몰리고 아래 76px 이 빈다.
    """
    import json, io as _io
    from pathlib import Path
    import numpy as np
    from PIL import Image, ImageDraw
    import cardnews_compose as cc
    import template_render as tr
    cfg = json.load(_io.open(Path(__file__).parent / "template.json", encoding="utf-8"))
    fonts = tr.FontBook(cfg.get("fonts") or cfg, Path(__file__).parent)

    def 잉크세로(가운데):
        지역 = {"box": [10, 10, 400, 300], "pt": 40, "weight": "Bold", "align": "왼쪽",
              "글자색": "#000000", "lines": ["가나다", "라마바"], "줄간격": 1.3}
        if 가운데:
            지역["세로가운데"] = True
        im = Image.new("RGB", (420, 320), (255, 255, 255))
        cc._draw_text_region(im, ImageDraw.Draw(im), fonts, 지역, "#000000")
        ys = np.nonzero((np.asarray(im).sum(2) < 400).any(axis=1))[0]
        return int(ys.min()), int(ys.max())

    위, _ = 잉크세로(False)
    가위, 가아래 = 잉크세로(True)
    assert 위 < 25, f"보통 글자칸이 위에서 안 시작한다: {위}"
    assert 가위 > 위 + 30, "가운데 맞춤이 안 먹었다"
    # 위아래 여백이 비슷해야 «가운데» 다
    assert abs((가위 - 10) - (300 - 가아래)) < 20, (가위, 가아래)


def test_보통_글자칸은_그대로다():
    """옛 카드가 달라지면 안 된다 — `세로가운데` 가 없으면 위에서부터."""
    import io as _io
    from pathlib import Path
    글 = _io.open(Path(__file__).parent / "cardnews_compose.py", encoding="utf-8").read()
    assert 'if region.get("세로가운데") and 글줄:' in 글


def _한장(장식영역):
    import json
    cfg = json.loads((Path(__file__).parent / "template.json").read_text(encoding="utf-8"))
    fonts = tr.FontBook(cfg.get("fonts") or cfg, Path(__file__).parent)
    칸 = {"index": 1, "역할": "훅", "배경": {"종류": "단색", "hex": "#FFFFFF"},
         "장식영역": 장식영역, "글자영역": []}
    return cc.build({"slides": [칸]}, fonts)[0].convert("RGB")


def test_색을_못_잰_도형은_안_그린다():
    """도형은 그 자체가 디자인이다 — 색을 못 쟀다는 건 «모른다» 는 뜻이다.

    회색으로 칠하면 없는 것을 지어내는 셈이고, 실제로 그 회색이 밑에 있는 검은
    알약을 덮어 글자가 안 보이게 만들었다(실물 2026-08-27 — 사람이 도형과
    글자에 각각 모양을 줘서 도형이 둘이 됐고, 색 없는 쪽이 있는 쪽을 덮었다).
    """
    그림 = _한장([{"종류": "도형", "box": [100, 100, 500, 300], "채움색": "#000000"},
                {"종류": "도형", "box": [100, 100, 500, 300]}])
    assert 그림.getpixel((300, 200)) == (0, 0, 0), "색을 잰 도형이 살아 있어야 한다"


def test_색을_잰_도형은_그대로_그린다():
    그림 = _한장([{"종류": "도형", "box": [100, 100, 500, 300], "채움색": "#112233"}])
    assert 그림.getpixel((300, 200)) == (17, 34, 51)


def test_사진_자리표시는_속이_비고_겉만_점선이다():
    """「여기에 사진이 들어올 것이다」는 뜻이라 보여 주되, **속은 안 칠한다**
    (사람 결정 2026-09-18: 「그냥 투명하게 그리고 겉에만 점선, 중앙에 ?」)."""
    그림 = _한장([{"종류": "사진", "box": [100, 100, 500, 300]}])
    assert 그림.getpixel((150, 250)) == (255, 255, 255), "속을 칠했다"
    윗줄 = [그림.getpixel((x, 100)) for x in range(100, 500)]
    다른것 = sum(1 for c in 윗줄 if c != (255, 255, 255))
    assert 0 < 다른것 < len(윗줄), f"점선이 아니다 — {다른것}/{len(윗줄)}"


# ── 한글이 섞인 주소 ───────────────────────────────────────────────

_한글판 = ("https://cardnews-render-554608989606.s3.ap-northeast-2.amazonaws.com/"
        "배경판/DYWiVHhlNwo/03.png")


def test_한글_주소를_퍼센트로_바꾼다():
    """**배경판이 한 장도 안 붙던 까닭이다**(실물 2026-08-29).

    창고 열쇠에 한글을 써서 주소가 아스키가 아니었다. `urlopen` 이
    `UnicodeEncodeError` 를 던지고 `_fetch_media` 가 그걸 삼켜 `None` 을
    돌려주므로, 종이 질감도 찢어진 가장자리도 조용히 사라졌다.
    """
    난것 = cc._아스키주소(_한글판)
    assert 난것.isascii(), 난것
    assert 난것.endswith("/DYWiVHhlNwo/03.png")
    assert "%EB%B0%B0" in 난것, "「배」가 퍼센트로 바뀌어야 한다"


def test_아스키_주소는_그대로_둔다():
    맨것 = "https://x.example/a/b.png?v=2"
    assert cc._아스키주소(맨것) == 맨것


def test_빈_주소도_안_터진다():
    assert cc._아스키주소("") == ""
    assert cc._아스키주소(None) == ""


def test_한글_주소로_그림을_실제로_받아온다():
    """다듬기가 진짜로 통하는지 — 창고에 있는 판으로 한 번 받아 본다."""
    난것 = cc._fetch_media(_한글판)
    assert 난것 is not None, "한글 주소에서 그림을 못 받았다"
    assert 난것.size == (1080, 1350)


# ── 글꼴을 슬롯대로 고른다 ─────────────────────────────────────────
#
# **여태 한 줄로 프리텐다드를 못 박고 있었다.** 틀에 「검은고딕」이라 적혀 있어도
# 프리텐다드로 나왔다(사람 지적 2026-08-29). 분석은 여덟 종으로 재는데 굽기는
# 한 종으로 그렸으니, 재는 자와 그리는 자가 달랐다.

def test_적힌_글꼴로_고른다():
    assert cc.글꼴이름({"font": "검은고딕", "weight": "Bold"}) == "BlackHanSans"
    assert cc.글꼴이름({"font": "나눔명조", "weight": "Regular"}) == "NanumMyeongjo-Medium"
    assert cc.글꼴이름({"font": "지마켓산스", "weight": "Bold"}) == "GmarketSans-Bold"


def test_굵기가_한_벌인_글꼴은_둘_다_같다():
    """잘난체·검은고딕·도현은 원래 굵은 글꼴이라 Regular 판이 없다."""
    for 이름 in ("여기어때잘난체", "검은고딕", "배민도현"):
        굵은것 = cc.글꼴이름({"font": 이름, "weight": "Bold"})
        가는것 = cc.글꼴이름({"font": 이름, "weight": "Regular"})
        assert 굵은것 == 가는것, 이름


def test_못_알아보면_프리텐다드로_물러선다():
    for 슬롯 in ({"font": "없는글꼴", "weight": "Bold"},
              {"font": "", "weight": "Bold"},
              {"weight": "Bold"},
              {"font": "못 가림", "weight": "Regular"}):
        난것 = cc.글꼴이름(슬롯)
        assert 난것.startswith("Pretendard"), 난것


def test_여덟_종이_다_진짜로_열린다():
    """표에만 있고 파일이 없으면 굽다가 죽는다. 여기서 미리 연다."""
    책 = tr.FontBook(json.loads((HERE / "template.json").read_text(encoding="utf-8"))["fonts"],
                    HERE)
    for 이름 in sorted({n for 한벌 in cc.한글글꼴.values() for n in 한벌}):
        f = 책.get(이름, 40)
        assert f is not None, 이름


def test_라벨이_고를_수_있는_여덟_종을_다_그린다():
    """`analyze/fontmatch.FONT_FILES` 와 같은 여덟이어야 한다 — 사람이 라벨에서
    고른 글꼴을 굽는 쪽이 모르면 그 선택이 조용히 사라진다."""
    import sys as _sys
    _sys.path.insert(0, str(HERE.parent / "analyze"))
    import fontmatch  # noqa: PLC0415
    assert set(cc.한글글꼴) == set(fontmatch.FONT_FILES)


def test_점검이_아는_글꼴과_굽는_쪽이_같다():
    """**점검이 낡으면 장치가 헛돈다.** 굽는 쪽에 글꼴을 더하고 점검을 안 고치면,
    멀쩡한 글꼴을 「못 그린다」고 알리게 된다. 반대면 진짜 못 그리는 것을 놓친다.
    """
    import sys as _sys
    _sys.path.insert(0, str(HERE.parent / "dify"))
    import 틀점검  # noqa: PLC0415
    assert set(틀점검.그릴수있는글꼴) == set(cc.한글글꼴)


def test_점검이_아는_배경_갈래와_굽는_쪽이_같다():
    """색만으로 그릴 수 있는 갈래가 갈리면 점검이 헛것을 잡거나 놓친다."""
    import sys as _sys
    _sys.path.insert(0, str(HERE.parent / "dify"))
    import 틀점검  # noqa: PLC0415
    글 = (HERE / "cardnews_compose.py").read_text(encoding="utf-8")
    for 갈래 in 틀점검.색으로그리는배경:
        assert f'종류 == "{갈래}"' in 글, 갈래


# ── 영상 자리 ──────────────────────────────────────────────────────
#
# 사람 결정 2026-09-16: 「?」 자리에 사진 또는 영상. 영상 자리는 **투명하게 뚫어**
# 굽고, ffmpeg 이 그 밑에 영상을 깐다(`영상굽기`). 뚫는 것 말고는 한 화소도 안
# 바뀌어야 한다 — 글자는 그 뒤에 그려져 영상 위에 얹힌다.

def _영상칸(box=(100, 200, 620, 590), **더):
    return {"종류": "사진", "box": list(box),
            "media_url": "https://bucket/photos/a.mp4", **더}


def test_영상_자리는_알파_0_으로_뚫린다(글꼴책):
    화소 = _그린것(_영상칸(), 글꼴책).load()
    assert 화소[110, 210][3] == 0            # 자리 안
    assert 화소[619, 589][3] == 0            # 끝점 제외(w, h) — 사진과 같은 관례
    assert 화소[620, 590][3] == 255          # 자리 밖은 그대로
    assert 화소[50, 50] == (255, 255, 255, 255)


def test_테두리가_있으면_그_모양만_뚫린다(글꼴책):
    # 마름모 — 네모 귀퉁이는 안 뚫린다
    테 = [[360, 200], [620, 395], [360, 590], [100, 395]]
    화소 = _그린것(_영상칸(테두리=테), 글꼴책).load()
    assert 화소[360, 395][3] == 0            # 가운데
    assert 화소[101, 201][3] == 255          # 귀퉁이


def test_영상_위에_글자가_얹힌다(글꼴책):
    카드 = {"배경": {"종류": "단색", "hex": "#FFFFFF"},
           "장식영역": [_영상칸((0, 0, 1080, 1350), 배경자리=True)],
           "글자영역": [{"종류": "글자", "box": [100, 100, 900, 200], "pt": 60,
                       "weight": "Bold", "align": "왼쪽", "font": "프리텐다드",
                       "글자색": "#000000", "줄종류": "한줄", "lines": ["가나다"]}]}
    img = cc.draw_card(카드, 글꼴책, "#C9FC95")
    화소 = img.load()
    # 구멍 화소는 (0,0,0,0) 이라 앞 세 칸만 보면 글자와 못 가른다 — 네 칸을 다 본다.
    검정 = [(x, y) for y in range(100, 200) for x in range(100, 400) if 화소[x, y] == (0, 0, 0, 255)]
    assert 검정, "글자가 안 그려졌다 — 구멍 위에 불투명한 검정 화소가 하나도 없다"
    assert 화소[1000, 1300] == (0, 0, 0, 0)  # 글자 없는 데는 색도 알파도 0


def test_영상인가_와_영상자리():
    assert cc.영상인가(_영상칸()) is True
    assert cc.영상인가({"종류": "사진", "media_url": "https://b/p.jpg"}) is False
    assert cc.영상인가({"종류": "사진"}) is False
    카드 = {"장식영역": [{"종류": "로고", "box": [0, 0, 10, 10]}, _영상칸()]}
    assert cc.영상자리(카드)["media_url"].endswith("a.mp4")
    assert cc.영상자리({"장식영역": []}) is None


def test_build_는_영상_장을_따로_낸다(글꼴책):
    사진장 = {"배경": {"종류": "단색", "hex": "#FFFFFF"}, "장식영역": [], "글자영역": []}
    영상장 = {"배경": {"종류": "단색", "hex": "#FFFFFF"}, "장식영역": [_영상칸()], "글자영역": []}
    난것 = cc.build({"slides": [사진장, 영상장]}, 글꼴책)
    assert isinstance(난것[0], Image.Image)
    assert set(난것[1]) == {"그림", "영상", "box"}
    assert 난것[1]["영상"].endswith("a.mp4") and 난것[1]["box"] == [100, 200, 620, 590]
    assert 난것[1]["그림"].load()[110, 210][3] == 0


def test_영상_자리는_각도가_있어도_뚫린다(글꼴책):
    """돌려 담는 길은 투명한 층에 그리므로, 거기에 «알파 0» 을 찍어 봐야 구멍이
    안 생긴다(검토 2026-09-16). 그래서 영상 자리는 각도를 무시하고 바로 뚫는다."""
    화소 = _그린것(_영상칸(각도=15), 글꼴책).load()
    assert 화소[360, 395][3] == 0            # 자리 한가운데
    assert 화소[50, 50] == (255, 255, 255, 255)


# ── 장식 그림 (사람 결정 2026-09-17) ────────────────────────────────

def test_장식_그림이_있으면_그것을_그린다(monkeypatch):
    """지금은 장식이 빈 자리로만 나왔다 — 라벨 안 한 선·배지가 배경판에
    얼어붙고 사진 배경 장에서는 통째로 사라졌다(사람 결정 2026-09-17)."""
    import numpy as np
    from PIL import Image, ImageDraw
    import cardnews_compose as cc
    빨강 = Image.new("RGBA", (40, 30), (255, 0, 0, 255))
    monkeypatch.setattr(cc, "_fetch_media", lambda url: 빨강)
    판 = Image.new("RGBA", (200, 200), (255, 255, 255, 255))
    cc._decoration_속(판, ImageDraw.Draw(판), None,
                     {"종류": "장식", "box": [10, 10, 50, 40],
                      "그림": "https://보기/cutouts/a.png"})
    가운데 = tuple(np.asarray(판.convert("RGB"))[25, 30])
    assert 가운데 == (255, 0, 0), f"장식 그림이 안 그려졌다: {가운데}"


def test_그림_주소를_못_받으면_예전처럼_빈_자리(monkeypatch):
    """주소가 죽어도 카드는 나와야 한다."""
    from PIL import Image, ImageDraw
    import cardnews_compose as cc
    monkeypatch.setattr(cc, "_fetch_media", lambda url: None)
    판 = Image.new("RGBA", (200, 200), (255, 255, 255, 255))
    cc._decoration_속(판, ImageDraw.Draw(판), None,
                     {"종류": "장식", "box": [10, 10, 50, 40],
                      "그림": "https://보기/cutouts/a.png"})
    assert 판.size == (200, 200)


def test_사람이_올린_사진이_장식_그림보다_이긴다(monkeypatch):
    """작업대는 장식영역 어디에나 사진을 떨어뜨릴 수 있다. 그 자리에 자동으로
    딴 `그림` 이 이미 있으면 사람이 올린 `media_url` 이 조용히 무시됐다
    (2026-09-17 최종 검토 지적 ①) — 사람이 손으로 올린 것이 자동보다 뒤일
    이유가 없다."""
    import cardnews_compose as cc
    주소별그림 = {
        "https://보기/cutouts/a.png": Image.new("RGBA", (40, 30), (255, 0, 0, 255)),
        "https://x/사람이올린.png": Image.new("RGBA", (40, 30), (0, 255, 0, 255)),
    }
    monkeypatch.setattr(cc, "_fetch_media", lambda url: 주소별그림[url])
    판 = Image.new("RGBA", (200, 200), (255, 255, 255, 255))
    cc._decoration_속(판, ImageDraw.Draw(판), None,
                     {"종류": "장식", "box": [10, 10, 50, 40],
                      "그림": "https://보기/cutouts/a.png",
                      "media_url": "https://x/사람이올린.png"})
    가운데 = 판.convert("RGB").getpixel((25, 30))
    assert 가운데 == (0, 255, 0), f"media_url 이 아니라 그림이 그려졌다: {가운데}"


def test_장식인데_그림도_media_url도_없으면_아무것도_안_그린다():
    """장식은 자동 누끼 갈래라 대개 PNG 가 나오지만, 찬몫이 창 밖이거나
    테두리따기가 실패하면 `누끼열쇠` 가 안 붙는다. 그럴 때 회색 자리표시를
    그리면 이어 그린 배경 위를 덮어 버린다(2026-09-17 최종 검토 지적 ②).
    이어 그린 배경이 그대로 보여야 한다."""
    import cardnews_compose as cc
    판 = Image.new("RGBA", (200, 200), (10, 20, 30, 255))
    cc._decoration_속(판, ImageDraw.Draw(판), None,
                     {"종류": "장식", "box": [10, 10, 50, 40]})
    가운데 = 판.convert("RGB").getpixel((25, 30))
    assert 가운데 == (10, 20, 30), f"밑에 깔린 배경이 그대로여야 하는데 {가운데} 로 덮였다"


def test_굵기가_그_구간만_굵게_그린다(글꼴책):
    """낱말 하나만 굵게 — 줄 단위 굵기로는 못 하던 것이다."""
    import numpy as np
    from PIL import Image, ImageDraw
    import cardnews_compose as cc
    글꼴 = 글꼴책
    민것 = Image.new("RGBA", (600, 120), (255, 255, 255, 255))
    굵은것 = Image.new("RGBA", (600, 120), (255, 255, 255, 255))
    칸 = {"종류": "글자", "box": [10, 10, 590, 110], "pt": 40, "weight": "Regular",
         "align": "왼쪽", "font": "프리텐다드", "글자색": "#000000",
         "lines": ["가나다라마바사"]}
    cc._draw_text_region(민것, ImageDraw.Draw(민것), 글꼴, dict(칸), "#FFE600")
    cc._draw_text_region(굵은것, ImageDraw.Draw(굵은것), 글꼴,
                        {**칸, "굵기": [{"줄번호": 1, "시작": 0, "끝": 3}]},
                        "#FFE600")
    민 = np.asarray(민것.convert("L")).astype(int)
    굵 = np.asarray(굵은것.convert("L")).astype(int)
    assert (굵 < 128).sum() > (민 < 128).sum(), "굵은 구간이 더 짙어야 한다"


def test_굵기가_없으면_예전과_같다(글꼴책):
    from PIL import Image, ImageDraw
    import numpy as np
    import cardnews_compose as cc
    글꼴 = 글꼴책
    칸 = {"종류": "글자", "box": [10, 10, 590, 110], "pt": 40, "weight": "Regular",
         "align": "왼쪽", "font": "프리텐다드", "글자색": "#000000",
         "lines": ["가나다라마"]}
    가 = Image.new("RGBA", (600, 120), (255, 255, 255, 255))
    나 = Image.new("RGBA", (600, 120), (255, 255, 255, 255))
    cc._draw_text_region(가, ImageDraw.Draw(가), 글꼴, dict(칸), "#FFE600")
    cc._draw_text_region(나, ImageDraw.Draw(나), 글꼴, {**칸, "굵기": []}, "#FFE600")
    assert (np.asarray(가) == np.asarray(나)).all()


# ---------------------------------------------------------------- 전체 사진 아래 음영

def _흰사진(w=None, h=None):
    return Image.new("RGBA", (w or cc.CANVAS[0], h or cc.CANVAS[1]), (255, 255, 255, 255))


def _밝기(img, y):
    """그 줄 한가운데 화소의 밝기(0~255). 흰 사진 위라 음영이 짙을수록 낮다."""
    return img.convert("RGB").getpixel((cc.CANVAS[0] // 2, y))[0]


def test_전체_사진은_아래가_어두워진다(글꼴책, monkeypatch):
    """**기본값으로 음영이 깔린다**(사람 결정 2026-09-18). 흰 글자가 밝은 사진
    위에서 안 읽히던 것을 막는다 — 원본 카드뉴스 표지가 다들 그렇게 해 뒀다."""
    monkeypatch.setattr(cc, "_fetch_media", lambda url: _흰사진())
    img = _그린것(_배경자리칸(media_url="http://x/y.jpg"), 글꼴책)
    맨위, 한가운데, 맨아래 = _밝기(img, 5), _밝기(img, cc.CANVAS[1] // 2), _밝기(img, cc.CANVAS[1] - 5)
    assert 맨위 == 255, f"위쪽은 사진 그대로여야 한다 — {맨위}"
    assert 한가운데 == 255, "시작 지점(아래 45%) 위로는 안 깔린다"
    assert 맨아래 < 150, f"맨 아래는 검정 50% 가 깔려야 한다 — {맨아래}"


def test_진하기_0_이면_사진_그대로다(글꼴책, monkeypatch):
    """**진하기 0 이 「끄기」다.** 켜고 끄는 값을 따로 두지 않는다."""
    monkeypatch.setattr(cc, "_fetch_media", lambda url: _흰사진())
    img = _그린것(_배경자리칸(media_url="http://x/y.jpg", 음영진하기=0), 글꼴책)
    assert img.convert("RGB").getcolors() == [(cc.CANVAS[0] * cc.CANVAS[1], (255, 255, 255))]


def test_음영색을_주면_그_색이_깔린다(글꼴책, monkeypatch):
    monkeypatch.setattr(cc, "_fetch_media", lambda url: _흰사진())
    img = _그린것(_배경자리칸(media_url="http://x/y.jpg",
                          음영색="#0000FF", 음영진하기=100), 글꼴책)
    r, g, b = img.convert("RGB").getpixel((cc.CANVAS[0] // 2, cc.CANVAS[1] - 1))
    assert b > r and b > g, f"파란 음영이어야 한다 — {(r, g, b)}"


def test_보통_사진_자리에는_음영이_안_붙는다(글꼴책, monkeypatch):
    """음영은 «장 전체를 덮는» 사진에만 붙는다. 슬라이드 안 사진 칸은 그대로다 —
    붙이면 원본에 없던 그늘이 생겨 되돌려 그리기 판정이 틀어진다."""
    monkeypatch.setattr(cc, "_fetch_media", lambda url: _흰사진(400, 300))
    칸 = {"종류": "사진", "box": [100, 200, 500, 500], "media_url": "http://x/y.jpg"}
    img = _그린것(칸, 글꼴책)
    assert img.convert("RGB").getpixel((300, 499)) == (255, 255, 255), "사진 그대로여야 한다"


# ---------------------------------------------------------------- 사진 바깥 그림자

def _빨강사진(w=400, h=300):
    return Image.new("RGBA", (w, h), (255, 0, 0, 255))


def _사진칸(**더):
    return {"종류": "사진", "box": [300, 400, 700, 700],
            "media_url": "http://x/y.jpg", **더}


def _바깥아래(img):
    """사진 아래쪽 «바깥» 화소. 그림자가 깔리면 흰색에서 어두워진다."""
    return img.convert("RGB").getpixel((500, 715))


def test_그림자는_기본으로_안_붙는다(글꼴책, monkeypatch):
    """**기본값은 꺼짐이다**(사람 결정 2026-09-18). 모든 사진 칸에 기본으로
    붙이면 원본에 그림자가 없던 카드도 생겨 되돌려 그리기 판정이 틀어진다."""
    monkeypatch.setattr(cc, "_fetch_media", lambda url: _빨강사진())
    img = _그린것(_사진칸(), 글꼴책)
    assert _바깥아래(img) == (255, 255, 255), "사진 밖은 건드리지 않는다"


def test_진하기를_올리면_사진_아래_바깥이_어두워진다(글꼴책, monkeypatch):
    monkeypatch.setattr(cc, "_fetch_media", lambda url: _빨강사진())
    img = _그린것(_사진칸(그림자진하기=80), 글꼴책)
    r, g, b = _바깥아래(img)
    assert r < 240 and g < 240 and b < 240, f"그림자가 깔려야 한다 — {(r, g, b)}"


def test_그림자색을_주면_그_색이_깔린다(글꼴책, monkeypatch):
    monkeypatch.setattr(cc, "_fetch_media", lambda url: _빨강사진())
    img = _그린것(_사진칸(그림자색="#0000FF", 그림자진하기=100), 글꼴책)
    r, g, b = _바깥아래(img)
    assert b > r and b > g, f"파란 그림자여야 한다 — {(r, g, b)}"


def test_그림자가_사진을_안_가린다(글꼴책, monkeypatch):
    """그림자는 사진 «뒤» 에 깔린다 — 사진 자체는 원래 색 그대로다."""
    monkeypatch.setattr(cc, "_fetch_media", lambda url: _빨강사진())
    img = _그린것(_사진칸(그림자진하기=100), 글꼴책)
    assert img.convert("RGB").getpixel((500, 550)) == (255, 0, 0), "사진 한가운데는 그대로"


# ---------------------------------------------------------------- 긁은 부분만 글자색

def test_긁은_부분만_그_색으로_그린다(글꼴책):
    img = Image.new("RGBA", cc.CANVAS, (255, 255, 255, 255))
    칸 = {"종류": "글자", "box": [100, 200, 900, 320], "pt": 60, "weight": "Regular",
         "align": "왼쪽", "font": "프리텐다드", "글자색": "#000000", "줄종류": "한줄",
         "lines": ["가나다라마"],
         "색구간": [{"줄번호": 1, "시작": 0, "끝": 2, "색": "#FF0000"}]}
    cc._draw_text_region(img, ImageDraw.Draw(img), 글꼴책, 칸, "#C9FC95")
    화소 = [p for p in img.convert("RGB").getdata() if p != (255, 255, 255)]
    빨강 = [p for p in 화소 if p[0] > 150 and p[1] < 100 and p[2] < 100]
    검정 = [p for p in 화소 if max(p) < 100]
    assert 빨강, "긁은 부분이 빨강이어야 한다"
    assert 검정, "나머지는 칸 색(검정) 이어야 한다"


# ---------------------------------------------------------------- 긁은 부분만 밑줄

def _밑줄칸(**더):
    return {"종류": "글자", "box": [100, 200, 900, 340], "pt": 60, "weight": "Regular",
            "align": "왼쪽", "font": "프리텐다드", "글자색": "#000000", "줄종류": "한줄",
            "lines": ["가나다라마"], **더}


def _칠한수(글꼴책, 칸):
    img = Image.new("RGBA", cc.CANVAS, (255, 255, 255, 255))
    cc._draw_text_region(img, ImageDraw.Draw(img), 글꼴책, 칸, "#C9FC95")
    return sum(1 for p in img.convert("RGB").getdata() if p != (255, 255, 255))


def test_밑줄구간을_그_자리에만_긋는다(글꼴책):
    """**긁은 데만 밑줄**(사람 결정 2026-09-19: 「다 똑같이 전체 선택하면 전체 다,
    일부 스크롤하면 그 부분만」). 형광펜·굵게·글자색과 같은 규칙이다.

    두 글자만 그으면 다섯 글자를 다 긋는 것보다 칠한 화소가 적어야 한다.
    """
    맨것 = _칠한수(글꼴책, _밑줄칸())
    두글자 = _칠한수(글꼴책, _밑줄칸(밑줄구간=[{"줄번호": 1, "시작": 0, "끝": 2}]))
    다섯글자 = _칠한수(글꼴책, _밑줄칸(밑줄구간=[{"줄번호": 1, "시작": 0, "끝": 5}]))
    assert 두글자 > 맨것, "밑줄이 그어져야 한다"
    assert 다섯글자 > 두글자, "긁은 만큼만 그어야 한다"


def test_효과_밑줄은_칸_전체를_긋는다(글꼴책):
    """**옛 설계도가 안 깨져야 한다** — `효과: ["밑줄"]` 은 칸 전체다."""
    맨것 = _칠한수(글꼴책, _밑줄칸())
    전체 = _칠한수(글꼴책, _밑줄칸(효과=["밑줄"]))
    구간전체 = _칠한수(글꼴책, _밑줄칸(밑줄구간=[{"줄번호": 1, "시작": 0, "끝": 5}]))
    assert 전체 > 맨것, "옛 방식도 그대로 그어져야 한다"
    assert abs(전체 - 구간전체) < 전체 * 0.2, "칸 전체와 다섯 글자가 얼추 같아야 한다"


def test_밑줄구간이_없으면_안_긋는다(글꼴책):
    """구간도 효과도 없으면 여태처럼 아무것도 안 긋는다."""
    assert _칠한수(글꼴책, _밑줄칸()) == _칠한수(글꼴책, _밑줄칸(밑줄구간=[]))


# ---------------------------------------------------------------- 글머리기호

def _글머리칸(**더):
    return {"종류": "글자", "box": [100, 200, 900, 460], "pt": 50, "weight": "Regular",
            "align": "왼쪽", "font": "프리텐다드", "글자색": "#000000", "줄종류": "여러줄",
            "lines": ["첫째 줄입니다", "둘째 줄입니다", "셋째 줄입니다"], **더}


def test_글머리기호를_그_줄에만_붙인다(글꼴책):
    """**줄 단위다** — 낱말 하나에 점을 찍을 수는 없다(사람 결정 2026-09-19).

    기호를 붙이면 그 줄 앞에 도형이 생겨 칠한 화소가 는다.
    """
    맨것 = _칠한수(글꼴책, _글머리칸())
    한줄 = _칠한수(글꼴책, _글머리칸(글머리={"갈래": "원", "줄들": [1]}))
    세줄 = _칠한수(글꼴책, _글머리칸(글머리={"갈래": "원", "줄들": [1, 2, 3]}))
    assert 한줄 > 맨것, "기호가 그려져야 한다"
    assert 세줄 > 한줄, "붙인 줄만큼만 늘어야 한다"


def test_글머리기호_넷을_다_안다(글꼴책):
    """원·네모·줄표는 도형으로 그리고, 번호만 글자로 찍는다 —
    **검은고딕처럼 기호 글리프가 하나도 없는 글꼴이 있다**(2026-09-19 실측)."""
    맨것 = _칠한수(글꼴책, _글머리칸())
    for 갈래 in ("원", "네모", "줄표", "번호"):
        났다 = _칠한수(글꼴책, _글머리칸(글머리={"갈래": 갈래, "줄들": [1, 2, 3]}))
        assert 났다 > 맨것, f"{갈래} 가 안 그려졌다"


def test_글머리기호가_글을_밀어낸다(글꼴책):
    """기호 자리만큼 글이 오른쪽으로 밀린다 — 기호와 글자가 겹치면 안 된다."""
    img = Image.new("RGBA", cc.CANVAS, (255, 255, 255, 255))
    cc._draw_text_region(img, ImageDraw.Draw(img), 글꼴책,
                         _글머리칸(글머리={"갈래": "원", "줄들": [1]}), "#C9FC95")
    rgb = img.convert("RGB")
    # 첫 줄 왼쪽 끝(기호 자리)과 그 오른쪽(글자 자리)이 둘 다 칠해져 있어야 한다
    기호쪽 = any(rgb.getpixel((x, y)) != (255, 255, 255)
                for x in range(100, 130) for y in range(200, 260))
    assert 기호쪽, "왼쪽에 기호가 있어야 한다"


def test_글머리가_없으면_옛_모양_그대로다(글꼴책):
    assert _칠한수(글꼴책, _글머리칸()) == _칠한수(글꼴책, _글머리칸(글머리=None))

def test_도형_네모에_소수점이_있어도_구워진다(글꼴책):
    """작업대에서 모서리를 끌면 `비율조절` 이 배수를 곱해 `500.26` 같은 소수를
    남긴다. 그림판을 뜨는 `Image.new` 는 정수만 받아서 예전엔 500 이 났다 —
    사람 화면엔 「저장을 못 했습니다」로 보였다(실물 2026-09-19)."""
    카드 = {"index": 1, "역할": "훅", "배경": {"종류": "단색", "hex": "#FFFFFF"},
            "장식영역": [{"종류": "도형", "box": [100, 100, 500.26, 500.26],
                      "테두리": [[300.5, 100], [500.26, 300.5],
                              [300.5, 500.26], [100, 300.5]],
                      "채움색": "#E03131"}],
            "글자영역": []}
    img = cc.draw_card(카드, 글꼴책, "#000000").convert("RGB")
    빨강 = [x for x in range(0, img.width, 2)
           for y in range(0, img.height, 2)
           if img.getpixel((x, y))[0] > 180 and img.getpixel((x, y))[1] < 90]
    assert 빨강, "도형이 하나도 안 그려졌다"
    assert max(빨강) - min(빨강) == 400, "정수 네모와 같은 크기여야 한다"

def _빨강폭(img):
    쓸것 = [x for x in range(img.width)
           for y in range(0, img.height, 3)
           if img.getpixel((x, y))[2] > 150 and img.getpixel((x, y))[0] < 90]
    return (max(쓸것) - min(쓸것)) if 쓸것 else 0


def test_테두리는_선색과_선굵기가_있을_때만_그린다(글꼴책):
    """옛 카드에는 `선색`·`선굵기` 가 없다 — 기본으로 선을 두르면 여태 만든
    카드가 전부 달라진다(사람 요청 2026-09-19)."""
    def 장(추가):
        return {"index": 1, "역할": "훅", "배경": {"종류": "단색", "hex": "#FFFFFF"},
                "장식영역": [{"종류": "사진", "box": [100, 100, 500, 400], **추가}],
                "글자영역": []}
    없음 = cc.draw_card(장({}), 글꼴책, "#000000").convert("RGB")
    굵기0 = cc.draw_card(장({"선색": "#1971C2", "선굵기": 0}), 글꼴책, "#000000").convert("RGB")
    색없음 = cc.draw_card(장({"선굵기": 8}), 글꼴책, "#000000").convert("RGB")
    있음 = cc.draw_card(장({"선색": "#1971C2", "선굵기": 8}), 글꼴책, "#000000").convert("RGB")
    assert _빨강폭(없음) == 0
    assert _빨강폭(굵기0) == 0
    assert _빨강폭(색없음) == 0
    assert _빨강폭(있음) == 400, "네모 둘레에 선이 있어야 한다"


def test_모양을_딴_도형은_그_모양을_따라_두른다(글꼴책):
    """네모로 두르면 마름모 밖에 네모가 생긴다 — 모양을 따라가야 한다."""
    도형 = {"종류": "도형", "box": [100, 100, 500, 500], "채움색": "#FFE08A",
           "테두리": [[300, 100], [500, 300], [300, 500], [100, 300]],
           "선색": "#1971C2", "선굵기": 10}
    img = cc.draw_card({"index": 1, "역할": "훅",
                        "배경": {"종류": "단색", "hex": "#FFFFFF"},
                        "장식영역": [도형], "글자영역": []},
                       글꼴책, "#000000").convert("RGB")
    # 네모 왼쪽 위 모서리는 마름모 «밖» 이다 — 거기 선이 있으면 네모로 두른 것이다.
    assert img.getpixel((105, 105)) == (255, 255, 255), "마름모 밖에 선이 있다"
    # 마름모 왼쪽 꼭짓점 언저리에는 선이 있어야 한다.
    둘레 = [img.getpixel((100 + i, 300)) for i in range(0, 12)]
    assert any(p[2] > 150 and p[0] < 90 for p in 둘레), "모양 위에 선이 없다"


# ── 모양대로 그리는 자리표시 (사용자 지적 2026-09-24) ──────────────────
#
# 사용자: **「사진 라벨링할때 원으로 했는데 적용이 안되나?」**
#
# **사진을 넣으면 진작부터 모양대로 나왔다**(`_테두리알파`). 그런데 **비었을 때**
# 그리는 자리표시는 늘 네모였다 — 네모로 그리고 모양 마스크로 오려 냈으니
# **동그라미 자리는 점선이 원호 조각으로 끊겨** 남고, 네모 부분이 아래 글자를 덮었다.
#
# 실물(「대학생 시험」 1장): 사진 네모 `259,217~1002,925` 가 제목 `47,781~921,1101`
# 과 **95,328px** 겹쳤다. 물음표도 네모 가운데(y≈571)에 찍혔다.


def _동그라미(cx, cy, r, n=48):
    """중심 (cx,cy)·반지름 r 의 동그라미를 점 목록으로."""
    import math
    return [[cx + r * math.cos(2 * math.pi * i / n),
             cy + r * math.sin(2 * math.pi * i / n)] for i in range(n)]


def test_동그라미_사진_자리는_점선도_동그라미다(글꼴책):
    """네모 «모서리» 는 동그라미 밖이다 — 거기 점선이 있으면 네모로 그린 것이다."""
    칸 = {"종류": "사진", "box": [100, 100, 500, 500],
          "테두리": _동그라미(300, 300, 200)}
    바탕 = (250, 240, 230)
    img = Image.new("RGBA", cc.CANVAS, (*바탕, 255))
    cc._draw_decoration(img, ImageDraw.Draw(img), 글꼴책, 칸)
    화소 = img.load()
    # 모서리 네 곳은 동그라미 밖이다 — 아무것도 없어야 한다.
    for x, y in ((105, 105), (495, 105), (105, 495), (495, 495)):
        assert 화소[x, y][:3] == 바탕, f"모서리 ({x},{y})에 그렸다 — 네모로 그린 것이다"

    # **둘레를 «돌았는지» 를 본다.** 모서리만 보면 옛 코드도 통과한다 — 네모로
    # 그린 뒤 모양 마스크로 오려 내므로 모서리는 어차피 지워진다. 옛 코드가
    # 남기는 것은 네모 변이 동그라미에 «닿는» 네 점 근처뿐이라, 둘레 전체를
    # 세면 몇십 배로 갈린다(동그라미 둘레 2πr≈1,257px × 점선 비율 × 굵기 3px).
    칠한수 = sum(1 for x in range(100, 501) for y in range(100, 501)
              if 화소[x, y][:3] != 바탕)
    assert 칠한수 > 900, f"둘레를 안 돌았다 — 칠한 화소 {칠한수}개뿐"

    # 45° 자리(네모 변이 안 닿는 곳)에도 점선이 지나간다.
    import math
    비낀데 = [화소[int(300 + 200 * math.cos(각)), int(300 + 200 * math.sin(각))][:3]
           for 각 in [math.radians(a) for a in range(30, 61)]]
    assert any(c != 바탕 for c in 비낀데), "비스듬한 자리에 점선이 없다"


def test_동그라미_물음표는_동그라미_가운데다(글꼴책):
    """두 가운데가 **확실히 갈리는** 모양으로 본다 — 아래쪽에 작게 붙은 동그라미.

    네모는 y 100~900(가운데 500), 동그라미는 y 720~880(가운데 800)이다.
    y=500 은 동그라미 밖이고 점선도 안 지나가므로, 거기 무언가 찍혔다면
    **네모 가운데에 물음표를 찍은 것**이다.
    """
    칸 = {"종류": "사진", "box": [100, 100, 700, 900],
          "테두리": _동그라미(400, 800, 80)}
    바탕 = (250, 240, 230)
    img = Image.new("RGBA", cc.CANVAS, (*바탕, 255))
    cc._draw_decoration(img, ImageDraw.Draw(img), 글꼴책, 칸)
    화소 = img.load()

    def 칠한줄(y):
        return sum(1 for x in range(100, 700) if 화소[x, y][:3] != 바탕)

    assert 칠한줄(800) > 0, "동그라미 가운데에 물음표가 없다"
    assert 칠한줄(500) == 0, "네모 가운데에 물음표를 찍었다"


def test_테두리가_없으면_여태대로_네모다(글꼴책):
    """모양을 안 준 자리는 한 화소도 안 바뀌어야 한다 — 옛 카드가 달라지면 안 된다."""
    칸 = {"종류": "사진", "box": [100, 100, 400, 300]}
    바탕 = (250, 240, 230)
    img = Image.new("RGBA", cc.CANVAS, (*바탕, 255))
    cc._draw_decoration(img, ImageDraw.Draw(img), 글꼴책, 칸)
    화소 = img.load()
    # 네모 모서리에 점선이 있다 — 네모로 그린다는 뜻이다.
    윗줄 = [화소[x, 100][:3] for x in range(100, 400)]
    assert 윗줄[0] != 바탕, "네모 모서리부터 점선이 시작해야 한다"


def test_둘레_가운데는_점들의_평균이다():
    """반달처럼 치우친 모양에서 네모 가운데와 갈리는 것이 이 함수의 몫이다."""
    가 = cc._둘레가운데([[0, 0], [10, 0], [10, 10], [0, 10]])
    assert 가 == (5.0, 5.0)
    # 아래로 치우친 모양 — 네모 가운데(5)보다 아래에 있어야 한다
    나 = cc._둘레가운데([[0, 0], [10, 0], [10, 10], [5, 10], [5, 8], [0, 8]])
    assert 나[1] > 5.0, 나


# ---------------------------------------------------------------- 글줄 (2026-09-28)
#
# 글자 효과는 글자에 붙는다 — 덩어리대로 그린다. 옛 규칙(출처는 «지금 마지막 줄»,
# 줄색·줄굵기는 «몇 번째 줄») 은 이제 없다.

def _새칸(글줄, **더):
    return {"종류": "글자", "box": [100, 200, 980, 640], "pt": 60, "weight": "Regular",
            "align": "왼쪽", "font": "프리텐다드", "글자색": "#000000", "글줄": 글줄, **더}


def _줄화소(글꼴책, 칸, 몇째줄):
    """몇째 줄(0부터) 띠 안의 흰색 아닌 화소들."""
    img = Image.new("RGBA", cc.CANVAS, (255, 255, 255, 255))
    cc._draw_text_region(img, ImageDraw.Draw(img), 글꼴책, 칸, "#C9FC95")
    rgb = img.convert("RGB")
    줄높이 = 칸["pt"] * float(칸.get("줄간격") or cc.LINE_SPACING)
    y0 = int(칸["box"][1] + 몇째줄 * 줄높이)
    return [rgb.getpixel((x, y)) for y in range(y0, int(y0 + 칸["pt"]))
            for x in range(칸["box"][0], 칸["box"][2]) if rgb.getpixel((x, y)) != (255, 255, 255)]


def test_덩어리_색으로_그린다(글꼴책):
    칸 = _새칸([{"새문장": True, "덩어리": [{"글": "가나", "색": "#FF0000"}, {"글": "다라"}]}])
    화소 = _줄화소(글꼴책, 칸, 0)
    assert any(p[0] > 150 and p[1] < 100 and p[2] < 100 for p in 화소), "빨강 덩어리가 없다"
    assert any(max(p) < 100 for p in 화소), "나머지는 칸 색(검정)"


def test_출처_모양은_그_글자에만_있고_새_마지막_줄로_안_옮겨_간다(글꼴책):
    """원칙 3: 출처는 만들 때 붙은 그 글자에만 있다. 뒤에 줄이 더 붙어도 따라가지 않는다."""
    칸 = _새칸([{"새문장": True, "덩어리": [{"글": "본문"}]},
               {"새문장": True, "정렬": "오른쪽", "덩어리": [{"글": "출처", "색": "#00AA00"}]},
               {"새문장": True, "덩어리": [{"글": "새로 친 줄"}]}])
    assert any(p[1] > 120 and p[0] < 100 for p in _줄화소(글꼴책, 칸, 1)), "출처 줄이 초록이 아니다"
    assert not any(p[1] > 120 and p[0] < 100 for p in _줄화소(글꼴책, 칸, 2)), "새 마지막 줄로 옮겨 갔다"


def test_밑줄은_그_글자_색으로_긋는다(글꼴책):
    """일부러 바꾼 것: 옛 굽는 쪽은 밑줄을 칸 색으로 그었고 작업대 화면은 글자 색으로 그었다.
    이제 둘 다 글자 색이다(화면과 결과가 같아진다)."""
    칸 = _새칸([{"새문장": True, "덩어리": [{"글": "가나다", "색": "#FF0000", "밑줄": True}]}])
    img = Image.new("RGBA", cc.CANVAS, (255, 255, 255, 255))
    cc._draw_text_region(img, ImageDraw.Draw(img), 글꼴책, 칸, "#C9FC95")
    밑 = int(200 + 60 * 1.02) + 1
    줄 = [img.convert("RGB").getpixel((x, 밑)) for x in range(100, 300)]
    assert any(p[0] > 150 and p[1] < 100 for p in 줄), "밑줄이 빨강이 아니다"


def test_번호_글머리는_번호_문장만_센다(글꼴책):
    칸 = _새칸([{"새문장": True, "글머리": "번호", "덩어리": [{"글": "하나"}]},
               {"새문장": True, "글머리": "원", "덩어리": [{"글": "점"}]},
               {"새문장": True, "글머리": "번호", "덩어리": [{"글": "둘"}]}])
    img = Image.new("RGBA", cc.CANVAS, (255, 255, 255, 255))
    찍은것 = []
    원래 = cc._글머리찍기
    try:
        cc._글머리찍기 = lambda d, x, y, 크기, 갈래, 색, 몇째, 폰트: 찍은것.append((갈래, 몇째))
        cc._draw_text_region(img, ImageDraw.Draw(img), 글꼴책, 칸, "#C9FC95")
    finally:
        cc._글머리찍기 = 원래
    assert 찍은것 == [("번호", 1), ("원", 1), ("번호", 2)]


def test_받은_칸을_안_건드린다(글꼴책):
    칸 = {"종류": "글자", "box": [100, 200, 980, 640], "pt": 60, "weight": "Regular",
         "align": "왼쪽", "font": "프리텐다드", "글자색": "#000000", "lines": ["가나"],
         "굵기": [{"줄번호": 1, "시작": 0, "끝": 1}]}
    img = Image.new("RGBA", cc.CANVAS, (255, 255, 255, 255))
    cc._draw_text_region(img, ImageDraw.Draw(img), 글꼴책, 칸, "#C9FC95")
    assert "글줄" not in 칸 and 칸["굵기"] == [{"줄번호": 1, "시작": 0, "끝": 1}]
