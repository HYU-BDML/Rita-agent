"""되돌려 그리기(`verify_labeled.py`)의 시험.

여기서 붙잡는 것은 **그림이 예쁜가**가 아니다. 눈으로 채점하는 것은 사람이 한다.
시험이 붙잡는 것은 셋뿐이고, 셋 다 "계량표를 잘못 읽으면 조용히 그럴듯해진다" 는
부류다:

1. 그라데이션 정지점을 실제로 그 자리에 놓는가 (방향까지)
2. **못 잰 것을 잰 것처럼 칠하지 않는가** — 이 태스크가 있는 이유다
3. 글자 줄의 자리·간격이 `align`·`leading`·`pt` 를 그대로 따르는가
"""
import json
import sys
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import config
import verify_labeled as V


def _arr(img: Image.Image) -> np.ndarray:
    return np.asarray(img.convert("RGB"))


def _region(rid="r1", kind="로고", box=(100, 100, 300, 200), **rest):
    return {"id": rid, "kind": kind, "box": list(box), "note": "", **rest}


# ---------------------------------------------------------------- 그라데이션

def test_gradient_lands_its_stops_on_the_right_rows():
    stops = [{"at": 0.0, "hex": "#000000"}, {"at": 1.0, "hex": "#FFFFFF"}]
    a = _arr(V.gradient(stops, "세로", (40, 101)))
    assert a[0, 20, 0] == 0
    assert a[100, 20, 0] == 255
    assert abs(int(a[50, 20, 0]) - 128) <= 2


def test_gradient_middle_stop_is_where_it_says():
    stops = [{"at": 0.0, "hex": "#000000"},
             {"at": 0.25, "hex": "#FFFFFF"},
             {"at": 1.0, "hex": "#000000"}]
    a = _arr(V.gradient(stops, "세로", (10, 101)))
    assert a[25, 5, 0] == 255            # 25% 지점이 흰색
    assert a[12, 5, 0] < 200             # 그 앞은 아직 어둡다


def test_gradient_horizontal_varies_along_x_only():
    stops = [{"at": 0.0, "hex": "#000000"}, {"at": 1.0, "hex": "#FFFFFF"}]
    a = _arr(V.gradient(stops, "가로", (101, 40)))
    assert a[20, 0, 0] == 0 and a[20, 100, 0] == 255
    assert np.ptp(a[:, 50, 0]) == 0      # 세로로는 안 변한다


# ---------------------------------------------------------------- 못 잰 것

def test_unmeasured_is_never_painted_as_a_flat_fill():
    """「미측정」의 `hex` 는 참고값이지 측정값이 아니다 — 그걸로 칠하면
    잘못 잰 색이 제대로 잰 색과 똑같이 생긴다(옛 갈래가 죽은 방식)."""
    r = _region(color={"kind": "미측정", "hex": "#FEFEFE", "cover": 0.01,
                       "cells": 2, "fallback": True, "why": "유효 격자 2칸"})
    canvas = Image.new("RGB", (400, 300), "#808080")
    V.draw_region(canvas, r)
    patch = _arr(canvas)[100:200, 100:300]
    assert len(np.unique(patch.reshape(-1, 3), axis=0)) > 1, "고르게 칠해졌다"
    marked = (np.abs(patch.astype(int) - np.array(V.NOT_MEASURED)).sum(axis=2) < 60)
    assert marked.mean() > 0.05, "못 잰 자리 표시가 안 보인다"
    fallback = (np.abs(patch.astype(int) - np.array([254, 254, 254])).sum(axis=2) < 12)
    assert fallback.mean() < 0.5, "참고값 hex 가 칸의 절반 넘게 칠해졌다"


def test_an_unmeasured_background_is_never_painted_as_a_flat_fill():
    """**옛 갈래가 죽은 바로 그 자리다** — 배경이 `#FEFEFE` 로 적혀 있었고 그 값을
    그대로 칠했더니 흰 종이가 나왔다. 네모 쪽(`draw_region`)만 잠그고 배경 쪽을
    비워 두면 같은 사고가 배경에서 되풀이된다.

    「hex 가 있으면 칠한다」로 바꾸면 `uniq == 1`, 빗금을 빼도 `uniq == 1` 이라
    두 변이 모두 이 단언에서 빨개진다.
    """
    bg = {"kind": "미측정", "hex": "#FEFEFE", "cover": 0.01, "cells": 2,
          "fallback": True, "why": "유효 격자 2칸"}
    a = _arr(V.paint_background(bg, (200, 150)))
    assert len(np.unique(a.reshape(-1, 3), axis=0)) > 1, "배경이 고르게 칠해졌다"
    marked = (np.abs(a.astype(int) - np.array(V.NOT_MEASURED)).sum(axis=2) < 60)
    assert marked.mean() > 0.05, "못 잰 배경에 표시가 없다"


def test_a_background_with_no_record_at_all_is_hatched():
    a = _arr(V.paint_background({}, (200, 150)))
    marked = (np.abs(a.astype(int) - np.array(V.NOT_MEASURED)).sum(axis=2) < 60)
    assert marked.mean() > 0.05


