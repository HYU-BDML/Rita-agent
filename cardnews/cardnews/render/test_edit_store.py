# -*- coding: utf-8 -*-
"""판 쌓기와 설계도 검사 — 창고를 dict 로 갈아 끼워 S3 없이 시험한다."""
import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import edit_store as es   # noqa: E402


class 가짜창고:
    def __init__(self):
        self.칸 = {}

    def 읽기(self, key):
        return self.칸.get(key)

    def 쓰기(self, key, data, ctype):
        self.칸[key] = data


def _카드(align="왼쪽"):
    return {"index": 1, "역할": "훅",
            "배경": {"종류": "단색", "hex": "#F1FFE5"},
            "장식영역": [{"종류": "사진", "box": [10, 10, 100, 100]}],
            "글자영역": [{"종류": "글자", "box": [10, 200, 500, 300], "pt": 40,
                       "weight": "Bold", "align": align, "font": "프리텐다드",
                       "글자색": "#000000", "줄종류": "한줄", "lines": ["가나다"]}]}


# ── 설계도 검사 ────────────────────────────────────────────────

def test_멀쩡한_설계도는_탈이_없다():
    assert es.설계도_탈([_카드()]) == []


def test_목록이_아니거나_비면_잡는다():
    assert es.설계도_탈([]) != []
    assert es.설계도_탈("글자") != []


def test_네모가_넷이_아니면_잡는다():
    c = _카드()
    c["글자영역"][0]["box"] = [10, 200, 500]
    assert any("네모" in t for t in es.설계도_탈([c]))


def test_뒤집힌_네모를_잡는다():
    c = _카드()
    c["글자영역"][0]["box"] = [500, 200, 10, 300]
    assert any("뒤집" in t for t in es.설계도_탈([c]))


def test_색이_RRGGBB_가_아니면_잡는다():
    c = _카드()
    c["글자영역"][0]["글자색"] = "red"
    assert any("색" in t for t in es.설계도_탈([c]))


def test_모르는_정렬은_잡는다():
    assert any("정렬" in t for t in es.설계도_탈([_카드(align="비스듬히")]))


def test_오른쪽_정렬은_통과한다():
    assert es.설계도_탈([_카드(align="오른쪽")]) == []


def test_글자_크기가_0_이하면_잡는다():
    c = _카드()
    c["글자영역"][0]["pt"] = 0
    assert any("크기" in t for t in es.설계도_탈([c]))


# ── 글줄 검사 (2026-09-28) ─────────────────────────────────────
#
# 글자 효과는 글자에 붙는다. 옛 모양은 검사 «안» 에서 글줄로 바꿔 본다 —
# 그래서 없는 줄을 가리키던 옛 효과는 막지 않고 버려진다(동료가 저장 못 한 카드).

def _글줄카드(글줄, **더):
    c = _카드()
    칸 = {k: v for k, v in c["글자영역"][0].items() if k != "lines"}
    c["글자영역"][0] = {**칸, "글줄": 글줄, **더}
    return c


def _한줄(*덩어리들, **줄칸):
    return [{"새문장": True, "덩어리": list(덩어리들), **줄칸}]


def test_글줄_새_모양은_통과한다():
    assert es.설계도_탈([_글줄카드(_한줄({"글": "이건 "}, {"글": "완벽히", "색": "#FF0000", "굵게": True},
                                     {"글": "!", "형광펜": True, "밑줄": True}))]) == []


def test_덩어리에_숫자_위치_칸이_있으면_잡는다():
    for 칸 in ("줄번호", "시작", "끝", "몇번째", "글자수"):
        탈 = es.설계도_탈([_글줄카드(_한줄({"글": "가", 칸: 1}))])
        assert 탈 and "모르는 칸" in 탈[0] and 칸 in 탈[0], (칸, 탈)


def test_줄에_숫자_위치_칸이_있으면_잡는다():
    탈 = es.설계도_탈([_글줄카드([{"새문장": True, "덩어리": [{"글": "가"}], "줄번호": 1}])])
    assert 탈 and "모르는 칸" in 탈[0] and "줄번호" in 탈[0], 탈


