# -*- coding: utf-8 -*-
"""표지 배경 한 장 — 인물 사진을 받아 구글로 합성한다.

**돈이 나간다.** `gemini-3-pro-image` 는 장당 $0.134 다.

    브랜드  →  위키미디어에서 CEO 사진 (procure/faces.py)
            →  밈 그림·얼굴 사진을 base64 로 요청에 박는다
            →  gemini-3-pro-image 로 합성 (4:5 로 바로 온다)
            →  1080x1350 배경 한 장

**fal 은 뺐다 (2026-08-19).** 원래 fal 로 이 모델을 샀는데 — `nano-banana-pro` 가
곧 `gemini-3-pro-image` 다, fal 은 중개상이었다 — 잔액이 떨어져서 구글 직접으로
옮겼다. 셋을 나란히 뽑아 대보니 fal 판과 구글 판이 사실상 같았고, OpenAI 판은
**밈의 모자를 지웠다.** 그래서 구글이 기본값이고 OpenAI 는 급할 때 쓰는 뒷길이다.

**만드는 것은 그림뿐이다.** 예전엔 영상도 만들었는데(fal Wan 2.5) 이제 안 만든다.
**원문에서 «가져오는» 영상은 그대로 쓴다** — 없앤 건 만드는 쪽이다.

**참조 사진은 「얼굴 신분증」이지 자세 견본이 아니다.** 위키미디어에 있는 CEO 사진은
무대에서 말하는 정면 컷 한 장뿐이다. 자세·표정·옷은 프롬프트가 만든다.

실존 인물 합성은 구글 직접으로도 막히지 않는다(실측 2026-08-19).

열쇠는 코드에 없다. 환경변수 `GEMINI_API_KEY` 로만 받는다(`deploy.sh` 가 넣어 준다).
"""
import json
import re
import uuid
from pathlib import Path

import requests

from generate import _열쇠

TMP = Path("/tmp")

# 규칙표 §4 「프롬프트 네 줄 공식」의 ③번. 대본이 이걸 빠뜨려도 여기서 붙인다.
# 헤드라인이 하단에 흰 글자로 얹히니(template.json 표지 lines_y 932/1058)
# 거기가 밝으면 글자가 죽는다.
조판제약 = (
    "Vertical 4:5 composition.\n\n"
    # ── 아래 띠 ────────────────────────────────────────────────
    # «어둡게 하라» 고만 했더니 **판 전체가 어두워졌다** — 다섯 장이 전부 남색·검정에
    # 청록이었다(실측 2026-08-20). 원본은 하늘색·빨강·분홍도 쓴다. 그래서 «어둡게»
    # 대신 «그 자리가 어떻게 생겼는지» 로 적는다.
    "The bottom 45 percent of the frame is one calm, unbroken field — a deep shadow, "
    "a plain wall, open water, an unlit road, or a single saturated colour deepening "
    "toward the bottom edge. It stays dark enough that white text reads on it. "
    "The subject sits entirely above that band.\n\n"
    # ── 화면에 있어야 할 것 ────────────────────────────────────
    # 원본 18장은 예외 없이 주인공이 «하나» 이고 배경이 «한 겹» 이다.
    # docs/표지글_쓰기.md §4 걸음 4·5 에 근거가 있다.
    "Exactly one hero fills the frame — one person, one object, or one character "
    "(a pair only when the idea needs two), taking up more than half the picture. "
    "Behind it lies a single background layer: one flat colour, one simple gradient, "
    "or one softly blurred real space. Every surface in the scene — screens, signs, "
    "posters, packaging, clothing — is blank and unmarked, showing only shape, "
    "texture and colour.\n\n"
    # ── 글자 ──────────────────────────────────────────────────
    # **부정문을 긍정문으로 바꿨다.** 구글 문서가 「없다」 대신 「어떻게 생겼다」 로
    # 쓰라고 못 박는다 — 모델은 «없음» 을 잘 못 그린다. 실제로 「Nothing else in the
    # frame」 을 적고도 아이콘이 여섯 개 뜬 그림이 나왔다(2026-08-20).
    "The picture is wordless: every surface that could carry writing is left clean. "
    "A single readable character anywhere in the image is a failure. "
    # **스톡 워터마크가 실제로 묻어 나왔다** (2026-08-21) — 헤드라인 뒤에
    # 흐릿한 영문이 깔렸다. 모델이 학습한 스톡 사진의 워터마크를 재현한 것이라
    # 「글자를 그리지 마라」 만으로는 안 걸린다. 워터마크를 따로 못 박는다.
    "The image carries no watermark, no stock-photo overlay, no signature "
    "and no logo band across the picture.\n\n"
    # ── 팔레트 ────────────────────────────────────────────────
    # 청록(#00E1FF)은 «헤드라인 강조색» 이지 그림 팔레트가 아니다. 1차에서 다섯
    # 프롬프트에 전부 teal 이 들어가 다섯 장이 같은 톤이 됐다.
    "Choose the palette from the scene itself. Bright grounds are welcome — "
    "sky blue, crimson, pink, warm cream, orange all appear in this series. "
    "Reserve cyan for the overlaid text, not for the artwork."
)
"""45% 인 이유: 40% 로 했더니 헤드라인은 살았는데 그 위 「Weekly AI」 줄(y842)이
밝은 데 걸려 묻혔다(실측 2026-08-19). y842 는 위에서 62% 지점이라 38% 여야 덮인다.

**글자 금지를 이렇게 길게 쓴 이유.** 처음엔 `No lettering anywhere in the image.`
한 줄이었는데 모델이 배경에 한글을 그려 넣었고, 우리 헤드라인과 **겹쳐서** 나왔다
(실측 2026-08-19). 얼굴 바꾸기와 같은 교훈이다 — **한 줄 지시로는 안 되고,
무엇이 실패인지 못박아야 한다.** 특히 화면·간판처럼 «원래 글자가 있을 자리» 를
따로 지목해야 한다."""

