import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np
import pytest
from PIL import Image, ImageDraw

import calibrate
import config


@pytest.fixture(scope="session", autouse=True)
def _ensure_calibration():
    """뒤쪽 도형 테스트는 calibration.json 을 읽는다. 없으면 먼저 만든다.

    이게 없으면 갓 받은 저장소에서 pytest 가 SystemExit 으로 죽는데,
    메시지가 잘려 나와 원인을 찾기 어렵다.
    """
    if not config.CAL_PATH.exists():
        calibrate.main()


def test_hangul_ink_ratio_is_near_0_91():
    r = calibrate.hangul_ink_ratio(calibrate.FONT_REGULAR, 100)
    assert 0.85 <= r <= 0.96, r


def test_bold_stroke_ratio_exceeds_regular():
    reg = calibrate.stroke_ratio(calibrate.render_mask(calibrate.FONT_REGULAR, 120))
    bold = calibrate.stroke_ratio(calibrate.render_mask(calibrate.FONT_BOLD, 120))
    assert bold > reg * 1.25, (reg, bold)


def test_radius_recovered_within_2px():
    for r in (8, 16, 24, 40, 64):
        mask = np.zeros((400, 900), bool)
        im = Image.new("L", (900, 400), 0)
        ImageDraw.Draw(im).rounded_rectangle((50, 50, 850, 350), radius=r, fill=255)
        mask = np.array(im) > 127
        got = calibrate.radius_from_mask(mask)
        assert abs(got - r) <= 2.0, (r, got)


def test_alpha_recovered_after_bias_correction():
    """생값은 알파를 늘 조금 낮게 본다. 그 편향이 일정한지를 본다.

    shape.measure 가 실제로 쓰는 값은 (생값 - alpha_bias) 이므로 그것을 검사한다.
    """
    raw = {}
    for a in (0.35, 0.6, 0.8):
        img, box = calibrate.make_alpha_sample(a)
        raw[a] = calibrate.alpha_from_edges(img, box)
    bias = sum(raw[a] - a for a in raw) / len(raw)   # calibrate.main() 이 기록하는 그 편향
    for a, got in raw.items():
        assert abs((got - bias) - a) <= 0.03, (a, got, bias)


from ruler import color, normalize


def test_contrast_black_on_white_is_21():
    assert abs(color.contrast((0, 0, 0), (255, 255, 255)) - 21.0) < 0.1


def test_bg_color_reads_the_border():
    img = np.full((1350, 1080, 3), (255, 248, 231), np.uint8)
    img[400:900, 200:800] = (26, 26, 26)  # 가운데 큰 어두운 덩어리
    assert color.hexs(color.bg_color(img)) == "#FFF8E7"


def test_accent_is_small_and_saturated():
    img = np.full((1350, 1080, 3), (255, 248, 231), np.uint8)
    img[100:160, 100:400] = (26, 26, 26)      # 글자처럼 큰 무채색
    img[1200:1240, 500:560] = (255, 90, 54)   # 작고 쨍한 강조색 한 덩어리
    rgb, blobs = color.accent(img, (255, 248, 231), [])
    assert color.hexs(rgb) == "#FF5A36"
    assert blobs == 1


def test_dominance_labels_warm_and_high_contrast():
    assert color.dominance((255, 248, 231), (26, 26, 26), (255, 90, 54)) == "따뜻"
    assert color.dominance((30, 80, 200), (255, 255, 255), (60, 140, 220)) == "차가움"
    assert color.dominance((255, 255, 255), (0, 0, 0), (40, 40, 40)) == "고대비"


def test_normalize_scales_to_1080():
    from PIL import Image as PILImage
    p = Path(__file__).parent / "_tmp.jpg"
    PILImage.new("RGB", (1440, 1920), (10, 20, 30)).save(p)
    img, scale = normalize.load(p)
    p.unlink()
    assert img.shape[1] == 1080
    assert abs(scale - 1080 / 1440) < 1e-6


