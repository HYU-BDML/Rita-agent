# analyze/fetch_labels.py
"""확정된 게시물의 라벨(사람이 그은 네모)만 내려받는다.

`분석 대기` 상태인 게시물만 고른다 — 확정 버튼을 누른 것이 곧 "이 라벨로
분석해라"라는 뜻이다(web/server/labels.js setConfirm). 받기 전에 `분석중`으로
바꿔둔다: 그래야 사람이 편집하는 중간에 라벨을 읽어가는 일이 없다(웹이
`분석중`일 때 저장을 막는다 — labels.js saveLabels/setConfirm 의 MUST_WAIT).

사용:
    set BOARD_URL=https://cardnews.david112702.workers.dev
    set BOARD_PASSWORD=12345678
    python analyze/fetch_labels.py
"""
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config
from fetch_board import FINAL, TRIES, BoardError, get, settings, token_of

LABELS = config.DATA / "labels"
LABELS.mkdir(parents=True, exist_ok=True)


def labels_path(pid: str) -> Path:
    return LABELS / f"{pid}.json"


def by_index(rows: list[dict]) -> dict[int, dict]:
    """장 번호로 묶는다. 서버가 idx 순으로 주지만, 순서를 믿지 않고 다시 묶는다."""
    return {r["index"]: r for r in rows}


def ready(status: dict) -> list[str]:
    """`분석 대기`인 코드만 고른다. `분석중`인 것은 다른 컴퓨터가 이미 돌리는 중일 수
    있어 다시 집지 않는다."""
    return [pid for pid, s in status.items() if s == "분석 대기"]


def images_missing(have: int, total: int) -> bool:
    """받아둔 그림 수가 총 장수보다 적으면 True.

    앞서 4장까지 받고 5장째에서 실패한 뒤 `분석 실패` → `분석 대기` → 재실행하는
    경우를 놓치지 않으려는 순수 비교다. `any(*.jpg)`처럼 "하나라도 있으면 다 있다고
    본다"를 쓰면 이 경우 나머지 3장을 영영 못 받는다.
    """
    return have < total


def _set_state(base: str, pw: str, pid: str, state: str) -> None:
    _put(f"{base}/api/labels/~run/{pid}", pw, {"state": state})


def _put(url: str, pw: str, body: dict) -> None:
    """PUT 은 fetch_board.get() 이 못 하는 모양이라 여기서 따로 만든다.

    get() 과 같은 이유로 재시도한다 — 이 백엔드는 몇 번에 한 번은 반드시 실패한다고
    fetch_board.get() 이 이미 밝혀둔 것과 같은 서버다. 응답만 유실되고 서버 쪽
    state 는 이미 바뀌었을 수 있지만, setRun 은 같은 state 를 다시 보내도 결과가
    같은 멱등 연산이라(web/server/labels.js) 다시 보내도 안전하다.
    """
    data = json.dumps(body).encode("utf-8")
    why = ""
    for n in range(TRIES):
        try:
            req = urllib.request.Request(
                url,
                data=data,
                method="PUT",
                headers={
                    "Authorization": f"Bearer {token_of(pw)}",
                    "User-Agent": "Mozilla/5.0",
                    "Content-Type": "application/json",
                },
            )
            with urllib.request.urlopen(req, timeout=30) as r:
                r.read()
            return
        except urllib.error.HTTPError as e:
            why = f"HTTP {e.code}"
            if e.code in FINAL:
                break
        except Exception as e:  # 시간 초과·연결 끊김 따위
            why = type(e).__name__
        if n < TRIES - 1:
            time.sleep(1.5 * (n + 1))
    raise BoardError(why or "상태를 바꾸지 못했다")


def claim(pid: str) -> None:
    """`분석중`으로 바꾼다 — 웹이 이 순간부터 이 게시물의 편집을 막는다."""
    base, pw = settings()
    _set_state(base, pw, pid, "분석중")


def finish(pid: str, ok: bool) -> None:
    """끝나면 `분석 끝`, 중간에 실패하면 `분석 실패`로 바꾼다.

    실패했다고 `분석중`에 그대로 두면 사람이 영영 고치거나 다시 돌릴 수 없다
    (afterEdit 이 `분석중`만은 절대 안 풀어준다).
    """
    base, pw = settings()
    _set_state(base, pw, pid, "분석 끝" if ok else "분석 실패")


