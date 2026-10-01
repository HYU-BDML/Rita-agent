# -*- coding: utf-8 -*-
"""돈 쓰기 전·뒤 잔액 보기. 열쇠 값은 안 찍는다.

    python weekly/tests/balances.py
"""
import json
import re
import urllib.request
import winreg

import boto3


def _사용자변수(이름: str) -> str:
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as k:
        return winreg.QueryValueEx(k, 이름)[0].strip()


def _읽기(주소: str, 머리: dict) -> dict:
    with urllib.request.urlopen(urllib.request.Request(주소, headers=머리), timeout=60) as r:
        return json.load(r)


d = _읽기("https://api.deepseek.com/user/balance",
          {"Authorization": "Bearer " + _사용자변수("DEEPSEEK_API_KEY"), "Accept": "application/json"})
for b in d.get("balance_infos", []):
    print(f"딥시크: {b['currency']} {b['total_balance']} (쓸 수 있나 {d.get('is_available')})")

환경 = boto3.client("lambda", region_name="ap-northeast-2").get_function_configuration(
    FunctionName="cardnews-render")["Environment"]["Variables"]
열쇠 = re.findall(r"apify_api_[A-Za-z0-9]+", 환경.get("APIFY_TOKEN", ""))[0]
a = _읽기("https://api.apify.com/v2/users/me/limits", {"Authorization": "Bearer " + 열쇠})["data"]
print(f"Apify: 이번 달 ${a['current']['monthlyUsageUsd']:.2f} / ${a['limits']['maxMonthlyUsageUsd']}")
print("OpenAI: 새 열쇠의 조직(cracker-ohin75)은 이 크롬 계정으로 못 본다 — 잔액 확인 못 함")