def test_덩어리_글이_비거나_줄바꿈이_있으면_잡는다():
    assert any("비었다" in t for t in es.설계도_탈([_글줄카드(_한줄({"글": ""}))]))
    assert any("줄바꿈" in t for t in es.설계도_탈([_글줄카드(_한줄({"글": "가\n나"}))]))


def test_효과_값의_꼴을_본다():
    assert any("색" in t for t in es.설계도_탈([_글줄카드(_한줄({"글": "가", "색": "빨강"}))]))
    assert any("형광펜" in t for t in es.설계도_탈([_글줄카드(_한줄({"글": "가", "형광펜": "노랑"}))]))
    assert any("굵게" in t for t in es.설계도_탈([_글줄카드(_한줄({"글": "가", "굵게": 1}))]))


def test_글머리와_정렬은_문장_첫_줄에만_아는_값으로():
    둘째에 = [{"새문장": True, "덩어리": [{"글": "가"}]},
            {"새문장": False, "덩어리": [{"글": "나"}], "글머리": "원"}]
    assert any("문장 첫 줄에만" in t for t in es.설계도_탈([_글줄카드(둘째에)]))
    assert any("글머리" in t for t in es.설계도_탈([_글줄카드(_한줄({"글": "가"}, 글머리="별"))]))
    assert any("정렬" in t for t in es.설계도_탈([_글줄카드(_한줄({"글": "가"}, 정렬="비스듬히"))]))


def test_첫_줄은_새_문장이어야_한다():
    탈 = es.설계도_탈([_글줄카드([{"새문장": False, "덩어리": [{"글": "가"}]}])])
    assert any("첫 줄" in t for t in 탈), 탈


def test_옛_모양은_바꿔서_본다():
    c = _카드()
    c["글자영역"][0]["굵기"] = [{"줄번호": 1, "시작": 0, "끝": 2}]
    assert es.설계도_탈([c]) == []


def test_없는_줄을_가리키던_옛_효과는_버려지고_통과한다():
    """동료 카드(2026-09-28) — 「1번 장 글자1 색구간2: 2 번 줄이 없다」로 막혔던 것."""
    c = _카드()
    c["글자영역"][0]["색구간"] = [{"줄번호": 2, "시작": 0, "끝": 4, "색": "#0000FF"}]
    assert es.설계도_탈([c]) == []


def test_글줄도_lines_도_없으면_잡는다():
    c = _카드()
    del c["글자영역"][0]["lines"]
    assert any("줄 목록이 없다" in t for t in es.설계도_탈([c]))


@pytest.mark.parametrize("lines", ["abc", None, "없음"], ids=["글자", "None", "칸없음"])
def test_줄_목록이_없으면_바꾸는_문을_지나도_잡는다(lines):
    """문마다 `카드들글줄로` 를 먼저 거친다. 여기서 `"abc"` 를 글자 하나씩의 줄로,
    없는 것을 빈 칸으로 만들면 「줄 목록이 없다」가 한 번도 안 뜬다(2026-09-29 검토)."""
    c = _카드()
    if lines == "없음":
        del c["글자영역"][0]["lines"]
    else:
        c["글자영역"][0]["lines"] = lines
    탈 = es.설계도_탈(es.카드들글줄로([c]))
    assert any("줄 목록이 없다" in t for t in 탈), 탈


def test_lines가_빈_목록이면_통과한다():
    """빈 글자 칸(틀 뼈대) — 옛 설계도에서 `lines: []` 는 통과했다."""
    c = _카드()
    c["글자영역"][0]["lines"] = []
    assert es.설계도_탈([c]) == []


def test_망가진_글줄은_터지지_않고_탈을_낸다():
    """`글줄글들`이 이 모양들에서 터지던 것(2026-09-29) — 탈만 내고 살아야 한다."""
    망가진것들 = [
        "abc", {"a": 1}, 5, ["x"],
        [{"새문장": True, "덩어리": 5}],
        [{"새문장": True, "덩어리": "ab"}],
        [{"새문장": True, "덩어리": ["x"]}],
    ]
    for 글줄 in 망가진것들:
        탈 = es.설계도_탈([_글줄카드(글줄)])
        assert 탈, 글줄


