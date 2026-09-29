# -*- coding: utf-8 -*-
"""«GPT 바닥판»(2026-09-19 사용자 확정) — 표지·CTA·배경사진 장을 뺀 것 가운데 라벨이
덮는 넓이가 가장 작은 장 하나를 빨간 조각으로 덮은 한 장으로 GPT 편집에 주고, 돌아온
그림을 게시물 바닥판으로 쓴다. 망은 안 탄다: `부르기` 를 가짜로 바꾼다."""
import io
import json
import sys
from pathlib import Path

import numpy as np
import pytest
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import config  # noqa: E402
import gpt바닥판  # noqa: E402
import gpt누끼  # noqa: E402
import merge_labeled  # noqa: E402


def _장(index, 덮음비, 배경사진=False):
    """1000×1000 장에 라벨 하나가 `덮음비` 만큼 덮는다."""
    변 = int(1000 * 덮음비 ** 0.5)
    return {"index": index, "배경사진": 배경사진, "w": 1000, "h": 1000,
            "네모들": [("글자", [0, 0, 변, 변])]}


def test_표지와_마지막장과_배경사진_장은_후보가_아니다():
    장들 = [_장(1, 0.05), _장(2, 0.60), _장(3, 0.10, 배경사진=True), _장(4, 0.40), _장(5, 0.02)]
    assert gpt바닥판.고르기(장들) == 4          # 1(표지)·5(CTA)·3(사진) 빼고 2·4 중 덜 덮인 4


def test_후보가_없으면_None():
    assert gpt바닥판.고르기([_장(1, 0.1), _장(2, 0.1)]) is None       # 표지와 끝장뿐
    assert gpt바닥판.고르기([]) is None
    assert gpt바닥판.고르기([_장(1, 0.1, 배경사진=True)], 표지끝빼기=False) is None


def test_묶음_안에서_고를_때는_표지도_끝장도_안_뺀다():
    """묶음은 이미 «종이가 같은 장» 만 모은 것이다 — 마트 표지는 흰색, 본문은 연두라
    표지가 제 묶음을 이루고 그 묶음에서는 표지 말고 고를 것이 없다(2026-09-19)."""
    assert gpt바닥판.고르기([_장(1, 0.1)], 표지끝빼기=False) == 1
    assert gpt바닥판.고르기([_장(1, 0.4), _장(9, 0.1)], 표지끝빼기=False) == 9


def test_한_장을_보내고_돌아온_그림을_캔버스_크기로_돌려준다():
    img = np.full((1800, 1440, 3), (241, 255, 229), np.uint8)
    네모들 = [("글자", [100, 100, 1300, 400]), ("빼기", [60, 500, 120, 1500])]
    본것 = {}

    def 부르기(몸):
        본것.update(몸)
        out = Image.new("RGB", (1080, 1350), (240, 250, 230))
        b = io.BytesIO(); out.save(b, "PNG"); return b.getvalue()

    png = gpt바닥판.만들기(img, 네모들, (1080, 1350), 부르기=부르기)
    # **그림은 한 장뿐이다**(사람 결정 2026-09-23). 라벨 자리를 미리 메워서 주므로
    # 「여기 뭔가 있었다」가 안 보인다 — 그래 놓고 빨간 테두리로 가리키면 메운 보람이
    # 없다. 9월에 겪은 「구멍 모양을 설계도로 읽어 지어내기」가 그대로 돌아온다.
    assert len(본것["image_urls"]) == 1 and "mask_url" not in 본것
    assert "1080x1350" in 본것["prompt"]
    assert "text (" not in 본것["prompt"]
    assert 본것["image_size"] == {"width": 1080, "height": 1350}
    assert 본것["quality"] == "high"
    im = Image.open(io.BytesIO(png))
    assert im.size == (1080, 1350)


