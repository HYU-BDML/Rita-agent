# -*- coding: utf-8 -*-
"""라벨링 기반 `dify/카드뉴스_생성기.yml`(Task 10)을 로컬 Dify 에 올린다.

**다른 올리기 스크립트를 건드리지 않는다** — `올리기.py`는 `주차소식_생성기_v3`
전용(`DIFY_LOCAL_APP_ID`), `카드뉴스_올리기.py`는 `교수님_카드뉴스/카드뉴스.yml`
전용(`DIFY_CARDNEWS_APP_ID`)이다. 이 판은 별도 앱 id 키(`DIFY_LABEL_CARDNEWS_APP_ID`)
로 `.dify_local_creds` 에 따로 저장해서, 앱 id 를 재사용해 남의 앱을 덮어쓰지 않는다.

    python dify/ci_cardnews.py       # 관문 먼저 — 막히면 여기서 멈춘다
    python dify/카드뉴스_생성기_올리기.py

이 스크립트는 **가져오기·발행까지만 한다.** 실행(돌리기)은 OpenAI 유료 호출이라
넣지 않았다 — 필요하면 `--run "<주제>"` 로 켠다.
"""
import argparse
import base64
import http.client
import io
import json
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent   # cardnews/
뿌리 = ROOT.parent                                # 저장소 뿌리
DIFY = ROOT / "dify"
CRED_FILE = 뿌리 / ".dify_local_creds"
YML = DIFY / "카드뉴스_생성기.yml"
APP_ID_KEY = "DIFY_LABEL_CARDNEWS_APP_ID"
HOST, PORT = "localhost", 80


def _읽기() -> dict:
    if not CRED_FILE.exists():
        raise SystemExit(f"{CRED_FILE} 가 없다 — 로컬 Dify 자동화 계정을 먼저 만들어라")
    난것 = {}
    for 줄 in io.open(CRED_FILE, encoding="utf-8"):
        줄 = 줄.strip()
        if 줄 and "=" in 줄:
            k, _, v = 줄.partition("=")
            난것[k] = v
    return 난것


def _저장(자료: dict) -> None:
    io.open(CRED_FILE, "w", encoding="utf-8", newline="\n").write(
        "\n".join(f"{k}={v}" for k, v in 자료.items()) + "\n")


def _부르기(method: str, path: str, 자료: dict, json_body: dict | None = None,
          timeout: int = 60) -> tuple[int, bytes]:
    쿠키 = f"access_token={자료['DIFY_COOKIE_ACCESS_TOKEN']}; csrf_token={자료['DIFY_COOKIE_CSRF_TOKEN']}"
    머리 = {"Cookie": 쿠키, "X-CSRF-Token": 자료["DIFY_COOKIE_CSRF_TOKEN"]}
    body = None
    if json_body is not None:
        body = json.dumps(json_body).encode("utf-8")
        머리["Content-Type"] = "application/json"
    conn = http.client.HTTPConnection(HOST, PORT, timeout=timeout)
    conn.request(method, path, body=body, headers=머리)
    r = conn.getresponse()
    return r.status, r.read()


def 로그인(자료: dict) -> dict:
    if 자료.get("DIFY_COOKIE_ACCESS_TOKEN"):
        st, _ = _부르기("GET", "/console/api/apps?page=1&limit=1", 자료)
        if st == 200:
            return 자료

    enc_pw = base64.b64encode(자료["DIFY_LOCAL_PASSWORD"].encode()).decode()
    body = json.dumps({"email": 자료["DIFY_LOCAL_EMAIL"], "password": enc_pw,
                       "language": "en-US", "remember_me": True}).encode()
    conn = http.client.HTTPConnection(HOST, PORT, timeout=20)
    conn.request("POST", "/console/api/login", body=body, headers={"Content-Type": "application/json"})
    r = conn.getresponse()
    if r.status != 200:
        raise SystemExit(f"로그인 실패 {r.status}: {r.read()[:200]}")
    r.read()
    for c in r.msg.get_all("Set-Cookie") or []:
        이름, _, 나머지 = c.partition("=")
        값 = 나머지.split(";", 1)[0]
        자료[f"DIFY_COOKIE_{이름.upper()}"] = 값
    _저장(자료)
    print("로그인 됨")
    return 자료


def 가져오기(자료: dict) -> tuple[str, list]:
    yml = io.open(YML, encoding="utf-8").read()
    app_id = 자료.get(APP_ID_KEY)
    body = {"mode": "yaml-content", "yaml_content": yml}
    if app_id:
        body["app_id"] = app_id     # 있으면 «그 앱에 덮어쓰기» — 새 앱을 안 만든다
    st, raw = _부르기("POST", "/console/api/apps/imports", 자료, json_body=body, timeout=60)
    d = json.loads(raw)
    if d.get("status") not in ("completed", "completed-with-warnings"):
        raise SystemExit(f"가져오기 실패: {json.dumps(d, ensure_ascii=False)[:800]}")
    새_id = d["app_id"]
    if 새_id != app_id:
        자료[APP_ID_KEY] = 새_id
        _저장(자료)
    return 새_id, d.get("warnings") or []


