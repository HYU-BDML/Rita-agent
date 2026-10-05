# -*- coding: utf-8 -*-
from fakes_topic import KAITO, 가짜실행, 가짜판정관, 트윗, 현장만들기
from topic import apify, tools, watchlist

목록 = [{"tool": "x_account", "args": {"account": "CORTIS_official"}, "why": "공식"}]


def 부르기(현, 이름, **인자):
    return tools.부르기(현, {"이름": 이름, "인자": 인자, "인자탈": ""})


def test_도구는_열두개_이름이_고정():
    assert tools.이름들 == ("update_board", "recall_sources", "web_search", "x_search", "x_account", "instagram_search",
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
    판정관 = 가짜판정관(사진={"E1#2": "로고"}, 글자={"E1#1": "COMEBACK 9.24"})
    현 = 현장만들기(읽기=읽기, 판정관=판정관)
    글 = 부르기(현, "read_page", url="https://news.example.com/a/1")
    assert "E1 · news.example.com · 2026-09-24 · 코르티스 컴백" in 글 and "SNS 링크: https://x.com/CORTIS_official" in 글
    assert "E1#1 (무대) 장면 «COMEBACK 9.24»" in 글 and "E1#2 (-) 로고" in 글  # 읽을 때 바로 판정(계획 4 B)
    글 = 부르기(현, "view_images", images=["E1#1", "E1#2", "E9#1"])
    assert 판정관.받은 == [("사진보기", ["E1#1", "E1#2"])]  # 이미 본 사진은 다시 안 묻는다 — 돈 0
    assert "E1#1 장면 «COMEBACK 9.24»" in 글 and "E1#2 로고" in 글 and "E9#1 없는 번호" in 글
    x = 현.창고.꺼내기("E1")
    assert x["사진판정"] == {"1": "장면", "2": "로고"} and x["글"].endswith("\n[사진 속 글자] COMEBACK 9.24")


def test_증거_보기_작업판_결과내기_그리고_틀린_호출():
    현 = 현장만들기(가짜실행({KAITO: [트윗(1, 글="CORTIS 'FaSHioN' 뮤직비디오 공개")]}))
    부르기(현, "x_search", query="CORTIS")
    assert "CORTIS 'FaSHioN' 뮤직비디오 공개" in 부르기(현, "get_evidence", ids=["E1", "E5"])
    assert "적었다" in 부르기(현, "update_board", judgment="MV 사건", events=[{"name": "MV", "evidence": ["E1"]}])
    assert 현.판["사건"]["MV"]["증거"] == ["E1"]
    글 = 부르기(현, "submit_result", items=[{"event": "MV"}], unfilled=[], weekly_sources=목록)
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


def test_증거는_한번에_열다섯개까지():
    # 다섯 개씩이라 판 하나에 증거 다시 보기를 10번 불렀다(진짜 한 판 10-01)
    현 = 현장만들기(가짜실행({KAITO: [트윗(i) for i in range(1, 21)]}))
    부르기(현, "x_search", query="CORTIS")
    글 = 부르기(현, "get_evidence", ids=[f"E{i}" for i in range(1, 21)])
    assert "E15 · x" in 글 and "E16 · x" not in 글


def test_긁은_결과는_다음_판이_다시_쓰고_돈과_호출을_안_센다():
    from fakes import 가짜S3
    from topic import memory
    기억 = memory.기억창고(가짜S3(), "통")
    실행 = 가짜실행({KAITO: [트윗(1), 트윗(2)]})
    부르기(현장만들기(실행, 기억=기억), "x_search", query="CORTIS")
    둘 = 현장만들기(실행, 기억=기억)  # 다음 판
    글 = 부르기(둘, "x_search", query="CORTIS")
    assert len(실행.받은) == 1 and 글.startswith("(저장해 둔 결과 — 1시간 안에 가져온 것, 돈 0)")
    assert "E1 · X @cortis_official" in 글 and not 둘.재료.get("아피파이기록")
    assert 둘.예산.호출수() == 0 and 둘.예산.기록[0]["저장해둔"] is True and 둘.예산.기록[0]["증거"] == ["E1", "E2"]
    assert "[남은 예산] 도구 0/50번" in 글


def test_진행_중인_기간은_6시간이_지나면_다시_가져온다():
    from fakes import 가짜S3
    from fakes_topic import 주문서
    from topic import memory

    def 두판(끝):
        기억 = memory.기억창고(가짜S3(), "통")
        실행 = 가짜실행({KAITO: [트윗(1)]})
        첫 = 현장만들기(실행, 주문서_={**주문서, "끝": 끝}, 기억=기억)
        첫.지금글 = lambda: "2026-09-30T20:00:00Z"  # 7시간 전
        부르기(첫, "x_search", query="CORTIS")
        부르기(현장만들기(실행, 주문서_={**주문서, "끝": 끝}, 기억=기억), "x_search", query="CORTIS")
        return len(실행.받은)

    assert 두판("2026-10-04") == 2 and 두판("2026-09-27") == 1


def test_실패한_호출은_긁은_결과에_안_남긴다():
    from fakes import 가짜S3
    from topic import memory
    기억 = memory.기억창고(가짜S3(), "통")
    부르기(현장만들기(가짜실행({KAITO: apify.도구탈("고장", "실행 FAILED")}), 기억=기억), "x_search", query="a")
    assert not [k for k in 기억.s3.것들 if "/scrapes/" in k]


def test_기억_꺼내기는_돈도_호출도_없이_글로():
    from fakes import 가짜S3
    from topic import memory
    기억 = memory.기억창고(가짜S3(), "통")
    기억.출처쓰기({"출처": "x:cortis_official", "이름들": ["코르티스"], "판정": "공식", "근거": "링크",
                 "확인한날": "2026-09-30", "판들": []})
    현 = 현장만들기(기억=기억)
    글 = 부르기(현, "recall_sources", names=["코르티스", "CORTIS"])
    assert "x:cortis_official · 공식 (링크) · 확인 2026-09-30" in 글 and 현.예산.기록 == [] and 현.실행.받은 == []
    assert "인자가 맞지 않다" in 부르기(현, "recall_sources", names=[" "])
    assert "기억을 못 쓴다" in 부르기(현장만들기(), "recall_sources", names=["코르티스"])


def test_기사_읽기는_찾을_말이_있으면_문서_전체에서_그_주변을():
    본문 = "하츠투하츠 소개. " + "가" * 900 + " 카르멘 프로필 — MBTI는 ENFP, 혈액형은 O형. " + "나" * 900 + " 지우 MBTI ISTJ."

    def 읽기(주소):
        return {"플랫폼": "page", "계정": "namu.wiki", "주소": 주소, "제목": "Hearts2Hearts", "시각": "", "날짜": None,
                "글": 본문, "링크": [], "사진후보": []}

    현 = 현장만들기(읽기=읽기)
    글 = 부르기(현, "read_page", url="https://namu.wiki/w/Hearts2Hearts", find="mbti")
    assert "«mbti» 찾은 곳 2군데" in 글 and "ENFP" in 글 and "ISTJ" in 글
    assert "«키» 은 이 문서에 없다" in 부르기(현, "read_page", url="https://namu.wiki/w/Hearts2Hearts", find="키")
    assert "찾은 곳" not in 부르기(현, "read_page", url="https://namu.wiki/w/B")


def test_결과_내기에_프로필_칸이_없다():
    # 카드뉴스는 기간 안 소식 전달용 — 프로필은 걷어냈다(사용자 2026-10-04)
    import json
    칸 = next(d for d in tools.도구설명 if d["function"]["name"] == "submit_result")["function"]["parameters"]
    assert "profiles" not in 칸["properties"] and "프로필" not in json.dumps(칸, ensure_ascii=False)
    현 = 현장만들기()
    부르기(현, "submit_result", items=[], weekly_sources=목록)
    assert "profiles" not in 현.재료["제출"]


def test_쓸모없는_결과는_긁은_결과에_안_남긴다():
    # 광고뿐·0건·실패했는데 몇 줄 온 결과가 남아 다음 판이 6시간~7일 동안 그걸 받았을 것(최종 검토 I2)
    from fakes import 가짜S3
    from topic import memory
    기억 = memory.기억창고(가짜S3(), "통")
    부르기(현장만들기(가짜실행({KAITO: [{"text": "From KaitoEasyAPI, a reminder"}] * 3}), 기억=기억), "x_search", query="a")
    부르기(현장만들기(가짜실행({"apify~google-search-scraper": [{"organicResults": []}]}), 기억=기억), "web_search", query="b")

    def 반쯤(도구, 입력, 돈상한, **kw):
        return {"것들": [트윗(1)], "청구": {}, "상태": "TIMED-OUT", "열쇠순번": 0}

    부르기(현장만들기(반쯤, 기억=기억), "x_search", query="c")
    assert not [k for k in 기억.s3.것들 if "/scrapes/" in k]


def test_긁은_결과를_못_써도_도구는_성공한다():
    # Apify 에 돈을 낸 뒤 S3 쓰기가 터지면 결과를 버렸을 것(최종 검토 I3)
    from fakes import 가짜S3
    from topic import memory

    class 못쓰는S3(가짜S3):
        def put_object(self, **kw):
            raise RuntimeError("S3 흔들림")

    글 = 부르기(현장만들기(가짜실행({KAITO: [트윗(1)]}), 기억=memory.기억창고(못쓰는S3(), "통")), "x_search", query="a")
    assert "E1 · X @cortis_official" in 글 and "실패" not in 글


def test_저장해_둔_결과가_실패해도_호출로_안_센다():
    # 창고에서 꺼낸 결과가 정리에서 실패하면 호출 1로 셌다(작은 것 6)
    from fakes import 가짜S3
    from topic import memory
    기억 = memory.기억창고(가짜S3(), "통")
    기억.긁은것읽기 = lambda *a: ([{"text": "From KaitoEasyAPI, a reminder"}] * 3, 1.0)
    실행 = 가짜실행({})
    현 = 현장만들기(실행, 기억=기억)
    글 = 부르기(현, "x_search", query="a")
    assert "실패" in 글 and not 실행.받은 and 현.예산.호출수() == 0


def test_기억_꺼내기_이름을_글_하나로_줘도_낱말째로():
    # names 를 글 하나로 주면 글자마다 찾았다(작은 것 10)
    from fakes import 가짜S3
    from topic import memory
    현 = 현장만들기(기억=memory.기억창고(가짜S3(), "통"))
    assert 부르기(현, "recall_sources", names="하츠투하츠").startswith("기억 꺼내기 «하츠투하츠»")


def test_액터가_바뀌면_긁은_결과를_다시_안_쓴다(monkeypatch):
    # 지문에 액터 이름이 없어 2-2 수리공이 액터를 바꿔도 옛 결과를 최대 7일 썼을 것(작은 것 11)
    from fakes import 가짜S3
    from topic import memory, registry
    기억 = memory.기억창고(가짜S3(), "통")
    실행 = 가짜실행({KAITO: [트윗(1)], "새~액터": [트윗(2)]})
    부르기(현장만들기(실행, 기억=기억), "x_search", query="CORTIS")
    장부 = registry.읽기()
    monkeypatch.setattr(registry, "읽기", lambda: {**장부, "x_search": {**장부["x_search"], "도구": "새~액터"}})
    부르기(현장만들기(실행, 기억=기억), "x_search", query="CORTIS")
    assert len(실행.받은) == 2


def 사진트윗(번, 장수, 시각="2026-09-24T03:00:00Z", 글=None):
    t = 트윗(번, 시각=시각, 글=글)
    t["extendedEntities"] = {"media": [{"media_url_https": f"https://pbs.twimg.com/{번}_{k}.jpg"} for k in range(1, 장수 + 1)]}
    return t


def test_모을_때_기간_안_글의_사진을_바로_판정하고_글자를_본문_끝에_붙인다():
    # LAFC 공식 X «Final from Dallas.» — 점수는 사진 속에만 있었는데 아무도 안 읽었다(계획 4 B)
    판정관 = 가짜판정관(사진={"E1#2": "로고"}, 글자={"E1#1": "FC댈러스 1 : 0 LAFC 경기 끝"})
    실행 = 가짜실행({KAITO: [사진트윗(1, 2, 글="Final from Dallas."), 사진트윗(2, 1, 시각="2026-09-01T03:00:00Z"),
                            트윗(3), 사진트윗(4, 1, 시각=None)]})
    현 = 현장만들기(실행, 판정관=판정관)
    부르기(현, "x_search", query="LAFC")
    assert 판정관.받은 == [("사진보기", ["E1#1", "E1#2", "E4#1"])]  # 기간 밖 E2·사진 없는 E3 은 안 본다, 날짜 모름 E4 는 본다
    x = 현.창고.꺼내기("E1")
    assert x["사진판정"] == {"1": "장면", "2": "로고"} and x["사진글자"] == {"1": "FC댈러스 1 : 0 LAFC 경기 끝"}
    assert x["글"] == "Final from Dallas.\n[사진 속 글자] FC댈러스 1 : 0 LAFC 경기 끝"
    assert 현.재료["사진판정수"] == 3 and 현.재료["사진판정초"] >= 0


def test_사진_판정은_글마다_앞_4장_한_번에_24장_한_판에_200장까지():
    판정관 = 가짜판정관()
    현 = 현장만들기(가짜실행({KAITO: [사진트윗(n, 5) for n in range(1, 11)]}), 판정관=판정관)  # 글 10개 × 5장
    부르기(현, "x_search", query="a")
    처음 = 판정관.받은[0][1]
    assert len(처음) == 24 and not any(b.endswith("#5") for b in 처음) and 현.재료["사진판정수"] == 24
    현.재료["사진판정수"] = 199
    부르기(현, "x_search", query="b")  # 같은 글들 — 아직 안 본 16장 가운데 한 판 한도까지 1장만
    assert 판정관.받은[1] == ("사진보기", ["E7#1"]) and 현.재료["사진판정수"] == 200


def test_사진_판정이_터져도_도구_결과는_그대로():
    현 = 현장만들기(가짜실행({KAITO: [사진트윗(1, 1)]}), 판정관=가짜판정관(터짐=True))
    글 = 부르기(현, "x_search", query="a")
    assert "E1 · X @cortis_official" in 글 and "사진판정" not in 현.창고.꺼내기("E1")


def test_사진_속_글자에서_옮긴_발췌도_관문을_지난다():
    from topic import gate
    판정관 = 가짜판정관(글자={"E1#1": "FC댈러스 1 : 0 LAFC 경기 끝"})
    현 = 현장만들기(가짜실행({KAITO: [사진트윗(1, 1, 글="Final from Dallas.")]}), 판정관=판정관)
    부르기(현, "x_search", query="LAFC")
    현.판["출처판정"]["x:cortis_official"] = {"판정": "공식", "근거": "인증"}
    소식 = {"hero": "LAFC", "event": "댈러스 원정 패", "summary": "LAFC가 9월 24일 FC댈러스 원정에서 0-1로 졌다 [E1].",
           "date": "2026-09-24", "source": "E1", "quote": "FC댈러스 1 : 0 LAFC", "media": "E1#1"}
    결과 = gate.검사(현, {"items": [소식], "unfilled": []}, False)
    assert 결과["돌려보낼말"] == [] and [x["event"] for x in 결과["통과"]] == ["댈러스 원정 패"]


def test_결과_줄에_사진_갈래_수와_사진_속_글자를_보인다():
    판정관 = 가짜판정관(사진={"E1#2": "로고"}, 글자={"E1#1": "FC댈러스 1 : 0 LAFC 경기 끝"})
    현 = 현장만들기(가짜실행({KAITO: [사진트윗(1, 2, 글="Final from Dallas.")]}), 판정관=판정관)
    글 = 부르기(현, "x_search", query="LAFC")
    줄 = next(x for x in 글.splitlines() if x.startswith("E1 · "))
    assert "· 사진 2(장면 1·로고 1) ·" in 줄 and "· 사진 속 글자 «FC댈러스 1 : 0 LAFC 경기 끝» ·" in 줄
    assert 줄.endswith(' · "Final from Dallas."')  # 본문 칸에 글자를 두 번 싣지 않는다


def test_사진_보기는_판정_안_된_것만_묻고_글자도_적는다():
    판정관 = 가짜판정관(글자={"E1#5": "1위"})
    현 = 현장만들기(가짜실행({KAITO: [사진트윗(1, 5)]}), 판정관=판정관)
    부르기(현, "x_search", query="a")  # 모을 때는 앞 4장만
    글 = 부르기(현, "view_images", images=["E1#3", "E1#5"])
    assert 판정관.받은 == [("사진보기", ["E1#1", "E1#2", "E1#3", "E1#4"]), ("사진보기", ["E1#5"])]
    assert "E1#3 장면" in 글 and "E1#5 장면 «1위»" in 글
    assert 현.창고.꺼내기("E1")["글"].endswith("\n[사진 속 글자] 1위")


def test_공식_그림은_기사_사진_후보와_사진_보기에_띄어_쓴_말로_보인다():
    # 판정 갈래 «공식그림»(42+ A) — 지휘자가 읽는 결과 글에는 «공식 그림»
    def 읽기(주소):
        return {"플랫폼": "page", "계정": "news.example.com", "주소": 주소, "제목": "아이브 트랙리스트", "시각": "",
                "날짜": "2026-09-24", "글": "아이브가 트랙리스트를 공개했다.", "링크": [],
                "사진후보": [{"주소": "https://cdn/tracklist.jpg", "설명": "트랙리스트"}, {"주소": "https://cdn/b.jpg"}],
                "미디어": [], "반응": {}, "답글": False}
    판정관 = 가짜판정관(사진={"E1#1": "공식그림"})
    현 = 현장만들기(읽기=읽기, 판정관=판정관)
    글 = 부르기(현, "read_page", url="https://news.example.com/a/2")
    assert "E1#1 (트랙리스트) 공식 그림" in 글 and "공식그림" not in 글
    현.창고.꺼내기("E1")["사진판정"].pop("2")
    글 = 부르기(현, "view_images", images=["E1#1", "E1#2"])
    assert "E1#1 공식 그림" in 글 and "E1#2 장면" in 글


def test_결과_내기에_매주_볼_곳_칸이_필수다():
    칸 = next(d for d in tools.도구설명 if d["function"]["name"] == "submit_result")["function"]["parameters"]
    assert 칸["required"] == ["items", "weekly_sources"]
    줄칸 = 칸["properties"]["weekly_sources"]["items"]
    assert 줄칸["properties"]["tool"]["enum"] == list(watchlist.도구들) and 줄칸["required"] == ["tool", "args", "why"]


def test_매주_볼_곳을_빼먹으면_한_번만_재촉한다():
    현 = 현장만들기()
    글 = 부르기(현, "submit_result", items=[{"event": "MV"}])
    assert 글.startswith("weekly_sources(매주 볼 곳)가 비었다") and "제출" not in 현.재료 and 현.재료["목록재촉"] is True
    틀린 = [{"tool": "update_board", "args": {}, "why": "x"}]
    assert 부르기(현, "submit_result", items=[{"event": "MV"}], weekly_sources=틀린).startswith("받았다")
    assert 현.재료["제출"]["weekly_sources"] == 틀린  # 두 번째는 그대로 받는다 — 다듬기는 정리에서


def test_매주_볼_곳을_적으면_바로_받는다():
    현 = 현장만들기()
    assert 부르기(현, "submit_result", items=[], weekly_sources=목록).startswith("받았다")
    assert 현.재료["제출"]["weekly_sources"] == 목록 and "목록재촉" not in 현.재료


def test_목록_판이나_예산이_끝난_판은_재촉하지_않는다():
    현 = 현장만들기()
    현.재료["목록글"] = []  # 목록 판 — 바꾸기 후보에 지금 목록이 늘 들어간다
    assert 부르기(현, "submit_result", items=[]).startswith("받았다") and 현.재료["제출"]["weekly_sources"] == []
    현 = 현장만들기(분=40)  # 시간 한도 40분을 다 씀 — 예산 «끝»: 두 걸음 안에 못 내면 빈 결과가 된다
    assert 부르기(현, "submit_result", items=[]).startswith("받았다")


def test_지휘자_지시문에_매주_볼_곳_원칙이_있다():
    from topic import instructions
    지 = instructions.지휘자
    assert "## 매주 볼 곳 목록 (weekly_sources)" in 지 and "기사 한 편 주소" in 지
    assert 지.index("## 매주 볼 곳 목록") < 지.index("## 결과 내기와 관문")


def test_사진_판정의_크기를_증거에_남긴다():
    # 판정관이 머리에서 읽은 가로·세로 — 카드 사진 규칙(짧은 변 600)과 옛 판정 다시 묻기가 읽는다(42+ B)
    판정관 = 가짜판정관(크기={"E1#1": [1200, 800]})
    현 = 현장만들기(가짜실행({KAITO: [사진트윗(1, 2)]}), 판정관=판정관)
    부르기(현, "x_search", query="a")
    assert 현.창고.꺼내기("E1")["사진크기"] == {"1": [1200, 800], "2": None}


class 적는판정관:
    """받은 후보를 그대로 적고 정해 둔 답을 준다 — 후보에 무엇이 실렸나 본다."""

    def __init__(self, 답):
        self.답, self.받은 = 답, []

    def 사진보기(self, 후보, 마감초=None):
        self.받은 += 후보
        return {x["번호"]: self.답.get(x["번호"], {"갈래": "장면", "글자": "", "크기": None}) for x in 후보}


def test_기사_사진은_작은주소도_실어_묻고_원본을_못_받았으면_후보_주소를_작은주소로_바꾼다():
    # 짐작한 원본 주소가 없으면 판정관이 썸네일로 봤다 — 카드도 그 그림을 써야 한다(42+ C)
    def 읽기(주소):
        return {"플랫폼": "page", "계정": "n.example.com", "주소": 주소, "제목": "무대", "시각": "", "날짜": "2026-09-24",
                "글": "본문", "링크": [], "미디어": [], "반응": {}, "답글": False,
                "사진후보": [{"주소": "https://n/photo/a.jpg", "작은주소": "https://n/thumb/a_v150.jpg", "설명": "무대"},
                           {"주소": "https://n/photo/b.jpg", "설명": ""}]}
    판정관 = 적는판정관({"E1#1": {"갈래": "장면", "글자": "", "크기": [300, 225], "주소": "https://n/thumb/a_v150.jpg"},
                     "E1#2": {"갈래": "장면", "글자": "", "크기": [1200, 800]}})
    현 = 현장만들기(읽기=읽기, 판정관=판정관)
    부르기(현, "read_page", url="https://n.example.com/a/1")
    assert 판정관.받은 == [{"번호": "E1#1", "주소": "https://n/photo/a.jpg", "작은주소": "https://n/thumb/a_v150.jpg"},
                       {"번호": "E1#2", "주소": "https://n/photo/b.jpg"}]
    x = 현.창고.꺼내기("E1")
    assert [c["주소"] for c in x["사진후보"]] == ["https://n/thumb/a_v150.jpg", "https://n/photo/b.jpg"]
    assert x["사진크기"] == {"1": [300, 225], "2": [1200, 800]}


def test_사진_보기도_기사_사진의_작은주소를_싣는다():
    판정관 = 적는판정관({})
    현 = 현장만들기(판정관=판정관)
    현.창고.넣기({"플랫폼": "page", "계정": "n.example.com", "주소": "https://n/a/2", "날짜": "2026-09-24", "글": "본문",
                "사진후보": [{"주소": "https://n/photo/c.jpg", "작은주소": "https://n/thumb/c_v150.jpg"}]}, "read_page#1")
    부르기(현, "view_images", images=["E1#1"])
    assert 판정관.받은 == [{"번호": "E1#1", "주소": "https://n/photo/c.jpg", "작은주소": "https://n/thumb/c_v150.jpg"}]


def test_옛것도는_크기_없는_옛_판정을_몇_번째_사진이든_다시_묻는다():
    # 옛 판을 «정리» 부터 다시 돌릴 때 새 갈래·크기 규칙이 붙게(계획 4 과제 42+ G)
    판정관 = 가짜판정관(크기={"E1#2": [1200, 800], "E1#5": [300, 225]})
    현 = 현장만들기(판정관=판정관)
    현.창고.넣기({"플랫폼": "x", "계정": "cortis_official", "주소": "https://x.com/c/9", "날짜": "2026-09-24", "글": "글",
                "미디어": [{"갈래": "사진", "주소": f"https://pbs/{i}.jpg"} for i in range(1, 6)],
                "사진판정": {"1": "장면", "2": "로고", "5": "장면"}, "사진크기": {"1": [1080, 1350]}}, "x_account#1")
    tools.사진판정채우기(현, ["E1"], 한도무시=True)
    assert 판정관.받은 == [("사진보기", ["E1#3", "E1#4"])]  # 옛것도 없이는 판정 없는 앞 4장만
    tools.사진판정채우기(현, ["E1"], 한도무시=True, 옛것도=True)
    assert 판정관.받은[-1] == ("사진보기", ["E1#2", "E1#5"])  # 크기 없는 옛 판정 — 5번째도
    x = 현.창고.꺼내기("E1")
    assert x["사진판정"]["2"] == "장면" and x["사진크기"] == {"1": [1080, 1350], "2": [1200, 800], "3": None, "4": None,
                                                    "5": [300, 225]}


# ── 계획 4 과제 42++ A — 이미지 검색(사진 찾기 전용) ──

그림액터 = "simple.actor~google-images"


def test_이미지_검색은_장부의_액터를_부르고_결과마다_증거_하나():
    실행 = 가짜실행({그림액터: [{"imageUrl": "https://img/a.jpg", "imageWidth": 1200, "imageHeight": 1600,
                              "title": "아이브 리즈 출국", "pageUrl": "https://news/1", "domain": "news"}]})
    현 = 현장만들기(실행)
    글 = 부르기(현, "image_search", queries=["아이브 리즈 출국", "아이브 레이 출국"], count=10)
    도구, 입력, 상한 = 실행.받은[0]
    # 판 기간 시작(9/21)부터 오늘(10/1)까지 열흘 — 한 달 안
    assert 도구 == 그림액터 and 입력 == {"queries": ["아이브 리즈 출국", "아이브 레이 출국"], "maxItems": 10,
                                       "imageSize": "large", "timeRange": "month", "imageType": "photo",
                                       "country": "KR", "language": "ko"}
    x = 현.창고.꺼내기("E1")
    assert x["이미지검색"] is True and x["미디어"][0]["가로"] == 1200 and "E1" in 글
    assert 현.재료["아피파이기록"][0]["돈"] == 0.0005 and 현.예산.기록[0]["도구"] == "image_search"
    부르기(현, "image_search", queries=["아이브 리즈"], count=10, time_range="year")
    assert 실행.받은[1][1]["timeRange"] == "year" and 실행.받은[1][1]["queries"] == ["아이브 리즈"]


def test_이미지_검색은_지휘자_도구_목록에_없다():
    assert "image_search" not in tools.이름들 and "image_search" in tools.아피파이도구


def test_이미지_검색_기간은_시작부터_오늘까지_7일_31일_그_밖():
    from datetime import date
    assert tools.그림기간(date(2026, 9, 28), date(2026, 10, 5)) == "week"
    assert tools.그림기간(date(2026, 9, 21), date(2026, 10, 1)) == "month"
    assert tools.그림기간(date(2026, 8, 1), date(2026, 10, 5)) == "year"
