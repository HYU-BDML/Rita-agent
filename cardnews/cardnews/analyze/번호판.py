# -*- coding: utf-8 -*-
"""장 번호 «번호판» — 배지 하나를 떼어 숫자를 지우고, 표지 뺀 모든 장에 찍을 도장으로 만든다.

사람 결정 2026-09-19: 장 번호 배지(「01」이 든 반원·원·리본)는 장마다 찾지 않는다.
사람이 배지 둘레에 「장번호」 네모 하나를 그으면 —

1. 배지를 흘려채우기 누끼로 뗀다(`outline.테두리따기`). 배지는 «종이 위 한 색
   도형» 이라 이 방식이 잘 맞는다.
2. 숫자 자리를 둘레 무늬로 이어 메운다(`cv2.inpaint`). 한 색으로 덮으면 종이
   알갱이 무늬가 끊겨 티가 난다 — 실물(DSW-6lrk5rs 파란 반원)로 견줘 정했다.
3. 가장자리 픽셀에 섞인 종이 색을 배지 색으로 돌린다(투명도는 남김) — 안 그러면
   다른 장에 얹었을 때 흰 테가 보인다.
4. 숫자의 크기·색·배지 안 자리를 재 둔다 — 만들 때 같은 자리에 1·2·3 을 찍는다.

여기는 그림만 다룬다. 어느 장에 찍을지는 `dify/카드뉴스_배치` 가 정한다.
"""
import io
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))

import cutout  # noqa: E402
import outline  # noqa: E402

둘레두께 = 2
"""흰 테로 보는 가장자리 두께(px). 흘려채우기가 남기는 «종이가 섞인 픽셀» 은 한두
픽셀이다 — 더 깎으면 작은 배지의 테두리가 뭉개진다."""

숫자문턱 = 120
"""배지 색과 RGB 합으로 이만큼 다르면 «숫자 획» 이다. 흰 「01」 은 파란 배지에서
300 넘게 벌어지고, 종이 알갱이는 60 안팎이다."""

한색허용 = 70
"""배지 색과 RGB 합으로 이 안이면 «같은 색» 으로 본다(한 색 덩이 따기). 종이 알갱이가
비친 픽셀(60 안팎)은 들어오고, 흰 숫자·종이(300 안팎)는 밖이다."""

한색최소비 = 0.15
"""네모의 이만큼도 못 채우면 배지가 아니다 — 네모를 빗나가게 그은 것이다."""

알갱이비 = 0.004
"""배지 넓이의 이 아래인 덩이는 숫자가 아니라 종이 알갱이(한지 무늬)다. 실측:
DSW 반원 16,103px 에서 「0」「1」은 482·282px, 알갱이는 10px 안팎."""

def _hex(색) -> str:
    r, g, b = (int(round(float(v))) for v in 색[:3])
    return f"#{r:02X}{g:02X}{b:02X}"


def 배지색(rgb: np.ndarray, 속: np.ndarray) -> np.ndarray:
    """배지의 바탕색 — 불투명한 픽셀의 중앙값. 숫자 획이 섞여도 중앙값이라 안 흔들린다."""
    return np.median(rgb[속], axis=0)


def 구멍메우기(alpha: np.ndarray) -> np.ndarray:
    """누끼 마스크의 «안에 갇힌 구멍» 을 메운 마스크.

    흘려채우기는 종이와 같은 색을 지우므로, 흰 종이 위 파란 배지에 흰 「01」 이
    있으면 숫자 자리가 «구멍» 으로 뚫린 채 온다(실물 DSW 는 종이가 한지 무늬라
    안 뚫렸지만, 매끈한 흰 종이면 뚫린다). 구멍이든 획이든 «숫자 자리» 는 같다.
    """
    안 = (alpha > 128).astype(np.uint8)
    h, w = 안.shape
    바깥 = np.pad(1 - 안, 1, constant_values=1)
    씨 = np.zeros((h + 4, w + 4), np.uint8)
    cv2.floodFill(바깥, 씨, (0, 0), 2)
    return 바깥[1:-1, 1:-1] != 2                     # 바깥에서 닿지 못한 곳 = 배지 + 구멍


