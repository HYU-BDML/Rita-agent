# -*- coding: utf-8 -*-
"""**한 번 만든 것은 두 번 안 만든다** — 창고에 담고 꺼내는 한 벌.

사람 지시 2026-09-24. 돈 드는 일 셋이 같은 꼴이다:

| 무엇 | 얼마 | 어디서 |
|---|---|---|
| 글자 읽기 (루나) | 네모당 $0.0002 | `글자읽기` |
| 장식 오리기 (GPT Image) | 장식당 $0.006 | `cutout` |
| 배경판 (GPT Image) | 판당 $0.05 | `merge_labeled` |

셋 다 부르기 **전** 에 창고를 보고, 없을 때만 부르고, 부른 것을 담는다. 세 곳에
베끼면 한 곳만 고치는 사고가 나므로 여기 한 벌로 둔다.

**왜 창고(S3)인가.** 람다는 돌 때마다 디스크가 새로 생긴다 — 로컬에 담으면 다음 판에
없다. 실물: 8일에 구글 비전을 **13,458번**($20) 불렀는데, 게시물 16개를 한 번씩만
읽으면 **480번**이면 될 일이었다.

**열쇠는 «무엇을 넣어 만들었나» 로 만든다.** 네모 이름(id)이 아니라 **좌표**다 —
사람이 네모를 옮겨도 이름은 그대로라, 이름으로 가르면 옛것을 꺼내 쓴다. 좌표가
열쇠라 **바뀐 것만 다시 만든다.**
"""
import hashlib
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config


def _통() -> str:
    """담을 통. **`뿌리덮개` 가 꽂혀 있으면 빈 글자** — 그때는 창고를 안 보고
    그 자리에 담는다(시험). `BUCKET` 을 지워서 막으면 그 환경변수를 쓰는 다른
    시험이 깨진다(실물 2026-09-24: `test_틀이름지키기` 일곱이 빨개졌다)."""
    if 뿌리덮개:
        return ""
    return os.environ.get("BUCKET", "").strip()


def 열쇠(칸: str, *조각) -> str:
    """`칸` 밑에 **재료를 그대로 녹인** 열쇠. 같은 재료면 같은 열쇠다.

    좌표가 `100.0` 과 `100` 으로 오가도 같은 열쇠여야 한다 — 아니면 매번 다시 만든다.
    그래서 숫자는 소수 둘째 자리에서 끊어 적는다.
    """
    def 적기(v):
        if isinstance(v, bool):
            return "1" if v else "0"
        if isinstance(v, (int, float)):
            return f"{round(float(v), 2):g}"
        if isinstance(v, (list, tuple)):
            return "[" + ",".join(적기(x) for x in v) + "]"
        if isinstance(v, dict):
            return "{" + ",".join(f"{k}:{적기(v[k])}" for k in sorted(v)) + "}"
        return str(v)

    앞 = [적기(x) for x in 조각[:2]]                  # 게시물·장은 눈에 보이게 둔다
    뒤 = "|".join(적기(x) for x in 조각[2:])
    꼬리 = hashlib.sha1(뒤.encode("utf-8")).hexdigest()[:16] if 뒤 else "one"
    return "/".join([칸] + 앞 + [꼬리])


# **시험이 진짜 데이터 폴더를 안 건드리게 하는 덮개.** 시험이 여기에 임시 자리를
# 꽂는다(`tests/conftest.py`) — 안 꽂으면 시험이 만든 캐시가 저장소에 쌓이고,
# 다음 판에서 그 캐시가 꺼내져 «망을 안 탔는데 답이 나오는» 시험이 된다
# (실물 2026-09-24: `test_글자_네모_읽기는…` 가 둘째 판부터 빨개졌다).
뿌리덮개 = None


def _로컬(열: str) -> Path:
    return Path(뿌리덮개 or config.DATA) / 열


def _로컬읽기(열: str) -> bytes:
    return _로컬(열).read_bytes()


def 꺼내기(열: str):
    """창고에 있으면 바이트로. 없거나 못 읽으면 `None` — 그때는 만들면 그만이다."""
    통 = _통()
    try:
        if 통:
            import boto3  # noqa: PLC0415 — 람다에만 있다
            return boto3.client("s3").get_object(Bucket=통, Key=열)["Body"].read()
        return _로컬읽기(열)
    except Exception:  # noqa: BLE001 — 못 꺼내면 만들면 된다
        return None


def 담기(열: str, 몸: bytes, 갈래: str = "application/octet-stream") -> None:
    """창고에 담는다. **실패하면 예외** — 가려야 할 곳은 `담아두기` 다."""
    통 = _통()
    if 통:
        import boto3  # noqa: PLC0415
        boto3.client("s3").put_object(Bucket=통, Key=열, Body=몸, ContentType=갈래)
        return
    자리 = _로컬(열)
    자리.parent.mkdir(parents=True, exist_ok=True)
    자리.write_bytes(몸)


def 담아두기(열: str, 몸: bytes, 갈래: str = "application/octet-stream") -> None:
    """담다 실패해도 분석을 안 죽인다 — 창고가 잠깐 안 되는 것과는 다른 일이다."""
    try:
        담기(열, 몸, 갈래)
    except Exception as e:  # noqa: BLE001
        print(f"!! 창고에 못 담았다({열}) — {type(e).__name__}")


def 글꺼내기(열: str):
    몸 = 꺼내기(열)
    if 몸 is None:
        return None
    try:
        return json.loads(몸.decode("utf-8"))
    except Exception:  # noqa: BLE001 — 깨진 것은 없는 것으로 친다
        return None


def 글담기(열: str, 값) -> None:
    # **`default=float` 을 둔다.** 넘파이 숫자(`np.float64`)가 섞여 오면 그냥
    # `json.dumps` 는 죽는다 — 담는 쪽이 재서 만든 값이라 섞이기 쉽다.
    담기(열, json.dumps(값, ensure_ascii=False, default=float).encode("utf-8"),
       "application/json; charset=utf-8")


def 글담아두기(열: str, 값) -> None:
    try:
        글담기(열, 값)
    except Exception as e:  # noqa: BLE001
        print(f"!! 창고에 못 담았다({열}) — {type(e).__name__}")
