# -*- coding: utf-8 -*-
"""**다시 분석해도 사람이 붙인 이름은 안 사라진다.**

이름을 안 적고 다시 걸면 `틀_쓰기` 가 코드를 이름으로 삼는다 — 「파란 타임라인」이
조용히 「DSW-6lrk5rs」로 돌아갔다(실물 2026-08-31). 코드를 고칠 때마다 다시 분석
하게 됐으니, 그때마다 별명이 날아가면 안 된다.
"""
import os
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))
os.environ.setdefault("BUCKET", "시험통")

import lambda_분석 as L  # noqa: E402


class _가짜창고:
    def __init__(self, 몸통):
        self.몸통 = 몸통

    def get_object(self, Bucket, Key):  # noqa: N803 — boto3 이름 그대로
        if self.몸통 is None:
            raise KeyError(Key)
        return {"Body": _바이트(self.몸통)}


class _바이트:
    def __init__(self, s):
        self.s = s

    def read(self):
        return self.s.encode("utf-8")


@pytest.fixture
def 창고갈이(monkeypatch):
    def 놓기(몸통):
        monkeypatch.setattr(L, "_창고", lambda: _가짜창고(몸통))
    return 놓기


def test_창고에_있던_이름을_읽는다(창고갈이):
    창고갈이('{"이름": "파란 타임라인", "슬라이드": []}')
    assert L._옛이름("DSW-6lrk5rs") == "파란 타임라인"


def test_틀이_없으면_빈_글자다(창고갈이):
    창고갈이(None)
    assert L._옛이름("없는코드") == ""


def test_망가진_틀에도_안_죽는다(창고갈이):
    """이름 하나 때문에 분석 전체가 죽으면 안 된다."""
    창고갈이("{이건 json 이 아니다")
    assert L._옛이름("DSW-6lrk5rs") == ""


def test_이름을_적었으면_그것이_이긴다():
    """사람이 새 이름을 주면 옛 이름은 안 본다 — `한판` 이 `이름 or _옛이름` 이다."""
    import io as _io
    글 = _io.open(HERE / "lambda_분석.py", encoding="utf-8").read()
    assert "이름 or _옛이름(pid)" in 글


def test_말투_이름도_같은_값에서_나온다():
    """틀 이름과 말투 이름이 갈리면 「파란 타임라인」 틀에 「DSW-6lrk5rs」 말투가
    붙어, 사람이 방금 붙인 이름으로 말투를 고르면 «그런 말투가 없다» 가 난다."""
    import io as _io
    글 = _io.open(HERE / "lambda_분석.py", encoding="utf-8").read()
    정한자리 = 글.index("이름 = 이름 or _옛이름(pid)")
    말투자리 = 글.index("말투낸것 = _말투올리기(pid, 잰것, 이름)")
    assert 정한자리 < 말투자리, "말투가 옛 이름을 못 받는다"


# ── 공용인지 개인인지도 안 덮는다 ──────────────────────────────────
#
# **실물 2026-09-19.** 「아이돌 브랜딩」은 수집기에서 만든 **공용** 틀인데,
# 코드를 고치고 다시 분석했더니 **개인**으로 떨어졌다. 재분석은 `개인` 을 안
# 실어 보내고 받는 쪽 기본값이 「개인」이라서다.
#
# 그러면 오른쪽 화면에는 그대로 보이는데 모델에게 주는 목록에서는 빠진다 —
# **보이는데 고를 수 없는** 상태가 된다. 서른다섯 명이 그 카드를 눌러도
# 「그 템플릿은 목록에 없어요」만 듣는다.
#
# 이름을 안 덮는 것과 같은 까닭이다(위 참고). 다시 분석하는 일은 잦은데,
# 그때마다 사람이 정한 것이 조용히 되돌아가면 안 된다.

def test_창고에_공용이라고_적혀_있으면_공용으로_읽는다(창고갈이):
    창고갈이('{"이름": "아이돌 브랜딩", "개인": false, "슬라이드": []}')
    assert L._옛개인("DG0AA6PJ8s4") is False


def test_창고에_개인이라고_적혀_있으면_개인으로_읽는다(창고갈이):
    창고갈이('{"이름": "내 것", "개인": true, "슬라이드": []}')
    assert L._옛개인("AAA") is True


def test_처음_만드는_틀은_모른다고_한다(창고갈이):
    """창고에 없으면 `None` — 부르는 쪽이 받은 값을 그대로 쓴다."""
    창고갈이(None)
    assert L._옛개인("없는코드") is None


def test_개인_칸이_없는_옛_틀은_공용으로_본다(창고갈이):
    """창고의 열 벌에는 이 칸이 없다. 그것들은 사장님이 만든 공용이다."""
    창고갈이('{"이름": "옛것", "슬라이드": []}')
    assert L._옛개인("OLD") is False


