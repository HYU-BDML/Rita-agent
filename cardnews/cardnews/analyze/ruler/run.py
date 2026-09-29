# analyze/ruler/run.py
"""자 트랙 전부를 슬라이드마다 돌린다. API 를 쓰지 않으므로 전 장에 돌린다."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import config
from ruler import color, normalize, photo
from ruler import text as T


def one_slide(img_path: Path, ocr_path: Path) -> dict:
    img, scale = normalize.load(img_path)
    ocr = json.loads(ocr_path.read_text(encoding="utf-8")) if ocr_path.exists() else {}
    ls = T.lines(ocr, scale)
    boxes = [l["box"] for l in ls]

    bg = color.bg_color(img)
    fg = color.text_color(img, boxes)
    acc, blobs = color.accent(img, bg, boxes)

    return {
        "index": int(img_path.stem),
        "colors": {
            "bg": color.hexs(bg), "text": color.hexs(fg), "accent": color.hexs(acc),
            "contrast": round(color.contrast(bg, fg), 1), "accent_blobs": blobs,
            "dominance": color.dominance(bg, fg, acc),
        },
        "text": T.measure(img, ls),
        "photo_area_pct": photo.area_pct(img, boxes),
        "_h": img.shape[0],
    }


def one_post(pid: str) -> dict:
    shots = sorted((config.IMAGES / pid).glob("*.jpg"))
    slides = [one_slide(p, config.OCR_DIR / pid / f"{p.stem}.json") for p in shots]
    h = slides[0].pop("_h") if slides else 0
    for s in slides[1:]:
        s.pop("_h", None)
    # canvas 는 객체({"w":.., "h":..})여야 한다 — render.py 가 d["canvas"]["h"] 로 읽는다.
    return {"canvas": {"w": config.CANVAS_W, "h": h}, "slides": slides}


def main() -> None:
    sel = config.DATA / "selected.txt"
    if not sel.exists():
        raise SystemExit(f"{sel} 이 없다. 먼저 `python analyze/fetch_board.py` 를 돌려라.")
    ids = [x.strip() for x in sel.read_text(encoding="utf-8").splitlines() if x.strip()]
    for i, pid in enumerate(ids, 1):
        dst = config.RULER / f"{pid}.json"
        dst.write_text(json.dumps(one_post(pid), ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"  {i}/{len(ids)} {pid}")
    print("완료 (비용 0원)")


if __name__ == "__main__":
    main()
