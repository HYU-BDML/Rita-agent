# -*- coding: utf-8 -*-
"""영상 자리 굽기 — ffmpeg 을 실제로 돌리지 않고 «명령이 맞나»·«재기가 맞나» 만 본다.

사람 결정 2026-09-16: 「?」 자리에 사진 또는 영상. 30초까지, 한 장에 하나.
"""
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import 영상굽기 as vb  # noqa: E402

# 저쪽(render-server/composer.py)이 실측한 ffmpeg 표준오류 꼴. ffprobe 는 상자에 없다.
_STDERR = """Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'a.mp4':
  Duration: 00:00:12.48, start: 0.000000, bitrate: 2101 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt709, progressive), 1280x720 [SAR 1:1 DAR 16:9], 1966 kb/s, 30 fps, 30 tbr, 15360 tbn (default)
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, stereo, fltp, 128 kb/s (default)
At least one output file must be specified"""


def test_재기_가로세로초fps():
    assert vb.재기(_STDERR) == (1280, 720, 12.48, 30.0)


def test_재기_fps_가_없으면_30으로():
    # 어떤 영상은 표준오류에 fps 를 안 적는다. 그렇다고 거절하면 멀쩡한 영상이 막힌다.
    없는것 = _STDERR.replace(", 30 fps", "")
    assert vb.재기(없는것)[3] == 30.0


def test_재기_못_읽으면_탈():
    with pytest.raises(vb.영상탈):
        vb.재기("아무것도 없다")


def test_명령_자리_좌표와_크기를_그대로_담는다():
    인자 = vb.명령("in.mp4", "hole.png", [100, 200, 620, 590], 12.48, "out.mp4")
    글 = " ".join(인자)
    assert 인자[0] == "ffmpeg" and 인자[-1] == "out.mp4"
    assert "-i in.mp4" in 글 and "-i hole.png" in 글
    # 자리를 꽉 채우게(cover) 키우고 가운데를 자른다 — cardnews_compose._cover_fit 과 같은 규칙
    assert "scale=w='max(520,iw*390/ih)':h='max(390,ih*520/iw)'" in 글
    assert "crop=520:390" in 글
    assert "color=c=black:s=1080x1350:d=12.48:r=30.0[bg]" in 글
    assert "overlay=100:200" in 글
    assert "-c:v libx264" in 글 and "-preset veryfast" in 글 and "-c:a copy" in 글
    assert "format=yuv420p" in 글


def test_명령_배경자리는_장_전체다():
    인자 = vb.명령("in.mp4", "hole.png", [0, 0, 1080, 1350], 5.0, "out.mp4")
    글 = " ".join(인자)
    assert "crop=1080:1350" in 글 and "overlay=0:0" in 글


def test_상한값():
    assert vb.최대초 == 30.0
    assert vb.최대바이트 == 200 * 1024 * 1024


def _가짜받기(파일: dict):
    def 받기(url, 목적지):
        목적지.write_bytes(파일.get(url, b""))
    return 받기


def _가짜돌리기(stderr: str, 부른것: list):
    def 돌리기(인자):
        부른것.append(인자)
        # 첫 번째(재기)만 표준오류를 준다. 두 번째(굽기)는 결과 파일을 만든다.
        if len(부른것) == 2:
            Path(인자[-1]).write_bytes(b"mp4")
        return stderr, 0
    return 돌리기


def test_굽기_재고_명령을_돌려_결과를_준다(tmp_path):
    뚫린 = tmp_path / "hole.png"; 뚫린.write_bytes(b"png")
    결과 = tmp_path / "out.mp4"
    부른것 = []
    난것 = vb.굽기("https://bucket/photos/a.mp4", 뚫린, [100, 200, 620, 590], 결과,
                받기=_가짜받기({"https://bucket/photos/a.mp4": b"v"}),
                돌리기=_가짜돌리기(_STDERR, 부른것))
    assert 난것 == 결과 and 결과.read_bytes() == b"mp4"
    assert 부른것[0][:3] == ["ffmpeg", "-hide_banner", "-i"]          # 재기
    assert "crop=520:390" in " ".join(부른것[1]) and "d=12.48" in " ".join(부른것[1])


def test_굽기_잰_fps_를_명령에_넣는다(tmp_path):
    """바탕(color) 은 안 적으면 25fps 다 — 원본이 60fps 면 덮는 시계가 어긋난다."""
    뚫린 = tmp_path / "hole.png"; 뚫린.write_bytes(b"png")
    부른것 = []
    vb.굽기("https://bucket/photos/a.mp4", 뚫린, [0, 0, 10, 10], tmp_path / "out.mp4",
           받기=_가짜받기({"https://bucket/photos/a.mp4": b"v"}),
           돌리기=_가짜돌리기(_STDERR.replace("30 fps", "59.94 fps"), 부른것))
    assert "r=59.94" in " ".join(부른것[1])


