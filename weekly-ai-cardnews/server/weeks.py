# -*- coding: utf-8 -*-
"""주차 «9월 3주차» ↔ 날짜. 옛 서버(procure/week.py 의 주차())와 **같은 규칙**이다 —
그 달 첫 월요일이 1주차의 시작. 다른 점은 없는 주차(13월, 9월 5주차 …)를 거절한다는 것뿐."""
import re
from datetime import date, timedelta


def 첫월요일(해: int, 달: int) -> date:
    첫날 = date(해, 달, 1)
    return 첫날 + timedelta(days=(7 - 첫날.weekday()) % 7)


def 주차(라벨: str, 해) -> tuple[str, str]:
    m = re.fullmatch(r"\s*(\d{1,2})\s*월\s*(\d)\s*주차?\s*", 라벨 or "")
    if not m:
        raise ValueError(f"주차를 못 읽었다: {라벨!r} — «9월 3주차» 꼴이어야 한다")
    달, 주 = int(m.group(1)), int(m.group(2))
    try:
        해 = int(str(해).strip())
    except ValueError:
        raise ValueError(f"해를 못 읽었다: {해!r}") from None
    if not 1 <= 달 <= 12 or 주 < 1:
        raise ValueError(f"없는 주차다: {라벨!r}")
    시작 = 첫월요일(해, 달) + timedelta(weeks=주 - 1)
    if 시작.month != 달:
        raise ValueError(f"{해}년 {달}월에는 {주}주차가 없다")
    return 시작.isoformat(), (시작 + timedelta(days=6)).isoformat()


def 이름짓기(월요일: date) -> dict:
    주 = (월요일 - 첫월요일(월요일.year, 월요일.month)).days // 7 + 1
    return {"label": f"{월요일.month}월 {주}주차", "year": 월요일.year,
            "start": 월요일.isoformat(), "end": (월요일 + timedelta(days=6)).isoformat()}


def 최근주차들(오늘: date, 몇개: int = 12) -> list[dict]:
    """다 끝난 주 가운데 가장 최근 것부터 거꾸로. 해는 목록에 붙어 간다(12월→1월 넘어가는 주도 맞게)."""
    이번월요일 = 오늘 - timedelta(days=오늘.weekday())
    return [이름짓기(이번월요일 - timedelta(weeks=i)) for i in range(1, 몇개 + 1)]
