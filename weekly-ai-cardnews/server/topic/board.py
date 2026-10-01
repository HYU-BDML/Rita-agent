# -*- coding: utf-8 -*-
"""작업판 — 지휘자가 매 구간 보는 한 장(설계 2장 «지휘자 화면»).

숫자처럼 객관적인 것(수확·배수·이미 한 일·남은 예산·경고)은 코드가, 판단(단계·짐작 지도·출처 판정·사건 묶기)은
지휘자가 `update_board` 로 적는다. 대화는 구간마다 지워져도 작업판은 남는다."""
import re

단계이름 = {"①": "이해하기", "②": "지도 그리기", "③": "넓게 훑기", "④": "들어가 보기", "⑤": "단서 따라 깊게",
          "⑥": "빈칸 점검", "⑦": "증거 다지기·정리"}
판정들 = ("공식", "팬", "언론", "모음", "무관")
사건상태 = ("후보", "채움", "버림")
_곳꼴 = re.compile(r"^(x|instagram|threads|web|page):[@#]?(.+)$")


def 새판() -> dict:
    return {"단계": "①", "판단줄": [], "짐작지도": [], "출처판정": {}, "닫은길": [], "사건": {}, "경고": [],
            "관문": [], "꺼진도구": {}}


def 적기(판: dict, 인자: dict, 시각: str, 있는번호) -> str:
    """update_board 한 번. 틀리면 고쳐 달라는 한 줄만 돌려주고 아무것도 안 바꾼다."""
    단계 = 인자.get("stage") or 판["단계"]
    판단 = str(인자.get("judgment") or "").strip()
    if 단계 not in 단계이름:
        return f"고쳐 주세요: stage 는 {'·'.join(단계이름)} 중 하나 (받은 값 {단계!r})"
    if not 판단:
        return "고쳐 주세요: judgment 에 이번에 바뀐 판단을 한 줄로 적어 주세요"
    판["단계"] = 단계
    판["판단줄"].append({"시각": 시각, "단계": 단계, "말": 판단[:300]})
    if isinstance(인자.get("guess_map"), list):
        판["짐작지도"] = [{"곳": str(x.get("place") or ""), "까닭": str(x.get("why") or "")[:200]}
                      for x in 인자["guess_map"] if isinstance(x, dict) and x.get("place")][:12]
    for x in 인자.get("source_verdicts") or []:
        if isinstance(x, dict) and x.get("place") and x.get("verdict") in 판정들:
            판["출처판정"][str(x["place"]).strip().lower()] = {"판정": x["verdict"], "근거": str(x.get("basis") or "")[:200]}
    for x in 인자.get("closed") or []:
        if isinstance(x, dict) and x.get("place") and all(y["곳"] != x["place"] for y in 판["닫은길"]):
            판["닫은길"].append({"곳": str(x["place"]), "까닭": str(x.get("why") or "")[:200]})
    없는 = []
    for x in 인자.get("events") or []:
        이름 = str((x or {}).get("name") or "").strip()[:80] if isinstance(x, dict) else ""
        if not 이름:
            continue
        칸 = 판["사건"].setdefault(이름, {"증거": [], "상태": "후보", "메모": ""})
        for 번 in x.get("evidence") or []:
            번 = str(번).strip()
            if not 있는번호(번):
                없는.append(번)
            elif 번 not in 칸["증거"]:
                칸["증거"].append(번)
        if x.get("status") in 사건상태:
            칸["상태"] = x["status"]
        if x.get("note"):
            칸["메모"] = str(x["note"])[:200]
    return "적었다." + (f" {', '.join(없는)} 는 없는 증거 번호라 뺐다." if 없는 else "")


def _미디어갈래(x: dict | None) -> str:
    미 = (x or {}).get("미디어") or []
    return "영상" if any(m.get("갈래") == "영상" for m in 미) else "사진" if 미 else "없음"


def 대표(증거들: list, 창고) -> str | None:
    """사건의 대표 글 — 영상 있는 글 먼저, 그다음 사진, 그 안에서 평소 대비 배수 큰 것(주간 AI 소식 미디어골라와 같은 생각)."""
    후보 = [x for x in (창고.꺼내기(번) for 번 in 증거들) if x]
    if not 후보:
        return None
    return max(후보, key=lambda x: (_미디어갈래(x) == "영상", _미디어갈래(x) != "없음", 창고.배수(x["번호"])))["번호"]


def _한줄(x: dict, 배수: float) -> str:
    r = x.get("반응") or {}
    누구 = f"{x['플랫폼']} @{x['계정']}" if x["플랫폼"] in ("x", "instagram", "threads") else x.get("계정", "")
    날 = x["날짜"][5:].replace("-", "/") if x.get("날짜") else "날짜 모름"
    반응 = (f" ♥{r.get('좋아요', 0):,}" + (f" ↻{r['공유']:,}" if r.get("공유") else "")) if r else ""
    배 = f" 평소의 {배수:g}배" if 배수 else ""
    갈래 = {"영상": "영상", "사진": "사진", "없음": "미디어 없음"}[_미디어갈래(x)]
    return f"{x['번호']}({누구} {날}{반응}{배} · {갈래})"