def test_각도가_없으면_통과한다():
    """옛 설계도에는 각도 칸이 없다."""
    assert es.설계도_탈([_카드()]) == []


def test_각도가_숫자가_아니면_잡는다():
    c = _카드()
    c["글자영역"][0]["각도"] = "비스듬히"
    assert any("각도" in t for t in es.설계도_탈([c]))


def test_각도가_한바퀴를_넘으면_잡는다():
    c = _카드()
    c["장식영역"][0]["각도"] = 400
    assert any("각도" in t for t in es.설계도_탈([c]))


def test_보통_각도는_통과한다():
    c = _카드()
    c["장식영역"][0]["각도"] = -12.5
    c["글자영역"][0]["각도"] = 30
    assert es.설계도_탈([c]) == []


# ── 판 쌓기 ────────────────────────────────────────────────────

def test_첫_판은_0이다():
    창고 = 가짜창고()
    assert es.다음판(창고, "abc") == 0


def test_판이_하나씩_늘어난다():
    창고 = 가짜창고()
    es.판저장(창고, "abc", 0, [_카드()], ["https://x/1.png"], "2026-08-25T00:00:00Z")
    assert es.다음판(창고, "abc") == 1
    es.판저장(창고, "abc", 1, [_카드()], ["https://x/2.png"], "2026-08-25T00:01:00Z")
    assert es.다음판(창고, "abc") == 2


def test_저장한_판을_그대로_읽는다():
    창고 = 가짜창고()
    카드들 = [_카드(align="오른쪽")]
    es.판저장(창고, "abc", 0, 카드들, ["https://x/1.png"], "2026-08-25T00:00:00Z")
    난것 = es.판읽기(창고, "abc", None)
    assert 난것["판"] == 0
    assert 난것["cards"] == 카드들
    assert 난것["판목록"][0]["판"] == 0


def test_판을_지정해_읽는다():
    창고 = 가짜창고()
    es.판저장(창고, "abc", 0, [_카드("왼쪽")], ["https://x/1.png"], "때1")
    es.판저장(창고, "abc", 1, [_카드("오른쪽")], ["https://x/2.png"], "때2")
    assert es.판읽기(창고, "abc", 1)["cards"][0]["글자영역"][0]["align"] == "오른쪽"
    assert es.판읽기(창고, "abc", 0)["cards"][0]["글자영역"][0]["align"] == "왼쪽"


def test_0판은_덮어쓰지_않는다():
    """처음으로 되돌아갈 길은 언제나 살아 있어야 한다."""
    창고 = 가짜창고()
    es.판저장(창고, "abc", 0, [_카드("왼쪽")], ["https://x/1.png"], "때1")
    with pytest.raises(ValueError):
        es.판저장(창고, "abc", 0, [_카드("오른쪽")], ["https://x/9.png"], "때2")


def test_없는_판을_읽으면_말해_준다():
    창고 = 가짜창고()
    with pytest.raises(KeyError):
        es.판읽기(창고, "없는거", None)


def test_목록이_깨져도_0판은_읽힌다():
    창고 = 가짜창고()
    es.판저장(창고, "abc", 0, [_카드()], ["https://x/1.png"], "때1")
    창고.칸[es.목록키("abc")] = "{{{ 망가진 글".encode("utf-8")
    assert es.판읽기(창고, "abc", 0)["cards"] is not None


# ── 라우트 ────────────────────────────────────────────────────

def _app(monkeypatch):
    """**이름으로 부르면 안 된다.** `analyze/app.py` 도 이름이 `app` 이라, 분석
    시험이 먼저 sys.path 를 건드리면 `import app` 이 그쪽 손잡이를 집어 온다 —
    따로 돌리면 통과하고 같이 돌리면 깨진다. `test_rita.py` 가 이미 같은 함정을
    밟고 자리로 부르게 고쳤는데(2026-08-27) 이 파일이 남아 있었다.
    """
    monkeypatch.setenv("BUCKET", "시험버킷")
    monkeypatch.setenv("AWS_REGION", "ap-northeast-2")
    import importlib.util
    자리 = importlib.util.spec_from_file_location(
        "작업대앱_editstore", Path(__file__).resolve().parent / "app.py")
    몸 = importlib.util.module_from_spec(자리)
    자리.loader.exec_module(몸)
    return 몸


