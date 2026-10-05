# -*- coding: utf-8 -*-
from topic import tools, watchlist


def 줄(도구, **인자):
    return {"tool": 도구, "args": 인자, "why": f"{도구} 까닭"}


def test_다듬기는_자료_도구만_남기고_그_주_값을_지운다():
    난것 = watchlist.다듬기([
        줄("x_account", account="@IVEstarship", deep=False, count=60, 엉뚱="x"),
        줄("read_page", url="https://maplestory.nexon.com/News/Notice", find="점검완료"),
        줄("web_search", query="아이브", use_period=False, region="kr"),
        줄("update_board", judgment="x"), 줄("view_images", images=["E1#1"]), 줄("youtube_search", query="a"),
        줄("x_search", count=20), "글", {"tool": "x_search", "args": "query"}])
    assert 난것 == [
        {"도구": "x_account", "인자": {"account": "IVEstarship", "deep": True, "count": 60}, "까닭": "x_account 까닭"},
        {"도구": "read_page", "인자": {"url": "https://maplestory.nexon.com/News/Notice"}, "까닭": "read_page 까닭"},
        {"도구": "web_search", "인자": {"query": "아이브", "use_period": True, "region": "kr"}, "까닭": "web_search 까닭"}]
    assert watchlist.다듬기(None) == [] and watchlist.다듬기("x_account") == []


def test_같은_곳은_하나만_열_줄까지():
    난것 = watchlist.다듬기([줄("x_account", account="IVEstarship"), 줄("x_account", account="ivestarship", deep=True, count=40)]
                          + [줄("x_search", query=f"검색{i}") for i in range(15)])
    assert len(난것) == 10 and 난것[0]["인자"] == {"account": "IVEstarship", "deep": True}
    assert [x["인자"].get("query") for x in 난것[1:]] == [f"검색{i}" for i in range(9)]


def test_스레드는_계정_목록이_있어야_하고_다듬은_줄도_다시_받는다():
    assert watchlist.다듬기([줄("threads_account", accounts=[]), 줄("threads_account", accounts="ive")]) == []
    한번 = watchlist.다듬기([줄("threads_account", accounts=["@ive", " "]), 줄("instagram_search", query="#아이브", keyword=True)])
    assert 한번[0]["인자"] == {"accounts": ["ive"]} and watchlist.다듬기(한번) == 한번


def test_남기는_칸은_도구_설명과_같다():
    설명 = {d["function"]["name"]: set(d["function"]["parameters"]["properties"]) for d in tools.도구설명}
    for 도구, 칸 in watchlist.칸들.items():
        assert set(칸) == 설명[도구] - {"find"}, 도구
    assert set(watchlist.도구들) == set(watchlist.칸들)


def test_대표는_대소문자_골뱅이_끝_빗금을_무시한다():
    assert watchlist.대표({"도구": "x_account", "인자": {"account": "@IVEstarship"}}) == ("x_account", "ivestarship")
    assert watchlist.대표({"도구": "read_page", "인자": {"url": "https://A.com/News/"}}) == ("read_page", "https://a.com/news")
    assert watchlist.대표({"도구": "threads_account", "인자": {"accounts": ["B", "@a"]}}) == ("threads_account", "a,b")


def test_화면_글():
    글 = lambda 도구, **인자: watchlist.화면글({"도구": 도구, "인자": 인자})  # noqa: E731
    assert 글("x_account", account="IVEstarship", deep=True, count=60) == "X @IVEstarship 최근 글 60개"
    assert 글("x_account", account="IVEstarship", deep=True) == "X @IVEstarship 최근 글 40개"
    assert 글("instagram_account", account="ivestarship", deep=True) == "인스타 @ivestarship 최근 글 30개"
    assert 글("threads_account", accounts=["a", "b"]) == "스레드 @a, @b 최근 글"
    assert 글("x_search", query="아이브") == "X에서 «아이브» 검색 20개"
    assert 글("instagram_search", query="#아이브") == "인스타에서 «아이브» 검색"
    assert 글("web_search", query="아이브", use_period=True) == "웹·뉴스에서 «아이브» 검색"
    assert 글("read_page", url="https://maplestory.nexon.com/News/Notice") == "페이지 https://maplestory.nexon.com/News/Notice 보기"


호출기록 = [
    {"도구": "x_account", "인자": {"account": "IVEstarship", "deep": True, "count": 60}, "증거": ["E1", "E2", "E3"], "탈": ""},
    {"도구": "x_account", "인자": {"account": "ivestarship"}, "증거": ["E1"], "탈": ""},  # 떠 보기 — 같은 곳
    {"도구": "instagram_account", "인자": {"account": "gone"}, "증거": [], "탈": "이상함: 가져온 15줄이 전부 광고·빈 줄이다"},
    {"도구": "update_board", "인자": {"judgment": "x"}, "증거": [], "탈": ""}]
것들 = {"E1": {"기간밖": False}, "E2": {"기간밖": True}, "E3": {}}
묶음 = [{"출처": {"증거": "E3"}}, {"출처": {"증거": "E9"}}]


def test_이번_판_숫자():
    숫 = lambda 도구, **인자: watchlist.숫자({"도구": 도구, "인자": 인자}, 호출기록, 것들, 묶음)  # noqa: E731
    assert 숫("x_account", account="ivestarship", deep=True) == "이번 판: 기간 안 글 2개 · 소식 1건에 쓰임"
    assert 숫("instagram_account", account="gone", deep=True) == "이번 판: 못 읽음"
    assert 숫("web_search", query="아이브", use_period=True) == "이번 판에서 안 봄"


def test_후보는_목록_판이면_지금_목록을_늘_앞에():
    제출 = [줄("web_search", query="아이브"), 줄("x_account", account="IVEstarship")]
    첫 = watchlist.후보만들기(제출, 호출기록, 것들, 묶음)
    assert [(x["글"], x["갈래"]) for x in 첫] == [("웹·뉴스에서 «아이브» 검색", None), ("X @IVEstarship 최근 글 40개", None)]
    assert 첫[1]["숫자"] == "이번 판: 기간 안 글 2개 · 소식 1건에 쓰임" and 첫[1]["까닭"] == "x_account 까닭"
    지금 = [{"도구": "x_account", "인자": {"account": "IVEstarship", "deep": True, "count": 60}, "까닭": "공식"},
          {"도구": "instagram_account", "인자": {"account": "gone", "deep": True}, "까닭": "공식 인스타"}]
    둘 = watchlist.후보만들기(제출[:1] + [줄("x_account", account="ivestarship")], 호출기록, 것들, 묶음, 지금)
    assert [(x["글"], x["갈래"]) for x in 둘] == [("X @IVEstarship 최근 글 60개", "지금 목록"),
                                                  ("인스타 @gone 최근 글 30개", "지금 목록"),
                                                  ("웹·뉴스에서 «아이브» 검색", "새로 찾은 곳")]
    assert watchlist.후보만들기(None, [], {}, [], 지금)[0]["숫자"] == "이번 판에서 안 봄"
    assert watchlist.줄만(둘[0]) == 지금[0]


def test_결과글은_줄마다_도구_결과를_붙인다():
    글 = watchlist.결과글([{"글": "X @a 최근 글 40개", "결과": "x_account @a — 3건"}, {"글": "웹·뉴스에서 «a» 검색", "결과": "0건"}])
    assert 글.splitlines() == ["## 저장한 목록으로 이미 모았다 — 아래가 그 결과다(같은 호출은 다시 하지 않는다)",
                              "### X @a 최근 글 40개", "x_account @a — 3건", "### 웹·뉴스에서 «a» 검색", "0건"]
