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
