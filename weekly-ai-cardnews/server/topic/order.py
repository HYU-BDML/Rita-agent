# -*- coding: utf-8 -*-
"""주문서 — 주제 다듬기 대화가 낸 것을 검사하고, 기간 말을 날짜로, 등급을 예산으로 바꾼다.

기간은 **코드가 센다** — 지휘자는 «이번 주» 같은 말을 종류(이번주·지난주·최근N일·이번달·지난달·직접)로만
옮긴다(설계 1장 «지휘자가 말을 날짜로, 코드가 날짜 계산»). 날짜는 한국 날짜, 양 끝 포함.
«이번 주»·«이번 달» 은 아직 안 온 날까지 끝으로 잡는다(설계 예: 10/1 에 «이번 주» → 9/28~10/4)."""
from datetime import date, timedelta

등급예산 = {"A": {"호출": 20, "돈": 1.0}, "B": {"호출": 50, "돈": 2.0}, "C": {"호출": 100, "돈": 4.0}}
판분 = 40
최대일수 = 31
분야이름최대 = 20  # 칩·목록·제목에만 쓴다. 표지 2행 폭(한글 11자)은 새 분야 카드를 설계할 때 따로 — 사용자 «넉넉하게»(10-03)
건수범위 = (3, 8)
기간종류 = ("이번주", "지난주", "최근N일", "이번달", "지난달", "직접")
최대주차앞 = 3  # 저장한 분야의 «몇 월 몇 주차» — 이번 주(0)부터 3주 전까지(계획 4 설계 A-5). 대화 다듬기는 안 쓴다


class 주문서탈(ValueError):
    """사람(과 지휘자)에게 그대로 보여 줄 한 줄."""


def 기간계산(기간: dict, 오늘: date) -> tuple[str, str]:
    기간 = 기간 or {}
    종류 = 기간.get("종류")
    월요일 = 오늘 - timedelta(days=오늘.weekday())
    if 종류 == "이번주":
        시작, 끝 = 월요일, 월요일 + timedelta(days=6)
    elif 종류 == "지난주":
        시작, 끝 = 월요일 - timedelta(days=7), 월요일 - timedelta(days=1)
    elif 종류 == "최근N일":
        try:
            n = int(기간.get("N"))
        except (TypeError, ValueError):
            raise 주문서탈("최근 며칠인지 숫자가 없어요") from None
        if not 1 <= n <= 최대일수:
            raise 주문서탈(f"최근 {n}일은 못 해요 — 1~{최대일수}일로 말해 주세요")
        시작, 끝 = 오늘 - timedelta(days=n - 1), 오늘
    elif 종류 == "이번달":
        시작 = 오늘.replace(day=1)
        끝 = (시작 + timedelta(days=32)).replace(day=1) - timedelta(days=1)
    elif 종류 == "지난달":
        끝 = 오늘.replace(day=1) - timedelta(days=1)
        시작 = 끝.replace(day=1)
    elif 종류 == "주차":
        앞 = 기간.get("앞")
        if isinstance(앞, bool) or not isinstance(앞, int) or not 0 <= 앞 <= 최대주차앞:
            raise 주문서탈(f"주차는 이번 주부터 {최대주차앞}주 전까지만 고를 수 있어요")
        시작 = 월요일 - timedelta(days=7 * 앞)
        끝 = 시작 + timedelta(days=6)
    elif 종류 == "직접":
        try:
            시작, 끝 = date.fromisoformat(기간["시작"]), date.fromisoformat(기간["끝"])
        except (KeyError, TypeError, ValueError):
            raise 주문서탈("기간 날짜를 못 읽었어요 — 2026-09-21 꼴로 주세요") from None
    else:
        raise 주문서탈(f"기간 종류를 모르겠어요({종류!r}) — {', '.join(기간종류)} 중 하나")
    if 시작 > 끝:
        raise 주문서탈("기간의 시작이 끝보다 뒤예요")
    if 시작 > 오늘:
        raise 주문서탈("아직 오지 않은 기간이에요 — 오늘까지 시작한 기간만 모을 수 있어요")
    일수 = (끝 - 시작).days + 1
    if 일수 > 최대일수:
        raise 주문서탈(f"기간이 {일수}일이에요 — {최대일수}일 안으로 줄여 주세요")
    return 시작.isoformat(), 끝.isoformat()


def _목록(값) -> list[str]:
    if isinstance(값, str):
        값 = 값.replace("·", ",").split(",")
    return [str(x).strip() for x in (값 or []) if str(x).strip()][:10]


def 다듬기(원본: dict, 오늘: date) -> dict:
    if not isinstance(원본, dict):
        raise 주문서탈("주문서 모양이 아니에요")
    주제 = str(원본.get("주제") or "").strip()
    if not 주제:
        raise 주문서탈("주제가 비어 있어요")
    이름 = str(원본.get("분야이름") or "").strip()
    if not 이름:
        raise 주문서탈("분야 이름이 비어 있어요")
    if len(이름) > 분야이름최대:
        raise 주문서탈(f"분야 이름 «{이름}» 이 {len(이름)}자예요 — {분야이름최대}자 안으로 줄여 주세요")
    기간 = 원본.get("기간") or {}
    시작, 끝 = 기간계산(기간, 오늘)
    try:
        건수 = int(원본.get("목표건수") or 6)
    except (TypeError, ValueError):
        raise 주문서탈("목표 건수가 숫자가 아니에요") from None
    if not 건수범위[0] <= 건수 <= 건수범위[1]:
        raise 주문서탈(f"목표 건수는 {건수범위[0]}~{건수범위[1]}건이에요")
    등급 = str(원본.get("등급") or "B").strip().upper()
    if 등급 not in 등급예산:
        raise 주문서탈(f"등급은 A·B·C 중 하나예요 ({등급!r})")
    return {"주제": 주제, "범위": str(원본.get("범위") or "").strip(), "기간말": str(기간.get("말") or "").strip(),
            "시작": 시작, "끝": 끝, "넣을것": _목록(원본.get("넣을것")), "뺄것": _목록(원본.get("뺄것")),
            "목표건수": 건수, "한장단위": str(원본.get("한장단위") or "").strip(), "분야이름": 이름, "등급": 등급,
            "예산": {**등급예산[등급], "분": 판분}}