def test_보내는_한_장은_라벨_자리를_미리_메운_것이다():
    """**GPT 가 지울 것을 못 보게 한다**(사람 결정 2026-09-23). 보여 주면 베낀다 —
    2026-09-22 에 넷을 구웠더니 넷 다 원본을 그대로 돌려줬다(글자·사진이 그대로 남음).

    메우는 것은 기계다(`cv2.inpaint`). 뭉개져도 된다 — GPT 가 할 일은 그 자국을
    둘레와 이어지게 다듬는 것이다."""
    img = np.full((600, 600, 3), 200, np.uint8)
    img[150:250, 150:450] = 20                      # 지워야 할 검은 글자 덩이
    본것 = {}

    def 부르기(몸):
        본것.update(몸); b = io.BytesIO()
        Image.new("RGB", (600, 600), (200, 200, 200)).save(b, "PNG"); return b.getvalue()

    gpt바닥판.만들기(img, [("글자", [150, 150, 450, 250])], (600, 600), 부르기=부르기)
    보낸것 = np.asarray(gpt바닥판._읽기(본것["image_urls"][0]))
    # 검은 덩이가 사라지고 둘레 색으로 메워져 있다
    assert 보낸것[200, 300].max() > 150, "라벨 자리가 아직 검다 — 안 메워졌다"
    # 「빨강」은 빨강이 세고 초록이 약한 화소다 — 밝기만 보면 흰 종이도 걸린다.
    빨강 = (보낸것[..., 0] > 200) & (보낸것[..., 1] < 80)
    assert 빨강.sum() == 0, "빨간 칠·테두리가 있으면 안 된다"


# ── 한 색 덮개 (사람 지시 2026-09-24) ─────────────────────────────────
#
# 뭉개서 보내던 것을 **그림에 없는 색 하나로 덮어서** 보내는 것으로 바꿨다.
# 뭉갠 자국은 «네모난 얼룩» 이라 그 자체가 힌트였고, 무엇을 지우라는 것인지도
# GPT 가 스스로 찾아야 했다. 색을 정해 주면 찾을 것이 없다.
#
# 덤으로 **곧은 검산**이 생긴다 — 돌아온 그림에 그 색이 남았나 세면 된다.


def test_덮개색은_그림에_없는_색이다():
    """있는 색으로 덮으면 GPT 가 배경과 못 가린다."""
    원 = np.zeros((60, 60, 3), np.uint8)
    원[:, :30] = (240, 240, 235)          # 흰 종이
    원[:, 30:] = (20, 30, 40)             # 검은 판
    색, 거리 = gpt바닥판.없는색(원)
    있 = np.abs(원.astype(np.int16) - np.array(색, np.int16)).max(axis=2)
    assert 있.min() > 60, f"{색} 가 그림 안 색과 너무 가깝다"
    assert 거리 == 있.min() or 거리 > 0


def test_닿은_네모는_한_덩어리로_한_색이_된다():
    """네모마다 색을 따로 정하면 겹친 데서 서로 덮어쓴다(실물 DYon1QyCWqh)."""
    원 = np.full((200, 200, 3), (240, 240, 235), np.uint8)
    네모 = [(10, 10, 100, 100), (95, 10, 180, 100)]     # 서로 닿는다
    덮, 색, 가림 = gpt바닥판.덮개씌우기(원, 네모)
    칠 = np.asarray(덮)[가림]
    assert len(np.unique(칠.reshape(-1, 3), axis=0)) == 1, "한 색이라야 한다"
    assert tuple(int(v) for v in 칠[0]) == 색


def test_덮개는_여유만큼_넓게_칠한다():
    원 = np.full((200, 200, 3), (240, 240, 235), np.uint8)
    덮, 색, 가림 = gpt바닥판.덮개씌우기(원, [(50, 50, 100, 100)])
    assert gpt바닥판.덮개여유 == 10
    assert 가림[50 - 10, 75] and not 가림[50 - 11, 75]


def test_지시문에_덮개색이_박힌다():
    """«단색 덩어리» 라고만 하면 GPT 가 무엇을 가리키는지 스스로 찾아야 한다."""
    말 = gpt바닥판.지시문.format(색="#F010F0", w=1080, h=1350)
    assert 말.count("#F010F0") >= 2, "덮개색을 짚어 주고, 남기지 말라고도 해야 한다"
    assert "1080x1350" in 말


def test_지시문은_조금_보이는_배경이_전체가_되라고_한다():
    """**금지한 적이 없으면 GPT 는 덮개색을 배경으로 써도 규칙을 안 어긴 것이다.**
    실물 DYzN0Uzgaq6(덮음 83.5%): 화면 전체가 덮개색으로 돌아왔다. 두 줄을 넣자
    같은 장이 0% 가 됐다."""
    말 = gpt바닥판.지시문.format(색="#F010F0", w=1080, h=1350).lower()
    assert "small part" in 말 and "whole frame" in 말
    assert "never use the cover colour as a background" in 말


