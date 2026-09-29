# -*- coding: utf-8 -*-
"""만든 카드뉴스를 **다시 찾을 수 있나**, 그리고 틀 이름을 다시 안 재고 고칠 수 있나.

여태 만들 때마다 작업대 주소가 나오는데 그 창을 닫으면 끝이었다 — 틀은 목록이
있는데 결과물은 없었다(사람이 2026-08-27 물었다).
"""
import importlib.util
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
# 통 이름은 **진짜 S3 꼴**이어야 한다 — 설계도 검사가 «우리 통 주소로 시작하나» 를
# 보기 때문에 한글 이름(옛 «시험통»)으로는 어떤 영상 주소도 통과할 수 없다.
os.environ["BUCKET"] = "cardnews-render-554608989606"

import pytest  # noqa: E402


def _작업대앱():
    """`render/app.py` 를 **자리로** 불러온다 — `analyze/app.py` 와 이름이 같다."""
    자리 = importlib.util.spec_from_file_location("작업대앱2", HERE / "app.py")
    몸 = importlib.util.module_from_spec(자리)
    자리.loader.exec_module(몸)
    return 몸


app = _작업대앱()


class _가짜창고:
    def __init__(self, 것들=None):
        self.것들 = dict(것들 or {})

    def 읽기(self, key):
        값 = self.것들.get(key)
        return 값 if 값 is None else json.dumps(값, ensure_ascii=False).encode("utf-8")

    def 쓰기(self, key, data, ctype):
        글 = data.decode("utf-8")
        self.것들[key] = json.loads(글) if ctype.startswith("application/json") else 글


def _깔기(monkeypatch, 것들=None):
    창고 = _가짜창고(것들)
    monkeypatch.setattr(app, "_창고", lambda: 창고)
    return 창고


def _카드(글="첫 줄이다"):
    return [{"index": 1, "역할": "훅", "배경": {"종류": "단색", "hex": "#FFFFFF"},
             "장식영역": [], "글자영역": [{"box": [0, 0, 10, 10], "lines": [글]}]}]


# ── 만든 것 목록 ───────────────────────────────────────────────────

def test_만들면_목록에_쌓인다(monkeypatch):
    창고 = _깔기(monkeypatch)
    app.만든것얹기("abc", "https://x/판.html", ["https://x/1.png"], _카드())
    목록 = 창고.것들["만든것/목록.json"]
    assert len(목록) == 1
    assert 목록[0]["주소"] == "https://x/판.html"
    assert 목록[0]["표지"] == "https://x/1.png"


def test_제목은_첫_글줄에서_온다(monkeypatch):
    """목록에서 «무엇을 만든 것인지» 알아보게 하는 값이다."""
    창고 = _깔기(monkeypatch)
    app.만든것얹기("abc", "https://x/1", ["https://x/1.png"], _카드("강남 카페 트렌드"))
    assert 창고.것들["만든것/목록.json"][0]["제목"] == "강남 카페 트렌드"


def test_새것이_맨_앞이다(monkeypatch):
    창고 = _깔기(monkeypatch)
    app.만든것얹기("옛것", "https://x/1", [], _카드("먼저"))
    app.만든것얹기("새것", "https://x/2", [], _카드("나중"))
    assert [x["edit_id"] for x in 창고.것들["만든것/목록.json"]] == ["새것", "옛것"]


def test_같은_것을_두_번_안_쌓는다(monkeypatch):
    창고 = _깔기(monkeypatch)
    app.만든것얹기("abc", "https://x/1", [], _카드())
    app.만든것얹기("abc", "https://x/2", [], _카드())
    목록 = 창고.것들["만든것/목록.json"]
    assert len(목록) == 1 and 목록[0]["주소"] == "https://x/2"


def test_너무_길어지지_않는다(monkeypatch):
    창고 = _깔기(monkeypatch)
    for i in range(app.만든것최대 + 5):
        app.만든것얹기(f"id{i}", "https://x/1", [], _카드())
    assert len(창고.것들["만든것/목록.json"]) == app.만든것최대


def test_목록이_깨져_있어도_이번_것은_쌓는다(monkeypatch):
    창고 = _깔기(monkeypatch, {"만든것/목록.json": {"이건": "묶음이 아니다"}})
    app.만든것얹기("abc", "https://x/1", [], _카드())
    assert len(창고.것들["만든것/목록.json"]) == 1