def test_a_measured_solid_background_is_painted_flat():
    """대조군 — 진짜 잰 배경은 그대로 칠한다. 위 둘이 「늘 빗금」으로 통과하지 못한다."""
    a = _arr(V.paint_background({"kind": "단색", "hex": "#123456",
                                 "cover": 0.8, "cells": 100}, (200, 150)))
    assert (a == np.array([0x12, 0x34, 0x56])).all()


def test_solid_is_painted_flat_so_the_two_look_different():
    """대조군 — 진짜 잰 단색은 그대로 칠한다."""
    r = _region(color={"kind": "단색", "hex": "#123456", "cover": 0.8, "cells": 90})
    canvas = Image.new("RGB", (400, 300), "#808080")
    V.draw_region(canvas, r)
    patch = _arr(canvas)[100:200, 100:300]
    assert (patch == np.array([0x12, 0x34, 0x56])).all()


def test_a_region_with_a_gradient_is_painted_as_a_gradient():
    """대조군이자 그물 — 네모의 그라데이션 갈래를 첫 정지점 단색으로 바꿔도
    시험이 전부 초록이었다(재검토가 「주장 안 한 생존 변이」로 적어 둔 셋 중 하나).
    정지점이 맞는지는 이 검사의 큰 몫이라 평평하게 칠하면 안 된다."""
    r = _region(color={"kind": "그라데이션", "dir": "세로", "cover": 0.9, "cells": 90,
                       "stops": [{"at": 0.0, "hex": "#000000"},
                                 {"at": 1.0, "hex": "#FFFFFF"}]})
    canvas = Image.new("RGB", (400, 300), "#808080")
    V.draw_region(canvas, r)
    col = _arr(canvas)[100:200, 200, 0].astype(int)
    assert col[0] < 10 and col[-1] > 245, f"위 {col[0]} · 아래 {col[-1]}"
    assert (np.diff(col) >= 0).all(), "세로로 단조 증가가 아니다"


def test_photo_slot_is_a_plain_grey_box():
    r = _region(kind="사진", color={"kind": "사진", "cover": 0.3, "cells": 57})
    canvas = Image.new("RGB", (400, 300), "#FFFFFF")
    V.draw_region(canvas, r)
    patch = _arr(canvas)[100:200, 100:300]
    assert (patch == np.array(V.PHOTO_FILL)).all()


def test_a_shape_that_came_back_as_a_photo_is_not_just_a_grey_box():
    """`장식` 이 「사진」으로 나온 자리를 회색만 칠하면 제대로 잰 사진 자리와
    구별이 안 된다 — 사람이 채점할 때 가장 놓치기 쉬운 종류다."""
    shape = _region("d", kind="장식", color={"kind": "사진", "cover": 0.2, "cells": 42})
    photo = _region("p", kind="사진", color={"kind": "사진", "cover": 0.3, "cells": 56})
    a, b = Image.new("RGB", (400, 300), "#FFFFFF"), Image.new("RGB", (400, 300), "#FFFFFF")
    V.draw_region(a, shape)
    V.draw_region(b, photo)
    assert (_arr(b)[100:200, 100:300] == np.array(V.PHOTO_FILL)).all()
    assert not (_arr(a) == _arr(b)).all(), "도형과 사진 자리가 똑같이 생겼다"
    marked = (np.abs(_arr(a).astype(int) - np.array(V.NOT_MEASURED)).sum(axis=2) < 60)
    assert marked.any()


def test_warnings_name_every_region_the_sheet_could_not_measure():
    slide = {"index": 1, "background": {"kind": "단색", "hex": "#FFFFFF",
                                        "cover": 0.7, "cells": 130},
             "regions": [
                 _region("a", color={"kind": "미측정", "hex": "#FEFEFE", "cover": 0.0,
                                     "cells": 0, "fallback": True, "why": "0칸"}),
                 _region("b", kind="사진", color={"kind": "사진", "cover": 0.3, "cells": 57}),
                 _region("c", kind="글자", text={"text": "", "pt": None, "weight": None,
                                                 "family": None, "color": None,
                                                 "align": "없음", "leading": 0.0,
                                                 "lines": 0, "fallback": True,
                                                 "why": "OCR 실패"}),
             ]}
    got = " ".join(V.warnings(slide))
    assert "a" in got and "c" in got
    assert "b" not in got


def test_warnings_call_out_a_shape_that_came_back_as_a_photo():
    """`장식`·`도형`·`로고` 가 「사진」으로 나온 것은 **답이 아니다** — 평평한 색으로
    못 줄였다는 뜻이다. 회색 네모만 그리고 조용히 지나가면 사진 자리와 구별이 안 된다."""
    slide = {"index": 7, "background": {"kind": "단색", "hex": "#FFFFFF",
                                        "cover": 0.7, "cells": 139},
             "regions": [
                 _region("d", kind="장식", color={"kind": "사진", "cover": 0.2, "cells": 42}),
                 _region("p", kind="인물", color={"kind": "사진", "cover": 0.3, "cells": 56}),
             ]}
    got = V.warnings(slide)
    assert any("d" in w for w in got)
    assert not any(w.startswith("p ") for w in got)


