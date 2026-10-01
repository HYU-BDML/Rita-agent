# -*- coding: utf-8 -*-
"""지휘 서버(람다 weekly-ai)와 그 앞문(HTTP API)을 만들거나 고친다. 여러 번 돌려도 된다.

    python weekly/deploy.py

열쇠는 **윈도 사용자 환경변수**(DEEPSEEK_API_KEY · OPENAI_API_KEY)에서 읽어 boto3 로 바로 넘긴다
— 명령줄에도 화면에도 안 찍는다. 끝나면 앞문 주소 한 줄을 찍는다.
"""
import io
import json
import time
import winreg
import zipfile
from pathlib import Path

import boto3

REGION, ACCOUNT = "ap-northeast-2", "<AWS 계정 번호>"
NAME, ROLE = "weekly-ai", "weekly-ai-role"
BUCKET = "<S3 통 이름>"
서버 = Path(__file__).resolve().parent / "server"
길들 = ["POST /make", "GET /jobs", "GET /jobs/{job}", "POST /jobs/{job}/retry", "GET /weeks"]


def _열쇠(이름: str) -> str:
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as k:
        try:
            값 = winreg.QueryValueEx(k, 이름)[0].strip()
        except FileNotFoundError:
            값 = ""
    if not 값:
        raise SystemExit(f"사용자 환경변수 {이름} 가 비어 있다 — 배포를 멈춘다")
    return 값


def _압축() -> bytes:
    버퍼 = io.BytesIO()
    with zipfile.ZipFile(버퍼, "w", zipfile.ZIP_DEFLATED) as z:
        for p in sorted(서버.rglob("*")):
            if (p.is_file() and "__pycache__" not in p.parts and p.name != "extract.py"
                    and p.suffix in (".py", ".json")):
                z.write(p, p.relative_to(서버).as_posix())
    return 버퍼.getvalue()


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
    설정 = dict(Runtime="python3.12", Handler="app.handler", Role=역할, Timeout=900, MemorySize=512,
              Environment={"Variables": {"DEEPSEEK_API_KEY": _열쇠("DEEPSEEK_API_KEY"),
                                         "OPENAI_API_KEY": _열쇠("OPENAI_API_KEY"), "BUCKET": BUCKET}})
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
    iam = boto3.client("iam")
    lam = boto3.client("lambda", region_name=REGION)
    gw = boto3.client("apigatewayv2", region_name=REGION)
    arn = _함수(lam, _역할(iam), _압축())
    print("앞문:", _앞문(gw, lam, arn))
