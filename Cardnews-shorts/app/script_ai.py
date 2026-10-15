"""숏츠 대본 만들기(Gemini 상위 모델).

키: 서버 환경 변수 GEMINI_API_KEY(교수 계정, 학생에게는 보이지 않는다).
모델: gemini-3.1-pro-preview(2026-10-16 models 목록에서 확인), 실패하면 gemini-pro-latest.
배포 서버에는 llmgw 게이트웨이가 없어 Gemini REST 를 직접 부른다(키는 환경 변수에서만 읽는다).

대본 규칙은 고조회 정보형 쇼츠 조사(shorts_research.md)에서 왔다.
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Optional

MODELS = [os.environ.get("GEMINI_MODEL", "gemini-3.1-pro-preview"), "gemini-pro-latest"]


class ScriptError(Exception):
    pass


def _key() -> str:
    k = os.environ.get("GEMINI_API_KEY", "").strip()
    if not k and os.environ.get("ALLOW_LOCAL_KEY", "1") == "1":
        env = Path.home() / ".config" / "llmgw" / ".env"
        if env.exists():
            for line in env.read_text(encoding="utf-8").splitlines():
                if line.startswith("GEMINI_API_KEY="):
                    k = line.split("=", 1)[1].strip()
    if not k:
        raise ScriptError("서버에 대본용 Gemini 키가 설정되지 않았습니다. 교수·조교에게 알려 주세요.")
    return k


SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "title": {"type": "STRING", "description": "상단 제목. 두 줄을 ' / '로 구분, 한 줄 14자 이내"},
        "visual_style": {"type": "STRING", "description": "영상 전체 그림의 공통 화풍(영어 한 줄)"},
        "scenes": {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {
            "narration": {"type": "STRING"},
            "image_prompt": {"type": "STRING"},
            "image_prompt_2": {"type": "STRING"}}, "required": ["narration", "image_prompt", "image_prompt_2"]}},
        "facts": {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {
            "claim": {"type": "STRING"},
            "in_material": {"type": "BOOLEAN"},
            "note": {"type": "STRING"}}, "required": ["claim", "in_material"]}},
    },
    "required": ["title", "visual_style", "scenes", "facts"],
}

RULES = """너는 한국어 정보형 숏츠(30~60초) 대본 작가다. 아래 규칙을 모두 지켜 JSON으로만 답한다.

[구성]
1. 장 수는 요청한 수를 지킨다. 한 장에 메시지 하나만 담는다.
2. 1장 첫 문장은 놀라운 숫자나 질문으로 시작한다(사람들은 첫 3초에 넘길지 정한다).
3. 각 장 narration은 1~2문장, 공백 포함 40~90자. 모든 장 narration을 합쳐 공백 포함 300자 이내로 쓴다(약 50초). 소리 내어 읽기 쉬운 구어체 존댓말(~습니다/~요)로 쓴다.
4. 숫자는 비교 대상과 함께 쓴다(예: 예측은 54%, 실제는 60.8%).
5. 장마다 가장 중요한 말 한 개를 *별표*로 감싼다(예: *누구에게*). 숫자는 별표를 치지 않는다(자동 강조된다).
6. 마지막 장은 보는 사람이 할 행동 하나로 끝낸다.
7. title은 영상 내내 위에 고정되는 제목이다. 두 줄을 ' / '로 나누고 한 줄 14자 이내, 결론이나 호기심을 담는다.

[사실]
8. 참고 자료가 있으면 그 안의 사실·숫자만 쓴다. 자료에 없는 숫자를 지어내지 않는다.
8-1. 참고 자료에 적힌 한계(예: 영어 실험이라 한국어에 같은 효과가 있는지 검증되지 않음)를 어기는 권고·제목을 쓰지 않는다. 이전 대본을 고칠 때도 이 규칙은 그대로다.
9. 대본에 쓴 모든 숫자와 사실 주장을 facts에 하나씩 적는다. 참고 자료에 근거가 있으면 in_material=true, 없으면 false로 하고 note에 «확인 필요: 무엇을 어디서 확인할지»를 적는다.

[그림]
10. image_prompt는 그 장면을 넓게 보여 주는 사진·일러스트 설명, image_prompt_2는 같은 장면을 다른 각도나 가까이(클로즈업) 보여 주는 설명이다. 둘 다 영어로 쓴다. visual_style에 영상 전체의 화풍을 영어 한 줄로 정하고(예: vibrant flat editorial illustration, full-bleed scene, rich colors, clean lines). 'minimalist'·'white background'처럼 여백이 많아지는 말은 쓰지 않는다. image_prompt에는 화풍을 다시 쓰지 말고 장면 내용만 쓴다(서버가 화풍을 모든 그림에 붙인다). 한 그림에 장면 하나만 담고 여러 칸·분할 화면으로 나누지 않는다. 글자·숫자·로고를 넣지 말라고 쓰지 않아도 된다(서버가 붙인다). 실존 인물의 얼굴, 실제 브랜드 로고는 그리지 않게 묘사한다. 세로 화면(9:16)에 맞게 주인공을 화면 위쪽 3분의 2에 둔다.
"""


def generate(topic: str, material: str, n_scenes: int, audience: str = "", instruction: str = "",
             previous: Optional[dict] = None) -> dict:
    topic = (topic or "").strip()
    if len(topic) < 4:
        raise ScriptError("주제를 네 글자 이상 적어 주세요.")
    n_scenes = max(3, min(10, int(n_scenes or 5)))
    parts = [RULES, f"\n[요청]\n주제: {topic}\n장 수: {n_scenes}"]
    if audience.strip():
        parts.append(f"보는 사람: {audience.strip()}")
    if material.strip():
        parts.append("\n[참고 자료 — 이 안의 사실만 쓴다]\n" + material.strip()[:20000])
    else:
        parts.append("\n[참고 자료 없음 — 일반 상식으로 쓰되, 모든 숫자·사실을 facts에 in_material=false로 적는다]")
    if previous:
        parts.append("\n[이전 대본]\n" + json.dumps(previous, ensure_ascii=False)[:8000])
    if instruction.strip():
        parts.append("\n[고칠 점]\n" + instruction.strip()[:2000])
    body = {"contents": [{"role": "user", "parts": [{"text": "\n".join(parts)}]}],
            "generationConfig": {"responseMimeType": "application/json", "responseSchema": SCHEMA,
                                 "temperature": 0.7}}
    last = None
    for model in MODELS:
        for attempt in range(2):
            req = urllib.request.Request(
                f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "x-goog-api-key": _key()})
            t = time.time()
            try:
                with urllib.request.urlopen(req, timeout=240) as r:
                    out = json.load(r)
                text = "".join(p.get("text", "") for p in out["candidates"][0]["content"]["parts"]
                               if not p.get("thought"))
                data = json.loads(text)
                data["scenes"] = [{"narration": s["narration"].strip(), "image_prompt": s["image_prompt"].strip(),
                                   "image_prompt_2": (s.get("image_prompt_2") or "").strip()}
                                  for s in data["scenes"]][:12]
                data["_meta"] = {"model": model, "seconds": round(time.time() - t, 1),
                                 "usage": out.get("usageMetadata", {})}
                return data
            except urllib.error.HTTPError as e:
                last = f"HTTP {e.code}"
                if e.code in (400, 401, 403):
                    break
            except Exception as e:
                last = type(e).__name__
            time.sleep(2)
    raise ScriptError(f"대본 만들기에 실패했습니다({last}). 잠시 뒤 다시 눌러 주세요.")
