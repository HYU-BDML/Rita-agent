# -*- coding: utf-8 -*-
"""웹 문 둘 — `POST /draft`(초안까지만) · `POST /bake`(그 초안을 굽기).

사람 결정 2026-09-19: 「항상 거친다」. 만들기를 누르면 **굽기 전에** 장별 대본과
사진 계획을 보여 주고, 사람이 고친 뒤 「이대로 만들기」를 누른다.

**이 문이 봉투를 새로 짓는다** — `/make` 와 같은 자리다. 받은 것을 그대로 넘기지
않고 칸을 골라 담으므로, 화면이 새 칸을 보내기 시작해도 여기 안 더하면 조용히
버려진다(2026-09-18 의 「언어」). 그래서 여기서도 **칸을 통째로** 견준다.

**`/draft` 가 사진·로고를 안 받는 것이 못이다.** 받아서 넘기면 초안 짓는 자리가
돈 나가는 값을 들고 있게 된다 — 사람이 미리보기를 보는 사이에 바꿀 수 있는
값이라 굽는 문이 들고 와야 맞다.
"""
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
os.environ.setdefault("BUCKET", "시험통")

import pytest  # noqa: E402
import app  # noqa: E402
import rita  # noqa: E402

# **이 문들은 이제 잠겨 있다**(사람 결정 2026-09-22). 돈이 나가는 문이라 우리
# 워커만 두드린다 — 시험도 열쇠를 들고 두드려야 문 안쪽을 볼 수 있다.
# 자물쇠 자체는 `test_웹자물쇠.py` 가 따로 본다.
시험열쇠 = "시험용웹열쇠"


@pytest.fixture(autouse=True)
def _웹열쇠깔기(monkeypatch):
    monkeypatch.setenv(app.웹열쇠칸, 시험열쇠)


def _깔기(monkeypatch):
    걸린것 = []

    def 가짜(e, 시킴, 무엇):
        걸린것.append((시킴, 무엇))
        return app._reply(202, {"job_id": "x", "status": "queued"})

    monkeypatch.setattr(app, "_일걸기", 가짜)
    return 걸린것


def _밑그림(글="원래 글"):
    return {"카드": [{"역할": "표지", "글자영역": [{"글": 글}]}],
            "주제": "강남 카페", "틀": "기본", "장수": 1}


# ── /draft — 돈이 안 나가는 쪽 ──────────────────────────────────

def test_초안_봉투에_실리는_칸이_이것뿐이다(monkeypatch):
    """**사진·로고가 없는 것이 이 시험의 핵심이다.**"""
    걸린것 = _깔기(monkeypatch)
    app.초안걸기({}, {"주제": "강남 카페", "원고": "글", "틀": "기본",
                 "말투": "키키", "언어": "영어", "모르는칸": "버려짐"})
    시킴, 무엇 = 걸린것[0]
    assert 무엇 == "미리보기"
    # **말투 칸은 없다**(2026-09-24) — 틀을 고르면 그 틀의 말투로 간다.
    # 화면이 적어 보내도 여기서 버려진다.
    # 사진 계획 칸 셋(2026-09-29)은 늘 실린다 — 비면 빈 글자다.
    assert sorted(시킴) == sorted(["주제", "원고", "틀", "언어", "사진들",
                                  "사진쓰임", "바람", "화풍"])


def test_초안이_사진쓰임_바람_화풍을_싣는다(monkeypatch):
    """**여기서 버려지면 참조 판·화풍이 웹에서 통째로 안 돈다**(2026-09-29 발견)."""
    걸린것 = _깔기(monkeypatch)
    app.초안걸기({}, {"주제": "강남 카페", "사진쓰임": "참조",
                 "바람": "카페 탁자 위에", "화풍": "530"})
    시킴 = 걸린것[0][0]
    assert (시킴["사진쓰임"], 시킴["바람"], 시킴["화풍"]) == ("참조", "카페 탁자 위에", "530")


