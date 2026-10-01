# -*- coding: utf-8 -*-
import json
from datetime import date

import store
from fakes import 가짜S3
from fakes_topic import KAITO, 가짜대화, 가짜실행, 주문서, 주제손, 트윗
from topic import flow

JOB = "20261001-030000-bbbbbbbb"
좋은 = {"hero": "그룹", "event": "뮤직비디오 공개", "summary": "코르티스가 9월 24일 뮤직비디오 «FaSHioN» 을 공개했다 [E1].",
      "date": "2026-09-24", "source": "E1", "quote": "CORTIS 'FaSHioN' 뮤직비디오 공개", "media": "E1"}
나쁜 = {**좋은, "source": "E99"}
보기 = [("x_account", {"account": "CORTIS_official", "deep": True}),
      ("update_board", {"stage": "④", "judgment": "x:cortis_official 공식 — 인증 계정",
                        "source_verdicts": [{"place": "x:cortis_official", "verdict": "공식", "basis": "인증"}]})]


def 내기(*소식, 칸=()):
    return [("submit_result", {"items": list(소식), "unfilled": list(칸)})]


def 판(지휘대본, **kw):
    실행 = 가짜실행({KAITO: [트윗(1, 좋아요=12400, 영상=True, 글="CORTIS 'FaSHioN' 뮤직비디오 공개"), 트윗(2), 트윗(3)]})
    손, 부른다음 = 주제손(가짜대화(지휘대본), 실행, **kw)
    기록 = flow.새기록(JOB, 주문서)
    기록["started"] = "2026-10-01T03:00:00Z"
    손.창고.쓰기(기록)
    return 손, 부른다음


def 끝까지(손, 부른다음, 처음="모으기", 최대=10):
    flow.달리기(JOB, 처음, 손)
    for _ in range(최대):
        if not 부른다음:
            break
        flow.달리기(*부른다음.pop(0), 손)
    return 손.창고.읽기(JOB)


def test_한_판이_처음부터_끝까지():
    칸 = [{"slot": "음악방송", "searched": ["x:cortis_official"], "why": "그 주 음악방송 글 없음"}]
    손, 부른다음 = 판([보기, 내기(좋은, 칸=칸)])
    기록 = 끝까지(손, 부른다음)
    assert 기록["state"] == "됨" and 기록["pct"] == 100, 기록.get("error")
    assert [s["name"] for s in 기록["steps"]] == ["모으기", "검증", "정리"]
    소식 = 기록["result"]["bundle"][0]
    assert (소식["순서"], 소식["주인공"], 소식["출처"]["계정"], 소식["딱지"]) == (1, "그룹", "cortis_official", [])
    assert 소식["미디어"]["갈래"] == "영상" and 소식["미디어"]["키"] == f"weekly/topic/{JOB}/media/01.mp4"
    assert 기록["result"]["unfilled"] == 칸 and 기록["result"]["dropped"] == []
    assert "④ x:cortis_official 공식 — 인증 계정" in 기록["lines"] and len(기록["board"]["칸"]) == 4
    assert 기록["cost"]["딥시크"] > 0 and 기록["cost"]["아피파이"] > 0
    걸음들 = 기록["spend"]
    assert [x["걸음"] for x in 걸음들] == [1, 2, None] and 걸음들[-1]["단계"] == "검증·정리"  # 판정관은 걸음 밖
    assert abs(sum(x["합계"] for x in 걸음들) - 기록["cost"]["합계"]) < 0.001


def test_되돌려_보내면_모으기로_가서_고쳐_낸다():
    손, 부른다음 = 판([보기, 내기(나쁜), 내기(좋은)])
    기록 = 끝까지(손, 부른다음)
    assert [s["name"] for s in 기록["steps"]] == ["모으기", "검증", "모으기", "검증", "정리"], 기록.get("error")
    assert 기록["재료"]["되돌림"] == 1 and len(기록["result"]["bundle"]) == 1
    둘째구간 = 손.대화.지휘.받은[2]["메시지들"][1]["content"]
    assert "## 관문이 돌려보낸 것" in 둘째구간 and "없는 증거 번호 E99" in 둘째구간


def test_세번_되돌려도_그대로면_빼고_끝낸다():
    손, 부른다음 = 판([보기, 내기(나쁜), 내기(나쁜)])
    기록 = 끝까지(손, 부른다음)
    assert 기록["state"] == "됨" and 기록["result"]["bundle"] == []
    assert 기록["result"]["dropped"] == [{"사건": "뮤직비디오 공개", "까닭": "없는 증거 번호 E99 — 도구 결과의 번호만"}]


def test_시간이_모자라면_이어_달린다():
    손, 부른다음 = 판([보기, 내기(좋은)], 남은=100.0)
    flow.달리기(JOB, "모으기", 손)
    기록 = 손.창고.읽기(JOB)
    assert 부른다음 == [(JOB, "모으기")] and 기록["state"] == "만드는 중" and 기록["steps"][-1]["state"] == "하는 중"


def 대화판(다듬기대본):
    손, _ = 주제손(가짜대화(다듬기대본=다듬기대본))
    손.창고.대화쓰기({"chat": "c1", "state": "생각 중", "messages": [{"who": "사람", "text": "코르티스 소식 보고 싶어"}],
                    "order": None, "error": None})
    return 손


주문 = {"주제": "코르티스(CORTIS)", "범위": "그룹", "기간": {"말": "지난주", "종류": "지난주"}, "넣을것": ["컴백"],
      "뺄것": ["루머"], "목표건수": 5, "한장단위": "소식 하나", "분야이름": "코르티스", "등급": "B"}


