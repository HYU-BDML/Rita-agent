# -*- coding: utf-8 -*-
"""Task 10 카드뉴스 Dify 판 — 코드 노드 순수 로직 시험.

여기서 시험하는 파일은 Dify 코드 노드 본문 그대로다(`dify/카드뉴스_*.py`) —
`main()` 하나짜리 평범한 파이썬 모듈이라 임포트해서 직접 부를 수 있다
(06_본문검증.py·07_훅검증.py 와 같은 모양).

    pytest dify/tests/test_카드뉴스_로직.py -q
"""
import copy
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "dify"))

import make_dsl_cardnews as 틀만들기  # noqa: E402
import 카드뉴스_강조 as 강조  # noqa: E402
import 카드뉴스_구조정리 as 구조정리  # noqa: E402
import 카드뉴스_대본검증 as 대본검증  # noqa: E402
import 카드뉴스_배치 as 배치  # noqa: E402
import 카드뉴스_배치검증 as 배치검증  # noqa: E402
from template_out import 바닥비, 자수창  # noqa: E402 — make_dsl 이 render/ 를 sys.path 에 넣는다


def _효과조각(칸, 효과):
    """칸에서 그 효과가 붙은 덩어리들 — `(줄 차례(1부터), 글)`. 줄 차례는 시험이 읽기
    좋으라고 세는 것일 뿐 저장값이 아니다(글자 효과는 글자에 붙는다, 2026-09-28)."""
    return [(i, d["글"]) for i, 줄 in enumerate(칸["글줄"], start=1)
            for d in 줄["덩어리"] if d.get(효과)]


def _효과글(칸, 효과):
    return [글 for _i, 글 in _효과조각(칸, 효과)]


# ──────────────────────────────────────────────────────── 시험 재료

골격 = ["훅", "사례", "사례", "사례", "사례", "요약", "CTA"]


def _슬롯(슬롯키, box, pt, weight, align, 줄종류, 최소, 최대):
    return {"슬롯키": 슬롯키, "box": box, "pt": pt, "weight": weight, "align": align,
            "font": "프리텐다드", "글자색": "#000000", "줄종류": 줄종류,
            "최소": 최소, "최대": 최대, "자리가변": False}


def _틀(글자슬롯_수=None):
    """7장짜리 최소 틀. 훅=2슬롯, 사례=2슬롯, 요약=2슬롯, CTA=1슬롯 (기본값).

    box 는 서로 겹치지 않게 띠로 나눠 둔다 — 겹침 시험은 일부러 겹치게 만드는
    시험에서만 겹쳐야 하고, 「통과」시험 재료 자체가 겹치면 그 시험은 아무것도
    증명하지 못한다.
    """
    기본 = {"훅": 2, "사례": 2, "요약": 2, "CTA": 1}
    글자슬롯_수 = 글자슬롯_수 or 기본
    슬라이드 = []
    for i, role in enumerate(골격, start=1):
        n = 글자슬롯_수[role]
        슬롯들 = []
        if n >= 1:
            슬롯들.append(_슬롯(f"{role}1", [50, 50, 950, 150], 40, "Bold", "왼쪽", "한줄", 5, 15))
        if n >= 2:
            슬롯들.append(_슬롯(f"{role}2", [50, 200, 950, 380], 30, "Regular", "왼쪽", "여러줄", 10, 30))
        if n >= 3:
            슬롯들.append(_슬롯(f"{role}3", [50, 420, 300, 460], 20, "Bold", "왼쪽", "한줄", 3, 12))
        슬라이드.append({
            "index": i, "역할": role,
            "배경": {"종류": "단색", "hex": "#F1FFE5"},
            "장식영역": [{"종류": "사진", "box": [600, 600, 900, 900]}],
            "글자슬롯": 슬롯들,
        })
    return {"골격": 골격, "캔버스": {"w": 1080, "h": 1350}, "강조색": "#C9FC95",
            "슬라이드": 슬라이드,
            "형광펜참고": {"측정": 36, "제외": 3, "평균비율": 0.21, "줄별평균": {}}}


def _대본(블록맵=None):
    """틀()의 기본 슬롯 수(훅2·사례2·요약2·CTA1)에 맞는 합격 대본."""
    기본블록 = {
        "훅": ["짧은 헤드라인", "부제목 한 줄입니다"],
        "사례": ["사례 헤드라인", "이건 본문 한 줄입니다 적당히"],
        "요약": ["요약 헤드라인", "요약 본문 한 줄입니다 적당히"],
        "CTA": ["CTA 한 줄 문구입니다"],
    }
    블록맵 = 블록맵 or 기본블록
    return {"slides": [{"role": role, "blocks": 블록맵[role]} for role in 골격]}


# ──────────────────────────────────────────────────────── 대본검증

def test_대본검증_통과():
    틀 = json.dumps(_틀(), ensure_ascii=False)
    대본 = json.dumps(_대본(), ensure_ascii=False)
    out = 대본검증.main(대본, 틀)
    assert out["ok"] == "1", out["blocked"]
    assert out["count"] == 7
    assert out["slides"][0]["role"] == "훅"


def test_대본검증_장수_틀림():
    틀 = json.dumps(_틀(), ensure_ascii=False)
    d = _대본()
    d["slides"] = d["slides"][:6]   # 한 장 빠뜨림
    out = 대본검증.main(json.dumps(d, ensure_ascii=False), 틀)
    assert out["ok"] == "0"
    assert "골격" in out["blocked"]


def test_대본검증_role_은_골격에서_온다():
    """모델이 이름표를 뭐라 적든 골격의 것을 쓴다.

    몇 번째 장이 무슨 역할인지는 골격이 이미 안다. 그런데 모델에게 그 낱말을
    다시 써 내라 하고 다르면 막았다 — 실물(2026-08-28): 사례 자리에 「정의」·
    「문제」라고 적었다고 다 된 대본을 두 판 태우고 버렸다. 글은 멀쩡했다.

    코드가 알 수 있는 것은 코드가 정한다. 줄 나누기를 코드가 맡은 것과 같은 결이다.
    """
    틀 = json.dumps(_틀(), ensure_ascii=False)
    d = _대본()
    d["slides"][1]["role"] = "요약"   # 2번 장은 사례인데 딴 이름을 적었다
    out = 대본검증.main(json.dumps(d, ensure_ascii=False), 틀)
    assert out["ok"] == "1", "이름표 때문에 막으면 안 된다"
    assert out["slides"][1]["role"] == "사례", "골격의 것으로 바로잡는다"


def test_대본검증_장_수는_그대로_막는다():
    """이름표와 달리 장 수는 코드가 못 고친다 — 글이 모자라거나 남는다."""
    틀 = json.dumps(_틀(), ensure_ascii=False)
    d = _대본()
    d["slides"].append(dict(d["slides"][-1]))
    out = 대본검증.main(json.dumps(d, ensure_ascii=False), 틀)
    assert out["ok"] == "0"
    assert "장이" in out["blocked"]

def test_대본검증_블록수_틀림():
    틀 = json.dumps(_틀(), ensure_ascii=False)
    d = _대본()
    d["slides"][0]["blocks"] = ["한 줄만"]   # 훅은 2블록이어야
    out = 대본검증.main(json.dumps(d, ensure_ascii=False), 틀)
    assert out["ok"] == "0"
    assert "블록이 1개" in out["blocked"]


def test_대본검증_넘침():
    틀 = json.dumps(_틀(), ensure_ascii=False)
    d = _대본({"훅": ["아주 길게 자수를 넘기는 헤드라인 문장입니다 넘칩니다", "부제목"],
              "사례": ["사례 헤드라인", "본문"], "요약": ["요약 헤드라인", "요약 본문"],
              "CTA": ["CTA 한 줄"]})
    out = 대본검증.main(json.dumps(d, ensure_ascii=False), 틀)
    assert out["ok"] == "0"
    # **하한도 같이 적는다**(사람 지적 2026-09-19). 이 말이 그대로 고쳐 쓰기
    # 프롬프트로 가는데 상한만 적혀 있어서, 모델이 하한 밑으로 과하게 잘랐다
    # (실물: 하한 73자인 칸이 32자로 나왔다).
    assert "범위 안으로" in out["blocked"]
    assert "아래로 내려가면 안 된다" in out["blocked"]
    assert "~" in out["blocked"], "위아래를 같이 줘야 내려갈 바닥이 생긴다"


def test_대본검증_미달은_알려만_주고_안_막는다():
    # 사람 결정(2026-08-28): 하한은 권고다. 넘치면 글자가 네모 밖으로 나가지만
    # 모자라면 좀 헐렁해 보일 뿐인데, 그것 때문에 다 된 대본을 버리고 있었다.
    틀 = json.dumps(_틀(), ensure_ascii=False)
    d = _대본({"훅": ["짧음", "부제목 한 줄입니다"], "사례": ["사례 헤드라인", "본문 한 줄입니다"],
              "요약": ["요약 헤드라인", "요약 본문 한 줄입니다"], "CTA": ["CTA 한 줄 문구입니다"]})
    out = 대본검증.main(json.dumps(d, ensure_ascii=False), 틀)
    assert out["ok"] == "1", "미달로는 안 막는다"
    assert "모자라면 아래가 빈다" in out["점수표"], "그래도 알려는 준다"


def test_대본검증_한줄슬롯에_여러줄_합쳐서_들어가면_고쳐서_통과():
    # 낱말 순서만 지키면 한 줄로 합쳐지는 경우(오류모음 §27 후속) — 코드가
    # 다시 감아서 막지 않고 통과시킨다. 뜻은 그대로, 줄바꿈만 없어진다.
    틀 = json.dumps(_틀(), ensure_ascii=False)
    d = _대본()
    d["slides"][0]["blocks"][0] = "첫줄\n둘째줄"   # 훅1은 한줄 슬롯(최소5~최대15)
    out = 대본검증.main(json.dumps(d, ensure_ascii=False), 틀)
    assert out["ok"] == "1", out["blocked"]
    # 줄바꿈은 그대로 둔다 — 배치가 `한덩어리` 로 풀어 다시 감는다(2026-09-18).


def test_대본검증_통틀어_넘치면_막는다():
    """**줄 수가 아니라 총량으로 막는다**(2026-09-18)."""
    틀 = json.dumps(_틀(), ensure_ascii=False)
    d = _대본()
    d["slides"][0]["blocks"][0] = ("이것은 첫 번째 매우 긴 문장입니다\n"
                                  "그리고 이것은 두 번째로 매우 긴 문장")
    out = 대본검증.main(json.dumps(d, ensure_ascii=False), 틀)
    assert out["ok"] == "0"
    assert "통틀어" in out["blocked"]
    assert "범위 안으로" in out["blocked"]

def test_대본검증_모자라면_총량으로_알려_준다():
    """**줄 단위 메시지를 안 낸다**(2026-09-18). 「블록2 줄1이 X자다」는 분량
    문제를 줄 나누기 문제처럼 잘못 짚어 LLM 이 헛다리를 짚었다(실물 2026-08-24).
    지금은 칸 하나에 메시지 하나다.
    """
    틀 = json.dumps(_틀(), ensure_ascii=False)
    d = _대본()
    d["slides"][1]["blocks"][1] = "짧다"
    out = 대본검증.main(json.dumps(d, ensure_ascii=False), 틀)
    # 2026-08-28: 모자란 쪽은 권고다 — 막지 않고 점수표에만 적는다.
    assert out["ok"] == "1", "모자란 것으로는 안 막는다"
    assert "통틀어 최소" in out["점수표"], out["점수표"]
    assert "모자라면 아래가 빈다" in out["점수표"]


def test_대본검증_이상한_모양도_안_죽고_slides가_깔끔하다():
    # 실물 실행(2026-08-23)에서 LLM이 slides 원소를 dict가 아니라 다른 걸로
    # 내거나, blocks 안에 문자열 아닌 값(중첩 목록 등)을 섞어 넣었더니 Dify가
    # "'list' object has no attribute 'items'" 로 코드 노드째 죽었다 — 이
    # 파일의 try/except 밖(Dify의 출력 형식 검사)이라 여기서 못 잡는다.
    # slides 출력은 항상 {role, blocks:[str,...]} 로만 이뤄져야 한다.
    틀 = json.dumps(_틀(), ensure_ascii=False)
    d = _대본()
    d["slides"][0] = ["이건 장이 아니라 목록이다"]           # 훅 장 자체가 목록
    d["slides"][1]["blocks"][0] = [13, 14]                   # 블록이 문자열이 아니라 목록
    out = 대본검증.main(json.dumps(d, ensure_ascii=False), 틀)
    assert out["ok"] == "0"
    for s in out["slides"]:
        assert isinstance(s, dict) and set(s) == {"role", "blocks"}
        assert all(isinstance(b, str) for b in s["blocks"])


def test_대본검증_고친것_우선():
    틀 = json.dumps(_틀(), ensure_ascii=False)
    나쁜것 = json.dumps({"slides": []}, ensure_ascii=False)
    좋은것 = json.dumps(_대본(), ensure_ascii=False)
    out = 대본검증.main(나쁜것, 틀, 고친것=좋은것)
    assert out["ok"] == "1", out["blocked"]


def test_대본검증_draft_출력이_실제로_검증한_것():
    """되돌리기를 여러 판 잇댈 때 다음 판이 이걸 `text` 로 받는다 — 고친것 이
    있으면 그걸, 없으면 원본을 그대로 돌려줘야 다음 판이 헷갈리지 않는다."""
    틀 = json.dumps(_틀(), ensure_ascii=False)
    원본 = json.dumps(_대본(), ensure_ascii=False)
    out = 대본검증.main(원본, 틀)
    assert out["draft"] == 원본

    고친것 = json.dumps(_대본({"훅": ["다른 헤드라인", "부제목 한 줄입니다"],
                            "사례": ["사례 헤드라인", "이건 본문 한 줄입니다 적당히"],
                            "요약": ["요약 헤드라인", "요약 본문 한 줄입니다 적당히"],
                            "CTA": ["CTA 한 줄 문구입니다"]}), ensure_ascii=False)
    out2 = 대본검증.main("아무 글", 틀, 고친것=고친것)
    assert out2["draft"] == 고친것


def test_대본검증_빈글자():
    틀 = json.dumps(_틀(), ensure_ascii=False)
    out = 대본검증.main("", 틀)
    assert out["ok"] == "0"
    assert "비어 있다" in out["blocked"]


def test_대본검증_json_아님():
    틀 = json.dumps(_틀(), ensure_ascii=False)
    out = 대본검증.main("이건 JSON 이 아니다", 틀)
    assert out["ok"] == "0"
    assert "JSON 이 아니다" in out["blocked"]


def test_대본검증_출력_깊이_5이하():
    """slides 출력이 Dify 5층 한도를 넘지 않는지 — list>dict>list>str = 4층."""
    틀 = json.dumps(_틀(), ensure_ascii=False)
    out = 대본검증.main(json.dumps(_대본(), ensure_ascii=False), 틀)

    def 깊이(v, 층=1):
        if isinstance(v, dict):
            return max([깊이(x, 층 + 1) for x in v.values()] or [층])
        if isinstance(v, (list, tuple)):
            return max([깊이(x, 층 + 1) for x in v] or [층])
        return 층
    assert 깊이(out["slides"]) <= 5


# ── 표시가 검증→배치까지 살아간다(검토 지적 ①) ──────────────────────
#
# `slides` 는 이미 `_기호빼기` 를 거친 글이라 `**`·`##` 가 하나도 안 남는다.
# 그걸 배치로 보내면 `강조.떼기` 가 뗄 것이 없어 굵기·형광펜이 늘 빈
# 목록이다 — 이 사슬을 실제로 태워야만 그 구멍이 보인다(과제 6·7 시험은
# `배치.main(d["slides"], …)` 처럼 검증을 건너뛰어서 이 구멍을 못 봤다).

def _굵게_한곳_기대하는_틀():
    """훅의 둘째 슬롯(여러줄)에 위계·굵게수를 얹어, 굵게 1곳을 기대하게 만든다.

    `강조.모으기()` 는 «위계» 가 있는 슬롯만 모은다 — 위계가 없으면 검증이
    항상 0곳을 기대해 표시 하나만 있어도 「강조 수가 안 맞는다」로 막힌다.
    """
    틀_dict = _틀()
    슬롯 = 틀_dict["슬라이드"][0]["글자슬롯"][1]
    슬롯.update({"위계": "본문", "굵게수": 1, "형광펜수": 0})
    return 틀_dict