def test_주소에서_edit_id_를_뽑는다(monkeypatch):
    app = _app(monkeypatch)
    assert app.edit_id_of("/edit/abc123") == "abc123"
    assert app.edit_id_of("/prod/edit/abc123") == "abc123"
    assert app.edit_id_of("/edit/") is None
    assert app.edit_id_of("/viewer") is None


def test_저장은_설계도가_탈나면_거절한다(monkeypatch):
    app = _app(monkeypatch)
    창고 = 가짜창고()
    monkeypatch.setattr(app, "_창고", lambda: 창고)
    뒤집힌 = _카드()
    뒤집힌["글자영역"][0]["box"] = [500, 200, 10, 300]
    난것 = app.edit_save("abc", {"cards": [뒤집힌]}, 굽기=lambda cards: ["https://x/1.png"],
                        때="때1")
    assert 난것["ok"] is False
    assert any("뒤집" in t for t in 난것["탈"])
    assert 창고.칸 == {}, "탈난 설계도는 판을 안 쌓아야 한다"


def test_저장하면_판이_쌓이고_굽는다(monkeypatch):
    app = _app(monkeypatch)
    창고 = 가짜창고()
    monkeypatch.setattr(app, "_창고", lambda: 창고)
    부른것 = []

    def 굽기(cards):
        부른것.append(cards)
        return ["https://x/1.png"]

    난것 = app.edit_save("abc", {"cards": [_카드()]}, 굽기=굽기, 때="때1")
    assert 난것["ok"] is True and 난것["판"] == 0
    assert 난것["slides"] == ["https://x/1.png"]
    assert len(부른것) == 1
    assert es.설계도키("abc", 0) in 창고.칸


# ── /workbench 가 작업대를 낸다 ───────────────────────────────────

def test_작업대를_내면_0판을_쌓는다(monkeypatch):
    app = _app(monkeypatch)
    창고 = 가짜창고()
    monkeypatch.setattr(app, "_창고", lambda: 창고)
    난것 = app.make_workbench({"slides": ["https://x/1.png"], "cards": [_카드()]})
    assert "url" in 난것
    키 = [k for k in 창고.칸 if k.startswith("edit/")]
    assert any(k.endswith("/0.json") for k in 키), 키


def test_설계도가_없으면_거절한다(monkeypatch):
    """보기 전용 뷰어는 저쪽 `/viewer` 다. 여기서 그 길까지 흉내 내면 두 벌이 생긴다.

    (갈라 나오기 전에는 `/viewer` 하나가 둘 다 했다 — 설계도가 오면 작업대,
    안 오면 보기 전용. 저쪽 파이프라인도 그 길을 써서 함께 갈 수가 없었다.)
    """
    app = _app(monkeypatch)
    창고 = 가짜창고()
    monkeypatch.setattr(app, "_창고", lambda: 창고)
    with pytest.raises(ValueError, match="cards"):
        app.make_workbench({"slides": ["https://x/1.png"]})
    assert not [k for k in 창고.칸 if k.startswith("edit/")]


# ── /template/{id} 가 판을 «틀» 로 뽑는다 ──────────────────────────

def test_틀로_저장하면_창고에_들어간다(monkeypatch):
    app = _app(monkeypatch)
    창고 = 가짜창고()
    monkeypatch.setattr(app, "_창고", lambda: 창고)
    es.판저장(창고, "abc", 0, [_카드()], ["https://x/1.png"], "때1")
    난것 = app.template_save("abc", {"판": 0, "이름": "8월 4주차 판"})
    assert 난것["ok"] is True
    assert 난것["url"].endswith(".json")
    assert any(k.startswith("templates/") for k in 창고.칸)
    assert 난것["틀"]["한계출처"] == "네모"


def test_없는_판을_틀로_저장하려_하면_말해_준다(monkeypatch):
    app = _app(monkeypatch)
    monkeypatch.setattr(app, "_창고", lambda: 가짜창고())
    난것 = app.template_save("abc", {"판": 7})
    assert 난것["ok"] is False


# ── GET /template/{id} — 틀을 그대로 준다 (Task 14) ────────────────

