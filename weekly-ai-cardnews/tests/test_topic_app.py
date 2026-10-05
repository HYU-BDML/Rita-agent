# -*- coding: utf-8 -*-
import json
import re
from datetime import datetime, timedelta, timezone

import app
import store
from fakes import 가짜S3
from fakes_topic import 주문서
from topic import flow

넉넉 = {"apify": {"쓸수있는합": 9.0, "낮음": False, "멈춤": False, "모름": False}, "deepseek": {"남은": 56.0, "멈춤": False}}
바닥 = {"apify": {"쓸수있는합": 0.6, "낮음": True, "멈춤": True, "모름": False}, "deepseek": {"남은": 56.0, "멈춤": False}}


def 준비(지갑=넉넉):
    창, 불린, 대화불린 = store.창고(가짜S3(), "통"), [], []
    kw = dict(창고=창, 다음부르기=lambda j, s: 불린.append((j, s)), 대화부르기=대화불린.append, 지갑=lambda: 지갑,
              지금=datetime(2026, 10, 1, 3, 0, tzinfo=timezone.utc))
    return 창, 불린, 대화불린, kw


def 부르기(방법, 길, 몸=None, **kw):
    event = {"rawPath": 길, "requestContext": {"http": {"method": 방법}},
             "body": json.dumps(몸, ensure_ascii=False) if 몸 is not None else None}
    답 = app.처리(event, **kw)
    return 답["statusCode"], json.loads(답["body"])


def test_대화를_시작하면_번호를_주고_뒤에서_생각한다():
    창, 불린, 대화불린, kw = 준비()
    상태, 몸 = 부르기("POST", "/topic/chat", {"text": "코르티스 소식 보고 싶어"}, **kw)
    assert 상태 == 202 and 대화불린 == [몸["chat"]]
    d = 창.대화읽기(몸["chat"])
    assert d["state"] == "생각 중" and d["messages"] == [{"who": "사람", "text": "코르티스 소식 보고 싶어"}]


def test_생각_중엔_못_보내고_답한_뒤엔_잇는다():
    창, 불린, 대화불린, kw = 준비()
    _, 몸 = 부르기("POST", "/topic/chat", {"text": "코르티스"}, **kw)
    assert 부르기("POST", "/topic/chat", {"chat": 몸["chat"], "text": "지난주"}, **kw)[0] == 409
    d = 창.대화읽기(몸["chat"])
    d["state"] = "답함"
    창.대화쓰기(d)
    assert 부르기("POST", "/topic/chat", {"chat": 몸["chat"], "text": "지난주"}, **kw)[0] == 202
    assert [m["text"] for m in 창.대화읽기(몸["chat"])["messages"]] == ["코르티스", "지난주"]
    for 몸2 in ({"text": ""}, {"text": "가" * 1001}):
        assert 부르기("POST", "/topic/chat", 몸2, **kw)[0] == 400
    assert 부르기("POST", "/topic/chat", {"chat": "20000101-000000-00000000", "text": "a"}, **kw)[0] == 404


def test_대화_보기는_재료를_빼고_오래_생각중이면_실패로():
    창, 불린, 대화불린, kw = 준비()
    창.s3.put_object(Bucket="통", Key="weekly/chats/20261001-025000-aaaaaaaa.json", Body=json.dumps(
        {"chat": "20261001-025000-aaaaaaaa", "state": "생각 중", "messages": [], "order": None, "error": None,
         "updated": "2026-10-01T02:50:00Z", "cost": {"딥시크": 0.004, "합계": 0.004}, "재료": {"딥시크기록": []}},
        ensure_ascii=False).encode("utf-8"))
    상태, d = 부르기("GET", "/topic/chat/20261001-025000-aaaaaaaa", **kw)
    assert 상태 == 200 and d["state"] == "실패" and "늦어요" in d["error"] and "재료" not in d
    assert d["cost"]["합계"] == 0.004  # 화면 «주제 다듬기에 쓴 돈»


def test_주문서가_없으면_모으기_못한다():
    창, 불린, 대화불린, kw = 준비()
    _, 몸 = 부르기("POST", "/topic/chat", {"text": "코르티스"}, **kw)
    상태, d = 부르기("POST", "/topic/make", {"chat": 몸["chat"]}, **kw)
    assert 상태 == 409 and "주문서" in d["error"] and 불린 == []


def 주문서있는대화(창):
    창.대화쓰기({"chat": "20261001-020000-cccccccc", "state": "답함", "messages": [], "order": 주문서, "error": None})
    return "20261001-020000-cccccccc"


