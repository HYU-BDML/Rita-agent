import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))   # 시험 도우미(비전읽은것)
from fetch_labels import _opens_ok, by_index, images_missing, photo_paths, ready

import numpy as np
import pytest
from PIL import Image, ImageDraw
import config
import tint as _tint
from tint import judge, axis_of, stops, dominant
from 글자읽기 import 크게오리기 as crop_scale
from 비전읽은것 import _symbols, unscale
import cutout
from cutout import tight_box, tilted, transparent
import outline

FULL = None   # mask=None 이면 그림 전체
# 재구성 오차 판정 기준(아래 _recon_error 참고). 격자가 꺾이는 자리와 어긋나면
# 정지점이 하나 더 붙을 수 있다(그 칸이 두 기울기를 섞어서다 — 진짜 오차이지
# 가짜가 아니다). 개수 대신 "이 정지점만으로 되그리면 원래 칸 색과 얼마나
# 벌어지는가"로 판정한다 — 이 값이 이 프로젝트가 실제로 재는 것이다.
# 실측: 정상 케이스는 전부 1 미만(0.68~0.94), 정지점을 하나 놓치면(BEND_DE 를
# 너무 크게 잡으면) 7.85 로 뛴다 — 2.0 은 그 사이에서 여유 있게 가른다.
RECON_TOL = 2.0

# 눈금 회귀 시험(아래)이 쓰는 실물 데이터 — 커밋된 DHqCBQnRAjW 한 건뿐이다.
#
# **`analyze/data/` 는 통째로 gitignore 다.** 그래서 새로 클론하면 이 파일이
# 없는데, 예전 판은 이걸 모듈 최상단에서 그냥 읽어서 **수집 단계에서 판이
# 통째로 멈췄다** — 실물이 필요한 시험 몇 개가 아니라 `analyze/tests` 전부가.
# 없는 것을 있다고 전제하고, 없을 때 조용히 건너뛰는 대신 전부를 세우는 것은
# 이 태스크가 여섯 번 고쳐 온 바로 그 모양이다. 있으면 읽고, 없으면 실물을
# 쓰는 시험만 `@_needs_real` 로 건너뛴다.
_REAL = config.DATA / "labels" / "DHqCBQnRAjW.json"
_HAS_REAL = _REAL.exists() and (config.IMAGES / "DHqCBQnRAjW").is_dir()
_DHQ_LABELS = json.loads(_REAL.read_text(encoding="utf-8")) if _HAS_REAL else {}
_needs_real = pytest.mark.skipif(
    not _HAS_REAL,
    reason="실물 라벨·그림(analyze/data/)이 없다 — gitignore 라 새 클론엔 안 딸려 온다")

# `test_dify.py` 의 세션 범위 autouse 픽스처가 `config.DATA` 를 임시 폴더로 돌려
# 놓는다(그 파일의 docstring 참고). 그래서 이 경로는 **모듈을 불러오는 시점**에
# 미리 잡아 둔다 — 시험 본문 안에서 `config.DATA` 를 다시 읽으면 그 픽스처가
# 이미 돌았을 수 있어 실물이 있어도 없다고 건너뛴다.
_REAL_OCR_01 = config.DATA / "ocr" / "DHqCBQnRAjW" / "01.json"
_REAL_OCR_06 = config.DATA / "ocr" / "DHqCBQnRAjW" / "06.json"
_REAL_MEASURES = config.DATA / "measures" / "DHqCBQnRAjW.json"
_REAL_IMAGES = config.IMAGES / "DHqCBQnRAjW"


def _dhq_slide(index: int):
    img = np.array(Image.open(config.IMAGES / "DHqCBQnRAjW" / f"{index:02d}.jpg").convert("RGB"))
    return img, _DHQ_LABELS[str(index)]["boxes"]


def _bg_mask(shape, boxes):
    """라벨 박스 안을 지운, 진짜 배경만 남긴 마스크."""
    mask = np.ones(shape[:2], bool)
    for b in boxes:
        x0, y0, x1, y1 = b["box"]
        mask[y0:y1, x0:x1] = False
    return mask


def _hex_rgb(h: str) -> np.ndarray:
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], float)


def _recon_error(img, mask, got: dict, small: bool = False) -> float:
    """judge() 가 돌려준 정지점만으로 되그렸을 때, 실제 칸 색과 최대 얼마나
    벌어지는지 — judge() 안이 아니라 밖에서, 반환값만 갖고 다시 잰다."""
    h, w = img.shape[:2]
    m = mask if mask is not None else np.ones((h, w), bool)
    grid_mask = m if small else _tint._erode(m, _tint.MASK_ERODE)
    rows, cols = (_tint.SMALL_ROWS, _tint.SMALL_COLS) if small else (_tint.GRID_ROWS, _tint.GRID_COLS)
    lab_cells, valid = _tint.cells(img, grid_mask, rows, cols, _tint.NEED)
    pts = _tint._curve(lab_cells, valid, got["dir"])
    st = got["stops"]
    ats = [s["at"] for s in st]
    rgbs = np.array([_hex_rgb(s["hex"]) for s in st])
    worst = 0.0
    for t, rgb in pts:
        pred = np.array([np.interp(t, ats, rgbs[:, ch]) for ch in range(3)])
        worst = max(worst, float(np.linalg.norm(rgb - pred)))
    return worst


def _solid(h, w, rgb):
    a = np.zeros((h, w, 3), np.uint8)
    a[:] = rgb
    return a


def _vgrad(h, w, top, bot):
    a = np.zeros((h, w, 3), np.uint8)
    for y in range(h):
        t = y / (h - 1)
        a[y] = [int(top[i] * (1 - t) + bot[i] * t) for i in range(3)]
    return a


def test_단색을_단색이라_한다():
    got = judge(_solid(400, 300, (240, 240, 245)), FULL)
    assert got["kind"] == "단색"
    assert got["hex"].lower() == "#f0f0f5"


def test_세로_그라데이션을_잡는다():
    got = judge(_vgrad(400, 300, (255, 255, 255), (201, 32, 47)), FULL)
    assert got["kind"] == "그라데이션"
    assert got["dir"] == "세로"
    assert len(got["stops"]) == 2
    assert got["stops"][0]["at"] == 0.0
    assert got["stops"][-1]["at"] == 1.0


def test_가로_그라데이션의_방향을_구별한다():
    a = np.transpose(_vgrad(400, 300, (255, 255, 255), (0, 0, 0)), (1, 0, 2))
    assert judge(a, FULL)["dir"] == "가로"


def test_꺾이면_정지점이_생기고_되그리면_맞는다():
    # 재검토 2차: 격자(16칸)가 꺾이는 자리(경계가 8번째 칸 언저리)와 안 맞아떨어지면
    # 그 칸이 양쪽 기울기를 섞어서, 개수를 정확히 3개로 맞히지 못할 수 있다(4개가
    # 나올 수 있다) — 그건 "그 칸의 진짜 색"이라 틀린 정지점이 아니다. 그래서
    # 개수 대신 **되그렸을 때 원래 색과 얼마나 맞는지**로 판정한다(RECON_TOL).
    top = _vgrad(200, 300, (255, 255, 255), (247, 221, 227))
    bot = _vgrad(200, 300, (247, 221, 227), (201, 32, 47))
    img = np.vstack([top, bot])
    got = judge(img, FULL)
    assert got["kind"] == "그라데이션"
    assert any(0.4 < s["at"] < 0.6 for s in got["stops"])  # 꺾이는 자리를 잡았다
    assert _recon_error(img, FULL, got) < RECON_TOL


def test_잡음이_심하면_사진이라_한다():
    rng = np.random.default_rng(0)
    a = rng.integers(0, 255, (400, 300, 3), dtype=np.uint8)
    assert judge(a, FULL)["kind"] == "사진"


def test_최빈색은_평균과_다르다():
    # 검정 8할 + 흰색 2할. 평균은 회색이지만 답은 검정이다
    a = np.zeros((100, 100, 3), np.uint8)
    a[:20] = 255
    assert dominant(a, FULL).lower() in ("#000000", "#0f0f0f")


def test_마스크_밖은_안_센다():
    a = _solid(100, 100, (255, 0, 0))
    a[:, 50:] = (0, 255, 0)
    m = np.zeros((100, 100), bool)
    m[:, :50] = True
    assert judge(a, m)["hex"].lower() == "#ff0000"


def test_장번호로_묶는다():
    rows = [{"index": 2, "canvas": {"w": 1080, "h": 1350}, "boxes": []},
            {"index": 1, "canvas": {"w": 1080, "h": 1350}, "boxes": [{"kind": "도형"}]}]
    got = by_index(rows)
    assert sorted(got) == [1, 2]
    assert len(got[1]["boxes"]) == 1


def test_확정된_것만_고른다():
    st = {"AAA": "분석 대기", "BBB": "라벨 3/7장", "CCC": "분석 끝",
          "DDD": "분석중", "EEE": "분석 대기"}
    assert ready(st) == ["AAA", "EEE"]


def test_분석중인_것은_다시_집지_않는다():
    # 다른 컴퓨터가 이미 돌리고 있을 수 있다
    assert ready({"AAA": "분석중"}) == []


def test_그림이_모자라면_다시_받는다():
    # 4장까지 받고 5장째에서 실패 -> 분석 실패 -> 분석 대기 -> 재실행 시나리오.
    # any(*.jpg) 였다면 4>0 이라 True 로 속아 나머지 3장을 영영 못 받았다.
    assert images_missing(4, 7) is True
    assert images_missing(7, 7) is False
    assert images_missing(0, 7) is True


def test_영상_장은_사진_목록에서_빠진다():
    # 1장이 영상인 뒤섞인 카로셀. slideCount(3)를 그대로 total 로 쓰면 영상 장은
    # 절대 .jpg 로 못 채워서 images_missing()이 영원히 True 로 남는다(X1).
    slides = ["/f/ABC/01.mp4", "/f/ABC/02.jpg", "/f/ABC/03.jpg"]
    assert photo_paths(slides) == ["/f/ABC/02.jpg", "/f/ABC/03.jpg"]


def test_영상_없는_카로셀은_그대로_다_남는다():
    # slide_kinds 가 없거나 안 맞으면 서버가 전부 .jpg 로 내려준다 — 예전 동작으로
    # 그대로 물러나야 안전하다(강제로 실패시키면 안 됨).
    slides = [f"/f/XYZ/0{i}.jpg" for i in range(1, 8)]
    assert photo_paths(slides) == slides


def test_잘린_그림은_안_열린다(tmp_path):
    # 진짜 jpg를 만들어서 60%만 남기고 자른다 — get()이 몇 번에 한 번 겪는다는
    # 그 실패(fetch_board.get() 문서)를 실측대로 흉내낸 것. JPEG 은 헤더(SOF)
    # 까지만 봐도 .size 가 나오므로, 스캔 데이터 중간에서 자르면 .size 검사는
    # 속지만(재현 확인됨) .load() 로 실제 디코드를 강제해야 걸린다(X3 잔여).
    import io

    from PIL import Image

    im = Image.new("RGB", (200, 200), (120, 50, 200))
    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=90)
    full = buf.getvalue()
    p = tmp_path / "broken.jpg"
    p.write_bytes(full[: int(len(full) * 0.6)])
    assert _opens_ok(p) is False


def test_멀쩡한_그림은_열린다(tmp_path):
    from PIL import Image

    p = tmp_path / "ok.jpg"
    Image.new("RGB", (10, 10), (255, 0, 0)).save(p)
    assert _opens_ok(p) is True


def test_작은_네모는_키워_보낸다():
    _, s = crop_scale([100, 100, 300, 140], 1080, 1350)
    assert s > 1


def test_큰_네모는_그대로_보낸다():
    _, s = crop_scale([0, 0, 1080, 600], 1080, 1350)
    assert s == 1


def test_여유를_주되_그림_밖으로_안_나간다():
    c, _ = crop_scale([0, 0, 100, 100], 1080, 1350, pad=8)
    assert c[0] == 0 and c[1] == 0


def test_조각_좌표를_원본으로_되돌린다():
    crop_box, scale = [100, 100, 300, 200], 2
    sym = {"vertices": [{"x": 20, "y": 10}, {"x": 60, "y": 50}]}
    assert unscale(sym, crop_box, scale) == [110, 105, 130, 125]


# ---------------------------------------------------------------- 눈금 회귀
# MASK_ERODE·FLAT_DE·MONO_TOL·BEND_DE·sRGB 정지점 계산은 브리프 기본값이 아니라
# 실물/실측으로 맞춘 값이다. 재검토 1차 때 이 블록 전체가 "세 상수를 다 박아
# 뒀다"고 주석에 적었는데, 재검토 2차의 되돌리기 검사로 거짓임이 드러났다 —
# 아래 `test_실물_배경_그라데이션_흰색에서_어둡게` 는 MASK_ERODE 를(0으로 되돌리면
# 깨진다) 박지만 FLAT_DE·MONO_TOL 은 안 박는다(각각 8.0·1.5 로 되돌려도 안 깨짐 —
# 실측 확인). `test_실물_사진_네모는_사진으로_남는다` 도 FLAT_DE 는 하나도 안
# 박는다 — 그 네모는 b 채널 자체가 4.88 만큼 되돌아가 있어(MONO_TOL=2.5 로도
# 못 넘는 진짜 비단조) FLAT_DE 를 1e9 로 올려도 여전히 사진이다(재확인:
# 재검토 2차 보고의 "48 까지 올려야 깨진다"는 서술은 잘못 뒤집혀 실렸던 것 —
# 맞는 서술은 "48 에서도 안 깨진다"였다). FLAT_DE 와 MONO_TOL 은 각각 전용
# 시험으로 따로 박는다(아래).

@_needs_real
def test_실물_배경_그라데이션_흰색에서_어둡게():
    # DHqCBQnRAjW 1번 장, 라벨 박스 바깥(진짜 배경)만 남긴 마스크.
    # analyze/layout.py 의 기존 주석("1번 장은 위 #FEFEFE 아래 #333333")과
    # 독립적으로 일치해야 한다.
    img, boxes = _dhq_slide(1)
    got = judge(img, _bg_mask(img.shape, boxes))
    assert got["kind"] == "그라데이션"
    assert got["dir"] == "세로"
    assert got["stops"][0]["hex"].upper() == "#FEFEFE"
    assert got["stops"][-1]["hex"].upper() == "#3C3C3C"


@_needs_real
def test_실물_배경_크림색은_단색이다():
    # I1: 2·4·5번 장은 같은 크림 배경인데, 라벨 박스 경계에 오염된 칸 하나 때문에
    # 예전엔 가짜 그라데이션(정지점 2개, ΔE 1대)으로 샜다.
    img, boxes = _dhq_slide(2)
    got = judge(img, _bg_mask(img.shape, boxes))
    assert got["kind"] == "단색"
    assert got["hex"].upper() == "#F1FFE5"


@_needs_real
def test_실물_사진_네모는_사진으로_남는다():
    # 일반 안전망 — 라벨이 실제로 "사진"이라고 표시한 네모가 그라데이션으로
    # 새지 않는지 확인한다. 어떤 상수 하나를 박는 시험은 아니다(b 채널이 그
    # 자체로 비단조라 FLAT_DE 는 이 시험을 절대 못 깬다 — 위 블록 머리 주석 참고).
    img, boxes = _dhq_slide(1)
    photo_box = next(b["box"] for b in boxes if b["kind"] == "사진")
    x0, y0, x1, y1 = photo_box
    mask = np.zeros(img.shape[:2], bool)
    mask[y0:y1, x0:x1] = True
    assert judge(img, mask)["kind"] == "사진"


def test_회색_3단_그라데이션은_되그리면_맞는다():
    # I2: sRGB 로 선형 보간된 실제 꺾임(240→100→20)은 LAB 문턱값으로는 못 잡는다
    # (진짜 꺾임의 LAB 휨이 가짜 꺾임 없는 그라데이션의 LAB 휨보다 오히려 작다).
    # 개수가 아니라 재구성 오차로 판정한다(위 함수와 같은 이유).
    top = _vgrad(200, 300, (240, 240, 240), (100, 100, 100))
    bot = _vgrad(200, 300, (100, 100, 100), (20, 20, 20))
    img = np.vstack([top, bot])
    got = judge(img, FULL)
    assert got["kind"] == "그라데이션"
    assert _recon_error(img, FULL, got) < RECON_TOL


@_needs_real
def test_실물_사진_크롭은_FLAT_DE_경계에서_사진이다():
    # I3/I4: 이 크롭(파란 건물 파사드)의 직교 스프레드는 3.92 — FLAT_DE=4.0 이면
    # 그라데이션으로 새고 FLAT_DE=3.0 이면 사진으로 남는, 경계에 정확히 걸린
    # 실물이다. FLAT_DE 를 4.0(1차 보고 값)이나 8.0(브리프에서 늘린 값)으로
    # 되돌리면 이 시험이 깨진다 — 실측 확인.
    img = np.array(Image.open(config.IMAGES / "DauoXg5mYjE" / "04.jpg").convert("RGB"))
    x0, y0, size = 372, 780, 452
    crop = img[y0:y0 + size, x0:x0 + size]
    assert judge(crop, FULL)["kind"] == "사진"


def test_한_칸만_되돌아가면_MONO_TOL_경계에서_그라데이션이다():
    # I4: MONO_TOL 을 전용으로 박는 시험. 거의 단조인 세로 램프에 칸 하나만
    # L 채널로 1.82 되돌아가게 만들었다 — MONO_TOL=2.5 면 봐주고(그라데이션),
    # 브리프 기본값 1.5 로 되돌리면 그 되돌아감을 못 넘겨 사진으로 떨어진다
    # (실측 확인: 이 정확한 픽셀로 MONO_TOL 을 1.5 로 바꿔 돌려 봄).
    h, w = 400, 300
    a = np.zeros((h, w, 3), np.uint8)
    for y in range(h):
        g = int(round(220 - (220 - 40) * y / (h - 1)))
        a[y] = [g, g, g]
    a[200:225] = np.clip(a[200:225].astype(int) + 16, 0, 255).astype(np.uint8)
    assert judge(a, FULL)["kind"] == "그라데이션"


@_needs_real
def test_단단한_경계는_정지점이_겹쳐도_사진이다():
    # I5: 잔차 안전장치를 뺀 뒤에도 남아 있던 구멍 — 단단한 두 면 경계가 "단조+
    # 평평"을 통과하면 정지점 찾기가 경계 양옆에 같은 색을 두 번 찍는다
    # (#A8A9AC·#A8A9AC·#010006·#010006). 그라데이션이 아니라 계단이다.
    img = np.array(Image.open(config.IMAGES / "DZkKZavgZGr" / "02.jpg").convert("RGB"))
    x0, y0, size = 302, 775, 234
    crop = img[y0:y0 + size, x0:x0 + size]
    assert judge(crop, FULL)["kind"] == "사진"