def test_틀_읽기_이름이_있으면_그_파일을_준다(monkeypatch):
    app = _app(monkeypatch)
    창고 = 가짜창고()
    창고.쓰기("templates/8월.json", json.dumps({"골격": ["훅"]}, ensure_ascii=False).encode("utf-8"),
             "application/json; charset=utf-8")
    monkeypatch.setattr(app, "_창고", lambda: 창고)
    난것 = app.template_load("8월")
    assert 난것["골격"] == ["훅"]


def test_틀_읽기_이름이_비면_기본을_준다(monkeypatch):
    app = _app(monkeypatch)
    창고 = 가짜창고()
    창고.쓰기("templates/기본.json", json.dumps({"골격": ["훅", "사례"]}, ensure_ascii=False).encode("utf-8"),
             "application/json; charset=utf-8")
    monkeypatch.setattr(app, "_창고", lambda: 창고)
    assert app.template_load("")["골격"] == ["훅", "사례"]
    assert app.template_load(None)["골격"] == ["훅", "사례"]


def test_틀_읽기_없는_이름은_말해_준다(monkeypatch):
    app = _app(monkeypatch)
    monkeypatch.setattr(app, "_창고", lambda: 가짜창고())
    with pytest.raises(KeyError):
        app.template_load("없는이름")


# ── POST /template/resolve — Dify 쪽에 갈래를 안 둔다 (Task 14) ────

def test_틀_풀기_주소가_비면_기본을_준다(monkeypatch):
    app = _app(monkeypatch)
    창고 = 가짜창고()
    창고.쓰기("templates/기본.json", json.dumps({"골격": ["훅"]}, ensure_ascii=False).encode("utf-8"),
             "application/json; charset=utf-8")
    monkeypatch.setattr(app, "_창고", lambda: 창고)
    assert app.template_resolve({})["골격"] == ["훅"]
    assert app.template_resolve({"url": ""})["골격"] == ["훅"]


def test_틀_풀기_기본도_없으면_말해_준다(monkeypatch):
    app = _app(monkeypatch)
    monkeypatch.setattr(app, "_창고", lambda: 가짜창고())
    with pytest.raises(ValueError):
        app.template_resolve({})


def test_틀_풀기_주소가_있으면_거기서_받아온다(monkeypatch, tmp_path):
    app = _app(monkeypatch)
    monkeypatch.setattr(app, "_창고", lambda: 가짜창고())
    파일 = tmp_path / "바깥틀.json"
    파일.write_text(json.dumps({"골격": ["훅", "CTA"]}, ensure_ascii=False), encoding="utf-8")
    받은주소 = []

    def 가짜_fetch(url):
        받은주소.append(url)
        return 파일

    monkeypatch.setattr(app, "_fetch", 가짜_fetch)
    난것 = app.template_resolve({"url": "https://x/바깥틀.json"})
    assert 난것["골격"] == ["훅", "CTA"]
    assert 받은주소 == ["https://x/바깥틀.json"]


def test_옛_작업대가_보낸_어긋난_설계도도_저장된다(monkeypatch):
    """배포 전에 열어 둔 옛 작업대(옛 코드)가 옛 모양으로 보낸다 — 동료 카드처럼
    없는 줄을 가리키는 색이 있어도, 서버가 바꿔 받아 그것만 버리고 저장한다."""
    app = _app(monkeypatch)
    창고 = 가짜창고()
    monkeypatch.setattr(app, "_창고", lambda: 창고)
    c = _카드()
    c["글자영역"][0]["색구간"] = [{"줄번호": 1, "시작": 0, "끝": 1, "색": "#FF0000"},
                               {"줄번호": 2, "시작": 0, "끝": 4, "색": "#0000FF"}]
    구운것 = []
    난것 = app.edit_save("abc", {"cards": [c]}, 굽기=lambda cards: 구운것.append(cards) or ["https://x/1.png"],
                        때="때1")
    assert 난것["ok"] is True, 난것
    쌓인것 = json.loads(창고.칸[es.설계도키("abc", 0)].decode("utf-8"))
    칸 = 쌓인것[0]["글자영역"][0]
    assert "색구간" not in 칸
    assert 칸["글줄"][0]["덩어리"][0] == {"글": "가", "색": "#FF0000"}
    assert "글줄" in 구운것[0][0]["글자영역"][0], "굽는 쪽에도 바꾼 것을 넘긴다"


