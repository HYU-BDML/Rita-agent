# -*- coding: utf-8 -*-
"""화풍 목록 — 판마다 하나(사람 결정 2026-09-29). 설계 §10.

**망을 안 탄다.** 목록과 고르는 규칙, 웹 거울이 파이썬과 같은지만 본다.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import 화풍  # noqa: E402

웹 = HERE.parent.parent / "web"


def test_화풍은_열여덟에_기본_하나다():
    번호들 = [x["id"] for x in 화풍.목록]
    assert len(번호들) == 19 and len(set(번호들)) == 19
    assert sum(1 for x in 화풍.목록 if x["AI후보"]) == 18
    assert 번호들[-1] == "기본" and not 화풍.찾기("기본")["AI후보"]
    assert 화풍.찾기("필름스냅")["AI후보"]
    for 뺀것 in ("532", "479", "20", "366"):
        assert not 화풍.찾기(뺀것), f"사람이 뺀 {뺀것} 가 들어 있다"


def test_이름이_안_겹친다():
    for 칸 in ("이름", "이름영어"):
        값 = [x[칸] for x in 화풍.목록]
        assert len(set(값)) == len(값), 칸


def test_기본만_문장이_비었다():
    for x in 화풍.목록:
        assert bool(x["문장"]) == (x["id"] != "기본"), x["id"]


def test_거절_난_이름_상표가_문장에_없다():
    막힌것 = ("disney", "universal", "minecraft", "pixar", "ghibli", "airbnb", "behance",
            "디즈니", "유니버설", "마인크래프트", "픽사", "지브리", "에어비앤비", "비핸스")
    for x in 화풍.목록:
        for 말 in 막힌것:
            assert 말 not in x["문장"].lower(), (x["id"], 말)


def test_색_하나_화풍은_강조색을_넣고_없으면_원문색이다():
    assert "#386AFB" in 화풍.문장("497", 색="#386AFB")
    assert "{색}" not in 화풍.문장("497", 색="#386AFB")
    assert "blue" in 화풍.문장("497") and "{색}" not in 화풍.문장("497")
    assert "sky blue" in 화풍.문장("513")
    assert 화풍.문장("530", 색="#386AFB") == 화풍.문장("530"), "색 없는 화풍은 색을 안 받는다"


def test_538_도장은_화면의_3분의_2다():
    assert "two-thirds of the frame" in 화풍.문장("538")
    assert "half of the frame" not in 화풍.문장("538")


def test_모르는_화풍과_기본은_문장이_없다():
    for 값 in ("기본", "없는것", "", None):
        assert 화풍.문장(값) == "", 값


def test_목록줄은_기본_빼고_열여덟이다():
    줄 = 화풍.목록줄().splitlines()
    assert len(줄) == 18
    assert all(l.startswith("- ") and ": " in l for l in 줄)
    assert "- 필름 스냅 실사: 35mm 필름으로 찍은 자연스러운 실제 사진" in 줄
    assert not any(l.startswith("- 기본") for l in 줄)


def test_이름으로_번호를_찾는다():
    assert 화풍.이름으로("실사 배경 + 손그림 인물") == "530"
    assert 화풍.이름으로("530") == "530"
    assert 화풍.이름으로("pixel art") == "215", "영어 이름은 대소문자를 안 가린다"
    assert 화풍.이름으로(" 픽셀 그림 ") == "215"
    assert 화풍.이름으로("없는 화풍") == "" and 화풍.이름으로(None) == ""


def test_이름이_조금_달라도_하나로_가려지면_받는다():
    """계획 AI 가 목록 이름을 줄이거나 덧붙여 쓰면 여태는 버렸다(2026-09-29 검토 M-5).
    알려진 인물 판에서 «필름 스냅» 이 버려지면 손그림 화풍으로 그려진다."""
    assert 화풍.이름으로("필름 스냅") == "필름스냅"
    assert 화풍.이름으로("필름 스냅 실사 (실존 인물)") == "필름스냅"
    assert 화풍.이름으로("필름스냅실사") == "필름스냅"
    assert 화풍.이름으로("겹종이") == "435"
    assert 화풍.이름으로("실사 배경") == "", "둘(530·528)에 걸리면 모른다고 한다"
    assert 화풍.이름으로("가") == "", "한 글자로는 안 가린다"


def test_기본은_괄호_없이_기본이다():
    """사람 지시 2026-09-29: 「기본(예전방식) 에서 괄호는 빼자 그냥 기본 이렇게 하자」."""
    x = 화풍.찾기("기본")
    assert x["이름"] == "기본" and "(" not in x["이름영어"]


def test_고르기는_목록_밖과_기본을_버리고_코드가_뽑는다():
    assert 화풍.고르기(["없는것", "기본", "겹종이 입체"], 뽑기=lambda x: x[0]) == "435"
    assert 화풍.고르기(["435", "533", "405"], 뽑기=lambda x: x[-1]) == "405"
    받은것 = []
    화풍.고르기(["435", "435", "533"], 뽑기=lambda x: 받은것.append(list(x)) or x[0])
    assert 받은것 == [["435", "533"]], "겹친 후보는 한 번만 뽑기에 간다"


def test_필름스냅이_섞이면_필름스냅_하나다():
    assert 화풍.고르기(["530", "필름 스냅 실사", "435"], 뽑기=lambda x: x[0]) == "필름스냅"


def test_하나도_안_남으면_530():
    assert 화풍.고르기([]) == "530"
    assert 화풍.고르기(["없는것", "기본"]) == "530"
    assert 화풍.고르기(None) == "530"


def test_지정받기는_목록에_있는_번호만():
    assert 화풍.지정받기("537") == "537" and 화풍.지정받기("기본") == "기본"
    for 값 in ("알아서", "999", "", None, 537):
        assert 화풍.지정받기(값) == "", 값


def test_웹_거울이_파이썬_목록과_같다():
    """**다르면 채팅 카드와 실제 화풍이 갈린다.** 고치려면
    `python cardnews/analyze/화풍웹목록.py` 로 다시 쓴다."""
    글 = (웹 / "lib" / "화풍.js").read_text(encoding="utf-8")
    거울 = json.loads(글.split("export const 화풍목록 = ", 1)[1])
    assert 거울 == 화풍.웹목록(), "web/lib/화풍.js 가 낡았다 — python cardnews/analyze/화풍웹목록.py"


def test_예시_그림이_다_있다():
    for x in 화풍.목록:
        assert x["예시"].startswith("/hwapung/") and x["예시"].endswith(".jpg"), x["id"]
        assert (웹 / x["예시"].lstrip("/")).is_file(), x["예시"]