def test_warnings_call_out_a_region_with_no_colour_record_at_all():
    slide = {"index": 1, "background": {"kind": "단색", "hex": "#FFFFFF",
                                        "cover": 0.7, "cells": 130},
             "regions": [_region("e", kind="도형")]}
    assert any("e" in w for w in V.warnings(slide))


def test_a_position_only_region_is_outlined_not_filled_and_not_hatched():
    """장식·로고는 색을 **안 잰다**(`merge_labeled.NO_COLOR`). 그러니

    - 색으로 칠하면 안 되고 (안 잰 값을 잰 것처럼 만든다)
    - 빗금이어도 안 된다 (빗금은 「재려다 못 쟀다」는 표시다 — 두 말이 섞인다)

    자리는 아는 것이니 테두리로 남긴다. 안쪽은 밑에 깔린 배경 그대로다.
    """
    r = _region(color={"kind": "안 잼", "by_design": True, "hex": None,
                       "why": "로고는 색을 재지 않는다 — 자리만 쓴다"})
    canvas = Image.new("RGB", (400, 300), "#808080")
    V.draw_region(canvas, r)
    a = _arr(canvas)
    inside = a[120:180, 120:280]
    assert (inside == np.array([128, 128, 128])).all(), "안쪽이 칠해졌다"
    hatched = (np.abs(a[100:200, 100:300].astype(int)
                      - np.array(V.NOT_MEASURED)).sum(axis=2) < 60)
    assert hatched.mean() < 0.01, "빗금이 그려졌다 — 「못 쟀다」와 섞인다"
    edge = (np.abs(a[100:200, 100:300].astype(int)
                   - np.array(V.POSITION_ONLY)).sum(axis=2) < 30)
    assert edge.mean() > 0.02, "자리만 잰 표시(테두리)가 안 보인다"


def test_warnings_stay_quiet_about_a_region_whose_colour_we_chose_not_to_measure():
    """**안 잰 것은 못 잰 것이 아니다.** 경고에 섞으면 「고칠 것」 목록이
    영영 안 비고, 진짜 못 잰 자리가 그 속에 묻힌다."""
    slide = {"index": 1, "background": {"kind": "단색", "hex": "#FFFFFF",
                                        "cover": 0.7, "cells": 130},
             "regions": [_region("logo", kind="로고",
                                 color={"kind": "안 잼", "by_design": True,
                                        "hex": None, "why": "자리만 쓴다"})]}
    assert V.warnings(slide) == []
    # 대조군 — 같은 네모가 「미측정」이면 경고가 나온다.
    slide["regions"][0]["color"] = {"kind": "미측정", "hex": "#FEFEFE", "cover": 0.0,
                                    "cells": 1, "fallback": True, "why": "유효 격자 1칸"}
    assert any("logo" in w for w in V.warnings(slide))


def test_warnings_say_effects_were_not_drawn_and_where_they_came_from():
    """효과는 되돌려 그리기가 **안 그린다.** 말해 주지 않으면 「효과가 없었다」와
    「있는데 안 그렸다」가 그림에서 똑같이 생긴다. 사람이 찍은 것인지 기계가 읽은
    것인지도 같이 적는다 — 기계 쪽 문턱은 아직 실물로 검증 안 된 첫 추정치다."""
    block = {"text": "가", "pt": 40, "weight": "Bold", "color": "#000000",
             "align": "왼쪽", "leading": 0.0, "lines": 1, "line_detail": []}
    slide = {"index": 1, "background": {"kind": "단색", "hex": "#FFFFFF",
                                        "cover": 0.7, "cells": 130},
             "regions": [_region("t", kind="글자", text=block,
                                 effects=["밑줄"], effects_by="기계")]}
    got = V.warnings(slide)
    assert any("밑줄" in w and "기계" in w for w in got), got

    # 대조군 — 효과가 없으면 아무 말도 안 한다.
    slide["regions"][0]["effects"] = []
    assert not any("효과" in w for w in V.warnings(slide)), V.warnings(slide)


def test_warnings_call_out_a_background_that_was_not_measured():
    slide = {"index": 2,
             "background": {"kind": "미측정", "hex": "#FEFEFE", "cover": 0.0,
                            "cells": 1, "fallback": True, "why": "유효 격자 1칸"},
             "regions": []}
    assert any("배경" in w for w in V.warnings(slide))


# ---------------------------------------------------------------- 글자 줄

def test_line_layout_uses_leading_times_pt_as_the_step():
    block = {"text": "가\n나\n다", "pt": 40, "leading": 1.5, "lines": 3, "align": "왼쪽"}
    got = V.line_layout([100, 200, 500, 400], block)
    assert [g["y"] for g in got] == [200, 260, 320]
    assert {g["anchor"] for g in got} == {"la"}
    assert [g["x"] for g in got] == [100, 100, 100]


def test_line_layout_centres_on_the_box_when_align_is_centre():
    block = {"text": "가\n나", "pt": 40, "leading": 1.5, "lines": 2, "align": "가운데"}
    got = V.line_layout([100, 200, 500, 400], block)
    assert [g["x"] for g in got] == [300, 300]
    assert {g["anchor"] for g in got} == {"ma"}