def photo_paths(slides: list[str]) -> list[str]:
    """영상 장(.mp4)을 뺀 사진 장 경로만 남긴다.

    label.html 이 "영상 장은 라벨링 대상이 아니다"라고 명시하므로 받을 대상도
    사진 장뿐이어야 한다. slideCount 를 그대로 total 로 쓰면 영상 장까지 세게
    되는데, 영상 장은 절대 .jpg 로 못 채우므로 images_missing() 이 영원히 True
    로 남아 매번 실패한다(라벨은 이미 받았는데도 버려짐) — 실측으로 걸린 문제.

    picks.js 의 slidesOf() 가 slide_kinds 를 이미 확장자에 반영해서 내려주므로
    (없거나 길이가 안 맞으면 전부 .jpg 로 본다), 여기서는 그 결과에서 .jpg 만
    고르면 된다 — 서버와 같은 로직을 다시 만들 필요가 없다.
    """
    return [s for s in slides if s.endswith(".jpg")]


def _photo_slides(base: str, pw: str, pid: str) -> list[str]:
    """picks 표에서 이 게시물의 사진 장 경로 목록을 가져온다.

    GET /api/labels/<id> 는 사람이 실제로 무언가 그은 장만 돌려준다(annotations
    행은 저장할 때 생긴다 — saveLabels). 빈 장을 하나라도 건너뛰면 len(rows) 가
    총 장수보다 작게 나온다. picks 표의 slides 는 실제로 창고에 들어간 장 전부를
    올바른 확장자로 준다 — 여기서 진짜 목록을 얻는다.
    """
    cards = json.loads(get(f"{base}/api/picks", pw).decode("utf-8"))
    for c in cards:
        if c["id"] == pid:
            return photo_paths(c["slides"])
    raise BoardError(f"{pid} 가 공동 목록에 없다")


def _opens_ok(path: Path) -> bool:
    """PIL로 실제 픽셀까지 읽어봐야 진짜 그림인지 안다.

    Image.open() 은 게으르다 — JPEG 은 SOF 마커(파일 앞쪽)까지만 보고 .size 를
    채운 뒤 픽셀 디코드는 미룬다. 그래서 .size 만 보면 스캔 데이터 중간이 잘린
    파일도 그냥 통과한다(실측 재현: 진짜 jpg를 60%만 남기고 잘라도 .size 는
    (200, 200)으로 멀쩡히 나온다 — get() 이 몇 번에 한 번 겪는다는 그 실패는
    보통 헤더가 아니라 이 본문 어딘가에서 끊긴다). .load() 를 불러야 실제 디코드가
    돌아가서 "image file is truncated"가 난다.
    """
    try:
        with Image.open(path) as im:
            im.load()
        return True
    except Exception:
        return False


def _fill_images(base: str, pw: str, pid: str, paths: list[str]) -> str:
    """모자란 사진 장을 채워 받는다. 실패 이유를 돌려주고, 성공하면 빈 문자열이다.

    fetch_board.one_card() 를 그대로 쓰지 않는다 — one_card() 는 넘긴 목록 순서로
    01,02,...를 다시 매기는데, 영상 장을 걸러낸 목록을 넘기면(예: 1장이 영상이면
    사진은 2·3장) 번호가 밀려서 02.jpg 가 01.jpg 로 잘못 저장된다. 그러면 라벨의
    index 와 그림 파일 번호가 어긋난다. 그래서 경로에 이미 박힌 실제 파일명을
    그대로 쓴다.

    "받고 나서 열어본다" 검사는 one_card() 와 똑같은 모양으로 옮긴다 — 이미 있던
    파일도(이전 실행에서 깨진 채로 남았을 수 있어서) 매번 다시 열어본다. 게시물당
    최대 30장(picks.js 의 MAX_SLIDES)이라 이 정도 검사는 비싸지 않다 — 300~400장
    묶음 동기화(fetch_board.main())와는 규모가 다르다.
    """
    d = config.IMAGES / pid
    d.mkdir(parents=True, exist_ok=True)
    for path in paths:
        name = path.rsplit("/", 1)[-1]  # 예: "03.jpg" — 실제 장번호 그대로 쓴다
        dst = d / name
        if not (dst.exists() and dst.stat().st_size > 1000):
            try:
                data = get(base + path, pw)
            except BoardError as e:
                return f"{name} — {e}"
            # 확장자를 믿지 않는다. 오류 페이지를 그림으로 저장해두면 뒤에서 터진다.
            if data[:2] != b"\xff\xd8" and data[:4] != b"\x89PNG":
                return f"{name} — 그림이 아니다"
            dst.write_bytes(data)
        if not _opens_ok(dst):
            dst.unlink(missing_ok=True)  # 깨진 파일을 남기면 다시 돌려도 계속 걸린다
            return f"{name} — 열리지 않는다. 다시 돌려라"
    return ""


