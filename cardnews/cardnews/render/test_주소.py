# -*- coding: utf-8 -*-
"""주소 다듬기 — **한 벌뿐이어야 한다.**

같은 탈이 2026-08-29 하루에 두 번 났다(목록 그림, 배경판). 두 벌이 있으면
언젠가 갈리므로, 여기서는 셈뿐 아니라 «한 벌인지» 도 못 박는다.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import cardnews_compose as cc   # noqa: E402
import rita                     # noqa: E402
import 주소                      # noqa: E402

_한글 = ("https://cardnews-render-554608989606.s3.ap-northeast-2.amazonaws.com/"
       "배경판/DYWiVHhlNwo/03.png")


def test_한글을_퍼센트로_바꾼다():
    난것 = 주소.다듬기(_한글)
    assert 난것.isascii(), 난것
    assert 난것.endswith("/DYWiVHhlNwo/03.png")


def test_아스키는_한_글자도_안_바꾼다():
    for 맨것 in ("https://x.example/a/b.png",
               "https://x.example/a?v=2&w=3",
               "https://x.example/a%20b.png"):
        assert 주소.다듬기(맨것) == 맨것, 맨것


def test_빈_것도_안_터진다():
    assert 주소.다듬기("") == ""
    assert 주소.다듬기(None) == ""
    assert 주소.다듬기(123) == ""


def test_이미_다듬은_것을_또_다듬어도_같다():
    한번 = 주소.다듬기(_한글)
    assert 주소.다듬기(한번) == 한번, "두 번 다듬으면 %가 %25 로 부푼다"


def test_부르는_셋이_같은_한_벌을_쓴다():
    """**여기가 이 시험의 핵심이다.** 두 벌이 되는 순간 깨진다."""
    assert rita.주소다듬기(_한글) == 주소.다듬기(_한글)
    assert cc._아스키주소(_한글) == 주소.다듬기(_한글)
