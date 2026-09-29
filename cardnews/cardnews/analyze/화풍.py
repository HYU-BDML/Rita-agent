# -*- coding: utf-8 -*-
"""화풍 목록 — 판마다 하나를 골라 그 판의 사진을 모두 그 결로 그린다(사람 결정 2026-09-29).

열여덟은 사람이 사례 모음(gpt-image2.canghe.ai, 저장소 freestylefly/awesome-gpt-image-2,
MIT — 비상업이라 괜찮다고 사람이 정함)에서 고른 것이다. **화풍 문장만** 원문에서 떼어
왔다 — 장면·글자·배치·상표 이름은 뺐다. «기본» 은 화풍 없이 예전 방식이다(사람만 고른다).
설계: docs/superpowers/specs/2026-09-28-사진-계획-design.md §10.

**사이트를 매번 부르지 않는다.** 여기 한 곳에 둔다. 웹 거울(`web/lib/화풍.js`)은
`화풍웹목록.py` 가 이 파일에서 다시 쓴다 — 목록을 고치면 그것을 한 번 돌린다.

497·513 은 색 하나를 쓰는 화풍이다. 문장의 `{색}` 자리에 틀의 강조색을, 없으면 원문 색
(`기본색`)을 넣는다. **`str.format` 을 쓰지 않는다** — 435 문장에 중괄호가 들어 있다.
"""
import random

기본 = "기본"
필름스냅 = "필름스냅"
# 후보가 하나도 안 남을 때 — 사건·이야기·일상 대부분에 어울리는 것(설계 §10.3).
빈때 = "530"

