# -*- coding: utf-8 -*-
"""**구글 비전 없이 글자를 읽는다** (사람 지시 2026-09-24).

여태 글자 네모 하나에 구글 비전을 한 번씩 불렀다($0.0015). 그런데 우리가 거기서
실제로 얻어 쓰는 것은 셋뿐이고, **둘은 화소로 공짜로 잴 수 있다**:

| 무엇 | 어디서 | 실측 (2026-09-24) |
|---|---|---|
| 자리 | **사람이 그은 라벨** | 이미 있다 |
| 줄이 몇 개, 어디 | **화소** — 잉크가 있는 행을 띠로 끊는다 | 공짜 |
| 글자 크기 | **화소** — 띠 높이 | 구글 대비 **0.976** |
| 글자 내용 | 값싼 모델 | 루나 **1.00** · $0.0032/17개 (구글의 1/8) |

**내는 모양은 예전 구글 갈래와 똑같다** — 글자별 네모 목록이다. 그래야
아랫단(`layout.group_lines`·`잰것`·`line_detail`·`_align`·`_leading`)을 하나도
안 고친다.

**글자 네모는 줄 띠에 글자 수만큼 고르게 펴서 짓는다. 정확할 필요가 없다** —
글자별 네모를 진짜로 쓰던 곳은 글씨체 맞히기 하나였는데 그것은 껐다(2026-09-24:
정답 아는 시험 32가지 중 6개, 19%). 지금 그 네모가 하는 일은 **줄로 다시 묶이는
것**과 **높이로 크기를 알리는 것** 둘뿐이고, 둘 다 띠에서 나온다.

**화소가 임자다.** 모델이 줄을 다르게 끊어 와도 줄 자리는 화소가 정한다 — 모델은
글자만 준다.

열쇠는 머리말에만 싣는다. 값은 어디에도 안 찍는다.
"""
import base64
import io
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config
import 창고캐시
from ruler import normalize

# ── 화소로 줄을 끊는 값 ────────────────────────────────────────────
#
# **잉크인가**: 그 네모의 바탕색(중앙값)에서 이만큼 떨어지면 잉크로 본다.
# 사진 압축이 만드는 흔들림(±10 안팎)을 넉넉히 넘긴다.
잉크문턱 = 40
# 한 행이 «글자가 있는 행» 이려면 가로로 이만큼은 차 있어야 한다. 점 하나가
# 줄이 되면 크기가 통째로 틀어진다.
행채움 = 0.02
# 이보다 얇은 띠는 줄이 아니라 잡티다.
줄최소높이 = 3

모델 = os.environ.get("글자모델") or "openai/gpt-5.6-luna"
끝 = "https://openrouter.ai/api/v1/chat/completions"
# **예산을 넉넉히 둔다**(실측 2026-09-24). 800 으로 묶었더니 긴 글에서 모델이
# 생각만 하다 예산이 떨어져 «We need answer…» 같은 속말을 답으로 뱉었다.
# 4000 으로 올리니 그 둘이 0.11 → 1.00 이 됐다. 「생각하지 마라」는 안 붙인다 —
# 그것만으로는 안 고쳐졌고(0.09), 한 번에 하나씩만 바꿔 확인한 값이다.
예산 = 4000
캐시칸 = "글자"

_물음 = ("이 그림에 적힌 글자를 **그대로 옮겨 적어라.** 줄이 여럿이면 줄을 나눠서 적어라. "
       "설명·따옴표·번호 붙이지 말고 **글자만** 적어라.")


