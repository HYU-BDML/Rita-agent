# -*- coding: utf-8 -*-
"""매주 볼 곳 목록 — 저장한 분야가 주간 AI 소식처럼 «정해 둔 곳을 정해 둔 대로» 돌게(계획 4 설계 A).

지휘자가 판 끝에 `weekly_sources` 로 적은 것을 코드가 다듬어 한 줄 꼴(도구·인자·까닭)로 만들고, 사람이 저장 화면에서
뺀 나머지를 분야에 남긴다. 다음 판은 서버가 이 줄들을 지휘자보다 먼저 그대로 부른다(flow.목록보기).
이 파일은 도구를 부르지 않는다 — tools 가 결과 내기 재촉에 이 파일을 쓰니 거꾸로 가져오면 고리가 생긴다."""

도구들 = ("x_account", "instagram_account", "threads_account", "x_search", "instagram_search", "web_search", "read_page")
최대줄 = 10
# 도구마다 남길 인자 칸 — tools.도구설명 과 같아야 한다(시험이 맞춰 본다). read_page 의 find 는 그 주 낱말이라 뺀다
칸들 = {"x_account": ("account", "deep", "count"), "instagram_account": ("account", "deep", "count"),
       "threads_account": ("accounts",), "x_search": ("query", "count", "sort"),
       "instagram_search": ("query", "keyword", "count"), "web_search": ("query", "region", "use_period"),
       "read_page": ("url",)}
_필수 = {"x_account": "account", "instagram_account": "account", "threads_account": "accounts", "x_search": "query",
        "instagram_search": "query", "web_search": "query", "read_page": "url"}


def 대표(줄: dict) -> tuple[str, str]:
    """같은 곳 가리기 — (도구, 계정·검색어·주소 소문자). 떠 보기와 깊게 읽기는 같은 곳이다."""
    도구, 인자 = 줄.get("도구") or "", 줄.get("인자") or {}
    if 도구 == "threads_account":
        값 = ",".join(sorted(str(a).strip().lstrip("@").lower() for a in 인자.get("accounts") or []))
    elif 도구 in ("x_account", "instagram_account"):
        값 = str(인자.get("account") or "").strip().lstrip("@")
    elif 도구 == "read_page":
        값 = str(인자.get("url") or "").strip().rstrip("/")
    else:
        값 = str(인자.get("query") or "").strip().lstrip("#")
    return 도구, 값.lower()


def _한줄(x) -> dict | None:
    if not isinstance(x, dict):
        return None
    도구 = str(x.get("tool") or x.get("도구") or "").strip()
    원인자 = x.get("args") if "args" in x else x.get("인자")
    if 도구 not in 칸들 or not isinstance(원인자, dict):
        return None
    인자 = {k: v for k, v in 원인자.items() if k in 칸들[도구]}
    필수 = 인자.get(_필수[도구])
    if 도구 == "threads_account":
        if not isinstance(필수, list):
            return None
        인자["accounts"] = [str(a).strip().lstrip("@") for a in 필수 if str(a).strip()][:5]
        if not 인자["accounts"]:
            return None
    elif not isinstance(필수, str) or not 필수.strip():
        return None
    if 도구 in ("x_account", "instagram_account"):
        인자["account"] = 필수.strip().lstrip("@")
        인자["deep"] = True  # 최근 5개 떠 보기는 매주 볼 일이 아니다
    if 도구 == "web_search":
        인자["use_period"] = True  # 매주 그 주 기사만
    return {"도구": 도구, "인자": 인자, "까닭": str(x.get("why") or x.get("까닭") or "").strip()[:80]}


def 다듬기(줄들) -> list[dict]:
    """지휘자의 weekly_sources(`[{tool, args, why}]`)나 이미 다듬은 줄(`[{도구, 인자, 까닭}]`)을 한 줄 꼴로 — 같은 곳은 하나,
    10줄까지. 틀린 줄은 조용히 버린다(관문은 목록 때문에 소식을 돌려보내지 않는다)."""
    난것, 본것 = [], set()
    for x in 줄들 if isinstance(줄들, list) else []:
        줄 = _한줄(x)
        if 줄 is None or 대표(줄) in 본것:
            continue
        본것.add(대표(줄))
        난것.append(줄)
        if len(난것) == 최대줄:
            break
    return 난것


