import json
import sys
from pathlib import Path

import pytest
from PIL import ImageDraw, Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import config
import recipe


# ---------------------------------------------------------------- 실물 데이터
# analyze/data/ 는 통째로 gitignore 다. 실물이 필요한 시험만 건너뛴다
# (test_labeled.py 의 `_needs_real` 관례를 그대로 따른다).
_REAL = config.MEASURES / "DHqCBQnRAjW.json"
_HAS_REAL = _REAL.exists()
_needs_real = pytest.mark.skipif(not _HAS_REAL, reason="analyze/data/measures/DHqCBQnRAjW.json 이 없다")

_RS_FONTS = config.ROOT.parent / "render" / "fonts"
_HAS_PRETENDARD = (_RS_FONTS / "Pretendard-Bold.otf").exists() and (_RS_FONTS / "Pretendard-Medium.otf").exists()
_needs_font = pytest.mark.skipif(not _HAS_PRETENDARD, reason="render-server/fonts/Pretendard-*.otf 이 없다(git 미추적)")


# ---------------------------------------------------------------- 합성 표본

def _line(text, hex_color="#000000", back_runs=None, back_fallback=False):
    back = {"fallback": True, "why": "test"} if back_fallback else {"runs": back_runs or []}
    return {"text": text, "box": [0, 0, 10, 10], "pt": 40, "weight": "Bold", "color": hex_color,
            "back": back}


def _text_region(rid, box, text, pt, weight, lines=1, align="왼쪽", font="프리텐다드",
                  family="고딕", line_texts=None, back_runs_per_line=None, fallback=None,
                  level=None):
    line_texts = line_texts or text.split("\n")
    lines_detail = []
    for i, t in enumerate(line_texts):
        runs = (back_runs_per_line or {}).get(i, [])
        lines_detail.append(_line(t, back_runs=runs))
    block = {"font": font, "effects": [], "text": text, "pt": pt, "weight": weight,
             "family": family, "color": "#000000", "align": align, "leading": 1.5,
             "lines": lines, "line_detail": lines_detail, "level": level}
    if fallback is not None:
        block["fallback"] = fallback
    return {"id": rid, "kind": "글자", "box": box, "note": "", "text": block}


def _photo_region(rid, box, kind="사진"):
    return {"id": rid, "kind": kind, "box": box, "note": "",
            "color": {"kind": "사진", "cover": 0.2, "cells": 40}}


def _slide(index, role, regions, bg_hex="#F1FFE5", bg_kind="단색", tone=None):
    return {
        "index": index, "role": role,
        "background": {"kind": bg_kind, "hex": bg_hex, "cover": 0.5, "cells": 96}
                      if bg_kind == "단색" else {"kind": bg_kind, "dir": "세로",
                                                "stops": [{"at": 0.0, "hex": "#FFFFFF"},
                                                          {"at": 1.0, "hex": "#000000"}],
                                                "cover": 0.5, "cells": 96},
        "ending": "해요체", "person": "생략", "is_question": False,
        "regions": regions,
        "role": role,
        "tone": tone or {"formality": "중간", "humor": "낮음", "respect": "중간", "enthusiasm": "중간"},
    }


def _doc(shortcode, slides, accent_hex="#C9FC95"):
    return {
        "shortcode": shortcode, "canvas": {"w": 1080, "h": 1350}, "slide_count": len(slides),
        "labels": {}, "accent": {"hex": accent_hex, "slides": len(slides), "pixels": 1000,
                                  "bg_de_skipped": 0},
        "post_type": "listicle", "hook_strategy": "궁금증유발",
        "skeleton": [s["role"] for s in slides], "slides": slides,
    }


# ---------------------------------------------------------------- usable_width

def test_쓸수있는폭은_사람이_그은_네모다():
    """예전에는 왼쪽 정렬일 때 「네모 왼쪽부터 화면 끝까지」를 썼다(980px).

    좁은 네모에서 크게 어긋난다 — 실측(DNUFIa4NIkK 1번 장): 337px 네모에
    아홉 자가 들어가는데 상한이 28자였다. 넘침은 네모로 재므로, 상한이 네모보다
    크면 LLM 이 그 상한을 채우는 순간 반드시 넘친다.
    """
    margin, usable = recipe.usable_width([100, 0, 500, 50], "왼쪽", 1080)
    assert margin == 100, "여백은 보고용으로 그대로 둔다"
    assert usable == 400, "네모 폭이다"


