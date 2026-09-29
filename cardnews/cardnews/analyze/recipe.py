# analyze/recipe.py
"""클러스터를 docx 4-4 형식의 레시피 문서로 찍는다.

문장은 템플릿이 만든다. 숫자는 전부 집계값이고 'N건 중 M건'이 같이 붙는다.
"""
import json
import statistics
import sys
from collections import Counter, defaultdict
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config
import cluster
import verify_labeled

# **우리 렌더(`cardnews/render`)를 본다.** 저쪽 `render-server` 에도 같은 이름의
# 파일이 있지만 그건 남의 것이다 — 거기를 보면 우리가 고친 값이 안 온다.
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "render"))
from template_render import _measure_tracked  # noqa: E402


def _top(vals):
    """"없음" 이 값이 아니라 빈칸인 축에 쓴다 — 색 hex, 글꼴, 굵기 같은 것.

    사진 위치·종결어미·정렬처럼 "없음" 자체가 답인 축에는 `_mode` 를 써야 한다.
    """
    vals = [v for v in vals if v not in (None, "", "없음")]
    if not vals:
        return "없음", 0
    c = Counter(vals).most_common(1)[0]
    return c[0], c[1]


def _mode(vals):
    """그냥 최빈값. "없음" 도 한 표로 센다.

    10장 중 8장에 사진이 없고 2장만 상단이면 그 자리의 규칙은 "사진 없음" 이다.
    `_top` 을 쓰면 `사진 상단 (2/10장)` 이라고 거짓말한다.
    """
    vals = [v for v in vals if v not in (None, "")]
    if not vals:
        return "없음", 0
    c = Counter(vals).most_common(1)[0]
    return c[0], c[1]


def _med(vals):
    """None 만 버린다. 0 은 값이다 — 여백 0px(글자가 가장자리에 붙음)도 잰 것이다."""
    vals = [v for v in vals if v is not None]
    return statistics.median(vals) if vals else 0


def _level(slides, role):
    out = []
    for s in slides:
        for lv in s["text"]["levels"]:
            if lv["role"] == role:
                out.append(lv)
    return out


# ==================================================================
# Task 9 — 규칙표_카드뉴스.md : 표본이 `cluster.MIN_MEMBERS` 에 못 미칠 때도
# (지금은 n=1) 정직하게 끝까지 도는 "템플릿" 경로. 위의 `render()`/`_top`/
# `_mode`/`_med`/`_level` 은 옛 계량표 스키마(콜론이 하나뿐인 `colors.bg` 같은
# 바른 문자열, `text.levels`, `shapes`, `photo`)를 그대로 쓴다 — `export_dify.py`
# 와 `test_ruler.py` 가 지금도 그 모양으로 직접 부르므로 손대지 않는다.
# 지금 계량표(`analyze/data/measures/*.json`)는 색이 `{kind,hex|stops,cover,cells}`,
# 글자가 region 마다 `text.line_detail`(줄별 pt·굵기·색·`back`) 인 다른 모양이라
# 아래는 완전히 새 함수들이다.
# ==================================================================

CHARS_PER_MEASURE = 20    # 순한글 평균 폭을 잴 때 몇 글자를 그려 평균 낼지


def usable_width(box: list[float], align: str, canvas_w: int) -> tuple[float, float]:
    """(여백, 쓸 수 있는 폭). `docs/규칙표.md` 와 같은 셈이다 — 여백은 **한쪽만** 뺀다.

    가운데 정렬은 상자와 캔버스 양끝의 거리 중 짧은 쪽을 여백으로 보고 양쪽에서 뺀다.
    「단일」(줄이 하나뿐이라 정렬을 못 잰 값)은 왼쪽 정렬로 친다 — 이 게시물의 한 줄짜리
    네모(소제목·브랜드 택)가 실제로 전부 왼쪽 여백에 붙어 있다(직접 확인함).
    """
    x0, _, x1, _ = box
    margin = min(x0, canvas_w - x1) if align == "가운데" else x0
    # **쓸 수 있는 폭은 «사람이 그은 네모» 다.**
    #
    # 예전에는 왼쪽 정렬일 때 `canvas_w - x0` 를 썼다 — 네모 왼쪽부터 화면 끝까지.
    # 「글자가 저 끝까지 갈 수도 있었다」는 뜻이었는데, 좁은 네모에서 크게 어긋난다.
    # 실측(DNUFIa4NIkK 1번 장): 337px 네모에 아홉 자가 들어가는데 상한이 28자였다.
    #
    # 그리고 **넘침은 네모로 잰다**(`카드뉴스_배치검증`). 상한이 네모보다 크면
    # LLM 이 그 상한을 채우는 순간 반드시 넘쳐서, 다시 쓰기를 태우고도 못 맞춘다.
    # 사람이 정한 규칙도 그대로다 — 「내가 바운드 박스로 칠한 그 범위에 얼마나
    # 들어갈 수 있는지, 그게 최대치」(2026-08-26).
    return margin, x1 - x0