def test_lines_scales_ocr_coords():
    fake = {"fullTextAnnotation": {"pages": [{"blocks": [{"paragraphs": [{"words": [
        {"symbols": [{"text": "가", "boundingBox": {"vertices": [
            {"x": 100, "y": 200}, {"x": 200, "y": 200},
            {"x": 200, "y": 300}, {"x": 100, "y": 300}]}}]}]}]}]}]}}
    from ruler import text as T
    ls = T.lines(fake, 0.5)
    assert ls[0]["box"] == [50, 100, 100, 150]
    assert abs(ls[0]["ink_h"] - 50) < 1e-6


def test_align_detects_center():
    from ruler import text as T
    ls = [{"box": [400, 100, 680, 160], "text": "가나", "ink_h": 50},
          {"box": [440, 200, 640, 260], "text": "다라", "ink_h": 50}]
    assert T._align(ls) == "가운데"
    ls2 = [{"box": [100, 100, 680, 160], "text": "가나", "ink_h": 50},
           {"box": [100, 200, 400, 260], "text": "다라", "ink_h": 50}]
    assert T._align(ls2) == "왼쪽"


def test_photo_area_ignores_flat_background():
    rng = np.random.default_rng(3)
    img = np.full((1350, 1080, 3), 240, np.uint8)          # 평평한 배경
    img[0:675, :] = np.clip(rng.normal(140, 45, (675, 1080, 3)), 0, 255).astype(np.uint8)
    from ruler import photo
    pct = photo.area_pct(img, [])
    assert 40 <= pct <= 60, pct


def test_shape_measure_recovers_radius_and_alpha():
    from ruler import shape
    img, box = calibrate.make_alpha_sample(0.6)   # radius=40, box=(140,600,940,900)
    b1000 = [round(box[0] / 1080 * 1000), round(box[1] / 1080 * 1000),
             round(box[2] / 1080 * 1000), round(box[3] / 1080 * 1000)]
    got = shape.measure(img, b1000)
    assert abs(got["radius"] - 40) <= 3, got
    assert abs(got["alpha"] - 0.6) <= 0.06, got
    assert got["shadow"]["has"] is False


def test_one_post_canvas_is_object_not_list(monkeypatch, tmp_path):
    """ruler/run.py 의 one_post 가 내놓는 canvas 는 {"w":.., "h":..} 딕셔너리여야 한다.

    한때 [w, h] 리스트로 나가 merge.py 를 그대로 통과했고, render.py 의
    d["canvas"]["h"] 에서 TypeError 가 났었다 — 합성 슬라이드 두 장으로 그 모양을 고정한다.
    """
    from ruler import run

    pid = "FAKETEST"
    img_dir = tmp_path / "images" / pid
    img_dir.mkdir(parents=True)
    (img_dir / "01.jpg").write_bytes(b"")
    (img_dir / "02.jpg").write_bytes(b"")

    monkeypatch.setattr(config, "IMAGES", tmp_path / "images")
    monkeypatch.setattr(run, "one_slide", lambda img_path, ocr_path: {
        "index": int(img_path.stem), "colors": {}, "text": {},
        "photo_area_pct": 0.0, "_h": 1350,
    })

    out = run.one_post(pid)
    assert isinstance(out["canvas"], dict), out["canvas"]
    assert set(out["canvas"]) == {"w", "h"}
    assert out["canvas"] == {"w": config.CANVAS_W, "h": 1350}


# ─── 여기부터: 실제 데이터로 처음 돌릴 때 터졌을 자리들 ───────────────────────

MEASURE_KEYS = {"levels", "align", "vpos", "margin", "digits", "emoji", "text_area_pct"}


def _blank(h=1350, w=1080):
    return np.full((h, w, 3), 255, np.uint8)


def _ink(img, box):
    """글자 대신 어두운 막대를 채워 넣는다 — _weight/_family 가 볼 게 있어야 한다."""
    x0, y0, x1, y1 = box
    img[y0:y1, x0:x1] = 240
    for x in range(x0 + 10, x1 - 10, 30):
        img[y0 + 10:y1 - 10, x:x + 12] = 20


