# -*- coding: utf-8 -*-
"""웹 문 `POST /ingest` — 인스타 주소 하나를 받아 «담김» 일을 건다.

채팅(`/chat`)의 담기 갈래와 같은 사슬이다. 다른 것은 뜻읽기가 없다는 것뿐 —
화면이 이미 주소만 따로 준다(사람 결정 2026-09-16, 채팅 페이지).
"""
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
os.environ.setdefault("BUCKET", "시험통")

import app  # noqa: E402


def _몸(답):
    return json.loads(답["body"])


def test_주소가_없으면_400이고_일을_안_건다(monkeypatch):
    걸린것 = []
    monkeypatch.setattr(app, "_일걸기", lambda e, 시킴, 무엇: 걸린것.append((시킴, 무엇)))
    답 = app.담기걸기({}, {"url": "그냥 글자"})
    assert 답["statusCode"] == 400
    assert "instagram.com/p/" in _몸(답)["why"]
    assert 걸린것 == []


def test_주소를_주면_코드만_뽑아_담김을_건다(monkeypatch):
    걸린것 = []

    def 가짜(e, 시킴, 무엇):
        걸린것.append((시킴, 무엇))
        return app._reply(202, {"job_id": "x", "status": "queued"})

    monkeypatch.setattr(app, "_일걸기", 가짜)
    답 = app.담기걸기({}, {"url": "https://www.instagram.com/p/DHqCBQnRAjW/?igsh=1"})
    assert 답["statusCode"] == 202
    assert 걸린것 == [({"코드": "DHqCBQnRAjW", "언어": ""}, "담김")]


def test_주소가_말_속에_섞여_있어도_꺼낸다(monkeypatch):
    걸린것 = []
    monkeypatch.setattr(app, "_일걸기", lambda e, 시킴, 무엇: (걸린것.append(시킴), app._reply(202, {}))[1])
    app.담기걸기({}, {"url": "이거요 https://www.instagram.com/p/ABC12345/ 담아줘"})
    assert 걸린것 == [{"코드": "ABC12345", "언어": ""}]
def test_언어를_같이_싣는다(monkeypatch):
    """**담김이 끝나면 람다가 「게시물을 담았습니다」를 써 보낸다.**

    안 실으면 그 한 줄만 한국어로 뜬다 — 「언어」가 만들기에서 당했던 그
    자리다(`app.만들기걸기` 주석). 여기서 못 박아 다음번엔 빨개진다.
    """
    걸린것 = []
    monkeypatch.setattr(app, "_일걸기",
                        lambda e, 시킴, 무엇: (걸린것.append(시킴), app._reply(202, {}))[1])
    app.담기걸기({}, {"url": "https://www.instagram.com/p/ABC12345/", "언어": "영어"})
    assert 걸린것[0]["언어"] == "영어"


def test_언어를_안_보내면_빈_글자다(monkeypatch):
    """옛 부르는 쪽이 그대로 돌아야 한다 — 분석 람다가 한국어로 떨어뜨린다."""
    걸린것 = []
    monkeypatch.setattr(app, "_일걸기",
                        lambda e, 시킴, 무엇: (걸린것.append(시킴), app._reply(202, {}))[1])
    app.담기걸기({}, {"url": "https://www.instagram.com/p/ABC12345/"})
    assert 걸린것[0]["언어"] == ""