def test_덮개색이_많이_남아_오면_버린다():
    """덜 지운 것이다. 실물 DYzN0Uzgaq6 가 100% 로 돌아왔다."""
    원 = np.full((300, 300, 3), (240, 240, 235), np.uint8)
    네모 = [("글자", [50, 50, 250, 250])]

    def 부르기(몸):
        # 보낸 것을 그대로 돌려준다 — 하나도 안 지운 셈
        return gpt바닥판._읽기(몸["image_urls"][0]).tobytes() if False else _그대로(몸)

    def _그대로(몸):
        im = gpt바닥판._읽기(몸["image_urls"][0])
        b = io.BytesIO(); im.save(b, "PNG"); return b.getvalue()

    with pytest.raises(gpt바닥판.딴그림):
        gpt바닥판.만들기(원, 네모, (300, 300), 부르기=부르기)


def test_덮개색이_다_지워졌으면_받는다():
    원 = np.full((300, 300, 3), (240, 240, 235), np.uint8)
    네모 = [("글자", [50, 50, 250, 250])]

    def 부르기(몸):
        b = io.BytesIO()
        Image.new("RGB", (300, 300), (240, 240, 235)).save(b, "PNG")
        return b.getvalue()

    png = gpt바닥판.만들기(원, 네모, (300, 300), 부르기=부르기)
    assert Image.open(io.BytesIO(png)).size == (300, 300)


def test_통째로_딴_그림이면_검산이_막는다():
    """통째로 다시 그린 판은 «메운 자리 색» 이 둘레 종이와 딴판이라 걸린다 — 실물
    DbX5fhOAdyC(검은 카드에 크림색 종이)가 그 자리다. 라벨 밖은 원본으로 되돌리므로
    (2026-09-28) 밖이 어떻게 왔든 검산은 메운 자리에서만 본다(`메운자리색차`).
    """
    img = np.full((600, 600, 3), 200, np.uint8)
    img[10:20, :] = 30                              # 라벨 밖의 가로 줄

    def 부르기(몸):
        b = io.BytesIO()
        Image.new("RGB", (600, 600), (7, 7, 7)).save(b, "PNG")   # 통째로 딴 그림
        return b.getvalue()

    with pytest.raises(gpt바닥판.딴그림):
        gpt바닥판.만들기(img, [("글자", [100, 100, 500, 300])], (600, 600), 부르기=부르기)


# ── 돌아온 판을 검산한다 (사람 지시 2026-09-22) ──────────────────────
#
# **배경판은 «만드는 것» 이 아니라 «지우고 메우는 것» 이다.** 라벨한 것은 윗층이고,
# 그것을 들어내면 아랫층에 그 모양대로 구멍이 난다. 배경판은 그 구멍을 둘레가
# 이어지도록 메워 라벨하기 «전» 의 아랫층으로 돌려놓은 것이다 — 종이인지 색인지
# 질감인지는 상관없다.
#
# **그러면 라벨 «밖» 은 원본 화소 그대로여야 한다.** 거기는 지우라고 한 적이 없다.
# 그것이 이 검산이다.
#
# 여태 검산이 하나도 없었다. 장식을 오릴 때는 지킴이가 있는데(`gpt누끼.최소투명`)
# 배경판에는 없어서 GPT 가 뭘 보내든 그대로 창고에 올라갔다.
#
# **실측(2026-09-22, 살아 있는 판 12장)** — 라벨 밖이 원본과 같은 화소의 몫:
#
#     100% 100% 100% 99% 93% 92% 92% 91% | 71% 65% | 32% 0%
#
# 오른쪽 둘이 통째로 다시 그려진 것이다(DbX5fhOAdyC 는 검은 카드인데 크림색 종이를
# 지어냈다). 제대로 지운 여덟은 91% 위에 몰려 있고 그 아래가 비어 있다.

def _원과네모():
    """1080×1350 연둣빛 종이. 글자 하나가 [100,100,900,300] 에 검게 앉아 있다."""
    img = np.full((1350, 1080, 3), (241, 255, 229), np.uint8)
    img[100:300, 100:900] = (20, 20, 20)
    return img, [("글자", [100, 100, 900, 300])]


def _판(색, 크기=(1080, 1350), 칠하기=None):
    def 부르기(몸):
        im = Image.new("RGB", 크기, 색)
        if 칠하기:
            칠하기(im)
        b = io.BytesIO(); im.save(b, "PNG"); return b.getvalue()
    return 부르기


def test_라벨_밖이_원본_그대로면_판을_받는다():
    img, 네모 = _원과네모()
    png = gpt바닥판.만들기(img, 네모, (1080, 1350), 부르기=_판((241, 255, 229)))
    assert Image.open(io.BytesIO(png)).size == (1080, 1350)