def test_목록을_못_적어도_안_터진다(monkeypatch, capsys):
    """카드뉴스는 이미 창고에 있다 — 목록 때문에 그걸 실패로 만들 이유가 없다."""
    class _막힌창고(_가짜창고):
        def 쓰기(self, *a):
            raise RuntimeError("창고가 막혔다")
    monkeypatch.setattr(app, "_창고", lambda: _막힌창고())
    app.만든것얹기("abc", "https://x/1", [], _카드())
    assert "못 적었다" in capsys.readouterr().out


# ── 이름 바꾸기 ────────────────────────────────────────────────────

def test_이름을_다시_안_재고_고친다(monkeypatch):
    창고 = _깔기(monkeypatch, {
        "templates/AAA.json": {"코드": "AAA", "이름": "AAA"},
        "templates/목록.json": [{"코드": "AAA", "이름": "AAA"}]})
    난것 = app.template_rename({"코드": "AAA", "이름": "키키 밈체"})
    assert 난것["ok"]
    assert 창고.것들["templates/AAA.json"]["이름"] == "키키 밈체"
    assert 창고.것들["templates/목록.json"][0]["이름"] == "키키 밈체"


def test_틀_파일이_이름의_주인이다(monkeypatch):
    """목록은 틀에서 뽑아 만들어진다 — 틀만 고치면 다음 갱신 때 따라온다."""
    창고 = _깔기(monkeypatch, {"templates/AAA.json": {"코드": "AAA"}})
    app.template_rename({"코드": "AAA", "이름": "새 이름"})
    assert 창고.것들["templates/AAA.json"]["이름"] == "새 이름"


def test_없는_틀은_거절한다(monkeypatch):
    _깔기(monkeypatch)
    assert app.template_rename({"코드": "없다", "이름": "ㅋ"})["ok"] is False


def test_빈_이름은_거절한다(monkeypatch):
    _깔기(monkeypatch, {"templates/AAA.json": {"코드": "AAA"}})
    assert app.template_rename({"코드": "AAA", "이름": "   "})["ok"] is False


def test_너무_긴_이름은_거절한다(monkeypatch):
    _깔기(monkeypatch, {"templates/AAA.json": {"코드": "AAA"}})
    assert app.template_rename({"코드": "AAA", "이름": "가" * 70})["ok"] is False


# ── 이름을 고치면 말투 이름도 같이 ────────────────────────────────
#
# 말투 이름은 틀 이름에서 나온다(`analyze/말투틀.뽑기`: 「파란 타임라인」 →
# 「파란 타임라인 말투」). 틀만 고치면 말투는 옛 이름으로 남아, 사람이 방금
# 붙인 이름으로 말투를 고르면 «그런 말투가 없다» 가 나온다
# (실물 2026-08-31: 틀은 「파란 타임라인」인데 말투는 「DSW-6lrk5rs」였다).

def _말투창고(monkeypatch):
    return _깔기(monkeypatch, {
        "templates/AAA.json": {"코드": "AAA", "이름": "AAA"},
        "templates/목록.json": [{"코드": "AAA", "이름": "AAA"}],
        "tones/AAA.json": {"코드": "AAA", "이름": "AAA"},
        "tones/목록.json": [{"코드": "AAA", "이름": "AAA"}]})


def test_말투_이름도_같이_고친다(monkeypatch):
    창고 = _말투창고(monkeypatch)
    난것 = app.template_rename({"코드": "AAA", "이름": "파란 타임라인"})
    assert 난것["말투이름"] == "파란 타임라인 말투"
    assert 창고.것들["tones/AAA.json"]["이름"] == "파란 타임라인 말투"
    assert 창고.것들["tones/목록.json"][0]["이름"] == "파란 타임라인 말투"


def test_말투가_아직_없어도_이름은_고쳐진다(monkeypatch):
    """분석 전이면 말투 파일이 없다 — 그것 때문에 이름 고치기가 실패하면 안 된다."""
    창고 = _깔기(monkeypatch, {"templates/AAA.json": {"코드": "AAA"}})
    난것 = app.template_rename({"코드": "AAA", "이름": "새 이름"})
    assert 난것["ok"] and 난것["말투이름"] == ""
    assert 창고.것들["templates/AAA.json"]["이름"] == "새 이름"


def test_말투_쪽이_터져도_이름은_고쳐진다(monkeypatch, capsys):
    창고 = _말투창고(monkeypatch)
    원래 = 창고.쓰기

    def 쓰기(key, data, ctype):
        if key.startswith("tones/"):
            raise RuntimeError("창고가 막혔다")
        원래(key, data, ctype)

    monkeypatch.setattr(창고, "쓰기", 쓰기)
    난것 = app.template_rename({"코드": "AAA", "이름": "새 이름"})
    assert 난것["ok"] and 난것["말투이름"] == ""
    assert 창고.것들["templates/AAA.json"]["이름"] == "새 이름"
    assert "말투 이름은 못 고쳤다" in capsys.readouterr().out


