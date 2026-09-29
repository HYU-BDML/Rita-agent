# -*- coding: utf-8 -*-
"""템플릿이 **공용인가 개인인가**.

**사람 지시 2026-09-19.** 사람 서른다섯이 리타 링크로 들어와 각자 인스타 주소를
담고 라벨을 쳐서 자기 템플릿을 만든다. 그런데 템플릿 목록은 창고에 **파일 하나**라,
그대로 두면 서른다섯 명이 서로의 템플릿을 다 보게 된다.

**가르는 규칙은 「누가 걸었나」가 아니라 「어디서 걸었나」다.**

    수집기에서 분석  →  공용   (사장님 자리. 이름도 물어본다)
    채팅·라벨판에서  →  개인   (서른다섯 명 자리. 자기 브라우저에만 남는다)

**기본이 개인이다.** 그래야 라벨판을 한 글자도 안 고쳐도 되고, 새로 생기는 길이
있어도 실수로 공용이 되지 않는다 — 공용은 **일부러** 말해야 한다.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "dify"))
sys.path.insert(0, str(ROOT / "render"))

import make_dsl_cardnews as 틀만들기  # noqa: E402


def _틀하나(터, 코드, 개인=None):
    """틀 파일 하나를 만들어 둔다. `개인` 이 None 이면 그 칸을 아예 안 만든다."""
    틀 = {"코드": 코드, "이름": 코드, "슬라이드": [{"index": 1, "역할": "훅"}],
         "캔버스": {"w": 1080, "h": 1350}}
    if 개인 is not None:
        틀["개인"] = 개인
    (터 / f"{코드}.json").write_text(json.dumps(틀, ensure_ascii=False),
                                    encoding="utf-8")


# 계량표가 실제로 있는 게시물이라야 틀을 뽑을 수 있다.
잰것있는코드 = "DG0AA6PJ8s4"


def test_기본은_개인이다(tmp_path):
    # 「공용」은 일부러 말해야 한다. 안 말하면 개인 — 실수로 새어 나가지 않는다.
    난것 = 틀만들기.틀_쓰기(잰것있는코드, tmp_path / "t.json", "이름")
    assert 난것["개인"] is True


def test_공용이라고_말하면_공용이다(tmp_path):
    난것 = 틀만들기.틀_쓰기(잰것있는코드, tmp_path / "t.json", "이름", 개인=False)
    assert 난것["개인"] is False


def test_목록이_개인_여부를_나른다(tmp_path):
    # **채팅은 틀 파일이 아니라 목록을 본다.** 여기 안 실으면 걸러 낼 수가 없다.
    _틀하나(tmp_path, "AAA", 개인=True)
    _틀하나(tmp_path, "BBB", 개인=False)
    줄들 = 틀만들기.목록만들기(tmp_path)
    표 = {x["코드"]: x for x in 줄들}
    assert 표["AAA"]["개인"] is True
    assert 표["BBB"]["개인"] is False


def test_옛_틀은_공용으로_본다(tmp_path):
    # 이미 창고에 있는 열 벌에는 이 칸이 없다. 그것들은 사장님이 만든 공용이다 —
    # 갑자기 안 보이면 서른다섯 명이 고를 것이 없어진다.
    _틀하나(tmp_path, "OLD")          # 개인 칸 자체가 없음
    줄 = 틀만들기.목록만들기(tmp_path)[0]
    assert 줄.get("개인") is False
