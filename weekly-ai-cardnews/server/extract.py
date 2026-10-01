# -*- coding: utf-8 -*-
"""옛 Dify 판(yml)에서 «실제 일을 하는» 코드 다섯과 대본 지시문 여섯을 뽑아 둔다.

    python weekly/server/extract.py

코드는 **한 글자도 안 고치고** 옮긴다 — 그래야 Dify 와 같은 입력에 같은 답을 낸다.
지시문의 {{#단계번호.값#}} 자리는 읽을 수 있는 이름({{소식고르기.count}})으로 바꾼다.
yml 을 고치면 다시 돌리고, 뽑은 파일도 같이 커밋한다(람다에 그대로 싣는다).
"""
import io
import json
import re
from pathlib import Path

import yaml

여기 = Path(__file__).resolve().parent
원본 = 여기.parent / "원본" / "주간AI소식_카드뉴스.yml"

# Dify 단계 제목 → 파일 이름. 람다 압축에 한글 파일 이름을 넣지 않는다(설계 «전체 구조»).
코드이름 = {
    "디자인 틀": "design_tpl",
    "소식 고르기": "pick_news",
    "본문 검증": "check_body",
    "훅 검증": "check_hook",
    "대본 합치기": "merge_script",
}
# Dify 가 «같은 검사를 세 번» 복사해 둔 것. 셋이 다르면 하나로 옮길 수 없다.
같아야할것 = {"본문 검증": ["본문 검증 2", "본문 검증 3"], "훅 검증": ["훅 검증 2", "훅 검증 3"]}

지시문이름 = {"본문 대본": "본문대본", "본문 다시 쓰기": "본문다시쓰기", "본문 다시 쓰기 2": "본문다시쓰기2",
            "표지 훅": "표지훅", "훅 다시 쓰기": "훅다시쓰기", "훅 다시 쓰기 2": "훅다시쓰기2"}
# 지시문이 읽는 단계 번호 → 읽을 수 있는 이름
자리이름 = {
    "2000000000001": "시작", "2000000000003": "소식고르기", "2000000000004": "본문대본",
    "2000000000005": "본문검증1", "2000000000007": "본문다시쓰기", "2000000000008": "본문검증2",
    "2000000000027": "본문검증3", "2000000000009": "표지훅", "2000000000010": "훅검증1",
    "2000000000012": "훅다시쓰기", "2000000000013": "훅검증2",
}
_디파이자리 = re.compile(r"\{\{#([0-9]+)\.([A-Za-z0-9_]+)#\}\}")


def _자리바꾸기(제목: str, 글: str) -> str:
    def 한자리(m):
        if m.group(1) not in 자리이름:
            raise ValueError(f"«{제목}» 이 모르는 단계를 읽는다: {m.group(0)}")
        return "{{" + 자리이름[m.group(1)] + "." + m.group(2) + "}}"

    바뀐 = _디파이자리.sub(한자리, 글)
    if "{{#" in 바뀐:
        raise ValueError(f"«{제목}» 에 못 바꾼 Dify 자리가 남았다")
    return 바뀐


def 뽑기(yml: Path = 원본, 나갈곳: Path = 여기) -> dict:
    d = yaml.safe_load(io.open(yml, encoding="utf-8"))
    노드 = {n["data"]["title"]: n["data"] for n in d["workflow"]["graph"]["nodes"]}
    for 원, 복사들 in 같아야할것.items():
        for 복 in 복사들:
            if 노드[복]["code"] != 노드[원]["code"]:
                raise ValueError(f"«{복}» 의 코드가 «{원}» 와 다르다 — 하나로 옮길 수 없다")
    (나갈곳 / "nodes").mkdir(parents=True, exist_ok=True)
    io.open(나갈곳 / "nodes" / "__init__.py", "w", encoding="utf-8", newline="\n").write("")
    for 제목, 파일 in 코드이름.items():
        머리 = f"# 뽑음: {yml.name} 의 «{제목}» 단계 — 손으로 고치지 말 것 (weekly/server/extract.py 로 다시 뽑는다)\n"
        io.open(나갈곳 / "nodes" / f"{파일}.py", "w", encoding="utf-8", newline="\n").write(
            머리 + 노드[제목]["code"].rstrip() + "\n")
    지시문 = {}
    for 제목, 이름 in 지시문이름.items():
        글 = {p["role"]: p["text"] for p in 노드[제목]["prompt_template"]}
        지시문[이름] = {"system": _자리바꾸기(제목, 글.get("system", "")),
                     "user": _자리바꾸기(제목, 글.get("user", ""))}
    io.open(나갈곳 / "prompts.json", "w", encoding="utf-8", newline="\n").write(
        json.dumps(지시문, ensure_ascii=False, indent=1) + "\n")
    return 지시문


if __name__ == "__main__":
    뽑기()
    print("뽑음:", ", ".join(f"nodes/{f}.py" for f in 코드이름.values()), "· prompts.json")