def test_꼬리가_분석_쪽과_같다():
    """두 벌이 갈리면 이름을 고쳐도 말투가 옛 이름으로 남는다."""
    import io as _io
    글 = _io.open(HERE.parent / "analyze" / "말투틀.py", encoding="utf-8").read()
    assert f'{{이름.strip()}}{app.말투꼬리}"' in 글, app.말투꼬리
# ── 영상 자리 — 번호표로 굽기 (사람 결정 2026-09-16) ─────────────────

_창고주소 = "https://cardnews-render-554608989606.s3.ap-northeast-2.amazonaws.com"   # 우리 창고 (BUCKET·REGION 에서 나온다)
_영상장 = {"배경": {"종류": "단색", "hex": "#FFFFFF"}, "글자영역": [],
         "장식영역": [{"종류": "사진", "box": [0, 0, 100, 100],
                    "media_url": f"{_창고주소}/photos/a.mp4"}]}
_사진장 = {"배경": {"종류": "단색", "hex": "#FFFFFF"}, "글자영역": [], "장식영역": []}


def test_영상_없는_판은_예전처럼_즉시_답한다(monkeypatch):
    _깔기(monkeypatch)
    난것 = app.edit_save("abc", {"cards": [_사진장]}, 굽기=lambda c: ["https://x/1.png"], 때="t",
                        걸기=lambda 몸: pytest.fail("영상이 없는데 번호표를 걸었다"))
    assert 난것["ok"] and 난것["slides"] == ["https://x/1.png"] and "job_id" not in 난것


def test_영상_있는_판은_번호표를_주고_자기를_건다(monkeypatch):
    창고 = _깔기(monkeypatch)
    걸린것 = []
    난것 = app.edit_save("abc", {"cards": [_영상장]}, 굽기=lambda c: pytest.fail("즉시 구우면 안 된다"),
                        때="t", 걸기=걸린것.append)
    assert 난것["ok"] and 난것["status"] == "queued" and 난것["job_id"]
    # **언어도 같이 실린다** — 작업대 쪽이 돌려준 것. 안 실으면 다시 구울 때
    # 그 쪽만 한국어로 돌아간다.
    assert 걸린것 == [{"굽기일": {"번호": 난것["job_id"], "edit_id": "abc",
                              "cards": [_영상장], "언어": ""}}]
    assert 창고.것들[f"rita-jobs/{난것['job_id']}.json"]["status"] == "queued"


# ── 장이 많은 판도 번호표로 굽는다 (실물 2026-09-21) ─────────────────
#
# 사진이 든 7장을 저장하자 31.2초·30.3초가 걸렸다. 서버는 끝까지 굽고 판을 쌓았는데
# 게이트웨이가 30초에 503 을 돌려줘서 화면은 「저장을 못 했습니다」를 띄웠다 —
# 저장은 됐는데 실패로 보였다. 영상이 아니어도 장이 많으면 번호표로 간다.


def test_영상이_없어도_장이_많으면_번호표를_준다(monkeypatch):
    창고 = _깔기(monkeypatch)
    걸린것 = []
    장들 = [_사진장] * (app.번호표로굽는장수 + 1)
    난것 = app.edit_save("abc", {"cards": 장들}, 굽기=lambda c: pytest.fail("즉시 구우면 안 된다"),
                        때="t", 걸기=걸린것.append)
    assert 난것["ok"] and 난것["status"] == "queued" and 난것["job_id"]
    assert len(걸린것) == 1 and 걸린것[0]["굽기일"]["edit_id"] == "abc"
    assert len(걸린것[0]["굽기일"]["cards"]) == len(장들), "장이 빠져서 걸렸다"
    assert 창고.것들[f"rita-jobs/{난것['job_id']}.json"]["status"] == "queued"


def test_장이_한계까지는_예전처럼_즉시_답한다(monkeypatch):
    """한계 장 수 **딱 그만큼**은 번호표가 아니다 — 경계에서 갈리는 자리다."""
    _깔기(monkeypatch)
    장들 = [_사진장] * app.번호표로굽는장수
    난것 = app.edit_save("abc", {"cards": 장들}, 굽기=lambda c: ["https://x/1.png"] * len(c), 때="t",
                        걸기=lambda 몸: pytest.fail("한계 이하인데 번호표를 걸었다"))
    assert 난것["ok"] and "job_id" not in 난것


