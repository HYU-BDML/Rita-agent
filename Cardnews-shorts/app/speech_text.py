"""음성에 보낼 원고 다듬기와 발음 검사.

자막에는 학생이 쓴 원고를 그대로 쓰고, 음성 생성에만 아래 변환을 적용한다.
1. 숫자를 한글 읽기로 바꾼다(54% → 오십사 퍼센트, 3명 → 세 명).
   영어 단어 뒤 숫자를 영어로 읽는 오류(«Landon 54%» → «랜던 오브 사퍼런»)를 막는다.
2. 발음 사전(브랜드·외래어)을 적용한다(MindLens → 마인드렌즈).
"""
from __future__ import annotations

import difflib
import re
from typing import Dict

DEFAULT_PRONOUNCE = {
    "MindLens": "마인드렌즈",
    "Mindlens": "마인드렌즈",
    "mindlens": "마인드렌즈",
    "AI": "에이아이",
    "IRB": "아이알비",
    "SNS": "에스엔에스",
    "PMF": "피엠에프",
    "G*Power": "지파워",
    "PLS-SEM": "피엘에스 에스이엠",
    "SEM": "에스이엠",
    "t검정": "티 검정",
    "IRB": "아이알비",
}

_DIG = "영일이삼사오육칠팔구"
_NATIVE = {1: "한", 2: "두", 3: "세", 4: "네", 5: "다섯", 6: "여섯", 7: "일곱", 8: "여덟", 9: "아홉",
           10: "열", 20: "스물", 30: "서른", 40: "마흔", 50: "쉰", 60: "예순", 70: "일흔", 80: "여든", 90: "아흔"}
_NATIVE_COUNTERS = ("명", "개", "시간", "시", "살", "번", "마리", "잔", "권", "곳", "가지", "달", "사람", "대")


def sino(n: int) -> str:
    """정수를 한자어 수 읽기로(1936 → 천구백삼십육)."""
    if n == 0:
        return "영"
    out = ""
    for unit_v, unit_n in ((10 ** 12, "조"), (10 ** 8, "억"), (10 ** 4, "만")):
        if n >= unit_v:
            q, n = divmod(n, unit_v)
            out += ("" if (q == 1 and unit_n == "만") else _under_10000(q)) + unit_n
    return out + _under_10000(n)


def _under_10000(n: int) -> str:
    s = ""
    for v, name in ((1000, "천"), (100, "백"), (10, "십")):
        q, n = divmod(n, v)
        if q:
            s += ("" if q == 1 else _DIG[q]) + name
    if n:
        s += _DIG[n]
    return s


def native(n: int) -> str:
    if n in _NATIVE:
        return _NATIVE[n]
    t, o = divmod(n, 10)
    base = {2: "스물", 1: "열", 3: "서른", 4: "마흔", 5: "쉰", 6: "예순", 7: "일흔", 8: "여든", 9: "아흔"}[t]
    return base + _NATIVE[o] if o else base


def _num_str(intpart: str, frac: str | None) -> str:
    s = sino(int(intpart.replace(",", "")))
    if frac:
        s += " 점 " + "".join(_DIG[int(c)] for c in frac)
    return s


_NUM_RE = re.compile(r"(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\s*(%p|%P|퍼센트포인트|퍼센트|%|％)?")


def speakable(text: str, pronounce: Dict[str, str] | None = None) -> str:
    d = dict(DEFAULT_PRONOUNCE)
    d.update(pronounce or {})
    for k in sorted(d, key=len, reverse=True):
        text = re.sub(r"(?<![A-Za-z])" + re.escape(k) + r"(?![A-Za-z])", d[k], text)

    def rep(m: re.Match) -> str:
        intpart, frac, pct = m.group(1), m.group(2), m.group(3)
        after = text[m.end():m.end() + 3]
        n = int(intpart.replace(",", ""))
        if pct:
            unit = " 퍼센트포인트" if pct.lower() in ("%p", "퍼센트포인트") else " 퍼센트"
            return _num_str(intpart, frac) + unit
        lim = 99 if after.lstrip().startswith("살") else 19     # 나이는 고유어(스물다섯 살), 그 밖은 19까지만
        if not frac and 1 <= n <= lim and after.lstrip().startswith(_NATIVE_COUNTERS) \
                and not after.lstrip().startswith(("시즌",)):
            return native(n) + " "
        return _num_str(intpart, frac) + (" " if after[:1] and after[:1] not in " .,!?만억조천" else "")

    out = _NUM_RE.sub(rep, text)
    return re.sub(r"\s{2,}", " ", out).strip()


def _norm(s: str) -> str:
    # 영어 이름·약어는 받아 적기에서 영문(PLS SEM)이나 한글(랜던)로 제각각 나오므로 양쪽에서 뺀다.
    # 발음 사전도 쓰지 않고 숫자만 한글 읽기로 바꿔 한글끼리 비교한다.
    s = re.sub(r"[A-Za-z][A-Za-z*\-]*", " ", s)
    s = speakable(s)  # 영문을 뺀 뒤라 발음 사전은 영향이 없고, 숫자만 한글 읽기(세 명·이십이 퍼센트)로 바뀐다
    return re.sub(r"[^\uac00-\ud7a3]", "", s)


def match_ratio(script: str, heard: str) -> float:
    """원고와 받아 적은 글의 일치율(0~1). 숫자는 양쪽 다 한글 읽기로 바꿔 비교한다."""
    # 원고 글자 가운데 실제로 들린 비율(재현율). 받아 적기에만 있는 글자(영어 이름의 한글 표기)는 감점하지 않는다.
    a, b = _norm(script), _norm(heard)
    if not a:
        return 1.0
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    return sum(blk.size for blk in sm.get_matching_blocks()) / len(a)
