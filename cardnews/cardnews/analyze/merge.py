# analyze/merge.py
"""자 트랙과 눈 트랙을 슬라이드 번호로 붙인다. 도형은 여기서 자로 잰다."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config
from ruler import normalize, shape


def merge_one(pid: str, posts: dict) -> dict:
    r = json.loads((config.RULER / f"{pid}.json").read_text(encoding="utf-8"))
    e = json.loads((config.EYE / f"{pid}.json").read_text(encoding="utf-8"))
    by_index = {s["index"]: s for s in r["slides"]}

    slides = []
    for es in e["slides"]:
        i = es["index"]
        rs = by_index.get(i)
        if rs is None:
            # 조용히 넘기면 장 하나가 사라진 채로 클러스터까지 흘러간다.
            # 눈(비전)이 장 번호를 0 부터 매기기 시작하면 전부 여기서 어긋난다.
            print(f"  ! {pid}: 눈이 {i}번 장을 냈는데 자에는 그 번호가 없다 "
                  f"(자가 가진 번호: {sorted(by_index)}) — 이 장을 뺀다")
            continue

        img_path = config.IMAGES / pid / f"{i:02d}.jpg"
        shapes = []
        if img_path.exists() and es["shapes"]:
            img, _ = normalize.load(img_path)
            for sh in es["shapes"]:
                m = shape.measure(img, sh["box"])
                shapes.append({"kind": sh["kind"], "role": sh["role"], **m})

        slides.append({
            "index": i,
            "role": es["role"],
            "tone": {"formality": es["tone_formality"], "humor": es["tone_humor"],
                     "respect": es["tone_respect"], "enthusiasm": es["tone_enthusiasm"]},
            "ending": es["sentence_ending"],
            "person": es["person"],
            "is_question": es["is_question_title"],
            "colors": rs["colors"],
            "text": rs["text"],
            "photo": {"placement": es["photo_placement"], "treatment": es["photo_treatment"],
                      "content": es["photo_content"], "relation": es["text_photo_relation"],
                      "area_pct": rs["photo_area_pct"]},
            "shapes": shapes,
        })

    meta = posts.get(pid, {})
    return {
        "shortcode": pid,
        "author": meta.get("author", ""),
        "url": meta.get("url", ""),
        "slide_count": len(slides),
        "canvas": r["canvas"],
        "post_type": e["post_type"],
        "hook_strategy": e["hook_strategy"],
        "skeleton": [s["role"] for s in slides],
        "slides": slides,
    }


def main() -> None:
    for name in ("posts.json", "selected.txt"):
        if not (config.DATA / name).exists():
            raise SystemExit(
                f"{config.DATA / name} 이 없다. 먼저 `python analyze/fetch_board.py` 를 돌려라.")
    posts = {p["id"]: p for p in
             json.loads((config.DATA / "posts.json").read_text(encoding="utf-8"))}
    ids = [x.strip() for x in
           (config.DATA / "selected.txt").read_text(encoding="utf-8").splitlines() if x.strip()]
    ok = 0
    for pid in ids:
        if not (config.RULER / f"{pid}.json").exists() or not (config.EYE / f"{pid}.json").exists():
            print(f"  ! {pid}: 자 또는 눈 결과가 없다 — 건너뜀")
            continue
        d = merge_one(pid, posts)
        (config.MEASURES / f"{pid}.json").write_text(
            json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")
        ok += 1
        print(f"  {pid}  {' → '.join(d['skeleton'])}")
    print(f"\n{ok}건 완료")


if __name__ == "__main__":
    main()
