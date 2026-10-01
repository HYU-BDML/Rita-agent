# -*- coding: utf-8 -*-
"""지휘 서버(람다 weekly-ai)와 그 앞문(HTTP API)을 만들거나 고친다. 여러 번 돌려도 된다.

    python weekly/deploy.py

열쇠는 **윈도 사용자 환경변수**(DEEPSEEK_API_KEY · OPENAI_API_KEY)에서 읽어 boto3 로 바로 넘긴다
— 명령줄에도 화면에도 안 찍는다. 끝나면 앞문 주소 한 줄을 찍는다.
"""
import io
import json
import subprocess
import sys
import tempfile
import time
import winreg
import zipfile
from pathlib import Path

import boto3

REGION, ACCOUNT = "ap-northeast-2", "<AWS 계정 번호>"
NAME, ROLE = "weekly-ai", "weekly-ai-role"
BUCKET = "<S3 통 이름>"
서버 = Path(__file__).resolve().parent / "server"
길들 = ["POST /make", "GET /jobs", "GET /jobs/{job}", "POST /jobs/{job}/retry", "GET /weeks",
       "POST /topic/chat", "GET /topic/chat/{chat}", "POST /topic/make", "GET /wallet",
       "GET /topic/fields", "POST /topic/fields"]
열쇠파일 = Path(r"C:\Users\david\project\trend\apify api.txt")


def _열쇠(이름: str) -> str:
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as k:
        try:
            값 = winreg.QueryValueEx(k, 이름)[0].strip()
        except FileNotFoundError:
            값 = ""
    if not 값:
        raise SystemExit(f"사용자 환경변수 {이름} 가 비어 있다 — 배포를 멈춘다")
    return 값


꾸러미목록 = 서버 / "requirements.txt"


def _꾸러미(곳: Path) -> None:
    """람다(리눅스 x86_64 · 파이썬 3.12)용 꾸러미를 받아 곳에 푼다. 열쇠는 안 쓴다."""
    subprocess.run([sys.executable, "-m", "pip", "install", "--quiet", "--target", str(곳),
                    "--platform", "manylinux2014_x86_64", "--implementation", "cp", "--python-version", "3.12",
                    "--only-binary=:all:", "-r", str(꾸러미목록)], check=True)


def _아피파이열쇠() -> dict:
    """로컬 열쇠 파일의 Apify 열쇠들 + 옛 서버와 같이 쓰는 열쇠의 순번. 값은 찍지 않는다."""
    import re
    열쇠들 = re.findall(r"apify_api_[A-Za-z0-9]+", 열쇠파일.read_text(encoding="utf-8"))
    if not 열쇠들:
        raise SystemExit(f"{열쇠파일} 에 Apify 열쇠가 없다 — 배포를 멈춘다")
    옛 = re.findall(r"apify_api_[A-Za-z0-9]+", boto3.client("lambda", region_name=REGION).get_function_configuration(
        FunctionName="cardnews-render")["Environment"]["Variables"].get("APIFY_TOKEN", ""))
    같이 = next((i for i, k in enumerate(열쇠들) if k in 옛), -1)
    print(f"Apify 열쇠 {len(열쇠들)}개 (옛 서버와 같이 쓰는 것: {같이 + 1 if 같이 >= 0 else '없음'}번째)")
    return {"APIFY_TOKENS": "\n".join(열쇠들), "APIFY_SHARED": str(같이)}