목록 = [{'id': '필름스냅',
  '이름': '필름 스냅 실사',
  '이름영어': '35mm film snapshot',
  '한줄': '35mm 필름으로 찍은 자연스러운 실제 사진',
  '출처': '우리가 씀(사이트 40건 공통 요소)',
  '문장': 'Candid 35mm film snapshot, natural available light, slight film grain, true-to-life '
        'colors, documentary feel, not staged, no studio lighting.',
  '기본색': '',
  '예시': '/hwapung/film.jpg',
  'AI후보': True},
 {'id': '530',
  '이름': '실사 배경 + 손그림 인물',
  '이름영어': 'Real photo + doodle people',
  '한줄': '배경은 진짜 사진, 사람만 아이가 그린 듯한 귀여운 낙서 캐릭터',
  '출처': '@Emmma__0',
  '문장': 'Background = realistic photograph. People = cute hand-drawn doodle characters.\n'
        'Everything except the people — room, furniture, objects, lighting, colors, textures — is '
        'a real photograph. Do NOT redraw, simplify, illustrate, or apply doodle/crayon/pencil '
        'effects to the background or environmental objects.\n'
        'Draw each person as a charming, naive doodle: oversized round head, tiny compact body, '
        'short simplified arms and legs, tiny hands and feet, cute awkward proportions, loose '
        'scribbled hair, tiny dot eyes and simple facial features, rosy scribbled cheeks.\n'
        "DRAWING STYLE: Loose naive hand-drawn doodle, like a quick children's sketch. Use thin "
        'shaky black outlines, imperfect shapes, overlapping sketch lines, scribbled '
        'colored-pencil or crayon fills, uneven coloring, white gaps, and slightly messy edges. '
        'The character should look intentionally roughly drawn but extremely cute.\n'
        'OBJECTS: Objects, furniture, scenery, and items around the people remain photographic. A '
        'doodle character may naturally touch or hold a real photographic object.\n'
        'INTEGRATION: Keep correct scale, ground contact, depth, and occlusion.\n'
        'FINAL LOOK: It should feel like a real photograph in which the person was replaced with '
        'an adorable little hand-drawn doodle version, while the real-world background remained '
        'untouched.\n'
        'Avoid full-image illustration, background doodling, realistic anatomy, anime, manga, 3D '
        'cartoon, polished digital art, vector lines.',
  '기본색': '',
  '예시': '/hwapung/530.jpg',
  'AI후보': True},
 {'id': '528',
  '이름': '실사 배경 + 꼬마 캐릭터',
  '이름영어': 'Real photo + chibi characters',
  '한줄': '사실적인 사진 배경에 큰 눈의 손그림 꼬마 캐릭터',
  '출처': '@Sairah_0',
  '문장': 'Render the person as a cute hand-drawn anime/chibi character with expressive large eyes, '
        'soft blush on the cheeks, delicate facial details, textured pencil-and-ink outlines, '
        'subtle watercolor-like coloring, and slightly imperfect handmade sketch details. Keep the '
        'background photorealistic and highly detailed, creating a beautiful contrast between the '
        'illustrated character and the real-world environment.\n'
        'Cinematic composition, natural perspective, realistic background depth, detailed clothing '
        'texture, high detail, aesthetically pleasing.',
  '기본색': '',
  '예시': '/hwapung/528.jpg',
  'AI후보': True},
 {'id': '435',
  '이름': '겹종이 입체',
  '이름영어': 'Layered paper cut',
  '한줄': '겹겹이 오린 파스텔 종이 입체, 큰 머리 인물',
  '출처': '@Just_sharon7',
  '문장': '{\n'
        ' "style": "layered paper-cut illustration, papercraft diorama, handcrafted aesthetic",\n'
        ' "technique": {\n'
        '  "layering": "multiple stacked paper layers with soft drop shadows between each layer",\n'
        '  "depth": "5–7 visible depth planes from foreground to background",\n'
        '  "edges": "smooth, rounded, slightly beveled paper-cut edges",\n'
        '  "texture": "subtle paper grain and fibrous texture on all surfaces",\n'
        '  "shadows": "soft, diffused inner shadows beneath each layer suggesting physical depth"\n'
        ' },\n'
        ' "character_design": {\n'
        '  "proportions": "chibi / cute simplified — large round head, small body (1:1.5 ratio)",\n'
        '  "face": {\n'
        '   "eyes": "small dot eyes, glossy highlight",\n'
        '   "cheeks": "soft circular rosy blush patches",\n'
        '   "nose": "absent or minimal dot",\n'
        '   "mouth": "simple small curve smile"\n'
        '  },\n'
        '  "limbs": "short, rounded, stubby limbs",\n'
        '  "outline": "clean smooth silhouette, no sharp corners"\n'
        ' },\n'
        ' "color_palette": {\n'
        '  "mood": "warm, cozy, pastel",\n'
        '  "tones": [\n'
        '   "soft cream",\n'
        '   "dusty rose",\n'
        '   "sage green",\n'
        '   "warm peach",\n'
        '   "sky blue",\n'
        '   "honey yellow"\n'
        '  ],\n'
        '  "saturation": "low-to-medium, muted and gentle"\n'
        ' },\n'
        ' "lighting": {\n'
        '  "type": "soft ambient light from top-front",\n'
        '  "highlights": "gentle white edge highlights on top layers",\n'
        '  "shadows": "warm light tan/beige shadow tones beneath cut layers"\n'
        ' },\n'
        ' "environment": {\n'
        '  "details": "tiny decorative elements — stars, small hearts, dots — cut from paper"\n'
        ' },\n'
        ' "overall_mood": "warm, whimsical, cozy, handmade, storybook",\n'
        ' "render_quality": "ultra-detailed papercraft art, studio photography lighting, sharp '
        'focus on layer edges"\n'
        '}',
  '기본색': '',
  '예시': '/hwapung/435.jpg',
  'AI후보': True},
 {'id': '533',
  '이름': '손그림 낙서',
  '이름영어': 'Hand-drawn doodle',
  '한줄': '연필·잉크로 긁적인 귀엽고 엉뚱한 낙서, 흰 바탕',
  '출처': '@Sairah_0',
  '문장': "A cute, quirky hand-drawn doodle illustration. Use a minimalist children's storybook / "
        'fashion sketch aesthetic with loose, imperfect black ink lines, visible scribbly pencil '
        'strokes, subtle cross-hatching, and a charming handmade feel.\n'
        'Character design: oversized head and small simplified body; simple dot-like eyes and tiny '
        'minimal mouth; soft rounded facial features; slight rosy pink blush on the cheeks; messy, '
        'expressive hand-drawn hair with many loose sketch lines; slightly exaggerated, playful '
        'proportions; natural, relaxed pose with a whimsical illustration feel.\n'
        'Art style: black-and-white pencil/ink doodle drawing; rough, imperfect sketch lines '
        'rather than clean digital outlines; dense scribbled hair and clothing details; light '
        'hand-colored accents; subtle watercolor/crayon-like coloring; minimal shading; white or '
        'off-white clean background; lots of negative space; cute, innocent, playful, cozy '
        'aesthetic; looks like an original handmade notebook doodle illustration. Not polished '
        'vector art or 3D cartoon art.',
  '기본색': '',
  '예시': '/hwapung/533.jpg',
  'AI후보': True},
 {'id': '91',
  '이름': '네모 블록 세상',
  '이름영어': 'Block world',
  '한줄': '사람·물건 전부 네모 블록으로 된 세상, 빛과 질감은 사실적',
  '출처': '@wolfaidev',
  '문장': 'A highly detailed, realistic render of a next-generation voxel-based world. The world '
        'blends realistic lighting, volumetric light, and high-resolution textures with cubic, '
        'voxel geometry: the person, every object, and all furniture are built from blocky cubes, '
        'like a blocky sandbox video game. No game user interface, no health bar, no hotbar, no '
        'logo.',
  '기본색': '',
  '예시': '/hwapung/91.jpg',
  'AI후보': True},
 {'id': '215',
  '이름': '픽셀 그림',
  '이름영어': 'Pixel art',
  '한줄': '비스듬한 시점의 정교한 도트 그림',
  '출처': '@GeekCatX',
  '문장': 'Ultra-high-detail isometric pixel art illustration. Adopt a standard isometric '
        'perspective (2:1), rich layer depth, crisp pixel clusters, and a limited, differentiated '
        'color palette. Characters are small pixel sprites. Professional and visually striking.',
  '기본색': '',
  '예시': '/hwapung/215.jpg',
  'AI후보': True},
 {'id': '405',
  '이름': '귀여운 종이공예',
  '이름영어': 'Cute papercraft',
  '한줄': '부드럽고 귀여운 종이공예, 새·나비·꽃 장식',
  '출처': '@oggii_0',
  '문장': 'Render this scene in a paper craft style, simplifying the details to make them suitable '
        'for paper craft artwork. Arrange the overall composition to feel visually pleasing, soft, '
        'and cute. You may add charming decorative elements such as birds, butterflies, flowers, '
        'etc., to enhance the adorable atmosphere while still matching the scene.',
  '기본색': '',
  '예시': '/hwapung/405.jpg',
  'AI후보': True},
 {'id': '409',
  '이름': '못 그린 그림판 낙서',
  '이름영어': 'Clumsy Paint doodle',
  '한줄': '그림판에 마우스로 일부러 서툴게 그린 웃긴 낙서',
  '출처': '@Ciri_ai',
  '문장': 'Draw this scene in the most clumsy, messy, and hopelessly pathetic way possible. Use a '
        'white background and make it look like it was drawn in MS Paint with a mouse. It should '
        'be kind of correct in some places yet strangely off and awkward overall. Emphasize a '
        'low-quality, pixelated look, and make it appear ridiculously badly drawn.',
  '기본색': '',
  '예시': '/hwapung/409.jpg',
  'AI후보': True},
 {'id': '543',
  '이름': '에나멜 배지',
  '이름영어': 'Enamel pin',
  '한줄': '장면 전체를 금테 두른 에나멜 배지로, 사람은 작고 얼굴은 이목구비 없음',
  '출처': '@Emmma__0',
  '문장': 'Render this scene as a souvenir enamel pin badge. Compose it as a SCENE, not a single '
        'isolated object: the setting and the key objects form the main body of the badge and '
        'occupy most of its area. The person is a small, simplified figure at true relative scale '
        'within the scene — the person is an accent, the setting is the subject.\n'
        'How to render the person: flat enamel color blocks matching their clothing and hair '
        'color. The face is a smooth plain area of light skin-tone enamel with no drawn facial '
        'features — do NOT render the person as a dark or black silhouette, and do NOT black out '
        'the face or head. Skin reads as a warm light enamel color, clearly lighter than the '
        'clothing.\n'
        'Styling: thin polished gold outline around the silhouette and along every internal '
        'divider, glossy enamel color fill, gentle even lighting with only a soft sheen on the '
        "gold lines, very subtle drop shadow. Outer contour follows the scene's own shape, not a "
        'plain rectangle.\n'
        'Background: flat dark navy coarse linen texture. Badge centered, filling about 60% of the '
        'frame.\n'
        'Avoid: black silhouette figure, blacked-out face, dark featureless head, portrait '
        'close-up, detailed facial features, person dominating the badge, three-quarter angle, '
        'macro product photography, heavy specular glare, cartoon, realistic scene, text, '
        'watermark.',
  '기본색': '',
  '예시': '/hwapung/543.jpg',
  'AI후보': True},
 {'id': '522',
  '이름': '동화책 손그림 캐릭터',
  '이름영어': 'Storybook character',
  '한줄': '과슈·크레용으로 그린 2D 동화책 캐릭터',
  '출처': '@Sairah_0',
  '문장': "Draw the person as an adorable hand-drawn 2D children's storybook character.\n"
        'Character: oversized rounded head, tiny compact body, short arms, narrow shoulders, soft '
        'rounded silhouette, and cute childlike proportions. Keep the head visually dominant. '
        'Avoid realistic anatomy.\n'
        'Face: tiny dot/oval eyes, minimal nose, tiny smiling mouth, rounded cheeks, and soft '
        'peach/pink blush. No realistic eyes, detailed lips, anime features, glossy 3D rendering, '
        'or heavy shading.\n'
        'Hair & clothing: simplified into chunky hand-drawn shapes.\n'
        'Style: handmade 2D picture-book aesthetic using soft gouache, wax crayon, colored pencil, '
        'and dry pastel. Use slightly irregular dark-brown linework, subtle paper grain, uneven '
        'pigment, soft brush marks, and imperfect painted edges. Avoid clean vector art, CGI, '
        'anime, or photorealism.\n'
        "Final feeling: extremely cute, warm, wholesome, nostalgic, handcrafted children's-book "
        'illustration.',
  '기본색': '',
  '예시': '/hwapung/522.jpg',
  'AI후보': True},
 {'id': '523',
  '이름': '잉크 선 + 수채화',
  '이름영어': 'Ink line + watercolor',
  '한줄': '옛 여행 포스터 같은 가는 잉크 선과 번진 수채',
  '출처': '@Taaruk_',
  '문장': 'Editorial illustration inspired by vintage European travel posters. Use delicate '
        'hand-drawn ink outlines combined with soft, slightly imperfect watercolor washes on warm '
        'textured cream paper. Use muted sage green, olive, warm beige, soft blue, pale gray, and '
        'subtle golden light, with natural watercolor bleeding, paper grain, fine pen hatching, '
        'and an airy sophisticated travel-journal aesthetic. No text, no letters, no logos, no '
        'typography, no captions, no signs. Highly detailed, elegant, nostalgic, handcrafted '
        'watercolor-and-ink illustration.',
  '기본색': '',
  '예시': '/hwapung/523.jpg',
  'AI후보': True},
 {'id': '474',
  '이름': '미니멀 플랫 벡터',
  '이름영어': 'Minimal flat vector',
  '한줄': '깔끔한 북유럽 파스텔 벡터 일러스트',
  '출처': '@Taaruk_',
  '문장': 'Minimalist flat illustration, clean vector art style, Scandinavian color palette, soft '
        'pastel tones, calm atmospheric scene, ultra clean composition, geometric shapes, smooth '
        'gradients, modern poster aesthetic, crisp vector lines, highly detailed environment art, '
        'contemporary flat illustration, premium editorial design, balanced composition, minimal '
        'shadows, soft lighting.',
  '기본색': '',
  '예시': '/hwapung/474.jpg',
  'AI후보': True},
 {'id': '497',
  '이름': '단색 수채화 + 잉크 선',
  '이름영어': 'One-colour watercolor + ink',
  '한줄': '한 가지 색 수채와 가는 잉크 선, 흰 여백 많이',
  '출처': '@Goodmanprotocol',
  '문장': 'Rendered entirely in elegant monochromatic {색} watercolor and fine ink linework. Large '
        'areas of clean white negative space, soft cloudy watercolor textures, delicate paper '
        'grain, subtle watercolor blooms and delicate splatter textures. Handcrafted watercolor '
        'illustration, architectural sketch aesthetic, soft natural lighting, muted monochromatic '
        'palette, highly detailed line art, minimalist, premium stationery illustration, clean '
        'composition, gallery-quality artwork.',
  '기본색': 'blue',
  '예시': '/hwapung/497.jpg',
  'AI후보': True},
 {'id': '537',
  '이름': '어두운 초현실',
  '이름영어': 'Dark surreal',
  '한줄': '어두운 사진풍 초현실, 이야기를 비유로, 사람은 작고 얼굴 안 보임',
  '출처': '@PromptSin',
  '문장': 'An original psychological dark-surrealist scene, expressed through an entirely original '
        'visual metaphor. Premium photorealistic dark concept art, refined editorial composition, '
        'quiet dread and introspection rather than horror spectacle. Human figures are small '
        'within an immense, oppressive scale; no recognizable person, no portrait close-up. Black '
        'paper, aged stone, floating ash, volumetric fog, subtle polished-floor reflections, a '
        'high-angle shaft of cold silver light.\n'
        'Color palette: obsidian black, graphite, bone white, cold silver, a single muted crimson '
        'accent.\n'
        'No text, symbols, logos, signatures, borders, or watermark. Avoid visible letters, split '
        'face, glowing eyes, gore, skulls, conventional ghosts, fantasy wizard styling, imitation '
        'of any named artist.',
  '기본색': '',
  '예시': '/hwapung/537.jpg',
  'AI후보': True},
 {'id': '513',
  '이름': '흑백 펜 낙서 + 포인트 색 하나',
  '이름영어': 'Pen doodle + one accent colour',
  '한줄': '검은 펠트펜 수첩 낙서, 포인트 색 하나만',
  '출처': '@Sairah_0',
  '문장': 'A charming editorial illustration in a simple hand-drawn doodled style, as if sketched by '
        'hand with a black felt-tip marker in a notebook. It should feel personal, spontaneous, '
        'and imperfect rather than digitally designed.\n'
        'COLOR PALETTE: Keep the illustration almost entirely black and white. Use only one accent '
        'color: {색}. Apply it sparingly to selected details. Never introduce any additional '
        'colors.\n'
        'STYLE: Draw entirely with black felt-tip pen lines. Use slightly wobbly hand-drawn '
        'contours, natural line variation, loose marker strokes, sketch-like confidence, subtle '
        'imperfections, slightly open line endings, uneven hand pressure, and occasional '
        'overlapping strokes. Every line should clearly look handmade. Avoid perfectly smooth '
        'curves, mechanically precise outlines, polished vector graphics, or overly crisp digital '
        'rendering.\n'
        "COMPOSITION: Generous white space. Open, light, and effortless, similar to a designer's "
        'sketchbook. Keep it relaxed and uncluttered.\n'
        'DRAWING STYLE: Keep every object simple and intentionally simplified. Use flat shapes '
        'with minimal interior detail. Avoid realistic textures, gradients, shadows, painterly '
        'brushwork, glossy surfaces, or complex rendering.\n'
        'LINE QUALITY: The black marker lines are the main visual feature. Confident, casual, '
        'lively, expressive, and naturally imperfect.\n'
        'MOOD: Warm. Friendly. Relaxed. Playful. Minimal. Editorial. Contemporary. Elegant through '
        'simplicity.\n'
        'IMPORTANT: No photorealism. No 3D rendering. No painterly effects. No gradients. No heavy '
        'shadows. No glossy lighting. No vector-clean artwork. No excessive detail. No busy '
        'composition.',
  '기본색': 'sky blue',
  '예시': '/hwapung/513.jpg',
  'AI후보': True},
 {'id': '507',
  '이름': '코바늘 뜨개 인형',
  '이름영어': 'Crochet dolls',
  '한줄': '사람을 털실로 뜬 코바늘 인형으로',
  '출처': '@azed_ai',
  '문장': 'The people are handcrafted crochet dolls, made with soft yarn textures and intricate '
        'knitted details, dressed in their clothing colors. Warm muted atmosphere, charming '
        'handmade aesthetic, nostalgic amigurumi style.',
  '기본색': '',
  '예시': '/hwapung/507.jpg',
  'AI후보': True},
 {'id': '538',
  '이름': '낡은 종이 위 고무도장',
  '이름영어': 'Rubber stamp on old paper',
  '한줄': '낡은 공책 종이에 찍은 몇 가지 색 고무도장 자국',
  '출처': '@MahnoorAi12',
  '문장': 'Render the scene as a compact, imperfect multi-color rubber stamp impression printed on '
        'warm off-white, slightly aged paper with a believable physical texture: very subtle paper '
        'fibers, fine grain, faint handling marks, and a matte surface. The paper should feel like '
        "a real sheet from an architect's travel notebook or field journal, not a designed poster "
        'background.\n'
        'Reduce the scene to only the few visual features that make it recognizable. Simplify '
        'aggressively; do not reproduce it element by element. The result should look like '
        'something a person could have actually carved into a small rubber stamp. The stamp fills '
        'about two-thirds of the frame, with a little blank paper around it.\n'
        'STAMP COLOR & PRINT CHARACTER: 2–4 muted spot colors (such as carbon black, deep green, '
        'brick or muted red, ochre, slate blue, taupe or earthy brown), each as a separate '
        'physical ink layer. Slightly uneven pressure, tiny gaps in the ink, dry areas, paper '
        'showing through, rough carved edges, irregular line thickness, small contour breaks, '
        'granular ink texture, faint ghosting, slight natural color-layer misregistration, subtle '
        'edge variation. The stamp should look physically printed, not digitally illustrated.\n'
        'Avoid circular seals, postage-stamp borders, perforations, wax seals, sticker layouts, '
        'smooth vector logos, polished digital illustrations, cartoon styling, 3D rendering, '
        'plastic textures, glossy gradients, excessive saturation, decorative clutter.',
  '기본색': '',
  '예시': '/hwapung/538.jpg',
  'AI후보': True},
 {'id': '기본',
  '이름': '기본',
  '이름영어': 'Classic',
  '한줄': '화풍 없이 예전 방식',
  '출처': '',
  '문장': '',
  '기본색': '',
  '예시': '/hwapung/basic.jpg',
  'AI후보': False}]