def test_GPT_가_준_그대로_쓴다():
    """**라벨 밖을 원본으로 덮지 않는다**(사람 지시 2026-09-24, 2026-09-28 재확인).

    GPT 는 그림 전체를 한 번에 다시 그려 안팎이 한 붓이다. 라벨 안만 GPT 것을 쓰고
    밖을 원본 화소로 되돌리면 밝기가 2~3단계만 달라도 라벨 자리가 네모로 비친다 —
    2026-09-28 실물 13벌에서 그렇게 됐다(그로스플래닛 안 #F4F4F4 · 밖 #F2F2F2,
    퍼플 안 #E4E9E9 · 밖 #E7EBEC). 경계를 섞어도 네모 «안» 의 차이는 못 없앤다.
    라벨 안 한 것을 살리고 싶으면 장식으로 라벨한다 — 「라벨한 것만 나온다」.
    """
    원 = np.full((200, 200, 3), (10, 200, 30), np.uint8)
    네모 = [("글자", [50, 50, 150, 150])]
    # 라벨 «밖» 을 일부러 조금 다르게 낸 판
    def 부르기(몸):
        im = Image.new("RGB", (200, 200), (12, 198, 33))
        b = io.BytesIO(); im.save(b, "PNG"); return b.getvalue()

    png = gpt바닥판.만들기(원, 네모, (200, 200), 부르기=부르기)
    난것 = np.asarray(Image.open(io.BytesIO(png)).convert("RGB"))
    assert tuple(난것[0, 0]) == (12, 198, 33), "GPT 가 준 화소가 그대로 남아야 한다"


def test_걸리면_한_번_더_떠_본다(monkeypatch):
    """**한 번 걸렸다고 바로 버리지 않는다**(사람 지시 2026-09-24). GPT 는 부를
    때마다 다르게 낸다 — 실물 DYWiVHhlNwo 는 같은 그림을 두 번 보냈는데 79% 와
    76.6% 가 나왔다. 두 번째가 통과하면 그것을 쓴다.

    값이 곱절이 되는 것은 **걸렸을 때뿐**이다(한 장 $0.05).
    """
    img, 네모 = _원과네모()
    셈 = {"수": 0}

    def 부르기(몸):
        셈["수"] += 1
        # 첫 번은 검은 판(딴 그림), 두 번째는 원본 색
        색 = (7, 7, 7) if 셈["수"] == 1 else (241, 255, 229)
        b = io.BytesIO(); Image.new("RGB", (1080, 1350), 색).save(b, "PNG")
        return b.getvalue()

    png = gpt바닥판.만들기(img, 네모, (1080, 1350), 부르기=부르기)
    assert 셈["수"] == 2, "걸렸으면 한 번 더 불러야 한다"
    assert Image.open(io.BytesIO(png)).size == (1080, 1350)


def test_두_번_다_걸리면_그때는_버린다():
    """다시 떠도 안 되면 그 묶음은 판 없이 끝난다 — 끝없이 부르지 않는다."""
    img, 네모 = _원과네모()
    셈 = {"수": 0}

    def 부르기(몸):
        셈["수"] += 1
        b = io.BytesIO(); Image.new("RGB", (1080, 1350), (7, 7, 7)).save(b, "PNG")
        return b.getvalue()

    with pytest.raises(gpt바닥판.딴그림):
        gpt바닥판.만들기(img, 네모, (1080, 1350), 부르기=부르기)
    assert 셈["수"] == 2, "두 번까지만 부른다"


def test_볼_데가_너무_좁으면_버린다():
    """장이 거의 다 라벨이면 «지웠는지» 를 잴 데가 없다 — 모르면 안 쓴다."""
    img = np.full((100, 100, 3), 200, np.uint8)
    with pytest.raises(gpt바닥판.딴그림):
        gpt바닥판.만들기(img, [("글자", [0, 0, 100, 100])], (100, 100),
                     부르기=_판((200, 200, 200), 크기=(100, 100)))


# ── 지시문 (사람 지시 2026-09-22) ────────────────────────────────
#
# **배경판은 «만드는 것» 이 아니라 «지우고 메우는 것» 이다.** 지시문이 그렇게 말해야
# 한다. 여태는 「the paper(종이)」라고 여섯 번 부르고 「그 바닥층을 내놔라(Give me)」
# 라고 했다 — 그러면 GPT 는 「종이를 그려 달라는 거구나」로 읽는다.
#
# 실물 DbX5fhOAdyC(2026-09-22): 검은 카드인데 원본 어디에도 없는 크림색 스톡 종이를
# 통째로 지어냈다. 카드에 종이가 없으니 종이를 만들어 준 것이다.

