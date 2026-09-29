# -*- coding: utf-8 -*-
"""**람다가 죽기 전에 손을 떼나.** 죽으면 만든 사진값이 통째로 날아간다.

람다는 900초에 **강제로** 끊긴다. 그런데 사진 만들기는 제 시계로 600초를 셌다 —
람다가 몇 초 남았는지 몰랐다. 끊기면 그때까지 만든 사진이 메모리에만 있어서
사라진다. **값은 이미 나갔는데 남는 것이 없다.**

실측(2026-09-10~24, 277판): 아직 죽은 적은 없지만 **가장 오래 걸린 판이 782초**로
118초밖에 안 남았었다. 사진 한두 장이 더 붙거나 fal 줄이 길어지면 넘는다.

**여기서 못을 박는 것은 셋이다.**

- 람다 문(`handler`)이 **제 남은 시간을 아래로 내린다.** 안 내리면 아래는 영영
  모른다 — `context` 는 문에만 있다.
- 굽기가 **굽는 몫을 남겨 놓고** 사진에 시간을 준다. 사진이 900초를 꽉 쓰면
  구울 시간이 없어 결국 똑같이 날아간다.
- 사진을 **다 못 만들어도 굽는다.** 이게 값을 지키는 자리다 — 만든 것까지는
  그림이 되어 창고에 남는다.
"""
import os
import sys
import time
from pathlib import Path

여기 = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(여기))
os.environ.setdefault("CARDNEWS_DATA", str(여기 / "data"))

import lambda_분석 as 분석  # noqa: E402
import 사진만들기  # noqa: E402
import 카드뉴스만들기 as 만들기  # noqa: E402


def _사진카드(장수=2):
    return [{"역할": "본문", "글자영역": [],
             "장식영역": [{"종류": "사진", "box": [0, 0, 100, 100],
                        "설명": "무엇이든"}]}
            for _ in range(장수)]


# ── 사진 만들기 — 준 시간만큼만 쓴다 ────────────────────────────────

def _마감받기(monkeypatch, 예산초):
    """가짜 fal 을 걸고 **부를 때 받은 마감**을 모은다."""
    monkeypatch.setattr(사진만들기, "동시일꾼", 1)
    받은 = []

    def 부르기(지시문, 누끼=False, 품질=None, 크기=None, 마감=None, 그만인가=None):
        받은.append(마감)
        return "https://x/1.png"

    잰때 = time.monotonic()
    사진만들기.채우기(_사진카드(1), "주제", 부르기=부르기,
                 잔액보기=lambda: 10.0, 예산초=예산초)
    return 받은, 잰때


def test_준_시간만큼만_쓴다(monkeypatch):
    받은, 잰때 = _마감받기(monkeypatch, 90)
    assert len(받은) == 1
    # 마감은 «지금부터 90초 뒤» 언저리여야 한다. 시험이 도는 시간만큼만 어긋난다.
    assert 85 <= 받은[0] - 잰때 <= 95, 받은[0] - 잰때


def test_안_주면_여태대로_600초다(monkeypatch):
    받은, 잰때 = _마감받기(monkeypatch, None)
    assert abs((받은[0] - 잰때) - 사진만들기.사진전체상한) < 5


def test_상한보다_더_줘도_상한까지다(monkeypatch):
    """람다가 아무리 넉넉해도 사진 하나에 10분 넘게 매달리지 않는다."""
    받은, 잰때 = _마감받기(monkeypatch, 5000)
    assert abs((받은[0] - 잰때) - 사진만들기.사진전체상한) < 5


def test_시간이_없으면_마감이_이미_지났다(monkeypatch):
    """람다가 곧 끝나는 판. 0 을 「한도 없음」으로 잘못 읽으면 여기서 걸린다."""
    받은, 잰때 = _마감받기(monkeypatch, 0)
    assert 받은[0] - 잰때 < 1


# ── 굽기 — 굽는 몫을 남겨 놓고 준다 ─────────────────────────────────

