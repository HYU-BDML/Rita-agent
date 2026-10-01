# -*- coding: utf-8 -*-
import oldserver
import runs
from fakes import 가짜그림, 가짜옛서버, 손만들기

번호 = "20260930-000000-00000001"


def 장들():
    return [
        {"no": 2, "type": "뉴스", "brand": "ChatGPT", "media_url": "https://pbs.twimg.com/a.jpg", "gen": "",
         "gen_prompt_en": "x"},
        {"no": 3, "type": "뉴스", "brand": "Claude", "media_url": "https://video.twimg.com/b.mp4?tag=12",
         "gen": "", "gen_prompt_en": "y"},
        {"no": 4, "type": "뉴스", "brand": "Gemini", "media_url": "", "gen": "gemini",
         "gen_prompt_en": "A robot arm on a desk"},
        {"no": 5, "type": "CTA", "media_url": "", "gen": ""},
    ]


def 굽기판(옛=None, 그림=None, 남은초=900.0):
    옛 = 옛 or 가짜옛서버()
    손, 시, 다음 = 손만들기(옛서버=옛, 그림=그림, 남은초=남은초)
    기록 = runs.새기록(번호, "9월 3주차", 2026)
    기록["재료"] = {"굽기장": 장들(), "표지": {"no": 1, "type": "표지", "headline": ["가", "나"]}, "count": 3,
                  "missing_brands": [{"brand": "Grok", "why": "X 계정을 못 읽음"}]}
    기록["단계"] = "그림"
    손.창고.쓰기(기록)
    return 손, 옛, 다음


def test_사진없는_소식만_그림을_만들어_주소를_넣는다():
    손, 옛, 다음 = 굽기판()
    runs.달리기(번호, "그림", 손)
    기록 = 손.창고.읽기(번호)
    장 = {s["no"]: s for s in 기록["재료"]["굽기장"]}
    assert 장[4]["media_url"].split("?")[0].endswith("/weekly/img/20260930-000000-00000001/04.png")
    assert 장[4]["gen"] == ""
    assert 장[2]["media_url"] == "https://pbs.twimg.com/a.jpg"  # 있던 사진은 그대로
    assert 장[5]["media_url"] == ""  # 마무리 카드는 그림을 안 만든다
    assert 기록["단계"] == "굽기" and 다음 == [(번호, "굽기")]


def test_그림을_못_만들면_그_장만_빼고_간다():
    손, 옛, 다음 = 굽기판(그림=가짜그림(빠질말="robot"))
    runs.달리기(번호, "그림", 손)
    기록 = 손.창고.읽기(번호)
    장 = {s["no"]: s for s in 기록["재료"]["굽기장"]}
    assert "잔액 부족" in 장[4]["_빠짐"] and 기록["단계"] == "굽기"


def test_굽기는_표지와_영상먼저_다된장만_번호순으로_넘긴다():
    옛 = 가짜옛서버(굽기={3: ("됨", 3), 4: ("됨", 1)})
    손, 옛, 다음 = 굽기판(옛=옛)
    runs.달리기(번호, "그림", 손)
    runs.달리기(번호, "굽기", 손)
    기록 = 손.창고.읽기(번호)
    assert 기록["state"] == "됨" and 기록["pct"] == 100, 기록.get("error")
    시작순서 = [x for x in 옛.부른것 if x[0] in ("표지굽기", "장굽기")]
    assert 시작순서[0] == ("표지굽기", 1) and 시작순서[1][1] == 3  # 영상(3번)이 사진보다 먼저
    넷째 = [x for x in 시작순서 if x[1] == 4][0]
    assert 넷째[2].startswith("https://fake-s3/weekly/img/") and 넷째[3] == ""  # 만든 그림 주소를 넘긴다
    넘김 = [x for x in 옛.부른것 if x[0] == "넘겨보기"][0]
    assert 넘김[1] == "9월 3주차 AI 소식" and [n for n, _ in 넘김[2]] == [1, 2, 3, 4, 5]
    assert 기록["result"] == {"viewer": "https://fake-s3/viewer/abc.html", "slides": 5, "missing_slides": [],
                             "missing_brands": [{"brand": "Grok", "why": "X 계정을 못 읽음"}]}


def test_6분_넘게_안_구워지는_장은_빼고_넘긴다():
    옛 = 가짜옛서버(굽기={3: ("영원히", 0)})
    손, 옛, 다음 = 굽기판(옛=옛)
    runs.달리기(번호, "그림", 손)
    runs.달리기(번호, "굽기", 손)
    기록 = 손.창고.읽기(번호)
    assert 기록["state"] == "됨"
    assert 기록["result"]["missing_slides"] == [{"no": 3, "why": "영상, 시간 초과(6분)"}]
    assert [n for n, _ in [x for x in 옛.부른것 if x[0] == "넘겨보기"][0][2]] == [1, 2, 4, 5]


