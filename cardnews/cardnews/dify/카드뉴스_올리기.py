# -*- coding: utf-8 -*-
"""교수님 «카드뉴스.yml» 을 로컬 Dify 에 새 앱으로 올린다.

`올리기.py` 는 건드리지 않는다 — 그건 `주차소식_생성기_v3` 전용이고 그 앱 id
(`DIFY_LOCAL_APP_ID`) 를 재사용하면 v3 를 덮어쓴다. 카드뉴스는 별도 앱 id 키
(`DIFY_CARDNEWS_APP_ID`) 로 `.dify_local_creds` 에 따로 저장한다.

    python dify/카드뉴스_올리기.py

1단계: 로그인 → 가져오기(새 앱, 없으면 새로 만듦) 까지만 한다.
발행·실행은 모델 공급자를 Bedrock 으로 맞춘 뒤 다음 단계에서 한다.
"""
import base64
import http.client
import io
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent   # cardnews/
뿌리 = ROOT.parent                                # 저장소 뿌리
YML = 뿌리 / "교수님_카드뉴스" / "카드뉴스.yml"
CRED_FILE = 뿌리 / ".dify_local_creds"
APP_ID_KEY = "DIFY_CARDNEWS_APP_ID"
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
        body["app_id"] = app_id
    st, raw = _부르기("POST", "/console/api/apps/imports", 자료, json_body=body, timeout=60)
    d = json.loads(raw)
    if d.get("status") not in ("completed", "completed-with-warnings"):
        raise SystemExit(f"가져오기 실패: {json.dumps(d, ensure_ascii=False)[:500]}")
    새_id = d["app_id"]
    if 새_id != app_id:
        자료[APP_ID_KEY] = 새_id
        _저장(자료)
    return 새_id, d.get("warnings") or []


def 발행(자료: dict, app_id: str) -> None:
    st, raw = _부르기("POST", f"/console/api/apps/{app_id}/workflows/publish", 자료,
                     json_body={"marked_name": "자동발행", "marked_comment": "카드뉴스_올리기.py"})
    if st != 200:
        raise SystemExit(f"발행 실패 {st}: {raw[:300]}")


def main():
    print("== ① 로그인 ==")
    자료 = 로그인(_읽기())

    print("\n== ② 가져오기 (카드뉴스.yml) ==")
    app_id, 경고 = 가져오기(자료)
    print(f"  app_id = {app_id}")
    if 경고:
        print(f"  경고: {경고}")

    print("\n== ③ 발행 ==")
    발행(자료, app_id)
    print("  발행됨")

    print(f"\n완료. 기존 v3 앱({자료.get('DIFY_LOCAL_APP_ID')})은 손대지 않았다.")


if __name__ == "__main__":
    main()
