# -*- coding: utf-8 -*-
import base64

import pytest

import image


@pytest.fixture(autouse=True)
def 열쇠(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")


def test_그림을_받아_바이트로(monkeypatch):
    받은 = []

    def 보내기(몸, 시간=180):
        받은.append(몸)
        return 200, {"data": [{"b64_json": base64.b64encode(b"PNGDATA").decode()}],
                     "usage": {"input_tokens": 50, "output_tokens": 1600,
                               "input_tokens_details": {"text_tokens": 50, "image_tokens": 0}}}

    monkeypatch.setattr(image, "_보내기", 보내기)
    assert image.만들기("A robot arm") == (b"PNGDATA", {"입력글토큰": 50, "입력그림토큰": 0, "출력토큰": 1600})
    # 소식 카드 사진 자리(1080x796)에 맞춘 크기 — 1024x1536 세로는 절반 넘게 잘려 나갔다
    assert 받은[0] == {"model": "gpt-image-2.5-flare", "prompt": "A robot arm", "size": "1216x896",
                     "quality": "medium", "n": 1}


def test_잔액부족은_바로_말한다(monkeypatch):
    monkeypatch.setattr(image, "_보내기",
                        lambda 몸, 시간=180: (429, {"error": {"code": "insufficient_quota", "message": "quota"}}))
    with pytest.raises(image.그림탈, match="잔액 부족"):
        image.만들기("A robot", 잠자기=lambda s: None)


def test_500은_쉬고_다시(monkeypatch):
    답들 = [(500, "oops"), (200, {"data": [{"b64_json": base64.b64encode(b"OK").decode()}]})]
    쉰 = []
    monkeypatch.setattr(image, "_보내기", lambda 몸, 시간=180: 답들.pop(0))
    assert image.만들기("A robot", 잠자기=쉰.append)[0] == b"OK" and 쉰 == [10]


def test_지시문이_비면_부르지도_않는다(monkeypatch):
    monkeypatch.setattr(image, "_보내기", lambda *a, **k: pytest.fail("부르면 안 된다"))
    with pytest.raises(image.그림탈, match="비어"):
        image.만들기("  ")
