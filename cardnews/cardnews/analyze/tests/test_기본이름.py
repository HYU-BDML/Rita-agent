# -*- coding: utf-8 -*-
"""「기본」이라는 낱말이 두 배포 단위에 두 벌로 있다. 어긋나면 조용히 안 통한다.

`make_dsl_cardnews` 가 Dify 고르는 칸에 이 값을 박고, `app.py` 가 그 값을 받아
「기본 옷장을 달라는 뜻」으로 푼다. 한쪽만 고치면 사람이 「기본」을 골랐는데
서버가 «그런 틀이 없다» 고 답한다.

한 벌로 합치지 않은 까닭은 배포 단위가 달라서다 — 작업대 Lambda 는 `dify/` 를
싣지 않는다. 그래서 «합치는» 대신 «어긋나면 잡는다».
"""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "dify"))
sys.path.insert(0, str(ROOT / "render"))
os.environ.setdefault("BUCKET", "시험통")

import app  # noqa: E402
import make_dsl_cardnews as 틀만들기  # noqa: E402


def test_두_벌이_같은_값이다():
    assert 틀만들기.기본이름 == app.기본이름
