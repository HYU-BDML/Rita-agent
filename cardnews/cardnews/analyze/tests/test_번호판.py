# -*- coding: utf-8 -*-
"""장 번호 «번호판» — 배지를 떼어 숫자를 지우고 다시 찍을 도장으로 만든다.

사람 결정 2026-09-19. 장마다 숫자를 찾던 길은 두 경우 다 깨졌다 — 장식으로 그으면
숫자가 그림에 박히고(DSW 「01」), 안 그으면 흰 글자가 흰 종이에 찍혔다(DbkuOn 「05」).
"""
import io
import sys
from pathlib import Path

import numpy as np
import pytest
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))

import 번호판 as P  # noqa: E402

글꼴파일 = HERE.parent / "render" / "fonts" / "Pretendard-Bold.otf"
pytestmark = pytest.mark.skipif(not 글꼴파일.exists(), reason="프리텐다드 굵게 파일이 없다")

파랑 = (91, 143, 245)


def _배지그림(글="01", pt=60, 알갱이=True):
    """흰 종이 위 파란 원 배지, 그 안에 흰 숫자. 실물(DSW 반원)의 모양이다."""
    im = Image.new("RGB", (400, 400), (255, 255, 255))
    d = ImageDraw.Draw(im)
    d.ellipse((80, 80, 320, 320), fill=파랑)
    if 알갱이:
        rng = np.random.default_rng(3)
        for x, y in rng.integers(85, 315, (120, 2)):
            if (x - 200) ** 2 + (y - 200) ** 2 < 118 ** 2:
                d.point((int(x), int(y)), fill=(150, 170, 230))
    font = ImageFont.truetype(str(글꼴파일), pt)
    l, t, r, b = d.textbbox((0, 0), 글, font=font)
    x, y = 200 - (l + r) / 2, 200 - (t + b) / 2
    d.text((x, y), 글, fill=(255, 255, 255), font=font)
    글자네모 = [x + l, y + t, x + r, y + b]
    return np.asarray(im), 글자네모


def _원안(alpha_shape, 반지름=110):
    h, w = alpha_shape
    yy, xx = np.mgrid[:h, :w]
    return (xx - w / 2) ** 2 + (yy - h / 2) ** 2 < 반지름 ** 2


def test_배지를_떼고_숫자를_지운다():
    img, 글자네모 = _배지그림("01")
    난 = P.만들기(img, [60, 60, 340, 340], 글자네모들=[글자네모], 글="01", 글꼴="프리텐다드", 굵기="Bold")
    assert 난 is not None
    png = Image.open(io.BytesIO(난["png"])).convert("RGBA")
    a = np.asarray(png)
    rgb, alpha = a[:, :, :3], a[:, :, 3]
    # 원 밖(네모 귀퉁이)은 투명하다
    assert alpha[2, 2] == 0 and alpha[-3, -3] == 0
    # 원 안에 흰 획이 남아 있지 않다 — 숫자를 지웠다
    # 숫자 자리가 구멍으로 남지도 않았다 — 원 안은 전부 불투명하다
    assert (alpha[_원안(alpha.shape, 100)] > 250).all()
    안 = _원안(alpha.shape, 100) & (alpha > 250)
    흰 = (rgb[안].min(axis=1) > 230).mean()
    assert 흰 < 0.002, f"흰 픽셀이 {흰*100:.2f}% 남았다"
    assert 난["숫자있음"] is True
    assert 난["배지색"].upper() == "#5B8FF5"


def test_가장자리에_종이_흰색이_안_남는다():
    img, 글자네모 = _배지그림("01")
    난 = P.만들기(img, [60, 60, 340, 340], 글자네모들=[글자네모], 글="01", 글꼴="프리텐다드", 굵기="Bold")
    a = np.asarray(Image.open(io.BytesIO(난["png"])).convert("RGBA"))
    rgb, alpha = a[:, :, :3].astype(int), a[:, :, 3]
    테 = (alpha > 0) & (alpha < 250)
    if 테.any():
        차이 = np.abs(rgb[테] - np.array(파랑)).sum(axis=1)
        assert 차이.max() < 60, "반투명 가장자리 픽셀에 종이 색이 섞여 있다"


def test_숫자의_자리와_크기를_잰다():
    img, 글자네모 = _배지그림("01", pt=60)
    난 = P.만들기(img, [60, 60, 340, 340], 글자네모들=[글자네모], 글="01", 글꼴="프리텐다드", 굵기="Bold")
    숫 = 난["숫자"]
    assert 숫["본보기"] == "01"
    assert abs(숫["중심"][0] - 0.5) < 0.05 and abs(숫["중심"][1] - 0.5) < 0.05
    assert 50 <= 숫["pt"] <= 70, 숫["pt"]                  # 60pt 로 그렸다
    assert 숫["글자색"].upper() in ("#FFFFFF", "#FEFEFE", "#FDFDFD")


def test_글자_네모가_없어도_숫자를_스스로_찾는다():
    """Vision 이 못 읽어도 «테두리에 안 닿고 알갱이보다 큰 덩이» 를 숫자로 본다."""
    img, _ = _배지그림("07")
    난 = P.만들기(img, [60, 60, 340, 340], 글="", 글꼴="프리텐다드", 굵기="Bold")
    assert 난["숫자있음"] is True
    assert abs(난["숫자"]["중심"][0] - 0.5) < 0.06


def test_숫자가_없는_배지도_도장이_된다():
    img, _ = _배지그림("", 알갱이=False)
    난 = P.만들기(img, [60, 60, 340, 340], 글꼴="프리텐다드", 굵기="Bold")
    assert 난 is not None and 난["숫자있음"] is False
    assert 난["숫자"]["중심"] == [0.5, 0.5] and 난["숫자"]["pt"] is None


def test_못_떼면_None():
    img = np.full((200, 200, 3), 255, np.uint8)          # 아무것도 없는 종이
    assert P.만들기(img, [20, 20, 180, 180]) is None