def test_표시슬라이드는_표시가_그대로_있다():
    """다시 감기가 필요 없는 블록은 원문 그대로 나간다."""
    틀 = json.dumps(_굵게_한곳_기대하는_틀(), ensure_ascii=False)
    d = _대본({"훅": ["짧은 헤드라인", "**부제목** 한 줄입니다"],
              "사례": ["사례 헤드라인", "이건 본문 한 줄입니다 적당히"],
              "요약": ["요약 헤드라인", "요약 본문 한 줄입니다 적당히"],
              "CTA": ["CTA 한 줄 문구입니다"]})
    out = 대본검증.main(json.dumps(d, ensure_ascii=False), 틀)
    assert out["ok"] == "1", out["blocked"]
    assert out["표시슬라이드"][0]["blocks"][1] == "**부제목** 한 줄입니다"
    # `slides`(사람이 보는 몫)는 그대로 표시를 뗀 글이다 — 안 건드린다.
    assert out["slides"][0]["blocks"][1] == "부제목 한 줄입니다"


def test_검증에서_배치까지_강조_표시가_살아_굵기가_나온다():
    """이 시험이 핵심이다 — 검증이 낸 것을 그대로 배치에 먹여, 굵기가
    실제로 나오는지 끝까지 본다."""
    틀 = json.dumps(_굵게_한곳_기대하는_틀(), ensure_ascii=False)
    d = _대본({"훅": ["짧은 헤드라인", "**부제목** 한 줄입니다"],
              "사례": ["사례 헤드라인", "이건 본문 한 줄입니다 적당히"],
              "요약": ["요약 헤드라인", "요약 본문 한 줄입니다 적당히"],
              "CTA": ["CTA 한 줄 문구입니다"]})
    검 = 대본검증.main(json.dumps(d, ensure_ascii=False), 틀)
    assert 검["ok"] == "1", 검["blocked"]
    out = 배치.main(검["표시슬라이드"], 틀)
    카드들 = json.loads(out["cards_json"])
    훅2 = 카드들[0]["글자영역"][1]
    assert "부제목" in _효과글(훅2, "굵게"), 훅2["글줄"]
    # 사람이 보는 `slides`(표시 뗀 글)로 배치를 돌리면 굵기가 빈다 —
    # 그게 바로 검토 지적 ①의 증상이다.
    옛길 = 배치.main(검["slides"], 틀)
    옛카드들 = json.loads(옛길["cards_json"])
    assert _효과글(옛카드들[0]["글자영역"][1], "굵게") == []


def test_표시가_배치까지_살아_있다():
    """`**`·`##` 낱말이 검증을 거쳐 배치의 굵기 구간으로 이어진다."""
    틀_dict = _틀()
    슬롯 = 틀_dict["슬라이드"][1]["글자슬롯"][1]   # 사례 블록2: 여러줄, 최소10~최대30
    # **위계는 「본문」이 아닌 것으로 둔다.** 「본문」+여러줄+줄수는
    # `자수.통자수_자리인가` 가 «통자수 자리» 로 채가 버려 줄 나누기
    # (`_다시감기`) 를 거치지 않는다 — 이 시험이 보려는 것은 그 다시 감기
    # 갈래다.
    슬롯.update({"줄수": 2, "위계": "부제목", "굵게수": 1, "형광펜수": 0})
    틀 = json.dumps(틀_dict, ensure_ascii=False)
    d = _대본()
    # `_대본()` 은 「사례」 네 장이 같은 blocks 목록을 공유한다 — 그 목록을
    # 통째로 새로 갈아 껴야 다른 사례 장까지 표시가 새지 않는다.
    d["slides"][1]["blocks"] = ["사례 헤드라인", "가나다 라마바 **사아자** 차카타 파하가 나다라"]
    검 = 대본검증.main(json.dumps(d, ensure_ascii=False), 틀)
    assert 검["ok"] == "1", 검["blocked"]
    표시블록 = 검["표시슬라이드"][1]["blocks"][1]
    assert "**사아자**" in 표시블록
    # 다시 감기는 이제 안 한다(2026-09-18) — 줄 수는 배치가 폭으로 정한다.
    # 뗀 뒤 낱말 순서·개수가 표시 없는 `slides` 와 같아야 한다.
    assert 강조.떼기(표시블록)[0] == 검["slides"][1]["blocks"][1]

    out = 배치.main(검["표시슬라이드"], 틀)
    본문 = json.loads(out["cards_json"])[1]["글자영역"][1]
    assert "사아자" in _효과글(본문, "굵게"), 본문["글줄"]


# ──────────────────────────────────────────────────────── 구조 정리

def test_구조정리_정상_파싱():
    text = json.dumps({"사례_개수": 3, "사례_개요": ["첫째", "둘째", "셋째"]}, ensure_ascii=False)
    out = 구조정리.main(text)
    assert out["사례_개수"] == "3"
    assert out["outline"] == "1. 첫째\n2. 둘째\n3. 셋째"


def test_구조정리_범위_밖이면_가둔다():
    out = 구조정리.main(json.dumps({"사례_개수": 99, "사례_개요": []}, ensure_ascii=False))
    assert out["사례_개수"] == "6"
    out2 = 구조정리.main(json.dumps({"사례_개수": 0, "사례_개요": []}, ensure_ascii=False))
    assert out2["사례_개수"] == "1"


def test_구조정리_파싱_실패하면_기본값():
    for text in ("", "이건 JSON이 아니다", "{}", None):
        out = 구조정리.main(text)
        assert out["사례_개수"] == "4"
        assert out["outline"] == ""


def test_구조정리_json_감싸기_벗긴다():
    text = "```json\n" + json.dumps({"사례_개수": 2, "사례_개요": ["a", "b"]},
                                    ensure_ascii=False) + "\n```"
    out = 구조정리.main(text)
    assert out["사례_개수"] == "2"


# ──────────────────────────────────────────────────────── 배치

def test_배치_통과():
    틀 = json.dumps(_틀(), ensure_ascii=False)
    slides = _대본()["slides"]
    out = 배치.main(slides, 틀)
    카드들 = json.loads(out["cards_json"])
    assert len(카드들) == 7
    assert 카드들[0]["역할"] == "훅"
    assert 카드들[0]["글자영역"][0]["lines"] == ["짧은 헤드라인"]
    assert out["count"] == 7


def test_배치_box와_pt가_슬롯값을_그대로_옮긴다():
    틀_dict = _틀()
    틀 = json.dumps(틀_dict, ensure_ascii=False)
    slides = _대본()["slides"]
    out = 배치.main(slides, 틀)
    카드들 = json.loads(out["cards_json"])
    기대 = 틀_dict["슬라이드"][0]["글자슬롯"][0]
    실제 = 카드들[0]["글자영역"][0]
    assert 실제["box"] == 기대["box"]
    assert 실제["pt"] == 기대["pt"]
    assert 실제["weight"] == 기대["weight"]


def test_배치_굵게_표시_있는_줄에만_붙는다():
    """굵게는 **LLM 의 `**…**` 표시**로 붙는다. 표시가 없는 칸엔 안 붙는다.

    **형광펜이 아니라 굵게로 잰다**(2026-09-18) — 형광펜은 우리가 안 찍는다
    (사람 결정: 「형광펜은 너가 하지 마, 마지막에 사용자가 할 수 있게」).
    """
    틀 = json.dumps(_틀(), ensure_ascii=False)
    d = _대본({"훅": ["헤드라인", "부제목 한 줄입니다"],
              "사례": ["사례 헤드라인",
                      "첫 줄입니다\n**둘째** 줄입니다\n셋째 줄입니다"],
              "요약": ["요약 헤드라인", "요약 본문 한 줄입니다"],
              "CTA": ["CTA 한 줄 문구입니다"]})
    # **글자당 120px 로 재게 한다** — 폭 900 이면 일곱 자에서 감긴다. 원문
    # 줄바꿈은 지워지고(`한덩어리`) 폭으로 다시 감기므로(2026-09-18), 무엇이
    # 몇째 줄에 놓이는지는 이 자로 정해진다.
    카드들 = json.loads(배치.main(d["slides"], 틀, 재기만들기=lambda 슬롯: (lambda 글: 120.0 * len(글)))["cards_json"])
    사례2 = 카드들[1]["글자영역"][1]   # 사례 역할의 2번째 슬롯(Regular)
    assert (2, "둘째") in _효과조각(사례2, "굵게"), _효과조각(사례2, "굵게")
    # **표시가 없는 훅 슬롯엔 표시에서 온 굵게가 없다.** 「부제목 한 줄입니다」
    # 통째가 굵어지는 것은 구조 굵기(`소제목첫줄`)라 여기서 안 따진다.
    훅2 = 카드들[0]["글자영역"][1]
    표시굵기 = [(i, 글) for i, 글 in _효과조각(훅2, "굵게") if 글 != 훅2["lines"][i - 1]]
    assert 표시굵기 == [], 표시굵기
    assert _효과글(사례2, "형광펜") == [], "형광펜은 안 찍는다"

def test_배치_장수_안맞으면_죽는다():
    틀 = json.dumps(_틀(), ensure_ascii=False)
    slides = _대본()["slides"][:6]
    try:
        배치.main(slides, 틀)
        assert False, "여기 오면 안 된다 — 장수가 안 맞는데 조용히 통과했다"
    except ValueError as e:
        assert "골격" in str(e)


def test_배치_출력이_문자열_하나다():
    """맨 위 칸이 문자열이라야 굽는 노드가 «파묻지 않고» 그대로 끼울 수 있다."""
    틀 = json.dumps(_틀(), ensure_ascii=False)
    out = 배치.main(_대본()["slides"], 틀)
    assert isinstance(out["cards_json"], str)
    json.loads(out["cards_json"])   # 파싱되어야 한다


# ──────────────────────────────────────────────────────── 배치검증

def _배치결과(틀_dict=None, 대본_dict=None):
    틀_dict = 틀_dict or _틀()
    틀 = json.dumps(틀_dict, ensure_ascii=False)
    slides = (대본_dict or _대본())["slides"]
    return 배치.main(slides, 틀)["cards_json"], 틀


def test_배치검증_통과():
    카드_json, 틀 = _배치결과()
    out = 배치검증.main(카드_json, 틀)
    assert out["ok"] == "1", out["막힘"]
    assert out["cards_json"] == 카드_json


def test_배치검증_긴_줄은_안_막고_점수표에만_적는다():
    """**자수로는 아무것도 안 막는다**(사람 결정 2026-09-18: 「세로줄은 안
    본다니까」). 자수는 대본 검증에서 넓이로 이미 쟀고, 여기 문이 하나 더
    있으면 규칙대로 쓴 대본이 배치에서 막힌다."""
    카드_json, 틀 = _배치결과()
    카드들 = json.loads(카드_json)
    카드들[0]["글자영역"][0]["lines"] = ["아주 길게 자수를 넘기는 헤드라인 문장입니다 넘칩니다요"]
    out = 배치검증.main(json.dumps(카드들, ensure_ascii=False), 틀)
    assert out["ok"] == "1", out["막힘"]


def test_배치검증_짧은_글은_아무_말도_안_한다():
    """**글자수로는 안 막는다**(사람 결정 2026-08-28 — 「최대한 약하게, 슬라이드
    수만 잘 지키면 됨」). 모자란 것은 대본 검증이 점수표에 적는다 — 여기 문이
    하나 더 있어서 실물에서 「주식」 2자 같은 것들로 여덟 번 막혔다.
    """
    카드_json, 틀 = _배치결과()
    카드들 = json.loads(카드_json)
    카드들[0]["글자영역"][0]["lines"] = ["짧음"]
    out = 배치검증.main(json.dumps(카드들, ensure_ascii=False), 틀)
    assert out["ok"] == "1", out["막힘"]


def test_배치검증_글자끼리_겹치면_잡는다():
    카드_json, 틀 = _배치결과()
    카드들 = json.loads(카드_json)
    # 훅1번 글자영역 두 개를 서로 겹치게 만든다(원래 [50,50,950,150] / [50,200,950,380])
    카드들[0]["글자영역"][1]["box"] = [50, 100, 950, 300]
    out = 배치검증.main(json.dumps(카드들, ensure_ascii=False), 틀)
    assert out["ok"] == "0"
    assert "글자가 글자와 겹친다" in out["막힘"]


def test_배치가_붙여넣은_주소만_받는다():
    """사진은 이제 결과를 보고 작업대에서 넣는다(설계 §1). 시작 화면에서
    파일을 받던 길은 없앴고, 주소 붙여넣기만 남는다 — 자동화에 쓸 수 있다."""
    틀_dict = _틀()
    틀_dict["슬라이드"][0]["장식영역"] = [{"종류": "사진", "box": [600, 600, 900, 900]},
                                    {"종류": "로고", "box": [10, 10, 60, 40]}]
    틀 = json.dumps(틀_dict, ensure_ascii=False)
    카드들 = json.loads(배치.main(_대본()["slides"], 틀,
                              photo_urls="https://a.jpg\nhttps://b.png",
                              logo_url="https://c.png")["cards_json"])
    자리 = {r["종류"]: r.get("media_url") for r in 카드들[0]["장식영역"]}
    assert 자리["사진"] == "https://a.jpg"
    assert 자리["로고"] == "https://c.png"
    assert 카드들[1]["장식영역"][0]["media_url"] == "https://b.png"


def test_배치가_주소를_하나도_안_받아도_된다():
    틀 = json.dumps(_틀(), ensure_ascii=False)
    카드들 = json.loads(배치.main(_대본()["slides"], 틀)["cards_json"])
    assert len(카드들) == 7
    assert "media_url" not in 카드들[0]["장식영역"][0]


def test_배치검증_글자가_로고를_가려도_세기만_하고_안_막는다():
    """**표본 하나로 정했던 규칙을 사람이 되물렸다(2026-08-25).**

    처음엔 막았다 — 실측 게시물이 DHqCBQnRAjW 하나뿐이었고 거기서는 글자와 로고가
    한 번도 안 겹쳤기 때문이다. 둘째 게시물(DG0AA6PJ8s4)을 재 보니 일곱 장 중
    다섯 장에서 본문 글자 네모가 구석 로고를 문다. 잘못 그은 게 아니라 그 디자이너의
    습관이다. 그래서 점수표에 «경고» 로만 적고 통과시킨다.
    """
    틀_dict = _틀()
    틀_dict["슬라이드"][0]["장식영역"].append({"종류": "로고", "box": [50, 50, 200, 150]})
    틀 = json.dumps(틀_dict, ensure_ascii=False)
    카드_json = 배치.main(_대본()["slides"], 틀)["cards_json"]
    out = 배치검증.main(카드_json, 틀)
    assert out["ok"] == "1", out["막힘"]
    assert "글자가 로고를 가린다" not in out["막힘"]
    assert "로고를 가림 1건" in out["점수표"], out["점수표"]


def test_배치검증_사진끼리_겹쳐도_안잡는다():
    """실물(DHqCBQnRAjW) 1번 장은 사진 3개+인물 1개가 서로 겹친다(콜라주) —
    정상 디자인이다. 사진·인물끼리 겹침을 막으면 원본 그대로도 못 통과한다."""
    틀_dict = _틀()
    틀_dict["슬라이드"][0]["장식영역"] = [
        {"종류": "사진", "box": [600, 600, 900, 900]},
        {"종류": "인물", "box": [650, 650, 950, 950]},   # 사진과 겹친다 — 일부러
    ]
    틀 = json.dumps(틀_dict, ensure_ascii=False)
    out = 배치검증.main(*_배치결과(틀_dict=틀_dict))
    assert out["ok"] == "1", out["막힘"]


def test_배치검증_글자가_사진위에_얹혀도_안잡는다():
    """실물 1번 장 헤드라인은 인물 사진 위에 얹혀 있다 — 그게 이 템플릿의 디자인이다."""
    틀_dict = _틀()
    틀_dict["슬라이드"][0]["장식영역"] = [{"종류": "사진", "box": [40, 40, 960, 400]}]
    틀 = json.dumps(틀_dict, ensure_ascii=False)   # 훅1번 글자([50,50,950,150])가 사진과 겹친다
    out = 배치검증.main(*_배치결과(틀_dict=틀_dict))
    assert out["ok"] == "1", out["막힘"]


def test_배치검증_화면밖_잡는다():
    카드_json, 틀 = _배치결과()
    카드들 = json.loads(카드_json)
    카드들[0]["글자영역"][0]["box"] = [50, 50, 1200, 150]   # x1 > 1080
    out = 배치검증.main(json.dumps(카드들, ensure_ascii=False), 틀)
    assert out["ok"] == "0"
    assert "화면" in out["막힘"] and "밖" in out["막힘"]


# 「자수 줄여 다시」는 **없앴다**(2026-09-18). 자수 한계가 네모 넓이로 정해진
# 뒤로 모든 글자칸이 «통틀어 몇 자» 라 줄 단위로 잘라 낼 것이 없다 — 그 노드는
# 한 글자도 못 자르는 빈 노드가 됐다. 넘치면 자르지 않고 모델이 다시 쓴다.


# ──────────────────────────────────────────────────────── 문턱 넓히기 (§27)

