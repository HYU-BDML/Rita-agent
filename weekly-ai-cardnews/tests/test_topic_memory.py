# -*- coding: utf-8 -*-
from datetime import datetime, timedelta, timezone

import store
from fakes import 가짜S3
from topic import memory

지금 = datetime(2026, 10, 3, 12, 0, tzinfo=timezone.utc)


def 기억():
    return memory.기억창고(가짜S3(), "통")


def 카드(곳, 이름들=(), 판정="공식", 근거="", 확인한날="2026-10-01", 판들=()):
    return {"출처": 곳, "이름들": list(이름들), "판정": 판정, "근거": 근거, "확인한날": 확인한날, "판들": list(판들)}


def test_출처_카드는_곳_꼴을_맞춰_한_파일에():
    m = 기억()
    m.출처쓰기(카드("x:hearts2hearts", ["하츠투하츠"]))
    assert m.출처읽기("X:@Hearts2Hearts")["이름들"] == ["하츠투하츠"]
    m.출처쓰기(카드("web:Some Site/뉴스"))
    키들 = sorted(m.s3.것들)
    assert 키들[0].startswith("weekly/memory/sources/web_some_site_뉴스_") and 키들[1] == "weekly/memory/sources/x_hearts2hearts.json"
    assert {c["출처"] for c in m.출처들()} == {"x:hearts2hearts", "web:Some Site/뉴스"}


def test_긁은_결과는_진행_중_6시간_끝난_기간_7일까지():
    m = 기억()
    m.긁은것쓰기("abc", [{"text": "a"}], 지금)
    assert m.긁은것읽기("abc", 지금 + timedelta(hours=5), 진행중=True) == ([{"text": "a"}], 5.0)
    assert m.긁은것읽기("abc", 지금 + timedelta(hours=7), 진행중=True) is None
    assert m.긁은것읽기("abc", 지금 + timedelta(days=6), 진행중=False)[1] == 144.0
    assert m.긁은것읽기("abc", 지금 + timedelta(days=8), 진행중=False) is None


def test_빈_결과는_안_남기고_읽기가_깨져도_없는_셈():
    m = 기억()
    m.긁은것쓰기("빈", [], 지금)
    assert m.긁은것읽기("빈", 지금, 진행중=True) is None and m.s3.것들 == {}

    class 깨진S3(가짜S3):
        def get_object(self, Bucket, Key):
            raise RuntimeError("S3 흔들림")

        def list_objects_v2(self, **kw):
            raise RuntimeError("S3 흔들림")

    m2 = memory.기억창고(깨진S3(), "통")
    assert m2.출처읽기("x:a") is None and m2.출처들() == [] and m2.분야명단들(["a"]) == []
    assert m2.긁은것읽기("abc", 지금, 진행중=True) is None


def test_기억_꺼내기는_이름으로_찾고_저장한_분야_명단을_맨_앞에():
    m = 기억()
    m.출처쓰기(카드("x:hearts2hearts", ["하츠투하츠", "Hearts2Hearts"], 근거="인증·487K", 확인한날="2026-08-20",
                  판들=[{"판": "j1", "가져온글": 12, "쓰인": 5, "영상비율": 0.4}]))
    m.출처쓰기(카드("instagram:hearts2hearts", ["하츠투하츠"], 근거="인증"))
    m.출처쓰기(카드("x:cortis_official", ["코르티스"]))
    store.창고(m.s3, "통").분야쓰기({"field": "20261002-001726-e9d9da6c", "이름": "하츠투하츠", "본": {},
                                  "출처명단": ["instagram:hearts2hearts"]})
    줄 = memory.꺼내기글(m, ["하 츠 투 하 츠"], "2026-10-03").splitlines()
    assert 줄[0] == "기억 꺼내기 «하 츠 투 하 츠» — 아는 출처 2곳"
    assert 줄[1] == "저장한 분야 «하츠투하츠» 의 출처 명단: instagram:hearts2hearts"
    assert 줄[2].startswith("instagram:hearts2hearts · 공식 (인증) · 확인 2026-10-01 · 판 0번")
    assert 줄[3] == ("x:hearts2hearts · 공식 (인증·487K) · 확인 2026-08-20 — 30일 지남, 다시 확인 필요 · 판 1번"
                    " · 최근 판: 가져온 글 12 · 결과에 쓰임 5 · 영상 40%")
    assert 줄[-1].startswith("늘 새 출처도 20%") and "cortis" not in "\n".join(줄)
    assert "x:hearts2hearts" in memory.꺼내기글(m, ["@Hearts2Hearts"], "2026-10-03")  # 계정 이름으로도
    assert "처음 보는 주제다" in memory.꺼내기글(m, ["엔비디아"], "2026-10-03")