def test_line_layout_right_aligns_to_the_box_right_edge():
    block = {"text": "가\n나", "pt": 40, "leading": 1.5, "lines": 2, "align": "오른쪽"}
    got = V.line_layout([100, 200, 500, 400], block)
    assert [g["x"] for g in got] == [500, 500]
    assert {g["anchor"] for g in got} == {"ra"}


def test_line_layout_single_line_has_one_origin_and_no_step():
    block = {"text": "가", "pt": 40, "leading": 0.0, "lines": 1, "align": "단일"}
    got = V.line_layout([100, 200, 500, 400], block)
    assert len(got) == 1 and got[0]["y"] == 200


def test_line_layout_trusts_the_text_not_the_line_count():
    """`lines` 와 실제 줄 수가 어긋나면 글자를 잃지 않는 쪽으로 간다."""
    block = {"text": "가\n나\n다", "pt": 40, "leading": 1.5, "lines": 2, "align": "왼쪽"}
    assert len(V.line_layout([0, 0, 100, 100], block)) == 3


# ---------------------------------------------------------------- 누끼 각도

def test_measured_rect_turns_with_the_angle():
    """45° 로 적힌 사각형은 축정렬 상자가 정사각형이 된다 — 각도가 0 으로
    기록됐다면 이 검산이 안 맞는다."""
    cut = {"box": [100, 100, 200, 200], "w": 100.0, "h": 40.0, "angle": 45.0}
    pts = np.array(V.measured_rect(cut))
    span = pts.max(axis=0) - pts.min(axis=0)
    assert abs(span[0] - span[1]) < 1e-6
    assert abs(span[0] - 140 / np.sqrt(2)) < 1e-6


def test_measured_rect_at_zero_is_the_plain_box():
    cut = {"box": [100, 100, 200, 180], "w": 100.0, "h": 80.0, "angle": 0.0}
    pts = np.array(V.measured_rect(cut))
    assert abs(pts.min(axis=0)[0] - 100) < 1e-6
    assert abs(pts.max(axis=0)[1] - 180) < 1e-6


def _cutout_region(angle=0.0, png=None):
    return {"id": "g", "kind": "로고", "box": [100, 100, 200, 180], "note": "",
            "cutout": {"box": [100, 100, 200, 180], "w": 100.0, "h": 80.0,
                       "angle": angle, "conf": 0.9, "png": png}}


def _cyan(canvas):
    return (np.abs(_arr(canvas).astype(int) - np.array(V.RECT_LINE)).sum(axis=2) < 60)


def test_draw_cutout_puts_the_measured_rect_on_the_canvas():
    """각도 검산 장치가 **캔버스에 실제로 닿는지**. 이 단언이 없으면 하늘색
    사각형을 안 그려도 시험이 전부 초록이었다 — 즉 각도 갈래가 통째로 사라져도
    아무도 모른다. PNG 가 없어도 사각형은 그려야 한다(그래야 「PNG 가 없다」와
    「각도가 틀렸다」를 그림에서 가를 수 있다)."""
    canvas = Image.new("RGB", (400, 300), "#FFFFFF")
    assert V.draw_cutout(canvas, _cutout_region(png="없는파일.png"), Path("어디에도없음")) is False
    assert _cyan(canvas).sum() > 100, "잰 사각형이 캔버스에 없다"


def test_a_tilted_cutout_rect_leaves_the_axis_aligned_box():
    """기운 각도에서만 이 장치가 뜻이 있다 — 각도 0 이면 사각형이 상자와 같아서
    **어떤 각도 오류도 드러날 수 없다**(실물 게시물이 정확히 그 경우였다).
    각도를 무시하면 30° 판도 상자 안에 갇혀 이 단언이 빨개진다."""
    flat = Image.new("RGB", (400, 300), "#FFFFFF")
    V.draw_cutout(flat, _cutout_region(angle=0.0), Path("어디에도없음"))
    tilted = Image.new("RGB", (400, 300), "#FFFFFF")
    V.draw_cutout(tilted, _cutout_region(angle=30.0), Path("어디에도없음"))

    inside = np.zeros((300, 400), bool)
    inside[100:181, 100:201] = True          # 상자, 경계 화소 포함
    assert (_cyan(flat) & ~inside).sum() == 0, "각도 0 인데 사각형이 상자를 벗어났다"
    assert (_cyan(tilted) & ~inside).sum() > 50, "기운 사각형이 상자 안에 갇혀 있다"