def test_자수창_하한은_상한의_65퍼센트다():
    # 사람 결정(2026-08-26): 관측값이 아니라 네모에서 뽑는다.
    # 2026-09-18: 사람 지시대로 0.65 로 맞춘다(2/3 → 1/2 를 거쳐 왔다).
    assert 자수창(33) == (21, 33)
    assert 자수창(27) == (18, 27)
    assert 자수창(8) == (5, 8)


def test_자수창은_상한을_안_건드린다():
    # 상한은 렌더 폭에서 나온 물리 제약이다 — 넓히면 카드 밖으로 튀어나간다.
    for 상한 in (1, 2, 7, 28, 36, 120):
        assert 자수창(상한)[1] == 상한


# ── 원본 기준 자수창 (사람 결정 2026-09-19) ────────────────────────
#
# 네모 넓이로 뽑은 상한은 「글자로 빈틈없이 채웠을 때」라 원본과 안 맞는다.
# 실측(DG0AA6PJ8s4): 6번 장 제목은 원본이 「이지리스닝」 다섯 자인데 넓이 셈은
# 27~42자를 요구했다 — 여덟 배다. 그 칸을 맞추면 오히려 원본과 달라진다.
# 그래서 **원본이 실제로 쓴 자수**를 기준으로 삼는다.

def test_배수는_원본_길이로_정해진다():
    from template_out import 자수배수
    assert 자수배수(5) == 2.0          # 제목
    assert 자수배수(50) == 2.0
    assert 자수배수(51) == 1.5         # 짧은 본문
    assert 자수배수(150) == 1.5
    assert 자수배수(151) == 1.3
    assert 자수배수(200) == 1.3
    assert 자수배수(201) == 1.2        # 긴 본문


def test_원본이_있으면_원본을_기준으로_창을_낸다():
    # 최소 = 원본 ÷ 배수 · 최대 = 원본 × 배수
    assert 자수창(300, 원본=100) == (67, 150)      # ×1.5
    assert 자수창(400, 원본=180) == (138, 234)     # ×1.3
    assert 자수창(500, 원본=240) == (200, 288)     # ×1.2


def test_물리한계가_최종_천장이다():
    # 네모에 10자만 들어가면 15자를 보장해도 10자가 최종이다.
    assert 자수창(10, 원본=4)[1] == 10


def test_상한은_최소_15자를_보장한다():
    # 원본 5자면 ×2 라도 10자뿐이라 두세 낱말이다 — 너무 빡빡하다.
    # round 는 2.5 를 2 로 내린다 — 옛 공식과 같은 `round` 를 쓴다.
    assert 자수창(42, 원본=5) == (2, 15)


def test_원본이_물리한계보다_크면_원본이_천장이_된다():
    # 실측: 칸 64개 중 23개(36%)에서 원본이 넓이 셈을 넘었다. 「가」 폭으로
    # 나누는데 실제 글에는 공백·숫자·영문이 섞여 더 많이 들어가기 때문이다.
    # 원본이 그 네모에 실제로 들어갔다는 것이 계산보다 센 증거다.
    assert 자수창(18, 원본=25) == (12, 25)


def test_원본이_없으면_옛_공식_그대로다():
    # 라벨과 잰 글자가 안 맞아 원본을 못 꺼낸 칸이 16% 있다. 그 칸은 안 바꾼다.
    assert 자수창(33, 원본=None) == 자수창(33) == (21, 33)
    assert 자수창(33, 원본=0) == (21, 33)


def test_원본_기준_창도_하한이_상한을_안_넘는다():
    for 원본 in range(1, 300):
        for 상한 in (1, 5, 20, 100, 400):
            하, 상 = 자수창(상한, 원본=원본)
            assert 1 <= 하 <= 상, (원본, 상한, 하, 상)


def test_네모를_다시_재도_원본_기준을_안_잃는다():
    """도형 안에 든 글자칸은 네모를 도형에 맞춰 줄인 뒤 자수를 **다시** 잰다
    (`_도형안글자_가운데`). 그때는 잰 글(`t`)이 없으니 슬롯에 적어 둔
    `원본자수` 를 써야 한다.

    안 그러면 그 칸만 옛 공식으로 돌아간다 — 실물(DG0AA6PJ8s4): 제목이 전부
    알약 도형 안이라, 원본 8자짜리 칸이 25~39자를 요구했다.
    """
    슬롯 = {"슬롯키": "정의 Bold 41 한줄", "box": [0, 0, 620, 121],
            "pt": 41, "weight": "Bold", "font": "프리텐다드",
            "원본자수": 8, "원본줄수": 1}
    틀만들기._자수매기기(슬롯)          # t 없이 — 다시 재는 길
    # 원본 8자 → ×2 = 16자. 옛 공식이었다면 네모 넓이의 65% 라 훨씬 컸다.
    assert (슬롯["최소"], 슬롯["최대"]) == (4, 16), (슬롯["최소"], 슬롯["최대"])


def test_자수창_하한은_상한을_넘지_않는다():
    # 상한이 1~2 로 아주 좁을 때 하한이 상한을 넘어서면 어떤 문장도 못 통과한다.
    for 상한 in (1, 2, 3):
        하, 상 = 자수창(상한)
        assert 1 <= 하 <= 상


def test_바닥비는_65퍼센트다():
    """사람 지시 2026-09-18 — 하한은 총량의 65%.

    `template_out.바닥비` 와 같은 값이어야 한다 — 갈리면 두 틀이 다른 잣대를 쓴다.
    """
    assert 바닥비 == 0.65


# ──────────────────────────────────────────────────────── 실물 데이터로 통합 확인

def test_실물_틀에서_대본_배치_검증까지_한바퀴():
    """손으로 쓴 골든 대본으로 전체 사슬(틀고르기→대본검증→배치→배치검증)이
    한 번에 통과하는지 — 골든 재료 그 자체가 사슬과 안 맞으면
    `check_cardnews.py` 의 골든 관문이 의미가 없다.

    **틀은 «고정된» 파일을 쓴다(`tests/틀_골든.json`).** 살아 있는 계량표에서
    뽑으면 게시물을 하나 라벨링할 때마다 서랍이 고르는 디자인이 바뀌어 이
    시험이 깨진다 — 이 관문이 보는 것은 «사슬이 끝까지 도는가» 이지 «지금
    말뭉치가 골든 대본과 맞는가» 가 아니다. 살아 있는 틀은
    `test_살아있는_틀도_사슬이_받는_모양이다` 가 모양만 본다.
    """
    sys.path.insert(0, str(ROOT / "dify"))
    import 카드뉴스_틀고르기 as 틀고르기

    서랍_json = (ROOT / "dify" / "tests" / "틀_골든.json").read_text(encoding="utf-8")
    대본_dict = json.loads((ROOT / "dify" / "카드뉴스_시험대본.json").read_text(encoding="utf-8"))
    사례_개수 = sum(1 for x in 대본_dict["slides"] if x.get("role") == "사례")
    틀_json = 틀고르기.main(서랍_json, str(사례_개수))["틀_json"]

    v1 = 대본검증.main(json.dumps(대본_dict, ensure_ascii=False), 틀_json)
    assert v1["ok"] == "1", v1["blocked"]

    b = 배치.main(v1["slides"], 틀_json)
    v2 = 배치검증.main(b["cards_json"], 틀_json)
    assert v2["ok"] == "1", v2["막힘"]


def test_살아있는_틀도_사슬이_받는_모양이다():
    """살아 있는 계량표에서 뽑은 틀이 «모양» 만은 사슬이 받을 수 있어야 한다.

    내용(자수 한계·디자인)은 게시물이 늘 때마다 바뀌므로 안 본다. 대신
    「틀 고르기」가 실제로 통과하는지 — 서랍이 있고, 골격을 만들 수 있고,
    장마다 글자슬롯이 있는지 — 만 본다.
    """
    sys.path.insert(0, str(ROOT / "dify"))
    import make_dsl_cardnews as m
    import 카드뉴스_틀고르기 as 틀고르기

    서랍 = m.기본틀_쓰기(ROOT / "dify" / "templates" / "기본.json")
    난것 = 틀고르기.main(json.dumps(서랍, ensure_ascii=False), "4")
    틀 = json.loads(난것["틀_json"])
    assert len(틀["슬라이드"]) == 7
    assert all(s["글자슬롯"] for s in 틀["슬라이드"]), "장마다 글자 칸이 있어야 한다"
    assert 난것["few_shot"].strip()


def test_정렬은_왼쪽이_기본이고_표지만_잰_대로다():
    """**기본은 왼쪽**(사람 결정 2026-09-18). 글자 수가 원본과 다르니 가운데로
    맞춘 줄이 원본처럼 안 앉는다 — 장마다 흔들리는 것보다 왼쪽으로 고정하는
    게 낫다. 표지는 디자인 자체가 가운데·오른쪽인 일이 많아 예외다.

    표지에서 «오른쪽»을 접으면 작업대 화면(오른쪽으로 그림)과 서버(왼쪽으로
    그림)가 어긋난다."""
    from make_dsl_cardnews import _정렬칸
    assert _정렬칸("오른쪽", 표지=True) == "오른쪽"
    assert _정렬칸("가운데", 표지=True) == "가운데"
    assert _정렬칸("단일", 표지=True) == "왼쪽"
    assert _정렬칸(None, 표지=True) == "왼쪽"
    # 표지가 아니면 잰 값이 무엇이든 왼쪽이다.
    assert _정렬칸("오른쪽") == "왼쪽"
    assert _정렬칸("가운데") == "왼쪽"


def test_굵게_줄번호가_1부터_센다():
    """줄 순서는 1부터 세어 읽는다 — 0부터 세면 한 줄 앞에 걸린다.

    예전엔 0부터 센 자리를 담아서 **의도한 줄보다 한 줄 앞에** 칠해졌다. 길이를
    잰 줄과 칠하는 줄이 서로 달랐다. 여기서 세는 줄 순서는 결과를 읽으려는
    것일 뿐 저장하는 값이 아니다 — 효과는 글자에 붙는다(`_글줄만들기`).

    **형광펜이 아니라 굵게로 잰다**(2026-09-18) — 형광펜은 우리가 안 찍는다.
    """
    틀_dict = _틀()
    틀 = json.dumps(틀_dict, ensure_ascii=False)
    d = _대본({"훅": ["헤드라인", "부제목 한 줄입니다"],
              "사례": ["사례 헤드라인",
                      "첫 줄입니다\n**둘째** 줄입니다\n셋째 줄입니다"],
              "요약": ["요약 헤드라인", "요약 본문 한 줄입니다"],
              "CTA": ["CTA 한 줄 문구입니다"]})
    카드들 = json.loads(배치.main(d["slides"], 틀, 재기만들기=lambda 슬롯: (lambda 글: 120.0 * len(글)))["cards_json"])
    본문 = 카드들[1]["글자영역"][1]
    굵 = [i for i, 글 in _효과조각(본문, "굵게") if 글 == "둘째"]
    assert 굵 == [len(본문["lines"]) - 1], _효과조각(본문, "굵게")



def test_기본틀도_서랍과_한계출처를_갖는다(tmp_path):
    """①(웹 분석)과 ②(작업대)가 **같은 파일 모양**이라야 Dify 가 어느 쪽에서 온
    틀인지 몰라도 된다. 한계출처는 서로 다르다 — 그게 구별하라고 있는 칸이다."""
    from make_dsl_cardnews import 기본틀_쓰기
    p = tmp_path / "기본.json"
    틀 = 기본틀_쓰기(p)
    assert p.exists()
    난것 = json.loads(p.read_text(encoding="utf-8"))
    assert 난것 == 틀
    assert 난것["한계출처"] == "관측"
    assert "서랍" in 난것
    assert 난것["서랍"]["사례"], "사례 디자인이 하나도 없다"
    for 디자인 in 난것["서랍"]["사례"]:
        assert "덩이수" in 디자인 and "사진자리수" in 디자인
        assert "index" not in 디자인
    # 기존 칸도 그대로
    assert 난것["골격"][0] == "훅"
    assert len(난것["슬라이드"]) == len(난것["골격"])


# ──────────────────────────────────────────────────────── 틀 고르기 (Task 14)
# 대본이 장 수를 정하고, 틀은 그 장에 입힐 옷을 댄다 — 틀이 장 수를 정하지 않는다.

def _서랍(사례들):
    """사례들 = [(덩이수, 사진자리수), …]"""
    def 디자인(역할, 덩이, 사진):
        return {"역할": 역할, "배경": {"종류": "단색", "hex": "#FFFFFF"},
                "장식영역": [{"종류": "사진", "box": [0, 0, 1, 1]}] * 사진,
                "글자슬롯": [{"슬롯키": f"{역할}{i}", "box": [0, 0, 100, 50], "pt": 20,
                          "weight": "Bold", "align": "왼쪽", "font": "프리텐다드",
                          "글자색": "#000000", "줄종류": "한줄", "최소": 1,
                          "최대": 10, "자리가변": False, "줄수": 1}
                         for i in range(덩이)],
                "덩이수": 덩이, "사진자리수": 사진}
    return {"훅": [디자인("훅", 2, 3)],
            "사례": [디자인("사례", 덩이, 사진) for 덩이, 사진 in 사례들],
            "요약": [디자인("요약", 2, 0)],
            "CTA": [디자인("CTA", 1, 0)]}


def test_고르기가_골격_길이만큼_낸다():
    import 카드뉴스_틀고르기 as 고르기
    서랍 = _서랍([(2, 2), (3, 1)])
    골격 = ["훅", "사례", "사례", "사례", "요약", "CTA"]
    난것 = 고르기.고르기(서랍, 골격)
    assert len(난것) == len(골격)
    assert [d["역할"] for d in 난것] == 골격


def test_고르기가_안_쓴_것을_먼저_쓴다():
    """같은 디자인이 연달아 나오는 것을 피한다."""
    import 카드뉴스_틀고르기 as 고르기
    서랍 = _서랍([(2, 2), (2, 2)])
    난것 = 고르기.고르기(서랍, ["사례", "사례"])
    assert 난것[0] is not 난것[1] or 난것[0]["글자슬롯"][0]["슬롯키"] != 난것[1]["글자슬롯"][0]["슬롯키"]


def test_고르기가_다_쓰면_처음부터_다시_돈다():
    import 카드뉴스_틀고르기 as 고르기
    서랍 = _서랍([(2, 2), (2, 1)])
    난것 = 고르기.고르기(서랍, ["사례"] * 5)
    assert len(난것) == 5


def test_그_역할이_서랍에_없으면_말해_준다():
    import 카드뉴스_틀고르기 as 고르기
    with pytest.raises(ValueError) as e:
        고르기.고르기(_서랍([(2, 2)]), ["훅", "없는역할"])
    assert "없는역할" in str(e.value)


def test_틀고르기가_골격을_사례_개수만큼_만든다():
    """대본이 장 수를 정하고, 틀은 그 장에 입힐 옷을 댄다 — 틀이 장 수를 안 정한다."""
    import 카드뉴스_틀고르기 as 고르기
    틀 = {"골격": ["훅", "사례", "요약", "CTA"], "캔버스": {"w": 1080, "h": 1350},
         "강조색": "#C9FC95", "슬라이드": [], "서랍": _서랍([(2, 2), (3, 1)]),
         "형광펜참고": {"측정": 0, "제외": 0, "평균비율": 0.28, "줄별평균": {}}}
    난것 = 고르기.main(틀_json=json.dumps(틀, ensure_ascii=False), 사례_개수="3")
    새틀 = json.loads(난것["틀_json"])
    assert 새틀["골격"] == ["훅", "사례", "사례", "사례", "요약", "CTA"]
    assert len(새틀["슬라이드"]) == 6
    assert [s["index"] for s in 새틀["슬라이드"]] == [1, 2, 3, 4, 5, 6]


def test_틀고르기가_서랍_없는_옛_틀을_거절한다():
    import 카드뉴스_틀고르기 as 고르기
    옛틀 = {"골격": ["훅"], "캔버스": {"w": 1080, "h": 1350}, "강조색": "#C9FC95",
          "슬라이드": [], "형광펜참고": {}}
    with pytest.raises(ValueError) as e:
        고르기.main(틀_json=json.dumps(옛틀, ensure_ascii=False), 사례_개수="1")
    assert "서랍" in str(e.value)


def test_배치가_틀의_층을_사진에_도로_박는다():
    """「틀로 내보내기」한 디자인의 겹침 순서가 다음 판에도 살아 있어야 한다."""
    틀_dict = _틀()
    s = 틀_dict["슬라이드"][0]
    for j, 장식 in enumerate(s["장식영역"]):
        장식["층"] = j
    out = 배치.main(_대본()["slides"], json.dumps(틀_dict, ensure_ascii=False))
    c = json.loads(out["cards_json"])[0]
    assert [r["층"] for r in c["장식영역"]] == list(range(len(s["장식영역"])))
    assert all("층" not in r for r in c["글자영역"]), "글자는 언제나 앞이라 층이 없다"