def 숫자마스크(rgb: np.ndarray, alpha: np.ndarray, 글자네모들=None) -> np.ndarray:
    """지울 «숫자 획» 마스크.

    글자 네모(Vision 이 준 글자 하나하나 자리, 누끼 좌표)가 있으면 그 안에서 배지
    색과 다른 픽셀(과 구멍)만 본다. 없으면 배지 안 덩이 중 «테두리에 안 닿고
    알갱이보다 큰 것» 을 숫자로 본다 — 흰 테(테두리에 닿음)와 종이 알갱이(작음)를
    그렇게 뗀다.
    """
    채운 = 구멍메우기(alpha)
    속 = (alpha > 250) & 채운
    if not 속.any():
        return np.zeros(alpha.shape, bool)
    바탕 = 배지색(rgb, 속)
    차이 = np.abs(rgb.astype(int) - 바탕.astype(int)).sum(axis=2)
    구멍 = 채운 & (alpha <= 128)
    다름 = ((alpha > 128) & (차이 > 숫자문턱)) | 구멍
    h, w = alpha.shape
    if 글자네모들:
        안 = np.zeros((h, w), bool)
        for x0, y0, x1, y1 in 글자네모들:
            여 = 3
            안[max(0, int(y0) - 여):min(h, int(y1) + 여), max(0, int(x0) - 여):min(w, int(x1) + 여)] = True
        return 다름 & 안
    n, lab, stats, _ = cv2.connectedComponentsWithStats(다름.astype(np.uint8))
    잉크 = np.zeros((h, w), bool)
    for k in range(1, n):
        x, y, bw, bh, area = stats[k]
        if x == 0 or y == 0 or x + bw == w or y + bh == h:
            continue                                 # 테두리에 닿음 — 흰 테
        if area < 알갱이비 * 속.sum():
            continue                                 # 종이 알갱이
        잉크 |= lab == k
    return 잉크


def 지우기(rgb: np.ndarray, alpha: np.ndarray, 잉크: np.ndarray) -> np.ndarray:
    """숫자 획 자리를 둘레 무늬로 이어 메운다. 획 둘레 두 픽셀까지 같이 — 획 가장자리의
    반투명 픽셀이 남으면 지운 자리가 테두리로 보인다."""
    if not 잉크.any():
        return rgb.copy()
    지울 = cv2.dilate(잉크.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    지울 &= alpha > 128
    bgr = cv2.inpaint(cv2.cvtColor(np.ascontiguousarray(rgb), cv2.COLOR_RGB2BGR),
                      (지울 * 255).astype(np.uint8), 5, cv2.INPAINT_TELEA)
    return cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)


def 흰테없애기(rgb: np.ndarray, alpha: np.ndarray, 바탕: np.ndarray):
    """가장자리 픽셀의 «색» 을 배지 색으로 돌리고, 종이가 섞인 만큼 «투명도» 를 깎는다.

    흘려채우기는 배지 테두리에서 종이와 섞인 픽셀을 한두 줄 남긴다. 그 픽셀은
    색은 흰 쪽으로 치우쳐 있고 자리는 배지 안이다 — 색만 바꾸면 테두리가
    부드러운 채로 흰 테만 사라진다.
    """
    속 = alpha > 250
    핵 = np.ones((둘레두께 * 2 + 1,) * 2, np.uint8)
    깎음 = cv2.erode(속.astype(np.uint8), 핵) > 0
    테 = (alpha > 0) & ~깎음
    차이 = np.abs(rgb.astype(int) - 바탕.astype(int)).sum(axis=2)
    새rgb = rgb.copy()
    새rgb[테] = 바탕.astype(np.uint8)
    새alpha = alpha.copy()
    새alpha[테] = (alpha[테] * np.clip(1 - 차이[테] / 300.0, 0.2, 1.0)).astype(np.uint8)
    return 새rgb, 새alpha