def test_가운데_정렬도_네모_폭이다():
    margin, usable = recipe.usable_width([200, 0, 880, 50], "가운데", 1080)
    assert margin == 200
    assert usable == 680


def test_가운데가_한쪽으로_치우쳐도_네모다():
    """예전 셈(canvas - 2*margin)은 치우친 네모에서 네모보다 넓게 나왔다."""
    _, usable = recipe.usable_width([100, 0, 400, 50], "가운데", 1080)
    assert usable == 300


# ---------------------------------------------------------------- ceiling_chars

def test_ceiling_chars_floors():
    assert recipe.ceiling_chars(1002, 91) == 11  # 규칙표.md 표지 1행과 같은 수


def test_ceiling_chars_zero_width_is_safe():
    assert recipe.ceiling_chars(1000, 0) == 0


# ---------------------------------------------------------------- text_slots

def test_text_slots_groups_by_weight_pt_bucket_and_line_count():
    title = _text_region("t1", [50, 800, 500, 900], "제목", 45, "Bold", lines=1)
    body = _text_region("b1", [50, 950, 900, 1200], "본문\n두번째", 41, "Regular", lines=2)
    s1 = _slide(2, "사례", [title, body])

    title2 = _text_region("t2", [50, 800, 700, 900], "제목2", 46, "Bold", lines=1)
    body2 = _text_region("b2", [50, 950, 950, 1200], "본문2\n두번째2", 40, "Regular", lines=2)
    tag2 = _text_region("g2", [800, 700, 950, 730], "택", 21, "Bold", lines=1)
    s2 = _slide(3, "사례", [title2, body2, tag2])

    groups = recipe.text_slots([s1, s2])

    assert len(groups) == 3  # 제목/본문/택 — 굵기+pt버킷+줄수로 완전히 갈린다
    counts = sorted(len(v) for v in groups.values())
    assert counts == [1, 2, 2]  # 택은 한 장에만 있다


def test_text_slots_separates_same_bucket_and_line_count_by_weight():
    """같은 pt버킷·같은 줄수라도 굵기가 다르면 다른 슬롯이다 — 실제로 제목(Bold)과
    브랜드택(Bold)이 다른 버킷으로 갈리는 것과 달리, 여기선 버킷·줄수를 일부러
    똑같이 맞추고 굵기만 다르게 해서 굵기 축 하나만 검사한다."""
    bold = _text_region("a", [0, 0, 100, 50], "굵게", 45, "Bold", lines=1)
    regular = _text_region("b", [0, 100, 100, 150], "안굵게", 45, "Regular", lines=1)
    s = _slide(1, "훅", [bold, regular])

    groups = recipe.text_slots([s])

    assert len(groups) == 2
    keys = {key for _role, key in groups}
    weights = {k[0] for k in keys}
    assert weights == {"Bold", "Regular"}


def test_text_slots_skips_fallback_blocks():
    good = _text_region("t1", [0, 0, 100, 50], "글자", 40, "Bold")
    bad = _text_region("t2", [0, 0, 100, 50], "글자", 40, "Bold", fallback=True)
    s = _slide(1, "훅", [good, bad])

    groups = recipe.text_slots([s])

    assert sum(len(v) for v in groups.values()) == 1


# ---------------------------------------------------------------- 슬롯 이름 = 위계

def test_char_limit_table_names_slots_by_level_not_by_a_serial_number():
    """사람이 되돌려 그린 6번 장을 보고 짚은 자리 — 「기획후기」가 규칙표에
    `요약 글자블록3` 으로만 적혀 있었다. 대본을 쓰는 쪽은 그 이름만으로는
    「이 칸은 훅이니 짧고 세게」를 알 수 없다."""
    tag = _text_region("g", [48, 147, 227, 195], "기획후기", 36, "Bold", level="꼬리표")
    title = _text_region("t", [54, 281, 769, 404], "제목 한 줄|제목 두 줄", 46, "Bold",
                          lines=2, level="제목", line_texts=["제목 한 줄", "제목 두 줄"])
    body = _text_region("b", [60, 478, 1018, 931], "본문", 41, "Regular", lines=7, level="본문")
    rows = recipe.char_limit_rows([_slide(6, "요약", [tag, title, body])], 1080,
                                   recipe._measure_ctx())
    table = recipe.char_limit_table(rows)
    assert "| 요약 꼬리표 |" in table, table
    assert "| 요약 제목 |" in table, table
    assert "| 요약 본문 |" in table, table
    assert "글자블록" not in table, table


