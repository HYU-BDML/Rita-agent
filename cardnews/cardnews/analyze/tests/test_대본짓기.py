# -*- coding: utf-8 -*-
"""대본 쓰는 모델을 부르는 사람. **돈 안 든다** — 보내는 자리를 가짜로 세운다.

2026-09-19 부터 **DeepSeek** 를 부른다(사람 지시: 「베드락 안 쓸 거임」).
바뀐 것은 **어디로 보내느냐**뿐이고, 여기서 지키는 것은 그대로다 —
규격서 §10.3: 고칠 수 있는 탈에만 다시 걸고, 마감을 넘길 것 같으면 안 걸고,
**상류 탈 이름을 자기 것으로 안 덮는다.**

**생각 모드를 켜고 쓴다**(사람 지시 2026-09-19). 생각한 것도 출력 토큰으로
세므로, 부르는 쪽이 준 「답 길이」에 생각할 여유를 더해서 보낸다 — 안 그러면
생각하다 토큰을 다 쓰고 **빈 답**이 온다(실물로 확인했다).
"""
import sys
import time
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import 대본짓기  # noqa: E402


class _가짜답:
    """DeepSeek 이 돌려주는 모양만 흉내 낸다."""

    def __init__(self, 글="답이다", 끝난까닭="stop", 생각=""):
        self.글 = 글
        self.끝난까닭 = 끝난까닭
        self.생각 = 생각

    def 본문(self):
        메 = {"content": self.글}
        if self.생각:
            메["reasoning_content"] = self.생각
        return {"choices": [{"message": 메, "finish_reason": self.끝난까닭}],
                "usage": {"prompt_tokens": 10, "completion_tokens": 20}}


class _가짜보내기:
    """`던질것` 을 하나씩 던지고, 다 떨어지면 `줄것` 을 돌려준다."""

    def __init__(self, 던질것=(), 줄것=None):
        self.던질것 = list(던질것)
        self.줄것 = 줄것 or _가짜답()
        self.센것 = 0
        self.받은몸 = []

    def __call__(self, 몸, 시간상한):
        self.센것 += 1
        self.받은몸.append(몸)
        if self.던질것:
            raise self.던질것.pop(0)
        return self.줄것.본문()


def _깔기(monkeypatch, 보내기, 안쉬게=True):
    monkeypatch.setattr(대본짓기, "_보내기", 보내기)
    monkeypatch.setenv("DEEPSEEK_API_KEY", "가짜열쇠")
    if 안쉬게:
        monkeypatch.setattr(대본짓기.time, "sleep", lambda _: None)
    return 보내기


# ── 되는 길 ────────────────────────────────────────────────────────

def test_한_번에_되면_한_번만_부른다(monkeypatch):
    보냄 = _깔기(monkeypatch, _가짜보내기())
    assert 대본짓기.부르기("시스템", "사용자") == "답이다"
    assert 보냄.센것 == 1


def test_시스템과_사용자를_각자_자리에_싣는다(monkeypatch):
    보냄 = _깔기(monkeypatch, _가짜보내기())
    대본짓기.부르기("너는 도우미다", "카드뉴스 만들어줘")
    말들 = 보냄.받은몸[0]["messages"]
    assert 말들[0] == {"role": "system", "content": "너는 도우미다"}
    assert 말들[1] == {"role": "user", "content": "카드뉴스 만들어줘"}


def test_생각_모드를_켠_채로_보낸다(monkeypatch):
    # 사람 지시 2026-09-19. 끄려면 `thinking.type = disabled` 를 실어야 하는데
    # 그걸 안 싣는 것이 곧 켜 두는 것이다.
    보냄 = _깔기(monkeypatch, _가짜보내기())
    대본짓기.부르기("s", "u")
    assert "disabled" not in str(보냄.받은몸[0].get("thinking", ""))


def test_생각할_여유를_더해서_보낸다(monkeypatch):
    # 생각한 것도 출력 토큰으로 센다. 부르는 쪽이 준 길이 그대로 보내면
    # 생각하다 다 쓰고 빈 답이 온다.
    보냄 = _깔기(monkeypatch, _가짜보내기())
    대본짓기.부르기("s", "u", 최대토큰=1500)
    assert 보냄.받은몸[0]["max_tokens"] > 1500


