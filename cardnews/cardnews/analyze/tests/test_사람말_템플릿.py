# 사람 눈에 보이는 말에 「틀」이 남았나. 사람 지시 2026-09-19: 화면 용어는 「템플릿」.
# **값은 안 본다** — Dify 노드 이름·할 일 이름·칸 이름은 바꾸면 그 자리에서 깨진다.
import re

import pytest
from pathlib import Path

# tests/ 의 두 칸 위가 `cardnews/` 다. 부르는 자리에 안 끌려다니게 파일에서 잡는다.
뿌리 = Path(__file__).resolve().parents[2]
틀린계열 = re.compile(r"틀(?=[리린렸림렀])")


def _사람말에틀(글: str) -> bool:
    남은 = 틀린계열.sub("", 글)
    return "틀" in 남은


def test_분석람다가_사람에게_하는_말():
    """채팅 말풍선에 그대로 뜨는 한 줄이다.

    **그 줄은 2026-09-19 에 `람다말.py` 로 옮겨 갔다**(영어로도 나와야 해서).
    두 곳을 다 훑는다 — 한 곳만 보면 다시 옮길 때 또 조용히 낡는다.
    """
    글 = ""
    for 이름 in ("analyze/lambda_분석.py", "analyze/람다말.py"):
        길 = 뿌리 / 이름
        if 길.exists():
            글 += 길.read_text(encoding="utf-8")
    줄 = [x for x in 글.split("\n") if "분석해줘" in x and "저장합니다" in x]
    assert 줄, "그 안내 줄을 못 찾았다 — 시험이 낡았다"
    for x in 줄:
        assert not _사람말에틀(x), f"사람에게 하는 말에 「틀」이 남았다: {x.strip()}"


def test_dify_입력칸_이름():
    """Dify 화면에서 사람이 고르는 칸 이름이다."""
    글 = (뿌리 / "dify" / "make_dsl_cardnews.py").read_text(encoding="utf-8")
    for m in re.finditer(r'"label":\s*"([^"]*)"', 글):
        assert not _사람말에틀(m.group(1)), f"입력칸 이름에 「틀」이 남았다: {m.group(1)}"

# ── 화면까지 가는 «문» 으로 센다 (사람 결정 2026-09-19) ────────────
#
# **파일을 하나씩 더하면 또 빠진다.** 위 두 시험은 파일 둘만 훑었고, 그래서
# `render/app.py` 의 네 줄을 놓쳤다 — 그중 둘은 실제로 화면에 나가고 있었다.
# 파일을 더 더해도 「그때 눈에 보인 것만」이 되는 것은 같다.
#
# **문으로 세면 파일을 셀 필요가 없다.** 사람 화면까지 가는 길은 넷뿐이다:
#
#     "why"   — {ok: false, why} 로 나간다. 웹이 그대로 찍는다
#     "말"    — {ok: true, 말} 로 나간다
#     "error" — 404 의 몸통. `_사람말` 이 not_found 를 그대로 통과시킨다
#     KeyError — 위 "error" 가 되어 같은 길로 간다
#
# **한계를 적어 둔다** — 한 줄짜리 글만 본다. 여러 줄로 이어 붙인 글
# (`"앞" + "뒤"`)은 앞 조각만 걸린다. 그런 글이 늘면 이 시험을 넓혀야 한다.
_문들 = (
    r'"why":\s*f?"([^"]*)"',
    r'"말":\s*f?"([^"]*)"',
    r'"error":\s*f?"([^"]*)"',
    r'raise KeyError\(\s*f?"([^"]*)"',
)

# 사람에게 말이 나가는 파일들. **여기 더하는 것은 괜찮다** — 빠뜨려도 위
# 문 넷이 다른 파일에서 열리면 그건 새 설계라 눈에 띈다.
_말나가는파일 = ("render/app.py", "analyze/lambda_분석.py")


@pytest.mark.parametrize("어디", _말나가는파일)
def test_화면까지_가는_말에_틀이_없다(어디):
    글 = (뿌리 / 어디).read_text(encoding="utf-8")
    걸린것 = []
    for 문 in _문들:
        for m in re.finditer(문, 글):
            if _사람말에틀(m.group(1)):
                줄 = 글[:m.start()].count(chr(10)) + 1
                걸린것.append(f"{어디}:{줄}  {m.group(1)}")
    assert not 걸린것, ("화면에 나가는 말에 「틀」이 남았다:"
                      + chr(10) + chr(10).join(걸린것))