_찾기표 = {x["id"]: x for x in 목록}


def 찾기(아이디) -> dict | None:
    return _찾기표.get(str(아이디 or "").strip())


def 문장(아이디, 색: str = "") -> str:
    """그림 지시문에 실을 화풍 문장. 모르는 것·기본이면 빈 글자 — 화풍 없이 간다."""
    x = 찾기(아이디)
    if not x or not x["문장"]:
        return ""
    return x["문장"].replace("{색}", str(색 or "").strip() or x["기본색"])


def 목록줄() -> str:
    """계획 AI 에게 보여 줄 목록 — AI 가 고를 수 있는 것만(기본 빼고)."""
    return "\n".join(f"- {x['이름']}: {x['한줄']}" for x in 목록 if x["AI후보"])


def _펴기(글) -> str:
    """띄어쓰기를 빼고 소문자로 — «필름 스냅» 과 «필름스냅» 을 같게 본다."""
    return "".join(str(글 or "").split()).lower()


def 이름으로(값) -> str:
    """이름·영어 이름·번호 어느 것으로 와도 번호로. 모르면 빈 글자.

    계획 AI 는 목록에서 본 **이름** 으로 답한다(번호는 안 보여 준다). 띄어쓰기·대소문자는
    안 가린다. 딱 맞는 것이 없으면 **앞부분이 겹치는 것이 하나뿐일 때만** 받는다 —
    «필름 스냅»(줄임)·«필름 스냅 실사 (실존 인물)»(덧붙임). 둘 이상 걸리면 모른다고 한다
    (2026-09-29 검토: 이름을 조금만 달리 써도 버려져, 알려진 인물 판이 손그림으로 갔다).
    """
    글 = _펴기(값)
    if len(글) < 2:
        return ""
    for x in 목록:
        if 글 in (_펴기(x["id"]), _펴기(x["이름"]), _펴기(x["이름영어"])):
            return x["id"]
    걸린것 = [x["id"] for x in 목록
            if any(n.startswith(글) or 글.startswith(n)
                   for n in (_펴기(x["이름"]), _펴기(x["이름영어"])))]
    return 걸린것[0] if len(걸린것) == 1 else ""