def test_여유가_실측보다_넉넉하다():
    # 실측 2026-09-19: 한 번 부를 때 출력이 평균 8,349토큰이었다. 여유가 그
    # 언저리면 어떤 판은 되고 어떤 판은 안 된다 — 실제로 그랬다(12:06 성공,
    # 12:14 thinking_overflow).
    #
    # **상한은 값이 아니라 뚜껑이다.** 쓴 만큼만 내므로 넉넉히 잡아도 돈이
    # 안 든다. 아낄 이유가 없는 자리다.
    assert 대본짓기.생각여유 >= 24000


def test_생각하다_넘치면_여유를_늘려_다시_건다(monkeypatch):
    # **같은 여유로 또 걸면 동전 던지기다.** 늘려서 걸어야 수렴한다.
    보냄 = _깔기(monkeypatch, _가짜보내기(
        줄것=_가짜답(글="", 끝난까닭="length")))

    난것 = []

    def 한번만넘치기(몸, 시간상한):
        난것.append(몸["max_tokens"])
        보냄.센것 += 1
        if len(난것) == 1:
            return _가짜답(글="", 끝난까닭="length").본문()
        return _가짜답(글="됐다").본문()

    monkeypatch.setattr(대본짓기, "_보내기", 한번만넘치기)
    assert 대본짓기.부르기("s", "u", 최대토큰=1000) == "됐다"
    assert len(난것) == 2, "다시 안 걸었다"
    assert 난것[1] > 난것[0], "같은 여유로 또 걸면 또 넘친다"


def test_여유를_늘려도_계속_넘치면_그때는_터뜨린다(monkeypatch):
    # 늘려도 안 되면 그건 진짜 못 고칠 탈이다 — 조용히 미정으로 물러서면
    # 못 쓰는 틀이 또 창고에 쌓인다.
    보냄 = _깔기(monkeypatch, _가짜보내기(줄것=_가짜답(글="", 끝난까닭="length")))
    with pytest.raises(대본짓기.모델탈) as 난것:
        대본짓기.부르기("s", "u")
    assert 난것.value.코드 == "thinking_overflow"
    assert 보냄.센것 == 대본짓기.최대시도


def test_생각한_글은_안_돌려준다(monkeypatch):
    # 뒷사람(`카드뉴스만들기`)은 JSON 을 기다린다. 생각한 글이 섞이면 못 읽는다.
    _깔기(monkeypatch, _가짜보내기(줄것=_가짜답(글='{"a":1}', 생각="음... 이렇게 하자")))
    assert 대본짓기.부르기("s", "u") == '{"a":1}'


# ── 다시 거는 규칙 ─────────────────────────────────────────────────

def test_막히면_다시_걸어_성공한다(monkeypatch):
    보냄 = _깔기(monkeypatch, _가짜보내기(던질것=[대본짓기.모델탈("429", "", True)]))
    assert 대본짓기.부르기("s", "u") == "답이다"
    assert 보냄.센것 == 2


def test_잔액_없음에는_다시_안_건다(monkeypatch):
    # 402 는 열 번 걸어도 열 번 같다. 돈을 넣어야 풀린다.
    보냄 = _깔기(monkeypatch, _가짜보내기(던질것=[대본짓기.모델탈("402", "", False)]))
    with pytest.raises(대본짓기.모델탈) as 난것:
        대본짓기.부르기("s", "u")
    assert 난것.value.코드 == "402"
    assert 보냄.센것 == 1


def test_열쇠_틀림에는_다시_안_건다(monkeypatch):
    보냄 = _깔기(monkeypatch, _가짜보내기(던질것=[대본짓기.모델탈("401", "", False)]))
    with pytest.raises(대본짓기.모델탈):
        대본짓기.부르기("s", "u")
    assert 보냄.센것 == 1