def test_번호표로굽는_한계는_문지기_30초_안이다():
    """이 저장 길은 브라우저가 **바깥 문**으로 들어오는 것이라 30초에서 끊긴다.

    사진 든 3장이 19초였다(9/21 18:08). 4장부터는 넘어갈 수 있으니 3 이하여야 한다.
    처음 굽는 쪽과 맞출 까닭은 없다 — 그쪽은 문을 안 거친다(2026-09-24).
    """
    assert 1 <= app.번호표로굽는장수 <= 3


def test_굽기한판은_굽고_판을_쌓고_번호표에_적는다(monkeypatch):
    창고 = _깔기(monkeypatch, {"edit/abc/목록.json": []})
    monkeypatch.setattr(app, "build_cardnews", lambda body: {"slides": ["https://x/1.mp4"]})
    난것 = app.굽기한판({"번호": "j1", "edit_id": "abc", "cards": [_영상장]})
    assert 난것["ok"]
    일 = 창고.것들["rita-jobs/j1.json"]
    assert 일["status"] == "succeeded" and 일["result"]["slides"] == ["https://x/1.mp4"]
    assert "판" in 일["result"] and "판목록" in 일["result"]


def test_굽기한판은_실패해도_번호표에_적는다(monkeypatch):
    창고 = _깔기(monkeypatch)
    def 죽는굽기(body):
        raise ValueError("1번 장 영상을 못 구웠습니다 — 영상이 30초를 넘는다")
    monkeypatch.setattr(app, "build_cardnews", 죽는굽기)
    난것 = app.굽기한판({"번호": "j2", "edit_id": "abc", "cards": [_영상장]})
    assert not 난것["ok"]
    일 = 창고.것들["rita-jobs/j2.json"]
    assert 일["status"] == "failed" and "30초" in 일["error"]["message"]


def test_upload_sign_은_mp4_만_받는다(monkeypatch):
    잡은것 = {}

    def 가짜서명(*a, **k):
        잡은것.update(k)
        return "https://signed"

    monkeypatch.setattr(app, "_서명창고", lambda: type("가짜", (), {"generate_presigned_url": staticmethod(가짜서명)})())
    난것 = app.upload_sign({"ext": "mp4", "size": 1234})
    assert 난것["ok"] and 난것["put_url"] == "https://signed"
    assert 난것["url"].startswith(f"{_창고주소}/photos/") and 난것["url"].endswith(".mp4")
    # 서명에 크기를 박아야 창고가 그 크기만 받는다 — 안 박으면 무제한 쓰기 문이다.
    assert 잡은것["Params"]["ContentLength"] == 1234
    assert app.upload_sign({"ext": "exe", "size": 1234}) == {"ok": False, "why": "mp4 만 올릴 수 있습니다"}


def test_upload_sign_은_크기가_없거나_200MB_를_넘으면_거절(monkeypatch):
    monkeypatch.setattr(app, "_서명창고",
                        lambda: type("가짜", (), {"generate_presigned_url": staticmethod(lambda *a, **k: pytest.fail("거절해야 하는데 서명했다"))})())
    거절 = {"ok": False, "why": "영상이 너무 큽니다 (200MB 까지)"}
    assert app.upload_sign({"ext": "mp4"}) == 거절
    assert app.upload_sign({"ext": "mp4", "size": 0}) == 거절
    assert app.upload_sign({"ext": "mp4", "size": "1234"}) == 거절
    assert app.upload_sign({"ext": "mp4", "size": 200 * 1024 * 1024 + 1}) == 거절


def test_서명은_작업대와_같은_집_주소로_한다():
    """실물 2026-09-16: 기본 클라이언트가 `<통>.s3.amazonaws.com`(지역 없는 주소)으로 서명해
    작업대(`<통>.s3.ap-northeast-2.amazonaws.com`)와 집이 달라졌다 — 브라우저가 PUT 을 막는다.
    지역 주소·s3v4·가상 호스트 방식으로 서명해야 같은 집이 된다."""
    c = app._서명창고()
    assert c.meta.endpoint_url == f"https://s3.{app.REGION}.amazonaws.com"
    assert c.meta.config.signature_version == "s3v4"
    assert c.meta.config.s3["addressing_style"] == "virtual"


