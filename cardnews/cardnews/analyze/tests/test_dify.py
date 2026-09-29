# analyze/tests/test_dify.py
"""Dify 로 넘어가는 것들을 검사한다.

여기서 잡고 싶은 것은 하나다 — **Dify 안에서 처음 알게 되는 실패가 없을 것.**
"""
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import config  # noqa: E402
import export_dify  # noqa: E402
import cluster  # noqa: E402

MAX_DEPTH = 5          # Dify 코드 노드 반환값 중첩 한도
MAX_CHARS = 400_000    # Dify 코드 노드 문자열 한도


def _depth(v, d=1):
    if isinstance(v, dict):
        return max([_depth(x, d + 1) for x in v.values()] or [d])
    if isinstance(v, list):
        return max([_depth(x, d + 1) for x in v] or [d])
    return d


SKELETON = ["훅", "정의", "문제", "해결", "CTA"]


def _synthetic_doc(shortcode: str) -> dict:
    """measures/<코드>.json 계약을 그대로 따르는 합성 게시물 하나.

    merge.py 가 실제로 내는 모양(merge_one)을 손으로 흉내낸다. canvas 는
    객체({"w":.., "h":..})다 — c6f9745 에서 확정된 모양이고, 리스트로 냈다가
    render.py 의 d["canvas"]["h"] 에서 TypeError 가 났던 그 자리다.
    """
    def slide(i, role):
        return {
            "index": i,
            "role": role,
            "tone": {"formality": "친근", "humor": "약간", "respect": "존댓말", "enthusiasm": "보통"},
            "ending": "해요체",
            "person": "2인칭",
            "is_question": role == "훅",
            "colors": {"bg": "#FFFFFF", "text": "#111111", "accent": "#FF5A36",
                       "contrast": 15.2, "accent_blobs": 1, "dominance": "고대비"},
            "text": {
                "levels": [
                    {"role": "제목", "pt": 64, "pct_h": 4.74, "weight": "Bold", "family": "고딕",
                     "lines": 1, "chars": 12, "leading": 1.6},
                    {"role": "본문", "pt": 36, "pct_h": 2.67, "weight": "Regular", "family": "고딕",
                     "lines": 3, "chars": 40, "leading": 1.6},
                ],
                "align": "가운데", "vpos": "가운데", "margin": 80,
                "digits": 1 if role in ("데이터", "훅") else 0, "emoji": 1,
                "text_area_pct": 22.5,
            },
            "photo": {"placement": "상단" if role != "CTA" else "없음",
                      "treatment": "원본", "content": "인물", "relation": "보완",
                      "area_pct": 40.0 if role != "CTA" else 0.0},
            "shapes": [
                {"kind": "둥근사각형", "role": "글자그릇", "radius": 24.0, "fill": "#000000",
                 "filled": True, "alpha": 0.55, "shadow": {"has": False, "dir": None, "spread": 0}},
            ] if role in ("훅", "CTA") else [],
        }

    slides = [slide(i + 1, role) for i, role in enumerate(SKELETON)]
    return {
        "shortcode": shortcode,
        "author": "tester",
        "url": f"https://instagram.com/p/{shortcode}/",
        "slide_count": len(slides),
        "canvas": {"w": config.CANVAS_W, "h": 1350},
        "post_type": "카드뉴스",
        "hook_strategy": "궁금증유발",
        "skeleton": SKELETON,
        "slides": slides,
    }