def test_draw_cutout_actually_pastes_the_png_and_scales_it_to_the_box(tmp_path):
    """**붙이는 길에 단언이 하나도 없었다.** 앞의 두 시험은 PNG 가 **없는** 길만
    타서, `canvas.paste(...)` 를 `pass` 로 바꿔도(`ok=True` 유지) 전부 초록이었다 —
    누끼 갈래가 통째로 죽어도 하늘색 테두리만 남고 아무도 모른다. 크기 조정도
    같다: PNG 는 원본 해상도, `box` 는 1080 기준이라 안 맞추면 자리가 틀어진다.

    그래서 상자(100×80)보다 작은 50×40 PNG 를 준다 — 붙이기를 빼면 상자가
    배경색으로 남고, 크기 조정을 빼면 상자의 왼쪽 위 4분의 1만 칠해진다.

    **그리고 반만 불투명하게 준다.** 앞 판의 PNG 는 완전 불투명이라
    `paste(im, (x0, y0), im)` 에서 **마스크 인자만 빼도 한 화소도 안 달라졌다** —
    그 갈래를 재료가 아예 안 밟았다. 실물은 그렇지 않다:
    `data/cutouts/DZhFe-iGv7s/01/w1.png` 는 77.9% 가 투명이고 그 **밑에 짙은 회색**
    (평균 RGB ≈ 83,83,83)이 깔려 있어, 마스크를 빼면 상자의 78% 가 계량표에 없던
    회색 네모가 된다. 게다가 `ok=True` 라 `draw_region` 으로도 안 떨어지고 띠도
    조용하다. 그래서 투명한 절반은 **캔버스 배경 그대로**여야 한다.
    """
    (tmp_path / "a").mkdir()
    png = Image.new("RGBA", (50, 40), (255, 0, 0, 255))
    alpha = np.zeros((40, 50), np.uint8)
    alpha[:, :25] = 255                      # 왼쪽 절반만 불투명, 밑의 빨강은 그대로
    png.putalpha(Image.fromarray(alpha))
    png.save(tmp_path / "a" / "b.png")
    canvas = Image.new("RGB", (400, 300), "#FFFFFF")
    assert V.draw_cutout(canvas, _cutout_region(png="a/b.png"), tmp_path) is True
    a = _arr(canvas)
    assert (a[110:170, 110:140] == np.array([255, 0, 0])).all(), "누끼 화소가 상자에 안 닿았다"
    assert (a[110:170, 160:190] == 255).all(), "투명한 쪽이 캔버스를 덮었다 — 마스크가 빠졌다"
    assert (a[200:300, 250:400] == 255).all(), "상자 밖까지 칠했다"


def test_warnings_call_out_a_cutout_whose_png_is_missing():
    """PNG 가 없으면 `draw_cutout` 이 조용히 `draw_region` 으로 떨어져 **평평한
    색**을 칠한다. 그때 띠에 「못 잰 것 없음」이 찍히면 그림도 글도 아무 말을 안 한다.
    `analyze/data/` 가 통째로 gitignore 라 **새 체크아웃의 기본 상태**다."""
    slide = {"index": 1, "background": {"kind": "단색", "hex": "#FFFFFF",
                                        "cover": 0.7, "cells": 130},
             "regions": [dict(_cutout_region(png="어디에도/없다.png"),
                              color={"kind": "단색", "hex": "#123456",
                                     "cover": 0.9, "cells": 90})]}
    got = V.warnings(slide, root=Path("어디에도없음"))
    assert any("누끼 PNG" in w for w in got), got


def test_warnings_stay_quiet_when_the_cutout_png_is_there(tmp_path):
    """대조군 — 파일이 있으면 아무 말도 안 한다."""
    (tmp_path / "a").mkdir()
    Image.new("RGBA", (100, 80)).save(tmp_path / "a" / "b.png")
    slide = {"index": 1, "background": {"kind": "단색", "hex": "#FFFFFF",
                                        "cover": 0.7, "cells": 130},
             "regions": [dict(_cutout_region(png="a/b.png"),
                              color={"kind": "단색", "hex": "#123456",
                                     "cover": 0.9, "cells": 90})]}
    assert V.warnings(slide, root=tmp_path) == []


# ---------------------------------------------------------------- 글자를 그리는 쪽

def _block(**kw):
    b = {"text": "가나다라", "pt": 48, "weight": "Bold", "family": "고딕",
         "font": "프리텐다드", "color": "#000000", "align": "왼쪽",
         "leading": 1.4, "lines": 1, "fallback": False}
    b.update(kw)
    return b


def _drawn(block, box=(20, 40, 380, 290)):
    canvas = Image.new("RGB", (400, 300), "#FFFFFF")
    V.draw_text(canvas, {"id": "t", "kind": "글자", "box": list(box), "text": block})
    return _arr(canvas)


def _ink_height(a):
    dark = (a.sum(axis=2) < 200)
    rows = np.where(dark.any(axis=1))[0]
    return 0 if not len(rows) else int(rows.max() - rows.min() + 1)


def test_draw_text_scales_the_ink_with_pt():
    """`pt` 는 계량표의 핵심 값이다. 그걸 무시하고 늘 같은 크기로 그리면
    **계량표가 틀려도 그림이 그럴듯해진다** — 이 파일이 있는 이유의 반대다."""
    small, big = _ink_height(_drawn(_block(pt=24))), _ink_height(_drawn(_block(pt=96)))
    assert small > 0 and big > 0
    assert 3.5 < big / small < 4.5, f"pt 를 네 배로 했는데 잉크는 {big / small:.2f} 배"


def test_draw_text_gets_heavier_when_the_weight_says_bold():
    """Task 5+6 이 C1 으로 고친 「줄별 굵기」가 그림에 닿는지. `weight` 를 무시하면
    두 판이 같은 화소가 되어 빨개진다."""
    bold = (_drawn(_block(weight="Bold")).sum(axis=2) < 200).sum()
    regular = (_drawn(_block(weight="Regular")).sum(axis=2) < 200).sum()
    assert bold > regular * 1.15, f"Bold {bold} · Regular {regular}"


