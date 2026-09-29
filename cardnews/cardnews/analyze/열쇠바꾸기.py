# -*- coding: utf-8 -*-
"""Lambda 의 열쇠 하나를 바꾼다. **값은 어디에도 안 남는다.**

    python cardnews/analyze/열쇠바꾸기.py APIFY_TOKEN

물어보는 자리에 붙여 넣으면 된다. 화면에 안 찍히고, 명령줄에도 안 들어가고,
파일로도 안 떨어진다 — 그 셋이 열쇠가 새는 세 갈래다.

**왜 aws 명령을 그냥 안 쓰나.** `update-function-configuration` 은 환경변수를
«통째로» 바꾼다. 손으로 하면 나머지 넷을 같이 적어 줘야 하고, 하나를 빠뜨리면
그 순간 함수가 조용히 망가진다. 여기서는 지금 있는 것을 읽어 **한 칸만** 갈아
끼운다.
"""
import getpass
import sys

import boto3

함수 = "cardnews-analyze"
지역 = "ap-northeast-2"


def main() -> int:
    칸이름 = (sys.argv[1] if len(sys.argv) > 1 else "APIFY_TOKEN").strip()
    람다 = boto3.client("lambda", region_name=지역)
    이제껏 = 람다.get_function_configuration(FunctionName=함수)
    값들 = dict((이제껏.get("Environment") or {}).get("Variables") or {})

    옛것 = 값들.get(칸이름) or ""
    print(f"함수 {함수} · 칸 {칸이름}")
    print(f"  지금: {len(옛것)}자" if 옛것 else "  지금: 없음")

    새것 = getpass.getpass(f"  새 {칸이름} (안 보입니다, 붙여 넣고 엔터): ").strip()
    if not 새것:
        print("  아무것도 안 넣었다 — 그대로 둔다.")
        return 1
    if 새것 == 옛것:
        print("  같은 값이다 — 그대로 둔다.")
        return 1

    값들[칸이름] = 새것
    람다.update_function_configuration(FunctionName=함수,
                                      Environment={"Variables": 값들})
    람다.get_waiter("function_updated").wait(FunctionName=함수)
    print(f"  바꿨다 — {len(새것)}자. 다른 칸 {len(값들) - 1}개는 그대로 뒀다.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
