# -*- coding: utf-8 -*-
"""웹 문 `POST /make` — 화면이 칸으로 나눠 준 것을 받아 «카드뉴스» 일을 건다.

**이 문이 봉투를 새로 짓는다.** 받은 것을 그대로 넘기지 않고 칸을 골라 담는다.
그래서 화면이 새 칸을 하나 보내기 시작해도 여기서 조용히 버려진다 — 오류도
로그도 없이, 그 칸이 없던 것처럼 일이 돈다.

실제로 그랬다(2026-09-18). 화면·워커까지 「언어」를 잘 실어 보냈는데 여기서
버려져 **영어 카드가 한 장도 안 나왔다.** 채팅 쪽 시험은 가짜 함수까지만 봐서
못 잡았다 — 진짜로 버려지는 자리가 그 한 걸음 뒤였다.

그래서 여기서는 **봉투에 실리는 칸을 통째로** 견준다. 칸이 하나 늘거나 줄면
빨개진다.
"""
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
os.environ.setdefault("BUCKET", "시험통")

import app  # noqa: E402


def _깔기(monkeypatch):
    걸린것 = []

    def 가짜(e, 시킴, 무엇):
        걸린것.append((시킴, 무엇))
        return app._reply(202, {"job_id": "x", "status": "queued"})

    monkeypatch.setattr(app, "_일걸기", 가짜)
    return 걸린것


def test_고른_언어를_봉투에_싣는다(monkeypatch):
    걸린것 = _깔기(monkeypatch)
    app.만들기걸기({}, {"주제": "강남 카페", "틀": "기본", "언어": "영어"})
    assert 걸린것[0][0]["언어"] == "영어", "언어가 봉투에서 사라졌다"


def test_언어를_안_보내면_빈_글자다(monkeypatch):
    """**거절하지도, 여기서 한국어로 바꾸지도 않는다.**

    고르는 일은 화면이 하고, 모르는 값을 한국어로 떨어뜨리는 일은 분석 람다가
    한다(`lambda_분석.카드뉴스한판`). 여기서 또 기본값을 박으면 규칙이 두 벌이
    되어 언젠가 어긋난다.
    """
    걸린것 = _깔기(monkeypatch)
    app.만들기걸기({}, {"주제": "강남 카페"})
    assert 걸린것[0][0]["언어"] == ""


def test_봉투에_실리는_칸이_이것뿐이다(monkeypatch):
    """**칸 목록을 통째로 못 박는다.** 화면이 새 칸을 보내기 시작할 때
    여기 안 더하면 조용히 버려진다 — 그때 이 시험이 빨개져 알려 준다."""
    걸린것 = _깔기(monkeypatch)
    app.만들기걸기({}, {"주제": "강남 카페", "원고": "글", "틀": "기본",
                  "언어": "영어", "모르는칸": "버려짐"})
    시킴, 무엇 = 걸린것[0]
    assert 무엇 == "카드뉴스"
    assert sorted(시킴) == sorted(["주제", "원고", "틀", "언어",
                                  "사진", "로고", "사진들"])


def test_사진_고른_것을_봉투에_싣는다(monkeypatch):
    """사람이 「비워 두기」·「AI로 만들기」 중 무엇을 골랐는지.

    이 칸이 사라지면 **돈 나가는 쪽이 조용히 꺼진다** — 사람은 AI 가 그려
    주는 줄 알고 기다리는데 회색 네모만 나온다.
    """
    걸린것 = _깔기(monkeypatch)
    app.만들기걸기({}, {"주제": "강남 카페", "사진": "만듦"})
    assert 걸린것[0][0]["사진"] == "만듦"



def test_로고_주소를_봉투에_싣는다(monkeypatch):
    """올린 로고의 주소.

    이 칸이 사라지면 **로고가 조용히 안 들어간다** — 사람은 올렸는데 카드에는
    없다. 그리고 빈 글자로 오면 굽는 쪽이 로고 자리를 **아예 뺀다**
    (`analyze/로고넣기`). 안 빼면 완성 카드에 점선 네모와 물음표가 박힌다.
    """
    주소 = "https://cardnews-render-554608989606.s3.ap-northeast-2.amazonaws.com/photos/ab.png"
    걸린것 = _깔기(monkeypatch)
    app.만들기걸기({}, {"주제": "강남 카페", "로고": 주소})
    assert 걸린것[0][0]["로고"] == 주소


def test_로고를_안_보내면_빈_글자다(monkeypatch):
    """「로고 없이」를 고른 길. 빈 글자가 «자리를 빼라» 는 뜻이다."""
    걸린것 = _깔기(monkeypatch)
    app.만들기걸기({}, {"주제": "강남 카페"})
    assert 걸린것[0][0]["로고"] == ""

def test_사진을_안_보내면_빈_글자다(monkeypatch):
    """빈 글자는 「비움」과 같이 다뤄진다 — 여태 해 오던 것이다.
    여기서 기본값을 박지 않는 까닭은 언어와 같다."""
    걸린것 = _깔기(monkeypatch)
    app.만들기걸기({}, {"주제": "강남 카페"})
    assert 걸린것[0][0]["사진"] == ""


def test_주제가_없으면_400이고_일을_안_건다(monkeypatch):
    걸린것 = _깔기(monkeypatch)
    답 = app.만들기걸기({}, {"언어": "영어"})
    assert 답["statusCode"] == 400
    assert 걸린것 == [], "주제도 없이 일을 걸었다"


# ── 웹 문은 «어디까지 왔는지» 한 줄을 같이 준다 (사람 지시 2026-09-20) ──
#
# 「기다리는 표시 예를들어 얼마나 되고있는지 퍼센트를 나타내주는거」
#
# **`rita.폴링봉투` 는 못 건드린다.** 그건 RITA 규격 문(`/jobs/{번호}`)이 쓰는
# 것이고, 머리에 「status 와 progress 말고 아무것도 담지 않는다」고 빨갛게
# 적혀 있다 — 칸을 더하면 `invalid_envelope` 로 거부된다(§7.2).
#
# 그래서 **웹 문에서만** 얹는다. 두 문이 같은 함수를 쓰지만 답이 갈린다.


def test_웹_문은_단계_이름을_같이_준다(monkeypatch):
    monkeypatch.setattr(app, "일읽기",
                        lambda 번호: {"status": "running", "progress": 30,
                                    "말": "대본을 쓴다"})
    답 = app.만들기물어보기("job_" + "a" * 43)
    몸 = json.loads(답["body"])
    assert 몸["progress"] == 30
    assert 몸.get("말") == "대본을 쓴다", f"단계 이름이 안 왔다: {몸}"


def test_RITA_문은_단계_이름을_안_준다(monkeypatch):
    # 규격 밖 칸이 섞이면 저쪽이 봉투를 통째로 거부한다.
    import rita
    봉투 = rita.폴링봉투({"status": "running", "progress": 30, "말": "대본을 쓴다"})
    assert "말" not in 봉투, f"규격 문에 규격 밖 칸이 샜다: {봉투}"
    assert set(봉투) == {"status", "progress"}


def test_말이_없으면_칸_자체가_없다(monkeypatch):
    # 빈 글자를 보내면 화면이 「빈 줄」을 그린다 — 없는 것과 있는데 빈 것은 다르다.
    monkeypatch.setattr(app, "일읽기",
                        lambda 번호: {"status": "running", "progress": 5})
    몸 = json.loads(app.만들기물어보기("job_" + "a" * 43)["body"])
    assert "말" not in 몸, f"빈 말이 실렸다: {몸}"