def 줄만(x: dict) -> dict:
    """화면용 칸(글·숫자·갈래)을 뗀 한 줄 — 분야에 남기는 꼴."""
    return {"도구": x["도구"], "인자": x["인자"], "까닭": x.get("까닭") or ""}


def 화면글(줄: dict) -> str:
    도구, 인 = 줄["도구"], 줄["인자"]
    if 도구 == "x_account":
        return f"X @{인['account']} 최근 글 {인.get('count') or 40}개"
    if 도구 == "instagram_account":
        return f"인스타 @{인['account']} 최근 글 {인.get('count') or 30}개"
    if 도구 == "threads_account":
        return "스레드 " + ", ".join("@" + a for a in 인["accounts"]) + " 최근 글"
    if 도구 == "x_search":
        return f"X에서 «{인['query']}» 검색 {인.get('count') or 20}개"
    if 도구 == "instagram_search":
        return f"인스타에서 «{인['query'].lstrip('#')}» 검색"
    if 도구 == "web_search":
        return f"웹·뉴스에서 «{인['query']}» 검색"
    return f"페이지 {인['url'][:60]} 보기"


def 숫자(줄: dict, 호출기록: list, 것들: dict, 묶음: list) -> str:
    """이번 판에서 이 곳이 얼마나 쓸모 있었나 — 사람이 저장 화면에서 뺄지 고를 때 보는 숫자(설계 A-2)."""
    나 = 대표(줄)
    맞은 = [x for x in 호출기록 if x.get("도구") in 칸들 and 대표({"도구": x["도구"], "인자": x.get("인자") or {}}) == 나]
    if not 맞은:
        return "이번 판에서 안 봄"
    번호들 = {b for x in 맞은 for b in x.get("증거") or []}
    if not 번호들 and all(x.get("탈") for x in 맞은):
        return "이번 판: 못 읽음"
    안 = sum(1 for b in 번호들 if b in 것들 and not 것들[b].get("기간밖"))
    쓰임 = sum(1 for d in 묶음 if (d.get("출처") or {}).get("증거") in 번호들)
    return f"이번 판: 기간 안 글 {안}개 · 소식 {쓰임}건에 쓰임"


def 후보만들기(제출목록, 호출기록: list, 것들: dict, 묶음: list, 지금목록: list | None = None) -> list[dict]:
    """정리 단계의 `result["목록후보"]`. 목록 판이면 지금 목록을 늘 모두 앞에(«지금 목록»), 지휘자가 이번에 새로 적은 곳은
    뒤에(«새로 찾은 곳») — 지휘자가 좋은 줄을 빼먹어도 사라지지 않게(설계 A-3)."""
    새 = 다듬기(제출목록)
    if 지금목록 is None:
        줄들 = [(줄, None) for 줄 in 새]
    else:
        지금 = 다듬기(지금목록)
        있는 = {대표(줄) for 줄 in 지금}
        줄들 = [(줄, "지금 목록") for 줄 in 지금] + [(줄, "새로 찾은 곳") for 줄 in 새 if 대표(줄) not in 있는]
    return [{**줄, "글": 화면글(줄), "숫자": 숫자(줄, 호출기록, 것들, 묶음), "갈래": 갈래} for 줄, 갈래 in 줄들]


def 결과글(목록글: list) -> str:
    """목록 판의 첫 구간에 작업판 뒤에 붙이는 글 — 서버가 목록대로 이미 부른 도구 결과(설계 A-4)."""
    줄 = ["## 저장한 목록으로 이미 모았다 — 아래가 그 결과다(같은 호출은 다시 하지 않는다)"]
    for x in 목록글:
        줄 += [f"### {x['글']}", x["결과"]]
    return "\n".join(줄)
