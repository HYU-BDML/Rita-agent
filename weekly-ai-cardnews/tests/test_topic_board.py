# -*- coding: utf-8 -*-
from datetime import datetime, timezone

from fakes import 가짜S3
from topic import board
from topic.budget import 예산
from topic.evidence import 증거창고

주문서 = {"주제": "코르티스(CORTIS)", "범위": "그룹", "기간말": "이번 주", "시작": "2026-09-28", "끝": "2026-10-04",
        "넣을것": ["컴백"], "뺄것": ["루머"], "목표건수": 4, "한장단위": "소식 하나", "분야이름": "코르티스",
        "등급": "B", "예산": {"호출": 50, "돈": 2.0, "분": 40}}


def 창고():
    창 = 증거창고(가짜S3(), "통", "j")
    창.넣기({"플랫폼": "x", "계정": "cortis_official", "주소": "https://x.com/c/1", "날짜": "2026-09-30", "글": "MV",
            "반응": {"좋아요": 12400, "공유": 0}, "미디어": [{"갈래": "영상", "주소": "v.mp4"}]}, "x_search#1")
    창.넣기({"플랫폼": "x", "계정": "cortis_official", "주소": "https://x.com/c/2", "날짜": "2026-09-29", "글": "사진",
            "반응": {"좋아요": 100, "공유": 0}, "미디어": [{"갈래": "사진", "주소": "p.jpg"}]}, "x_search#1")
    return 창


def test_적기는_합치고_없는_번호는_뺀다():
    판, 창 = board.새판(), 창고()
    말 = board.적기(판, {"stage": "④", "judgment": "x:cortis_official 공식 판정",
                       "source_verdicts": [{"place": "X:cortis_official", "verdict": "공식", "basis": "소속사 사이트 연결"}],
                       "events": [{"name": "뮤직비디오 공개", "evidence": ["E2", "E99"], "status": "후보"}]},
                  "2026-10-01T03:05:00Z", lambda 번: 창.꺼내기(번) is not None)
    assert "E99 는 없는 증거 번호" in 말
    board.적기(판, {"judgment": "MV 글을 대표로", "events": [{"name": "뮤직비디오 공개", "evidence": ["E1"], "status": "채움"}]},
             "2026-10-01T03:06:00Z", lambda 번: True)
    assert 판["단계"] == "④" and 판["사건"]["뮤직비디오 공개"] == {"증거": ["E2", "E1"], "상태": "채움", "메모": ""}
    assert 판["출처판정"] == {"x:cortis_official": {"판정": "공식", "근거": "소속사 사이트 연결"}}
    assert board.판단줄(판) == ["④ x:cortis_official 공식 판정", "④ MV 글을 대표로"]


def test_틀린_적기는_아무것도_안_바꾼다():
    판 = board.새판()
    assert "①·②" in board.적기(판, {"stage": "⑧", "judgment": "x"}, "t", lambda 번: True)
    assert "judgment" in board.적기(판, {"stage": "②", "judgment": " "}, "t", lambda 번: True)
    assert 판 == board.새판()


def test_지휘자글과_화면요약():
    판, 창 = board.새판(), 창고()
    board.적기(판, {"stage": "⑤", "judgment": "MV 묶음", "guess_map": [{"place": "instagram:cortis", "why": "공지"}],
                    "source_verdicts": [{"place": "x:cortis_official", "verdict": "공식", "basis": "링크"}],
                    "events": [{"name": "뮤직비디오 공개", "evidence": ["E2", "E1"], "status": "채움"}]}, "t", lambda 번: True)
    기록 = [{"도구": "x_search", "지문": "a", "요약": "x_search «CORTIS»", "증거": ["E1", "E2"], "새것": 2, "탈": ""}]
    예 = 예산(주문서["예산"], {"호출기록": 기록}, datetime(2026, 10, 1, tzinfo=timezone.utc),
             lambda: datetime(2026, 10, 1, 0, 9, tzinfo=timezone.utc))
    글 = board.지휘자글(판, 주문서, 창, 기록, 예.한줄(), ["X 검색에서 새로 나오는 게 …"])
    for 조각 in ("## 주문서", "기간: 2026-09-28 ~ 2026-10-04 (이번 주)", "⑤ 단서 따라 깊게 — MV 묶음",
               "## 채울 칸 (4칸 중 1칸 채움)", "1. [채움] 뮤직비디오 공개 — E2, E1(x @cortis_official 09/30 ♥12,400",
               "· 영상)", "2~4. 빈칸", "짐작: 1) instagram:cortis — 공지",
               "확인: x:cortis_official — 공식 · 근거: 링크 · 가져온 2건 중 기간 안 2건, 영상 1건",
               "- x_search «CORTIS» → E1~E2 (새 것 2)", "## 경고", "[남은 예산] 도구 1/50번"):
        assert 조각 in 글, 조각
    요약 = board.화면요약(판, 주문서, 창, 예)
    assert 요약["단계"] == "⑤" and len(요약["칸"]) == 4
    assert 요약["칸"][0] == {"사건": "뮤직비디오 공개", "상태": "채움", "미디어": "영상"} and 요약["칸"][1]["상태"] == "빈칸"
    assert 요약["예산"] == {"호출": 1, "호출한도": 50, "돈": 0.0, "돈한도": 2.0, "남은분": 31.0}
