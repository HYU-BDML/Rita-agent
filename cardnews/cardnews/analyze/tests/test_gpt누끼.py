# -*- coding: utf-8 -*-
"""«GPT 누끼»(2026-09-19 사용자 확정) — GPT Image 2.5 low 가 준 투명도만 마스크로 쓰고
색은 원본 화소를 쓴다. 망은 안 탄다: `부르기` 를 가짜로 바꿔 알파만 돌려준다."""
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import gpt누끼  # noqa: E402
import outline  # noqa: E402


def _종이_위_카드():
    """크림색 종이(1000×600)에 흰 카드 하나(200,100)-(700,400). 옆에 검은 글자 덩이."""
    img = np.full((600, 1000, 3), (241, 255, 229), np.uint8)
    img[100:400, 200:700] = (255, 255, 255)
    img[120:160, 720:900] = (20, 20, 20)
    return img


def _RGBA(조각, 알파):
    """조각 화소에 알파를 붙여 GPT 가 돌려주는 모양(RGBA)으로 만든다."""
    return np.dstack([np.asarray(조각), np.asarray(알파, np.uint8)]).astype(np.uint8)


def _가짜부르기(판, 말=None):
    """조각에서 «흰 카드» 자리만 불투명하게 돌려준다 — GPT 가 잘 답한 셈."""
    arr = np.asarray(판)
    흰 = (arr == 255).all(axis=2)
    return _RGBA(판, 흰 * 255)


def test_알파를_원본_자리로_되돌려_원본_화소를_오린다():
    img = _종이_위_카드()
    box = [200, 100, 700, 400]
    r = gpt누끼.따기(img, box, 이웃=[[720, 120, 900, 160]], 부르기=_가짜부르기)
    assert r["못땄음"] is None
    m = r["마스크"]
    assert m.shape == img.shape[:2]
    # 카드 자리는 거의 다 잡히고(가장자리 2px 여유), 카드 밖 종이는 안 잡힌다
    assert m[110:390, 210:690].mean() > 0.99
    assert m[:90, :].sum() == 0 and m[:, 720:].sum() == 0
    assert len(r["테두리"]) >= 4 and r["구멍"] == []
    assert r["가려짐"] == pytest.approx(0.0)


def test_가로로_긴_조각도_비가_안_바뀐다():
    """1024 정사각형에 여백을 붙여 보내므로 되돌린 마스크가 어긋나지 않는다 —
    실측(2026-09-19, 파란 상자 837×242): 비를 바꾸면 오른쪽 테두리가 얇아졌다."""
    img = np.full((300, 1200, 3), (241, 255, 229), np.uint8)
    img[40:260, 60:1140] = (255, 255, 255)
    r = gpt누끼.따기(img, [60, 40, 1140, 260], 부르기=_가짜부르기)
    m = r["마스크"]
    ys, xs = np.where(m)
    assert abs(xs.min() - 60) <= 4 and abs(xs.max() - 1139) <= 4
    assert abs(ys.min() - 40) <= 4 and abs(ys.max() - 259) <= 4


def test_전부_투명이면_못땄음():
    img = _종이_위_카드()
    r = gpt누끼.따기(img, [200, 100, 700, 400], 부르기=lambda 판, 말=None: _RGBA(판, np.zeros(np.asarray(판).shape[:2])))
    assert r["마스크"] is None and r["못땄음"]


def test_이웃을_안_덮고_원본_조각을_그대로_보낸다():
    """묘비(2026-09-19). 이웃을 배경색으로 덮는 것은 흘려채우기가 색만 보고 번지기
    때문에 필요한 준비다. GPT 는 그림을 보고 판단하니 그 준비가 되레 볼 것을 지운다 —
    실물 키키 하트에서 제목 글자칸과 알약이 하트를 91% 덮어 «흰 종이 한 장» 이 갔고,
    GPT 는 빈 그림을 받아 확성기를 지어냈다."""
    img = _종이_위_카드()
    본것 = {}

    def 부르기(조각, 말=None):
        본것["조각"] = np.asarray(조각).copy()
        return _가짜부르기(조각)

    gpt누끼.따기(img, [150, 80, 950, 420], 이웃=[[720, 120, 900, 160]], 부르기=부르기)
    조각 = 본것["조각"]
    assert ((조각 < 40).all(axis=2)).any(), "옆 글자를 지우지 않고 그대로 보내야 한다"