def test_굽기_허용접두_밖_주소는_내려받기_전에_탈(tmp_path):
    """검사를 안 타는 길(`POST /render/cardnews`)로 들어와도 아무 데나 안 간다."""
    def 받기(url, 목적지):
        pytest.fail("내려받기 전에 막았어야 한다")
    with pytest.raises(vb.영상탈, match="우리 창고가 아니다"):
        vb.굽기("https://evil.example.com/x.mp4", tmp_path / "h.png", [0, 0, 10, 10],
               tmp_path / "o.mp4", 받기=받기, 돌리기=lambda 인자: pytest.fail("돌리면 안 된다"),
               허용접두="https://bucket.s3.ap-northeast-2.amazonaws.com/photos/")


def test_돌리기_9분을_넘기면_탈(monkeypatch):
    """ffmpeg 이 멈춰 버리면 람다 10분을 그대로 태운다 — 9분에 끊고 사람 말로 답한다."""
    import subprocess as sp

    def 멈춘것(*a, **k):
        raise sp.TimeoutExpired(cmd="ffmpeg", timeout=540)

    monkeypatch.setattr(vb.subprocess, "run", 멈춘것)
    with pytest.raises(vb.영상탈, match="넘겼다"):
        vb._돌리기(["ffmpeg"])


def test_굽기_30초_넘으면_탈(tmp_path):
    긴것 = _STDERR.replace("00:00:12.48", "00:00:34.20")
    with pytest.raises(vb.영상탈, match="30초"):
        vb.굽기("https://bucket/photos/a.mp4", tmp_path / "h.png", [0, 0, 10, 10],
               tmp_path / "o.mp4", 받기=_가짜받기({"https://bucket/photos/a.mp4": b"v"}),
               돌리기=_가짜돌리기(긴것, []))


def test_굽기_결과가_안_생기면_탈(tmp_path):
    def 돌리기(인자):
        return _STDERR, 0     # 굽기 단계에서 파일을 안 만든다
    with pytest.raises(vb.영상탈, match="못 구웠다"):
        vb.굽기("https://bucket/photos/a.mp4", tmp_path / "h.png", [0, 0, 10, 10],
               tmp_path / "o.mp4", 받기=_가짜받기({"https://bucket/photos/a.mp4": b"v"}),
               돌리기=돌리기)


def test_내려받기_상한(tmp_path):
    큰것 = b"x" * (vb.최대바이트 + 1)
    with pytest.raises(vb.영상탈, match="200MB"):
        vb.굽기("https://bucket/photos/a.mp4", tmp_path / "h.png", [0, 0, 10, 10],
               tmp_path / "o.mp4", 받기=_가짜받기({"https://bucket/photos/a.mp4": 큰것}),
               돌리기=lambda 인자: (_STDERR, 0))


def test_굽기_ffmpeg_이_0아닌_코드로_끝나면_탈(tmp_path):
    결과 = tmp_path / "out.mp4"
    부른것 = []

    def 돌리기(인자):
        부른것.append(인자)
        if len(부른것) == 1:
            return _STDERR, 1          # 재기 호출은 설계상 코드 1 이다 — 봐주고 넘어간다
        결과.write_bytes(b"cut-off mp4")   # 반쯤 만들다 죽어도 파일은 남는다
        return "x\nCodec not supported\n", 1

    with pytest.raises(vb.영상탈, match="Codec not supported"):
        vb.굽기("https://bucket/photos/a.mp4", tmp_path / "h.png", [0, 0, 10, 10], 결과,
               받기=_가짜받기({"https://bucket/photos/a.mp4": b"v"}), 돌리기=돌리기)


def test_굽기_원본은_성공해도_실패해도_지워진다(tmp_path):
    뚫린 = tmp_path / "hole.png"; 뚫린.write_bytes(b"png")
    결과 = tmp_path / "out.mp4"
    받기 = _가짜받기({"https://bucket/photos/a.mp4": b"v"})

    vb.굽기("https://bucket/photos/a.mp4", 뚫린, [0, 0, 10, 10], 결과,
           받기=받기, 돌리기=_가짜돌리기(_STDERR, []))
    assert not (tmp_path / "out.src.mp4").exists()

    긴것 = _STDERR.replace("00:00:12.48", "00:00:34.20")
    with pytest.raises(vb.영상탈, match="30초"):
        vb.굽기("https://bucket/photos/a.mp4", 뚫린, [0, 0, 10, 10], 결과,
               받기=받기, 돌리기=_가짜돌리기(긴것, []))
    assert not (tmp_path / "out.src.mp4").exists()


def test_내려받기_상한에서_조각을_안_남긴다(tmp_path, monkeypatch):
    class _가짜응답:
        def __init__(self):
            self.남은 = 201           # 1MB 씩 201번 = 201MB, 200MB 상한을 넘긴다
        def read(self, n):
            if self.남은 <= 0:
                return b""
            self.남은 -= 1
            return b"x" * (1 << 20)
        def __enter__(self):
            return self
        def __exit__(self, *a):
            return False

    monkeypatch.setattr(vb.urllib.request, "urlopen", lambda req, timeout=None: _가짜응답())
    목적지 = tmp_path / "src.mp4"
    with pytest.raises(vb.영상탈, match="200MB"):
        vb._내려받기("https://bucket/photos/a.mp4", 목적지)
    assert not 목적지.exists()
