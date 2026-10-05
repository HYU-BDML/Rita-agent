# -*- coding: utf-8 -*-
"""계획 3 평가 — 처음 보는 주제 8개로 «주제 소식» 지휘자와 카드뉴스를 잰다(설계 3장).

    python weekly/tests/eval_topic.py 돌리기          남은 판을 2판씩 돌리고($9 넘으면 멈춤) 점수·화면
    python weekly/tests/eval_topic.py 한판 아이브      한 판만(카드까지) — 진짜 시험
    python weekly/tests/eval_topic.py 점수            판은 안 돌리고 점수·화면만 다시(정답지를 고친 뒤)
    python weekly/tests/eval_topic.py 계획4 돈      계획 4 진짜 시험 — 장부·돈·채점·화면 (계획4 만 치면 쓰는 법)

판 기록은 창고에 직접 쓰고 람다를 직접 부른다 — 앞문의 «하루 10판·동시 2판» 은 사람 판 셈이라 안 거친다(판에 «평가» 표시).
돈 드는 것은 판 하나(딥시크·Apify·그림)와 정답지 짝짓기(flash) — 합계 $9 를 넘으면 남은 판을 안 돌린다.
"""
import json
import sys
import time
from datetime import date, datetime, timedelta, timezone
from html import escape
from pathlib import Path

여기 = Path(__file__).resolve().parent
sys.path.insert(0, str(여기.parent / "server"))

import store  # noqa: E402
from topic import board, flow, order  # noqa: E402

REGION, NAME, BUCKET = "ap-northeast-2", "weekly-ai", "<S3 통 이름>"
결과파일 = 여기 / "평가" / "결과.json"
정답지파일 = 여기 / "평가" / "정답지.json"
돈한도 = 9.0
동시 = 2
기다림분 = 50
기간 = {"종류": "직접", "시작": "2026-09-21", "끝": "2026-09-27", "말": "9월 3주차"}

주제들 = {  # 처음 보는 주제 8개 — 사용자 2026-10-04 (6번은 정답지 조사로 파리 → 밀라노, 원장 Task 5 Ruling)
    "아이브": {"주제": "아이브(IVE)", "범위": "그룹과 멤버", "분야이름": "아이브",
             "한장단위": "소식 하나가 한 장 — 칩에는 멤버 이름이나 «아이브»"},
    "손흥민": {"주제": "손흥민", "범위": "선수 개인 — 대표팀·소속팀 경기와 발언", "분야이름": "손흥민",
             "한장단위": "소식 하나가 한 장 — 칩에는 «손흥민» 이나 팀 이름"},
    "삼성전자": {"주제": "삼성전자", "범위": "회사 발표·제품·실적·주가", "분야이름": "삼성전자",
              "한장단위": "소식 하나가 한 장 — 칩에는 제품·사업 이름"},
    "테슬라": {"주제": "테슬라(TSLA) 주가와 주가를 움직인 사건", "범위": "테슬라 한 종목", "분야이름": "테슬라",
             "한장단위": "소식 하나가 한 장 — 칩에는 «테슬라» 나 제품 이름"},
    "메이플스토리": {"주제": "메이플스토리", "범위": "게임 공지·업데이트·이벤트·관련 소식", "분야이름": "메이플스토리",
                "한장단위": "소식 하나가 한 장 — 칩에는 «메이플스토리» 나 행사 이름"},
    "밀라노 패션위크": {"주제": "밀라노 패션위크(2027 봄·여름)", "범위": "브랜드 쇼와 화제의 인물", "분야이름": "밀라노 패션위크",
                  "한장단위": "소식 하나가 한 장 — 칩에는 브랜드 이름"},
    "원더걸스": {"주제": "원더걸스", "범위": "그룹", "분야이름": "원더걸스", "한장단위": "소식 하나가 한 장", "함정": True},
    "싸이월드": {"주제": "싸이월드", "범위": "회사와 서비스", "분야이름": "싸이월드", "한장단위": "소식 하나가 한 장",
              "함정": True},
}
보통 = [k for k, v in 주제들.items() if not v.get("함정")]
판목록 = ([{"판": f"기본-{k}", "주제": k, "지휘": "pro", "카드": not 주제들[k].get("함정")} for k in 주제들]
        + [{"판": f"다시{i}-{k}", "주제": k, "지휘": "pro", "카드": False} for k in ("아이브", "삼성전자") for i in (1, 2)]
        + [{"판": f"flash-{k}", "주제": k, "지휘": "flash", "카드": False} for k in 보통])


def 주문서(키: str) -> dict:
    v = 주제들[키]
    return order.다듬기({"주제": v["주제"], "범위": v["범위"], "기간": 기간, "넣을것": [], "뺄것": [], "목표건수": 5,
                       "한장단위": v["한장단위"], "분야이름": v["분야이름"], "등급": "B"}, date(2026, 10, 4))


def _창고():
    import boto3
    return store.창고(boto3.client("s3", region_name=REGION), BUCKET)


def 판만들기(칸: dict, 창=None, 부르기=None, job: str | None = None) -> str:
    창 = 창 or _창고()
    job = job or store.새번호표()  # 돌리기는 번호를 먼저 결과 파일에 적고 넘긴다(계획 4 D-6)
    기록 = flow.새기록(job, 주문서(칸["주제"]))
    기록.update(평가=True, 평가판=칸["판"], 카드=칸["카드"])
    if 칸["지휘"] == "flash":
        기록["지휘모델"] = "deepseek-flash"
    창.쓰기(기록)
    if 부르기 is None:
        import boto3
        lam = boto3.client("lambda", region_name=REGION)
        부르기 = lambda j: lam.invoke(FunctionName=NAME, InvocationType="Event",  # noqa: E731
                                    Payload=json.dumps({"_job": j, "_stage": "모으기"}).encode("utf-8"))
    부르기(job)
    return job


def 결과읽기() -> dict:
    return json.loads(결과파일.read_text(encoding="utf-8")) if 결과파일.exists() else {"판들": {}}


def 결과쓰기(d: dict) -> None:
    결과파일.parent.mkdir(parents=True, exist_ok=True)
    결과파일.write_text(json.dumps(d, ensure_ascii=False, indent=1), encoding="utf-8")