def test_판이_끝나면_판정과_성적을_출처마다_남긴다():
    m = 기억()
    기록 = {"job": "j2", "order": {"분야이름": "하츠투하츠"},
          "재료": {"작업판": {"출처판정": {"x:@hearts2hearts": {"판정": "공식", "근거": "인증"},
                                    "x:fan_acc": {"판정": "팬", "근거": "팬 계정"}}}},
          "result": {"bundle": [{"주인공": "카르멘", "출처": {"플랫폼": "x", "계정": "hearts2hearts"}},
                                {"주인공": "그룹", "출처": {"플랫폼": "x", "계정": "hearts2hearts"}}]}}
    것들 = {"E1": {"플랫폼": "x", "계정": "hearts2hearts", "미디어": [{"갈래": "영상"}]},
           "E2": {"플랫폼": "x", "계정": "hearts2hearts", "미디어": []},
           "E3": {"플랫폼": "x", "계정": "fan_acc"}, "E4": {"플랫폼": "page", "계정": "namu.wiki"}}
    assert memory.판끝적기(m, 기록, 것들, "2026-10-03") == 2
    공 = m.출처읽기("x:hearts2hearts")
    assert (공["판정"], 공["확인한날"], 공["이름들"]) == ("공식", "2026-10-03", ["하츠투하츠", "카르멘"])
    assert 공["판들"] == [{"판": "j2", "가져온글": 2, "쓰인": 2, "영상비율": 0.5}]
    assert m.출처읽기("x:fan_acc")["이름들"] == [] and m.출처읽기("page:namu.wiki") is None
    for i in range(12):
        memory.판끝적기(m, {**기록, "job": f"j{i + 3}"}, 것들, "2026-10-03")
    assert len(m.출처읽기("x:hearts2hearts")["판들"]) == 10


def test_진행_중에_긁은_것은_기간이_끝나면_다시_안_쓴다():
    # 수요일 «이번 주» 로 긁은 것을 다음 월요일 «지난주» 판이 «끝난 기간 7일» 로 받아 뒷부분 소식이 빠졌을 것(최종 검토 I1)
    m = 기억()
    m.긁은것쓰기("주", [{"text": "a"}], 지금, 진행중=True)
    assert m.긁은것읽기("주", 지금 + timedelta(hours=2), 진행중=True) is not None
    assert m.긁은것읽기("주", 지금 + timedelta(days=5), 진행중=False) is None
    m.긁은것쓰기("끝", [{"text": "b"}], 지금, 진행중=False)
    assert m.긁은것읽기("끝", 지금 + timedelta(days=5), 진행중=False) is not None


def test_바꾼_글자가_있는_출처는_파일_이름이_겹치지_않는다():
    # 일본어·전각 계정은 «_» 로 바뀌어 다른 계정과 한 파일이 될 수 있었다(작은 것 2)
    m = 기억()
    m.출처쓰기(카드("x:さくら", ["사쿠라"]))
    m.출처쓰기(카드("x:ひなた", ["히나타"]))
    assert m.출처읽기("x:さくら")["이름들"] == ["사쿠라"] and m.출처읽기("x:ひなた")["이름들"] == ["히나타"]