def _수확(곳: str, 창고) -> str:
    m = _곳꼴.match(곳)
    if not m:
        return ""
    같은것 = [x for x in 창고.것들.values() if x.get("플랫폼") == m.group(1) and x.get("계정") == m.group(2).lower()]
    if not 같은것:
        return " · 가져온 것 없음"
    안 = [x for x in 같은것 if not x.get("기간밖")]
    return f" · 가져온 {len(같은것)}건 중 기간 안 {len(안)}건, 영상 {sum(_미디어갈래(x) == '영상' for x in 안)}건"


def _살아있는(판: dict) -> list:
    return sorted(((이름, s) for 이름, s in 판["사건"].items() if s["상태"] != "버림"), key=lambda t: t[1]["상태"] != "채움")


def 지휘자글(판: dict, 주문서: dict, 창고, 기록: list, 예산줄: str, 경고들: list) -> str:
    o = 주문서
    줄 = ["# 작업판", "## 주문서",
         f"주제: {o['주제']} · 범위: {o['범위'] or '-'} · 기간: {o['시작']} ~ {o['끝']} ({o['기간말'] or '직접'})",
         f"넣을 것: {', '.join(o['넣을것']) or '-'} / 뺄 것: {', '.join(o['뺄것']) or '-'} · 목표 {o['목표건수']}건"
         f" · 한 장 단위: {o['한장단위'] or '-'} · 등급 {o['등급']}",
         "## 지금 단계", f"{판['단계']} {단계이름[판['단계']]}" + (f" — {판['판단줄'][-1]['말']}" if 판["판단줄"] else "")]
    살아있는 = _살아있는(판)
    줄.append(f"## 채울 칸 ({o['목표건수']}칸 중 {sum(s['상태'] == '채움' for _, s in 살아있는)}칸 채움)")
    for i, (이름, s) in enumerate(살아있는, 1):
        대 = 대표(s["증거"], 창고)
        증거글 = ", ".join(_한줄(창고.꺼내기(번), 창고.배수(번)) if 번 == 대 else 번 for 번 in s["증거"]) or "증거 없음"
        줄.append(f"{i}. [{s['상태']}] {이름} — {증거글}" + (f" · 메모: {s['메모']}" if s["메모"] else ""))
    다음 = len(살아있는) + 1
    if 다음 <= o["목표건수"]:
        줄.append(f"{다음}~{o['목표건수']}. 빈칸" if 다음 < o["목표건수"] else f"{다음}. 빈칸")
    버린 = [이름 for 이름, s in 판["사건"].items() if s["상태"] == "버림"]
    if 버린:
        줄.append("버린 사건: " + ", ".join(버린))
    줄.append("## 출처 지도")
    if 판["짐작지도"]:
        줄.append("짐작: " + " / ".join(f"{i}) {x['곳']} — {x['까닭']}" for i, x in enumerate(판["짐작지도"], 1)))
    줄 += [f"확인: {곳} — {v['판정']} · 근거: {v['근거'] or '-'}{_수확(곳, 창고)}" for 곳, v in 판["출처판정"].items()]
    줄 += [f"닫음: {x['곳']} — {x['까닭']}" for x in 판["닫은길"]]
    if not (판["짐작지도"] or 판["출처판정"] or 판["닫은길"]):
        줄.append("(아직 없음)")
    줄.append("## 이미 한 일 (같은 호출은 다시 하지 않는다)")
    줄 += [f"- {x['요약']} → " + (f"{x['증거'][0]}~{x['증거'][-1]}" if len(x["증거"]) > 1 else (x["증거"] or ["0건"])[0])
          + f" (새 것 {x['새것']})" + (f" ✗ {x['탈']}" if x.get("탈") else "") for x in 기록[-30:]] or ["(아직 없음)"]
    경고 = list(경고들) + 판["경고"][-5:] + [f"{도구} 는 이 판에서 껐다 — {까닭}" for 도구, 까닭 in 판["꺼진도구"].items()]
    if 경고:
        줄 += ["## 경고"] + [f"- {x}" for x in 경고]
    if 판["관문"]:
        줄 += ["## 관문이 돌려보낸 것 — 고쳐서 다시 submit_result"] + [f"- {x}" for x in 판["관문"]]
    줄.append(예산줄)
    return "\n".join(줄)


def 화면요약(판: dict, 주문서: dict, 창고, 예산) -> dict:
    칸 = [{"사건": 이름, "상태": s["상태"], "미디어": _미디어갈래(창고.꺼내기(대표(s["증거"], 창고) or ""))}
         for 이름, s in _살아있는(판)[:주문서["목표건수"]]]
    칸 += [{"사건": "", "상태": "빈칸", "미디어": ""} for _ in range(주문서["목표건수"] - len(칸))]
    return {"단계": 판["단계"], "단계이름": 단계이름[판["단계"]], "칸": 칸,
            "예산": {"호출": 예산.호출수(), "호출한도": 예산.한도["호출"], "돈": round(예산.돈(), 4),
                   "돈한도": 예산.한도["돈"], "남은분": round(max(0.0, 예산.남은분()), 1)}}


def 판단줄(판: dict) -> list[str]:
    return [f"{x['단계']} {x['말']}" for x in 판["판단줄"]][-200:]
