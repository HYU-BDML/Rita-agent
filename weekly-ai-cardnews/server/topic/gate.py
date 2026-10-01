# -*- coding: utf-8 -*-
"""관문 — submit_result 검사(설계 5장). 코드가 확정할 수 있는 것은 코드가, 요약 문장↔발췌와 같은 사건 의심만 판정관이.

코드: 증거 번호가 이번 판 것 · 발췌 글자 그대로 · 원문 날짜 기간 안·date 와 같음 · «지난주·최근» 없음 ·
요약의 숫자가 발췌에(그 소식 날짜의 숫자는 빼고) · 미디어가 그 글 것(기사 사진은 «장면» 판정만) · 같은 출처 둘 ·
공식·언론 판정이 아니면 «2차» 딱지 · 못 찾았다는 곳이 호출 기록에 있나.
«다시 생각해 봐» 식 자기 점검은 하지 않는다 — 늘 원문·기록·코드 대조. 애매하면 빼는 쪽."""
import re

필수칸 = ("hero", "event", "summary", "date", "source", "quote", "media")
_때말 = re.compile(r"지난\s?주|이번\s?주|최근|어제|오늘|그저께|엊그제|내일|며칠\s?전|last week|recently|yesterday|today",
                  re.I)
_번호 = re.compile(r"\[?E\d+(?:#\d+)?\]?")
_수 = re.compile(r"\d+(?:[.,]\d+)*")
_도구갈래 = {"x": ("x_search", "x_account"), "instagram": ("instagram_search", "instagram_account"),
          "threads": ("threads_account",), "web": ("web_search",), "page": ("read_page",)}


def _수들(글: str) -> set:
    return {x.replace(",", "") for x in _수.findall(_번호.sub(" ", 글 or ""))}


def _문장들(요약: str) -> list:
    글 = re.sub(r"\s+([.!?。])", r"\1", _번호.sub("", 요약 or ""))
    return [s.strip() for s in re.split(r"(?<=[.!?。])\s+", 글) if len(s.strip()) > 3]


def _낱말(글: str) -> set:
    return set(re.findall(r"[가-힣]{2,}|[A-Za-z]{3,}|\d+", _번호.sub(" ", 글 or "").lower()))


def _미디어검사(s: dict, x: dict) -> list:
    m = str(s["media"]).strip()
    if m == "없음":
        return []
    mm = re.fullmatch(r"(E\d+)(?:#(\d+))?", m)
    if not mm:
        return [f"media «{m}» 꼴이 틀림 — E3 · E3#1 · 없음 중 하나"]
    if mm.group(1) != x["번호"]:
        return [f"미디어 {m} 가 출처 글 {x['번호']} 에 붙은 것이 아님 — 다른 글의 미디어를 떼어 오지 않는다"]
    if mm.group(2) is None:
        return [] if x.get("미디어") else [f"출처 글 {x['번호']} 에 미디어가 없음 — «없음» 으로"]
    차례 = int(mm.group(2))
    if x.get("사진후보"):
        if not 1 <= 차례 <= len(x["사진후보"]):
            return [f"{m} 은 없는 사진 후보"]
        판정 = (x.get("사진판정") or {}).get(str(차례))
        return [] if 판정 == "장면" else [f"기사 사진 {m} 판정이 «{판정 or '없음'}» — view_images 로 «장면» 인 것만"]
    return [] if 1 <= 차례 <= len(x.get("미디어") or []) else [f"{m} 은 없는 미디어"]