GEMINI_MODEL = "gemini-3-pro-image"
"""기본값. `nano-banana-pro` 라는 이름으로 팔리던 그 모델이다.

OpenAI 쪽과 다른 점.
- **참조 그림을 base64 로 요청에 박는다.** 저장소에 올릴 필요가 없다.
- **줄서기가 없다.** 바로 답이 온다.
- **4:5 를 받는다.** OpenAI 처럼 잘라 쓸 필요가 없다.

**열쇠를 주소에 넣지 않는다.** `?key=` 로도 되지만 그러면 열쇠가 명령줄·로그에
남는다. `x-goog-api-key` 헤더로만 보낸다.
"""

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent"


def gemini_image(prompt: str, 참조: list, 폴더: Path, 이름: str) -> Path:
    """글 + 참조 그림으로 한 장. 4:5 세로로 바로 받는다."""
    import base64
    조각 = [{"text": prompt[:4000]}]
    for p in 참조:
        p = Path(p)
        종류 = "image/png" if p.suffix.lower() == ".png" else "image/jpeg"
        조각.append({"inline_data": {"mime_type": 종류,
                                     "data": base64.b64encode(p.read_bytes()).decode()}})
    r = requests.post(GEMINI_URL % GEMINI_MODEL,
                      headers={"x-goog-api-key": _열쇠("GEMINI_API_KEY"),
                               "Content-Type": "application/json"},
                      json={"contents": [{"parts": 조각}],
                            "generationConfig": {"imageConfig": {"aspectRatio": "4:5"}}},
                      timeout=600)
    if r.status_code >= 400:
        raise RuntimeError(f"Gemini 그림 실패 HTTP {r.status_code}: {r.text[:400]}")
    d = r.json()
    난것 = None
    for c in d.get("candidates") or []:
        for part in (c.get("content") or {}).get("parts") or []:
            데이터 = (part.get("inline_data") or part.get("inlineData") or {}).get("data")
            if 데이터:
                난것 = 데이터
                break
    if not 난것:
        raise RuntimeError(f"Gemini 결과에 그림이 없다: {json.dumps(d, ensure_ascii=False)[:400]}")
    폴더.mkdir(parents=True, exist_ok=True)
    p = 폴더 / f"{이름}.png"
    p.write_bytes(base64.b64decode(난것))
    return p


