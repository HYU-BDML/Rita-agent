# -*- coding: utf-8 -*-
import json

import pytest

import deepseek


@pytest.fixture(autouse=True)
def 열쇠(monkeypatch):
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key")


def _답(message, finish="tool_calls", usage=None):
    return {"choices": [{"message": message, "finish_reason": finish}],
            "usage": usage or {"prompt_tokens": 5000, "prompt_cache_hit_tokens": 4000, "completion_tokens": 900,
                               "completion_tokens_details": {"reasoning_tokens": 700}}}


def test_도구를_부르면_생각글과_호출을_그대로_되돌릴_메시지로_준다(monkeypatch):
    받은 = []
    호출 = [{"id": "call_1", "type": "function",
            "function": {"name": "x_search", "arguments": json.dumps({"query": "CORTIS"})}}]
    monkeypatch.setattr(deepseek, "_보내기", lambda 몸, 시간: 받은.append((몸, 시간)) or _답(
        {"content": "", "reasoning_content": "먼저 넓게…", "tool_calls": 호출}))
    도구 = [{"type": "function", "function": {"name": "x_search", "parameters": {"type": "object"}}}]
    답 = deepseek.도구대화([{"role": "user", "content": "시작"}], 32000, 도구들=도구)
    몸, 시간 = 받은[0]
    assert 몸["model"] == "deepseek-v4-pro" and 몸["tools"] == 도구 and 몸["max_tokens"] == 32000 and 시간 == 300
    assert "thinking" not in 몸  # 생각 모드는 안 싣는 것이 켜는 것
    assert 답["메시지"] == {"role": "assistant", "content": "", "reasoning_content": "먼저 넓게…", "tool_calls": 호출}
    assert 답["도구호출"] == [{"id": "call_1", "이름": "x_search", "인자": {"query": "CORTIS"}, "인자탈": ""}]
    assert (답["입력토큰"], 답["캐시토큰"], 답["출력토큰"], 답["생각토큰"]) == (5000, 4000, 900, 700)
    assert 답["넘침"] is False and 답["모델"] == "deepseek-v4-pro"


def test_생각을_끄면_thinking_disabled_를_싣고_flash_로_보낸다(monkeypatch):
    받은 = []
    monkeypatch.setattr(deepseek, "_보내기", lambda 몸, 시간: 받은.append(몸) or _답(
        {"content": '{"판정": "받쳐줌"}'}, "stop"))
    답 = deepseek.도구대화([{"role": "user", "content": "판정"}], 300, 모델=deepseek.MODEL_빠름, 생각=False)
    assert 받은[0]["model"] == "deepseek-flash" and 받은[0]["thinking"] == {"type": "disabled"}
    assert "tools" not in 받은[0] and 답["글"] == '{"판정": "받쳐줌"}' and 답["도구호출"] == []


def test_인자가_JSON_이_아니면_인자탈로_적는다(monkeypatch):
    monkeypatch.setattr(deepseek, "_보내기", lambda 몸, 시간: _답({"content": "", "tool_calls": [
        {"id": "c", "type": "function", "function": {"name": "read_page", "arguments": "{주소: 없음"}}]}))
    호출 = deepseek.도구대화([], 1000)["도구호출"][0]
    assert 호출["인자"] == {} and "JSON" in 호출["인자탈"]


def test_넘치면_넘침이고_빈_답은_탈(monkeypatch):
    monkeypatch.setattr(deepseek, "_보내기", lambda 몸, 시간: _답({"content": ""}, "length"))
    assert deepseek.도구대화([], 1000)["넘침"] is True
    monkeypatch.setattr(deepseek, "_보내기", lambda 몸, 시간: _답({"content": ""}, "stop"))
    with pytest.raises(deepseek.모델탈, match="빈 답"):
        deepseek.도구대화([], 1000)


def test_503은_쉬고_다시_시간초과는_안_건다(monkeypatch):
    답들 = [deepseek.모델탈("503", ""), _답({"content": "좋다"}, "stop")]

    def 보내기(몸, 시간):
        x = 답들.pop(0)
        if isinstance(x, Exception):
            raise x
        return x

    쉰 = []
    monkeypatch.setattr(deepseek, "_보내기", 보내기)
    assert deepseek.도구대화([], 1000, 잠자기=쉰.append)["글"] == "좋다" and 쉰 == [5]
    monkeypatch.setattr(deepseek, "_보내기", lambda 몸, 시간: (_ for _ in ()).throw(deepseek.모델탈("timeout", "")))
    with pytest.raises(deepseek.모델탈, match="timeout"):
        deepseek.도구대화([], 1000, 잠자기=쉰.append)


def test_열쇠가_없으면_안_부른다(monkeypatch):
    monkeypatch.delenv("DEEPSEEK_API_KEY")
    with pytest.raises(deepseek.모델탈, match="no_api_key"):
        deepseek.도구대화([], 1000)


def test_잔액은_달러만_읽고_못_읽으면_None(monkeypatch):
    monkeypatch.setattr(deepseek, "_받기", lambda 길, 시간: {"is_available": True, "balance_infos": [
        {"currency": "CNY", "total_balance": "10.00"}, {"currency": "USD", "total_balance": "56.07"}]})
    assert deepseek.잔액() == 56.07
    monkeypatch.setattr(deepseek, "_받기", lambda 길, 시간: (_ for _ in ()).throw(OSError("끊김")))
    assert deepseek.잔액() is None


def test_온도를_주면_temperature_를_싣고_안_주면_안_싣는다(monkeypatch):
    # 판정관이 같은 질문에 «받쳐줌»·«모자람» 을 오갔다(판 3, 2026-10-01) — 판정은 흔들림 0 으로
    받은 = []
    monkeypatch.setattr(deepseek, "_보내기", lambda 몸, 시간: 받은.append(몸) or _답({"content": "{}"}, "stop"))
    deepseek.도구대화([{"role": "user", "content": "판정"}], 300, 모델=deepseek.MODEL_빠름, 생각=False, 온도=0)
    deepseek.도구대화([{"role": "user", "content": "지휘"}], 300)
    assert 받은[0]["temperature"] == 0 and "temperature" not in 받은[1]