def _코드검사(현, s: dict, 본주소: dict, i: int) -> list:
    o, 창 = 현.주문서, 현.창고
    빠진 = [k for k in 필수칸 if not str(s.get(k) or "").strip()]
    if 빠진:
        return [f"빈 칸 {', '.join(빠진)}"]
    출처 = str(s["source"]).strip()
    x = 창.꺼내기(출처) if "#" not in 출처 else None
    if not x:
        return [f"없는 증거 번호 {출처} — 도구 결과의 번호만"]
    문제 = []
    if not 창.발췌있나(x["번호"], s["quote"]):
        문제.append(f"발췌가 {x['번호']} 원문에 글자 그대로 없음")
    if not x.get("날짜"):
        문제.append(f"{x['번호']} 원문 날짜를 모름 — 날짜가 있는 1차 글로")
    elif not o["시작"] <= x["날짜"] <= o["끝"]:
        문제.append(f"{x['번호']} 원문 날짜 {x['날짜']} 가 기간({o['시작']}~{o['끝']}) 밖")
    elif str(s["date"]).strip() != x["날짜"]:
        문제.append(f"date {s['date']} 가 원문 날짜 {x['날짜']} 와 다름")
    때 = _때말.search(s["summary"])
    if 때:
        문제.append(f"요약에 «{때.group(0)}» — 절대 날짜로")
    날수 = set(re.findall(r"\d+", str(s["date"])))
    날수 |= {str(int(n)) for n in 날수}
    없는수 = sorted(_수들(s["summary"]) - _수들(s["quote"]) - 날수)
    if 없는수:
        문제.append(f"요약의 숫자 {', '.join(없는수)} 가 발췌에 없음")
    문제 += _미디어검사(s, x)
    if x["주소"] in 본주소:
        문제.append(f"{본주소[x['주소']] + 1}번 소식과 같은 출처")
    본주소.setdefault(x["주소"], i)
    판정 = 현.판["출처판정"].get(f"{x['플랫폼']}:{x['계정']}".lower(), {}).get("판정")
    딱지 = [t for t in s.get("tags") or [] if t in ("2차", "불확실")]
    if 판정 not in ("공식", "언론") and "2차" not in 딱지:
        딱지.append("2차")
    s["tags"] = 딱지
    return 문제


def _찾아봤나(현, 곳: str) -> bool:
    앞, _, 핵 = str(곳).partition(":") if ":" in str(곳) else ("", "", str(곳))
    핵 = 핵.strip().lstrip("@#").lower()
    갈래 = _도구갈래.get(앞.strip().lower())
    return bool(핵) and any(핵 in x["요약"].lower() for x in 현.예산.기록
                           if not x.get("탈") and (갈래 is None or x["도구"] in 갈래))


def 검사(현, 제출: dict, 마지막: bool) -> dict:
    소식들 = [x for x in 제출.get("items") or [] if isinstance(x, dict)]
    본주소 = {}
    문제 = {i: _코드검사(현, s, 본주소, i) for i, s in enumerate(소식들)}
    for i, s in enumerate(소식들):
        if 문제[i]:
            continue
        for 문장 in _문장들(s["summary"]):
            d = 현.판정관.문장(문장, s["quote"])
            if d["판정"] != "받쳐줌":
                문제[i].append(f"요약 문장 «{문장[:40]}» 이 발췌로 받쳐지지 않음({d['판정']}: {d['까닭']})")
                break
    살아 = [i for i in range(len(소식들)) if not 문제[i]]
    for k, a in enumerate(살아):
        for b in 살아[k + 1:]:
            if 문제[b]:
                continue
            가, 나 = 소식들[a], 소식들[b]
            합 = _낱말(가["summary"]) | _낱말(나["summary"])
            겹 = len(_낱말(가["summary"]) & _낱말(나["summary"])) / max(1, len(합))
            if 가["event"].strip() == 나["event"].strip() or (겹 >= 0.5 and 현.판정관.같은사건(가["summary"], 나["summary"])):
                문제[b].append(f"{a + 1}번 소식 «{가['event']}» 과 같은 사건 — 하나로 합쳐라")
    칸문제 = [f"못 채운 칸 «{u.get('slot')}»: «{곳}» 을 찾아본 기록이 없음 — 찾아보거나 빼라"
           for u in 제출.get("unfilled") or [] if isinstance(u, dict)
           for 곳 in u.get("searched") or [] if not _찾아봤나(현, 곳)]
    통과 = [s for i, s in enumerate(소식들) if not 문제[i]]
    if 마지막:
        return {"통과": 통과, "돌려보낼말": [],
                "뺀것": [{"사건": s.get("event") or "", "까닭": 문제[i][0]} for i, s in enumerate(소식들) if 문제[i]]}
    말 = [f"{i + 1}번 «{소식들[i].get('event') or '?'}»: {'; '.join(문제[i])}" for i in 문제 if 문제[i]] + 칸문제
    return {"통과": [] if 말 else 통과, "돌려보낼말": 말, "뺀것": []}
