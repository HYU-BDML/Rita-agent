# -*- coding: utf-8 -*-
"""표지 검사기의 밈 이름(계획 4 E) — 바르게 쓴 밈 13개가 «밈사전에 없다» 로 막혔다.

검사기 밈 목록 76조각 중 13개에 옛 Dify 에서 뽑을 때 묻은 별표·이모지가 있고(«**누가 돌아왔게** 🔥»), 목록을 쉼표로
잘라 쉼표가 든 밈 3개(«나야, 들기름» 등)는 둘로 쪼개진다. 검사기는 yml 에서 한 글자도 안 고치고 뽑은 파일이라
그대로 두고, 부르는 쪽(memes.씻은표지검사)이 씻는다 — 주간 AI 소식·새 분야 판이 같이 쓴다."""
import json

import pytest

import app
import memes
from nodes import check_hook

표시묻은 = [m.strip() for m in check_hook.밈목록.split(",") if m.strip() and memes.씻기(m.strip()) != m.strip()]
쉼표든 = [k for k in check_hook.밈장면 if "," in k]


def 표지(밈, 쓰임):
    return json.dumps({"headline": ["누가 돌아왔게?", "9월 3주차 AI 소식"], "accent_text": "9월 3주차", "meme": 밈,
                       "밈쓰임": 쓰임, "gen_prompt_en": "A young man bursts through a door, cinematic photograph."},
                      ensure_ascii=False)


def 밈탈(결과):
    return [x for x in 결과["blocked"].split("\n") if "밈사전에 없다" in x or "«밈쓰임» 이 밈" in x]


def test_검사기를_그대로_부르면_바르게_쓴_밈도_막힌다():
    assert len(표시묻은) == 13 and len(쉼표든) == 3
    assert 밈탈(check_hook.main(text=표지("고맙투우사", "고맙투우사 모"), week="9월 3주차"))
    assert 밈탈(check_hook.main(text=표지("나야, 들기름", "정색한 얼굴로 자기 정체를 밝힘"), week="9월 3주차"))


@pytest.mark.parametrize("원래", sorted(check_hook.밈장면))
def test_사전의_밈은_깨끗한_이름으로도_묻은_이름으로도_통과한다(원래):
    검사 = memes.씻은표지검사(check_hook)
    for 밈 in {원래, memes.씻기(원래).replace(memes.넓은쉼표, ",")}:
        결과 = 검사.main(text=표지(밈, check_hook.밈장면[원래] + " " + 밈), week="9월 3주차")
        assert not 밈탈(결과), (밈, 결과["blocked"])
        assert 결과["cover"]["meme"] == memes.씻기(밈).replace(memes.넓은쉼표, ",")


def test_부르고_나면_검사기의_밈_목록과_장면표는_그대로():
    옛목록, 옛장면 = check_hook.밈목록, check_hook.밈장면
    memes.씻은표지검사(check_hook).main(text=표지("고맙투우사", "고맙투우사"), week="9월 3주차")
    assert check_hook.밈목록 is 옛목록 and check_hook.밈장면 is 옛장면


def test_밈_이름은_별표와_이모지만_떼고_쉼표는_넓은_쉼표로():
    # 괄호·쌍점·빗금은 밈 이름의 일부다 — «각성 (마늘)» 이 «각성 마늘» 이 되어 막혔다(계획 3 최종 검토 중요 1)
    assert [memes.씻기(x) for x in ("**누가 돌아왔게** 🔥", "각성 (마늘)", "스파이더맨: 브랜드 뉴 데이", "척척 / 뚝딱",
                                    "**김동현(매미킴)**", "나야, 들기름")] == [
        "누가 돌아왔게", "각성 (마늘)", "스파이더맨: 브랜드 뉴 데이", "척척 / 뚝딱", "김동현(매미킴)", "나야， 들기름"]


def test_JSON_이_아닌_글은_그대로_넘긴다():
    받은 = []

    class 가짜:
        밈목록, 밈장면 = "", {}
        _벗기기 = staticmethod(check_hook._벗기기)

        @staticmethod
        def main(**kw):
            받은.append(kw)
            return {"cover": {}}

    memes.씻은표지검사(가짜).main(text="표지 못 씀", week="9월 3주차")
    assert 받은[0]["text"] == "표지 못 씀"


def test_주간_AI_소식과_새_분야가_같은_씻은_검사를_쓴다():
    노드 = app._노드들()
    assert isinstance(노드.check_hook, memes.씻은표지검사) and 노드.check_hook.밈목록 is check_hook.밈목록
    assert not 밈탈(노드.check_hook.main(text=표지("고맙투우사", "고맙투우사"), week="9월 3주차"))
