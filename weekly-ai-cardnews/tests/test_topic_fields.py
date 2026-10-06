# -*- coding: utf-8 -*-
import json
from datetime import date, datetime, timezone

import app
import runs
import store
from fakes import 가짜S3
from fakes_topic import 주문서
from topic import flow

넉넉 = {"apify": {"쓸수있는합": 9.0, "낮음": False, "멈춤": False, "모름": False}, "deepseek": {"남은": 56.0, "멈춤": False}}
바닥 = {"apify": {"쓸수있는합": 0.6, "낮음": True, "멈춤": True, "모름": False}, "deepseek": {"남은": 56.0, "멈춤": False}}


def 준비(지갑=넉넉):
    창, 불린 = store.창고(가짜S3(), "통"), []
    kw = dict(창고=창, 다음부르기=lambda j, s: 불린.append((j, s)), 대화부르기=lambda 번호: None, 지갑=lambda: 지갑,
              오늘=date(2026, 10, 1), 지금=datetime(2026, 10, 1, 3, 0, tzinfo=timezone.utc))
    return 창, 불린, kw


def 부르기(방법, 길, 몸=None, **kw):
    event = {"rawPath": 길, "requestContext": {"http": {"method": 방법}},
             "body": json.dumps(몸, ensure_ascii=False) if 몸 is not None else None}
    답 = app.처리(event, **kw)
    return 답["statusCode"], json.loads(답["body"])


def 끝난판(창, 번호="20261001-030000-dddddddd", **더):
    기록 = flow.새기록(번호, 주문서, "20261001-020000-cccccccc")
    기록.update({"state": "됨", "result": {"bundle": [{"순서": 1}], "unfilled": [], "dropped": []}})
    기록.update(더)
    창.쓰기(기록)
    return 번호


def test_끝난_판을_분야로_저장하면_목록에_새것부터():
    창, _, kw = 준비()
    번호 = 끝난판(창)
    바뀐때 = 창.읽기(번호)["updated"]
    상태, 몸 = 부르기("POST", "/topic/fields", {"job": 번호}, **kw)
    assert 상태 == 201
    f = 창.분야읽기(몸["field"])
    assert (f["이름"], f["job"]) == ("코르티스", 번호)
    assert f["본"] == {k: 주문서[k] for k in ("주제", "범위", "넣을것", "뺄것", "목표건수", "한장단위", "분야이름", "등급")}
    assert 창.읽기(번호)["updated"] == 바뀐때  # 판 기록은 안 건드린다 — 걸린 시간이 늘지 않게
    assert 부르기("POST", "/topic/fields", {"job": 번호}, **kw) == (200, {"field": 몸["field"]})  # 두 번 눌러도 하나
    상태, 목록 = 부르기("GET", "/topic/fields", **kw)
    assert 상태 == 200 and [x["field"] for x in 목록["fields"]] == [몸["field"]]
    assert 목록["fields"][0]["본"]["주제"] == 주문서["주제"]


def test_저장_못_하는_판():
    창, _, kw = 준비()
    assert 부르기("POST", "/topic/fields", {"job": "20000101-000000-00000000"}, **kw)[0] == 404
    assert 부르기("POST", "/topic/fields", {"job": 끝난판(창, state="만드는 중")}, **kw)[0] == 409
    빈 = 끝난판(창, "20261001-030000-eeeeeeee", result={"bundle": [], "unfilled": [], "dropped": []})
    assert 부르기("POST", "/topic/fields", {"job": 빈}, **kw)[0] == 409
    창.쓰기(runs.새기록("20261001-030000-12121212", "9월 3주차", 2026))
    assert 부르기("POST", "/topic/fields", {"job": "20261001-030000-12121212"}, **kw)[0] == 409  # AI 소식 판
    assert 부르기("POST", "/topic/fields", {"job": 끝난판(창, "20261001-030000-ffffffff")}, **kw)[0] == 201
    상태, d = 부르기("POST", "/topic/fields", {"job": 끝난판(창, "20261001-030000-abababab")}, **kw)
    assert 상태 == 409 and "같은 이름" in d["error"]


def test_저장된_분야로_기간만_골라_모은다():
    창, 불린, kw = 준비()
    _, 몸 = 부르기("POST", "/topic/fields", {"job": 끝난판(창)}, **kw)
    상태, d = 부르기("POST", "/topic/make", {"field": 몸["field"], "기간": {"종류": "이번주"}}, **kw)
    assert 상태 == 202 and 불린 == [(d["job"], "모으기")]
    기록 = 창.읽기(d["job"])
    assert (기록["kind"], 기록["field"], 기록["chat"]) == ("주제", 몸["field"], None)
    o = 기록["order"]
    assert (o["시작"], o["끝"], o["기간말"]) == ("2026-09-28", "2026-10-04", "이번 주")
    assert (o["주제"], o["목표건수"], o["예산"]) == (주문서["주제"], 주문서["목표건수"], 주문서["예산"])
    _, d = 부르기("POST", "/topic/make", {"field": 몸["field"], "기간": {"종류": "최근N일", "N": 7}}, **kw)
    assert 창.읽기(d["job"])["order"]["기간말"] == "최근 7일"