def test_틀에_층이_없으면_카드에도_안_생긴다():
    out = 배치.main(_대본()["slides"], json.dumps(_틀(), ensure_ascii=False))
    c = json.loads(out["cards_json"])[0]
    assert all("층" not in r for r in c["글자영역"] + c["장식영역"])


def test_글자끼리_겹치면_여전히_막는다():
    틀_dict = _틀()
    틀 = json.dumps(틀_dict, ensure_ascii=False)
    b = 배치.main(_대본()["slides"], 틀)
    카드들 = json.loads(b["cards_json"])
    글 = 카드들[1]["글자영역"]
    assert len(글) >= 2, "이 시험은 글자 덩이가 둘 이상인 장이 필요하다"
    글[1]["box"] = list(글[0]["box"])
    난것 = 배치검증.main(json.dumps(카드들, ensure_ascii=False), 틀)
    assert 난것["ok"] == "0"
    assert "글자와 겹친다" in 난것["막힘"]


def test_게시물_하나만_골라_틀을_뽑는다():
    """`코드` 를 주면 그 게시물의 슬라이드만 실린다."""
    sys.path.insert(0, str(ROOT / "dify"))
    import make_dsl_cardnews as m

    하나 = m.build_recipe_payload("DG0AA6PJ8s4")
    전부 = m.build_recipe_payload()
    assert len(하나["슬라이드"]) == 7
    assert len(전부["슬라이드"]) > len(하나["슬라이드"]), "합친 것이 더 커야 한다"
    # 키키는 일곱 장 전부 흰 바탕이다 — 크림(#F1FFE5)은 예전 게시물 것이다.
    바탕 = {s["배경"].get("hex") for s in 하나["슬라이드"]}
    assert 바탕 == {"#FFFFFF"}, 바탕


def test_틀의_골격이_제_슬라이드와_길이가_같다():
    """예전엔 `docs[0]["skeleton"]` 이라, 게시물이 하나뿐일 때만 우연히 맞았다.
    둘이 되자 슬라이드 14장에 골격 7개가 됐다 — 런타임에는 「틀 고르기」가 그
    값을 갈아 끼워서 **안 보이던 어긋남**이다."""
    sys.path.insert(0, str(ROOT / "dify"))
    import make_dsl_cardnews as m

    for 코드 in (None, "DG0AA6PJ8s4"):
        틀 = m.build_recipe_payload(코드)
        assert len(틀["골격"]) == len(틀["슬라이드"]), 코드


def test_없는_게시물을_고르면_멈춘다():
    sys.path.insert(0, str(ROOT / "dify"))
    import make_dsl_cardnews as m

    with pytest.raises(SystemExit, match="없는코드"):
        m.build_recipe_payload("없는코드")


def test_게시물별_틀을_파일로_쓴다(tmp_path):
    sys.path.insert(0, str(ROOT / "dify"))
    import make_dsl_cardnews as m

    틀 = m.틀_쓰기("DG0AA6PJ8s4", tmp_path / "DG0AA6PJ8s4.json")
    난것 = json.loads((tmp_path / "DG0AA6PJ8s4.json").read_text(encoding="utf-8"))
    assert 난것["코드"] == "DG0AA6PJ8s4"
    assert 난것["나온곳"] == "분석"
    assert 난것["한계출처"] == "관측"
    assert 난것["서랍"], "서랍이 있어야 「틀 고르기」가 받는다"
    assert len(난것["슬라이드"]) == 7
    assert 난것 == 틀, "돌려준 것과 쓴 것이 같아야 한다"


def test_목록이_간판_노릇을_한다(tmp_path):
    sys.path.insert(0, str(ROOT / "dify"))
    import make_dsl_cardnews as m

    m.틀_쓰기("DG0AA6PJ8s4", tmp_path / "DG0AA6PJ8s4.json")
    m.틀_쓰기("DHqCBQnRAjW", tmp_path / "DHqCBQnRAjW.json")
    목록 = m.목록만들기(tmp_path)
    assert len(목록) == 2
    한줄 = next(x for x in 목록 if x["코드"] == "DG0AA6PJ8s4")
    assert 한줄["장수"] == 7
    assert 한줄["역할"]["훅"] == 1
    assert 한줄["강조색"].startswith("#")
    assert 한줄["나온곳"] == "분석"
    assert 한줄["주소"].endswith("/templates/DG0AA6PJ8s4.json")
    적힌것 = json.loads((tmp_path / "목록.json").read_text(encoding="utf-8"))
    assert 적힌것 == 목록


def test_목록은_기본틀과_자기_자신을_안_센다(tmp_path):
    """`기본.json` 은 여러 게시물을 합친 것이라 «한 게시물의 틀» 이 아니다."""
    sys.path.insert(0, str(ROOT / "dify"))
    import make_dsl_cardnews as m

    m.틀_쓰기("DG0AA6PJ8s4", tmp_path / "DG0AA6PJ8s4.json")
    m.기본틀_쓰기(tmp_path / "기본.json")
    m.목록만들기(tmp_path)
    목록 = m.목록만들기(tmp_path)      # 두 번 돌려도 목록 자신이 안 들어간다
    assert [x["코드"] for x in 목록] == ["DG0AA6PJ8s4"]


# ──────────────────────────────────────────────────── 없는 역할 대신하기 (B3)

def _서랍만(*역할들):
    """그 역할들만 든 가짜 서랍. 디자인 속은 안 본다."""
    return {역: [{"역할": 역, "배경": {"종류": "단색", "hex": "#FFFFFF"},
                "장식영역": [], "글자슬롯": [], "덩이수": 0, "사진자리수": 0}]
            for 역 in 역할들}


# ──────────────────────────────────────────────── 본문류 한 통 모으기 (R6)
# 없을 때만 대신하면 서랍이 기울어 있을 때 놀고 있는 옷이 생긴다 — 실측
# (DG0AA6PJ8s4): 사례 1벌 · 해결 4벌인데 사례 자리 넷을 그 「하나」로 돌려
# 쓰고 해결 넷은 한 번도 안 불렸다(2026-08-26). 그래서 본문류는 그 역할이
# 있어도 무리를 통째로 모은다. 훅·요약·CTA 는 그대로 안 모은다.

def test_후보모으기가_본문류를_한_통으로_모은다():
    """사례가 서랍에 있어도, 같은 본문류인 해결도 후보에 들어와야 한다."""
    import 카드뉴스_틀고르기 as 고
    서랍 = _서랍만("훅", "사례", "해결", "요약")
    후보역할 = {d["역할"] for d in 고.후보모으기("사례", 서랍)}
    assert 후보역할 == {"사례", "해결"}, 후보역할


def test_후보모으기는_요약과_CTA를_안_모은다():
    """요약 자리에 CTA 디자인이 섞이면 그건 다른 옷이다 — 안 모은다."""
    import 카드뉴스_틀고르기 as 고
    서랍 = _서랍만("훅", "사례", "요약", "CTA")
    assert [d["역할"] for d in 고.후보모으기("요약", 서랍)] == ["요약"]
    assert [d["역할"] for d in 고.후보모으기("CTA", 서랍)] == ["CTA"]


def test_해결은_사례_자리에_쓴다():
    import 카드뉴스_틀고르기 as 고
    assert 고.대신할역할("사례", _서랍만("훅", "해결", "요약")) == "해결"


def test_CTA_가_없으면_요약을_쓴다():
    import 카드뉴스_틀고르기 as 고
    assert 고.대신할역할("CTA", _서랍만("훅", "사례", "요약")) == "요약"


def test_요약도_없으면_사례를_쓴다():
    import 카드뉴스_틀고르기 as 고
    assert 고.대신할역할("CTA", _서랍만("훅", "사례")) == "사례"


def test_아무것도_없으면_None():
    import 카드뉴스_틀고르기 as 고
    assert 고.대신할역할("사례", _서랍만("훅")) is None


def test_있는_역할은_대신_안_한다():
    import 카드뉴스_틀고르기 as 고
    assert 고.대신할역할("사례", _서랍만("훅", "사례", "해결")) is None


def test_키키_서랍으로_일곱_장이_나온다():
    """실물 확인 — 키키에는 CTA 가 없다. 예전엔 여기서 ValueError 로 멈췄다."""
    import 카드뉴스_틀고르기 as 고
    서랍 = _서랍만("훅", "사례", "해결", "요약")
    고른것 = 고.고르기(서랍, ["훅", "사례", "사례", "사례", "사례", "요약", "CTA"])
    assert len(고른것) == 7
    assert 고른것[-1]["역할"] == "요약", "요약으로 끝나야 한다"


def test_형광펜은_안_싣고_굵게만_싣는다():
    """**형광펜은 우리가 안 찍는다**(사람 결정 2026-09-18: 「형광펜은 너가 하지
    마, 그냥 굵기 정도나 하고, 형광펜은 마지막에 사용자가 할 수 있게」).

    잰 형광펜 색을 못 믿는다 — 어두운 배경 디자인에서는 글자 사이로 비친 배경이
    띠로 잡혀 거의 검정이 나온다(실물 DYzN0Uzgaq6: #0E0C0D · #0F0C0A · #1E1F1E).
    검은 글자 위에 검은 띠가 깔려 글자가 안 보였다. 작업대에 형광펜 단추가 있다.

    `##` 를 써도 막지 않는다 — 조용히 떼고 글자만 남긴다.
    """
    틀_dict = _틀()
    틀_dict["강조색"] = "#FF8800"
    틀 = json.dumps(틀_dict, ensure_ascii=False)
    d = _대본({"훅": ["헤드라인", "부제목 한 줄입니다"],
              "사례": ["사례 헤드라인",
                      "첫 줄입니다\n##둘째## **셋째** 줄입니다\n넷째 줄입니다"],
              "요약": ["요약 헤드라인", "요약 본문 한 줄입니다"],
              "CTA": ["CTA 한 줄 문구입니다"]})
    본문 = json.loads(배치.main(d["slides"], 틀)["cards_json"])[1]["글자영역"][1]
    assert _효과글(본문, "형광펜") == []
    assert _효과글(본문, "굵게"), "굵게까지 사라졌다"
    assert "##" not in "".join(본문["lines"]), "표시가 글에 남았다"


def test_서랍에_없는_CTA_는_골격에도_안_들어간다():
    """**없는 옷을 지어내지 않는다**(사람 결정 2026-09-18).

    여태는 CTA 자리를 요약으로 채웠는데, 그러면 같은 요약 디자인이 두 장 나온다 —
    사람이 실물(AI소식 미니)에서 잡은 그 탈이다.
    """
    import 카드뉴스_틀고르기 as 고
    서랍 = _서랍만("훅", "사례", "요약")
    난것 = 고.main(json.dumps({"서랍": 서랍, "골격": [], "슬라이드": []},
                           ensure_ascii=False), "1")
    골격 = json.loads(난것["틀_json"])["골격"]
    assert "CTA" not in 골격, 골격
    assert 골격.count("요약") == 1, 골격


# ──────────────────────────────────────────── 셈 열쇠는 통 기준 (R7)
# R6 이 `쓴수` 열쇠를 「요청한 역할」로 통일하면서 대신하기 길(훅·요약·CTA)
# 이 깨졌다 — 「요약 자리」와 「요약으로 대신한 CTA 자리」는 같은 서랍
# 칸(같은 통)을 나눠 쓰는데, 역할로 세면 둘이 각자 0번부터 세서 같은
# 디자인이 잇달아 나온다. 2026-08-26 재검토가 재현.

def _디자인(역할, 표):
    """구별용 표(배경 hex)를 붙인 가짜 디자인 하나. 서랍 항목 속은 안 본다."""
    return {"역할": 역할, "배경": {"종류": "단색", "hex": 표},
            "장식영역": [], "글자슬롯": [], "덩이수": 0, "사진자리수": 0}


def test_대신하기_길에서는_같은_통을_나눠_쓴다():
    """요약 두 벌·CTA 없이 고르면, 요약 자리와 CTA 자리가 달라야 한다."""
    import 카드뉴스_틀고르기 as 고
    서랍 = {"훅": [_디자인("훅", "#111111")],
           "사례": [_디자인("사례", "#222222")],
           "요약": [_디자인("요약", "#AAAAAA"), _디자인("요약", "#BBBBBB")]}
    고른것 = 고.고르기(서랍, ["훅", "사례", "요약", "CTA"])
    요약자리, CTA자리 = 고른것[2], 고른것[3]
    assert CTA자리.get("_대신") == "CTA", "CTA 자리는 요약을 대신 써야 한다"
    assert 요약자리["배경"]["hex"] != CTA자리["배경"]["hex"], (
        f"요약 자리와 CTA 자리가 같은 디자인을 집었다: {요약자리['배경']['hex']}")


def test_본문류_자리가_여럿이면_그래도_돌려쓴다():
    """본문류를 한 통으로 모아도 «안 쓴 것을 먼저» 규칙은 살아 있어야 한다."""
    import 카드뉴스_틀고르기 as 고
    서랍 = {"훅": [_디자인("훅", "#111111")],
           "사례": [_디자인("사례", "#AAAAAA"), _디자인("사례", "#BBBBBB")]}
    고른것 = 고.고르기(서랍, ["훅", "사례", "사례"])
    사례들 = [d["배경"]["hex"] for d in 고른것[1:]]
    assert 사례들[0] != 사례들[1], f"사례 자리가 잇달아 같은 디자인을 집었다: {사례들}"


# ──────────────────────────────────────────── A1 — 재 놓고 버리던 값을 틀에 싣는다

def test_틀에_위계와_줄간격이_실린다():
    """이미 정확히 재고 있는 값이다 — 흘려보내기만 하면 된다."""
    sys.path.insert(0, str(ROOT / "dify"))
    import make_dsl_cardnews as m

    틀 = m.build_recipe_payload("DG0AA6PJ8s4")
    슬롯들 = [x for s in 틀["슬라이드"] for x in s["글자슬롯"]]
    assert 슬롯들, "글자 슬롯이 있어야 한다"
    assert all("위계" in x for x in 슬롯들), "위계가 빠진 슬롯이 있다"
    assert {x["위계"] for x in 슬롯들} <= {"제목", "본문", "꼬리표"}
    # 키키는 장마다 제목 하나 + 본문 하나다(1번 장만 제목 하나).
    assert "제목" in {x["위계"] for x in 슬롯들}
    assert "본문" in {x["위계"] for x in 슬롯들}

    줄간격들 = [x["줄간격"] for x in 슬롯들 if "줄간격" in x]
    assert 줄간격들, "줄간격이 하나도 안 실렸다"
    assert all(isinstance(v, float) and 0.5 < v < 3.0 for v in 줄간격들), 줄간격들
    assert len(set(줄간격들)) > 1, "장마다 다른 값인데 하나로 뭉개졌다"


def test_틀에_효과가_실린다():
    """3번 장 본문에 «밑줄» 이 잡혀 있다(실측 2026-08-26)."""
    sys.path.insert(0, str(ROOT / "dify"))
    import make_dsl_cardnews as m

    틀 = m.build_recipe_payload("DG0AA6PJ8s4")
    효과들 = [e for s in 틀["슬라이드"] for x in s["글자슬롯"] for e in x.get("효과", [])]
    assert "밑줄" in 효과들, 효과들


def test_틀에_기울기가_실린다():
    """키키 1번 장 로고가 3.6° 다. 예전엔 재고도 안 실었다."""
    sys.path.insert(0, str(ROOT / "dify"))
    import make_dsl_cardnews as m

    틀 = m.build_recipe_payload("DG0AA6PJ8s4")
    각도들 = [r["각도"] for s in 틀["슬라이드"] for r in s["장식영역"] if "각도" in r]
    assert any(abs(a) > 1 for a in 각도들), f"0 아닌 각도가 없다: {각도들}"


def test_안_잰_값은_아예_안_넣는다():
    """`줄간격` 을 1.32 로 채워 넣으면 「안 잰 것」과 「재서 그 값이 나온 것」이
    구별이 안 된다. 0 인 각도도 마찬가지다 — 없는 칸으로 둔다."""
    sys.path.insert(0, str(ROOT / "dify"))
    import make_dsl_cardnews as m

    틀 = m.build_recipe_payload("DG0AA6PJ8s4")
    for s in 틀["슬라이드"]:
        for r in s["장식영역"]:
            assert r.get("각도", 1) != 0, "0 인 각도는 칸 자체를 안 만든다"
        for x in s["글자슬롯"]:
            assert x.get("줄간격", 1) != 0


# ──────────────────────────────────────────────────────── A2: 배치·few_shot 이 위계를 받는다

