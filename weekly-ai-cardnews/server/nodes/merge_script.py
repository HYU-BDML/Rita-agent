# 뽑음: 주간AI소식_카드뉴스.yml 의 «대본 합치기» 단계 — 손으로 고치지 말 것 (weekly/server/extract.py 로 다시 뽑는다)
# 표지 + 꼭지 + 마무리 → 굽기용 장 목록.
#
# **미디어 주소가 여기서 붙는다.** 소식 고르기가 챙겨둔 X 글의 사진·영상 주소를
# 그 브랜드의 꼭지에 얹는다. 없으면 `gen="gemini"` 로 표시해 서버가 그림을 만든다.

def main(slides: list, cover: dict, picked: list, week: str,
         본문막힘: str = "", 훅막힘: str = "") -> dict:
    # **두 번 쓰고도 안 고쳐졌으면 굽지 않는다 (2026-08-20).**
    #
    # 예전엔 «다시 쓰기» 를 한 번 시키고 그 결과를 **아무도 안 봤다.** 고쳐졌든
    # 말든 그대로 굽기로 갔고, 넘치는 줄은 굽는 자리에서 장마다 죽었다 —
    # 8장 중 6장이 그렇게 죽었다. 그런데 판 자체는 «성공» 으로 나왔다.
    #
    # 이제 «검증 2» 의 막힘을 여기서 읽고, **남아 있으면 멈춘다.**
    # 반쯤 죽은 판을 내놓느니 «왜 못 만들었나» 를 말하는 편이 낫다.
    남은것 = [x for x in ((본문막힘 or "").strip(), (훅막힘 or "").strip()) if x]
    if 남은것:
        raise ValueError(
            "두 번 썼는데도 규칙을 어긴 데가 남았다 — 판을 굽지 않는다.\n"
            + "\n".join(남은것)[:1500])

    # **빈 판은 여기서 막는다.** 소식은 골라 놨는데 꼭지가 하나도 없으면 그건
    # 「결과 없음」이 아니라 «앞에서 조용히 잃어버린 것»이다. 그대로 두면 표지와
    # 마무리 두 장짜리 판이 «성공» 으로 나간다 — 두 번 그렇게 나갔다
    # (실측 2026-08-19·20). 판을 내놓느니 여기서 죽는 편이 낫다.
    if not slides:
        raise ValueError(
            f"꼭지가 0개다 (소식 {len(picked or [])}건) — 판을 내놓지 않는다. "
            f"소식이 0건이면 「소식 고르기」가, 소식은 있는데 꼭지가 0이면 "
            f"「본문 검증 2」의 막힘이 이유를 말해 준다")

    미디어 = {}
    for p in picked or []:
        ms = p.get("media") or []
        미디어[p.get("brand")] = ms[0] if ms else ""

    낱장 = [{"no": 1, "type": "표지", "eyebrow": "Weekly AI",
             "headline": cover.get("headline") or [],
             "accent_text": cover.get("accent_text") or week,
             "brand": (slides[0].get("brand") if slides else "") or "",
             "meme": cover.get("meme") or "",
             "gen_prompt_en": cover.get("gen_prompt_en") or cover.get("gen_prompt") or ""}]

    for i, k in enumerate(slides or [], start=2):
        주소 = 미디어.get(k.get("brand")) or ""
        낱장.append({"no": i, "type": "뉴스", "brand": k.get("brand") or "",
                     "headline": k.get("headline") or [], "body": k.get("body") or [],
                     "source_kind": "X", "source_name": k.get("brand") or "",
                     "media_url": 주소,
                     "gen": "" if 주소 else "gemini",
                     "gen_prompt_en": k.get("gen_prompt_en") or ""})

    낱장.append({"no": len(낱장) + 1, "type": "CTA",
                 "logo_text": "AI FREAKS", "handle": "@ai_freaks.kr",
                 "headline": ["매일 업데이트 되는", "AI 뉴스와 트렌드가 더 궁금하다면?"],
                 "media_url": "", "gen": ""})

    import json
    # **자리표는 장 안에 넣지 않는다.** 두 번 데었다.
    #
    #   ① 객체로 넣으니 slides→장→template→slide_types→뉴스→headline 로 6층이 되어
    #      «Depth limit 5 reached, object too deep» 로 이 노드가 죽었다.
    #   ② 글자로 넣으니 Dify 가 장을 직렬화하면서 **이스케이프를 하다 말았다** —
    #      자리표의 `canvas` 부터가 장의 형제 칸으로 새어 나와 몸통이 JSON 이
    #      아니게 됐고 폭 검사가 500 으로 죽었다.
    #
    # 그래서 굽는 노드들이 **본문 맨 위에서 「디자인 틀」 노드를 직접 읽는다.**
    # 여기서는 자리표를 만지지 않는다.
    #
    # **표지는 slides 에서 뺀다.** 표지는 반복 «밖» 에서 따로 굽는다(밈·얼굴 참조가
    # 필요해서 `/render/cover` 를 쓴다). 여기 두면 반복이 표지를 한 번 더 구우려 하고,
    # `/render/slide` 는 표지를 못 다뤄 «00 실패» 로 끝난다(실측 2026-08-19).
    return {"slides": 낱장[1:], "cover": 낱장[0],
            "대본": json.dumps(낱장, ensure_ascii=False, indent=1)}
