# -*- coding: utf-8 -*-
from fakes_topic import KAITO, 가짜실행, 가짜지휘자, 트윗, 현장만들기
from topic import conductor, instructions


def 돌리기(대본, 현=None, 남은=900.0):
    현 = 현 or 현장만들기(가짜실행({KAITO: [트윗(1), 트윗(2)]}))
    대화, 저장 = 가짜지휘자(대본), []
    끝 = conductor.구간(현, 대화, lambda: 남은, lambda: 저장.append(1))
    return 끝, 현, 대화, 저장


제출 = ("submit_result", {"items": [{"event": "MV"}], "unfilled": []})


def test_구간은_지시문과_작업판으로_시작하고_생각글을_되돌린다():
    끝, 현, 대화, 저장 = 돌리기([[("x_search", {"query": "CORTIS"}), ("web_search", {"query": "코르티스"})], [제출]])
    첫 = 대화.받은[0]["메시지들"]
    assert 첫[0] == {"role": "system", "content": instructions.지휘자} and 첫[1]["content"].startswith("# 작업판")
    둘 = 대화.받은[1]["메시지들"]
    assert 둘[2]["reasoning_content"] == "생각1" and [m["role"] for m in 둘[3:]] == ["tool", "tool"]
    assert [m["tool_call_id"] for m in 둘[3:]] == ["c1_0", "c1_1"] and "E1 · X @cortis_official" in 둘[3]["content"]
    assert 끝 == "냄" and 현.재료["제출"]["items"] == [{"event": "MV"}] and len(저장) == 2
    assert [x["열쇠"] for x in 현.재료["딥시크기록"]] == ["지휘", "지휘"] and 현.재료["딥시크기록"][0]["모델"] == "deepseek-v4-pro"
    assert [(x["걸음"], x["단계"]) for x in 현.재료["딥시크기록"]] == [(1, "①"), (2, "①")]
    assert [x["걸음"] for x in 현.예산.기록] == [1, 1] and 현.재료["지금걸음"] is None and 현.재료["걸음수"] == 2


def test_걸음을_다_쓰면_계속_시간이_모자라면_시간():
    끝, *_ = 돌리기([[("update_board", {"judgment": f"판단 {i}"})] for i in range(conductor.구간걸음)])
    assert 끝 == "계속"
    끝, 현, 대화, _ = 돌리기([[제출]], 남은=100.0)
    assert 끝 == "시간" and 대화.받은 == []


def test_넘치면_한도를_두배로_하고_짧게_하라고_한다():
    끝, 현, 대화, _ = 돌리기(["넘침", [제출]], 남은=1000.0)  # 40000 걸음은 560 + 도구 390 = 950초가 있어야 한다(계획 4 B)
    assert [x["한도"] for x in 대화.받은] == [20000, 40000]
    assert [x["읽기"] for x in 대화.받은] == [310, 560]
    assert "생각이 한도를 넘었다" in 대화.받은[1]["메시지들"][-1]["content"] and 끝 == "냄"


def test_두배_한도_걸음에_시간이_모자라면_새_달리기로():
    # 20000 걸음은 700초(310 + 도구 390)면 되지만 40000 으로 다시 하려면 950초가 남아 있어야 한다
    끝, _, 대화, _ = 돌리기(["넘침", [제출]], 남은=700.0)
    assert 끝 == "시간" and [x["한도"] for x in 대화.받은] == [20000]


def test_글만_내면_도구로_하라고_재촉한다():
    끝, 현, 대화, _ = 돌리기(["글:생각 중입니다", [제출]])
    assert "submit_result" in 대화.받은[1]["메시지들"][-1]["content"] and 끝 == "냄"


def test_예산이_끝나면_submit_만_주고_두번_안내면_빈_결과로_낸다():
    현 = 현장만들기(분=41)
    끝, 현, 대화, _ = 돌리기(["글:음", "글:음"], 현=현)
    assert 대화.받은[0]["도구"] == ["submit_result"] and "예산을 다 썼다" in 대화.받은[0]["메시지들"][-1]["content"]
    assert 끝 == "냄" and 현.재료["제출"]["강제"] is True and 현.재료["제출"]["items"] == []
    assert 현.재료["제출"]["unfilled"][0]["why"].startswith("예산을 다 썼는데")


def test_한_걸음에_같은_호출이_둘이면_한번만():
    실행 = 가짜실행({KAITO: [트윗(1)]})
    끝, 현, 대화, _ = 돌리기([[("x_search", {"query": "a"}), ("x_search", {"query": "a"})], [제출]],
                          현=현장만들기(실행))
    assert len(실행.받은) == 1 and "이 걸음에 같은 호출" in 대화.받은[1]["메시지들"][-1]["content"]


def test_지시문에_생각의_사슬과_원칙_열셋이_다_있다():
    for 조각 in ("생각", "행동", "관찰", "판단", "① 이해하기", "⑦ 증거 다지기·정리", "13. 고르기는 후보를 펼쳐 비교한다",
               "영상은 네가 보지 않는다", "평소의 N배", "x:계정", "관문"):
        assert 조각 in instructions.지휘자, 조각