def test_평평한_구간이_있어도_그라데이션이다():
    # 재검토 3차(X1): I5 검사가 겹치는 정지점을 봤다고 바로 사진 처리하면
    # `linear-gradient(#fff 0%, #fff 50%, #333 100%)` 같은 흔한 모양(반은 평평,
    # 반은 램프)까지 죽는다 — 정지점이 [흰,흰,...,검] 으로 겹쳐 찍히기 때문이다.
    # 아래 그림의 재구성 오차를 실제로 재면 **16.81**(judge 가 쓰는 잘게 썬 격자
    # 기준, DUP_FINE=4)이다 — 스윕에서 거부되는 단단한 경계 38개(같은 자로
    # 137.42~240.79)와는 차원이 다르다.
    # 겹침은 방아쇠일 뿐, 재구성 오차로 다시 갈라야 한다.
    # ("1 미만"이라 적었던 이전 주석은 틀렸다 — 그건 굵은 격자에서 잰 1.32 였고,
    #  그나마 1 미만도 아니었다.)
    flat = np.zeros((100, 300, 3), np.uint8)
    flat[:] = (255, 255, 255)
    ramp = _vgrad(100, 300, (255, 255, 255), (51, 51, 51))
    img = np.vstack([flat, ramp])
    assert judge(img, FULL)["kind"] == "그라데이션"


def test_긴_플래토_그라데이션은_그라데이션이다():
    # 재검토 5차: `linear-gradient(#fff 0%, #fff 70%, #333 100%)`. 카드뉴스에서 흔한
    # 모양인데, 평평한 구간이 길수록 정지점이 양 끝에 몰려 잘게 썬 오차가 커진다
    # (실측 400×300: 굵은 격자 1.27 / 잘게 썬 격자 27.52. 실제 되돌려그리기는 픽셀
    #  최대 34.64·평균 1.46, Lab ΔE 최대 8.86·평균 0.33 — 눈에 띄는 오차가 아니다).
    # DUP_RECON_DE 를 이전 값 25.0 으로 되돌리면 이 배경이 `사진` 이 된다 — 배경을
    # 사진이라 부르면 되돌려 그리기가 통째로 실패하므로 그쪽이 훨씬 나쁘다.
    # **이 시험은 문턱값을 올린 방향으로 박는다**(내리면 깨진다).
    h, w, p = 400, 300, 0.7
    img = np.zeros((h, w, 3), np.uint8)
    k = int(round(h * p))
    img[:k] = 255
    n = h - k
    for i in range(n):
        t = i / max(n - 1, 1)
        img[k + i] = [int(round(255 * (1 - t) + 51 * t))] * 3
    assert judge(img, FULL)["kind"] == "그라데이션"


def test_격자에_딱_맞는_반반_계단은_사진이다():
    # 정확히 50%에서 흑백이 갈리는 두 면(카드뉴스에서 흔한 반반 배경). 굵은
    # 격자(16행)의 경계와 딱 맞아떨어져서, **정지점을 맞춘 그 격자로 채점하면
    # 재구성 오차가 0.00 이다** — 대비를 아무리 키워도 어떤 문턱값으로도 못 잡는다.
    # judge() 가 DUP_FINE(=4)배로 잘게 썬 격자에서 채점하기 때문에 잡힌다
    # (같은 그림의 오차: 굵은 격자 0.00 → 잘게 썬 격자 167.73, 픽셀 해상도로
    #  줄 평균과 비교하면 최대 211.91, Lab ΔE 최대 51.24). DUP_FINE 을 1 로 되돌리면
    # 이 시험이 깨진다. 문턱값(DUP_RECON_DE=50.0) 쪽으로는 3.35배 여유가 있다.
    img = np.zeros((400, 300, 3), np.uint8)
    img[:200] = 255
    assert judge(img, FULL)["kind"] == "사진"


def _disc(h, w, cy, cx, r):
    y, x = np.ogrid[:h, :w]
    return (y - cy) ** 2 + (x - cx) ** 2 <= r * r


def test_마스크에_딱_맞는_상자를_낸다():
    m = np.zeros((200, 200), bool)
    m[50:150, 60:140] = True
    assert tight_box(m) == [60, 50, 140, 150]


def test_빈_마스크는_None_이다():
    assert tight_box(np.zeros((10, 10), bool)) is None


def test_기울지_않은_사각형은_각도가_0_이다():
    m = np.zeros((200, 200), bool)
    m[50:150, 60:140] = True
    got = tilted(m)
    assert abs(got["angle"]) < 1
    assert abs(got["w"] - 80) < 2 and abs(got["h"] - 100) < 2


def test_45도_기운_사각형의_실제_크기를_낸다():
    # 축정렬 상자는 141x141 이지만 실제는 100x100 이다
    import cv2
    m = np.zeros((300, 300), np.uint8)
    pts = cv2.boxPoints(((150, 150), (100, 100), 45)).astype(np.int32)
    cv2.fillPoly(m, [pts], 1)
    got = tilted(m.astype(bool))
    assert abs(got["w"] - 100) < 4 and abs(got["h"] - 100) < 4
    assert 40 < abs(got["angle"]) < 50


def test_마스크_밖은_투명하다():
    img = np.full((100, 100, 3), 200, np.uint8)
    png = transparent(img, _disc(100, 100, 50, 50, 30), [20, 20, 80, 80])
    from PIL import Image
    import io
    a = np.array(Image.open(io.BytesIO(png)))
    assert a.shape[2] == 4
    assert a[0, 0, 3] == 0          # 귀퉁이는 투명
    assert a[30, 30, 3] == 255      # 한가운데는 불투명


@_needs_real
def test_테두리따기_실패는_다음_네모를_안_죽인다(monkeypatch):
    # cut_slide() 는 네모마다 실패 사유가 다를 수 있다 — `테두리따기` 가
    # 「못땄음」을 채워 돌려주는 경우, 마스크는 왔는데 비어 있는 경우(=
    # tight_box 가 못 뽑는 경우), 함수 자체가 죽는 경우. 예전(SAM 시절)엔
    # `_refine()` 만 try 로 감싸서 뒤 둘은 죽으면 그 게시물 전체가 끊겼다
    # (리뷰가 스텁으로 재현). A9 로 엔진이 SAM(`_refine`)에서 배경 흘려채우기
    # (`outline.테두리따기`)로 바뀌었으니 스텁도 그 자리를 잡아야 한다 — 셋 다
    # 같은 모양의 폴백으로 남고 나머지 네모는 계속 처리돼야 한다.
    answers = iter([
        {"마스크": None, "테두리": None, "구멍": [], "가려짐": 0.0, "못땄음": "테스트 사유"},
        {"마스크": np.zeros((1350, 1080), bool), "테두리": [], "구멍": [],
         "가려짐": 0.0, "못땄음": None},   # 빈 마스크 — tight_box 가 None 을 낸다
    ])

    def fake_테두리따기(img, box, 이웃=None):
        try:
            return next(answers)
        except StopIteration:
            raise ConnectionError("네트워크가 죽었다")

    monkeypatch.setattr(outline, "테두리따기", fake_테두리따기)
    boxes = [
        {"id": "a", "kind": "로고", "box": [10, 10, 50, 50], "cut": True},
        {"id": "b", "kind": "로고", "box": [10, 10, 50, 50], "cut": True},
        {"id": "c", "kind": "로고", "box": [10, 10, 50, 50], "cut": True},
    ]
    out = cutout.cut_slide("DHqCBQnRAjW", 1, boxes)
    assert set(out) == {"a", "b", "c"}
    for r in out.values():
        assert r["fallback"] is True
        assert r["box"] == [10, 10, 50, 50] and r["angle"] == 0.0  # 사람 네모 그대로


@_needs_real
def test_cut_slide는_1080이_아닌_원본에서_기록값에만_배율을_먹인다(monkeypatch, tmp_path):
    # P0 회귀 시험. DHqCBQnRAjW(1080폭)만 쓰면 배율이 1이라 스케일 버그를 못 잡는다
    # — 커밋된 30건 중 12건이 1080이 아니므로 실제로 s != 1 인 경우를 재현해야 한다.
    # put_png() 는 config.DATA 밑에 쓰므로, 합성 산출물이 진짜 데이터 디렉터리에
    # 안 남게 config.DATA 만 이 시험 동안 tmp_path 로 돌린다(IMAGES 등 이미 읽어둔
    # 경로는 안 바뀐다 — config.DATA 를 쓰는 곳은 put_png() 뿐이다).
    #
    # A7: 엔진이 SAM(`_refine`)에서 `outline.테두리따기` 로 바뀌었다 — 이 시험도
    # 그 엔진의 자리를 스텁한다. 사람이 그은 네모 순서(`cuts` 그대로)로 하나씩
    # 불리므로, 어떤 네모인지는 좌표를 견줄 필요 없이 순서로만 가른다.
    monkeypatch.setattr(config, "DATA", tmp_path)

    pid = "DZhFe-iGv7s"
    w = Image.open(config.IMAGES / pid / "01.jpg").width
    assert w != config.CANVAS_W
    h = Image.open(config.IMAGES / pid / "01.jpg").height

    native_box = [100, 100, 300, 400]   # 축정렬이라 tight_box 가 이 값을 그대로 낸다
    fail_box = [50, 50, 90, 90]         # 이건 outline 이 못 땄다고 스텁한다(폴백 경로)
    mask = np.zeros((h, w), bool)
    mask[native_box[1]:native_box[3], native_box[0]:native_box[2]] = True

    answers = iter([
        {"마스크": mask, "테두리": [[0, 0], [1, 0], [1, 1]], "구멍": [], "가려짐": 0.0, "못땄음": None},
        {"마스크": None, "테두리": None, "구멍": [], "가려짐": 0.0, "못땄음": "테스트 실패"},
    ])
    monkeypatch.setattr(outline, "테두리따기", lambda *a, **k: next(answers))

    out = cutout.cut_slide(pid, 1, [
        {"id": "z", "kind": "도형", "box": native_box, "cut": True},
        {"id": "y", "kind": "도형", "box": fail_box, "cut": True},
    ])

    s = config.CANVAS_W / w
    assert out["z"]["box"] == [round(v * s) for v in native_box]   # 기록값은 1080 공간
    png = (config.DATA / "cutouts" / out["z"]["png"]).read_bytes()
    im = Image.open(__import__("io").BytesIO(png))
    assert im.size == (native_box[2] - native_box[0], native_box[3] - native_box[1])  # PNG는 원본 해상도

    assert out["y"]["fallback"] is True
    assert out["y"]["box"] == [round(v * s) for v in fail_box]   # 폴백도 1080 공간


# ---------------------------------------------------------------- layout_labeled

from layout_labeled import inside, choose_font


def test_네모_안에_든_글자만_고른다():
    box = [100, 100, 400, 200]
    assert inside(box, [110, 110, 200, 140]) is True
    assert inside(box, [500, 110, 600, 140]) is False


def test_경계에_살짝_걸친_글자는_안으로_친다():
    box = [100, 100, 400, 200]
    assert inside(box, [98, 99, 200, 140]) is True
    assert inside(box, [80, 99, 200, 140], pad=4) is False


def test_글씨체는_늘_프리텐다드다():
    """**글꼴 맞히기를 껐다**(사람 지시 2026-09-24: 「글꼴 그냥 프리텐다드로 걍 픽스해」).

    맞히는 자(`fontmatch`)가 고장 나 있었다. **정답을 아는 합성 시험**(8종 × 굵기 2 ×
    크기 2 = 32가지)에서 **6/32(19%)** 만 맞혔다 — 찍기(12.5%)와 거의 같다. 게다가
    프리텐다드로 그린 것을 네 번 다 「지마켓산스」라 했고, 명조를 그려 줘도 고딕이라
    했다. 실물에서는 거꾸로 게시물 여덟이 죄다 프리텐다드 1등이었다(2026-09-24 실측).

    **고르는 후보가 서로 닮은 고딕들이라 틀려도 눈에 크게 안 틀린다.** 그래서 «비슷한
    것» 을 고르는 대신 하나로 못 박는다.

    **덤으로 글자 하나하나의 네모가 필요 없어진다** — `fontmatch` 가 그것을 쓰던
    마지막 자리였다. 줄 나누기·크기는 화소로, 글자는 값싼 모델로 갈 길이 열린다.
    """
    import layout_labeled
    assert layout_labeled._DEFAULT_FONT["고딕"] == "프리텐다드"
    # 기계가 무엇이라 하든 안 듣는다
    machine = {"pick": "검은고딕", "verdict": "검은고딕", "margin": 0.3}
    assert choose_font({}, "고딕", machine) == ("프리텐다드", "붙박이")
    assert choose_font({}, "명조", machine) == ("프리텐다드", "붙박이")
    # 계열을 못 재도 프리텐다드다 — 굽는 쪽이 이름 없는 칸을 못 그린다
    assert choose_font({}, None) == ("프리텐다드", "붙박이")
    assert choose_font({}, "고딕") == ("프리텐다드", "붙박이")

def test_block은_라벨_네모를_1080_공간으로_옮겨_글자를_찾는다():
    # X2: block() 이 받는 box 는 원본 픽셀이고, resp 의 글자 상자는 이미 1080
    # 공간이다(`글자읽기.read_slide()` 계약). box 에
    # scale 을 안 곱하면 원본이 1080이 아닌 게시물(DZhFe-iGv7s, 3263폭)에서
    # 글자를 하나도 못 찾는다 — 네모가 훨씬 큰 좌표계에 남아 있기 때문이다.
    import layout_labeled
    from ruler import normalize as _normalize

    pid = "DZhFe-iGv7s"
    w = Image.open(config.IMAGES / pid / "01.jpg").width
    assert w != config.CANVAS_W

    img, scale = _normalize.load(config.IMAGES / pid / "01.jpg")
    native_box = [1150, 200, 1380, 260]
    scaled_box = [round(v * scale) for v in native_box]
    sym_box = [scaled_box[0] + 5, scaled_box[1] + 2, scaled_box[0] + 20, scaled_box[3] - 2]
    resp = {"symbols": [{"text": "가", "box": sym_box, "break": ""}]}

    cal = config.cal()
    out = layout_labeled.block(img, resp, native_box, scale, cal)
    assert out["text"] == "가"


@_needs_real
def test_slide_text는_라벨에_남은_옛_font_effects를_안_옮긴다():
    """묘비(2026-09-19). 둘 다 화면에서 뺀 칸이라 옛 라벨의 값은 답이 아니다."""
    import layout_labeled

    boxes = [{"id": "t1", "kind": "글자", "box": [50, 50, 300, 100],
              "font": "지마켓산스", "effects": ["외곽선", "그림자"]}]
    out = layout_labeled.slide_text("DHqCBQnRAjW", 2, boxes, {})
    got = out[0]
    assert got["font"] != "지마켓산스"
    assert got["effects"] == []


def test_OCR이_실패한_네모는_배경을_재지_않는다():
    # M6: resp["error"] 가 있으면(OCR 자체가 실패) 배경 픽셀로 굵기·글씨체를
    # 추측하지 않는다 — cutout.py::cut_slide() 의 fallback 관례와 같은 모양으로
    # 남긴다.
    import layout_labeled

    img = np.zeros((200, 400, 3), np.uint8)
    resp = {"symbols": [], "error": "테스트 실패"}
    out = layout_labeled.block(img, resp, [10, 10, 200, 60], 1.0, config.cal())
    fm = out.pop("font_match")
    ea = out.pop("effects_auto")
    assert out == {
        "text": "", "pt": None, "weight": None, "family": None, "color": None,
        "align": "없음", "leading": 0.0, "lines": 0, "line_detail": [],
        "fallback": True, "why": "테스트 실패",
    }
    # 글씨체도 효과도 같은 관례로 남긴다 — 「못 잼」이지 「없다」가 아니다.
    assert fm["pick"] is None and "테스트 실패" in fm["why"], fm
    assert ea["fallback"] is True and "테스트 실패" in ea["why"], ea
    assert layout_labeled.choose_effects({}, ea) == ([], "모름")


def test_두_줄짜리_볼드_네모는_전체로_재면_Regular로_속는다():
    # C1: stroke_ratio() 는 획두께÷잉크높이라, 네모 전체(여러 줄)로 한 번에 재면
    # 분모가 줄 수만큼 불어나 진짜 Bold 도 문턱값 아래로 떨어진다. 줄마다 재서
    # 다수결해야 한다.
    import calibrate
    from PIL import Image as PILImage, ImageDraw, ImageFont
    import layout_labeled

    px = 48
    font = ImageFont.truetype(calibrate.FONT_BOLD, px)
    leading = int(px * 1.6)
    im = PILImage.new("RGB", (700, leading * 2 + 40), (255, 255, 255))
    d = ImageDraw.Draw(im)
    syms = []
    for i, y in enumerate((20, 20 + leading)):
        text = "가나다라마바사"
        x = 20
        for ch in text:
            bbox = d.textbbox((x, y), ch, font=font)
            d.text((x, y), ch, font=font, fill=(0, 0, 0))
            syms.append({"text": ch, "box": list(bbox), "break": ""})
            x = bbox[2]
    img = np.array(im)
    box = [0, 0, img.shape[1], img.shape[0]]
    out = layout_labeled.block(img, {"symbols": syms}, box, 1.0, config.cal())
    assert out["lines"] == 2
    assert out["weight"] == "Bold"


# ---------------------------------------------------------------- tone_labeled

from tone_labeled import ending_of, formality_of, person_of, question_title


def test_어미를_가른다():
    assert ending_of("이렇게 하면 됩니다") == "합니다체"
    assert ending_of("이렇게 하면 돼요") == "해요체"
    assert ending_of("이렇게 하면 된다") == "반말"
    assert ending_of("요즘 뜨는 브랜드 7") == "명사형"
    assert ending_of("") == "없음"


def test_한_덩어리에_여러_어미가_섞이면_마지막_문장을_따른다():
    assert ending_of("좋아요. 그런데 이건 아니다") == "반말"


def test_격식은_어미와_문장부호로_갈린다():
    assert formality_of("자세한 내용은 아래를 참고하시기 바랍니다.") == "격식"
    assert formality_of("이거 진짜 대박이야~~ ㅋㅋ") == "편안"
    assert formality_of("요즘 이 브랜드가 잘 나가요") == "중간"