def test_초안의_사진계획_칸은_글자만_받는다(monkeypatch):
    걸린것 = _깔기(monkeypatch)
    app.초안걸기({}, {"주제": "강남 카페", "사진쓰임": ["참조"], "바람": 3, "화풍": None})
    시킴 = 걸린것[0][0]
    assert (시킴["사진쓰임"], 시킴["바람"], 시킴["화풍"]) == ("", "", "")


def test_초안도_고른_언어와_틀을_그대로_싣는다(monkeypatch):
    걸린것 = _깔기(monkeypatch)
    app.초안걸기({}, {"주제": "강남 카페", "언어": "영어", "틀": "키키"})
    assert 걸린것[0][0]["언어"] == "영어"
    assert 걸린것[0][0]["틀"] == "키키"


def test_초안은_사진을_보내도_안_싣는다(monkeypatch):
    """돈 나가는 값은 굽는 문이 들고 온다 — 여기로 새면 안 된다."""
    걸린것 = _깔기(monkeypatch)
    app.초안걸기({}, {"주제": "강남 카페", "사진": "만듦", "로고": "https://x/a.png"})
    assert "사진" not in 걸린것[0][0]
    assert "로고" not in 걸린것[0][0]


def test_초안도_주제가_없으면_400이고_일을_안_건다(monkeypatch):
    걸린것 = _깔기(monkeypatch)
    답 = app.초안걸기({}, {"언어": "영어"})
    assert 답["statusCode"] == 400
    assert 걸린것 == []


# ── /bake — 돈이 나가는 쪽 ─────────────────────────────────────

def test_굽기_봉투에_실리는_칸이_이것뿐이다(monkeypatch):
    걸린것 = _깔기(monkeypatch)
    app.굽기걸기({}, {"밑그림": _밑그림(), "사진": "만듦", "로고": "https://x/a.png",
                 "모르는칸": "버려짐"})
    시킴, 무엇 = 걸린것[0]
    assert 무엇 == "굽기"
    assert sorted(시킴) == sorted(["밑그림", "사진", "로고"])


def test_사람이_고친_글이_봉투에_그대로_실린다(monkeypatch):
    """**밑그림은 칸을 골라 담지 않는다** — 우리가 낸 것을 그대로 돌려받는다."""
    걸린것 = _깔기(monkeypatch)
    app.굽기걸기({}, {"밑그림": _밑그림("사람이 고친 글")})
    간것 = 걸린것[0][0]["밑그림"]["카드"][0]["글자영역"][0]["글"]
    assert 간것 == "사람이 고친 글"


def test_굽기에_사진과_로고를_안_보내면_빈_글자다(monkeypatch):
    """빈 글자가 「사진은 비움·로고 자리는 빼라」는 뜻이다 — `/make` 와 같다."""
    걸린것 = _깔기(monkeypatch)
    app.굽기걸기({}, {"밑그림": _밑그림()})
    assert 걸린것[0][0]["사진"] == ""
    assert 걸린것[0][0]["로고"] == ""


def test_밑그림이_없으면_400이고_한_장도_안_굽는다(monkeypatch):
    걸린것 = _깔기(monkeypatch)
    답 = app.굽기걸기({}, {"사진": "만듦"})
    assert 답["statusCode"] == 400
    assert 걸린것 == [], "초안도 없이 굽는 일을 걸었다 — 돈이 나간다"


def test_카드가_빈_목록이면_안_굽는다(monkeypatch):
    """초안은 왔는데 장이 하나도 없는 것. 구울 것이 없다."""
    걸린것 = _깔기(monkeypatch)
    답 = app.굽기걸기({}, {"밑그림": {"카드": [], "주제": "강남 카페"}})
    assert 답["statusCode"] == 400
    assert 걸린것 == []


def test_밑그림_안내는_다시_시도하라고_안_한다(monkeypatch):
    """초안이 없으면 열 번 걸어도 열 번 같다 — 할 일이 정반대로 안내된다."""
    _깔기(monkeypatch)
    말 = app.굽기걸기({}, {})["body"]
    assert "잠시 뒤" not in 말
    assert "미리보기" in 말


# ── 길 나누기 ──────────────────────────────────────────────────

