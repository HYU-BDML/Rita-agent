# -*- coding: utf-8 -*-
import json
from datetime import date
from pathlib import Path

from fakes import 가짜S3
from fakes_topic import KAITO, 가짜대화, 가짜실행, 가짜지휘자, 트윗, 주제손, 현장만들기
from topic import conductor, flow, trace


def 사건들(s3, 번호):
    return [json.loads(v) for k, v in sorted(s3.것들.items()) if k.startswith(f"weekly/trace/{번호}/")]


def test_사건마다_파일_하나_열쇠는_가리고_그림은_길이만():
    s3 = 가짜S3()
    흔 = trace.흔적(s3, "통", "weekly/", "20261001-030000-aaaaaaaa")
    흔.쓰기("판정관", {"보낸것": [{"role": "user", "content": [
        {"type": "text", "text": "번호 E1#1 열쇠 sk-abcdef1234567"},
        {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + "A" * 5000}}]}]})
    흔.쓰기("관문", {"결과": {"통과": []}})
    키들 = sorted(s3.것들)
    assert len(키들) == 2 and all(k.startswith("weekly/trace/20261001-030000-aaaaaaaa/") for k in 키들)
    assert 키들[0].endswith("-판정관.json") and 키들[1].endswith("-관문.json")  # 쓴 차례대로
    x = 사건들(s3, "20261001-030000-aaaaaaaa")[0]
    조각 = x["보낸것"][0]["content"]
    assert 조각[0]["text"] == "번호 E1#1 열쇠 sk-***"
    assert 조각[1]["image_url"]["url"] == "(그림 base64 5,023자 — 생략)"
    assert x["종류"] == "판정관" and x["시각"].endswith("Z")


def test_창고가_없거나_못_쓰면_조용히_넘어간다():
    trace.흔적().쓰기("지휘", {"x": 1})  # 가짜 현장 — 아무것도 안 한다

    class 깨진S3:
        def put_object(self, **kw):
            raise OSError("끊김")

    trace.흔적(깨진S3(), "통", "weekly/", "j").쓰기("지휘", {"x": 1})  # 판을 멈추지 않는다


def test_감싼대화는_보낸것_전체와_생각_답을_남긴다():
    s3 = 가짜S3()

    def 대화(메시지들, 한도, **kw):
        return {"모델": "deepseek-v4-pro", "글": '{"말": "어느 기간?"}', "넘침": False, "도구호출": [],
                "메시지": {"role": "assistant", "content": "", "reasoning_content": "기간이 안 정해졌다"},
                "입력토큰": 900, "캐시토큰": 0, "출력토큰": 120, "생각토큰": 80, "초": 3}

    부르기 = trace.감싼대화(대화, trace.흔적(s3, "통", "weekly/", "c1"), "다듬기")
    보낸 = [{"role": "system", "content": "지시"}, {"role": "user", "content": "코르티스 소식 보고 싶어"}]
    assert 부르기(보낸, 8000, 읽기=160)["글"] == '{"말": "어느 기간?"}'
    x = 사건들(s3, "c1")[0]
    assert (x["종류"], x["한도"], x["걸음"], x["생각"], x["답글"]) == ("다듬기", 8000, None, "기간이 안 정해졌다",
                                                                '{"말": "어느 기간?"}')
    assert x["보낸것"] == 보낸 and x["토큰"]["생각토큰"] == 80


def test_지휘자는_걸음마다_새로_보낸것과_생각을_남기고_구간끝에_못본것을():
    s3 = 가짜S3()
    현 = 현장만들기(가짜실행({KAITO: [트윗(1)]}))
    현.흔적 = trace.흔적(s3, "통", "weekly/", 현.job)
    대화 = 가짜지휘자([[("x_search", {"query": "CORTIS"})], [("submit_result", {"items": [], "unfilled": []})]])
    assert conductor.구간(현, 대화, lambda: 900.0, lambda: None) == "냄"
    xs = 사건들(s3, 현.job)
    assert [x["종류"] for x in xs] == ["지휘", "지휘", "구간끝"]
    첫, 둘, 끝 = xs
    assert [m["role"] for m in 첫["보낸것"]] == ["system", "user"] and 첫["이어짐"] is False
    assert (첫["걸음"], 첫["단계"], 첫["생각"], 첫["도구호출"][0]["이름"]) == (1, "①", "생각1", "x_search")
    assert [m["role"] for m in 둘["보낸것"]] == ["tool"] and 둘["이어짐"] is True  # 앞 답(생각 글)은 다시 안 싣는다
    assert "E1 · X @cortis_official" in 둘["보낸것"][0]["content"]
    assert 끝["끝"] == "냄" and [m["role"] for m in 끝["못본것"]] == ["tool"]
    assert 끝["못본것"][0]["content"].startswith("받았다")


def test_대화_한턴은_사람_말과_다듬기_생각과_결과를_남긴다():
    손, _ = 주제손(가짜대화(다듬기대본=[{"말": "어느 기간을 볼까요?", "주문서": None}]))
    손.창고.대화쓰기({"chat": "c1", "state": "생각 중", "messages": [{"who": "사람", "text": "코르티스 소식 보고 싶어"}],
                    "order": None, "error": None})
    flow.대화한턴("c1", 손, date(2026, 10, 1))
    xs = 사건들(손.창고.s3, "c1")
    assert [x["종류"] for x in xs] == ["다듬기", "다듬기끝"]
    assert xs[0]["보낸것"][-1] == {"role": "user", "content": "코르티스 소식 보고 싶어"}
    assert (xs[1]["상태"], xs[1]["말"], xs[1]["주문서"]) == ("답함", "어느 기간을 볼까요?", None)


def test_앞문은_기록_칸을_읽지_않는다():
    앞문 = (Path(__file__).resolve().parents[1] / "server" / "app.py").read_text(encoding="utf-8")
    assert "trace/" not in 앞문
