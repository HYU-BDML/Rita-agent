# -*- coding: utf-8 -*-
"""틀을 «별명» 으로 찾는 길. Dify 고르는 칸이 주소가 아니라 이름을 주기 때문이다."""
import json
import os
import importlib.util
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
os.environ.setdefault("BUCKET", "시험통")

import pytest  # noqa: E402

def _작업대앱():
    """`render/app.py` 를 **자리로** 불러온다.

    **이름으로 부르면 안 된다.** `analyze/app.py` 도 이름이 `app` 이라, 분석
    시험이 먼저 돌면 `import app` 이 그쪽 손잡이를 집어 온다 — 따로 돌리면
    통과하고 같이 돌리면 깨지는, 제일 헷갈리는 모양이 된다(2026-08-27).
    """
    자리 = importlib.util.spec_from_file_location("작업대앱", HERE / "app.py")
    몸 = importlib.util.module_from_spec(자리)
    자리.loader.exec_module(몸)
    return 몸


app = _작업대앱()


class _가짜창고:
    def __init__(self, 것들):
        self.것들 = 것들

    def 읽기(self, key):
        값 = self.것들.get(key)
        return json.dumps(값, ensure_ascii=False).encode("utf-8") if 값 is not None else None


class _쓴것:
    def __init__(self, 값):
        self.값 = 값

    def read_bytes(self):
        return json.dumps(self.값, ensure_ascii=False).encode("utf-8")


def _깔기(monkeypatch, 것들):
    monkeypatch.setattr(app, "_창고", lambda: _가짜창고(것들))


목록 = [{"코드": "AAA", "이름": "키키 밈체"}, {"코드": "BBB", "이름": "아기 파스텔"}]


def test_별명으로_찾는다(monkeypatch):
    _깔기(monkeypatch, {"templates/목록.json": 목록,
                      "templates/BBB.json": {"코드": "BBB", "슬라이드": []}})
    assert app.template_resolve({"이름": "아기 파스텔"})["코드"] == "BBB"


def test_게시물_코드로도_찾는다(monkeypatch):
    """사람이 별명을 안 붙이면 이름이 곧 코드다 — 둘 다 걸려야 한다."""
    _깔기(monkeypatch, {"templates/목록.json": 목록,
                      "templates/AAA.json": {"코드": "AAA", "슬라이드": []}})
    assert app.template_resolve({"이름": "AAA"})["코드"] == "AAA"


def test_기본이라고_적으면_기본_옷장(monkeypatch):
    """고르는 칸의 첫 줄이다. 목록을 뒤지면 «기본» 이라는 틀이 없어서 터진다."""
    _깔기(monkeypatch, {"templates/목록.json": 목록,
                      "templates/기본.json": {"코드": "기본", "슬라이드": []}})
    assert app.template_resolve({"이름": app.기본이름})["코드"] == "기본"


def test_아무것도_안_주면_기본(monkeypatch):
    _깔기(monkeypatch, {"templates/기본.json": {"코드": "기본"}})
    assert app.template_resolve({})["코드"] == "기본"


def test_주소가_이름을_이긴다(monkeypatch):
    """둘 다 오면 주소가 더 또렷한 지정이다."""
    _깔기(monkeypatch, {"templates/목록.json": 목록})
    monkeypatch.setattr(app, "_fetch", lambda 주소: _쓴것({"코드": "주소것"}))
    assert app.template_resolve({"url": "https://x/t.json", "이름": "키키 밈체"})["코드"] == "주소것"


def test_없는_이름이면_있는_것을_알려_준다(monkeypatch):
    """«그런 틀 없음» 만 던지면 사람은 무엇을 적어야 하는지 영영 모른다."""
    _깔기(monkeypatch, {"templates/목록.json": 목록})
    with pytest.raises(KeyError) as e:
        app.template_resolve({"이름": "없는것"})
    assert "키키 밈체" in str(e.value) and "아기 파스텔" in str(e.value)


def test_목록에만_있고_파일이_없으면_말해_준다(monkeypatch):
    _깔기(monkeypatch, {"templates/목록.json": 목록})
    with pytest.raises(KeyError) as e:
        app.template_resolve({"이름": "키키 밈체"})
    assert "템플릿 파일이 없다" in str(e.value)


# ── 굽기 답 풀기 ───────────────────────────────────────────────────

def test_주소_목록을_그대로_받는다():
    assert app._구운주소들(["https://x/1.png", "https://x/2.png"]) == \
        ["https://x/1.png", "https://x/2.png"]


def test_한_겹_감싸인_것을_푼다():
    """Dify 「뷰어」 노드가 굽기 답을 통째로 다시 감싼다."""
    assert app._구운주소들({"slides": ["https://x/1.png"]}) == ["https://x/1.png"]


def test_열쇠_이름이_주소로_잡히지_않는다():
    """예전에는 사전을 돌아 «slides» 라는 글자가 주소 자리에 들어갔다."""
    assert "slides" not in app._구운주소들({"slides": ["https://x/1.png"]})


def test_주소가_아닌_것은_버린다():
    assert app._구운주소들(["slides", "", "https://x/1.png"]) == ["https://x/1.png"]


def test_사전_안에_url_칸이_있어도_읽는다():
    assert app._구운주소들([{"url": "https://x/1.png"}]) == ["https://x/1.png"]


def test_엉뚱한_것이_와도_안_죽는다():
    assert app._구운주소들(None) == [] and app._구운주소들("글") == []
