# -*- coding: utf-8 -*-
import pytest

import deepseek


@pytest.fixture(autouse=True)
def 열쇠(monkeypatch):
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key")


def test_보이는_글과_토큰_수를_돌려준다(monkeypatch):
    받은 = []

    def 보내기(몸, 시간):
        받은.append((dict(몸), 시간))
        return {"choices": [{"message": {"content": '  {"꼭지": []}  ', "reasoning_content": "생각…"},
                             "finish_reason": "stop"}],
                "usage": {"prompt_tokens": 1200, "prompt_cache_hit_tokens": 800, "completion_tokens": 9000,
                          "completion_tokens_details": {"reasoning_tokens": 7000}}}

    monkeypatch.setattr(deepseek, "_보내기", 보내기)
    답 = deepseek.한번("시", "사", 32000)
    assert 답["글"] == '{"꼭지": []}' and 답["넘침"] is False
    assert (답["입력토큰"], 답["캐시토큰"], 답["출력토큰"], 답["생각토큰"]) == (1200, 800, 9000, 7000)
    몸, 시간 = 받은[0]
    assert 몸["model"] == "deepseek-v4-pro" and 몸["max_tokens"] == 32000 and 시간 == 780
    assert "temperature" not in 몸  # Dify 판과 같게 — 온도를 따로 안 준다


def test_생각하다_넘치면_넘침이라고만_하고_다시_안_건다(monkeypatch):
    횟수 = []

    def 보내기(몸, 시간):
        횟수.append(몸["max_tokens"])
        return {"choices": [{"message": {"content": ""}, "finish_reason": "length"}]}

    monkeypatch.setattr(deepseek, "_보내기", 보내기)
    답 = deepseek.한번("시", "사", 64000)
    assert 답["넘침"] is True and 횟수 == [64000]


def test_답이_중간에_잘려도_넘침이다(monkeypatch):
    monkeypatch.setattr(deepseek, "_보내기", lambda 몸, 시간: {
        "choices": [{"message": {"content": "1. 첫 꼭지 … 2. 둘째 꼭"}, "finish_reason": "length"}]})
    assert deepseek.한번("시", "사", 32000)["넘침"] is True


def test_잔액부족은_다시_안_건다(monkeypatch):
    횟수 = []

    def 보내기(몸, 시간):
        횟수.append(1)
        raise deepseek.모델탈("402", "딥시크 잔액 부족")

    monkeypatch.setattr(deepseek, "_보내기", 보내기)
    with pytest.raises(deepseek.모델탈, match="잔액"):
        deepseek.한번("시", "사", 32000, 잠자기=lambda s: None)
    assert len(횟수) == 1


def test_시간_초과는_다시_안_건다(monkeypatch):
    횟수 = []

    def 보내기(몸, 시간):
        횟수.append(1)
        raise deepseek.모델탈("timeout", "timed out")

    monkeypatch.setattr(deepseek, "_보내기", 보내기)
    with pytest.raises(deepseek.모델탈, match="timeout"):
        deepseek.한번("시", "사", 32000, 잠자기=lambda s: None)
    assert len(횟수) == 1


def test_503은_쉬고_다시(monkeypatch):
    답들 = [deepseek.모델탈("503", ""), {"choices": [{"message": {"content": "좋다"}}]}]

    def 보내기(몸, 시간):
        x = 답들.pop(0)
        if isinstance(x, Exception):
            raise x
        return x

    쉰 = []
    monkeypatch.setattr(deepseek, "_보내기", 보내기)
    assert deepseek.한번("시", "사", 32000, 잠자기=쉰.append)["글"] == "좋다" and 쉰 == [5]


def test_빈_답은_탈(monkeypatch):
    monkeypatch.setattr(deepseek, "_보내기", lambda 몸, 시간: {"choices": [{"message": {"content": ""},
                                                                          "finish_reason": "stop"}]})
    with pytest.raises(deepseek.모델탈, match="빈 답"):
        deepseek.한번("시", "사", 32000)


def test_열쇠가_없으면_부르지도_않는다(monkeypatch):
    monkeypatch.delenv("DEEPSEEK_API_KEY")
    with pytest.raises(deepseek.모델탈, match="no_api_key"):
        deepseek.한번("시", "사", 32000)
