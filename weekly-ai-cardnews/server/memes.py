# -*- coding: utf-8 -*-
"""표지 검사기(`nodes/check_hook.py`)에 밈 이름을 씻어 넘긴다 — 주간 AI 소식·새 분야 판이 같이 쓴다(계획 4 E).

검사기의 밈 목록은 옛 Dify 에서 뽑을 때 묻은 표시로 76조각 중 13개가 «**누가 돌아왔게** 🔥» 꼴이고, 목록을 쉼표로 잘라
«나야, 들기름» 같은 쉼표 든 밈 3개는 둘로 쪼개진다. 그래서 바르게 쓴 밈 13개가 «밈사전에 없다» 로 막혔다.
검사기는 yml 에서 한 글자도 안 고치고 뽑은 파일이라(extract.py · test_extract) 손대지 않고, 부르는 동안만
목록·장면표·고른 밈 이름을 씻는다."""
import json
import unicodedata

넓은쉼표 = "，"  # 검사기가 목록을 «,» 로 자르므로 이름 안의 쉼표는 이것으로 — 옛 서버 밈 찾기(_이름키)는 둘 다 «_» 로 읽는다


def 씻기(이름: str) -> str:
    """별표(굵은 표시)와 그림 글자(이모지)만 떼고 쉼표는 넓은 쉼표로 — 괄호·쌍점·빗금은 밈 이름의 일부다(«각성 (마늘)»)."""
    깨끗 = "".join(c for c in (이름 or "").replace("*", "")
                  if unicodedata.category(c) not in ("So", "Sk", "Cs") and c != "️").strip()
    return 깨끗.replace(",", 넓은쉼표)


def _밈칸씻기(글: str, 벗기기) -> str:
    """표지 JSON 의 meme 칸만 씻는다 — JSON 이 아니면 그대로(검사기가 알아서 탈을 낸다)."""
    if not (글 or "").strip():
        return 글
    try:
        표지 = json.loads(벗기기(글))
    except ValueError:
        return 글
    if not isinstance(표지, dict) or not isinstance(표지.get("meme"), str):
        return 글
    return json.dumps({**표지, "meme": 씻기(표지["meme"])}, ensure_ascii=False)


class 씻은표지검사:
    """검사기를 감싼다. 부르는 동안만 밈 목록·장면표를 씻은 이름으로 바꾸고 끝나면 돌려놓는다
    (람다 한 번에 판 하나라 둘이 겹치지 않는다). 그 밖의 칸은 검사기로 넘긴다."""

    def __init__(self, 검사기):
        self._검사기 = 검사기

    def __getattr__(self, 이름):
        return getattr(self._검사기, 이름)

    def main(self, text: str, week: str, 고친것: str = "", 고친것2: str = "", slides="") -> dict:
        c = self._검사기
        옛목록, 옛장면 = c.밈목록, c.밈장면
        새장면 = {}
        for k, v in 옛장면.items():
            새장면.setdefault(씻기(k), v)  # «**누가 돌아왔게** 🔥»·«**누가 돌아왔게**» 둘 — 앞의 장면을 쓴다
        이름들 = dict.fromkeys(list(새장면) + [씻기(m) for m in 옛목록.split(",") if m.strip()])
        c.밈목록, c.밈장면 = ",".join(이름들), 새장면
        try:
            d = c.main(text=_밈칸씻기(text, c._벗기기), week=week, 고친것=_밈칸씻기(고친것, c._벗기기),
                       고친것2=_밈칸씻기(고친것2, c._벗기기), slides=slides)
        finally:
            c.밈목록, c.밈장면 = 옛목록, 옛장면
        밈 = (d.get("cover") or {}).get("meme")
        if isinstance(밈, str):  # 사람이 보는 이름은 원래 쉼표로
            d["cover"]["meme"] = 밈.replace(넓은쉼표, ",")
        return d