CAPTION_MODEL = "gemini-2.5-flash"
"""헤드라인 자리 하나만 고르는 것이라 그림 생성 모델보다 훨씬 싼 걸 쓴다 —
입력 $0.30/1M 토큰(2026-08-23 모델 페이지 확인), 사진 한 장에 몇백 토큰이라
사실상 공짜에 가깝다.

**flash-lite 가 아니라 flash 다 (2026-08-23, 실측 뒤 올렸다).** 취업 밈짤
표지 하나를 두고도 lite 는 "상단"·"하단"이 실행마다 갈렸다 — 같은 사진, 같은
프롬프트인데 판 하나는 헤드라인이 자막 위에 그대로 얹혀 나갔다. flash 로
올리고 온도도 0으로 고정하니(아래) 그 사진에서는 매번 같은 답이 나왔다."""


def 헤드라인_자리(image_path: Path) -> str:
    """표지 사진 위에 헤드라인 두 줄을 얹을 것이다 — 사진에 이미 박힌 자막(캡션)을
    피해 상단/하단 어디로 보낼지 비전 모델에게 **직접** 묻는다.

    **자막 위치만 읽어다 기계가 상/하로 다시 나누지 않는다.** 자막이 화면 중간에
    걸친 사진처럼 애매한 경우까지 사람이 미리 정한 규칙표로는 못 채운다 — 사용자
    지시(2026-08-23): "그걸 비전으로 판단하라". 그래서 질문 자체를 «자막이 어디
    있나»가 아니라 «헤드라인을 어디 둘까»로 던진다.

    **한 줄 JSON 만 강요하지 않는다.** 처음엔 "JSON 한 줄로만" 이라고 못박았는데,
    바로 답부터 뱉게 하니 애매한 사진에서 실행마다 답이 갈렸다(위 CAPTION_MODEL
    주석 참고) — 왜 그런지 한두 문장 먼저 보게 하고 맨 끝 줄에 JSON 을 받으면
    더 안정적이었다. 그래서 응답 안의 **마지막** `{...}` 를 답으로 삼는다.

    실패하면 "하단" — 원래(자막 회피 없는) 자리다. 비전이 막혔다고 판 전체를
    죽이는 것보다, 자막과 좀 겹치더라도 판이 나가는 쪽이 낫다.
    """
    import base64
    프롬프트 = (
        "이 사진은 카드뉴스 표지 배경으로 쓰인다. 사진 위에 흰색 헤드라인 글자 "
        "두 줄과, 글자가 잘 읽히도록 어둡게 까는 그러데이션 띠를 얹을 것이다. "
        "사진에 이미 박혀 있는 자막·캡션·스티커·말풍선 같은 «사진 자체의 글자» 가 "
        "있다면 그게 화면의 어느 부분(위/중간/아래)을 차지하는지 한두 문장으로 "
        "먼저 설명해라. 그다음, 그것과 절대 겹치지 않고 가장 잘 읽히도록 헤드라인을 "
        "화면 상단(위쪽 약 25%)에 둘지 하단(아래쪽 약 45%)에 둘지 골라라. 박힌 "
        "자막이 아래쪽~중간까지 걸쳐 있다면 무조건 '상단' 이다 — 살짝만 걸쳐도 "
        "겹친 것으로 친다. 박힌 글자가 아예 없으면 '하단'을 골라라.\n\n"
        "마지막 줄에 다른 말 없이 JSON 만 적어라: "
        '{"자리": "상단"} 또는 {"자리": "하단"}'
    )
    try:
        종류 = "image/png" if image_path.suffix.lower() == ".png" else "image/jpeg"
        r = requests.post(
            GEMINI_URL % CAPTION_MODEL,
            headers={"x-goog-api-key": _열쇠("GEMINI_API_KEY"),
                     "Content-Type": "application/json"},
            json={"contents": [{"parts": [
                {"text": 프롬프트},
                {"inline_data": {"mime_type": 종류,
                                  "data": base64.b64encode(image_path.read_bytes()).decode()}},
            ]}], "generationConfig": {"temperature": 0}},
            timeout=30)
        r.raise_for_status()
        글 = r.json()["candidates"][0]["content"]["parts"][0]["text"]
        찾은것 = re.findall(r"\{[^{}]*\}", 글)
        자리 = json.loads(찾은것[-1]).get("자리", "").strip()
        return "상단" if 자리 == "상단" else "하단"
    except Exception as e:
        print(f"  (헤드라인 자리 판정 실패 — 하단으로 둔다: {type(e).__name__}: {e})")
        return "하단"