def _압축() -> bytes:
    버퍼 = io.BytesIO()
    with tempfile.TemporaryDirectory() as 임시, zipfile.ZipFile(버퍼, "w", zipfile.ZIP_DEFLATED) as z:
        _꾸러미(Path(임시))
        for p in sorted(Path(임시).rglob("*")):
            if p.is_file() and "__pycache__" not in p.parts:
                z.write(p, p.relative_to(임시).as_posix())
        for p in sorted(서버.rglob("*")):
            if (p.is_file() and "__pycache__" not in p.parts and p.name != "extract.py"
                    and p.suffix in (".py", ".json")):
                z.write(p, p.relative_to(서버).as_posix())
        이름들 = z.namelist()
    if not any(n.startswith("trafilatura/") for n in 이름들) or \
            not any(n.startswith("lxml/etree") and n.endswith(".so") for n in 이름들):
        raise SystemExit("리눅스용 trafilatura·lxml 이 압축에 없다 — 배포를 멈춘다")
    크기 = len(버퍼.getvalue())
    print(f"압축 {크기 / 1048576:.1f}MB (람다 한도 50MB)")
    if 크기 > 45 * 1048576:
        raise SystemExit("압축이 45MB 를 넘는다 — 배포를 멈춘다")
    return 버퍼.getvalue()


def _기록칸막기정책(정책: dict | None) -> dict:
    """창고 통 정책에 «weekly/trace/·weekly/chats/ 는 우리 계정 밖이면 거절» 한 줄을 더한 정책.
    통은 옛 서버와 같이 쓰고 «누구나 읽기»(PublicRead)가 걸려 있다 — 다른 줄은 그대로 둔다.
    사용자가 친 말·지휘자 생각이 든 칸이라 주소를 알아도 바깥에선 못 읽게(사용자 2026-10-01 «가»)."""
    정책 = {"Version": "2012-10-17", "Statement": []} if 정책 is None else 정책
    줄 = {"Sid": "WeeklyPrivate", "Effect": "Deny", "Principal": "*", "Action": "s3:GetObject",
         "Resource": [f"arn:aws:s3:::{BUCKET}/weekly/trace/*", f"arn:aws:s3:::{BUCKET}/weekly/chats/*"],
         "Condition": {"StringNotEquals": {"aws:PrincipalAccount": ACCOUNT}}}
    return {**정책, "Statement": [x for x in 정책["Statement"] if x.get("Sid") != "WeeklyPrivate"] + [줄]}


def _기록칸막기(s3) -> None:
    try:
        지금 = json.loads(s3.get_bucket_policy(Bucket=BUCKET)["Policy"])
    except s3.exceptions.ClientError as e:
        if e.response.get("Error", {}).get("Code") != "NoSuchBucketPolicy":
            raise
        지금 = None
    새 = _기록칸막기정책(지금)
    if 새 != 지금:
        s3.put_bucket_policy(Bucket=BUCKET, Policy=json.dumps(새))
        print("창고 정책: 기록·대화 칸 바깥 읽기 막음")


def _역할(iam) -> str:
    믿음 = {"Version": "2012-10-17", "Statement": [{"Effect": "Allow", "Principal": {"Service": "lambda.amazonaws.com"},
                                                 "Action": "sts:AssumeRole"}]}
    try:
        arn, 새것 = iam.get_role(RoleName=ROLE)["Role"]["Arn"], False
    except iam.exceptions.NoSuchEntityException:
        arn, 새것 = iam.create_role(RoleName=ROLE, AssumeRolePolicyDocument=json.dumps(믿음))["Role"]["Arn"], True
    iam.attach_role_policy(RoleName=ROLE, PolicyArn="arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole")
    iam.put_role_policy(RoleName=ROLE, PolicyName="weekly-ai", PolicyDocument=json.dumps({
        "Version": "2012-10-17", "Statement": [
            {"Effect": "Allow", "Action": ["s3:GetObject", "s3:PutObject"], "Resource": f"arn:aws:s3:::{BUCKET}/weekly/*"},
            {"Effect": "Allow", "Action": "s3:ListBucket", "Resource": f"arn:aws:s3:::{BUCKET}",
             "Condition": {"StringLike": {"s3:prefix": ["weekly/*"]}}},
            {"Effect": "Allow", "Action": "lambda:InvokeFunction",
             "Resource": f"arn:aws:lambda:{REGION}:{ACCOUNT}:function:{NAME}"},
        ]}))
    if 새것:
        print("새 역할 — 퍼지기를 15초 기다린다")
        time.sleep(15)
    return arn


