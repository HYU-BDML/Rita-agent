# -*- coding: utf-8 -*-
"""**git 이 따라가는 파일에 열쇠처럼 생긴 값이 있나.**

실물 2026-09-20: 옛 문서 하나(`_보관/쓸지도/옛문서/카드뉴스_워크플로우_2차.md`)에
**진짜 Apify 토큰 여섯 개**가 적힌 채로 2026-08-20 커밋에 들어갔고, 원격 가지
넷까지 갔다. 한 달 동안 아무도 몰랐다.

**「이 파일은 공유 안 함」 목록(`.gitignore`)으로는 이 탈을 못 막는다.** 그 목록은
«파일 이름» 을 보고 거르는데, 이번에 샌 것은 `keys.txt` 가 아니라 평범한 `.md`
문서였다. 이름으로는 가릴 수가 없다 — **내용을 봐야 한다.**

그래서 여기서 센다. 새 열쇠가 어떤 파일에 적히든, 커밋되기 전에 빨개진다.

**값은 절대 안 찍는다.** 걸리면 «어느 파일, 몇 개» 만 말한다 — 시험 결과가
로그에 남고 그 로그가 또 새어 나가면 같은 일이 두 번 나는 것이다.
"""
import os
import re
import subprocess
from pathlib import Path

import pytest

뿌리 = Path(__file__).resolve().parents[3]

# 열쇠마다 «그 서비스만 쓰는 머리글» 이 있다. 그 머리글 + 충분히 긴 무작위
# 꼬리를 함께 본다 — 머리글만 보면 문서에 이름만 적어도 걸린다.
무늬 = {
    "OpenAI": re.compile(r"sk-[A-Za-z0-9_-]{20,}"),
    "Apify": re.compile(r"apify_api_[A-Za-z0-9]{20,}"),
    "AWS": re.compile(r"AKIA[0-9A-Z]{16}"),
    "fal": re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}"
                      r"-[0-9a-f]{12}:[0-9a-f]{32}"),
    "구글": re.compile(r"AIza[0-9A-Za-z_-]{30,}"),
    "앤트로픽": re.compile(r"sk-ant-[A-Za-z0-9_-]{20,}"),
    "깃허브": re.compile(r"gh[pousr]_[A-Za-z0-9]{30,}"),
}

# 글자로 열어 볼 것이 아닌 것들. 그림·글꼴·압축은 훑어 봐야 헛일이다.
_안봄 = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".mp4", ".pdf",
        ".ttf", ".otf", ".woff", ".woff2", ".zip", ".ico"}
_큰파일 = 3_000_000


def _따라가는파일들() -> list:
    """**`-z` 로 받는다.** 그냥 받으면 한글 이름이 따옴표와 이스케이프로 와서
    파일을 못 연다 — 실제로 처음엔 1,091개 중 183개만 훑고 「없다」고 할 뻔했다.
    """
    난것 = subprocess.run(["git", "ls-files", "-z"], cwd=뿌리,
                        capture_output=True)
    return [p.decode("utf-8", "replace")
            for p in 난것.stdout.split(b"\0") if p]


def _글파일들() -> list:
    쓸것 = []
    for 이름 in _따라가는파일들():
        길 = 뿌리 / 이름
        if 길.suffix.lower() in _안봄:
            continue
        try:
            if 길.stat().st_size > _큰파일:
                continue
        except OSError:
            continue
        쓸것.append(길)
    return 쓸것


@pytest.mark.skipif(not (뿌리 / ".git").exists(), reason="git 저장소가 아니다")
def test_따라가는_파일에_열쇠가_없다():
    샌것 = {}
    본수 = 0
    for 길 in _글파일들():
        try:
            글 = 길.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        본수 += 1
        for 이름, 정 in 무늬.items():
            몇 = len(정.findall(글))
            if 몇:
                샌것.setdefault(str(길.relative_to(뿌리)), []).append(f"{이름} {몇}개")
    assert 본수 > 100, f"훑은 파일이 {본수}개뿐이다 — 세는 쪽이 고장 났다"
    assert not 샌것, (
        "**열쇠가 새고 있다.** 값은 여기 안 적는다 — 파일을 직접 열어 보라.\n"
        + "\n".join(f"  {어디}: {', '.join(무엇)}" for 어디, 무엇 in 샌것.items())
        + "\n\n지우기 «전에» 그 열쇠부터 폐기·재발급하라 — 히스토리에는 남는다.")


def test_세는_쪽이_진짜로_잡는다(tmp_path):
    """**이 시험이 헛도는지 본다.** 무늬가 틀리면 조용히 늘 초록이 된다."""
    가짜 = {
        "OpenAI": "sk-" + "a1b2c3d4e5" * 3,
        "Apify": "apify_api_" + "Zx9Kq2Lm7P" * 3,
        "AWS": "AKIA" + "ABCD1234EFGH5678",
        "구글": "AIza" + "aB3dE6gH9jK2mN5pQ8sT1vW4yZ7cF0",
        "앤트로픽": "sk-ant-" + "x9y8z7w6v5" * 3,
        "깃허브": "ghp_" + "Ab3Cd6Ef9Gh2Ij5Kl8Mn1Op4Qr7St0",
    }
    for 이름, 값 in 가짜.items():
        assert 무늬[이름].search(값), f"{이름} 무늬가 제 값을 못 잡는다"


def test_평범한_글은_안_걸린다():
    """겁주는 거짓 경보가 잦으면 사람이 시험을 꺼 버린다."""
    괜찮은것 = [
        "환경변수 APIFY_TOKEN 에 넣는다",
        "OPENAI_API_KEY 가 있으면 직접 부른다",
        "sk-짧은건안걸림",
        "AKIA 라고만 적으면",
        "os.environ['FAL_KEY']",
    ]
    for 글 in 괜찮은것:
        for 이름, 정 in 무늬.items():
            assert not 정.search(글), f"«{글}» 이 {이름} 로 잘못 걸렸다"