def test_지시문은_종이라고_안_부른다():
    """**«paper» 라고 이름 붙이면 안 된다.** 아랫층이 종이인지 색인지 질감인지는
    상관없다 — 원본이 무엇이었든 그것으로 돌아가야 한다."""
    assert "paper" not in gpt바닥판.지시문.lower()


def test_지시문은_되살리지_말라고_못_박는다():
    """덮개 모양을 보고 «여기 카드가 있었네» 하고 되살릴 수 있다."""
    말 = gpt바닥판.지시문.lower()
    assert "removed on purpose" in 말
    assert "shape means nothing" in 말


def test_지시문은_구멍을_둘레와_이어_메우라고_말한다():
    """구멍은 **채울 자리**지 **그릴 자리**가 아니다."""
    assert "continuing whatever it is doing" in gpt바닥판.지시문.lower()


def test_지시문은_없던_것을_보태지_말라고_못_박는다():
    """구멍 모양을 설계도로 읽어 도형을 그리고 글을 써 넣은 적이 있다
    (실물 DSW 9번 장: 알약 5개 자리 → 번호 항목 4개를 새로 씀)."""
    assert "add nothing" in gpt바닥판.지시문.lower()


def test_지시문은_예시를_나열하지_않는다():
    """**보편적으로 돌아가야 한다**(사람 지시 2026-09-23).

    「줄·띠·테두리·모서리·찢긴 자국」처럼 예시를 늘어놓으면 두 가지가 난다 —
    목록에 없는 배경(격자·그라데이션·워터마크·무늬)이 나오면 어떻게 할지 모르고,
    **목록에 없는 것은 «마음대로 해도 되는 것» 으로 읽힌다.**

    그래서 «무엇을 이어라» 대신 «둘레가 하고 있는 것을 그대로 이어가라» 로 쓴다.
    그 한 줄이 모든 배경을 덮는다.
    """
    말 = gpt바닥판.지시문.lower()
    # **«texture» 는 금지 목록에서 뺐다**(2026-09-24). 그건 배경의 «갈래» 가 아니라
    # «성질» 이다 — 「색·질감·무늬를 그대로 이어라」는 모든 배경에 들어맞는다.
    # 금지하는 것은 「줄이 있으면 줄을, 찢긴 자국이 있으면 찢긴 자국을」 처럼
    # 배경 갈래를 늘어놓는 것이다.
    for 낱말 in ("stripe", "torn", "badge", "photos", "wear", "border", "paper"):
        assert 낱말 not in 말, f"«{낱말}» — 예시를 늘어놓지 않는다"




def _두장(root: Path, pid: str):
    """1번 표지(글자 하나) · 2번 본문(글자 하나) · 3번 CTA — 3번이 CTA 라 2번만 후보."""
    d = root / "images" / pid; d.mkdir(parents=True, exist_ok=True)
    for i in (1, 2, 3):
        img = np.full((1350, 1080, 3), (241, 255, 229), np.uint8)
        img[100:300, 100:900] = (20, 20, 20)
        Image.fromarray(img).save(d / f"{i:02d}.jpg", format="PNG")
    boxes = [{"id": "t", "kind": "글자", "box": [100, 100, 900, 300]}]
    lab = root / "labels"; lab.mkdir(parents=True, exist_ok=True)
    (lab / f"{pid}.json").write_text(json.dumps({str(i): {"boxes": boxes} for i in (1, 2, 3)}),
                                     encoding="utf-8")


def _가짜망(monkeypatch, tmp_path):
    monkeypatch.setattr(merge_labeled.글자읽기, "read_slide", lambda pid_, index, boxes: {})
    monkeypatch.setattr(merge_labeled.글자읽기, "있나", lambda: True)
    monkeypatch.setattr(merge_labeled.cutout, "cut_slide", lambda pid_, index, boxes: {})
    monkeypatch.setattr(merge_labeled.tone_labeled, "ask",
                        lambda pid_, texts: merge_labeled.tone_labeled._fallback(len(texts)))
    monkeypatch.setattr(config, "DATA", tmp_path)
    monkeypatch.setattr(config, "IMAGES", tmp_path / "images")
    monkeypatch.setattr(config, "MEASURES", tmp_path / "measures")


