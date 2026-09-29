# analyze/lineback.py
"""글자 **줄 하나의 뒤에 깔린 색** 을 잰다 — 형광펜이 여기서 나온다.

**왜 따로 재나.** 계량표는 글자 네모 하나를 한 벌의 값(`pt`·`color`·`weight`·
`leading`)으로 적는다. 그래서 덩어리 **안에서** 달라지는 것은 담을 칸이 없다.
형광펜이 딱 그것이다 — 네 줄짜리 본문에서 두 줄만 노랗게 깔려 있어도 계량표에는
자국이 안 남는다. 게다가 형광펜을 「도형」으로 따로 그어도 소용이 없다:
`merge_labeled._color_of` 가 글자 네모를 모든 마스크에서 빼기 때문에 그 도형은
통째로 사라진다. 담을 칸이 없는 것이지 못 재는 것이 아니다.

**어떻게 재나.** 줄 상자 안에서

1. **글자 화소를 뺀다.** 이미 잰 글자색(`layout.line_color`)에서 LAB 로
   `GLYPH_DE` 보다 가까운 화소가 글자다. 「어두우면 글자」 같은 자를 쓰지 않는
   이유는 어두운 바탕 위 흰 글자에서 그 자가 거꾸로 서기 때문이다.
2. **남은 화소를 색 무리로 묶는다.** `tint.BINS` 로 뭉갠 뒤, 큰 구간부터
   LAB 거리 `MERGE_DE` 안쪽을 흡수한다 — 형광펜 경계의 안티에일리어싱이 제
   무리로 갈라지지 않게.
3. **세로줄마다 어느 무리가 이겼는지 세어 가로로 잇는다.** 형광펜은 **가로로
   이어진 띠**다. 사진은 아니다 — 이 차이가 「띠인가 아닌가」를 가른다.
4. 이어진 구간(`run`)이 `MAX_RUNS` 보다 많이 갈리면 띠가 아니라고 보고
   **아무 색도 적지 않는다**(`fallback`). 그럴듯한 색 하나로 메우면 계량표가
   되돌려 그릴 때 사진 자리에 평평한 판을 칠하게 된다.

**좌표.** `box` 도 돌려주는 `x0`·`x1` 도 부르는 쪽과 같은 자다(파이프라인에서는
1080 캔버스). 여기서 배율을 곱하지 않는다.
"""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import tint

# 잰 글자색에서 이보다 가까운(LAB) 화소는 글자로 보고 뺀다.
GLYPH_DE = 25.0
# 뭉갠 색 구간을 이 거리(LAB) 안쪽끼리 한 무리로 흡수한다.
MERGE_DE = 12.0
# 몇 무리까지 따지나. 바탕 하나 + 형광펜 하나면 둘이다.
BANDS = 2
# 이 뭉치 구간까지만 본다 — 그 아래는 안티에일리어싱 부스러기다.
TOP_BINS = 40
# 이보다 좁은 구간은 옆 구간에 흡수한다(px).
MIN_RUN = 12
# 구간이 이보다 많이 갈리면 띠가 아니다.
MAX_RUNS = 3
# 글자를 뺀 화소가 이보다 적으면 재지 않는다.
MIN_PIXELS = 50


def _hex(rgb) -> str:
    r, g, b = (int(v) for v in np.round(rgb))
    return f"#{r:02X}{g:02X}{b:02X}"


def _lab_of(hex_or_rgb) -> np.ndarray:
    rgb = tint._hex_to_rgb(hex_or_rgb) if isinstance(hex_or_rgb, str) else np.asarray(hex_or_rgb)
    return tint.to_lab(np.array([[np.round(rgb).astype(np.uint8)]], np.uint8))[0, 0]


