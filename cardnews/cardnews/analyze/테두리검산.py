# -*- coding: utf-8 -*-
"""재분석한 틀의 **테두리가 제대로 붙었는지** 눈으로 가리게 그림을 만든다.

테두리 재기는 사진 하나에서 테두리가 잡히면 그 색·굵기를 **그 게시물의 모든
사진에 넣는다**(사람 결정 2026-09-19). 그래서 물어야 할 것이 하나 생긴다 —

    통일로 채워진 칸이
      ① 원래 테두리가 있었는데 못 잡은 것인가   → 통일 규칙이 제 몫을 했다
      ② 원래 없던 칸에 얹은 것인가              → 문턱을 잘못 잡았다

**1px·2px 짜리는 원본 크기로는 사람 눈에 안 보인다.** 그래서 칸 가장자리를
잘라 4배로 키워 낸다(테두리 세션 요청 2026-09-19: 작은 썸네일만 보고 진짜
테두리 넷을 「아닐 것」이라고 잘못 넘긴 적이 있다).

    python analyze/테두리검산.py DG0AA6PJ8s4 [DHqCBQnRAjW …]
"""
import json
import sys
from pathlib import Path

from PIL import Image

뿌리 = Path(__file__).resolve().parent
그림터 = 뿌리 / "data" / "images"
낼곳 = 뿌리 / "data" / "verify" / "테두리"

확대 = 4
"""**4배로 키운다.** 1px 테두리가 4px 이 되어야 눈에 걸린다."""

띠 = 18
"""가장자리에서 안쪽으로 이만큼 본다. 테두리가 8px 까지 나오므로 넉넉히 잡는다."""


def _틀읽기(코드: str) -> dict:
    """재분석이 낸 틀. 창고에서 받아 둔 것을 먼저 보고, 없으면 data/ 를 본다."""
    for p in (뿌리 / "data" / "templates" / f"{코드}.json",
              뿌리 / "data" / f"{코드}.json"):
        if p.exists():
            return json.loads(p.read_text(encoding="utf-8"))
    raise SystemExit(f"{코드} 틀 파일이 없다 — 재분석이 끝났고 받아 왔나?")


def _가장자리(그림: Image.Image, box) -> Image.Image:
    """네모의 왼쪽 위 모서리를 잘라 키운다 — 테두리는 모서리에서 제일 잘 보인다.

    **바깥쪽 여백까지 같이 잘라야 한다.** 네모가 사진 «안쪽» 에 그어져 있으면
    테두리는 네모 밖에 있다. 안쪽만 보면 테두리가 아예 안 잡힌다.
    """
    try:
        x0, y0, x1, y1 = [int(v) for v in box]
    except (TypeError, ValueError):
        return None
    w, h = 그림.size
    안폭, 안높 = min(띠 * 3, x1 - x0), min(띠 * 3, y1 - y0)
    if 안폭 < 4 or 안높 < 4:
        return None
    # 모서리 기준으로 바깥 `띠`, 안쪽 `띠*3` 만큼.
    좌, 위 = max(0, x0 - 띠), max(0, y0 - 띠)
    우, 아 = min(w, x0 + 안폭), min(h, y0 + 안높)
    if 우 - 좌 < 4 or 아 - 위 < 4:
        return None
    조각 = 그림.crop((좌, 위, 우, 아))
    return 조각.resize((조각.width * 확대, 조각.height * 확대), Image.NEAREST)


def 한판(코드: str) -> dict:
    틀 = _틀읽기(코드)
    낼곳.mkdir(parents=True, exist_ok=True)
    센것 = {"직접": 0, "통일": 0, "없음": 0}
    줄 = []
    for s in 틀.get("슬라이드") or []:
        장 = s.get("index")
        길 = 그림터 / 코드 / f"{장:02d}.jpg"
        그림 = Image.open(길).convert("RGB") if 길.exists() else None
        for i, d in enumerate(s.get("장식영역") or []):
            if d.get("종류") != "사진":
                continue
            굵기 = d.get("선굵기") or 0
            if not 굵기:
                센것["없음"] += 1
                continue
            # **갈래는 틀이 적어 둔 것만 믿는다.** 안 적혀 있으면 「모름」으로
            # 두고 통일 쪽에 센다 — 넘겨짚어 「직접」이라고 하지 않는다.
            갈래 = d.get("선출처") or "모름"
            센것["직접" if 갈래 == "직접" else "통일"] += 1
            줄.append(f"  {장}장 칸{i}: {갈래} · {d.get('선색')} {굵기}px")
            if 그림 is None:
                continue
            조각 = _가장자리(그림, d.get("box"))
            if 조각 is None:
                continue
            이름 = (f"{코드}-{장:02d}-{i}-{갈래}-"
                   f"{(d.get('선색') or 'x').lstrip('#')}-{굵기}px.png")
            조각.save(낼곳 / 이름)
    return {"센것": 센것, "줄": 줄}


def main() -> None:
    코드들 = sys.argv[1:]
    if not 코드들:
        raise SystemExit(__doc__)
    보고 = []
    for 코드 in 코드들:
        r = 한판(코드)
        c = r["센것"]
        보고.append(f"{코드}: 테두리 붙은 칸 {c['직접'] + c['통일']}개 "
                    f"(직접 {c['직접']} · 통일 {c['통일']}) · 없는 칸 {c['없음']}개")
        보고 += r["줄"]
    글 = "\n".join(보고)
    낼곳.mkdir(parents=True, exist_ok=True)
    (낼곳 / "요약.txt").write_text(글, encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    print(글)
    print(f"\n조각 그림: {낼곳}")


if __name__ == "__main__":
    main()