def test_옛_작업대가_lines_만_고쳐_보내도_고친_글이_저장된다(monkeypatch):
    """판을 갈아 끼운 옛 작업대(2026-09-29 검토)는 새 서버가 준 `글줄` 을 그대로 들고
    `lines` 만 고쳐 보낸다. 낡은 `글줄` 을 따르면 고친 글이 소리 없이 사라졌다."""
    app = _app(monkeypatch)
    창고 = 가짜창고()
    monkeypatch.setattr(app, "_창고", lambda: 창고)
    c = _카드()
    c["글자영역"][0]["글줄"] = [{"새문장": True, "덩어리": [{"글": "가나다", "색": "#FF0000"}]}]
    c["글자영역"][0]["lines"] = ["가나다 라마"]
    c["글자영역"][0]["굵기"] = [{"줄번호": 1, "시작": 4, "끝": 6}]
    난것 = app.edit_save("abc", {"cards": [c]}, 굽기=lambda cards: ["https://x/1.png"], 때="때1")
    assert 난것["ok"] is True, 난것
    칸 = json.loads(창고.칸[es.설계도키("abc", 0)].decode("utf-8"))[0]["글자영역"][0]
    assert 칸["lines"] == ["가나다 라마"]
    assert 칸["글줄"] == [{"새문장": True, "덩어리": [{"글": "가나다 "}, {"글": "라마", "굵게": True}]}]
    assert "굵기" not in 칸


def test_줄_목록이_글자면_저장을_거절한다(monkeypatch):
    app = _app(monkeypatch)
    창고 = 가짜창고()
    monkeypatch.setattr(app, "_창고", lambda: 창고)
    c = _카드()
    c["글자영역"][0]["lines"] = "abc"
    난것 = app.edit_save("abc", {"cards": [c]}, 굽기=lambda cards: ["https://x/1.png"], 때="때1")
    assert 난것["ok"] is False and any("줄 목록이 없다" in t for t in 난것["탈"]), 난것
    assert 창고.칸 == {}


def test_열면_글줄_모양으로_준다(monkeypatch):
    app = _app(monkeypatch)
    창고 = 가짜창고()
    monkeypatch.setattr(app, "_창고", lambda: 창고)
    옛카드 = _카드()
    옛카드["글자영역"][0]["굵기"] = [{"줄번호": 1, "시작": 0, "끝": 1}]
    es.판저장(창고, "abc", 0, [옛카드], ["https://x/1.png"], "때")
    난것 = app.edit_load("abc")
    칸 = 난것["cards"][0]["글자영역"][0]
    assert 칸["글줄"] == [{"새문장": True, "덩어리": [{"글": "가", "굵게": True}, {"글": "나다"}]}]
    assert "굵기" not in 칸


def test_작업대를_낼_때도_글줄로_쌓는다(monkeypatch):
    app = _app(monkeypatch)
    창고 = 가짜창고()
    monkeypatch.setattr(app, "_창고", lambda: 창고)
    옛카드 = _카드()
    옛카드["글자영역"][0]["굵기"] = [{"줄번호": 1, "시작": 0, "끝": 1}]
    app.make_workbench({"slides": ["https://x/1.png"], "cards": [옛카드]})
    [키] = [k for k in 창고.칸 if k.endswith("/0.json")]
    칸 = json.loads(창고.칸[키].decode("utf-8"))[0]["글자영역"][0]
    assert "글줄" in 칸 and "굵기" not in 칸
    [쪽키] = [k for k in 창고.칸 if k.startswith("viewer/")]
    assert "\"글줄\"" in 창고.칸[쪽키].decode("utf-8"), "작업대 쪽에 글줄이 박혀야 한다"


def test_강조색은_덩어리_형광펜에서_유추한다():
    import workbench
    카드 = {"글자영역": [{"글줄": [{"새문장": True, "덩어리": [{"글": "가", "형광펜": "#123456"}]}]}]}
    assert workbench._강조색유추([카드]) == "#123456"
    assert workbench._강조색유추([]) == "#C9FC95"