def _groups(px: np.ndarray) -> list[np.ndarray]:
    """화소를 색 무리로 묶어 큰 것부터 돌려준다. 각 원소는 `px` 에 대한 불리언 골라내기."""
    step = max(256 // tint.BINS, 1)
    q = px.astype(np.int64) // step
    keys = q[:, 0] * 65536 + q[:, 1] * 256 + q[:, 2]
    vals, counts = np.unique(keys, return_counts=True)
    order = counts.argsort()[::-1][:TOP_BINS]
    sels = [keys == vals[i] for i in order]
    labs = [_lab_of(px[s].mean(axis=0)) for s in sels]
    used = [False] * len(sels)
    out = []
    for i in range(len(sels)):
        if used[i]:
            continue
        used[i] = True
        sel = sels[i].copy()
        for j in range(i + 1, len(sels)):
            if not used[j] and float(np.linalg.norm(labs[i] - labs[j])) < MERGE_DE:
                used[j] = True
                sel |= sels[j]
        out.append(sel)
    out.sort(key=lambda s: -int(s.sum()))
    return out[:BANDS]


def _runs(best: np.ndarray) -> list[list[int]]:
    """세로줄마다의 무리 번호를 가로로 이어진 구간으로 만든다.

    좁은 구간은 앞 구간에 흡수하고, 이웃한 같은 무리는 합친다 — 글자 사이
    한두 칸이 반대로 나오는 것 때문에 띠가 조각나지 않게.
    """
    runs = [[int(best[0]), 0, 1]]
    for x in range(1, len(best)):
        if int(best[x]) == runs[-1][0]:
            runs[-1][2] = x + 1
        else:
            runs.append([int(best[x]), x, x + 1])
    changed = True
    while changed and len(runs) > 1:
        changed = False
        for i, r in enumerate(runs):
            if r[2] - r[1] < MIN_RUN:
                if i:
                    runs[i - 1][2] = r[2]
                else:
                    runs[1][1] = r[1]
                runs.pop(i)
                changed = True
                break
        i = 0
        while i + 1 < len(runs):
            if runs[i][0] == runs[i + 1][0]:
                runs[i][2] = runs[i + 1][2]
                runs.pop(i + 1)
                changed = True
            else:
                i += 1
    return runs


def _fail(why: str) -> dict:
    """실패도 성공과 같은 모양으로 남긴다 — 소비자가 갈래를 안 타게
    (`layout_labeled.block()` · `merge_labeled._mark()` 와 같은 관례)."""
    return {"runs": [], "fallback": True, "why": why}


def back_of(img: np.ndarray, box, ink_hex: str | None) -> dict:
    """줄 하나 뒤에 깔린 색. `{"runs": [{"hex","x0","x1","ratio"}, ...]}`.

    `ratio` 는 그 구간의 **너비 몫**이다(구간 너비 ÷ 줄 너비). 형광펜이 줄
    가운데서 끊기면 그 몫이 1 보다 작게 나온다 — 참·거짓 한 칸으로는 담을 수
    없는 것이라 몫으로 적는다.
    """
    if not ink_hex:
        return _fail("글자색을 못 재서 글자 화소를 가릴 수 없다")
    x0, y0, x1, y1 = (int(round(v)) for v in box)
    sub = img[max(0, y0):max(0, y1), max(0, x0):max(0, x1)]
    if sub.size == 0 or sub.shape[1] < MIN_RUN:
        return _fail("줄 상자가 비었거나 너무 좁다")
    h, w = sub.shape[:2]
    flat = sub.reshape(-1, 3)
    d = np.linalg.norm(tint.to_lab(flat.reshape(1, -1, 3))[0] - _lab_of(ink_hex), axis=1)
    keep = d >= GLYPH_DE
    if int(keep.sum()) < MIN_PIXELS:
        return _fail(f"글자를 빼고 남은 화소가 {int(keep.sum())}개뿐이다")
    px = flat[keep]
    groups = _groups(px)
    cols = np.flatnonzero(keep) % w
    votes = np.zeros((w, len(groups)), np.int64)
    for gi, sel in enumerate(groups):
        np.add.at(votes[:, gi], cols[sel], 1)
    best = np.where(votes.sum(axis=1) > 0, votes.argmax(axis=1), -1)
    # 글자를 뺀 화소가 하나도 없는 세로줄은 앞칸을 물려받는다 — 「모름」으로
    # 두면 획 하나가 띠를 두 조각으로 가른다.
    for x in range(w):
        if best[x] < 0:
            best[x] = best[x - 1] if x else 0
    if best[0] < 0:
        best[0] = 0
    runs = _runs(best)
    if len(runs) > MAX_RUNS:
        return _fail(f"색이 줄 안에서 {len(runs)}번 갈린다 — 띠가 아니라 무늬·사진이다")
    hexes = [_hex(px[s].mean(axis=0)) for s in groups]
    return {"runs": [{"hex": hexes[g], "x0": x0 + a, "x1": x0 + b,
                      "ratio": round((b - a) / w, 3)} for g, a, b in runs]}