def _예산엿보기(monkeypatch):
    """`굽기` 가 사진에 **몇 초를 줬는지** 가로챈다."""
    준것 = []

    class _가짜사진:
        채울자리 = staticmethod(사진만들기.채울자리)   # 세는 규칙은 진짜 것을 쓴다

        @staticmethod
        def 채우기(카드들, 주제, 예산초=None, 알림=None, 꽂힘=None, 그만인가=None):
            준것.append(예산초)
            return 0

    monkeypatch.setitem(sys.modules, "사진만들기", _가짜사진)
    monkeypatch.setattr(만들기, "_부르기",
                        lambda 길, 몸, 초=180: {"slides": ["https://x/1.png"],
                                              "url": "https://x/작업대"})
    return 준것


def test_굽는_몫을_남기고_준다(monkeypatch):
    준것 = _예산엿보기(monkeypatch)
    만들기.굽기({"주제": "ㅇ", "카드": _사진카드()}, 사진="만듦",
             람다마감=time.monotonic() + 500)
    assert len(준것) == 1
    # 500초 남았으면 사진에는 (500 - 120) 초쯤 준다.
    assert abs(준것[0] - (500 - 만들기.굽는여유초)) < 5, 준것[0]


def test_마감을_안_주면_안_잰다(monkeypatch):
    """시험이나 손으로 부르는 길 — 여태대로 사진 쪽 상한만 본다."""
    준것 = _예산엿보기(monkeypatch)
    만들기.굽기({"주제": "ㅇ", "카드": _사진카드()}, 사진="만듦")
    assert 준것 == [None]


def test_남은_시간이_굽는_몫보다_적으면_0이다(monkeypatch):
    """사진을 포기하고 굽기로 간다 — 음수를 주면 아래에서 뒤집힌다."""
    준것 = _예산엿보기(monkeypatch)
    만들기.굽기({"주제": "ㅇ", "카드": _사진카드()}, 사진="만듦",
             람다마감=time.monotonic() + 10)
    assert 준것[0] == 0.0


def test_굽는_여유는_실측_굽기_시간보다_넉넉하다():
    """실측 2026-09-24: 그림 굽기는 가운데 9초 · 가장 오래 30초였다.

    이 값을 30초 밑으로 줄이면 **굽다가 람다가 끊긴다** — 사진은 다 만들어 놓고
    그림이 안 나오는, 제일 아까운 실패다.
    """
    assert 만들기.굽는여유초 >= 60


# ── 값을 지키는 자리 — 다 못 만들어도 굽는다 ────────────────────────

def test_사진을_다_못_만들어도_굽고_작업대를_낸다(monkeypatch):
    """**여기가 값을 지키는 자리다.** 중간에 멈추면 만든 사진까지 같이 사라진다."""
    monkeypatch.setattr(사진만들기, "동시일꾼", 1)
    부른수 = []

    def 반만되는부르기(지시문, 누끼=False, 품질=None, 크기=None, 마감=None, 그만인가=None):
        부른수.append(1)
        if len(부른수) > 1:
            raise 사진만들기.그림없음("시간이 없다")
        return "https://x/첫장.png"

    # **진짜 `채우기` 를 감싸서 부른다.** `부르기`·`잔액` 은 기본값으로 묶여 있어
    # 모듈 칸만 바꿔서는 안 먹는다 — 함수를 지을 때 이미 붙잡힌 값이다.
    진짜채우기 = 사진만들기.채우기
    monkeypatch.setattr(
        사진만들기, "채우기",
        lambda 카드들, 주제, 예산초=None, 알림=None, 꽂힘=None, 그만인가=None: 진짜채우기(
            카드들, 주제, 부르기=반만되는부르기, 잔액보기=lambda: 10.0,
            알림=알림, 예산초=예산초))
    낸것 = []
    monkeypatch.setattr(만들기, "_부르기",
                        lambda 길, 몸, 초=180: (낸것.append(길) or
                                              {"slides": ["https://x/a.png", "https://x/b.png"],
                                               "url": "https://x/작업대"}))
    카드 = _사진카드(2)
    난것 = 만들기.굽기({"주제": "ㅇ", "카드": 카드}, 사진="만듦")

    assert 낸것 == ["/render/cardnews", "/workbench"], "안 굽고 멈췄다"
    assert 난것["작업대"] == "https://x/작업대"
    # 만든 한 장은 카드에 박혀 있어야 한다 — 이게 다시 안 사도 되는 값이다.
    assert 카드[0]["장식영역"][0]["media_url"] == "https://x/첫장.png"
    assert "media_url" not in 카드[1]["장식영역"][0]