def test_text_with_no_measured_colour_is_magenta_not_a_plausible_black():
    """색을 못 잰 글자를 검정으로 찍으면 **제대로 잰 검정 글자와 똑같이 생긴다.**"""
    a = _drawn(_block(color=None))
    marked = (np.abs(a.astype(int) - np.array(V.NOT_MEASURED)).sum(axis=2) < 60)
    assert marked.sum() > 100, "못 잰 글자색 표시가 없다"
    assert (a.sum(axis=2) < 200).sum() == 0, "못 잰 색을 어두운 색으로 찍었다"


def test_text_that_ocr_could_not_read_is_hatched_not_silently_dropped():
    """빗금을 빼고 그냥 생략하면 「못 읽었다」가 「아무것도 없었다」로 보인다."""
    a = _drawn(_block(text="", color=None, fallback=True, why="OCR 실패"))
    marked = (np.abs(a.astype(int) - np.array(V.NOT_MEASURED)).sum(axis=2) < 60)
    assert marked.mean() > 0.05


_PRETENDARD = V._FONT_FILES["프리텐다드"][0]
_has_font = pytest.mark.skipif(
    not _PRETENDARD.exists(),
    reason=f"{_PRETENDARD.name} 이 없다 — render-server/fonts 는 저장소에 안 들어 있다")


@_has_font
def test_font_of_uses_the_named_font_when_the_file_is_there():
    """**새 체크아웃에서는 건너뛴다.** `git ls-files render-server` 가 0건이고
    `.gitignore` 가 `analyze/fonts/*` 를 뺀다 — 새 클론에 글꼴 파일이 하나도 없다.
    그걸 모르고 단언했더니 깨끗한 워크트리에서 이 시험 하나가 빨갰다.
    글꼴이 없는 컴퓨터에서 정말 재야 하는 것은 아래 「대체를 적는가」쪽이다.
    """
    V._SUBSTITUTED.clear()
    try:
        got = V.font_of(_block(font="프리텐다드", pt=48, weight="Bold"))
        assert Path(got.path).name == "Pretendard-Bold.otf"
        assert got.size == 48
        assert V._SUBSTITUTED == set(), "있는 글꼴인데 대체로 적혔다"
    finally:
        V._SUBSTITUTED.clear()


def test_font_of_records_what_it_substituted_for_a_name_it_does_not_have():
    """글꼴 파일이 하나도 없어도 도는 절반 — 대체 사실을 조용히 넘기지 않는가.
    이 갈래가 죽으면 「글꼴이 달라서 그런 것」과 「잰 값이 틀려서 그런 것」을
    사람이 가를 수 없다."""
    V._SUBSTITUTED.clear()
    try:
        got = V.font_of(_block(font="없는글씨체", pt=48))
        assert got.size == 48
        assert any("없는글씨체" in s for s in V._SUBSTITUTED), "대체를 조용히 넘어갔다"
    finally:
        V._SUBSTITUTED.clear()


# ---------------------------------------------------------------- 실물

_M = config.MEASURES / "DHqCBQnRAjW.json"
_real = pytest.mark.skipif(not _M.exists(), reason="계량표 실물이 없다")


def test_render_slide_puts_both_the_shape_and_its_text_on_the_canvas():
    """실물 없이도 도는 「흰 종이가 아니다」 시험.

    `analyze/data/` 는 통째로 gitignore 라 **새 체크아웃에서는 아래 `_real` 두 개가
    건너뛰어진다.** 옛 갈래가 죽은 그 회귀만 실물에 걸어 두면, 실물이 없는 컴퓨터에서는
    그 그물이 아예 안 쳐진다. 그래서 같은 성질을 합성 계량표로도 잠근다 —
    `render_slide` 가 **글자 아닌 네모도 글자도** 캔버스에 실제로 올리는가.
    """
    doc = {"canvas": {"w": 400, "h": 300},
           "slides": [{"index": 1,
                       "background": {"kind": "단색", "hex": "#FFFFFF",
                                      "cover": 0.9, "cells": 100},
                       "regions": [
                           _region("s", kind="도형", box=(20, 20, 380, 110),
                                   color={"kind": "단색", "hex": "#123456",
                                          "cover": 0.9, "cells": 90}),
                           _region("t", kind="글자", box=(20, 150, 380, 260),
                                   text=_block(text="가나다라", align="왼쪽")),
                       ]}]}
    a = _arr(V.render_slide(doc, 1))
    assert (a[20:110, 20:380] == np.array([0x12, 0x34, 0x56])).all(), "네모를 안 그렸다"
    ink = (a[150:260, 20:380].sum(axis=2) < 200)
    assert ink.mean() > 0.02, f"글자 잉크가 상자의 {ink.mean():.4f} 뿐이다"


