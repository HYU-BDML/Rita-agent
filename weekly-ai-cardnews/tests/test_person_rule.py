# -*- coding: utf-8 -*-
import pytest

from nodes import check_hook

딥시크_처음 = ("Photorealistic cinematic film still. At the center, a single recognizable face of Sam Altman is in "
             "sharp focus, his head turned toward the camera, expression amused and a little overwhelmed. He stands "
             "at the front of a dense parade of rounded mascot-like AI characters and glowing brand symbols — a soft "
             "blue Gemini spark, a purple Meta wave, a green NVIDIA eye, an orange Perplexity orb, a mint Cursor arrow "
             "— all tightly gathered into one moving group filling the upper half. Shot on 85mm at f/4, concert "
             "lighting from front-left, cool 5000K. The bottom 45 percent is one calm unbroken field of deep charcoal "
             "shadow, dark enough for white text.")
딥시크_다시1 = ("Photorealistic cinematic film still. At the center, a single man, Sam Altman, faces the camera, his "
              "expression amused and a little overwhelmed. He stands at the front of a dense parade of rounded "
              "mascot-like AI characters and glowing brand symbols — a soft blue Gemini spark, a purple Meta wave, a "
              "green NVIDIA eye, an orange Perplexity orb, a mint Cursor arrow — all tightly gathered into one moving "
              "group filling the upper half. Shot on 85mm at f/4, concert lighting from front-left, cool 5000K. The "
              "bottom 45 percent is one calm unbroken field of deep charcoal shadow, dark enough for white text.")
딥시크_다시2 = ("Cinematic film still. A single man, Sam Altman, stands in sharp focus at the center, facing the camera "
              "with an amused, slightly overwhelmed expression. Behind him, one tight group of rounded mascot-like AI "
              "characters and glowing brand symbols — a soft blue Gemini spark, a purple Meta wave, an orange "
              "Perplexity orb, a mint Cursor arrow — packs the upper half, moving like a parade. Concert lighting from "
              "front-left, cool 5000K, 85mm f/4. The bottom 45 percent is one calm unbroken field of deep charcoal "
              "shadow, dark enough for white text.")


@pytest.mark.parametrize("지시문, 막혀야", [
    (딥시크_처음, True),    # 사람 낱말이 없다(얼굴만) — 막는 게 맞다
    (딥시크_다시1, False),  # 사람 뒤에 마스코트 — 예전엔 거짓으로 막았다
    (딥시크_다시2, False),
    ("Photorealistic still. A single clay man waves at the camera, soft studio light.", True),
    ("Photorealistic still. A cute mascot person stands at the center, soft light.", True),
    ("Photorealistic still. A human-like robot stands at the center, soft light.", True),
    ("Photorealistic still. A clay figure of a man stands at the center, soft light.", True),
    ("Photorealistic still. A single figure stands at the center, soft light.", True),
    ("Photorealistic still. A single man, the founder, stands at the center with a small robot beside him, soft light.", False),
])
def test_얼굴있는_브랜드의_사람_판정(지시문, 막혀야):
    탈 = check_hook._프롬프트검사(지시문, "ChatGPT")
    assert any("얼굴이 있는 브랜드인데 그림에 사람이 없다" in t for t in 탈) is 막혀야