def test_지갑이_바닥이면_새_분야_판을_안_만든다():
    창, 불린, 대화불린, kw = 준비(바닥)
    상태, d = 부르기("POST", "/topic/make", {"chat": 주문서있는대화(창)}, **kw)
    assert 상태 == 503 and "자료 모으기" in d["error"] and "AI 소식은 그대로" in d["error"] and 창.목록() == []
    assert 부르기("POST", "/make", {"week": "9월 3주차", "year": 2026}, **kw)[0] == 202  # AI 소식은 된다


def test_모으기는_주제_판을_만들고_모으기부터():
    창, 불린, 대화불린, kw = 준비()
    상태, d = 부르기("POST", "/topic/make", {"chat": 주문서있는대화(창)}, **kw)
    기록 = 창.읽기(d["job"])
    assert 상태 == 202 and 불린 == [(d["job"], "모으기")]
    assert 기록["kind"] == "주제" and 기록["order"] == 주문서 and 기록["chat"] == "20261001-020000-cccccccc"


def test_주제_판_보기는_미디어에_서명주소를_붙인다():
    창, 불린, 대화불린, kw = 준비()
    기록 = flow.새기록("20261001-030000-dddddddd", 주문서)
    기록.update(state="됨", result={"bundle": [{"순서": 1, "미디어": {"갈래": "영상", "키": "weekly/topic/x/media/01.mp4",
                                                                   "대표키": "weekly/topic/x/media/01_t.jpg"}}],
                                   "unfilled": [], "dropped": []})
    창.쓰기(기록)
    상태, d = 부르기("GET", "/jobs/20261001-030000-dddddddd", **kw)
    m = d["result"]["bundle"][0]["미디어"]
    assert m["주소"].startswith("https://fake-s3/weekly/topic/x/media/01.mp4") and m["대표주소"].endswith("Signature=abc")
    assert "주소" not in 창.읽기("20261001-030000-dddddddd")["result"]["bundle"][0]["미디어"]
    assert d["kind"] == "주제" and "lines" in d


def test_지갑_보기와_진짜_지갑_셈(monkeypatch):
    창, 불린, 대화불린, kw = 준비(바닥)
    assert 부르기("GET", "/wallet", **kw) == (200, 바닥)
    monkeypatch.setattr(app.apify, "지갑", lambda: {"쓸수있는합": 3.0, "낮음": False, "멈춤": False, "모름": False, "열쇠": []})
    monkeypatch.setattr(app.deepseek, "잔액", lambda: 4.5)
    w = app._지갑()
    assert w == {"apify": {"쓸수있는합": 3.0, "낮음": False, "멈춤": False, "모름": False},
                 "deepseek": {"남은": 4.5, "멈춤": True}}


def test_뒤에서_부르면_단계_이름으로_갈린다(monkeypatch):
    받은 = []
    monkeypatch.setattr(app, "주제손만들기", lambda context=None: "주제손")
    monkeypatch.setattr(app, "손만들기", lambda context=None: "주간손")
    monkeypatch.setattr(app.flow, "달리기", lambda job, 단계, 손: 받은.append(("주제", job, 단계, 손)) or {"ok": True})
    monkeypatch.setattr(app.runs, "달리기", lambda job, 단계, 손: 받은.append(("주간", job, 단계, 손)) or {"ok": True})
    monkeypatch.setattr(app.flow, "대화한턴", lambda 번호, 손, 오늘: 받은.append(("대화", 번호, 손)) or {"ok": True})
    app.handler({"_job": "j", "_stage": "검증"}, None)
    app.handler({"_job": "j", "_stage": "굽기"}, None)
    app.handler({"_chat": "c"}, None)
    app.handler({"_job": "j", "_stage": "목록보기"}, None)  # 매주 볼 곳(계획 4) — 주간 판 단계 이름과 안 겹친다
    assert 받은 == [("주제", "j", "검증", "주제손"), ("주간", "j", "굽기", "주간손"), ("대화", "c", "주제손"),
                  ("주제", "j", "목록보기", "주제손")]


def test_같은_주문서로_두번_눌러도_판은_하나():
    # 새로고침하면 «이대로 모으기» 가 다시 보이던 것(UX 점검 Task 14) — 두 번 누르면 돈이 두 번 나갔다
    창, 불린, 대화불린, kw = 준비()
    번호 = 주문서있는대화(창)
    상태, 첫 = 부르기("POST", "/topic/make", {"chat": 번호}, **kw)
    assert 상태 == 202 and 창.대화읽기(번호)["job"] == 첫["job"]
    상태, 둘 = 부르기("POST", "/topic/make", {"chat": 번호}, **kw)
    assert 상태 == 200 and 둘 == {"job": 첫["job"]} and len(불린) == 1
    assert 부르기("GET", f"/topic/chat/{번호}", **kw)[1]["job"] == 첫["job"]


