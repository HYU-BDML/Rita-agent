# -*- coding: utf-8 -*-
"""**한 번 뜬 배경판은 두 번 안 뜬다** (사람 지시 2026-09-24).

배경판은 한 장에 $0.05 다. 게시물에 종이가 두 종류면 두 장이라 재분석 한 번에
**$0.05~0.15** 가 나갔다 — 라벨을 하나도 안 건드렸어도.

열쇠는 **«무엇을 넣어 떴나»** 다: 게시물·고른 장·**그 장의 라벨 네모들**·캔버스 크기.
라벨이 그대로면 꺼내 쓰고, 하나라도 옮기면 다시 뜬다.
"""
import io
import json
import sys
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import config  # noqa: E402
import gpt누끼  # noqa: E402
import gpt바닥판  # noqa: E402
import merge_labeled  # noqa: E402
import 창고캐시  # noqa: E402


def _장(index, 덮음=0.1, 색=(241, 255, 229), 배경사진=False):
    img = np.full((600, 480, 3), 색, np.uint8)
    변 = int((480 * 600 * 덮음) ** 0.5)
    return {"index": index, "배경사진": 배경사진, "w": 480, "h": 600, "img": img,
            "bg": {"hex": "#F1FFE5"},
            "네모들": [("글자", [0, 0, 변, 변])]}


def _센다(monkeypatch):
    셈 = {"수": 0}

    def 가짜만들기(img, 네모들, 크기, 부르기=None):
        셈["수"] += 1
        b = io.BytesIO()
        Image.new("RGB", 크기, (240, 250, 230)).save(b, "PNG")
        return b.getvalue()

    monkeypatch.setattr(gpt바닥판, "만들기", 가짜만들기)
    return 셈


@pytest.fixture(autouse=True)
def _로컬(monkeypatch, tmp_path):
    monkeypatch.delenv("BUCKET", raising=False)
    monkeypatch.setattr(config, "DATA", tmp_path)
    monkeypatch.setattr(gpt누끼, "있나", lambda: True)


_장들 = [_장(1, 0.5), _장(2, 0.1), _장(3, 0.2), _장(4, 0.6)]


def test_같은_게시물을_두_번_분석하면_한_번만_뜬다(monkeypatch, tmp_path):
    셈 = _센다(monkeypatch)
    첫 = merge_labeled.GPT바닥판("ABC", _장들)
    둘 = merge_labeled.GPT바닥판("ABC", _장들)
    assert 셈["수"] == 1, "두 번째는 창고에서 꺼내 써야 한다"
    assert [m["판"] for m in 둘] == [m["판"] for m in 첫]
    assert 둘 and 둘[0]["깐것"] is not None


def test_라벨을_옮기면_다시_뜬다(monkeypatch, tmp_path):
    셈 = _센다(monkeypatch)
    merge_labeled.GPT바닥판("ABC", _장들)
    바뀐것 = [dict(s) for s in _장들]
    바뀐것[1] = {**바뀐것[1], "네모들": [("글자", [0, 0, 200, 200])]}
    merge_labeled.GPT바닥판("ABC", 바뀐것)
    assert 셈["수"] == 2


def test_게시물이_다르면_따로_뜬다(monkeypatch, tmp_path):
    셈 = _센다(monkeypatch)
    merge_labeled.GPT바닥판("ABC", _장들)
    merge_labeled.GPT바닥판("DEF", _장들)
    assert 셈["수"] == 2


def test_꺼내_쓸_때도_판_PNG_가_제자리에_있다(monkeypatch, tmp_path):
    """람다가 그 PNG 를 창고로 올린다(`lambda_분석._배경판올리기`) — 꺼내 쓰느라
    안 만들어 놓으면 「배경판이 없다」로 빠진다."""
    _센다(monkeypatch)
    첫 = merge_labeled.GPT바닥판("ABC", _장들)
    자리 = Path(config.DATA) / "배경판" / 첫[0]["판"]
    자리.unlink()
    merge_labeled.GPT바닥판("ABC", _장들)
    assert 자리.exists(), "꺼내 쓸 때 판을 제자리에 되살려야 한다"


def test_뜨다_실패한_것은_창고에_안_담는다(monkeypatch, tmp_path):
    """실패를 담아 두면 다음 판에도 영영 실패로 나온다."""
    셈 = {"수": 0}

    def 터짐(*a, **k):
        셈["수"] += 1
        raise RuntimeError("fal 실패")

    monkeypatch.setattr(gpt바닥판, "만들기", 터짐)
    assert merge_labeled.GPT바닥판("ABC", _장들) == []
    assert merge_labeled.GPT바닥판("ABC", _장들) == []
    assert 셈["수"] == 2, "실패한 것은 다시 해 봐야 한다"


def test_만드는_법이_바뀌면_열쇠도_바뀐다():
    """바닥판 캐시는 «완성된 판» 을 담는다. 2026-09-28 에 만드는 법(라벨 밖 되돌리기)이
    바뀌었는데 열쇠가 그대로면 옛 판이 꺼내져 새 코드가 영영 안 돈다. 세대 표시를
    열쇠 재료에 넣어, 법이 바뀔 때마다 표시를 올리면 다시 뜬다."""
    import 창고캐시
    옛 = 창고캐시.열쇠(merge_labeled.바닥판캐시칸, "ABC", 2, [("글자", [1, 2, 3, 4])], 1080, 1350)
    지금 = merge_labeled.바닥판열쇠("ABC", 2, [("글자", [1, 2, 3, 4])], 1080, 1350)
    assert 지금 != 옛, "세대 표시가 열쇠에 안 들어갔다"
    assert merge_labeled.바닥판세대, "세대 표시는 빈 글자가 아니어야 한다"