OPENAI_MODEL = "gpt-image-2.5-flare"
"""**2026-09-30 부터 기본값이다** (주간 AI 소식 — 사용자 «제미나이는 gpt로»). 소식 카드 그림과 같은
모델·화질(medium)이다. 예전엔 구글이 막히거나 급할 때만 쓰던 뒷길이었다.

구글과 다른 점 둘.
- **참조 그림을 파일(multipart)로 올린다.** base64 로 박지 않는다.
- **크기는 16의 배수로 준다.** 1080x1350 은 16의 배수가 아니라 같은 4:5 인 1088x1360 으로 받는다.
"""

# 카드(1080x1350)와 같은 4:5 — 16의 배수라 1088x1360. GPT 이미지 2.5 는 16의 배수면 아무 크기나 받는다
# (문서 2026-10-01 확인). 예전엔 «4:5 가 없다» 고 보고 2:3(1024x1536)을 뽑아 위 17% 를 잘랐다.
OPENAI_SIZE = "1088x1360"
OPENAI_QUALITY = "medium"


def openai_image(prompt: str, 참조: list, 폴더: Path, 이름: str) -> Path:
    """그림 경로만 — generate.py 가 이 모양으로 쓴다."""
    return openai_image_사용량(prompt, 참조, 폴더, 이름)[0]


def openai_image_사용량(prompt: str, 참조: list, 폴더: Path, 이름: str) -> tuple:
    """글 + 참조 그림으로 한 장 → (그림 경로, 사용량). **줄서기가 없어 바로 답이 온다.**

    참조 그림(밈·얼굴·로고)이 있으면 «고치기»(edits), 하나도 없으면 «새로 그리기»(generations) —
    고치기는 그림이 없으면 받지 않는다."""
    import base64
    파일들 = []
    for i, p in enumerate(참조):
        p = Path(p)
        종류 = "image/png" if p.suffix.lower() == ".png" else "image/jpeg"
        파일들.append(("image[]", (p.name, p.read_bytes(), 종류)))
    머리 = {"Authorization": f"Bearer {_열쇠('OPENAI_API_KEY')}"}
    if 파일들:
        r = requests.post("https://api.openai.com/v1/images/edits", headers=머리,
                          data={"model": OPENAI_MODEL, "prompt": prompt[:4000],
                                "size": OPENAI_SIZE, "quality": OPENAI_QUALITY, "n": "1"},
                          files=파일들, timeout=600)
    else:
        r = requests.post("https://api.openai.com/v1/images/generations", headers=머리,
                          json={"model": OPENAI_MODEL, "prompt": prompt[:4000],
                                "size": OPENAI_SIZE, "quality": OPENAI_QUALITY, "n": 1},
                          timeout=600)
    if r.status_code >= 400:
        raise RuntimeError(f"OpenAI 그림 실패 HTTP {r.status_code}: {r.text[:400]}")
    답 = r.json()
    # 쓴 토큰 — 주간 AI 소식 새 서버가 한 판에 쓴 돈을 센다(2026-10-01)
    u = 답.get("usage") or {}
    자세히 = u.get("input_tokens_details") or {}
    사용량 = {"입력글토큰": 자세히.get("text_tokens", u.get("input_tokens", 0)),
            "입력그림토큰": 자세히.get("image_tokens", 0), "출력토큰": u.get("output_tokens", 0)}
    첫 = (답.get("data") or [{}])[0]
    폴더.mkdir(parents=True, exist_ok=True)
    p = 폴더 / f"{이름}.png"
    if 첫.get("b64_json"):
        p.write_bytes(base64.b64decode(첫["b64_json"]))
        return p, 사용량
    주소 = 첫.get("url")
    if not 주소:
        raise RuntimeError(f"OpenAI 결과에 그림이 없다: {str(첫)[:300]}")
    with requests.get(주소, timeout=300, stream=True) as rr:
        rr.raise_for_status()
        with open(p, "wb") as f:
            for 조각 in rr.iter_content(1 << 16):
                f.write(조각)
    return p, 사용량