def 숫자비(글꼴: str | None, 굵기: str | None) -> float:
    """숫자 획 높이 ÷ pt. 그 글꼴로 「0」 을 그려 잰다 — 한글 자로 잰 비율(0.91)을
    숫자에 쓰면 pt 가 작게 나온다(실물: 36px 배지의 「02」 가 「0」 으로 잘렸던 때).
    """
    import verify_labeled  # noqa: PLC0415 — 글꼴 파일 표가 거기 있다

    font = verify_labeled.font_of({"font": 글꼴, "weight": 굵기, "pt": 100})
    im = Image.new("L", (200, 200), 0)
    ImageDraw.Draw(im).text((20, 20), "0", fill=255, font=font)
    ys = np.where(np.asarray(im) > 128)[0]
    return (ys.max() - ys.min() + 1) / 100.0 if len(ys) else 0.72


def 한색덩이(img: np.ndarray, box) -> np.ndarray | None:
    """네모 한가운데 색과 같은 색으로 이어진 덩이 — «배지» 를 따는 우리 방식.

    흘려채우기(`outline.테두리따기`)는 네모 가장자리를 «종이» 로 보는데, 장 번호
    배지는 화면 위쪽 끝에 붙어 있는 일이 흔해 가장자리 한 변이 통째로 배지다 —
    그러면 배지를 종이로 알고 지워 버린다(실물 2026-09-19: DSW 반원이 8% 만 남았다).
    배지는 «한 색 도형» 이니 거꾸로 간다: 가운데 색을 잡고 그 색이 이어진 데까지가
    배지다. 숫자 자리는 구멍으로 남는데 `구멍메우기` 가 메운다.
    """
    h, w = img.shape[:2]
    x0, y0, x1, y1 = (max(0, int(box[0])), max(0, int(box[1])), min(w, int(box[2])), min(h, int(box[3])))
    if x1 - x0 < 4 or y1 - y0 < 4:
        return None
    조각 = img[y0:y1, x0:x1].astype(int)
    ch, cw = 조각.shape[:2]
    # 가운데 30% 에서 «가장 흔한 색» — 숫자가 한가운데 있어도 배지 살이 더 많다
    속 = 조각[int(ch * 0.35):max(int(ch * 0.65), int(ch * 0.35) + 1),
            int(cw * 0.35):max(int(cw * 0.65), int(cw * 0.35) + 1)].reshape(-1, 3)
    양자 = (속 // 16) * 16
    값, 수 = np.unique(양자, axis=0, return_counts=True)
    색 = 값[수.argmax()] + 8
    # 네모 «밖» 도 같은 색이면 그건 배지가 아니라 종이다(빈 종이에 그은 네모).
    테 = 4
    바깥 = np.concatenate([
        img[max(0, y0 - 테):y0, x0:x1].reshape(-1, 3), img[y1:min(h, y1 + 테), x0:x1].reshape(-1, 3),
        img[y0:y1, max(0, x0 - 테):x0].reshape(-1, 3), img[y0:y1, x1:min(w, x1 + 테)].reshape(-1, 3)])
    if len(바깥) and np.abs(np.median(바깥, axis=0) - 색).sum() <= 한색허용:
        return None
    같음 = (np.abs(조각 - 색).sum(axis=2) <= 한색허용).astype(np.uint8)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(같음)
    if n < 2:
        return None
    # 가운데 점을 품은 덩이가 없으면(가운데가 숫자) 제일 큰 덩이
    가운데 = lab[ch // 2, cw // 2]
    k = 가운데 if 가운데 > 0 else 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    덩이 = lab == k
    if 덩이.sum() < 한색최소비 * ch * cw:
        return None
    덩이 = 구멍메우기(np.where(덩이, 255, 0).astype(np.uint8))
    mask = np.zeros((h, w), bool)
    mask[y0:y1, x0:x1] = 덩이
    return mask


def 만들기(img: np.ndarray, box, 글자네모들=None, 글: str = "", 글꼴: str | None = None,
         굵기: str | None = None, 글자색: str | None = None, 이웃=(), 테두리=None) -> dict | None:
    """`img` 에서 배지를 떼어 번호판을 만든다. 못 떼면 `None`.

    `box`·`글자네모들`·`이웃`·`테두리` 는 모두 `img` 와 같은 자다(부르는 쪽이 1080 을
    주면 1080). 돌려주는 `네모` 도 같은 자다.

    배지를 떼는 길은 셋, 앞에서부터 — ① 사람이 그린 테두리(`cutout.그린테두리`)
    ② 한 색 덩이(`한색덩이`) ③ 흘려채우기(`outline.테두리따기`).
    """
    mask = None
    if 테두리:
        난 = cutout.그린테두리(np.ascontiguousarray(img), 테두리, [int(v) for v in box], 0.0)
        mask = None if 난.get("못땄음") else 난["마스크"]
    if mask is None:
        mask = 한색덩이(np.ascontiguousarray(img), box)
    if mask is None:
        난 = outline.테두리따기(np.ascontiguousarray(img), [int(v) for v in box], 이웃=list(이웃))
        mask = None if 난.get("못땄음") else 난["마스크"]
    if mask is None:
        return None
    tb = cutout.tight_box(mask)
    if tb is None:
        return None
    x0, y0, x1, y1 = tb
    rgb = np.ascontiguousarray(img[y0:y1, x0:x1])
    alpha = np.where(mask[y0:y1, x0:x1], 255, 0).astype(np.uint8)
    속 = alpha > 250
    if 속.sum() < 16:
        return None
    바탕 = 배지색(rgb, 속)
    안네모 = [[a - x0, b - y0, c - x0, d - y0] for a, b, c, d in (글자네모들 or [])] or None
    잉크 = 숫자마스크(rgb, alpha, 안네모)
    # 숫자 자리가 «구멍» 으로 뚫려 왔으면 배지 살로 메운다 — 메운 자리는 아래
    # `지우기` 가 둘레 무늬로 채운다.
    alpha = np.where(잉크, 255, alpha).astype(np.uint8)
    속 = alpha > 250

    숫자 = {"font": 글꼴, "weight": 굵기, "본보기": (글 or "").strip()}
    if 잉크.any():
        ys, xs = np.where(잉크)
        h, w = alpha.shape
        잉크높이 = int(ys.max() - ys.min() + 1)
        숫자["중심"] = [round(float((xs.min() + xs.max() + 1) / 2 / w), 4),
                     round(float((ys.min() + ys.max() + 1) / 2 / h), 4)]
        비 = 숫자비(글꼴, 굵기) or 0.72
        숫자["pt"] = int(round(잉크높이 / 비))
        숫자["글자색"] = 글자색 or _hex(np.median(rgb[잉크], axis=0))
    else:
        # 숫자를 못 찾았다 — 배지만 도장으로 쓰고, 숫자는 가운데에 찍는다.
        숫자["중심"] = [0.5, 0.5]
        숫자["pt"] = None
        숫자["글자색"] = 글자색

    지운 = 지우기(rgb, alpha, 잉크)
    새rgb, 새alpha = 흰테없애기(지운, alpha, 바탕)
    buf = io.BytesIO()
    Image.fromarray(np.dstack([새rgb, 새alpha]), "RGBA").save(buf, format="PNG")
    return {"png": buf.getvalue(), "네모": [int(x0), int(y0), int(x1), int(y1)],
            "배지색": _hex(바탕), "숫자": 숫자, "숫자있음": bool(잉크.any())}