# ── 람다 문이 제 남은 시간을 내린다 ─────────────────────────────────

class _가짜문맥:
    def __init__(self, 남은초):
        self._남은 = 남은초

    def get_remaining_time_in_millis(self):
        return int(self._남은 * 1000)


def _마감가로채기(monkeypatch, 어느):
    받은 = []

    def 가짜(시킴, 람다마감=0):
        받은.append(람다마감)
        return {"ok": True}

    monkeypatch.setattr(분석, 어느, 가짜)
    return 받은


def test_문이_굽기에_남은_시간을_내린다(monkeypatch):
    받은 = _마감가로채기(monkeypatch, "굽기한판")
    잰때 = time.monotonic()
    분석.handler({"굽기": {"번호": "j1"}}, _가짜문맥(840))
    assert len(받은) == 1
    assert abs((받은[0] - 잰때) - 840) < 5, 받은[0] - 잰때


def test_문이_한_번에_가는_길에도_내린다(monkeypatch):
    받은 = _마감가로채기(monkeypatch, "카드뉴스한판")
    잰때 = time.monotonic()
    분석.handler({"카드뉴스": {"번호": "j2"}}, _가짜문맥(900))
    assert abs((받은[0] - 잰때) - 900) < 5


def test_문맥이_없어도_안_터진다(monkeypatch):
    """손으로 부르거나 옛 시험이 부르는 길 — 0 이면 안 재고 여태대로 간다."""
    받은 = _마감가로채기(monkeypatch, "굽기한판")
    분석.handler({"굽기": {"번호": "j3"}}, None)
    assert 받은 == [0]


# ── 이어서 하기 — 이미 만든 사진에는 값이 또 안 나간다 ──────────────

def test_사진이_박힌_카드를_같이_돌려준다(monkeypatch):
    """**이것이 「이어서 하기」의 값이다.** 안 돌려주면 다음에 처음부터 다 산다."""
    monkeypatch.setattr(사진만들기, "동시일꾼", 1)
    진짜채우기 = 사진만들기.채우기
    monkeypatch.setattr(
        사진만들기, "채우기",
        lambda 카드들, 주제, 예산초=None, 알림=None, 꽂힘=None, 그만인가=None: 진짜채우기(
            카드들, 주제,
            부르기=lambda *a, **k: "https://x/된것.png",
            잔액보기=lambda: 10.0, 알림=알림, 예산초=예산초))
    monkeypatch.setattr(만들기, "_부르기",
                        lambda 길, 몸, 초=180: {"slides": ["https://x/a.png"],
                                              "url": "https://x/작업대"})
    난것 = 만들기.굽기({"주제": "ㅇ", "카드": _사진카드(2)}, 사진="만듦")
    assert 난것["못만든사진"] == 0
    박힌것 = [장["장식영역"][0].get("media_url") for 장 in 난것["카드"]]
    assert 박힌것 == ["https://x/된것.png", "https://x/된것.png"]


def test_못_만든_자리_수를_센다(monkeypatch):
    """화면이 이 수를 보고 「다시 누르면 빈 자리만 만든다」를 띄운다."""
    monkeypatch.setattr(사진만들기, "동시일꾼", 1)
    부른수 = []

    def 하나만되기(지시문, 누끼=False, 품질=None, 크기=None, 마감=None, 그만인가=None):
        부른수.append(1)
        if len(부른수) > 1:
            raise 사진만들기.그림없음("시간이 없다")
        return "https://x/첫장.png"

    진짜채우기 = 사진만들기.채우기
    monkeypatch.setattr(
        사진만들기, "채우기",
        lambda 카드들, 주제, 예산초=None, 알림=None, 꽂힘=None, 그만인가=None: 진짜채우기(
            카드들, 주제, 부르기=하나만되기, 잔액보기=lambda: 10.0,
            알림=알림, 예산초=예산초))
    monkeypatch.setattr(만들기, "_부르기",
                        lambda 길, 몸, 초=180: {"slides": ["https://x/a.png"],
                                              "url": "https://x/작업대"})
    난것 = 만들기.굽기({"주제": "ㅇ", "카드": _사진카드(3)}, 사진="만듦")
    assert 난것["못만든사진"] == 2, 난것["못만든사진"]
    # 된 한 장은 박혀 있고, 못 된 둘은 비어 있다 — 다음에 그 둘만 산다.
    assert 난것["카드"][0]["장식영역"][0]["media_url"] == "https://x/첫장.png"
    assert len(사진만들기.채울자리(난것["카드"])) == 2


