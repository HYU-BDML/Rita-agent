# -*- coding: utf-8 -*-
"""틀 하나로 만든 카드뉴스가 «그 게시물의 옷만» 입는가.

배경색이 지문이다 — 키키(DG0AA6PJ8s4)는 일곱 장 전부 흰 바탕이고, 예전
게시물(DHqCBQnRAjW)은 그라데이션 하나 + 크림(#F1FFE5) 여섯이다. 섞일 수가 없다.

**이것이 B 의 합격선이다.** 2026-08-26 에 실측한 결과는 일곱 장 중 **넷이**
예전 게시물 옷이었다.
"""
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]      # cardnews/
sys.path.insert(0, str(ROOT / "dify"))

import make_dsl_cardnews as m          # noqa: E402
import 카드뉴스_틀고르기 as 틀고르기      # noqa: E402

_측정표들 = ("DG0AA6PJ8s4.json", "DHqCBQnRAjW.json")
_있나 = all((ROOT / "analyze" / "data" / "measures" / f).exists() for f in _측정표들)
_실측필요 = pytest.mark.skipif(not _있나, reason="계량표가 없다 — merge_labeled 를 먼저 돌려라")


@_실측필요
def test_키키_틀로_만들면_여섯_장이_전부_키키_옷이다(tmp_path):
    """**여섯 장이다 — 키키 서랍에 CTA 가 없다**(2026-09-18).

    서랍은 훅 1 · 정의 1 · 사례 4 · 요약 1. 옛 규칙은 골격에 CTA 를 못 박고
    그 자리를 요약으로 채워 **요약이 두 장** 나왔다. 지금은 서랍에 있는 끝맺는
    역할만 넣는다(`카드뉴스_틀고르기._마무리`).
    """
    틀 = m.틀_쓰기("DG0AA6PJ8s4", tmp_path / "DG0AA6PJ8s4.json")
    난것 = 틀고르기.main(json.dumps(틀, ensure_ascii=False), "4")
    슬라이드 = json.loads(난것["틀_json"])["슬라이드"]
    assert len(슬라이드) == 6
    바탕 = {(s["배경"].get("종류"), s["배경"].get("hex")) for s in 슬라이드}
    assert 바탕 == {("단색", "#FFFFFF")}, f"남의 옷이 섞였다: {바탕}"


@_실측필요
def test_키키에_없는_CTA_자리는_아예_안_만든다(tmp_path):
    """**없는 옷을 지어내지 않는다**(사람 결정 2026-09-18).

    키키에는 CTA 장이 없다. 옛 규칙은 그 자리를 요약으로 채웠는데, 그러면
    같은 요약 디자인이 두 장 나온다 — 사람이 실물에서 잡은 그 탈이다.
    """
    틀 = m.틀_쓰기("DG0AA6PJ8s4", tmp_path / "DG0AA6PJ8s4.json")
    난것 = 틀고르기.main(json.dumps(틀, ensure_ascii=False), "4")
    골격 = json.loads(난것["틀_json"])["골격"]
    assert "CTA" not in 골격, 골격
    assert 골격.count("요약") == 1, 골격
    마지막 = json.loads(난것["틀_json"])["슬라이드"][-1]
    assert 마지막["역할"] == "요약" and 마지막["배경"].get("hex") == "#FFFFFF"


본문류 = ("사례", "해결", "정의", "문제", "비교", "데이터")


@_실측필요
@pytest.mark.parametrize("pid", ["DG0AA6PJ8s4", "DHqCBQnRAjW"])
def test_본문_디자인이_논_채로_남지_않는다(pid, tmp_path):
    """본문 자리 수만큼 «서로 다른» 디자인이 나와야 한다. 되풀이는 모자랄 때만.

    **역할 낱말로 못을 박지 않는다.** 역할은 대본 LLM 이 붙이는 것이라 같은
    게시물을 다시 재면 바뀐다 — 실측으로 키키의 서랍이 `사례1·해결4` 에서
    `정의1·사례4` 로 통째로 갈렸다(2026-08-26 두 번째 계량). 그때마다 시험이
    빨개지면 시험이 LLM 의 그날 기분을 지키는 셈이다. 지켜야 할 것은 낱말이
    아니라 **한 디자인이 되풀이되는 동안 다른 디자인이 노는 일이 없다**는
    것이고, 그것이 본문류를 한 통으로 모은(R6) 까닭이다.

    실측(2026-08-26): 두 게시물 다 본문 자리 4개에 서로 다른 디자인 4개.
    """
    틀 = m.틀_쓰기(pid, tmp_path / f"{pid}.json")
    서랍본문 = sum(len(v) for k, v in 틀["서랍"].items() if k in 본문류)
    슬라이드 = json.loads(틀고르기.main(json.dumps(틀, ensure_ascii=False), "4")["틀_json"])["슬라이드"]
    본문 = [s for s in 슬라이드 if s["역할"] in 본문류]
    # 지문은 글자슬롯 상자다 — 디자인이 서로 다르면 상자도 다르다.
    지문 = [tuple(tuple(t["box"]) for t in s["글자슬롯"]) for s in 본문]
    assert len(set(지문)) == min(len(본문), 서랍본문), (
        f"{pid}: 본문 자리 {len(본문)}개에 서랍 본문 {서랍본문}개인데 "
        f"서로 다른 디자인은 {len(set(지문))}개뿐이다 — 하나가 놀고 있다")


@_실측필요
def test_예전_게시물_틀은_예전_옷만_입는다(tmp_path):
    """반대쪽도 확인한다 — 지문이 진짜 지문인지."""
    틀 = m.틀_쓰기("DHqCBQnRAjW", tmp_path / "DHqCBQnRAjW.json")
    슬라이드 = json.loads(틀고르기.main(json.dumps(틀, ensure_ascii=False), "4")["틀_json"])["슬라이드"]
    바탕 = {s["배경"].get("hex") for s in 슬라이드}
    assert "#FFFFFF" not in 바탕, f"키키 옷이 섞였다: {바탕}"
