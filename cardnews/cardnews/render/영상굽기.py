# -*- coding: utf-8 -*-
"""영상 자리 굽기 — ffmpeg 로 «깔고 덮기».

사람 결정 2026-09-16: 「?」 자리에 사진 **또는 영상**. 30초까지, 한 장에 하나.

하는 일은 셋이다.
1. 영상을 재서(가로·세로·초) 30초를 넘으면 거절한다 — 브라우저가 먼저 재지만
   서버가 한 번 더 잰다(우회 방지).
2. 영상을 자리 크기로 꽉 채워 자르고(`cardnews_compose._cover_fit` 과 같은 규칙),
   검은 바탕(1080×1350)의 자리 위치에 놓는다.
3. 그 위에 «자리를 투명하게 뚫어 구운 png» 를 덮는다 — 글자·도형이 영상 위에 얹힌다.

**ffprobe 는 상자에 없다.** 정적 ffmpeg 하나뿐이라(저쪽 render-server 와 같은
빌드) `ffmpeg -i` 의 표준오류에서 크기·길이를 읽는다.
"""
import re
import subprocess
import urllib.request
from pathlib import Path

최대초 = 30.0
최대바이트 = 200 * 1024 * 1024   # 사람 결정 2026-09-16: 휴대폰 고화질 20~30초가 100MB 를 넘는다
캔버스 = (1080, 1350)

_크기꼴 = re.compile(r"\b(\d{2,5})x(\d{2,5})\b")
_길이꼴 = re.compile(r"Duration:\s*(\d+):(\d\d):(\d\d(?:\.\d+)?)")
_초당꼴 = re.compile(r"(\d+(?:\.\d+)?)\s*fps")


class 영상탈(Exception):
    """사람에게 보여 줄 말과 함께 실패한다."""


def 재기(stderr: str) -> tuple[int, int, float, float]:
    """ffmpeg 표준오류에서 (가로, 세로, 초, 초당장수). 크기·길이를 못 찾으면 영상탈.

    **초당장수(fps) 를 못 찾는 것은 탈이 아니다** — 안 적는 영상도 있다. 30 으로 친다.
    """
    길이 = _길이꼴.search(stderr or "")
    크기 = None
    초당 = 30.0
    for 줄 in (stderr or "").splitlines():
        if "Video:" in 줄:
            m = _크기꼴.search(줄)
            if m:
                크기 = (int(m.group(1)), int(m.group(2)))
                f = _초당꼴.search(줄)
                if f:
                    초당 = float(f.group(1))
                break
    if not 길이 or not 크기:
        raise 영상탈("영상 크기나 길이를 못 읽었다")
    초 = int(길이.group(1)) * 3600 + int(길이.group(2)) * 60 + float(길이.group(3))
    return 크기[0], 크기[1], round(초, 2), 초당


def 명령(영상: str, 뚫린png: str, box, 초: float, 결과: str, fps: float = 30.0) -> list[str]:
    """ffmpeg 인자 목록. **순수 함수** — 시험이 문자열만 본다.

    scale 은 «자리를 꽉 채우는 배율»(`max(w/sw, h/sh)`)을 ffmpeg 식으로 적은 것이고,
    crop 은 가운데 기준으로 자리 크기만 남긴다.

    **바탕(color) 에 초당장수를 반드시 적는다.** 안 적으면 ffmpeg 이 25 로 치고,
    그 바탕이 덮는 쪽의 시계가 되어 구운 것이 늘 25fps 가 된다 — 60fps 원본이
    뚝뚝 끊겨 나온다.
    """
    x0, y0, x1, y1 = (int(v) for v in box)
    w, h = x1 - x0, y1 - y0
    필터 = (
        f"[0:v]scale=w='max({w},iw*{h}/ih)':h='max({h},ih*{w}/iw)',"
        f"crop={w}:{h}[v];"
        f"color=c=black:s={캔버스[0]}x{캔버스[1]}:d={초}:r={fps}[bg];"
        f"[bg][v]overlay={x0}:{y0}[b];"
        f"[b][1:v]overlay=0:0,format=yuv420p"
    )
    return ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-i", 영상, "-i", 뚫린png,
            "-filter_complex", 필터,
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
            "-c:a", "copy", "-shortest", 결과]


