# analyze/cluster.py
"""역할 순서가 같으면 같은 레시피다. 반복 구간은 접어서 본다.

훅-정의-사례-사례-사례-요약-CTA 와
훅-정의-사례-사례-사례-사례-요약-CTA 는 같은 골격이다(사례가 몇 번이냐만 다름).
"""
import json
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config

MIN_MEMBERS = 5


def measure_files(dir: Path) -> list[Path]:
    """실측 파일만 고른다. `<코드>.old.json` 은 merge_labeled.py 가 남긴 백업이라 뺀다.

    `*.json` 글롭은 백업도 줍는다 — 같은 게시물이 두 파일로 잡혀 표본이 조용히
    부풀고 MIN_MEMBERS 판정도 그만큼 틀어진다(실측: DHqCBQnRAjW 1건이 2건으로 잡혔다).
    """
    return sorted(p for p in dir.glob("*.json") if not p.name.endswith(".old.json"))


def collapse(seq: list[str]) -> tuple:
    """연속 반복을 접는다. ['훅','사례','사례','사례'] -> ('훅','사례*')"""
    out = []
    for r in seq:
        if out and out[-1].rstrip("*") == r:
            out[-1] = r + "*"
        else:
            out.append(r)
    return tuple(out)


def main() -> None:
    groups = defaultdict(list)
    for p in measure_files(config.MEASURES):
        d = json.loads(p.read_text(encoding="utf-8"))
        groups[collapse(d["skeleton"])].append(d["shortcode"])

    ranked = sorted(groups.items(), key=lambda kv: -len(kv[1]))
    clusters, letters = [], "ABCDEFGHIJ"
    print("골격 분포:")
    for i, (pat, members) in enumerate(ranked):
        mark = "○" if len(members) >= MIN_MEMBERS else "×"
        print(f"  {mark} {len(members):2d}건  {' → '.join(pat)}")
        if len(members) >= MIN_MEMBERS and i < len(letters):
            clusters.append({"name": letters[len(clusters)], "pattern": list(pat),
                             "members": members})

    (config.DATA / "clusters.json").write_text(
        json.dumps(clusters, ensure_ascii=False, indent=2), encoding="utf-8")

    covered = sum(len(c["members"]) for c in clusters)
    total = sum(len(m) for m in groups.values())
    print(f"\n레시피 {len(clusters)}종 (표본 {MIN_MEMBERS}건 이상)")
    print(f"묶인 게시물 {covered}/{total}건 — 나머지 {total - covered}건은 골격이 제각각이라 뺐다")
    if not clusters:
        print("\n5건 이상 모인 골격이 하나도 없다. 둘 중 하나를 한다:")
        print("  1) MIN_MEMBERS 를 3으로 낮추고 레시피에 '표본 3건'을 명시한다")
        print("  2) 같은 주제로 20~30건 더 모아 표본을 키운다")


if __name__ == "__main__":
    main()
