# -*- coding: utf-8 -*-
"""**창고에 넣어 둔 구글 비전 응답을 읽는 시험 도우미.**

구글 비전은 2026-09-24 에 통째로 뺐다(사람 지시). 그런데 `data/ocr/` 에 예전에
읽어 둔 **진짜 응답 파일**이 남아 있고, 여러 시험이 그것을 «정답지» 로 쓴다 —
글자 자리·색·형광펜 판정이 실물에서 맞는지 보는 시험들이다. 돈은 안 든다:
파일을 읽을 뿐 아무도 안 부른다.

그래서 응답을 푸는 이 두 함수만 시험 쪽으로 옮겨 왔다. **일감 코드에는 없다** —
거기엔 구글이 낸 모양을 다룰 일이 더는 없다.
"""


def unscale(sym: dict, crop_box, scale) -> list[int]:
    """비전이 준 조각 좌표(키운 크롭 기준) → 원본 그림 좌표."""
    xs = [v.get("x", 0) for v in sym["vertices"]]
    ys = [v.get("y", 0) for v in sym["vertices"]]
    x0, y0 = crop_box[0], crop_box[1]
    return [
        round(x0 + min(xs) / scale), round(y0 + min(ys) / scale),
        round(x0 + max(xs) / scale), round(y0 + max(ys) / scale),
    ]


def _symbols(res: dict, crop_box, scale) -> list[dict]:
    """비전 응답에서 글자 하나하나를 뽑아 원본 좌표로 되돌린다."""
    out = []
    for page in res.get("fullTextAnnotation", {}).get("pages", []):
        for blk in page.get("blocks", []):
            for par in blk.get("paragraphs", []):
                for wd in par.get("words", []):
                    for s in wd.get("symbols", []):
                        out.append({
                            "text": s["text"],
                            "box": unscale({"vertices": s["boundingBox"]["vertices"]},
                                           crop_box, scale),
                            "break": (s.get("property", {})
                                       .get("detectedBreak", {}).get("type", "")),
                        })
    return out
