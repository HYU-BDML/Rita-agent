# -*- coding: utf-8 -*-
"""**카드뉴스 판 CI — Dify 에 올리기 전에 통과해야 하는 관문 전부.**

    python dify/ci_cardnews.py

`ci.py`(v3 전용, 손대지 않는다)와 같은 골격이다 — 관문의 «눈» 은
`.claude/skills/dify-workflow/` 에 있고 프로젝트를 안 탄다. 이 파일은 **그 관문을
카드뉴스 판 파일에 맞춰 순서대로 부르는 것**뿐이다.

**관문 5(서버)는 이 판에 없다.** render-server 가 카드뉴스 모양 대본을 받는지
확인되지 않았고(다른 세션 소유, 손 안 댐), 이 태스크는 «돈 드는 API·실제 서버
호출 전부 금지» 라는 지시 아래서 진행됐다. 사람이 Step 4(Dify 웹 UI)에서
직접 확인한다 — task-10-report.md 의 체크리스트를 따른다.
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

결과 = []


def 관문(이름, 유래):
    def 감싸기(fn):
        def 돌기():
            try:
                탈 = fn()
            except Exception as e:
                탈 = f"{type(e).__name__}: {e}"
            결과.append((이름, not 탈, 탈 or ""))
            print(f"  {'✅' if not 탈 else '❌'} {이름}")
            if 탈:
                for 줄 in str(탈).splitlines():
                    print(f"       {줄}")
        돌기.이름 = 이름
        돌기.유래 = 유래
        return 돌기
    return 감싸기


def _돌려(명령, cwd=ROOT):
    r = subprocess.run([sys.executable, *명령], cwd=cwd, capture_output=True,
                       env={**__import__("os").environ, "PYTHONUTF8": "1"})
    말 = (r.stdout + r.stderr).decode("utf-8", "replace")
    return r.returncode, 말


@관문("yml 빌드", "빌더가 죽으면 나머지는 볼 것도 없다")
def _1():
    코드, 말 = _돌려(["dify/make_dsl_cardnews.py"])
    if 코드:
        return 말[-800:]
    print(f"       {말.strip().splitlines()[0]}")
    return ""


@관문("DSL 검사", "모양·변수참조·갈림길·코드실행·깊이·HTTP본문 — dify-workflow 스킬")
def _2():
    코드, 말 = _돌려(["dify/check_cardnews.py"])
    return "" if "탈 0건" in 말 else 말[-1500:]


@관문("골든 — 손으로 쓴 합격 대본이 실제로 통과하나", "check_cardnews.py 와 같은 재료, 다른 관점")
def _3():
    import json
    import importlib.util

    def 실어(경로, 이름):
        s = importlib.util.spec_from_file_location(이름, ROOT / 경로)
        m = importlib.util.module_from_spec(s)
        s.loader.exec_module(m)
        return m

    대본검증 = 실어("dify/카드뉴스_대본검증.py", "카드뉴스_대본검증")
    배치 = 실어("dify/카드뉴스_배치.py", "카드뉴스_배치")
    배치검증 = 실어("dify/카드뉴스_배치검증.py", "카드뉴스_배치검증")
    make_dsl = 실어("dify/make_dsl_cardnews.py", "make_dsl_cardnews")

    틀_json = json.dumps(make_dsl.build_recipe_payload(), ensure_ascii=False)
    대본 = (ROOT / "dify" / "카드뉴스_시험대본.json").read_text(encoding="utf-8")

    v1 = 대본검증.main(대본, 틀_json)
    if v1["ok"] != "1":
        return f"대본 검증이 골든 대본을 막았다 — 검증이 지나치게 빡셀 확률이 높다:\n{v1['blocked']}"

    # 표시가 살아 있는 슬라이드를 배치로 넘긴다 — 실제 그래프와 같은 길이다
    # (검토 지적 ①. `v1["slides"]` 는 표시를 이미 뗀 글이라 배치가 형광펜·
    # 굵기를 만들 표시가 하나도 안 남는다).
    b = 배치.main(v1["표시슬라이드"], 틀_json)
    v2 = 배치검증.main(b["cards_json"], 틀_json)
    if v2["ok"] != "1":
        return f"배치 검증이 골든 대본을 막았다 — 검증이 지나치게 빡셀 확률이 높다:\n{v2['막힘']}"

    print(f"       장 {v1['count']}개 · 대본 막힘 0건 · 배치 막힘 0건")
    return ""


@관문("단위 시험", "코드 노드 순수 로직 — dify/tests/test_카드뉴스_로직.py")
def _4():
    코드, 말 = _돌려(["-m", "pytest", "dify/tests/test_카드뉴스_로직.py", "-q"])
    if 코드:
        return 말[-1200:]
    print(f"       {말.strip().splitlines()[-1]}")
    return ""


@관문("서버 — 이 판에는 없다", "render-server 소유 세션 밖. 사람이 Step 4 에서 확인한다")
def _5():
    print("       건너뜀 — task-10-report.md 의 Step 4 체크리스트를 사람이 돈다")
    return ""


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    print("카드뉴스 판 CI — Dify 에 올리기 전 관문\n")
    for fn in (_1, _2, _3, _4, _5):
        fn()
    떨어진것 = [이름 for 이름, 됨, _ in 결과 if not 됨]
    print()
    if 떨어진것:
        print(f"❌ {len(떨어진것)}개 관문이 막혔다 — {' · '.join(떨어진것)}")
        print("   Dify 에 올리지 마라.")
        sys.exit(1)
    print(f"✅ 관문 {len(결과)}개 전부 통과 — 올려도 된다(Step 4 는 사람 손)")