def test_굽다_죽은_장은_이유와_함께_뺀다():
    옛 = 가짜옛서버(굽기={2: ("실패", 1)})
    손, 옛, 다음 = 굽기판(옛=옛)
    runs.달리기(번호, "그림", 손)
    runs.달리기(번호, "굽기", 손)
    assert 손.창고.읽기(번호)["result"]["missing_slides"] == [{"no": 2, "why": "굽기 실패 — 굽다 죽음"}]


def test_람다_시간이_모자라면_남은_장을_빼고_끝낸다():
    옛 = 가짜옛서버(굽기={3: ("됨", 20), 4: ("됨", 20)})
    손, 옛, 다음 = 굽기판(옛=옛, 남은초=150.0)
    runs.달리기(번호, "그림", 손)
    runs.달리기(번호, "굽기", 손)
    기록 = 손.창고.읽기(번호)
    assert 기록["state"] == "됨", 기록.get("error")
    assert {x["no"] for x in 기록["result"]["missing_slides"]} == {3, 4}
    assert all("시간이 모자라" in x["why"] for x in 기록["result"]["missing_slides"])


def test_소식카드를_하나도_못_구우면_멈춘다():
    옛 = 가짜옛서버(굽기={2: ("실패", 1), 3: ("실패", 1), 4: ("실패", 1)})
    손, 옛, 다음 = 굽기판(옛=옛)
    runs.달리기(번호, "그림", 손)
    runs.달리기(번호, "굽기", 손)
    기록 = 손.창고.읽기(번호)
    assert 기록["state"] == "실패" and "한 장도 못 구움" in 기록["error"]
    assert not any(x[0] == "넘겨보기" for x in 옛.부른것)


def test_넘겨보기가_실패하면_성공으로_안_뜬다():
    class 넘겨보기탈(가짜옛서버):
        def 넘겨보기(self, 제목, 장들):
            raise oldserver.옛서버탈(500, "boom")

    손, 옛, 다음 = 굽기판(옛=넘겨보기탈())
    runs.달리기(번호, "그림", 손)
    runs.달리기(번호, "굽기", 손)
    기록 = 손.창고.읽기(번호)
    assert 기록["state"] == "실패" and "옛 서버 500" in 기록["error"] and 기록["result"] is None


def test_이어서_다시_그림은_빠졌던_장만_다시_그린다():
    손, 옛, 다음 = 굽기판(그림=가짜그림(빠질말="robot"))
    runs.달리기(번호, "그림", 손)
    손.그림 = 가짜그림()
    runs.달리기(번호, "그림", 손)
    장 = {s["no"]: s for s in 손.창고.읽기(번호)["재료"]["굽기장"]}
    assert "_빠짐" not in 장[4] and 장[4]["media_url"].split("?")[0].endswith("/04.png")


def test_이어서_다시_굽기는_만든_그림_주소를_새로_받는다():
    손, 옛, 다음 = 굽기판()
    runs.달리기(번호, "그림", 손)
    기록 = 손.창고.읽기(번호)
    for s in 기록["재료"]["굽기장"]:
        if s["no"] == 4:
            s["media_url"] = "https://만료된-주소/04.png"  # 한 시간이 지나 서명이 만료된 주소
    손.창고.쓰기(기록)
    runs.달리기(번호, "굽기", 손)
    넷째 = [x for x in 옛.부른것 if x[0] == "장굽기" and x[1] == 4][0]
    assert 넷째[2].startswith("https://fake-s3/weekly/img/20260930-000000-00000001/04.png")
    assert 장들()[0]["media_url"] == [x for x in 옛.부른것 if x[0] == "장굽기" and x[1] == 2][0][2]  # 남의 사진은 그대로


def test_쓴_돈은_딥시크와_그림만_세고_표지_사용량도_넣는다():
    손, 옛, 다음 = 굽기판()
    runs.달리기(번호, "그림", 손)
    runs.달리기(번호, "굽기", 손)
    기록 = 손.창고.읽기(번호)
    assert [u["종류"] for u in 기록["재료"]["그림기록"]] == ["소식", "표지"]
    값 = 기록["cost"]
    assert 값["그림장수"] == 2 and 값["표지값모름"] is False
    assert 값["그림"] == round((40 * 5 + 1600 * 30 + 900 * 5 + 3000 * 8 + 1600 * 30) / 1e6, 4)


def test_옛_서버가_표지_사용량을_안_주면_모른다고_적는다():
    class 옛판(가짜옛서버):
        def 번호표(self, 번):
            답 = super().번호표(번)
            답.pop("사용량", None)
            return 답

    손, 옛, 다음 = 굽기판(옛=옛판())
    runs.달리기(번호, "그림", 손)
    runs.달리기(번호, "굽기", 손)
    assert 손.창고.읽기(번호)["cost"]["표지값모름"] is True