def 열쇠() -> str:
    """`OPENROUTER_API_KEY`. 셸이 못 보면 레지스트리에서 읽는다 — 시스템 환경변수를
    나중에 넣으면 이미 떠 있는 셸에는 안 들어온다."""
    # **환경변수가 «있는데 비어 있으면» 끈 것으로 본다.** 레지스트리를 곧바로
    # 읽으면 시험이 환경변수를 지워도 비켜 가서 **진짜 망을 탄다**(실물
    # 2026-09-24: 전체 시험이 100초 → 310초가 되고 22개가 깨졌다).
    if "OPENROUTER_API_KEY" in os.environ:
        return os.environ["OPENROUTER_API_KEY"].strip()
    if os.name != "nt":
        return ""
    import winreg  # noqa: PLC0415 — 윈도우에만 있다
    for 뿌, 길 in ((winreg.HKEY_CURRENT_USER, "Environment"),
                  (winreg.HKEY_LOCAL_MACHINE,
                   r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment")):
        try:
            with winreg.OpenKey(뿌, 길) as k:
                v, _ = winreg.QueryValueEx(k, "OPENROUTER_API_KEY")
                if v:
                    return v
        except OSError:
            pass
    return ""


def 있나() -> bool:
    return bool(열쇠())


def _자른것(회색, box):
    h, w = 회색.shape[:2]
    x0, y0, x1, y1 = (int(round(v)) for v in box)
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(w, x1), min(h, y1)
    return (x0, y0, x1, y1), 회색[y0:y1, x0:x1]


네모높이목표 = 48
"""오려 보낼 네모의 목표 높이(px). 작은 조각은 글자가 뭉개져 모델이 놓친다."""
네모여유 = 8
"""네모 둘레에 주는 여유(px) — 획 끝이 잘리면 글자가 달라 보인다."""


def 크게오리기(box, w: int, h: int, target: int = 네모높이목표, pad: int = 네모여유):
    """네모를 얼마나 키워 보낼지 정한다. `(오릴 네모, 배율)`.

    네모 높이가 이미 `target` 보다 크면(글이 여러 줄인 큰 네모) 그대로 보낸다 —
    줄이지는 않는다. 작으면 `target` 에 맞춰 키운다.
    """
    x0, y0, x1, y1 = box
    bh = y1 - y0
    scale = max(1.0, target / bh) if bh > 0 else 1.0
    crop_box = [max(0, x0 - pad), max(0, y0 - pad), min(w, x1 + pad), min(h, y1 + pad)]
    return crop_box, scale


def 줄띠들(회색, box) -> list:
    """`box` 안에서 **잉크가 있는 행**을 띠로 끊는다. `[(y0, y1), …]` — 원본 좌표.

    네모 전체를 한 번에 재면 여러 줄짜리가 줄 수만큼 크게 나온다(실측 6.0배).
    """
    (x0, y0, x1, y1), 조각 = _자른것(회색, box)
    if 조각.size < 100:
        return []
    잉크 = np.abs(조각.astype(np.int16) - np.median(조각)) > 잉크문턱
    찬행 = 잉크.sum(axis=1) > max(1, 조각.shape[1] * 행채움)
    띠, 시 = [], None
    for i, v in enumerate(찬행):
        if v and 시 is None:
            시 = i
        elif not v and 시 is not None:
            if i - 시 >= 줄최소높이:
                띠.append((y0 + 시, y0 + i))
            시 = None
    if 시 is not None and len(찬행) - 시 >= 줄최소높이:
        띠.append((y0 + 시, y0 + len(찬행)))
    return 띠


def 줄네모들(img, box) -> list:
    """줄마다의 네모 `[x0, y0, x1, y1]` — 가로도 **잉크가 있는 데까지만** 잡는다.

    네모 가로를 그대로 쓰면 정렬(`_align`)이 늘 «양쪽» 으로 보인다.
    """
    회색 = np.asarray(Image.fromarray(np.ascontiguousarray(img)).convert("L"))
    (bx0, _, bx1, _), _ = _자른것(회색, box)
    난것 = []
    for y0, y1 in 줄띠들(회색, box):
        줄 = 회색[y0:y1, bx0:bx1]
        잉크 = np.abs(줄.astype(np.int16) - np.median(줄)) > 잉크문턱
        열 = np.where(잉크.any(axis=0))[0]
        if not len(열):
            continue
        난것.append([float(bx0 + 열[0]), float(y0), float(bx0 + 열[-1] + 1), float(y1)])
    return 난것


def 심볼짓기(img, box, 글: str | None) -> list:
    """줄 네모에 글자를 **고르게 펴서** 글자별 네모를 짓는다.

    **화소가 본 줄 수가 임자다.** 모델이 줄을 다르게 끊어 오면 글을 통째로 이어
    붙인 뒤 줄마다 글자 수에 맞춰 다시 나눈다 — 줄 자리는 화소가 알고, 모델은
    글자만 안다.
    """
    줄네모 = 줄네모들(img, box)
    글 = (글 or "").strip()
    if not 줄네모 or not 글:
        return []
    쪽 = [s for s in (l.strip() for l in 글.splitlines()) if s]
    if len(쪽) > len(줄네모):
        # **모델이 줄을 더 많이 셌다 — 그쪽을 믿고 띠를 쪼갠다.**
        #
        # 줄 사이에 잉크 없는 행이 없으면 화소는 한 덩어리로 본다. 그러면 글자
        # 높이가 «여러 줄 높이» 가 되어 크기가 곱절로 나온다(실물 DHqCBQnRAjW
        # 1번 장: 구글 96.5 인데 화소 221.0 — **2.29배**). 모델은 글을 읽으면서
        # 줄바꿈도 같이 주므로 그 수를 쓴다.
        #
        # **키 큰 띠부터 쪼갠다.** 모자란 줄 수만큼, 그때그때 제일 높은 띠를
        # 둘로 가른다 — 붙어 버린 것이 그 띠이기 때문이다.
        줄네모 = [list(b) for b in 줄네모]
        while len(줄네모) < len(쪽):
            i = max(range(len(줄네모)), key=lambda j: 줄네모[j][3] - 줄네모[j][1])
            x0, y0, x1, y1 = 줄네모[i]
            if y1 - y0 < 줄최소높이 * 2:
                break                      # 더 쪼갤 수 없다 — 있는 대로 간다
            가 = (y0 + y1) / 2
            줄네모[i:i + 1] = [[x0, y0, x1, 가], [x0, 가, x1, y1]]
    if len(쪽) != len(줄네모):
        # 줄 수가 여전히 안 맞는다(모델이 덜 셌다) — **화소가 임자다.** 글을
        # 통째로 이어 붙여 줄 폭에 비례해 다시 나눈다.
        통 = "".join(쪽)
        폭 = [max(1.0, b[2] - b[0]) for b in 줄네모]
        몫 = sum(폭)
        쪽, 앞 = [], 0
        for i, w in enumerate(폭):
            끝자리 = len(통) if i == len(폭) - 1 else 앞 + max(1, round(len(통) * w / 몫))
            쪽.append(통[앞:끝자리])
            앞 = 끝자리
    난것 = []
    for 글줄, (x0, y0, x1, y1) in zip(쪽, 줄네모):
        글줄 = 글줄.strip()
        if not 글줄:
            continue
        낱폭 = (x1 - x0) / len(글줄)
        for j, c in enumerate(글줄):
            난것.append({"text": c,
                       "box": [x0 + j * 낱폭, y0, x0 + (j + 1) * 낱폭, y1],
                       "break": ""})
    return 난것


def 부르기(조각: Image.Image) -> str:
    """오린 조각 하나를 모델에 보내 글자를 받는다. 실패하면 예외.

    **열쇠가 비었으면 보내기 전에 멈춘다.** 그냥 보내면 빈 `Authorization` 으로
    진짜 요청이 나간다 — 시험이 그렇게 망을 탄 적이 있다(2026-09-24: 전체 시험이
    100초 → 310초, 22개가 깨졌다).
    """
    열 = 열쇠()
    if not 열:
        raise RuntimeError("OPENROUTER_API_KEY 가 비어 있다 — 글자 모델을 못 부른다")
    b = io.BytesIO(); 조각.save(b, "PNG")
    주소 = "data:image/png;base64," + base64.b64encode(b.getvalue()).decode("ascii")
    몸 = {"model": 모델, "max_tokens": 예산,
         "messages": [{"role": "user", "content": [
             {"type": "text", "text": _물음},
             {"type": "image_url", "image_url": {"url": 주소}}]}]}
    요 = urllib.request.Request(
        끝, data=json.dumps(몸, ensure_ascii=False).encode("utf-8"),
        headers={"Authorization": "Bearer " + 열, "Content-Type": "application/json"})
    try:
        r = json.loads(urllib.request.urlopen(요, timeout=240).read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"글자 모델 {e.code}") from None
    쪽지 = (r.get("choices") or [{}])[0].get("message") or {}
    # **`content` 만 읽지 않는다** — 생각이 `reasoning` 칸으로 새는 일이 있다.
    return ((쪽지.get("content") or "").strip()
            or (쪽지.get("reasoning_content") or "").strip()
            or (쪽지.get("reasoning") or "").strip())


def _열쇠(pid: str, index: int, box) -> str:
    return 창고캐시.열쇠(캐시칸, pid, index, [round(float(v), 1) for v in box], 모델)


def read_slide(pid: str, index: int, boxes: list) -> dict:
    """한 장의 글자 네모들을 읽는다. **예전 구글 갈래와 같은 모양**이다.

    한 네모가 실패해도 나머지는 버리지 않는다 — 그 네모만 `error` 를 담아 낸다.
    """
    img, scale = normalize.load(config.IMAGES / pid / f"{index:02d}.jpg")
    잴것 = [b for b in boxes if config.글자를_재나(b)]
    if not 잴것:
        return {}
    난것 = {}
    for b in 잴것:
        재 = [v * scale for v in b["box"]]
        열 = _열쇠(pid, index, 재)
        있 = 창고캐시.글꺼내기(열)
        if 있 is not None:
            난것[b["id"]] = 있
            continue
        try:
            크롭, 배 = 크게오리기([int(v) for v in 재], img.shape[1], img.shape[0])
            조 = Image.fromarray(np.ascontiguousarray(img)).crop(tuple(크롭))
            if 배 != 1.0:
                조 = 조.resize((round(조.width * 배), round(조.height * 배)), Image.LANCZOS)
            글 = 부르기(조)
            몫 = {"box": [round(v) for v in 재], "symbols": 심볼짓기(img, 재, 글)}
        except Exception as e:  # noqa: BLE001 — 이 네모만 실패로 남긴다
            난것[b["id"]] = {"box": [round(v) for v in 재], "symbols": [], "error": str(e)}
            continue
        난것[b["id"]] = 몫
        # **실패는 안 담는다** — 담아 두면 다음 판에도 영영 실패로 나온다.
        창고캐시.글담아두기(열, 몫)
    return 난것
