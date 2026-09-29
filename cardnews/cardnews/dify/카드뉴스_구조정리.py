# Dify 코드 노드 「구조 정리」   ← LLM 「구조」 뒤에 붙는다
#
# **이 노드가 하는 일: 「구조」LLM 이 정한 사례 장수·개요를 기계가 다시 다듬는다.**
# 「구조」는 원고(또는 주제)를 보고 "사례가 몇 개(1~6)"·"사례마다 뭘 다루는지 한 줄"만
# 정하는 가벼운 LLM 이다 — 정확한 글자 수·문장은 신경 쓰지 않는다(그건 뒤에 오는
# 「대본」LLM 의 몫). 이 코드 노드는 그 결과를 파싱해서 숫자는 범위 안으로 가두고,
# 실패하면(파싱 안 되거나 원고가 비어 있으면) 조용히 기본값(4)으로 돌아간다 —
# 여기서 막히면 전체 파이프라인이 못 돈다, 「구조」는 안전망이 있어야 하는 자리다.
#
# 입력 변수:
#     text   String   ← 구조 / text
#
# 출력 변수:
#     사례_개수   String   "1"~"6" 사이. 「레시피 꺼내기」의 입력으로 그대로 간다.
#     outline    String   사람이 읽는 개요("1. ...\n2. ...\n..."). 비어 있을 수 있다
#                          (원고 없이 주제만 준 경우). 칸 이름이 아스키인 이유: 「대본」
#                          LLM 프롬프트가 {{#..#}} 로 이 값을 직접 읽는다 — Dify 의
#                          변수 참조 정규식이 아스키만 받는다(오류모음 §22).

import json
import re

사례_최소, 사례_최대, 기본_사례개수 = 1, 6, 4


def _벗기기(글: str) -> str:
    """LLM 이 ```json 으로 감싸 보내는 일이 흔하다(카드뉴스_대본검증.py 와 같은 함정)."""
    글 = (글 or "").strip()
    글 = re.sub(r"^```(?:json)?\s*|\s*```$", "", 글, flags=re.M).strip()
    처음, 끝 = 글.find("{"), 글.rfind("}")
    return 글[처음:끝 + 1] if 처음 >= 0 and 끝 > 처음 else 글


def main(text: str) -> dict:
    벗긴것 = _벗기기(text)
    try:
        d = json.loads(벗긴것) if 벗긴것 else {}
    except Exception:
        d = {}

    try:
        n = int(d.get("사례_개수"))
    except (TypeError, ValueError):
        n = 기본_사례개수
    n = max(사례_최소, min(사례_최대, n))

    개요목록 = d.get("사례_개요")
    if not isinstance(개요목록, list):
        개요목록 = []
    개요목록 = [str(x).strip() for x in 개요목록 if str(x).strip()][:n]
    outline = "\n".join(f"{i}. {줄}" for i, 줄 in enumerate(개요목록, start=1))

    return {"사례_개수": str(n), "outline": outline}
