# -*- coding: utf-8 -*-
import re

import store
from fakes import 가짜S3


def 창():
    return store.창고(가짜S3(), "통")


def test_쓰고_읽기():
    c = 창()
    c.쓰기({"job": "20260930-000000-aaaaaaaa", "week": "9월 3주차", "재료": {"news": "긴 글"}})
    기록 = c.읽기("20260930-000000-aaaaaaaa")
    assert 기록["week"] == "9월 3주차" and re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ", 기록["updated"])


def test_없는_것은_None():
    assert 창().읽기("20260930-000000-bbbbbbbb") is None


def test_목록은_최근부터_몇개만_재료_빼고():
    c = 창()
    for i in range(5):
        c.쓰기({"job": f"20260930-00000{i}-aaaaaaaa", "week": f"{i}", "재료": {"news": "긴 글"}})
    목록 = c.목록(3)
    assert [x["week"] for x in 목록] == ["4", "3", "2"]
    assert all("재료" not in x for x in 목록)


def test_목록은_평가_판을_빼고_몇개를_채운다():
    # 밤새 돈 평가 18판이 «최근 50판» 에 섞여 주간 판이 목록에서 밀렸다(계획 4 D-10)
    c = 창()
    for i in range(5):
        c.쓰기({"job": f"20260930-00000{i}-aaaaaaaa", "week": f"{i}", **({"평가": True} if i >= 3 else {})})
    assert [x["week"] for x in c.목록(3)] == ["2", "1", "0"]


def test_목록은_거르개를_지난_판으로_몇개를_채운다():
    # 지난 결과는 카드뉴스가 된 판만 — 50 은 거른 뒤 50(사용자 2026-10-05)
    c = 창()
    for i in range(6):
        c.쓰기({"job": f"20260930-00000{i}-aaaaaaaa", "week": f"{i}", "카드": i % 2 == 0})
    assert [x["week"] for x in c.목록(2, 거르개=lambda 기록: 기록["카드"])] == ["4", "2"]


def test_판_지우기는_사본을_남기고_목록에서_뺀다():
    c = 창()
    c.쓰기({"job": "20260930-000000-aaaaaaaa", "week": "9월 3주차", "재료": {"news": "긴 글"}})
    원본 = c.읽기("20260930-000000-aaaaaaaa")
    c.판지우기("20260930-000000-aaaaaaaa")
    assert c.읽기("20260930-000000-aaaaaaaa") is None and c.목록() == []
    assert c._읽기키("weekly/memory/backup/jobs/20260930-000000-aaaaaaaa.json") == 원본


def test_분야_지우기는_사본을_남긴다():
    c = 창()
    c.분야쓰기({"field": "20260930-000000-ff000001", "이름": "아이브"})
    c.분야지우기("20260930-000000-ff000001")
    assert c.분야읽기("20260930-000000-ff000001") is None and c.분야목록() == []
    assert c._읽기키("weekly/memory/backup/fields/20260930-000000-ff000001.json")["이름"] == "아이브"


def test_그림올리기는_png_로_끝나는_주소():
    주소 = 창().그림올리기("20260930-000000-aaaaaaaa", 4, b"PNG")
    assert 주소.split("?")[0].endswith("/weekly/img/20260930-000000-aaaaaaaa/04.png")


def test_번호표_모양():
    assert re.fullmatch(r"\d{8}-\d{6}-[0-9a-f]{8}", store.새번호표())