def _내려받기(url: str, 목적지: Path) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": "cardnews-render/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r, open(목적지, "wb") as f:
            받은 = 0
            while True:
                덩이 = r.read(1 << 20)
                if not 덩이:
                    break
                받은 += len(덩이)
                if 받은 > 최대바이트:
                    raise 영상탈("영상이 200MB 를 넘는다")
                f.write(덩이)
    except Exception:
        # 상한에 걸리거나 도중에 끊기면 반쯤 쓴 조각을 남기지 않는다 — 람다 /tmp 는
        # 호출이 끝나도 상자가 살아 있으면 그대로 남아서 다음 번을 굶긴다.
        목적지.unlink(missing_ok=True)
        raise


def _돌리기(인자: list[str]) -> tuple[str, int]:
    """ffmpeg 을 돌리고 (표준오류 글, 끝난 코드) 를 준다. 코드 0 이 «잘 됐다» 다.

    **9분에 끊는다.** 람다가 10분이라 ffmpeg 이 멈추면 남은 시간을 전부 태우고
    답도 못 내고 죽는다 — 그 전에 우리가 끊고 사람 말로 답한다.
    """
    try:
        r = subprocess.run(인자, capture_output=True, text=True, errors="replace",
                           timeout=540)
    except subprocess.TimeoutExpired:
        raise 영상탈("영상을 못 구웠다 — ffmpeg 이 9분을 넘겼다")
    return r.stderr or "", r.returncode


def _꼬리(stderr: str, 줄수: int = 3) -> str:
    """표준오류에서 마지막 빈 줄 아닌 몇 줄만 — 사람에게 보여 줄 실패 사유다."""
    줄 = [s.strip() for s in (stderr or "").splitlines() if s.strip()]
    return " / ".join(줄[-줄수:])


def 굽기(영상url: str, 뚫린png: Path, box, 결과: Path, 받기=None, 돌리기=None,
        허용접두=None) -> Path:
    """영상을 내려받아 재고, 자리 크기로 잘라 깔고, 뚫린 png 를 덮어 mp4 를 낸다.

    `받기`·`돌리기` 를 갈아 끼울 수 있는 것은 시험 때문이다 — 진짜 ffmpeg 을
    시험에서 돌리지 않는다.

    **`허용접두` 를 주면 그 주소로 시작하는 것만 받는다.** 설계도 검사를 안 타는
    길(`POST /render/cardnews`)로 들어와도 남의 주소를 대신 내려받아 주지 않는다.
    """
    if 허용접두 and not 영상url.startswith(허용접두):
        raise 영상탈("영상 주소가 우리 창고가 아니다")
    받기 = 받기 or _내려받기
    돌리기 = 돌리기 or _돌리기
    원본 = 결과.with_suffix(".src.mp4")
    받기(영상url, 원본)
    try:
        if 원본.stat().st_size > 최대바이트:
            raise 영상탈("영상이 200MB 를 넘는다")
        # 재기 호출은 낼 파일을 안 주므로 ffmpeg 이 «출력 파일을 대라» 며 코드 1 로 끝난다
        # — 설계상 그렇다. 그래서 여기서는 코드를 안 본다.
        잰것, _ = 돌리기(["ffmpeg", "-hide_banner", "-i", str(원본)])
        _, _, 초, 초당 = 재기(잰것)
        if 초 > 최대초:
            raise 영상탈(f"영상이 30초를 넘는다 — {초}초")
        구운말, 코드 = 돌리기(명령(str(원본), str(뚫린png), box, 초, str(결과), 초당))
        # ffmpeg 은 -y 로 결과 파일을 먼저 열고 도중에 죽을 수 있다. 그러면 0바이트가
        # 아닌 «잘린» mp4 가 남으므로 파일만 봐서는 성공과 구별이 안 된다 — 코드를 본다.
        if 코드 != 0:
            raise 영상탈("영상을 못 구웠다 — " + _꼬리(구운말))
        if not 결과.exists() or 결과.stat().st_size == 0:
            raise 영상탈("영상을 못 구웠다 — ffmpeg 이 결과를 안 냈다")
    finally:
        # 성공이든 실패든 내려받은 원본은 반드시 치운다.
        원본.unlink(missing_ok=True)
    return 결과
