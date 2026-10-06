# -*- coding: utf-8 -*-
"""옛 서버(람다 cardnews-render)에 고친 파일 셋(Dockerfile 참고)만 얹어 올린다.

    python weekly/oldserver_patch/deploy.py            올리기
    python weekly/oldserver_patch/deploy.py 되돌리기   Dockerfile 의 FROM 이미지로 되돌린다

올리기는 셋을 한다.
  1. 지금 이미지 + 고친 파일로 새 이미지를 만들어 새 이름표로 올린다(latest 는 안 건드린다)
  2. 람다가 새 이미지를 쓰게 한다
  3. 람다의 OPENAI_API_KEY 를 윈도 사용자 환경변수의 새 열쇠로 바꾼다 — 다른 환경변수는 그대로

열쇠·ECR 비밀번호는 표준입력·boto3 로만 넘긴다. 명령줄에도 화면에도 안 찍는다.
"""
import base64
import subprocess
import sys
import winreg
from pathlib import Path

import boto3

REGION = "ap-northeast-2"
NAME = "cardnews-render"
REGISTRY = "<AWS 계정 번호>.dkr.ecr.ap-northeast-2.amazonaws.com"
REPO = f"{REGISTRY}/{NAME}"
TAG = "patch-20261005a"  # 올릴 때마다 새 이름표 — 04a: 새 분야 표지 실제 사진 얼굴 · 04b: 얼굴 사진이 오면 낱말과 상관없이 넣음(계획 3) · 04c: 얼굴 사진 진짜 꼴·얼굴 없음이면 얼굴 표 안 봄(계획 4 D-8·D-9) · 05a: 새 분야 표지에 진짜 사진이 오면 그리지 않고 깐다(계획 4 과제 42++ D)
여기 = Path(__file__).resolve().parent


def _옛이미지() -> str:
    for 줄 in (여기 / "Dockerfile").read_text(encoding="utf-8").splitlines():
        if 줄.startswith("FROM "):
            return 줄.split()[1]
    raise SystemExit("Dockerfile 에 FROM 이 없다")


def _새열쇠() -> str:
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as k:
        값 = winreg.QueryValueEx(k, "OPENAI_API_KEY")[0].strip()
    if not 값:
        raise SystemExit("사용자 환경변수 OPENAI_API_KEY 가 비어 있다 — 멈춘다")
    return 값


def _돌리기(*명령, 입력: bytes | None = None) -> None:
    subprocess.run(명령, input=입력, check=True)


def _이미지올리기() -> None:
    토큰 = boto3.client("ecr", region_name=REGION).get_authorization_token()["authorizationData"][0]
    비번 = base64.b64decode(토큰["authorizationToken"]).decode().split(":", 1)[1]
    _돌리기("docker", "login", "--username", "AWS", "--password-stdin", REGISTRY, 입력=비번.encode())
    _돌리기("docker", "build", "--platform", "linux/amd64", "--provenance=false", "--sbom=false",
           "-t", f"{REPO}:{TAG}", str(여기))
    _돌리기("docker", "push", f"{REPO}:{TAG}")


def _람다가쓰게(lam, 이미지: str) -> None:
    lam.update_function_code(FunctionName=NAME, ImageUri=이미지)
    lam.get_waiter("function_updated_v2").wait(FunctionName=NAME)


def _열쇠바꾸기(lam) -> None:
    변수 = dict(lam.get_function_configuration(FunctionName=NAME)["Environment"]["Variables"])
    변수["OPENAI_API_KEY"] = _새열쇠()
    lam.update_function_configuration(FunctionName=NAME, Environment={"Variables": 변수})
    lam.get_waiter("function_updated_v2").wait(FunctionName=NAME)


if __name__ == "__main__":
    lam = boto3.client("lambda", region_name=REGION)
    if sys.argv[1:] == ["되돌리기"]:
        _람다가쓰게(lam, _옛이미지())
        print("되돌림:", _옛이미지().split("@")[1][:19], "…")
    else:
        _이미지올리기()
        _람다가쓰게(lam, f"{REPO}:{TAG}")
        _열쇠바꾸기(lam)
        새것 = lam.get_function(FunctionName=NAME)["Code"]["ResolvedImageUri"]
        print("올림:", 새것.split("@")[1][:19], "… (되돌리기: python weekly/oldserver_patch/deploy.py 되돌리기)")