def test_지시문이_사진_갈래와_사진_속_글자를_알려_준다():
    # 사진은 모을 때 바로 판정하고, 사진 속 글자는 본문 끝에 붙는다(계획 4 B)
    assert "모을 때 판정관이 갈래를 붙여 온다" in instructions.지휘자 and "[사진 속 글자]" in instructions.지휘자
    assert "숫자는 받아 적은 그대로만" in instructions.지휘자 and "정리가 같은 글의 장면 사진으로 바꾸거나 뺀다" in instructions.지휘자


def test_걸음_전_남길_시간은_Apify_최악_기다림을_덮는다():
    # 도구 몫 120초는 Apify 시작 POST 60초 + 기다림 200초 + 마지막 GET 60초보다 짧아 걸음 도중 람다가 끊겼다(최종 검토 I3)
    from topic import apify
    assert conductor.도구기다림초 >= apify.기다림초 + 120


def test_걸음_전_남길_시간은_모을_때_사진_판정_마감까지_덮는다():
    # 도구마다 결과 글 전에 사진을 판정한다(계획 4 B) — 그 마감까지 걸음 시간에 넣어야 람다가 걸음 도중 안 끊긴다
    from topic import apify, tools
    assert conductor.도구기다림초 >= apify.기다림초 + 120 + tools.사진마감초


def test_다듬기_지시문은_칩과_목표_건수와_고치는_법을_말한다():
    # 칩에 «날짜와 제목», 하루 한 종목에 6건, «~도» 를 «그것만» 으로 — 진짜 한 판 10-01
    from datetime import date
    글 = instructions.다듬기(date(2026, 10, 1))
    assert "주인공" in 글 and "하루" in 글 and "고칠 칸만" in 글


def test_지휘자_지시문은_요약을_사람_말로_쓰게_한다():
    assert "해시태그·캡션을 그대로 옮기지" in instructions.지휘자 and "출처 정보" in instructions.지휘자


def test_세_걸음_동안_작업판을_안_적으면_재촉한다():
    # 17걸음에 작업판 5번 — 단계 표시가 멈춰 있었다(진짜 한 판 10-01)
    대본 = [[("x_search", {"query": f"q{i}"})] for i in range(3)] + [[제출]]
    끝, 현, 대화, _ = 돌리기(대본)
    재촉 = "작업판을 안 적었다"
    assert any(재촉 in str(m.get("content")) for m in 대화.받은[3]["메시지들"] if m["role"] == "user")
    assert not any(재촉 in str(m.get("content")) for m in 대화.받은[2]["메시지들"])


def test_지휘자_지시문은_못_채운_칸을_사람_말로_쓰게_한다():
    # «namu.wiki(E52)»·«403으로 열리지 않음»·«read_page로» 가 화면에 그대로 떴다(판 4)
    assert "사람이 그대로 읽는다" in instructions.지휘자 and "도구 이름" in instructions.지휘자


def test_다듬기_지시문은_주제에_기간_말을_넣지_않게_한다():
    from datetime import date
    assert "주제에는 기간 말" in instructions.다듬기(date(2026, 10, 2))


def test_다듬기_지시문의_분야_이름_길이는_코드와_같다():
    from datetime import date
    글 = instructions.다듬기(date(2026, 10, 3))
    assert "20자" in 글 and "11자" not in 글


def test_지휘자는_지도를_그리기_전에_기억을_꺼낸다():
    assert "recall_sources" in instructions.지휘자 and "30일" in instructions.지휘자


def test_기본_정보는_찾지_않는다고_말한다():
    # 카드뉴스는 기간 안 소식 전달용 — «MBTI도» 는 주문서에 안 넣고 찾지 않는다고 말한다(사용자 2026-10-04)
    from datetime import date
    다 = instructions.다듬기(date(2026, 10, 4))
    assert "기본 정보는 찾지 않아요" in 다 and "프로필" not in 다
    assert "profiles" not in instructions.지휘자 and "프로필" not in instructions.지휘자


def test_목록_판의_첫_구간에만_목록_결과를_작업판_뒤에_붙인다():
    현 = 현장만들기(가짜실행({KAITO: [트윗(1)]}))
    현.재료["목록글"] = [{"글": "X @CORTIS_official 최근 글 40개", "결과": "x_account @CORTIS_official (깊게 40) — 3건"}]
    끝, _, 대화, _ = 돌리기([[제출]], 현=현)
    첫 = 대화.받은[0]["메시지들"]
    assert 끝 == "냄" and len(첫) == 2 and 첫[1]["content"].startswith("# 작업판")
    assert 첫[1]["content"].endswith("### X @CORTIS_official 최근 글 40개\nx_account @CORTIS_official (깊게 40) — 3건")
    assert 현.재료["목록글보임"] is True
    _, _, 대화, _ = 돌리기([[제출]], 현=현)
    assert "저장한 목록으로 이미 모았다" not in 대화.받은[0]["메시지들"][1]["content"]
