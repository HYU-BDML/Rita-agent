# -*- coding: utf-8 -*-
"""`한판()` 이 돌려주는 요약에 누끼 올린 개수가 실리나.

`_누끼올리기` 가 몇 개를 올렸는지 세어 돌려주는데, `한판()` 은 그 값을 받아만
놓고 요약(응답)에는 안 실었다(2026-09-17 최종 검토 지적 ③). 올리기가 실패해
`!! 누끼가 없다` 를 찍어도 요약에는 안 남아 아무도 못 본다.

**협력자는 다 가짜로 세운다.** 여기서 보는 것은 `한판()` 자신이 요약 사전을
어떻게 짜는가이지, S3·make_dsl_cardnews·말투틀의 옳고 그름이 아니다.
"""
import json
import os
import sys
import types
from pathlib import Path

여기 = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(여기))
os.environ.setdefault("CARDNEWS_DATA", str(여기 / "data"))

import lambda_분석 as 분석  # noqa: E402


def test_요약에_누끼_올린_개수가_실린다(monkeypatch, tmp_path):
    monkeypatch.setattr(분석.merge_labeled, "build",
                        lambda pid, publish, pull: {"skeleton": ["훅"], "slide_count": 1})
    monkeypatch.setattr(분석, "_배경판올리기", lambda pid, 잰것: 3)
    monkeypatch.setattr(분석, "_누끼올리기", lambda 잰것: 5)
    monkeypatch.setattr(분석, "_옛이름", lambda pid: "")
    monkeypatch.setattr(분석, "_미리보기올리기", lambda pid: "")
    monkeypatch.setattr(분석, "_한판올리기", lambda pid: "")
    monkeypatch.setattr(분석, "_올리기", lambda 키, 글: f"https://x/{키}")
    monkeypatch.setattr(분석, "_목록얹기", lambda 이번것: 이번것)
    monkeypatch.setattr(분석, "_말투올리기", lambda pid, 잰것, 이름: {})
    monkeypatch.setattr(분석, "_옷장과_yml", lambda 목록: {})
    monkeypatch.setattr(분석.config, "DATA", tmp_path)

    def 가짜_틀_쓰기(pid, 자리, 이름, 미리, 한판, 개인=True):
        자리.parent.mkdir(parents=True, exist_ok=True)
        틀 = {"이름": 이름 or "기본", "슬라이드": [{"글자슬롯": []}], "못그림": []}
        자리.write_text(json.dumps(틀, ensure_ascii=False), encoding="utf-8")
        return 틀

    가짜_틀만들기 = types.SimpleNamespace(
        틀_쓰기=가짜_틀_쓰기, 목록만들기=lambda 자리: [])
    monkeypatch.setitem(sys.modules, "make_dsl_cardnews", 가짜_틀만들기)

    난것 = 분석.한판("abc123", "이름")
    assert 난것.get("누끼") == 5, f"누끼 올린 개수가 요약에 없다: {난것}"
    assert 난것.get("배경판") == 3, "이미 있던 배경판 칸은 그대로여야 한다"
