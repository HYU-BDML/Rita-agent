# -*- coding: utf-8 -*-
from datetime import date

import pytest

import weeks


def test_9월_3주차는_9월21일부터():
    assert weeks.주차("9월 3주차", 2026) == ("2026-09-21", "2026-09-27")


def test_옛서버_설명과_같은_답():  # _보관/안씀/render-server/procure/week.py 의 예시
    assert weeks.주차("8월 2주차", "2026") == ("2026-08-10", "2026-08-16")


@pytest.mark.parametrize("라벨", ["", "주차", "13월 1주차", "9월 0주차", "9월 5주차", "9월3"])
def test_없는_주차는_말로_거절(라벨):
    with pytest.raises(ValueError):
        weeks.주차(라벨, 2026)


def test_해를_못_읽으면_거절():
    with pytest.raises(ValueError):
        weeks.주차("9월 3주차", "올해")


def test_최근주차는_지난주부터():
    목록 = weeks.최근주차들(date(2026, 9, 30))
    assert 목록[0] == {"label": "9월 3주차", "year": 2026, "start": "2026-09-21", "end": "2026-09-27"}
    assert [w["label"] for w in 목록[:5]] == ["9월 3주차", "9월 2주차", "9월 1주차", "8월 5주차", "8월 4주차"]
    assert len(목록) == 12


def test_목록의_이름을_다시_날짜로_바꾸면_같다():
    for 오늘 in (date(2026, 1, 7), date(2026, 3, 2), date(2026, 12, 31)):
        for w in weeks.최근주차들(오늘):
            assert weeks.주차(w["label"], w["year"]) == (w["start"], w["end"])
