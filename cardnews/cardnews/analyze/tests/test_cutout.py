# -*- coding: utf-8 -*-
"""누끼 오리기 — **사람이 그린 테두리가 기계보다 우선이다.**

기본은 네모다. 원·별처럼 네모로 못 담는 것만 사람이 라벨링 화면에서 직접
그리고, 그러면 `cut_slide` 가 흘려채우기를 아예 안 돌린다. 그 갈림과, 갈릴
때 무엇이 달라지는지(이웃 네모로 안 자른다)를 여기서 잰다.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))


# ─────────────────────────────── 사람이 직접 그린 테두리
def test_그린테두리는_그린_대로_채운다():
    """도형 목록도 흘려채우기도 안 거친다 — 사람이 준 점을 그대로 메운다."""
    import numpy as np
    from cutout import 그린테두리
    rgb = np.zeros((200, 200, 3), dtype=np.uint8)
    난것 = 그린테두리(rgb, [[50, 50], [150, 50], [150, 150], [50, 150]])
    assert 난것["못땄음"] is None
    assert 난것["구멍"] == []
    assert 난것["가려짐"] == 0.0
    # 100×100 네모를 그렸다. fillPoly 는 경계를 포함하므로 10,000 언저리다.
    켜짐 = int(난것["마스크"].sum())
    assert 9_500 <= 켜짐 <= 10_300, 켜짐
    assert 난것["테두리"] == [[50.0, 50.0], [150.0, 50.0], [150.0, 150.0], [50.0, 150.0]]


def test_그린테두리가_화면_밖이면_못땄다고_한다():
    import numpy as np
    from cutout import 그린테두리
    rgb = np.zeros((200, 200, 3), dtype=np.uint8)
    난것 = 그린테두리(rgb, [[-90, -90], [-50, -90], [-50, -50]])
    assert 난것["마스크"] is None
    assert "화면 밖" in 난것["못땄음"]


def test_그린_것이_있으면_흘려채우기를_안_돌린다(tmp_path, monkeypatch):
    """**이웃 네모로 안 자른다** — 가려진 데까지 사람이 이어 그렸기 때문이다.

    실측(DG0AA6PJ8s4 1번 장): 사진 네모의 19.7%가 옆 «글자» 네모와 겹쳐,
    기계가 딴 원은 밑에서 자로 그은 듯 평평하게 끊겼다. 사람이 그리면 그
    아랫자락이 그대로 살아야 한다.
    """
    import numpy as np
    import cutout
    from PIL import Image
    호출 = []
    monkeypatch.setattr(cutout.outline, "테두리따기",
                        lambda *a, **k: 호출.append(a) or {"못땄음": "부르면 안 된다"})
    터 = tmp_path / "P" ; 터.mkdir(parents=True)
    Image.new("RGB", (200, 200), (255, 255, 255)).save(터 / "01.jpg")
    monkeypatch.setattr(cutout.config, "IMAGES", tmp_path)
    monkeypatch.setattr(cutout, "put_png", lambda *a: "가짜.png")
    원 = [[100 + 40 * np.cos(t), 100 + 40 * np.sin(t)]
         for t in np.linspace(0, 2 * np.pi, 24, endpoint=False)]
    네모들 = [{"id": "a", "box": [60, 60, 140, 140], "테두리": 원},
            {"id": "b", "box": [55, 120, 145, 190]}]     # 원 아랫자락을 덮는 이웃
    난것 = cutout.cut_slide("P", 1, 네모들)
    # 이웃 네모(b)는 자동으로 해 보는 게 맞다. 사람이 그린 네모(a)만 안 거쳐야 한다.
    잰네모 = [c[1] for c in 호출]
    assert [60, 60, 140, 140] not in 잰네모, f"사람이 그렸는데 기계 누끼를 돌렸다: {잰네모}"
    assert "a" in 난것 and not 난것["a"].get("fallback"), 난것
    y들 = [y for _, y in 난것["a"]["테두리"]]
    # 이웃이 y=120 아래를 덮고 있다. 잘렸다면 여기서 멈춘다.
    assert max(y들) > 130, f"이웃 네모에 잘렸다 — 아래 끝이 {max(y들):.0f}"
    assert 난것["a"]["가려짐"] == 0.0


def _장(tmp_path, monkeypatch, 그림):
    """`cut_slide` 를 돌릴 수 있게 그림 하나를 깔아 둔다."""
    from PIL import Image
    import cutout
    터 = tmp_path / "P"
    터.mkdir(parents=True, exist_ok=True)
    Image.fromarray(그림).save(터 / "01.jpg", quality=100)
    monkeypatch.setattr(cutout.config, "IMAGES", tmp_path)
    monkeypatch.setattr(cutout, "put_png", lambda *a: "가짜.png")
    return cutout


def test_사람이_안_켜도_도형이면_자동으로_딴다(tmp_path, monkeypatch):
    """도형·장식은 «그 자체가 디자인» 이라 사람이 안 켜도 딴다.

    사진·로고·글자는 «새 내용이 들어갈 자리» 라 안 딴다 — 아래 시험 참고.
    """
    import numpy as np
    import cv2
    그림 = np.full((300, 300, 3), 255, np.uint8)
    cv2.circle(그림, (150, 150), 90, (30, 40, 200), -1)
    cutout = _장(tmp_path, monkeypatch, 그림)
    난것 = cutout.cut_slide("P", 1, [{"id": "c", "kind": "도형", "box": [50, 50, 250, 250]}])
    assert "c" in 난것 and not 난것["c"].get("fallback"), 난것
    # `cut_slide` 는 결과를 1080 폭으로 옮겨 담는다 — 그림이 300폭이니 3.6배다.
    배 = 1080 / 300
    테 = 난것["c"]["테두리"]
    r = [np.hypot(x - 150 * 배, y - 150 * 배) for x, y in 테]
    assert 90 * 배 * 0.94 <= min(r) and max(r) <= 90 * 배 * 1.06, (min(r), max(r))


def test_글자만_있는_네모는_자동으로_안_딴다(tmp_path, monkeypatch):
    """잉크는 도형이 아니다. 실측으로 본문 글자 네모의 네모대비는 0.016 이었다."""
    import numpy as np
    import cv2
    그림 = np.full((300, 300, 3), 255, np.uint8)
    for i in range(4):
        cv2.putText(그림, "ABC", (60, 90 + i * 40), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 0, 0), 3)
    cutout = _장(tmp_path, monkeypatch, 그림)
    assert cutout.cut_slide("P", 1, [{"id": "t", "box": [40, 40, 260, 260]}]) == {}


def test_종류_없는_네모는_자동으로_안_딴다(tmp_path, monkeypatch):
    """종류가 도형·장식이 아니면 자리일 뿐이다. (옛 «꽉 채운 사각 사진» 문지기는 뺐다 —
    2026-09-19, 딱 맞게 그은 알약 97~99% 를 사진으로 오해해 버렸다.)"""
    import numpy as np
    그림 = np.full((300, 300, 3), 255, np.uint8)
    그림[60:240, 60:240] = (40, 90, 160)
    cutout = _장(tmp_path, monkeypatch, 그림)
    assert cutout.cut_slide("P", 1, [{"id": "p", "box": [60, 60, 240, 240]}]) == {}


def test_사람이_켠_것은_실패해도_못땄다고_남긴다(tmp_path, monkeypatch):
    """명시한 답은 조용히 버리지 않는다 — 자동으로 해 본 것과 다른 점이다.

    뜻이 바뀐 시험(2026-09-17). 예전엔 세로 그라데이션을 써서 옛 문지기
    («네모 둘레가 한 색인가»)에서 걸리게 했다. 새 문지기는 «결과가 네모를
    얼마나 채웠나» 만 보는데, 가파른 그라데이션은 흘려채우기가 가운데를 못
    채워 오히려 «찾았다» 고 오인할 수 있어(analyze/tests/test_outline.py 의
    `test_물체_없는_가파른_그라데이션은_못_딴다` 참고) 이 시험엔 안 맞다.
    대신 물체가 하나도 없는 민바탕을 쓴다 — 어떤 문지기로도 확실히 못 딴다.
    """
    import numpy as np
    그림 = np.full((300, 300, 3), (250, 248, 244), np.uint8)
    cutout = _장(tmp_path, monkeypatch, 그림)
    난것 = cutout.cut_slide("P", 1, [{"id": "x", "box": [60, 60, 240, 240], "cut": True},
                                    {"id": "y", "box": [10, 10, 60, 60]}])
    assert 난것["x"]["fallback"] is True
    assert "y" not in 난것, "자동으로 해 본 것은 조용히 넘어가야 한다"


def test_사람이_기울인_각도가_그린_테두리에_먹는다():
    """**화면이 보여 준 것과 분석이 보는 것이 같아야 한다.**

    라벨의 `angle` 은 파이썬이 여태 안 읽던 칸이라, 30° 로 기울인 삼각형이
    저장에는 0° 그대로 들어 있었다(실측 2026-08-26). 화면은 캔버스를 돌려
    기울어 보여 주는데 계량표는 안 기운 것을 잰다 — 사람이 알 길이 없다.
    """
    import numpy as np
    from cutout import 그린테두리
    rgb = np.zeros((400, 400, 3), dtype=np.uint8)
    box = [100, 100, 300, 300]              # 가운데 (200, 200)
    네모 = [[100, 100], [300, 100], [300, 300], [100, 300]]
    안기움 = 그린테두리(rgb, 네모, box, 0)
    기움 = 그린테두리(rgb, 네모, box, 45)
    assert 안기움["못땄음"] is None and 기움["못땄음"] is None
    # 45° 돌린 정사각형은 마름모가 된다 — 넓이는 그대로, 조인 상자는 √2 배.
    사각 = np.nonzero(안기움["마스크"])
    마름 = np.nonzero(기움["마스크"])
    폭 = lambda ys, xs: (xs.max() - xs.min() + 1, ys.max() - ys.min() + 1)
    w0, h0 = 폭(*사각)
    w1, h1 = 폭(*마름)
    assert abs(w1 / w0 - 2 ** 0.5) < 0.05, (w0, w1)
    assert abs(h1 / h0 - 2 ** 0.5) < 0.05, (h0, h1)
    # 가운데는 그대로다 — 네모 가운데를 축으로 돌았다
    assert abs((마름[1].min() + 마름[1].max()) / 2 - 200) < 2
    assert abs((마름[0].min() + 마름[0].max()) / 2 - 200) < 2
    # **돌려주는 테두리도 같이 돌아야 한다.** 마스크만 돌리고 테두리는 원본을
    # 그대로 내면 둘이 갈린다 — 실측으로 30° 별에서 220px 어긋났다. 마스크는
    # 색을 재고 테두리는 틀에 실려 굽는 쪽이 그린다.
    돈네모 = 기움["테두리"]
    import math
    for (x0, y0), (x1, y1) in zip(네모, 돈네모):
        dx, dy = x0 - 200, y0 - 200
        t = math.radians(45)
        기대 = (200 + dx * math.cos(t) - dy * math.sin(t),
              200 + dx * math.sin(t) + dy * math.cos(t))
        assert math.hypot(x1 - 기대[0], y1 - 기대[1]) < 0.01, (x1, y1, 기대)


def test_기울기가_0이면_한_점도_안_움직인다():
    import numpy as np
    from cutout import 그린테두리
    rgb = np.zeros((300, 300, 3), dtype=np.uint8)
    점 = [[50, 50], [150, 50], [150, 150], [50, 150]]
    assert 그린테두리(rgb, 점, [50, 50, 150, 150], 0)["테두리"] == [[50.0, 50.0], [150.0, 50.0],
                                                          [150.0, 150.0], [50.0, 150.0]]


def test_사진_자리는_자동으로_안_딴다(tmp_path, monkeypatch):
    """**자리는 «새 내용이 들어갈 곳» 이다.**

    실물(DNUFIa4NIkK 2번 장): 파란 바탕에 얹힌 아기 얼굴 사진의 윤곽을 114점으로
    땄다. 그 자리는 새 사진이 들어갈 곳인데 아기 머리 모양으로 잘리게 된다.
    """
    import numpy as np
    import cv2
    그림 = np.full((300, 300, 3), 255, np.uint8)
    cv2.circle(그림, (150, 150), 90, (30, 40, 200), -1)
    cutout = _장(tmp_path, monkeypatch, 그림)
    네모 = [50, 50, 250, 250]
    assert cutout.cut_slide("P", 1, [{"id": "p", "kind": "사진", "box": 네모}]) == {}
    assert cutout.cut_slide("P", 1, [{"id": "l", "kind": "로고", "box": 네모}]) == {}
    assert cutout.cut_slide("P", 1, [{"id": "t", "kind": "글자", "box": 네모}]) == {}
    # 도형·장식은 그 자체가 디자인이라 딴다
    for 종류 in ("도형", "장식"):
        난것 = cutout.cut_slide("P", 1, [{"id": "d", "kind": 종류, "box": 네모}])
        assert "d" in 난것 and not 난것["d"].get("fallback"), 종류


def test_사람이_켜면_종류를_안_가린다(tmp_path, monkeypatch):
    """명시한 답은 그대로 따른다 — 옛 라벨의 `cut:true` 도 살아 있어야 한다."""
    import numpy as np
    import cv2
    그림 = np.full((300, 300, 3), 255, np.uint8)
    cv2.circle(그림, (150, 150), 90, (30, 40, 200), -1)
    cutout = _장(tmp_path, monkeypatch, 그림)
    난것 = cutout.cut_slide("P", 1, [{"id": "p", "kind": "사진",
                                    "box": [50, 50, 250, 250], "cut": True}])
    assert "p" in 난것 and not 난것["p"].get("fallback")


def test_선만_있는_도형도_자동창을_지난다():
    """실물 2026-09-17, ④ #키워드 알약 — 고리는 네모의 43.5% 라 아랫문턱
    0.5 에 걸렸다. 테두리 «안» 으로 세면 81.1% 다."""
    import numpy as np
    import cv2 as _cv
    import cutout
    import outline
    img = np.full((300, 400, 3), (250, 250, 248), np.uint8)
    _cv.ellipse(img, (200, 150), (150, 60), 0, 0, 360, (40, 40, 40), 6)
    난것 = outline.테두리따기(img, [45, 85, 355, 215])
    assert 난것["못땄음"] is None
    assert cutout._찬몫(난것, [45, 85, 355, 215]) >= cutout.자동창[0]