def test_slots_of_the_same_level_still_get_a_number():
    """한 역할 안에 같은 위계가 둘이면 이름이 겹친다 — 그때만 번호를 붙인다."""
    a = _text_region("a", [50, 100, 500, 160], "제목 하나", 46, "Bold", level="제목")
    b = _text_region("b", [50, 300, 500, 340], "제목 둘", 26, "Bold", level="제목")
    rows = recipe.char_limit_rows([_slide(1, "훅", [a, b])], 1080, recipe._measure_ctx())
    table = recipe.char_limit_table(rows)
    assert "| 훅 제목1 |" in table and "| 훅 제목2 |" in table, table


def test_text_slots_never_mixes_two_levels():
    """위계가 다르면 pt 버킷·줄수가 같아도 다른 슬롯이다."""
    title = _text_region("t", [0, 0, 100, 50], "제목", 45, "Bold", level="제목")
    tag = _text_region("g", [0, 60, 100, 110], "택", 42, "Bold", level="꼬리표")
    groups = recipe.text_slots([_slide(1, "훅", [title, tag])])
    assert len(groups) == 2, groups


# ---------------------------------------------------------------- role_quotes

def test_role_quotes_orders_by_slide():
    r1 = _text_region("a", [0, 100, 100, 150], "가", 40, "Bold")
    r2 = _text_region("b", [0, 200, 100, 250], "나", 40, "Regular")
    s1 = _slide(2, "사례", [r1, r2])
    r3 = _text_region("c", [0, 100, 100, 150], "가", 40, "Bold")
    r4 = _text_region("d", [0, 200, 100, 250], "다", 40, "Regular")
    s2 = _slide(3, "사례", [r3, r4])

    quotes = recipe.role_quotes([s1, s2], "사례")

    assert [q["slide"] for q in quotes] == [2, 3]
    assert quotes[0]["text"] == "가\n나"
    assert quotes[1]["text"] == "가\n다"


def test_role_quotes_dedupes_identical_combined_text():
    """두 장의 글자 네모를 이어붙인 「대본」이 완전히 같으면 하나만 남긴다
    (`.old.json` 백업처럼 같은 장이 중복 라벨될 수 있는 미래 30건 대비)."""
    mk = lambda i: [_text_region(f"a{i}", [0, 100, 100, 150], "같은 문장", 40, "Bold")]
    slides = [_slide(2, "사례", mk(2)), _slide(5, "사례", mk(5))]

    quotes = recipe.role_quotes(slides, "사례")

    assert len(quotes) == 1
    assert quotes[0]["slide"] == 2  # 먼저 나온 장을 남긴다


def test_role_quotes_cap_limits_count():
    slides = [_slide(i, "사례", [_text_region("x", [0, 0, 10, 10], f"글{i}", 40, "Bold")])
              for i in range(1, 5)]

    quotes = recipe.role_quotes(slides, "사례", cap=2)

    assert len(quotes) == 2


def test_quotes_table_has_header_and_one_row_per_quote():
    quotes = recipe.role_quotes(
        [_slide(1, "훅", [_text_region("x", [0, 0, 10, 10], "훅 문장", 100, "Bold")])], "훅")

    table = recipe.quotes_table("훅", quotes)

    assert "### 훅 (1개)" in table
    assert "훅 문장" in table
    assert table.count("\n|") >= 2  # 머리글 + 데이터 한 줄


# ---------------------------------------------------------------- 자리만 잰 네모

