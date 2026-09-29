# analyze/자리판.py
"""틀의 **사진 자리에 번호를 찍은 판**을 굽는다.

굽기 전 미리보기에서 사람이 사진마다 「어떤 사진」인지 적는다(사람 지시
2026-09-22). 그런데 한 장에 사진 자리가 여럿일 수 있다 — 배경 한 장에 안쪽
사진 하나면 둘이다. **번호만 적어 두면 그 번호가 장 어디인지 알 수 없다.**
그래서 장을 가로 한 줄로 늘어놓고 사진 자리에 「사진1」·「사진2」를 찍어 준다.

**배경 사진도 사진 자리다.** 미리보기도 사진 만드는 쪽도 `배경자리` 를 빼지
않는다 — AI 가 그림을 만들어 넣는 자리가 맞다. 다만 장 전체가 네모라 굵게
그으면 장 테두리와 똑같아 보이므로, 테두리는 흐리게 두고 번호로 가른다.

**번호는 그 장 «안에서» 센다.** 화면이 「3장 사진2」로 부르기 때문이다
(`web/lib/미리보기.js` 의 `사진칸`) — 판 전체를 통틀어 세면 짝이 안 맞는다.

쓰는 데가 둘이다.

- 분석이 끝날 때 람다가 부른다 — 새 틀은 저절로 생긴다
- 이미 있는 틀은 `python analyze/자리판.py` 로 한 번 채운다
"""
import io
import json
import os
import sys
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config

# **`web/lib/미리보기.js` 의 `사진종류` 와 같아야 한다.** 갈리면 화면에 뜬 번호와
# 판에 찍힌 번호가 어긋난다.
사진종류 = ("사진", "인물")

# 색은 **라벨 화면과 같아야 한다**(`web/lib/label.js` 의 COLORS). 다른 색을 쓰면
# 라벨할 때 본 색과 갈려서 「이게 뭐였더라」가 된다.
주황 = (242, 169, 59)      # 사진
청록 = (44, 183, 177)      # 글자
한장폭 = 420
틈 = 12
바닥띠 = 46
글꼴길 = Path(__file__).resolve().parent / "fonts" / "GmarketSansTTFBold.ttf"


def 사진자리들(장: dict) -> list:
    """틀 한 장에서 사진 자리만 «차례대로» 고른다. 도형·글자는 뺀다."""
    return [r for r in (장.get("장식영역") or []) if r.get("종류") in 사진종류]


def _딱지(d, 네모, 배, 색, 글, 글꼴, 흐리게=False) -> None:
    """자리에 테두리를 긋고 왼쪽 위에 이름표를 붙인다.

    **흐리게** 는 장 전체를 덮는 자리(배경 사진)에 쓴다 — 굵게 그으면 장 테두리와
    똑같아 보여서 자리가 있는 줄도 모른다.
    """
    x0, y0, x1, y1 = [v * 배 for v in 네모]
    d.rectangle([x0, y0, x1, y1], outline=색 + ((90,) if 흐리게 else (255,)),
                width=max(3, round((4 if 흐리게 else 9) * 배)))
    여백 = round(14 * 배)
    왼, 위, 오, 아래 = d.textbbox((0, 0), 글, font=글꼴)
    bx, by = x0 + 여백, y0 + 여백
    d.rectangle([bx, by, bx + (오 - 왼) + 여백 * 2, by + (아래 - 위) + 여백 * 2],
                fill=색 + (235,))
    d.text((bx + 여백 - 왼, by + 여백 - 위), 글, font=글꼴, fill=(255, 255, 255))


def 한장그리기(그림: Image.Image, 장: dict) -> Image.Image:
    """장 하나에 사진 자리와 글자 자리를 얹는다.

    **글자 자리도 그린다**(사람 지시 2026-09-22: 「제목 본문은 어디들어감?」).
    미리보기는 글을 순서대로 늘어놓기만 해서, 그것이 큰 제목 자리인지 아래 본문
    자리인지 알 길이 없었다.
    """
    판 = 그림.convert("RGB")
    배 = 판.width / config.CANVAS_W        # 틀 좌표는 1080 기준이다
    d = ImageDraw.Draw(판, "RGBA")
    글꼴 = ImageFont.truetype(str(글꼴길), max(40, round(64 * 배)))
    # **글자를 먼저 그린다.** 사진 자리가 글자 자리를 품는 일이 흔한데(배경 사진이
    # 장 전체다), 나중에 그린 것이 위로 와야 사진 번호가 안 가린다.
    for g in 장.get("글자슬롯") or []:
        네모 = g.get("box")
        if 네모 and len(네모) == 4:
            _딱지(d, 네모, 배, 청록, str(g.get("위계") or "글자"), 글꼴)
    for n, r in enumerate(사진자리들(장), start=1):
        네모 = r.get("box")
        if 네모 and len(네모) == 4:
            _딱지(d, 네모, 배, 주황, f"사진{n}", 글꼴, 흐리게=bool(r.get("배경자리")))
    return 판