def test_edit_save_는_우리_창고_접두를_넘긴다(monkeypatch):
    """설계도 검사가 꼴만 보면 남의 S3 통도 통과한다 — 우리 통 주소를 같이 준다."""
    _깔기(monkeypatch)
    잡은것 = {}

    def 가짜탈(cards, **k):
        잡은것.update(k)
        return []

    monkeypatch.setattr(app.edit_store, "설계도_탈", 가짜탈)
    app.edit_save("abc", {"cards": [_사진장]}, 굽기=lambda c: ["https://x/1.png"], 때="t")
    assert 잡은것["영상접두"] == f"{_창고주소}/photos/"


def test_build_cardnews_는_영상_장을_mp4_로_올린다(monkeypatch, tmp_path):
    from PIL import Image
    import 영상굽기
    뚫린 = Image.new("RGBA", (10, 10), (0, 0, 0, 0))
    monkeypatch.setattr(app.cardnews_compose, "build",
                        lambda body, fonts: [Image.new("RGBA", (10, 10)), {"그림": 뚫린, "영상": "https://x/a.mp4", "box": [0, 0, 10, 10]}])
    올린것 = []
    monkeypatch.setattr(app, "_put", lambda p, key: (올린것.append(key), f"https://x/{key}")[1])
    def 가짜굽기(영상url, 뚫린png, box, 결과, **k):
        # 이 길(`POST /render/cardnews`)은 설계도 검사를 안 탄다 — 굽기가 직접 봐야 한다.
        assert k["허용접두"] == f"{_창고주소}/photos/"
        Path(결과).write_bytes(b"mp4"); return 결과
    monkeypatch.setattr(app.영상굽기, "굽기", 가짜굽기)
    난것 = app.build_cardnews({"slides": [{}, {}]})
    assert 난것["slides"][0].endswith(".png") and 난것["slides"][1].endswith(".mp4")
    assert 올린것[0].startswith("cardnews/") and 올린것[1].startswith("cardnews/")


def test_build_cardnews_는_영상_실패를_장_번호와_함께_던진다(monkeypatch):
    from PIL import Image
    import 영상굽기
    monkeypatch.setattr(app.cardnews_compose, "build",
                        lambda body, fonts: [{"그림": Image.new("RGBA", (10, 10)), "영상": "https://x/a.mp4", "box": [0, 0, 10, 10]}])
    def 죽는굽기(*a, **k):
        raise 영상굽기.영상탈("영상이 30초를 넘는다 — 34.2초")
    monkeypatch.setattr(app.영상굽기, "굽기", 죽는굽기)
    with pytest.raises(ValueError, match="1번 장 영상을 못 구웠습니다 — 영상이 30초를 넘는다"):
        app.build_cardnews({"slides": [{}]})
def test_굽기한판은_이미_끝난_일을_다시_굽지_않는다(monkeypatch):
    """Lambda 가 Event 호출을 두 번까지 다시 부른다 — 또 구우면 판이 겹쌓인다."""
    창고 = _깔기(monkeypatch, {"rita-jobs/j3.json": {
        "status": "succeeded", "progress": 100,
        "result": {"slides": ["https://x/1.mp4"]}}})
    monkeypatch.setattr(app, "build_cardnews", lambda body: pytest.fail("다시 구웠다"))
    난것 = app.굽기한판({"번호": "j3", "edit_id": "abc", "cards": []})
    assert 난것["ok"]
    assert 창고.것들["rita-jobs/j3.json"] == {
        "status": "succeeded", "progress": 100,
        "result": {"slides": ["https://x/1.mp4"]}}


def test_build_cardnews_는_실패해도_임시파일을_남기지_않는다(monkeypatch, tmp_path):
    """반쯤 만들다 죽은 mp4 가 /tmp 에 쌓이면 따뜻한 Lambda 의 디스크가 찬다."""
    from PIL import Image
    import 영상굽기
    monkeypatch.setattr(app, "TMP", tmp_path)
    monkeypatch.setattr(app.cardnews_compose, "build",
                        lambda body, fonts: [{"그림": Image.new("RGBA", (10, 10)),
                                            "영상": "https://x/a.mp4", "box": [0, 0, 10, 10]}])

    def 반쯤죽는굽기(영상url, 뚫린png, box, 결과, **k):
        Path(결과).write_bytes("반쯤 만든 mp4".encode("utf-8"))
        raise 영상굽기.영상탈("반쯤 만들다 죽음")

    monkeypatch.setattr(app.영상굽기, "굽기", 반쯤죽는굽기)
    with pytest.raises(ValueError):
        app.build_cardnews({"slides": [{}]})
    assert list(tmp_path.iterdir()) == []