def test_fixed_region_table_says_position_only_not_unmeasured():
    """규칙표에서도 「안 잼」과 「미측정」이 갈려 있어야 한다 — 사람이 읽는
    문서에서 둘이 같은 낱말이면 코드에서 갈라 놓은 뜻이 그 자리에서 사라진다."""
    logo = {"id": "lg", "kind": "로고", "box": [10, 20, 30, 40], "note": "",
            "color": {"kind": "안 잼", "by_design": True, "hex": None,
                      "why": "로고는 색을 재지 않는다 — 자리만 쓴다"}}
    dead = {"id": "dd", "kind": "도형", "box": [50, 60, 70, 80], "note": "",
            "color": {"kind": "미측정", "hex": "#FEFEFE", "cover": 0.0, "cells": 1,
                      "fallback": True, "why": "유효 격자 1칸"}}
    table = recipe.fixed_region_table([_slide(1, "훅", [logo, dead])])
    lines = [ln for ln in table.splitlines() if ln.startswith("| 1 |")]
    assert len(lines) == 2, table
    assert "자리만" in lines[0] and "미측정" not in lines[0], lines[0]
    assert "미측정" in lines[1], lines[1]


# ---------------------------------------------------------------- 형광펜

def test_is_highlight_hex_close_to_accent_is_true():
    assert recipe.is_highlight_hex("#CAFC97", "#F1FFE5", "#C9FC95") is True


def test_is_highlight_hex_close_to_background_is_false():
    assert recipe.is_highlight_hex("#F2FDE7", "#F1FFE5", "#C9FC95") is False


def test_highlight_stats_measures_ratio_per_line_and_skips_gradient_bg():
    body = _text_region(
        "b", [0, 0, 900, 200], "줄1\n줄2", 40, "Regular", lines=2,
        back_runs_per_line={0: [{"hex": "#F2FDE7", "x0": 0, "x1": 10, "ratio": 1.0}],
                             1: [{"hex": "#CAFC97", "x0": 0, "x1": 10, "ratio": 0.5},
                                 {"hex": "#F2FDE7", "x0": 10, "x1": 20, "ratio": 0.5}]})
    solid_slide = _slide(2, "사례", [body], bg_hex="#F1FFE5", bg_kind="단색")

    grad_body = _text_region("g", [0, 0, 900, 200], "줄", 40, "Regular",
                              back_runs_per_line={0: [{"hex": "#CAFC97", "x0": 0, "x1": 10, "ratio": 1.0}]})
    grad_slide = _slide(1, "훅", [grad_body], bg_kind="그라데이션")

    stats = recipe.highlight_stats([grad_slide, solid_slide], "#C9FC95")

    assert stats["measured"] == 2       # 단색 배경 장의 두 줄만
    assert stats["skipped"] == 1        # 그라데이션 장의 한 줄은 뺐다
    assert stats["ratios"] == pytest.approx([0.0, 0.5])
    assert stats["by_line_index"][0] == pytest.approx([0.0])
    assert stats["by_line_index"][1] == pytest.approx([0.5])


def test_highlight_stats_skips_fallback_lines():
    body = _text_region("b", [0, 0, 900, 200], "줄1", 40, "Regular")
    body["text"]["line_detail"][0]["back"] = {"fallback": True, "why": "test"}
    s = _slide(1, "훅", [body], bg_hex="#F1FFE5", bg_kind="단색")

    stats = recipe.highlight_stats([s], "#C9FC95")

    assert stats["measured"] == 0
    assert stats["skipped"] == 1


# ---------------------------------------------------------------- char_width (실물 글꼴 필요)

@_needs_font
def test_char_width_is_positive_and_bold_wider_than_regular_at_same_pt():
    d = ImageDraw.Draw(Image.new("RGB", (1, 1)))
    bold = recipe.char_width(d, "프리텐다드", "Bold", 100)
    regular = recipe.char_width(d, "프리텐다드", "Regular", 100)
    assert bold > 0
    assert regular > 0
    assert bold >= regular  # Bold 는 Regular 보다 좁을 수 없다


# ---------------------------------------------------------------- build_template (실물)