def pull(pid: str) -> dict:
    """라벨을 받아 저장하고, 이미지가 모자라면 채워 받는다. 실패하면(Ctrl+C 포함)
    상태를 `분석 실패`로 남기고 원래 예외를 그대로 올린다 — `분석중`에 갇히는 것을
    막는다."""
    base, pw = settings()
    try:
        rows = json.loads(get(f"{base}/api/labels/{pid}", pw).decode("utf-8"))
        paths = _photo_slides(base, pw, pid)
        # images_missing() 이 False(장수가 맞음)여도 그 중 하나만 깨졌을 수 있다
        # (X4) — 그래서 장수로 거르지 않고 _fill_images() 를 매번 부른다.
        # "받을지"(파일이 이미 있으면 안 받는다)와 "확인할지"(있든 받았든 매번
        # 연다)는 _fill_images() 안에서 이미 나뉘어 있다.
        why = _fill_images(base, pw, pid, paths)
        if why:
            raise BoardError(why)
        doc = by_index(rows)
        labels_path(pid).write_text(
            json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        return doc
    except BaseException:
        # Exception 이 아니라 BaseException 을 잡는다 — Ctrl+C(KeyboardInterrupt)는
        # Exception 의 자식이 아니라서, 300~400장짜리 배치 도중 사람이 멈춰도
        # 여기로 들어와야 `분석중`에 갇히지 않는다.
        try:
            finish(pid, False)
        except Exception:
            pass  # 원래 예외를 가리지 않는다 — 같은 네트워크가 죽었으면 이것도 죽는다.
        raise


def main() -> None:
    base, pw = settings()
    status = json.loads(get(f"{base}/api/labels/~status", pw).decode("utf-8"))
    todo = ready(status)
    print(f"확정된 게시물 {len(todo)}건")
    for pid in todo:
        try:
            claim(pid)
        except BoardError as e:
            # claim 이 못 붙었으면 그 게시물은 아직 `분석 대기` 그대로다 — 다음 걸로 넘어간다.
            print(f"  {pid} 못 잡음 — {e}")
            continue
        except BaseException:
            # Ctrl+C 가 하필 claim 요청 도중(특히 _put 의 재시도 사이 sleep)에 오면,
            # 서버는 이미 `분석중`으로 바꿨는데 여기 코드는 그걸 모른 채 끊길 수 있다.
            # pull() 과 같은 모양으로 최선을 다해 되돌리고, 원래 예외는 그대로 올려
            # 배치를 멈춘다 — Ctrl+C 는 실제로 멈춰야 한다.
            try:
                finish(pid, False)
            except Exception:
                pass
            raise
        try:
            doc = pull(pid)
        except BoardError as e:
            print(f"  {pid} 실패 — {e}")
            continue
        # 여기서는 라벨만 받는다. `분석 끝`은 실제 계량(2~9번 태스크)이 다 끝난
        # 뒤에 그 쪽에서 finish(pid, True)를 불러야 맞다 — 지금 부르면 계량표도
        # 없이 "분석 끝"이라 거짓말하게 된다. 성공해도 `분석중`에 그대로 둔다.
        print(f"  {pid} {len(doc)}장 -> {labels_path(pid)}")


if __name__ == "__main__":
    main()
