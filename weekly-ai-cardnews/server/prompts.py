# -*- coding: utf-8 -*-
"""대본 지시문 채우기 — prompts.json 의 {{단계.값}} 자리에 값을 넣는다.

**채울 값이 없으면 멈춘다.** Dify 에서는 자리가 조용히 안 채워진 채 LLM 에게 가서,
«다시 쓰기» 가 지적을 한 번도 못 받은 적이 있다(스킬 dify-workflow «출력 칸 이름은 아스키로만»).
"""
import json
import re
from pathlib import Path

_지시문 = json.loads((Path(__file__).resolve().parent / "prompts.json").read_text(encoding="utf-8"))
_자리 = re.compile(r"\{\{(시작|소식고르기|본문대본|본문검증[123]|본문다시쓰기2?|표지훅|훅검증[12]|훅다시쓰기2?)"
                  r"\.([A-Za-z0-9_]+)\}\}")


def _글로(값) -> str:
    """Dify 가 끼워 넣던 모양 그대로 — 글은 그대로, 목록·사전은 JSON(한글 그대로)."""
    if isinstance(값, str):
        return 값
    if isinstance(값, (list, dict)):
        return json.dumps(값, ensure_ascii=False)
    return str(값)


def 채우기(이름: str, 값들: dict) -> tuple[str, str]:
    둘 = _지시문[이름]

    def 한자리(m):
        열쇠 = f"{m.group(1)}.{m.group(2)}"
        if 열쇠 not in 값들:
            raise KeyError(f"«{이름}» 지시문의 {{{{{열쇠}}}}} 에 넣을 값이 없다")
        return _글로(값들[열쇠])

    return _자리.sub(한자리, 둘["system"]), _자리.sub(한자리, 둘["user"])