def test_measure_returns_all_seven_keys_when_slide_has_no_text():
    """사진만 있는 장 한 장이면 recipe·export_dify·render 가 통째로 KeyError 로 죽었다.

    measures/<코드>.json 의 계약은 일곱 칸이다. 빈 장도 일곱 칸을 다 내야 한다.
    """
    from ruler import text as T
    m = T.measure(_blank(), [])
    assert set(m) == MEASURE_KEYS, sorted(m)
    assert m["levels"] == []
    assert (m["margin"], m["digits"], m["emoji"], m["text_area_pct"]) == (0, 0, 0, 0.0)
    # vpos 이름표는 _vpos 가 빈 목록에 붙이는 것과 같은 말이어야 한다
    assert m["vpos"] == T._vpos([], 1350)


def test_lines_keeps_hangul_free_line_and_marks_it_unsized():
    """`TOP 5 AI TOOLS` 같은 줄은 크기만 못 잰다. 줄 자체를 버리면 그 글자 픽셀이
    사진으로 세어지고 정렬·여백·글자 수에서도 사라진다."""
    def par(text, x0, y0, x1, y1):
        return {"words": [{"symbols": [
            {"text": ch, "boundingBox": {"vertices": [
                {"x": x0, "y": y0}, {"x": x1, "y": y0},
                {"x": x1, "y": y1}, {"x": x0, "y": y1}]}} for ch in text]}]}

    fake = {"fullTextAnnotation": {"pages": [{"blocks": [{"paragraphs": [
        par("가나", 100, 100, 300, 200),
        par("TOP5", 100, 300, 300, 380),
    ]}]}]}}
    from ruler import text as T
    ls = T.lines(fake, 1.0)
    assert [l["text"] for l in ls] == ["가나", "TOP5"], ls
    assert ls[0]["ink_h"] == 100.0
    assert ls[1]["ink_h"] is None          # 못 잰 줄 표시
    assert ls[1]["box"] == [100, 300, 300, 380]


def test_measure_counts_unsized_line_in_chars_but_not_in_pt():
    """크기를 못 잰 줄도 글자 수·수치·차지 면적에는 들어가야 한다.
    다만 pt 중앙값은 한글 잉크 높이에서만 나온다."""
    from ruler import text as T
    img = _blank()
    boxes = [[100, 100, 700, 200], [100, 240, 700, 330]]
    for b in boxes:
        _ink(img, b)
    ls = [{"text": "가나다", "box": boxes[0], "ink_h": 91.0},
          {"text": "TOP5", "box": boxes[1], "ink_h": None}]
    m = T.measure(img, ls)

    assert set(m) == MEASURE_KEYS, sorted(m)
    assert sum(lv["chars"] for lv in m["levels"]) == 7      # 3 + 4
    assert sum(lv["lines"] for lv in m["levels"]) == 2
    assert m["digits"] == 1                                 # "TOP5" 의 5
    assert m["levels"][0]["pt"] == round(91.0 / config.cal()["hangul_ink_ratio"])
    # 못 잰 줄의 박스도 글자 면적에 든다 — 안 그러면 photo.area_pct 가 그만큼 사진으로 센다
    assert m["text_area_pct"] > 5.0, m["text_area_pct"]


def _slide(role, placement, ending="해요체"):
    return {
        "index": 1, "role": role,
        "tone": {"formality": "정중", "humor": "낮음",
                 "respect": "높음", "enthusiasm": "보통"},
        "ending": ending, "person": "2인칭", "is_question": False,
        "colors": {"bg": "#FFFFFF", "text": "#111111", "accent": "#FF5A36",
                   "contrast": 18.0, "accent_blobs": 1, "dominance": "고대비"},
        "text": {"levels": [{"role": "제목", "pt": 60, "pct_h": 4.4, "weight": "Bold",
                             "family": "고딕", "lines": 2, "chars": 20, "leading": 1.4}],
                 "align": "왼쪽", "vpos": "상단", "margin": 80,
                 "digits": 1, "emoji": 0, "text_area_pct": 12.0},
        "photo": {"placement": placement, "treatment": "없음", "content": "없음",
                  "relation": "없음", "area_pct": 0.0},
        "shapes": [],
    }