def _판기록(job):
    return {"job": job, "order": {"분야이름": "하츠투하츠"},
            "재료": {"작업판": {"출처판정": {"x:hearts2hearts": {"판정": "공식", "근거": "인증"}}}},
            "result": {"bundle": [{"주인공": "카르멘", "출처": {"플랫폼": "x", "계정": "hearts2hearts"}}]}}


def test_같은_판을_두_번_적어도_판들엔_한_번():
    # 정리를 다시 돌리면 같은 판이 두 번 적혔다(작은 것 3)
    m = 기억()
    memory.판끝적기(m, _판기록("j1"), {}, "2026-10-03")
    memory.판끝적기(m, _판기록("j1"), {}, "2026-10-03")
    assert [p["판"] for p in m.출처읽기("x:hearts2hearts")["판들"]] == ["j1"]


def test_다른_판이_동시에_덮어써도_다시_합친다():
    # 두 판이 같은 성적표를 읽고 고쳐 쓰면 나중 것이 덮어 한 판 기록이 빠졌다(작은 것 3)
    m = 기억()
    원래 = m.출처쓰기
    끼어듦 = []

    def 쓰기(카드_):
        원래(카드_)
        if not 끼어듦:  # 우리가 쓴 바로 뒤, 먼저 읽어 둔 다른 판이 제 기록만 넣어 덮는다
            끼어듦.append(1)
            원래({**카드_, "판들": [{"판": "다른판", "가져온글": 1, "쓰인": 0, "영상비율": 0}]})

    m.출처쓰기 = 쓰기
    memory.판끝적기(m, _판기록("j2"), {}, "2026-10-03")
    assert {p["판"] for p in m.출처읽기("x:hearts2hearts")["판들"]} == {"다른판", "j2"}


def test_기억_꺼내기는_분야_목록을_한_번만_읽는다():
    # 이름마다 분야 목록 전체를 다시 읽었다(작은 것 4)
    m = 기억()
    store.창고(m.s3, "통").분야쓰기({"field": "20261002-001726-e9d9da6c", "이름": "하츠투하츠", "본": {},
                                  "출처명단": ["instagram:hearts2hearts"]})
    목록 = []
    원래 = m.s3.list_objects_v2
    m.s3.list_objects_v2 = lambda **kw: 목록.append(kw["Prefix"]) or 원래(**kw)
    글 = memory.꺼내기글(m, ["하츠투하츠", "하투하", "H2H"], "2026-10-03")
    assert "저장한 분야 «하츠투하츠»" in 글 and 목록.count("weekly/fields/") == 1


def test_성적표는_나란히_읽는다():
    # 성적표를 하나씩 차례로 읽어 쌓일수록 느려졌다(작은 것 4) — 30장 × 0.05초면 차례로 1.5초
    import time

    class 느린S3(가짜S3):
        def get_object(self, Bucket, Key):
            time.sleep(0.05)
            return super().get_object(Bucket, Key)

    m = memory.기억창고(느린S3(), "통")
    for i in range(30):
        m.출처쓰기(카드(f"x:acc{i}"))
    t = time.perf_counter()
    assert len(m.출처들()) == 30 and time.perf_counter() - t < 0.8


def test_묵은_긁은_결과는_치우고_성적표는_둔다():
    # 긁은 결과를 치우는 장치가 없어 창고에 쌓였다(작은 것 11)
    m = 기억()
    m.s3.때 = lambda: 지금 - timedelta(days=8)
    m.긁은것쓰기("묵은", [{"text": "a"}], 지금 - timedelta(days=8))
    m.출처쓰기(카드("x:a"))
    m.s3.때 = lambda: 지금 - timedelta(days=2)
    m.긁은것쓰기("새", [{"text": "b"}], 지금 - timedelta(days=2))
    assert m.묵은것치우기(지금) == 1
    assert sorted(m.s3.것들) == ["weekly/memory/scrapes/새.json", "weekly/memory/sources/x_a.json"]