def test_인칭은_낱말을_센다():
    assert person_of("여러분도 한번 해보세요") == "여러분"
    assert person_of("우리가 놓치고 있던 것") == "우리"
    assert person_of("너도 이거 알아야 해") == "너"
    assert person_of("2026년 마케팅 트렌드") == "생략"


def test_물음표_제목을_알아본다():
    assert question_title("왜 이 브랜드만 잘 될까?") is True
    assert question_title("이 브랜드가 잘 되는 이유") is False


def test_너무는_너로_안_걸린다():
    # "너무"는 "너"+조사가 아니다 — 낱말 전체가 조사 목록과 안 맞으면 걸리지 않아야 한다.
    assert person_of("너무 좋아요 이 브랜드") == "생략"


def test_아니다는_반말이지_합니다체가_아니다():
    # "니다"로 끝난다고 다 합니다체가 아니다 — "니" 앞 글자가 ㅂ받침이어야 한다.
    # "아니다"의 "니" 앞은 받침 없는 "아"다.
    assert ending_of("이건 사실이 아니다") == "반말"


def test_물음표와_이모지_꼬리에_어미가_안_새나간다():
    # I4: _last_clause() 가 문장부호로 문장을 가르면서 그 물음표 자체를
    # 지워버린다 — "될까?" 의 "?" 가 사라진 채로 어미를 보게 되는데, 그 자리를
    # 못 채우면 물음꼴 문장이 전부 "명사형"으로 샌다. 물음표 제목이 흔한 만큼
    # (물음표 제목이 따로 축인 이유) 자주 걸리는 함정이다.
    assert ending_of("이 브랜드는 왜 잘 될까?") == "반말"
    assert formality_of("이 브랜드는 왜 잘 될까?") == "편안"
    assert ending_of("어떻게 하시겠습니까?") == "합니다체"
    assert formality_of("어떻게 하시겠습니까?") == "격식"
    assert ending_of("오늘도 화이팅이에요 🔥") == "해요체"
    assert ending_of("이거 진짜 대박이야~~ ㅋㅋ") == "반말"


def test_여러분이_께_들도_인칭으로_잡힌다():
    # I5: "여러분"은 받침 있는 낱말이라 주격조사가 "이"다("가"가 아니다) —
    # 스펙의 인칭 예시 자체가 「여러분」이라 이 형태를 놓치면 흔한 문장을 잃는다.
    assert person_of("여러분이 원하는 브랜드") == "여러분"
    assert person_of("여러분께 드리는 팁") == "여러분"
    assert person_of("여러분들 주목") == "여러분"


import 대본짓기  # noqa: E402


def test_ask는_모델이_터지면_미정으로_넘어간다(monkeypatch):
    # M7: 브리프의 명시적 계약 — 이 갈래만 미정이고 나머지 계량은 다 나온다.
    import tone_labeled

    monkeypatch.setattr(대본짓기, "부르기", _가짜모델(RuntimeError("못 닿는다")))
    out = tone_labeled.ask("pid", ["1번 장", "2번 장", "3번 장"])
    assert out["post_type"] == "미정"
    assert out["hook_strategy"] == "미정"
    assert [s["index"] for s in out["slides"]] == [1, 2, 3]
    assert all(s["role"] == "미정" for s in out["slides"])


def _가짜모델(낼것):
    """`대본짓기.부르기` 를 대신한다. 예외를 주면 그걸 던진다.

    **딥시크가 아니라 Bedrock 이다**(2026-08-27 옮김) — 대본을 쓰는 것과 같은
    모델을 쓴다. 열쇠가 하나 줄고, 재시도·마감 규칙을 `대본짓기` 것으로 함께
    쓴다.
    """
    def 부르기(시스템, 사용자, **_):
        if isinstance(낼것, Exception):
            raise 낼것
        return 낼것
    return 부르기


def test_ask는_장_수가_안_맞아도_온_만큼은_살린다(monkeypatch):
    # I3: response_format=json_object 는 문법만 보장하지, 모양은 안 보장한다.
    # **길이는 반드시 보낸 장 수와 같아야 한다** — 안 그러면 뒤(Task 7)가
    # KeyError 로 죽는다. 그 계약은 그대로다.
    #
    # 달라진 것은 «다 버리느냐» 다. 예전엔 하나만 어긋나도 전부 미정으로
    # 되돌렸는데, 그러면 틀의 골격이 통째로 미정이 되어 그 틀로는 카드를 한
    # 장도 못 만든다(실물 2026-08-27, 키키 8장). 온 만큼은 쓸모가 있다.
    import tone_labeled

    monkeypatch.setattr(대본짓기, "부르기", _가짜모델(
        '{"post_type": "카드뉴스", "hook_strategy": "궁금증유발", '
        '"slides": [{"index": 1, "role": "훅", "humor": "낮음", '
        '"respect": "중간", "enthusiasm": "높음"}]}'))
    out = tone_labeled.ask("pid", ["1번 장", "2번 장", "3번 장"])
    assert len(out["slides"]) == 3, "길이 계약은 그대로다"
    assert out["slides"][0]["role"] == "훅", "온 것은 살아야 한다"
    assert [s["role"] for s in out["slides"][1:]] == ["미정", "미정"]

def test_ask는_dict가_아닌_응답도_미정으로_되돌린다(monkeypatch):
    # I3: "[1,2,3]" 처럼 문법은 맞지만 dict 조차 아닌 응답 — d["slides"] 에서
    # TypeError 로 걸려야 한다.
    import tone_labeled

    monkeypatch.setattr(대본짓기, "부르기", _가짜모델("[1, 2, 3]"))
    out = tone_labeled.ask("pid", ["1번 장", "2번 장"])
    assert out["post_type"] == "미정"
    assert len(out["slides"]) == 2


# ---------------------------------------------------------------- merge_labeled

import merge_labeled
from merge_labeled import accent, background, build, load_labels, merge_one, residual

# test_dify.py 의 세션 픽스처(_pipeline_data)가 `config.DATA` 를 임시 폴더로
# 돌려놓은 채로 이 파일의 시험들이 돈다 — 전체 스위트에서는 test_dify 가 먼저
# 돌기 때문이다. 수집(import) 시점에는 아직 진짜 값이라 여기서 붙잡아 둔다.
_REAL_DATA = config.DATA


def test_네모를_빼고_남긴다():
    img = np.zeros((100, 100, 3), np.uint8)
    got = residual(img, [{"box": [10, 10, 40, 40], "rle": None}])
    assert got[20, 20] == False
    assert got[80, 80] == True


def test_마스크가_있으면_마스크만_뺀다():
    # 네모로 빼면 도형 주변 배경까지 날아간다
    img = np.zeros((100, 100, 3), np.uint8)
    m = np.zeros((100, 100), bool)
    m[20:30, 20:30] = True
    got = residual(img, [{"box": [10, 10, 40, 40], "mask": m}])
    assert got[25, 25] == False
    assert got[15, 15] == True     # 네모 안이지만 마스크 밖 -> 배경이다


def test_설명이_없는_네모도_버리지_않는다():
    got = merge_one({"id": "b1", "kind": "사진", "box": [0, 0, 10, 10]}, {}, {}, {})
    assert got["id"] == "b1"
    assert got.get("note") in (None, "")


def test_설명은_그대로_실려_온다():
    got = merge_one({"id": "b2", "kind": "인물", "box": [0, 0, 10, 10],
                     "note": "정장 입은 남자"}, {}, {}, {})
    assert got["note"] == "정장 입은 남자"


def test_마스크_크기가_다르면_어긋난_크기를_말하고_죽는다():
    # numpy 도 브로드캐스트 오류로 죽기는 한다 — 다만 무엇이 어긋났는지는 안
    # 알려준다. 원본 해상도 마스크를 1080 그림에 댄 것이 원인이므로 두 크기를
    # 같이 찍는다(이 문구가 없으면 이 시험이 numpy 오류로 그냥 통과한다).
    img = np.zeros((100, 100, 3), np.uint8)
    m = np.zeros((50, 50), bool)
    with pytest.raises(ValueError, match="마스크 크기"):
        residual(img, [{"box": [0, 0, 10, 10], "mask": m}])


def test_배경은_1080_공간이_아니면_죽는다():
    img = np.zeros((100, 100, 3), np.uint8)
    with pytest.raises(ValueError):
        background(img, [])


@_needs_real
def test_문자열_장번호를_정수로_읽는다(monkeypatch):
    monkeypatch.setattr(config, "DATA", _REAL_DATA)
    got = load_labels("DHqCBQnRAjW")
    assert sorted(got) == [1, 2, 3, 4, 5, 6, 7]
    assert got[1]["boxes"][0]["id"].startswith("b")


def _rgb(hex_str: str):
    return int(hex_str[1:3], 16), int(hex_str[3:5], 16), int(hex_str[5:7], 16)


def test_강조색은_배경과_먼_작고_진한_색이다():
    # 넓은 판은 **채도가 높아도** 강조가 아니다 — 면적 관문이 그것만 막는다.
    # (예전 시험은 회색 판을 뒀는데 회색은 채도 관문에서 먼저 떨어져서
    #  면적 관문이 한 번도 안 불렸다.)
    img = np.full((1350, 1080, 3), 245, np.uint8)      # 거의 흰 배경
    img[100:200, 100:200] = (220, 30, 40)              # 작은 빨강 칩(0.7%)
    img[600:1300, 60:1020] = (40, 180, 90)             # 넓은 초록 판(46%)
    regions = [{"kind": "도형", "box": [100, 100, 200, 200]},
               {"kind": "도형", "box": [60, 600, 1020, 1300]}]
    got = accent(img, regions, {"kind": "단색", "hex": "#F5F5F5"})
    assert got["hex"] is not None
    r, g, b = _rgb(got["hex"])
    assert r > 150 and g < 90 and b < 90, got


def test_강조색은_채도가_낮으면_안_고른다():
    # 배경에서 멀지만(ΔE 크다) 흐린 색 — 강조색은 "진한 색"이라야 한다.
    img = np.full((1350, 1080, 3), 245, np.uint8)
    img[100:300, 100:300] = (200, 160, 160)   # 채도 (200-160)/255 = 0.157
    regions = [{"kind": "도형", "box": [100, 100, 300, 300]}]
    got = accent(img, regions, {"kind": "단색", "hex": "#F5F5F5"})
    assert got["hex"] is None and got["pixels"] == 0, got


def test_강조색은_사진_인물_화소를_안_본다():
    # 사진 안의 빨강은 디자이너가 고른 색이 아니라 찍힌 색이다.
    img = np.full((1350, 1080, 3), 245, np.uint8)
    img[100:300, 100:300] = (220, 30, 40)
    regions = [{"kind": "사진", "box": [100, 100, 300, 300]}]
    got = accent(img, regions, {"kind": "단색", "hex": "#F5F5F5"})
    assert got["hex"] is None and got["pixels"] == 0, got


def test_강조색은_네모_대표색이_아니라_화소에서_찾는다():
    # 실물 회귀(DHqCBQnRAjW 2~7번 장 형광펜). 글자 네모의 최빈색은 **배경**이라
    # 네모를 dominant 하나로 줄이는 방법으로는 이 색이 후보에 오르지도 못한다.
    img = np.full((1350, 1080, 3), 0, np.uint8)
    img[:, :] = (241, 255, 229)                 # 크림 배경
    img[300:900, 60:1020] = (241, 255, 229)     # 글자 네모 — 대부분이 배경색
    img[500:560, 100:500] = (168, 248, 88)      # 그 안의 형광펜 밑칠(연두)
    regions = [{"kind": "글자", "box": [60, 300, 1020, 900]}]
    got = accent(img, regions, {"kind": "단색", "hex": "#F1FFE5"})
    r, g, b = _rgb(got["hex"] or "#000000")
    assert g > 200 and b < 150 and r < 220, got
    assert got["pixels"] == 60 * 400, got


def test_거의_검정_글자를_강조색으로_집지_않는다():
    # HSV 의 S(=(max-min)/max)로 재면 거의 검정에서 채널이 1만 달라도 S 가 0.75 로
    # 튄다 — 실측에서 DHqCBQnRAjW 4·5·6번 장이 본문 검정 `#010401` 을 강조색으로
    # 집었다. 채도를 `(max-min)/255` 로 재면 그 구간이 통째로 사라진다.
    img = np.full((1350, 1080, 3), 0, np.uint8)
    img[:, :] = (241, 255, 229)
    img[300:600, 100:400] = (1, 4, 1)      # 면적 6.2% — 면적 관문에는 안 걸린다
    got = accent(img, [], {"kind": "단색", "hex": "#F1FFE5"})
    assert got["hex"] is None, got


def test_게시물_강조색은_장들의_최빈_구간이다():
    # 장마다 한 끗 다른 hex 가 나온다(실물: #C9FC95 · #C9FC94). 문자열로 세면
    # 같은 색이 갈라지므로 `tint.BINS` 구간으로 묶어 센다.
    a = merge_labeled.accent(_chip(168, 248, 88), [], {"kind": "단색", "hex": "#FFFFFF"})
    b = merge_labeled.accent(_chip(169, 249, 89), [], {"kind": "단색", "hex": "#FFFFFF"})
    c = merge_labeled.accent(_chip(220, 30, 40), [], {"kind": "단색", "hex": "#FFFFFF"})
    got = merge_labeled.post_accent([a, b, c])
    assert got["slides"] == 2, got
    assert _rgb(got["hex"])[1] > 200, got


def test_게시물_강조색은_화소가_많은_색이_아니라_여러_장에_나온_색이다():
    # 동점 처리는 (장 수, 화소 수) 순이다 — 브랜드색은 「한 장에서 크게」가 아니라
    # 「여러 장에 되풀이해」 나온다. (화소, 장)으로 뒤집으면 아래 빨강이 이긴다.
    small_twice = {"hex": "#C9FC95", "pixels": 10, "key": 1}
    big_once = {"hex": "#DC1E28", "pixels": 10_000, "key": 2}
    got = merge_labeled.post_accent([small_twice, dict(small_twice), big_once])
    assert got["hex"] == "#C9FC95" and got["slides"] == 2, got
    assert got["pixels"] == 20, got


def test_강조색을_못_고르면_없다가_아니라_못_골랐다고_적는다():
    got = merge_labeled.post_accent([{"hex": None, "pixels": 0, "key": None}])
    assert got["hex"] is None and got["fallback"] is True
    assert "채도" in got["why"] and "ΔE" in got["why"], got


def _chip(r, g, b):
    img = np.full((1350, 1080, 3), 255, np.uint8)
    img[100:300, 100:300] = (r, g, b)
    return img


def test_강조색이_없으면_None():
    img = np.full((1350, 1080, 3), 245, np.uint8)
    img[600:1300, 60:1020] = (240, 240, 240)
    regions = [{"kind": "도형", "box": [60, 600, 1020, 1300]}]
    assert accent(img, regions, {"kind": "단색", "hex": "#F5F5F5"})["hex"] is None


def test_후보가_다_판이라_못_고른_것은_통과_화소_수로_남는다():
    # docstring 이 약속한 구분이다 — 「통과한 화소가 0개라 못 골랐다」와 「후보가
    # 다 판(면적 관문)이라 못 골랐다」는 계량표에서 갈려야 한다. 앞쪽은 pixels 0,
    # 뒤쪽은 통과 화소 수. `pixels: passed` 를 0 으로 바꾸면 두 갈래가 같아진다.
    img = np.full((1350, 1080, 3), 245, np.uint8)
    img[200:1100, 90:990] = (40, 180, 90)      # 810,000px = 카드의 55.6% > 25%
    got = accent(img, [], {"kind": "단색", "hex": "#F5F5F5"})
    assert got["hex"] is None, got
    assert got["pixels"] == 900 * 900, got


def test_그라데이션_배경은_정지점_전부가_강조색_거리의_기준이다():
    # 실물 1번 장 배경이 그라데이션이다. `_bg_hexes` 가 `stops` 를 안 읽으면 빈
    # 목록이 되고, 그러면 ΔE 관문이 조용히 **통째로 꺼진다** — 배경 정지점과
    # 똑같은 색이 강조색으로 올라온다.
    bg = {"kind": "그라데이션", "dir": "세로",
          "stops": [{"hex": "#DC1E28"}, {"hex": "#F5F5F5"}]}
    assert merge_labeled._bg_hexes(bg) == ["#DC1E28", "#F5F5F5"], bg
    img = np.full((1350, 1080, 3), 245, np.uint8)
    img[100:250, 100:250] = (220, 30, 40)      # 정지점과 같은 빨강, 카드의 1.5%
    got = accent(img, [], bg)
    assert got["hex"] is None and got["pixels"] == 0, got


def test_배경과_같은_색은_강조색이_아니다():
    # 빨간 배경 위의 **살짝 다른** 빨강 칩(ΔE 7.0 < 문턱 10.0). 채도로는 뽑히고
    # 면적으로도 안 걸리니(1.5%) 여기서 거르는 것은 배경 거리 관문뿐이다.
    # (배경 자체는 카드의 98%라 면적 관문에 걸린다.)
    img = np.full((1350, 1080, 3), 0, np.uint8)
    img[:, :] = (220, 30, 40)
    img[100:250, 100:250] = (235, 50, 60)
    regions = [{"kind": "도형", "box": [100, 100, 250, 250]}]
    assert accent(img, regions, {"kind": "단색", "hex": "#DC1E28"})["hex"] is None


def test_배경이_사진이면_ΔE_관문을_안_잰_것을_계량표에_남긴다():
    # 윗 시험과 **같은 카드**다 — 다른 것은 배경 판정뿐이다. 배경이 「사진」이면
    # `bg` 에 `hex` 도 `stops` 도 없어 `_bg_hexes` 가 빈 목록을 내고, 배경거리
    # 관문이 통째로 안 돈다(비교할 배경색이 없으니 그 자체는 옳다). 그래서 윗
    # 시험에서 걸러지던 칩이 여기서는 **강조색으로 올라온다** — 그런데 그 값은
    # 관문 셋을 다 통과한 값과 똑같이 생긴다. 무엇을 재고 무엇을 안 쟀는지가
    # 계량표에 남아야 한다(`_mark` 의 `fallback`·`why` 와 같은 관례).
    img = np.full((1350, 1080, 3), 0, np.uint8)
    img[:, :] = (220, 30, 40)
    img[100:250, 100:250] = (235, 50, 60)
    regions = [{"kind": "도형", "box": [100, 100, 250, 250]}]
    solid = accent(img, regions, {"kind": "단색", "hex": "#DC1E28"})
    photo = accent(img, regions, {"kind": "사진"})
    assert solid["hex"] is None and solid["bg_de"] is True, solid
    assert photo["hex"] and photo["bg_de"] is False, photo
    assert merge_labeled.post_accent([solid, solid])["bg_de_skipped"] == 0
    got = merge_labeled.post_accent([photo, solid])
    assert got["hex"] == photo["hex"], got
    assert got["bg_de_skipped"] == 1, got


