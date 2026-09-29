# analyze/export_dify.py
"""레시피를 Dify 코드 노드에 붙여넣을 파이썬 소스로 옮겨 적는다.

`docs/recipes/*.md` 는 사람이 읽는 종이이고 이 파일은 기계가 읽는 표다.
둘 다 같은 집계에서 나오므로 어긋날 수 없다 — 그래서 손으로 옮겨 적지 않는다.

Dify 코드 샌드박스 제약을 지켜야 한다(공식 문서 기준):
  - 파일 접근·네트워크 금지 → 레시피를 파일로 못 읽는다. 소스에 박는 수밖에 없다.
  - 반환값 중첩 5단계 이하 → 반환은 전부 문자열/숫자/문자열배열로만 한다.
  - 문자열 40만 자 이하
  - 변수 이름은 ASCII 로 짓는다. 값은 한국어여도 된다.
"""
import json
import statistics
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config
from recipe import _level, _med, _mode, _top

MAX_CHARS = 400_000

# Dify 코드 노드에 그대로 들어갈 부분. 레시피 하나를 골라 통째로 내준다.
MAIN_SRC = '''
def main(recipe: str) -> dict:
    r = RECIPES.get(recipe)
    if r is None:
        raise ValueError("모르는 레시피: " + str(recipe) + " / 있는 것: " + ", ".join(RECIPES))
    return r
'''


def _palettes(docs: list[dict]) -> list[list[str]]:
    """게시물마다 대표 3색을 하나씩 뽑아 목록으로 갖는다.

    평균내면 진흙색이 된다. 규칙(3색·대비 하한)만 고정하고 배색은 고르게 한다.
    """
    out = []
    for d in docs:
        s = d["slides"]
        tri = [_top([x["colors"][k] for x in s])[0] for k in ("bg", "text", "accent")]
        if tri not in out:
            out.append(tri)
    return out


def build(cluster: dict, docs: list[dict]) -> dict:
    n = len(docs)
    S = [s for d in docs for s in d["slides"]]
    m = len(S)

    pal = _palettes(docs)
    palettes = "\n".join(
        f"{i + 1}) 배경 {p[0]} · 글자 {p[1]} · 강조 {p[2]}" for i, p in enumerate(pal))

    contrasts = [s["colors"]["contrast"] for s in S]
    blobs = [s["colors"]["accent_blobs"] for s in S if s["colors"]["accent_blobs"]]
    one = sum(1 for b in blobs if b == 1)
    # 하한은 중앙값이 아니라 표본의 최솟값이다. 중앙값을 하한으로 쓰면 표본 절반이
    # 스스로 어기는 규칙이 된다.
    color_rule = (
        f"3색만 쓴다(배경·글자·강조). 배경-글자 명도 대비는 {min(contrasts):.0f}:1 이상 "
        f"(표본 중앙값 {_med(contrasts):.0f}:1).\n"
        f"강조색 덩어리는 한 장에 {_med(blobs) if blobs else 1:.0f}개 "
        f"(표본 {m}장 중 {one}장이 한 곳만 썼다).\n"
        "배색은 새로 만들지 말고 팔레트 목록에서 번호로 고른다.")

    titles, bodies, caps = _level(S, "제목"), _level(S, "본문"), _level(S, "캡션")
    lines = []
    for label, grp in (("제목", titles), ("본문", bodies), ("캡션", caps)):
        if grp:
            w, wn = _top([g["weight"] for g in grp])
            lines.append(f"{label} {_med([g['pt'] for g in grp]):.0f}pt {w} ({wn}/{len(grp)}장)")
    tpt, bpt = _med([t["pt"] for t in titles]), _med([b["pt"] for b in bodies])
    if tpt and bpt:
        lines.append(f"제목은 본문의 {tpt / bpt:.1f}배")
    # 행간 0.0 은 "한 줄뿐이라 못 쟀다" 는 표시라 값이 아니다
    lead = _med([g["leading"] for g in titles + bodies if g["leading"]])
    if lead:
        lines.append(f"행간은 글자 크기의 {lead:.2f}배")
    align, an = _mode([s["text"]["align"] for s in S])
    lines.append(f"{align} 정렬 ({an}/{m}장) · 여백 {_med([s['text']['margin'] for s in S]):.0f}px")
    type_rule = "\n".join(lines)

    shapes = [sh for s in S for sh in s["shapes"]]
    if shapes:
        srl = []
        for kind, cnt in Counter(sh["kind"] for sh in shapes).most_common():
            grp = [sh for sh in shapes if sh["kind"] == kind]
            role, _ = _top([sh["role"] for sh in grp])
            bits = [kind, role]
            r = _med([sh["radius"] for sh in grp])
            if r:
                bits.append(f"모서리 약 {r:.0f}px")
            al = [sh["alpha"] for sh in grp if sh["alpha"]]
            if al:
                bits.append(f"불투명도 {statistics.median(al) * 100:.0f}%")
            bits.append(f"채움 {_top([sh['fill'] for sh in grp])[0]}")
            srl.append(" · ".join(bits) + f" ({cnt}회)")
        shape_rule = "\n".join(srl)
    else:
        shape_rule = "도형을 쓰지 않는다."

    tone = []
    for key, label in (("formality", "형식성"), ("humor", "유머"),
                       ("respect", "존중"), ("enthusiasm", "열정")):
        v, c = _top([s["tone"][key] for s in S])
        tone.append(f"{label} {v} ({c}/{m}장)")
    end, en = _mode([s["ending"] for s in S])
    per, pn = _top([s["person"] for s in S])
    chars = [sum(lv["chars"] for lv in s["text"]["levels"]) for s in S]
    withnum = sum(1 for s in S if s["text"]["digits"] > 0)
    emoji = [s["text"]["emoji"] for s in S]
    tone_rule = (
        "말투 눈금: " + " · ".join(tone) + "\n"
        f"종결어미는 {end} ({en}/{m}장), 인칭은 {per} ({pn}장).\n"
        f"한 장 글자 수는 표본에서 평균 {statistics.mean(chars):.0f}자, "
        f"최장 {max(chars)}자였다. {max(chars)}자를 넘기지 마라.\n"
        f"제목에 수치를 넣은 장이 {withnum}/{m}장 — 되도록 넣는다.\n"
        f"이모지는 장당 {_med(emoji):.0f}개 (쓴 장 {sum(1 for e in emoji if e)}/{m}장).")

    # 골격은 접힌 것(사례*)이 아니라 펼친 것을 쓴다. 접힌 골격을 내주면
    # 골격 길이(5)와 장 수(7)가 어긋나 LLM ① 이 모순된 지시를 받는다.
    # 표본에서 가장 흔한 실제 순서를 그대로 쓴다.
    skeleton = list(_top([tuple(d["skeleton"]) for d in docs])[0])

    per_slide = []
    for pos, base in enumerate(skeleton):
        grp = [s for s in S if s["role"] == base]
        if not grp:
            continue
        repeat = skeleton.count(base)
        bits = [f"{pos + 1}장 {base}" + (f" ({base} {repeat}장 중 {skeleton[:pos + 1].count(base)}번째)"
                                         if repeat > 1 else "")]
        lv = [x for s in grp for x in s["text"]["levels"] if x["role"] == "제목"]
        if lv:
            bits.append(f"제목 {_med([x['lines'] for x in lv]):.0f}줄 "
                        f"{_med([x['chars'] for x in lv]):.0f}자")
        e2, en2 = _mode([s["ending"] for s in grp])
        bits.append(f"말투 {e2} ({en2}/{len(grp)}장)")
        # _top 은 "없음" 을 걸러내므로 사진에는 쓰지 않는다. "사진 없음" 도 정보다.
        ph, phn = _mode([s["photo"]["placement"] for s in grp])
        bits.append(f"사진 {ph} ({phn}/{len(grp)}장)")
        sk = Counter(sh["kind"] for s in grp for sh in s["shapes"])
        bits.append("도형 " + (", ".join(sk) if sk else "없음"))
        per_slide.append(" · ".join(bits))

    hooks = Counter(d["hook_strategy"] for d in docs)
    hook_rule = ("첫 장 훅 분포 — " + ", ".join(f"{k} {v}/{n}건" for k, v in hooks.most_common())
                 + ". 이 중 하나를 골라 쓴다.")

    return {
        "skeleton": skeleton,
        "slide_count": len(skeleton),
        "palette_count": len(pal),
        "palettes": palettes,
        # 합치기 코드 노드가 기계로 검사하는 값이다. 문장이 아니라 숫자로 내보낸다.
        "contrast_min": round(min(contrasts), 1),
        "color_rule": color_rule,
        "type_rule": type_rule,
        "shape_rule": shape_rule,
        "tone_rule": tone_rule,
        "hook_rule": hook_rule,
        "slide_rule": "\n".join(per_slide),
        "sample": n,
    }


