# -*- coding: utf-8 -*-
"""Lambda 가 잡는 손잡이. **여기 있는 이름은 전부 ASCII 다.**

알맹이는 `analyze/lambda_분석.py` 에 있다. 그런데 Lambda 의 손잡이 이름
(`CMD ["app.handler"]`)은 문자열로 파싱돼 `importlib` 에 넘어가므로, 한글이
섞인 모듈 이름을 거기에 두면 런타임·도구마다 다르게 굴 위험이 있다. 이름
하나만 ASCII 로 두고 나머지는 우리 결대로 쓴다.
"""
import sys
from pathlib import Path

여기 = Path(__file__).resolve().parent
for 길 in (여기 / "analyze", 여기 / "dify", 여기 / "render"):
    if str(길) not in sys.path:
        sys.path.insert(0, str(길))

from lambda_분석 import handler  # noqa: E402,F401 — Lambda 가 이 이름을 찾는다