def ceiling_chars(usable_px: float, char_px: float) -> int:
    """폭 나누기 글자폭의 정수부. 글자폭을 못 재면(0 이하) 0 을 준다 — 지어내지 않는다."""
    if char_px <= 0:
        return 0
    return int(usable_px // char_px)


def _slot_key(pt: float, weight: str, lines: int, level: str | None = None) -> tuple:
    """굵기 + pt10단위버킷 + 줄수 + **위계**. 이 게시물에서 실측해 확인했다 —
    제목(Bold 40대·1줄)·본문(Regular 40대·여러줄)·브랜드택(Bold 20대·1줄)이
    이 키만으로 완전히 갈리고 섞이지 않는다.

    위계(`layout_labeled.levels_of`)를 **뒤에** 단다 — 슬롯 이름이 거기서 나오고,
    같은 버킷·줄수라도 위계가 다르면 다른 자리이기 때문이다."""
    bucket = int((pt or 0) // 10) * 10
    return (weight, bucket, "여러줄" if lines > 1 else "한줄", level)


def 슬롯이_되나(t: dict) -> bool:
    """이 글자 덩이로 슬롯을 만들 수 있나.

    **이 잣대를 두 곳이 «똑같이» 써야 한다** — 슬롯 표(`text_slots`)와 틀 만들기
    (`make_dsl_cardnews`). 한쪽만 빼면 다른 쪽이 없는 슬롯을 찾다가 그 자리에서
    죽는다.

    빼는 것 셋:

    - `fallback` — 글자를 통째로 못 읽은 덩이
    - 빈 글자 — 읽었는데 아무것도 없는 덩이
    - **`pt` 가 없는 덩이** — 글자는 읽혔는데 잉크 높이를 못 잰 것이다.
      `pt` 없이는 슬롯 열쇠도 자수 한계도 못 만든다. 이 검사가 빠져 있어서
      실물에서 터졌다(2026-08-27, `DNUFIa4NIkK`: `statistics.median` 이
      `None` 을 정렬하려다 죽었다 — 계량은 다 끝난 뒤였다).
    """
    return bool(t) and not t.get("fallback")         and bool((t.get("text") or "").strip()) and bool(t.get("pt"))


def text_slots(all_slides: list[dict]) -> dict:
    """(역할, 슬롯키) -> [(장번호, region)] 로 글자 네모를 묶는다.

    `block.get("fallback")`(글자를 통째로 못 읽은 네모)와 빈 글자는 뺀다.
    """
    groups: dict = defaultdict(list)
    for s in all_slides:
        for r in s["regions"]:
            # **종류가 아니라 «글자를 쟀나» 로 가른다.** 도형 안에 글자가 든
            # 네모(사람이 「안에 글자 있다」를 켠 것)도 글자 슬롯을 만든다 —
            # 여기서 빼면 `make_dsl_cardnews` 가 그 슬롯을 못 찾아 그 자리에서
            # 죽는다(슬롯 표와 틀 만들기가 같은 목록을 봐야 한다).
            t = r.get("text") or {}
            if not 슬롯이_되나(t):
                continue
            key = _slot_key(t["pt"], t["weight"], t["lines"], t.get("level"))
            groups[(s["role"], key)].append((s["index"], r))
    return groups


def role_quotes(all_slides: list[dict], role: str, cap: int | None = None) -> list[dict]:
    """그 역할인 장의 원문을 장 순서대로, 중복 없이 모은다. **원문은 손대지 않는다.**

    한 장 안의 글자 네모를 위에서 아래(y0) 순서로 이어 붙여 그 장의 "대본"으로 삼는다.
    `cap` 은 미래 30건 표본에서 역할당 개수를 줄일 자리다 — 지금은 `사례`가 최대
    4개뿐이라 자를 일이 없다(계획 Task 9 델타1).
    """
    seen: set = set()
    out = []
    for s in all_slides:
        if s["role"] != role:
            continue
        texts = [r["text"]["text"] for r in sorted(s["regions"], key=lambda r: r["box"][1])
                 if r["kind"] == "글자" and (r["text"].get("text") or "").strip()]
        quote = "\n".join(texts)
        if not quote or quote in seen:
            continue
        seen.add(quote)
        out.append({"slide": s["index"], "text": quote, "tone": s["tone"],
                     "ending": s["ending"], "person": s["person"]})
        if cap and len(out) >= cap:
            break
    return out


def quotes_table(role: str, quotes: list[dict]) -> str:
    """역할 하나의 원문 표. 줄바꿈은 `<br>` 로 접어 표 한 칸에 담는다."""
    if not quotes:
        return ""
    L = [f"### {role} ({len(quotes)}개)\n",
         "| 장 | 원문 | 어미 | 인칭 | 형식성 | 유머 | 존중 | 열정 |",
         "|---|---|---|---|---|---|---|---|"]
    for q in quotes:
        text = q["text"].replace("\n", "<br>").replace("|", "\\|")
        t = q["tone"]
        L.append(f"| {q['slide']} | {text} | {q['ending']} | {q['person']} | "
                 f"{t['formality']} | {t['humor']} | {t['respect']} | {t['enthusiasm']} |")
    L.append("")
    return "\n".join(L)


def _rgb(hex_str: str) -> tuple[int, int, int]:
    h = hex_str.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def is_highlight_hex(hex_str: str, bg_hex: str, accent_hex: str) -> bool:
    """줄 뒤 색이 배경보다 강조색에 가까우면 형광펜이 있다고 본다.

    실측 근거(DHqCBQnRAjW): 배경 `#F1FFE5` 와 강조색 `#C9FC95` 는 RGB 제곱거리가
    한참 벌어져 있고, 실제 `back.runs` 값들은 둘 중 하나에 확 붙는다 —
    배경 쪽(`#F2FDE7` 류)은 배경에서 제곱거리 41 이내, 형광펜 쪽(`#CAFC97` 류)은
    강조색에서 제곱거리 5 이내다. 문턱을 따로 정할 필요가 없을 만큼 갈라져 있다.
    """
    r = _rgb(hex_str)
    d_bg = sum((a - b) ** 2 for a, b in zip(r, _rgb(bg_hex)))
    d_ac = sum((a - b) ** 2 for a, b in zip(r, _rgb(accent_hex)))
    return d_ac < d_bg


def highlight_stats(all_slides: list[dict], accent_hex: str) -> dict:
    """줄마다 형광펜이 차지하는 비율을 잰다.

    **배경이 단색인 장만 잰다** — 그라데이션은 위치마다 배경색이 달라
    `is_highlight_hex` 의 "배경 하나" 가정이 안 맞는다. `back.fallback`(사진·인물
    위라 못 잰 줄)도 뺀다. 둘 다 `skipped` 로 세어 안 잰 것과 "형광펜 없음"을
    섞지 않는다 — `merge_labeled` 의 「미측정」 원칙과 같다.
    """
    ratios: list[float] = []
    by_idx: dict = defaultdict(list)
    skipped = 0
    for s in all_slides:
        bg = s["background"]
        if bg.get("kind") != "단색" or not bg.get("hex"):
            for r in s["regions"]:
                if r["kind"] == "글자":
                    skipped += len(r["text"].get("line_detail") or [])
            continue
        bg_hex = bg["hex"]
        for r in s["regions"]:
            if r["kind"] != "글자":
                continue
            for i, ld in enumerate(r["text"].get("line_detail") or []):
                back = ld["back"]
                if back.get("fallback") or not back.get("runs"):
                    skipped += 1
                    continue
                ratio = sum(run["ratio"] for run in back["runs"]
                            if is_highlight_hex(run["hex"], bg_hex, accent_hex))
                ratios.append(ratio)
                by_idx[i].append(ratio)
    return {"measured": len(ratios), "skipped": skipped, "ratios": ratios,
            "by_line_index": dict(by_idx)}


def _measure_ctx() -> ImageDraw.ImageDraw:
    return ImageDraw.Draw(Image.new("RGB", (1, 1)))


def char_width(d: ImageDraw.ImageDraw, font_name: str, weight: str, pt: float) -> float:
    """그 글꼴로 순한글 `CHARS_PER_MEASURE` 자를 그렸을 때 평균 폭(px). `tracking=0`.

    tracking=0 인 이유: 이 템플릿엔 아직 렌더 배치가 없어서 빌려 쓸 tracking
    값이 없다. 대신 `verify_labeled.draw_text` 가 이 게시물을 되돌려 그릴 때 실제로
    쓰는 가정(자간 보정 없음, `d.text()` 그대로)과 맞춘다 — 두 문서가 다른 잣대를
    쓰면 "규칙표대로면 안 넘치는데 되돌려 그리면 넘친다" 는 모순이 생긴다.
    글꼴 파일은 `verify_labeled.font_of` 와 같은 표(`_FONT_FILES`)를 그대로 쓴다.
    """
    font = verify_labeled.font_of({"font": font_name, "weight": weight, "pt": pt})
    sample = "가" * CHARS_PER_MEASURE
    return _measure_tracked(d, sample, font, 0.0) / CHARS_PER_MEASURE


def _정렬(regions: list) -> str:
    """이 슬롯의 정렬 방향. **가장 많이 나온 방향을 쓴다.**

    예전엔 «가운데가 하나라도 있으면 가운데, 아니면 왼쪽» 이었다. 그러면
    `ruler/text._align` 이 제대로 판정한 «오른쪽» 이 통째로 버려진다 —
    `cardnews_compose` 는 오른쪽을 그릴 줄 아는데도 영영 안 쓰이게 된다.

    «단일»(줄이 하나라 방향을 못 정함)·«없음»(글이 없음)은 방향이 아니므로
    세지 않는다. 셋 다 방향이 없으면 왼쪽으로 친다.
    """
    from collections import Counter
    방향 = [r["text"]["align"] for r in regions
           if r["text"]["align"] in ("왼쪽", "가운데", "오른쪽")]
    if not 방향:
        return "왼쪽"
    return Counter(방향).most_common(1)[0][0]


def char_limit_rows(all_slides: list[dict], canvas_w: int, d: ImageDraw.ImageDraw) -> list[dict]:
    """슬롯마다 자수 상한(폰트 렌더 실측)과 하한(이 게시물의 관측값)을 낸다."""
    rows = []
    for (role, key), items in text_slots(all_slides).items():
        weight, _pt_bucket, lines_kind, level = key
        regions = [r for _, r in items]
        pt = statistics.median([r["text"]["pt"] for r in regions])
        font_name = regions[0]["text"]["font"]
        align = _정렬(regions)
        pairs = [usable_width(r["box"], align, canvas_w) for r in regions]
        margin = statistics.median([m for m, _ in pairs])
        usable = statistics.median([u for _, u in pairs])
        x0s = [r["box"][0] for r in regions]
        variable_pos = (max(x0s) - min(x0s)) > 100
        cpx = char_width(d, font_name, weight, pt)
        observed = sorted(len(ld["text"]) for _, r in items
                           for ld in (r["text"].get("line_detail") or []))
        rows.append({
            "role": role, "level": level, "weight": weight, "pt": pt,
            "lines_kind": lines_kind,
            "n_instances": len(items), "font": font_name, "align": align,
            "margin": margin, "usable": usable, "char_px": cpx,
            "ceiling": ceiling_chars(usable, cpx), "observed": observed,
            "variable_pos": variable_pos,
        })
    rows.sort(key=lambda row: (row["role"], -row["pt"]))
    return rows


def slot_names(rows: list[dict]) -> list[str]:
    """슬롯 이름 = `역할 + 위계`. **번호는 이름이 겹칠 때만 붙인다.**

    옛 이름은 `요약 글자블록3` 처럼 순번뿐이라, 그 이름을 읽는 쪽(Dify 대본 노드)이
    「이 칸은 제목이니 짧고 세게」를 알 수 없었다 — 사람이 되돌려 그린 6번 장을
    보고 짚은 자리다. 위계를 못 잰 덩어리(`level` 이 None)는 옛 이름으로 둔다.
    """
    labels = [f"{r['role']} {r['level'] or '글자블록'}" for r in rows]
    counts = Counter(labels)
    seen: dict = defaultdict(int)
    out = []
    for label in labels:
        if counts[label] == 1:
            out.append(label)
            continue
        seen[label] += 1
        out.append(f"{label}{seen[label]}")
    return out


def char_limit_table(rows: list[dict]) -> str:
    L = ["| 슬롯 | 굵기 | pt | 왼쪽 여백 | 쓸 수 있는 폭 | 한글 1자 | 순한글 한계(상한) | "
         "관측값(하한, 이 게시물) | 표본 |",
         "|---|---|---|---|---|---|---|---|---|"]
    for row, name in zip(rows, slot_names(rows)):
        obs = row["observed"]
        obs_s = f"{min(obs)}~{max(obs)}자" if len(obs) > 1 else (f"{obs[0]}자" if obs else "-")
        pos = " (자리 가변)" if row["variable_pos"] else ""
        L.append(f"| {name}{pos} | {row['weight']} | {row['pt']:.0f}px | "
                 f"{row['margin']:.0f}px | {row['usable']:.0f}px | {row['char_px']:.0f}px | "
                 f"**{row['ceiling']}자** | {obs_s} | n={row['n_instances']} |")
    return "\n".join(L)


def fixed_background_table(all_slides: list[dict]) -> str:
    L = ["| 장 | 역할 | 배경 | 근거 |", "|---|---|---|---|"]
    for s in all_slides:
        bg = s["background"]
        if bg.get("kind") == "그라데이션":
            stops = " → ".join(f"{st['hex']}@{st['at']:.0%}" for st in bg.get("stops", []))
            desc = f"그라데이션({bg.get('dir', '?')}) {stops}"
        elif bg.get("kind") == "단색":
            desc = f"단색 `{bg['hex']}`"
        else:
            desc = bg.get("kind", "미측정")
        L.append(f"| {s['index']} | {s['role']} | {desc} | 유효 {bg.get('cells', '?')}칸 |")
    return "\n".join(L)


def fixed_region_table(all_slides: list[dict]) -> str:
    L = ["| 장 | 종류 | 자리(box) | 색 |", "|---|---|---|---|"]
    for s in all_slides:
        for r in s["regions"]:
            if r["kind"] == "글자":
                continue
            c = r["color"]
            if c.get("by_design"):
                # 「안 잼」 — 재려다 못 쟨 것(미측정)과 낱말부터 갈라 놓는다.
                # `merge_labeled.COLOR_SKIP` 참고.
                col = "자리만 (색 안 잼)"
            elif c.get("kind") == "미측정":
                col = f"미측정 (참고 `{c.get('hex', '?')}`)"
            elif c.get("kind") == "단색":
                col = f"`{c['hex']}`"
            else:
                col = c.get("kind", "?")
            L.append(f"| {s['index']} | {r['kind']} | {r['box']} | {col} |")
    return "\n".join(L)


def hl_section(hl: dict | None) -> str:
    if not hl or not hl["ratios"]:
        return "형광펜을 잴 단색 배경 줄이 없다.\n"
    ratios = hl["ratios"]
    has_any = sum(1 for x in ratios if x > 0)
    L = [f"- 측정된 줄 {hl['measured']}개 (그라데이션 배경·못 잰 줄 {hl['skipped']}개는 뺐다)",
         f"- 형광펜이 조금이라도 있는 줄 {has_any}/{hl['measured']}장 "
         f"({has_any / hl['measured']:.0%})" if hl["measured"] else "",
         f"- 형광펜 비율 평균 {statistics.mean(ratios):.0%} · 중앙값 {statistics.median(ratios):.0%}"
         if ratios else "",
         "- 줄 순서별 형광펜 비율(여러 줄 문단, 0번째부터):"]
    for i in sorted(hl["by_line_index"]):
        vals = hl["by_line_index"][i]
        if len(vals) < 2:
            continue
        L.append(f"  - {i + 1}번째 줄: 평균 {statistics.mean(vals):.0%} (n={len(vals)})")
    L.append("\n**Task 10 프롬프트가 참고할 재료이지 강제 규칙이 아니다** — "
             "«새 대본의 어느 문장에 형광펜을 넣을지» 는 아직 아무도 정하지 않았다.")
    return "\n".join(x for x in L if x) + "\n"


def verification_section(n: int, rows: list[dict], hl: dict | None) -> str:
    L = [f"- 표본 {n}건. `cluster.py` 의 레시피 문턱(`MIN_MEMBERS`={cluster.MIN_MEMBERS}) 미달 — "
         "이 문서는 레시피가 아니라 템플릿이다.",
         f"- 글자 수 한계 {len(rows)}개 슬롯을 실제 글꼴 파일로 측정했다 "
         "(`cardnews/render/fonts/Pretendard-*.otf`, tracking=0).",
         "- 「관측값」은 이 게시물 안에서 실제로 나온 글자 수다 — 다른 게시물과 비교한 통계가 아니다."]
    if hl:
        L.append(f"- 형광펜 참고 통계는 줄 {hl['measured']}개에서 뽑았다 "
                 f"(그라데이션 배경 등 {hl['skipped']}줄은 제외).")
    L.append("- 다음 걸음: Task 11 — 20~30건을 더 모아 진짜 범위·형광펜 규칙을 정한다.")
    return "\n".join(L) + "\n"


def build_template(docs: list[dict]) -> str:
    """`docs/규칙표_카드뉴스.md` 본문. `docs` 가 1건이면(지금) 템플릿, `MIN_MEMBERS`
    이상이면(Task 11 이후) 같은 함수가 그대로 통계를 낸다 — 슬롯 묶기·인용·형광펜
    집계가 전부 여러 건을 받게 짜여 있다."""
    n = len(docs)
    all_slides = [s for d in docs for s in d["slides"]]
    canvas_w = docs[0]["canvas"]["w"]
    canvas_h = docs[0]["canvas"]["h"]
    shortcodes = ", ".join(f"`{d['shortcode']}`" for d in docs)
    skeleton = " → ".join(docs[0]["skeleton"])
    accent_hex = (docs[0].get("accent") or {}).get("hex")

    d = _measure_ctx()
    rows = char_limit_rows(all_slides, canvas_w, d)

    L = []
    add = L.append
    add("# 규칙표 — 카드뉴스 템플릿\n")
    add(f"골격: {skeleton} · 수록 게시물({n}건): {shortcodes}\n")
    add(f"> **레시피가 아니라 템플릿이다.** `cluster.py` 의 표본 문턱(`MIN_MEMBERS`)은 "
        f"{cluster.MIN_MEMBERS}건인데 지금 {n}건이다. 자리·폰트·색은 이 게시물 그대로 "
        f"굳혀 쓰되, 글자 수 범위·형광펜 규칙처럼 통계가 필요한 값은 관측값 그대로 적거나 "
        f"«아직 모른다»고 적는다. 진짜 범위는 Task 11(20~30건)에서 나온다.\n")

    add("---\n")
    add("## 1. 글자 수 한계 — 슬롯마다\n")
    add(f"tracking=0 으로 잰다(`render-server/template_render._measure_tracked`, "
        f"`verify_labeled.font_of` 로 글꼴을 고른다). 「쓸 수 있는 폭」은 왼쪽 정렬이면 "
        f"{canvas_w} − 왼쪽 여백, 가운데 정렬이면 {canvas_w} − 2×여백이다 "
        "(`docs/규칙표.md` §1 과 같은 한쪽-여백 셈). **「Regular」로 적힌 줄은 "
        "Pretendard-Medium.otf 로 잰다** — 레포에 Pretendard Regular 파일이 없어서 "
        "`verify_labeled.font_of` 가 이미 그렇게 대신 쓰고 있다(이 되돌려 그리기 자체가 "
        "리뷰를 통과한 가정이다). **「순한글 한계」는 영문·숫자·기호가 없을 때의 상한이다** "
        "— 관측값이 그보다 큰 줄은 영문·괄호·숫자가 섞여 글자가 더 좁아서다 "
        "(`docs/규칙표.md` §1 의 「구글 'Gemini 3' 공개 16자」와 같은 이치).\n")
    add(char_limit_table(rows))
    add("")

    add("\n---\n")
    add("## 2. 고정 — 이 게시물 그대로 굳힌 것\n")
    add(f"캔버스 **{canvas_w} × {canvas_h}**, {len(all_slides)}장, 골격 {skeleton}.\n")
    add("### 2-1. 배경\n")
    add(fixed_background_table(all_slides))
    add("\n### 2-2. 사진·로고·장식 자리\n")
    add("사례 4장의 로고 자리(바닥 중앙, `x≈480~485`)는 넷 다 거의 같아 고정이라 할 만하다. "
        "사진 자리는 장마다 다르다(사진 개수가 2장인 사례도, 1장인 사례도 있다) — "
        "그대로 아래 표에 각 장의 실측값을 적는다. **여러 장을 하나로 뭉개 «평균 자리»를 "
        "만들지 않는다** — 그러면 어느 사례에도 안 맞는 값이 나온다.\n")
    add(fixed_region_table(all_slides))
    if accent_hex:
        acc = docs[0]["accent"]
        add(f"\n### 2-3. 강조색\n- `{accent_hex}` — 게시물 전체 공통, "
            f"{acc.get('slides', '?')}장에서 뽑음 (화소 {acc.get('pixels', 0):,}개)\n")

    add("\n---\n")
    add("## 3. 원문 — 역할별 인용 (few-shot 재료)\n")
    add("**말투 딱지가 아니라 원문이 주다.** 여섯 축(어미·인칭·형식성·유머·존중·열정)은 "
        "원문 옆 참고 태그다.\n")
    seen_roles: set = set()
    for s in all_slides:
        if s["role"] in seen_roles:
            continue
        seen_roles.add(s["role"])
        table = quotes_table(s["role"], role_quotes(all_slides, s["role"]))
        if table:
            add(table)

    add("\n---\n")
    add("## 4. 생성 시점 판단 — 아직 규칙이 아니라 참고 자료\n")
    add("### 형광펜(줄 뒤 색)\n")
    hl = highlight_stats(all_slides, accent_hex) if accent_hex else None
    add(hl_section(hl))

    add("\n---\n")
    add("## 5. 검증\n")
    add(verification_section(n, rows, hl))

    return "\n".join(L)


def render(cluster: dict, docs: list[dict]) -> str:
    n = len(docs)
    all_slides = [s for d in docs for s in d["slides"]]
    L = []
    add = L.append

    add(f"# 레시피 {cluster['name']} — {' → '.join(cluster['pattern'])} · 표본 {n}건\n")
    add("> 이 문서는 **고른 표본이 실제로 그러했다**는 기술이다. "
        "대조군을 두지 않았으므로 '이렇게 하면 좋아진다'는 인과는 주장하지 않는다.\n")
    add(f"수록 게시물: {', '.join('`' + d['shortcode'] + '`' for d in docs)}\n")
    add("\n## 게시물 전체에 공통인 것\n")

    bg, bgn = _top([s["colors"]["bg"] for s in all_slides])
    tx, txn = _top([s["colors"]["text"] for s in all_slides])
    ac, acn = _top([s["colors"]["accent"] for s in all_slides])
    contrasts = [s["colors"]["contrast"] for s in all_slides]
    high = sum(1 for c in contrasts if c >= 10)
    blobs = [s["colors"]["accent_blobs"] for s in all_slides if s["colors"]["accent_blobs"]]
    add("### 색\n")
    add(f"- 배경 `{bg}` · 글자 `{tx}` · 강조 `{ac}`")
    add(f"  (배경 {bgn}/{len(all_slides)}장, 글자 {txn}/{len(all_slides)}장, 강조 {acn}/{len(all_slides)}장에서 최빈)")
    add(f"- 배경-글자 명도 대비 중앙값 **{_med(contrasts):.1f} : 1** "
        f"({len(all_slides)}장 중 {high}장이 10:1 이상)")
    if blobs:
        one = sum(1 for b in blobs if b == 1)
        add(f"- 강조색 덩어리 중앙값 {_med(blobs):.0f}개 — 한 장에 한 곳만인 장이 {one}/{len(blobs)}장\n")
    else:
        add("")

    add("### 글자\n")
    titles, bodies, caps = _level(all_slides, "제목"), _level(all_slides, "본문"), _level(all_slides, "캡션")
    tpt, bpt = _med([t["pt"] for t in titles]), _med([b["pt"] for b in bodies])
    for label, grp in (("제목", titles), ("본문", bodies), ("캡션", caps)):
        if not grp:
            continue
        w, wn = _top([g["weight"] for g in grp])
        f, _ = _top([g["family"] for g in grp])
        add(f"- {label} **{_med([g['pt'] for g in grp]):.0f}pt** "
            f"(화면 높이의 {_med([g['pct_h'] for g in grp]):.1f}%) · {f} {w} "
            f"({wn}/{len(grp)}장)")
    if tpt and bpt:
        add(f"- 제목은 본문의 **{tpt / bpt:.1f}배** (표본 제목 {len(titles)}장 · 본문 {len(bodies)}장)")
    lead_grp = titles + bodies
    # 행간 0.0 은 "한 줄뿐이라 못 쟀다" 는 표시라 값이 아니다 — 여기서만 걸러낸다.
    lead = _med([g["leading"] for g in lead_grp if g["leading"]])
    if lead:
        add(f"- 행간은 글자 크기의 **{lead:.2f}배** (표본 {len(lead_grp)}장)")
    align, an = _mode([s["text"]["align"] for s in all_slides])
    add(f"- **{align} 정렬** ({an}/{len(all_slides)}장)")
    vp, vn = _mode([s["text"]["vpos"] for s in all_slides])
    dom, dn = _top([s["colors"]["dominance"] for s in all_slides])
    add(f"- 글자 블록은 **{vp}** ({vn}/{len(all_slides)}장) · "
        f"여백 **{_med([s['text']['margin'] for s in all_slides]):.0f}px**")
    add(f"- 색 지배: **{dom}** ({dn}/{len(all_slides)}장)\n")

    add("### 말투\n")
    for key, label in (("formality", "형식성"), ("humor", "유머"),
                       ("respect", "존중"), ("enthusiasm", "열정")):
        v, c = _top([s["tone"][key] for s in all_slides])
        add(f"- {label}: **{v}** ({c}/{len(all_slides)}장)")
    end, en = _mode([s["ending"] for s in all_slides])
    per, pn = _top([s["person"] for s in all_slides])
    q = sum(1 for s in all_slides if s["is_question"])
    add(f"- 종결어미 **{end}** ({en}/{len(all_slides)}장) · 인칭 **{per}** ({pn}장)")
    add(f"- 제목이 질문형인 장 {q}/{len(all_slides)}장")
    chars = [sum(lv["chars"] for lv in s["text"]["levels"]) for s in all_slides]
    add(f"- 한 장 평균 {statistics.mean(chars):.0f}자, 최장 {max(chars) if chars else 0}자 "
        f"(표본 {len(chars)}장)")
    withnum = sum(1 for s in all_slides if s["text"]["digits"] > 0)
    emo = [s["text"]["emoji"] for s in all_slides]
    add(f"- 수치 표현이 들어간 장 {withnum}/{len(all_slides)}장 "
        f"(장당 중앙값 {_med([s['text']['digits'] for s in all_slides]):.0f}개)")
    add(f"- 이모지 장당 중앙값 {_med(emo):.0f}개 "
        f"(이모지를 쓴 장 {sum(1 for e in emo if e)}/{len(all_slides)}장)\n")

    add("### 도형\n")
    shapes = [sh for s in all_slides for sh in s["shapes"]]
    if not shapes:
        add("- 도형을 쓰지 않는다\n")
    else:
        for kind, cnt in Counter(sh["kind"] for sh in shapes).most_common():
            grp = [sh for sh in shapes if sh["kind"] == kind]
            role, _ = _top([sh["role"] for sh in grp])
            r = _med([sh["radius"] for sh in grp])
            alphas = [sh["alpha"] for sh in grp if sh["alpha"]]
            bits = [f"{cnt}회", role]
            if r:
                bits.append(f"모서리 {r:.0f}px")
            if alphas:
                bits.append(f"불투명도 {statistics.median(alphas) * 100:.0f}%")
            fill, _ = _top([sh["fill"] for sh in grp])
            bits.append(f"채움 `{fill}`")
            if sum(1 for sh in grp if sh["shadow"]["has"]) * 2 > len(grp):
                bits.append("그림자 있음")
            add(f"- **{kind}** — {' · '.join(bits)}")
        add("")

    add("### 사진\n")
    for key, label in (("placement", "위치"), ("treatment", "처리"),
                       ("content", "내용"), ("relation", "글자와의 관계")):
        counts = Counter(s["photo"][key] for s in all_slides)
        add(f"- {label}: " + " / ".join(f"{k} {v}장" for k, v in counts.most_common()))
    areas = [s["photo"]["area_pct"] for s in all_slides if s["photo"]["area_pct"] > 3]
    if areas:
        add(f"- 사진이 있는 장에서 사진이 차지하는 비율 중앙값 **{_med(areas):.0f}%**\n")
    else:
        add("")

    add("## 장별로 다른 것\n")
    for pos, role in enumerate(cluster["pattern"]):
        base = role.rstrip("*")
        grp = [s for s in all_slides if s["role"] == base]
        if not grp:
            continue
        rep = "반복 구간" if role.endswith("*") else ""
        add(f"### {pos + 1}번 자리 — {base} {rep}".rstrip())
        end2, en2 = _mode([s["ending"] for s in grp])
        add(f"- 말투 {end2} ({en2}/{len(grp)}장)")
        lv = [x for s in grp for x in s["text"]["levels"] if x["role"] == "제목"]
        if lv:
            add(f"- 제목 {_med([x['pt'] for x in lv]):.0f}pt · "
                f"{_med([x['lines'] for x in lv]):.0f}줄 · "
                f"{_med([x['chars'] for x in lv]):.0f}자")
        ph, phn = _mode([s["photo"]["placement"] for s in grp])
        add(f"- 사진 {ph} ({phn}/{len(grp)}장)")
        sk = Counter(sh["kind"] for s in grp for sh in s["shapes"])
        add("- 도형 " + (", ".join(f"{k} {v}회" for k, v in sk.most_common()) if sk else "없음"))
        add(f"- 글자가 화면에서 차지하는 비율 {_med([s['text']['text_area_pct'] for s in grp]):.0f}%\n")

    hooks = Counter(d["hook_strategy"] for d in docs)
    add("## 첫 장 훅 유형\n")
    for k, v in hooks.most_common():
        add(f"- {k}: {v}/{n}건")
    add("")
    return "\n".join(L)


def main() -> None:
    """`docs/규칙표_카드뉴스.md` 를 찍는다.

    옛 `main()` 은 `clusters.json` 이 비면(표본 미달) `SystemExit` 으로 죽었다 — 그건
    옛 스키마용 `render()`(위, `docs/recipes/레시피-*.md`)를 5건 이상 클러스터에만
    돌리던 시절 규칙이다. 지금 실측(2026-08-20 이후 스키마)은 `render()` 가 읽는
    `colors.bg`/`text.levels`/`shapes`/`photo` 를 갖고 있지 않아 그 경로를 태우면
    `KeyError` 로 죽는다 — 클러스터가 5건을 모은 적이 아직 없어 드러나지 않았을 뿐이다.
    그래서 그 경로는 이제 `main()` 에서 부르지 않는다(함수 자체는 `export_dify.py`·
    `test_ruler.py` 가 옛 스키마로 직접 부르므로 남겨 둔다). 대신 표본이 몇 건이든
    `build_template()` 하나로 정직하게 끝까지 돈다 — 5건 미달이면 스스로 "템플릿"이라
    적고, 나중에 30건이 모이면 같은 코드가 그대로 통계를 낸다.
    """
    docs = [json.loads(p.read_text(encoding="utf-8")) for p in cluster.measure_files(config.MEASURES)]
    if not docs:
        raise SystemExit("measures/ 에 잰 게시물이 없다. merge_labeled.py 를 먼저 돌려라.")

    out = config.ROOT.parent / "docs" / "규칙표_카드뉴스.md"
    out.write_text(build_template(docs), encoding="utf-8")
    label = "레시피" if len(docs) >= cluster.MIN_MEMBERS else f"템플릿 (n<{cluster.MIN_MEMBERS}, 레시피 아님)"
    print(f"{out}  (n={len(docs)}, {label})")


if __name__ == "__main__":
    main()
