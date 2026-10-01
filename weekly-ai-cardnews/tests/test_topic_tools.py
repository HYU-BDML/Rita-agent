# -*- coding: utf-8 -*-
from fakes_topic import KAITO, 가짜실행, 가짜판정관, 트윗, 현장만들기
from topic import apify, tools


def 부르기(현, 이름, **인자):
    return tools.부르기(현, {"이름": 이름, "인자": 인자, "인자탈": ""})


def test_도구는_열한개_이름이_고정():
    assert tools.이름들 == ("update_board", "web_search", "x_search", "x_account", "instagram_search",
                         "instagram_account", "threads_account", "read_page", "view_images", "get_evidence",
                         "submit_result")
    assert [d["function"]["name"] for d in tools.도구설명] == list(tools.이름들)
    assert all(d["function"]["description"] and d["function"]["parameters"]["type"] == "object" for d in tools.도구설명)


def test_x_search_는_기간을_한국_0시로_걸고_증거를_쌓는다():
    실행 = 가짜실행({KAITO: [트윗(1, 좋아요=12400, 영상=True), 트윗(2)]})
    현 = 현장만들기(실행)
    글 = 부르기(현, "x_search", query="CORTIS")
    도구, 입력, 상한 = 실행.받은[0]
    assert 입력 == {"searchTerms": ["CORTIS since:2026-09-20_15:00:00_UTC until:2026-09-27_15:00:00_UTC"],
                  "maxItems": 20, "queryType": "Top"} and 상한 == 0.01
    assert "E1 · X @cortis_official ✓인증 · 2026-09-24 ♥12,400" in 글 and "영상 1920x1080" in 글
    assert 글.rstrip().splitlines()[-1].startswith("[남은 예산] 도구 1/50번 (X 검색 1)")
    줄 = 현.예산.기록[0]
    assert (줄["요약"], 줄["증거"], 줄["새것"]) == ("x_search «CORTIS» Top 20", ["E1", "E2"], 2)
    assert 현.재료["아피파이기록"][0]["돈"] == 0.0005


def test_도구_기록에_지금_걸음_번호를_단다():
    현 = 현장만들기(가짜실행({KAITO: [트윗(1)]}))
    현.재료["지금걸음"] = 3  # 지휘자가 걸음을 시작할 때 매긴다(Task 10)
    부르기(현, "x_search", query="CORTIS")
    assert 현.예산.기록[0]["걸음"] == 3 and 현.재료["아피파이기록"][0]["걸음"] == 3


def test_같은_호출은_다시_안_한다():
    실행 = 가짜실행({KAITO: [트윗(1)]})
    현 = 현장만들기(실행)
    부르기(현, "x_search", query="CORTIS")
    글 = 부르기(현, "x_search", query="CORTIS")
    assert len(실행.받은) == 1 and "같은 호출을 이미 했다" in 글 and "E1" in 글
    assert any("같은 호출 반복 막음" in x for x in 현.판["경고"]) and 현.예산.호출수() == 1


def test_기간_밖_글은_숨기고_광고뿐이면_못_읽는다고():
    실행 = 가짜실행({KAITO: lambda 입력: [트윗(1), 트윗(2, 시각="2026-09-30T03:00:00Z")]
                    if "from:" in 입력["searchTerms"][0] else [{"text": "From KaitoEasyAPI, a reminder"}] * 3})
    현 = 현장만들기(실행)
    글 = 부르기(현, "x_account", account="@CORTIS_official", deep=True)
    assert "(기간 밖 1건 숨김)" in 글 and "E2" not in 글.split("\n", 1)[1] and 현.창고.꺼내기("E2")["기간밖"] is True
    assert "X @cortis_official ✓인증 · 팔로워 812,000" in 글
    글 = 부르기(현, "x_search", query="없는말")
    assert "전부 광고" in 글 and 현.예산.기록[-1]["탈"].startswith("이상함")


def test_두번_고장이면_그_판에서_끄고_돈이면_Apify_도구를_다_끈다():
    실행 = 가짜실행({KAITO: apify.도구탈("고장", "실행 FAILED")})
    현 = 현장만들기(실행)
    assert "다른 플랫폼" in 부르기(현, "x_search", query="a")
    부르기(현, "x_search", query="b")
    assert "x_search" in 현.판["꺼진도구"] and "껐다" in 부르기(현, "x_search", query="c")
    assert len(실행.받은) == 2
    실행.답들["apify~instagram-hashtag-scraper"] = apify.도구탈("돈", "월 한도")
    부르기(현, "instagram_search", query="cortis")
    assert {"web_search", "instagram_account", "threads_account"} <= set(현.판["꺼진도구"])