def 발행(자료: dict, app_id: str) -> None:
    st, raw = _부르기("POST", f"/console/api/apps/{app_id}/workflows/publish", 자료,
                     json_body={"marked_name": "자동발행", "marked_comment": "카드뉴스_생성기_올리기.py"})
    if st != 200:
        raise SystemExit(f"발행 실패 {st}: {raw[:300]}")


def 돌리기(자료: dict, app_id: str, 주제: str) -> dict:
    """draft/run 은 SSE 다. 줄마다 `data: {...}` 를 읽어 노드 이벤트를 모은다."""
    쿠키 = f"access_token={자료['DIFY_COOKIE_ACCESS_TOKEN']}; csrf_token={자료['DIFY_COOKIE_CSRF_TOKEN']}"
    머리 = {"Cookie": 쿠키, "X-CSRF-Token": 자료["DIFY_COOKIE_CSRF_TOKEN"],
           "Content-Type": "application/json", "Accept": "text/event-stream"}
    body = json.dumps({"inputs": {"topic": 주제}}).encode("utf-8")
    conn = http.client.HTTPConnection(HOST, PORT, timeout=900)
    conn.request("POST", f"/console/api/apps/{app_id}/workflows/draft/run", body=body, headers=머리)
    r = conn.getresponse()
    if r.status != 200:
        raise SystemExit(f"실행 시작 실패 {r.status}: {r.read()[:300]}")

    이름표 = {}
    실패한것 = []
    최종 = None
    버퍼 = b""
    시작 = time.monotonic()
    while True:
        조각 = r.read(4096)
        if not 조각:
            break
        버퍼 += 조각
        while b"\n\n" in 버퍼:
            한덩이, 버퍼 = 버퍼.split(b"\n\n", 1)
            for 줄 in 한덩이.split(b"\n"):
                if not 줄.startswith(b"data:"):
                    continue
                try:
                    ev = json.loads(줄[5:].strip())
                except Exception:
                    continue
                종류 = ev.get("event")
                data = ev.get("data") or {}
                if 종류 == "node_started":
                    이름표[data.get("node_id")] = data.get("title")
                elif 종류 == "node_finished":
                    제목 = 이름표.get(data.get("node_id"), data.get("title", "?"))
                    print(f"  [{data.get('status','?'):>7}] {제목} ({data.get('elapsed_time',0):.1f}s)")
                    if data.get("status") == "failed":
                        실패한것.append({"노드": 제목, "오류": data.get("error", "")})
                    산출 = data.get("outputs") or {}
                    for 칸, 값 in 산출.items():
                        조각 = json.dumps(값, ensure_ascii=False) if not isinstance(값, str) else 값
                        print(f"       ↳ {칸}[{len(조각)}자]: {조각[:120]!r}")
                elif 종류 == "workflow_finished":
                    최종 = data
        if time.monotonic() - 시작 > 890:
            print("  (900초 벽에 가까워 그만 읽는다)")
            break
    return {"실패": 실패한것, "최종": 최종}


def ci확인() -> None:
    print("== ① ci_cardnews.py 먼저 ==")
    r = subprocess.run([sys.executable, "dify/ci_cardnews.py"], cwd=str(ROOT))
    if r.returncode != 0:
        raise SystemExit("ci_cardnews.py 가 막았다 — 올리지 않는다")


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", metavar="주제", default=None,
                     help="가져오기·발행 뒤 이 주제로 실제 실행까지 한다(OpenAI 유료 호출)")
    args = ap.parse_args()

    ci확인()

    print("\n== ② 로그인 ==")
    자료 = 로그인(_읽기())

    print("\n== ③ 가져오기 (카드뉴스_생성기.yml) ==")
    app_id, 경고 = 가져오기(자료)
    print(f"  app_id = {app_id}")
    if 경고:
        print(f"  경고: {경고}")

    print("\n== ④ 발행 ==")
    발행(자료, app_id)
    print("  발행됨")

    if not args.run:
        print("\n완료 — 가져오기·발행까지만 했다(--run 안 줌, 유료 호출 없음).")
        return

    print(f"\n== ⑤ 실행 (주제: {args.run}) ==")
    난것 = 돌리기(자료, app_id, args.run)
    print()
    if 난것["실패"]:
        print("❌ 실패한 노드:")
        for x in 난것["실패"]:
            print(f"  · {x['노드']}: {x['오류']}")
        sys.exit(1)
    else:
        print("✅ 끝까지 돌았다")
        print(json.dumps(난것["최종"], ensure_ascii=False, indent=1)[:800])


if __name__ == "__main__":
    main()