def emit(recipes: dict) -> str:
    """붙여넣기용 파이썬 소스를 만든다.

    json.dumps 결과가 파이썬 리터럴로도 읽히려면 값에 참/거짓/널이 없어야 한다
    (JSON 은 true/false/null, 파이썬은 True/False/None 이라 글자가 다르다).
    """
    def walk(v, path):
        if isinstance(v, dict):
            for k, x in v.items():
                walk(x, f"{path}.{k}")
        elif isinstance(v, list):
            for i, x in enumerate(v):
                walk(x, f"{path}[{i}]")
        elif isinstance(v, bool) or v is None:
            raise SystemExit(f"{path} 에 참/거짓/널이 있다. 문자열이나 숫자로 바꿔라.")
        elif not isinstance(v, (str, int, float)):
            raise SystemExit(f"{path} 가 {type(v).__name__} 이다. 문자열·숫자·목록만 쓴다.")
    walk(recipes, "RECIPES")

    body = json.dumps(recipes, ensure_ascii=False, indent=2)
    return ("# analyze/export_dify.py 가 만든 파일이다. 손으로 고치지 마라.\n"
            "# Dify 코드 노드의 편집기에 통째로 붙여넣는다.\n\n"
            f"RECIPES = {body}\n\n{MAIN_SRC}")


def main() -> None:
    clusters = json.loads((config.DATA / "clusters.json").read_text(encoding="utf-8"))
    if not clusters:
        raise SystemExit("clusters.json 이 비었다. cluster.py 를 먼저 돌려라.")

    recipes = {}
    for c in clusters:
        docs = [json.loads((config.MEASURES / f"{m}.json").read_text(encoding="utf-8"))
                for m in c["members"]]
        recipes[c["name"]] = build(c, docs)

    src = emit(recipes)
    if len(src) > MAX_CHARS:
        raise SystemExit(f"{len(src):,}자다. Dify 코드 노드 한도 {MAX_CHARS:,}자를 넘는다.")

    out = config.DATA / "dify_recipes.py"
    out.write_text(src, encoding="utf-8")
    print(f"{out}  {len(src):,}자 / 한도 {MAX_CHARS:,}자")
    for name, r in recipes.items():
        print(f"  레시피 {name} — {r['slide_count']}장 · 팔레트 {r['palette_count']}개 · 표본 {r['sample']}건")


if __name__ == "__main__":
    main()
