# -*- coding: utf-8 -*-
from fakes import 가짜S3
from topic.evidence import 증거창고


def 글(주소, 계정="cortis_official", 좋아요=100, 글="CORTIS 컴백 티저 공개", **더):
    return {"플랫폼": "x", "계정": 계정, "주소": 주소, "날짜": "2026-09-24", "글": 글,
            "반응": {"좋아요": 좋아요, "공유": 0, "댓글": 0, "조회": 0}, **더}


def test_번호는_차례대로_같은_주소는_새_번호가_없다():
    창 = 증거창고(가짜S3(), "통", "j1")
    assert 창.넣기(글("https://x.com/a/1"), "x_search#1") == ("E1", True)
    assert 창.넣기(글("https://x.com/a/2"), "x_search#1") == ("E2", True)
    assert 창.넣기(글("https://x.com/a/1", 계정정보={"인증": True}), "x_account#2") == ("E1", False)
    assert 창.꺼내기("E1")["계정정보"] == {"인증": True}  # 빈 칸만 채운다
    assert 창.꺼내기("E1")["출처"] == "x_search#1" and 창.꺼내기("E9") is None


def test_발췌는_띄어쓰기_따옴표_대소문자만_봐주고_글자는_그대로여야():
    창 = 증거창고(가짜S3(), "통", "j1")
    창.넣기(글("https://x.com/a/1", 글="CORTIS ‘FaSHioN’\n뮤직비디오  공개"), "t")
    assert 창.발췌있나("E1", "cortis 'fashion' 뮤직비디오 공개")
    assert not 창.발췌있나("E1", "CORTIS 'FaSHioN' 뮤직비디오 1억뷰 돌파")
    assert not 창.발췌있나("E1", " ") and not 창.발췌있나("E7", "CORTIS")


def test_배수는_그_계정의_그_기간_가운데값으로():
    창 = 증거창고(가짜S3(), "통", "j1")
    for i, 좋아요 in enumerate([100, 120, 80, 5000]):
        창.넣기(글(f"https://x.com/a/{i}", 좋아요=좋아요), "t")
    창.넣기(글("https://x.com/b/1", 계정="other", 좋아요=10), "t")
    assert 창.배수("E4") == round(5000 / 110, 1)  # 가운데값 (100+120)/2 = 110
    assert 창.배수("E5") == 1.0


def test_창고에_쓰고_다시_읽는다():
    s3 = 가짜S3()
    창 = 증거창고(s3, "통", "j1")
    창.넣기(글("https://x.com/a/1"), "t")
    창.쓰기()
    다시 = 증거창고(s3, "통", "j1")
    assert 다시.꺼내기("E1")["주소"] == "https://x.com/a/1" and 다시.넣기(글("https://x.com/a/1"), "t") == ("E1", False)
    assert "weekly/topic/j1/evidence.json" in s3.것들