@_real
def test_the_cover_redraw_is_not_a_blank_page():
    """옛 갈래가 죽은 방식 그대로의 회귀 시험 — 배경 `#FEFEFE` · 글자 `#FEFEFE`
    로 적혀서 되돌려 그리니 **글자가 통째로 사라진 흰 종이**가 나왔다.

    **「색이 여러 가지고 어두운 화소가 있다」로는 이걸 못 잡는다.** 실제로 재 봤다 —
    1번 장은 글자를 통째로 안 그려도 `uniq 3215 · dark 0.0217` 로 소수점까지
    같다(제목이 흰색이라 어두운 화소를 안 보태고, 흰색은 이미 그라데이션 팔레트
    안에 있다). 그 두 지표가 재는 것은 배경뿐이었다.

    그래서 **글자 네모를 뺀 판과 견준다.** 글자를 안 그리면 두 판이 화소까지
    같아지므로 모든 덩어리가 0 이 되어 빨개진다. 실측(이 커밋): 1번 장 두 덩어리가
    상자의 34.9% · 29.0% 를 바꾼다.
    """
    doc = json.loads(_M.read_text(encoding="utf-8"))
    blank = json.loads(_M.read_text(encoding="utf-8"))
    slide = next(s for s in blank["slides"] if s["index"] == 1)
    blocks = [r for r in slide["regions"] if r.get("text")]
    slide["regions"] = [r for r in slide["regions"] if not r.get("text")]
    assert blocks, "표지에 글자 덩어리가 없다 — 시험 전제가 깨졌다"

    a = _arr(V.render_slide(doc, 1))
    b = _arr(V.render_slide(blank, 1))
    changed = (a != b).any(axis=2)
    for r in blocks:
        x0, y0, x1, y1 = (int(round(v)) for v in r["box"])
        got = changed[y0:y1, x0:x1]
        assert got.mean() > 0.05, (f"{r['id']} 자리에 글자가 안 찍혔다 "
                                   f"— 상자의 {got.mean():.4f}")


@_real
def test_every_slide_actually_gets_its_text_drawn():
    """표지만이 아니라 일곱 장 전부. 1번 장 하나만 걸어 두면 나중에 어떤 갈래가
    거기서만 살아 있어도 초록이다. 실측(이 커밋): 열네 덩어리의 최소가 0.1696."""
    doc = json.loads(_M.read_text(encoding="utf-8"))
    seen = 0
    for s in doc["slides"]:
        i = s["index"]
        blank = json.loads(_M.read_text(encoding="utf-8"))
        sl = next(x for x in blank["slides"] if x["index"] == i)
        blocks = [r for r in sl["regions"] if r.get("text")]
        sl["regions"] = [r for r in sl["regions"] if not r.get("text")]
        changed = (_arr(V.render_slide(doc, i)) != _arr(V.render_slide(blank, i))).any(axis=2)
        for r in blocks:
            x0, y0, x1, y1 = (int(round(v)) for v in r["box"])
            got = changed[y0:y1, x0:x1]
            assert got.mean() > 0.05, f"{i}번 {r['id']} — 상자의 {got.mean():.4f}"
            seen += 1
    assert seen >= 12, f"글자 덩어리를 {seen}개밖에 못 봤다"


@_real
def test_the_real_post_no_longer_has_a_single_unmeasured_region():
    """**옛 시험이 여기서 깨졌고, 그게 옳다.**

    이 시험의 앞 판은 「실물 로고들이 전부 「미측정」이니 그것들이 경고에 다
    나오는지」를 봤다. 사람 결정(2026-08-20)으로 장식·로고는 색을 «안 재게»
    되면서 실물의 「미측정」이 0개가 됐다 — 애초에 필요도 없는 것을 재려다
    실패하고 있었다는 뜻이다. 앞 판은 스스로 「시험 전제가 깨졌다」고 말하게
    쓰여 있었고 실제로 그 말을 했다.

    지금 지키는 것: 실물에 색 미측정이 하나도 없고, 「안 잼」 일곱은 경고에
    안 오른다. 「미측정 → 경고」라는 성질 자체는 합성 시험이 계속 지킨다
    (`test_warnings_name_every_region_the_sheet_could_not_measure`).
    """
    doc = json.loads(_M.read_text(encoding="utf-8"))
    kinds = [r.get("color", {}).get("kind") for s in doc["slides"] for r in s["regions"]]
    assert kinds.count("미측정") == 0, kinds
    by_design = [r["id"] for s in doc["slides"] for r in s["regions"]
                 if (r.get("color") or {}).get("by_design")]
    # **개수를 못 박지 않는다.** 사람이 같은 게시물을 다시 라벨하면 장식·로고가
    # 늘고 준다 — 실제로 일곱이 여덟이 됐다(2026-08-29에 정리). 이 시험이
    # 지키려는 것은 「몇 개냐」가 아니라 **「안 잰 것들이 경고에 안 오른다」** 다.
    assert by_design, "「안 잼」이 하나도 없다 — 시험이 헛돌았다"
    갈래 = {r.get("kind") for s in doc["slides"] for r in s["regions"]
          if (r.get("color") or {}).get("by_design")}
    assert 갈래 <= {"장식", "로고"}, 갈래      # 글자를 안 재고 있으면 그건 탈이다
    # **색에 대해서만** 잠근다. 같은 로고라도 누끼 PNG 를 못 찾으면 그건 나오는
    # 게 맞다(다른 사실이다) — 그리고 그 경고는 `config.DATA` 가 어디를 가리키는지에
    # 달려 있어 판마다 달라진다.
    colour_words = ("색 미측정", "색 기록이 아예 없다", "「사진」으로 나왔다")
    for slide in doc["slides"]:
        for w in V.warnings(slide):
            if any(word in w for word in colour_words):
                assert not any(i in w for i in by_design), w


