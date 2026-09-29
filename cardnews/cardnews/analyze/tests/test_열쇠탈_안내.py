# -*- coding: utf-8 -*-
"""열쇠가 죽거나 돈이 떨어졌을 때 사람에게 무엇을 말하나 (사람 요청 2026-09-19).

**「잠시 뒤 다시 시도해 주세요」는 여기서 거짓말이다.** 열쇠가 만료됐거나
잔액이 0이면 열 번 걸어도 열 번 같다. 여태 이 코드들이 안내표에 없어서
일반 문구로 떨어졌고, 사람은 될 리 없는 것을 계속 다시 걸었다.

**그렇다고 속사정을 싣지도 않는다.** 열쇠 조각·주소·남의 서버 문구는
자국에만 남는다 — 화면에는 우리가 쓴 한 줄만 나간다.
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import lambda_분석 as 분석  # noqa: E402
import 사진만들기  # noqa: E402

# 사람이 고칠 수 없는 탈들 — 대본 쪽 넷과 사진 쪽 하나.
못고칠탈 = ["no_api_key", "401", "402", "403", "no_credit"]


@pytest.mark.parametrize("코드", 못고칠탈)
def test_못_고칠_탈에는_다시_시도하라고_안_한다(코드):
    난것 = 분석._사람말(코드, "")
    assert "잠시 뒤" not in 난것, f"될 리 없는 것을 다시 걸라고 한다: {난것}"


@pytest.mark.parametrize("코드", 못고칠탈)
def test_못_고칠_탈은_일반_문구로_안_떨어진다(코드):
    """표에 없으면 「카드뉴스를 만들지 못했습니다」 한 줄로 뭉개진다."""
    assert 코드 in 분석._사람말표, f"{코드} 가 안내표에 없다"


@pytest.mark.parametrize("코드", 못고칠탈)
def test_무엇을_하면_되는지_적는다(코드):
    난것 = 분석._사람말(코드, "")
    assert ("알려 주세요" in 난것 or "만들어" in 난것), f"다음에 할 일이 없다: {난것}"


@pytest.mark.parametrize("코드", 못고칠탈)
def test_속사정을_화면에_안_싣는다(코드):
    """상류가 준 몸통에는 열쇠 조각·주소가 섞여 올 수 있다."""
    몸통 = 'Bearer sk-abcdef123456 /v1/chat 401 Unauthorized {"balance": 0}'
    난것 = 분석._사람말(코드, 몸통)
    for 새면안될것 in ("sk-abcdef", "Bearer", "/v1/chat", "Unauthorized", "balance"):
        assert 새면안될것 not in 난것, f"{새면안될것} 가 화면 문구에 샜다: {난것}"


def test_몰린_것은_다시_시도하라고_한다():
    """429 는 진짜로 잠시 뒤에 되는 것이다 — 위 넷과 반대다."""
    assert "잠시 뒤" in 분석._사람말("429", "")


def test_사진_잔액_탈은_코드를_달고_온다():
    """코드가 없으면 위에서 「job_failed」 로 뭉개져 일반 문구가 뜬다."""
    탈 = 사진만들기.돈없음("fal 잔액이 없습니다 — 사진을 만들 수 없어요")
    assert getattr(탈, "코드", "") == "no_credit"


def test_사진_잔액_탈은_사진_없이_만들라고_알려_준다():
    """카드뉴스 자체는 사진 없이도 나온다 — 사람이 고를 수 있어야 한다."""
    난것 = 분석._사람말("no_credit", "")
    assert "사진" in 난것, 난것