def 고르기(후보들, 뽑기=random.choice) -> str:
    """AI 후보에서 하나. **뽑기는 코드가 한다** — 모델은 무작위를 잘 못 한다.

    목록 밖·기본은 버린다. 필름 스냅이 있으면 그것 하나(알려진 실존 인물 판).
    하나도 안 남으면 `빈때`. `뽑기` 는 시험이 무작위를 못 박으려고 밖에서 넣는다.
    """
    남은것 = []
    for 값 in 후보들 or []:
        아이디 = 이름으로(값)
        x = 찾기(아이디)
        if x and x["AI후보"] and 아이디 not in 남은것:
            남은것.append(아이디)
    if 필름스냅 in 남은것:
        return 필름스냅
    return 뽑기(남은것) if 남은것 else 빈때


def 지정받기(값) -> str:
    """사람이 고른 화풍(채팅·미리보기). 목록에 있는 번호만 — 「알아서」·모르는 값은 빈 글자."""
    if not isinstance(값, str):
        return ""
    return 값.strip() if 찾기(값) else ""


def 웹목록() -> list:
    """웹 거울에 싣는 칸만. 문장은 안 싣는다 — 화면에 쓸 데가 없다."""
    return [{"id": x["id"], "이름": x["이름"], "이름영어": x["이름영어"], "예시": x["예시"]}
            for x in 목록]
