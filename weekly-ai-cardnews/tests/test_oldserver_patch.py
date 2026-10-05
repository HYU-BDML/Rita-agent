# -*- coding: utf-8 -*-
"""옛 서버(cardnews-render) 표지 파일을 Gemini → GPT 이미지 2.5 로 바꾼 것 시험.

고친 파일은 weekly/oldserver_patch/cover.py — 올라가 있는 이미지의 /var/task/cover.py 에서
네 군데만 바꿨다(기본값 openai · 모델 · 화질 medium · 참조 그림 없으면 새로 그리기).
"""
import base64
import importlib.util
import inspect
import sys
import types
from pathlib import Path

import pytest

파일 = Path(__file__).resolve().parents[1] / "oldserver_patch" / "cover.py"


@pytest.fixture()
def cover(monkeypatch):
    monkeypatch.setitem(sys.modules, "generate", types.SimpleNamespace(_열쇠=lambda 이름: "test-key"))
    spec = importlib.util.spec_from_file_location("oldserver_cover_cover", 파일)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


class 가짜답:
    status_code = 200
    text = ""

    def json(self):
        return {"data": [{"b64_json": base64.b64encode(b"PNG").decode()}],
                "usage": {"input_tokens": 3900, "output_tokens": 1600,
                          "input_tokens_details": {"text_tokens": 900, "image_tokens": 3000}}}


사용량 = {"입력글토큰": 900, "입력그림토큰": 3000, "출력토큰": 1600}


def 받아적기(monkeypatch, cover):
    받은 = []
    monkeypatch.setattr(cover.requests, "post", lambda 주소, **kw: 받은.append((주소, kw)) or 가짜답())
    return 받은


def test_표지는_기본으로_GPT_이미지_2_5_로_그린다(cover):
    assert inspect.signature(cover.만들기).parameters["어디"].default == "openai"
    assert cover.OPENAI_MODEL == "gpt-image-2.5-flare"


def test_참조_그림이_있으면_고치기로_보내고_화질은_medium(cover, monkeypatch, tmp_path):
    밈 = tmp_path / "밈.png"
    밈.write_bytes(b"PNG")
    받은 = 받아적기(monkeypatch, cover)
    p, 쓴것 = cover.openai_image_사용량("그려라", [밈], tmp_path, "표지")
    주소, kw = 받은[0]
    assert 주소.endswith("/v1/images/edits") and 쓴것 == 사용량
    assert kw["data"]["model"] == "gpt-image-2.5-flare" and kw["data"]["quality"] == "medium"
    assert kw["data"]["size"] == "1088x1360" and len(kw["files"]) == 1
    assert kw["headers"]["Authorization"] == "Bearer test-key"
    assert p.read_bytes() == b"PNG"


def test_참조_그림이_없으면_새로_그리기로_보낸다(cover, monkeypatch, tmp_path):
    받은 = 받아적기(monkeypatch, cover)
    p, 쓴것 = cover.openai_image_사용량("그려라", [], tmp_path, "표지")
    주소, kw = 받은[0]
    assert 주소.endswith("/v1/images/generations") and 쓴것 == 사용량
    assert kw["json"] == {"model": "gpt-image-2.5-flare", "prompt": "그려라", "size": "1088x1360",
                          "quality": "medium", "n": 1}
    assert "files" not in kw
    assert p.read_bytes() == b"PNG"


프로큐어 = Path(__file__).resolve().parents[1] / "oldserver_patch" / "procure"