def test_예산을_다_쓰면_외부_도구는_안_부른다():
    현 = 현장만들기(분=41)
    글 = 부르기(현, "web_search", query="CORTIS")
    assert "submit_result 만" in 글 and 현.실행.받은 == []
    assert 부르기(현, "update_board", judgment="정리한다", stage="⑦").startswith("적었다")


def test_기사_읽고_사진_후보를_판정관에게():
    def 읽기(주소):
        return {"플랫폼": "page", "계정": "news.example.com", "주소": 주소, "제목": "코르티스 컴백", "시각": "",
                "날짜": "2026-09-24", "글": "코르티스가 24일 컴백했다. " * 10, "링크": ["https://x.com/CORTIS_official"],
                "사진후보": [{"주소": "https://cdn/1.jpg", "설명": "무대"}, {"주소": "https://cdn/logo2.jpg", "설명": ""}],
                "미디어": [], "반응": {}, "답글": False}
    판정관 = 가짜판정관(사진={"E1#2": "로고"})
    현 = 현장만들기(읽기=읽기, 판정관=판정관)
    글 = 부르기(현, "read_page", url="https://news.example.com/a/1")
    assert "E1 · news.example.com · 2026-09-24 · 코르티스 컴백" in 글 and "SNS 링크: https://x.com/CORTIS_official" in 글
    assert "E1#1 (무대)" in 글
    글 = 부르기(현, "view_images", images=["E1#1", "E1#2", "E9#1"])
    assert 판정관.받은 == [("사진", ["E1#1", "E1#2"])] and "E1#1 장면" in 글 and "E1#2 로고" in 글 and "E9#1 없는 번호" in 글
    assert 현.창고.꺼내기("E1")["사진판정"] == {"1": "장면", "2": "로고"}


def test_증거_보기_작업판_결과내기_그리고_틀린_호출():
    현 = 현장만들기(가짜실행({KAITO: [트윗(1, 글="CORTIS 'FaSHioN' 뮤직비디오 공개")]}))
    부르기(현, "x_search", query="CORTIS")
    assert "CORTIS 'FaSHioN' 뮤직비디오 공개" in 부르기(현, "get_evidence", ids=["E1", "E5"])
    assert "적었다" in 부르기(현, "update_board", judgment="MV 사건", events=[{"name": "MV", "evidence": ["E1"]}])
    assert 현.판["사건"]["MV"]["증거"] == ["E1"]
    글 = 부르기(현, "submit_result", items=[{"event": "MV"}], unfilled=[])
    assert "관문" in 글 and 현.재료["제출"]["items"] == [{"event": "MV"}]
    assert "JSON" in tools.부르기(현, {"이름": "x_search", "인자": {}, "인자탈": "인자를 JSON 으로 못 읽음"})
    assert "없는 도구" in 부르기(현, "youtube_search", query="a")
    assert "인자가 맞지 않다" in 부르기(현, "x_search")


def test_구글_검색은_장부의_최소상한_아래로_상한을_안_건다():
    # Apify 가 구글 검색 도구의 상한을 $0.50 아래로 걸면 400 으로 거절한다(Task 1 실제) — 청구는 쪽 수만큼
    실행 = 가짜실행()
    현 = 현장만들기(실행)
    부르기(현, "web_search", query="코르티스")
    assert 실행.받은[0][0] == "apify~google-search-scraper" and 실행.받은[0][2] == 0.5


def test_결과글은_자물쇠_안에서_증거_창고를_읽는다():
    # 나란히 도는 다른 도구가 창고에 넣는 동안 훑으면 «dictionary changed size» 로 판이 통째 실패한다(최종 검토 I1)
    현 = 현장만들기(가짜실행({KAITO: [트윗(1), 트윗(2)]}))
    원래 = 현.창고.배수
    본것 = []

    def 배수(b):
        본것.append(현.자물쇠.locked())
        return 원래(b)

    현.창고.배수 = 배수
    부르기(현, "x_search", query="CORTIS")
    assert 본것 and all(본것)


def test_모르는_오류도_도구_탈로_적고_다음_할_일을_말한다():
    # 도구 상자가 모르는 예외를 내보내면 판이 통째 실패하고 호출 기록에도 안 남는다(최종 검토 I2)
    def 터짐(입력):
        raise RuntimeError("뜻밖의 고장")

    현 = 현장만들기(가짜실행({KAITO: 터짐}))
    글 = 부르기(현, "x_search", query="CORTIS")
    assert "x_search 실패(오류)" in 글 and "다른 도구로" in 글
    줄 = 현.예산.기록[-1]
    assert 줄["도구"] == "x_search" and 줄["탈"].startswith("오류: RuntimeError")