def test_저장된_분야로_모으기_거절():
    창, 불린, kw = 준비(바닥)
    _, 몸 = 부르기("POST", "/topic/fields", {"job": 끝난판(창)}, **kw)  # 저장은 지갑과 상관없다
    assert 부르기("POST", "/topic/make", {"field": "20000101-000000-00000000", "기간": {"종류": "지난주"}}, **kw)[0] == 404
    상태, d = 부르기("POST", "/topic/make", {"field": 몸["field"],
                                         "기간": {"종류": "직접", "시작": "2026-01-01", "끝": "2026-01-02"}}, **kw)
    assert 상태 == 400 and "기간은" in d["error"]
    상태, d = 부르기("POST", "/topic/make", {"field": 몸["field"], "기간": {"종류": "지난주"}}, **kw)
    assert 상태 == 503 and "AI 소식은 그대로" in d["error"] and 불린 == []


def test_분야로_저장할_때_주제에서_기간_말을_뺀다():
    # «하츠투하츠 지난주 소식» 이 저장돼 «최근 7일» 로 돌려도 주제에 «지난주» 가 남았다(판 4, 2026-10-02)
    창, _, kw = 준비()
    번호 = 끝난판(창, order={**주문서, "주제": "하츠투하츠 지난주 소식", "분야이름": "하츠투하츠"})
    상태, 몸 = 부르기("POST", "/topic/fields", {"job": 번호}, **kw)
    assert 상태 == 201 and 창.분야읽기(몸["field"])["본"]["주제"] == "하츠투하츠 소식"
    assert app._기간말빼기("엔비디아 최근 7일 주가") == "엔비디아 주가" and app._기간말빼기("이번 달") == "이번 달"


def test_분야_목록은_기간마다_실제_날짜를_같이_준다():
    # 기간 목록이 «최근 7일» 처럼 말만 있어 누르기 전엔 날짜를 몰랐다(판 4, 2026-10-02) — 판을 만들 때와 같은 셈으로
    _, _, kw = 준비()  # 오늘 2026-10-01 (목)
    상태, 몸 = 부르기("GET", "/topic/fields", **kw)
    assert 상태 == 200 and 몸["기간들"] == {
        "지난주": ["2026-09-21", "2026-09-27"], "이번주": ["2026-09-28", "2026-10-04"],
        "최근N일": ["2026-09-25", "2026-10-01"], "이번달": ["2026-10-01", "2026-10-31"], "지난달": ["2026-09-01", "2026-09-30"],
        "주차": [["2026-09-28", "2026-10-04", "9월 4주차"], ["2026-09-21", "2026-09-27", "9월 3주차"],
                ["2026-09-14", "2026-09-20", "9월 2주차"], ["2026-09-07", "2026-09-13", "9월 1주차"]]}


def test_분야로_저장할_때_공식_출처_명단을_같이_남긴다():
    창, _, kw = 준비()
    번호 = 끝난판(창, result={"bundle": [
        {"순서": 1, "출처": {"플랫폼": "x", "계정": "cortis_official"}, "딱지": []},
        {"순서": 2, "출처": {"플랫폼": "x", "계정": "cortis_official"}, "딱지": []},
        {"순서": 3, "출처": {"플랫폼": "x", "계정": "fan_acc"}, "딱지": ["2차"]}], "unfilled": [], "dropped": []})
    상태, 몸 = 부르기("POST", "/topic/fields", {"job": 번호}, **kw)
    assert 상태 == 201 and 창.분야읽기(몸["field"])["출처명단"] == ["x:cortis_official"]


def test_분야는_누구나_지우고_사본을_남긴다():
    # 저장한 브라우저의 «표» 검사를 없앴다 — 모두가 보고 모두가 지운다(사용자 2026-10-05)
    창, _, kw = 준비()
    번호 = 끝난판(창)
    상태, 몸 = 부르기("POST", "/topic/fields", {"job": 번호}, **kw)
    분야 = 몸["field"]
    assert (상태, 몸) == (201, {"field": 분야}) and "지우기지문" not in 창.분야읽기(분야)
    원본 = 창.분야읽기(분야)
    assert 부르기("POST", "/topic/fields/20000101-000000-00000000/delete", {}, **kw)[0] == 404
    assert 부르기("POST", f"/topic/fields/{분야}/delete", {}, **kw) == (200, {"지움": 분야})
    assert 창.분야읽기(분야) is None and 창.읽기(번호)["state"] == "됨"  # 판 기록은 그대로
    assert 창._읽기키(f"weekly/memory/backup/fields/{분야}.json") == 원본
    옛 = "20261001-030000-99999999"
    창.분야쓰기({"field": 옛, "이름": "옛것", "본": {}, "job": 번호, "saved": "", "지우기지문": "ab" * 32})  # 표를 받던 옛 분야
    assert 부르기("POST", f"/topic/fields/{옛}/delete", None, **kw) == (200, {"지움": 옛})


