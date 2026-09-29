# -*- coding: utf-8 -*-
"""웹 거울 `web/lib/화풍.js` 를 `화풍.py` 에서 다시 쓴다. 화풍을 고친 뒤 한 번 돌린다.

    python cardnews/analyze/화풍웹목록.py

거울이 낡으면 `tests/test_화풍.py` 가 빨개진다.
"""
import json
import sys
from pathlib import Path

여기 = Path(__file__).resolve().parent
sys.path.insert(0, str(여기))
import 화풍  # noqa: E402

곳 = 여기.parent / "web" / "lib" / "화풍.js"
머리 = ("// 자동으로 쓴 파일 — 손으로 고치지 않는다.\n"
       "// 원본: cardnews/analyze/화풍.py. 고친 뒤 `python cardnews/analyze/화풍웹목록.py` 로 다시 쓴다.\n")


def 쓰기() -> Path:
    글 = 머리 + "export const 화풍목록 = " + json.dumps(화풍.웹목록(), ensure_ascii=False, indent=1) + "\n"
    곳.write_bytes(글.encode("utf-8"))
    return 곳


if __name__ == "__main__":
    print("썼다:", 쓰기())