def test_도형_색은_위에_얹힌_글자_네모를_빼고_잰다():
    # 글자그릇이면 네모 안 대부분이 글자판이라, 안 빼면 대표색이 글자색으로 뒤집힌다.
    img = np.full((1350, 1080, 3), 250, np.uint8)
    img[100:700, 100:700] = (30, 60, 200)      # 파란 도형(600줄)
    img[100:500, 100:700] = (255, 255, 255)    # 그 위 흰 글자판(400줄 = 도형의 3분의 2)
    shape = {"kind": "도형", "box": [100, 100, 700, 700]}
    got = merge_labeled._color_of(img, shape, [[100, 100, 700, 500]])
    assert got["kind"] == "단색", got
    r, g, b = _rgb(got["hex"])
    assert b > 150 and r < 90, got["hex"]


def test_못_잰_색은_단색이라_안_적는다():
    # 로고처럼 작은 네모는 유효 격자가 4칸 미만이라 tint 가 판정을 포기하고
    # 최빈색을 「단색」이라 돌려준다 — 계량표는 그것을 잰 값처럼 적으면 안 된다.
    # (실물 DHqCBQnRAjW 의 「단색」 6개가 전부 이 갈래였다.)
    img = np.full((1350, 1080, 3), 254, np.uint8)
    img[52:115, 46:231] = (168, 248, 88)
    got = merge_labeled._color_of(img, {"kind": "로고", "box": [46, 52, 231, 115]}, [])
    assert got["kind"] == "미측정" and got["fallback"] is True, got
    assert got["cells"] < 4, got
    assert got["hex"], got          # 값은 참고용으로 남긴다 — 지우지 않는다


def test_잰_색에도_근거_칸_수가_같이_실린다():
    img = np.full((1350, 1080, 3), 250, np.uint8)
    img[100:700, 100:700] = (30, 60, 200)
    got = merge_labeled._color_of(img, {"kind": "도형", "box": [100, 100, 700, 700]}, [])
    assert got["kind"] == "단색" and got["cells"] >= 4, got
    assert "fallback" not in got, got


def test_글자를_빼도_도형은_가장_넓은_색으로_잰다():
    """**뒤집힌 약속이다**(2026-08-30). 예전엔 여기서 「미측정」을 냈다.

    사람이 네모 하나를 긋고 「안에 글자 있다」를 켜면 도형과 글자가 같은 자리가
    되는데, 그러면 빼고 나서 잴 화소가 0 이 된다. 미측정으로 두면 굽는 쪽이 그
    도형을 통째로 건너뛴다 — 실물에서 민트색 제목 띠 다섯 개가 그렇게 사라졌다.
    """
    img = np.full((1350, 1080, 3), 250, np.uint8)
    got = merge_labeled._color_of(img, {"kind": "도형", "box": [100, 100, 400, 400]},
                                  [[100, 100, 400, 400]])
    assert got["kind"] == "으뜸색" and got["hex"], got
    assert "가장 넓은 색" in got["why"], got


def test_도형이_아니어도_모양은_지킨다():
    """네모가 아예 없으면 그때는 미측정이다 — 성공과 같은 모양으로 남긴다."""
    img = np.full((1350, 1080, 3), 250, np.uint8)
    got = merge_labeled._color_of(img, {"kind": "도형", "box": [0, 0, 0, 0]},
                                  [[0, 0, 1080, 1350]])
    assert got["kind"] == "미측정" and got["fallback"] is True and got["cells"] == 0, got


def test_작은_네모도_16x12_격자로_잰다():
    # 4×4 격자(`tint.judge(small=True)`)는 그림 전체를 337×270px 칸으로 나눈다 —
    # 작은 네모일수록 한 칸을 채우기가 **더** 어렵다. 이 119×400 네모는
    # 16×12 로 10칸이 나오고 4×4 로는 1칸이라, 스위치를 되살리면 「미측정」이 된다.
    img = np.full((1350, 1080, 3), 245, np.uint8)
    img[10:410, 10:129] = (30, 60, 200)
    got = merge_labeled._color_of(img, {"kind": "도형", "box": [10, 10, 129, 410]}, [])
    assert got["cells"] >= 4 and got["kind"] == "단색", got


def test_배경도_못_쟀으면_단색이라_안_적는다():
    # `_color_of` 만이 아니라 `background()` 도 `_mark` 를 거쳐야 한다 — 옛 갈래의
    # 병(배경 `#FEFEFE`)이 실제로 살던 자리가 바로 여기다. 라벨 네모가 카드를 거의
    # 다 덮으면 잔여의 유효 칸이 문턱 아래로 떨어지는데, tint 는 그래도 최빈색을
    # 「단색」이라 돌려준다. 여기 잔여는 100×100 모서리 하나뿐이라 유효 칸이 1칸이다.
    img = np.full((1350, 1080, 3), 250, np.uint8)
    img[0:100, 0:100] = (168, 248, 88)
    regions = [{"box": [100, 0, 1080, 1350]}, {"box": [0, 100, 1080, 1350]}]
    got = background(img, regions)
    assert got["kind"] == "미측정" and got["fallback"] is True, got
    assert got["cells"] == 1, got
    assert got["hex"], got          # 값은 참고용으로 남긴다 — 지우지 않는다


def test_글자_네모는_사람_상자가_아니라_테두리가_조인_상자로_빠진다():
    # 누끼는 종류를 안 가린다 — `cutout.cut_slide()` 가 `cut` 만 보고, 웹도 누끼
    # 체크상자를 모든 종류에 띄운다. 그래서 글자 네모에 누끼가 켜진 입력이 도달
    # 가능하고, 그때 `_build` 는 마스크가 아니라 `r["box"]` 를 직접 읽어 다른
    # 네모에서 뺀다. 사람이 헐겁게 그은 상자를 그대로 쓰면 밑의 도형이 통째로
    # 지워져 「미측정」이 된다 — `_regions` 가 테두리에서 조인 상자로 좁혀야 살아남는다.
    img = np.full((1350, 1080, 3), 250, np.uint8)
    img[100:700, 100:700] = (30, 60, 200)      # 파란 도형
    테두리 = [[200, 300], [600, 300], [600, 500], [200, 500]]   # 실제로 딴 글자 덩어리
    boxes = [{"id": "shape", "kind": "도형", "box": [100, 100, 700, 700]},
             {"id": "text", "kind": "글자", "box": [100, 100, 700, 700], "cut": True}]
    cuts = {"text": {"box": [200, 300, 600, 500], "w": 400.0, "h": 200.0,
                     "angle": 0.0, "테두리": 테두리, "구멍": [], "png": "k"}}
    regs = merge_labeled._regions(boxes, cuts, 1.0, img.shape[:2])
    text_boxes = [r["box"] for r, b in zip(regs, boxes) if b.get("kind") == "글자"]
    assert text_boxes == [[200, 300, 600, 500]], text_boxes
    got = merge_labeled._color_of(img, regs[0], text_boxes)
    assert got["kind"] == "단색" and got["cells"] == 40, got
    assert got["hex"] == "#1E3CC8", got


@_needs_real
def test_실물_배경은_잔여로_재도_크림색_단색이다():
    # 라벨 네모를 다 뺀 잔여로 재는 것이 이 태스크의 판정 방식이다.
    img, boxes = _dhq_slide(2)
    got = background(img, [{"box": b["box"]} for b in boxes])
    assert got["kind"] == "단색", got


def _fake_pipeline(monkeypatch, note="", cut_ok=False):
    """망을 타는 세 곳(Vision·SAM·딥시크)을 다 가짜로 바꾼다."""
    monkeypatch.setattr(merge_labeled.글자읽기, "read_slide",
                        lambda pid, index, boxes: {})
    monkeypatch.setattr(merge_labeled.cutout, "cut_slide",
                        lambda pid, index, boxes: {})
    monkeypatch.setattr(merge_labeled.tone_labeled, "ask",
                        lambda pid, texts: merge_labeled.tone_labeled._fallback(len(texts)))
    monkeypatch.setattr(config, "DATA", _REAL_DATA)


@_needs_real
def test_build는_망을_안_타고도_장을_다_낸다(monkeypatch, tmp_path):
    _fake_pipeline(monkeypatch)
    monkeypatch.setattr(config, "MEASURES", tmp_path)
    got = build("DHqCBQnRAjW")
    assert [s["index"] for s in got["slides"]] == [1, 2, 3, 4, 5, 6, 7]
    assert got["canvas"] == {"w": 1080, "h": 1350}
    assert (tmp_path / "DHqCBQnRAjW.json").exists()
    # 라벨의 설명이 **글자 하나 안 바뀌고** 실려 있다. 예전 단언은
    # `any("밈" in n or "설" in n for n in notes)` 였는데, 이 라벨에서 설명이
    # 달린 네모가 하나뿐이라 그 단언이 맞출 수 있는 문자열은 그 하나(OpenAI
    # 거절문)밖에 없었다 — 결함에 못 박힌 단언이었다. id 별로 원문과 맞춘다.
    want = {b["id"]: b["note"] for s in _DHQ_LABELS.values()
            for b in s["boxes"] if b.get("note")}
    assert want, "라벨에 설명이 하나도 없다"
    assert {r["id"]: r["note"] for s in got["slides"] for r in s["regions"]
            if r["note"]} == want


@_needs_real
def test_build는_옛_계량표를_old로_한_번만_옮긴다(monkeypatch, tmp_path):
    _fake_pipeline(monkeypatch)
    monkeypatch.setattr(config, "MEASURES", tmp_path)
    (tmp_path / "DHqCBQnRAjW.json").write_text('{"옛":"갈래"}', encoding="utf-8")
    build("DHqCBQnRAjW")
    old = json.loads((tmp_path / "DHqCBQnRAjW.old.json").read_text(encoding="utf-8"))
    assert old == {"옛": "갈래"}
    build("DHqCBQnRAjW")   # 두 번째 판이 비교용 옛 파일을 덮어쓰면 안 된다
    old2 = json.loads((tmp_path / "DHqCBQnRAjW.old.json").read_text(encoding="utf-8"))
    assert old2 == {"옛": "갈래"}


@_needs_real
def test_build는_publish가_꺼져_있으면_상태를_안_바꾼다(monkeypatch, tmp_path):
    _fake_pipeline(monkeypatch)
    monkeypatch.setattr(config, "MEASURES", tmp_path)
    called = []
    monkeypatch.setattr(merge_labeled.fetch_labels, "finish",
                        lambda pid, ok: called.append((pid, ok)))
    build("DHqCBQnRAjW")
    assert called == []


# ---------------------------------------------------------------- 실패 갈래

def _finish_spy(monkeypatch, boom=None):
    called = []

    def finish(pid, ok):
        called.append((pid, ok))
        if boom is not None:
            raise boom
    monkeypatch.setattr(merge_labeled.fetch_labels, "finish", finish)
    return called


@pytest.mark.parametrize("exc", [RuntimeError, KeyboardInterrupt])
def test_build는_실패하면_상태를_풀어준다(monkeypatch, exc):
    # `except Exception` 이면 KeyboardInterrupt 를 못 잡아 게시물이 영영 「분석중」에
    # 갇힌다 — 웹이 「분석중」이면 편집을 409 로 막으므로 사람이 손쓸 방법이 없다.
    # (Task 1 이 `fetch_labels.pull()` 에서 Critical 로 판정한 바로 그 부류다.)
    def boom(pid):
        raise exc("망했다")
    monkeypatch.setattr(merge_labeled, "_build", boom)
    called = _finish_spy(monkeypatch)
    with pytest.raises(exc):
        merge_labeled.build("PID", publish=True)
    assert called == [("PID", False)]


def test_build는_publish가_꺼져_있으면_실패해도_상태를_안_바꾼다(monkeypatch):
    def boom(pid):
        raise RuntimeError("망했다")
    monkeypatch.setattr(merge_labeled, "_build", boom)
    called = _finish_spy(monkeypatch)
    with pytest.raises(RuntimeError):
        merge_labeled.build("PID")
    assert called == []


def test_상태_풀기가_터져도_원래_예외가_나온다(monkeypatch):
    # 원인(원래 예외)을 상태 되돌리기 실패가 가리면 무엇이 잘못됐는지 못 찾는다.
    def boom(pid):
        raise RuntimeError("원래 예외")
    monkeypatch.setattr(merge_labeled, "_build", boom)
    called = _finish_spy(monkeypatch, boom=ValueError("풀기도 실패"))
    with pytest.raises(RuntimeError, match="원래 예외"):
        merge_labeled.build("PID", publish=True)
    assert called == [("PID", False)]


# ---------------------------------------------------------------- 배율 불변

def _synth_post(root: Path, pid: str, mult: float) -> dict:
    """같은 디자인을 배율만 바꿔 만든다. 라벨 네모는 브라우저가 준 **원본 해상도**다.

    JPEG 가 아니라 PNG 로 쓴다(확장자만 `.jpg`) — 두 해상도에서 압축 잡티가
    다르게 끼면 이 시험이 배율이 아니라 코덱을 재게 된다. `PIL.Image.open` 은
    내용으로 형식을 가리므로 이름은 상관없다.
    """
    def S(v):
        return round(v * mult)

    img = np.zeros((S(1350), S(1080), 3), np.uint8)
    img[:, :] = (241, 255, 229)

    def R(x0, y0, x1, y1, c):
        img[S(y0):S(y1), S(x0):S(x1)] = c

    R(150, 150, 450, 450, (30, 60, 200))       # 도형 — 누끼(마스크) 경로를 탄다
    R(100, 600, 900, 800, (20, 20, 20))        # 글자 자리
    R(880, 1150, 1040, 1310, (168, 248, 88))   # 로고 — 강조색 후보
    d = root / "images" / pid
    d.mkdir(parents=True, exist_ok=True)
    Image.fromarray(img).save(d / "01.jpg", format="PNG")

    boxes = [
        {"id": "shape", "kind": "도형", "box": [S(150), S(150), S(450), S(450)], "cut": True},
        {"id": "text", "kind": "글자", "box": [S(100), S(600), S(900), S(800)]},
        {"id": "logo", "kind": "로고", "box": [S(880), S(1150), S(1040), S(1310)]},
    ]
    lab = root / "labels"
    lab.mkdir(parents=True, exist_ok=True)
    (lab / f"{pid}.json").write_text(json.dumps({"1": {"boxes": boxes}}), encoding="utf-8")
    return {"shape": [S(150), S(150), S(450), S(450)], "wh": (S(1080), S(1350))}


def _run_synth(monkeypatch, root: Path, pid: str, mult: float) -> dict:
    _synth_post(root, pid, mult)   # 그림·라벨만 쓰고, 반환값은 이제 안 쓴다(아래 참고)

    def fake_cut(pid_, index, boxes):
        # 실물 `cutout.cut_slide()` 와 같은 모양 — `box`·`w`·`h`·`테두리`·`구멍` 은
        # cut_slide 안에서 이미 원본 해상도 → 1080 으로 옮겨 담겨 나온다. 그래서
        # 원본이 몇 배(mult)든 여기서 내는 값은 늘 같은 1080 좌표다 — 이 시험이
        # 재는 것은 "배율이 몇이든 계량표가 똑같이 나오는가"지, 이 가짜 함수
        # 안에서 배율을 다시 계산하는 게 아니다.
        return {"shape": {"box": [150, 150, 450, 450], "w": 300.0, "h": 300.0,
                          "angle": 0.0,
                          "테두리": [[150, 150], [450, 150], [450, 450], [150, 450]],
                          "구멍": [], "png": "k"}}

    monkeypatch.setattr(merge_labeled.글자읽기, "read_slide",
                        lambda pid_, index, boxes: {})
    monkeypatch.setattr(merge_labeled.cutout, "cut_slide", fake_cut)
    monkeypatch.setattr(merge_labeled.tone_labeled, "ask",
                        lambda pid_, texts: merge_labeled.tone_labeled._fallback(len(texts)))
    monkeypatch.setattr(config, "DATA", root)
    monkeypatch.setattr(config, "IMAGES", root / "images")
    monkeypatch.setattr(config, "MEASURES", root / "measures")
    return build(pid)


def test_계량표는_원본_해상도가_달라도_같은_값을_낸다(monkeypatch, tmp_path):
    """배율 회귀 그물. `_regions`·`merge_one` 어느 한쪽에서 배율을 빼거나 두 번
    곱하면 여기가 빨개진다 — 계획서가 이 부류(Task 4 P0)에 이미 두 번 값을 치렀다.
    실물 30건 중 12건이 1080폭이 아니므로 s != 1.0 은 예외가 아니라 흔한 경우다.
    `cutout.cut_slide()` 가 이미 1080 공간을 내는 지금은 `fake_cut`(위)이 mult 와
    무관하게 같은 좌표를 주므로, 여기서 정말 재는 것은 라벨 네모(`scale`)
    쪽이다 — `100,600,900,800`·`880,1150,1040,1310` 두 네모가 그 몫이다."""
    a = _run_synth(monkeypatch, tmp_path / "a", "ONEX", 1.0)
    b = _run_synth(monkeypatch, tmp_path / "b", "ONEHALFX", 1.5)

    assert a["canvas"] == b["canvas"] == {"w": 1080, "h": 1350}
    ra, rb = a["slides"][0]["regions"], b["slides"][0]["regions"]
    assert [r["box"] for r in ra] == [r["box"] for r in rb] == [
        [150, 150, 450, 450], [100, 600, 900, 800], [880, 1150, 1040, 1310]]
    # 배경판 열쇠는 게시물 이름으로 시작한다(`ONEX/01.png`). 두 판은 일부러
    # 다른 이름으로 돌리므로 그 앞자리는 빼고 견준다 — 재는 것은 배율이지
    # 이름이 아니다. 뒷자리(`01.png`)와 판이 있고 없고는 그대로 본다.
    def _이름뺀배경(bg):
        남 = dict(bg)
        판 = 남.pop("판", None)
        return 남, (판.split("/", 1)[-1] if 판 else None)

    assert _이름뺀배경(a["slides"][0]["background"]) == _이름뺀배경(b["slides"][0]["background"])
    assert [r.get("color") for r in ra] == [r.get("color") for r in rb]
    # 강조색은 hex 만 맞춘다 — 화소 수는 1620→1080 리샘플이 경계에서 만든 중간색
    # 때문에 같을 수 없다(실측: 90000 대 88804 — 1196 화소, **1.33%** 차이).
    # 같다고 적으면 거짓이다.
    assert a["accent"]["hex"] == b["accent"]["hex"] and a["accent"]["hex"], (a["accent"], b["accent"])
    assert a["accent"]["slides"] == b["accent"]["slides"] == 1
    # 테두리도 두 배율에서 같은 1080 좌표로 실린다 — `merge_one` 이 `cut` 을
    # 그대로 옮겨 담을 뿐 다시 배율을 곱하지 않는다는 뜻이다.
    assert ra[0]["cutout"]["테두리"] == rb[0]["cutout"]["테두리"] == \
        [[150, 150], [450, 150], [450, 450], [150, 450]]