def test_이미_박힌_자리는_다시_안_산다(monkeypatch):
    """되돌아온 카드를 그대로 다시 굽는 판 — **빈 자리에만** 값이 나간다."""
    monkeypatch.setattr(사진만들기, "동시일꾼", 1)
    부른것 = []

    def 세는부르기(지시문, 누끼=False, 품질=None, 크기=None, 마감=None, 그만인가=None):
        부른것.append(지시문)
        return "https://x/새것.png"

    진짜채우기 = 사진만들기.채우기
    monkeypatch.setattr(
        사진만들기, "채우기",
        lambda 카드들, 주제, 예산초=None, 알림=None, 꽂힘=None, 그만인가=None: 진짜채우기(
            카드들, 주제, 부르기=세는부르기, 잔액보기=lambda: 10.0,
            알림=알림, 예산초=예산초))
    monkeypatch.setattr(만들기, "_부르기",
                        lambda 길, 몸, 초=180: {"slides": ["https://x/a.png"],
                                              "url": "https://x/작업대"})
    카드 = _사진카드(3)
    카드[0]["장식영역"][0]["media_url"] = "https://x/지난번.png"
    난것 = 만들기.굽기({"주제": "ㅇ", "카드": 카드}, 사진="만듦")
    assert len(부른것) == 2, f"{len(부른것)}번 샀다 — 지난번 것까지 다시 샀다"
    assert 난것["카드"][0]["장식영역"][0]["media_url"] == "https://x/지난번.png"
    assert 난것["못만든사진"] == 0


def test_사진을_안_만드는_길은_0이다(monkeypatch):
    """「비움」을 고른 길. 빈 자리가 많아도 못 만든 것이 아니다."""
    monkeypatch.setattr(만들기, "_부르기",
                        lambda 길, 몸, 초=180: {"slides": ["https://x/a.png"],
                                              "url": "https://x/작업대"})
    난것 = 만들기.굽기({"주제": "ㅇ", "카드": _사진카드(3)}, 사진="")
    assert 난것["못만든사진"] == 0


# ── 사진이 오는 대로 화면에 알린다 (2026-09-24) ──────────────────────
#
# 여태는 사진이 «다» 끝나야 한 번에 나왔다 — 일곱 장이면 3분을 빈 자리만 보고
# 기다렸다. 한 장 꽂힐 때마다 번호표에 그 주소를 적어야 화면이 채울 수 있다.

def test_사진_한_장마다_어느_자리인지_알린다(monkeypatch):
    monkeypatch.setattr(사진만들기, "동시일꾼", 1)
    주소들 = ["https://x/1.png", "https://x/2.png"]
    꽂힌것 = []
    사진만들기.채우기(_사진카드(2), "주제",
                 부르기=lambda *a, **k: 주소들.pop(0),
                 잔액보기=lambda: 10.0,
                 꽂힘=lambda 장, 자리, 주소: 꽂힌것.append((장, 자리, 주소)))
    assert 꽂힌것 == [(0, 0, "https://x/1.png"), (1, 0, "https://x/2.png")], 꽂힌것