@pytest.fixture(scope="module", autouse=True)
def _pipeline_data(tmp_path_factory):
    """합성 표본을 **임시 폴더**에 깔고 config 의 경로를 그리로 돌린다.

    실측 파이프라인은 보드 암호와 Vision·Anthropic 키가 있어야 도는데, 그게
    몇 달 없을 수도 있다. 그렇다고 이 시험이 영구히 빨간불이면(FileNotFoundError)
    그 신호에 아무도 신경 안 쓰게 되고 진짜 회귀가 나는 날 묻힌다.

    **합성 표본을 analyze/data/ 에 두면 안 된다.** cluster.py 는 measures/ 에
    있는 것을 전부 긁어 묶는데, 가짜 5건은 MIN_MEMBERS 를 정확히 채워서
    진짜 표본과 나란히 레시피 하나를 만들어낸다. 실제로 그렇게 남아 있었다.
    그래서 진짜 데이터가 사는 곳을 아예 건드리지 않는다.

    **`scope="module"` 로 좁혔다(2026-08-26) — 예전엔 `"session"` 이었다.**
    `config.DATA`·`config.MEASURES` 를 가짜 계량표 5건이 든 임시 폴더로 갈아
    끼우는 몸통이라, 세션 범위면 `mp.undo()` 가 **세션이 끝나야** 돈다. 그래서
    `pytest cardnews` 로 한꺼번에 돌리면 이 파일 뒤에 도는 다른 파일들
    (`cardnews/analyze/tests` 의 나머지·`cardnews/dify/tests`)까지 진짜
    `config.DATA` 대신 이 가짜 폴더를 보게 된다(실측: `cardnews/dify/tests` 15개가
    `KeyError: 'regions'` 로 헛되이 깨졌다). 이 가짜 계량표는 `test_dify.py`
    안에서만 뜻이 있으므로, 파일(모듈) 범위로 좁혀 그 파일이 끝나면 바로
    되돌리게 한다 — 남의 시험까지 물들이지 않는다.
    """
    mp = pytest.MonkeyPatch()
    root = tmp_path_factory.mktemp("dify")
    measures = root / "measures"
    measures.mkdir()
    mp.setattr(config, "DATA", root)
    mp.setattr(config, "MEASURES", measures)

    members = [f"FAKE{i:03d}" for i in range(cluster.MIN_MEMBERS)]
    for m in members:
        (measures / f"{m}.json").write_text(
            json.dumps(_synthetic_doc(m), ensure_ascii=False, indent=2), encoding="utf-8")
    (root / "clusters.json").write_text(
        json.dumps([{"name": "A", "pattern": SKELETON, "members": members}],
                   ensure_ascii=False, indent=2), encoding="utf-8")
    yield
    mp.undo()


@pytest.fixture(scope="module")
def node():
    """export_dify.py 가 낸 소스를 Dify 코드 노드가 하듯 실행하고 main 을 돌려준다.

    `_pipeline_data` 가 `"module"` 로 좁혀진 뒤로는 이 픽스처도 같은 범위여야
    한다 — `session` 으로 두면 그 픽스처보다 먼저 준비돼 아직 안 갈아 낀
    `config.DATA` 를 읽으려 든다(pytest 가 넓은 범위를 먼저 준비하는 순서라
    그렇다)."""
    src = config.DATA / "dify_recipes.py"
    if not src.exists():
        export_dify.main()
    ns = {}
    exec(compile(src.read_text(encoding="utf-8"), "dify_code_node", "exec"), ns)
    return ns["main"]


@pytest.fixture(scope="module")
def first(node):
    name = json.loads((config.DATA / "clusters.json").read_text(encoding="utf-8"))[0]["name"]
    return node(name)


def test_소스가_파이썬으로_읽힌다(node):
    """`node` 를 받는 이유는 그 픽스처가 파일을 만들어주기 때문이다. 값은 안 쓴다."""
    src = (config.DATA / "dify_recipes.py").read_text(encoding="utf-8")
    compile(src, "dify_code_node", "exec")
    assert len(src) <= MAX_CHARS


def test_모르는_레시피는_막는다(node):
    with pytest.raises(ValueError):
        node("있을리없는이름")


def test_반환값이_Dify_한도_안에_있다(first):
    assert _depth(first) <= MAX_DEPTH
    for k, v in first.items():
        assert k.isascii(), f"{k} 는 ASCII 가 아니다. Dify 변수 이름은 ASCII 로 짓는다"
        assert isinstance(v, (str, int, float, list)), f"{k} 가 {type(v).__name__} 이다"


def test_골격_길이와_장수가_같다(first):
    """접힌 골격(사례*)을 그대로 내보내면 여기서 걸린다.

    LLM 이 '골격 5개인데 7장을 써라' 라는 모순된 지시를 받게 되는 자리다.
    """
    assert len(first["skeleton"]) == first["slide_count"]


def test_팔레트_줄마다_색이_세개다(first):
    import re
    lines = [ln for ln in first["palettes"].splitlines() if ln.strip()]
    assert len(lines) == first["palette_count"]
    for ln in lines:
        assert len(re.findall(r"#[0-9A-Fa-f]{6}", ln)) == 3, ln