HERE = Path(__file__).resolve().parent
자산 = HERE / "assets"
"""밈 218장과 로고 7개. `deploy.sh` 가 `docs/img/` 에서 여기로 복사해 상자에 싣는다.
원본을 한 곳에만 두려고 그렇게 한다 — 손으로 두 벌 관리하면 반드시 어긋난다."""


def _이름키(s: str) -> str:
    return re.sub(r"[^\w가-힣]+", "_", (s or "").strip()).strip("_")


def _픽셀수(p: Path) -> int:
    """그림의 픽셀 수. 못 열면 0 — 그러면 다른 후보에 밀린다."""
    try:
        from PIL import Image
        with Image.open(p) as im:
            return im.width * im.height
    except Exception:
        return 0


def 밈찾기(이름: str) -> Path | None:
    """밈 이름 -> 그림 파일. 후보가 여럿이면 **제일 큰 것**을 쓴다.

    표지 훅 LLM 이 `밈사전.md` 를 보고 이름을 고르면, 그 이름으로 여기서 찾는다.
    사전에 없는 이름을 내면 훅 검증 노드가 미리 막는다.

    **예전엔 `_1` 을 먼저 집었다.** 「제목이 제일 그럴듯한 것」이라는 뜻이었는데,
    화질과는 무관한 기준이었다. 재 보니 후보가 여럿인 밈 71개 중 **43개에서
    `_1` 이 제일 작았고**, 스파이더맨 밈은 `_1`(201x251)과 `_3`(1012x1500)이
    **30배** 차이였다 (2026-08-21).

    카드는 1080x1350 이다. 400px 짜리를 넣으면 2.7배로 늘어나 뿌옇게 나오고,
    그 위에 얼굴을 합성하니 얼굴까지 망가졌다. **어느 후보든 같은 밈이므로
    화질로 고르는 게 맞다** — 「그 밈을 쓰는가」는 훅 검증이 따로 본다.
    """
    if not 이름:
        return None
    바탕 = _이름키(이름)
    폴더 = 자산 / "memes"
    if not 폴더.exists():
        return None
    후보 = [q for q in _후보들(폴더, 바탕) if q.exists()]
    if not 후보:
        return None
    return max(후보, key=_픽셀수)


def _후보들(폴더: Path, 바탕: str) -> list:
    """`바탕` 으로 시작하는 밈 그림 후보들. 번호 없는 것(`바탕.jpg`)도 담는다."""
    난것 = []
    for 끝 in (".jpg", ".png"):
        q = 폴더 / f"{바탕}{끝}"
        if q.exists():
            난것.append(q)
    난것 += sorted(폴더.glob(f"{바탕}_*"))
    return 난것


def 로고찾기(브랜드: str) -> Path | None:
    """브랜드 -> 로고 파일. 전략 B(밈 위에 로고 얹기)에 쓴다."""
    if not 브랜드:
        return None
    p = 자산 / "logos" / f"{_이름키(브랜드)}.png"
    return p if p.exists() else None