def test_배치가_위계_줄간격_효과를_옮긴다():
    틀_dict = _틀()
    s = 틀_dict["슬라이드"][0]["글자슬롯"][0]
    s["위계"] = "제목"; s["줄간격"] = 1.46; s["효과"] = ["밑줄"]
    틀 = json.dumps(틀_dict, ensure_ascii=False)
    카드들 = json.loads(배치.main(_대본()["slides"], 틀)["cards_json"])
    r = 카드들[0]["글자영역"][0]
    assert r["위계"] == "제목"
    assert r["줄간격"] == 1.46
    assert r["효과"] == ["밑줄"]


def test_배치는_효과_목록을_슬롯과_공유하지_않는다(monkeypatch):
    """`카드뉴스_틀고르기.고르기()` 는 서랍에 디자인이 모자라면 같은 디자인을
    얕은 복사(`dict(후보[...])`)로 여러 장에 돌려 쓴다 — 얕은 복사라 리스트 값
    (`효과`)은 복사되지 않고 원본 슬롯과 그대로 공유된다. 이 파이썬 객체가
    `json.dumps`→`json.loads` 를 거치면 공유가 끊기지만, 배치가 **직접** 받는
    `틀`(=`json.loads(틀_json)` 의 결과)에 이미 공유가 남아 있는 경우까지
    안전해야 한다 — 그래서 `json.loads` 를 가짜로 바꿔 그 상황을 직접 만든다.

    `글자영역[-1][이름] = 슬롯[이름]` 처럼 리스트를 그대로 넘기면, 카드가 원본
    틀 객체와 얽혀서 카드 하나의 효과 목록을 나중에 고치면 다른 카드(같은
    슬롯을 쓴)까지 걸린다."""
    틀_dict = _틀()
    공유효과 = ["밑줄"]
    틀_dict["슬라이드"][1]["글자슬롯"][0]["효과"] = 공유효과
    틀_dict["슬라이드"][2]["글자슬롯"][0]["효과"] = 공유효과   # 같은 리스트 객체 — 고르기()가 만드는 상황

    monkeypatch.setattr(배치.json, "loads", lambda s: 틀_dict)
    out = 배치.main(_대본()["slides"], "무시됨(가짜 loads 가 씀)")
    monkeypatch.undo()   # 결과를 파싱할 진짜 json.loads 를 되돌려 받는다

    카드들 = json.loads(out["cards_json"])
    효과2 = 카드들[1]["글자영역"][0]["효과"]
    효과3 = 카드들[2]["글자영역"][0]["효과"]
    assert 효과2 == 효과3 == ["밑줄"]
    assert 효과2 is not 공유효과 and 효과3 is not 공유효과, \
        "슬롯의 리스트를 그대로 넘기면 카드가 원본 틀 객체와 얽힌다"
    assert 효과2 is not 효과3, "같은 리스트를 공유하면 한 카드를 고칠 때 다른 카드까지 걸린다"


def test_틀에_없으면_카드에도_안_생긴다():
    """안 잰 값을 기본값으로 채우면 굽는 쪽이 「잰 값」으로 착각한다."""
    틀 = json.dumps(_틀(), ensure_ascii=False)
    카드들 = json.loads(배치.main(_대본()["slides"], 틀)["cards_json"])
    r = 카드들[0]["글자영역"][0]
    assert "위계" not in r and "줄간격" not in r and "효과" not in r


def test_few_shot_이_제목과_본문을_알려준다():
    """**서랍에 네 역할을 다 넣는다.** 「틀 고르기」가 만드는 골격은
    `훅 + 사례×N + 요약 + CTA` 라, 훅만 든 서랍을 주면 사례에서 멈춘다."""
    import 카드뉴스_틀고르기 as 틀고르기

    def _민디자인(역할):
        return {"역할": 역할, "배경": {"종류": "단색", "hex": "#FFF"},
                "장식영역": [],
                "글자슬롯": [{"weight": "Bold", "줄종류": "한줄", "최소": 8, "최대": 14}],
                "덩이수": 1, "사진자리수": 0}

    훅 = _민디자인("훅")
    훅["글자슬롯"] = [
        {"weight": "Bold", "줄종류": "한줄", "최소": 8, "최대": 14, "위계": "제목"},
        {"weight": "Regular", "줄종류": "여러줄", "줄수": 3,
         "최소": 10, "최대": 20, "위계": "본문"},
    ]
    훅["덩이수"] = 2
    서랍 = {"훅": [훅], "사례": [_민디자인("사례")],
          "요약": [_민디자인("요약")], "CTA": [_민디자인("CTA")]}
    난것 = 틀고르기.main(json.dumps({"서랍": 서랍, "골격": [], "슬라이드": []},
                              ensure_ascii=False), "1")
    fs = 난것["few_shot"]
    assert "제목" in fs and "본문" in fs, fs
    # 훅 장의 두 블록에 위계가 붙는다. 위계 없는 슬롯은 그 말만 빠진다.
    첫장 = fs.split("2번 장")[0]
    assert "블록1" in 첫장 and "블록2" in 첫장, 첫장


def test_층이_틀에서_카드까지_간다():
    """`_사진_채운` 이 dict(r) 로 통째로 베끼므로 틀에만 실으면 뒤는 저절로 간다."""
    틀_dict = _틀()
    for j, 장식 in enumerate(틀_dict["슬라이드"][0]["장식영역"]):
        장식["층"] = j
    틀 = json.dumps(틀_dict, ensure_ascii=False)
    c = json.loads(배치.main(_대본()["slides"], 틀)["cards_json"])[0]
    assert [r["층"] for r in c["장식영역"]] == list(range(len(c["장식영역"])))
    assert all("층" not in r for r in c["글자영역"]), "글자는 언제나 앞이라 층이 없다"


# ──────────────────────────────────────────────────────── A8 — 테두리를 틀까지 흘려보낸다

def _테두리_얹은_가짜_load_docs(m):
    """실측 계량표(`analyze/data/measures/DG0AA6PJ8s4.json`)를 그대로 불러와
    `cutout` 에 테두리·구멍·가려짐만 얹은 사본을 만든다.

    실측 계량표는 A7 **이전**에 뽑힌 것이라 `cutout.테두리` 가 아직 없다(다시
    재려면 돈이 든다 — A8 브리프의 제약, 여기서 스크립트로 다시 재지 않는다).
    시험하려는 건 「값이 있으면 옮겨 싣는다」는 이 함수의 로직이지 실측값 자체가
    아니므로, 진짜 문서 구조를 그대로 쓰고 `cutout` 필드만 가짜로 얹는다.
    """
    실제 = m._load_docs("DG0AA6PJ8s4")
    가짜 = copy.deepcopy(실제)
    도형있음 = False
    for d in 가짜:
        for s in d["slides"]:
            for r in s["regions"]:
                if r["kind"] != "글자":
                    r["cutout"] = {**(r.get("cutout") or {}),
                                   "테두리": [[0, 0], [10, 0], [10, 10], [0, 10]],
                                   "구멍": [], "가려짐": 0.2}
                    도형있음 = True
    assert 도형있음, "시험 재료에 도형 칸이 없다"
    return 가짜


def test_틀에_테두리가_실린다(monkeypatch):
    sys.path.insert(0, str(ROOT / "dify"))
    import make_dsl_cardnews as m

    가짜 = _테두리_얹은_가짜_load_docs(m)
    monkeypatch.setattr(m, "_load_docs", lambda 코드=None: 가짜)

    틀 = m.build_recipe_payload("DG0AA6PJ8s4")
    테두리들 = [r["테두리"] for s in 틀["슬라이드"] for r in s["장식영역"] if "테두리" in r]
    assert 테두리들, "테두리가 하나도 안 실렸다"
    for c in 테두리들:
        assert isinstance(c, list) and len(c) >= 3
        assert all(isinstance(p, list) and len(p) == 2 for p in c), "점은 [x, y] 두 칸이다"


def test_테두리는_평평한_배열이다(monkeypatch):
    """Dify 는 코드 노드가 내놓는 객체의 깊이를 5층까지만 받는다 — 점을
    {x, y} 객체로 담으면 그만큼 깊어진다."""
    sys.path.insert(0, str(ROOT / "dify"))
    import make_dsl_cardnews as m

    가짜 = _테두리_얹은_가짜_load_docs(m)
    monkeypatch.setattr(m, "_load_docs", lambda 코드=None: 가짜)

    틀 = m.build_recipe_payload("DG0AA6PJ8s4")
    for s in 틀["슬라이드"]:
        for r in s["장식영역"]:
            for p in r.get("테두리") or []:
                assert not isinstance(p, dict), "점을 객체로 담지 않는다"


def test_도형의_채움색이_틀에_실린다():
    """굽는 쪽이 이 색으로 도형을 칠한다."""
    sys.path.insert(0, str(ROOT / "dify"))
    import make_dsl_cardnews as m

    가짜 = {"index": 1, "role": "훅",
          "background": {"kind": "단색", "hex": "#FFFFFF"},
          "regions": [{"id": "b1", "kind": "도형", "box": [10, 10, 100, 60],
                       "color": {"kind": "단색", "hex": "#111111"}}]}
    장식 = m._장식칸(가짜["regions"][0])
    assert 장식["채움색"] == "#111111"
    assert 장식["종류"] == "도형"


def test_사진은_채움색을_안_받는다():
    sys.path.insert(0, str(ROOT / "dify"))
    import make_dsl_cardnews as m

    장식 = m._장식칸({"id": "b1", "kind": "사진", "box": [10, 10, 100, 60],
                   "color": {"kind": "사진", "hex": None}})
    assert "채움색" not in 장식


def test_글자가_도형_안에_있는_것은_정상이다():
    """글자그릇은 글자를 담으라고 있는 것이다 — 세지도 않는다."""
    틀_dict = _틀()
    틀 = json.dumps(틀_dict, ensure_ascii=False)
    카드들 = json.loads(배치.main(_대본()["slides"], 틀)["cards_json"])
    글box = 카드들[0]["글자영역"][0]["box"]
    카드들[0].setdefault("장식영역", []).append(
        {"종류": "도형", "box": list(글box), "채움색": "#111111"})
    난것 = 배치검증.main(json.dumps(카드들, ensure_ascii=False), 틀)
    assert 난것["ok"] == "1", 난것["막힘"]
    assert "도형" not in 난것["막힘"]
    assert "도형" not in 난것["점수표"], "경고로도 안 센다"


def test_글자끼리_겹치는_것은_여전히_막는다():
    틀_dict = _틀()
    틀 = json.dumps(틀_dict, ensure_ascii=False)
    카드들 = json.loads(배치.main(_대본()["slides"], 틀)["cards_json"])
    글 = 카드들[1]["글자영역"]
    assert len(글) >= 2
    글[1]["box"] = list(글[0]["box"])
    난것 = 배치검증.main(json.dumps(카드들, ensure_ascii=False), 틀)
    assert 난것["ok"] == "0"
    assert "글자와 겹친다" in 난것["막힘"]


# ──────────────────────────────────────── A13a — 글자 뒤 도형(뒷도형) 판정
#
# 「글자 네모에 붙은 누끼는 «글자의 잉크» 가 아니라 «글자 뒤의 도형» 이다」
# (2026-08-26 코디네이터 판정). DG0AA6PJ8s4 2번장의 검은 알약이 실측 사례다 —
# 마스크 111,310픽셀·테두리 18점·가려짐 0, 조인 상자 [70,88,1022,209].

def _알약_region(뒤색_runs=None):
    """검은 알약 위에 초록 글자를 얹은 실측 모양을 흉내 낸 가짜 「글자」 네모.

    `뒤색_runs` 를 안 주면 실측(2번장 `5세대 아이돌?`) 그대로다 — `#010301`
    이 폭 218+40=258 로 가장 넓다.
    """
    line_detail = [{"box": [236, 133, 510, 170], "text": "가짜",
                    "back": {"runs": 뒤색_runs}}] if 뒤색_runs is not None else \
                  [{"box": [236, 133, 510, 170], "text": "5세대 아이돌?", "back": {"runs": [
                      {"hex": "#010301", "x0": 236, "x1": 454, "ratio": 0.796},
                      {"hex": "#011600", "x0": 454, "x1": 470, "ratio": 0.058},
                      {"hex": "#010301", "x0": 470, "x1": 510, "ratio": 0.146},
                  ]}}]
    return {"id": "b1", "kind": "글자", "box": [70, 88, 1021, 208],
            "cutout": {"box": [70, 88, 1022, 209], "w": 952.0, "h": 121.0, "angle": 0.0,
                       "png": "x/02/b1.png",
                       "테두리": [[70.0, 139.0], [71.0, 163.0], [80.0, 183.0],
                                [98.0, 200.0], [1021.0, 139.0]],
                       "구멍": [], "가려짐": 0.0},
            "text": {"font": "프리텐다드", "pt": 30, "weight": "Bold", "align": "가운데",
                     "color": "#ABED69", "lines": 1, "text": "5세대 아이돌?",
                     "line_detail": line_detail}}


def test_누끼_있는_글자네모는_장식영역에_도형이_생긴다():
    """채움색은 폭이 가장 넓은 run 의 hex 다(실측: `#010301` 이 258 로 최댓값)."""
    sys.path.insert(0, str(ROOT / "dify"))
    import make_dsl_cardnews as m

    장식 = m._뒷도형칸(_알약_region())
    assert 장식 is not None
    assert 장식["종류"] == "도형"
    assert 장식["box"] == [70, 88, 1022, 209]
    assert 장식["채움색"] == "#010301"
    assert 장식["색_종류"] == "단색"
    assert 장식["테두리"] == _알약_region()["cutout"]["테두리"]
    assert "가려짐" not in 장식, "가려짐 0 은 «없는 값» 과 같다 — _장식칸 과 같은 규칙"


def test_back이_없으면_채움색이_안_실린다():
    """없는 값은 없는 채로 둔다 — 넘겨짚어 메우지 않는다."""
    sys.path.insert(0, str(ROOT / "dify"))
    import make_dsl_cardnews as m

    r = _알약_region()
    r["text"]["line_detail"] = [{"box": [236, 133, 510, 170], "text": "글자", "back": {}}]
    장식 = m._뒷도형칸(r)
    assert 장식 is not None            # 도형 자체는 여전히 실린다(테두리는 있으므로)
    assert "채움색" not in 장식
    assert "색_종류" not in 장식


def test_back의_runs가_fallback이면_채움색이_안_실린다():
    sys.path.insert(0, str(ROOT / "dify"))
    import make_dsl_cardnews as m

    r = _알약_region()
    r["text"]["line_detail"] = [{"box": [236, 133, 510, 170], "text": "글자",
                                 "back": {"fallback": True, "runs": [
                                     {"hex": "#010301", "x0": 236, "x1": 510, "ratio": 1.0}]}}]
    assert "채움색" not in m._뒷도형칸(r)


def test_누끼_실패하면_도형을_안_만든다():
    sys.path.insert(0, str(ROOT / "dify"))
    import make_dsl_cardnews as m

    r = _알약_region()
    r["cutout"] = {"box": [70, 88, 1021, 208], "w": 951.0, "h": 120.0, "angle": 0.0,
                   "fallback": True, "why": "빈 마스크"}
    assert m._뒷도형칸(r) is None


def test_테두리가_없으면_도형을_안_만든다():
    """모양을 못 땄으면(테두리 없음) 도형이라 부를 근거가 없다."""
    sys.path.insert(0, str(ROOT / "dify"))
    import make_dsl_cardnews as m

    r = _알약_region()
    r["cutout"]["테두리"] = []
    assert m._뒷도형칸(r) is None


def test_누끼가_아예_없으면_도형을_안_만든다():
    sys.path.insert(0, str(ROOT / "dify"))
    import make_dsl_cardnews as m

    r = _알약_region()
    del r["cutout"]
    assert m._뒷도형칸(r) is None


def test_실측_알약이_장식영역에_도형으로_나간다():
    """DG0AA6PJ8s4 2번장 검은 알약 — 이게 A13a 의 합격 기준이다."""
    sys.path.insert(0, str(ROOT / "dify"))
    import make_dsl_cardnews as m

    틀 = m.build_recipe_payload("DG0AA6PJ8s4")
    이장 = next(s for s in 틀["슬라이드"] if s["index"] == 2)
    도형들 = [r for r in 이장["장식영역"] if r["종류"] == "도형"]
    assert 도형들, f"2번장 장식영역에 도형이 없다: {이장['장식영역']}"
    알약 = 도형들[0]
    x0, y0, x1, y1 = 알약["box"]
    assert (x0, y0) == (70, 88)
    assert abs(x1 - 1021) <= 2 and abs(y1 - 208) <= 2, 알약["box"]
    assert "테두리" in 알약 and len(알약["테두리"]) >= 3
    assert 알약.get("채움색") == "#010301"