# ── 사진 배경 ─────────────────────────────────────────────────────
#
# 「구울 수는 있는데 열 수는 없는」 카드를 막는다. 굽는 쪽은 사진 배경을 받는데
# 이 관문이 안 받아서, 배경이 사진인 틀로 만든 카드가 작업대에서 500 이 났다
# (2026-08-27, DNUFIa4NIkK).

def _사진배경장(배경):
    return {"index": 1, "역할": "훅", "배경": 배경, "장식영역": [], "글자영역": []}


def test_사진_배경을_받는다():
    assert es.설계도_탈([_사진배경장({"종류": "사진", "hex": "#101010"})]) == []


def test_바닥색이_없어도_된다():
    """어떤 사진인지는 hex 로 못 적는다. 바닥색은 곁다리다."""
    assert es.설계도_탈([_사진배경장({"종류": "사진"})]) == []


def test_미측정도_받는다():
    assert es.설계도_탈([_사진배경장({"종류": "미측정"})]) == []


def test_바닥색_꼴이_틀리면_잡는다():
    탈 = es.설계도_탈([_사진배경장({"종류": "사진", "hex": "빨강"})])
    assert 탈 and "바닥색" in 탈[0]


def test_모르는_종류는_그대로_막는다():
    탈 = es.설계도_탈([_사진배경장({"종류": "무지개"})])
    assert 탈 and "모른다" in 탈[0]


# ── 영상 자리 (사람 결정 2026-09-16) ────────────────────────────────

def _장(장식들):
    return {"배경": {"종류": "단색", "hex": "#FFFFFF"}, "장식영역": 장식들, "글자영역": []}


def _영상(url="https://cardnews-render-554608989606.s3.ap-northeast-2.amazonaws.com/photos/a.mp4", **더):
    return {"종류": "사진", "box": [0, 0, 100, 100], "media_url": url, **더}


def test_영상_하나는_통과():
    assert es.설계도_탈([_장([_영상()])]) == []


def test_한_장에_영상_둘은_탈():
    탈 = es.설계도_탈([_장([_영상(), _영상()])])
    assert 탈 == ["1번 장에 영상이 둘이다 — 한 장에 하나"]


def test_창고_밖_영상_주소는_탈():
    탈 = es.설계도_탈([_장([_영상("https://evil.example.com/x.mp4")])])
    assert 탈 == ["1번 장 장식1: 영상 주소가 우리 창고가 아니다"]


def test_다른_통의_mp4_는_접두를_주면_탈():
    """꼴만 보면 남의 S3 통도 통과한다 — 우리 통 주소로 시작하는지 같이 본다."""
    탈 = es.설계도_탈([_장([_영상("https://attacker.s3.ap-northeast-2.amazonaws.com/photos/x.mp4")])],
                  영상접두="https://cardnews-render-554608989606.s3.ap-northeast-2.amazonaws.com/photos/")
    assert 탈 == ["1번 장 장식1: 영상 주소가 우리 창고가 아니다"]


def test_접두를_안_주면_예전처럼_꼴만_본다():
    assert es.설계도_탈([_장([_영상("https://attacker.s3.ap-northeast-2.amazonaws.com/photos/x.mp4")])]) == []


def test_영상_자리는_못_돌린다():
    탈 = es.설계도_탈([_장([_영상(각도=15)])])
    assert 탈 == ["1번 장 장식1: 영상 자리는 못 돌린다 — 각도 15"]


def test_사진은_예전_그대로():
    assert es.설계도_탈([_장([{"종류": "사진", "box": [0, 0, 100, 100],
                             "media_url": "https://evil.example.com/x.jpg", "각도": 15}])]) == []


def test_영상_자리_각도가_글자여도_터지지_않는다():
    탈 = es.설계도_탈([_장([_영상(각도="abc")])])
    assert any("각도" in x for x in 탈)


# ── 전체 사진 음영 ────────────────────────────────────────────