def test_못_만든_자리는_안_알린다(monkeypatch):
    """빈손으로 온 자리를 알리면 화면이 빈 그림을 꽂는다."""
    monkeypatch.setattr(사진만들기, "동시일꾼", 1)
    꽂힌것 = []

    def 하나만(지시문, 누끼=False, 품질=None, 크기=None, 마감=None, 그만인가=None):
        if 꽂힌것:
            raise 사진만들기.그림없음("안 나왔다")
        return "https://x/1.png"

    사진만들기.채우기(_사진카드(2), "주제", 부르기=하나만, 잔액보기=lambda: 10.0,
                 꽂힘=lambda 장, 자리, 주소: 꽂힌것.append((장, 자리, 주소)))
    assert 꽂힌것 == [(0, 0, "https://x/1.png")], 꽂힌것


def test_주소가_이상하면_안_알리고_안_박는다(monkeypatch):
    monkeypatch.setattr(사진만들기, "동시일꾼", 1)
    꽂힌것 = []
    카드 = _사진카드(1)
    사진만들기.채우기(카드, "주제", 부르기=lambda *a, **k: "javascript:alert(1)",
                 잔액보기=lambda: 10.0,
                 꽂힘=lambda 장, 자리, 주소: 꽂힌것.append((장, 자리, 주소)))
    assert 꽂힌것 == []
    assert "media_url" not in 카드[0]["장식영역"][0]


def test_꽂은_것이_진행_줄에_같이_실린다(monkeypatch):
    """번호표는 통째로 갈아 쓰므로, 담아 두지 않으면 다음 진행 줄이 지운다."""
    import json as _json
    적힌것 = []
    # **굳혀서 담는다.** 실물은 창고에 글로 써서 그 자리에서 굳는데, 가짜가
    # 묶음을 그대로 들고 있으면 뒤에 바뀐 값이 앞 줄에도 비친다.
    monkeypatch.setattr(분석, "_일적기",
                        lambda 번호, 것: 적힌것.append(_json.loads(_json.dumps(것))))

    def 하기(알림):
        꽂힘 = 분석._사진꽂기(알림)
        꽂힘(0, 0, "https://x/1.png")
        알림(50, "사진 1/2장")
        꽂힘(1, 0, "https://x/2.png")
        알림(60, "사진 2/2장")
        return {"장수": 2}, {"content": "됐다"}

    분석._번호표두고("j9", "시험", "", 하기)
    진행 = [x for x in 적힌것 if x.get("status") == "running"]
    assert 진행[0]["사진들"] == {"0-0": "https://x/1.png"}
    assert 진행[1]["사진들"] == {"0-0": "https://x/1.png", "1-0": "https://x/2.png"}
    # 진행 줄이 앞서 적은 것을 지우지 않았다.
    assert 진행[1]["progress"] == 60 and 진행[1]["말"] == "사진 2/2장"


# ── 「그만두기」 — 줄에서 기다리는 사진은 값이 안 나간다 (2026-09-24) ─────
#
# fal 문서: 줄에 있을 때 취소하면 「즉시 빠지고 **아예 처리되지 않는다**」,
# 그리고 「**실제 추론 작업만** 청구에 들어간다 · 줄에서 기다리는 시간은 무료다」.
# 처리가 안 되면 추론이 안 돌고, 안 돌면 값이 안 나간다.
#
# **이미 그리는 중인 것은 못 되돌린다** — 그건 값이 나간다.

def test_그만두면_아직_안_걸은_것은_걸지도_않는다(monkeypatch):
    """**여기가 제일 크게 아끼는 자리다.** 걸면 그 한 장은 온전히 값이 나간다."""
    monkeypatch.setattr(사진만들기, "동시일꾼", 1)
    부른것 = []
    사진만들기.채우기(_사진카드(3), "주제",
                 부르기=lambda *a, **k: (부른것.append(1) or "https://x/1.png"),
                 잔액보기=lambda: 10.0,
                 그만인가=lambda: len(부른것) >= 1)
    assert len(부른것) == 1, f"{len(부른것)}장을 걸었다 — 그만뒀는데 더 걸었다"


def test_그만_아니면_다_만든다(monkeypatch):
    monkeypatch.setattr(사진만들기, "동시일꾼", 1)
    부른것 = []
    몇 = 사진만들기.채우기(_사진카드(3), "주제",
                   부르기=lambda *a, **k: (부른것.append(1) or "https://x/1.png"),
                   잔액보기=lambda: 10.0, 그만인가=lambda: False)
    assert len(부른것) == 3 and 몇 == 3


