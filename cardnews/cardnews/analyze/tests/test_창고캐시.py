# -*- coding: utf-8 -*-
"""**한 번 만든 것은 두 번 안 만든다** — 창고에 담고 꺼내는 한 벌 (사람 지시 2026-09-24).

글자 읽기(`글자읽기`)·장식 오리기(`cutout`)·배경판(`merge_labeled`) 셋이 같은 일을
한다: 돈 드는 것을 부르기 «전» 에 창고를 보고, 없으면 부르고 담는다. 세 곳에 베끼면
한 곳만 고치는 사고가 나므로 여기 한 벌로 둔다.

**람다는 돌 때마다 디스크가 새로 생긴다.** 그래서 로컬이 아니라 창고(S3)에 담는다 —
`BUCKET` 이 없으면(로컬·시험) `config.DATA` 밑에 담는다.
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import config  # noqa: E402
import 창고캐시  # noqa: E402


@pytest.fixture(autouse=True)
def _로컬(monkeypatch, tmp_path):
    monkeypatch.delenv("BUCKET", raising=False)
    monkeypatch.setattr(config, "DATA", tmp_path)


def test_담은_것을_그대로_꺼낸다():
    창고캐시.글담기("가/나.json", {"ㄱ": 1, "ㄴ": "둘"})
    assert 창고캐시.글꺼내기("가/나.json") == {"ㄱ": 1, "ㄴ": "둘"}


def test_없으면_None():
    assert 창고캐시.글꺼내기("없는/것.json") is None
    assert 창고캐시.꺼내기("없는/것.png") is None


def test_바이트도_담고_꺼낸다():
    몸 = bytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0xFF, 0x00, 0x7F])
    창고캐시.담기("가/나.png", 몸)
    assert 창고캐시.꺼내기("가/나.png") == 몸


def test_열쇠는_좌표까지_담는다():
    """**이름(id)이 아니라 좌표로 가른다.** 사람이 네모를 옮겨도 이름은 그대로라,
    이름으로 가르면 옛날에 만든 엉뚱한 것을 꺼내 쓴다."""
    ㄱ = 창고캐시.열쇠("cut", "ABC", 1, [10, 20, 30, 40])
    ㄴ = 창고캐시.열쇠("cut", "ABC", 1, [10, 20, 30, 41])
    assert ㄱ != ㄴ
    assert 창고캐시.열쇠("cut", "ABC", 1, [10, 20, 30, 40]) == ㄱ      # 같은 값이면 같은 열쇠
    assert ㄱ.startswith("cut/ABC/")


def test_열쇠는_소수점이_흔들려도_같다():
    """좌표가 `100.0` 과 `100` 으로 오가도 같은 것이다 — 아니면 매번 다시 만든다."""
    assert (창고캐시.열쇠("cut", "A", 1, [100.0, 20, 30, 40])
            == 창고캐시.열쇠("cut", "A", 1, [100, 20, 30, 40]))


def test_담다_실패해도_안_죽는다(monkeypatch):
    """창고가 잠깐 안 되는 것과 분석이 죽는 것은 다른 일이다."""
    def 터짐(*a, **k):
        raise OSError("창고가 안 된다")

    monkeypatch.setattr(창고캐시, "담기", 터짐)
    창고캐시.담아두기("가/나.png", b"mu-eot")        # 예외가 안 나야 한다


def test_못_꺼내도_None_으로_넘어간다(monkeypatch):
    def 터짐(*a, **k):
        raise OSError("창고가 안 된다")

    monkeypatch.setattr(창고캐시, "_로컬읽기", 터짐)
    assert 창고캐시.꺼내기("가/나.png") is None