def test_글자슬롯에_잉크범위와_각도가_없다():
    """이름이 뜻을 속였다 — «잉크범위» 는 사실 뒷도형의 상자였다. 이제 도형으로
    옮겼으니 글자슬롯엔 아예 없어야 한다."""
    sys.path.insert(0, str(ROOT / "dify"))
    import make_dsl_cardnews as m

    틀 = m.build_recipe_payload("DG0AA6PJ8s4")
    for s in 틀["슬라이드"]:
        for x in s["글자슬롯"]:
            assert "잉크범위" not in x
            assert "각도" not in x


def test_누끼_없는_글자네모는_틀이_그대로다():
    """**흔한 경우엔 옛 틀과 한 글자도 안 달라야 한다.** DHqCBQnRAjW 는 글자
    네모에 누끼를 켠 적이 없다 — 이 틀에는 도형 장식이 하나도 새로 안 생긴다."""
    sys.path.insert(0, str(ROOT / "dify"))
    import make_dsl_cardnews as m

    docs = m._load_docs("DHqCBQnRAjW")
    글자_있음 = any(r["kind"] == "글자" and r.get("cutout")
                for d in docs for s in d["slides"] for r in s["regions"])
    assert not 글자_있음, "이 시험 재료엔 글자 누끼가 없어야 «그대로다» 를 증명한다"
    # `_뒷도형칸` 은 글자 네모에 누끼가 있을 때만 무언가를 만든다(위 시험들) —
    # 이 문서엔 그 조건을 만족하는 글자 네모가 하나도 없으므로, 새 고리를
    # 통째로 걷어내도(=예전 코드로 되돌려도) 나오는 틀이 똑같다. 그래서
    # `build_recipe_payload` 가 죽지 않고 예전처럼 도는지만 확인해도 충분하다.
    틀 = m.build_recipe_payload("DHqCBQnRAjW")
    for s in 틀["슬라이드"]:
        for x in s["글자슬롯"]:
            assert "잉크범위" not in x
            assert "각도" not in x


# ─────────────────────────── 배경이 사진일 때 (사람 결정 2026-08-27)
def test_사진_배경은_장_전체를_덮는_사진_자리가_된다():
    """**사람은 배경 사진에 네모를 안 긋는다** — 그으면 그 안에 글자 네모를 못 그린다.

    그래도 분석은 배경을 «남는 자리» 로 정하므로 사진인 줄 안다(실측
    DHqCBQnRAjW 1번 장: 아무도 안 그었는데 배경이 「사진」). 사진 배경은 hex
    하나로 못 그리니 이미 있는 «사진 자리» 로 옮긴다.
    """
    from make_dsl_cardnews import _배경자리
    난것 = _배경자리({"kind": "사진"}, 1080, 1350)
    assert len(난것) == 1
    assert 난것[0]["box"] == [0, 0, 1080, 1350]
    assert 난것[0]["종류"] == "사진"
    assert 난것[0]["배경자리"] is True


def test_사진_자리는_아무_색도_안_들고_간다():
    """**색은 배경에 적힌다**(사람 결정 2026-09-01). 자리표시에 색을 담으면
    그 자리표시가 배경 노릇을 하게 되어, 자리를 옮기거나 지우면 배경이 같이
    사라진다. 사진 자리는 위에 얹히는 «투명한 빈 자리» 다."""
    from make_dsl_cardnews import _배경자리
    난것 = _배경자리({"kind": "사진", "빈자리색": "#615244"}, 1080, 1350)
    assert "빈자리색" not in 난것[0], 난것[0]


def test_사진이_아닌_배경은_자리를_안_만든다():
    """단색·그라데이션은 hex 로 그린다 — 사진 자리를 깔면 회색 네모가 덮는다."""
    from make_dsl_cardnews import _배경자리
    for 배경 in ({"kind": "단색", "hex": "#FFFFFF"}, {"kind": "그라데이션"},
               {"kind": "미측정"}, {}, None):
        assert _배경자리(배경, 1080, 1350) == [], 배경


def test_사진_자리는_장식영역_맨_앞에_놓인다():
    """`장식영역` 은 그린 차례다 — 뒤에 놓으면 글자와 다른 장식을 덮는다."""
    import io
    from pathlib import Path
    글 = io.open(Path(__file__).resolve().parents[1] / "make_dsl_cardnews.py",
                encoding="utf-8").read()
    앞 = 글.index("장식영역 = _배경자리(")
    뒤 = 글.index("장식영역.append(_장식칸")
    assert 앞 < 뒤, "배경 사진 자리를 다른 장식보다 나중에 넣고 있다"


# ─────────────────────────── 줄마다 다른 색·굵기 (사람 결정 2026-08-27)
def test_같은_검정은_줄색으로_안_실린다():
    """**재는 오차가 그대로 실리면 안 된다.**

    실측: 검정 본문의 줄색이 `#010101`·`#010201`·`#000500` 으로 흩어진다 — 눈으로
    같은 검정인데 목록에는 다른 값이 된다. 그러면 굽는 쪽이 줄마다 «다른» 검정을
    칠하려 들고 틀만 지저분해진다.
    """
    from make_dsl_cardnews import _줄별색
    t = {"color": "#010101", "line_detail": [
        {"color": "#010101"}, {"color": "#010201"}, {"color": "#000500"}]}
    assert _줄별색(t) == []


def test_눈에_다른_줄색은_실린다():
    """실측 키키 표지: 첫 줄 노랑, 둘째 줄 빨강인데 덩이 값은 노랑 하나뿐이다."""
    from make_dsl_cardnews import _줄별색
    t = {"color": "#FFDD58", "line_detail": [
        {"color": "#FFDD58"}, {"color": "#DD363E"}]}
    assert _줄별색(t) == ["#FFDD58", "#DD363E"]


def test_잡음_섞인_강조도_강조만_남는다():
    """검정 잡음은 덩이 색으로 되돌리고 진짜 강조만 남긴다."""
    from make_dsl_cardnews import _줄별색
    t = {"color": "#010101", "line_detail": [
        {"color": "#010101"}, {"color": "#000700"}, {"color": "#D23740"}]}
    assert _줄별색(t) == ["#010101", "#010101", "#D23740"]


def test_색차가_채널_최대차다():
    from make_dsl_cardnews import _색차, 같은색문턱
    assert _색차("#010101", "#010201") <= 같은색문턱
    assert _색차("#FFDD58", "#DD363E") > 같은색문턱
    assert _색차("#010101", "#AAEC66") > 같은색문턱
    assert _색차("#010101", None) == 999, "못 읽으면 «아주 멀다» 로 친다"


def test_줄굵기는_잡음이_없어_그대로_실린다():
    """Bold·Regular 둘뿐이라 값이 띄엄띄엄하다."""
    from make_dsl_cardnews import _줄별굵기
    assert _줄별굵기({"line_detail": [{"weight": "Regular"}, {"weight": "Bold"}]}) \
        == ["Regular", "Bold"]
    assert _줄별굵기({"line_detail": [{"weight": "Bold"}, {"weight": "Bold"}]}) == []
    assert _줄별굵기({"line_detail": [{"weight": "Bold"}]}) == [], "한 줄이면 «줄마다» 가 없다"


def test_배경판_주소가_창고를_가리킨다():
    """틀에 주소만 있고 그림이 창고에 없으면 굽는 쪽이 조용히 배경을 잃는다."""
    import io
    from pathlib import Path
    글 = io.open(Path(__file__).resolve().parents[1] / "make_dsl_cardnews.py",
                encoding="utf-8").read()
    # **아스키 자리다**(2026-08-29). 한글 열쇠에서 나온 주소는 서버가 못 연다 —
    # 배경판이 한 장도 안 붙은 채 조용히 넘어갔다.
    assert '/배경판/' not in 글, "한글 자리로 되돌아갔다"
    assert '{판칸}' in 글, "판 자리를 상수로 두지 않았다"
    assert 틀만들기.판칸.isascii(), 틀만들기.판칸
    # 색을 지우면 안 된다 — 뚫린 자리로 비치는 것이 그 색이다
    assert '배경출력 = {**배경출력' in 글, "색을 갈아치우고 있다"


def test_모르는_배경_종류도_판을_받고_안_죽는다():
    """**갈래를 다 고른 뒤에 판을 붙인다.**

    사슬 가운데 끼워 넣었다가 `else` 가 떨어져 나가 배경이 사진인 장에서 죽었다
    (2026-08-27, DNUFIa4NIkK 1번 장: UnboundLocalError). 이제 `_배경출력` 이
    갈래를 다 고른 뒤 판을 붙인다 — 모르는 종류라도 판은 따라온다.
    """
    난것 = 틀만들기._배경출력({"kind": "뭔지모름", "hex": "#123456", "판": "X/01.png"},
                         {"hex": "#FFFFFF", "판": "X/바닥.png"})
    assert 난것["종류"] == "뭔지모름"
    # 장의 제 판(`X/01.png`)은 이제 안 본다(2026-09-19) — 바닥판이 따라온다.
    assert 난것["판"].endswith("/X/바닥.png")


def test_사진_배경은_제_판을_안_받는다():
    """사람은 배경 사진에 네모를 안 그으므로, 사진 배경의 판은 «뺀 나머지» 가
    아니라 **원본 사진 그 자체** 다(실측 2026-08-31, DSW-6lrk5rs 1번 장: 판이
    79.6% 불투명, 원본 인형 사진과 남의 로고가 통째로 들어 있었다). 실으면
    우리가 만든 카드뉴스마다 남의 사진이 표지로 나온다.

    대신 바닥(사진 아닌 장의 종이)을 받는다(2026-09-15, `test_바닥.py`)."""
    제판 = "X/01.png"
    난것 = 틀만들기._배경출력({"kind": "사진", "hex": "#615245", "판": 제판,
                          "빈자리색": "#615245"},
                         {"hex": "#FEFEFE", "판": "X/02.png"})
    assert 제판 not in (난것.get("판") or "")
    assert 난것["판"].endswith("/X/02.png")


# ── 줄 맞추기 ──────────────────────────────────────────────────────
#
# 사람이 마우스로 긋는다. 원본에서 같은 선에 맞춰져 있던 것들이 매번 조금씩
# 어긋난다(사람 지적 2026-08-29: 「왜 일자가 아니라 비뚤빼뚤한 거임?」).

def _장(칸들):
    return {"글자슬롯": [{"위계": 위, "align": 정, "box": [x0, 100, x1, 200]}
                     for 위, 정, x0, x1 in 칸들]}


def test_최빈값으로_당긴다():
    """실측 그대로 — 본문 왼쪽 끝이 112 여섯 번, 84 한 번."""
    장들 = [_장([("본문", "왼쪽", 112, 900)]) for _ in range(6)]
    장들.append(_장([("본문", "왼쪽", 84, 872)]))
    옮긴것 = 틀만들기.줄맞추기(장들, 1080)
    assert 옮긴것 == 1
    assert [s["글자슬롯"][0]["box"][0] for s in 장들] == [112] * 7


def test_네모_폭이_안_변한다():
    """폭을 건드리면 자수 한계가 달라져 대본 검증이 어긋난다."""
    장들 = [_장([("본문", "왼쪽", 112, 900)]) for _ in range(3)]
    장들.append(_장([("본문", "왼쪽", 84, 872)]))
    틀만들기.줄맞추기(장들, 1080)
    for s in 장들:
        x0, _, x1, _ = s["글자슬롯"][0]["box"]
        assert x1 - x0 == 788


def test_문턱_밖은_안_건드린다():
    """일부러 계단처럼 밀어 놓은 것은 디자인이다."""
    장들 = [_장([("제목", "왼쪽", 82, 900)]) for _ in range(3)]
    장들.append(_장([("제목", "왼쪽", 640, 1000)]))
    틀만들기.줄맞추기(장들, 1080)
    assert 장들[-1]["글자슬롯"][0]["box"][0] == 640


def test_오른쪽_정렬은_오른쪽_변을_맞춘다():
    장들 = [_장([("꼬리표", "오른쪽", 400, 634)]) for _ in range(2)]
    장들 += [_장([("꼬리표", "오른쪽", 382, 616)]) for _ in range(3)]
    틀만들기.줄맞추기(장들, 1080)
    assert [s["글자슬롯"][0]["box"][2] for s in 장들] == [616] * 5, "셋이 이긴다"


def test_위계가_달라도_가까우면_같이_모은다():
    """**뒤집힌 결정이다**(2026-08-29). 처음엔 「제목과 본문은 원래 다른 선」이라
    보고 따로 모았다. 그랬더니 한 장 안에서 제목 82, 본문 112 로 30px 어긋난 채
    남았다.

    다섯 장에서 값이 똑같아 일부러 준 들여쓰기처럼 보였는데, **원본의 잉크를 재
    보니 둘 다 x=130 에서 시작한다**(DYWiVHhlNwo 3·4·5·7·8번 장). 같은 선이다 —
    사람이 제목 네모를 글자보다 넉넉히 그었을 뿐이고, 굽는 쪽은 네모 왼쪽에
    글자를 찍으므로 그 여백이 그대로 어긋남이 된다.
    """
    장들 = [_장([("제목", "왼쪽", 82, 900), ("본문", "왼쪽", 112, 900)])
          for _ in range(3)]
    틀만들기.줄맞추기(장들, 1080)
    칸들 = 장들[0]["글자슬롯"]
    assert 칸들[0]["box"][0] == 칸들[1]["box"][0], [c["box"][0] for c in 칸들]


def test_멀리_떨어진_단은_위계가_달라도_안_섞인다():
    """위계를 안 가르는 대신 «거리» 가 지킨다 — 왼쪽 단과 오른쪽 단은 그대로."""
    장들 = [_장([("제목", "왼쪽", 82, 900), ("꼬리표", "왼쪽", 616, 924)])
          for _ in range(3)]
    틀만들기.줄맞추기(장들, 1080)
    값들 = sorted({c["box"][0] for s in 장들 for c in s["글자슬롯"]})
    assert 값들 == [82, 616], 값들


def test_가운데_정렬은_안_건드린다():
    """가운데는 네모 폭이 곧 자리다 — 왼쪽 끝을 맞출 것이 없다."""
    장들 = [_장([("제목", "가운데", 100, 980)]), _장([("제목", "가운데", 140, 940)])]
    assert 틀만들기.줄맞추기(장들, 1080) == 0


def test_혼자면_아무것도_안_한다():
    장들 = [_장([("제목", "왼쪽", 77, 900)])]
    assert 틀만들기.줄맞추기(장들, 1080) == 0
    assert 장들[0]["글자슬롯"][0]["box"][0] == 77


def test_다_다르면_가운뎃값으로_모은다():
    """실측(파스텔 둥근네모): 제목이 561·586·590·607 로 넷 다 다르다.
    「같은 횟수면 작은 쪽」이면 561 이 잡히고 607 이 46px 로 문턱 밖에 남는다."""
    장들 = [_장([("제목", "왼쪽", x, x + 400)]) for x in (561, 586, 590, 607)]
    틀만들기.줄맞추기(장들, 1080)
    난것 = {s["글자슬롯"][0]["box"][0] for s in 장들}
    assert len(난것) == 1, 난것
    assert 590 in 난것, 난것


def test_멀리_떨어진_단은_따로_모은다():
    """실측(DYWiVHhlNwo): 왼쪽 사진 밑 꼬리표 188, 오른쪽 사진 밑 616.
    같은 위계·같은 정렬이지만 원래 다른 자리다 — 통째로 맞추면 단이 무너진다."""
    장들 = [_장([("꼬리표", "왼쪽", 188, 400)]) for _ in range(2)]
    장들 += [_장([("꼬리표", "왼쪽", 192, 404)])]
    장들 += [_장([("꼬리표", "왼쪽", 616, 830)]) for _ in range(3)]
    틀만들기.줄맞추기(장들, 1080)
    값들 = sorted({s["글자슬롯"][0]["box"][0] for s in 장들})
    assert 값들 == [188, 616], 값들


def test_되풀이되는_값이_가운뎃값을_이긴다():
    """사람이 여섯 번 112 를 긋고 한 번 84 를 그었으면 원래 자리는 112 다."""
    장들 = [_장([("본문", "왼쪽", 112, 900)]) for _ in range(6)]
    장들.append(_장([("본문", "왼쪽", 84, 872)]))
    틀만들기.줄맞추기(장들, 1080)
    assert {s["글자슬롯"][0]["box"][0] for s in 장들} == {112}