# ---------------------------------------------------------------- 줄 뒤 색(형광펜)

def _hl_line(x0=40, x1=200, hexed="#C9FC95", y0=60, y1=100):
    return {"text": "가나", "box": [20, y0, 360, y1], "pt": 40, "weight": "Regular",
            "color": "#000000",
            "back": {"runs": [{"hex": hexed, "x0": x0, "x1": x1,
                               "ratio": round((x1 - x0) / 340, 3)}]}}


def _has(a, hexed):
    want = np.array(V.hex_rgb(hexed))
    return (np.abs(a.astype(int) - want).sum(axis=2) < 20)


def test_형광펜을_실제로_칠한다():
    """사람이 그림을 보고 짚은 것 — 「형광펜은 인식 못 하나」.

    계량표가 줄 뒤 색을 들고 있어도 되돌려 그림이 안 칠하면 사람은 그걸 볼
    방법이 없다. 이 그림이 그 값의 유일한 증거다.
    """
    a = _drawn(_block(line_detail=[_hl_line()]))
    assert _has(a, "#C9FC95").sum() > 1000, "형광펜이 안 칠해졌다"


def test_형광펜이_끊긴_자리는_안_칠한다():
    """줄 전체를 한 색으로 칠하면 「볼 수 있습니다」 앞에서 끊기는 실물의 모양이
    사라진다 — 몫만 적고 자리를 안 그리면 그 값이 검산되지 않는다."""
    a = _drawn(_block(line_detail=[_hl_line(x0=40, x1=200)]))
    painted = _has(a, "#C9FC95")
    cols = np.where(painted.any(axis=0))[0]
    assert cols.min() >= 40 and cols.max() < 200, (cols.min(), cols.max())


def test_구간이_둘이면_둘_다_칠한다():
    line = _hl_line()
    line["back"]["runs"].append({"hex": "#FF8800", "x0": 200, "x1": 340, "ratio": 0.41})
    a = _drawn(_block(line_detail=[line]))
    assert _has(a, "#C9FC95").sum() > 500 and _has(a, "#FF8800").sum() > 500


def test_띠가_아니라고_판정된_줄은_안_칠한다():
    """사진·무늬 위 글자다. 평평한 색으로 메우면 제대로 잰 색과 똑같이 생긴다."""
    line = _hl_line()
    line["back"] = {"runs": [], "fallback": True, "why": "무늬다"}
    a = _drawn(_block(line_detail=[line]))
    assert _has(a, "#C9FC95").sum() == 0


def test_줄마다_색이_다르면_줄색으로_찍는다():
    """덩어리의 `color` 는 줄색의 최빈값이라 소수파 줄을 삼킨다. 줄 값이 있으면
    그걸 써야 「윗줄 흰색 · 아랫줄 초록」이 그림에 남는다."""
    block = _block(text="가나\n다라", lines=2, color="#000000",
                   line_detail=[{"text": "가나", "box": [20, 40, 360, 90],
                                 "pt": 48, "weight": "Bold", "color": "#000000",
                                 "back": {"runs": []}},
                                {"text": "다라", "box": [20, 110, 360, 160],
                                 "pt": 48, "weight": "Bold", "color": "#FF0000",
                                 "back": {"runs": []}}])
    a = _drawn(block)
    assert _has(a, "#FF0000").sum() > 100, "둘째 줄이 제 색으로 안 찍혔다"


def test_warnings가_뒤_색_못_잰_줄을_말한다():
    slide = {"background": {"kind": "단색", "hex": "#FFFFFF", "cells": 90},
             "regions": [{"id": "t1", "kind": "글자", "box": [0, 0, 10, 10],
                          "text": {"color": "#000", "line_detail": [
                              {"box": [0, 0, 10, 10],
                               "back": {"runs": [], "fallback": True,
                                        "why": "무늬다"}}]}}]}
    got = " ".join(V.warnings(slide))
    assert "t1" in got and "무늬다" in got


# ---------------------------------------------------------------- 빈 줄과 줄별 값

def test_blank_lines_do_not_shift_per_line_detail():
    """`text` 에 빈 줄이 끼어도 줄별 값(`line_detail`)은 실제 줄과 짝지어진다.

    빈 줄은 `line_detail` 에 없다(글자가 없으니 잰 것도 없다). 글 줄 번호로
    그대로 찾으면 빈 줄 뒤부터 한 칸씩 밀려 엉뚱한 줄의 색·형광펜이 붙는다.
    """
    assert V.줄값짝(["가", "", "나", "다"], 3) == [0, None, 1, 2]
    assert V.줄값짝(["가", "나"], 2) == [0, 1]
    # 줄별 값이 모자라면 없는 것으로 — 죽지 않는다
    assert V.줄값짝(["가", "나", "다"], 2) == [0, 1, None]