def 프롬프트(slide: dict, 인물: str | None, 밈: bool = False, 로고: str | None = None,
           아래비율: int = 45) -> str:
    """규칙표 §4 의 네 줄 공식으로 조립한다.

    ①장면·④화풍은 대본(`gen_prompt_en`)이 들고 온다. ②배역은 얼굴이 있을 때만,
    ③조판 제약은 **언제나** 여기서 붙인다 — 대본이 빠뜨려도 글자가 안 죽게.
    """
    장면 = (slide.get("gen_prompt_en") or slide.get("gen_prompt") or "").strip()
    if not 장면:
        raise ValueError("표지 대본에 만들 내용(gen_prompt)이 없다")
    줄, 번호 = [장면], 0
    밈번호 = 얼굴번호 = 로고번호 = None
    if 밈:
        번호 += 1; 밈번호 = 번호
    if 인물:
        번호 += 1; 얼굴번호 = 번호
    if 로고:
        번호 += 1; 로고번호 = 번호

    # **참조 그림을 번호로 못박는다.** 처음엔 «첫 번째 참조는 밈» 처럼 말로만 가리켰는데,
    # 모델이 밈을 통째로 재현해 버려 «얼굴을 바꾸라» 는 말이 묻혔다 — 결과가 원본 밈
    # 인물 그대로였다(실측 2026-08-19). 이제 IMAGE 1·2·3 으로 부르고, 얼굴 교체를
    # «서술» 이 아니라 «명령» 으로 적는다.
    if 밈번호:
        줄.append(f"IMAGE {밈번호} is a meme still. Take ONLY its composition, camera "
                  f"framing, lighting and background mood from it. Remove every caption "
                  f"or subtitle burned into it.")
    if 얼굴번호:
        줄.append(f"IMAGE {얼굴번호} is a photo of {인물}. "
                  f"**Replace the person entirely with {인물}.** The face, head shape, "
                  f"skin tone and hair in the final image must be {인물}'s, taken from "
                  f"IMAGE {얼굴번호} — it must be immediately recognizable as {인물} and "
                  f"must NOT look like the person in IMAGE {밈번호 or '1'}. "
                  f"Keep the pose, expression, wardrobe and setting from the scene.")
    if 로고번호:
        줄.append(f"IMAGE {로고번호} is the {로고} logo. Place it clearly in the upper "
                  f"area of the frame as a clean graphic element. Keep its shape and "
                  f"colours exact — do not restyle or recolour it.")
    줄.append(조판제약.replace("bottom 45 percent", f"bottom {아래비율} percent"))
    return "\n\n".join(줄)


_사람낱말 = re.compile(
    r"\b(?:man|woman|person|people|founder|executive|ceo|engineer|researcher"
    r"|developer|scientist|human|guy|leader|speaker|presenter|entrepreneur)\b", re.I)
_비인간낱말 = re.compile(
    r"\b(?:mascot|creature|blob|figurine|toy|robot|android|plush|doll|puppet"
    r"|beast|animal|claymation|clay (?:figure|character|man|person)"
    r"|3d character|cartoon character)\b", re.I)


_로고낱말 = re.compile(
    r"\b(?:logo|logos|emblem|emblems|insignia|wordmark|brand mark|brand marks"
    r"|badge|badges|icon|icons|symbol|symbols|glyph|glyphs)\b", re.I)


def _그림에로고있나(프롬: str) -> bool:
    """그림 지시가 **이미** 브랜드 표식을 그리라고 했나.

    그랬다면 로고를 따로 얹지 않는다 — 얹으면 그림 안 표식과 따로 노는
    스티커가 하나 더 생긴다. 전략 B 는 «한 회사가 압도한 주» 를 위한 것이지
    «다 모인 주» 를 위한 게 아니다.
    """
    return bool(_로고낱말.search(프롬 or ""))


def _사람있나(프롬: str) -> bool:
    """그림 지시가 «진짜 사람» 을 세웠나. `dify/07_훅검증.py` 와 같은 낱말이다.

    두 곳에 같은 표가 있는 것은 좋지 않지만, 검증기는 Dify 코드 노드 안으로
    통째로 들어가고 서버는 Lambda 라 **모듈을 나눠 가질 수 없다.** 바꿀 때
    둘 다 고쳐야 한다.
    """
    return bool(_사람낱말.search(프롬)) and not _비인간낱말.search(프롬)