def 굽기(그림들: list, 틀: dict) -> bytes:
    """장 그림들과 틀을 받아 가로 한 줄 판을 JPEG 로 굽는다.

    `그림들` 은 장 차례대로다. 틀의 `슬라이드[i]` 와 짝지어 쓴다 — 틀보다 그림이
    많거나 적으면 **짧은 쪽에 맞춘다.** 한 장이 어긋났다고 판을 통째로 버리는
    것보다 낫다.
    """
    장들 = 틀.get("슬라이드") or []
    쪽들 = []
    for i, 그림 in enumerate(그림들[:len(장들)]):
        칠한것 = 한장그리기(그림, 장들[i])
        높이 = max(1, round(칠한것.height * 한장폭 / 칠한것.width))
        쪽들.append((i + 1, 칠한것.resize((한장폭, 높이), Image.LANCZOS),
                     len(사진자리들(장들[i])), len(장들[i].get("글자슬롯") or [])))
    if not 쪽들:
        raise ValueError("그릴 장이 없다")

    칸높이 = max(p.height for _, p, _, _ in 쪽들)
    판 = Image.new("RGB",
                  (len(쪽들) * 한장폭 + (len(쪽들) - 1) * 틈, 칸높이 + 바닥띠),
                  (255, 255, 255))
    d = ImageDraw.Draw(판)
    작은글꼴 = ImageFont.truetype(str(글꼴길), 26)
    for j, (n, 쪽, 사진수, 글수) in enumerate(쪽들):
        x = j * (한장폭 + 틈)
        판.paste(쪽, (x, 0))
        낱 = [f"사진 {사진수}", f"글 {글수}"]
        d.text((x + 6, 칸높이 + 12), f"{n}장 — " + " · ".join(낱),
               font=작은글꼴, fill=(60, 60, 60))
    통 = io.BytesIO()
    판.save(통, format="JPEG", quality=85, optimize=True)
    return 통.getvalue()


def 창고주소(코드: str) -> str:
    지역 = os.environ.get("AWS_REGION", "ap-northeast-2")
    return (f"https://{os.environ['BUCKET']}.s3.{지역}.amazonaws.com"
            f"/templates/slots/{코드}.jpg")


def 올리기(창고, 코드: str, 몸: bytes) -> str:
    """**열쇠를 아스키로 둔다**(`templates/slots/…`) — 한글 열쇠에서 나온 주소는
    그림이 안 받아진다(`lambda_분석._한판올리기` 가 겪은 그 탈이다)."""
    창고.put_object(Bucket=os.environ["BUCKET"], Key=f"templates/slots/{코드}.jpg",
                   Body=몸, ContentType="image/jpeg")
    return 창고주소(코드)


# ── 이미 있는 틀 채우기 (한 번 돌리고 끝) ──────────────────────────


def _장그림받기(base: str, pw: str, 코드: str) -> list:
    from fetch_board import get  # noqa: PLC0415

    카드들 = json.loads(get(f"{base}/api/picks?type=cardnews", pw).decode("utf-8"))
    카드 = next((c for c in 카드들 if c["id"] == 코드), None)
    if not 카드:
        return []
    난것 = []
    for 주소 in [s for s in (카드.get("slides") or []) if s.endswith(".jpg")]:
        u = 주소 if 주소.startswith("http") else base + 주소
        요 = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"})
        난것.append(Image.open(io.BytesIO(urllib.request.urlopen(요, timeout=30).read())))
    return 난것


def main() -> None:
    """창고의 틀을 훑어 자리판을 굽고, 틀 JSON 과 명단에 주소를 써넣는다.

    **명단은 다시 짓지 않고 그 줄에 칸만 더한다.** 다시 지으면 `만든날` 이
    오늘로 덮여 틀 차례가 통째로 뒤집힌다(`틀목록줄` 이 `_오늘()` 을 쓴다).
    """
    import boto3  # noqa: PLC0415

    from fetch_board import settings  # noqa: PLC0415

    base, pw = settings()
    통 = os.environ["BUCKET"]
    창고 = boto3.client("s3")

    명단 = json.loads(창고.get_object(Bucket=통, Key="templates/목록.json")["Body"].read())
    for 줄 in 명단:
        코드 = 줄.get("코드") or ""
        if not 코드:
            continue
        try:
            틀 = json.loads(창고.get_object(
                Bucket=통, Key=f"templates/{코드}.json")["Body"].read())
            그림들 = _장그림받기(base, pw, 코드)
            if not 그림들:
                print(f"-- {코드}: 장 그림이 없다 (게시판에 없는 틀) — 건너뛴다")
                continue
            주소 = 올리기(창고, 코드, 굽기(그림들, 틀))
            틀["자리판"] = 주소
            창고.put_object(Bucket=통, Key=f"templates/{코드}.json",
                          Body=json.dumps(틀, ensure_ascii=False, indent=1).encode("utf-8"),
                          ContentType="application/json; charset=utf-8")
            줄["자리판"] = 주소
            자리수 = sum(len(사진자리들(s)) for s in (틀.get("슬라이드") or []))
            print(f"++ {코드} · {len(그림들)}장 · 사진 자리 {자리수}개")
        except Exception as e:  # noqa: BLE001 — 하나가 막혀도 나머지는 채운다
            print(f"!! {코드}: {e}")
    창고.put_object(Bucket=통, Key="templates/목록.json",
                  Body=json.dumps(명단, ensure_ascii=False, indent=1).encode("utf-8"),
                  ContentType="application/json; charset=utf-8")
    print(f"++ 명단에 자리판 주소를 실었다 — 틀 {len(명단)}벌")


if __name__ == "__main__":
    main()