def test_망가진_틀에도_안_죽는다_개인(창고갈이):
    창고갈이("{이건 json 이 아니다")
    assert L._옛개인("DSW-6lrk5rs") is None


def test_이미_있던_틀이면_넘겨받은_값보다_창고_값이_이긴다(창고갈이, monkeypatch):
    """**이게 알맹이다.** 재분석은 `개인` 을 안 실어 보내 기본값 True 로 들어온다.
    그래도 창고가 「공용」이라 적혀 있으면 공용으로 남아야 한다."""
    창고갈이('{"이름": "아이돌 브랜딩", "개인": false, "슬라이드": []}')
    받은것 = {}

    def _가짜틀쓰기(pid, 자리, 이름, 미리보기="", 한판="", 개인=True):
        받은것["개인"] = 개인
        return {"코드": pid, "이름": 이름, "개인": 개인}

    import make_dsl_cardnews as 틀만들기
    monkeypatch.setattr(틀만들기, "틀_쓰기", _가짜틀쓰기)
    # `한판` 을 통째로 돌리지 않고 고르는 대목만 따로 확인한다 — 계량은 무겁다.
    옛것 = L._옛개인("DG0AA6PJ8s4")
    넘겨받은값 = True
    assert (넘겨받은값 if 옛것 is None else 옛것) is False, "창고 값이 져 버렸다"


def test_처음_만드는_틀이면_넘겨받은_값을_쓴다(창고갈이):
    """창고에 없으면 부르는 쪽이 정한다 — 수집기는 공용, 채팅은 개인."""
    창고갈이(None)
    옛것 = L._옛개인("처음것")
    assert 옛것 is None
    for 넘겨받은값 in (True, False):
        assert (넘겨받은값 if 옛것 is None else 옛것) is 넘겨받은값


# ── 명단 다시 짓기 (동시 분석) ──────────────────────────────────

def test_목록건너뛰기를_켜면_명단을_안_건드린다():
    """여럿을 동시에 걸 때 명단을 각자 쓰면 나중에 쓴 쪽이 앞선 쪽 줄을 지운다
    — 「읽고 → 내 줄 얹고 → 통째로 쓰기」라서다(2026-09-19)."""
    import io as _io
    글 = _io.open(HERE / "lambda_분석.py", encoding="utf-8").read()
    한판몸 = 글[글.index("def 한판("):]          # `명단다시짓기` 에도 같은 줄이 있다
    켠자리 = 한판몸.index("if 목록건너뛰기:")
    쓰는자리 = 한판몸.index('_올리기("templates/목록.json"')
    assert 켠자리 < 쓰는자리, "명단을 쓰기 «전에» 빠져나가야 한다"


def test_명단다시짓기는_창고의_틀들로_짓는다(monkeypatch):
    """명단은 틀 파일들에서 다시 만들 수 있다 — 따로 지킬 이유가 없다."""
    쓴것 = {}

    class _창고:
        def list_objects_v2(self, Bucket, Prefix):  # noqa: N803
            return {"Contents": [
                {"Key": "templates/가.json"}, {"Key": "templates/나.json"},
                {"Key": "templates/목록.json"}, {"Key": "templates/기본.json"},
                # 작업대에서 손으로 고쳐 저장한 틀 — 명단에 안 올린다(2026-09-19)
                {"Key": "templates/" + "a" * 32 + "-1.json"},
                {"Key": "templates/previews/가.png"},          # 아래 칸은 안 본다
            ]}

        def get_object(self, Bucket, Key):  # noqa: N803
            코드 = Key.rsplit("/", 1)[-1][:-5]
            몸 = ('{"코드": "%s", "이름": "이름-%s", "슬라이드": [{"역할": "훅"}]}' % (코드, 코드))
            return {"Body": _바이트(몸)}

        def put_object(self, Bucket, Key, Body, **k):  # noqa: N803
            쓴것[Key] = Body.decode("utf-8") if isinstance(Body, bytes) else Body

    monkeypatch.setattr(L, "_창고", lambda: _창고())
    monkeypatch.setattr(L, "_옷장과_yml", lambda 목록: {})
    난것 = L.명단다시짓기()
    assert 난것["개수"] == 2, 난것
    import json as _json
    줄들 = _json.loads(쓴것["templates/목록.json"])
    assert [r["코드"] for r in 줄들] == ["가", "나"]
    assert [r["이름"] for r in 줄들] == ["이름-가", "이름-나"]
    assert "목록" not in [r["코드"] for r in 줄들], "명단·옷장 자신은 안 싣는다"
    assert not any(len(r["코드"]) > 20 for r in 줄들), "작업대에서 고친 틀은 안 싣는다"
