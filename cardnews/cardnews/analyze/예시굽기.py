# analyze/예시굽기.py
"""채팅에 보여 줄 «라벨 예시» 그림을 굽는다.

인스타 주소를 붙이면 채팅이 곧바로 「라벨하러 가기」로 보낸다. 처음 보는 사람은
무엇을 어떻게 그어야 하는지 모른다 — 그래서 그 단추 위에 **이미 라벨해 둔
게시물 두 벌**을 그림으로 먼저 보여 준다(사람 결정 2026-09-22).

**장을 가로 한 줄로 늘어놓는다**(사람 결정 2026-09-22). 채팅의 그림 자리가
가로로 납작해서, 세로로 긴 카드뉴스 한 장을 그대로 넣으면 위아래가 잘려 거의
안 보인다.

색은 라벨 화면과 **같아야 한다** — `web/lib/label.js` 의 `COLORS`. 다르면 예시를
보고 화면에 왔을 때 같은 종류가 다른 색으로 보인다.

한 번 굽고 끝이다. 라벨 종류나 색 규칙이 바뀌면 다시 돌린다.

사용:
    set BOARD_URL=...
    set BOARD_PASSWORD=...
    python analyze/예시굽기.py
"""
import io
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config
from fetch_board import get, settings

# 어느 게시물을 예시로 쓰나. 표지 글자로 골랐다(사람 결정 2026-09-22).
예시들 = [
    ("DHqCBQnRAjW", "label-example-1.jpg"),   # 요즘은 이 브랜드가 SNS를 잘한대요 7
    ("DNUFIa4NIkK", "label-example-2.jpg"),   # SNS 담당자가 알아야 할 요즘 카드뉴스 트렌드.zip
    ("DG0AA6PJ8s4", "label-example-3.jpg"),   # 키키로 배우는 브랜딩 전략
]

# **`web/lib/label.js` 의 COLORS 와 글자까지 같아야 한다.** 한 쪽만 고치면 예시와
# 화면이 갈린다.
색 = {
    "글자": "#2CB7B1", "사진": "#F2A93B", "인물": "#E5556E", "도형": "#5A8CFF",
    "장식": "#A45AFF", "로고": "#37B24D", "장번호": "#FFD43B", "빼기": "#868E96",
}

한장폭 = 360      # 장 하나를 이 폭으로 줄여 잇는다
틈 = 10           # 장과 장 사이 흰 틈
선굵기 = 5
나갈곳 = Path(__file__).resolve().parent.parent / "web"


def _선(색값: str) -> tuple:
    색값 = 색값.lstrip("#")
    return tuple(int(색값[i:i + 2], 16) for i in (0, 2, 4))


def 네모그리기(장: Image.Image, 칸들: list, 글꼴) -> Image.Image:
    """사람이 그은 네모를 종류 색으로 그 위에 얹는다.

    **테두리 점이 있으면 그 모양 그대로 그린다** — 원·별·말풍선을 네모로 그리면
    「도형은 네모로 긋는 것」이라고 잘못 배운다.
    """
    판 = 장.convert("RGB")
    그림 = ImageDraw.Draw(판, "RGBA")
    for b in 칸들:
        kind = b.get("kind") or ""
        c = _선(색.get(kind, "#FF00FF"))
        점들 = b.get("테두리")
        if 점들 and len(점들) >= 3:
            그림.polygon([tuple(p) for p in 점들], outline=c, width=선굵기)
        else:
            x0, y0, x1, y1 = b.get("box") or [0, 0, 0, 0]
            그림.rectangle([x0, y0, x1, y1], outline=c, width=선굵기)
        # 종류 이름을 네모 왼쪽 위에 붙인다. 색만으로는 무슨 종류인지 모른다.
        x0, y0 = (b.get("box") or [0, 0, 0, 0])[:2]
        왼, 위, 오, 아래 = 그림.textbbox((0, 0), kind, font=글꼴)
        그림.rectangle([x0, y0 - (아래 - 위) - 10, x0 + (오 - 왼) + 12, y0], fill=c + (230,))
        그림.text((x0 + 6, y0 - (아래 - 위) - 6), kind, font=글꼴, fill=(255, 255, 255))
    return 판


def 한줄로잇기(장들: list) -> Image.Image:
    """장들을 가로 한 줄로 이어 붙인다."""
    쪽들 = [p.resize((한장폭, max(1, round(p.height * 한장폭 / p.width))), Image.LANCZOS)
          for p in 장들]
    칸높이 = max(p.height for p in 쪽들)
    폭 = len(쪽들) * 한장폭 + (len(쪽들) - 1) * 틈
    판 = Image.new("RGB", (폭, 칸높이), (255, 255, 255))
    for i, 쪽 in enumerate(쪽들):
        판.paste(쪽, (i * (한장폭 + 틈), 0))
    return 판


def 굽기(pid: str, 이름: str) -> Path:
    base, pw = settings()
    # **게시판에서 그때그때 읽는다** — 로컬 라벨 파일은 낡아 있을 수 있다.
    rows = json.loads(get(f"{base}/api/labels/{pid}", pw).decode("utf-8"))
    칸표 = {r["index"]: (r.get("boxes") or []) for r in rows}
    글꼴 = ImageFont.truetype(
        str(Path(__file__).resolve().parent / "fonts" / "GmarketSansTTFMedium.ttf"), 34)

    터 = Path(config.IMAGES) / pid
    장들 = []
    for 길 in sorted(터.glob("*.jpg")):
        n = int(길.stem)
        장들.append(네모그리기(Image.open(길), 칸표.get(n, []), 글꼴))
    if not 장들:
        raise SystemExit(f"{pid}: 그림이 없다 — 먼저 fetch_labels.py 로 받아라")

    판 = 한줄로잇기(장들)
    통 = io.BytesIO()
    판.save(통, format="JPEG", quality=82, optimize=True)
    길 = 나갈곳 / 이름
    길.write_bytes(통.getvalue())
    print(f"++ {pid} · {len(장들)}장 · {판.size[0]}x{판.size[1]} · "
          f"{len(통.getvalue()) // 1024}KB → {길}")
    return 길


def main() -> None:
    for pid, 이름 in 예시들:
        굽기(pid, 이름)


if __name__ == "__main__":
    main()