def test_build는_열쇠가_있으면_GPT_바닥판을_쓴다(monkeypatch, tmp_path):
    _두장(tmp_path, "GPTBASE"); _가짜망(monkeypatch, tmp_path)
    monkeypatch.setattr(gpt누끼, "있나", lambda: True)
    본것 = {}

    def 만들기(img, 네모들, 크기, 부르기=None):
        본것["크기"] = img.shape[:2]; 본것["네모들"] = 네모들
        b = io.BytesIO(); Image.new("RGB", 크기, (230, 240, 220)).save(b, "PNG"); return b.getvalue()

    monkeypatch.setattr(gpt바닥판, "만들기", 만들기)
    doc = merge_labeled.build("GPTBASE")
    assert doc["바닥판"]["판"] == "GPTBASE/base.png"
    assert (tmp_path / "배경판" / "GPTBASE" / "base.png").exists()
    assert 본것["크기"] == (1350, 1080) and 본것["네모들"] == [("글자", [100, 100, 900, 300])]


def _큰두장(root, pid, 원본폭=1440):
    """원본이 1080 보다 «큰» 게시물. 라벨 네모는 원본 좌표로 그어진다."""
    높 = round(원본폭 * 1350 / 1080)
    d = root / "images" / pid; d.mkdir(parents=True, exist_ok=True)
    for i in (1, 2, 3):
        img = np.full((높, 원본폭, 3), (241, 255, 229), np.uint8)
        # 검은 칸은 «라벨이 덮는 자리» 와 같게 둔다 — 안 그러면 배경이 «사진» 으로
        # 잡혀 후보에서 빠지고, 바닥판을 아예 안 뜬다.
        img[400:700, 400:1200] = (20, 20, 20)
        Image.fromarray(img).save(d / f"{i:02d}.jpg", format="PNG")
    boxes = [{"id": "t", "kind": "글자", "box": [400, 400, 1200, 700]}]
    lab = root / "labels"; lab.mkdir(parents=True, exist_ok=True)
    (lab / f"{pid}.json").write_text(json.dumps({str(i): {"boxes": boxes} for i in (1, 2, 3)}),
                                     encoding="utf-8")


def test_원본이_1080보다_크면_네모도_같이_줄여_넘긴다(monkeypatch, tmp_path):
    """**그림은 줄이는데 네모를 안 줄이면 엉뚱한 자리를 지운다.**

    라벨 네모는 «원본 파일» 좌표다(1440 폭이면 1440 기준). 바닥판에 넘기는 그림은
    `normalize.load` 가 1080 으로 맞춘 것이다. 그러니 네모도 같은 배율(0.75)로
    줄여 넘겨야 한다. 실물 2026-09-24: 창고의 열세 벌 가운데 여섯 벌이 원본이
    1080 이 아니어서 어긋나 있었다(`DYon1QyCWqh` 는 원본 3277 폭이라 **3배**).

    `고르기` 도 같은 목록으로 «라벨이 덮는 넓이» 를 재므로 같이 틀어진다.
    """
    _큰두장(tmp_path, "GPTBIG", 원본폭=1440); _가짜망(monkeypatch, tmp_path)
    monkeypatch.setattr(gpt누끼, "있나", lambda: True)
    본것 = {}

    def 만들기(img, 네모들, 크기, 부르기=None):
        본것["그림"] = img.shape[:2]; 본것["네모들"] = 네모들
        b = io.BytesIO(); Image.new("RGB", 크기, (230, 240, 220)).save(b, "PNG"); return b.getvalue()

    monkeypatch.setattr(gpt바닥판, "만들기", 만들기)
    merge_labeled.build("GPTBIG")
    assert 본것["그림"] == (1350, 1080), "그림은 1080 으로 맞춰 넘어간다"
    # 원본 [400,400,1200,700] × 0.75 = [300,300,900,525]
    갈, 네 = 본것["네모들"][0]
    assert 갈 == "글자"
    assert [round(v) for v in 네] == [300, 300, 900, 525]
    assert 네[2] <= 1080, "네모가 그림 밖으로 나가면 안 된다"


def test_build는_GPT가_실패하면_옛_바닥판으로_간다(monkeypatch, tmp_path):
    _두장(tmp_path, "GPTFAIL"); _가짜망(monkeypatch, tmp_path)
    monkeypatch.setattr(gpt누끼, "있나", lambda: True)

    def 만들기(*a, **k):
        raise RuntimeError("fal 실패")

    monkeypatch.setattr(gpt바닥판, "만들기", 만들기)
    doc = merge_labeled.build("GPTFAIL")     # 죽지 않는다
    assert "바닥판" in doc