def test_생각_중인_대화로는_모으지_않는다():
    # 기간을 바꿔 달라고 보낸 뒤 기다리다 옛 주문서로 모으면 원치 않은 판 + 판 둘(최종 검토 I4)
    창, 불린, 대화불린, kw = 준비()
    번호 = 주문서있는대화(창)
    d = 창.대화읽기(번호)
    d["state"] = "생각 중"
    창.대화쓰기(d)
    상태, 몸 = 부르기("POST", "/topic/make", {"chat": 번호}, **kw)
    assert 상태 == 409 and "답을 기다리는 중" in 몸["error"] and 불린 == []


def test_새_분야는_동시에_두_판까지():
    # 익명 누구나 판을 몇 개든 동시에 띄우면 돈과 AI 소식의 람다 칸을 다 쓴다(최종 검토 C1)
    창, 불린, 대화불린, kw = 준비()
    for i in range(app.동시상한):
        창.쓰기(flow.새기록(f"20261001-0{i}0000-aaaaaaa{i}", 주문서))  # 만드는 중
    상태, 몸 = 부르기("POST", "/topic/make", {"chat": 주문서있는대화(창)}, **kw)
    assert 상태 == 409 and "모으는 중" in 몸["error"] and "AI 소식은 그대로" in 몸["error"] and 불린 == []


def test_새_분야는_하루_상한까지():
    창, 불린, 대화불린, kw = 준비()
    for i in range(app.하루상한):
        기록 = flow.새기록(f"20261001-01{i:02d}00-bbbbbbb{i % 10}", 주문서)
        기록.update(state="됨", started="2026-10-01T01:00:00Z")  # 한국 시간 10/1 10시
        창.쓰기(기록)
    상태, 몸 = 부르기("POST", "/topic/make", {"chat": 주문서있는대화(창)}, **kw)
    assert 상태 == 409 and "오늘" in 몸["error"] and 불린 == []
    어제 = flow.새기록("20260930-010000-cccccccc", 주문서)
    어제.update(state="됨", started="2026-09-30T01:00:00Z")
    assert app._오늘판수([store.요약(어제)], kw["지금"]) == 0  # 어제 판은 안 센다


def test_평가_판은_동시_하루_셈에서_뺀다():
    # 밤새 평가 18판이 «하루 10판·동시 2판» 을 채워 아침에 사람이 판을 못 돌렸을 것(계획 3)
    창, 불린, 대화불린, kw = 준비()
    for i in range(app.하루상한):
        기록 = flow.새기록(f"20261001-01{i:02d}00-eeeeeee{i % 10}", 주문서)
        기록.update(started="2026-10-01T01:00:00Z", 평가=True)  # 한국 시간 10/1 10시, 아직 만드는 중
        창.쓰기(기록)
    상태, 몸 = 부르기("POST", "/topic/make", {"chat": 주문서있는대화(창)}, **kw)
    assert 상태 == 202 and 불린  # 판을 만들었다(202 = 뒤에서 돈다)


딥바닥 = {"apify": 넉넉["apify"], "deepseek": {"남은": 3.0, "멈춤": True}}


def 카드판(창, 카드, **더):
    기록 = flow.새기록("20261001-040000-dddddddd", 주문서)
    기록.update({"state": "됨", "pct": 100, "result": {"bundle": [{"사건": "가"}], "카드": 카드}, **더})
    기록["재료"].update(카드={"이름표": "9월 3주차", "분야": "코르티스"}, 딥시크={"본문대본": {"글": "옛 대본"}})
    창.쓰기(기록)
    return 기록["job"]


def test_카드가_실패한_판은_대본부터_카드만_다시_굽는다():
    # 카드가 실패해도 판이 «됨» 이라 화면에서 카드만 다시 구울 길이 없었다(계획 4 D-4)
    창, 불린, _, kw = 준비()
    job = 카드판(창, {"오류": "그림 못 만듦"})
    상태, 몸 = 부르기("POST", f"/topic/jobs/{job}/cards", {}, **kw)
    assert 상태 == 202 and 몸 == {"job": job} and 불린 == [(job, "카드대본")]
    기록 = 창.읽기(job)
    assert (기록["state"], 기록["단계"], 기록["pct"], 기록["카드다시"]) == ("만드는 중", "카드대본", 50, 1)
    assert 기록["result"] == {"bundle": [{"사건": "가"}]} and "카드" not in 기록["재료"] and "딥시크" not in 기록["재료"]
    assert 부르기("GET", f"/jobs/{job}", **kw)[1]["카드다시"] == 1