def _함수(lam, 역할: str, 코드: bytes) -> str:
    설정 = dict(Runtime="python3.12", Handler="app.handler", Role=역할, Timeout=900, MemorySize=1024,
              Environment={"Variables": {"DEEPSEEK_API_KEY": _열쇠("DEEPSEEK_API_KEY"),
                                         "OPENAI_API_KEY": _열쇠("OPENAI_API_KEY"), "BUCKET": BUCKET,
                                         **_아피파이열쇠()}})
    try:
        lam.get_function(FunctionName=NAME)
        lam.update_function_code(FunctionName=NAME, ZipFile=코드)
        lam.get_waiter("function_updated_v2").wait(FunctionName=NAME)
        lam.update_function_configuration(FunctionName=NAME, **설정)
    except lam.exceptions.ResourceNotFoundException:
        for 몇번째 in range(5):
            try:
                lam.create_function(FunctionName=NAME, Code={"ZipFile": 코드}, **설정)
                break
            except lam.exceptions.InvalidParameterValueException as e:
                if "assume" not in str(e) or 몇번째 == 4:
                    raise
                time.sleep(10)
        lam.get_waiter("function_active_v2").wait(FunctionName=NAME)
    lam.get_waiter("function_updated_v2").wait(FunctionName=NAME)
    # 돈 드는 단계가 두 번 돌면 안 된다 — 람다의 «실패하면 저절로 다시» 를 끈다(설계)
    lam.put_function_event_invoke_config(FunctionName=NAME, MaximumRetryAttempts=0)
    return lam.get_function(FunctionName=NAME)["Configuration"]["FunctionArn"]


def _앞문(gw, lam, 함수arn: str) -> str:
    있는것 = [a for a in gw.get_apis(MaxResults="100")["Items"] if a["Name"] == NAME]
    api_id = (있는것[0] if 있는것 else gw.create_api(Name=NAME, ProtocolType="HTTP"))["ApiId"]
    통합들 = [i for i in gw.get_integrations(ApiId=api_id)["Items"] if i.get("IntegrationUri") == 함수arn]
    통합 = 통합들[0]["IntegrationId"] if 통합들 else gw.create_integration(
        ApiId=api_id, IntegrationType="AWS_PROXY", IntegrationUri=함수arn, PayloadFormatVersion="2.0")["IntegrationId"]
    있는길 = {r["RouteKey"] for r in gw.get_routes(ApiId=api_id)["Items"]}
    for 길 in 길들:
        if 길 not in 있는길:
            gw.create_route(ApiId=api_id, RouteKey=길, Target=f"integrations/{통합}")
    if not any(s["StageName"] == "$default" for s in gw.get_stages(ApiId=api_id)["Items"]):
        gw.create_stage(ApiId=api_id, StageName="$default", AutoDeploy=True)
    try:
        lam.add_permission(FunctionName=NAME, StatementId="weekly-ai-api", Action="lambda:InvokeFunction",
                           Principal="apigateway.amazonaws.com",
                           SourceArn=f"arn:aws:execute-api:{REGION}:{ACCOUNT}:{api_id}/*/*")
    except lam.exceptions.ResourceConflictException:
        pass
    return f"https://{api_id}.execute-api.{REGION}.amazonaws.com"


if __name__ == "__main__":
    if sys.argv[1:] == ["열쇠만"]:
        lam = boto3.client("lambda", region_name=REGION)
        지금 = lam.get_function_configuration(FunctionName=NAME)["Environment"]["Variables"]
        lam.update_function_configuration(FunctionName=NAME, Environment={"Variables": {**지금, **_아피파이열쇠()}})
        lam.get_waiter("function_updated_v2").wait(FunctionName=NAME)
        raise SystemExit("열쇠 목록만 바꿨다 — 코드는 그대로")
    iam = boto3.client("iam")
    lam = boto3.client("lambda", region_name=REGION)
    gw = boto3.client("apigatewayv2", region_name=REGION)
    arn = _함수(lam, _역할(iam), _압축())
    _기록칸막기(boto3.client("s3", region_name=REGION))
    print("앞문:", _앞문(gw, lam, arn))