def test_500_기록엔_몸통의_칸_이름과_길이만(monkeypatch, capsys):
    # 지우기 표만 가리고 사용자가 친 말 앞 300자는 서버 기록에 남았다(작은 것 5)
    class 흔들창고:
        def 분야읽기(self, 번호):
            raise RuntimeError("S3 흔들림")

    monkeypatch.setattr(app, "_창고", lambda: 흔들창고())
    event = {"rawPath": "/topic/fields/20261001-030000-dddddddd/delete", "requestContext": {"http": {"method": "POST"}},
             "body": json.dumps({"표": "x" * 32, "말": "사용자가 친 비밀 문장"}, ensure_ascii=False)}
    assert app.handler(event, None)["statusCode"] == 500
    out = capsys.readouterr().out
    assert "사용자가 친 비밀 문장" not in out and "표 32자" in out and "말 12자" in out
    event["body"] = "JSON 아닌 사용자 글"
    app.handler(event, None)
    out = capsys.readouterr().out
    assert "JSON 아닌 사용자 글" not in out and "JSON 아님" in out


def test_저장된_분야는_몇_월_몇_주차로도_모은다():
    창, 불린, kw = 준비()  # 오늘 2026-10-01 (목)
    _, 몸 = 부르기("POST", "/topic/fields", {"job": 끝난판(창)}, **kw)
    상태, d = 부르기("POST", "/topic/make", {"field": 몸["field"], "기간": {"종류": "주차", "앞": 2}}, **kw)
    assert 상태 == 202
    o = 창.읽기(d["job"])["order"]
    assert (o["시작"], o["끝"], o["기간말"]) == ("2026-09-14", "2026-09-20", "9월 2주차")  # 카드 표지 이름표와 같은 셈
    상태, d = 부르기("POST", "/topic/make", {"field": 몸["field"], "기간": {"종류": "주차", "앞": 4}}, **kw)
    assert 상태 == 400 and "주차는" in d["error"]


후보들 = [
    {"도구": "x_account", "인자": {"account": "CORTIS_official", "deep": True, "count": 40}, "까닭": "공식 계정",
     "글": "X @CORTIS_official 최근 글 40개", "숫자": "이번 판: 기간 안 글 3개 · 소식 1건에 쓰임", "갈래": None},
    {"도구": "web_search", "인자": {"query": "코르티스", "use_period": True}, "까닭": "기사",
     "글": "웹·뉴스에서 «코르티스» 검색", "숫자": "이번 판에서 안 봄", "갈래": None},
    {"도구": "instagram_account", "인자": {"account": "cortis_official", "deep": True}, "까닭": "공식 인스타",
     "글": "인스타 @cortis_official 최근 글 30개", "숫자": "이번 판: 기간 안 글 2개 · 소식 0건에 쓰임", "갈래": None}]
줄들 = [{k: x[k] for k in ("도구", "인자", "까닭")} for x in 후보들]


def 목록판(창, 번호="20261001-030000-dddddddd", 후보=None, **더):
    return 끝난판(창, 번호, result={"bundle": [{"순서": 1}], "unfilled": [], "dropped": [],
                                  "목록후보": 후보들 if 후보 is None else 후보}, **더)


def test_저장할_때_남긴_줄만_분야에_남기고_화면이_보낸_목록은_안_받는다():
    창, _, kw = 준비()
    상태, 몸 = 부르기("POST", "/topic/fields", {"job": 목록판(창), "남길줄": [2, 0, 2],
                                             "목록": [{"도구": "read_page", "인자": {"url": "https://evil.example"}}]}, **kw)
    assert 상태 == 201 and 창.분야읽기(몸["field"])["목록"] == [줄들[2], 줄들[0]]
    목록 = 부르기("GET", "/topic/fields", **kw)[1]["fields"][0]
    assert 목록["목록"] == ["인스타 @cortis_official 최근 글 30개", "X @CORTIS_official 최근 글 40개"]


