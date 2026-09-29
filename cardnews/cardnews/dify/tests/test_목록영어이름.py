# -*- coding: utf-8 -*-
"""목록이 «이름영어» 를 나른다.

**실물 2026-09-19.** 틀 열 개에 영어 이름을 넣었는데 화면에는 그대로 한국어가
나왔다. **채팅은 틀 파일이 아니라 목록을 본다**(`deps.틀읽기` →
`templates/목록.json`). 목록을 짓는 이 함수가 그 칸을 몰라 빠뜨렸다.

목록은 분석을 새로 돌릴 때마다 틀에서 **다시 만들어진다**(`lambda_분석` 이
`목록만들기` 를 부른다). 그래서 목록 파일을 손으로 고쳐도 다음 분석 때
사라진다 — 여기를 고쳐야 근본이 된다.
"""
import io
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "dify"))
sys.path.insert(0, str(ROOT / "render"))

import make_dsl_cardnews as 틀만들기  # noqa: E402


def _틀쓰기(터, 코드, **덧):
    틀 = {"코드": 코드, "이름": f"{코드} 이름", "슬라이드": [{"역할": "훅"}],
         "캔버스": {"w": 1080, "h": 1350}}
    틀.update(덧)
    io.open(터 / f"{코드}.json", "w", encoding="utf-8").write(
        json.dumps(틀, ensure_ascii=False))


def test_영어_이름이_목록에_실린다(tmp_path):
    _틀쓰기(tmp_path, "AAA", 이름영어="Idol Branding")
    줄들 = 틀만들기.목록만들기(tmp_path)
    assert 줄들[0]["이름영어"] == "Idol Branding"


def test_영어_이름이_없으면_그_칸도_없다(tmp_path):
    """**빈 글자를 넣지 않는다.** 보일이름(`web/server/chat.js`)이 빈 글자를
    «영어 이름이 있다»로 오해하면 안 되고, 없는 칸이면 한국어로 물러선다."""
    _틀쓰기(tmp_path, "BBB")
    줄들 = 틀만들기.목록만들기(tmp_path)
    assert "이름영어" not in 줄들[0]


def test_빈_영어_이름도_안_싣는다(tmp_path):
    _틀쓰기(tmp_path, "CCC", 이름영어="   ")
    줄들 = 틀만들기.목록만들기(tmp_path)
    assert "이름영어" not in 줄들[0]


def test_한국어_이름은_그대로다(tmp_path):
    _틀쓰기(tmp_path, "DDD", 이름영어="Retail Trends")
    줄들 = 틀만들기.목록만들기(tmp_path)
    assert 줄들[0]["이름"] == "DDD 이름"