def _칠한장(index, 색, 배경사진=False, 덮음=0.1):
    """종이색이 `색` 인 장 하나 — `묶기` 가 볼 그림과 라벨을 함께 만든다."""
    img = np.full((600, 480, 3), 색, np.uint8)
    변 = int((480 * 600 * 덮음) ** 0.5)
    return {"index": index, "배경사진": 배경사진, "w": 480, "h": 600, "img": img,
            "bg": {"hex": "#FFFFFF"}, "네모들": [("글자", [0, 0, 변, 변])]}


def test_종이가_같은_장끼리_묶는다():
    """사람 결정 2026-09-19, 문턱 10 — 눈으로 색이 다르다고 알아보는 가장 작은 정도.
    실물: 같은 종이끼리 0~1, 파스텔 하늘색 대 회색 13, 마트 흰색 대 연두 25."""
    장들 = [_칠한장(1, (242, 242, 242)), _칠한장(2, (0, 122, 255)),
          _칠한장(3, (242, 242, 243)), _칠한장(4, (235, 248, 255)),
          _칠한장(5, (10, 10, 10), 배경사진=True)]
    묶음 = gpt바닥판.묶기(장들)
    번호 = [[s["index"] for s in m] for m in 묶음]
    assert [1, 3] in 번호, 번호          # 차이 1 — 같은 종이
    assert [2] in 번호 and [4] in 번호   # 파랑·하늘색은 따로
    assert all(5 not in m for m in 번호), "배경이 사진인 장은 안 넣는다"
    assert len(번호[0]) >= len(번호[-1]), "큰 묶음이 앞에 온다"


def test_표지도_사진만_아니면_묶음에_든다():
    장들 = [_칠한장(1, (255, 255, 255)), _칠한장(2, (255, 255, 255))]
    assert [s["index"] for s in gpt바닥판.묶기(장들)[0]] == [1, 2]


# ── 검산은 «대략의 색 비교» 만 (사람 결정 2026-09-28) ──────────────────────
#
# 옛 검산은 라벨 밖 화소를 하나하나 원본과 맞대서(±8) 절반 이상 같아야 통과였다.
# 사람 눈은 화소 단위로 못 견준다 — 점무늬 종이는 GPT 가 점을 딴 자리에 찍어 눈에는
# 같은 종이인데 30% 만 같다고 두 번 다 떨어졌다(실물 DbmjT0Cj8-I, 검정 CTA 판이
# 대표 판으로 깔림). 사람 지시: 「검증에서 픽셀 단위로 판단하는 건 인간은 어차피
# 비교 못 하는데 의미가 없어 — 대체적인 색 비교만, 엄청 약하게」.
#
# 그래서 검산은 둘뿐이다. ① 덮개색이 남았나(덜 지웠나) ② 메운 자리 색이 둘레 종이와
# 대충 비슷한가(없던 종이를 지어냈나 — 검은 카드에 크림색 종이 사고). 둘 다
# 가운뎃값 색이라 무늬·점에 안 흔들린다. GPT 가 낸 그림은 그대로 쓴다.

def _단색판(색, 크기=(600, 600)):
    return _판(색, 크기=크기)


def test_라벨_안은_GPT_가_메운_것이다():
    img = np.full((600, 600, 3), 200, np.uint8)
    img[100:300, 100:500] = 20                     # 지울 글자 덩이
    네모 = [("글자", [100, 100, 500, 300])]
    png = gpt바닥판.만들기(img, 네모, (600, 600), 부르기=_단색판((196, 204, 200)))
    난것 = np.asarray(Image.open(io.BytesIO(png)).convert("RGB"))
    assert tuple(난것[200, 300]) == (196, 204, 200), "라벨 안은 GPT 색이라야 한다"


def test_조금_다른_색은_받는다():
    """«엄청 약하게» — GPT 는 다시 그리며 색이 몇 단계 흔들린다. 그 정도는 통과다."""
    img = np.full((600, 600, 3), 200, np.uint8)
    네모 = [("글자", [100, 100, 500, 300])]
    png = gpt바닥판.만들기(img, 네모, (600, 600), 부르기=_단색판((170, 176, 172)))
    assert Image.open(io.BytesIO(png)).size == (600, 600)


