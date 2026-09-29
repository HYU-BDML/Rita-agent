# analyze/fetch_board.py
"""공동 목록을 통째로 내려받아 2단계 분석이 쓸 모양으로 만든다.

기존의 collect.py(다시 검색) · download.py(인스타에서 받기) · pick.py(고르기)를
한꺼번에 대신한다. 인스타를 다시 부르지 않으므로 크레딧이 안 나가고,
웹에서 고른 것과 분석 대상이 반드시 같아진다.

사용:
    set BOARD_URL=https://cardnews.david112702.workers.dev
    set BOARD_PASSWORD=12345678
    python analyze/fetch_board.py
"""
import hashlib
import hmac
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config

TRIES = 3
# 다시 물어봐야 답이 같은 것들. 여기 걸리면 즉시 포기한다.
FINAL = (401, 403, 404)


class BoardError(Exception):
    pass


def settings() -> tuple[str, str]:
    url = os.environ.get("BOARD_URL", "").strip().rstrip("/")
    pw = os.environ.get("BOARD_PASSWORD", "").strip()
    if not url or not pw:
        raise SystemExit("BOARD_URL 과 BOARD_PASSWORD 환경변수를 넣어라.")
    return url, pw


def token_of(pw: str) -> str:
    """서버(web/server/auth.js)와 같은 식으로 암호에서 출입증을 계산한다."""
    return hmac.new(pw.encode("utf-8"), b"cardnews-board-v1", hashlib.sha256).hexdigest()


def get(url: str, pw: str) -> bytes:
    """파이썬은 쿠키를 못 쓴다. 암호 그대로를 보내면 Bearer 통로가 다시 찍어보기 문이
    되므로, 서버와 같은 값(출입증)을 계산해 헤더에 담아 들어간다.

    User-Agent 를 반드시 넣는다. 파이썬 기본값(Python-urllib/3.x)은 Cloudflare
    가 봇으로 보고 워커에 닿기도 전에 403 으로 막는다(실측 확인 — 우리 워커는
    인증 실패를 401 로만 낸다. 403 이 오면 이 요청이 코드에 도달조차 못 한 것).

    슬라이드가 300~400장이라 한 번쯤은 반드시 실패한다. 그때 통째로 죽으면
    posts.json 이 아예 안 만들어진다 — 그래서 몇 번 다시 해본다.
    """
    why = ""
    for n in range(TRIES):
        try:
            req = urllib.request.Request(url, headers={
                "Authorization": f"Bearer {token_of(pw)}",
                "User-Agent": "Mozilla/5.0",
            })
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            why = f"HTTP {e.code}"
            if e.code in FINAL:
                break
        except Exception as e:  # 시간 초과·연결 끊김 따위
            why = type(e).__name__
        if n < TRIES - 1:
            time.sleep(1.5 * (n + 1))
    raise BoardError(why or "받지 못했다")


def one_card(card: dict, base: str, pw: str) -> tuple[dict | None, str]:
    """카드 하나를 통째로 받는다. 한 장이라도 끝내 못 받으면 그 카드를 버린다.

    구멍 난 카드를 넘기면 뒤 단계가 없는 장을 세게 된다. 빠진 채로 분석하느니
    빼고 이름을 남기는 편이 낫다.
    """
    d = config.IMAGES / card["id"]
    d.mkdir(parents=True, exist_ok=True)
    slides = []
    for i, path in enumerate(card["slides"], 1):
        dst = d / f"{i:02d}.jpg"
        if not (dst.exists() and dst.stat().st_size > 1000):
            try:
                data = get(base + path, pw)
            except BoardError as e:
                return None, f"{i:02d}.jpg — {e}"
            # 확장자를 믿지 않는다. 오류 페이지를 그림으로 저장해두면 뒤에서 터진다.
            if data[:2] != b"\xff\xd8" and data[:4] != b"\x89PNG":
                return None, f"{i:02d}.jpg — 그림이 아니다"
            dst.write_bytes(data)
        try:
            with Image.open(dst) as im:
                w, h = im.size
        except Exception as e:
            dst.unlink(missing_ok=True)  # 깨진 파일을 남기면 다시 돌려도 계속 걸린다
            return None, f"{i:02d}.jpg — 열리지 않는다 ({type(e).__name__}). 다시 돌려라"
        # 이 주소는 인스타가 아니라 우리 서버다. 뒤 단계는 로컬 파일만 쓰므로 기록용이다.
        slides.append({"url": base + path, "width": w, "height": h})
    return {
        "id": card["id"],
        "url": card["url"],
        "author": card["author"],
        "caption": card["caption"],
        "date": card["postedAt"],
        "likes": card["likes"],
        "comments": card["comments"],
        "slide_count": len(slides),
        "slides": slides,
    }, ""


def main() -> None:
    base, pw = settings()
    cards = json.loads(get(f"{base}/api/picks", pw).decode("utf-8"))
    print(f"공동 목록 {len(cards)}건")

    posts, bad = [], []
    for i, card in enumerate(cards, 1):
        post, why = one_card(card, base, pw)
        if post is None:
            bad.append((card["id"], why))
            print(f"  {i}/{len(cards)} {card['id']} 건너뜀 — {why}")
            continue
        posts.append(post)
        print(f"  {i}/{len(cards)} {post['id']} {post['slide_count']}장")

    # 한 건이 실패해도 받은 것까지는 반드시 적어둔다. 그래야 다시 돌릴 때 이어진다.
    (config.DATA / "posts.json").write_text(
        json.dumps(posts, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    # 공동 목록에 담긴 것이 곧 고른 것이다. 고르는 단계가 따로 없다.
    (config.DATA / "selected.txt").write_text(
        "\n".join(p["id"] for p in posts), encoding="utf-8"
    )

    total = sum(p["slide_count"] for p in posts)
    print(f"\nposts.json {len(posts)}건 · selected.txt {len(posts)}건 · 슬라이드 {total}장")
    if bad:
        print(f"\n못 받은 {len(bad)}건 — 다시 돌리면 받아둔 것은 건너뛰고 이어서 한다:")
        for pid, why in bad:
            print(f"  {pid}  {why}")
    if len(posts) < 30:
        print("\n30건이 안 된다. 웹에서 더 담아라.")


if __name__ == "__main__":
    main()
