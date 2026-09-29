# -*- coding: utf-8 -*-
"""**돈이 나가는 문에 건 자물쇠**(사람 결정 2026-09-22).

2026-09-16 에 「리타에 넣을 열린 URL」을 만들며 암호 관문을 걷어냈고, 09-22 에
마지막 빗장(담기 하루 50건)마저 뺐다. 그 사이 주소만 알면 누구나 굽기(한 판 약
$0.15)·대본·분석·담기를 돌릴 수 있었다.

**여기서 틀리면 둘 중 하나가 난다** — 문이 계속 열려 있거나, 우리 워커까지
못 들어와 서비스가 통째로 멈추거나. 눈으로는 둘 다 안 보인다.
"""
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
os.environ.setdefault("BUCKET", "시험통")

import pytest  # noqa: E402
import app  # noqa: E402
import rita  # noqa: E402

웹열쇠 = "웹열쇠값"
리타열쇠 = "리타열쇠값"


@pytest.fixture(autouse=True)
def _열쇠깔기(monkeypatch):
    monkeypatch.setenv(app.웹열쇠칸, 웹열쇠)
    monkeypatch.setenv(rita.열쇠칸, 리타열쇠)


def _부름(path, method="POST", 열쇠=None, body=None):
    머리 = {"Authorization": "Bearer " + 열쇠} if 열쇠 else {}
    return {"rawPath": path,
            "requestContext": {"http": {"method": method},
                               "domainName": "a.example"},
            "headers": 머리,
            "body": json.dumps(body or {}, ensure_ascii=False)}


# 워커만 두드리는 문 — 돈이 나가거나 남의 것을 고친다.
잠긴문 = ["/bake", "/make", "/draft", "/ingest",
        "/template/rename", "/upload/delete", "/analyze/ABC123"]

# 작업대 화면이 직접 두드리는 문 — 잠그면 이미 구워 둔 작업대가 죽는다.
열린문 = [("/upload", "POST"), ("/upload/sign", "POST"),
        ("/edit/8a14a8d4c54f4a2a914cd3a438791ddd", "POST"),
        ("/make/job_x", "GET")]


@pytest.mark.parametrize("문", 잠긴문)
def test_열쇠_없이_두드리면_401(문):
    assert app.handler(_부름(문), None)["statusCode"] == 401


@pytest.mark.parametrize("문", 잠긴문)
def test_열쇠가_맞으면_401_이_아니다(문):
    """**열어 주는지만 본다.** 그 뒤에 400 이 나든 500 이 나든 자물쇠 몫이 아니다.

    여기가 막히면 우리 워커까지 못 들어와 서비스가 통째로 멈춘다.
    """
    assert app.handler(_부름(문, 열쇠=웹열쇠), None)["statusCode"] != 401


@pytest.mark.parametrize("문", 잠긴문)
def test_RITA_열쇠로는_못_연다(문):
    """**저쪽에 준 열쇠다.** 돌려쓰면 리타도 우리 돈 쓰는 문을 열 수 있게 된다."""
    assert app.handler(_부름(문, 열쇠=리타열쇠), None)["statusCode"] == 401


@pytest.mark.parametrize("문,방법", 열린문)
def test_작업대가_부르는_문은_열쇠_없이도_열린다(문, 방법):
    """사람 결정 2026-09-22 「열어 둬」 — 이미 구워 둔 작업대를 안 깬다."""
    assert app.handler(_부름(문, 방법), None)["statusCode"] != 401


def test_번호표_물어보기와_굽기를_가른다():
    """주소가 닮았다 — 하나는 굽기를 걸고(돈), 하나는 번호표를 물어볼 뿐이다."""
    assert app.웹전용인가("/make", "POST")
    assert not app.웹전용인가("/make/job_x", "GET")
    assert not app.웹전용인가("/make", "GET")


def test_OPTIONS_는_안_막는다():
    """프리플라이트가 막히면 브라우저가 진짜 요청을 아예 안 보낸다."""
    assert not app.웹전용인가("/bake", "OPTIONS")


def test_열쇠칸이_비면_아무도_못_들어온다(monkeypatch):
    """**편의로 열어 두지 않는다.** 그게 바로 문이 열린 상태다."""
    monkeypatch.delenv(app.웹열쇠칸, raising=False)
    assert app.handler(_부름("/bake", 열쇠=웹열쇠), None)["statusCode"] == 401


def test_잠긴_문_목록이_늘거나_줄면_눈에_띈다():
    """**늘리거나 줄일 때 사람이 한 번 멈추라고 둔 못이다.**"""
    assert set(app.웹전용문) == {"/bake", "/make", "/draft", "/ingest",
                              "/template/rename", "/upload/delete"}
    assert "/upload" not in app.웹전용문, "잠그면 옛 작업대에서 사진 올리기가 죽는다"
