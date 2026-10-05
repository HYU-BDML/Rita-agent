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


def test_같은_주소를_다시_읽으면_더_긴_본문으로():
    # 검색 요약 114자만 남고 나무위키 본문이 안 남았다(판 4)
    from fakes import 가짜S3
    from topic.evidence import 증거창고
    창 = 증거창고(가짜S3(), "통", "j1")
    번, _ = 창.넣기({"플랫폼": "web", "계정": "namu.wiki", "주소": "https://namu.wiki/w/A", "글": "짧은 요약"}, "web_search#1")
    창.넣기({"플랫폼": "page", "계정": "namu.wiki", "주소": "https://namu.wiki/w/A", "글": "긴 본문 " * 50}, "read_page#2")
    assert 창.꺼내기(번)["글"].startswith("긴 본문") and 창.꺼내기(번)["플랫폼"] == "web"
    창.넣기({"주소": "https://namu.wiki/w/A", "글": "더 짧음"}, "web_search#3")
    assert 창.꺼내기(번)["글"].startswith("긴 본문")


def test_기사를_다시_읽어도_검색_요약_발췌가_맞는다():
    # 검색 요약 뒤에 기사를 읽으면 본문이 더 긴 쪽으로 바뀌어 요약에서 따온 발췌가 «원문에 없음» 이 됐다(작은 것 9)
    창 = 증거창고(가짜S3(), "통", "j1")
    번, _ = 창.넣기({"플랫폼": "web", "계정": "news.example.com", "주소": "https://n.example.com/1", "날짜": "2026-09-24",
                   "글": "하츠투하츠, 10월 5일 한국어 버전 공개 — 검색 요약"}, "web_search#1")
    창.넣기({"플랫폼": "page", "계정": "news.example.com", "주소": "https://n.example.com/1", "날짜": "2026-09-24",
            "글": "기사 본문 " + "가" * 300}, "read_page#2")
    assert 창.발췌있나(번, "10월 5일 한국어 버전 공개") and 창.발췌있나(번, "기사 본문")