def 만들기(slide: dict, 폴더: Path | None = None,
          밈그림: Path | None = None, 로고그림: Path | None = None,
          어디: str = "openai") -> dict:
    """표지 배경 한 장. 돌려주는 것: {path, 인물, 사진출처, 모델, 참조}

    **참조 그림 순서가 프롬프트의 말과 맞아야 한다** — 밈, 얼굴, 로고 순이다.
    프롬프트가 «첫 번째 참조는 밈» 이라고 말하므로 넣는 순서를 바꾸면 안 된다.

    - 밈그림이 있으면 그 장면의 구도를 따라 새로 그린다
    - 브랜드에 얼굴이 있으면 **전략 A** — 밈 인물 자리에 CEO 얼굴
    - 얼굴이 없고 로고그림이 있으면 **전략 B** — 밈 위에 회사 로고
    """
    폴더 = Path(폴더 or (TMP / "cover"))
    브랜드 = (slide.get("brand") or "").strip()

    # **대본이 밈 이름만 주면 그림은 서버가 찾는다.** Dify 는 파일을 못 다루니
    # 훅 LLM 은 «나야, 들기름» 같은 이름만 내고, 그림 찾기는 여기 몫이다.
    if 밈그림 is None and slide.get("meme"):
        밈그림 = 밈찾기(slide["meme"])
    if 로고그림 is None and 브랜드:
        로고그림 = 로고찾기(브랜드)

    import faces                                   # deploy.sh 가 procure/ 에서 넣어 준다
    얼굴 = faces.for_company(브랜드, 폴더) if 브랜드 else None

    # **안전망: 그림에 사람이 없으면 얼굴 사진을 안 붙인다.**
    # 붙이면 「얼굴·머리 모양을 그 사람 것으로 바꿔라」 명령이 함께 나가는데,
    # 그림 지시가 점토 인형이면 모델이 둘을 못 합쳐 **인형 얼굴을 지워 버린다**
    # (실측 2026-08-21: 머리가 통째로 민둥민둥한 표지). 훅 검증이 먼저 막지만
    # 두 번 다 못 고치면 그대로 굽히므로 여기서도 막는다.
    if 얼굴 and not _사람있나(slide.get("gen_prompt_en") or slide.get("gen_prompt") or ""):
        print("  (얼굴 안 붙임 — 그림 지시에 사람이 없다. 로고 전략으로 간다)")
        얼굴 = None

    # **참조를 모으는 순서는 어디로 보내든 같다** — 프롬프트가 IMAGE 1·2·3 으로
    # 가리키기 때문이다. 다른 건 base64 로 박느냐(구글) 파일로 올리느냐(OpenAI) 뿐이다.
    쓸것, 인물, 출처, 쓴것 = [], None, None, []
    if 밈그림:
        쓸것.append(Path(밈그림)); 쓴것.append(f"밈:{Path(밈그림).name}")
    if 얼굴:
        인물 = 얼굴["person"]
        출처 = f'{얼굴["license"]} / {얼굴["author"]}'
        쓸것.append(Path(얼굴["path"])); 쓴것.append(f"얼굴:{인물}")
    로고이름 = None
    _프롬 = slide.get("gen_prompt_en") or slide.get("gen_prompt") or ""
    if 로고그림 and not 얼굴 and not _그림에로고있나(_프롬):
        # 얼굴이 있으면 로고는 안 넣는다 — 그리고 **그림이 이미 로고를
        # 그리기로 했으면 그때도 안 넣는다.** 안 그러면 「다 모인」 표지에
        # 첫 꼭지 회사 로고만 따로 떠서 스티커처럼 붙는다 (2026-08-21).
        로고이름 = 브랜드
        쓸것.append(Path(로고그림)); 쓴것.append(f"로고:{Path(로고그림).name}")
    elif 로고그림 and not 얼굴:
        print("  (로고 안 얹음 — 그림 지시에 이미 브랜드 표식이 있다)")

    이름 = f"cover-{uuid.uuid4().hex[:8]}"
    if 어디 == "gemini":
        # 4:5 를 바로 받으니 자르지도, 프롬프트를 고치지도 않는다.
        글 = 프롬프트(slide, 인물, bool(밈그림), 로고이름)
        p, 사용량 = gemini_image(글, 쓸것, 폴더, 이름), None
        모델 = GEMINI_MODEL
    elif 어디 == "openai":
        # 1088x1360(4:5)로 바로 받으니 자르지도, 프롬프트를 고치지도 않는다 — 아래 45% 그대로.
        # (예전엔 2:3 을 뽑아 위를 잘라서 «아래 38%» 로 줄여 적었다)
        글 = 프롬프트(slide, 인물, bool(밈그림), 로고이름)
        p, 사용량 = openai_image_사용량(글, 쓸것, 폴더, 이름)
        모델 = OPENAI_MODEL
    else:
        raise ValueError(f"모르는 곳: {어디!r} — 'gemini' 나 'openai' 여야 한다")
    return {"path": p, "인물": 인물, "사진출처": 출처, "참조": 쓴것, "모델": 모델, "사용량": 사용량}