# ---------------------------------------------------------------- 글자 빼기 배선

def _synth_overlap(root: Path, pid: str) -> None:
    """글자 네모가 도형 위를 덮는 한 장짜리 게시물(누끼 없음)."""
    img = np.zeros((1350, 1080, 3), np.uint8)
    img[:, :] = (241, 255, 229)
    img[100:700, 100:700] = (30, 60, 200)      # 파란 도형
    img[100:400, 100:700] = (20, 20, 20)       # 그 위를 덮은 글자
    d = root / "images" / pid
    d.mkdir(parents=True, exist_ok=True)
    Image.fromarray(img).save(d / "01.jpg", format="PNG")
    boxes = [{"id": "shape", "kind": "도형", "box": [100, 100, 700, 700]},
             {"id": "text", "kind": "글자", "box": [100, 100, 700, 400]}]
    lab = root / "labels"
    lab.mkdir(parents=True, exist_ok=True)
    (lab / f"{pid}.json").write_text(json.dumps({"1": {"boxes": boxes}}), encoding="utf-8")


def test_build가_글자_네모를_빼고_도형_색을_잰다(monkeypatch, tmp_path):
    """`_build` 의 `text_boxes` **배선**에 거는 자물쇠.

    윗 시험(`test_글자_네모는_사람_상자가_아니라_테두리가_조인_상자로_빠진다`)은
    `_color_of` 를 직접 부르면서 `text_boxes` 를 **시험 안에서 다시 계산한다** —
    그래서 `_regions` 는 못박지만 `_build:430` 은 못 박는다. 코드 밑을 다시
    타이핑한 시험은 그 코드가 바뀌는 것을 못 본다. 여기는 `build()` 를 통째로
    돌려 **계량표에 실제로 실린 값**만 본다.

    `_build` 의 `text_boxes` 를 `[]` 로 바꾸면 도형이 「단색 #1E3CC8」에서
    「사진」(49칸)으로 뒤집힌다 — 글자색이 섞여서다(설계 5-3).
    """
    _synth_overlap(tmp_path, "OVERLAP")
    monkeypatch.setattr(merge_labeled.글자읽기, "read_slide",
                        lambda pid_, index, boxes: {})
    monkeypatch.setattr(merge_labeled.cutout, "cut_slide",
                        lambda pid_, index, boxes: {})
    monkeypatch.setattr(merge_labeled.tone_labeled, "ask",
                        lambda pid_, texts: merge_labeled.tone_labeled._fallback(len(texts)))
    monkeypatch.setattr(config, "DATA", tmp_path)
    monkeypatch.setattr(config, "IMAGES", tmp_path / "images")
    monkeypatch.setattr(config, "MEASURES", tmp_path / "measures")

    doc = build("OVERLAP")
    shape = doc["slides"][0]["regions"][0]
    assert shape["id"] == "shape", shape
    assert shape["color"]["kind"] == "단색", shape["color"]
    assert shape["color"]["hex"] == "#1E3CC8", shape["color"]
    assert shape["color"]["cells"] == 21, shape["color"]


def _synth_빼기(root: Path, pid: str) -> None:
    """크림색 종이에 검은 세로선 하나 — 선 둘레에 「빼기」 네모."""
    img = np.zeros((1350, 1080, 3), np.uint8)
    img[:, :] = (241, 255, 229)
    img[100:1200, 60:66] = (0, 0, 0)          # 타임라인 같은 얇은 선
    d = root / "images" / pid
    d.mkdir(parents=True, exist_ok=True)
    Image.fromarray(img).save(d / "01.jpg", format="PNG")
    boxes = [{"id": "line", "kind": "빼기", "box": [40, 80, 90, 1220]},
             {"id": "text", "kind": "글자", "box": [200, 100, 900, 400]}]
    lab = root / "labels"
    lab.mkdir(parents=True, exist_ok=True)
    (lab / f"{pid}.json").write_text(json.dumps({"1": {"boxes": boxes}}), encoding="utf-8")


def test_build는_빼기_네모를_계량표에_안_싣고_배경에서는_판다(monkeypatch, tmp_path):
    """「빼기」(2026-09-19) — 라벨은 하되 그리지도 재지도 않는 칸. 원본에만 있던
    타임라인·구분선·워터마크가 바닥판에 박히지 않게 자리만 파낸다."""
    _synth_빼기(tmp_path, "BBAEGI")
    monkeypatch.setattr(merge_labeled.글자읽기, "read_slide",
                        lambda pid_, index, boxes: {})
    monkeypatch.setattr(merge_labeled.cutout, "cut_slide",
                        lambda pid_, index, boxes: {})
    monkeypatch.setattr(merge_labeled.tone_labeled, "ask",
                        lambda pid_, texts: merge_labeled.tone_labeled._fallback(len(texts)))
    monkeypatch.setattr(config, "DATA", tmp_path)
    monkeypatch.setattr(config, "IMAGES", tmp_path / "images")
    monkeypatch.setattr(config, "MEASURES", tmp_path / "measures")

    doc = build("BBAEGI")
    kinds = [r["kind"] for r in doc["slides"][0]["regions"]]
    assert "빼기" not in kinds, kinds
    assert kinds == ["글자"], kinds
    # 배경판(있다면)에 선이 없다 — 빼기 자리는 «남음» 에서 파였다
    img = np.asarray(Image.open(tmp_path / "images" / "BBAEGI" / "01.jpg").convert("RGB"))
    regs = merge_labeled._regions(merge_labeled.load_labels("BBAEGI")[1]["boxes"], {}, 1.0, img.shape[:2])
    남음 = merge_labeled.residual(img, regs, rgb=img)
    assert not 남음[100:1200, 60:66].any()


# ---------------------------------------------------------------- 글씨체 맞히기

import fontmatch
from ruler import text as rtext

_FONT_SAMPLE = "마케팅담당자의뇌구조가궁금하다레퍼런스공식콘텐츠"
_needs_fonts = pytest.mark.skipif(
    sum(1 for b, r in fontmatch.FONT_FILES.values() if b.exists() and r.exists()) < 8,
    reason="글꼴 8종이 없다 — analyze/fonts/ 는 gitignore 다(README 의 출처에서 받아라)")


def _render_line(font_name: str, weight: str, px: int, text: str = _FONT_SAMPLE):
    """한 줄을 실제 글꼴로 그려 (그림, 글자 상자 목록)을 낸다.

    크림색 바탕에 거의 검정 글자 — 실물 게시물과 같은 배색이다.
    """
    from PIL import ImageFont
    path = fontmatch.FONT_FILES[font_name][0 if weight == "Bold" else 1]
    f = ImageFont.truetype(str(path), px)
    im = Image.new("RGB", (px * (len(text) + 2), px * 3), (241, 255, 229))
    d = ImageDraw.Draw(im)
    syms, x = [], px
    for ch in text:
        d.text((x, px), ch, font=f, fill=(1, 2, 1))
        syms.append({"text": ch, "box": list(d.textbbox((x, px), ch, font=f))})
        x += f.getlength(ch)
    return np.array(im), syms


@_needs_fonts
def test_그린_글꼴을_다시_맞힌다():
    """합성 대조 — 입력이 «정말로» 8종 중 하나면 맞힌다. 이 갈래(`pick` 이 이름을
    내는 쪽)는 **실물에서 한 번도 안 밟혔다**(실물 17덩어리 중 문턱을 넘는 셋은
    전부 프리텐다드다). 그래서 여기서만 지켜진다."""
    for name in ("검은고딕", "나눔명조", "에스코어드림", "배민도현"):
        img, syms = _render_line(name, "Regular", 46)
        got = fontmatch.match(img, syms, "#010201", "Regular")
        assert got["pick"] == name, (name, got["ranked"][:3])
        assert got["margin"] >= fontmatch.MARGIN_MIN, (name, got["margin"])


@_needs_fonts
def test_한_끗_차이면_이름을_안_댄다():
    """21px 나눔스퀘어라운드 Bold 는 프리텐다드와 0.062 차로 **틀리게** 1등이
    바뀌던 자리다(합성 320가지 중 문턱 0.05 에서 유일하게 틀린 것). 문턱 0.10
    에서는 이름을 안 댄다."""
    img, syms = _render_line("나눔스퀘어라운드", "Bold", 21)
    got = fontmatch.match(img, syms, "#010201", "Bold")
    assert got["pick"] is None, got
    assert got["verdict"] == fontmatch.NOT_SURE
    assert got["margin"] < fontmatch.MARGIN_MIN, got
    assert got["ranked"], "점수는 남겨야 나중에 사람이 본다"


def test_글자색을_모르면_글씨체도_안_고른다():
    img = np.zeros((50, 50, 3), np.uint8)
    got = fontmatch.match(img, [{"text": "가", "box": [0, 0, 10, 10]}], None, "Bold")
    assert got["pick"] is None and got["glyphs"] == 0, got


def test_한글이_없으면_글씨체를_안_고른다():
    img = np.zeros((50, 50, 3), np.uint8)
    got = fontmatch.match(img, [{"text": "A", "box": [0, 0, 10, 10]}], "#000000", "Bold")
    assert got["pick"] is None, got
    assert "한글" in got["why"], got


@_needs_fonts
def test_글자_수보다_글자_생김새가_판정력을_가른다():
    """**정직하게 적어 둘 한계.** 같은 검은고딕 46px 인데도 「가나다라마바사아자차」
    처럼 받침 없는 쉬운 글자 열 자면 1등 IoU 가 0.430 까지 떨어지고 2등(지마켓산스)
    과의 차가 0.026 이라 못 가린다. 실물스러운 표본 24자에서는 0.883 / 차 0.153 이다.

    글자 수 하한 대신 문턱 하나만 둔 까닭이기도 하다 — 막아야 할 것은 「글자가
    적다」가 아니라 「그 글자들로는 안 갈린다」이고, 그건 1·2등 차가 이미 말한다.
    """
    img, syms = _render_line("검은고딕", "Bold", 46, "가나다라마바사아자차")
    easy = fontmatch.match(img, syms, "#010201", "Bold")
    assert easy["glyphs"] == 10, easy
    assert easy["pick"] is None, easy["ranked"][:2]
    assert easy["margin"] < fontmatch.MARGIN_MIN, easy

    img2, syms2 = _render_line("검은고딕", "Bold", 46)      # 실물스러운 24자
    hard = fontmatch.match(img2, syms2, "#010201", "Bold")
    assert hard["pick"] == "검은고딕", hard["ranked"][:2]
    assert hard["margin"] > easy["margin"] * 4, (hard["margin"], easy["margin"])


@_needs_fonts
def test_block이_글씨체_판정을_실제로_돌린다():
    """`fontmatch` 를 부르는 **배선**에 거는 자물쇠. 모듈만 맞고 아무도 안 부르면
    계량표에는 여전히 글씨체 근거가 없다 — `_fail(...)` 로 갈아 끼워도 시험이
    다 통과하던 자리다."""
    import layout_labeled

    img, syms = _render_line("검은고딕", "Bold", 46)
    box = [0, 0, img.shape[1], img.shape[0]]
    out = layout_labeled.block(img, {"symbols": syms}, box, 1.0, config.cal())
    fm = out["font_match"]
    assert fm["glyphs"] == 24, fm
    assert fm["pick"] == "검은고딕", fm["ranked"][:3]


@_needs_real
@_needs_fonts
def test_실물에서는_거의_다_못_가린다_그리고_그게_정직한_답이다():
    """**이 시험이 지키는 것은 「맞힌다」가 아니라 「모르는 걸 모른다고 한다」이다.**

    실물 17덩어리에서 1등은 언제나 프리텐다드 아니면 나눔스퀘어라운드이고,
    1·2등의 차가 0.017~0.158 이다. 문턱 0.10 을 넘는 것은 셋뿐이고 셋 다
    프리텐다드다.
    """
    import layout
    import layout_labeled as L

    decided, tops, pairs = [], set(), []
    for index in range(1, 8):
        ocr = _REAL_OCR_01.parent / f"{index:02d}.json"
        if not ocr.exists():
            pytest.skip("캐시된 장 전체 OCR(data/ocr/)이 없다")
        img = np.array(Image.open(_REAL_IMAGES / f"{index:02d}.jpg").convert("RGB"))
        syms = _symbols(json.loads(ocr.read_text(encoding="utf-8")),
                        [0, 0, img.shape[1], img.shape[0]], 1.0)
        for b in _DHQ_LABELS[str(index)]["boxes"]:
            if b.get("kind") != "글자":
                continue
            inb = [x for x in syms if L.inside(b["box"], x["box"], pad=4)]
            lines = layout.group_lines(inb)
            if not lines:
                continue
            ink = layout.line_color(img, lines[0])
            wts = [rtext._weight(img, l["box"])[0] for l in lines]
            weight = "Bold" if sum(w == "Bold" for w in wts) * 2 >= len(wts) else "Regular"
            got = fontmatch.match(img, inb, ink, weight)
            if got["ranked"]:
                tops.add(got["ranked"][0]["font"])
                pairs.append(frozenset(r["font"] for r in got["ranked"][:2]))
            if got["pick"]:
                decided.append((index, got["pick"], got["margin"]))

    # **개수를 못 박지 않는다.** 사람이 라벨을 더 그으면 덩어리도 는다 —
    # 2026-09-24 에 17 -> 19 가 되면서 이 시험이 깨졌다. 지킬 것은 «몇 개인가» 가
    # 아니라 «가려지나» 다.
    assert len(pairs) >= 15, len(pairs)
    assert tops == {"프리텐다드", "나눔스퀘어라운드"}, tops
    # 2등까지도 그 둘인 것이 거의 전부다. 벗어나는 몇은 에스코어드림이 2등이다.
    같은짝 = sum(1 for p in pairs if p == frozenset({"프리텐다드", "나눔스퀘어라운드"}))
    assert 같은짝 >= len(pairs) * 0.8, (같은짝, len(pairs))
    # 문턱 0.10 을 넘는 것은 넷 중 하나도 안 된다 — 그래서 «거의 다 못 가린다».
    assert len(decided) <= len(pairs) // 4, decided
    assert {d[1] for d in decided} == {"프리텐다드"}, decided


@_needs_real
@_needs_fonts
def test_사람이_고른_그_덩어리에서_기계는_이름을_안_댄다():
    """2번 장 본문은 **사람이 유일하게 글씨체를 고른 네모**다(「프리텐다드」).
    거기서 기계 1등은 나눔스퀘어라운드이고 차가 0.017 이다 — 문턱이 없었다면
    사람이 고른 값을 뒤집었을 자리다."""
    import layout
    import layout_labeled as L

    ocr = _REAL_OCR_01.parent / "02.json"
    if not ocr.exists():
        pytest.skip("캐시된 장 전체 OCR(data/ocr/)이 없다")
    box = next(b for b in _DHQ_LABELS["2"]["boxes"] if b.get("font"))
    assert box["font"] == "프리텐다드"
    img = np.array(Image.open(_REAL_IMAGES / "02.jpg").convert("RGB"))
    syms = _symbols(json.loads(ocr.read_text(encoding="utf-8")),
                    [0, 0, img.shape[1], img.shape[0]], 1.0)
    inb = [x for x in syms if L.inside(box["box"], x["box"], pad=4)]
    ink = layout.line_color(img, layout.group_lines(inb)[0])
    got = fontmatch.match(img, inb, ink, "Regular")
    assert got["pick"] is None, got
    assert got["ranked"][0]["font"] == "나눔스퀘어라운드", got["ranked"][:2]
    assert got["margin"] < fontmatch.MARGIN_MIN, got


# ---------------------------------------------------------------- 글자 효과

import effects

_CARD_BG = (241, 255, 229)
_INK = (1, 2, 1)


def _effect_line(px=46, text="마케팅담당자의뇌구조", stroke=0, stroke_fill=(255, 255, 255),
                 underline=0, ul_fill=_INK, ul_gap=6, font_name="프리텐다드"):
    """크림 바탕 · 거의 검정 글자 한 줄. 외곽선·밑줄을 넣을 수 있다.
    돌려주는 상자는 **잉크 상자**다 — OCR 이 주는 것과 같은 모양."""
    from PIL import ImageFont
    f = ImageFont.truetype(str(fontmatch.FONT_FILES[font_name][0]), px)
    im = Image.new("RGB", (int(f.getlength(text)) + px * 2, px * 3), _CARD_BG)
    d = ImageDraw.Draw(im)
    kw = dict(stroke_width=stroke, stroke_fill=stroke_fill) if stroke else {}
    d.text((px, px), text, font=f, fill=_INK, **kw)
    bb = list(d.textbbox((px, px), text, font=f, stroke_width=stroke))
    if underline:
        y = bb[3] + ul_gap
        d.rectangle([bb[0], y, bb[2], y + underline - 1], fill=ul_fill)
    return np.array(im), bb


def _one_run(hex_str="#F1FFE5"):
    return {"runs": [{"hex": hex_str, "x0": 0, "x1": 999, "ratio": 1.0}]}


@_needs_fonts
def test_외곽선이_없으면_안_찾는다():
    img, bb = _effect_line()
    got = effects.of_line(img, bb, "#010201", _one_run())
    assert got["found"] == [], got
    assert got[effects.OUTLINE]["cover"] < effects.RIM_COVER_MIN, got[effects.OUTLINE]


@pytest.mark.parametrize("stroke", [2, 3, 5])
@_needs_fonts
def test_외곽선을_찾는다(stroke):
    """합성 실측: 2px 0.339~0.405 · 3px 0.837~0.903 · 5px 0.996~0.999.
    실물 38줄(외곽선 없음)의 최댓값은 0.117 이라 문턱 0.25 가 그 사이다."""
    img, bb = _effect_line(stroke=stroke)
    got = effects.of_line(img, bb, "#010201", _one_run())
    assert effects.OUTLINE in got["found"], got[effects.OUTLINE]
    assert got[effects.OUTLINE]["cover"] >= effects.RIM_COVER_MIN