def test_그만인가를_안_주면_여태대로다(monkeypatch):
    monkeypatch.setattr(사진만들기, "동시일꾼", 1)
    몇 = 사진만들기.채우기(_사진카드(2), "주제",
                   부르기=lambda *a, **k: "https://x/1.png", 잔액보기=lambda: 10.0)
    assert 몇 == 2


def test_그만뒀음은_다시_안_부른다(monkeypatch):
    """빈손일 때는 세 번까지 다시 부른다 — 그만뒀을 때 그러면 값만 더 나간다."""
    monkeypatch.setattr(사진만들기, "동시일꾼", 1)
    부른것 = []

    def 그만뒀다고(*a, **k):
        부른것.append(1)
        raise 사진만들기.그만뒀음("줄에서 뺐다")

    몇 = 사진만들기.채우기(_사진카드(1), "주제", 부르기=그만뒀다고,
                   잔액보기=lambda: 10.0, 그만인가=lambda: False)
    assert 부른것 == [1], f"{len(부른것)}번 불렀다 — 그만뒀는데 또 걸었다"
    assert 몇 == 0


def test_그만뒀어도_만든_것은_그대로_굽는다(monkeypatch):
    """**누른 사람이 낸 값은 남는다.** 시간이 다 됐을 때와 똑같이 한다."""
    monkeypatch.setattr(사진만들기, "동시일꾼", 1)
    부른것 = []
    진짜채우기 = 사진만들기.채우기
    monkeypatch.setattr(
        사진만들기, "채우기",
        lambda 카드들, 주제, 예산초=None, 알림=None, 꽂힘=None, 그만인가=None: 진짜채우기(
            카드들, 주제,
            부르기=lambda *a, **k: (부른것.append(1) or "https://x/1.png"),
            잔액보기=lambda: 10.0, 알림=알림, 예산초=예산초, 꽂힘=꽂힘,
            그만인가=lambda: len(부른것) >= 1))
    낸것 = []
    monkeypatch.setattr(만들기, "_부르기",
                        lambda 길, 몸, 초=180: (낸것.append(길) or
                                              {"slides": ["https://x/a.png"],
                                               "url": "https://x/작업대"}))
    난것 = 만들기.굽기({"주제": "ㅇ", "카드": _사진카드(3)}, 사진="만듦",
                  그만인가=lambda: True)
    assert 낸것 == ["/render/cardnews", "/workbench"], "안 굽고 멈췄다"
    assert 난것["카드"][0]["장식영역"][0]["media_url"] == "https://x/1.png"
    assert 난것["못만든사진"] == 2


def test_그만인가는_창고를_자주_안_읽는다(monkeypatch):
    """사진 여럿이 2초마다 묻는다 — 그때마다 읽으면 한 판에 수백 번이다."""
    읽은수 = []
    monkeypatch.setattr(분석, "_일읽기", lambda 번호: (읽은수.append(1) or {}))
    그만인가 = 분석._그만인가만들기("j1")
    for _ in range(50):
        그만인가()
    assert len(읽은수) == 1, f"{len(읽은수)}번 읽었다"


def test_한_번_그만이면_되돌리지_않는다(monkeypatch):
    답 = [{"그만": True}, {}]
    monkeypatch.setattr(분석, "_일읽기", lambda 번호: 답.pop(0) if 답 else {})
    그만인가 = 분석._그만인가만들기("j1")
    assert 그만인가() is True
    assert 그만인가() is True, "그만을 되돌렸다"


def test_창고를_못_읽으면_그만_안_한_것으로_본다(monkeypatch):
    """창고가 한 번 삐끗했다고 만들던 것을 버리면 막으려던 것보다 나쁘다."""
    def 터지기(번호):
        raise RuntimeError("창고가 막혔다")
    monkeypatch.setattr(분석, "_일읽기", 터지기)
    assert 분석._그만인가만들기("j1")() is False
