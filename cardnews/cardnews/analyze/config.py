# analyze/config.py
"""경로와 상수. 캘리브레이션 값은 calibration.json 에서 읽는다."""
import json
import os
import sys
from pathlib import Path

# 셸에 따라 stdout 이 cp949 로 잡힌다(실측: Git Bash 는 cp949, PowerShell 은 utf-8).
# cp949 에는 유니코드 대시(—)가 없어서, 그 글자를 찍는 순간 UnicodeEncodeError 로 죽는다.
# calibrate.py 의 마지막 "판정:" 줄이 바로 그런 줄이다.
# 이 파일을 import 하는 모든 스크립트가 여기서 한 번에 구제된다.
for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        _s.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent
# **쓸 자리는 밖에서 정할 수 있다.** Lambda 의 `/var/task` 는 «읽기 전용» 이라
# 여기서 `mkdir` 을 하는 순간 임포트가 통째로 죽는다(그러면 모든 문이 500 이
# 된다). 서버에서는 `CARDNEWS_DATA=/tmp/data` 를 준다.
DATA = Path(os.environ.get("CARDNEWS_DATA", "").strip() or (ROOT / "data"))
IMAGES = DATA / "images"
OCR_DIR = DATA / "ocr"
RULER = DATA / "ruler"
EYE = DATA / "eye"
MEASURES = DATA / "measures"
RECIPES = Path(os.environ.get("CARDNEWS_RECIPES", "").strip()
               or (ROOT.parent / "docs" / "recipes"))   # 같은 까닭으로 밖에서 준다
CAL_PATH = ROOT / "calibration.json"

for d in (DATA, IMAGES, OCR_DIR, RULER, EYE, MEASURES, RECIPES):
    d.mkdir(parents=True, exist_ok=True)

# 모든 측정은 가로 1080 으로 맞춘 뒤에 한다. 72dpi 기준 1px = 1pt.
CANVAS_W = 1080


def 글자를_재나(b: dict) -> bool:
    """이 네모의 «안쪽 글자» 를 재야 하나 — **종류가 「글자」 또는 「장번호」 인 것만.**

    「안에 글자 있다」 표시(`글자있음`)는 2026-09-16 에 라벨 화면에서 뺐다 — 도형을 긋고
    그 안 글자는 «글자» 로 따로 긋는다. 옛 라벨에 남은 표시를 계속 읽으면 같은 자리에
    글자칸이 두 벌 생겨 배치가 막힌다(실물 DSW-6lrk5rs 8번 장, 2026-09-19). 그래서 안 읽는다.

    「장번호」 배지는 안의 숫자를 읽는다 — 번호판(`번호판.만들기`)이 그 글자 자리를 지우고
    크기·색을 재는 데 쓴다(사람 결정 2026-09-19).

    **읽는 곳이 셋이라 여기 하나로 모은다** — 글자 읽기(`글자읽기.read_slide`) · 글자 재기
    (`layout_labeled.slide_text`) · 배경 잔여(`merge_labeled`).
    """
    return b.get("kind") in ("글자", "장번호")

# 분석
VISION_ENDPOINT = "https://vision.googleapis.com/v1/images:annotate"

# 라벨 (docx 4-2 기준)
ROLES = ["훅", "정의", "문제", "해결", "사례", "비교", "데이터", "요약", "CTA"]
# `SHAPE_KINDS`·`SHAPE_ROLES`(둥근사각형·번호칩·글자그릇…)는 옛 라벨 분류였고 읽는
# 곳이 하나도 없어 2026-09-19 에 지웠다. 모양은 이제 라벨 화면의 단추 스무 개가
# `테두리` 점들로 만든다(`web/lib/label.js` 의 `도형테두리`).
HOOKS = ["궁금증유발", "차별화표현", "트렌디", "함축", "태그유도", "의아함"]


def cal() -> dict:
    if not CAL_PATH.exists():
        raise SystemExit("calibration.json 이 없다. 먼저 `python analyze/calibrate.py` 를 돌려라.")
    return json.loads(CAL_PATH.read_text(encoding="utf-8"))