def _음영카드(**더):
    """장 전체를 덮는 사진 칸 하나짜리 카드."""
    c = _카드()
    c["배경"] = {"종류": "사진", "hex": "#615244"}
    c["장식영역"] = [{"종류": "사진", "box": [0, 0, 1080, 1350], "배경자리": True, **더}]
    return c


def test_음영_값이_없어도_통과한다():
    """**옛 설계도가 안 막혀야 한다** — 값이 없으면 굽는 쪽이 기본값을 쓴다."""
    assert es.설계도_탈([_음영카드()]) == []


def test_멀쩡한_음영_값은_통과한다():
    assert es.설계도_탈([_음영카드(음영색="#0A1B2C", 음영진하기=40)]) == []


def test_음영색이_색꼴이_아니면_잡는다():
    탈 = es.설계도_탈([_음영카드(음영색="검정")])
    assert 탈 and "음영색" in 탈[0], 탈


def test_음영진하기가_범위_밖이면_잡는다():
    assert es.설계도_탈([_음영카드(음영진하기=140)]), "100 을 넘으면 잡아야 한다"
    assert es.설계도_탈([_음영카드(음영진하기=-1)]), "0 아래면 잡아야 한다"


def test_음영진하기가_숫자가_아니면_잡는다():
    탈 = es.설계도_탈([_음영카드(음영진하기="진하게")])
    assert 탈 and "음영진하기" in 탈[0], 탈


# ── 사진 바깥 그림자 ──────────────────────────────────────────

def _그림자카드(**더):
    c = _카드()
    c["장식영역"] = [{"종류": "사진", "box": [300, 400, 700, 700], **더}]
    return c


def test_그림자_값이_없어도_통과한다():
    assert es.설계도_탈([_그림자카드()]) == []


def test_멀쩡한_그림자_값은_통과한다():
    assert es.설계도_탈([_그림자카드(그림자색="#101010", 그림자진하기=35)]) == []


def test_그림자색이_색꼴이_아니면_잡는다():
    탈 = es.설계도_탈([_그림자카드(그림자색="rgba(0,0,0,.3)")])
    assert 탈 and "그림자색" in 탈[0], 탈


def test_그림자진하기가_범위_밖이면_잡는다():
    assert es.설계도_탈([_그림자카드(그림자진하기=101)])
    assert es.설계도_탈([_그림자카드(그림자진하기=-5)])


def test_그림자진하기가_숫자가_아니면_잡는다():
    탈 = es.설계도_탈([_그림자카드(그림자진하기="조금")])
    assert 탈 and "그림자진하기" in 탈[0], 탈


def _선장(장식추가=None, 글자추가=None):
    return {"index": 1, "역할": "훅", "배경": {"종류": "단색", "hex": "#FFFFFF"},
            "장식영역": [{"종류": "사진", "box": [0, 0, 10, 10], **(장식추가 or {})}],
            "글자영역": [{"종류": "글자", "box": [0, 0, 10, 10], "pt": 10,
                      "글자색": "#000000", "align": "가운데", "lines": ["가"],
                      **(글자추가 or {})}]}


def test_테두리_값이_없으면_통과한다():
    """옛 설계도에는 `선색`·`선굵기` 가 없다 — 여기서 막으면 여태 만든 카드를
    못 연다."""
    assert es.설계도_탈([_선장()]) == []


def test_테두리_값이_성하면_통과한다():
    assert es.설계도_탈([_선장({"선색": "#1971C2", "선굵기": 8},
                        {"선색": "#000000", "선굵기": 0})]) == []


@pytest.mark.parametrize("나쁜값, 말", [
    ({"선색": "파랑"}, "선색이 #RRGGBB 가 아니다"),
    ({"선굵기": "8"}, "선굵기가 숫자가 아니다"),
    ({"선굵기": -1}, "선굵기는 0~"),
    ({"선굵기": es.선굵기상한 + 1}, "선굵기는 0~"),
])
def test_탈난_테두리_값은_잡는다(나쁜값, 말):
    탈 = es.설계도_탈([_선장(나쁜값)])
    assert any(말 in t for t in 탈), 탈
    # 글자칸도 같은 잣대다 — 한쪽만 보면 갈린다.
    탈2 = es.설계도_탈([_선장(None, 나쁜값)])
    assert any(말 in t for t in 탈2), 탈2