def 끝났나(기록: dict) -> bool:
    return 기록.get("state") in ("됨", "실패", "멈춤")


def 쓴돈(d: dict) -> float:
    """다시 돌리느라 버린 판의 돈도 센다 — 이미 나간 돈이다."""
    return round(sum((x.get("돈") or 0) for x in d["판들"].values())
                 + sum((x.get("돈") or 0) for x in d.get("버린판") or []), 4)


def 다시(이름들: list, 까닭: str, 돌리기=None) -> None:
    """망가진 판(예: 도구가 꺼진 판)을 버린판으로 옮기고 다시 돌린다."""
    d = 결과읽기()
    for 판 in 이름들:
        x = d["판들"].pop(판)
        d.setdefault("버린판", []).append({"판": 판, **{k: v for k, v in x.items() if k != "점수"}, "까닭": 까닭})
    결과쓰기(d)
    (돌리기 or globals()["돌리기"])()


def 판돈(기록: dict) -> float:
    """한 판에 쓴 돈 — 기록의 합계(딥시크 + Apify + 그림)."""
    return round((기록.get("cost") or {}).get("합계") or 0, 4)


def 기다리기(job: str, 창, 분: int = 기다림분, 잠=time.sleep) -> dict:
    끝 = time.monotonic() + 분 * 60
    while True:
        기록 = 창.읽기(job) or {}
        if 끝났나(기록) or time.monotonic() > 끝:
            return 기록
        잠(30)


한판여유 = 0.7  # 새 판을 열기 전 «한 판이 넉넉히 이만큼» — 실측 최대 $0.638(기본-밀라노 패션위크, 카드까지) 위로(계획 4 D-5)
멈춤분 = 30  # 판 기록이 이만큼 안 바뀌면 죽은 판 — 앞문(app._멈춤판정)과 같은 셈
돈안드는도구 = ("update_board", "get_evidence", "recall_sources", "submit_result")


def _분(기록: dict) -> float | None:
    try:
        가, 나 = (datetime.strptime(기록[k], "%Y-%m-%dT%H:%M:%SZ") for k in ("started", "updated"))
    except (KeyError, TypeError, ValueError):
        return None
    return round((나 - 가).total_seconds() / 60, 1)


def 점수(기록: dict, 정답: dict, 짝짓기, 발췌있나) -> dict:
    """한 판 점수(설계 3-3). 짝짓기(정답 사건들, 결과 소식들) → {소식 번호: 사건 번호 | None}."""
    r, o = 기록.get("result") or {}, 기록.get("order") or {}
    소식들 = r.get("bundle") or []
    맞는 = list(정답.get("꼭") or []) + list(정답.get("있던") or [])
    사건들 = 맞는 + [{"사건": x["사건"], "날짜": "", "설명": "나오면 안 되는 것 — " + x.get("까닭", "")}
                    for x in 정답.get("안됨") or []]  # 안 되는 것에 맞으면 «틀린 소식»
    꼭수 = len(정답.get("꼭") or [])
    짝 = 짝짓기(사건들, 소식들) if 소식들 and 사건들 else {i: None for i in range(len(소식들))}
    찾은번호 = sorted({j for j in 짝.values() if j is not None and j < 꼭수})
    이차 = sum(1 for d in 소식들 if "2차" in (d.get("딱지") or []))
    c = 기록.get("cost") or {}
    s = {"상태": 기록.get("state"), "소식수": len(소식들), "꼭수": 꼭수,
         "찾은": [사건들[j]["사건"] for j in 찾은번호],
         "못찾은": [x["사건"] for j, x in enumerate(사건들[:꼭수]) if j not in 찾은번호],
         "찾은비율": round(len(찾은번호) / 꼭수, 2) if 꼭수 else None,
         "기간밖": [d["사건"] for d in 소식들 if not (o.get("시작", "") <= (d.get("날짜") or "") <= o.get("끝", ""))],
         "확인필요": [d["사건"] for i, d in enumerate(소식들) if 짝.get(i) is None],
         "틀린": [d["사건"] for i, d in enumerate(소식들) if 짝.get(i) is not None and 짝[i] >= len(맞는)],
         "지어낸": [d["사건"] for d in 소식들 if not 발췌있나((d.get("출처") or {}).get("증거"), d.get("발췌") or "")],
         "1차비율": round(1 - 이차 / len(소식들), 2) if 소식들 else None,
         "돈": round(c.get("합계") or 0, 4), "딥시크": round(c.get("딥시크") or 0, 4),
         "아피파이": round(c.get("아피파이") or 0, 4), "그림": round(c.get("그림") or 0, 4), "분": _분(기록),
         "호출": sum(1 for x in (기록.get("재료") or {}).get("호출기록") or []
                   if x.get("도구") not in 돈안드는도구 and not x.get("저장해둔")),
         "못채운": len(r.get("unfilled") or []), "카드": r.get("카드"), "오류": 기록.get("error"),
         "소식": [{"사건": d["사건"], "주인공": d.get("주인공"), "날짜": d.get("날짜"),
                 "짝": 사건들[짝[i]]["사건"] if 짝.get(i) is not None else None,
                 "틀림": 짝.get(i) is not None and 짝[i] >= len(맞는)} for i, d in enumerate(소식들)]}
    if 정답.get("함정"):
        s["함정정직"] = not s["기간밖"] and not s["확인필요"] and not s["지어낸"] and not s["틀린"]
    return s


def 남은몫(d: dict) -> float:
    """아직 도는 판이 앞으로 더 쓸 수 있는 돈 — 판마다 «한 판 여유» 에서 이미 쓴 만큼을 뺀다(계획 4 D-5)."""
    return round(sum(max(0.0, 한판여유 - (x.get("돈") or 0)) for x in d["판들"].values()
                     if x.get("state") not in ("됨", "실패", "멈춤", "늦음")), 4)


