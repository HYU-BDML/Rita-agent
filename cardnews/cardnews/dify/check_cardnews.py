# -*- coding: utf-8 -*-
"""카드뉴스 생성기 검사 — **Dify 에 올리기 전에 반드시 돌려라.**

    python dify/make_dsl_cardnews.py
    python dify/check_cardnews.py

**검사하는 눈은 여기 없다.** 그건 `.claude/skills/dify-workflow/검사.py` 에 있고
프로젝트를 안 탄다 — 다른 Dify 판을 만들 때 그대로 쓴다. 여기서 하는 일은
**이 판의 코드 노드에 넣어 볼 «진짜 자료» 를 챙겨 주는 것**뿐이다(`dify/검사.py`
의 v3 판과 같은 모양).

시험 재료는 사람이 손으로 쓴 골든 대본(`dify/카드뉴스_시험대본.json`)이다 —
규칙표 §1 자수 한계·§2 골격을 전부 지키게 손으로 맞춰 썼고, 눈으로 다시
확인했다(task-10-report.md 에 원문을 그대로 적어 둔다).
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent   # cardnews/
뿌리 = ROOT.parent                                # 저장소 뿌리
sys.path.insert(0, str(뿌리 / ".claude" / "skills" / "dify-workflow"))
import 검사 as 눈  # noqa: E402

sys.path.insert(0, str(ROOT / "dify"))
import make_dsl_cardnews as m  # noqa: E402

YML = ROOT / "dify" / "카드뉴스_생성기.yml"

# 시험 재료. 안 주면 붙박이 것을 쓴다 — 사람이 손으로 쓴 골든 대본 7장이다.
재료 = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / "dify" / "카드뉴스_시험대본.json")
대본_dict = json.loads(재료.read_text(encoding="utf-8"))
대본_글 = json.dumps(대본_dict, ensure_ascii=False)
장수 = len((대본_dict or {}).get("slides") or [])

# 「틀 고르기」가 받을 시험 재료 — 실측 틀에 서랍을 얹은 것. 실제 그래프에서는
# 「틀 받기」가 templates/*.json(서랍 있음)을 파일로 받아 이 노드에 넘긴다.
# **고정된 골든 틀을 쓴다.** 살아 있는 계량표에서 뽑으면 게시물을 하나
# 라벨링할 때마다 서랍이 고르는 디자인이 바뀌어 이 관문이 깨진다 — 이 관문이
# 보는 것은 «yml 의 노드들이 도는가» 이지 «지금 말뭉치가 골든 대본과 맞는가»
# 가 아니다(같은 이유로 tests/test_카드뉴스_로직.py 의 한바퀴 시험도 이 파일을 쓴다).
틀_서랍있음_json = (ROOT / "dify" / "tests" / "틀_골든.json").read_text(encoding="utf-8")
틀_서랍있음 = json.loads(틀_서랍있음_json)

# **뒤 노드들은 「틀 고르기」를 «거친» 틀을 받는다 — 실제 그래프가 그렇다.**
# 예전엔 서랍을 그대로 먹였다. 잰 게시물이 하나뿐일 때는 서랍과 완성된 틀이
# 우연히 같은 모양이라 통과했지만, 둘이 되는 순간 장 수가 안 맞아 무너진다
# (실측 2026-08-25: 「장이 7개인데 골격은 14장이다」).
import 카드뉴스_틀고르기 as _틀고르기        # noqa: E402
사례_개수 = str(sum(1 for x in (대본_dict.get("slides") or [])
                 if x.get("role") == "사례") or 4)
틀_json = _틀고르기.main(틀_서랍있음_json, 사례_개수)["틀_json"]
틀_dict = json.loads(틀_json)

샘플 = {
    "구조 정리": {"text": json.dumps(
        {"사례_개수": 4, "사례_개요": ["첫 번째 사례", "두 번째 사례",
                                  "세 번째 사례", "네 번째 사례"]}, ensure_ascii=False)},
    "틀 고르기": {"틀_json": 틀_서랍있음_json, "사례_개수": "4"},
    "대본 검증": {"text": 대본_글, "틀_json": 틀_json},
    "대본 검증 2": {"text": "", "틀_json": 틀_json, "고친것": 대본_글},
    "대본 검증 3": {"text": "", "틀_json": 틀_json, "고친것": 대본_글},
    # 앞 노드 결과가 있어야 도는 것들은 함수로 준다. 배치는 실제 그래프처럼
    # 대본 검증 3(재작성 두 번까지 다 받은 마지막 판)의 slides 를 읽는다 —
    # 여기서 옛 대본 검증 2 를 읽으면 그래프가 실제로 하는 것과 달라진다
    # (§27, 2026-08-23 — 재작성을 한 판 더 늘리며 겪은 것).
    # **표시슬라이드를 읽는다** — 실제 그래프도 배치가 표시 살아 있는 슬라이드를
    # 받는다(dify/make_dsl_cardnews.py). `slides`(표시 뗀 글)를 읽으면 굵기·
    # 형광펜이 늘 빈 목록이 되는 것을 이 관문이 못 잡는다(검토 지적 ①).
    "배치": lambda 결과: (
        {"slides": 결과["대본 검증 3"]["표시슬라이드"], "틀_json": 틀_json}
        if "대본 검증 3" in 결과 else None),
    "배치 검증": lambda 결과: (
        {"카드_json": 결과["배치"]["cards_json"], "틀_json": 틀_json}
        if "배치" in 결과 else None),
}

탈 = 눈.검사(str(YML), 샘플)

if 장수 == 0:
    # **여기서 멈춘다.** dify/검사.py(v3) 가 이미 겪은 함정과 같다 — 시험 재료가
    # 빈 것을 못 알아보는 검사기는 검사기가 아니다.
    탈.append(("실행", "대본 검증",
              f'시험 대본에 «slides» 가 0개다 — {재료} 가 «{{"slides": [...]}}» 꼴이 맞는지 봐라'))

# **좁은 슬롯 경고.** «탈»(진짜 오류)이 아니라 눈에 띄게만 찍는다 — n=1 표본에서
# 최소·최대가 우연히 가깝게 나온 슬롯은 LLM 이 재작성을 몇 번 해도 못 맞힐 수
# 있다(§27, 2026-08-23 — 실물 실행에서 폭 1~2자 슬롯 셋이 3판 내내 안 풀렸다).
# 코드로 못 고치는 문제라 관문으로 막지는 않고, 다음 세션이 Dify 에 올리기
# 전에 이 위험을 미리 알게만 한다.
좁은슬롯 = [
    f"{s['index']}번({s['역할']}) {slot['슬롯키']} {slot['최소']}~{slot['최대']}자(폭 {slot['최대']-slot['최소']})"
    for s in 틀_dict["슬라이드"] for slot in s["글자슬롯"]
    if slot["최대"] - slot["최소"] <= 2
]
if 좁은슬롯:
    print(f"  ⚠ 폭 2자 이하 슬롯 {len(좁은슬롯)}개 — LLM 재작성으로도 못 맞힐 수 있다(§27 참고):")
    for 줄 in 좁은슬롯:
        print(f"      {줄}")

raise SystemExit(1 if 눈.찍기(탈) else 0)
