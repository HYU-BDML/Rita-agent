# -*- coding: utf-8 -*-
"""도구 장부 — 지휘자가 부르는 도구 이름 → 지금 쓸 Apify 도구·입력 틀·건당 값(설계 3장 «바꿔 끼운다»).

계획 1 은 씨앗(registry.json)만 읽는다. 창고에 저장하고 수리공이 고치고 되돌리는 것은 계획 2.
틀의 «{자리}» 가 통째면 값의 꼴(숫자·참거짓·목록) 그대로, 글 안에 섞여 있으면 글로 넣는다."""
import json
import re
from pathlib import Path

씨앗 = Path(__file__).with_name("registry.json")


def 읽기() -> dict:
    return json.loads(씨앗.read_text(encoding="utf-8"))


def 채우기(틀, 값: dict):
    if isinstance(틀, dict):
        return {k: 채우기(v, 값) for k, v in 틀.items()}
    if isinstance(틀, list):
        return [채우기(v, 값) for v in 틀]
    if not isinstance(틀, str):
        return 틀

    def 꺼내(이름):
        if 이름 not in 값:
            raise KeyError(f"장부 틀에 모르는 자리: {{{이름}}}")
        return 값[이름]

    통째 = re.fullmatch(r"\{(\w+)\}", 틀)
    if 통째:
        return 꺼내(통째.group(1))
    return re.sub(r"\{(\w+)\}", lambda m: str(꺼내(m.group(1))), 틀)


def 값셈(항목: dict, 청구: dict, 건수: int) -> float:
    """청구된 사건 수 × 장부 값. 청구 기록이 없으면 받은 건수로 짐작한다."""
    if 청구:
        시작 = 청구.get("actor-start", 0)
        나머지 = sum(v for k, v in 청구.items() if k != "actor-start")
        return round(항목.get("시작삯", 0) * 시작 + 항목["건당"] * 나머지, 5)
    return round(항목.get("시작삯", 0) + 항목["건당"] * 건수, 5)