@_needs_fonts
def test_밑줄이_없으면_안_찾는다():
    img, bb = _effect_line()
    got = effects.of_line(img, bb, "#010201", _one_run())
    assert effects.UNDERLINE not in got["found"], got[effects.UNDERLINE]


@pytest.mark.parametrize("width", [2, 4])
@pytest.mark.parametrize("colour", [(1, 2, 1), (201, 252, 149), (220, 30, 30)])
@_needs_fonts
def test_밑줄을_찾는다_색이_글자색과_달라도(width, colour):
    """밑줄이 글자색이 아닐 수도 있다 — 「글자색 근처」만 막대로 세면 연두·빨강
    밑줄이 통째로 사라진다(실제로 그렇게 짰다가 셋 다 0.0 이 나왔다)."""
    img, bb = _effect_line(underline=width, ul_fill=colour)
    got = effects.of_line(img, bb, "#010201", _one_run())
    assert effects.UNDERLINE in got["found"], got[effects.UNDERLINE]
    assert got[effects.UNDERLINE]["thick"] == width, got[effects.UNDERLINE]


def test_라벨에_남은_옛_효과는_안_읽는다():
    """묘비(2026-09-19). 효과 체크상자도 화면에서 뺐다 — 기계 읽기만 쓴다."""
    import layout_labeled as L
    auto = {"found": ["밑줄"], "lines": 3, "skipped": 0}
    assert L.choose_effects({"effects": ["그림자"]}, auto) == (["밑줄"], "기계")


def test_사람이_안_찍었으면_기계_읽기를_쓴다():
    import layout_labeled as L
    auto = {"found": ["외곽선"], "lines": 3, "skipped": 0}
    assert L.choose_effects({}, auto) == (["외곽선"], "기계")
    assert L.choose_effects({"effects": []}, auto) == (["외곽선"], "기계")


def test_기계도_못_쟀으면_모름이라_적는다():
    import layout_labeled as L
    assert L.choose_effects({}, effects._fail("못 쟀다")) == ([], "모름")
    assert L.choose_effects({}, None) == ([], "모름")


def test_그림자는_안_잰다_그리고_그렇게_적는다():
    """사람 지시로 **뺀 것**이지 못 찾은 게 아니다 — 계량표가 그 말을 지고 있어야
    한다. 라벨 화면의 사람 선택지에서는 안 뺀다."""
    assert effects.SHADOW in effects.NOT_CHECKED
    assert effects.SHADOW not in effects.CHECKED
    got = effects.of_line(np.full((60, 200, 3), 241, np.uint8), [10, 10, 190, 50],
                          "#010201", _one_run())
    assert effects.SHADOW not in got["found"]
    assert effects.SHADOW in got["not_checked"]
    assert "사람 지시" in got["why_not"]


def test_줄_뒤_색을_못_가린_줄은_효과도_안_잰다():
    """사진 위 글자가 그렇다. 견줄 배경색이 없으면 「세 번째 색」이라는 말이
    성립하지 않는다 — 없는 기준으로 판정하면 자신 있게 틀린다."""
    img = np.zeros((60, 200, 3), np.uint8)
    got = effects.of_line(img, [10, 10, 190, 50], "#010201",
                          {"runs": [], "fallback": True, "why": "사진 위다"})
    assert got["fallback"] is True and got["found"] == []
    assert "사진 위다" in got["why"], got


def test_글자색을_모르면_효과도_안_잰다():
    img = np.zeros((60, 200, 3), np.uint8)
    got = effects.of_line(img, [10, 10, 190, 50], None, _one_run())
    assert got["fallback"] is True and got["found"] == []


def test_of_block은_한_줄에만_있어도_덩어리에_있다고_본다():
    """밑줄은 대개 한 줄에만 걸린다."""
    lines = [{"found": [], "checked": list(effects.CHECKED)},
             {"found": ["밑줄"], "checked": list(effects.CHECKED)},
             {"found": [], "fallback": True, "why": "못 쟀다"}]
    got = effects.of_block(lines)
    assert got["found"] == ["밑줄"]
    assert got["lines"] == 2 and got["skipped"] == 1


@_needs_real
def test_실물_37줄에는_외곽선도_밑줄도_없다():
    """**이 게시물에 표본이 없다.** 그래서 실물이 주는 근거는 「거짓 양성이 안
    난다」 한쪽뿐이고, 「찾았다」쪽은 위 합성 시험으로만 밟힌다.

    실측 최댓값(이 커밋에서 재현): 외곽선 고리 몫 0.117 · 밑줄 행 덮음 0.071.
    사진 위 두 줄은 `back` 이 이미 막아 여기 안 든다.
    """
    import layout
    import layout_labeled as L
    import lineback as LB

    rims, unders, judged, skipped = [], [], 0, 0
    for index in range(1, 8):
        ocr = _REAL_OCR_01.parent / f"{index:02d}.json"
        if not ocr.exists():
            pytest.skip("캐시된 장 전체 OCR(data/ocr/)이 없다")
        img = np.array(Image.open(_REAL_IMAGES / f"{index:02d}.jpg").convert("RGB"))
        syms = _symbols(json.loads(ocr.read_text(encoding="utf-8")),
                        [0, 0, img.shape[1], img.shape[0]], 1.0)
        boxes = _DHQ_LABELS[str(index)]["boxes"]
        photo = [b["box"] for b in boxes if b.get("kind") in ("사진", "인물")]
        for b in boxes:
            if b.get("kind") != "글자":
                continue
            lines = layout.group_lines([x for x in syms
                                        if L.inside(b["box"], x["box"], pad=4)])
            if not lines:
                continue
            colors = [layout.line_color(img, ln) for ln in lines]
            # **파이프라인이 실제로 도는 길로 잰다** — `line_detail` 이 사진 위 줄을
            # 먼저 막는다(`PHOTO_OVERLAP_MAX`). `lineback.back_of` 만 부르면 1번 장
            # 둘째 줄이 그 관문을 우회해 밑줄 덮음 0.286 을 낸다.
            detail = L.line_detail(img, lines, ["Bold"] * len(lines), colors, 91.0, photo)
            for d in detail:
                got = d["effects"]
                if got.get("fallback"):
                    skipped += 1
                    continue
                judged += 1
                assert got["found"] == [], (index, b["box"], got["found"])
                rims.append(got[effects.OUTLINE]["cover"])
                unders.append(got[effects.UNDERLINE]["cover"])

    # **개수와 최댓값을 못 박지 않는다.** 이 값들은 «그때 라벨» 의 스냅숏이라,
    # 사람이 같은 게시물을 다시 라벨하면(그럴 자유가 있다) 시험이 깨진다 —
    # 코드가 나빠져서가 아니라 자료가 바뀌어서다. 실제로 그렇게 깨진 채
    # 오래 빨갛게 남아 있었다(2026-08-29에 정리).
    #
    # 이 시험이 지키려는 것은 둘이다: **거짓 양성이 안 난다**(위 고리 안의
    # `got["found"] == []`), 그리고 **문턱에 여유가 있다.**
    assert judged > 0, "잰 덩어리가 하나도 없다 — 시험이 헛돌았다"
    assert max(rims) < effects.RIM_COVER_MIN, (max(rims), effects.RIM_COVER_MIN)
    assert max(unders) < effects.UNDER_COVER_MIN, (max(unders), effects.UNDER_COVER_MIN)


# ---------------------------------------------------------------- 글자 위계

def _blk(pt, weight, lines=1):
    return {"pt": pt, "weight": weight, "lines": lines}


def test_위계는_굵기로_본문을_먼저_가른다():
    """Regular 은 본문, Bold 는 제목 아니면 꼬리표.

    실측(DHqCBQnRAjW 17덩어리): Bold 11개는 전부 제목·꼬리표이고 Regular 6개는
    전부 본문이다 — 굵기 하나로 본문이 완전히 갈린다(오분류 0).
    """
    import layout_labeled as L
    got = L.levels_of([_blk(46, "Bold", 2), _blk(41, "Regular", 7), _blk(36, "Bold", 1)])
    assert got == ["제목", "본문", "꼬리표"], got


def test_Bold_안에서만_크기_비율로_제목과_꼬리표를_가른다():
    """비율의 분모는 **그 장 Bold 중 최대**다. 전체 최대로 나누면 본문이 분모가
    되는 장이 생겨(7번 장은 Regular 하나뿐) 비율의 뜻이 장마다 달라진다."""
    import layout_labeled as L
    # 6번 장 실측: Bold 46 · Bold 36 → 36/46 = 0.783 < 0.9 라 꼬리표.
    assert L.levels_of([_blk(46, "Bold", 2), _blk(36, "Bold", 1)]) == ["제목", "꼬리표"]
    # 문턱 바로 위(0.9)는 제목 — 크기가 거의 같은 두 덩어리는 둘 다 제목이다.
    assert L.levels_of([_blk(50, "Bold"), _blk(45, "Bold")]) == ["제목", "제목"]


def test_크기를_못_잰_덩어리는_위계를_지어내지_않는다():
    import layout_labeled as L
    assert L.levels_of([_blk(None, "Bold"), _blk(46, "Bold")]) == [None, "제목"]
    assert L.levels_of([_blk(None, None)]) == [None]


def test_Regular_뿐인_장도_본문이라_적는다():
    """7번 장(CTA)이 그렇다 — 그 장에서 가장 큰 글자지만 제목이 아니다."""
    import layout_labeled as L
    assert L.levels_of([_blk(37, "Regular", 3)]) == ["본문"]


@_needs_real
def test_실물_17덩어리의_위계가_사람이_보는_것과_같다():
    """**옛 문턱(pt/그장최대 ≥0.75 제목, ≥0.45 본문)이 왜 안 되는지가 여기 있다.**

    실측 비율(장별 최대 pt 대비, 이 커밋에서 재현):

        1장 1.000 / 0.406 · 2장 1.000 / 0.911 · 3장 1.000 / 0.911 / 0.467
        4장 1.000 / 0.911 / 0.489 · 5장 1.000 / 0.891 / 0.457
        6장 1.000 / 0.891 / 0.783 · 7장 1.000

    옛 문턱이면 6번 장 셋(1.000·0.891·0.783)이 **전부 제목**이 된다. 게다가
    7번 장 본문은 비율이 1.000 이라 «어떤» 크기 문턱으로도 제목과 못 가른다 —
    크기 하나로는 원리적으로 안 된다는 반례가 이 게시물 안에 있다.
    """
    import layout_labeled as L
    doc = json.loads(_REAL_MEASURES.read_text(encoding="utf-8"))
    want = {
        1: ["제목", "꼬리표"],
        2: ["제목", "본문"],
        3: ["제목", "본문", "꼬리표"],
        4: ["제목", "본문", "꼬리표"],
        5: ["제목", "본문", "꼬리표"],
        6: ["꼬리표", "제목", "본문"],     # 「기획후기」 36pt · 제목 46pt · 본문 41pt
        7: ["본문"],
    }
    # **위 표는 사람이 눈으로 보고 적은 것이다.** 라벨 파일에는 위계가 안 실려
    # 있어서(네모에 `box`·`id`·`kind` 뿐) 자동으로 다시 뽑을 길이 없다. 그런데
    # 사람이 같은 게시물을 다시 라벨하면 덩어리 수가 달라진다 — 실제로 그렇게
    # 어긋난 채 오래 빨갛게 남아 있었다(2026-08-29에 정리).
    #
    # **덩어리 수가 맞는 장만 잰다.** 어긋난 장을 「지금 코드가 내는 값」으로
    # 갈아 끼우면 시험이 스스로를 채점하게 되어 아무것도 안 지킨다. 그건 사람이
    # 다시 눈으로 봐 줄 일이라, 여기서는 밝히고 건너뛴다.
    잰것, 건너뛴것 = 0, []
    for s in doc["slides"]:
        blocks = [r["text"] for r in s["regions"] if r["kind"] == "글자"]
        바람 = want.get(s["index"])
        if 바람 is None or len(blocks) != len(바람):
            건너뛴것.append(f"{s['index']}번({len(바람 or [])}→{len(blocks)})")
            continue
        assert L.levels_of(blocks) == 바람, (s["index"], blocks)
        잰것 += 1
    assert 잰것 > 0, f"잰 장이 하나도 없다 — 라벨이 통째로 바뀌었다: {건너뛴것}"
    if 건너뛴것:
        print(f"!! 다시 라벨된 장은 못 쟀다 — 사람이 위계를 다시 봐 줘야 한다: "
              f"{', '.join(건너뛴것)}")

    # **대조군 — 크기 하나로는 원리적으로 안 된다.** 이게 이 시험의 뼈대이고,
    # 라벨이 바뀌어도 성립한다: 한 장 안에 「제목보다 작지만 본문은 아닌 것」이
    # 있으면 어떤 크기 문턱도 셋을 못 가른다.
    for s in doc["slides"]:
        덩이 = [r["text"] for r in s["regions"] if r["kind"] == "글자"]
        위계 = L.levels_of(덩이)
        if len(set(위계)) < 3:
            continue
        top = max(b["pt"] for b in 덩이)
        옛것 = ["제목" if b["pt"] / top >= 0.75
              else ("본문" if b["pt"] / top >= 0.45 else "캡션") for b in 덩이]
        assert 옛것 != 위계, (s["index"], "옛 문턱으로도 갈렸다면 반례가 아니다")
        break


@_needs_real
def test_실물_6번_장_계량표가_기획후기를_꼬리표로_싣는다():
    """사람이 되돌려 그린 그림을 보고 짚은 바로 그 자리 — 규칙표가 이걸
    「요약 글자블록3」 이라고만 부르고 있었다."""
    doc = json.loads(_REAL_MEASURES.read_text(encoding="utf-8"))
    six = next(s for s in doc["slides"] if s["index"] == 6)
    tag = next(r for r in six["regions"] if r["text"]["text"].startswith("기획후기"))
    assert tag["text"]["pt"] == 36 and tag["text"]["weight"] == "Bold"
    import layout_labeled as L
    blocks = [r["text"] for r in six["regions"] if r["kind"] == "글자"]
    assert L.levels_of(blocks)[blocks.index(tag["text"])] == "꼬리표"


@_needs_real
def test_slide_text가_덩어리마다_위계를_실어_준다(monkeypatch):
    """`levels_of` 를 부르는 **배선**에 거는 자물쇠. 함수만 맞고 아무도 안 부르면
    계량표에는 여전히 위계가 없다."""
    import layout_labeled as L

    if not _REAL_OCR_01.exists():
        pytest.skip("캐시된 장 전체 OCR(data/ocr/)이 없다 — Vision 을 새로 부르지 않는다")
    res = json.loads(_REAL_OCR_06.read_text(encoding="utf-8"))
    img = np.array(Image.open(_REAL_IMAGES / "06.jpg").convert("RGB"))
    syms = _symbols(res, [0, 0, img.shape[1], img.shape[0]], 1.0)
    boxes = _DHQ_LABELS["6"]["boxes"]
    reads = {b["id"]: {"box": b["box"],
                       "symbols": [x for x in syms if L.inside(b["box"], x["box"], pad=4)]}
             for b in boxes if b.get("kind") == "글자"}

    got = L.slide_text("DHqCBQnRAjW", 6, boxes, reads)
    # **덩어리 수를 못 박지 않는다.** 사람이 같은 게시물을 다시 라벨하면 덩이가
    # 늘고 준다 — 실제로 6번 장이 셋에서 넷이 됐다(2026-08-29에 정리). 이 시험이
    # 지키려는 것은 개수가 아니라 **뜻**이다.
    적힌것 = [(b["level"], b["pt"], b["text"][:8]) for b in got]
    앞셋 = [b["level"] for b in got][:3]
    assert 앞셋 == ["꼬리표", "제목", "본문"], 적힌것

    # **여기가 반례다.** 「기획후기」는 37pt 로 42pt 본문보다 «작은데» 꼬리표다 —
    # 크기 순서만 보면 꼬리표가 본문 아래여야 하니, 크기 하나로는 못 가른다.
    꼬리표들 = [b for b in got if b["level"] == "꼬리표"]
    본문들 = [b for b in got if b["level"] == "본문"]
    assert 꼬리표들 and 본문들, 적힌것
    assert min(b["pt"] for b in 꼬리표들) < max(b["pt"] for b in 본문들), 적힌것

    # 6번 장은 사람이 글씨체를 안 골랐고 기계도 못 가린다(차 0.041·0.098·0.095
    # < 0.10) — 그래서 계열 기본값이다. **어디서 온 값인지가 계량표에 적혀
    # 있어야** 「사람이 고른 프리텐다드」와 구별된다.
    # **글씨체는 붙박이다**(2026-09-24) — 맞히는 자가 19% 짜리라 껐다.
    assert {b["font_by"] for b in got} == {"붙박이"}, [b["font_by"] for b in got]
    assert {b["font"] for b in got} == {"프리텐다드"}, [b["font"] for b in got]


# ------------------------------------------------- 장식·로고는 색을 안 잰다 (사람 결정)

def _synth_deco(root: Path, pid: str) -> None:
    """장식·로고·도형이 한 장에 하나씩 있는 게시물."""
    img = np.zeros((1350, 1080, 3), np.uint8)
    img[:, :] = (241, 255, 229)
    img[100:700, 100:700] = (30, 60, 200)      # 도형 — 이건 여전히 잰다
    img[800:900, 100:300] = (200, 30, 30)      # 장식
    img[800:900, 400:600] = (30, 200, 30)      # 로고
    d = root / "images" / pid
    d.mkdir(parents=True, exist_ok=True)
    Image.fromarray(img).save(d / "01.jpg", format="PNG")
    boxes = [{"id": "shape", "kind": "도형", "box": [100, 100, 700, 700]},
             {"id": "deco", "kind": "장식", "box": [100, 800, 300, 900]},
             {"id": "logo", "kind": "로고", "box": [400, 800, 600, 900]}]
    lab = root / "labels"
    lab.mkdir(parents=True, exist_ok=True)
    (lab / f"{pid}.json").write_text(json.dumps({"1": {"boxes": boxes}}), encoding="utf-8")