def _죽었나(기록: dict, 시작: float, 지금: datetime) -> bool:
    """30분 넘게 기록이 안 바뀐 «만드는 중» 판 — 오래 걸려도 바뀌고 있으면 자리를 지킨다(늦은 판 자리 비움, 계획 4 D-5).
    기록이 아예 없으면 연 지 30분까지 기다려 본다."""
    if not 기록:
        return time.time() - 시작 > 멈춤분 * 60
    if 기록.get("state") != "만드는 중" or not 기록.get("updated"):
        return False
    바뀐때 = datetime.strptime(기록["updated"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    return 지금 - 바뀐때 > timedelta(minutes=멈춤분)


def 돌리기(만들기=None, 읽기=None, 잠=time.sleep, 점수매기기=None, 지금=None) -> None:
    """남은 판을 2판씩 — 끊겼다 다시 돌리면 끝난 판은 건너뛰고 도는 판은 기다린다. 쓴 돈 + 도는 판이 더 쓸 몫 + 새 판
    여유가 $9 를 넘으면 새 판을 안 연다. 판 번호를 먼저 결과 파일에 적고 연다 — 열다 끊기면 같은 번호로 마저 연다(D-5·D-6)."""
    지금 = 지금 or (lambda: datetime.now(timezone.utc))
    if 만들기 is None or 읽기 is None:
        창 = _창고()
        만들기 = 만들기 or (lambda 칸, job: 판만들기(칸, 창, job=job))
        읽기 = 읽기 or 창.읽기
    d = 결과읽기()
    for 판, x in d["판들"].items():  # 번호만 적고 끊긴 판 — 창고에 기록이 없으면 같은 번호로 마저 연다
        if x.get("state") == "여는 중":
            if 읽기(x["job"]) is None:
                만들기(next(칸 for 칸 in 판목록 if 칸["판"] == 판), x["job"])
            x["state"] = "만드는 중"
    결과쓰기(d)
    도는 = {판: x["job"] for 판, x in d["판들"].items() if x.get("state") not in ("됨", "실패", "멈춤", "늦음")}
    대기 = [칸 for 칸 in 판목록 if 칸["판"] not in d["판들"]]
    while 대기 or 도는:
        while 대기 and len(도는) < 동시:
            if 쓴돈(d) + 남은몫(d) + 한판여유 > 돈한도:
                d["멈춤"] = (f"쓴 돈 ${쓴돈(d):.2f} + 도는 판 몫 ${남은몫(d):.2f} + 새 판 여유 ${한판여유} 가 한도 "
                           f"${돈한도} 를 넘어 남은 {len(대기)}판을 안 돌림")
                print("!!", d["멈춤"])
                대기 = []
                break
            칸 = 대기.pop(0)
            job = store.새번호표()
            d["판들"][칸["판"]] = {"job": job, "state": "여는 중", "돈": 0, "시작": time.time()}
            결과쓰기(d)  # 번호 먼저 — 열다 끊겨도 다시 돌릴 때 같은 판을 또 열지 않게
            만들기(칸, job)
            d["판들"][칸["판"]]["state"] = "만드는 중"
            결과쓰기(d)
            도는[칸["판"]] = job
            print(f"열림 {칸['판']} {job}")
        if not 도는:
            break
        잠(30)
        for 판, job in list(도는.items()):
            기록_ = 읽기(job) or {}
            x = d["판들"][판]
            x["돈"] = 판돈(기록_)
            if 끝났나(기록_) or _죽었나(기록_, x.get("시작") or time.time(), 지금()):
                x["state"] = 기록_.get("state") if 끝났나(기록_) else "멈춤"
                del 도는[판]
                print(f"끝 {판} {x['state']} ${x['돈']} · 합계 ${쓴돈(d)}")
            결과쓰기(d)
    (점수매기기 or 점수화면)(d)


짝지시 = ("너는 평가 채점관이다. «정답 사건» 목록과 «결과 소식» 목록이 있다. 결과 소식마다 같은 일을 다룬 정답 사건 번호를 "
         "하나 고른다(날짜가 하루 이틀 달라도, 말이 달라도 같은 일이면 같다). 맞는 것이 없으면 null. "
         "JSON 한 줄로만 답한다: {\"짝\": {\"0\": 2, \"1\": null}}")


def 다수결(답들: list) -> dict:
    """소식마다 두 번 이상 같은 짝만 — 없으면 None. flash 는 흔들림 0 으로 물어도 다시 셀 때 답이 바뀌었다."""
    from collections import Counter
    난것 = {}
    for i in set().union(*답들) if 답들 else ():
        n, 수 = Counter(d.get(i) for d in 답들).most_common(1)[0]
        난것[i] = n if 수 >= 2 else None
    return 난것


def 세번짝짓기(사건들: list, 소식들: list) -> dict:
    return 다수결([flash짝짓기(사건들, 소식들) for _ in range(3)])


def flash짝짓기(사건들: list, 소식들: list) -> dict:
    """정답지 짝짓기 — 판정관과 같은 flash·생각 끔·흔들림 0. 한 판에 1센트 안짝."""
    import deepseek
    from topic import judge
    가 = "\n".join(f"{j}. {x['사건']} ({x.get('날짜', '')}) {x.get('설명', '')}" for j, x in enumerate(사건들))
    나 = "\n".join(f"{i}. [{d.get('주인공', '')}] {d['사건']} ({d.get('날짜', '')}) — {(d.get('요약') or '')[:160]}"
                  for i, d in enumerate(소식들))
    답 = deepseek.도구대화([{"role": "system", "content": 짝지시},
                         {"role": "user", "content": f"정답 사건:\n{가}\n\n결과 소식:\n{나}"}], 2000,
                        모델=deepseek.MODEL_빠름, 생각=False, 온도=0)
    짝 = judge._제이슨(답["글"]).get("짝") or {}

    def 좋은(v):
        return isinstance(v, int) and not isinstance(v, bool) and 0 <= v < len(사건들)
    return {i: 짝.get(str(i)) if 좋은(짝.get(str(i))) else None for i in range(len(소식들))}


확인폴더 = Path(r"C:\Users\david\project\trend\_확인")


def 점수화면(d: dict | None = None, 열기: bool = True) -> Path:
    """끝난 판마다 점수를 매겨 결과.json 에 적고, 결과 화면 HTML 한 장을 만들어 띄운다."""
    from topic import evidence
    d = d or 결과읽기()
    정답지 = json.loads(정답지파일.read_text(encoding="utf-8"))
    창 = _창고()
    칸들 = {c["판"]: c for c in 판목록}
    for 판, x in d["판들"].items():
        if x.get("state") not in ("됨", "실패", "멈춤", "늦음") or 판 not in 칸들:
            continue
        기록 = 창.읽기(x["job"]) or {}
        증거 = evidence.증거창고(창.s3, BUCKET, x["job"])
        x["점수"] = 점수(기록, 정답지["주제들"][칸들[판]["주제"]], 세번짝짓기, 증거.발췌있나)
    결과쓰기(d)
    확인폴더.mkdir(parents=True, exist_ok=True)
    p = 확인폴더 / f"평가_{datetime.now().strftime('%m%d_%H%M')}.html"
    p.write_text(화면(d, 정답지), encoding="utf-8")
    if 열기:
        import subprocess
        subprocess.run(["powershell", "-NoProfile", "-Command", f"Start-Process '{p}'"], check=False)
    return p


def _표(머리: list, 줄들: list) -> str:
    return ("<table><thead><tr>" + "".join(f"<th>{escape(h)}</th>" for h in 머리) + "</tr></thead><tbody>"
            + "".join("<tr>" + "".join(f"<td>{c}</td>" for c in 줄) + "</tr>" for 줄 in 줄들) + "</tbody></table>")


def _표시(값, 좋음: bool) -> str:
    return f'<span class="{"좋음" if 좋음 else "나쁨"}">{escape(str(값))}</span>'


def _한줄(판: str, x: dict, 함정: bool) -> list:
    s = x.get("점수")
    if not s:
        return [escape(판), escape(str(x.get("state"))), *[""] * 11]
    찾음 = "—" if not s["꼭수"] else _표시(f"{len(s['찾은'])}/{s['꼭수']} ({round((s['찾은비율'] or 0) * 100)}%)",
                                        (s["찾은비율"] or 0) >= 0.7)
    카 = s.get("카드") or {}
    if 카.get("보기"):
        카드 = f'<a href="{escape(카["보기"])}" target="_blank">{escape(str(카.get("장수")))}장</a>'
    elif 카.get("오류"):
        카드 = _표시("못 만듦: " + 카["오류"][:50], False)
    else:
        카드 = "—"
    return [escape(판), s["소식수"], 찾음, _표시(len(s["지어낸"]), not s["지어낸"]), _표시(len(s["기간밖"]), not s["기간밖"]),
            _표시(len(s.get("틀린") or []), not s.get("틀린")),
            "—" if s["1차비율"] is None else _표시(f"{round(s['1차비율'] * 100)}%", s["1차비율"] >= 0.8),
            len(s["확인필요"]), (_표시("정직" if s["함정정직"] else "아님", s["함정정직"]) if 함정 else "—"),
            f"${s['돈']:.3f}", f"{s['분']}분" if s["분"] is not None else "—", s["호출"], 카드]


_모양 = (":root{--바탕:#fff;--글:#1d1d1f;--흐림:#6e6e73;--줄:#e5e5ea;--좋음:#1a7f37;--나쁨:#c62828}"
        "@media (prefers-color-scheme: dark){:root{--바탕:#111;--글:#f2f2f7;--흐림:#a1a1a6;--줄:#333;--좋음:#3fb950;--나쁨:#ff6b6b}}"
        "body{background:var(--바탕);color:var(--글);font-family:system-ui,sans-serif;margin:0 auto;max-width:1200px;"
        "padding:16px;line-height:1.5}"
        "table{border-collapse:collapse;width:100%;margin:8px 0 24px;font-size:14px;display:block;overflow-x:auto}"
        "th,td{border-bottom:1px solid var(--줄);padding:6px 8px;text-align:left;white-space:nowrap}"
        "th{color:var(--흐림);font-weight:600}.좋음{color:var(--좋음);font-weight:600}.나쁨{color:var(--나쁨);font-weight:600}"
        ".흐림{color:var(--흐림)}.카드들{display:flex;flex-wrap:wrap;gap:16px}figure{margin:0}"
        "iframe{width:340px;max-width:100%;height:600px;border:0;border-radius:8px;background:#111}"
        "details{border-bottom:1px solid var(--줄);padding:6px 0}summary{cursor:pointer}")


def 화면(d: dict, 정답지: dict) -> str:
    판들 = d["판들"]
    칸들 = {c["판"]: c for c in 판목록}
    머리 = ["판", "소식", "꼭 나올 사건 찾음", "지어낸", "기간 밖", "나오면 안 될 것", "1차 출처", "확인 필요", "함정", "돈", "시간",
          "도구 호출", "카드뉴스"]
    기본 = [_한줄(판, 판들[판], bool(정답지["주제들"][칸["주제"]].get("함정"))) for 판, 칸 in 칸들.items()
           if 판.startswith("기본-") and 판 in 판들]
    비교 = []
    for k in 보통:
        p, f = (판들.get(f"기본-{k}") or {}).get("점수"), (판들.get(f"flash-{k}") or {}).get("점수")
        if not (p and f):
            continue
        비교.append([escape(k), f"{len(p['찾은'])}/{p['꼭수']} · {len(f['찾은'])}/{f['꼭수']}",
                   f"{len(p['지어낸'])} · {len(f['지어낸'])}", f"{len(p['기간밖'])} · {len(f['기간밖'])}",
                   f"{round((p['1차비율'] or 0) * 100)}% · {round((f['1차비율'] or 0) * 100)}%",
                   f"${p['돈']:.3f} · ${f['돈']:.3f}", f"${p['딥시크']:.3f} · ${f['딥시크']:.3f}",
                   f"{p['분']} · {f['분']}분", f"{p['호출']} · {f['호출']}"])
    같은 = []
    for k in ("아이브", "삼성전자"):
        셋 = [(판, (판들.get(판) or {}).get("점수")) for 판 in (f"기본-{k}", f"다시1-{k}", f"다시2-{k}")]
        셋 = [(판, s) for 판, s in 셋 if s]
        if not 셋:
            continue
        공통 = set.intersection(*(set(s["찾은"]) for _, s in 셋))
        for 판, s in 셋:
            같은.append([escape(판), f"{len(s['찾은'])}/{s['꼭수']}", escape(", ".join(s["찾은"]) or "없음")])
        같은.append([f"<b>{escape(k)} 세 판 공통</b>", f"{len(공통)}개", escape(", ".join(sorted(공통)) or "없음")])
    카드들 = "".join(
        f'<figure><figcaption>{escape(판)}</figcaption><iframe src="{escape(x["점수"]["카드"]["보기"])}" '
        f'loading="lazy"></iframe></figure>'
        for 판, x in 판들.items() if x.get("점수") and (x["점수"].get("카드") or {}).get("보기"))
    자세히 = ""
    for 판, x in 판들.items():
        s = x.get("점수")
        if not s:
            continue
        줄 = "".join(
            f"<li>{escape(str(v.get('날짜')))} · [{escape(str(v.get('주인공')))}] {escape(v['사건'])} → "
            + (f'<span class="나쁨">{escape(v["짝"])}</span>' if v.get("틀림") else f"<b>{escape(v['짝'])}</b>" if v["짝"]
               else '<span class="나쁨">정답지에 없음(확인 필요)</span>') + "</li>"
            for v in s["소식"])
        오류 = f" · 오류: {escape(str(s['오류'])[:80])}" if s.get("오류") else ""
        자세히 += (f"<details><summary>{escape(판)} — 소식 {s['소식수']}건 · {escape(str(s['상태']))}{오류}</summary>"
                f"<ul>{줄 or '<li>소식 없음</li>'}</ul>"
                f"<p>못 찾은 꼭 사건: {escape(', '.join(s['못찾은']) or '없음')}</p>"
                f"<p class=\"흐림\">job {escape(x['job'])}</p></details>")
    pro = [x["점수"] for 판, x in 판들.items() if 판.startswith("기본-") and x.get("점수") and x["점수"]["꼭수"]]
    평균 = round(sum(s["찾은비율"] for s in pro) / len(pro) * 100) if pro else 0
    지어낸합 = sum(len(x["점수"]["지어낸"]) for x in 판들.values() if x.get("점수"))
    기간밖합 = sum(len(x["점수"]["기간밖"]) for x in 판들.values() if x.get("점수"))
    멈춤 = f'<p class="나쁨">{escape(d["멈춤"])}</p>' if d.get("멈춤") else ""
    if d.get("버린판"):
        멈춤 += ('<p class="흐림">다시 돌린 판 ' + str(len(d["버린판"])) + "개 — "
               + escape("; ".join(f"{x['판']}({x['까닭']}, ${x.get('돈') or 0:.2f})" for x in d["버린판"])) + "</p>")
    판수 = len([x for x in 판들.values() if x.get("점수")])
    return (
        "<!doctype html><html lang=\"ko\"><head><meta charset=\"utf-8\">"
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>주제 소식 평가</title><style>"
        + _모양 + "</style></head><body>"
        "<h1>주제 소식 평가 — 9월 3주차 (2026-09-21 ~ 09-27)</h1>"
        f"<p>처음 보는 주제 8개 · 점수 매긴 판 {판수}개 · 쓴 돈 <b>${쓴돈(d):.2f}</b> (한도 $10)"
        f" · pro 평균 찾은 정도 <b>{평균}%</b>(합격선 70%) · 지어낸 소식 <b>{지어낸합}건</b>(합격선 0)"
        f" · 기간 밖 소식 <b>{기간밖합}건</b>(합격선 0)</p>{멈춤}"
        f"<h2>pro 지휘자 — 주제별 (카드까지)</h2>{_표(머리, 기본)}"
        "<h2>flash 대 pro — 보통 주제 6개 (앞이 pro · 뒤가 flash)</h2>"
        + _표(["주제", "꼭 나올 사건 찾음", "지어낸", "기간 밖", "1차 출처", "돈", "그중 딥시크", "시간", "도구 호출"], 비교)
        + f"<h2>같은 결과가 나오나 — 같은 주제 세 판</h2>{_표(['판', '찾음', '찾은 사건'], 같은)}"
        + f"<h2>카드뉴스 {카드들.count('<figure>')}벌 — 잘 나왔는지는 사용자가 봅니다</h2><div class=\"카드들\">{카드들}</div>"
        + f"<h2>판마다 자세히 — 결과 소식이 정답지의 어느 사건인가</h2>{자세히}"
        + "<p class=\"흐림\">정답지: 웹 검색 초안(2026-10-04 밤). 고치면 «python weekly/tests/eval_topic.py 점수» 로 다시 셉니다."
        " 짝짓기는 판정관(flash)에게 세 번 물어 두 번 이상 같은 답만 썼습니다.</p></body></html>")


def 한판(키: str) -> None:
    창 = _창고()
    칸 = {"판": f"기본-{키}", "주제": 키, "지휘": "pro", "카드": not 주제들[키].get("함정")}
    job = 판만들기(칸, 창)
    print(f"판 {job} ({칸['판']}) — 기다린다")
    기록 = 기다리기(job, 창)
    d = 결과읽기()
    d["판들"][칸["판"]] = {"job": job, "state": 기록.get("state"), "돈": 판돈(기록)}
    결과쓰기(d)
    r = 기록.get("result") or {}
    print("끝:", 기록.get("state"), 기록.get("error"), "· 소식", len(r.get("bundle") or []), "· 카드", r.get("카드"),
          "· 돈", 기록.get("cost"))


# ── 계획 4 진짜 시험 (설계 «시험»·«합격 기준») ─────────────────────────────────
계획4파일 = 여기 / "평가" / "계획4.json"
딥시크한도4 = 6.0   # 사용자 «딥시크는 총 6달러 넘지마»(2026-10-04)
그림한도4 = 2.0     # 그림(OpenAI)은 사용자가 말하지 않아 내가 정한 멈춤선(설계 «내가 정한 것»)
한시험넉넉히 = 0.6  # 새 시험 판을 열기 전 «딥시크가 넉넉히 이만큼» — 평가 때 카드까지 굽는 pro 판이 $0.40
채점한번 = 0.001    # 정답지 짝짓기(flash 세 번) 한 판 어림 — 판 기록에 안 남아 따로 센다
자료도구 = ("x_account", "instagram_account", "threads_account", "x_search", "instagram_search", "web_search",
          "read_page")


def 계획4읽기() -> dict:
    return (json.loads(계획4파일.read_text(encoding="utf-8")) if 계획4파일.exists()
            else {"시험": {}, "수리": [], "채점딥시크": 0.0})


def 계획4쓰기(d: dict) -> None:
    계획4파일.parent.mkdir(parents=True, exist_ok=True)
    계획4파일.write_text(json.dumps(d, ensure_ascii=False, indent=1), encoding="utf-8")


def 계획4돈(d: dict) -> dict:
    """시험 판·수리공·채점에 쓴 돈 합. 수리공 돈이 딥시크·Apify 로 안 나뉘었으면 통째로 딥시크로 센다(한도 쪽으로 넉넉히)."""
    합 = {"딥시크": d.get("채점딥시크") or 0.0, "그림": 0.0, "아피파이": 0.0}
    for x in d["시험"].values():
        for k in 합:
            합[k] += (x.get("돈") or {}).get(k) or 0
    for x in d.get("수리") or []:
        합["딥시크"] += x["딥시크"] if "딥시크" in x else (x.get("돈") or 0)
        합["아피파이"] += x.get("아피파이") or 0
    return {k: round(v, 4) for k, v in 합.items()}


def 열어도되나(d: dict) -> str | None:
    """돈 드는 시험을 새로 열기 전 — 한도를 넘을 것 같으면 그 까닭, 아니면 None."""
    돈 = 계획4돈(d)
    if 돈["딥시크"] + 한시험넉넉히 > 딥시크한도4:
        return f"딥시크 ${돈['딥시크']:.2f} + 한 시험 넉넉히 ${한시험넉넉히} 가 한도 ${딥시크한도4:.0f} 를 넘는다"
    if 돈["그림"] >= 그림한도4:
        return f"그림 ${돈['그림']:.2f} 가 멈춤선 ${그림한도4:.0f} 에 닿았다"
    return None


def _사진주소들(x: dict) -> list:
    """번호 셈은 «사진 보기» 와 같다(B) — 사진 후보가 있으면 후보, 없으면 미디어(대표화면·원래 주소 둘 다)."""
    if x.get("사진후보"):
        return [[c.get("주소")] for c in x["사진후보"]]
    return [[m.get("대표화면"), m.get("주소")] for m in x.get("미디어") or []]


def _카드사진판정(d: dict, 것들: dict, 주소판정: dict) -> str:
    """카드 사진의 판정은 그 소식의 출처 글에서 찾는다 — 주소 하나로 모든 글에서 찾으면 대표화면이 다른 X 사진은 «모름»,
    같은 배너가 여러 글에 있으면 남의 판정이 나왔다(진짜 시험 1·3, 과제 42). 출처 글에 없으면(기사 사진 등) 주소로."""
    원 = (d.get("미디어") or {}).get("원주소")
    if (d.get("미디어") or {}).get("자료사진"):  # 그 사람의 자료 사진 — 그 사건 사진이 없어 이름으로 찾았다(42++ E)
        return "자료 사진"
    # 사진 더 찾기(42+ E)가 다른 글에서 빌려 온 사진은 그 글에서
    x = 것들.get((d.get("미디어") or {}).get("빌려온곳") or (d.get("출처") or {}).get("증거")) or {}
    판정 = x.get("사진판정") or {}
    for i, 주소들 in enumerate(_사진주소들(x), 1):
        if 원 in 주소들 and str(i) in 판정:
            return 판정[str(i)]
    return 주소판정.get(원, "모름")


def 살핌(기록: dict, 것들: dict) -> dict:
    """시험 판 한 장 — 목록대로 먼저 돌았나 · 지휘자가 더 찾은 호출 · ①②③ 줄 · 사진 판정 · 카드 사진 · 수리 · 돈 · 시간."""
    from collections import Counter
    from topic import watchlist
    재, r = 기록.get("재료") or {}, 기록.get("result") or {}
    # 정리의 사진 더 찾기(42+ E) 호출은 걸음 번호가 없어도 목록보기·지휘자 호출이 아니다
    호출 = [x for x in 재.get("호출기록") or [] if x.get("도구") in 자료도구 and not x.get("사진찾기")]
    먼저 = [x for x in 호출 if x.get("목록") or x.get("걸음") is None]  # 목록보기 단계 호출(머리 «약속이 바뀐 것»)
    더 = [x for x in 호출 if not (x.get("목록") or x.get("걸음") is None) and not x.get("저장해둔")]
    먼저곳 = {watchlist.대표({"도구": x["도구"], "인자": x.get("인자") or {}}) for x in 먼저}
    목록 = 기록.get("목록") or []
    판정들, 주소판정, 붙음, 안붙음 = Counter(), {}, 0, 0
    for x in 것들.values():
        판정 = x.get("사진판정") or {}
        판정들.update(판정.values())
        if any((x.get("사진글자") or {}).values()):
            if "[사진 속 글자]" in (x.get("글") or ""):
                붙음 += 1
            else:
                안붙음 += 1
        for i, 주소들 in enumerate(_사진주소들(x), 1):
            for 주소 in 주소들:
                if str(i) in 판정 and 주소:
                    주소판정.setdefault(주소, 판정[str(i)])
    카드사진 = [{"사건": d.get("사건"), "판정": _카드사진판정(d, 것들, 주소판정)}
              for d in r.get("bundle") or [] if (d.get("미디어") or {}).get("갈래") == "사진"]
    return {"소식수": len(r.get("bundle") or []), "목록줄": len(목록), "먼저본줄": len(먼저),
            "목록에서빠진줄": [watchlist.화면글(줄) for 줄 in 목록 if watchlist.대표(줄) not in 먼저곳],
            "못본곳": (r.get("목록") or {}).get("못본곳") or 재.get("못본곳") or [],
            "지휘자더찾은호출": len(더), "앞단계줄": sum(1 for 줄 in 기록.get("lines") or [] if 줄.startswith(("①", "②", "③"))),
            "목록후보": [f"{x.get('글')} · {x.get('숫자')}" + (f" · {x['갈래']}" if x.get("갈래") else "")
                       for x in r.get("목록후보") or []],
            "사진판정": dict(판정들), "사진판정수": 재.get("사진판정수"), "사진판정초": 재.get("사진판정초"),
            "사진글자붙음": 붙음, "사진글자안붙음": 안붙음,
            "카드사진": 카드사진,  # «공식그림» 도 카드에 쓴다(42+ H), 자료 사진도(42++ E)
            "카드사진장면아님": [x["사건"] for x in 카드사진 if x["판정"] not in ("장면", "공식그림", "자료 사진")],
            "수리": r.get("수리"), "카드": r.get("카드"), "카드다시": 기록.get("카드다시"), "분": _분(기록)}


def 비교글(주제: str, s: dict, 평가판들: dict) -> str:
    """시험 판 점수를 평가 때(같은 정답지) 숫자와 한 줄로 — 정답지가 내 기준이라는 것도 같이 말한다."""
    def 몇(판):
        x = (평가판들.get(판) or {}).get("점수")
        return f"{len(x['찾은'])}/{x['꼭수']}" if x and x.get("꼭수") else None
    평가 = [f"{이름} {몇(판)}" for 이름, 판 in (("pro", f"기본-{주제}"), ("pro 다시1", f"다시1-{주제}"),
                                              ("pro 다시2", f"다시2-{주제}"), ("flash", f"flash-{주제}")) if 몇(판)]
    return (f"{주제} 9월 3주차 — 이번 {len(s['찾은'])}/{s['꼭수']} · 평가 때 {' · '.join(평가) or '없음'}"
            " (정답지는 내가 고른 «꼭» 사건 — 내 기준 점수)")


def 계획4시험전(번호: str, job: str, 읽기) -> None:
    """있던 판을 다시 쓰는 시험(7 카드 다시 굽기) — 지금까지 쓴 돈을 적어 두고 나중에 뺀다."""
    d = 계획4읽기()
    c = (읽기(job) or {}).get("cost") or {}
    d["시험"][번호] = {"job": job, "전돈": {k: round(c.get(k) or 0, 4) for k in ("딥시크", "그림", "아피파이")}}
    계획4쓰기(d)


def 계획4시험(번호: str, 이름: str, 주제: str, job: str, 읽기, 것들읽기, 대화읽기=lambda c: None) -> dict:
    """시험 판 하나를 장부에 — 살핌과 돈. 주제 다듬기 대화의 딥시크 돈은 판 기록에 없어서 더한다."""
    d = 계획4읽기()
    기록 = 읽기(job) or {}
    x = d["시험"].setdefault(번호, {})
    c, 전 = 기록.get("cost") or {}, x.get("전돈") or {}
    돈 = {k: round((c.get(k) or 0) - (전.get(k) or 0), 4) for k in ("딥시크", "그림", "아피파이")}
    대화 = 대화읽기(기록["chat"]) if 기록.get("chat") else None
    돈["딥시크"] = round(돈["딥시크"] + (((대화 or {}).get("cost") or {}).get("딥시크") or 0), 4)
    o = 기록.get("order") or {}
    x.update(이름=이름, 주제=None if 주제 == "-" else 주제, job=job, 상태=기록.get("state"),
             기간=f"{o.get('시작')}~{o.get('끝')}", 살핌=살핌(기록, 것들읽기(job)), 돈=돈)
    계획4쓰기(d)
    return x


def 계획4채점(번호: str, 읽기, 짝짓기, 발췌있나) -> str:
    """시험 2·4 — 평가 때와 같은 정답지로 채점하고 평가 때 숫자와 나란히."""
    d = 계획4읽기()
    x = d["시험"][번호]
    정답지 = json.loads(정답지파일.read_text(encoding="utf-8"))
    s = 점수(읽기(x["job"]) or {}, 정답지["주제들"][x["주제"]], 짝짓기, 발췌있나)
    x["점수"], x["비교"] = s, 비교글(x["주제"], s, 결과읽기()["판들"])
    d["채점딥시크"] = round((d.get("채점딥시크") or 0) + 채점한번, 4)
    계획4쓰기(d)
    return x["비교"]


def 수리상태키(장부키: str, 도구: str) -> str:
    """수리공 상태 파일 자리 — 시험용 장부는 운영과 떨어진 자리(머리 «약속이 바뀐 것»). C 의 repair 와 다르면 여기를 맞춘다."""
    return f"weekly/memory/{'repairs-test' if 장부키.endswith('registry-test.json') else 'repairs'}/{도구}.json"


def 계획4수리(번호: str, 도구: str, 상태: dict, 장부칸: dict) -> dict:
    """수리공 시험 한 번을 장부에 — 상태 파일과 시험용 장부의 그 도구 칸(고친기록)에서."""
    d = 계획4읽기()
    마지막 = (장부칸.get("고친기록") or [{}])[-1]
    x = {"시험": 번호, "도구": 도구, "상태": 상태.get("상태"), "까닭": 상태.get("까닭") or 마지막.get("까닭"),
         "사람할일": 상태.get("사람할일"), "돈": 상태.get("돈") or 마지막.get("돈") or 0}
    x.update({k: 상태[k] for k in ("딥시크", "아피파이") if k in 상태})
    d.setdefault("수리", []).append(x)
    계획4쓰기(d)
    return x


def 계획4화면(d: dict) -> str:
    돈 = 계획4돈(d)
    머리 = ["시험", "무엇", "기간", "소식", "꼭 찾음(내 기준)", "목록 먼저 본 줄", "못 본 곳", "지휘자가 더 찾은 호출",
          "①②③ 줄", "사진 판정", "카드 사진 «장면·공식 그림» 아님", "딥시크", "시간", "카드뉴스"]
    줄들 = []
    for 번, x in sorted(d["시험"].items()):
        s, 살 = x.get("점수"), x.get("살핌") or {}
        카 = 살.get("카드") or {}
        줄들.append([
            escape(번), escape(x.get("이름") or ""), escape(x.get("기간") or ""), 살.get("소식수", "—"),
            f"{len(s['찾은'])}/{s['꼭수']}" if s and s.get("꼭수") else "—",
            f"{살.get('먼저본줄', 0)}/{살.get('목록줄', 0)}", len(살.get("못본곳") or []), 살.get("지휘자더찾은호출", "—"),
            살.get("앞단계줄", "—"),
            escape(" · ".join(f"{board.갈래글(k)} {v}" for k, v in (살.get("사진판정") or {}).items()) or "—"),
            _표시(len(살.get("카드사진장면아님") or []), not 살.get("카드사진장면아님")),
            f"${(x.get('돈') or {}).get('딥시크', 0):.3f}", f"{살['분']}분" if 살.get("분") is not None else "—",
            f'<a href="{escape(카["보기"])}" target="_blank">{escape(str(카.get("장수")))}장</a>' if 카.get("보기") else "—"])
    수리 = [[escape(str(x["시험"])), escape(x["도구"]), escape(str(x.get("상태"))), escape(str(x.get("까닭") or "")),
           f"${x.get('돈') or 0:.3f}"] for x in d.get("수리") or []]
    비교 = "".join(f"<li>{escape(x['비교'])}</li>" for x in d["시험"].values() if x.get("비교"))
    카드들 = "".join(
        f'<figure><figcaption>{escape(번)} {escape(x.get("이름") or "")}</figcaption>'
        f'<iframe src="{escape(x["살핌"]["카드"]["보기"])}" loading="lazy"></iframe></figure>'
        for 번, x in sorted(d["시험"].items()) if ((x.get("살핌") or {}).get("카드") or {}).get("보기"))
    return ("<!doctype html><html lang=\"ko\"><head><meta charset=\"utf-8\">"
            "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>계획 4 진짜 시험</title><style>"
            + _모양 + "</style></head><body><h1>주제 소식 계획 4 — 진짜 시험</h1>"
            f"<p>쓴 돈 — 딥시크 <b>${돈['딥시크']:.2f}</b>(한도 ${딥시크한도4:.0f}) · 그림 <b>${돈['그림']:.2f}</b>"
            f"(멈춤 ${그림한도4:.0f}) · Apify <b>${돈['아피파이']:.2f}</b>(한도 없음)</p>"
            f"<h2>시험 판</h2>{_표(머리, 줄들)}"
            f"<h2>정답지 점수 — 평가 때와 비교</h2><ul>{비교 or '<li>아직 없음</li>'}</ul>"
            "<p class=\"흐림\">«꼭 찾음» 은 계획 3 밤에 내가 웹 검색으로 고른 «꼭» 사건 기준 — 내 기준 점수입니다.</p>"
            f"<h2>수리공</h2>{_표(['시험', '도구', '상태', '까닭', '돈'], 수리)}"
            f"<h2>카드뉴스 — 잘 나왔는지는 사용자가 봅니다</h2><div class=\"카드들\">{카드들}</div></body></html>")


def 계획4띄우기() -> Path:
    확인폴더.mkdir(parents=True, exist_ok=True)
    p = 확인폴더 / f"계획4_시험_{datetime.now().strftime('%m%d_%H%M')}.html"
    p.write_text(계획4화면(계획4읽기()), encoding="utf-8")
    import subprocess
    subprocess.run(["powershell", "-NoProfile", "-Command", f"Start-Process '{p}'"], check=False)
    return p


def 계획4명령(인자: list) -> None:
    """python weekly/tests/eval_topic.py 계획4 …
        시험전 <번호> <job>                    있던 판을 다시 쓸 때(시험 7) — 지금 돈을 적어 둔다
        시험 <번호> <이름> <주제|-> <job>       시험 판 하나를 장부에(살핌·돈)
        채점 <번호>                           정답지로 채점, 평가 때와 비교(flash 세 번)
        수리 <번호> <도구> <장부키>              수리공 시험 한 번을 장부에
        돈                                   쓴 돈 합과 한도 — 새 시험을 열어도 되나
        화면                                 결과 화면을 만들어 띄운다"""
    from topic import evidence
    창 = _창고()
    명 = 인자[0] if 인자 else ""
    if 명 == "시험전":
        계획4시험전(인자[1], 인자[2], 창.읽기)
    elif 명 == "시험":
        x = 계획4시험(인자[1], 인자[2], 인자[3], 인자[4], 창.읽기,
                     lambda job: evidence.증거창고(창.s3, BUCKET, job).것들, 창.대화읽기)
        print(json.dumps({k: x.get(k) for k in ("이름", "상태", "기간", "돈", "살핌")}, ensure_ascii=False, indent=1))
    elif 명 == "채점":
        증거 = evidence.증거창고(창.s3, BUCKET, 계획4읽기()["시험"][인자[1]]["job"])
        print(계획4채점(인자[1], 창.읽기, 세번짝짓기, 증거.발췌있나))
    elif 명 == "수리":
        번호, 도구, 장부키 = 인자[1], 인자[2], 인자[3]
        x = 계획4수리(번호, 도구, 창._읽기키(수리상태키(장부키, 도구)) or {},
                     (창._읽기키("weekly/" + 장부키) or {}).get(도구) or {})
        print(json.dumps(x, ensure_ascii=False))
    elif 명 == "돈":
        d = 계획4읽기()
        print(json.dumps(계획4돈(d), ensure_ascii=False), "·", 열어도되나(d) or "새 시험을 열어도 됨")
    elif 명 == "화면":
        print(계획4띄우기())
    else:
        raise SystemExit(계획4명령.__doc__)


if __name__ == "__main__":
    명령 = sys.argv[1] if len(sys.argv) > 1 else ""
    if 명령 == "한판":
        한판(sys.argv[2])
    elif 명령 == "돌리기":
        돌리기()
    elif 명령 == "점수":
        print(점수화면())
    elif 명령 == "다시":  # python eval_topic.py 다시 "까닭" 판1 판2 ...
        다시(sys.argv[3:], sys.argv[2])
    elif 명령 == "계획4":  # python eval_topic.py 계획4 시험전|시험|채점|수리|돈|화면 …
        계획4명령(sys.argv[2:])
    else:
        raise SystemExit(__doc__)
