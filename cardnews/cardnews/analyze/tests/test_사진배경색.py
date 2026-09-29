# -*- coding: utf-8 -*-
"""**사진 배경은 색 하나만 빌린다.**

사진 배경인 장의 배경판에는 «뺀 나머지» 가 아니라 **원본 사진 그 자체** 가 들어
있다 — 사람은 배경으로 깔린 사진에 네모를 안 긋기 때문이다. 그 판을 실으면 우리가
만든 카드뉴스마다 남의 게시물 사진이 표지로 나온다(실물 2026-08-31,
DSW-6lrk5rs 1번 장: 판이 79.6% 불투명, 원본 인형 사진과 남의 로고가 통째로).

그래서 판을 안 싣는다. 대신 **사진의 평균색 하나** 를 잰다 — 그러면 원본이 정해 준
글자 대비가 그대로 살고, 남의 사진은 안 쓴다.
"""
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))

import merge_labeled as M  # noqa: E402
import tint  # noqa: E402


def _사진판(w=1080, h=1350):
    """반은 아주 어둡고 반은 조금 밝은 그림 — 사진으로 판정되도록 잡음을 섞는다."""
    씨 = np.random.default_rng(20260831)
    rgb = 씨.integers(0, 90, (h, w, 3), dtype=np.uint8)
    rgb[: h // 2] = 씨.integers(150, 240, (h // 2, w, 3), dtype=np.uint8)
    return rgb


# ── 평균색 ────────────────────────────────────────────────────────

def test_평균색은_두_덩이의_가운데다():
    """최빈색은 한 덩이로 쏠린다 — 사진을 대신할 색은 «눈이 뭉뚱그려 보는 밝기» 다."""
    rgb = np.zeros((100, 100, 3), np.uint8)
    rgb[:50] = 200
    assert tint.mean(rgb) == "#646464", tint.mean(rgb)
    assert tint.dominant(rgb) in ("#000000", "#C8C8C8"), tint.dominant(rgb)


def test_잴_화소가_없으면_검정이다():
    rgb = np.full((10, 10, 3), 200, np.uint8)
    assert tint.mean(rgb, np.zeros((10, 10), bool)) == "#000000"


# ── 배경 판정이 그 색을 같이 낸다 ──────────────────────────────────

def test_사진_배경은_빈자리색을_같이_잰다():
    난것 = M.background(_사진판(), [])
    assert 난것["kind"] == "사진", 난것
    assert 난것["빈자리색"].startswith("#") and len(난것["빈자리색"]) == 7


def test_사람이_사진이라_못_박아도_잰다():
    """흐릿한 하늘처럼 «거의 한 색인 사진» 은 기계가 단색으로 본다 — 사람이
    못 박은 뒤에도 깔 색이 있어야 한다."""
    rgb = np.full((1350, 1080, 3), 70, np.uint8)
    난것 = M.background(rgb, [], 사람말=True)
    assert 난것["kind"] == "사진" and 난것["by"] == "사람"
    assert 난것["빈자리색"] == "#464646", 난것


def test_사진이_아닌_배경엔_안_붙는다():
    """단색·그라데이션은 hex 로 그린다 — 쓰지도 않을 값을 틀에 싣지 않는다."""
    rgb = np.full((1350, 1080, 3), 255, np.uint8)
    난것 = M.background(rgb, [])
    assert 난것["kind"] == "단색"
    assert "빈자리색" not in 난것, 난것