def test_열쇠가_없으면_안_켜진다(monkeypatch):
    """OpenAI 나 fal 어느 쪽이든 하나 있으면 켠다(2026-09-19: 로컬은 OpenAI 직접)."""
    monkeypatch.delenv("FAL_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    assert gpt누끼.있나() is False
    monkeypatch.setenv("FAL_KEY", "x" * 10)
    assert gpt누끼.있나() is True
    monkeypatch.delenv("FAL_KEY", raising=False)
    monkeypatch.setenv("OPENAI_API_KEY", "x" * 10)
    assert gpt누끼.있나() is True


def test_흘려채우기와_같은_모양을_돌려준다():
    """`cutout` 이 둘을 같은 자리에 꽂아 쓴다. GPT 쪽만 «그림»(그린 RGBA)을 더 얹는다."""
    img = _종이_위_카드()
    a = gpt누끼.따기(img, [200, 100, 700, 400], 부르기=_가짜부르기)
    b = outline.테두리따기(img, [200, 100, 700, 400])
    assert set(a) - set(b) == {"그림", "그림자리"}
    assert set(b) - set(a) == set()
    assert a["그림"].shape[2] == 4


def test_cut_slide는_장식만_GPT를_부르고_도형은_흘려채우기다(monkeypatch, tmp_path):
    """사람 결정 2026-09-19 ㄴ — 도형은 흘려채우기도 잘 땄으니 돈·시간을 안 쓴다."""
    import config, cutout
    img = _종이_위_카드()
    d = tmp_path / "images" / "P"; d.mkdir(parents=True)
    from PIL import Image
    Image.fromarray(img).save(d / "01.jpg", format="PNG")
    monkeypatch.setattr(config, "IMAGES", tmp_path / "images")
    monkeypatch.setattr(config, "DATA", tmp_path)
    monkeypatch.setattr(cutout, "put_png", lambda pid, index, id_, png: f"{pid}/{id_}.png")
    monkeypatch.setenv("FAL_KEY", "x" * 10)
    부른것 = []

    def 가짜따기(rgb, box, 이웃=(), **k):
        부른것.append(box)
        return outline.테두리따기(rgb, box, 이웃=이웃)

    monkeypatch.setattr(gpt누끼, "따기", 가짜따기)
    cutout.cut_slide("P", 1, [{"id": "s", "kind": "도형", "box": [200, 100, 700, 400]}])
    assert 부른것 == []
    cutout.cut_slide("P", 1, [{"id": "d", "kind": "장식", "box": [200, 100, 700, 400]}])
    assert 부른것 == [[200, 100, 700, 400]]


def test_떨어진_덩어리도_다_남긴다():
    """장식이 글자 한 줄(«<국내 유통 구조>»)이면 글자마다 덩어리가 따로다 — 가장 큰 것만
    남기면 «<국내» 만 남는다(실물 DSC61jCEusn 3장). 잡티(0.2% 미만)만 버린다."""
    img = np.full((300, 1000, 3), (241, 255, 229), np.uint8)
    for x in (100, 300, 500, 700):
        img[100:200, x:x + 120] = (20, 20, 20)          # 글자 넷
    img[250:252, 900:902] = (20, 20, 20)                  # 잡티

    def 부르기(판, 말=None):
        arr = np.asarray(판); return _RGBA(판, (arr < 60).all(axis=2) * 255)

    r = gpt누끼.따기(img, [80, 80, 940, 260], 부르기=부르기)
    m = r["마스크"]
    for x in (100, 300, 500, 700):
        assert m[150, x + 60], f"{x} 자리 글자가 빠졌다"
    assert not m[251, 901]


def test_cut_slide는_얇은_장식도_버리지_않는다(monkeypatch, tmp_path):
    """흘려채우기용 «네모의 50% 미만이면 도형 아님» 은 GPT 결과엔 안 맞는다 — 글자 한 줄
    장식은 14% 다. 위쪽(97% 초과 = 사각 사진) 문지기는 그대로."""
    import config, cutout
    img = _종이_위_카드()
    img[150:170, 250:650] = (20, 20, 20)                 # 얇은 글줄
    d = tmp_path / "images" / "P"; d.mkdir(parents=True)
    from PIL import Image
    Image.fromarray(img).save(d / "01.jpg", format="PNG")
    monkeypatch.setattr(config, "IMAGES", tmp_path / "images")
    monkeypatch.setattr(config, "DATA", tmp_path)
    monkeypatch.setattr(cutout, "put_png", lambda pid, index, id_, png: f"{pid}/{id_}.png")
    monkeypatch.setenv("FAL_KEY", "x" * 10)

    진짜따기 = gpt누끼.따기

    def 가짜따기(rgb, box, 이웃=(), **k):
        return 진짜따기(rgb, box, 이웃=이웃, 부르기=lambda 판, 말=None: _RGBA(판, (np.asarray(판) < 60).all(axis=2) * 255))

    monkeypatch.setattr(gpt누끼, "따기", 가짜따기)
    out = cutout.cut_slide("P", 1, [{"id": "d", "kind": "장식", "box": [200, 100, 700, 400]}])
    assert "d" in out and out["d"].get("png")


def test_밑판이_있으면_지시문에_그_색을_적는다():
    """장식이 단색 도형 «위» 에 있으면 그 색을 알려 준다 — 안 알려 주면 GPT 가 그 면을
    요소로 보고 통째로 남긴다(실물 키키 하트: 투명 0%)."""
    img = np.zeros((400, 900, 3), np.uint8)
    img[150:250, 300:700] = (180, 240, 90)
    본것 = {}

    def 부르기(조각, 말=None):
        본것["말"] = 말
        return _RGBA(조각, (np.asarray(조각)[..., 1] > 200) * 255)

    gpt누끼.따기(img, [300, 150, 700, 250], 부르기=부르기, 밑판색="#000000")
    assert "#000000" in 본것["말"] and "transparent" in 본것["말"]

    gpt누끼.따기(img, [300, 150, 700, 250], 부르기=부르기)
    assert "#000000" not in 본것["말"]


def test_네모를_통째로_요소라_하면_버린다():
    img = np.zeros((300, 400, 3), np.uint8)
    img[100:200, 150:250] = (180, 240, 90)
    r = gpt누끼.따기(img, [150, 100, 250, 200],
                  부르기=lambda 판, 말=None: _RGBA(판, np.full(np.asarray(판).shape[:2], 255)))
    assert r["마스크"] is None and "통째로" in r["못땄음"]


def test_그린_그림은_라벨_네모가_아니라_여유까지_품은_자리다():
    """자르는 쪽이 이 자리를 안 쓰면 여유(8px)만큼 밀려 장식이 커지고 어긋난다."""
    img = _종이_위_카드()
    r = gpt누끼.따기(img, [200, 100, 700, 400], 부르기=_가짜부르기)
    gx0, gy0 = r["그림자리"]
    assert (gx0, gy0) == (200 - outline.여유, 100 - outline.여유)
    assert r["그림"].shape[:2] == (400 - 100 + outline.여유 * 2, 700 - 200 + outline.여유 * 2)


def test_같은_장식은_한_번만_그린다():
    """원본이 같으면 결과도 같아야 한다 — 장마다 따로 그리면 GPT 가 매번 새로 그려
    일곱 장의 하트가 조금씩 달라진다(실물 키키). 값·시간도 장식 수만큼 든다."""
    gpt누끼.잊기("P")
    img = _종이_위_카드()
    센것 = []

    def 부르기(조각, 말=None):
        센것.append(1)
        return _가짜부르기(조각)

    가 = gpt누끼.따기(img, [200, 100, 700, 400], 부르기=부르기, 게시물="P")
    나 = gpt누끼.따기(img, [200, 100, 700, 400], 부르기=부르기, 게시물="P")
    assert len(센것) == 1, "같은 조각인데 두 번 그렸다"
    assert np.array_equal(가["그림"], 나["그림"])

    # 다른 장식은 따로 그린다
    딴것 = img.copy()
    딴것[150:350, 250:650] = (10, 10, 200)
    gpt누끼.따기(딴것, [200, 100, 700, 400], 부르기=부르기, 게시물="P")
    assert len(센것) == 2
    gpt누끼.잊기("P")


def test_게시물을_안_대면_기억을_안_쓴다():
    """게시물이 다르면 장식도 다르다 — 섞이면 안 된다."""
    gpt누끼.잊기()
    img = _종이_위_카드()
    센것 = []

    def 부르기(조각, 말=None):
        센것.append(1); return _가짜부르기(조각)

    gpt누끼.따기(img, [200, 100, 700, 400], 부르기=부르기)
    gpt누끼.따기(img, [200, 100, 700, 400], 부르기=부르기)
    assert len(센것) == 2