def test_대화_한턴은_묻거나_주문서를_낸다():
    손 = 대화판([{"말": "어느 기간을 볼까요? 이번 주 / 지난주", "주문서": None}, {"말": "이렇게 모을게요", "주문서": 주문}])
    flow.대화한턴("c1", 손, date(2026, 10, 1))
    d = 손.창고.대화읽기("c1")
    assert d["state"] == "답함" and d["order"] is None and d["messages"][-1] == {"who": "지휘자", "text": "어느 기간을 볼까요? 이번 주 / 지난주"}
    assert "오늘은 2026-10-01(목요일" in 손.대화.다듬기받은[0][0]["content"]
    d["messages"].append({"who": "사람", "text": "지난주"})
    손.창고.대화쓰기(d)
    flow.대화한턴("c1", 손, date(2026, 10, 1))
    d = 손.창고.대화읽기("c1")
    assert (d["order"]["시작"], d["order"]["끝"], d["order"]["예산"]["호출"]) == ("2026-09-21", "2026-09-27", 50)
    assert [m["role"] for m in 손.대화.다듬기받은[1][1:]] == ["user", "assistant", "user"] and d["cost"]["딥시크"] > 0


def test_틀린_주문서는_한번_고쳐_달라고_한다():
    손 = 대화판([{"말": "이렇게", "주문서": {**주문, "분야이름": "가나다라마바사아자차카타"}}, {"말": "줄였어요", "주문서": 주문}])
    flow.대화한턴("c1", 손, date(2026, 10, 1))
    assert "주문서에 문제가 있다: 분야 이름" in 손.대화.다듬기받은[1][-1]["content"]
    d = 손.창고.대화읽기("c1")
    assert d["order"]["분야이름"] == "코르티스" and d["messages"][-1]["text"] == "줄였어요"


def test_다듬기가_넘치면_한도를_올려_다시_묻는다():
    손 = 대화판(["넘침", {"말": "어느 기간을 볼까요?", "주문서": None}])
    flow.대화한턴("c1", 손, date(2026, 10, 1))
    assert 손.대화.다듬기한도 == [(8000, 160), (16000, 260)]
    assert 손.대화.다듬기받은[1] == 손.대화.다듬기받은[0]  # 넘친 빈 답은 대화에 붙이지 않는다
    d = 손.창고.대화읽기("c1")
    assert d["state"] == "답함" and d["messages"][-1]["text"] == "어느 기간을 볼까요?"


def test_다듬기가_JSON_을_못_내면_실패():
    손 = 대화판(["그냥 글", "또 글"])
    flow.대화한턴("c1", 손, date(2026, 10, 1))
    d = 손.창고.대화읽기("c1")
    assert d["state"] == "실패" and "다시 보내" in d["error"]


def test_창고_목록은_작업판과_판단줄을_빼고_미디어는_서명주소로():
    창 = store.창고(가짜S3(), "통")
    기록 = flow.새기록(JOB, 주문서)
    기록.update(board={"단계": "①"}, lines=["① 시작"])
    창.쓰기(기록)
    줄 = 창.목록()[0]
    assert 줄["kind"] == "주제" and 줄["order"]["분야이름"] == "코르티스" and "board" not in 줄 and "lines" not in 줄 and "spend" not in 줄
    assert store.요약(창.읽기(JOB))["lines"] == ["① 시작"]
    키 = 창.미디어올리기(JOB, "01.mp4", b"x", "video/mp4")
    assert 키 == f"weekly/topic/{JOB}/media/01.mp4" and 창.서명주소(키).startswith("https://fake-s3/")


def test_판_기록에_지휘_판정관_관문이_차례로_쌓인다():
    손, 부른다음 = 판([보기, 내기(좋은)])
    끝까지(손, 부른다음)
    종류들 = [json.loads(v)["종류"] for k, v in sorted(손.창고.s3.것들.items()) if k.startswith(f"weekly/trace/{JOB}/")]
    assert 종류들[:2] == ["지휘", "지휘"] and {"구간끝", "판정관", "관문"} <= set(종류들)
    assert 종류들.index("관문") > 종류들.index("구간끝")


def test_새_답이_오면_이전_판_표시를_지운다():
    # 같은 주문서는 한 번만 모은다(app /topic/make) — 대화로 주문서를 다시 받으면 다시 모을 수 있어야 한다
    손 = 대화판([{"말": "이렇게 모을게요", "주문서": 주문}])
    d = 손.창고.대화읽기("c1")
    d["job"] = "20261001-030000-cccccccc"
    손.창고.대화쓰기(d)
    flow.대화한턴("c1", 손, date(2026, 10, 1))
    assert 손.창고.대화읽기("c1")["job"] is None


def test_도중에_끈_도구와_까닭이_결과에_남는다():
    # 분량이 떨어져 X·인스타를 못 본 결과를 «그 주 소식이 적었다» 로 읽게 된다(최종 검토 I5)
    from topic.apify import 도구탈
    실행 = 가짜실행({KAITO: [트윗(1, 좋아요=12400, 영상=True, 글="CORTIS 'FaSHioN' 뮤직비디오 공개"), 트윗(2)],
                  "apify~instagram-hashtag-scraper": 도구탈("돈", "Apify 이번 달 분량이 모자라요")})
    손, 부른다음 = 주제손(가짜대화([보기 + [("instagram_search", {"query": "cortis"})], 내기(좋은)]), 실행)
    기록 = flow.새기록(JOB, 주문서)
    기록["started"] = "2026-10-01T03:00:00Z"
    손.창고.쓰기(기록)
    기록 = 끝까지(손, 부른다음)
    assert 기록["state"] == "됨", 기록.get("error")
    assert {"도구": "instagram_search", "까닭": "Apify 분량이 모자라다"} in 기록["result"]["blocked"]