# ── 형광펜은 낱말 경계에서 끊는다 ──────────────────────────────────
#
# 예전엔 §4 참고 통계로 «끝에서 둘째 줄의 앞 28%» 를 잘라 표시했고, 그 자리를
# 낱말 경계로 스냅하는 `_낱말끝`·`_형광펜` 이 있었다(문장 한가운데가 잘리는 걸
# 막으려고). 이제 형광펜·굵게는 LLM 이 글 안에 직접 `##…##`·`**…**` 로 찍고
# (카드뉴스_강조.py), 배치는 그 표시가 가리키는 글자에 효과를 붙인다
# (`_글줄만들기`, 위 시험) — «낱말 중간에서 안 끊긴다» 는 이제 LLM 의 표시
# 그 자체가 보장하지, 배치가 자리를 추정해서 보장하지 않는다. 그래서 자리
# 추정 함수(`_낱말끝`·`_형광펜`)와 그 시험은 뺐다.


# ── 번호는 대본이 아니라 셈이다 ────────────────────────────────────
#
# 원본의 01·02·03 이 배경판에 그림으로 박혀 딸려 왔다 — 일곱 장짜리에 07 이
# 여섯 번째로 나왔다(실물 2026-08-30). 사람이 그 자리를 「번호」로 라벨하면
# 배경판에서 구멍으로 빠지고, 우리가 장 차례로 다시 찍는다.

def test_번호는_원본_꼴을_따른다():
    import 카드뉴스_배치 as 배치
    assert 배치._번호글(5, 7, "03") == "05"      # 두 자리
    assert 배치._번호글(5, 7, "3") == "5"        # 한 자리
    assert 배치._번호글(5, 7, "3/10") == "5/7"   # 분모까지


def test_본보기를_못_읽으면_두_자리로_찍는다():
    """카드뉴스에서 가장 흔한 꼴이다."""
    import 카드뉴스_배치 as 배치
    for 본 in ("", None, "가나", "01월"):
        assert 배치._번호글(5, 7, 본) == "05", 본


def test_번호_칸은_대본을_안_쓴다():
    """모델이 무엇을 썼든 버린다 — 번호는 지어낼 것이 아니다."""
    import 카드뉴스_배치 as 배치
    글 = (Path(배치.__file__)).read_text(encoding="utf-8")
    assert '슬롯.get("위계") == 번호위계' in 글
    assert "줄들 = [_번호글(i, len(골격)" in 글


def test_검증이_번호_칸을_건너뛴다():
    """안 쓸 글 때문에 다 된 대본이 막히면 안 된다."""
    import 카드뉴스_대본검증 as 검증
    글 = (Path(검증.__file__)).read_text(encoding="utf-8")
    assert '슬롯.get("위계") == "번호"' in 글
    assert "continue" in 글


# ── 장 번호 꼴 ────────────────────────────────────────────────────

def test_빗금_꼴은_말이_될_때만_따른다():
    """실물 2026-09-01: 원본의 「08」을 OCR 이 「8 / 0」 으로 읽어, 일곱 장짜리
    여섯째 장에 「6/7」이 찍혔다 — 다른 장은 전부 「02」·「03」 꼴이었다."""
    sys.path.insert(0, str(ROOT / "dify"))
    from 카드뉴스_배치 import _번호글
    assert _번호글(6, 7, "3/10") == "6/7"      # 앞 ≤ 뒤 — 진짜 「몇 분의 몇」
    assert _번호글(6, 7, "8 / 0") == "06"      # 앞 > 뒤 — 잘못 읽은 것
    assert _번호글(6, 7, "03") == "06"
    assert _번호글(6, 7, "3") == "6"
    assert _번호글(6, 7, "") == "06"


# ──────────────────────────────────────────────────────── 통자수 (사람 결정 2026-09-16)

def _통자수틀():
    """사례2 슬롯을 «본문·통틀어 90~150자» 로.

    **줄 수·줄종류는 안 싣는다**(2026-09-18) — 자수는 넓이 하나로 본다.
    칸을 고를 때도 `줄종류` 대신 `위계` 로 고른다.
    """
    틀 = _틀()
    for s in 틀["슬라이드"]:
        for 슬롯 in s["글자슬롯"]:
            if 슬롯.get("줄종류") == "여러줄":
                슬롯.update({"위계": "본문", "최소": 90, "최대": 150})
            else:
                슬롯.setdefault("위계", "제목")
            슬롯.pop("줄종류", None)
            슬롯.pop("줄수", None)
    return 틀


def _본문대본(본문):
    return _대본({"훅": ["짧은 헤드라인", 본문], "사례": ["사례 헤드라인", 본문],
                "요약": ["요약 헤드라인", 본문], "CTA": ["CTA 한 줄 문구입니다"]})


def test_통자수_자리는_줄마다_자수로_막지_않는다():
    """16~21자 줄 일곱 개(옛 규칙이면 줄수 초과·자수 미달) — 총 120자면 통과."""
    본문 = "\n".join(["가나다라마바사아자차카타파하가나다", "가나다라마바사아자차카타파하가나다라",
                     "가나다라마바사아자차카타파하가", "가나다라마바사아자차카타파하가나",
                     "가나다라마바사아자차카타파하가나다라", "가나다라마바사아자차카타"])
    out = 대본검증.main(json.dumps(_본문대본(본문), ensure_ascii=False),
                        json.dumps(_통자수틀(), ensure_ascii=False))
    assert out["ok"] == "1", out["blocked"]
    # 줄바꿈은 지워 한 덩어리로 넘긴다 — 줄은 배치가 폭을 재서 나눈다.
    assert "\n" not in out["slides"][1]["blocks"][1]


def test_통자수_넘치면_막힌다():
    본문 = "가" * 151
    out = 대본검증.main(json.dumps(_본문대본(본문), ensure_ascii=False),
                        json.dumps(_통자수틀(), ensure_ascii=False))
    assert out["ok"] == "0"
    # 위아래를 같이 준다 — 상한만 주면 고쳐 쓰는 모델이 하한 밑으로 잘라 버린다.
    assert "통틀어 90~150자여야 하는데" in out["blocked"]
    assert "151자" in out["blocked"]


def test_통자수_모자라면_권고만():
    본문 = "가" * 60
    out = 대본검증.main(json.dumps(_본문대본(본문), ensure_ascii=False),
                        json.dumps(_통자수틀(), ensure_ascii=False))
    assert out["ok"] == "1", out["blocked"]
    assert "통틀어 최소 90자인데 60자" in out["점수표"]


def test_어느_자리든_총량으로_본다():
    """**줄마다 안 본다**(사람 결정 2026-09-18: 「세로줄은 안 본다니까」).
    한줄·여러줄 갈래가 없어졌으니 모든 칸이 같은 잣대를 쓴다."""
    d = _본문대본("가" * 100)
    d["slides"][0]["blocks"][0] = "가" * 16          # 상한 15 초과
    out = 대본검증.main(json.dumps(d, ensure_ascii=False), json.dumps(_통자수틀(), ensure_ascii=False))
    assert out["ok"] == "0"
    assert "통틀어 5~15자여야 하는데" in out["blocked"], out["blocked"]
    assert "16자 분량" in out["blocked"], out["blocked"]


def test_틀_설명은_본문을_한_덩어리로_시킨다():
    import 카드뉴스_틀고르기 as 틀고르기
    import 프롬프트
    few = 틀고르기.칸설명(_통자수틀()["슬라이드"]) if hasattr(틀고르기, "칸설명") else None
    assert few is not None, "틀고르기에서 칸 설명을 만드는 함수를 `칸설명(슬라이드, 본보기끄기=False)` 로 뽑아 둔다"
    assert "줄 나누지 말고 한 덩어리로, 통틀어 90~150자" in few
    assert "한 덩어리로, 통틀어 5~15자" in few        # 모든 칸이 같은 잣대다
    assert "정확히 6줄로" not in few                 # 줄 수는 아예 안 시킨다
    assert "각 줄" not in few                        # 줄마다 재던 옛 문구
    assert "한 덩어리로」인 블록은 줄바꿈을 넣지 않는다" in 프롬프트._대본모양
    assert "2/3" not in 프롬프트._대본모양


def test_배치는_본문을_폭에_맞춰_감는다():
    틀 = _통자수틀()
    대본 = _본문대본("가나 " * 30)                     # 90자, 띄어쓰기 낱말
    검 = 대본검증.main(json.dumps(대본, ensure_ascii=False), json.dumps(틀, ensure_ascii=False))
    assert 검["ok"] == "1", 검["blocked"]
    out = 배치.main(검["slides"], json.dumps(틀, ensure_ascii=False),
                   재기만들기=lambda 슬롯: (lambda 글: 30.0 * len(글)))   # 글자당 30px, 폭 900 → 30자
    카드 = json.loads(out["cards_json"])[1]
    본문 = [r for r in 카드["글자영역"] if r.get("위계") == "본문"][0]
    assert all(30.0 * len(줄) <= 900 for 줄 in 본문["lines"])
    assert max(len(줄) for 줄 in 본문["lines"]) >= 26           # 폭을 채운다
    assert "\n" not in "".join(본문["lines"])


def test_배치는_한줄_자리를_안_건드린다():
    틀 = _통자수틀()
    대본 = _본문대본("가나 " * 30)
    검 = 대본검증.main(json.dumps(대본, ensure_ascii=False), json.dumps(틀, ensure_ascii=False))
    out = 배치.main(검["slides"], json.dumps(틀, ensure_ascii=False),
                   재기만들기=lambda 슬롯: (lambda 글: 30.0 * len(글)))
    카드 = json.loads(out["cards_json"])[1]
    제목 = [r for r in 카드["글자영역"] if r.get("위계") == "제목"][0]
    assert 제목["lines"] == ["사례 헤드라인"]


# ──────────────────────────────────────────────── 배치 검증·자수 줄이기는 줄 수만 본다

def _통자수카드(줄들):
    return [{"index": 1, "장식영역": [],
             "글자영역": [{"종류": "글자", "box": [50, 200, 950, 380], "pt": 30, "weight": "Regular",
                       "align": "왼쪽", "font": "프리텐다드", "글자색": "#000000",
                       "최소": 12, "최대": 25, "위계": "본문",
                       "lines": 줄들, "형광펜": []}]}]


def test_배치검증은_통자수_자리를_줄마다_안_본다():
    카드 = _통자수카드(["가" * 30] * 6)                 # 25자 넘는 줄 — 폭으로 감은 결과는 안 막는다
    out = 배치검증.main(json.dumps(카드, ensure_ascii=False), json.dumps(_통자수틀(), ensure_ascii=False))
    assert out["ok"] == "1", out["막힘"]


def test_배치검증은_아래로_밀린_것을_세기만_한다():
    """**안 막는다**(사람 결정 2026-09-18). 네모 높이(180px)를 줄높이
    (30pt × 1.32 = 39.6px)로 나누면 네 줄이 드는데 일곱 줄이 감겼다 — 그걸
    점수표에만 적는다. 자수 한계가 네모 «넓이» 로 정해진 뒤로는 한계껏 쓴 글이
    낱말 경계 때문에 한 줄을 더 잡아먹는 일이 흔하다."""
    카드 = _통자수카드(["가" * 20] * 7)
    out = 배치검증.main(json.dumps(카드, ensure_ascii=False), json.dumps(_통자수틀(), ensure_ascii=False))
    assert out["ok"] == "1", out["막힘"]
    assert "7줄인데 자리는 4줄이다" in out["점수표"], out["점수표"]


def _한칸(높이, pt, 줄간격, 줄들, 위계="제목"):
    """칸 하나짜리 카드. 높이·pt·줄간격을 마음대로 준다."""
    return [{"index": 2, "장식영역": [],
             "글자영역": [{"종류": "글자", "box": [50, 200, 950, 200 + 높이],
                       "pt": pt, "줄간격": 줄간격, "weight": "Bold",
                       "align": "왼쪽", "font": "프리텐다드", "글자색": "#000000",
                       "최소": 12, "최대": 28, "위계": 위계,
                       "lines": 줄들, "형광펜": []}]}]


def test_마지막_줄은_줄간격을_안_먹는다():
    """**한 줄씩 적게 세고 있었다**(사람 지적 2026-09-19).

    두 줄이면 «글자 높이 + 줄간격 한 번» 이지 «줄간격 두 번» 이 아니다.
    실물(주간 AI 소식 제목): 높이 194 · pt 82 · 줄간격 1.19 → 줄높이 97.6.
    194/97.6 = 1.99 라 예전 셈은 **1줄**이라 했는데, 82 + 97.6 = 179.6 이라
    **2줄이 들어간다.** 그 칸은 한 줄에 11자쯤인데 원본은 28자를 썼다 —
    원래 2줄짜리인데 쓸 때마다 「줄여라」가 떴다.
    """
    카드 = _한칸(194, 82, 1.19, ["앞줄입니다", "뒷줄입니다"])
    out = 배치검증.main(json.dumps(카드, ensure_ascii=False),
                       json.dumps(_통자수틀(), ensure_ascii=False))
    assert "자리는" not in out["점수표"], out["점수표"]


def test_진짜로_넘치면_그때는_말해_준다():
    """고쳤다고 눈이 멀면 안 된다 — 세 줄은 여전히 걸려야 한다."""
    카드 = _한칸(194, 82, 1.19, ["한 줄", "두 줄", "세 줄"])
    out = 배치검증.main(json.dumps(카드, ensure_ascii=False),
                       json.dumps(_통자수틀(), ensure_ascii=False))
    assert "3줄인데 자리는 2줄이다" in out["점수표"], out["점수표"]


def test_밀린_것이_어느_칸인지_대_준다():
    """**「N번 장 글이」 라고만 하면 모델이 애먼 칸을 줄인다**(사람 지적 2026-09-19).

    이 말이 그대로 고쳐 쓰기 프롬프트로 간다(`카드뉴스만들기._대본사슬`).
    실물: 제목이 길어 걸렸는데 114자짜리 **본문**이 30자가 됐다.
    """
    카드 = _한칸(194, 82, 1.19, ["한 줄", "두 줄", "세 줄"])
    out = 배치검증.main(json.dumps(카드, ensure_ascii=False),
                       json.dumps(_통자수틀(), ensure_ascii=False))
    assert "블록1(제목)" in out["점수표"], out["점수표"]


def test_배치는_자수_한계를_글자영역에_실어_보낸다():
    틀 = _통자수틀()
    대본 = _본문대본("가나 " * 30)
    검 = 대본검증.main(json.dumps(대본, ensure_ascii=False), json.dumps(틀, ensure_ascii=False))
    out = 배치.main(검["slides"], json.dumps(틀, ensure_ascii=False),
                   재기만들기=lambda 슬롯: (lambda 글: 30.0 * len(글)))
    본문 = [r for r in json.loads(out["cards_json"])[1]["글자영역"] if r.get("위계") == "본문"][0]
    assert (본문["최소"], 본문["최대"]) == (90, 150) and 본문["위계"] == "본문"


# ─────────────── 감은 뒤 강조를 «글자» 에 붙인다 (2026-09-28) ───────────
#
# 사람 지시 여섯 번: 「위치로 구분하면 죽여」. 숫자 위치를 만들지 않는다 —
# 글자 하나하나에 효과를 적고, 감은 줄을 따라 나눠 담은 뒤 같은 효과끼리 묶는다.

def test_감은_뒤_강조가_그_글자에_붙는다():
    글줄 = 배치._글줄만들기("앞줄입니다 가운데강조뒤", ["앞줄입니다", "가운데강조뒤"],
                          [{"종류": "굵게", "시작": 6, "끝": 9}], {}, None)
    assert 글줄 == [
        {"새문장": True, "덩어리": [{"글": "앞줄입니다"}]},
        {"새문장": False, "덩어리": [{"글": "가운데", "굵게": True}, {"글": "강조뒤"}]}]


def test_줄을_건너뛰는_강조는_두_줄에_나뉘어_붙는다():
    글줄 = 배치._글줄만들기("앞줄 뒷줄", ["앞줄", "뒷줄"],
                          [{"종류": "굵게", "시작": 1, "끝": 4}], {}, None)
    assert [줄["덩어리"] for 줄 in 글줄] == [
        [{"글": "앞"}, {"글": "줄", "굵게": True}],
        [{"글": "뒷", "굵게": True}, {"글": "줄"}]]


def test_같은_낱말이_두_번이면_칠한_그_글자만():
    [줄] = 배치._글줄만들기("이제 이제", ["이제 이제"],
                          [{"종류": "글자색", "시작": 3, "끝": 5}], {}, "#FF0000")
    assert 줄["덩어리"] == [{"글": "이제 "}, {"글": "이제", "색": "#FF0000"}]


def test_형광펜_표시는_안_찍는다():
    [줄] = 배치._글줄만들기("가나다", ["가나다"], [{"종류": "형광펜", "시작": 0, "끝": 2}], {}, None)
    assert 줄["덩어리"] == [{"글": "가나다"}]


def test_소제목첫줄은_만들_때_첫_줄_글자에만_굵게():
    글줄 = 배치._글줄만들기("첫 줄 둘째 줄", ["첫 줄", "둘째 줄"], [], {"소제목첫줄": True}, None)
    assert [줄["덩어리"] for 줄 in 글줄] == [[{"글": "첫 줄", "굵게": True}], [{"글": "둘째 줄"}]]