def test_카드_다시_굽기는_다시_시작한_때를_적어_화면이_그때부터_센다():
    # 어제 끝난 판을 다시 구우면 화면이 «만드는 중 · 1,440분» 처럼 판 처음부터 셌다(과제 35 화면 점검)
    창, 불린, _, kw = 준비()
    job = 카드판(창, {"오류": "그림 못 만듦"})
    부르기("POST", f"/topic/jobs/{job}/cards", {}, **kw)
    기록 = 창.읽기(job)
    assert re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ", 기록.get("다시시작") or "")
    assert 부르기("GET", f"/jobs/{job}", **kw)[1]["다시시작"] == 기록["다시시작"]


def test_빠진_장이_있어도_다시_굽고_한_판에_두_번까지():
    창, 불린, _, kw = 준비()
    job = 카드판(창, {"보기": "https://v/1.html", "장수": 6, "빠진장": [{"no": 6, "why": "그림 못 만듦"}]}, 카드다시=1)
    assert 부르기("POST", f"/topic/jobs/{job}/cards", {}, **kw)[0] == 202
    기록 = 창.읽기(job)
    기록.update(state="됨", result={"bundle": [{"사건": "가"}], "카드": {"오류": "또"}})
    창.쓰기(기록)
    상태, 몸 = 부르기("POST", f"/topic/jobs/{job}/cards", {}, **kw)
    assert 상태 == 409 and "2번까지" in 몸["error"]


def test_카드가_멀쩡하거나_만드는_중이면_안_굽고_딥시크가_바닥이면_503():
    창, 불린, _, kw = 준비()
    job = 카드판(창, {"보기": "https://v/1.html", "장수": 7, "빠진장": []})
    assert 부르기("POST", f"/topic/jobs/{job}/cards", {}, **kw)[0] == 409
    job = 카드판(창, {"오류": "x"}, state="만드는 중")
    assert 부르기("POST", f"/topic/jobs/{job}/cards", {}, **kw)[0] == 409
    assert 부르기("POST", "/topic/jobs/20000101-000000-00000000/cards", {}, **kw)[0] == 404
    창, 불린, _, kw = 준비(딥바닥)
    job = 카드판(창, {"오류": "x"})
    상태, 몸 = 부르기("POST", f"/topic/jobs/{job}/cards", {}, **kw)
    assert 상태 == 503 and 불린 == [] and 창.읽기(job)["state"] == "됨"


def _멈춘판(창, 분전: int, **더) -> str:
    기록 = flow.새기록("20261001-050000-eeeeeeee", 주문서)
    기록.update({"state": "만드는 중", "단계": "카드굽기", **더})
    창.쓰기(기록)
    기록["updated"] = (datetime(2026, 10, 1, 3, 0, tzinfo=timezone.utc) - timedelta(minutes=분전)).strftime("%Y-%m-%dT%H:%M:%SZ")
    창.s3.put_object(Bucket=창.통, Key=창._키(기록["job"]), Body=json.dumps(기록, ensure_ascii=False).encode("utf-8"))
    return 기록["job"]


def test_16분_넘게_그대로인_주제_판은_볼_때_지금_단계를_다시_부른다():
    # 카드그림 뒤 카드굽기를 부르는 신호가 사라져 판이 40분 멈췄다(진짜 시험 1, 2026-10-05) — 람다는 15분이면 끝나니
    # 16분 넘게 진행이 없으면 죽었거나 안 불린 것이다(과제 42)
    창, 불린, _, kw = 준비()
    job = _멈춘판(창, 17)
    상태, 몸 = 부르기("GET", f"/jobs/{job}", **kw)
    assert 상태 == 200 and 몸["state"] == "만드는 중" and 불린 == [(job, "카드굽기")]
    assert 창.읽기(job)["되부름"] == 1
    부르기("GET", f"/jobs/{job}", **kw)  # 방금 다시 불렀다 — 또 부르지 않는다
    assert 불린 == [(job, "카드굽기")]


def test_다시_부르기는_판마다_두_번까지_16분_안이나_주간_판은_안_부른다():
    창, 불린, _, kw = 준비()
    job = _멈춘판(창, 20, 되부름=2)
    assert 부르기("GET", f"/jobs/{job}", **kw)[1]["state"] == "만드는 중" and 불린 == []
    job = _멈춘판(창, 10)
    부르기("GET", f"/jobs/{job}", **kw)
    assert 불린 == []
    job = _멈춘판(창, 20, kind="주간")
    부르기("GET", f"/jobs/{job}", **kw)
    assert 불린 == []
