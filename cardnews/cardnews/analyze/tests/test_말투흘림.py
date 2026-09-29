# -*- coding: utf-8 -*-
"""말투 판정이 실패했을 때 **얼마나 잃나**.

여태 여기가 탈을 통째로 삼키고 전부 「미정」을 냈다. 그러면 틀의 골격이 통째로
미정이 되어 **그 틀로는 카드를 한 장도 못 만든다** — 「서랍에 훅도, 대신 쓸
것도 하나도 없다」로 멈춘다(실물 2026-08-27, 키키 8장).

사람이 「디자인·말투」 둘로 고르게 할 참이라, 이 자리는 이제 곁다리가 아니다.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import tone_labeled as 말투  # noqa: E402
import 대본짓기  # noqa: E402


def _깔기(monkeypatch, 낼것):
    def 부르기(시스템, 사용자, **_):
        if isinstance(낼것, Exception):
            raise 낼것
        return 낼것
    monkeypatch.setattr(대본짓기, "부르기", 부르기)


def _답글(n):
    return json.dumps({"post_type": "정보", "hook_strategy": "궁금증유발",
                       "slides": [{"index": i + 1, "role": "훅" if i == 0 else "사례",
                                   "humor": "보통", "respect": "보통",
                                   "enthusiasm": "보통"} for i in range(n)]},
                      ensure_ascii=False)


def test_잘_오면_그대로_쓴다(monkeypatch):
    _깔기(monkeypatch, _답글(3))
    난것 = 말투.ask("x", ["가", "나", "다"])
    assert [s["role"] for s in 난것["slides"]] == ["훅", "사례", "사례"]


def test_모자라게_와도_온_만큼은_쓴다(monkeypatch):
    """다 버리면 그 틀로 카드를 한 장도 못 만든다."""
    _깔기(monkeypatch, _답글(2))
    난것 = 말투.ask("x", ["가", "나", "다"])
    assert [s["role"] for s in 난것["slides"]] == ["훅", "사례", "미정"]


def test_넘치게_오면_자른다(monkeypatch):
    _깔기(monkeypatch, _답글(5))
    assert len(말투.ask("x", ["가", "나"])["slides"]) == 2


def test_터지면_이유를_자국에_남긴다(monkeypatch, capsys):
    """여태 말없이 삼켜서 왜 미정인지 알 길이 없었다."""
    _깔기(monkeypatch, RuntimeError("연결이 끊겼다"))
    assert 말투.ask("x", ["가"])["slides"][0]["role"] == "미정"
    찍힌것 = capsys.readouterr().out
    assert "말투 판정 실패" in 찍힌것 and "연결이 끊겼다" in 찍힌것


def test_빈_답이_와도_안_죽는다(monkeypatch, capsys):
    """딥시크가 실제로 그랬다 — 여덟 장짜리 요청에 빈 답을 줬다."""
    _깔기(monkeypatch, "")
    assert 말투.ask("x", ["가"])["slides"][0]["role"] == "미정"
    assert "말투 판정 실패" in capsys.readouterr().out


def test_장이_많으면_토큰을_더_준다(monkeypatch):
    """모자라면 답이 중간에 끊겨 JSON 이 깨진다 — 빈 답 탈의 뿌리다."""
    본것 = {}

    def 부르기(시스템, 사용자, 최대토큰=0, **_):
        본것["토큰"] = 최대토큰
        return _답글(8)
    monkeypatch.setattr(대본짓기, "부르기", 부르기)
    말투.ask("x", ["가"] * 8)
    assert 본것["토큰"] >= 1600


def test_장이_없으면_모델을_안_부른다(monkeypatch):
    def 부르기(*a, **k):
        raise AssertionError("부르면 안 된다")
    monkeypatch.setattr(대본짓기, "부르기", 부르기)
    assert 말투.ask("x", [])["slides"] == []