def test_상류_탈_이름을_그대로_들고_온다(monkeypatch):
    _깔기(monkeypatch, _가짜보내기(던질것=[대본짓기.모델탈("429", "", False)]))
    with pytest.raises(대본짓기.모델탈) as 난것:
        대본짓기.부르기("s", "u")
    assert 난것.value.코드 == "429", "429 를 500 으로 덮으면 사람이 할 행동이 뒤바뀐다"


def test_시도_횟수에_상한이_있다(monkeypatch):
    보냄 = _깔기(monkeypatch, _가짜보내기(
        던질것=[대본짓기.모델탈("429", "", True) for _ in range(10)]))
    with pytest.raises(대본짓기.모델탈):
        대본짓기.부르기("s", "u")
    assert 보냄.센것 == 대본짓기.최대시도


# ── 마감 ───────────────────────────────────────────────────────────

def test_마감이_지났으면_아예_안_부른다(monkeypatch):
    보냄 = _깔기(monkeypatch, _가짜보내기())
    with pytest.raises(대본짓기.모델탈) as 난것:
        대본짓기.부르기("s", "u", 마감=time.monotonic() - 1)
    assert 난것.value.코드 == "deadline_exceeded"
    assert 보냄.센것 == 0


def test_쉬면_마감을_넘길_것_같으면_안_쉰다(monkeypatch):
    보냄 = _깔기(monkeypatch, _가짜보내기(던질것=[대본짓기.모델탈("429", "", True)]),
              안쉬게=False)
    잔것 = []
    monkeypatch.setattr(대본짓기.time, "sleep", lambda 초: 잔것.append(초))
    with pytest.raises(대본짓기.모델탈):
        대본짓기.부르기("s", "u", 마감=time.monotonic() + 0.01)
    assert 잔것 == [], "기다리게 해 놓고 결국 못 주는 것이 제일 나쁘다"


# ── 빈 답 ──────────────────────────────────────────────────────────

def test_빈_답은_실패다(monkeypatch):
    _깔기(monkeypatch, _가짜보내기(줄것=_가짜답(글="")))
    with pytest.raises(대본짓기.모델탈) as 난것:
        대본짓기.부르기("s", "u")
    assert 난것.value.코드 == "empty_response"


def test_생각하다_토큰을_다_쓴_것은_따로_알린다(monkeypatch):
    # 빈 답인데 끝난 까닭이 `length` 면 「모델이 안 답했다」가 아니라
    # 「여유를 더 줘야 한다」는 뜻이다. 둘을 섞으면 못 고친다.
    _깔기(monkeypatch, _가짜보내기(줄것=_가짜답(글="", 끝난까닭="length")))
    with pytest.raises(대본짓기.모델탈) as 난것:
        대본짓기.부르기("s", "u")
    assert 난것.value.코드 == "thinking_overflow"


# ── 새는 것 ────────────────────────────────────────────────────────

def test_사용자_원문을_자국에_안_남긴다(monkeypatch, capsys):
    _깔기(monkeypatch, _가짜보내기(던질것=[대본짓기.모델탈("500", "", True)]))
    대본짓기.부르기("시스템", "아주 은밀한 원고")
    찍힌것 = capsys.readouterr()
    assert "아주 은밀한 원고" not in (찍힌것.out + 찍힌것.err)


def test_열쇠를_자국에_안_남긴다(monkeypatch, capsys):
    monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-비밀열쇠12345")
    _깔기(monkeypatch, _가짜보내기(던질것=[대본짓기.모델탈("500", "", True)]))
    monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-비밀열쇠12345")
    대본짓기.부르기("s", "u")
    찍힌것 = capsys.readouterr()
    assert "sk-비밀열쇠12345" not in (찍힌것.out + 찍힌것.err)


def test_열쇠가_없으면_부르기_전에_멈춘다(monkeypatch):
    monkeypatch.setattr(대본짓기, "_보내기", _가짜보내기())
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    with pytest.raises(대본짓기.모델탈) as 난것:
        대본짓기.부르기("s", "u")
    assert 난것.value.코드 == "no_api_key"