def _deco_doc(monkeypatch, tmp_path):
    _synth_deco(tmp_path, "DECO")
    monkeypatch.setattr(merge_labeled.글자읽기, "read_slide",
                        lambda pid_, index, boxes: {})
    monkeypatch.setattr(merge_labeled.cutout, "cut_slide",
                        lambda pid_, index, boxes: {})
    monkeypatch.setattr(merge_labeled.tone_labeled, "ask",
                        lambda pid_, texts: merge_labeled.tone_labeled._fallback(len(texts)))
    monkeypatch.setattr(config, "DATA", tmp_path)
    monkeypatch.setattr(config, "IMAGES", tmp_path / "images")
    monkeypatch.setattr(config, "MEASURES", tmp_path / "measures")
    return build("DECO")


def test_장식과_로고는_색을_안_재고_자리만_남긴다(monkeypatch, tmp_path):
    """사람 결정(2026-08-20): 「장식이나 로고는 디자인 분석할 필요없어」.

    **재다 실패한 것과 애초에 안 잰 것이 같아 보이면 안 된다** — 실물 로고 6개가
    전부 `미측정` 이었던 것이 바로 그 병이다(필요도 없는 것을 재려다 실패했고,
    계량표만 보면 「재려다 못 쟀다」로 읽힌다). 그래서 `안 잼` 은 `by_design` 을
    지고, 실패가 지는 `fallback` 은 **안 진다.**
    """
    doc = _deco_doc(monkeypatch, tmp_path)
    regions = {r["id"]: r for r in doc["slides"][0]["regions"]}
    for rid in ("deco", "logo"):
        col = regions[rid]["color"]
        assert col["kind"] == merge_labeled.NO_COLOR, col
        assert col["by_design"] is True, col
        assert col.get("fallback") is None, col      # 실패가 아니다
        assert col["hex"] is None, col
        assert "cells" not in col and "cover" not in col, col   # 잰 근거 자체가 없다
        assert regions[rid]["box"] == [100, 800, 300, 900] or regions[rid]["box"] == [400, 800, 600, 900]
    # 도형은 그대로 잰다 — 이 결정이 종류를 가려 도는지 대조한다.
    assert regions["shape"]["color"]["kind"] == "단색", regions["shape"]["color"]
    assert regions["shape"]["color"]["hex"] == "#1E3CC8", regions["shape"]["color"]


def test_안_잼은_미측정과_다른_말을_쓴다(monkeypatch, tmp_path):
    """두 낱말이 계량표에서 갈려 있어야 한다 — 하나는 「안 쟀다」, 하나는 「못 쟀다」."""
    doc = _deco_doc(monkeypatch, tmp_path)
    logo = next(r for r in doc["slides"][0]["regions"] if r["id"] == "logo")
    assert merge_labeled.NO_COLOR != "미측정"
    assert "안" in merge_labeled.NO_COLOR
    assert "자리만" in logo["color"]["why"], logo["color"]


# ---------------------------------------------------------------- lineback (줄 뒤 색)

import lineback
from lineback import back_of


def _one_line(back_cols, ink=(10, 10, 10)):
    """가로 600 × 세로 40 짜리 줄 하나. `back_cols` 를 가로로 똑같이 나눠 깔고
    그 위에 40px 간격으로 검은 획을 세운다."""
    w, h = 600, 40
    img = np.zeros((h, w, 3), np.uint8)
    step = w // len(back_cols)
    for i, c in enumerate(back_cols):
        img[:, i * step:(i + 1) * step if i < len(back_cols) - 1 else w] = c
    for x in range(10, w - 10, 40):
        img[8:32, x:x + 8] = ink
    return img


def test_줄_전체에_깔린_색은_한_구간으로_나온다():
    img = _one_line([(242, 253, 231)])
    got = back_of(img, [0, 0, 600, 40], "#0A0A0A")
    assert [r["hex"] for r in got["runs"]] == ["#F2FDE7"], got
    assert got["runs"][0]["ratio"] == 1.0, got


def test_줄_가운데서_끊긴_형광펜은_두_구간과_몫으로_나온다():
    # 참·거짓 한 칸으로는 못 담는 것 — 원본에서 형광펜은 줄 끝까지 안 가는 일이
    # 흔하다. 어디서 끊겼는지(x0·x1)와 얼마나 덮었는지(ratio)를 같이 남긴다.
    img = _one_line([(201, 252, 149), (201, 252, 149), (242, 253, 231)])
    got = back_of(img, [0, 0, 600, 40], "#0A0A0A")
    assert [r["hex"] for r in got["runs"]] == ["#C9FC95", "#F2FDE7"], got
    assert got["runs"][0]["x1"] == 400, got
    assert abs(got["runs"][0]["ratio"] - 2 / 3) < 0.02, got
    assert abs(got["runs"][1]["ratio"] - 1 / 3) < 0.02, got


def test_줄_안에서_색이_여러_번_갈리면_아무_색도_안_적는다():
    # 사진·무늬 위의 글자다. 그럴듯한 색 하나로 메우면 되돌려 그릴 때
    # 「제대로 잰 색」과 똑같이 생긴다 — 이 파일 전체가 고쳐 온 그 병이다.
    # 어두운 띠를 글자색(#0A0A0A)과 멀찍이 떨어뜨린다 — 글자색에 가까우면
    # 그 띠가 「글자」로 걸러져 남는 것이 한 색뿐이 된다.
    img = _one_line([(240, 240, 240), (40, 80, 220), (240, 240, 240),
                     (40, 80, 220), (240, 240, 240), (40, 80, 220)])
    got = back_of(img, [0, 0, 600, 40], "#0A0A0A")
    assert got["runs"] == [], got
    assert got["fallback"] is True, got


def test_글자색을_모르면_줄_뒤_색도_안_적는다():
    # 글자 화소를 가리는 자가 잰 글자색이다 — 그게 없으면 무엇이 바탕인지
    # 가릴 수가 없다. 「어두우면 글자」 같은 자를 대신 쓰면 어두운 바탕 위
    # 흰 글자에서 거꾸로 선다.
    img = _one_line([(242, 253, 231)])
    got = back_of(img, [0, 0, 600, 40], None)
    assert got["runs"] == [] and got["fallback"] is True, got


def test_줄_높이를_다_채운_획이_띠를_조각내지_않는다():
    # 획이 줄 높이를 다 채우면 그 세로줄에는 바탕 화소가 **하나도** 없다.
    # 그 칸을 「첫 무리」로 기본값 주면 형광펜 한가운데에 바탕색 조각이 생겨
    # 구간이 둘에서 넷으로 늘고, 그대로 MAX_RUNS 를 넘겨 통째로 버려진다.
    # 앞칸을 물려받아야 한다.
    w, h = 600, 40
    img = np.zeros((h, w, 3), np.uint8)
    img[:, :280] = (201, 252, 149)          # 형광펜 — 작은 쪽
    img[:, 280:] = (242, 253, 231)          # 바탕 — 큰 쪽(첫 무리)
    img[:, 140:160] = (10, 10, 10)          # 줄 높이를 다 채운 획
    got = back_of(img, [0, 0, w, h], "#0A0A0A")
    assert [r["hex"] for r in got["runs"]] == ["#C9FC95", "#F2FDE7"], got


@_needs_real
def test_실물_2번_장_본문은_줄마다_뒤_색이_다르다():
    """사람이 그림을 보고 짚은 것 — 「형광펜은 인식 못 하나」.

    2번 장 본문 네모 `[61,958,980,1202]` 는 네 줄이고, 형광펜은 3·4번 줄에만
    깔려 있다. 4번 줄은 「볼 수 있습니다」 앞에서 끊긴다. 덩어리 한 벌로 접으면
    이 넷이 전부 사라진다.

    줄 상자는 이 게시물의 OCR 로 묶은 값이다(`layout.group_lines`). 글자색은
    계량표에 실린 덩어리 색 `#010300` 을 그대로 쓴다.
    """
    img = np.array(Image.open(config.IMAGES / "DHqCBQnRAjW" / "02.jpg").convert("RGB"))
    assert img.shape[1] == config.CANVAS_W
    lines = [[60, 960, 965, 998], [60, 1024, 934, 1062],
             [62, 1089, 964, 1126], [60, 1153, 782, 1190]]
    got = [back_of(img, b, "#010300") for b in lines]
    assert [[r["hex"] for r in g["runs"]] for g in got] == [
        ["#F2FDE7"], ["#F2FDE7"], ["#CAFC97"], ["#CAFC97", "#F2FDE7"]], got
    # 4번 줄만 형광펜이 줄을 다 못 덮는다 — 그 몫이 참·거짓으로는 못 담는 값이다.
    assert got[3]["runs"][0]["ratio"] == 0.616, got[3]
    assert got[3]["runs"][0]["x1"] == 505, got[3]


@_needs_real
def test_실물_1번_장_사진_위_글자는_뒤_색을_안_적는다():
    # 같은 게시물의 반대 경우 — 사진 위 흰 제목. 여기에 평평한 색을 적으면
    # 되돌려 그릴 때 사진 자리에 판이 깔린다.
    img = np.array(Image.open(config.IMAGES / "DHqCBQnRAjW" / "01.jpg").convert("RGB"))
    got = back_of(img, [54, 914, 826, 1011], "#FFFFFF")
    assert got["runs"] == [] and got["fallback"] is True, got


# ---------------------------------------------------------------- 줄 단위 속성

def _two_colour_lines():
    """윗줄 흰 글자 · 아랫줄 연두 글자. 덩어리로 접으면 하나가 사라진다."""
    import calibrate
    from PIL import Image as PILImage, ImageDraw as PILDraw, ImageFont

    px = 40
    font = ImageFont.truetype(calibrate.FONT_BOLD, px)
    im = PILImage.new("RGB", (600, 160), (20, 20, 20))
    d = PILDraw.Draw(im)
    syms = []
    for y, colour in ((20, (255, 255, 255)), (90, (173, 254, 89))):
        x = 20
        for ch in "가나다라마":
            bbox = d.textbbox((x, y), ch, font=font)
            d.text((x, y), ch, font=font, fill=colour)
            syms.append({"text": ch, "box": list(bbox), "break": ""})
            x = bbox[2]
    return np.array(im), syms


def test_line_detail이_줄마다_색을_따로_적는다():
    # 덩어리의 color 는 줄색들의 **최빈값**이라 두 줄 색이 다르면 하나가 통째로
    # 사라진다. 접은 값은 그대로 두고 접기 전 것을 덧붙인다.
    import layout_labeled

    img, syms = _two_colour_lines()
    out = layout_labeled.block(img, {"symbols": syms}, [0, 0, 600, 160], 1.0, config.cal())
    assert out["lines"] == 2, out
    detail = out["line_detail"]
    assert len(detail) == 2, detail
    assert detail[0]["color"] != detail[1]["color"], detail
    # 덩어리 값은 둘 중 하나뿐이다 — 그래서 줄 값이 따로 있어야 한다.
    assert out["color"] in (detail[0]["color"], detail[1]["color"]), out
    for ln in detail:
        assert ln["pt"] and ln["weight"] in ("Bold", "Regular"), ln
        assert "back" in ln and "text" in ln and "box" in ln, ln


# ------------------------------------------------------- 사진 위 줄은 형광펜을 안 잰다

def test__photo_overlap_기하():
    import layout_labeled
    # 반쯤 겹친다.
    assert layout_labeled._photo_overlap([0, 0, 100, 100], [[50, 0, 150, 100]]) == 0.5
    # 안 겹치면 0.
    assert layout_labeled._photo_overlap([0, 0, 100, 100], [[200, 200, 300, 300]]) == 0.0
    # 네모가 없으면 0.
    assert layout_labeled._photo_overlap([0, 0, 100, 100], []) == 0.0
    # 넓이가 0인 줄 상자는 0.
    assert layout_labeled._photo_overlap([10, 10, 10, 50], [[0, 0, 100, 100]]) == 0.0


def test_사진_위에_걸친_줄은_형광펜을_안_잰다():
    # 옷·피부처럼 우연히 두 색 무리로 갈리는 사진 위 글자를 형광펜으로 오판하지
    # 않는지 — 1번 장 실물에서 실제로 틀렸던 모양이다(정장이 «형광펜 두 겹»으로
    # 읽혀 되돌려 그림에 회색 판이 생겼다). 관문이 있고 없고를 같은 화소로 대조해
    # 관문이 실제로 뭔가를 막고 있음을 보인다 — 안 그러면 «늘 fallback」인 무의미한
    # 관문일 수도 있다.
    import layout_labeled

    img = _one_line([(201, 252, 149), (242, 253, 231)])   # 관문이 없으면 confident 2구간
    lines = [{"text": "x", "box": [0, 0, 600, 40], "symbols": []}]
    gated = layout_labeled.line_detail(img, lines, ["Regular"], ["#0A0A0A"], 40.0,
                                        [[0, 0, 600, 40]])
    assert gated[0]["back"]["fallback"] is True, gated
    assert "겹친다" in gated[0]["back"]["why"], gated
    ungated = layout_labeled.line_detail(img, lines, ["Regular"], ["#0A0A0A"], 40.0, [])
    assert ungated[0]["back"].get("fallback") is not True, ungated
    assert ungated[0]["back"]["runs"], ungated  # 관문이 실제로 무언가를 막았다는 대조


@_needs_real
def test_실물_1번_장_제목_두_줄_다_사진_위라_형광펜을_안_잰다():
    """1번 장 제목 「요즘은 이 브랜드가 / SNS를 잘한대요 7」 은 두 줄 다 인물
    네모(정장 남성, `[39,256,587,1127]`)에 걸친다. 줄 상자·줄색은 새로 Vision
    을 부르지 않고 **옛 갈래가 이미 캐시해 둔 장 전체 OCR**(`data/ocr/…/01.json`,
    `fullTextAnnotation`)에서 뽑는다 — `비전읽은것._symbols()` 와 같은 파싱이다.

    **관문이 없을 때 실제로 무슨 일이 났는지**: 둘째 줄의 실측 줄색(글자 자체가
    연두라 `#ADFE59`)로 글자 화소를 가리면, 남는 화소가(정장의 검정과 그 옆
    흰 배경) 우연히 단 두 무리로 갈려 `back_of` 가 confident 한 형광펜 한 겹을
    냈다 — 되돌려 그림에서 회색 판으로 드러났고, 사람이 직접 보고 짚었다.
    """
    import layout
    import layout_labeled

    if not _REAL_OCR_01.exists():
        pytest.skip("캐시된 장 전체 OCR(data/ocr/)이 없다 — Vision 을 새로 부르지 않는다")

    img = np.array(Image.open(config.IMAGES / "DHqCBQnRAjW" / "01.jpg").convert("RGB"))
    assert img.shape[1] == config.CANVAS_W
    res = json.loads(_REAL_OCR_01.read_text(encoding="utf-8"))
    syms = _symbols(res, [0, 0, img.shape[1], img.shape[0]], 1.0)
    title_box = [54, 914, 848, 1135]   # 라벨의 제목 네모(원본 == 1080 공간)
    in_box = [s for s in syms if layout_labeled.inside(title_box, s["box"], pad=4)]
    lines = layout.group_lines(in_box)
    assert len(lines) == 2, lines
    colors = [layout.line_color(img, l) for l in lines]
    assert colors[1] == "#ADFE59", colors   # 둘째 줄 실측 줄색 — 재현됨

    photo_boxes = [[39, 256, 587, 1127]]
    overlaps = [round(layout_labeled._photo_overlap(l["box"], photo_boxes), 2) for l in lines]
    assert min(overlaps) > layout_labeled.PHOTO_OVERLAP_MAX, overlaps  # 둘 다 관문을 넘는다

    gated = layout_labeled.line_detail(img, lines, ["Bold", "Bold"], colors, 91.0, photo_boxes)
    for ln in gated:
        assert ln["back"]["fallback"] is True, ln

    # 관문을 안 주면(사진 네모를 안 넘기면) 실제로 났던 그 버그를 재현한다 —
    # 둘째 줄이 confident 한(가짜) 형광펜을 낸다.
    ungated = layout_labeled.line_detail(img, lines, ["Bold", "Bold"], colors, 91.0, [])
    assert ungated[1]["back"].get("fallback") is not True, ungated
    assert ungated[1]["back"]["runs"], ungated


# ---------------------------------------------------------------- 라벨 신선도

def _label_file(tmp_path, pid, boxes):
    d = tmp_path / "labels"
    d.mkdir(parents=True, exist_ok=True)
    (d / f"{pid}.json").write_text(json.dumps({"1": {"boxes": boxes}}), encoding="utf-8")


def test_안_받았으면_계량표가_로컬_사본이라고_적는다(monkeypatch, tmp_path):
    # 서버를 안 보고 잰 계량표는 갓 잰 것과 **글자 하나 다르지 않게** 생겼었다.
    # 출처와 시각을 계량표가 지고 있어야 그 둘이 갈린다.
    monkeypatch.setattr(config, "DATA", tmp_path)
    _label_file(tmp_path, "PID", [{"id": "a", "kind": "글자", "box": [0, 0, 1, 1]}])
    got = merge_labeled.freshness("PID")
    assert got["source"] == merge_labeled.LOCAL
    assert got["changed"] is None      # 「비교한 적 없음」 — 묵었을 수 있다는 뜻
    assert got["boxes"] == 1 and got["digest"] and got["at"]


def test_라벨이_바뀌면_지문도_바뀐다(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "DATA", tmp_path)
    _label_file(tmp_path, "PID", [{"id": "a", "kind": "글자", "box": [0, 0, 1, 1]}])
    first = merge_labeled.digest("PID")
    _label_file(tmp_path, "PID", [{"id": "a", "kind": "글자", "box": [0, 0, 2, 2]}])
    assert merge_labeled.digest("PID") != first


def test_안_받은_계량표는_사람에게_묵었다고_말한다():
    line = merge_labeled._freshness_line(
        {"source": merge_labeled.LOCAL, "at": "x", "boxes": 3, "digest": "d", "changed": None})
    assert "서버에서 받지 않았다" in line


def _board_spy(monkeypatch, changed=True):
    """게시판을 타는 세 통로를 다 가짜로 바꾸고 부른 순서를 남긴다."""
    calls = []
    monkeypatch.setattr(merge_labeled.fetch_labels, "claim",
                        lambda pid: calls.append(("claim", pid)))
    monkeypatch.setattr(merge_labeled.fetch_labels, "finish",
                        lambda pid, ok: calls.append(("finish", ok)))
    monkeypatch.setattr(merge_labeled, "_pull",
                        lambda pid: (calls.append(("pull", pid)), changed)[1])
    return calls


