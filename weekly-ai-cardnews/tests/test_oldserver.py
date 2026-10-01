# -*- coding: utf-8 -*-
import json

import pytest

import oldserver


def 가짜보내기(답들, 받은것):
    def f(방법, 길, 몸, 시간):
        받은것.append((방법, 길, json.loads(몸) if 몸 else None))
        return 답들.pop(0)
    return f


def test_장굽기는_Dify와_같은_몸통(monkeypatch):
    받은 = []
    monkeypatch.setattr(oldserver, "_보내기", 가짜보내기([(200, "abc123\n")], 받은))
    job = oldserver.장굽기({"no": 2, "media_url": "https://x/1.mp4", "gen": ""}, '{"canvas": {"w": 1080}}')
    assert job == "abc123"
    assert 받은 == [("POST", "/render/slide", {"slide": {"no": 2, "media_url": "https://x/1.mp4", "gen": ""},
                                            "url": "https://x/1.mp4", "gen": "",
                                            "template": {"canvas": {"w": 1080}}})]


def test_소식긁기_몸통(monkeypatch):
    받은 = []
    monkeypatch.setattr(oldserver, "_보내기", 가짜보내기([(200, "job9")], 받은))
    assert oldserver.소식긁기("9월 3주차", "2026") == "job9"
    assert 받은 == [("POST", "/procure/week", {"라벨": "9월 3주차", "해": 2026})]


def test_번호표는_기다리지_않고_묻는다(monkeypatch):
    받은 = []
    monkeypatch.setattr(oldserver, "_보내기", 가짜보내기([(200, '{"state": "굽는 중", "done": false}')], 받은))
    assert oldserver.번호표("j1") == {"state": "굽는 중", "done": False}
    assert 받은[0][:2] == ("GET", "/render/compose/j1?wait=0")


def test_429는_쉬고_다시(monkeypatch):
    쉰 = []
    monkeypatch.setattr(oldserver, "_보내기",
                        가짜보내기([(429, "slow"), (503, ""), (200, '{"state": "됨", "done": true}')], []))
    글 = oldserver.부르기("GET", "/render/compose/x?wait=0", 잠자기=쉰.append)
    assert json.loads(글)["done"] is True and 쉰 == [5, 15]


def test_400은_바로_탈(monkeypatch):
    monkeypatch.setattr(oldserver, "_보내기", 가짜보내기([(400, "bad")], []))
    with pytest.raises(oldserver.옛서버탈) as e:
        oldserver.부르기("POST", "/viewer", {}, 잠자기=lambda s: None)
    assert e.value.상태 == 400


def test_네번_다_끊기면_탈(monkeypatch):
    monkeypatch.setattr(oldserver, "_보내기", 가짜보내기([(0, "timed out")] * 4, []))
    with pytest.raises(oldserver.옛서버탈):
        oldserver.부르기("GET", "/x", 잠자기=lambda s: None)