def test_남길줄이_없으면_후보_전부_다_빼면_목록_없이():
    창, _, kw = 준비()
    _, 몸 = 부르기("POST", "/topic/fields", {"job": 목록판(창)}, **kw)  # 옛 화면
    assert 창.분야읽기(몸["field"])["목록"] == 줄들
    _, 몸 = 부르기("POST", "/topic/fields", {"job": 목록판(창, "20261001-030000-eeeeeeee", order={**주문서, "분야이름": "코르티스2"}),
                                         "남길줄": []}, **kw)
    assert 창.분야읽기(몸["field"])["목록"] == []
    _, 몸 = 부르기("POST", "/topic/fields", {"job": 끝난판(창, "20261001-030000-ffffffff", order={**주문서, "분야이름": "옛판"})},
                **kw)
    assert 창.분야읽기(몸["field"])["목록"] == []  # 목록후보가 없는 옛 판


def test_남길줄이_틀리면_400_이고_분야를_안_만든다():
    창, _, kw = 준비()
    번호 = 목록판(창)
    for 틀린 in ([3], [-1], ["0"], [True], "0", [0.0]):
        상태, d = 부르기("POST", "/topic/fields", {"job": 번호, "남길줄": 틀린}, **kw)
        assert 상태 == 400 and "남길 줄" in d["error"], 틀린
    많은 = [{**후보들[1], "인자": {"query": f"코르티스{i}", "use_period": True}} for i in range(12)]
    상태, d = 부르기("POST", "/topic/fields", {"job": 목록판(창, "20261001-030000-eeeeeeee", 후보=많은),
                                            "남길줄": list(range(11))}, **kw)
    assert 상태 == 400 and "10곳까지" in d["error"]
    assert 창.분야목록() == []


def test_목록이_있는_분야로_모으면_목록보기부터_없으면_모으기부터():
    창, 불린, kw = 준비()
    _, 몸 = 부르기("POST", "/topic/fields", {"job": 목록판(창), "남길줄": [0, 1]}, **kw)
    상태, d = 부르기("POST", "/topic/make", {"field": 몸["field"], "기간": {"종류": "지난주"}}, **kw)
    기록 = 창.읽기(d["job"])
    assert 상태 == 202 and 불린 == [(d["job"], "목록보기")]
    assert (기록["목록"], 기록["단계"]) == (줄들[:2], "목록보기")
    _, 빈 = 부르기("POST", "/topic/fields", {"job": 목록판(창, "20261001-030000-eeeeeeee",
                                                          order={**주문서, "분야이름": "코르티스2"}), "남길줄": []}, **kw)
    _, d = 부르기("POST", "/topic/make", {"field": 빈["field"], "기간": {"종류": "지난주"}}, **kw)
    assert 불린[-1] == (d["job"], "모으기") and "목록" not in 창.읽기(d["job"])


def test_매주_볼_곳_바꾸기는_누구나_그_분야로_끝난_판에서만():
    창, _, kw = 준비()
    _, 몸 = 부르기("POST", "/topic/fields", {"job": 목록판(창), "남길줄": [0]}, **kw)
    분야 = 몸["field"]
    새판 = 끝난판(창, "20261001-040000-aaaaaaaa", field=분야, result={
        "bundle": [{"순서": 1, "출처": {"플랫폼": "instagram", "계정": "cortis_official"}, "딱지": []}], "unfilled": [],
        "dropped": [], "목록후보": [{**후보들[0], "갈래": "지금 목록"}, {**후보들[2], "갈래": "새로 찾은 곳"}]})
    길 = f"/topic/fields/{분야}/list"
    assert 부르기("POST", "/topic/fields/20000101-000000-00000000/list", {"job": 새판, "남길줄": [0]}, **kw)[0] == 404
    assert 부르기("POST", 길, {"job": 목록판(창, "20261001-050000-bbbbbbbb"), "남길줄": [0]}, **kw)[0] == 409  # 다른 판
    assert 부르기("POST", 길, {"job": 끝난판(창, "20261001-060000-cccccccc", field=분야, state="만드는 중"),
                          "남길줄": [0]}, **kw)[0] == 409
    assert 부르기("POST", 길, {"job": "없는판", "남길줄": [0]}, **kw)[0] == 409
    assert 부르기("POST", 길, {"job": 새판, "남길줄": [5]}, **kw)[0] == 400
    assert 부르기("POST", 길, {"job": 새판}, **kw)[0] == 400
    상태, d = 부르기("POST", 길, {"job": 새판, "남길줄": [0, 1]}, **kw)
    assert (상태, d) == (200, {"field": 분야, "목록": ["X @CORTIS_official 최근 글 40개", "인스타 @cortis_official 최근 글 30개"]})
    f = 창.분야읽기(분야)
    assert f["목록"] == [줄들[0], 줄들[2]] and f["출처명단"] == ["instagram:cortis_official"]
