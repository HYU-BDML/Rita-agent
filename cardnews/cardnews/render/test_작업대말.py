# -*- coding: utf-8 -*-
"""작업대가 영어로도 구워지나. **눈으로는 못 잡는 종류라 기계가 센다.**

사람 지시 2026-09-19: 「영어로 바꾸면 모든 것이 영어로 되어야 한다」.

작업대는 카드를 다 구운 «뒤» 열리는 화면이라 **창고에 HTML 로 구워 올라간다**
— 라벨판처럼 브라우저 저장소를 읽을 수가 없다. 그래서 구울 때 박는다.
"""
import json
import re

import 작업대말
import workbench

한글 = re.compile(r"[가-힣]")

_카드 = [{"index": 1, "배경": {"종류": "단색", "hex": "#FFFFFF"},
        "글자영역": [{"box": [10, 10, 100, 50], "pt": 20, "weight": "Bold",
                  "align": "가운데", "lines": ["ㄱ"]}],
        "장식영역": [{"종류": "사진", "box": [0, 0, 10, 10]}]}]


def test_표의_열쇠마다_두_언어가_다_있다():
    빠진것 = [k for k, v in 작업대말._말.items()
           if 작업대말.한국어 not in v or 작업대말.영어 not in v]
    assert 빠진것 == []


def test_영어에_한글이_안_남는다():
    남은것 = [(k, v[작업대말.영어]) for k, v in 작업대말._말.items()
           if 한글.search(v[작업대말.영어])]
    assert 남은것 == []


def test_한국어도_비어_있지_않다():
    빈것 = [k for k, v in 작업대말._말.items() if not v[작업대말.한국어].strip()]
    assert 빈것 == []


def test_모르는_언어는_한국어로_떨어진다():
    for 이상한것 in ("", "en", "English", "영어 ", None):
        assert 작업대말.쓸말(이상한것) == 작업대말.한국어, 이상한것
    assert 작업대말.쓸말("영어") == 작업대말.영어


def test_저장되는_값은_안_바뀐다():
    """**여기가 제일 조심할 곳이다.** 정렬·종류는 설계도에 저장되는 값이라,
    영어로 바꾸면 굽는 쪽이 못 찾는다 — 라벨판에서 `KINDS` 로 한 번 겪었다."""
    for 값 in ("가운데", "오른쪽", "왼쪽", "장식", "글자", "사진", "로고"):
        assert 작업대말.낱말(값, 작업대말.한국어) == 값
        assert not 한글.search(작업대말.낱말(값, 작업대말.영어)), 값
    # 모르는 값은 그대로 — 새 종류가 생겨도 안 죽는다.
    assert 작업대말.낱말("새로운것", 작업대말.영어) == "새로운것"


def test_영어로_구우면_화면_글자가_영어다():
    쪽 = workbench.쪽만들기("abc", _카드, ["https://x/1.png"], "영어")
    assert "<title>Card News Workbench</title>" in 쪽
    for 영 in ("Save", "See the result", "‹ Prev", "Next ›"):
        assert 영 in 쪽, 영


def test_한국어는_옮기기_전_그대로다():
    """**이 일로 한국어 화면이 달라지면 안 된다.**"""
    쪽 = workbench.쪽만들기("abc", _카드, ["https://x/1.png"], "한국어")
    assert "<title>카드뉴스 작업대</title>" in 쪽
    for 한 in ("저장", "결과물 보기", "‹ 이전", "다음 ›"):
        assert 한 in 쪽, 한


def test_언어를_안_주면_한국어다():
    """옛 부르는 쪽이 그대로 돌아야 한다."""
    assert workbench.쪽만들기("abc", _카드, []) == workbench.쪽만들기("abc", _카드, [], "한국어")


def test_쪽이_제_언어를_안다():
    """저장할 때 돌려보내야 **다시 구워도 영어인 채로** 남는다."""
    쪽 = workbench.쪽만들기("abc", _카드, [], "영어")
    m = re.search(r"const 상태 = (\{.*?\});", 쪽, re.S)
    assert m, "상태를 못 찾았다 — 시험이 낡았다"
    assert json.loads(m.group(1))["언어"] == "영어"


def test_말표가_쪽에_실린다():
    """JS 가 언어를 다시 고르지 않는다 — **이미 푼 글자**가 실린다."""
    쪽 = workbench.쪽만들기("abc", _카드, [], "영어")
    m = re.search(r"const 말표 = (\{.*?\});", 쪽, re.S)
    assert m, "말표를 못 찾았다"
    표 = json.loads(m.group(1))
    assert 표["저장"] == "Save"
    assert 표["낱말"]["가운데"] == "Center"
    # 열쇠가 다 실려야 한다 — 하나만 빠져도 그 자리만 열쇠 이름이 뜬다.
    빠진것 = [k for k in 작업대말._말 if k not in 표]
    assert 빠진것 == []


def test_영어로_구운_쪽에_한국어_화면_글자가_안_남는다():
    """**한 자리만 빠뜨려도 거기만 한국어로 뜬다.**

    설계도 값·CSS 이름·주석은 한국어로 남아도 된다 — 사람 눈에 안 닿는다.
    여기서는 «화면에 찍히는 자리» 셋만 본다.
    """
    쪽 = workbench.쪽만들기("abc", _카드, [], "영어")
    # **`<script>` 앞까지만 본다.** 그 안은 JS 라 `a > b && c < d` 가 `>…<` 에
    # 걸린다 — 화면 글자가 아니다. JS 안의 글자는 `말표` 시험이 따로 본다.
    마크업 = 쪽[:쪽.index("<script>")]
    남은것 = []
    for m in re.finditer(r">([^<>{}\n]{2,})<", 마크업):
        v = m.group(1).strip()
        if 한글.search(v):
            남은것.append(v)
    # **`data-말title` 은 뺀다.** 거기 든 것은 글자가 아니라 표의 «열쇠 이름»
    # 이고, 그 열쇠도 한국어다(`되돌리기`·`템플릿설명`). 화면에는 `말()` 이
    # 푼 글자가 들어간다.
    for m in re.finditer(r'(?<!말)(?:title|placeholder|aria-label)="([^"\n]*)"', 마크업):
        if 한글.search(m.group(1)):
            남은것.append(m.group(1))
    assert 남은것 == [], f"표(`작업대말.py`)로 옮겨라: {남은것}"
