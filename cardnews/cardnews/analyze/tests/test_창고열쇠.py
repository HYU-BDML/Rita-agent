# -*- coding: utf-8 -*-
"""**주소가 되는 창고 열쇠는 아스키로만 짓는다**(사람 결정 2026-08-29).

한글 열쇠에서 나온 주소는 서버가 못 연다 — `urlopen` 이 `UnicodeEncodeError` 를
던지고, 그 자리들은 「한 장 때문에 전체를 죽이지 말자」고 예외를 삼키므로 **아무
자국도 안 남는다.** 2026-08-29 하루에 두 번 그렇게 잃었다: 아침에 목록 카드의
미리보기 그림, 저녁에 배경판 전부.

나가는 길에서 `주소.다듬기` 가 받아 주지만 그건 **옛 자리를 위한 그물**이다.
새로 만드는 것까지 그물에 맡기면 그물이 뚫린 날 또 조용히 잃는다.
"""
import os
import sys
from pathlib import Path

여기 = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(여기))
sys.path.insert(0, str(여기.parent / "render"))
os.environ.setdefault("CARDNEWS_DATA", str(여기 / "data"))

import lambda_분석 as 분석  # noqa: E402


def test_주소가_되는_열쇠는_아스키다():
    """이 셋이 공개 주소로 나간다 — 틀에 실리고 카드에 실린다."""
    for 이름, 값 in (("판칸", 분석.판칸),
                   ("미리보기칸", 분석.미리보기칸)):
        assert 값.isascii(), f"{이름} = {값!r} 은 한글이라 주소가 깨진다"


def test_옛_한글_자리를_코드가_다시_안_쓴다():
    """되돌아가는 것을 막는다 — 옛 이름을 다시 적으면 여기서 깨진다."""
    글 = (여기 / "lambda_분석.py").read_text(encoding="utf-8")
    for 옛 in ('f"배경판/{', '"templates/미리보기/', 'f"담기셈/{', '= "말투"'):
        assert 옛 not in 글, f"{옛} — 아스키 자리로 옮긴 열쇠다"


def test_말투_자리도_아스키다():
    """말투 주소는 목록 줄에 실려 저장된다 — 그래서 이것도 아스키여야 한다."""
    assert 분석.말투칸.isascii(), 분석.말투칸


def test_두_배포_단위가_같은_말투_자리를_본다():
    """배포 단위가 달라 값이 두 벌이다. 갈리면 말투를 못 찾는다."""
    # **이름으로 부르면 안 된다** — `analyze/app.py` 도 이름이 `app` 이라
    # 이쪽이 먼저 잡힌다(2026-08-27 에 겪은 함정).
    import importlib.util  # noqa: PLC0415

    자리 = importlib.util.spec_from_file_location(
        "작업대앱", 여기.parent / "render" / "app.py")
    몸 = importlib.util.module_from_spec(자리)
    자리.loader.exec_module(몸)
    assert 몸.말투칸 == 분석.말투칸
