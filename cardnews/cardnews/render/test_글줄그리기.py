# -*- coding: utf-8 -*-
"""옛 모양(`lines` + 숫자 위치 효과) 카드가 **글줄로 바꿔 그려도 화소까지 같은가.**

금판(`시험그림/글줄/*.png`)은 2026-09-28 에 **옛 굽는 쪽**으로 한 번 구워 둔 것이다.
굽는 쪽을 글줄로 바꾼 뒤(Task 4)에도 이 시험이 그대로 통과해야 한다.
**금판을 다시 굽지 마라** — 그러면 이 시험은 아무것도 지키지 않는다.
"""
import json
import sys
from pathlib import Path

import pytest
from PIL import Image, ImageChops, ImageDraw

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import cardnews_compose as cc   # noqa: E402
import template_render as tr    # noqa: E402

금판곳 = HERE / "시험그림" / "글줄"


def _칸(**더):
    return {"종류": "글자", "box": [100, 200, 980, 640], "pt": 48, "weight": "Regular",
            "align": "왼쪽", "font": "프리텐다드", "글자색": "#111111", **더}


세줄 = ["가나다라 마바사", "아자차 카타파하", "하나 둘 셋 넷"]

# **밑줄·글머리가 색칠한 글자와 겹치는 칸은 넣지 않는다** — 그 둘은 일부러 바꾼다
# (밑줄·글머리 색이 그 글자 색을 따른다, Task 4 Step 5).
옛칸들 = {
    "굵게색": _칸(lines=세줄[:2], 굵기=[{"줄번호": 1, "시작": 0, "끝": 2}],
               색구간=[{"줄번호": 1, "시작": 1, "끝": 4, "색": "#FF0000"},
                    {"줄번호": 1, "시작": 3, "끝": 6, "색": "#0000FF"}]),
    "형광펜": _칸(lines=세줄[:2], 형광펜=[{"줄번호": 1, "시작": 0, "끝": 3, "색": "#FFEE00"},
                                   {"줄번호": 1, "시작": 2, "끝": 6, "색": "#00FFEE"},
                                   {"줄번호": 2, "시작": 1, "끝": 4}]),
    "밑줄": _칸(lines=세줄[:2], 밑줄구간=[{"줄번호": 1, "시작": 2, "끝": 5}]),
    "칸밑줄": _칸(lines=세줄[:2], 효과=["밑줄"]),
    "글머리원": _칸(lines=세줄, 글머리={"갈래": "원", "줄들": [1, 3]}),
    "글머리번호": _칸(lines=세줄, align="가운데", 글머리={"갈래": "번호", "줄들": [1, 2]}),
    "출처": _칸(lines=세줄, 출처={"색": "#888888", "align": "오른쪽"}),
    "줄색": _칸(lines=세줄, 줄색=["#FF0000", "#00AA00"],
             색구간=[{"줄번호": 2, "시작": 0, "끝": 2, "색": "#0000FF"}]),
    "줄굵기": _칸(lines=세줄, 줄굵기=["Bold", "Regular"]),
    "세로가운데": _칸(lines=세줄[:2], 세로가운데=True),
    "없는줄": _칸(lines=세줄[:1], 색구간=[{"줄번호": 2, "시작": 0, "끝": 2, "색": "#FF0000"}],
               형광펜=[{"줄번호": 3, "시작": 0, "끝": 2, "색": "#FFEE00"}]),
}


@pytest.fixture(scope="module")
def 글꼴책():
    틀 = json.loads((HERE / "template.json").read_text(encoding="utf-8"))
    return tr.FontBook(틀["fonts"], HERE)


def 그려보기(칸: dict, 글꼴책) -> Image.Image:
    img = Image.new("RGBA", cc.CANVAS, (255, 255, 255, 255))
    cc._draw_text_region(img, ImageDraw.Draw(img), 글꼴책, dict(칸), "#C9FC95")
    return img.convert("RGB")


@pytest.mark.parametrize("이름", sorted(옛칸들))
def test_옛_카드가_화소까지_같다(이름, 글꼴책):
    금판 = Image.open(금판곳 / f"{이름}.png").convert("RGB")
    난것 = 그려보기(옛칸들[이름], 글꼴책)
    assert ImageChops.difference(금판, 난것).getbbox() is None, f"{이름}: 옛 모양과 달라졌다"


@pytest.mark.parametrize("칸", [_칸(lines="abc"), _칸()], ids=["글자", "칸없음"])
def test_줄_목록이_없는_칸은_터지지_않고_아무것도_안_그린다(칸, 글꼴책):
    """저장 검사가 「줄 목록이 없다」로 막는 칸(2026-09-29). 굽는 쪽까지 와도 터지지 않고,
    `"abc"` 를 글자 하나씩의 줄로 그리지도 않는다."""
    난것 = 그려보기(칸, 글꼴책)
    assert ImageChops.difference(난것, Image.new("RGB", 난것.size, (255, 255, 255))).getbbox() is None