@_needs_real
@_needs_font
def test_build_template_runs_end_to_end_on_real_single_post():
    doc = json.loads(_REAL.read_text(encoding="utf-8"))

    text = recipe.build_template([doc])

    assert "레시피가 아니라 템플릿" in text
    assert "## 1. 글자 수" in text
    assert "## 2. 고정" in text
    assert "## 3. 원문" in text
    assert "## 4. 생성 시점 판단" in text
    assert "## 5. 검증" in text
    assert doc["shortcode"] in text
    for role in ("훅", "사례", "요약", "CTA"):
        assert f"### {role}" in text


def test_build_template_runs_on_synthetic_single_post_without_crashing():
    hook = _slide(1, "훅", [_text_region("h", [50, 800, 900, 950], "훅 헤드라인", 100, "Bold")],
                  bg_kind="그라데이션")
    body = _text_region("b", [50, 950, 950, 1200], "본문 첫줄\n본문 둘째줄", 41, "Regular", lines=2)
    case = _slide(2, "사례", [body])
    cta = _slide(3, "CTA", [_text_region("c", [200, 950, 800, 1100], "팔로우", 37, "Regular",
                                          align="가운데")])
    doc = _doc("TEST001", [hook, case, cta])

    text = recipe.build_template([doc])

    assert isinstance(text, str) and len(text) > 0
    assert "TEST001" in text


def test_오른쪽_정렬이_왼쪽으로_뭉개지지_않는다():
    """`_align` 은 오른쪽을 제대로 판정하는데(ruler/text.py) 규칙표로 접을 때
    버려지고 있었다. 뒤의 그리기(cardnews_compose)가 오른쪽을 지원하므로
    여기서 버리면 그 기능이 영영 안 쓰인다."""
    import recipe
    regions = [{"text": {"align": "오른쪽"}}, {"text": {"align": "오른쪽"}}]
    assert recipe._정렬(regions) == "오른쪽"


def test_섞이면_가장_많은_쪽을_쓴다():
    import recipe
    regions = [{"text": {"align": "오른쪽"}}, {"text": {"align": "오른쪽"}},
               {"text": {"align": "왼쪽"}}]
    assert recipe._정렬(regions) == "오른쪽"


def test_단일이나_없음은_왼쪽으로_친다():
    """`_align` 은 줄이 하나면 «단일», 글이 없으면 «없음»을 낸다 — 방향이 아니다."""
    import recipe
    assert recipe._정렬([{"text": {"align": "단일"}}]) == "왼쪽"
    assert recipe._정렬([{"text": {"align": "없음"}}]) == "왼쪽"
    assert recipe._정렬([]) == "왼쪽"


# ─────────────── 슬롯이 되는 잣대 (2026-08-27, DNUFIa4NIkK 에서 터진 자리)
def test_pt를_못_잰_덩이는_슬롯이_안_된다():
    """**계량은 다 끝난 뒤에 터졌다.**

    글자는 읽혔는데 잉크 높이를 못 재 `pt` 가 None 인 덩이가 있었다. 슬롯 표가
    그것을 담아서 `statistics.median` 이 None 을 정렬하려다 죽었다.
    """
    from recipe import 슬롯이_되나
    assert 슬롯이_되나({"text": "가나", "pt": 40}) is True
    assert 슬롯이_되나({"text": "가나", "pt": None}) is False
    assert 슬롯이_되나({"text": "가나", "pt": 0}) is False


def test_못_읽은_덩이와_빈_글자도_슬롯이_안_된다():
    from recipe import 슬롯이_되나
    assert 슬롯이_되나({"text": "가나", "pt": 40, "fallback": True}) is False
    assert 슬롯이_되나({"text": "   ", "pt": 40}) is False
    assert 슬롯이_되나({"pt": 40}) is False
    assert 슬롯이_되나({}) is False


def test_틀_만들기가_같은_잣대를_쓴다():
    """두 목록이 갈리면 틀 만들기가 없는 슬롯을 찾다가 죽는다."""
    import io
    from pathlib import Path
    글 = io.open(Path(__file__).resolve().parents[2] / "dify" / "make_dsl_cardnews.py",
                encoding="utf-8").read()
    assert "recipe.슬롯이_되나(t)" in 글
    assert 'if t.get("fallback") or not (t.get("text")' not in 글, "제 잣대를 따로 쓰고 있다"