def _부름(path, body):
    import json as _json
    return {"rawPath": path, "requestContext": {"http": {"method": "POST"}},
            "headers": {"Authorization": "Bearer " + 시험열쇠},
            "body": _json.dumps(body, ensure_ascii=False)}


def test_두_주소가_서로_안_잡힌다(monkeypatch):
    """`/bake` 가 `/make` 로 잡히면 **초안 없이 대본부터 다시 짓는다.**"""
    걸린것 = _깔기(monkeypatch)
    app.handler(_부름("/draft", {"주제": "강남 카페"}), None)
    app.handler(_부름("/bake", {"밑그림": _밑그림()}), None)
    app.handler(_부름("/make", {"주제": "강남 카페"}), None)
    assert [무엇 for _, 무엇 in 걸린것] == ["미리보기", "굽기", "카드뉴스"]


def test_두_문은_열쇠를_안_본다(monkeypatch):
    """`/make`·`/ingest` 와 같다 — 웹 암호 관문 뒤라 열쇠가 또 있을 까닭이 없다.

    열쇠를 보게 하면 워커까지 열쇠를 옮겨야 한다 — **열쇠가 한 군데 더 산다.**
    """
    걸린것 = _깔기(monkeypatch)
    monkeypatch.setenv(rita.열쇠칸, "진짜열쇠")
    답 = app.handler(_부름("/draft", {"주제": "강남 카페"}), None)
    assert 답["statusCode"] == 202
    assert 걸린것 != []


# ── 올린 사진 (사람 결정 2026-09-19) ──────────────────────────────
#
# **굽는 칸이 아니라 대본 칸이다.** 대본을 쓸 때 「이 장엔 이런 사진」을 알려
# 주려면 그때 이미 꽂혀 있어야 한다(설계: 자리가 대본보다 먼저).

def test_올린_사진을_초안_봉투에_싣는다(monkeypatch):
    걸린것 = _깔기(monkeypatch)
    app.초안걸기({}, {"주제": "강남 카페", "사진들": ["https://x/a.png", "https://x/b.png"]})
    assert 걸린것[0][0]["사진들"] == ["https://x/a.png", "https://x/b.png"]


def test_사진을_안_올리면_빈_목록이다(monkeypatch):
    걸린것 = _깔기(monkeypatch)
    app.초안걸기({}, {"주제": "강남 카페"})
    assert 걸린것[0][0]["사진들"] == []


def test_사진_자리에_글자_아닌_것이_오면_버린다(monkeypatch):
    """숫자나 사전이 섞이면 배치가 그 자리에서 죽는다 — 여기서 걸러 낸다."""
    걸린것 = _깔기(monkeypatch)
    app.초안걸기({}, {"주제": "강남 카페",
                 "사진들": ["https://x/a.png", 7, {"url": "x"}, "", "   ", None]})
    assert 걸린것[0][0]["사진들"] == ["https://x/a.png"]


def test_사진들이_목록이_아니면_빈_목록이다(monkeypatch):
    걸린것 = _깔기(monkeypatch)
    app.초안걸기({}, {"주제": "강남 카페", "사진들": "https://x/a.png"})
    assert 걸린것[0][0]["사진들"] == []


def test_사진이_너무_많으면_앞에서_자른다(monkeypatch):
    """막자는 것이 아니라 터지지 말자는 것이다 — 자리보다 많으면 어차피 안 쓰인다."""
    걸린것 = _깔기(monkeypatch)
    app.초안걸기({}, {"주제": "강남 카페", "사진들": [f"https://x/{i}.png" for i in range(50)]})
    assert len(걸린것[0][0]["사진들"]) == app._사진최대


def test_너무_긴_주소는_버린다(monkeypatch):
    걸린것 = _깔기(monkeypatch)
    긴것 = "https://x/" + "가" * app._주소최대
    app.초안걸기({}, {"주제": "강남 카페", "사진들": [긴것, "https://x/a.png"]})
    assert 걸린것[0][0]["사진들"] == ["https://x/a.png"]