def test_출처는_만들_때_마지막_줄_글자와_그_문장에_붙는다():
    글줄 = 배치._글줄만들기("본문 Ref. 유튜브", ["본문", "Ref. 유튜브"], [],
                          {"출처줄": {"색": "#DF94C8", "align": "오른쪽"}}, None)
    assert 글줄[-1] == {"새문장": True, "정렬": "오른쪽",
                       "덩어리": [{"글": "Ref. 유튜브", "색": "#DF94C8"}]}
    assert 글줄[0] == {"새문장": True, "덩어리": [{"글": "본문"}]}


def test_출처는_줄이_하나면_안_붙는다():
    [줄] = 배치._글줄만들기("본문", ["본문"], [], {"출처줄": {"색": "#DF94C8", "align": "오른쪽"}}, None)
    assert 줄 == {"새문장": True, "덩어리": [{"글": "본문"}]}


def test_긴_낱말을_글자로_쪼갠_줄도_글자가_맞는다():
    """`폭감기` 는 폭보다 긴 낱말을 글자로 쪼갠다 — 그 자리에는 띄어쓰기가 없다."""
    글줄 = 배치._글줄만들기("가나다라마", ["가나다", "라마"],
                          [{"종류": "굵게", "시작": 2, "끝": 4}], {}, None)
    assert [줄["덩어리"] for 줄 in 글줄] == [
        [{"글": "가나"}, {"글": "다", "굵게": True}], [{"글": "라", "굵게": True}, {"글": "마"}]]


def test_배치가_낸_글자칸에_숫자_위치가_없다():
    틀 = json.dumps(_굵게_한곳_기대하는_틀(), ensure_ascii=False)
    d = _대본({"훅": ["짧은 헤드라인", "**부제목** [[한 줄]]입니다"],
              "사례": ["사례 헤드라인", "이건 본문 한 줄입니다 적당히"],
              "요약": ["요약 헤드라인", "요약 본문 한 줄입니다 적당히"],
              "CTA": ["CTA 한 줄 문구입니다"]})
    검 = 대본검증.main(json.dumps(d, ensure_ascii=False), 틀)
    카드들 = json.loads(배치.main(검["표시슬라이드"], 틀)["cards_json"])
    for c in 카드들:
        for r in c["글자영역"]:
            assert not ({"형광펜", "굵기", "색구간", "출처"} & set(r)), sorted(r)
            assert r["lines"] == ["".join(d["글"] for d in 줄["덩어리"]) for 줄 in r["글줄"]]
            for 줄 in r["글줄"]:
                for 덩 in 줄["덩어리"]:
                    assert not ({"줄번호", "시작", "끝", "몇번째"} & set(덩)), 덩


# ─────────────── 겹친 띄어쓰기 뒤에도 강조 자리가 안 밀린다 (검토 지적)
#
# `자수.폭감기` 는 안에서 `한덩어리()` 를 불러 겹친 띄어쓰기·앞뒤 공백을
# 지운다. 표시를 뗀 «뒤» 자리로 고르면 그 자리가 뒤로 밀려 감은 줄과 안
# 맞는다 — 반드시 `main()` 을 태워 `폭감기` 를 실제로 거치게 본다(`줄들` 을
# 직접 넘기면 이 길을 안 지난다).

def test_겹친_띄어쓰기가_있어도_굵기가_강조_글자를_가리킨다():
    """겹친 띄어쓰기(`앞  단어`)를 그대로 두면 자리가 「강조」 대신
    「조 」 같은 엉뚱한 곳을 가리킨다 — 실측으로 확인된 결함."""
    틀 = json.dumps(_통자수틀(), ensure_ascii=False)
    본문 = "앞  단어 **강조** 뒤 단어"   # 겹친 띄어쓰기
    d = _본문대본(본문)
    out = 배치.main(d["slides"], 틀,
                    재기만들기=lambda 슬롯: (lambda 글: 1.0 * len(글)))
    사례2 = json.loads(out["cards_json"])[1]["글자영역"][1]
    assert "강조" in _효과글(사례2, "굵게"), 사례2["글줄"]


def test_앞뒤_공백이_있어도_굵기가_강조_글자를_가리킨다():
    틀 = json.dumps(_통자수틀(), ensure_ascii=False)
    본문 = "  앞 단어 **강조** 뒤 단어  "   # 앞뒤 공백
    d = _본문대본(본문)
    out = 배치.main(d["slides"], 틀,
                    재기만들기=lambda 슬롯: (lambda 글: 1.0 * len(글)))
    사례2 = json.loads(out["cards_json"])[1]["글자영역"][1]
    assert "강조" in _효과글(사례2, "굵게"), 사례2["글줄"]


def test_표시_안의_겹친_띄어쓰기도_줄어든_뒤_글자를_가리킨다():
    """표시 «안» 에 겹친 공백이 있으면 그 안에서도 공백이 준다 — 줄어든
    뒤 글자(「강 조」, 공백 하나)를 가리키면 맞다."""
    틀 = json.dumps(_통자수틀(), ensure_ascii=False)
    본문 = "앞 단어 **강  조** 뒤 단어"   # 표시 안의 겹친 띄어쓰기
    d = _본문대본(본문)
    out = 배치.main(d["slides"], 틀,
                    재기만들기=lambda 슬롯: (lambda 글: 1.0 * len(글)))
    사례2 = json.loads(out["cards_json"])[1]["글자영역"][1]
    assert "강 조" in _효과글(사례2, "굵게"), 사례2["글줄"]


# ── 글자색도 낱말에 붙는다 (사람 결정 2026-09-19) ──────────────────
#
# 「"AI 광고 미친놈이네요" 이렇게 있을 때 "AI 광고"는 노란색으로 해야겠군 하면
# 그렇게 적용하면 되는 거 아님?」
#
# **원본의 어느 «자리»가 노랑이었는지는 새 글로 못 옮긴다** — 글이 통째로 다르다.
# 굵게·형광펜이 줄 번호에서 낱말로 옮겨 온 그 까닭 그대로다. 분석이 주는 것은
# «이 틀이 쓰는 색»이고, 새 글에서 어디를 칠할지는 LLM 이 고른다.

def test_검증에서_배치까지_글자색_표시가_살아_색구간이_나온다():
    """`[[…]]` 로 감싼 데가 굽는 쪽이 읽는 `색구간` 으로 나오는지 끝까지 본다."""
    틀 = json.dumps(_굵게_한곳_기대하는_틀(), ensure_ascii=False)
    d = _대본({"훅": ["짧은 헤드라인", "[[부제목]] 한 줄입니다"],
              "사례": ["사례 헤드라인", "이건 본문 한 줄입니다 적당히"],
              "요약": ["요약 헤드라인", "요약 본문 한 줄입니다 적당히"],
              "CTA": ["CTA 한 줄 문구입니다"]})
    검 = 대본검증.main(json.dumps(d, ensure_ascii=False), 틀)
    assert 검["ok"] == "1", 검["blocked"]
    out = 배치.main(검["표시슬라이드"], 틀)
    카드들 = json.loads(out["cards_json"])
    훅2 = 카드들[0]["글자영역"][1]
    [(_i, 글)] = _효과조각(훅2, "색")
    assert 글 == "부제목"
    assert all(d.get("색") for 줄 in 훅2["글줄"] for d in 줄["덩어리"] if d["글"] == "부제목")


def test_표시가_없으면_색구간이_빈다():
    """안 칠한 칸까지 색이 들어가면 온 카드가 알록달록해진다."""
    틀 = json.dumps(_굵게_한곳_기대하는_틀(), ensure_ascii=False)
    d = _대본({"훅": ["짧은 헤드라인", "아무 표시 없는 줄입니다"],
              "사례": ["사례 헤드라인", "이건 본문 한 줄입니다 적당히"],
              "요약": ["요약 헤드라인", "요약 본문 한 줄입니다 적당히"],
              "CTA": ["CTA 한 줄 문구입니다"]})
    검 = 대본검증.main(json.dumps(d, ensure_ascii=False), 틀)
    out = 배치.main(검["표시슬라이드"], 틀)
    카드들 = json.loads(out["cards_json"])
    assert _효과글(카드들[0]["글자영역"][1], "색") == []


def test_칸_색이_강조색과_같으면_색구간을_안_건다():
    """**강조가 안 보이면 안 건 것만 못하다**(사람 지적 2026-09-19:
    「미친놈이네요는 색깔 검은색이 아닌데?」).

    강조색은 그 게시물에서 제일 튀는 색 하나인데, **어떤 칸은 글자 전체가 이미
    그 색이다** — 실물 키키 제목이 `#ABEC67` 이고 강조색이 `#A9ED66` 이라
    차이가 4다. 거기에 강조를 걸면 아무 일도 안 일어난다. 창고 273칸 중
    24칸(8%)이 그렇다.

    그럴 때는 **안 거는 편이 낫다.** 사람은 작업대에서 직접 칠할 수 있고,
    안 보이는 강조가 걸려 있으면 「왜 안 되지」를 알 길이 없다.
    """
    틀 = _굵게_한곳_기대하는_틀()
    틀["강조색"] = "#A9ED66"
    # 훅 둘째 슬롯의 칸 색을 강조색과 거의 같게 만든다
    틀["슬라이드"][0]["글자슬롯"][1]["글자색"] = "#ABEC67"
    틀글 = json.dumps(틀, ensure_ascii=False)
    d = _대본({"훅": ["짧은 헤드라인", "[[부제목]] 한 줄입니다"],
              "사례": ["사례 헤드라인", "이건 본문 한 줄입니다 적당히"],
              "요약": ["요약 헤드라인", "요약 본문 한 줄입니다 적당히"],
              "CTA": ["CTA 한 줄 문구입니다"]})
    검 = 대본검증.main(json.dumps(d, ensure_ascii=False), 틀글)
    out = 배치.main(검["표시슬라이드"], 틀글)
    카드들 = json.loads(out["cards_json"])
    assert _효과글(카드들[0]["글자영역"][1], "색") == [], \
        "칸 색과 같은 색으로 칠해 강조가 안 보인다"


def test_칸_색이_다르면_그대로_칠한다():
    """위 관문이 멀쩡한 자리까지 막으면 안 된다."""
    틀 = _굵게_한곳_기대하는_틀()
    틀["강조색"] = "#A9ED66"
    틀["슬라이드"][0]["글자슬롯"][1]["글자색"] = "#000000"
    틀글 = json.dumps(틀, ensure_ascii=False)
    d = _대본({"훅": ["짧은 헤드라인", "[[부제목]] 한 줄입니다"],
              "사례": ["사례 헤드라인", "이건 본문 한 줄입니다 적당히"],
              "요약": ["요약 헤드라인", "요약 본문 한 줄입니다 적당히"],
              "CTA": ["CTA 한 줄 문구입니다"]})
    검 = 대본검증.main(json.dumps(d, ensure_ascii=False), 틀글)
    out = 배치.main(검["표시슬라이드"], 틀글)
    카드들 = json.loads(out["cards_json"])
    assert _효과글(카드들[0]["글자영역"][1], "색"), "멀쩡한 자리를 막았다"


# ── 사진 설명 (사람 지시 2026-09-19) ────────────────────────────────
#
# 라벨판에서 사진 자리에 «무엇을 찍은 사진인지» 를 적으면 그 글이 AI 그림
# 지시문이 된다. **위치·방향이 알맹이다**(사람 지적: 「오른쪽 사진 3개 쪽으로
# 프레젠테이션 포즈 해야지」) — 지금 지시문은 그 장의 «글» 만 넘겨서 사람이
# 어느 쪽을 보고 어디를 가리키는지 말할 길이 없다.
#
# 계량은 진작부터 `note` 를 날랐다(`merge_labeled.py:536`). 끊긴 데는 틀로
# 내보내는 여기와 지시문 짓는 자리 둘뿐이었다.

def test_틀이_사진_설명을_싣는다():
    import make_dsl_cardnews as 틀만들기
    난것 = 틀만들기._장식칸({"kind": "사진", "box": [0, 0, 10, 10],
                        "note": "검은 정장 남성, 오른쪽을 가리키는 포즈"})
    assert 난것.get("설명") == "검은 정장 남성, 오른쪽을 가리키는 포즈"


def test_설명이_없으면_칸을_안_만든다():
    """**안 잰 값을 빈 글자로 채우면 굽는 쪽이 「잰 값」으로 착각한다.**
    이 저장소에서 같은 모양의 구멍이 다섯 번 났다(`_장식칸` 머리글)."""
    import make_dsl_cardnews as 틀만들기
    for r in ({"kind": "사진", "box": [0, 0, 10, 10]},
              {"kind": "사진", "box": [0, 0, 10, 10], "note": ""},
              {"kind": "사진", "box": [0, 0, 10, 10], "note": "   "}):
        assert "설명" not in 틀만들기._장식칸(r), r


def test_배경자리에_배경설명이_실린다():
    """사람 지시 2026-09-19: 「배경이 사진이다 부분도 설명 넣을수있지 않아?」

    배경 사진은 사람이 네모를 안 긋는다 — 그으면 그 안에 글자 네모를 못 그려서다
    (`_배경자리` 머리글). 그래서 설명도 네모가 아니라 «그 장» 에 붙는다.
    """
    import make_dsl_cardnews as 틀만들기
    자리 = 틀만들기._배경자리({"kind": "사진", "설명": "해질 무렵 도시 야경"}, 1080, 1350)
    assert len(자리) == 1
    assert 자리[0].get("설명") == "해질 무렵 도시 야경"


def test_배경설명이_없으면_칸을_안_만든다():
    import make_dsl_cardnews as 틀만들기
    자리 = 틀만들기._배경자리({"kind": "사진"}, 1080, 1350)
    assert len(자리) == 1
    assert "설명" not in 자리[0]


# ── 넘침을 알릴 때 «몇 자로 줄여야 하나» 까지 댄다 (사람 지적 2026-09-24) ──
#
# 사용자: **「더 짧게가 아니라 그 범위 안으로 다시 적어라 이렇게 보내야지」**
#
# 여태 「몇 줄인데 자리는 몇 줄이다 — 더 짧게 줄여라」만 보냈다. 모델은 얼마나
# 줄여야 하는지 모르니 넉넉히 깎는데, 그러면 이번엔 대본 검증의 자수 하한이
# 「최소 18자인데 9자다」로 되튕긴다. **두 검사가 서로 반대로 미는 꼴**이라
# 판만 태운다 — 한 판에 딥시크 두 번이다.

def _밀린것(칸당줄=4):
    """글줄을 자리보다 많게 넣어 «밀림» 을 만든다."""
    카드_json, 틀 = _배치결과()
    카드들 = json.loads(카드_json)
    카드들[0]["글자영역"][0]["lines"] = [f"{i}번째 줄" for i in range(칸당줄)]
    out = 배치검증.main(json.dumps(카드들, ensure_ascii=False), 틀)
    밀린 = [줄 for 줄 in (out.get("점수표") or "").splitlines()
          if "폭에 맞춰 감으니" in 줄]
    return 밀린, 카드들[0]["글자영역"][0]


def test_넘침_알림에_자수_범위가_실린다():
    밀린, 칸 = _밀린것()
    assert 밀린, "밀림이 안 잡혔다 — 시험 자체가 안 돈다"
    말 = 밀린[0]
    assert f"{int(칸['최소'])}~{int(칸['최대'])}자" in 말, 말
    assert "범위 안으로" in 말, 말


def test_넘침_알림은_여전히_안_막는다():
    """범위를 보태도 «권고» 다 — 밀림으로 카드를 버리지 않는다."""
    카드_json, 틀 = _배치결과()
    카드들 = json.loads(카드_json)
    카드들[0]["글자영역"][0]["lines"] = [f"{i}번째 줄" for i in range(4)]
    out = 배치검증.main(json.dumps(카드들, ensure_ascii=False), 틀)
    assert out["ok"] == "1", out["막힘"]


def test_최소_최대가_없는_칸은_범위를_안_붙인다():
    """번호판처럼 우리가 지어 넣은 칸은 값이 없을 수 있다 — 터지면 안 된다."""
    카드_json, 틀 = _배치결과()
    카드들 = json.loads(카드_json)
    칸 = 카드들[0]["글자영역"][0]
    칸["lines"] = [f"{i}번째 줄" for i in range(4)]
    칸.pop("최소", None)
    칸.pop("최대", None)
    out = 배치검증.main(json.dumps(카드들, ensure_ascii=False), 틀)
    밀린 = [줄 for 줄 in (out.get("점수표") or "").splitlines()
          if "폭에 맞춰 감으니" in 줄]
    assert 밀린, "밀림이 안 잡혔다"
    assert "범위 안으로" not in 밀린[0], 밀린[0]
