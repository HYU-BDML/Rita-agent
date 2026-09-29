# analyze/push_board.py
"""잰 값을 공동 목록에 올린다. 승민님이 슬라이드 옆에서 같이 본다.

계산은 여기(파이썬)에서만 한다. 웹은 보여주기만 한다 — 자 트랙이 OpenCV·SciPy 에
얹혀 있어 브라우저로 옮기면 통째로 다시 만들어야 하고, 분석은 어차피 한 번 돌고
끝나는 일이라 옮겨서 얻는 것이 없다.

**이게 자 트랙이 틀렸을 때 그걸 알아챌 유일한 길이다.** 화면에 "제목 54pt" 라고
떠 있는데 눈으로 보기에 더 크면, 그 자리에서 측정이 틀린 것을 안다.

사용:
    set BOARD_URL=https://cardnews.david112702.workers.dev
    set BOARD_PASSWORD=12345678
    python analyze/push_board.py
"""
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config
from fetch_board import BoardError, settings, token_of


def put(url: str, pw: str, body: bytes) -> dict:
    req = urllib.request.Request(
        url, data=body, method="PUT",
        headers={"Authorization": f"Bearer {token_of(pw)}",
                 "Content-Type": "application/json; charset=utf-8",
                 # 파이썬 기본 User-Agent 는 Cloudflare 가 워커 앞에서 403 으로 막는다
                 # (fetch_board.py 의 get() 참고).
                 "User-Agent": "Mozilla/5.0"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        # 서버가 왜 막았는지 본문에 적어 보낸다. 그걸 그대로 보여준다.
        try:
            why = json.loads(e.read().decode("utf-8")).get("why", "")
        except Exception:
            why = ""
        raise BoardError(f"HTTP {e.code}{' — ' + why if why else ''}") from None
    except Exception as e:
        raise BoardError(type(e).__name__) from None


def main() -> None:
    base, pw = settings()
    files = sorted(config.MEASURES.glob("*.json"))
    if not files:
        raise SystemExit("measures/ 가 비었다. 먼저 `python analyze/merge.py` 를 돌려라.")

    ok, bad = 0, []
    for p in files:
        pid = p.stem
        try:
            res = put(f"{base}/api/measures/{pid}", pw, p.read_bytes())
        except BoardError as e:
            bad.append((pid, str(e)))
            print(f"  {pid} 실패 — {e}")
            continue
        ok += 1
        print(f"  {pid} {res.get('slides', '?')}장")

    print(f"\n{ok}/{len(files)}건 올렸다.")
    if bad:
        print("못 올린 것:")
        for pid, why in bad:
            print(f"  {pid}  {why}")
        # 서버는 담긴 게시물인지 대조하지 않는다(handlePutMeasure 에 picks 참조가 없다).
        # 그래서 코드를 잘못 적어도 404 가 아니라 200 이 오고 주인 없는 줄만 남는다.
        print("\n401 이면 암호가 틀렸고, 400 이면 보낸 JSON 이 모양에 안 맞는 것이다"
              " — 이유는 위에 그대로 찍혀 있다.")
        print("게시물 코드를 잘못 적으면 서버는 그냥 받는다. 공동 목록에 안 보이면"
              " 코드 철자부터 확인해라.")
    else:
        print("공동 목록에서 카드를 열면 슬라이드마다 잰 값이 같이 보인다.")


if __name__ == "__main__":
    main()