def _읽어오기(이름, monkeypatch):
    monkeypatch.setitem(sys.modules, "web", types.SimpleNamespace())  # blog.py 가 부르는 옛 서버 모듈
    spec = importlib.util.spec_from_file_location(f"oldserver_patch_{이름}", 프로큐어 / f"{이름}.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_그록은_명단에서_뺐다(monkeypatch):
    week = _읽어오기("week", monkeypatch)
    assert [줄[0] for 줄 in week.명단] == ["ChatGPT", "Claude", "Gemini", "Cursor", "Perplexity", "Meta AI", "NVIDIA"]


def test_엔비디아_블로그를_읽고_명단의_발행처는_모두_설정이_있다(monkeypatch):
    blog = _읽어오기("blog", monkeypatch)
    week = _읽어오기("week", monkeypatch)
    assert blog.FEEDS["NVIDIA"] == ("rss", ["https://blogs.nvidia.com/feed/"])
    for 줄 in week.명단:  # 설정이 빠지면 KeyError 로 그 브랜드 블로그가 매번 죽는다(2026-09-30 NVIDIA)
        if 줄[2]:
            assert 줄[2] in blog.FEEDS, 줄[0]


def test_표지_만들기는_GPT_사용량을_돌려준다(cover, monkeypatch, tmp_path):
    monkeypatch.setitem(sys.modules, "faces", types.SimpleNamespace(for_company=lambda 브랜드, 폴더: None))
    받아적기(monkeypatch, cover)
    난것 = cover.만들기({"brand": "", "meme": "", "gen_prompt_en": "Photograph. A single man stands."}, 폴더=tmp_path)
    assert 난것["모델"] == "gpt-image-2.5-flare" and 난것["사용량"] == 사용량


def test_옛_서버_입구는_표지_결과에_사용량을_싣는다():
    글 = (Path(__file__).resolve().parents[1] / "oldserver_patch" / "app.py").read_text(encoding="utf-8")
    표지 = 글[글.index("def one_cover"):글.index("def _run_job")]
    assert '"사용량": 난것.get("사용량")' in 표지  # 번호표 기록(jobs/*.json)에 실려 새 서버가 값을 센다


def test_원래_함수는_그대로_그림_경로만_준다(cover, monkeypatch, tmp_path):
    # 옛 서버 generate.py 가 cover.openai_image 의 돌려받은 값을 경로로 쓴다 — 모양을 바꾸면 거기가 깨진다
    받아적기(monkeypatch, cover)
    p = cover.openai_image("그려라", [], tmp_path, "그림")
    assert isinstance(p, Path) and p.read_bytes() == b"PNG"


def test_표지는_카드_비율_4대5_그대로라_아래_45퍼센트를_비운다(cover, monkeypatch, tmp_path):
    # 예전엔 2:3 으로 뽑아 위를 잘라서 «아래 38%» 로 줄여 적었다 — 이제 1088x1360(4:5)이라 안 자른다
    monkeypatch.setitem(sys.modules, "faces", types.SimpleNamespace(for_company=lambda 브랜드, 폴더: None))
    받은 = 받아적기(monkeypatch, cover)
    cover.만들기({"brand": "", "meme": "", "gen_prompt_en": "Photograph. A single man stands."}, 폴더=tmp_path)
    assert "bottom 45 percent" in 받은[0][1]["json"]["prompt"]


# ── 새 분야 표지 — 그 소식의 실제 사진이 얼굴 참조(계획 3) ──
def test_얼굴_주소가_없으면_예전_글(cover):
    글 = cover.프롬프트({"gen_prompt_en": "A single man stands."}, "Sam Altman", 밈=True)
    assert "IMAGE 2 is a photo of Sam Altman." in 글 and "Exactly one hero fills the frame" in 글 and "members" not in 글


def test_여럿이면_무리_꼴(cover):
    글 = cover.프롬프트({"gen_prompt_en": "Eight young women stand together."}, "하츠투하츠", 밈=True, 여럿=8)
    assert "IMAGE 2 is a photo of the 8 members of 하츠투하츠." in 글 and "Draw exactly these 8 people" in 글
    assert "Exactly one hero fills the frame" not in 글 and "The whole group of 8 people stands together" in 글


def test_얼굴_주소를_받아_참조로(cover, monkeypatch, tmp_path):
    monkeypatch.setitem(sys.modules, "faces", types.SimpleNamespace(
        for_company=lambda 브랜드, 폴더: (_ for _ in ()).throw(AssertionError("얼굴 표를 보면 안 된다"))))
    받은 = 받아적기(monkeypatch, cover)

    class 사진답:
        status_code = 200
        content = b"\xff\xd8JPG"

        def raise_for_status(self):
            pass

    monkeypatch.setattr(cover.requests, "get", lambda 주소, timeout=0: 사진답())
    난것 = cover.만들기({"brand": "하츠투하츠", "meme": "", "gen_prompt_en": "Eight young women stand together.",
                       "face_url": "https://s3/05.jpg", "face_person": "하츠투하츠", "face_count": 8}, 폴더=tmp_path)
    assert 난것["인물"] == "하츠투하츠" and 난것["참조"] == ["얼굴:하츠투하츠"]
    assert "photo of the 8 members of 하츠투하츠" in 받은[0][1]["data"]["prompt"]


def test_얼굴_주소가_있으면_사람_낱말이_없어도_얼굴을_넣는다(cover, monkeypatch, tmp_path):
    # 손흥민 표지: 지시문이 «soccer player» 라 «사람 낱말» 이 없다고 얼굴을 버려 밈 속 아이가 그대로 남았다(두 번)
    monkeypatch.setitem(sys.modules, "faces", types.SimpleNamespace(for_company=lambda 브랜드, 폴더: None))
    받은 = 받아적기(monkeypatch, cover)

    class 사진답:
        status_code = 200
        content = b"\xff\xd8JPG"

        def raise_for_status(self):
            pass

    monkeypatch.setattr(cover.requests, "get", lambda 주소, timeout=0: 사진답())
    난것 = cover.만들기({"brand": "손흥민", "meme": "", "gen_prompt_en": "A young Korean soccer player faces the camera.",
                       "face_url": "https://s3/face.jpg", "face_person": "손흥민", "face_count": 1}, 폴더=tmp_path)
    assert 난것["참조"] == ["얼굴:손흥민"] and "IMAGE 1 is a photo of 손흥민." in 받은[0][1]["data"]["prompt"]


def test_주간_AI_소식은_사람_낱말이_없으면_예전처럼_얼굴을_안_넣는다(cover, monkeypatch, tmp_path):
    얼굴 = tmp_path / "ceo.jpg"
    얼굴.write_bytes(b"JPG")
    monkeypatch.setitem(sys.modules, "faces", types.SimpleNamespace(
        for_company=lambda 브랜드, 폴더: {"person": "Sam Altman", "path": str(얼굴), "license": "cc", "author": "x"}))
    받아적기(monkeypatch, cover)
    난것 = cover.만들기({"brand": "ChatGPT", "meme": "", "gen_prompt_en": "A clay robot mascot waves."}, 폴더=tmp_path)
    assert 난것["인물"] is None


def _받는사진(바이트):
    class 답:
        status_code = 200
        content = 바이트

        def raise_for_status(self):
            pass

    return lambda 주소, timeout=0: 답()


def _gif():
    import io
    from PIL import Image
    b = io.BytesIO()
    Image.new("RGB", (4, 4), (200, 30, 30)).save(b, "GIF")
    return b.getvalue()


@pytest.mark.parametrize("바이트, 끝", [(b"\x89PNG\r\n\x1a\n" + b"0" * 20, ".png"),
                                    (b"RIFF\x10\x00\x00\x00WEBPVP8 " + b"0" * 20, ".webp"),
                                    (b"\xff\xd8\xff\xe0" + b"0" * 20, ".jpg")])
def test_얼굴_사진은_진짜_꼴의_이름으로_둔다(cover, monkeypatch, tmp_path, 바이트, 끝):
    # 늘 .jpg 로 두어 고치기에 image/jpeg 로 보냈다 — png·webp 가 다른 꼴로 가 거절될 수 있었다(계획 4 D-8)
    monkeypatch.setattr(cover.requests, "get", _받는사진(바이트))
    얼굴 = cover._사진받기("https://s3/face", tmp_path, "아이브")
    assert Path(얼굴["path"]).suffix == 끝 and Path(얼굴["path"]).read_bytes() == 바이트


def test_GIF_얼굴_사진은_PNG_로_바꿔_둔다(cover, monkeypatch, tmp_path):
    monkeypatch.setattr(cover.requests, "get", _받는사진(_gif()))
    얼굴 = cover._사진받기("https://s3/face.gif", tmp_path, "아이브")
    assert Path(얼굴["path"]).suffix == ".png" and Path(얼굴["path"]).read_bytes()[:8] == b"\x89PNG\r\n\x1a\n"


def test_그림이_아니면_얼굴_없이(cover, monkeypatch, tmp_path):
    monkeypatch.setattr(cover.requests, "get", _받는사진(b"<html>not image</html>"))
    assert cover._사진받기("https://s3/face", tmp_path, "아이브") is None


def test_고치기에는_그림_꼴대로_보낸다(cover, monkeypatch, tmp_path):
    받은 = 받아적기(monkeypatch, cover)
    그림들 = []
    for 이름 in ("밈.jpg", "얼굴.webp", "로고.png"):
        p = tmp_path / 이름
        p.write_bytes(b"x")
        그림들.append(p)
    cover.openai_image_사용량("그려라", 그림들, tmp_path, "표지")
    assert [f[1][2] for f in 받은[0][1]["files"]] == ["image/jpeg", "image/webp", "image/png"]


def test_얼굴_없음이면_회사_대표_얼굴을_안_붙인다(cover, monkeypatch, tmp_path):
    # 새 분야 표지에 얼굴이 없을 때 주인공 이름(엔비디아)으로 위키미디어 얼굴 표를 찾아 대표 얼굴이 붙었다(계획 4 D-9)
    얼굴 = tmp_path / "ceo.jpg"
    얼굴.write_bytes(b"JPG")
    monkeypatch.setitem(sys.modules, "faces", types.SimpleNamespace(
        for_company=lambda 브랜드, 폴더: {"person": "Jensen Huang", "path": str(얼굴), "license": "cc", "author": "x"}))
    받아적기(monkeypatch, cover)
    난것 = cover.만들기({"brand": "엔비디아", "meme": "", "gen_prompt_en": "A man in a leather jacket on stage.",
                       "face_none": True}, 폴더=tmp_path)
    assert 난것["인물"] is None and not any(x.startswith("얼굴:") for x in 난것["참조"])


# ── 계획 4 과제 42++ D — 표지는 진짜 사진을 그대로 깐다 ──

def _띠사진(크기, 띠들, 가로로=False):
    """띠마다 색이 다른 사진 — 띠들: [(끝, 색), …] 픽셀 자리(세로 띠면 열, 아니면 줄)."""
    import io
    from PIL import Image
    im = Image.new("RGB", 크기)
    앞 = 0
    for 끝, 색 in 띠들:
        im.paste(색, (앞, 0, 끝, 크기[1]) if 가로로 else (0, 앞, 크기[0], 끝))
        앞 = 끝
    b = io.BytesIO()
    im.save(b, "JPEG", quality=95)
    return b.getvalue()


빨, 초, 파 = (220, 20, 20), (20, 200, 20), (20, 20, 220)


def _가까운(색, 기대):
    return all(abs(a - b) < 40 for a, b in zip(색, 기대))


def test_세로로_긴_사진은_가로를_맞추고_위쪽_15퍼센트_지점부터_자른다(cover, monkeypatch, tmp_path):
    # 1000×3000 → 1080×3240, 넘친 1890 가운데 위에서 15%(283) 만 잘라 얼굴이 잘리지 않게 — 원본으로 262줄
    from PIL import Image
    monkeypatch.setattr(cover.requests, "get", _받는사진(_띠사진((1000, 3000), [(200, 빨), (400, 초), (3000, 파)])))
    난것 = cover.사진깔기({"photo_url": "https://s3/media/01.jpg", "brand": "리즈"}, 폴더=tmp_path)
    with Image.open(난것["path"]) as im:
        assert im.size == (1080, 1350)
        assert _가까운(im.getpixel((540, 5)), 초) and _가까운(im.getpixel((540, 1300)), 파)
    assert (난것["모델"], 난것["사진출처"], 난것["인물"]) == ("사진", "https://s3/media/01.jpg", "리즈")
    assert 난것["사용량"] == {"입력글토큰": 0, "입력그림토큰": 0, "출력토큰": 0}  # 그림 돈 0 — «모름» 으로 안 쌓인다


def test_가로로_긴_사진은_세로를_맞추고_가운데를_자른다(cover, monkeypatch, tmp_path):
    from PIL import Image
    monkeypatch.setattr(cover.requests, "get",
                        _받는사진(_띠사진((2000, 1000), [(500, 빨), (1500, 초), (2000, 파)], 가로로=True)))
    with Image.open(cover.사진깔기({"photo_url": "https://s3/a.jpg"}, 폴더=tmp_path)["path"]) as im:
        assert im.size == (1080, 1350) and _가까운(im.getpixel((3, 675)), 초) and _가까운(im.getpixel((1076, 675)), 초)


def test_옛_서버_입구는_사진이_오면_그림을_안_그리고_사진을_깐다():
    글 = (Path(__file__).resolve().parents[1] / "oldserver_patch" / "app.py").read_text(encoding="utf-8")
    표지 = 글[글.index("def one_cover"):글.index("def _run_job")]
    assert 'cover.사진깔기(slide) if slide.get("photo_url") else cover.만들기(slide)' in 표지
    assert '"사진" if slide.get("photo_url")' in 표지
