# -*- coding: utf-8 -*-
"""시험은 돈 드는 망을 절대 안 탄다 — 그림 열쇠를 시험 동안 지운다.
(`gpt누끼.있나()` 가 꺼져 `cutout.cut_slide` 는 흘려채우기로 간다.)"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import 창고캐시
import 글자읽기  # noqa: E402


@pytest.fixture(autouse=True)
def _그림_열쇠_없이(monkeypatch):
    monkeypatch.delenv("FAL_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    # **글자 읽는 모델도 끈다**(2026-09-24). 안 끄면 `merge_labeled.build` 를
    # 부르는 시험들이 진짜 망을 탄다 — 돈이 나가고 시험이 느려지고 들쭉날쭉해진다.
    # **지우지 말고 빈 글자로 둔다**: `글자읽기.열쇠()` 가 환경변수에 칸이 있으면
    # 레지스트리를 안 본다(윈도우에서 나중에 넣은 시스템 환경변수를 읽으려고
    # 레지스트리를 보게 해 뒀는데, 그 길이 `delenv` 를 비켜 간다).
    monkeypatch.setenv("OPENROUTER_API_KEY", "")


@pytest.fixture(autouse=True)
def _캐시는_임시자리에(monkeypatch, tmp_path):
    """**시험이 만든 캐시를 저장소에 안 남긴다.**

    한 번 읽은 것은 두 번 안 읽는 창고(`창고캐시`)가 `config.DATA` 밑에 담는데,
    시험이 그대로 쓰면 저장소에 파일이 쌓이고 **다음 판에서 그 캐시가 꺼내져**
    망을 안 탔는데 답이 나온다 — 실물 2026-09-24 에 `test_글자_네모_읽기는…` 가
    둘째 판부터 빨개졌다(구글을 안 부르니 `crop_w` 가 안 찍혔다).

    **`BUCKET` 은 안 건드린다.** 지웠더니 그 환경변수를 쓰는 시험 일곱이 깨졌다
    (`test_틀이름지키기` 가 `BUCKET="시험통"` 을 깔아 둔다). 대신 `뿌리덮개` 가
    꽂혀 있으면 `창고캐시` 가 아예 창고를 안 본다.
    """
    monkeypatch.setattr(창고캐시, "뿌리덮개", tmp_path / "캐시")


@pytest.fixture(autouse=True)
def _열쇠는_있는_셈_친다(monkeypatch):
    """**시험은 거의 다 «열쇠가 있다» 는 쪽을 본다.** 없으면 `merge_labeled`
    가 바로 터지게 해 뒀기 때문이다(2026-09-24, 구글 물러서기를 뺀 뒤).

    진짜 망을 탈 걱정은 없다 — `글자읽기.부르기` 가 열쇠가 빈 것을 보고 보내기
    전에 멈춘다. 열쇠 없는 쪽을 보는 시험은 제 자리에서 `있나` 를 다시 끼운다.
    """
    monkeypatch.setattr(글자읽기, "있나", lambda: True)