def test_pull이면_잡고_받고_풀어준다(monkeypatch, tmp_path):
    # 잡기(`분석중`)와 풀기는 짝이다 — 잡아놓고 안 풀면 웹이 편집을 409 로 막아
    # 사람이 손쓸 방법이 없다. publish 를 안 켰어도 잡았으면 풀어야 한다.
    _synth_overlap(tmp_path, "OVERLAP")
    monkeypatch.setattr(merge_labeled.글자읽기, "read_slide", lambda p, i, b: {})
    monkeypatch.setattr(merge_labeled.cutout, "cut_slide", lambda p, i, b: {})
    monkeypatch.setattr(merge_labeled.tone_labeled, "ask",
                        lambda p, t: merge_labeled.tone_labeled._fallback(len(t)))
    monkeypatch.setattr(config, "DATA", tmp_path)
    monkeypatch.setattr(config, "IMAGES", tmp_path / "images")
    monkeypatch.setattr(config, "MEASURES", tmp_path / "measures")
    calls = _board_spy(monkeypatch)
    doc = merge_labeled.build("OVERLAP", pull=True)
    assert calls == [("claim", "OVERLAP"), ("pull", "OVERLAP"), ("finish", True)], calls
    assert doc["labels"]["source"] == merge_labeled.SERVER
    assert doc["labels"]["changed"] is True
    # 계량표 **파일**에도 실려 있어야 한다 — 나중에 그 파일만 보고 판단한다.
    on_disk = json.loads((tmp_path / "measures" / "OVERLAP.json").read_text(encoding="utf-8"))
    assert on_disk["labels"] == doc["labels"]


@pytest.mark.parametrize("exc", [RuntimeError, KeyboardInterrupt])
def test_받다가_실패해도_잡은_것을_풀어준다(monkeypatch, exc):
    calls = _board_spy(monkeypatch)

    def boom(pid):
        raise exc("망했다")
    monkeypatch.setattr(merge_labeled, "_pull", boom)
    with pytest.raises(exc):
        merge_labeled.build("PID", pull=True)    # publish 는 껐다
    assert calls == [("claim", "PID"), ("finish", False)], calls


def test_층이_계량표에_실린다():
    """라벨에서 정한 겹침 순서가 계량표까지 와야 한다."""
    import merge_labeled as ML
    난것 = ML.merge_one({"id": "b1", "kind": "사진", "box": [0, 0, 10, 10], "층": 2},
                        cut={}, text={}, color={}, scale=1.0)
    assert 난것["층"] == 2


def test_층이_없으면_칸도_없다():
    import merge_labeled as ML
    난것 = ML.merge_one({"id": "b1", "kind": "사진", "box": [0, 0, 10, 10]},
                        cut={}, text={}, color={}, scale=1.0)
    assert "층" not in 난것


# ---------------------------------------------------------------- cutout 엔진 교체(A7)
# SAM(Worker `/api/refine`)을 뺐다 — 원형 크롭 같은 «자른 자국» 은 물체가 아니라서
# SAM 이 못 딴다(outline.py 머리 주석 실측: 원의 9.9%). 이제 cut_slide() 는
# outline.테두리따기() 로 간다.

@_needs_real
def test_누끼가_SAM_을_안_부른다(monkeypatch, tmp_path):
    """엔진이 바뀌었다 — Worker(`/api/refine`)를 부르면 안 된다."""
    # 실물 한 장으로 돌린다. 라벨의 cut:true 네모만 탄다. (라벨은 실물 경로에서 미리 읽는다 —
    # put_png() 가 config.DATA 밑에 진짜 PNG 를 쓰므로, 커밋된 실물 데이터
    # (analyze/data/cutouts/…)를 시험이 조용히 덮어쓰지 않게 config.DATA 를
    # tmp_path 로 돌린 «뒤에» 읽으면 없는 경로가 된다 — 그래서 먼저 읽는다.)
    라벨 = json.loads((config.DATA / "labels" / "DG0AA6PJ8s4.json").read_text(encoding="utf-8"))
    monkeypatch.setattr(config, "DATA", tmp_path)
    monkeypatch.setattr(cutout, "_refine",
                        lambda *a, **k: pytest.fail("SAM 을 불렀다"))
    난것 = cutout.cut_slide("DG0AA6PJ8s4", 1, 라벨["1"]["boxes"])
    assert 난것, "누끼 켠 네모가 있어야 이 시험이 뜻이 있다"


@_needs_real
def test_누끼_결과에_테두리와_가려짐이_있다(monkeypatch, tmp_path):
    # 위 시험과 같은 이유로 라벨을 먼저 읽고서 config.DATA 를 tmp_path 로 돌린다.
    라벨 = json.loads((config.DATA / "labels" / "DG0AA6PJ8s4.json").read_text(encoding="utf-8"))
    monkeypatch.setattr(config, "DATA", tmp_path)
    난것 = cutout.cut_slide("DG0AA6PJ8s4", 1, 라벨["1"]["boxes"])
    한칸 = next(iter(난것.values()))
    assert "테두리" in 한칸 and "가려짐" in 한칸
    assert 한칸.get("fallback") or (한칸["테두리"] and len(한칸["테두리"]) >= 3)


def test_1080이_아닌_그림에서_테두리가_1080_공간으로_나온다(monkeypatch, tmp_path):
    """R18 회귀 그물. 실측(2026-08-26, 내려받은 30장 가로폭): 1080폭 18장·
    1152폭 2장·1440폭 4장·1638폭 3장·3240·3263·3277폭 각 1장 — 열둘이 1080 이
    아니다. `cut_slide` 가 `테두리따기` 에 «원본 좌표» 를 그대로 주고, 나온
    «원본 해상도» 테두리 점에 `s` 를 곱해 1080 으로 옮기는지를 실제로 도형을
    그려 끝까지 확인한다. 지금까지 실측에 쓴 두 게시물(DG0AA6PJ8s4·
    DHqCBQnRAjW)이 마침 둘 다 1080 폭이라 이 어긋남을 어떤 시험도 못 밟았다."""
    import cv2

    monkeypatch.setattr(cutout, "_refine",
                        lambda *a, **k: pytest.fail("SAM 을 불렀다"))
    # put_png() 의 실물 데이터 덮어쓰기 함정(위 두 시험 참고)과 같은 자리 —
    # config.IMAGES 도 config.DATA 도 tmp_path 로 돌려 진짜 데이터를 안 건드린다.
    monkeypatch.setattr(config, "IMAGES", tmp_path / "images")
    monkeypatch.setattr(config, "DATA", tmp_path / "data")

    pid = "SYN2160"
    w, h = 2160, 2700   # 1080 의 두 배 — s = 0.5
    img = np.full((h, w, 3), (246, 243, 238), np.uint8)   # 바탕
    # 원본 좌표의 원 하나: 중심 (1000,1000) 반지름 300 → 1080 공간에서는
    # 중심 (500,500) 반지름 150 이어야 한다.
    cv2.circle(img, (1000, 1000), 300, (30, 30, 30), -1)
    (tmp_path / "images" / pid).mkdir(parents=True)
    Image.fromarray(img).save(tmp_path / "images" / pid / "01.jpg")

    native_box = [700, 700, 1300, 1300]   # 원을 감싸는 원본 좌표 네모
    out = cutout.cut_slide(pid, 1, [{"id": "a", "kind": "도형", "box": native_box, "cut": True}])

    한칸 = out["a"]
    assert not 한칸.get("fallback"), 한칸.get("why")
    테두리 = np.array(한칸["테두리"], float)
    # 모든 점이 1080 공간(가로 0~1080) 안에 있어야 한다 — s 를 안 곱했다면
    # 원본 좌표(0~2160)가 그대로 새어나와 이 문턱을 넘는다.
    assert 테두리[:, 0].max() <= config.CANVAS_W + 1, "x 가 1080 공간을 벗어났다 — s 를 안 곱한 것"
    assert 테두리[:, 0].min() >= -1
    중심 = 테두리.mean(axis=0)
    assert abs(중심[0] - 500) < 10 and abs(중심[1] - 500) < 10, f"중심이 1080 공간의 (500,500) 근처가 아니다: {중심}"


# A9 — 도형 색을 잰다. 브리프의 `ML.칸색(img, region, 위에얹힌=[])` 은 이 파일에
# 그런 이름·시그니처로 없다. `_build()`(merge_labeled.py:538~545)를 읽으면
# 실제로는 갈래가 **둘로 갈린다** — 「도형」처럼 COLOR_SKIP 에 없는 종류는
# `_color_of(img, region, text_boxes)` 를 타고, 「로고」처럼 COLOR_SKIP 에 든
# 종류는 `_color_of` 근처에도 안 가고 `no_color(kind)` 로 바로 빠진다. 그래서
# 아래 두 시험은 서로 다른 함수를 부른다 — 이름·단언은 브리프 그대로,
# 부르는 법만 실제 갈림에 맞췄다.
def test_도형은_색을_잰다():
    """검은 알약의 «검은색» 이 살아야 한다. 로고로 그으면 설계상 버려진다."""
    import merge_labeled as ML
    img = np.full((200, 200, 3), (255, 255, 255), np.uint8)
    img[50:150, 20:180] = (17, 17, 17)          # 검은 띠
    난것 = ML._color_of(img, {"kind": "도형", "box": [20, 50, 180, 150]}, [])
    assert 난것["kind"] == "단색"
    assert 난것["hex"].upper() in ("#111111", "#101010", "#121212"), 난것


def test_로고는_여전히_색을_안_잰다():
    """사람 결정 2026-08-20 — 로고는 자리만 쓴다. 바뀐 게 아니다.

    로고는 `_color_of` 를 아예 안 탄다 — `_build()` 가 COLOR_SKIP 에서 걸러
    `no_color()` 로 바로 보낸다. 그래서 여기서 부르는 것도 `no_color` 다.
    """
    import merge_labeled as ML
    난것 = ML.no_color("로고")
    assert 난것["by_design"] is True
    assert 난것["hex"] is None


def test_도형_위에_얹힌_글자는_색_계산에서_뺀다():
    """알약 위의 글자를 같이 세면 색이 섞인다."""
    import merge_labeled as ML
    img = np.full((200, 200, 3), (255, 255, 255), np.uint8)
    img[50:150, 20:180] = (17, 17, 17)          # 검은 띠
    img[80:120, 60:140] = (169, 237, 102)       # 알약 위 초록 글자
    난것 = ML._color_of(img, {"kind": "도형", "box": [20, 50, 180, 150]},
                        [[60, 80, 140, 120]])
    assert 난것["hex"].upper() in ("#111111", "#101010", "#121212"), 난것


# ─────────────────────── 사람이 배경을 사진이라고 못 박을 때 (2026-08-27)
def test_사람이_배경_사진이라_하면_그대로_따른다():
    """**기계가 조용히 틀릴 자리가 있다.**

    흐릿한 하늘처럼 «거의 한 색인 사진 배경» 은 단색으로 본다. 그러면 카드가
    평평한 색으로 나오는데 계량표는 멀쩡해 보인다 — 사람이 보면 못 박을 수
    있어야 한다.
    """
    import numpy as np
    import merge_labeled as M
    흰판 = np.full((1350, 1080, 3), 250, np.uint8)      # 기계는 단색이라 볼 것
    기계 = M.background(흰판, [])
    assert 기계["kind"] == "단색", 기계
    사람 = M.background(흰판, [], 사람말=True)
    assert 사람["kind"] == "사진"
    assert 사람["by"] == "사람"
    # **기계가 잰 것을 지우지 않는다** — 어긋난 자리를 나중에 찾아봐야 규칙을 고친다
    assert 사람["기계판정"] == "단색"


def test_사람이_말_안_하면_기계_판정_그대로다():
    import numpy as np
    import merge_labeled as M
    흰판 = np.full((1350, 1080, 3), 250, np.uint8)
    난것 = M.background(흰판, [], 사람말=False)
    assert 난것["kind"] == "단색"
    assert "기계판정" not in 난것, "안 건드렸으면 자국도 안 남긴다"


def test_글자를_재나가_셋을_한_뜻으로_가른다():
    """읽는 곳이 셋이라(OCR·글자 재기·배경 잔여) 갈리면 반쪽 상태가 난다."""
    import config
    assert config.글자를_재나({"kind": "글자"}) is True
    # 「안에 글자 있다」 는 2026-09-16 에 뺐다 — 옛 라벨에 남아 있어도 안 읽는다(2026-09-19,
    # 실물 DSW 8번 장: 도형의 옛 표시 + 따로 그은 글자 네모 = 글자칸 두 벌 → 배치 막힘)
    assert config.글자를_재나({"kind": "도형", "글자있음": True}) is False
    assert config.글자를_재나({"kind": "도형"}) is False
    assert config.글자를_재나({"kind": "사진", "글자있음": False}) is False


def test_장식은_누끼_열쇠를_싣는다():
    """장식은 원본 그대로 복사한다(사람 결정 2026-09-17, ㉠).
    누끼 PNG 는 이미 `cutout.put_png` 가 만든다 — 열쇠만 흘려보내면 된다."""
    r = {"id": "b1", "kind": "장식", "box": [10, 10, 90, 90],
         "cutout": {"png": "ABC/02/b1.png", "테두리": [[10, 10], [90, 10], [90, 90]],
                    "구멍": [], "가려짐": 0.0, "why": None}}
    난것 = merge_labeled._장식기록(r)
    assert 난것["누끼열쇠"] == "ABC/02/b1.png"


def test_장식이_아니면_누끼_열쇠를_안_싣는다():
    """도형은 다시 그리는 것이고 로고·사진은 빈 자리다 — 복사하면
    남의 로고가 우리 카드뉴스에 박힌다."""
    for 갈래 in ("도형", "로고", "사진"):
        r = {"id": "b2", "kind": 갈래, "box": [0, 0, 10, 10],
             "cutout": {"png": "ABC/02/b2.png"}}
        assert "누끼열쇠" not in merge_labeled._장식기록(r)


# ── 고칠 수 없는 탈은 안 삼킨다 ─────────────────────────────────────
#
# 실물 2026-09-19: 대본 모델을 딥시크로 옮기면서 람다에 열쇠를 안 실었다.
# `ask()` 가 그 실패까지 조용히 삼켜 **골격 여덟 장이 전부 「미정」인 틀**을
# 만들고도 `ok: true` 를 냈다. 값을 직접 안 봤으면 아홉 벌을 더 깨뜨릴 뻔했다.
#
# 가르는 잣대는 **「다시 해서 달라질 수 있나」** 다. 열쇠가 없거나 틀렸거나
# 잔액이 없는 것은 열 번 해도 열 번 같다 — 그때는 분석을 **실패시켜야** 한다.
# 모델이 이상한 JSON 을 준 것은 다시 하면 달라질 수 있으니 그대로 미정으로 둔다.

def test_열쇠가_없으면_미정으로_안_넘어가고_터뜨린다(monkeypatch):
    import tone_labeled

    monkeypatch.setattr(대본짓기, "부르기",
                        _가짜모델(대본짓기.모델탈("no_api_key", "열쇠가 비었다")))
    with pytest.raises(대본짓기.모델탈) as 난것:
        tone_labeled.ask("pid", ["1번 장", "2번 장"])
    assert 난것.value.코드 == "no_api_key"


def test_잔액이_없어도_터뜨린다(monkeypatch):
    import tone_labeled

    monkeypatch.setattr(대본짓기, "부르기", _가짜모델(대본짓기.모델탈("402", "돈이 없다")))
    with pytest.raises(대본짓기.모델탈):
        tone_labeled.ask("pid", ["1번 장"])


def test_열쇠가_틀려도_터뜨린다(monkeypatch):
    import tone_labeled

    monkeypatch.setattr(대본짓기, "부르기", _가짜모델(대본짓기.모델탈("401", "열쇠 틀림")))
    with pytest.raises(대본짓기.모델탈):
        tone_labeled.ask("pid", ["1번 장"])


def test_이상한_JSON_은_그대로_미정으로_넘어간다(monkeypatch):
    # 다시 하면 달라질 수 있는 탈이다. 이것까지 터뜨리면 계량 전체를 잃는다.
    import tone_labeled

    monkeypatch.setattr(대본짓기, "부르기", _가짜모델("이건 JSON 이 아니다"))
    out = tone_labeled.ask("pid", ["1번 장", "2번 장"])
    assert all(s["role"] == "미정" for s in out["slides"])


def test_잠깐_막힌_것도_미정으로_넘어간다(monkeypatch):
    # 429 는 다시 하면 될 수 있다. 계량을 다 버릴 만한 탈이 아니다.
    import tone_labeled

    monkeypatch.setattr(대본짓기, "부르기",
                        _가짜모델(대본짓기.모델탈("429", "붐빈다", True)))
    out = tone_labeled.ask("pid", ["1번 장"])
    assert out["slides"][0]["role"] == "미정"


def test_생각하다_넘친_것도_터뜨린다(monkeypatch):
    # `대본짓기` 가 여유를 늘려 가며 세 번 걸어 본 뒤에야 이 탈을 낸다.
    # 거기까지 갔으면 다시 해도 같다 — 미정으로 물러서면 못 쓰는 틀이 나간다.
    import tone_labeled

    monkeypatch.setattr(대본짓기, "부르기",
                        _가짜모델(대본짓기.모델탈("thinking_overflow", "넘쳤다")))
    with pytest.raises(대본짓기.모델탈):
        tone_labeled.ask("pid", ["1번 장"])

def test_tint_가_판정을_포기한_도형은_모양_안쪽에서_다시_잰다():
    """`tint.judge` 는 유효 격자가 4칸 미만이면 판정을 포기하고 최빈색을
    «참고값» 으로만 남긴다(`kind: 미측정`, `hex` 는 있음). 여태 `hex` 가 있다는
    이유로 그 갈림길을 지나쳐서, 색을 제대로 재 놓고도 「미측정」 도장이 찍혀
    틀에 안 실렸다 — 실물 DSW-6lrk5rs 9장의 연파랑 알약 넷이 구운 그림에서
    통째로 사라졌다(사람 지적 2026-09-19)."""
    import numpy as np
    import merge_labeled as M

    # 가로로 긴 연파랑 알약에 글자가 가운데를 꽉 채운 꼴
    img = np.full((200, 900, 3), (208, 235, 255), dtype=np.uint8)
    img[70:130, 60:840] = (2, 5, 9)                    # 글자 덩이
    region = {"kind": "도형", "box": [40, 40, 860, 160]}
    글자칸 = [[60, 70, 840, 130]]
    난것 = M._color_of(img, region, 글자칸)
    assert 난것["kind"] in ("단색", "으뜸색"), 난것
    assert 난것["hex"].upper() == "#D0EBFF", 난것