def test_no_photo_majority_is_the_rule_and_both_outputs_say_the_same():
    """10장 중 8장에 사진이 없으면 그 자리의 규칙은 "사진 없음" 이다.

    `_top` 은 "없음" 을 버려서 `사진 상단 (2/10장)` 이라고 적었고, export_dify 는
    Counter 를 써서 `사진 없음 (8/10장)` 이라고 적었다 — 같은 집계에서 두 말이 나왔다.
    """
    import export_dify
    import recipe

    placements = ["없음"] * 8 + ["상단"] * 2
    docs = [{"shortcode": f"FAKE{i:02d}", "author": "a", "url": "", "slide_count": 1,
             "canvas": {"w": 1080, "h": 1350}, "post_type": "카드뉴스",
             "hook_strategy": "궁금증유발", "skeleton": ["훅"],
             "slides": [_slide("훅", p)]}
            for i, p in enumerate(placements)]
    cluster = {"name": "테스트", "pattern": ["훅"],
               "members": [d["shortcode"] for d in docs]}

    md = recipe.render(cluster, docs)
    rule = export_dify.build(cluster, docs)["slide_rule"]
    assert "사진 없음 (8/10장)" in md, md
    assert "사진 없음 (8/10장)" in rule, rule
    assert "사진 상단" not in md, md


def test_mode_keeps_없음_while_top_drops_it():
    """`_top` 은 색 hex 처럼 "없음" 이 빈칸인 축에만 쓴다."""
    from recipe import _med, _mode, _top

    vals = ["없음"] * 8 + ["상단"] * 2
    assert _top(vals) == ("상단", 2)
    assert _mode(vals) == ("없음", 8)
    # 여백 0px(글자가 화면 끝에 붙음)은 버릴 값이 아니다
    assert _med([0, 0, 0, 40]) == 0
    assert _med([None, 10, 30]) == 20


def test_출처_줄이_섞이면_본문_정렬로_잰다():
    """실물 2026-09-17, 파란 타임라인 4번 장 — 본문은 왼쪽인데 마지막
    「Ref. 유튜브 …」 한 줄이 오른쪽이라 「가운데」가 뽑혔다."""
    from ruler import text
    줄들 = [{"box": [100, 10, 700, 50], "ink_h": 30.0, "text": "첫째 줄입니다"},
          {"box": [100, 60, 900, 100], "ink_h": 30.0, "text": "둘째 줄은 더 깁니다"},
          {"box": [600, 110, 900, 140], "ink_h": 20.0, "text": "Ref. 유튜브"}]
    assert text._align(줄들) == "왼쪽"


def test_출처_줄이_없으면_예전과_같다():
    """가운데로 그은 글이 왼쪽으로 뒤집히면 옛 카드가 달라진다."""
    from ruler import text
    줄들 = [{"box": [300, 10, 700, 50], "ink_h": 30.0, "text": "가운데 정렬"},
          {"box": [350, 60, 650, 100], "ink_h": 30.0, "text": "가운데 둘"},
          {"box": [320, 110, 680, 150], "ink_h": 30.0, "text": "가운데 셋"}]
    assert text._align(줄들) == "가운데"


def test_출처_줄_하나만_있으면_안_뺀다():
    """두 줄뿐인데 하나를 빼면 잴 것이 없다."""
    from ruler import text
    줄들 = [{"box": [100, 10, 700, 50], "ink_h": 30.0, "text": "본문"},
          {"box": [600, 60, 900, 90], "ink_h": 20.0, "text": "Ref. 출처"}]
    assert text._align(줄들) in ("왼쪽", "가운데", "오른쪽")
