# -*- coding: utf-8 -*-
from datetime import datetime, timedelta, timezone

import pytest

from topic.budget import 예산, 지문

시작 = datetime(2026, 10, 1, 3, 0, tzinfo=timezone.utc)
한도 = {"호출": 50, "돈": 2.0, "분": 40}


def 만들기(분=0, 호출=0, 돈=0.0, 도구="x_search"):
    재료 = {"아피파이기록": [{"돈": 돈}] if 돈 else []}
    판 = 예산(한도, 재료, 시작, lambda: 시작 + timedelta(minutes=분))
    for i in range(호출):
        판.적기({"도구": 도구, "지문": f"f{i}", "요약": "", "증거": [], "새것": 0, "돈": 0})
    return 판


def test_남은_양_한_줄():
    판 = 만들기(분=9, 돈=0.42)
    판.적기({"도구": "x_search", "지문": "a", "증거": [], "새것": 0})
    판.적기({"도구": "web_search", "지문": "b", "증거": [], "새것": 0})
    assert 판.한줄() == "[남은 예산] 도구 2/50번 (X 검색 1 · 웹 1) · 돈 $0.42/$2.00 · 31분 남음"


@pytest.mark.parametrize("kw, 상태", [({}, "여유"), ({"호출": 45}, "정리"), ({"호출": 50}, "끝"),
                                     ({"돈": 1.8}, "정리"), ({"분": 36}, "정리"), ({"분": 41}, "끝")])
def test_90에_정리_100에_끝(kw, 상태):
    판 = 만들기(**kw)
    assert 판.상태() == 상태
    if 상태 != "여유":
        assert ("submit_result" in 판.한줄())


def test_지문은_인자_순서와_상관없고_했나로_찾는다():
    assert 지문("x_search", {"query": "a", "count": 20}) == 지문("x_search", {"count": 20, "query": "a"})
    assert 지문("x_search", {"query": "a"}) != 지문("x_search", {"query": "b"})
    판 = 만들기()
    판.적기({"도구": "x_search", "지문": 지문("x_search", {"query": "a"}), "증거": ["E1"], "새것": 1})
    assert 판.했나(지문("x_search", {"query": "a"}))["증거"] == ["E1"] and 판.했나("없다") is None


def test_새로_나오는_게_두번_연속_20퍼센트_아래면_경고():
    판 = 만들기()
    for 새것 in (1, 1):
        판.적기({"도구": "x_search", "지문": str(새것), "증거": [f"E{i}" for i in range(10)], "새것": 새것})
    assert 판.경고() == ["X 검색에서 새로 나오는 게 두 번 연속 20% 아래 — 다른 출처로 옮겨라"]
    판.적기({"도구": "x_search", "지문": "z", "증거": ["E1", "E2"], "새것": 2})
    assert 판.경고() == []