def test_메운_자리_색이_둘레_종이와_딴판이면_버린다():
    """실물 DbX5fhOAdyC(2026-09-22): 검은 카드에 GPT 가 크림색 종이를 지어냈다.
    이런 «딴 종이» 만 걸린다."""
    img = np.full((600, 600, 3), 10, np.uint8)     # 검은 카드
    네모 = [("글자", [100, 100, 500, 300])]
    셈 = {"수": 0}

    def 부르기(몸):
        셈["수"] += 1
        return _단색판((243, 235, 219))(몸)

    with pytest.raises(gpt바닥판.딴그림):
        gpt바닥판.만들기(img, 네모, (600, 600), 부르기=부르기)
    assert 셈["수"] == 2


def test_점무늬_종이는_점_자리가_달라도_받는다():
    """실물 DbmjT0Cj8-I: 연회색 점무늬 종이. GPT 는 점을 다른 자리에 찍으니 화소끼리
    맞대면 30% 만 같았고 두 번 다 떨어졌다. 눈에는 같은 종이다."""
    def 점무늬(씨):
        # 화소마다 세 밝기 중 하나 — 두 장을 맞대면 같은 자리가 1/3 뿐이라
        # 옛 «절반 이상 같음» 검산으로는 반드시 떨어진다.
        r = np.random.default_rng(씨)
        단 = np.array([150, 190, 225], np.uint8)[r.integers(0, 3, (600, 600))]
        return np.repeat(단[:, :, None], 3, axis=2)

    img = 점무늬(1)
    네모 = [("글자", [100, 100, 500, 300])]

    def 부르기(몸):
        b = io.BytesIO(); Image.fromarray(점무늬(2)).save(b, "PNG"); return b.getvalue()

    png = gpt바닥판.만들기(img, 네모, (600, 600), 부르기=부르기)
    assert Image.open(io.BytesIO(png)).size == (600, 600)


# ── 떨어진 묶음은 남의 판을 안 빌린다 (사람 결정 2026-09-28) ────────────────

def _두종이(root: Path, pid: str):
    """1·2번은 연두 종이, 3·4번은 파란 종이. 장마다 글자 하나."""
    d = root / "images" / pid; d.mkdir(parents=True, exist_ok=True)
    for i, 색 in ((1, (241, 255, 229)), (2, (241, 255, 229)), (3, (0, 122, 255)), (4, (0, 122, 255))):
        img = np.full((1350, 1080, 3), 색, np.uint8)
        img[100:300, 100:900] = (20, 20, 20)
        Image.fromarray(img).save(d / f"{i:02d}.jpg", format="PNG")
    boxes = [{"id": "t", "kind": "글자", "box": [100, 100, 900, 300]}]
    lab = root / "labels"; lab.mkdir(parents=True, exist_ok=True)
    (lab / f"{pid}.json").write_text(json.dumps({str(i): {"boxes": boxes} for i in (1, 2, 3, 4)}),
                                     encoding="utf-8")


def test_묶음_하나가_떨어져도_남의_판을_안_빌린다(monkeypatch, tmp_path):
    """실물 DbmjT0Cj8-I(2026-09-25): 연회색 본문 묶음이 검산에 떨어지자 하나뿐인
    검정 CTA 판이 «대표 판» 으로 모든 장에 깔렸다. 떨어진 묶음은 제 종이색 단색
    판을 받는다 — 무늬는 못 살려도 색은 안 틀린다."""
    _두종이(tmp_path, "TWOPAPER"); _가짜망(monkeypatch, tmp_path)
    monkeypatch.setattr(gpt누끼, "있나", lambda: True)

    def 만들기(img, 네모들, 크기, 부르기=None):
        if tuple(int(v) for v in img[0, 0]) == (241, 255, 229):
            raise gpt바닥판.딴그림("연두 묶음은 떨어진다")
        b = io.BytesIO(); Image.new("RGB", 크기, (0, 122, 255)).save(b, "PNG"); return b.getvalue()

    monkeypatch.setattr(gpt바닥판, "만들기", 만들기)
    doc = merge_labeled.build("TWOPAPER")
    판 = {s["index"]: (s["background"] or {}).get("판") for s in doc["slides"]}
    assert 판[3] == 판[4] and 판[3], "파란 묶음은 GPT 판을 받는다"
    assert 판[1] == 판[2] and 판[1], "떨어진 묶음도 제 판이 있어야 한다"
    assert 판[1] != 판[3], "떨어진 묶음이 남의 판을 빌렸다"
    깐 = np.asarray(Image.open(tmp_path / "배경판" / 판[1]).convert("RGB")).astype(int)
    assert np.abs(깐 - np.array([241, 255, 229])).max() <= 3, "제 종이색이라야 한다"
